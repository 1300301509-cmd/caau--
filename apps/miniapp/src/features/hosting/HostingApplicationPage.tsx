import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Input,
  Picker,
  Text,
  Textarea,
  View,
} from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import {
  ApiError,
  sha256,
  workflowError,
  type components,
} from '@caau/api-client';
import {
  clearSession,
  client,
  newKey,
  readBytes,
  session,
  subscribeSession,
} from '../materials/session';
import { isPreviewImage, safeLocalName } from '../individuals/platform';
import {
  allowedHostingExtension,
  displayHostingValue,
  emptyHostingForm,
  formatHostingSize,
  hostingActionLabel,
  hostingFieldLabel,
  hostingFormBody,
  hostingFormFrom,
  hostingRequirementNames,
  hostingStatuses,
  hostingStatusLabel,
  hostingUploadLimit,
  validateHostingSubmission,
  type HostingDetail,
  type HostingForm,
  type HostingRequirement,
} from './platform';

type S = components['schemas'];
type Filter = HostingDetail['status'] | 'ALL';
type PendingSubmit = {
  key: string;
  expectedDraftRevision: number;
  expectedRevision: number;
};
type FieldChange = {
  field?: string;
  status?: string;
  before?: unknown;
  after?: unknown;
};
type AttachmentChange = {
  requirementCode?: HostingRequirement;
  action?: string;
  files?: Array<{ originalName?: string }>;
  removed?: Array<{ originalName?: string }>;
  added?: Array<{ originalName?: string }>;
};

const maxBytes = 10 * 1024 * 1024;
const editableStatus = (status?: string) =>
  status === 'DRAFT' || status === 'NEEDS_SUPPLEMENT';
const when = (value: string) => new Date(value).toLocaleString();

export function HostingApplicationPage({
  materials = false,
}: {
  materials?: boolean;
}) {
  const [eligibleEvents, setEligibleEvents] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [materialEventId, setMaterialEventId] = useState(session.eventId);
  const [identity, setIdentity] = useState<S['WorkspaceIdentityDto']>();
  const [details, setDetails] = useState<HostingDetail[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<HostingDetail>();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [form, setForm] = useState<HostingForm>({ ...emptyHostingForm });
  const [baseDraftRevision, setBaseDraftRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingSubmit, setPendingSubmit] = useState<PendingSubmit>();
  const [organizationId, setOrganizationId] = useState('');
  const [reading, setReading] = useState(false);

  const foreground = useRef(false);
  const running = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const failures = useRef(0);
  const selectedIdRef = useRef('');
  const detailRef = useRef<HostingDetail>();
  const dirtyRef = useRef(false);
  const baseRevisionRef = useRef(0);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    baseRevisionRef.current = baseDraftRevision;
  }, [baseDraftRevision]);

  function stop() {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }
  function clearProtected(message = '') {
    stop();
    setIdentity(undefined);
    setDetails([]);
    setSelectedId('');
    setDetail(undefined);
    setForm({ ...emptyHostingForm });
    setBaseDraftRevision(0);
    setDirty(false);
    setConflict(false);
    setPendingSubmit(undefined);
    setOrganizationId('');
    setNotice('');
    setError(message);
    setLoading(false);
  }
  function clearAccessFailure(cause: ApiError, message: string) {
    if (cause.status === 401) clearSession();
    clearProtected(message);
  }
  function applyDetail(next: HostingDetail, replaceInput = false) {
    setDetail(next);
    detailRef.current = next;
    if (replaceInput || !dirtyRef.current) {
      const nextForm = hostingFormFrom(next.draft);
      setForm(nextForm);
      setBaseDraftRevision(next.draftRevision);
      baseRevisionRef.current = next.draftRevision;
      setDirty(false);
      dirtyRef.current = false;
      setConflict(false);
    } else if (next.draftRevision !== baseRevisionRef.current) {
      setConflict(true);
    }
  }
  async function refresh(initial = false) {
    if (!session.token || !foreground.current || running.current) return;
    running.current = true;
    const epoch = generation.current;
    const token = session.token;
    if (initial) setLoading(true);
    try {
      const [nextIdentity, rows] = await Promise.all([
        client.request('getWorkspaceIdentity', { token }),
        client.request(
          materials
            ? 'HostingController_listMaterials'
            : 'HostingController_list',
          { token },
        ),
      ]);
      const sources = materials
        ? await client.request('HostingController_list', { token })
        : [];
      const approved = await Promise.all(
        sources
          .filter((row) => row.status === 'APPROVED' && row.approvedEventId)
          .map(async (row) => {
            const source = await client.request('HostingController_detail', {
              token,
              path: { id: row.id },
            });
            return {
              id: row.approvedEventId!,
              name: hostingFormFrom(source.submissions.at(-1)?.form).eventName,
            };
          }),
      );
      const nextDetails = await Promise.all(
        rows.map((row) =>
          client.request('HostingController_detail', {
            token,
            path: { id: row.id },
          }),
        ),
      );
      if (
        epoch !== generation.current ||
        token !== session.token ||
        !foreground.current
      )
        return;
      failures.current = 0;
      setEligibleEvents(approved);
      setMaterialEventId((current) =>
        approved.some((row) => row.id === current)
          ? current
          : (approved[0]?.id ?? ''),
      );
      setIdentity(nextIdentity);
      setDetails(nextDetails);
      const organizations = nextIdentity.hostingApplicantOrganizations;
      setOrganizationId((current) =>
        organizations.some((item) => item.id === current)
          ? current
          : (organizations[0]?.id ?? ''),
      );
      const nextId = nextDetails.some(
        (item) => item.id === selectedIdRef.current,
      )
        ? selectedIdRef.current
        : (nextDetails[0]?.id ?? '');
      setSelectedId(nextId);
      selectedIdRef.current = nextId;
      const nextDetail = nextDetails.find((item) => item.id === nextId);
      if (nextDetail) applyDetail(nextDetail);
      else {
        setDetail(undefined);
        setForm({ ...emptyHostingForm });
        setDirty(false);
        dirtyRef.current = false;
      }
      setError('');
    } catch (cause) {
      if (epoch !== generation.current || token !== session.token) return;
      failures.current += 1;
      if (cause instanceof ApiError && cause.status === 401) {
        clearSession();
        clearProtected('会话已失效，申请资料已从页面清除。');
        void Taro.reLaunch({ url: '/pages/login/index' });
      } else if (cause instanceof ApiError && cause.status === 403) {
        clearProtected('申请办理权限已撤销，受保护内容已清除。');
      } else {
        setError('申请暂时无法更新；当前输入已保留，恢复网络后自动重试。');
      }
    } finally {
      running.current = false;
      if (epoch === generation.current) {
        setLoading(false);
        if (session.token && foreground.current)
          timer.current = setTimeout(
            () => void refresh(),
            failures.current
              ? Math.min(30000, 3000 * 2 ** Math.min(failures.current, 3))
              : 3000,
          );
      }
    }
  }
  function show() {
    foreground.current = true;
    stop();
    if (!session.token) {
      clearProtected();
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    void refresh(true);
  }
  useDidShow(show);
  useDidHide(() => {
    foreground.current = false;
    stop();
  });
  useEffect(() => {
    const unsubscribe = subscribeSession(() => {
      clearProtected();
      if (session.token && foreground.current) void refresh(true);
    });
    const network: Taro.onNetworkStatusChange.Callback = (result) => {
      if (!result.isConnected) {
        stop();
        setError('网络已断开；当前输入已保留，恢复后自动核对。');
      } else if (foreground.current) {
        stop();
        void refresh();
      }
    };
    Taro.onNetworkStatusChange(network);
    return () => {
      foreground.current = false;
      stop();
      unsubscribe();
      Taro.offNetworkStatusChange(network);
    };
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(() =>
        dirty || pendingSubmit
          ? Taro.enableAlertBeforeUnload({
              message: '有未保存申请输入或未确认提交，请先处理。',
            })
          : Taro.disableAlertBeforeUnload(),
      )
      .catch(() => {});
  }, [dirty, pendingSubmit]);

  const visible = details.filter(
    (item) => filter === 'ALL' || item.status === filter,
  );
  const boundUploads =
    detail?.uploads.filter(
      (upload) => upload.bound && upload.state === 'CONFIRMED',
    ) ?? [];
  const currentSubmission =
    detail?.submissions.find(
      (item) => item.id === detail.currentSubmissionId,
    ) ?? detail?.submissions.at(-1);
  const blocked = busy || reading;
  const editable = editableStatus(detail?.status);

  function edit(patch: Partial<HostingForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    dirtyRef.current = true;
    setNotice('');
  }
  async function chooseApplication(id: string) {
    if (id === selectedIdRef.current) return;
    if (dirtyRef.current || pendingSubmit) {
      const answer = await Taro.showModal({
        title: '确认切换申请',
        content: '当前有未保存输入或未确认提交，切换后本页输入将清除。',
      });
      if (!answer.confirm) return;
    }
    const next = details.find((item) => item.id === id);
    if (!next) return;
    setSelectedId(id);
    selectedIdRef.current = id;
    setPendingSubmit(undefined);
    setNotice('');
    setError('');
    setDirty(false);
    dirtyRef.current = false;
    applyDetail(next, true);
  }
  async function createApplication() {
    if ((materials ? !materialEventId : !organizationId) || blocked) return;
    if (
      dirtyRef.current &&
      !(
        await Taro.showModal({
          title: '切换材料',
          content: '有未保存内容，是否继续？',
        })
      ).confirm
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = materials
        ? await client.request('HostingController_createMaterials', {
            token: session.token,
            body: { eventId: materialEventId, key: await newKey() },
          })
        : await client.request('HostingController_create', {
            token: session.token,
            body: {
              applicantOrganizationId: organizationId,
              formVersion: 2,
              key: await newKey(),
            },
          });
      const next = await client.request('HostingController_detail', {
        token: session.token,
        path: { id: created.id },
      });
      setDetails((current) => [
        next,
        ...current.filter((row) => row.id !== next.id),
      ]);
      setSelectedId(next.id);
      selectedIdRef.current = next.id;
      applyDetail(next, true);
      setFilter('ALL');
      setNotice(
        materials
          ? '已打开赛事办赛材料，请填写并保存。'
          : '新申请草稿已建立，请填写并保存。',
      );
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      )
        clearAccessFailure(cause, '当前会话失效或申请办理权限已撤销。');
      else setError(`${workflowError(cause)}；新申请未确认建立，请重试。`);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    const current = detailRef.current;
    if (!current || !editableStatus(current.status) || conflict) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await client.request('HostingController_save', {
        token: session.token,
        path: { id: current.id },
        body: {
          expectedDraftRevision: baseRevisionRef.current,
          form: hostingFormBody(form, materials, detail?.formVersion ?? 1),
        },
      });
      applyDetail(next, true);
      setDetails((items) =>
        items.map((item) => (item.id === next.id ? next : item)),
      );
      setNotice('草稿已保存。');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await refresh();
        setConflict(true);
        setError('同机构其他经办人已更新草稿；您的输入仍保留。');
      } else if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      ) {
        clearAccessFailure(cause, '当前会话失效或办理权限已撤销。');
      } else setError(`${workflowError(cause)}；草稿输入仍保留。`);
    } finally {
      setBusy(false);
    }
  }
  async function upload(requirementCode: HostingRequirement) {
    const current = detailRef.current;
    if (!current || !editableStatus(current.status) || conflict) return;
    const existing = boundUploads.filter(
      (item) => item.requirementCode === requirementCode,
    );
    if (existing.length >= hostingUploadLimit(requirementCode)) {
      await Taro.showModal({
        title: '附件数量已达上限',
        content: `${hostingRequirementNames[requirementCode]}最多${hostingUploadLimit(requirementCode)}个，请先移除原附件。`,
        showCancel: false,
      });
      return;
    }
    let choice: Taro.chooseMessageFile.SuccessCallbackResult;
    try {
      choice = await Taro.chooseMessageFile({ count: 1, type: 'all' });
    } catch {
      return;
    }
    const file = choice.tempFiles[0];
    if (!file) return;
    if (!allowedHostingExtension(file.name, requirementCode)) {
      await Taro.showModal({
        title: '附件格式不支持',
        content:
          requirementCode === 'VENUE_PHOTO'
            ? '现场照片请选择 JPG、JPEG 或 PNG。'
            : '请选择 PDF、JPG、JPEG 或 PNG。',
        showCancel: false,
      });
      return;
    }
    if (file.size < 1 || file.size > maxBytes) {
      await Taro.showModal({
        title: '附件大小不符合要求',
        content: '单个附件必须大于0且不超过10 MiB。',
        showCancel: false,
      });
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const bytes = await readBytes(file.path);
      const extension = file.name.split('.').at(-1)!.toLowerCase() as
        | 'pdf'
        | 'png'
        | 'jpg'
        | 'jpeg';
      const intent = await client.request('HostingController_uploadIntent', {
        token: session.token,
        path: { id: current.id },
        body: {
          requirementCode,
          originalName: file.name,
          extension,
          expectedBytes: file.size,
          sha256: sha256(bytes),
        },
      });
      await client.request('HostingController_uploadContent', {
        token: session.token,
        path: { id: intent.id },
        body: bytes,
      });
      await client.request('HostingController_confirmUpload', {
        token: session.token,
        path: { id: intent.id },
        body: { expectedDraftRevision: baseRevisionRef.current },
      });
      const next = await client.request('HostingController_detail', {
        token: session.token,
        path: { id: current.id },
      });
      applyDetail(next, true);
      setDetails((items) =>
        items.map((item) => (item.id === next.id ? next : item)),
      );
      setNotice(
        `${hostingRequirementNames[requirementCode]}已安全上传并绑定。`,
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await refresh();
        setConflict(true);
        setError('附件绑定时草稿已变化；请核对最新草稿后重试。');
      } else if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      )
        clearAccessFailure(cause, '当前会话失效或申请办理权限已撤销。');
      else setError(`${workflowError(cause)}；附件上传未确认完成。`);
    } finally {
      setBusy(false);
    }
  }
  async function removeUpload(id: string) {
    const current = detailRef.current;
    if (!current || conflict || blocked) return;
    const answer = await Taro.showModal({
      title: '确认移除附件',
      content: '只从当前草稿移除；已提交历史版本中的附件保持不变。',
    });
    if (!answer.confirm) return;
    setBusy(true);
    setError('');
    try {
      await client.request('HostingController_removeUpload', {
        token: session.token,
        path: { id },
        body: { expectedDraftRevision: baseRevisionRef.current },
      });
      const next = await client.request('HostingController_detail', {
        token: session.token,
        path: { id: current.id },
      });
      applyDetail(next, true);
      setDetails((items) =>
        items.map((item) => (item.id === next.id ? next : item)),
      );
      setNotice('附件已从当前草稿移除。');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await refresh();
        setConflict(true);
        setError('移除附件时草稿已变化，请核对后重试。');
      } else if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      )
        clearAccessFailure(cause, '当前会话失效或申请办理权限已撤销。');
      else setError(`${workflowError(cause)}；附件未确认移除。`);
    } finally {
      setBusy(false);
    }
  }
  async function executeSubmit(command: PendingSubmit) {
    const current = detailRef.current;
    if (!current) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await client.request('HostingController_submit', {
        token: session.token,
        path: { id: current.id },
        body: command,
      });
      setPendingSubmit(undefined);
      const next = await client.request('HostingController_detail', {
        token: session.token,
        path: { id: current.id },
      });
      applyDetail(next, true);
      setDetails((items) =>
        items.map((item) => (item.id === next.id ? next : item)),
      );
      setNotice(
        `申请已正式提交为 V${next.submissions.at(-1)?.version ?? ''}。`,
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 400) {
        setPendingSubmit(undefined);
        setError('正式提交校验未通过，请核对全部必填字段和附件。');
      } else if (cause instanceof ApiError && cause.status === 409) {
        setPendingSubmit(undefined);
        await refresh();
        setConflict(true);
        setError('提交目标已由其他经办人更新，请核对权威状态。');
      } else if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      ) {
        setPendingSubmit(undefined);
        clearAccessFailure(cause, '当前会话失效或申请办理权限已撤销。');
      } else {
        setPendingSubmit(command);
        setError(
          '提交结果暂时未知；原幂等键和目标已保留，请先核实或沿用原命令重试。',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    const current = detailRef.current;
    if (!current || dirty || conflict || !editableStatus(current.status))
      return;
    const validation = validateHostingSubmission(
      form,
      current.uploads,
      materials,
      detail?.formVersion ?? 1,
    );
    if (validation) {
      setError(validation);
      return;
    }
    const answer = await Taro.showModal({
      title:
        current.status === 'NEEDS_SUPPLEMENT' ? '确认重新提交' : '确认正式提交',
      content:
        current.status === 'NEEDS_SUPPLEMENT'
          ? '将基于同一申请生成新的不可变版本，并重新进入总部审核。'
          : '将当前已保存草稿生成不可变 V1；提交后只能等待审核结果。',
    });
    if (!answer.confirm) return;
    const command = {
      key: await newKey(),
      expectedDraftRevision: current.draftRevision,
      expectedRevision: current.revision,
    };
    setPendingSubmit(command);
    await executeSubmit(command);
  }
  async function download(upload: S['HostingUploadViewDto']) {
    if (reading) return;
    setReading(true);
    try {
      const bytes = await client.request('HostingController_download', {
        token: session.token,
        path: { id: upload.id },
      });
      const name = safeLocalName(upload.originalName);
      const path = `${Taro.env.USER_DATA_PATH}/${Date.now()}-${name}`;
      await new Promise<void>((resolve, reject) =>
        Taro.getFileSystemManager().writeFile({
          filePath: path,
          data: bytes,
          success: () => resolve(),
          fail: reject,
        }),
      );
      if (isPreviewImage(name))
        await Taro.previewImage({ current: path, urls: [path] });
      else await Taro.openDocument({ filePath: path, showMenu: true });
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      )
        clearAccessFailure(cause, '当前会话失效或申请办理权限已撤销。');
      await Taro.showModal({
        title: '附件打开失败',
        content: '请确认网络和当前申请访问权限后重试。',
        showCancel: false,
      });
    } finally {
      setReading(false);
    }
  }

  if (!session.token) return <View className="page" />;
  return (
    <View className="page hosting-page">
      <View className="page-top-actions">
        <Text className="eyebrow">CAAU · 承办方</Text>
        <Button
          className="text-button compact-button"
          onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}
        >
          返回首页
        </Button>
      </View>
      <Text className="title">{materials ? '材料提交' : '申请比赛'}</Text>
      <Text className="description">
        {materials
          ? '承办申请获批后，完成7项必填资料，整套提交总部审核。'
          : '申请不依赖已选赛事；本机构有权经办人可共同保存、提交和补充。'}
      </Text>
      {error && <Text className="error">{error}</Text>}
      {notice && <Text className="result">{notice}</Text>}

      {loading && !identity ? (
        <View className="card">
          <Text>正在核对申请办理权限…</Text>
        </View>
      ) : !identity?.hostingApplicantOrganizations.length ? (
        <View className="card">
          <Text className="subtitle">暂无申请办理权限</Text>
          <Text className="description">
            当前身份没有任何机构的承办申请办理权限，不能读取或新建申请。
          </Text>
        </View>
      ) : materials && !loading && !eligibleEvents.length ? (
        <View className="card">
          <Text className="subtitle">暂无可提交材料的比赛</Text>
          <Text className="description">
            当前没有通过申请的比赛，请联系相关工作人员哦
          </Text>
          <Button
            onClick={() =>
              void Taro.navigateTo({ url: '/pages/hosting/index' })
            }
          >
            申请比赛
          </Button>
        </View>
      ) : (
        <>
          <View className="card hosting-create-card">
            <Text className="subtitle">
              {materials ? '选择已获批赛事' : '新建申请'}
            </Text>
            <Text className="description">
              {materials
                ? '每场赛事一套材料；可保存草稿、提交及退回后补充。'
                : '申请机构在建立后不可更改。'}
            </Text>
            {materials && !eligibleEvents.length && (
              <Text className="warning">暂无获批赛事，请先完成承办申请。</Text>
            )}
            {materials &&
              eligibleEvents.map((event) => (
                <Button
                  key={event.id}
                  className={
                    materialEventId === event.id ? 'choice-active' : ''
                  }
                  onClick={() => setMaterialEventId(event.id)}
                >
                  {event.name}
                </Button>
              ))}
            {!materials &&
              identity.hostingApplicantOrganizations.map((organization) => (
                <Button
                  key={organization.id}
                  className={
                    organizationId === organization.id ? 'choice-active' : ''
                  }
                  ariaLabel={`${organization.name}${organizationId === organization.id ? '，当前申请机构' : ''}`}
                  onClick={() => setOrganizationId(organization.id)}
                >
                  {organizationId === organization.id ? '当前：' : ''}
                  {organization.name}
                </Button>
              ))}
            <Button
              type="primary"
              disabled={
                blocked || (materials ? !materialEventId : !organizationId)
              }
              onClick={() => void createApplication()}
            >
              {materials ? '进入办赛材料' : '建立新申请草稿'}
            </Button>
          </View>

          <View className="card">
            <Text className="subtitle">
              {materials ? '本机构办赛材料' : '本机构申请'}
            </Text>
            <View
              className="hosting-filter"
              ariaRole="group"
              ariaLabel="申请状态筛选"
            >
              <Button
                className={filter === 'ALL' ? 'active' : ''}
                onClick={() => setFilter('ALL')}
              >
                全部
              </Button>
              {hostingStatuses
                .filter((row) => !materials || row.value !== 'REJECTED')
                .map((status) => (
                  <Button
                    key={status.value}
                    className={filter === status.value ? 'active' : ''}
                    onClick={() => setFilter(status.value)}
                  >
                    {status.label}
                  </Button>
                ))}
            </View>
            {!visible.length && (
              <Text className="description">当前筛选下暂无申请。</Text>
            )}
            {visible.map((item) => {
              const snapshot = item.submissions.at(-1)?.form ?? item.draft;
              const rowForm = hostingFormFrom(snapshot);
              return (
                <Button
                  key={item.id}
                  className={`hosting-application-row ${item.id === selectedId ? 'selected' : ''}`}
                  ariaLabel={`${rowForm.eventName || '未命名申请'}，${hostingStatusLabel(item.status)}`}
                  onClick={() => void chooseApplication(item.id)}
                >
                  <Text className="hosting-row-title">
                    {rowForm.eventName || '未命名申请'}
                  </Text>
                  <Text
                    className={`hosting-state state-${item.status.toLowerCase()}`}
                  >
                    {hostingStatusLabel(item.status)}
                  </Text>
                  <Text className="hosting-row-meta">
                    {item.applicantOrganizationName} · V
                    {item.submissions.at(-1)?.version ?? 0}
                  </Text>
                </Button>
              );
            })}
          </View>

          {detail && (
            <>
              <View className="card hosting-summary">
                <View className="hosting-summary-heading">
                  <Text className="subtitle">申请详情</Text>
                  <Text
                    className={`hosting-state state-${detail.status.toLowerCase()}`}
                  >
                    {hostingStatusLabel(detail.status)}
                  </Text>
                </View>
                <Text>申请机构：{detail.applicantOrganizationName}</Text>
                <Text className="description">申请编号：{detail.id}</Text>
                <Text className="description">
                  当前版本：V{currentSubmission?.version ?? 0} · 修订{' '}
                  {detail.revision}
                </Text>
                {detail.status === 'NEEDS_SUPPLEMENT' && (
                  <Text className="warning">
                    补充要求：
                    {displayHostingValue(
                      (
                        detail.actions
                          .filter(
                            (action) => action.action === 'REQUEST_SUPPLEMENT',
                          )
                          .at(-1)?.detail as { reason?: unknown } | undefined
                      )?.reason,
                    )}
                  </Text>
                )}
                {detail.status === 'REJECTED' && (
                  <Text className="error">
                    此申请已驳回并只读；如需继续，请在上方另建新申请。
                  </Text>
                )}
              </View>

              {editable && (
                <View className="card hosting-form-card">
                  <Text className="subtitle">
                    {detail.status === 'NEEDS_SUPPLEMENT'
                      ? '补充申请资料'
                      : '申请资料草稿'}
                  </Text>
                  <Text className="description">
                    草稿可暂不完整；正式提交时全部必填内容和附件会重新校验。
                  </Text>
                  {conflict && (
                    <View className="hosting-conflict">
                      <Text>
                        同机构其他经办人已更新服务器草稿，您的输入未被覆盖。
                      </Text>
                      <Button
                        disabled={blocked}
                        onClick={() => {
                          const current = detailRef.current;
                          if (!current) return;
                          setForm(hostingFormFrom(current.draft));
                          setBaseDraftRevision(current.draftRevision);
                          baseRevisionRef.current = current.draftRevision;
                          setDirty(false);
                          dirtyRef.current = false;
                          setConflict(false);
                          setError('');
                        }}
                      >
                        采用服务器草稿
                      </Button>
                      <Button
                        disabled={blocked || !editableStatus(detail.status)}
                        onClick={() => {
                          setBaseDraftRevision(detail.draftRevision);
                          baseRevisionRef.current = detail.draftRevision;
                          setConflict(false);
                          setError(
                            '已核对服务器修订；您的输入继续保留，请再次保存。',
                          );
                        }}
                      >
                        核对后保留我的输入
                      </Button>
                    </View>
                  )}
                  <Text className="field-label">赛事名称 *</Text>
                  <Input
                    className="field"
                    ariaLabel="赛事名称"
                    maxlength={120}
                    disabled={blocked || conflict || materials}
                    value={form.eventName}
                    onInput={(event) => edit({ eventName: event.detail.value })}
                  />
                  <View
                    className={`hosting-date-grid ${!materials && detail.formVersion === 2 ? 'single-date' : ''}`}
                  >
                    <View>
                      <Text className="field-label">
                        {materials ? '比赛开始日期 *' : '开始日期 *'}
                      </Text>
                      <Picker
                        mode="date"
                        value={form.startDate}
                        disabled={blocked || conflict}
                        onChange={(event) =>
                          edit({ startDate: String(event.detail.value) })
                        }
                      >
                        <View className="field picker-field">
                          {form.startDate || '选择开始日期'}
                        </View>
                      </Picker>
                    </View>
                    {(materials || detail.formVersion === 1) && (
                      <View>
                        <Text className="field-label">
                          {materials ? '比赛结束日期 *' : '结束日期 *'}
                        </Text>
                        <Picker
                          mode="date"
                          value={form.endDate}
                          disabled={blocked || conflict}
                          onChange={(event) =>
                            edit({ endDate: String(event.detail.value) })
                          }
                        >
                          <View className="field picker-field">
                            {form.endDate || '选择结束日期'}
                          </View>
                        </Picker>
                      </View>
                    )}
                  </View>
                  {!materials && (
                    <>
                      <Text className="field-label">省 / 市 / 区县 *</Text>
                      <Picker
                        mode="region"
                        value={[form.province, form.city, form.district]}
                        disabled={blocked || conflict}
                        onChange={(event) => {
                          const values = event.detail.value as string[];
                          edit({
                            province: values[0] ?? '',
                            city: values[1] ?? '',
                            district: values[2] ?? '',
                          });
                        }}
                      >
                        <View className="field picker-field">
                          {form.province && form.city
                            ? [form.province, form.city, form.district]
                                .filter(Boolean)
                                .join(' / ')
                            : '选择省市区'}
                        </View>
                      </Picker>
                      <Text className="field-label">详细地址 *</Text>
                      <Input
                        className="field"
                        ariaLabel="详细地址"
                        maxlength={240}
                        disabled={blocked || conflict}
                        value={form.detailedAddress}
                        onInput={(event) =>
                          edit({ detailedAddress: event.detail.value })
                        }
                      />
                      <Text className="field-label">场馆名称 *</Text>
                      <Input
                        className="field"
                        ariaLabel="场馆名称"
                        maxlength={160}
                        disabled={blocked || conflict}
                        value={form.venueName}
                        onInput={(event) =>
                          edit({ venueName: event.detail.value })
                        }
                      />
                    </>
                  )}
                  {(materials || detail.formVersion === 1) && (
                    <>
                      {' '}
                      <Text className="field-label">
                        {materials
                          ? '办赛公司/机构简介（3～4句话，介绍地点、办赛经验等）*'
                          : '办赛经验简介 *'}
                      </Text>
                      <Textarea
                        className="hosting-textarea"
                        ariaLabel="办赛经验简介"
                        autoHeight
                        maxlength={20000}
                        disabled={blocked || conflict}
                        value={form.eventExperienceIntroduction}
                        onInput={(event) =>
                          edit({
                            eventExperienceIntroduction: event.detail.value,
                          })
                        }
                      />
                    </>
                  )}
                  {!materials && detail.formVersion === 2 && (
                    <>
                      <View className="hosting-date-grid single-date">
                        {(['startTime'] as const).map((key) => (
                          <View key={key}>
                            <Text className="field-label">
                              {hostingFieldLabel(key)} *（北京时间）
                            </Text>
                            <Picker
                              mode="time"
                              value={form[key]}
                              disabled={blocked || conflict}
                              onChange={(event) =>
                                edit({ [key]: String(event.detail.value) })
                              }
                            >
                              <View className="field picker-field">
                                {form[key] || '选择时间'}
                              </View>
                            </Picker>
                          </View>
                        ))}
                      </View>
                      {(['contactName', 'contactPhone'] as const).map((key) => (
                        <View key={key}>
                          <Text className="field-label">
                            {hostingFieldLabel(key)} *
                          </Text>
                          <Input
                            className="field"
                            ariaLabel={hostingFieldLabel(key)}
                            maxlength={key === 'contactPhone' ? 11 : 120}
                            type={key === 'contactPhone' ? 'number' : 'text'}
                            value={form[key]}
                            disabled={blocked || conflict}
                            onInput={(event) =>
                              edit({ [key]: event.detail.value })
                            }
                          />
                        </View>
                      ))}
                      <Text className="field-label">补充说明（选填）</Text>
                      <Textarea
                        className="hosting-textarea"
                        ariaLabel="补充说明"
                        maxlength={2000}
                        autoHeight
                        value={form.additionalNotes}
                        disabled={blocked || conflict}
                        onInput={(event) =>
                          edit({ additionalNotes: event.detail.value })
                        }
                      />
                    </>
                  )}
                  {materials && (
                    <>
                      <Text className="subtitle">公司银行账户</Text>
                      {(
                        [
                          'bankAccountName',
                          'bankName',
                          'bankAccountNumber',
                          'contactPhone',
                        ] as const
                      ).map((key) => (
                        <View key={key}>
                          <Text className="field-label">
                            {hostingFieldLabel(key)} *
                          </Text>
                          <Input
                            className="field"
                            ariaLabel={hostingFieldLabel(key)}
                            maxlength={key === 'contactPhone' ? 11 : 200}
                            type={
                              key === 'contactPhone' ||
                              key === 'bankAccountNumber'
                                ? 'number'
                                : 'text'
                            }
                            disabled={blocked || conflict}
                            value={form[key]}
                            onInput={(event) =>
                              edit({ [key]: event.detail.value })
                            }
                          />
                        </View>
                      ))}
                      {(['registrationStart', 'registrationEnd'] as const).map(
                        (key) => (
                          <View key={key}>
                            <Text className="field-label">
                              {hostingFieldLabel(key)} *（北京时间）
                            </Text>
                            <View className="hosting-date-grid">
                              <Picker
                                mode="date"
                                value={form[key].slice(0, 10)}
                                disabled={blocked || conflict}
                                onChange={(event) =>
                                  edit({
                                    [key]: `${event.detail.value}T${form[key].slice(11, 16) || '09:00'}+08:00`,
                                  })
                                }
                              >
                                <View className="field picker-field">
                                  {form[key].slice(0, 10) || '选择日期'}
                                </View>
                              </Picker>
                              <Picker
                                mode="time"
                                value={form[key].slice(11, 16)}
                                disabled={blocked || conflict || !form[key]}
                                onChange={(event) =>
                                  edit({
                                    [key]: `${form[key].slice(0, 10)}T${event.detail.value}+08:00`,
                                  })
                                }
                              >
                                <View className="field picker-field">
                                  {form[key].slice(11, 16) || '先选日期'}
                                </View>
                              </Picker>
                            </View>
                          </View>
                        ),
                      )}
                    </>
                  )}
                  <Button
                    disabled={blocked || conflict || !dirty}
                    onClick={() => void saveDraft()}
                  >
                    保存草稿
                  </Button>
                </View>
              )}

              {editable && (
                <View className="card">
                  {(materials || detail.formVersion === 1) && (
                    <>
                      <Text className="subtitle">申请附件</Text>
                      <Text className="description">
                        营业执照1个；现场照片1～10个；其他文档选交且最多5个。单个不超过10
                        MiB。
                      </Text>
                      {(
                        [
                          'BUSINESS_LICENSE',
                          'VENUE_PHOTO',
                          'OTHER_DOCUMENT',
                        ] as HostingRequirement[]
                      ).map((code) => {
                        const files = boundUploads.filter(
                          (item) => item.requirementCode === code,
                        );
                        return (
                          <View className="hosting-upload-group" key={code}>
                            <Text className="field-label">
                              {hostingRequirementNames[code]}
                              {code === 'OTHER_DOCUMENT' ? '（选交）' : ' *'}
                            </Text>
                            {files.map((file) => (
                              <View className="hosting-file-row" key={file.id}>
                                <View className="grow">
                                  <Text>{file.originalName}</Text>
                                  <Text className="description">
                                    {formatHostingSize(file.expectedBytes)}
                                  </Text>
                                </View>
                                <Button
                                  disabled={blocked}
                                  onClick={() => void download(file)}
                                >
                                  查看
                                </Button>
                                <Button
                                  disabled={blocked || conflict}
                                  onClick={() => void removeUpload(file.id)}
                                >
                                  移除
                                </Button>
                              </View>
                            ))}
                            <Button
                              disabled={
                                blocked ||
                                conflict ||
                                files.length >= hostingUploadLimit(code)
                              }
                              onClick={() => void upload(code)}
                            >
                              选择并上传{hostingRequirementNames[code]}
                            </Button>
                          </View>
                        );
                      })}
                    </>
                  )}
                  <Button
                    type="primary"
                    disabled={blocked || dirty || conflict}
                    onClick={() => void submit()}
                  >
                    {detail.status === 'NEEDS_SUPPLEMENT'
                      ? '提交补充版本'
                      : '正式提交申请'}
                  </Button>
                  {dirty && (
                    <Text className="warning">
                      请先保存当前表单输入，再正式提交。
                    </Text>
                  )}
                  {pendingSubmit && (
                    <View className="hosting-pending-command">
                      <Text>上次提交结果未知，原命令不会自动重复执行。</Text>
                      <Button
                        disabled={blocked}
                        onClick={() => void executeSubmit(pendingSubmit)}
                      >
                        沿用原命令核实 / 重试
                      </Button>
                    </View>
                  )}
                </View>
              )}

              {!editable && currentSubmission && (
                <View className="card hosting-readonly-form">
                  <Text className="subtitle">
                    当前提交 V{currentSubmission.version}
                  </Text>
                  {Object.entries(hostingFormFrom(currentSubmission.form))
                    .filter(
                      ([key]) =>
                        materials ||
                        ![
                          'bankAccountName',
                          'bankName',
                          'bankAccountNumber',
                          'registrationStart',
                          'registrationEnd',
                        ].includes(key),
                    )
                    .map(([key, value]) => (
                      <View className="hosting-data-row" key={key}>
                        <Text>
                          {hostingFieldLabel(
                            key === 'province'
                              ? 'location.administrativeArea.province'
                              : key === 'city'
                                ? 'location.administrativeArea.city'
                                : key === 'district'
                                  ? 'location.administrativeArea.district'
                                  : key === 'detailedAddress'
                                    ? 'location.detailedAddress'
                                    : key === 'venueName'
                                      ? 'location.venueName'
                                      : key,
                          )}
                        </Text>
                        <Text>{displayHostingValue(value)}</Text>
                      </View>
                    ))}
                  {currentSubmission.attachments.map((file) => (
                    <Button
                      key={file.id}
                      disabled={blocked}
                      onClick={() => void download(file)}
                    >
                      {hostingRequirementNames[file.requirementCode]} ·{' '}
                      {file.originalName}
                    </Button>
                  ))}
                </View>
              )}

              {detail.status === 'APPROVED' && detail.approvedEventId && (
                <View className="card hosting-approved-card">
                  <Text className="subtitle">正式赛事已创建</Text>
                  <Text>
                    来源：本申请 · V{currentSubmission?.version ?? ''}
                  </Text>
                  <Text>承办机构：{detail.applicantOrganizationName}</Text>
                  <Text className="description">
                    这里只提供赛事基本信息查看，不自动授予材料任务。
                  </Text>
                  <Button
                    type="primary"
                    onClick={() =>
                      void Taro.navigateTo({
                        url: `/pages/event-info/index?id=${encodeURIComponent(detail.approvedEventId!)}`,
                      })
                    }
                  >
                    查看正式赛事基本信息
                  </Button>
                </View>
              )}

              {!!detail.diffs.length && (
                <View className="card">
                  <Text className="subtitle">相邻版本差异</Text>
                  {detail.diffs.map((diff, index) => (
                    <View
                      className="hosting-version-block"
                      key={diff.toSubmissionId}
                    >
                      <Text className="field-label">
                        V{index + 1} → V{index + 2}
                      </Text>
                      {(diff.fieldChanges as FieldChange[])
                        .filter((change) => change.status === 'CHANGED')
                        .map((change) => (
                          <Text key={change.field}>
                            {hostingFieldLabel(change.field ?? '')}：
                            {displayHostingValue(change.before)} →{' '}
                            {displayHostingValue(change.after)}
                          </Text>
                        ))}
                      {(diff.attachmentChanges as AttachmentChange[])
                        .filter((change) => change.action !== 'UNCHANGED')
                        .map((change) => (
                          <Text key={change.requirementCode}>
                            {change.requirementCode
                              ? hostingRequirementNames[change.requirementCode]
                              : '附件'}
                            ：
                            {change.action === 'ADDED'
                              ? '新增'
                              : change.action === 'REMOVED'
                                ? '移除'
                                : '替换'}{' '}
                            {[
                              ...(change.files ?? []),
                              ...(change.removed ?? []),
                              ...(change.added ?? []),
                            ]
                              .map((file) => file.originalName)
                              .filter(Boolean)
                              .join('、')}
                          </Text>
                        ))}
                    </View>
                  ))}
                </View>
              )}

              <View className="card">
                <Text className="subtitle">提交版本与操作历史</Text>
                {detail.submissions.map((submission) => (
                  <View className="hosting-version-block" key={submission.id}>
                    <Text className="field-label">
                      不可变 V{submission.version}
                    </Text>
                    <Text className="description">
                      提交人 {submission.submittedBy} ·{' '}
                      {when(submission.submittedAt)}
                    </Text>
                    {submission.attachments.map((file) => (
                      <Button
                        key={file.id}
                        disabled={blocked}
                        onClick={() => void download(file)}
                      >
                        查看 V{submission.version}{' '}
                        {hostingRequirementNames[file.requirementCode]}
                      </Button>
                    ))}
                  </View>
                ))}
                {detail.actions.map((action) => (
                  <View className="history-item" key={action.id}>
                    <Text>
                      {hostingActionLabel(action.action)} ·{' '}
                      {hostingStatusLabel(action.fromState)} →{' '}
                      {hostingStatusLabel(action.toState)}
                    </Text>
                    <Text className="description">
                      操作人 {action.actorId} · {when(action.occurredAt)}
                    </Text>
                    {typeof action.detail === 'object' &&
                      action.detail &&
                      'reason' in action.detail && (
                        <Text>
                          意见：
                          {displayHostingValue(
                            (action.detail as { reason?: unknown }).reason,
                          )}
                        </Text>
                      )}
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

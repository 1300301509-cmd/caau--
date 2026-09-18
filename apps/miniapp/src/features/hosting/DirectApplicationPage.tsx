import {
  WorkflowHeading,
  WorkflowSection,
  WorkflowEmptyIcon,
} from './WorkflowHeading';
import { useRef, useState, useEffect } from 'react';
import {
  Button,
  Input,
  Picker,
  Text,
  Textarea,
  View,
} from '@tarojs/components';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { ApiError, type components, workflowError } from '@caau/api-client';
import {
  client,
  session,
  newKey,
  subscribeSession,
} from '../materials/session';
import {
  emptyHostingForm,
  hostingFormBody,
  hostingFormFrom,
  validateHostingSubmission,
  type HostingForm,
} from './platform';

type Identity = components['schemas']['WorkspaceIdentityDto'];
type Draft = {
  form: HostingForm;
  createKey?: string;
  id?: string;
  savedRevision?: number;
  command?: {
    key: string;
    expectedDraftRevision: number;
    expectedRevision: number;
  };
};

export function DirectApplicationPage() {
  const [identity, setIdentity] = useState<Identity>();
  const [org, setOrg] = useState('');
  const [draft, setDraft] = useState<Draft>({ form: { ...emptyHostingForm } });
  const current = useRef(draft);
  const storage = useRef('');
  const initialized = useRef(false);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  function persist(next: Draft) {
    // Store before sending commands so interrupted requests reuse their keys.
    Taro.setStorageSync(storage.current, next);
    current.current = next;
    setDraft(next);
  }
  async function openOrganization(actor: Identity, id: string) {
    const token = session.token;
    setReady(false);
    setDone(false);
    setError('');
    setOrg(id);
    storage.current = `caau:hosting-input:v1:${actor.id}:${id}`;
    const saved = Taro.getStorageSync<Draft>(storage.current);
    let next: Draft = { form: { ...emptyHostingForm } };
    if (
      saved?.form &&
      (saved.createKey || Object.values(saved.form).some(Boolean))
    ) {
      const answer = await Taro.showModal({
        title: '恢复上次填写？',
        content: '发现上次未完成的申请，是否继续填写？',
        confirmText: '恢复草稿',
        cancelText: '重新填写',
      });
      if (token !== session.token) return;
      if (answer.confirm) next = saved;
      else Taro.removeStorageSync(storage.current);
    }
    current.current = next;
    setDraft(next);
    setReady(true);
  }
  useEffect(() => {
    const unsubscribe = subscribeSession(() => {
      initialized.current = false;
      setIdentity(undefined);
      setReady(false);
      setDraft({ form: { ...emptyHostingForm } });
      current.current = { form: { ...emptyHostingForm } };
      storage.current = '';
    });
    return () => {
      unsubscribe();
    };
  }, []);
  useDidHide(() => {
    initialized.current = false;
  });
  useDidShow(() => {
    if (initialized.current) return;
    if (!session.token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    initialized.current = true;
    const token = session.token;
    void client
      .request('getWorkspaceIdentity', { token })
      .then(async (actor) => {
        if (token !== session.token) return;
        setIdentity(actor);
        const id = actor.hostingApplicantOrganizations[0]?.id;
        if (id) await openOrganization(actor, id);
        else setError('当前账号暂无申请办理权限。');
      })
      .catch(() => {
        initialized.current = false;
        setError('无法读取申请机构，请返回后重试。');
      });
  });
  function edit(patch: Partial<HostingForm>) {
    try {
      persist({
        ...current.current,
        form: { ...current.current.form, ...patch },
      });
      setError('');
    } catch {
      setError('本机草稿保存失败，请检查设备存储空间后重试。');
    }
  }
  async function submit() {
    if (lock.current || !ready) return;
    const validation = validateHostingSubmission(
      current.current.form,
      [],
      false,
      2,
    );
    if (validation) {
      setError(validation);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    const token = session.token;
    try {
      let value = current.current;
      if (!value.createKey) {
        value = { ...value, createKey: await newKey() };
        if (token !== session.token) return;
        persist(value);
      }
      const created = await client.request('HostingController_create', {
        token,
        body: {
          applicantOrganizationId: org,
          formVersion: 2,
          key: value.createKey!,
        },
      });
      if (token !== session.token) return;
      value = { ...value, id: created.id };
      persist(value);
      let detail = await client.request('HostingController_detail', {
        token,
        path: { id: created.id },
      });
      if (token !== session.token) return;
      if (detail.status === 'DRAFT') {
        const body = hostingFormBody(value.form, false, 2);
        if (!value.command) {
          // A retry of a lost save response must not overwrite another handler's edits.
          const matches =
            JSON.stringify(
              hostingFormBody(hostingFormFrom(detail.draft), false, 2),
            ) === JSON.stringify(body);
          if (
            detail.draftRevision > 1 &&
            detail.draftRevision !== value.savedRevision &&
            !matches
          ) {
            throw new Error('申请已有更新，请到办赛进度中继续填写并核对资料。');
          }
          if (!matches)
            detail = await client.request('HostingController_save', {
              token,
              path: { id: detail.id },
              body: { expectedDraftRevision: detail.draftRevision, form: body },
            });
          if (token !== session.token) return;
          value = {
            ...value,
            savedRevision: detail.draftRevision,
            command: {
              key: await newKey(),
              expectedDraftRevision: detail.draftRevision,
              expectedRevision: detail.revision,
            },
          };
          if (token !== session.token) return;
          persist(value);
        }
        await client.request('HostingController_submit', {
          token,
          path: { id: detail.id },
          body: value.command!,
        });
      }
      if (token !== session.token) return;
      Taro.removeStorageSync(storage.current);
      setDone(true);
    } catch (cause) {
      if (
        token === session.token &&
        cause instanceof ApiError &&
        cause.status === 400
      ) {
        persist({ ...current.current, command: undefined });
      }
      if (token === session.token)
        setError(
          `${workflowError(cause)}。输入已保留，可重试提交或到办赛进度核对已有申请。`,
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const disabled = busy || !!draft.command;
  return (
    <View className="page hosting-page workflow-page">
      <WorkflowHeading
        title="申请比赛"
        note="填写一份申请，开启你的赛事筹备。"
      />
      <View className="workflow-tip">
        <Text>自动保留草稿</Text>
        <Text>中途退出，下次可继续填写</Text>
      </View>
      {error && <Text className="error">{error}</Text>}
      {done ? (
        <View className="card workflow-empty">
          <WorkflowEmptyIcon />
          <Text className="subtitle">申请已提交</Text>
          <Text className="description">请在办赛进度中查看总部审核情况。</Text>
        </View>
      ) : (
        ready && (
          <View>
            <View className="card workflow-form-section">
              <WorkflowSection number="01" title="比赛信息" />
              <Text className="field-label">申请机构</Text>
              <Picker
                mode="selector"
                disabled={disabled || !!draft.createKey}
                range={identity!.hostingApplicantOrganizations.map(
                  (x) => x.name,
                )}
                value={identity!.hostingApplicantOrganizations.findIndex(
                  (x) => x.id === org,
                )}
                onChange={(e) =>
                  void openOrganization(
                    identity!,
                    identity!.hostingApplicantOrganizations[
                      Number(e.detail.value)
                    ]!.id,
                  )
                }
              >
                <View className="field picker-field">
                  {
                    identity!.hostingApplicantOrganizations.find(
                      (x) => x.id === org,
                    )?.name
                  }
                </View>
              </Picker>
              <Text className="field-label">比赛名称 *</Text>
              <Input
                className="field"
                ariaLabel="比赛名称"
                placeholder="请输入比赛名称"
                value={draft.form.eventName}
                disabled={disabled}
                onInput={(e) => edit({ eventName: e.detail.value })}
              />
              <Text className="field-label">比赛日期 *</Text>
              <Picker
                mode="date"
                disabled={disabled}
                value={draft.form.startDate}
                onChange={(e) => edit({ startDate: String(e.detail.value) })}
              >
                <View className="field picker-field">
                  {draft.form.startDate || '选择比赛日期'}
                </View>
              </Picker>
            </View>
            <View className="card workflow-form-section">
              <WorkflowSection number="02" title="比赛场地" />
              <Text className="field-label">省 / 市 / 区县 *</Text>
              <Picker
                mode="region"
                disabled={disabled}
                value={[
                  draft.form.province,
                  draft.form.city,
                  draft.form.district,
                ]}
                onChange={(e) => {
                  const [province, city, district] = e.detail.value;
                  edit({ province, city, district });
                }}
              >
                <View className="field picker-field">
                  {[draft.form.province, draft.form.city, draft.form.district]
                    .filter(Boolean)
                    .join(' / ') || '选择省市区'}
                </View>
              </Picker>
              {(
                [
                  ['detailedAddress', '详细地址'],
                  ['venueName', '场馆名称'],
                ] as const
              ).map(([key, label]) => (
                <View key={key}>
                  <Text className="field-label">{label} *</Text>
                  <Input
                    className="field"
                    ariaLabel={label}
                    placeholder={`请输入${label}`}
                    type="text"
                    maxlength={200}
                    value={draft.form[key]}
                    disabled={disabled}
                    onInput={(e) => edit({ [key]: e.detail.value })}
                  />
                </View>
              ))}
            </View>
            <View className="card workflow-form-section">
              <WorkflowSection number="03" title="联系与补充" />
              {(
                [
                  ['contactName', '联系人'],
                  ['contactPhone', '联系手机号'],
                ] as const
              ).map(([key, label]) => (
                <View key={key}>
                  <Text className="field-label">{label} *</Text>
                  <Input
                    className="field"
                    ariaLabel={label}
                    placeholder={
                      key === 'contactPhone'
                        ? '请输入手机号'
                        : '请输入联系人姓名'
                    }
                    type={key === 'contactPhone' ? 'number' : 'text'}
                    maxlength={key === 'contactPhone' ? 11 : 200}
                    value={draft.form[key]}
                    disabled={disabled}
                    onInput={(e) => edit({ [key]: e.detail.value })}
                  />
                </View>
              ))}
              <Text className="field-label">补充说明（选填）</Text>
              <Textarea
                className="field textarea"
                placeholder="其他需要说明的事项"
                maxlength={2000}
                value={draft.form.additionalNotes}
                disabled={disabled}
                onInput={(e) => edit({ additionalNotes: e.detail.value })}
              />
            </View>
            <View className="workflow-submit">
              <Button
                type="primary"
                loading={busy}
                disabled={busy}
                onClick={() => void submit()}
              >
                {draft.createKey ? '重试提交' : '提交申请'}
              </Button>
            </View>
          </View>
        )
      )}
      <Button
        className="workflow-text-action"
        onClick={() =>
          void Taro.navigateTo({ url: '/pages/hosting-progress/index' })
        }
      >
        查看办赛进度
      </Button>
    </View>
  );
}

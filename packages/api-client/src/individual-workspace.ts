import { ApiError, type createApiClient } from './index.js';
import type { components } from './generated/schema.js';
import { sha256 } from './sha256.js';
type S = components['schemas'];
type View = S['IndividualViewDto'];
type Content = S['IndividualContentDto'];
type Op =
  | 'submitIndividualMaterial'
  | 'startIndividualReview'
  | 'approveIndividualMaterial'
  | 'returnIndividualMaterial';
type Command =
  | { op: Op; id: string; body: S['IndividualCommandDto'] }
  | { op: 'createIndividualMaterial'; body: S['CreateIndividualDto'] };
export type IndividualSyncStatus =
  | 'idle'
  | 'syncing'
  | 'online'
  | 'offline'
  | 'paused'
  | 'unauthorized';
export interface IndividualWorkspaceState {
  identity?: S['WorkspaceIdentityDto'];
  tasks: S['TaskViewDto'][];
  rows: View[];
  total: number;
  offset: number;
  limit: number;
  taskId: string;
  filter: string;
  selectedId: string;
  selected?: View;
  history?: S['IndividualHistoryDto'];
  historyOffset: number;
  legacyId: string;
  legacyTask?: S['TaskViewDto'];
  legacyVersions: S['SubmissionViewDto'][];
  creating: boolean;
  buffer: Content;
  base?: { draftRevision: number; generation: number };
  dirty: boolean;
  conflict: boolean;
  reason: string;
  modification: string;
  notice: string;
  error: boolean;
  status: IndividualSyncStatus;
  lastSync: string;
  busy: boolean;
  pending?: Command;
  confirm?: Command;
  protectionEpoch: number;
}
const empty = (): Content => ({
  title: '',
  category: '',
  text: '',
  fileIds: [],
});
const initial = (): IndividualWorkspaceState => ({
  tasks: [],
  rows: [],
  total: 0,
  offset: 0,
  limit: 5,
  taskId: '',
  filter: '',
  selectedId: '',
  historyOffset: 0,
  legacyId: '',
  legacyVersions: [],
  creating: false,
  buffer: empty(),
  dirty: false,
  conflict: false,
  reason: '',
  modification: '',
  notice: '',
  error: false,
  status: 'idle',
  lastSync: '',
  busy: false,
  protectionEpoch: 0,
});
const copy = (c: Content): Content => ({ ...c, fileIds: [...c.fileIds] });
export class IndividualWorkspace {
  value = initial();
  private token: string | undefined;
  private authenticated = false;
  private epoch = 0;
  private commandLock = false;
  private commandSerial = 0;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private foreground = true;
  private running = false;
  private requested = false;
  private failures = 0;
  constructor(
    private readonly api: ReturnType<typeof createApiClient>,
    private readonly uuid: () => string,
    private readonly interval = 2000,
  ) {}
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private patch(p: Partial<IndividualWorkspaceState>) {
    this.value = { ...this.value, ...p };
    for (const listener of this.listeners) listener();
  }
  private cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private invalidate() {
    this.epoch++;
    this.cancelTimer();
  }
  dispose() {
    this.foreground = false;
    this.invalidate();
  }
  async login(token?: string) {
    this.invalidate();
    this.token = undefined;
    this.authenticated = false;
    this.commandLock = false;
    this.commandSerial++;
    const e = this.epoch;
    this.value = {
      ...initial(),
      protectionEpoch: this.value.protectionEpoch + 1,
      status: 'syncing',
    };
    this.patch({});
    try {
      const identity = await this.api.request('getWorkspaceIdentity', {
        token,
      });
      if (e !== this.epoch) return;
      this.token = token;
      this.authenticated = true;
      this.patch({ identity });
      this.wake();
    } catch (error) {
      if (e === this.epoch)
        this.patch({
          status: 'unauthorized',
          notice:
            error instanceof ApiError
              ? '会话无效或已过期，请重新进入本地测试身份。'
              : '进入失败，请检查本地 API 和网络。',
          error: true,
        });
    }
  }
  logout() {
    this.commandSerial++;
    this.commandLock = false;
    const token = this.token;
    this.invalidate();
    const authenticated = this.authenticated;
    this.token = undefined;
    this.authenticated = false;
    this.value = {
      ...initial(),
      protectionEpoch: this.value.protectionEpoch + 1,
    };
    this.patch({});
    if (authenticated)
      void this.api.request('logout', { token }).catch(() => {});
  }
  setForeground(visible: boolean) {
    this.foreground = visible;
    this.invalidate();
    if (!this.authenticated) return;
    if (visible) {
      this.failures = 0;
      this.wake();
    } else this.patch({ status: 'paused' });
  }
  networkOffline() {
    this.invalidate();
    this.patch({
      status: 'offline',
      notice: '同步中断，保留上次数据；恢复连接后自动核对。',
      error: true,
    });
  }
  wake() {
    this.cancelTimer();
    if (!this.authenticated || !this.foreground) return;
    if (this.running) {
      this.requested = true;
      return;
    }
    void this.poll();
  }
  private allowed(e: number) {
    return e === this.epoch && this.authenticated && this.foreground;
  }
  private fail(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      this.invalidate();
      this.token = undefined;
      this.authenticated = false;
      this.value = {
        ...initial(),
        protectionEpoch: this.value.protectionEpoch + 1,
        status: 'unauthorized',
        notice: '会话已失效或过期，受保护内容已清除，请重新进入本地测试身份。',
        error: true,
      };
      this.patch({});
    } else if (error instanceof ApiError && error.status === 403) {
      const identity = this.value.identity;
      this.invalidate();
      this.value = {
        ...initial(),
        identity,
        protectionEpoch: this.value.protectionEpoch + 1,
        status: 'syncing',
        notice: '访问权限已变化，受保护内容和未保存输入已清除。',
        error: true,
      };
      this.patch({});
      this.requested = true;
      this.wake();
    } else
      this.patch({
        status: 'offline',
        notice: '同步中断，保留上次数据；恢复连接后自动核对。',
        error: true,
      });
  }
  private apply(view: View) {
    const old = this.value.selected;
    if (
      old?.id === view.id &&
      (view.revision < old.revision ||
        view.contextRevision < old.contextRevision)
    )
      return;
    if (old?.draft && !view.draft) {
      this.fail(new ApiError(403));
      return;
    }
    const b = this.value.base;
    const keep = this.value.dirty || !!this.value.pending;
    this.patch({
      selected: view,
      ...(!keep && view.draft
        ? {
            buffer: copy(view.draft),
            base: {
              draftRevision: view.draftRevision,
              generation: view.generation,
            },
            dirty: false,
            conflict: false,
          }
        : {
            conflict:
              !!b &&
              (b.draftRevision !== view.draftRevision ||
                b.generation !== view.generation),
          }),
    });
  }
  private async poll() {
    if (!this.authenticated || !this.foreground) return;
    this.running = true;
    this.requested = false;
    const e = this.epoch,
      token = this.token;
    const {
      taskId,
      filter,
      selectedId,
      offset,
      limit,
      historyOffset,
      legacyId,
    } = this.value;
    try {
      const snapshot = await this.api.request('getIndividualSnapshot', {
        token,
        query: {
          ...(taskId ? { taskId } : {}),
          ...(filter ? { state: filter } : {}),
          ...(selectedId ? { selectedId } : {}),
          offset,
          limit,
        },
      });
      if (!this.allowed(e)) return;
      // Snapshot itself authorizes every resource. Publish it without waiting for
      // slower directory/history reads; those never replace this state snapshot.
      this.patch({
        rows: snapshot.items,
        total: snapshot.total,
        lastSync: snapshot.serverTime,
      });
      if (snapshot.selected) this.apply(snapshot.selected);
      if (!this.allowed(e)) return;
      const [identity, tasks] = await Promise.all([
        this.api.request('getWorkspaceIdentity', { token }),
        this.api.request('listMaterialTasks', { token }),
      ]);
      if (!this.allowed(e)) return;
      if (
        JSON.stringify([...identity.roles].sort()) !==
        JSON.stringify([...(this.value.identity?.roles ?? [])].sort())
      ) {
        this.patch({ identity });
        this.fail(new ApiError(403));
        return;
      }
      if (taskId && !tasks.some((t) => t.id === taskId))
        throw new ApiError(403);
      let history = this.value.history;
      if (
        snapshot.selected &&
        (!history || history.materialRevision !== snapshot.selected.revision)
      ) {
        history = await this.api.request('getIndividualHistory', {
          token,
          path: { id: snapshot.selected.id },
          query: { offset: historyOffset, limit: 10 },
        });
      }
      let legacyTask: S['TaskViewDto'] | undefined,
        legacyVersions: S['SubmissionViewDto'][] = [];
      if (legacyId) {
        legacyTask = await this.api.request('getMaterialTask', {
          token,
          path: { id: legacyId },
        });
        legacyVersions = await this.api.request('listSubmissionVersions', {
          token,
          path: { id: legacyId },
        });
      }
      if (!this.allowed(e)) return;
      this.failures = 0;
      if (
        this.value.status === 'offline' &&
        this.value.notice.startsWith('同步中断')
      )
        this.patch({
          notice: '连接已恢复，已重新核对权限与状态。',
          error: false,
        });
      this.patch({
        identity,
        tasks,
        status: 'online',
        history,
        legacyTask,
        legacyVersions,
      });
    } catch (error) {
      if (this.allowed(e)) {
        this.failures++;
        this.fail(error);
      }
    } finally {
      this.running = false;
      if (this.authenticated && this.foreground) {
        if (this.requested || e !== this.epoch) {
          this.requested = false;
          this.timer = setTimeout(() => this.wake(), 0);
        } else
          this.timer = setTimeout(
            () => this.wake(),
            this.failures
              ? Math.min(30000, this.interval * 2 ** Math.min(this.failures, 4))
              : this.interval,
          );
      }
    }
  }
  query(
    p: Partial<
      Pick<IndividualWorkspaceState, 'taskId' | 'filter' | 'offset' | 'limit'>
    >,
  ) {
    this.invalidate();
    this.patch({ ...p, rows: [], status: 'syncing' });
    this.wake();
  }
  select(id: string) {
    this.invalidate();
    this.patch({
      selectedId: id,
      selected: undefined,
      history: undefined,
      historyOffset: 0,
      legacyId: '',
      legacyVersions: [],
      legacyTask: undefined,
      creating: false,
      buffer: empty(),
      base: undefined,
      dirty: false,
      conflict: false,
      reason: '',
      modification: '',
      pending: undefined,
      confirm: undefined,
      status: 'syncing',
    });
    this.wake();
  }
  openLegacy(id: string) {
    this.select('');
    this.invalidate();
    this.patch({ legacyId: id, status: 'syncing' });
    this.wake();
  }
  historyPage(offset: number) {
    this.invalidate();
    this.patch({ historyOffset: offset, history: undefined });
    this.wake();
  }
  beginCreate() {
    this.select('');
    this.patch({ creating: true, buffer: empty() });
  }
  edit(p: Partial<Content>) {
    this.patch({ buffer: { ...this.value.buffer, ...p }, dirty: true });
  }
  opinion(
    p: Partial<Pick<IndividualWorkspaceState, 'reason' | 'modification'>>,
  ) {
    this.patch(p);
  }
  reconcile(adopt: boolean) {
    const m = this.value.selected;
    if (!m?.draft) return;
    this.patch({
      base: { draftRevision: m.draftRevision, generation: m.generation },
      buffer: adopt ? copy(m.draft) : this.value.buffer,
      dirty: !adopt,
      conflict: false,
      notice: adopt
        ? '已采用服务器草稿。'
        : '已核对新版本，保留本地输入，请显式保存。',
      error: false,
    });
  }
  ask(
    op: Op | 'createIndividualMaterial',
    keys?: { key: string; id?: string },
  ) {
    if (this.value.status !== 'online' || this.value.busy || this.value.pending)
      return;
    if (op === 'createIndividualMaterial') {
      if (!this.value.taskId || !this.value.buffer.title.trim()) {
        this.patch({ notice: '请选择办理任务并填写材料名称。', error: true });
        return;
      }
      this.patch({
        confirm: {
          op,
          body: {
            id: keys?.id ?? this.uuid(),
            taskId: this.value.taskId,
            key: keys?.key ?? this.uuid(),
            content: copy(this.value.buffer),
          },
        },
      });
      return;
    }
    const m = this.value.selected;
    if (!m) return;
    if (
      op === 'submitIndividualMaterial' &&
      (this.value.dirty || this.value.conflict)
    ) {
      this.patch({ notice: '请先保存并核对草稿。', error: true });
      return;
    }
    if (
      op === 'returnIndividualMaterial' &&
      (!this.value.reason.trim() || !this.value.modification.trim())
    ) {
      this.patch({ notice: '退回原因和修改要求均需填写。', error: true });
      return;
    }
    this.patch({
      confirm: {
        op,
        id: m.id,
        body: {
          key: keys?.key ?? this.uuid(),
          expectedRevision: m.revision,
          generation: m.generation,
          expectedDraftRevision: m.draftRevision,
          ...(m.currentSubmissionId
            ? { submissionId: m.currentSubmissionId }
            : {}),
          ...(op === 'returnIndividualMaterial'
            ? {
                reason: this.value.reason,
                modification: this.value.modification,
              }
            : {}),
        },
      },
    });
  }
  cancelConfirm() {
    this.patch({ confirm: undefined });
  }
  private async work<T>(fn: () => Promise<T>, success: (result: T) => void) {
    if (this.commandLock || this.value.status !== 'online') return;
    this.commandLock = true;
    const serial = ++this.commandSerial;
    const e = this.epoch;
    this.patch({ busy: true, notice: '', error: false });
    try {
      const result = await fn();
      if (this.allowed(e)) {
        this.invalidate();
        success(result);
      }
    } catch (error) {
      if (!this.allowed(e)) return;
      if (error instanceof ApiError && [401, 403].includes(error.status))
        this.fail(error);
      else if (error instanceof ApiError && error.status === 409) {
        this.patch({
          pending: undefined,
          notice:
            '操作冲突：服务器已有新版本或审核结果。输入已保留，请核对最新状态。',
          error: true,
        });
        this.wake();
      } else if (error instanceof ApiError && error.status === 400)
        this.patch({
          pending: undefined,
          notice: '内容或文件不符合要求，请检查名称、正文、文件格式及大小。',
          error: true,
        });
      else {
        this.failures++;
        this.fail(error);
      }
    } finally {
      if (serial === this.commandSerial) {
        this.commandLock = false;
        this.patch({ busy: false });
      }
      this.wake();
    }
  }
  async commit() {
    const command = this.value.pending ?? this.value.confirm;
    if (!command) return;
    this.patch({ confirm: undefined, pending: command });
    await this.work(
      async () =>
        command.op === 'createIndividualMaterial'
          ? this.api.request(command.op, {
              token: this.token,
              body: command.body,
            })
          : this.api.request(command.op, {
              token: this.token,
              path: { id: command.id },
              body: command.body,
            }),
      (result) => {
        this.patch({
          pending: undefined,
          dirty: false,
          conflict: false,
          notice: '操作已完成。',
          error: false,
        });
        if (command.op === 'createIndividualMaterial')
          this.select(result.current.id);
        else this.apply(result.current);
      },
    );
  }
  async save() {
    const m = this.value.selected,
      b = this.value.base;
    if (!m || !b || this.value.conflict || this.value.pending) return;
    const value = copy(this.value.buffer);
    await this.work(
      () =>
        this.api.request('saveIndividualDraft', {
          token: this.token,
          path: { id: m.id },
          body: {
            expectedDraftRevision: b.draftRevision,
            generation: b.generation,
            content: value,
          },
        }),
      (r) => {
        this.patch({ dirty: false, conflict: false, notice: '草稿已保存。' });
        this.apply(r.current);
      },
    );
  }
  async upload(
    name: string,
    source: ArrayBuffer | (() => Promise<ArrayBuffer>),
  ) {
    const m = this.value.selected;
    if (!m || this.value.pending) return;
    const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
    await this.work(
      async () => {
        const e = this.epoch,
          token = this.token;
        const bytes = typeof source === 'function' ? await source() : source;
        if (!this.allowed(e)) throw new Error('Stale file selection');
        const file = await this.api.request('createIndividualUpload', {
          token,
          path: { id: m.id },
          body: {
            originalName: name,
            extension,
            expectedBytes: bytes.byteLength,
            sha256: sha256(bytes),
            generation: m.generation,
          },
        });
        if (!this.allowed(e)) throw new Error('Stale upload');
        await this.api.request('uploadIndividualContent', {
          token,
          path: { id: file.id },
          body: bytes,
        });
        if (!this.allowed(e)) throw new Error('Stale upload');
        return this.api.request('confirmIndividualUpload', {
          token,
          path: { id: file.id },
        });
      },
      (f) => {
        this.edit({ fileIds: [...this.value.buffer.fileIds, f.id] });
        this.patch({
          notice: `附件 ${f.originalName} 已确认，请保存草稿完成绑定。`,
        });
      },
    );
  }
  async download(
    id: string,
    legacy = false,
  ): Promise<{ bytes: ArrayBuffer; name: string } | undefined> {
    if (this.value.status !== 'online') return;
    const e = this.epoch,
      token = this.token;
    try {
      const info = legacy
        ? await this.api.request('getPrivateFileInfo', { token, path: { id } })
        : await this.api.request('getIndividualFileInfo', {
            token,
            path: { id },
          });
      if (!this.allowed(e)) return;
      const bytes = await this.api.request(
        legacy ? 'downloadPrivateContent' : 'downloadIndividualContent',
        { token, path: { id } },
      );
      if (!this.allowed(e)) return;
      return { bytes, name: 'name' in info ? info.name : info.originalName };
    } catch (error) {
      if (this.allowed(e)) {
        if (error instanceof ApiError && [401, 403].includes(error.status))
          this.fail(error);
        else
          this.patch({ notice: '下载失败，请恢复连接后重试。', error: true });
      }
    }
  }
}

import { ApiError, type createApiClient } from './index.js';
import type { components } from './generated/schema.js';
import { sha256 } from './sha256.js';
type S = components['schemas'];
export const executionLabels: Record<string, string> = {
  EDITING: '待办理',
  SUBMITTED: '待审核',
  APPROVED: '已通过',
  CLOSED: '已关闭',
};
export function executionStatus(e?: {
  state: string;
  currentSubmissionId: string | null;
}) {
  return e?.state === 'EDITING' && e.currentSubmissionId
    ? '已退回 · 待修改'
    : (executionLabels[e?.state ?? ''] ?? '读取中');
}
export function workflowError(e: unknown) {
  return e instanceof ApiError
    ? ({
        400: '材料或参数不符合要求，请检查格式、大小及必填项。',
        401: '会话失效，请重新载入本地测试身份。',
        403: '权限已变更，可能已交接或停用；请返回任务列表。',
        409: '版本、截止或任务状态已变化，请核对最新数据。',
        503: '服务暂不可用，未确认成功；请核实或重试。',
      }[e.status] ?? e.message)
    : '网络或文件操作失败，未确认成功，请重试。';
}
// Platform-neutral client orchestration; no UI, database or Node dependencies.
export class MaterialEditor {
  task?: S['TaskViewDto'];
  execution?: S['ExecutionViewDto'];
  draft?: S['DraftViewDto'];
  latest?: S['DraftViewDto'];
  versions: S['SubmissionViewDto'][] = [];
  entries: S['EntryDto'][] = [];
  capabilities?: S['UploadCapabilitiesDto'];
  fileInfo: Record<string, S['FileInfoDto']> = {};
  principalId?: string;
  busy = '';
  notice = '';
  error = false;
  dirty = false;
  denied = false;
  uploadFailures: Record<string, string> = {};
  fieldErrors: Record<string, string> = {};
  pending?: S['SubmitDto'];
  constructor(
    readonly client: ReturnType<typeof createApiClient>,
    public token: string,
    readonly id: string,
    readonly newKey: () => Promise<string>,
    readonly changed: () => void,
  ) {}
  private async perform(label: string, work: () => Promise<void>) {
    if (this.busy) return;
    this.busy = label;
    this.notice = '';
    this.error = false;
    this.changed();
    try {
      await work();
    } catch (e) {
      this.error = true;
      this.notice = workflowError(e);
      if (e instanceof ApiError && [401, 403].includes(e.status))
        this.denied = true;
    } finally {
      this.busy = '';
      this.changed();
    }
  }
  async refreshFileInfo(draft: S['DraftViewDto']) {
    const ids = [...new Set(draft.entries.flatMap((e) => e.fileIds))];
    const rows = await Promise.all(
      ids.map((id) =>
        this.client.request('getPrivateFileInfo', {
          token: this.token,
          path: { id },
        }),
      ),
    );
    this.fileInfo = Object.fromEntries(rows.map((row) => [row.id, row]));
  }
  async resume(token: string) {
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 20));
    const actor = await this.client.request('getWorkspaceIdentity', { token });
    if (this.principalId && actor.id !== this.principalId)
      throw new Error('Different identity requires a new editor');
    // An upload/save may have started while identity validation was in flight.
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 20));
    this.token = token;
    await this.load();
    if (!this.error) {
      this.notice = this.latest
        ? '身份已恢复；输入已保留，服务器草稿有变化，请先核对。'
        : '身份已恢复，已重新核对权限与版本；输入保留，不会自动提交。';
      this.changed();
    }
  }
  async load() {
    await this.perform('读取中', async () => {
      const path = { id: this.id },
        token = this.token;
      const [task, execution, draft, versions, capabilities] =
        await Promise.all([
          this.client.request('getMaterialTask', { token, path }),
          this.client.request('getTaskExecution', { token, path }),
          this.client.request('getMaterialDraft', { token, path }),
          this.client.request('listSubmissionVersions', { token, path }),
          this.client.request('getUploadCapabilities', { token }),
        ]);
      const actor = await this.client.request('getWorkspaceIdentity', {
        token,
      });
      if (this.principalId && this.principalId !== actor.id)
        throw new Error('Identity mismatch');
      this.principalId = actor.id;
      this.task = task;
      this.execution = execution;
      this.versions = versions;
      this.capabilities = capabilities;
      this.denied = false;
      if (this.dirty || this.pending) {
        if (draft.revision !== this.draft?.revision) this.latest = draft;
      } else {
        this.draft = draft;
        this.entries = draft.entries.map((e) => ({
          ...e,
          fileIds: [...e.fileIds],
        }));
      }
      await this.refreshFileInfo(draft);
    });
  }
  entry(id: string) {
    return (
      this.entries.find((e) => e.materialId === id) ?? {
        materialId: id,
        text: '',
        fileIds: [],
      }
    );
  }
  edit(id: string, change: Partial<S['EntryDto']>) {
    if (this.busy || this.pending || this.denied) return;
    const updated = { ...this.entry(id), ...change };
    this.entries = [
      ...this.entries.filter((e) => e.materialId !== id),
      updated,
    ];
    this.dirty = true;
    delete this.fieldErrors[id];
    this.changed();
  }
  acceptLatestBase() {
    if (!this.latest || this.busy) return;
    this.draft = this.latest;
    this.latest = undefined;
    this.notice = '已保留当前输入，请再次保存；不会自动覆盖服务器。';
    this.changed();
  }
  clearFailure(id: string) {
    delete this.uploadFailures[id];
    this.changed();
  }
  async upload(
    id: string,
    name: string,
    source: ArrayBuffer | (() => Promise<ArrayBuffer>),
  ) {
    await this.perform('上传并确认中', async () => {
      const material = this.task?.requirements?.materials.find(
          (m) => m.id === id,
        ),
        extension = name.split('.').slice(-1)[0]?.toLowerCase();
      try {
        const bytes = typeof source === 'function' ? await source() : source;
        if (
          !material ||
          !extension ||
          !this.capabilities?.formats.includes(extension) ||
          !material.formats.includes(extension) ||
          !bytes.byteLength ||
          bytes.byteLength >
            Math.min(material.maxBytes, this.capabilities.maxBytes) ||
          this.entry(id).fileIds.length >= 10
        )
          throw new Error('Invalid file');
        const token = this.token;
        const intent = await this.client.request('createUploadIntent', {
          token,
          path: { id: this.id },
          body: {
            materialId: id,
            originalName: name,
            extension: extension as 'txt' | 'pdf' | 'png' | 'jpg' | 'jpeg',
            expectedBytes: bytes.byteLength,
            sha256: sha256(bytes),
          },
        });
        await this.client.request('uploadPrivateContent', {
          token,
          path: { id: intent.id },
          body: bytes,
        });
        await this.client.request('confirmPrivateUpload', {
          token,
          path: { id: intent.id },
        });
        const entry = this.entry(id);
        this.entries = [
          ...this.entries.filter((e) => e.materialId !== id),
          { ...entry, fileIds: [...entry.fileIds, intent.id] },
        ];
        this.dirty = true;
        delete this.uploadFailures[id];
        delete this.fieldErrors[id];
        this.notice = '附件已确认，尚需保存草稿。';
      } catch (e) {
        this.uploadFailures[id] =
          '上传失败：未加入草稿，请核对格式和大小后重试，或移除失败项。';
        throw e;
      }
    });
  }
  async save() {
    if (this.pending || this.latest || this.denied) return;
    await this.perform('保存中', async () => {
      if (!this.draft) return;
      try {
        this.draft = await this.client.request('saveMaterialDraft', {
          token: this.token,
          path: { id: this.id },
          body: {
            expectedRevision: this.draft.revision,
            entries: this.entries,
          },
        });
        this.dirty = false;
        await this.refreshFileInfo(this.draft);
        this.notice = '草稿已保存';
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          this.latest = await this.client.request('getMaterialDraft', {
            token: this.token,
            path: { id: this.id },
          });
          this.error = true;
          this.notice = '草稿冲突：当前输入已保留，请核对最新版本。';
          return;
        }
        throw e;
      }
    });
  }
  async submit() {
    if (!this.pending) {
      this.fieldErrors = Object.fromEntries(
        (this.task?.requirements?.materials ?? [])
          .filter(
            (m) =>
              m.required &&
              !this.entry(m.id).text.trim() &&
              !this.entry(m.id).fileIds.length,
          )
          .map((m) => [m.id, '必交材料：请填写内容或上传并确认附件。']),
      );
      if (Object.keys(this.fieldErrors).length) {
        this.error = true;
        this.notice = '请补全标记的必交材料';
        this.changed();
        return;
      }
    }
    if (
      this.denied ||
      (!this.pending &&
        (this.dirty || this.latest || Object.keys(this.uploadFailures).length))
    )
      return;
    await this.perform('提交中', async () => {
      if (!this.draft) return;
      this.pending ??= {
        idempotencyKey: await this.newKey(),
        expectedDraftRevision: this.draft.revision,
      };
      try {
        const result = await this.client.request('submitMaterialPackage', {
          token: this.token,
          path: { id: this.id },
          body: this.pending,
        });
        this.notice = `提交成功 · V${result.version}`;
        this.execution = await this.client.request('getTaskExecution', {
          token: this.token,
          path: { id: this.id },
        });
        this.versions = await this.client.request('listSubmissionVersions', {
          token: this.token,
          path: { id: this.id },
        });
        this.pending = undefined;
      } catch (e) {
        if (e instanceof ApiError && [400, 401, 403, 409].includes(e.status))
          this.pending = undefined;
        throw e;
      }
    });
  }
  get overdue() {
    const d = this.execution?.deadlines;
    return (
      !!d &&
      [
        d.task,
        ...d.materials
          .filter(
            (m) =>
              this.task?.requirements?.materials.find((r) => r.id === m.id)
                ?.required || this.entries.some((e) => e.materialId === m.id),
          )
          .map((m) => m.deadline),
      ].some((t) => Date.now() >= Date.parse(t))
    );
  }
}

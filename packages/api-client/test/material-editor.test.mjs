import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  MaterialEditor,
  ApiError,
  sha256,
  uuidFromBytes,
} from '../dist/index.js';
const bytes = (b) => Uint8Array.from(b).buffer;
test('portable SHA-256 matches Node at padding boundaries and maximum upload size', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 1024, 10485760]) {
    const b = randomBytes(n);
    assert.equal(
      sha256(bytes(b)),
      createHash('sha256').update(b).digest('hex'),
    );
  }
  assert.match(
    uuidFromBytes(bytes(randomBytes(16))),
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
});
test('draft conflict retains input until explicit latest-revision acknowledgement', async () => {
  let calls = 0;
  const editor = new MaterialEditor(
    {
      request: async (op) => {
        if (op === 'saveMaterialDraft') {
          calls++;
          throw new ApiError(409);
        }
        if (op === 'getMaterialDraft')
          return {
            revision: 3,
            entries: [{ materialId: 'm', text: 'remote', fileIds: [] }],
          };
      },
    },
    'token',
    'task',
    async () => '',
    () => {},
  );
  editor.draft = { revision: 1, entries: [] };
  editor.edit('m', { text: 'my input' });
  await editor.save();
  assert.equal(editor.entry('m').text, 'my input');
  assert.equal(editor.draft.revision, 1);
  assert.equal(editor.latest.revision, 3);
  await editor.save();
  assert.equal(calls, 1);
  editor.acceptLatestBase();
  assert.equal(editor.draft.revision, 3);
  assert.equal(editor.entry('m').text, 'my input');
});
test('unknown submission outcome retains same command, blocks edits and duplicate clicks', async () => {
  let attempts = 0,
    keys = 0,
    release;
  const commands = [];
  const editor = new MaterialEditor(
    {
      request: async (op, input) => {
        if (op === 'submitMaterialPackage') {
          commands.push({ ...input.body });
          attempts++;
          if (attempts === 1) {
            await new Promise((r) => (release = r));
            throw new Error('Response lost');
          }
          return { version: 1 };
        }
        if (op === 'getTaskExecution') return { state: 'SUBMITTED' };
        if (op === 'listSubmissionVersions') return [{ version: 1 }];
      },
    },
    'token',
    'task',
    async () => String(++keys),
    () => {},
  );
  editor.draft = { revision: 2, entries: [] };
  const first = editor.submit();
  await new Promise((r) => setTimeout(r, 0));
  await editor.submit();
  assert.equal(attempts, 1);
  release();
  await first;
  editor.edit('m', { text: 'blocked' });
  assert.equal(editor.entries.length, 0);
  assert.ok(editor.pending);
  await editor.submit();
  assert.deepEqual(commands[0], commands[1]);
  assert.equal(keys, 1);
  assert.equal(editor.pending, undefined);
});
test('failed confirmation never binds a file or permits submission until failure is explicitly removed', async () => {
  let submit = 0;
  const editor = new MaterialEditor(
    {
      request: async (op) => {
        if (op === 'createUploadIntent') return { id: 'file' };
        if (op === 'confirmPrivateUpload') throw new ApiError(400);
        if (op === 'submitMaterialPackage') submit++;
      },
    },
    'token',
    'task',
    async () => '',
    () => {},
  );
  editor.task = {
    requirements: {
      materials: [{ id: 'm', formats: ['txt'], maxBytes: 1024 }],
    },
  };
  editor.capabilities = { formats: ['txt'], maxBytes: 1024 };
  editor.draft = { revision: 1, entries: [] };
  await editor.upload('m', 'test.txt', bytes(Buffer.from('text')));
  assert.deepEqual(editor.entries, []);
  assert.ok(editor.uploadFailures.m);
  await editor.submit();
  assert.equal(submit, 0);
});

test('same identity recovery preserves input and checks latest revision without writing; another identity is rejected', async () => {
  let revision = 1;
  const validating = Promise.withResolvers(),
    release = Promise.withResolvers();
  const commands = [];
  const client = {
    request: async (op, input) => {
      commands.push(op);
      if (op === 'getWorkspaceIdentity') {
        if (input.token === 'queued') {
          validating.resolve();
          await release.promise;
        }
        return { id: input.token === 'other' ? 'B' : 'A' };
      }
      if (op === 'getMaterialTask')
        return {
          id: 'task',
          requirements: { materials: [{ id: 'm', required: true }] },
        };
      if (op === 'getTaskExecution')
        return {
          state: 'EDITING',
          currentSubmissionId: null,
          deadlines: { task: '2099-01-01', materials: [] },
        };
      if (op === 'getMaterialDraft')
        return {
          id: 'task',
          revision,
          entries: [{ materialId: 'm', text: 'remote', fileIds: [] }],
        };
      if (op === 'listSubmissionVersions') return [];
      if (op === 'getUploadCapabilities')
        return { formats: ['txt'], maxBytes: 1024 };
      if (op === 'saveMaterialDraft') throw new ApiError(401);
    },
  };
  const editor = new MaterialEditor(
    client,
    'old',
    'task',
    async () => '',
    () => {},
  );
  await editor.load();
  editor.edit('m', { text: 'unsaved input' });
  await editor.save();
  assert.equal(editor.denied, true);
  revision = 2;
  await editor.resume('fresh');
  assert.equal(editor.entry('m').text, 'unsaved input');
  assert.equal(editor.latest.revision, 2);
  assert.equal(editor.draft.revision, 1);
  assert.equal(editor.denied, false);
  assert.equal(commands.filter((x) => x === 'saveMaterialDraft').length, 1);
  assert.ok(!commands.includes('submitMaterialPackage'));
  await assert.rejects(editor.resume('other'));
  assert.equal(editor.token, 'fresh');
  assert.equal(editor.entry('m').text, 'unsaved input');
  const recovering = editor.resume('queued');
  await validating.promise;
  editor.busy = 'upload';
  release.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(editor.token, 'fresh');
  editor.busy = '';
  await recovering;
  assert.equal(editor.token, 'queued');
  assert.equal(editor.entry('m').text, 'unsaved input');
});

test('silent sync preserves unsaved material input and errors while detecting a newer draft', async () => {
  let revision = 1;
  const calls = [];
  const editor = new MaterialEditor(
    {
      request: async (op) => {
        calls.push(op);
        if (op === 'getMaterialTask') return { id: 'task' };
        if (op === 'getTaskExecution') return { state: 'EDITING' };
        if (op === 'getMaterialDraft')
          return {
            revision,
            entries: [{ materialId: 'm', text: 'server', fileIds: [] }],
          };
        if (op === 'listSubmissionVersions') return [{ version: revision }];
        if (op === 'getUploadCapabilities') return { formats: ['txt'] };
        if (op === 'getWorkspaceIdentity') return { id: 'actor' };
      },
    },
    'token',
    'task',
    async () => '',
    () => {},
  );
  await editor.load();
  editor.edit('m', { text: 'my unsaved input' });
  editor.fieldErrors.m = 'Keep this error';
  editor.notice = 'Keep this notice';
  editor.error = true;
  revision = 2;
  assert.equal(await editor.sync(), 'ok');
  assert.equal(editor.entry('m').text, 'my unsaved input');
  assert.equal(editor.draft.revision, 1);
  assert.equal(editor.latest.revision, 2);
  assert.equal(editor.versions[0].version, 2);
  assert.equal(editor.fieldErrors.m, 'Keep this error');
  assert.equal(editor.notice, 'Keep this notice');
  assert.equal(editor.error, true);
  assert.equal(editor.busy, '');
  assert.ok(!calls.includes('saveMaterialDraft'));
});

test('silent sync discards an old response after the user starts editing', async () => {
  let release;
  let reading;
  let draftCalls = 0;
  const editor = new MaterialEditor(
    {
      request: async (op) => {
        if (op === 'getMaterialTask') return { id: 'task' };
        if (op === 'getTaskExecution') return { state: 'EDITING' };
        if (op === 'getMaterialDraft') {
          draftCalls++;
          if (draftCalls === 2) {
            reading();
            await new Promise((resolve) => (release = resolve));
          }
          return {
            revision: draftCalls,
            entries: [{ materialId: 'm', text: 'remote', fileIds: [] }],
          };
        }
        if (op === 'listSubmissionVersions') return [];
        if (op === 'getUploadCapabilities') return { formats: ['txt'] };
        if (op === 'getWorkspaceIdentity') return { id: 'actor' };
      },
    },
    'token',
    'task',
    async () => '',
    () => {},
  );
  await editor.load();
  const started = new Promise((resolve) => (reading = resolve));
  const pending = editor.sync();
  await started;
  editor.edit('m', { text: 'typed while syncing' });
  release();
  await pending;
  assert.equal(editor.entry('m').text, 'typed while syncing');
  assert.equal(editor.draft.revision, 1);
  assert.equal(editor.latest, undefined);
});

test('later silent sync wins when older response arrives last', async () => {
  let release;
  let started;
  let revision = 1;
  let draftCalls = 0;
  const editor = new MaterialEditor(
    {
      request: async (op) => {
        if (op === 'getMaterialTask') return { id: 'task' };
        if (op === 'getTaskExecution') return { state: 'EDITING' };
        if (op === 'getMaterialDraft') {
          draftCalls++;
          const value = revision;
          if (draftCalls === 2) {
            started();
            await new Promise((resolve) => (release = resolve));
          }
          return {
            revision: value,
            entries: [
              { materialId: 'm', text: `server ${value}`, fileIds: [] },
            ],
          };
        }
        if (op === 'listSubmissionVersions') return [];
        if (op === 'getUploadCapabilities') return { formats: ['txt'] };
        if (op === 'getWorkspaceIdentity') return { id: 'actor' };
      },
    },
    'token',
    'task',
    async () => '',
    () => {},
  );
  await editor.load();
  const firstStarted = new Promise((resolve) => (started = resolve));
  const first = editor.sync();
  await firstStarted;
  revision = 3;
  await editor.sync();
  release();
  await first;
  assert.equal(editor.draft.revision, 3);
  assert.equal(editor.entry('m').text, 'server 3');
});

test('silent sync removes cached protected content after authorization is revoked', async () => {
  let revoked = false;
  const editor = new MaterialEditor(
    {
      request: async (op) => {
        if (revoked && op === 'getMaterialTask') throw new ApiError(403);
        if (op === 'getMaterialTask')
          return { id: 'task', title: 'Private task' };
        if (op === 'getTaskExecution') return { state: 'EDITING' };
        if (op === 'getMaterialDraft')
          return {
            revision: 1,
            entries: [{ materialId: 'm', text: 'Private text', fileIds: [] }],
          };
        if (op === 'listSubmissionVersions') return [{ version: 1 }];
        if (op === 'getUploadCapabilities') return { formats: ['txt'] };
        if (op === 'getWorkspaceIdentity') return { id: 'actor' };
      },
    },
    'token',
    'task',
    async () => '',
    () => {},
  );
  await editor.load();
  editor.edit('m', { text: 'Private unsaved text' });
  revoked = true;
  assert.equal(await editor.sync(), 403);
  assert.equal(editor.task, undefined);
  assert.equal(editor.draft, undefined);
  assert.equal(editor.execution, undefined);
  assert.deepEqual(editor.versions, []);
  assert.deepEqual(editor.entries, []);
  assert.equal(editor.pending, undefined);
  assert.equal(editor.denied, true);
  assert.equal(editor.error, true);
});

test('temporary silent sync failure leaves current editor state and notice intact', async () => {
  let offline = false;
  const editor = new MaterialEditor(
    {
      request: async (op) => {
        if (offline) throw new Error('Network unavailable');
        if (op === 'getMaterialTask') return { id: 'task' };
        if (op === 'getTaskExecution') return { state: 'EDITING' };
        if (op === 'getMaterialDraft')
          return {
            revision: 1,
            entries: [{ materialId: 'm', text: 'saved', fileIds: [] }],
          };
        if (op === 'listSubmissionVersions') return [];
        if (op === 'getUploadCapabilities') return { formats: ['txt'] };
        if (op === 'getWorkspaceIdentity') return { id: 'actor' };
      },
    },
    'token',
    'task',
    async () => '',
    () => {},
  );
  await editor.load();
  editor.notice = 'Earlier upload message';
  offline = true;
  assert.equal(await editor.sync(), 'unavailable');
  assert.equal(editor.entry('m').text, 'saved');
  assert.equal(editor.notice, 'Earlier upload message');
  assert.equal(editor.denied, false);
});

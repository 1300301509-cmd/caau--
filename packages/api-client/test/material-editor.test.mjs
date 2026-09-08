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

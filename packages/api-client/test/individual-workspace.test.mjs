import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, IndividualWorkspace } from '../dist/index.js';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await delay(5);
  }
  assert.fail('Coordinator did not settle');
}
function fixture() {
  let n = 0;
  const f = {
    remote: {
      id: 'm',
      taskId: 't',
      revision: 1,
      draftRevision: 1,
      generation: 1,
      contextRevision: 1,
      closed: false,
      state: 'DRAFT',
      deadline: '2099-01-01T00:00:00Z',
      currentSubmissionId: null,
      draft: { title: 'Title', category: '', text: 'Saved', fileIds: [] },
      submission: null,
      lastAction: null,
    },
    calls: [],
    authorized: true,
    override: undefined,
  };
  const api = {
    async request(op, input) {
      f.calls.push({ op, input });
      if (f.override) {
        const result = f.override(op, input);
        if (result !== undefined) return result;
      }
      if (op === 'getWorkspaceIdentity')
        return {
          id: input.token,
          displayName: 'Synthetic',
          roles: ['ORGANIZER'],
        };
      if (op === 'listMaterialTasks')
        return f.authorized
          ? [
              {
                id: 't',
                individualChannel: true,
                state: 'PUBLISHED',
                title: 'Task',
              },
            ]
          : [];
      if (op === 'getIndividualSnapshot') {
        if (!f.authorized && input.query?.selectedId) throw new ApiError(403);
        return {
          items: f.authorized ? [structuredClone(f.remote)] : [],
          selected: input.query?.selectedId ? structuredClone(f.remote) : null,
          total: f.authorized ? 1 : 0,
          serverTime: new Date().toISOString(),
        };
      }
      if (op === 'getIndividualHistory')
        return {
          materialRevision: f.remote.revision,
          serverTime: new Date().toISOString(),
          total: 0,
          actions: [],
          submissions: [],
        };
      if (op === 'saveIndividualDraft') {
        f.remote = {
          ...f.remote,
          revision: f.remote.revision + 1,
          draftRevision: f.remote.draftRevision + 1,
          draft: input.body.content,
        };
        return {
          current: structuredClone(f.remote),
          resultRevision: f.remote.revision,
          resultSubmissionId: null,
        };
      }
      if (op === 'logout') return { id: 'u' };
      throw new Error(`Unexpected operation ${op}`);
    },
  };
  f.model = new IndividualWorkspace(api, () => `key-${++n}`, 60000);
  return f;
}
async function ready(f) {
  await f.model.login('u');
  await until(() => f.model.value.status === 'online');
  f.model.select('m');
  await until(
    () => !!f.model.value.selected && f.model.value.status === 'online',
  );
}
test('polling/pagination preserve dirty buffer; CAS reconciliation never silently adopts remote text', async () => {
  const f = fixture(),
    m = f.model;
  try {
    await ready(f);
    m.edit({ text: 'Unsent local' });
    f.remote = {
      ...f.remote,
      revision: 2,
      draftRevision: 2,
      draft: { ...f.remote.draft, text: 'Other window' },
    };
    m.query({ offset: 5 });
    await until(() => m.value.conflict && m.value.status === 'online');
    assert.equal(m.value.offset, 5);
    assert.equal(m.value.buffer.text, 'Unsent local');
    m.reconcile(false);
    await m.save();
    assert.equal(m.value.busy, false);
    assert.equal(
      f.calls.find((c) => c.op === 'saveIndividualDraft').input.body
        .expectedDraftRevision,
      2,
    );
    assert.equal(f.remote.draft.text, 'Unsent local');
  } finally {
    m.dispose();
  }
});
test('late protected snapshot cannot restore state after logout', async () => {
  const f = fixture(),
    m = f.model;
  let release,
    entered = false;
  try {
    await ready(f);
    const held = new Promise((r) => {
      release = r;
    });
    f.override = (op) =>
      op === 'getIndividualSnapshot' ? ((entered = true), held) : undefined;
    m.wake();
    await until(() => entered);
    m.logout();
    release({
      items: [f.remote],
      selected: f.remote,
      total: 1,
      serverTime: new Date().toISOString(),
    });
    await delay(20);
    assert.equal(m.value.identity, undefined);
    assert.deepEqual(m.value.rows, []);
    assert.equal(m.value.selected, undefined);
  } finally {
    release?.({});
    m.dispose();
  }
});
test('403 clears buffer, opinions, history and target, then resynchronizes remaining authorized scope', async () => {
  const f = fixture(),
    m = f.model;
  try {
    await ready(f);
    m.edit({ text: 'Private draft' });
    m.opinion({ reason: 'Private opinion' });
    f.authorized = false;
    m.wake();
    await until(() => !m.value.selectedId && m.value.status === 'online');
    assert.equal(m.value.buffer.text, '');
    assert.equal(m.value.reason, '');
    assert.equal(m.value.history, undefined);
    assert.deepEqual(m.value.tasks, []);
    assert.ok(m.value.identity);
  } finally {
    m.dispose();
  }
});
test('unknown submission response retains exact command across authoritative sync and explicit retry', async () => {
  const f = fixture(),
    m = f.model;
  let attempts = 0,
    key;
  try {
    await ready(f);
    f.override = (op, input) => {
      if (op !== 'submitIndividualMaterial') return;
      attempts++;
      if (attempts === 1) {
        key = input.body.key;
        f.remote = {
          ...f.remote,
          revision: 2,
          state: 'PENDING_REVIEW',
          currentSubmissionId: 'v1',
        };
        return Promise.reject(new Error('Response lost'));
      }
      assert.equal(input.body.key, key);
      assert.equal(input.body.expectedRevision, 1);
      return { current: f.remote, resultRevision: 2, resultSubmissionId: 'v1' };
    };
    m.ask('submitIndividualMaterial');
    await m.commit();
    await until(() => m.value.status === 'online');
    assert.ok(m.value.pending);
    await m.commit();
    assert.equal(m.value.pending, undefined);
    assert.equal(attempts, 2);
  } finally {
    m.dispose();
  }
});
test('file read started under old identity never uploads into a new identity or selection', async () => {
  const f = fixture(),
    m = f.model;
  let release;
  try {
    await ready(f);
    const bytes = new Promise((r) => {
      release = r;
    });
    const upload = m.upload('x.txt', () => bytes);
    await m.login('different-user');
    release(new ArrayBuffer(1));
    await upload;
    await until(() => m.value.status === 'online');
    assert.equal(m.value.identity.id, 'different-user');
    assert.equal(m.value.busy, false);
    assert.equal(
      f.calls.some((c) => c.op === 'createIndividualUpload'),
      false,
    );
  } finally {
    release?.(new ArrayBuffer(0));
    m.dispose();
  }
});
test('role downgrade clears draft-only content and cached history even when submission access remains', async () => {
  const f = fixture(),
    m = f.model;
  try {
    await ready(f);
    m.edit({ text: 'Draft-only private buffer' });
    f.remote = { ...f.remote, draft: null };
    f.override = (op) =>
      op === 'getWorkspaceIdentity'
        ? { id: 'u', displayName: 'Synthetic', roles: ['REVIEWER'] }
        : undefined;
    m.wake();
    await until(
      () =>
        m.value.identity?.roles[0] === 'REVIEWER' &&
        m.value.status === 'online',
    );
    assert.equal(m.value.selected, undefined);
    assert.equal(m.value.buffer.text, '');
    assert.equal(m.value.history, undefined);
  } finally {
    m.dispose();
  }
});

import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ApiError,
  createApiClient,
} from '../packages/api-client/dist/index.js';
import { createFetchTransport } from '../packages/api-client/dist/fetch.js';

const exec = promisify(execFile);
const apiBase = process.env.CAAU_LOCAL_API ?? 'http://127.0.0.1:3000';
const webBase = process.env.CAAU_LOCAL_WEB ?? 'http://127.0.0.1:5175';
const eventManifestPath = '.local/db/local-test-events.json';
const taskManifestPath = '.local/db/local-test-tasks.json';
const demonstrationDeadline = '2099-12-31T15:59:59.000Z';
const definitions = [
  {
    key: 'a',
    title: '测试赛 A 办赛资料',
    organizer: 'organizer-a',
    eventKey: 'a',
  },
  {
    key: 'b',
    title: '测试赛 B 办赛资料',
    organizer: 'organizer-b',
    eventKey: 'b',
  },
];
let stage = 'second-step-verification';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Local only');
  await exec(process.execPath, ['scripts/local-events.mjs'], {
    env: process.env,
  });
  const eventManifest = JSON.parse(await readFile(eventManifestPath, 'utf8'));
  const client = createApiClient(apiBase, createFetchTransport());
  const call = (name, input) => {
    stage = name;
    return client.request(name, input);
  };
  const choices = await call('listLocalTestIdentities');
  if (choices.length !== 6) throw new Error('Fixed identities unavailable');
  const sessions = {};
  for (const identity of choices) {
    const session = await call('createLocalTestSession', {
      body: { identity: identity.key },
    });
    sessions[identity.key] = session.token;
    const actual = await call('getWorkspaceIdentity', { token: session.token });
    if (actual.displayName !== identity.displayName)
      throw new Error('Fixed identity mismatch');
  }
  const managerToken = sessions['event-manager'];
  const directory = await call('getWorkspaceDirectory', {
    token: managerToken,
  });
  const users = new Map(directory.users.map((user) => [user.id, user]));
  const organizations = new Map(
    directory.organizations.map((organization) => [
      organization.id,
      organization,
    ]),
  );
  const memberFor = (identityKey) => {
    const choice = choices.find((item) => item.key === identityKey);
    const member = directory.members.find(
      (item) =>
        users.get(item.userId)?.displayName === choice?.displayName &&
        organizations.get(item.organizationId)?.name ===
          choice?.organizationName,
    );
    if (!member) throw new Error(`Member unavailable: ${identityKey}`);
    return member;
  };

  const eventIds = Object.fromEntries(
    definitions.map((definition) => [
      definition.eventKey,
      eventManifest.events?.[definition.eventKey]?.id,
    ]),
  );
  if (!eventIds.a || !eventIds.b)
    throw new Error('Prepared events unavailable');
  const scopeMatrix = {
    'event-manager': ['a', 'b'],
    'reviewer-a': ['a', 'b'],
    'reviewer-b': ['a', 'b'],
    'organizer-a': ['a'],
    'organizer-b': ['b'],
  };
  for (const [identityKey, eventKeys] of Object.entries(scopeMatrix))
    for (const eventKey of ['a', 'b']) {
      const allowed = eventKeys.includes(eventKey);
      try {
        await call('getEventScope', {
          token: sessions[identityKey],
          path: { id: eventIds[eventKey] },
        });
        if (!allowed)
          throw new Error('Cross-event access unexpectedly allowed');
      } catch (error) {
        if (allowed || !(error instanceof ApiError) || error.status !== 403)
          throw error;
      }
    }

  let saved;
  try {
    saved = JSON.parse(await readFile(taskManifestPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const listed = await call('listMaterialTasks', { token: managerToken });
  const tasks = {};
  for (const definition of definitions) {
    const eventId = eventIds[definition.eventKey];
    const organizer = memberFor(definition.organizer);
    let task;
    const savedId = saved?.tasks?.[definition.key]?.id;
    if (savedId)
      task = await call('getMaterialTask', {
        token: managerToken,
        path: { id: savedId },
      });
    else {
      const matches = listed.filter(
        (candidate) =>
          candidate.eventId === eventId && candidate.title === definition.title,
      );
      if (matches.length > 1)
        throw new Error(`Duplicate local tasks: ${definition.key}`);
      if (matches[0]) task = matches[0];
      else {
        const created = await call('createIndividualMaterialTask', {
          token: managerToken,
          body: {
            eventId,
            organizationId: organizer.organizationId,
            handlerMemberId: organizer.id,
            title: definition.title,
          },
        });
        task = await call('getMaterialTask', {
          token: managerToken,
          path: { id: created.id },
        });
      }
    }
    if (
      task.eventId !== eventId ||
      task.title !== definition.title ||
      task.organizationId !== organizer.organizationId ||
      task.handlerMemberId !== organizer.id ||
      !task.individualChannel
    )
      throw new Error(`Existing task assignment mismatch: ${definition.key}`);
    const expectedRequirements = {
      deadline: demonstrationDeadline,
      materials: [],
    };
    if (task.requirements) {
      if (
        JSON.stringify(task.requirements) !==
        JSON.stringify(expectedRequirements)
      )
        throw new Error(
          `Existing task configuration must not be overwritten: ${definition.key}`,
        );
    } else {
      task = await call('configureMaterialTask', {
        token: managerToken,
        path: { id: task.id },
        body: {
          expectedRevision: task.revision,
          requirements: expectedRequirements,
        },
      });
    }
    if (task.state === 'DRAFT')
      task = await call('publishMaterialTask', {
        token: managerToken,
        path: { id: task.id },
        body: { expectedRevision: task.revision },
      });
    if (
      task.state !== 'PUBLISHED' ||
      JSON.stringify(task.requirements) !== JSON.stringify(expectedRequirements)
    )
      throw new Error(`Task publication mismatch: ${definition.key}`);
    tasks[definition.key] = task;
  }

  const expectedTaskAccess = {
    'event-manager': ['a', 'b'],
    'reviewer-a': ['a', 'b'],
    'reviewer-b': ['a', 'b'],
    'organizer-a': ['a'],
    'organizer-b': ['b'],
  };
  for (const [identityKey, taskKeys] of Object.entries(expectedTaskAccess)) {
    const visible = await call('listMaterialTasks', {
      token: sessions[identityKey],
    });
    for (const definition of definitions) {
      const shouldAllow = taskKeys.includes(definition.key);
      const task = tasks[definition.key];
      if (visible.some((candidate) => candidate.id === task.id) !== shouldAllow)
        throw new Error(
          `Task list scope mismatch: ${identityKey}/${definition.key}`,
        );
      try {
        await call('getMaterialTask', {
          token: sessions[identityKey],
          path: { id: task.id },
        });
        if (!shouldAllow)
          throw new Error('Cross-task access unexpectedly allowed');
      } catch (error) {
        if (shouldAllow || !(error instanceof ApiError) || error.status !== 403)
          throw error;
      }
    }
  }
  for (const definition of definitions) {
    const snapshot = await call('getIndividualSnapshot', {
      token: sessions[definition.organizer],
      query: { taskId: tasks[definition.key].id, limit: 50 },
    });
    if (snapshot.total !== 0)
      throw new Error(`Materials must remain empty: ${definition.key}`);
  }

  const manifest = {
    preparedAt: new Date().toISOString(),
    demonstrationDeadline,
    tasks: Object.fromEntries(
      definitions.map((definition) => {
        const task = tasks[definition.key];
        return [
          definition.key,
          {
            id: task.id,
            eventId: task.eventId,
            title: task.title,
            organizerIdentity: definition.organizer,
            view: `${webBase}/materials?event=${task.eventId}&task=${task.id}`,
          },
        ];
      }),
    ),
  };
  if (!saved)
    await writeFile(
      taskManifestPath,
      JSON.stringify(manifest, null, 2) + '\n',
      {
        flag: 'wx',
        mode: 0o600,
      },
    );
  else if (
    saved.tasks?.a?.id !== manifest.tasks.a.id ||
    saved.tasks?.b?.id !== manifest.tasks.b.id ||
    saved.demonstrationDeadline !== demonstrationDeadline
  )
    throw new Error('Existing task manifest must not be overwritten');

  console.log(
    'Local individual-material tasks are published and access-verified.',
  );
  console.log(`Demonstration deadline: ${demonstrationDeadline}`);
  console.log(`A: ${manifest.tasks.a.view}`);
  console.log(`B: ${manifest.tasks.b.view}`);
  console.log('Both tasks contain zero materials, submissions and reviews.');
  for (const token of Object.values(sessions))
    await call('logout', { token }).catch(() => {});
}

main().catch(() => {
  console.error(
    `Local task preparation failed at ${stage}; no credential or response body printed. Existing tasks were not overwritten or cleaned up.`,
  );
  process.exitCode = 1;
});

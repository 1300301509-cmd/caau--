import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, writeFile } from 'node:fs/promises';
import {
  ApiError,
  createApiClient,
} from '../packages/api-client/dist/index.js';
import { createFetchTransport } from '../packages/api-client/dist/fetch.js';

const exec = promisify(execFile);
const apiBase = process.env.CAAU_LOCAL_API ?? 'http://127.0.0.1:3000';
const webBase = process.env.CAAU_LOCAL_WEB ?? 'http://127.0.0.1:5175';
const manifestPath = '.local/db/local-test-events.json';
const definitions = [
  {
    key: 'a',
    name: '测试大区赛 A',
    marker: '[CAAU-LOCAL-EVENT-A:v1]',
    organizer: 'organizer-a',
  },
  {
    key: 'b',
    name: '测试大区赛 B',
    marker: '[CAAU-LOCAL-EVENT-B:v1]',
    organizer: 'organizer-b',
  },
];
let stage = 'startup';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Local only');
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

  const { stdout } = await exec(process.execPath, [
    'scripts/local-identity.mjs',
    'bootstrap',
  ]);
  const adminFile = stdout.match(/\.local\/db\/session-[a-f0-9-]+\.json/)?.[0];
  if (!adminFile) throw new Error('Administrator session file missing');
  const admin = JSON.parse(await readFile(adminFile, 'utf8'));
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
    return member.id;
  };

  let saved;
  try {
    saved = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const listed = await call('listEvents', { token: managerToken });
  const events = {};
  for (const definition of definitions) {
    if (saved?.events?.[definition.key]?.id) {
      const event = await call('getEvent', {
        token: managerToken,
        path: { id: saved.events[definition.key].id },
      });
      if (
        event.name !== definition.name ||
        !event.description.includes(definition.marker)
      )
        throw new Error(`Saved event mismatch: ${definition.key}`);
      events[definition.key] = event;
      continue;
    }
    const matches = listed.filter((event) =>
      event.description.includes(definition.marker),
    );
    if (matches.length > 1)
      throw new Error(`Duplicate marked events: ${definition.key}`);
    events[definition.key] =
      matches[0] ??
      (await call('createEvent', {
        token: managerToken,
        body: {
          name: definition.name,
          description: `${definition.marker} 本地授权测试赛事；不含资料任务、材料、附件或提交。`,
        },
      }));
  }

  for (const definition of definitions) {
    const eventId = events[definition.key].id;
    for (const identityKey of [
      'reviewer-a',
      'reviewer-b',
      definition.organizer,
    ]) {
      try {
        await call('createEventGrant', {
          token: admin.token,
          body: { eventId, memberId: memberFor(identityKey) },
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
      }
    }
  }

  const allowed = {
    'event-manager': ['a', 'b'],
    'reviewer-a': ['a', 'b'],
    'reviewer-b': ['a', 'b'],
    'organizer-a': ['a'],
    'organizer-b': ['b'],
  };
  for (const [identityKey, eventKeys] of Object.entries(allowed))
    for (const definition of definitions) {
      const shouldAllow = eventKeys.includes(definition.key);
      try {
        await call('getEventScope', {
          token: sessions[identityKey],
          path: { id: events[definition.key].id },
        });
        if (!shouldAllow)
          throw new Error('Cross-event access unexpectedly allowed');
      } catch (error) {
        if (shouldAllow || !(error instanceof ApiError) || error.status !== 403)
          throw error;
      }
    }

  const managerEvents = await call('listEvents', { token: managerToken });
  for (const event of Object.values(events))
    if (!managerEvents.some((candidate) => candidate.id === event.id))
      throw new Error('Manager event list missing prepared event');
  const manifest = {
    preparedAt: new Date().toISOString(),
    events: Object.fromEntries(
      definitions.map((definition) => {
        const event = events[definition.key];
        return [
          definition.key,
          {
            id: event.id,
            name: event.name,
            organizerIdentity: definition.organizer,
            managerView: `${webBase}/materials?event=${event.id}`,
            api: `${apiBase}/api/v1/events/${event.id}`,
          },
        ];
      }),
    ),
  };
  if (!saved)
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  else if (
    saved.events?.a?.id !== manifest.events.a.id ||
    saved.events?.b?.id !== manifest.events.b.id
  )
    throw new Error('Existing manifest must not be overwritten');

  console.log(
    'Local test events are ready and verified through protected APIs.',
  );
  console.log(`A: ${manifest.events.a.managerView}`);
  console.log(`B: ${manifest.events.b.managerView}`);
  console.log(
    'This command did not create or update material tasks; organizer/reviewer business event lists remain task-dependent.',
  );

  for (const token of [...Object.values(sessions), admin.token])
    await call('logout', { token }).catch(() => {});
  await rm(adminFile, { force: true });
}

main().catch(() => {
  console.error(
    `Local event preparation failed at ${stage}; no credential or response body printed. Existing data was not overwritten or cleaned up.`,
  );
  process.exitCode = 1;
});

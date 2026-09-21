import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { eventSuppliesBrowserTest } from './event-supplies-browser.integration.mjs';

export async function eventSuppliesIntegration(t, context) {
  const { base, tokens, users, members, sql, runtime, session } = context;
  for (const key of ['super', 'manager', 'a', 'b'])
    await session(key, users[key]);

  async function call(key, method, route, body, status = 200) {
    const response = await fetch(`${base}/api/v1/${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[key]}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(
      response.status,
      status,
      `${key} ${method} ${route}: ${JSON.stringify(result)}`,
    );
    return result;
  }

  const appointment = (
    await sql.query(
      'SELECT "eventId" FROM "EventOrganizerAppointment" WHERE "organizationId"=(SELECT "organizationId" FROM "OrganizationMember" WHERE id=$1) AND active=true LIMIT 1',
      [members.a],
    )
  ).rows[0];
  assert.ok(appointment);
  const eventId = appointment.eventId;
  await sql.query(
    'INSERT INTO "EventGrant" (id,"eventId","memberId",active) VALUES ($1,$2,$3,true) ON CONFLICT ("eventId","memberId") DO UPDATE SET active=true',
    [randomUUID(), eventId, members.manager],
  );

  await t.test(
    'competition event picker matches the event-operation permission scope',
    async () => {
      const [superEvents, managerEvents, organizerEvents, outsideEvents] =
        await Promise.all([
          call('super', 'GET', 'competition-events'),
          call('manager', 'GET', 'competition-events'),
          call('a', 'GET', 'competition-events'),
          call('b', 'GET', 'competition-events'),
        ]);
      for (const events of [superEvents, managerEvents, organizerEvents])
        assert.ok(events.some((event) => event.id === eventId));
      assert.ok(!outsideEvents.some((event) => event.id === eventId));
    },
  );

  let item;
  await t.test(
    'event supplies: organizer writes while headquarters only tracks and events stay isolated',
    async () => {
      const body = {
        id: randomUUID(),
        name: '比赛用球',
        quantity: 12,
        notes: '合成测试物料',
      };
      item = await call('a', 'POST', `events/${eventId}/supplies`, body);
      assert.equal(item.status, 'TO_PREPARE');
      assert.equal(
        (await call('a', 'POST', `events/${eventId}/supplies`, body)).id,
        item.id,
      );
      assert.equal(
        (await call('super', 'GET', `events/${eventId}/supplies`))[0].name,
        body.name,
      );
      await call(
        'super',
        'POST',
        `events/${eventId}/supplies`,
        { ...body, id: randomUUID() },
        403,
      );
      await call('manager', 'GET', `events/${eventId}/supplies`);
      await call(
        'manager',
        'PUT',
        `events/${eventId}/supplies/${item.id}`,
        {
          expectedRevision: 1,
          name: body.name,
          quantity: 12,
          notes: '',
          status: 'READY',
        },
        403,
      );
      await call('b', 'GET', `events/${eventId}/supplies`, undefined, 403);
      await call(
        'a',
        'GET',
        `events/${randomUUID()}/supplies/${item.id}/history`,
        undefined,
        403,
      );
    },
  );

  await t.test(
    'event supplies: CAS status tracking and immutable history',
    async () => {
      item = await call('a', 'PUT', `events/${eventId}/supplies/${item.id}`, {
        expectedRevision: item.revision,
        name: item.name,
        quantity: item.quantity,
        notes: item.notes,
        status: 'PREPARING',
      });
      assert.equal(item.revision, 2);
      await call(
        'a',
        'PUT',
        `events/${eventId}/supplies/${item.id}`,
        {
          expectedRevision: 1,
          name: item.name,
          quantity: item.quantity,
          notes: item.notes,
          status: 'READY',
        },
        409,
      );
      const history = await call(
        'super',
        'GET',
        `events/${eventId}/supplies/${item.id}/history`,
      );
      assert.deepEqual(
        history.map((entry) => entry.action),
        ['CREATED', 'UPDATED'],
      );
      await assert.rejects(
        runtime.query(
          'UPDATE "EventSupplyHistory" SET action=\'tampered\' WHERE "itemId"=$1',
          [item.id],
        ),
      );
    },
  );

  await t.test(
    'event supplies: private photo upload, verification, download and removal',
    async () => {
      const bytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      );
      const photo = await call(
        'a',
        'POST',
        `events/${eventId}/supplies/${item.id}/photos`,
        {
          id: randomUUID(),
          originalName: '比赛用球.png',
          extension: 'png',
          expectedBytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      );
      await call(
        'a',
        'POST',
        `events/${eventId}/supplies/${item.id}/photos`,
        {
          id: photo.id,
          originalName: '冲突照片.png',
          extension: 'png',
          expectedBytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        409,
      );
      const uploaded = await fetch(
        `${base}/api/v1/event-supply-photos/${photo.id}/content`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${tokens.a}`,
            'Content-Type': 'application/octet-stream',
          },
          body: bytes,
        },
      );
      assert.equal(uploaded.status, 200, await uploaded.text());
      await call('a', 'POST', `event-supply-photos/${photo.id}/confirm`, {
        expectedRevision: item.revision,
      });
      item = (await call('super', 'GET', `events/${eventId}/supplies`))[0];
      assert.equal(item.revision, 3);
      assert.equal(item.photos[0].state, 'CONFIRMED');
      const downloaded = await fetch(
        `${base}/api/v1/event-supply-photos/${photo.id}/content`,
        { headers: { Authorization: `Bearer ${tokens.super}` } },
      );
      assert.equal(downloaded.status, 200);
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
      await eventSuppliesBrowserTest({
        ...context,
        eventId,
        itemName: item.name,
      });
      await call('a', 'POST', `event-supply-photos/${photo.id}/remove`, {
        expectedRevision: item.revision,
      });
      item = (await call('super', 'GET', `events/${eventId}/supplies`))[0];
      assert.equal(item.revision, 4);
      assert.equal(item.photos.length, 0);
      assert.equal(
        (
          await fetch(
            `${base}/api/v1/event-supply-photos/${photo.id}/content`,
            {
              headers: { Authorization: `Bearer ${tokens.super}` },
            },
          )
        ).status,
        403,
      );
      assert.deepEqual(
        (
          await call(
            'super',
            'GET',
            `events/${eventId}/supplies/${item.id}/history`,
          )
        ).map((entry) => entry.action),
        ['CREATED', 'UPDATED', 'PHOTO_ADDED', 'PHOTO_REMOVED'],
      );
    },
  );

  await t.test(
    'event supplies: current grants are enforced on every request',
    async () => {
      await sql.query(
        'UPDATE "HostingApplicationHandlerGrant" SET active=false WHERE "memberId"=$1',
        [members.a],
      );
      await call('a', 'GET', `events/${eventId}/supplies`, undefined, 403);
      await sql.query(
        'UPDATE "HostingApplicationHandlerGrant" SET active=true WHERE "memberId"=$1',
        [members.a],
      );
      await call('a', 'GET', `events/${eventId}/supplies`);
    },
  );
}

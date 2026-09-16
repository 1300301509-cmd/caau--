import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient, type RequestOptions } from '@caau/api-client';
import { createTaroTransport } from '@caau/api-client/taro';
import appConfig from '../src/app.config';
import {
  individualMaxBytes,
  isAllowedIndividualFile,
  isPreviewImage,
  materialActionLabel,
  materialStateLabel,
  safeLocalName,
} from '../src/features/individuals/platform';
import {
  eventScopedPageUrl,
  resolveEventId,
} from '../src/features/materials/event-context';

test('miniapp uses the business dashboard and two material submodules without a tab bar', () => {
  assert.equal(appConfig.pages[0], 'pages/home/index');
  assert.ok(appConfig.pages.includes('pages/materials/index'));
  assert.ok(appConfig.pages.includes('pages/progress/index'));
  assert.equal('tabBar' in appConfig, false);
  assert.ok(
    !appConfig.pages.some((page) => /pages\/(todo|events)\//.test(page)),
  );
  assert.equal(appConfig.window.navigationBarTitleText, 'CAAU 承办工作台');
});

test('event context resolves only authorized rows and scopes submodule URLs', () => {
  const events = [{ id: 'event-a' }, { id: 'event-b' }];
  assert.equal(resolveEventId(events, 'event-b'), 'event-b');
  assert.equal(resolveEventId(events, 'event-outside-scope'), 'event-a');
  assert.equal(resolveEventId([], 'event-outside-scope'), '');
  assert.equal(
    eventScopedPageUrl('materials', 'event/a'),
    '/pages/materials/index?event=event%2Fa',
  );
  assert.equal(
    eventScopedPageUrl('progress', 'event-b'),
    '/pages/progress/index?event=event-b',
  );
});

test('miniapp individual labels and private file constraints are explicit', () => {
  assert.equal(materialStateLabel('RETURNED'), '退回修改');
  assert.equal(materialActionLabel('APPROVE'), '审核通过');
  assert.equal(individualMaxBytes, 10 * 1024 * 1024);
  assert.equal(isAllowedIndividualFile('材料.PDF'), true);
  assert.equal(isAllowedIndividualFile('image.jpeg'), true);
  assert.equal(isAllowedIndividualFile('script.js'), false);
  assert.equal(isPreviewImage('photo.JPG'), true);
  assert.equal(isPreviewImage('report.pdf'), false);
  assert.equal(safeLocalName('../危险/附件?.pdf'), '.._危险_附件_.pdf');
  assert.equal(safeLocalName('\u0000'), '_');
  assert.equal(safeLocalName('   '), '材料附件');
});

test('Taro transport keeps bearer out of URL and carries upload/download bytes', async () => {
  const calls: RequestOptions[] = [];
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const client = createApiClient(
    'https://example.invalid',
    createTaroTransport(async (options) => {
      calls.push(options);
      if (options.responseType === 'arraybuffer')
        return { statusCode: 200, data: bytes };
      if (options.url.endsWith('/content') && options.method === 'POST')
        return {
          statusCode: 200,
          data: {
            id: '10000000-0000-4000-8000-000000000001',
            originalName: '材料.pdf',
            extension: 'pdf',
            expectedBytes: 3,
            confirmed: false,
          },
        };
      throw new Error(`Unexpected ${options.method} ${options.url}`);
    }),
  );
  await client.request('uploadIndividualContent', {
    token: 'x'.repeat(43),
    path: { id: '10000000-0000-4000-8000-000000000001' },
    body: bytes,
  });
  assert.deepEqual(
    await client.request('downloadIndividualContent', {
      token: 'x'.repeat(43),
      path: { id: '10000000-0000-4000-8000-000000000001' },
    }),
    bytes,
  );
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => !call.url.includes('x'.repeat(43))));
  assert.ok(
    calls.every(
      (call) => call.header?.Authorization === `Bearer ${'x'.repeat(43)}`,
    ),
  );
  assert.equal(calls[0]!.data, bytes);
  assert.equal(calls[1]!.responseType, 'arraybuffer');
});

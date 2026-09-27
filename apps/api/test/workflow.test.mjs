import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, verifyFile } from '../dist/modules/workflow/private-store.js';

test('private file verification rejects byte/hash mismatch, non-UTF8 and invalid format features', () => {
  const bytes = Buffer.from('synthetic text');
  assert.doesNotThrow(() =>
    verifyFile(bytes, 'txt', bytes.length, digest(bytes)),
  );
  assert.throws(() =>
    verifyFile(bytes, 'txt', bytes.length + 1, digest(bytes)),
  );
  assert.throws(() => verifyFile(bytes, 'txt', bytes.length, '0'.repeat(64)));
  for (const data of [Buffer.from([255, 255]), Buffer.from('text\0payload')])
    assert.throws(() => verifyFile(data, 'txt', data.length, digest(data)));
  for (const extension of ['pdf', 'png', 'jpg', 'jpeg', 'docx'])
    assert.throws(() =>
      verifyFile(bytes, extension, bytes.length, digest(bytes)),
    );
  const incomplete = Buffer.from('%PDF-1.7\nincomplete');
  assert.throws(() =>
    verifyFile(incomplete, 'pdf', incomplete.length, digest(incomplete)),
  );
});

test('private JPEG verification accepts a short trailer after the image end marker', () => {
  const image = Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]);
  const withTrailer = Buffer.concat([image, Buffer.alloc(24, 0xa5)]);
  assert.doesNotThrow(() =>
    verifyFile(withTrailer, 'jpg', withTrailer.length, digest(withTrailer)),
  );
  const oversizedTrailer = Buffer.concat([image, Buffer.alloc(33, 0xa5)]);
  assert.throws(() =>
    verifyFile(
      oversizedTrailer,
      'jpeg',
      oversizedTrailer.length,
      digest(oversizedTrailer),
    ),
  );
});

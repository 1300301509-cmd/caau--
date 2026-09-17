import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  hashPassword,
  passwordPolicy,
  validPassword,
  verifyPassword,
} from '../dist/password.js';

test('scrypt password records are salted, versioned and never contain plaintext', async () => {
  const password = `Synthetic-${randomUUID()}!`;
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^\$scrypt\$v=1\$N=131072\$r=8\$p=1\$/);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password + 'wrong', first), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
});

test('password policy bounds characters and UTF-8 resource use', () => {
  assert.equal(validPassword('x'.repeat(passwordPolicy.minCharacters)), true);
  assert.equal(
    validPassword('x'.repeat(passwordPolicy.minCharacters - 1)),
    false,
  );
  assert.equal(
    validPassword('x'.repeat(passwordPolicy.maxCharacters + 1)),
    false,
  );
  assert.equal(validPassword('密'.repeat(passwordPolicy.maxCharacters)), true);
  assert.equal(validPassword('🙂'.repeat(passwordPolicy.maxCharacters)), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safeFilename,
  downloadDisposition,
} from '../dist/modules/workflow/filename.js';
test('original filename is display-only, path/control/bidi safe with the validated extension', () => {
  assert.equal(safeFilename('../../报告\r\n.exe', 'pdf'), '报告.pdf');
  assert.equal(
    safeFilename('C:\\private\\安全方案.PDF', 'pdf'),
    '安全方案.pdf',
  );
  assert.equal(safeFilename('CON.txt', 'txt'), 'file-CON.txt');
  assert.equal(safeFilename('.hidden\u202Egnp.exe', 'txt'), 'hiddengnp.txt');
  assert.equal(safeFilename(undefined, 'txt'), null);
  assert.throws(() => safeFilename({}, 'pdf'));
  assert.throws(() => safeFilename('x'.repeat(1025), 'pdf'));
  for (const value of [
    '\ud800bad.txt',
    '方案'.repeat(200) + '.txt',
    '报告\r\nX-Evil: yes.txt',
  ]) {
    const name = safeFilename(value, 'txt');
    assert.ok(name.length <= 180);
    assert.ok(name.endsWith('.txt'));
    assert.ok(!/[\r\n/\\]/.test(name));
    const header = downloadDisposition(name, 'txt');
    assert.ok(!/[\r\n]/.test(header));
    assert.ok(
      header.startsWith(
        'attachment; filename="material.txt"; filename*=UTF-8\'\'',
      ),
    );
    assert.equal(decodeURIComponent(header.split("UTF-8''")[1]), name);
  }
});

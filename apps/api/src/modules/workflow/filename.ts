import { BadRequestException } from '@nestjs/common';
// Display/header metadata only. PrivateStore continues to use server-generated UUID keys.
export function safeFilename(input: unknown, extension: string): string | null {
  if (input === undefined) return null;
  if (typeof input !== 'string' || input.length > 1024)
    throw new BadRequestException('Invalid original filename');
  const leaf =
    input
      .replace(/[\uD800-\uDFFF]/gu, '_')
      .normalize('NFC')
      .split(/[\\/]/)
      .pop() ?? '';
  let base = Array.from(leaf)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
    .replace(
      /[\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,
      '',
    )
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  const dot = base.lastIndexOf('.');
  if (dot > 0) base = base.slice(0, dot);
  base = base.replace(/^[. ]+/, '').replace(/[. ]+$/, '');
  if (!base) base = 'material';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))
    base = 'file-' + base;
  // Limit Unicode codepoints without splitting surrogate pairs; bounded DB/header length.
  base = Array.from(base).slice(0, 70).join('');
  return `${base}.${extension}`;
}
export function downloadDisposition(name: string, extension: string) {
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="material.${extension}"; filename*=UTF-8''${encoded}`;
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import { constants } from 'node:fs';
import { mkdir, lstat, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_EXTENSIONS = ['txt', 'pdf', 'png', 'jpg', 'jpeg'];
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const MAX_JPEG_TRAILER_BYTES = 32;
export const digest = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
export function verifyFile(
  bytes: Buffer,
  extension: string,
  expectedBytes: number,
  sha256: string,
) {
  if (bytes.length !== expectedBytes || digest(bytes) !== sha256)
    throw new BadRequestException('File size or checksum mismatch');
  let valid = false;
  if (extension === 'txt') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      valid = !text.includes('\0');
    } catch {
      valid = false;
    }
  }
  if (extension === 'pdf')
    valid =
      bytes.subarray(0, 5).toString() === '%PDF-' &&
      bytes.subarray(-32).toString().trimEnd().endsWith('%%EOF');
  if (extension === 'png')
    valid =
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes
        .subarray(-8)
        .equals(Buffer.from([73, 69, 78, 68, 174, 66, 96, 130]));
  if (extension === 'jpg' || extension === 'jpeg') {
    const endOfImage = bytes.lastIndexOf(JPEG_EOI);
    valid =
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      endOfImage >= 2 &&
      bytes.length - endOfImage - JPEG_EOI.length <= MAX_JPEG_TRAILER_BYTES;
  }
  if (!valid)
    throw new BadRequestException('Unsupported or invalid file format');
}
export class PrivateStore {
  readonly root: string;
  constructor(root?: string) {
    this.root = path.resolve(
      root ??
        fileURLToPath(new URL('../../../../../.local/files/', import.meta.url)),
    );
  }
  private location(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key))
      throw new BadRequestException('Invalid object key');
    return path.join(this.root, key);
  }
  async put(key: string, request: IncomingMessage, maximum: number) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new Error('Unsafe file root');
    let file;
    try {
      file = await open(
        this.location(key),
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new ConflictException(
          'Object already received; confirm it or create a new intent',
        );
      throw error;
    }
    const timer = setTimeout(
      () => request.destroy(new Error('Upload timeout')),
      10000,
    );
    let completed = false;
    try {
      let bytes = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as string);
        bytes += buffer.length;
        if (bytes > maximum || bytes > MAX_FILE_BYTES)
          throw new BadRequestException('Upload exceeds declared byte limit');
        await file.writeFile(buffer);
      }
      if (bytes !== maximum) throw new BadRequestException('Incomplete upload');
      await file.sync();
      completed = true;
    } finally {
      clearTimeout(timer);
      await file.close();
      if (!completed) await unlink(this.location(key)).catch(() => {});
    }
  }
  async read(key: string) {
    if ((await lstat(this.root)).isSymbolicLink())
      throw new Error('Unsafe file root');
    const file = await open(
      this.location(key),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES)
        throw new Error('Invalid private object');
      return await file.readFile();
    } finally {
      await file.close();
    }
  }
}

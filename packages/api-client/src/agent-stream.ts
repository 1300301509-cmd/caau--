import { operations as wire } from './generated/operations.js';
import type { operations } from './generated/schema.js';
import { ApiError, isAgentReply } from './index.js';

export type AgentStreamInput =
  operations['streamAgentMessage']['requestBody']['content']['application/json'];
export type AgentStreamReply =
  operations['sendAgentMessage']['responses'][200]['content']['application/json'];
export const agentStreamPath = (sessionId: string) =>
  wire.streamAgentMessage.path.replace(
    '{sessionId}',
    encodeURIComponent(sessionId),
  );

export class AgentStreamInterruptedError extends Error {
  constructor() {
    super('流式回复中断；请刷新会话核对结果');
    this.name = 'AgentStreamInterruptedError';
  }
}

type AgentStreamEvent =
  | { type: 'phase'; value: 'WORKING' }
  | { type: 'delta'; text: string }
  | { type: 'result'; reply: AgentStreamReply }
  | { type: 'error'; status: number };

// wx.request chunks may split a UTF-8 character or a JSON line. Decode both
// incrementally without relying on TextDecoder in the WeChat JS runtime.
function decodeUtf8(bytes: number[], final: boolean) {
  let result = '';
  let cursor = 0;
  while (cursor < bytes.length) {
    const first = bytes[cursor]!;
    const length =
      first < 0x80
        ? 1
        : first >= 0xc2 && first < 0xe0
          ? 2
          : first >= 0xe0 && first < 0xf0
            ? 3
            : first >= 0xf0 && first < 0xf5
              ? 4
              : 0;
    if (!length) throw new Error('流式回复编码无效');
    if (cursor + length > bytes.length) {
      if (!final) break;
      throw new Error('流式回复编码不完整');
    }
    let point =
      first &
      (length === 1 ? 0x7f : length === 2 ? 0x1f : length === 3 ? 0x0f : 0x07);
    for (let i = 1; i < length; i++) {
      const part = bytes[cursor + i]!;
      if ((part & 0xc0) !== 0x80) throw new Error('流式回复编码无效');
      point = (point << 6) | (part & 0x3f);
    }
    if (
      (length === 2 && point < 0x80) ||
      (length === 3 && point < 0x800) ||
      (length === 4 && point < 0x10000) ||
      (point >= 0xd800 && point <= 0xdfff) ||
      point > 0x10ffff
    )
      throw new Error('流式回复编码无效');
    result += String.fromCodePoint(point);
    cursor += length;
  }
  bytes.splice(0, cursor);
  return result;
}

export function createAgentStreamDecoder(onDelta: (text: string) => void) {
  const bytes: number[] = [];
  let lineBuffer = '';
  let reply: AgentStreamReply | undefined;
  let terminal = false;
  const readLine = (line: string) => {
    if (!line) return;
    if (terminal) throw new Error('流式回复在结束后仍有数据');
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== 'object' || !('type' in value))
      throw new Error('流式回复格式无效');
    const event = value as AgentStreamEvent;
    if (event.type === 'phase' && event.value === 'WORKING') return;
    if (event.type === 'delta' && typeof event.text === 'string') {
      onDelta(event.text);
      return;
    }
    if (event.type === 'result' && isAgentReply(event.reply)) {
      reply = event.reply;
      terminal = true;
      return;
    }
    if (
      event.type === 'error' &&
      Number.isInteger(event.status) &&
      event.status >= 400 &&
      event.status <= 599
    ) {
      terminal = true;
      throw new ApiError(event.status);
    }
    throw new Error('流式回复格式无效');
  };
  const readLines = () => {
    if (lineBuffer.length > 2_000_000) throw new Error('流式回复过长');
    let end = lineBuffer.indexOf('\n');
    while (end !== -1) {
      readLine(lineBuffer.slice(0, end).replace(/\r$/, ''));
      lineBuffer = lineBuffer.slice(end + 1);
      end = lineBuffer.indexOf('\n');
    }
  };
  return {
    push(chunk: ArrayBuffer | Uint8Array) {
      for (const byte of new Uint8Array(chunk)) bytes.push(byte);
      lineBuffer += decodeUtf8(bytes, false);
      readLines();
    },
    finish(): AgentStreamReply {
      lineBuffer += decodeUtf8(bytes, true);
      readLines();
      if (lineBuffer.trim()) readLine(lineBuffer.trim());
      if (!reply) throw new AgentStreamInterruptedError();
      return reply;
    },
  };
}

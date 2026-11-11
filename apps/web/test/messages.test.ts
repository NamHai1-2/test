import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MESSAGES, formatMessage, isMsgCode } from '../src/lib/messages';

// The API file is the single source of truth (apps/api/src/lib/messages.ts). The web copy must say the same.
const apiMessagesFile = fileURLToPath(new URL('../../api/src/lib/messages.ts', import.meta.url));

function readApiTexts(): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const line of readFileSync(apiMessagesFile, 'utf8').split('\n')) {
    const match = line.match(/^\s+(MSG\d{2}): \{.*? text: '((?:[^'\\]|\\.)*)'/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      texts[match[1]] = match[2].replace(/\\(.)/g, '$1');
    }
  }
  return texts;
}

describe('messages', () => {
  it('has MSG01 to MSG41, each with a text', () => {
    const codes = Object.keys(MESSAGES);
    expect(codes).toHaveLength(41);
    codes.forEach((code, index) => {
      expect(code).toBe(`MSG${String(index + 1).padStart(2, '0')}`);
      expect(MESSAGES[code as keyof typeof MESSAGES].length).toBeGreaterThan(0);
    });
  });

  it.skipIf(!existsSync(apiMessagesFile))('matches apps/api/src/lib/messages.ts word for word', () => {
    expect(MESSAGES).toEqual(readApiTexts());
  });

  it('fills placeholders and leaves unknown ones alone', () => {
    expect(formatMessage('MSG07', { points: 500, new_balance: '1,200' })).toBe(
      'Successfully redeemed 500 points. New balance: 1,200.',
    );
    expect(formatMessage('MSG06', { points: 10 })).toBe(
      'Successfully issued 10 points to customer {customer_code}.',
    );
    expect(formatMessage('MSG03')).toBe(MESSAGES.MSG03);
  });

  it('recognises message codes', () => {
    expect(isMsgCode('MSG35')).toBe(true);
    expect(isMsgCode('MSG99')).toBe(false);
    expect(isMsgCode('toString')).toBe(false);
  });
});

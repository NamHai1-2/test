import { describe, expect, it } from 'vitest';
import { formatDateTime, formatNumber, initials, shortenMiddle, titleCase } from '../src/lib/format';
import { isValidPassword } from '../src/lib/password-policy';

describe('format', () => {
  it('shows UTC timestamps in business time (UTC+7)', () => {
    expect(formatDateTime('2026-11-08T07:13:00.000Z')).toBe('08 Nov 2026, 14:13');
  });

  it('rolls over the date at 17:00 UTC and shows midnight as 00:00', () => {
    expect(formatDateTime('2026-11-07T17:00:00.000Z')).toBe('08 Nov 2026, 00:00');
    expect(formatDateTime('2026-11-07T16:59:00.000Z')).toBe('07 Nov 2026, 23:59');
  });

  it('returns text that is not a date unchanged', () => {
    expect(formatDateTime('not a date')).toBe('not a date');
  });

  it('puts thousands separators in numbers', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0)).toBe('0');
  });

  it('shortens long identifiers in the middle', () => {
    expect(shortenMiddle('Ab3dEfGhIjKlMnOpQrStUvWxYz')).toBe('Ab3dEf…WxYz');
    expect(shortenMiddle('short')).toBe('short');
  });

  it('builds initials and title case labels', () => {
    expect(initials('Mai Nguyen Nam Hai')).toBe('MH');
    expect(initials('  admin ')).toBe('A');
    expect(initials('')).toBe('?');
    expect(titleCase('PENDING_ANCHOR')).toBe('Pending anchor');
  });
});

describe('password policy (CR-08, same rule as the API)', () => {
  it('accepts 8-64 characters with a letter and a digit', () => {
    expect(isValidPassword('Passw0rd1')).toBe(true);
    expect(isValidPassword('a'.repeat(63) + '1')).toBe(true);
  });

  it('rejects short, long, letter-only, digit-only and email-equal passwords', () => {
    expect(isValidPassword('Abc123')).toBe(false);
    expect(isValidPassword('a'.repeat(64) + '1')).toBe(false);
    expect(isValidPassword('abcdefghij')).toBe(false);
    expect(isValidPassword('1234567890')).toBe(false);
    expect(isValidPassword('Owner123@x.io', 'owner123@x.io')).toBe(false);
  });
});

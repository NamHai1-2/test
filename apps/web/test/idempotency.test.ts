import { describe, expect, it } from 'vitest';
import { createKeyRing } from '../src/lib/idempotency';

describe('idempotency keys (BR-10)', () => {
  function ring() {
    let n = 0;
    return createKeyRing(() => `key-${(n += 1)}`);
  }

  it('reuses the key for the same request, so a double click or retry is applied once', () => {
    const keys = ring();
    const first = keys.keyFor('issue:CUS001:100000');
    expect(keys.keyFor('issue:CUS001:100000')).toBe(first);
  });

  it('uses a new key for a different request (same key + other body would be MSG34)', () => {
    const keys = ring();
    const first = keys.keyFor('issue:CUS001:100000');
    const second = keys.keyFor('issue:CUS001:200000');
    expect(second).not.toBe(first);
    expect(keys.keyFor('issue:CUS002:200000')).not.toBe(second);
  });

  it('uses a new key after a success', () => {
    const keys = ring();
    const first = keys.keyFor('redeem:CUS001:60');
    keys.reset();
    expect(keys.keyFor('redeem:CUS001:60')).not.toBe(first);
  });

  it('generates real random keys by default', () => {
    const a = createKeyRing().keyFor('x');
    const b = createKeyRing().keyFor('x');
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(15);
  });
});

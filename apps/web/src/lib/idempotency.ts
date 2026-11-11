import { useRef } from 'react';

/** New random key for one submission (api-spec: X-Idempotency-Key, 1-128 characters). */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export interface KeyRing {
  keyFor: (fingerprint: string) => string;
  reset: () => void;
}

/**
 * One idempotency key per submission (BR-10). Asking again for the same request (a double click, a retry after
 * a lost answer) returns the same key, so the server never applies it twice. A different request gets a new
 * key, because the same key with another body is MSG34. Call `reset()` after a success.
 */
export function createKeyRing(generate: () => string = newIdempotencyKey): KeyRing {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(fingerprint) {
      if (current?.fingerprint !== fingerprint) current = { fingerprint, key: generate() };
      return current.key;
    },
    reset() {
      current = null;
    },
  };
}

/** React hook around `createKeyRing`: the ring lives as long as the component. */
export function useIdempotencyKey(): KeyRing {
  const ring = useRef<KeyRing | null>(null);
  if (ring.current === null) ring.current = createKeyRing();
  return ring.current;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from './api-error';
import { MESSAGES } from './messages';

export interface ApiState<T> {
  /** Last successful result. It stays while the next one loads, so tables do not flash empty. */
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs `fetcher` on mount and whenever one of `deps` changes (filters, page). A slow answer for old
 * deps never overwrites a newer one. MSG35 is already handled by the api-client (redirect to /login).
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: readonly unknown[]): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (!current) return;
        setData(result);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (!current) return;
        setError(caught instanceof ApiError ? caught : new ApiError('MSG23', 0, MESSAGES.MSG23));
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [...deps, tick]);

  return { data, error, loading, reload: () => setTick((value) => value + 1) };
}

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe, logout as apiLogout } from './api-client';
import type { MeResponse } from './api-types';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: MeResponse };

interface AuthContextValue {
  state: AuthState;
  /** Reloads the profile after login or a profile change. */
  refresh: () => Promise<void>;
  /** Ends the session on the server, then clears local state. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const refresh = useCallback(async () => {
    try {
      setState({ status: 'authenticated', user: await getMe() });
    } catch {
      // MSG35 already redirected to /login inside the api-client; any other error also means "no usable session".
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ state, refresh, signOut }), [state, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

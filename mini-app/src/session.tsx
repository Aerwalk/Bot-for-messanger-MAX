import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { resolveSession, ApiError, getUserId } from './api';
import { isInMax, enableClosingConfirmation, attachBackButton } from './bridge';
import type { UserProfile } from '@sport-nearby/shared';

interface Session {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const Ctx = createContext<Session>({ user: null, loading: true, error: null, retry: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    enableClosingConfirmation();
    setLoading(true);
    setError(null);
    resolveSession()
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setUser(null);
        setError(e instanceof ApiError ? e.message : 'Не удалось инициализировать сессию');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const retry = useCallback(() => setTick((x) => x + 1), []);

  const value = useMemo(() => ({ user, loading, error, retry }), [user, loading, error, retry]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}

export function useMaxNavigation() {
  useEffect(() => {
    if (!isInMax) return;
    return attachBackButton(() => { window.history.back(); });
  }, []);
}

export function useUserId(): string {
  return getUserId() ?? 'demo-user';
}

/** Экраны, в которых не показывается нижний таббар (карточка/регистрация/подтверждение). */
export function isDetailPath(pathname: string) {
  return /^\/(activity|success)/.test(pathname);
}
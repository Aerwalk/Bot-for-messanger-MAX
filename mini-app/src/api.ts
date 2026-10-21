import type { UserProfile } from '@sport-nearby/shared';
import { getInitData } from './bridge';

const USER_KEY = 'sport-nearby:userId';
const DEMO_HTTP = 'x-user-id';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let currentUserId: string | null = null;
let resolved = false;

export function getUserId(): string | null {
  return currentUserId;
}

function readLocalUserId(): string | null {
  try { return localStorage.getItem(USER_KEY); } catch { return null; }
}

function saveLocalUserId(id: string) {
  try { localStorage.setItem(USER_KEY, id); } catch { /* ignore */ }
}

export async function resolveSession(): Promise<UserProfile> {
  if (resolved) {
    throw new ApiError(500, 'INTERNAL', 'Сессия уже инициализирована');
  }
  const initData = getInitData();
  const body: Record<string, string> = {};
  if (initData) body.initData = initData;

  const res = await fetch('/api/me', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [DEMO_HTTP]: readLocalUserId() ?? '' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ApiError(res.status, err?.error?.code ?? 'INTERNAL', err?.error?.message ?? 'Не удалось определить пользователя');
  }
  const data = (await res.json()) as { user: UserProfile; demo: boolean };
  currentUserId = data.user.id;
  saveLocalUserId(data.user.id);
  resolved = true;
  return data.user;
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (currentUserId) headers.set(DEMO_HTTP, String(currentUserId));

  // если сессия ещё не разрешена, пробуем без user-id — использует demo-режим на сервере
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет соединения с сервером');
  }
  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const errBody = data as { error?: { code?: string; message?: string } } | null;
    const code = errBody?.error?.code ?? 'UNKNOWN';
    const message = errBody?.error?.message ?? `Ошибка запроса (${res.status})`;
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

export function track(name: string, payload?: Record<string, unknown>) {
  request('/api/events', {
    method: 'POST',
    body: JSON.stringify({ name, payload }),
  }).catch(() => {});
}
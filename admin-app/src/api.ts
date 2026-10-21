export interface OrganizerInfo {
  id: string;
  login: string;
  name: string;
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  city: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  description: string;
  source?: string;
  sourceUpdatedAt?: string;
}

export interface SportRef {
  id: string;
  name: string;
  emoji: string;
}

export interface Coach {
  id: string;
  organizerId?: string;
  name: string;
  sportId?: string;
  bio?: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  facilityId: string;
  sportId: string;
  type: string;
  title: string;
  description: string;
  ageCategory: string;
  skillLevel: string;
  price: number;
  priceNote: string;
  organizer: string;
  contact: string;
  status: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityRow {
  activity: Activity;
  facility: Partial<Facility>;
  sport: SportRef;
}

export interface Slot {
  id: string;
  activityId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  registeredCount: number;
  status: string;
  coach: string;
  coachId?: string;
  durationMin: number;
}

export interface Registration {
  id: string;
  userId: string;
  slotId: string;
  name: string;
  phone?: string;
  status: string;
  createdAt: string;
  canceledAt?: string;
}

export interface RegistrationRating {
  id: string;
  userId: string;
  slotId: string;
  activityId: string;
  coachId?: string;
  coachName: string;
  activityScore: number;
  coachScore?: number;
  comment?: string;
  createdAt: string;
}

export interface RegistrationView {
  registration: Registration;
  slot: Slot;
  activity: Activity;
  facility: Partial<Facility>;
  sport: SportRef;
  rating?: RegistrationRating;
}

const TOKEN_KEY = 'sport-admin-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api/admin${path}`, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) {
    let msg = `Ошибка (${res.status})`;
    try {
      const body = await res.json();
      msg = body?.error?.message ?? body?.detail ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (login: string, password: string) =>
    call<{ token: string; organizer: OrganizerInfo }>('/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    }),
  me: () => call<{ organizer: OrganizerInfo }>('/me'),
  activities: () => call<{ items: ActivityRow[]; count: number }>('/activities'),
  createActivity: (data: Partial<Activity>) =>
    call<ActivityRow>('/activities', { method: 'POST', body: JSON.stringify(data) }),
  updateActivity: (id: string, data: Partial<Activity>) =>
    call<ActivityRow>(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteActivity: (id: string) => call<{ ok: true }>(`/activities/${id}`, { method: 'DELETE' }),
  slots: (activityId: string) => call<{ items: Slot[] }>(`/activities/${activityId}/slots`),
  createSlot: (activityId: string, data: Partial<Slot>) =>
    call<Slot>(`/activities/${activityId}/slots`, { method: 'POST', body: JSON.stringify(data) }),
  deleteSlot: (slotId: string) => call<{ ok: true }>(`/slots/${slotId}`, { method: 'DELETE' }),
  facilities: () => call<{ items: Facility[] }>('/facilities'),
  sports: () => call<{ items: SportRef[] }>('/sports'),
  createSport: (data: { name: string; emoji: string }) =>
    call<SportRef>('/sports', { method: 'POST', body: JSON.stringify(data) }),
  createFacility: (data: Partial<Facility & { type: string; city: string; description: string }>) =>
    call<Facility>('/facilities', { method: 'POST', body: JSON.stringify(data) }),
  coaches: () => call<{ items: Coach[]; count: number }>('/coaches'),
  createCoach: (data: { name: string; sportId?: string; bio?: string }) =>
    call<Coach>('/coaches', { method: 'POST', body: JSON.stringify(data) }),
  registrations: (activityId?: string) =>
    call<{ items: RegistrationView[]; count?: number }>(
      activityId ? `/activities/${activityId}/registrations` : '/registrations',
    ),
};
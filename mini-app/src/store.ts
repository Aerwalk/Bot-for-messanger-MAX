export interface SearchPrefs {
  sportIds: string[];
  day: string;
  timeOfDay: string;
  maxDistanceKm: number;
}

const KEY = 'sport-nearby:searchPrefs';

export function loadPrefs(): SearchPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultPrefs(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultPrefs();
}

export function defaultPrefs(): SearchPrefs {
  return { sportIds: [], day: 'any', timeOfDay: '', maxDistanceKm: 5 };
}

export function savePrefs(prefs: SearchPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
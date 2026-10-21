export function formatPrice(price: number, note?: string): string {
  if (price === 0) return 'Бесплатно';
  return `${price} ₽${note ? ` · ${note}` : ''}`;
}

const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Текущее время в МСК (UTC+3). */
export function mskNow(): Date {
  return new Date(Date.now() + MSK_OFFSET_MS);
}

/** Слот date/time (время МСК) → объект Date для сравнения с mskNow(). */
export function slotStartMsk(date: string, startTime: string): Date {
  const dp = date.split('-');
  const tp = startTime.split(':');
  const y = Number(dp[0]) || 1970;
  const m = Number(dp[1]) || 1;
  const d = Number(dp[2]) || 1;
  const hh = Number(tp[0]) || 0;
  const mm = Number(tp[1]) || 0;
  return new Date(Date.UTC(y, m - 1, d, hh, mm) + MSK_OFFSET_MS);
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDateTime(slot: { date: string; startTime: string; endTime: string }): string {
  return `${formatDate(slot.date)}, ${slot.startTime}–${slot.endTime}`;
}

export function todayISO(): string {
  const d = mskNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(1)} км`;
}

export function slackJoin(items: string[], max = 3): string {
  if (!items.length) return '—';
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return shown.join(', ') + (rest > 0 ? ` и ещё ${rest}` : '');
}
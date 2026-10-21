import { Bot, Keyboard } from '@maxhub/max-bot-api';
import {
  DEFAULT_LOCATION,
  SPORTS,
  DAY_OPTIONS,
  TIME_OF_DAY,
  DISTANCE_OPTIONS,
  ACTIVITY_TYPE_LABELS,
  REGISTRATION_STATUS_LABELS,
  type ActivityDetail,
  type ActivitySummary,
  type RegistrationView,
  type SlotView,
} from '@sport-nearby/shared';

const BOT_TOKEN = process.env.MAX_BOT_TOKEN || '';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const POLL_INTERVAL_MS = Number(process.env.BOT_POLL_INTERVAL_MS) || 60_000;

if (!BOT_TOKEN) {
  console.log('[bot] MAX_BOT_TOKEN не задан — бот запущен в режиме ожидания. Установите токен для работы.');
  setInterval(() => {}, 1 << 30);
} else {
  startBot();
}

// ---------------- Хелперы форматирования ----------------

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatDateTime(slot: { date: string; startTime: string; endTime: string }): string {
  return `${formatDate(slot.date)}, ${slot.startTime}–${slot.endTime}`;
}

function formatPrice(price: number, note?: string): string {
  if (price === 0) return 'Бесплатно';
  return `${price} ₽${note ? ` · ${note}` : ''}`;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(1)} км`;
}

function formatRatingCount(count: number): string {
  const n = count % 10;
  const d = count % 100;
  if (d >= 11 && d <= 14) return `${count} оценок`;
  if (n === 1) return `${count} оценка`;
  if (n >= 2 && n <= 4) return `${count} оценки`;
  return `${count} оценок`;
}

function yandexRouteUrl(lat: number, lng: number): string {
  // Пеший маршрут от текущего местоположения (~) до координат объекта
  return `https://yandex.ru/maps/?rtext=~${lat.toFixed(6)},${lng.toFixed(6)}&rtt=pd`;
}

function toSlotView(s: ActivityDetail['schedule'][number]): SlotView {
  const date = new Date(`${s.date}T${s.startTime}:00`);
  const past = date < new Date();
  const state = s.status === 'cancelled' ? 'cancelled' : past ? 'past' : s.registeredCount >= s.capacity ? 'full' : 'open';
  return { ...s, state, seatsFree: Math.max(0, s.capacity - s.registeredCount) };
}

// ---------------- API-клиент бота к Python-бэкенду ----------------

async function apiFetch<T>(userId: string, userName: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('x-user-id', userId);
  if (userName) headers.set('x-demo-name', encodeURIComponent(userName));
  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new Error(err?.message ?? `Ошибка запроса (${res.status})`);
  }
  return data as T;
}

// ---------------- Бот ----------------

async function startBot() {
  console.log('[bot] Запуск бота…');

  const bot = new Bot(BOT_TOKEN);

  const userChatMap = new Map<string, number>();

  interface SearchFilters {
    sportId: string;
    day: string;
    timeOfDay: string;
    distanceKm: number;
  }

  const searchState = new Map<string, SearchFilters>();
  const lastResults = new Map<string, ActivitySummary[]>();
  const onlyAvailable = new Map<string, boolean>();
  // геопозиция пользователя (кэш из профиля или последней отправки)
  const userGeo = new Map<string, { latitude: number; longitude: number }>();

  function trackChat(userId: number | null | undefined, chatId: number | null | undefined) {
    if (typeof userId === 'number' && userId > 0) {
      userChatMap.set(String(userId), typeof chatId === 'number' ? chatId : userId);
    }
  }

  function userIdOf(ctx: { user?: { user_id?: number } | null; message?: { sender?: { user_id?: number } | null } | null }): string {
    const id = ctx.user?.user_id ?? ctx.message?.sender?.user_id;
    return typeof id === 'number' && id > 0 ? String(id) : 'demo';
  }

  function userNameOf(ctx: { user?: { first_name?: string; last_name?: string; name?: string } | null; message?: { sender?: { first_name?: string; last_name?: string; name?: string } | null } | null }): string | undefined {
    const u = ctx.user ?? ctx.message?.sender;
    const full = u?.first_name ?? u?.name ?? '';
    const last = u?.last_name ?? '';
    const name = last ? `${full} ${last}`.trim() : full.trim();
    return name || undefined;
  }

  // ---------------- Клавиатуры ----------------

  function mainKeyboard() {
    const rows: any[][] = [];
    rows.push([
      Keyboard.button.callback('🔍 Поиск', 'menu:search'),
      Keyboard.button.callback('⚡ Популярное рядом', 'menu:popular'),
    ]);
    rows.push([
      Keyboard.button.callback('📋 Мои записи', 'menu:my'),
      Keyboard.button.callback('⭐ Избранное', 'menu:favorites'),
    ]);
    rows.push([
      Keyboard.button.callback('👤 Профиль', 'menu:profile'),
      Keyboard.button.callback('❓ Помощь', 'menu:help'),
    ]);
    return Keyboard.inlineKeyboard(rows);
  }

  const mainMenuText = [
    '🏃 *Спорт рядом*',
    '',
    'Подберём занятие и запишем вас за пару шагов.',
    '',
    '— 🔍 *Поиск* — фильтры (спорт, день, время, радиус)',
    '— ⚡ *Популярное рядом* — активности рядом с центром Москвы',
    '— 📋 *Мои записи* — просмотр и отмена записей',
    '— ⭐ *Избранное* — сохранённые активности',
    '— 👤 *Профиль* — ваши данные',
  ].join('\n');

  const helpText = [
    'ℹ️ *Как это работает*',
    '',
    'Воспользуйтесь кнопками бота:',
    '',
    '• *Поиск* — выберите вид спорта, день, время суток и радиус, затем получите список занятий',
    '• В карточке занятия доступно *расписание со слотами* и кнопка «Записаться»',
    '• *Мои записи* — здесь вы можете отменить запись',
    '• *Избранное* — сохраняйте понравившиеся занятия',
    '',
    'Данные MVP — демонстрационные, источник указан в карточках.',
  ].join('\n');

  function ack(ctx: any, text = 'Готово') {
    return ctx.answerOnCallback({ message: { text } }).catch(() => {});
  }

  async function sendMainMenu(ctx: any) {
    await ctx.reply(mainMenuText, { attachments: [mainKeyboard()], format: 'markdown' });
  }

  async function sendGreeting(ctx: any) {
    const userId = userIdOf(ctx);
    const hour = new Date().getHours();
    const part = hour < 5 ? 'ночи' : hour < 12 ? 'утра' : hour < 18 ? 'дня' : 'вечера';
    let name: string | undefined = userNameOf(ctx);
    try {
      const profile = await apiFetch<{ user?: { name?: string; latitude?: number; longitude?: number } }>(userId, name, '/api/me', { method: 'POST' });
      if (profile.user?.name) name = profile.user.name;
      if (profile.user?.latitude && profile.user?.longitude) {
        userGeo.set(userId, { latitude: profile.user.latitude, longitude: profile.user.longitude });
      }
    } catch {
      /* профиль недоступен — используем имя из сообщения */
    }
    const greet = name && name.trim().length >= 2 ? `, ${name.trim()}` : '';
    await ctx.reply(`👋 Доброго ${part}${greet}! Я помогу найти спорт рядом: подберём занятие и запишем вас за пару шагов.`).catch(() => {});
  }

  // ---------------- Поиск (4 шага: спорт → день → время → радиус) ----------------

  function toChunks<T>(items: readonly T[], size = 2): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size) as T[]);
    }
    return out;
  }

  async function askSport(ctx: any, userId: string) {
    searchState.set(userId, { sportId: 'any', day: 'any', timeOfDay: '', distanceKm: 5 });
    const rows = toChunks(SPORTS).map((pair) =>
      pair.map((s) => Keyboard.button.callback(`${s.emoji} ${s.name}`, `s:sport:${s.id}`)),
    );
    rows.push([Keyboard.button.callback('Любой вид спорта', 's:sport:any')]);
    rows.push([Keyboard.button.callback('↩️ В меню', 'menu')]);
    await ctx.reply('Шаг 1 из 4. *Какой вид спорта?*', { attachments: [Keyboard.inlineKeyboard(rows)], format: 'markdown' });
  }

  async function askDay(ctx: any, userId: string) {
    const sport = SPORTS.find((s) => s.id === searchState.get(userId)?.sportId);
    const rows = toChunks(DAY_OPTIONS).map((pair) =>
      pair.map((d) => Keyboard.button.callback(d.label, `s:day:${d.id}`)),
    );
    rows.push([Keyboard.button.callback('↩️ В меню', 'menu')]);
    await ctx.reply(`Шаг 2 из 4. Спорт: *${sport ? `${sport.emoji} ${sport.name}` : 'любой'}*.\n*На какой день ищем?*`, {
      attachments: [Keyboard.inlineKeyboard(rows)],
      format: 'markdown',
    });
  }

  async function askTimeOfDay(ctx: any, userId: string) {
    const rows = toChunks(TIME_OF_DAY).map((pair) =>
      pair.map((t) => Keyboard.button.callback(t.label, `s:tod:${t.id}`)),
    );
    rows.push([Keyboard.button.callback('Любое время', 's:tod:any')]);
    rows.push([Keyboard.button.callback('↩️ В меню', 'menu')]);
    await ctx.reply('Шаг 3 из 4. *Какое время суток удобнее?*', { attachments: [Keyboard.inlineKeyboard(rows)], format: 'markdown' });
  }

  async function askDistance(ctx: any, userId: string) {
    const rows = toChunks(DISTANCE_OPTIONS).map((pair) =>
      pair.map((d) => Keyboard.button.callback(d.label, `s:dist:${d.id}`)),
    );
    rows.push([Keyboard.button.callback('↩️ В меню', 'menu')]);
    await ctx.reply('Шаг 4 из 4. *Насколько близко ищем?*', { attachments: [Keyboard.inlineKeyboard(rows)], format: 'markdown' });
  }

  async function runSearch(ctx: any, userId: string, filters: SearchFilters) {
    const geo = userGeo.get(userId);
    const lat = geo?.latitude ?? DEFAULT_LOCATION.lat;
    const lng = geo?.longitude ?? DEFAULT_LOCATION.lng;
    const params = new URLSearchParams();
    params.set('lat', String(lat));
    params.set('lng', String(lng));
    if (filters.sportId && filters.sportId !== 'any') params.set('sportIds', filters.sportId);
    if (filters.day && filters.day !== 'any') params.set('day', filters.day);
    if (filters.timeOfDay && filters.timeOfDay !== 'any') params.set('timeOfDay', filters.timeOfDay);
    if (filters.distanceKm && filters.distanceKm > 0) params.set('maxDistanceKm', String(filters.distanceKm));

    const { items } = await apiFetch<{ items: ActivitySummary[] }>(userId, userNameOf(ctx), `/api/activities?${params.toString()}`);
    await ack(ctx, `Найдено: ${items.length}`);
    if (!items.length) {
      await ctx.reply('🔎 По заданным параметрам ничего не найдено. Попробуйте изменить фильтры.', {
        attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback('↩️ Изменить параметры', 'menu:search'), Keyboard.button.callback('В меню', 'menu')]])],
      });
      return;
    }
    await ctx.reply(`🔎 Найдено занятий: *${items.length}*`, { format: 'markdown' });
    lastResults.set(userId, items);
    onlyAvailable.set(userId, false);
    await sendActivityList(ctx, items, userId);
  }

  function activityLine(a: ActivitySummary, i: number): string {
    const slotText = a.nextSlot
      ? ` • ${formatDateTime({ date: a.nextSlot.date, startTime: a.nextSlot.startTime, endTime: a.nextSlot.endTime })}`
      : '';
    const coachText = a.nextSlot?.coach ? ` • 👤 ${a.nextSlot.coach}` : '';
    const ratingText = a.activityRating
      ? ` • ⭐ ${a.activityRating.avg.toFixed(1)}`
      : '';
    const seatsText = a.nextSlot
      ? ` • 🪑 свободно мест: *${a.nextSlot.capacity - a.nextSlot.registeredCount}*`
      : a.openSlots
        ? ` • 🪑 открытых слотов: *${a.openSlots}*`
        : ' • ❌ мест нет';
    return `${i + 1}. ${a.sport.emoji} *${a.activity.title}* — ${a.facility.district} (${formatDistance(a.distanceKm)})${slotText}${coachText}${ratingText}${seatsText}`;
  }

  function freeSeatsOf(a: ActivitySummary): number | undefined {
    if (a.nextSlot) return a.nextSlot.capacity - a.nextSlot.registeredCount;
    return undefined;
  }

  async function sendActivityList(ctx: any, items: ActivitySummary[], userId: string) {
    const onlyOpen = onlyAvailable.get(userId) ?? false;
    const visible = onlyOpen ? items.filter((a) => a.openSlots > 0 && (freeSeatsOf(a) ?? 0) > 0) : items;
    const lines = visible.slice(0, 10).map((a, i) => activityLine(a, i)).join('\n');
    const buttons: any[][] = visible.slice(0, 10).map((it) => {
      const seats = freeSeatsOf(it);
      const time = it.nextSlot ? `${formatDate(it.nextSlot.date)} ${it.nextSlot.startTime}` : 'нет слотов';
      const seatsText = seats !== undefined ? `🪑${seats}` : '';
      return [Keyboard.button.callback(`${it.sport.emoji} ${time} ${seatsText}`.trim(), `act:${it.activity.id}`)];
    });
    buttons.push([
      Keyboard.button.callback(`🪑 ${onlyOpen ? '✓' : ''} Только со свободными местами`, 'list:toggle'),
      Keyboard.button.callback('В меню', 'menu'),
    ]);
    buttons.push([
      Keyboard.button.callback('↩️ Изменить параметры', 'menu:search'),
    ]);
    const title = onlyOpen ? `*Результаты поиска* (только со свободными местами: ${visible.length})\n` : `*Результаты поиска*\n`;
    await ctx.reply(`${title}\n${lines}\n\nНажмите кнопку, чтобы посмотреть карточку.`, {
      attachments: [Keyboard.inlineKeyboard(buttons)],
      format: 'markdown',
    });
  }

  // ---------------- Карточка активности ----------------

  async function showActivity(ctx: any, userId: string, activityId: string, userName: string | undefined) {
    const detail = await apiFetch<ActivityDetail>(userId, userName, `/api/activities/${activityId}?lat=${DEFAULT_LOCATION.lat}&lng=${DEFAULT_LOCATION.lng}`);
    const states = detail.schedule.map(toSlotView).filter((s) => s.state === 'open');
    const { activity, facility, sport } = detail;

    const ratingLine = detail.activityRating
      ? `⭐ Оценка занятия: *${detail.activityRating.avg.toFixed(1)}* (${formatRatingCount(detail.activityRating.count)})`
      : '';

    const text = [
      `${sport.emoji} *${activity.title}*`,
      `${ACTIVITY_TYPE_LABELS[activity.type]} · ${sport.name}`,
      '',
      `📍 ${facility.name}, ${facility.district} (${formatDistance(detail.distanceKm)})`,
      `📞 ${activity.organizer} · ${activity.contact}`,
      `💰 ${formatPrice(activity.price, activity.priceNote)}`,
      ...(ratingLine ? [ratingLine] : []),
      '',
      activity.description,
    ].join('\n');

    const rows: any[][] = [];
    if (states.length) {
      states.slice(0, 6).forEach((s) => {
        const coach = s.coach ? ` — ${s.coach}${s.coachRating ? ` (${s.coachRating.avg.toFixed(1)})` : ''}` : '';
        rows.push([Keyboard.button.callback(`Записаться: ${formatDateTime(s)}${coach}`, `reg:${activityId}:${s.id}`)]);
      });
    }
    rows.push([
      Keyboard.button.link('🚶 Построить маршрут', yandexRouteUrl(facility.latitude, facility.longitude)),
    ]);
    rows.push([
      Keyboard.button.callback('⭐ В избранное', `fav:${activityId}`),
      Keyboard.button.callback('↩️ Назад', 'menu:popular'),
    ]);
    await ctx.reply(text, { attachments: [Keyboard.inlineKeyboard(rows)], format: 'markdown' });
    if (!states.length) {
      await ctx.reply('Свободных слотов на ближайшие дни нет. Попробуйте другое занятие.');
    }
  }

  // ---------------- Регистрация / отмена ----------------

  async function showRegistrationConfirm(ctx: any, userId: string, userName: string | undefined, activityId: string, slotId: string) {
    const detail = await apiFetch<ActivityDetail>(userId, userName, `/api/activities/${activityId}?lat=${DEFAULT_LOCATION.lat}&lng=${DEFAULT_LOCATION.lng}`);
    const slot = detail.schedule.find((s) => s.id === slotId);
    if (!slot) {
      await ctx.reply('⚠️ Выбранное занятие не найдено. Вернитесь к расписанию.');
      return;
    }
    const name = userName?.trim() && userName.trim().length >= 2 ? userName.trim() : 'Спортсмен';
    const coachLine = slot.coach ? `👤 Тренер: *${slot.coach}*${slot.coachRating ? ` · ⭐ ${slot.coachRating.avg.toFixed(1)} (${formatRatingCount(slot.coachRating.count)})` : ''}` : '';
    const text = [
      `${detail.sport.emoji} *${detail.activity.title}*`,
      `📅 ${formatDateTime(slot)} · ${slot.durationMin} мин`,
      `📍 ${detail.facility.name}, ${detail.facility.address}`,
      ...(coachLine ? [coachLine] : []),
      `💰 ${formatPrice(detail.activity.price, detail.activity.priceNote)}`,
      '',
      `Имя для записи: *${name}*`,
      '',
      'Подтвердите запись?',
    ].join('\n');
    await ctx.reply(text, {
      attachments: [Keyboard.inlineKeyboard([
        [
          Keyboard.button.callback('✅ Подтвердить запись', `regok:${slotId}`),
          Keyboard.button.callback('↩️ Отмена', 'menu:popular'),
        ],
        [
          Keyboard.button.link('🚶 Построить маршрут', yandexRouteUrl(detail.facility.latitude, detail.facility.longitude)),
        ],
      ])],
      format: 'markdown',
    });
  }

  async function performRegistration(ctx: any, userId: string, userName: string | undefined, slotId: string) {
    const name = userName?.trim() && userName.trim().length >= 2 ? userName.trim() : 'Спортсмен';
    const reg = await apiFetch<RegistrationView>(userId, userName, '/api/registrations', {
      method: 'POST',
      body: JSON.stringify({ slotId, name, consent: true }),
    });
    const v = reg.registration;
    const slot = reg.slot;
    const coords = `${reg.facility.latitude.toFixed(6)}, ${reg.facility.longitude.toFixed(6)}`;
    const coachLine = slot.coach ? `👤 Тренер: *${slot.coach}*${slot.coachRating ? ` · ⭐ ${slot.coachRating.avg.toFixed(1)} (${formatRatingCount(slot.coachRating.count)})` : ''}` : '';
    const text = [
      '✅ *Вы записаны!*',
      '',
      `${reg.sport.emoji} *${reg.activity.title}*`,
      `📅 ${formatDateTime(slot)} · ${slot.durationMin} мин`,
      `📍 ${reg.facility.name}, ${reg.facility.address}`,
      ...(coachLine ? [coachLine] : []),
      `🧭 Координаты: \`${coords}\``,
      `💰 ${formatPrice(reg.activity.price, reg.activity.priceNote)}`,
      '',
      `Запись: ${v.id} · статус: ${REGISTRATION_STATUS_LABELS[v.status]}`,
    ].join('\n');
    await ack(ctx, `Записаны на «${reg.activity.title}»`);
    await ctx.reply(text, {
      attachments: [Keyboard.inlineKeyboard([
        [Keyboard.button.clipboard('🧭 Скопировать координаты', coords)],
        [Keyboard.button.link('🚶 Построить маршрут', yandexRouteUrl(reg.facility.latitude, reg.facility.longitude))],
        [Keyboard.button.callback('📋 Мои записи', 'menu:my')],
        [Keyboard.button.callback('В меню', 'menu')],
      ])],
      format: 'markdown',
    });
  }

  async function cancelRegistration(ctx: any, userId: string, userName: string | undefined, registrationId: string) {
    await apiFetch<unknown>(userId, userName, `/api/registrations/${registrationId}/cancel`, { method: 'POST' });
    await ack(ctx, 'Запись отменена');
    await ctx.reply('✅ Запись отменена. Место освободилось для других участников.', {
      attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback('📋 Мои записи', 'menu:my'), Keyboard.button.callback('В меню', 'menu')]])],
    });
    await refreshMy(ctx, userId, userName);
  }

  // ---------------- Мои записи ----------------

  async function refreshMy(ctx: any, userId: string, userName: string | undefined) {
    const { items } = await apiFetch<{ items: RegistrationView[] }>(userId, userName, '/api/me/registrations');
    const upcoming = items.filter((r) => r.registration.status === 'confirmed');
    const history = items.filter((r) => r.registration.status === 'cancelled');

    if (!items.length) {
      await ctx.reply('📋 У вас пока нет записей. Найдите занятие рядом и запишитесь!', {
        attachments: [Keyboard.inlineKeyboard([
          [Keyboard.button.callback('🔍 Искать занятия', 'menu:search')],
          [Keyboard.button.callback('В меню', 'menu')],
        ])],
      });
      return;
    }

    const lines = upcoming.map((r, i) => `${i + 1}. ${r.sport.emoji} *${r.activity.title}*\n   📅 ${formatDateTime(r.slot)} • 📍 ${r.facility.district}`).join('\n\n');
    await ctx.reply(`📋 *Мои записи*\n\nБлижайших занятий: ${upcoming.length}${lines ? `\n\n${lines}` : ''}${history.length ? `\n\nИстория (отменённые): ${history.length}` : ''}`, { format: 'markdown' });

    for (const r of upcoming.slice(0, 8)) {
      await ctx.reply(
        `${r.sport.emoji} *${r.activity.title}*\n📅 ${formatDateTime(r.slot)}\n📍 ${r.facility.name}, ${r.facility.address}\n💰 ${formatPrice(r.activity.price, r.activity.priceNote)}`,
        {
          attachments: [Keyboard.inlineKeyboard([
            [
              Keyboard.button.callback('Подробнее', `act:${r.activity.id}`),
              Keyboard.button.callback('Отменить запись', `cancel:${r.registration.id}`),
            ],
          ])],
          format: 'markdown',
        },
      );
    }
    await ctx.reply('Нажмите на запись, чтобы открыть карточку или отменить её.', {
      attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback('В меню', 'menu')]])],
    });
  }

  // ---------------- Избранное ----------------

  async function refreshFavorites(ctx: any, userId: string, userName: string | undefined) {
    const { items } = await apiFetch<{ items: { id: string; activityId: string }[] }>(userId, userName, '/api/me/favorites');
    if (!items.length) {
      await ctx.reply('⭐ В избранном пока пусто. Откройте карточку занятия и нажмите «⭐ В избранное».', {
        attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback('В меню', 'menu')]])],
      });
      return;
    }
    await ctx.reply(`⭐ *Избранное*\n\nСохранено занятий: ${items.length}`, { format: 'markdown' });
    for (const f of items.slice(0, 8)) {
      const detail = await apiFetch<ActivityDetail>(userId, userName, `/api/activities/${f.activityId}?lat=${DEFAULT_LOCATION.lat}&lng=${DEFAULT_LOCATION.lng}`);
      await ctx.reply(`${detail.sport.emoji} *${detail.activity.title}*\n📍 ${detail.facility.name}, ${detail.facility.district}\n💰 ${formatPrice(detail.activity.price, detail.activity.priceNote)}`, {
        attachments: [Keyboard.inlineKeyboard([
          [
            Keyboard.button.callback('Подробнее', `act:${f.activityId}`),
            Keyboard.button.callback('Убрать', `unfav:${f.id}`),
          ],
        ])],
        format: 'markdown',
      });
    }
    await ctx.reply('Нажмите «Убрать», чтобы удалить из избранного.', {
      attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback('В меню', 'menu')]])],
    });
  }

  // ---------------- Профиль ----------------

  async function showProfile(ctx: any, userId: string, userName: string | undefined) {
    const data = await apiFetch<{ user: { id: string; name?: string; district?: string; preferredSports?: string[]; createdAt: string; latitude?: number; longitude?: number } }>(userId, userName, '/api/me', { method: 'POST' });
    const u = data.user;
    const sports = (u.preferredSports ?? []).map((id) => {
      const s = SPORTS.find((x) => x.id === id);
      return s ? `${s.emoji} ${s.name}` : id;
    });
    if (u.latitude && u.longitude) {
      userGeo.set(userId, { latitude: u.latitude, longitude: u.longitude });
    }
    const geoText = u.latitude && u.longitude
      ? `${u.latitude.toFixed(5)}, ${u.longitude.toFixed(5)}`
      : '—';
    const text = [
      '👤 *Профиль*',
      '',
      `Имя: ${u.name ?? '—'}`,
      `ID: ${u.id}`,
      `Район: ${u.district ?? '—'}`,
      `Геолокация: ${geoText}`,
      `Предпочтения: ${sports.length ? sports.join(', ') : '—'}`,
      `В системе с: ${new Date(u.createdAt).toLocaleDateString('ru-RU')}`,
      '',
      'Команда /profile — просмотр профиля.',
    ].join('\n');
    const buttons: any[][] = [[Keyboard.button.callback('В меню', 'menu')]];
    if (!(u.latitude && u.longitude)) {
      buttons.push([
        Keyboard.button.requestGeoLocation('📍 Указать геолокацию'),
      ]);
    }
    await ctx.reply(text, {
      attachments: [Keyboard.inlineKeyboard(buttons)],
      format: 'markdown',
    });
  }

  // ---------------- Команды и колбэки ----------------

  try {
    const info = await bot.api.getMyInfo();
    console.log(`[bot] Бот: ${info.first_name || info.name || info.username || 'безымянный'} (@${info.username ?? '—'}), аватар: ${info.avatar_url || info.full_avatar_url || '—'}`);
    const res = await bot.api.setMyCommands([
      { name: 'start', description: 'Запустить бота и показать меню' },
      { name: 'search', description: 'Подобрать спорт рядом (фильтры)' },
      { name: 'popular', description: 'Популярные занятия рядом' },
      { name: 'my', description: 'Мои записи' },
      { name: 'favorites', description: 'Избранное' },
      { name: 'profile', description: 'Мой профиль' },
      { name: 'help', description: 'Помощь и подсказки' },
    ]);
    console.log('[bot] Команды зарегистрированы:', JSON.stringify(res));
  } catch (e) {
    console.error('[bot] Не удалось получить информацию о боте или зарегистрировать команды:', e);
  }

  bot.command('start', async (ctx) => {
    trackChat(ctx.message?.sender?.user_id, ctx.chatId);
    await sendGreeting(ctx);
    await sendMainMenu(ctx);
  });

  bot.on('bot_started', async (ctx) => {
    trackChat(ctx.user?.user_id, ctx.chatId);
    await sendGreeting(ctx);
    await sendMainMenu(ctx);
  });

  bot.command('search', async (ctx) => {
    trackChat(ctx.message?.sender?.user_id, ctx.chatId);
    await askSport(ctx, userIdOf(ctx));
  });
  bot.command('popular', async (ctx) => {
    trackChat(ctx.message?.sender?.user_id, ctx.chatId);
    await runSearch(ctx, userIdOf(ctx), { sportId: 'any', day: 'any', timeOfDay: '', distanceKm: 100 });
  });
  bot.command('my', async (ctx) => {
    trackChat(ctx.message?.sender?.user_id, ctx.chatId);
    await refreshMy(ctx, userIdOf(ctx), userNameOf(ctx));
  });
  bot.command('favorites', async (ctx) => {
    trackChat(ctx.message?.sender?.user_id, ctx.chatId);
    await refreshFavorites(ctx, userIdOf(ctx), userNameOf(ctx));
  });
  bot.command('profile', async (ctx) => {
    trackChat(ctx.message?.sender?.user_id, ctx.chatId);
    await showProfile(ctx, userIdOf(ctx), userNameOf(ctx));
  });
  bot.command('help', async (ctx) => {
    trackChat(ctx.message?.sender?.user_id, ctx.chatId);
    await ctx.reply(helpText, { attachments: [mainKeyboard()], format: 'markdown' });
  });

  bot.on('message_created', async (ctx) => {
    const sender = ctx.message?.sender;
    if (sender) trackChat(sender.user_id, ctx.chatId);
    const text = ctx.message?.body?.text?.trim();
    const attachments = (ctx.message?.body?.attachments ?? []) as { type?: string; latitude?: number; longitude?: number }[];
    const loc = attachments.find((a) => a.type === 'location' && typeof a.latitude === 'number' && typeof a.longitude === 'number');
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      const userId = userIdOf(ctx);
      const userName = userNameOf(ctx);
      try {
        await apiFetch(userId, userName, '/api/me', {
          method: 'PATCH',
          body: JSON.stringify({ latitude: loc.latitude, longitude: loc.longitude }),
        });
        userGeo.set(userId, { latitude: loc.latitude, longitude: loc.longitude });
        await ctx.reply('📍 Геолокация сохранена в профиле.');
        await sendMainMenu(ctx);
      } catch (e) {
        await ctx.reply(`⚠️ Не удалось сохранить геолокацию: ${e instanceof Error ? e.message : 'Ошибка'}`);
      }
      return;
    }
    if (!text) return;
    if (ctx.message?.body?.text) {
      // неизвестная команда → меню
      if (text.startsWith('/')) {
        await ctx.reply('Не знаю такой команды. Вот что я умею:', { attachments: [mainKeyboard()] });
        return;
      }
      await sendMainMenu(ctx);
    }
  });

  bot.action('menu', async (ctx) => {
    await ack(ctx);
    await sendMainMenu(ctx);
  });

  bot.action('menu:search', async (ctx) => {
    await ack(ctx);
    await askSport(ctx, userIdOf(ctx));
  });

  bot.action('menu:popular', async (ctx) => {
    await ack(ctx);
    await runSearch(ctx, userIdOf(ctx), { sportId: 'any', day: 'any', timeOfDay: '', distanceKm: 100 });
  });

  bot.action('list:toggle', async (ctx) => {
    const userId = userIdOf(ctx);
    const items = lastResults.get(userId);
    if (!items) {
      await ack(ctx, 'Список пуст, выполните поиск заново');
      return;
    }
    onlyAvailable.set(userId, !(onlyAvailable.get(userId) ?? false));
    await ack(ctx, 'Фильтр применён');
    await sendActivityList(ctx, items, userId);
  });

  bot.action('menu:my', async (ctx) => {
    await ack(ctx);
    await refreshMy(ctx, userIdOf(ctx), userNameOf(ctx));
  });

  bot.action('menu:favorites', async (ctx) => {
    await ack(ctx);
    await refreshFavorites(ctx, userIdOf(ctx), userNameOf(ctx));
  });

  bot.action('menu:profile', async (ctx) => {
    await ack(ctx);
    await showProfile(ctx, userIdOf(ctx), userNameOf(ctx));
  });

  bot.action('menu:help', async (ctx) => {
    await ack(ctx);
    await ctx.reply(helpText, { attachments: [mainKeyboard()], format: 'markdown' });
  });

  bot.action(/^s:sport:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    const filters = searchState.get(userId) ?? { sportId: 'any', day: 'any', timeOfDay: '', distanceKm: 5 };
    const sportId = ctx.match?.[1] ?? 'any';
    filters.sportId = sportId;
    searchState.set(userId, filters);
    await ack(ctx);
    await askDay(ctx, userId);
  });

  bot.action(/^s:day:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    const filters = searchState.get(userId) ?? { sportId: 'any', day: 'any', timeOfDay: '', distanceKm: 5 };
    filters.day = ctx.match?.[1] ?? 'any';
    searchState.set(userId, filters);
    await ack(ctx);
    await askTimeOfDay(ctx, userId);
  });

  bot.action(/^s:tod:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    const filters = searchState.get(userId) ?? { sportId: 'any', day: 'any', timeOfDay: '', distanceKm: 5 };
    const tod = ctx.match?.[1] ?? '';
    filters.timeOfDay = tod === 'any' ? '' : tod;
    searchState.set(userId, filters);
    await ack(ctx);
    await askDistance(ctx, userId);
  });

  bot.action(/^s:dist:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    const filters = searchState.get(userId) ?? { sportId: 'any', day: 'any', timeOfDay: '', distanceKm: 5 };
    const raw = ctx.match?.[1] ?? '5';
    filters.distanceKm = raw === 'any' ? 100 : Number(raw) || 5;
    searchState.set(userId, filters);
    await runSearch(ctx, userId, filters);
  });

  bot.action(/^act:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    await ack(ctx);
    await showActivity(ctx, userId, ctx.match?.[1] ?? '', userNameOf(ctx));
  });

  bot.action(/^reg:([^:]+):([^:]+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    const activityId = ctx.match?.[1] ?? '';
    const slotId = ctx.match?.[2] ?? '';
    await ack(ctx);
    await showRegistrationConfirm(ctx, userId, userNameOf(ctx), activityId, slotId);
  });

  bot.action(/^regok:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    await performRegistration(ctx, userId, userNameOf(ctx), ctx.match?.[1] ?? '');
  });

  bot.action(/^cancel:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    await cancelRegistration(ctx, userId, userNameOf(ctx), ctx.match?.[1] ?? '');
  });

  bot.action(/^fav:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    const activityId = ctx.match?.[1] ?? '';
    try {
      await apiFetch(userId, userNameOf(ctx), '/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ activityId }),
      });
      await ack(ctx, 'Добавлено в избранное');
    } catch (e) {
      await ack(ctx, 'Не удалось добавить');
      await ctx.reply(`⚠️ ${e instanceof Error ? e.message : 'Ошибка'}`);
    }
  });

  bot.action(/^unfav:(.+)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    const favId = ctx.match?.[1] ?? '';
    try {
      await apiFetch(userId, userNameOf(ctx), `/api/favorites/${favId}`, { method: 'DELETE' });
      await ack(ctx, 'Убрано из избранного');
    } catch {
      await ack(ctx, 'Не удалось');
    }
    await refreshFavorites(ctx, userId, userNameOf(ctx));
  });

  // -------- Напоминания: опрос backend --------
  async function pollReminders() {
    try {
      const now = new Date().toISOString();
      const res = await fetch(`${BACKEND_URL}/api/reminders/due?now=${encodeURIComponent(now)}`);
      if (!res.ok) return;
      const { items } = (await res.json()) as { items: { id: string; userId: string; slotId: string; remindAt: string }[] };
      if (!items.length) return;

      const sentIds: string[] = [];
      for (const rem of items) {
        const chatId = userChatMap.get(rem.userId);
        const userIdNum = Number(rem.userId);
        if (Number.isNaN(userIdNum) || userIdNum <= 0) continue;
        if (chatId) {
          try {
            await bot.api.sendMessageToUser(
              userIdNum,
              `⏰ *Напоминание:* скоро начинается тренировка!\nОткройте «Мои записи» с помощью кнопки в меню для подробностей.`,
              { attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback('📋 Мои записи', 'menu:my')]])], format: 'markdown' },
            );
            sentIds.push(rem.id);
          } catch (e) {
            console.error('[bot] Ошибка отправки напоминания:', e);
          }
        }
      }
      if (sentIds.length) {
        await fetch(`${BACKEND_URL}/api/reminders/sent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: sentIds }),
        });
      }
    } catch (e) {
      console.error('[bot] Ошибка pollReminders:', e);
    }
  }

  setInterval(pollReminders, POLL_INTERVAL_MS);

  bot.catch((err) => console.error('[bot] error:', err));
  bot.start();
  console.log('[bot] Бот запущен и слушает обновления.');
}
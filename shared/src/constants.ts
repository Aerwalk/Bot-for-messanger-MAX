import type { ActivityType, AgeCategory, SkillLevel } from './types';

export const CITY = 'Москва';

// Опорная точка для демо-данных: пользователь ищет активности вокруг центра Москвы.
export const DEFAULT_LOCATION = { lat: 55.7558, lng: 37.6173 };

export const SPORTS: { id: string; name: string; emoji: string }[] = [
  { id: 'football', name: 'Футбол', emoji: '⚽' },
  { id: 'basketball', name: 'Баскетбол', emoji: '🏀' },
  { id: 'swimming', name: 'Плавание', emoji: '🏊' },
  { id: 'tennis', name: 'Теннис', emoji: '🎾' },
  { id: 'running', name: 'Бег', emoji: '🏃' },
  { id: 'yoga', name: 'Йога', emoji: '🧘' },
  { id: 'volleyball', name: 'Волейбол', emoji: '🏐' },
  { id: 'fitness', name: 'Фитнес', emoji: '💪' },
];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  section: 'Секция',
  place: 'Площадка',
  training: 'Тренировка',
  competition: 'Соревнование',
};

export const AGE_LABELS: Record<AgeCategory, string> = {
  child: '6–12 лет',
  teen: '13–17 лет',
  adult: '18+',
  senior: '50+',
  any: 'Любой возраст',
};

export const LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Начальный',
  intermediate: 'Средний',
  pro: 'Профи',
  any: 'Любой уровень',
};

export const TIME_OF_DAY = [
  { id: 'morning', label: 'Утро · до 12:00', range: [6, 12] },
  { id: 'day', label: 'День · 12:00–18:00', range: [12, 18] },
  { id: 'evening', label: 'Вечер · после 18:00', range: [18, 24] },
] as const;

export const DAY_OPTIONS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'tomorrow', label: 'Завтра' },
  { id: 'week', label: 'На неделе' },
  { id: 'any', label: 'Любая дата' },
] as const;

export const DISTANCE_OPTIONS = [
  { id: '1', label: 'до 1 км' },
  { id: '3', label: 'до 3 км' },
  { id: '5', label: 'до 5 км' },
  { id: 'any', label: 'Любое' },
] as const;

export const DISTRICTS = [
  'Хамовники',
  'Пресненский',
  'Тверской',
  'Арбат',
  'Лефортово',
  'Сокольники',
  'Кунцево',
  'Лужники',
];

export const REGISTRATION_STATUS_LABELS = {
  confirmed: 'Подтверждено',
  cancelled: 'Отменено',
} as const;

export const SLOT_STATE_LABELS = {
  open: 'Места есть',
  full: 'Мест нет',
  cancelled: 'Отменено',
  past: 'Прошло',
  closed: 'Запись закрыта',
} as const;
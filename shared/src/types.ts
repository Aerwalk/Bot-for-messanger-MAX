// ----------------------------- Базовые сущности -----------------------------

export type ActivityType = 'section' | 'place' | 'training' | 'competition';
export type AgeCategory = 'child' | 'teen' | 'adult' | 'senior' | 'any';
export type SkillLevel = 'beginner' | 'intermediate' | 'pro' | 'any';
export type SlotState = 'open' | 'full' | 'cancelled' | 'past' | 'closed';
export type RegistrationStatus = 'confirmed' | 'cancelled';
export type EventName =
  | 'bot_started'
  | 'miniapp_opened'
  | 'search_started'
  | 'filter_applied'
  | 'results_viewed'
  | 'activity_opened'
  | 'schedule_opened'
  | 'registration_started'
  | 'registration_completed'
  | 'registration_failed'
  | 'registration_cancelled'
  | 'favorite_added'
  | 'reminder_enabled';

export interface Sport {
  id: string;
  name: string;
  emoji: string;
}

export interface SportFacility {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  district: string;
  latitude: number;
  longitude: number;
  description: string;
  /** Источник данных (например, "Демонстрационные данные MVP") */
  source: string;
  /** Дата актуальности данных */
  sourceUpdatedAt: string;
}

export interface Activity {
  id: string;
  facilityId: string;
  sportId: string;
  type: ActivityType;
  title: string;
  description: string;
  ageCategory: AgeCategory;
  skillLevel: SkillLevel;
  price: number;
  priceNote: string;
  organizer: string;
  contact: string;
  status: 'active' | 'inactive';
}

export interface ScheduleSlot {
  id: string;
  activityId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  capacity: number;
  registeredCount: number;
  status: 'scheduled' | 'cancelled';
  coach: string;
  coachId?: string;
  durationMin: number;
  /** рейтинг тренера, если у него уже есть оценки */
  coachRating?: RatingAggregate;
}

export interface Registration {
  id: string;
  userId: string;
  slotId: string;
  name: string;
  phone?: string;
  status: RegistrationStatus;
  createdAt: string;
  canceledAt?: string;
}

export interface UserProfile {
  id: string;
  name?: string;
  city?: string;
  district?: string;
  ageCategory?: AgeCategory;
  preferredSports?: string[];
  preferredTime?: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  activityId: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  slotId: string;
  remindAt: string; // ISO
  sent: boolean;
  createdAt: string;
}

// ----------------------------- Тренеры и оценки -----------------------------

export interface Coach {
  id: string;
  organizerId?: string;
  name: string;
  sportId?: string;
  bio?: string;
  createdAt: string;
}

export interface Rating {
  id: string;
  userId: string;
  slotId: string;
  activityId: string;
  coachId?: string;
  coachName: string;
  /** оценка тренировки 1–5 */
  activityScore: number;
  /** оценка тренера 1–5 */
  coachScore?: number;
  comment?: string;
  createdAt: string;
}

export interface RatingAggregate {
  /** среднее значение (1–5, один знак после запятой) */
  avg: number;
  /** число оценок */
  count: number;
}

export interface AnalyticsEvent {
  id: string;
  userId: string;
  name: EventName;
  payload?: Record<string, unknown>;
  createdAt: string;
}

// ----------------------------- Композитные DTO -----------------------------

export interface ActivitySummary {
  activity: Activity;
  facility: SportFacility;
  sport: Sport;
  /** км от точки пользователя */
  distanceKm: number;
  /** ближайший доступный слот */
  nextSlot?: ScheduleSlot;
  /** количество доступных слотов у активности */
  openSlots: number;
  /** средняя оценка «за тренировку», если оценки есть */
  activityRating?: RatingAggregate;
}

export interface ActivityDetail extends ActivitySummary {
  schedule: ScheduleSlot[];
}

export interface SlotView extends ScheduleSlot {
  state: SlotState;
  seatsFree: number;
}

export interface RegistrationView {
  registration: Registration;
  slot: SlotView;
  activity: Activity;
  facility: SportFacility;
  sport: Sport;
  /** оценка, оставленная этим пользователем за слот (если есть) */
  rating?: Rating;
}

// ----------------------------- Фильтры поиска -----------------------------

export interface ActivityFilters {
  sportIds?: string[];
  type?: ActivityType;
  ageCategory?: AgeCategory;
  skillLevel?: SkillLevel;
  maxDistanceKm?: number;
  // точка пользователя для расчёта расстояния
  lat?: number;
  lng?: number;
  // день: today | tomorrow | week | weekend (RFC, см. resolveDayRange)
  day?: string;
  timeOfDay?: 'morning' | 'day' | 'evening';
}

// ----------------------------- Ошибки API -----------------------------

export interface ApiErrorBody {
  error: {
    code:
      | 'VALIDATION_ERROR'
      | 'NOT_FOUND'
      | 'SLOT_FULL'
      | 'DUPLICATE'
      | 'CANCELLED'
      | 'UNAUTHORIZED'
      | 'INTERNAL';
    message: string;
    details?: unknown;
  };
}

export const DEMO_DATA_SOURCE = 'Демонстрационные данные MVP';
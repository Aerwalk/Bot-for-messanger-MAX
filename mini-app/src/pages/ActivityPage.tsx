import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ACTIVITY_TYPE_LABELS, AGE_LABELS, LEVEL_LABELS, SLOT_STATE_LABELS,
  type ActivityDetail, type SlotView,
} from '@sport-nearby/shared';
import { request, track } from '../api';
import { ErrorState, LoadingState } from '../components/StateViews';
import { RatingBadge } from '../components/Rating';
import { formatPrice, formatDateTime, formatDistance, todayISO, slotStartMsk, mskNow } from '../format';
import { useMaxNavigation } from '../session';

function toSlotView(s: ActivityDetail['schedule'][number]): SlotView {
  const past = slotStartMsk(s.date, s.startTime) < mskNow();
  const state = s.status === 'cancelled' ? 'cancelled' : past ? 'past' : s.registeredCount >= s.capacity ? 'full' : 'open';
  return { ...s, state, seatsFree: Math.max(0, s.capacity - s.registeredCount) };
}

export function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useMaxNavigation();
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await request<ActivityDetail>(`/api/activities/${id}?lat=55.7558&lng=37.6173`);
      setDetail(data);
      track('activity_opened', { activityId: id });
      track('schedule_opened', { activityId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить карточку');
    }
  }

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  if (error && !detail) return <div className="sn-page"><ErrorState text={error} onRetry={load} /></div>;
  if (!detail) return <div className="sn-page"><LoadingState text="Загружаем карточку…" /></div>;

  const { activity, facility, sport, distanceKm, schedule } = detail;
  const states = schedule.map(toSlotView);

  return (
    <div className="sn-page">
      <div className="sn-header">
        <div>
          <h1 className="sn-title">{sport.emoji} {activity.title}</h1>
          <div className="flex" style={{ marginTop: 8 }}>
            <span className={`badge badge--${activity.type}`}>{ACTIVITY_TYPE_LABELS[activity.type]}</span>
            <span className="badge" style={{ background: 'var(--sn-border)', color: 'var(--sn-text-2)' }}>{sport.name}</span>
          </div>
          {detail.activityRating && (
            <div className="flex" style={{ marginTop: 8 }}>
              <RatingBadge agg={detail.activityRating} label="за тренировку" />
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="kv"><span className="kv__k">Организатор</span><span>{activity.organizer}</span></div>
        <div className="kv"><span className="kv__k">Адрес</span><span>{facility.address}, {facility.district}</span></div>
        <div className="kv"><span className="kv__k">Расстояние</span><span>{formatDistance(distanceKm)}</span></div>
        <div className="kv"><span className="kv__k">Возраст</span><span>{AGE_LABELS[activity.ageCategory]}</span></div>
        <div className="kv"><span className="kv__k">Уровень</span><span>{LEVEL_LABELS[activity.skillLevel]}</span></div>
        <div className="kv"><span className="kv__k">Стоимость</span><span>{formatPrice(activity.price, activity.priceNote)}</span></div>
        <div className="divider" />
        <p className="muted" style={{ margin: 0 }}>{activity.description}</p>
      </div>

      <div className="section">
        <div className="section__label">Расписание занятий</div>
        {states.filter((s) => s.state === 'open').length === 0 && (
          <div className="card muted">Свободных слотов на ближайшие дни нет. Попробуйте выбрать другое время.</div>
        )}
        {states.map((s) => (
          <SlotRow key={s.id} slot={s} onRegister={() => {
            track('registration_started', { slotId: s.id });
            navigate(`/activity/${activity.id}/register/${s.id}`);
          }} />
        ))}
      </div>

      <div className="demo-note">
        <b>Источник:</b> {facility.source}<br />
        <b>Обновлено:</b> {new Date(facility.sourceUpdatedAt).toLocaleString('ru-RU')}<br />
        <b>Контакт:</b> {activity.contact}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

function SlotRow({ slot, onRegister }: { slot: SlotView; onRegister: () => void }) {
  const isOpen = slot.state === 'open';
  const label = SLOT_STATE_LABELS[slot.state];
  return (
    <div className="slot-row">
      <div className="slot-row__time">{slot.date === todayISO() ? 'Сегодня, ' : ''}{formatDateTime(slot)}</div>
      <div className="slot-row__sub">
        {slot.durationMin} мин · тренер: {slot.coach}
        {slot.coachRating && <RatingBadge agg={slot.coachRating} />}
      </div>
      <div className="slot-row__foot">
        <span className="slot-row__sub">
          {slot.state === 'open' ? <>Свободно мест: <b className="accent">{slot.seatsFree}</b> из {slot.capacity}</> : label}
        </span>
        <button className="btn btn--primary btn--sm" disabled={!isOpen} onClick={onRegister}>
          {isOpen ? 'Записаться' : label}
        </button>
      </div>
    </div>
  );
}
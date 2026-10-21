import { useNavigate } from 'react-router-dom';
import { ACTIVITY_TYPE_LABELS, SLOT_STATE_LABELS, type ActivitySummary } from '@sport-nearby/shared';
import { formatPrice, formatDateTime, formatDistance } from '../format';
import { RatingBadge } from './Rating';

export function ActivityCard({ item }: { item: ActivitySummary }) {
  const navigate = useNavigate();
  const { activity, facility, sport, distanceKm, nextSlot, openSlots } = item;
  const typeLabel = ACTIVITY_TYPE_LABELS[activity.type];

  return (
    <div className="card card--clickable" onClick={() => navigate(`/activity/${activity.id}`)}>
      <div className="card__top">
        <div>
          <p className="card__title">
            <span className="avatar">{sport.emoji}</span> {activity.title}
          </p>
          <div className="flex" style={{ marginTop: 6 }}>
            <span className={`badge badge--${activity.type}`}>{typeLabel}</span>
            <span className="badge" style={{ background: 'var(--sn-border)', color: 'var(--sn-text-2)' }}>{sport.name}</span>
          </div>
        </div>
      </div>
      <div className="card__meta">
        📍 {facility.name} · {facility.district} · <b>{formatDistance(distanceKm)}</b>
        <br />
        {nextSlot ? (
          <>🗓 Ближайшее: <b>{formatDateTime({ date: nextSlot.date, startTime: nextSlot.startTime, endTime: nextSlot.endTime })}</b></>
        ) : (
          <>🗓 Расписание уточняйте в карточке</>
        )}
        {item.activityRating && (
          <>
            <br />
            <RatingBadge agg={item.activityRating} label="за тренировку" />
          </>
        )}
      </div>
      <div className="flex flex--between" style={{ marginTop: 10 }}>
        <span className="card__meta" style={{ margin: 0 }}>
          💰 {formatPrice(activity.price, activity.priceNote)}
        </span>
        <span className="card__meta" style={{ margin: 0 }}>
          {nextSlot
            ? <>{nextSlot.registeredCount >= nextSlot.capacity ? SLOT_STATE_LABELS.full : `${SLOT_STATE_LABELS.open} (${nextSlot.capacity - nextSlot.registeredCount})`}</>
            : <>{openSlots > 0 ? `Свободных слотов: ${openSlots}` : SLOT_STATE_LABELS.full}</>}
        </span>
      </div>
    </div>
  );
}
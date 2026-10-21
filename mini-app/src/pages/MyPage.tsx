import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { REGISTRATION_STATUS_LABELS, type Rating, type RegistrationView } from '@sport-nearby/shared';
import { request, track } from '../api';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { StarPicker } from '../components/Rating';
import { formatDateTime, formatPrice } from '../format';

export function MyPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RegistrationView[] | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, rateData] = await Promise.all([
        request<{ items: RegistrationView[] }>('/api/me/registrations'),
        request<{ items: Rating[] }>('/api/me/ratings'),
      ]);
      setItems(data.items);
      setRatings(Object.fromEntries(rateData.items.map((r) => [r.slotId, r])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить записи');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function cancel(id: string) {
    if (!window.confirm('Отменить эту запись? Место освободится для других участников.')) return;
    setCancelling(id);
    try {
      await request(`/api/registrations/${id}/cancel`, { method: 'POST' });
      track('registration_cancelled', { registrationId: id });
      await load();
    } catch {
      window.alert('Не удалось отменить запись. Попробуйте ещё раз.');
    } finally {
      setCancelling(null);
    }
  }

  if (error && items == null) {
    return <div className="sn-page sn-page--tab"><ErrorState text={error} onRetry={load} /></div>;
  }
  if (items == null) return <div className="sn-page sn-page--tab"><LoadingState text="Загружаем ваши записи…" /></div>;

  const upcoming = items.filter((r) => r.registration.status === 'confirmed' && r.slot.state !== 'past');
  const past = items.filter((r) => r.registration.status === 'confirmed' && r.slot.state === 'past');
  const history = items.filter((r) => r.registration.status === 'cancelled');

  return (
    <div className="sn-page sn-page--tab">
      <div className="sn-header">
        <div>
          <h1 className="sn-title">Мои записи</h1>
          <p className="sn-subtitle">{upcoming.length > 0 ? `Ближайших занятий: ${upcoming.length}` : 'Пока записей нет'}</p>
        </div>
      </div>

      {items.length === 0 && (
        <EmptyState
          icon="📋"
          title="Пока пусто"
          text="Найдите подходящую активность рядом и запишитесь — она появится здесь."
          actions={<button className="btn btn--primary" onClick={() => navigate('/')}>Найти спорт рядом</button>}
        />
      )}

      {upcoming.map((v) => (
        <RegCard key={v.registration.id} view={v} onCancel={() => cancel(v.registration.id)} cancelling={cancelling === v.registration.id} />
      ))}

      {past.length > 0 && (
        <>
          <div className="section__label" style={{ marginTop: 24 }}>Прошедшие</div>
          {past.map((v) => (
            <PastCard key={v.registration.id} view={v} rating={ratings[v.slot.id]} onRated={load} />
          ))}
        </>
      )}

      {history.length > 0 && (
        <>
          <div className="section__label" style={{ marginTop: 24 }}>История</div>
          {history.map((v) => (
            <div className="card" key={v.registration.id} style={{ opacity: 0.72 }}>
              <div className="card__top">
                <p className="card__title">{v.sport.emoji} {v.activity.title}</p>
                <span className="badge" style={{ background: 'var(--sn-border)', color: 'var(--sn-text-2)' }}>{REGISTRATION_STATUS_LABELS[v.registration.status]}</span>
              </div>
              <div className="card__meta">
                📅 {formatDateTime(v.slot)}<br />
                📍 {v.facility.name}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PastCard({ view, rating, onRated }: { view: RegistrationView; rating?: Rating; onRated: () => Promise<void> }) {
  const navigate = useNavigate();
  const { slot, activity, facility, sport } = view;
  const [open, setOpen] = useState(false);
  const [activityScore, setActivityScore] = useState(rating?.activityScore ?? 0);
  const [coachScore, setCoachScore] = useState(rating?.coachScore ?? 0);
  const [comment, setComment] = useState(rating?.comment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submit() {
    if (activityScore < 1) {
      setSubmitError('Поставьте оценку за тренировку (1–5)');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await request('/api/ratings', {
        method: 'POST',
        body: JSON.stringify({
          slotId: slot.id,
          activityScore,
          coachScore: coachScore > 0 ? coachScore : null,
          comment: comment.trim() || null,
        }),
      });
      track('rating_submitted', { slotId: slot.id, activityScore, coachScore });
      setOpen(false);
      await onRated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Не удалось сохранить оценку');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="card__top">
        <div>
          <p className="card__title">{sport.emoji} {activity.title}</p>
          <div className="card__meta" style={{ marginTop: 4 }}>
            📅 {formatDateTime(slot)} · 📍 {facility.name}
          </div>
        </div>
      </div>
      {rating ? (
        <div className="card__meta" style={{ marginTop: 8 }}>
          ✅ Ваша оценка: тренировка — <b>{rating.activityScore}/5</b>
          {rating.coachScore != null && <> · тренер ({slot.coach || 'тренер'}) — <b>{rating.coachScore}/5</b></>}
        </div>
      ) : open ? (
        <RatingForm
          coachLabel={slot.coach ? `Тренер: ${slot.coach}` : undefined}
          activityScore={activityScore}
          coachScore={coachScore}
          comment={comment}
          submitting={submitting}
          error={submitError}
          onActivityScore={setActivityScore}
          onCoachScore={setCoachScore}
          onComment={setComment}
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      ) : null}
      <div className="slot-row__foot" style={{ marginTop: 12 }}>
        <button className="btn btn--sm btn--secondary" onClick={() => navigate(`/activity/${activity.id}`)}>Подробнее</button>
        {rating ? null : (
          <button className="btn btn--sm btn--primary" onClick={() => setOpen(true)}>
            ⭐ Оценить
          </button>
        )}
      </div>
    </div>
  );
}

function RatingForm(props: {
  coachLabel?: string;
  activityScore: number;
  coachScore: number;
  comment: string;
  submitting: boolean;
  error: string | null;
  onActivityScore: (v: number) => void;
  onCoachScore: (v: number) => void;
  onComment: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--sn-border)', paddingTop: 10 }}>
      <StarPicker label="Оценка тренировки" value={props.activityScore} onChange={props.onActivityScore} />
      {props.coachLabel && <StarPicker label={props.coachLabel} value={props.coachScore} onChange={props.onCoachScore} />}
      <textarea
        className="field__input"
        rows={2}
        value={props.comment}
        onChange={(e) => props.onComment(e.target.value)}
        placeholder="Комментарий (необязательно)"
        style={{ marginTop: 10 }}
      />
      {props.error && <div className="field__error">{props.error}</div>}
      <div className="flex" style={{ marginTop: 10 }}>
        <button className="btn btn--sm btn--primary" disabled={props.submitting} onClick={props.onSubmit}>
          {props.submitting ? 'Сохраняем…' : 'Сохранить оценку'}
        </button>
        <button className="btn btn--sm btn--secondary" disabled={props.submitting} onClick={props.onCancel}>Отмена</button>
      </div>
    </div>
  );
}

function RegCard({ view, onCancel, cancelling }: { view: RegistrationView; onCancel: () => void; cancelling: boolean }) {
  const navigate = useNavigate();
  const { registration, slot, activity, facility, sport } = view;
  return (
    <div className="card">
      <div className="card__top">
        <div>
          <p className="card__title">{sport.emoji} {activity.title}</p>
          <div className="badge--section badge" style={{ marginTop: 6 }}>{registration.status === 'confirmed' ? '✅ ' + REGISTRATION_STATUS_LABELS[registration.status] : REGISTRATION_STATUS_LABELS[registration.status]}</div>
        </div>
      </div>
      <div className="card__meta">
        📅 <b>{formatDateTime(slot)}</b><br />
        📍 {facility.name}, {facility.address}<br />
        💰 {formatPrice(activity.price, activity.priceNote)} · {slot.durationMin} мин
      </div>
      <div className="slot-row__foot" style={{ marginTop: 12 }}>
        <button className="btn btn--sm btn--secondary" onClick={() => navigate(`/activity/${activity.id}`)}>Подробнее</button>
        {registration.status === 'confirmed' && (
          <button className="btn btn--sm btn--danger" disabled={cancelling} onClick={onCancel}>
            {cancelling ? 'Отменяем…' : 'Отменить запись'}
          </button>
        )}
      </div>
    </div>
  );
}
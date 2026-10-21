import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ACTIVITY_TYPE_LABELS } from '@sport-nearby/shared';
import type { RegistrationView, ActivityDetail, ScheduleSlot } from '@sport-nearby/shared';
import { request, track } from '../api';
import { ErrorState, LoadingState } from '../components/StateViews';
import { RatingBadge } from '../components/Rating';
import { formatPrice, formatDateTime } from '../format';
import { useMaxNavigation } from '../session';

export function RegisterPage() {
  const { id, slotId } = useParams<{ id: string; slotId: string }>();
  const navigate = useNavigate();
  useMaxNavigation();

  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    request<ActivityDetail>(`/api/activities/${id}?lat=55.7558&lng=37.6173`)
      .then(setDetail)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadError && !detail) return <div className="sn-page"><ErrorState text={loadError} onRetry={() => window.location.reload()} /></div>;
  if (!detail) return <div className="sn-page"><LoadingState text="Загружаем форму записи…" /></div>;

  const slot = detail.schedule.find((s) => s.id === slotId);
  if (!slot) {
    return (
      <div className="sn-page">
        <ErrorState text="Выбранное занятие не найдено. Вернитесь к расписанию." onRetry={() => navigate(-1)} />
      </div>
    );
  }

  const { activity, facility, sport } = detail;
  const selectedSlot: ScheduleSlot = slot;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Укажите имя (минимум 2 символа)';
    if (phone && !/^[+\d][\d\s()-]{6,}$/.test(phone.trim())) next.phone = 'Проверьте номер телефона';
    if (!consent) next.consent = 'Необходимо согласие на запись';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const reg = await request<RegistrationView>('/api/registrations', {
        method: 'POST',
        body: JSON.stringify({
          slotId: selectedSlot.id,
          name: name.trim(),
          phone: phone.trim() || undefined,
          consent,
        }),
      });
      track('registration_completed', { slotId: selectedSlot.id, registrationId: reg.registration.id });
      sessionStorage.setItem('sport-nearby:lastRegistration', JSON.stringify({ registrationId: reg.registration.id, slot: selectedSlot, activity, facility, sport }));
      navigate(`/success/${reg.registration.id}`, { replace: true });
    } catch (err) {
      track('registration_failed', { slotId: selectedSlot.id });
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : 'Не удалось завершить регистрацию. Ваш выбор сохранён — попробуйте повторить.');
    }
  }

  return (
    <div className="sn-page">
      <div className="sn-header">
        <div>
          <h1 className="sn-title">Запись на занятие</h1>
          <p className="sn-subtitle">{sport.emoji} {activity.title} · {ACTIVITY_TYPE_LABELS[activity.type]}</p>
        </div>
      </div>

      <div className="card">
        <div className="slot-row__time">📅 {formatDateTime(slot)}</div>
        <div className="slot-row__sub">📍 {facility.name}, {facility.address}</div>
        <div className="slot-row__sub">💰 {formatPrice(activity.price, activity.priceNote)}</div>
        {slot.coach && (
          <div className="slot-row__sub">
            👤 Тренер: {slot.coach}
            {slot.coachRating && <RatingBadge agg={slot.coachRating} label="за тренера" />}
          </div>
        )}
        {detail.activityRating && (
          <div className="slot-row__sub">
            <RatingBadge agg={detail.activityRating} label="за тренировку" />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="reg-name">Имя *</label>
          <input id="reg-name" className="field__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" autoComplete="name" />
          {errors.name && <div className="field__error">{errors.name}</div>}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="reg-phone">Телефон (необязательно)</label>
          <input id="reg-phone" className="field__input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" inputMode="tel" autoComplete="tel" />
          {errors.phone && <div className="field__error">{errors.phone}</div>}
        </div>

        <div className="field">
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Я согласен(на) на обработку данных для записи на занятие *</span>
          </label>
          {errors.consent && <div className="field__error">{errors.consent}</div>}
        </div>

        {submitError && <div style={{ background: '#fff1f0', borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14, color: '#c2322a' }}>{submitError}</div>}

        <div className="flex" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--secondary" disabled={submitting} onClick={() => navigate(-1)}>Назад</button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Записываем…' : 'Подтвердить запись'}
          </button>
        </div>
      </form>
      <div style={{ height: 24 }} />
    </div>
  );
}
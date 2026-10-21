import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Activity, ScheduleSlot, Sport, SportFacility } from '@sport-nearby/shared';
import { request, track } from '../api';
import { formatPrice, formatDateTime } from '../format';
import { isInMax } from '../bridge';

interface LastReg {
  registrationId: string;
  slot: ScheduleSlot;
  activity: Activity;
  facility: SportFacility;
  sport: Sport;
}

function readLastReg(): LastReg | null {
  try {
    const raw = sessionStorage.getItem('sport-nearby:lastRegistration');
    return raw ? (JSON.parse(raw) as LastReg) : null;
  } catch {
    return null;
  }
}

export function SuccessPage() {
  const navigate = useNavigate();
  const [data] = useState<LastReg | null>(readLastReg);
  const [reminderState, setReminderState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  if (!data) {
    return (
      <div className="sn-page">
        <div className="state">
          <div className="state__icon">📋</div>
          <p className="state__text">Запись не найдена. Откройте «Мои записи».</p>
          <button className="btn btn--primary" onClick={() => navigate('/my')}>Мои записи</button>
        </div>
      </div>
    );
  }

  const { slot, activity, facility, sport } = data;
  const isOpen = slot.status === 'scheduled';

  async function addReminder() {
    setReminderState('loading');
    try {
      await request('/api/reminders', { method: 'POST', body: JSON.stringify({ slotId: slot.id }) });
      track('reminder_enabled', { slotId: slot.id });
      setReminderState('ok');
    } catch {
      setReminderState('error');
    }
  }

  return (
    <div className="sn-page">
      <div className="state" style={{ paddingBottom: 8 }}>
        <div className="state__icon">✅</div>
        <h1 className="state__title">Готово! Вы записаны на занятие</h1>
        <p className="state__text">Мы сохранили запись, организатор увидит вас в списке участников.</p>
      </div>

      <div className="card">
        <p className="card__title">{sport.emoji} {activity.title}</p>
        <div className="kv"><span className="kv__k">Тип</span><span>{activity.type === 'competition' ? 'Соревнование' : 'Занятие'}</span></div>
        <div className="kv"><span className="kv__k">Дата и время</span><span>{isOpen ? formatDateTime(slot) : '—'}</span></div>
        <div className="kv"><span className="kv__k">Адрес</span><span>{facility.name}, {facility.address}</span></div>
        <div className="kv"><span className="kv__k">Стоимость</span><span>{formatPrice(activity.price, activity.priceNote)}</span></div>
        <div className="kv"><span className="kv__k">Статус</span><span style={{ color: '#20a249' }}>Подтверждено ✓</span></div>
      </div>

      <div className="section">
        <button className="btn btn--primary" onClick={() => navigate('/my')}>Мои тренировки</button>
        <div style={{ height: 8 }} />
        <button className="btn btn--secondary" disabled={reminderState === 'loading'} onClick={addReminder}>
          {reminderState === 'ok' ? '✅ Напоминание добавлено' : reminderState === 'loading' ? 'Добавляем…' : '🔔 Добавить напоминание'}
        </button>
        {reminderState === 'error' && <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>Не удалось добавить напоминание. Попробуйте ещё раз.</p>}
        {reminderState === 'ok' && <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>Напоминание придёт в бот за 3 часа до занятия.</p>}
        <div style={{ height: 8 }} />
        <button className="btn btn--ghost" onClick={() => navigate('/')}>Найти ещё занятие</button>
      </div>

      <div className="demo-note">
        🧪 Демо-режим: запись хранится в локальной БД сервера и сохраняется между перезапусками.
        {!isInMax && <><br />ℹ️ Вы сейчас в браузере. В MAX здесь будет кнопка возврата в чат.</>}
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}
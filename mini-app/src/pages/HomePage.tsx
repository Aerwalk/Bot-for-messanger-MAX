import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SPORTS, DAY_OPTIONS, TIME_OF_DAY, DISTANCE_OPTIONS } from '@sport-nearby/shared';
import { track } from '../api';
import { loadPrefs, savePrefs } from '../store';

function chipOn(on: boolean) {
  return `chip${on ? ' chip--on' : ''}`;
}

export function HomePage() {
  const navigate = useNavigate();
  const prefs = loadPrefs();
  const [sportIds, setSportIds] = useState<string[]>(prefs.sportIds);
  const [day, setDay] = useState(prefs.day);
  const [timeOfDay, setTimeOfDay] = useState(prefs.timeOfDay);
  const [distance, setDistance] = useState<number>(prefs.maxDistanceKm || 5);

  useEffect(() => {
    track('miniapp_opened');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSport(id: string) {
    setSportIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function go() {
    const nextPrefs = { sportIds, day, timeOfDay, maxDistanceKm: distance };
    savePrefs(nextPrefs);
    track('search_started', { sportCount: sportIds.length, day, timeOfDay, maxDistanceKm: distance });
    const q = new URLSearchParams();
    if (sportIds.length) q.set('sportIds', sportIds.join(','));
    if (day && day !== 'any') q.set('day', day);
    if (timeOfDay) q.set('timeOfDay', timeOfDay);
    if (distance && distance > 0) q.set('maxDistanceKm', String(distance));
    navigate(`/results?${q.toString()}`);
  }

  return (
    <div className="sn-page sn-page--tab">
      <div className="sn-header">
        <div>
          <h1 className="sn-title">🏃 Спорт рядом</h1>
          <p className="sn-subtitle">Подберём занятие и запишем вас — за пару шагов</p>
        </div>
      </div>

      <div className="section">
        <div className="section__label">Что ищем?</div>
        <div className="chips">
          {SPORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={chipOn(sportIds.includes(s.id))}
              onClick={() => toggleSport(s.id)}
            >
              {s.emoji} {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__label">Когда?</div>
        <div className="chips">
          {DAY_OPTIONS.map((d) => (
            <button key={d.id} type="button" className={chipOn(day === d.id)} onClick={() => setDay(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__label">Какое время дня?</div>
        <div className="chips">
          {TIME_OF_DAY.map((t) => (
            <button key={t.id} type="button" className={chipOn(timeOfDay === t.id)} onClick={() => setTimeOfDay(timeOfDay === t.id ? '' : t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__label">Насколько близко?</div>
        <div className="chips">
          {DISTANCE_OPTIONS.map((d) => (
            <button key={d.id} type="button" className={chipOn(distance === (d.id === 'any' ? 0 : Number(d.id)))} onClick={() => setDistance(d.id === 'any' ? 0 : Number(d.id))}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <button className="btn btn--primary" onClick={go}>Найти спорт рядом</button>
      </div>

      <div className="demo-note">
        ℹ️ В MVP используется <b>Демонстрационные данные</b> (тестовый справочник). Источник и дата обновления указаны в карточках.
      </div>
    </div>
  );
}
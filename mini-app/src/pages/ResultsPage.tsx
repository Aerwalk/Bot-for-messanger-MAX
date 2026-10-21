import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ActivitySummary } from '@sport-nearby/shared';
import { request, track } from '../api';
import { ActivityCard } from '../components/ActivityCard';
import { ErrorState, LoadingState, EmptyState } from '../components/StateViews';

export function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<ActivitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(notifyView = false) {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams(location.search);
      q.set('lat', '55.7558');
      q.set('lng', '37.6173');
      const data = await request<{ items: ActivitySummary[] }>(`/api/activities?${q.toString()}`);
      setItems(data.items);
      if (notifyView) track('results_viewed', { count: data.items.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось получить список занятий');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  if (loading && !items) return <div className="sn-page"><LoadingState text="Ищем варианты рядом…" /></div>;
  if (error && !items) {
    return (
      <div className="sn-page">
        <ErrorState text={`Не удалось получить список занятий. Попробуйте ещё раз.`} onRetry={() => load(true)} />
      </div>
    );
  }

  return (
    <div className="sn-page sn-page--tab">
      <div className="sn-header">
        <div>
          <h1 className="sn-title">Результаты</h1>
          <p className="sn-subtitle">Найдено вариантов: {items?.length ?? 0}</p>
        </div>
      </div>

      {loading && <div className="skeleton" />}

      {!loading && items?.length === 0 && (
        <EmptyState
          icon="🔎"
          title="Ничего не найдено"
          text="По заданным параметрам ничего не найдено. Попробуйте увеличить радиус или изменить время."
          actions={
            <div className="flex">
              <button className="btn btn--secondary" onClick={() => navigate('/')}>Изменить время</button>
              <button className="btn btn--primary" onClick={() => { qSetRadius(); }}>Показать все рядом</button>
            </div>
          }
        />
      )}

      {items?.map((item) => <ActivityCard key={item.activity.id} item={item} />)}

      {items && items.length > 0 && (
        <div className="demo-note">
          🗂 Источник: <b>Демонстрационные данные MVP</b>. Данные обновляются при запуске сервера.
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  );

  function qSetRadius() {
    const q = new URLSearchParams(location.search);
    q.delete('maxDistanceKm');
    q.set('maxDistanceKm', '100');
    navigate(`/results?${q.toString()}`);
  }
}
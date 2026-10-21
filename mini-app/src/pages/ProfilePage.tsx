import { useState } from 'react';
import { DISTRICTS, SPORTS, CITY } from '@sport-nearby/shared';
import type { UserProfile } from '@sport-nearby/shared';
import { request, track } from '../api';
import { useSession } from '../session';

export function ProfilePage() {
  const { user } = useSession();
  return <ProfileInner key={user?.id} user={user} />;
}

function ProfileInner({ user }: { user: UserProfile | null }) {
  const [district, setDistrict] = useState(user?.district ?? '');
  const [sports, setSports] = useState<string[]>(user?.preferredSports ?? []);
  const [geo, setGeo] = useState<{ latitude: number; longitude: number } | null>(
    user?.latitude && user?.longitude ? { latitude: user.latitude, longitude: user.longitude } : null,
  );
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSport(id: string) {
    setSaved(false);
    setSports((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function save() {
    setSaved(false);
    setError(null);
    try {
      const patch: Record<string, unknown> = { district, preferredSports: sports };
      if (geo) {
        patch.latitude = geo.latitude;
        patch.longitude = geo.longitude;
      }
      await request<PatchMeResponse>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) });
      track('filter_applied', { profileSaved: true });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  }

  function requestGeo() {
    if (!('geolocation' in navigator)) {
      setGeoStatus('Геолокация недоступна в этом окружении');
      return;
    }
    setGeoBusy(true);
    setGeoStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setGeoBusy(false);
        setGeoStatus('Геопозиция получена — нажмите «Сохранить»');
        track('geo_requested');
      },
      () => {
        setGeoBusy(false);
        setGeoStatus('Не удалось получить геопозицию (нужно разрешение)');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="sn-page sn-page--tab">
      <div className="sn-header">
        <div>
          <h1 className="sn-title">Профиль</h1>
          <p className="sn-subtitle">{user?.name ?? 'Пользователь'}</p>
        </div>
      </div>

      <div className="card">
        <div className="section__label">Город</div>
        <div className="muted" style={{ marginBottom: 16 }}>{CITY} (демонстрационные данные)</div>

        <div className="section__label">Район</div>
        <div className="chips">
          {DISTRICTS.map((d) => (
            <button key={d} type="button" className={`chip${district === d ? ' chip--on' : ''}`} onClick={() => { setSaved(false); setDistrict(district === d ? '' : d); }}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section__label">Интересующие виды спорта</div>
        <div className="chips">
          {SPORTS.map((s) => (
            <button key={s.id} type="button" className={`chip${sports.includes(s.id) ? ' chip--on' : ''}`} onClick={() => toggleSport(s.id)}>
              {s.emoji} {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section__label">Геолокация</div>
        <div className="muted" style={{ marginBottom: 8 }}>
          {geo ? `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}` : 'Не указана'}
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={geoBusy}
          onClick={requestGeo}
          style={{ width: '100%' }}
        >
          {geoBusy ? 'Запрашиваем…' : geo ? '📍 Обновить геопозицию' : '📍 Запросить геопозицию'}
        </button>
        {geoStatus && <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>{geoStatus}</p>}
      </div>

      {error && <p className="field__error">{error}</p>}
      {saved && <p style={{ color: '#20a249', fontSize: 14 }}>✓ Настройки сохранены</p>}

      <button className="btn btn--primary" onClick={save}>Сохранить</button>

      <div style={{ height: 16 }} />
      <div className="demo-note">
        ℹ️ Это MVP: предпочтения хранятся локально в БД сервера. В боевой версии данные связываются с профилем MAX через initData.
      </div>
    </div>
  );
}

interface PatchMeResponse {
  user: UserProfile;
}
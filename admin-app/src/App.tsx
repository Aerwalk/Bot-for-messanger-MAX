import { useEffect, useState } from 'react';
import { api, Activity, ActivityRow, clearToken, Coach, Facility, getToken, RegistrationView, setToken, Slot, SportRef } from './api';

type View = 'login' | 'list' | 'edit' | 'slots' | 'sports' | 'facilities' | 'coaches' | 'registrations';
type Tab = 'list' | 'sports' | 'facilities' | 'coaches' | 'registrations';

export function App() {
  const [view, setView] = useState<View>('list');
  const [tab, setTab] = useState<Tab>('list');
  const [loginError, setLoginError] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [sports, setSports] = useState<SportRef[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [regs, setRegs] = useState<RegistrationView[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Partial<ActivityRow> | null>(null);
  const [slotsOf, setSlotsOf] = useState<ActivityRow | null>(null);
  const [regsOf, setRegsOf] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      setView('login');
      return;
    }
    api
      .me()
      .then((r) => setOrgName(r.organizer.name))
      .catch(() => {
        // Токен протух/недействителен — обязательно возвращаемся на форму входа,
        // иначе остаёмся на пустом списке с ошибкой UNAUTHORIZED.
        clearToken();
        setView('login');
      })
      .finally(() => setLoading(false));
    refreshList();
  }, []);

  async function refreshList() {
    const [acts, fac, spo, coa] = await Promise.all([api.activities(), api.facilities(), api.sports(), api.coaches()]);
    setItems(acts.items);
    setFacilities(fac.items);
    setSports(spo.items);
    setCoaches(coa.items);
  }

  async function openTab(t: Tab) {
    setTab(t);
    setView(t);
    if (t === 'registrations') {
      try {
        const r = await api.registrations();
        setRegs(r.items);
      } catch (e) {
        setError(String(e));
      }
    }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const r = await api.login(login, password);
      setToken(r.token);
      setOrgName(r.organizer.name);
      setLogin('');
      setPassword('');
      setView('list');
      await refreshList();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Ошибка входа');
    }
  }

  function logout() {
    clearToken();
    setView('login');
    setItems([]);
  }

  if (view === 'login') {
    return (
      <div className="login">
        <h1>🏃 Спорт рядом · Организатор</h1>
        <form onSubmit={doLogin}>
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин" autoComplete="username" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            autoComplete="current-password"
          />
          {loginError && <div className="error">{loginError}</div>}
          <button type="submit">Войти</button>
        </form>
      </div>
    );
  }

  if (loading) return <div className="page">Загрузка…</div>;

  if (view === 'slots' && slotsOf) {
    return (
      <SlotManager
        row={slotsOf}
        slots={slots}
        setSlots={setSlots}
        coaches={coaches}
        onBack={() => {
          setSlotsOf(null);
          setView('list');
        }}
        onError={setError}
      />
    );
  }

  if (view === 'edit') {
    return (
      <Editor
        initial={editing}
        facilities={facilities}
        sports={sports}
        onSave={async (row) => {
          const isNew = !row.activity?.id;
          const d: Partial<Activity> = row.activity ?? {};
          if (isNew) {
            await api.createActivity({
              facilityId: d.facilityId!,
              sportId: d.sportId!,
              type: d.type!,
              title: d.title!,
              description: d.description ?? '',
              ageCategory: d.ageCategory!,
              skillLevel: d.skillLevel!,
              price: d.price ?? 0,
              priceNote: d.priceNote ?? '',
              organizer: d.organizer ?? '',
              contact: d.contact ?? '',
            });
          } else {
            await api.updateActivity(d.id!, {
              title: d.title,
              type: d.type,
              description: d.description,
              price: d.price,
              status: d.status,
            });
          }
          setView('list');
          await refreshList();
        }}
        onCancel={() => {
          setEditing(null);
          setView('list');
        }}
        onError={setError}
      />
    );
  }

  if (view === 'sports') {
    return <SportsManager sports={sports} refetch={refreshList} onBack={() => setView('list')} onError={setError} />;
  }

  if (view === 'facilities') {
    return <FacilitiesManager facilities={facilities} refetch={refreshList} onBack={() => setView('list')} onError={setError} />;
  }

  if (view === 'coaches') {
    return <CoachesManager coaches={coaches} sports={sports} refetch={refreshList} onBack={() => setView('list')} onError={setError} />;
  }

  if (view === 'registrations') {
    return <RegistrationsView regs={regs} reloadAll={() => api.registrations().then((r) => setRegs(r.items))} onBack={() => setView('list')} onError={setError} />;
  }

  return (
    <div className="page">
      <header>
        <h1>Мероприятия</h1>
        <div className="who">
          <span>{orgName}</span>
          <button onClick={logout}>Выйти</button>
        </div>
      </header>
      <nav className="tabs">
        <button className={tab === 'list' ? 'active' : ''} onClick={() => openTab('list')}>Мероприятия</button>
        <button className={tab === 'sports' ? 'active' : ''} onClick={() => openTab('sports')}>Виды спорта</button>
        <button className={tab === 'facilities' ? 'active' : ''} onClick={() => openTab('facilities')}>Локации</button>
        <button className={tab === 'coaches' ? 'active' : ''} onClick={() => openTab('coaches')}>Тренеры</button>
        <button className={tab === 'registrations' ? 'active' : ''} onClick={() => openTab('registrations')}>Записи</button>
      </nav>
      {error && (
        <div className="error">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}
      <div className="toolbar">
        <button
          onClick={async () => {
            setEditing(null);
            setView('edit');
          }}
        >
          + Новое мероприятие
        </button>
        <button onClick={async () => { try { await refreshList(); } catch (e) { setError(String(e)); } }}>Обновить</button>
      </div>
      <div className="cards">
        {items.map((row) => (
          <div className="card" key={row.activity.id}>
            <div className="card-title">
              {row.sport?.emoji ?? ''} {row.activity.title}
            </div>
            <div className="card-sub">
              {row.facility?.name ?? row.activity.facilityId} · {row.activity.price} ₽
              {row.activity.status === 'inactive' ? ' · неактивно' : ''}
            </div>
            <div className="card-actions">
              <button
                onClick={() => {
                  setSlotsOf(row);
                  setView('slots');
                  api.slots(row.activity.id).then((r) => setSlots(r.items)).catch((e) => setError(String(e)));
                }}
              >
                Расписание
              </button>
              <button
                onClick={async () => {
                  setRegsOf(row.activity.id);
                  setView('registrations');
                  try {
                    const r = await api.registrations(row.activity.id);
                    setRegs(r.items);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Записались
              </button>
              <button
                onClick={() => {
                  setEditing(row);
                  setView('edit');
                }}
              >
                Изменить
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (!confirm(`Удалить «${row.activity.title}»?`)) return;
                  try {
                    await api.deleteActivity(row.activity.id);
                    await refreshList();
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SportsManager(props: {
  sports: SportRef[];
  refetch: () => Promise<void>;
  onBack: () => void;
  onError: (e: string) => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏃');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createSport({ name, emoji });
      setName('');
      await props.refetch();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Виды спорта</h1>
        <button onClick={props.onBack}>← Назад</button>
      </header>
      <form className="editor" onSubmit={add}>
        <label>Название</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Лыжи" />
        <label>Эмодзи</label>
        <input required value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="⛷️" maxLength={4} />
        <button type="submit" disabled={busy}>{busy ? 'Сохранение…' : 'Добавить вид спорта'}</button>
      </form>
      <div className="cards">
        {props.sports.map((s) => (
          <div className="card" key={s.id}>
            <div className="card-title">{s.emoji} {s.name}</div>
            <div className="card-sub">id: {s.id}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FacilitiesManager(props: {
  facilities: Facility[];
  refetch: () => Promise<void>;
  onBack: () => void;
  onError: (e: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('Клуб / зал');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Москва');
  const [district, setDistrict] = useState('');
  const [latitude, setLatitude] = useState('55.7558');
  const [longitude, setLongitude] = useState('37.6173');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createFacility({
        name, type, address, city, district,
        latitude: Number(latitude), longitude: Number(longitude), description,
      });
      setName('');
      setAddress('');
      setDistrict('');
      setDescription('');
      await props.refetch();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Локации</h1>
        <button onClick={props.onBack}>← Назад</button>
      </header>
      <form className="editor" onSubmit={add}>
        <label>Название</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Ледовый дворец" />
        <label>Тип</label>
        <input value={type} onChange={(e) => setType(e.target.value)} />
        <label>Адрес</label>
        <input required value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="row">
          <div>
            <label>Город</label>
            <input required value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label>Район</label>
            <input required value={district} onChange={(e) => setDistrict(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div>
            <label>Широта</label>
            <input type="number" step="0.0001" required value={latitude} onChange={(e) => setLatitude(e.target.value)} />
          </div>
          <div>
            <label>Долгота</label>
            <input type="number" step="0.0001" required value={longitude} onChange={(e) => setLongitude(e.target.value)} />
          </div>
        </div>
        <label>Описание</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <button type="submit" disabled={busy}>{busy ? 'Сохранение…' : 'Добавить локацию'}</button>
      </form>
      <div className="cards">
        {props.facilities.map((f) => (
          <div className="card" key={f.id}>
            <div className="card-title">{f.name}</div>
            <div className="card-sub">
              {f.city} · {f.district} · {f.address} · {f.latitude}, {f.longitude}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoachesManager(props: {
  coaches: Coach[];
  sports: SportRef[];
  refetch: () => Promise<void>;
  onBack: () => void;
  onError: (e: string) => void;
}) {
  const [name, setName] = useState('');
  const [sportId, setSportId] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createCoach({ name, sportId: sportId || undefined, bio: bio || undefined });
      setName('');
      setBio('');
      await props.refetch();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Тренеры</h1>
        <button onClick={props.onBack}>← Назад</button>
      </header>
      <form className="editor" onSubmit={add}>
        <label>Имя тренера</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Алексей Морозов" />
        <label>Вид спорта (необязательно)</label>
        <select value={sportId} onChange={(e) => setSportId(e.target.value)}>
          <option value="">— Не указан —</option>
          {props.sports.map((s) => (
            <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
          ))}
        </select>
        <label>О себе (необязательно)</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} placeholder="Разряды, стаж, специализация" />
        <button type="submit" disabled={busy}>{busy ? 'Сохранение…' : 'Добавить тренера'}</button>
      </form>
      <div className="cards">
        {props.coaches.map((c) => {
          const sport = props.sports.find((s) => s.id === c.sportId);
          return (
            <div className="card" key={c.id}>
              <div className="card-title">👤 {c.name}</div>
              <div className="card-sub">{sport ? `${sport.emoji} ${sport.name}` : 'Вид спорта не указан'}</div>
              {c.bio && <div className="card-sub">{c.bio}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegistrationsView(props: {
  regs: RegistrationView[];
  reloadAll?: () => Promise<unknown>;
  onBack: () => void;
  onError: (e: string) => void;
}) {
  return (
    <div className="page">
      <header>
        <h1>Записи на мероприятия</h1>
        <button onClick={props.onBack}>← Назад</button>
      </header>
      {props.regs.length === 0 && <div className="muted">Пока никто не записан.</div>}
      <div className="cards">
        {props.regs.map((v) => (
          <div className="card" key={v.registration.id}>
            <div className="card-title">
              {v.sport?.emoji ?? ''} {v.registration.name}{' '}
              {v.registration.status === 'cancelled' ? <span className="badge">отменено</span> : null}
            </div>
            <div className="card-sub">
              {v.activity?.title ?? ''} · {v.slot?.date ?? ''} {v.slot?.startTime ?? ''}
            </div>
            <div className="card-sub">
              Телефон: {v.registration.phone || '—'}
            </div>
            <div className="card-sub">
              Тренер: {v.slot?.coach || '—'}
            </div>
            {v.rating && (
              <div className="card-sub" style={{ color: '#1d6f2f' }}>
                ⭐ Оценка: тренировка {v.rating.activityScore}/5{v.rating.coachScore ? ` · тренер ${v.rating.coachScore}/5` : ''}{v.rating.comment ? ` · «${v.rating.comment}»` : ''}
              </div>
            )}
            <div className="card-sub">
              Дата записи: {formatDate(v.registration.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  // Наивные ISO-строки (без Z/оффсета) = московское время (UTC+3): показываем как есть
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(iso)) {
    return iso.slice(0, 16).replace('T', ' ');
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function SlotManager(props: {
  row: ActivityRow;
  slots: Slot[];
  setSlots: (s: Slot[]) => void;
  coaches: Coach[];
  onBack: () => void;
  onError: (e: string) => void;
}) {
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [capacity, setCapacity] = useState('10');
  const [coachId, setCoachId] = useState('');
  const [coach, setCoach] = useState('');

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    try {
      const sl = await api.createSlot(props.row.activity.id, {
        date, startTime: start, endTime: end, capacity: Number(capacity),
        coach: coach || (props.coaches.find((c) => c.id === coachId)?.name ?? ''),
        coachId: coachId || undefined,
      });
      props.setSlots([...props.slots, sl].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));
      setDate('');
      setStart('');
      setEnd('');
      setCoachId('');
      setCoach('');
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  function pickCoach(id: string) {
    setCoachId(id);
    const c = props.coaches.find((x) => x.id === id);
    setCoach(c?.name ?? '');
  }

  return (
    <div className="page">
      <header>
        <h1>Расписание · {props.row.sport?.emoji} {props.row.activity.title}</h1>
        <button onClick={props.onBack}>← Назад</button>
      </header>
      <form className="slot-form" onSubmit={addSlot}>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
        <input type="number" min={1} required value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Мест" />
        <select value={coachId} onChange={(e) => pickCoach(e.target.value)}>
          <option value="">— Тренер на выбор —</option>
          {props.coaches.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input value={coach} onChange={(e) => { setCoach(e.target.value); setCoachId(''); }} placeholder="Тренер (или введите вручную)" />
        <button type="submit">Добавить слот</button>
      </form>
      <div className="cards">
        {props.slots.map((sl) => (
          <div className="card" key={sl.id}>
            <div className="card-title">
              {sl.date} · {sl.startTime}–{sl.endTime}
            </div>
            <div className="card-sub">
              {sl.coach} · записано {sl.registeredCount}/{sl.capacity} · {sl.durationMin} мин
            </div>
            <div className="card-actions">
              <button
                className="danger"
                onClick={async () => {
                  if (!confirm('Удалить слот?')) return;
                  try {
                    await api.deleteSlot(sl.id);
                    props.setSlots(props.slots.filter((x) => x.id !== sl.id));
                  } catch (err) {
                    props.onError(String(err));
                  }
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Editor(props: {
  initial: Partial<ActivityRow> | null;
  facilities: Facility[];
  sports: SportRef[];
  onSave: (row: Partial<ActivityRow>) => Promise<void>;
  onCancel: () => void;
  onError: (e: string) => void;
}) {
  const a = props.initial?.activity;
  const [title, setTitle] = useState(a?.title ?? '');
  const [facilityId, setFacilityId] = useState(a?.facilityId ?? props.facilities[0]?.id ?? '');
  const [sportId, setSportId] = useState(a?.sportId ?? props.sports[0]?.id ?? '');
  const [type, setType] = useState(a?.type ?? 'training');
  const [description, setDescription] = useState(a?.description ?? '');
  const [price, setPrice] = useState(String(a?.price ?? 0));
  const [status, setStatus] = useState(a?.status ?? 'active');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await props.onSave({ activity: { id: a?.id ?? '', facilityId, sportId, type, title, description, price: Number(price) || 0, status } } as Partial<ActivityRow>);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>{a?.id ? 'Изменить мероприятие' : 'Новое мероприятие'}</h1>
        <button onClick={props.onCancel}>← Назад</button>
      </header>
      <form className="editor" onSubmit={save}>
        <label>Название</label>
        <input required value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Объект</label>
        <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} disabled={!!a?.id}>
          {props.facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {f.district}
            </option>
          ))}
        </select>
        <label>Вид спорта</label>
        <select value={sportId} onChange={(e) => setSportId(e.target.value)} disabled={!!a?.id}>
          {props.sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.name}
            </option>
          ))}
        </select>
        <label>Тип</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="section">Секция</option>
          <option value="place">Площадка</option>
          <option value="training">Тренировка</option>
          <option value="competition">Соревнование</option>
        </select>
        <label>Описание</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <label>Цена, ₽</label>
        <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        <label>Статус</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Активно</option>
          <option value="inactive">Неактивно</option>
        </select>
        <button type="submit" disabled={busy}>
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </form>
    </div>
  );
}
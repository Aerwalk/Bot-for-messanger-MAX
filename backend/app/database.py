"""Подключение к PostgreSQL, создание схемы и сид демо-данных."""

import threading
from datetime import datetime

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from .config import config
from .models import Activity, Base, Coach, Facility, Organizer, Slot, Sport

_LOCK = threading.Lock()
_engine = None
_SessionLocal = None
_initialized = False


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(config.database_url, pool_pre_ping=True)
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _SessionLocal


def session() -> Session:
    return get_session_factory()()


def init_db(seed: bool = True, admin: bool = True) -> None:
    """Создаёт таблицы, мигрирует схему и (при необходимости) сеет демо-данные."""
    global _initialized
    with _LOCK:
        Base.metadata.create_all(get_engine())
        _migrate_columns()
        if seed:
            _seed_defaults()
        if admin:
            _created_admin_if_needed()
        _initialized = True


def _coach_id_for(name: str) -> str:
    """Стабильный id тренера по имени (для сида и привязки старых слотов)."""
    import hashlib
    return "coach_" + hashlib.md5(name.encode("utf-8")).hexdigest()[:12]


def _migrate_columns() -> None:
    """Добавляет новые колонки в существующие таблицы (лёгкая миграция без Alembic)."""
    from sqlalchemy import inspect, text

    with session() as s:
        engine = s.get_bind()
        inspector = inspect(engine)
        if "activities" not in inspector.get_table_names():
            return
        existing = {c["name"].lower() for c in inspector.get_columns("activities")}
        dialect = s.get_bind().dialect.name
        for col, col_type in (
            ("createdBy", "VARCHAR(40)"),
            ("createdAt", "VARCHAR(40)"),
            ("updatedAt", "VARCHAR(40)"),
        ):
            if col.lower() in existing:
                continue
            if dialect == "sqlite":
                ddl = f"ALTER TABLE activities ADD COLUMN {col} {col_type}"
            else:
                ddl = f"ALTER TABLE activities ADD COLUMN IF NOT EXISTS {col} {col_type}"
            try:
                s.execute(text(ddl))
            except Exception:
                if col not in {c["name"] for c in inspector.get_columns("activities")}:
                    raise
        s.commit()

    with session() as s:
        engine = s.get_bind()
        inspector = inspect(engine)
        if "slots" not in inspector.get_table_names():
            return
        slot_cols = {c["name"].lower() for c in inspector.get_columns("slots")}
        dialect = s.get_bind().dialect.name
        if "coachid" not in slot_cols:
            if dialect == "sqlite":
                ddl = "ALTER TABLE slots ADD COLUMN coachId VARCHAR(40)"
            else:
                ddl = "ALTER TABLE slots ADD COLUMN IF NOT EXISTS coachId VARCHAR(40)"
            s.execute(text(ddl))
        s.commit()

    with session() as s:
        engine = s.get_bind()
        inspector = inspect(engine)
        if "users" not in inspector.get_table_names():
            return
        user_cols = {c["name"].lower() for c in inspector.get_columns("users")}
        dialect = s.get_bind().dialect.name
        for col, col_type in (
            ("latitude", "DOUBLE PRECISION"),
            ("longitude", "DOUBLE PRECISION"),
        ):
            if col in user_cols:
                continue
            if dialect == "sqlite":
                ddl = f"ALTER TABLE users ADD COLUMN {col} REAL"
            else:
                ddl = f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {col_type}"
            s.execute(text(ddl))
        s.commit()


def _seed_defaults() -> None:
    """Идемпотентный сид: добавляет недостающие дефолтные записи (по id).

    В отличие от старого «только на пустой БД», дефолтные данные докидываются,
    даже если в PostgreSQL уже есть другие записи (например, созданные организатором).
    """
    from .seed import build_seed

    with session() as s:
        data = build_seed(datetime.now())
        existing_sports = set(s.scalars(select(Sport.id)))
        for sp in data.sports:
            if sp.id not in existing_sports:
                s.add(Sport(id=sp.id, name=sp.name, emoji=sp.emoji))
        existing_facilities = set(s.scalars(select(Facility.id)))
        for f in data.facilities:
            if f.id not in existing_facilities:
                s.add(Facility(
                    id=f.id, name=f.name, type=f.type, address=f.address, city=f.city,
                    district=f.district, latitude=f.latitude, longitude=f.longitude,
                    description=f.description, source=f.source, sourceUpdatedAt=f.sourceUpdatedAt,
                ))
        existing_activities = set(s.scalars(select(Activity.id)))
        for a in data.activities:
            if a.id not in existing_activities:
                s.add(Activity(
                    id=a.id, facilityId=a.facilityId, sportId=a.sportId, type=a.type,
                    title=a.title, description=a.description, ageCategory=a.ageCategory,
                    skillLevel=a.skillLevel, price=a.price, priceNote=a.priceNote,
                    organizer=a.organizer, contact=a.contact, status=a.status,
                ))
        existing_slots = set(s.scalars(select(Slot.id)))
        for sl in data.slots:
            if sl.id not in existing_slots:
                s.add(Slot(
                    id=sl.id, activityId=sl.activityId, date=sl.date, startTime=sl.startTime,
                    endTime=sl.endTime, capacity=sl.capacity, registeredCount=sl.registeredCount,
                    status=sl.status, coach=sl.coach, coachId=_coach_id_for(sl.coach) if sl.coach else None,
                    durationMin=sl.durationMin,
                ))
        existing_coaches = set(s.scalars(select(Coach.id)))
        coach_names = sorted({sl.coach for sl in data.slots if sl.coach})
        for name in coach_names:
            cid = _coach_id_for(name)
            if cid not in existing_coaches:
                s.add(Coach(id=cid, organizerId="org_admin", name=name, sportId=None, bio=None))
        s.commit()


def reset_config_for_test() -> None:
    """Сбрасывает кеш движка (для тестов): движок попадает заново."""
    global _engine, _SessionLocal, _initialized
    _engine = None
    _SessionLocal = None
    _initialized = False


def seed_defaults_from_legacy() -> None:
    """Импорт демо-данных из локального db.json (если существует) или из build_seed.

    Докидывает недостающие записи по id — используется и при старте, и вручную.
    """
    _seed_defaults()


def _created_admin_if_needed() -> None:
    import bcrypt as bcrypt_mod

    with session() as s:
        if s.scalar(select(Organizer.id).where(Organizer.login == config.admin_login)) is not None:
            return
        s.add(Organizer(
            id="org_admin",
            login=config.admin_login,
            password_hash=bcrypt_mod.hashpw(config.admin_password.encode("utf-8"), bcrypt_mod.gensalt()).decode("utf-8"),
            name="Организатор мероприятий",
        ))
        s.commit()

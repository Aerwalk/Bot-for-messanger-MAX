"""Демонстрационный набор данных («Спорт рядом»).

Портирован 1-в-1 из TypeScript-версии (shared/types.ts + backend/src/seed.ts):
8 видов спорта, 10 объектов, 12 активностей, расписание на 7 дней.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import List, Optional

from .config import DEMO_DATA_SOURCE


def iso(d: date) -> str:
    return d.isoformat()


def plus_days(base: date, offset: int) -> date:
    return base + timedelta(days=offset)


def minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m or 0)


def iso_now() -> str:
    return datetime.now().isoformat()


@dataclass
class Sport:
    id: str
    name: str
    emoji: str


@dataclass
class SportFacility:
    id: str
    name: str
    type: str
    address: str
    city: str
    district: str
    latitude: float
    longitude: float
    description: str
    source: str
    sourceUpdatedAt: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "address": self.address,
            "city": self.city,
            "district": self.district,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "description": self.description,
            "source": self.source,
            "sourceUpdatedAt": self.sourceUpdatedAt,
        }


@dataclass
class Activity:
    id: str
    facilityId: str
    sportId: str
    type: str
    title: str
    description: str
    ageCategory: str
    skillLevel: str
    price: int
    priceNote: str
    organizer: str
    contact: str
    status: str = "active"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "facilityId": self.facilityId,
            "sportId": self.sportId,
            "type": self.type,
            "title": self.title,
            "description": self.description,
            "ageCategory": self.ageCategory,
            "skillLevel": self.skillLevel,
            "price": self.price,
            "priceNote": self.priceNote,
            "organizer": self.organizer,
            "contact": self.contact,
            "status": self.status,
        }


@dataclass
class ScheduleSlot:
    id: str
    activityId: str
    date: str
    startTime: str
    endTime: str
    capacity: int
    registeredCount: int
    status: str
    coach: str
    durationMin: int

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "activityId": self.activityId,
            "date": self.date,
            "startTime": self.startTime,
            "endTime": self.endTime,
            "capacity": self.capacity,
            "registeredCount": self.registeredCount,
            "status": self.status,
            "coach": self.coach,
            "durationMin": self.durationMin,
        }


@dataclass
class SlotSpec:
    dayOffset: int
    start: str
    end: str
    capacity: Optional[int] = None
    registered: int = 0
    coach: Optional[str] = None
    cancelled: bool = False


def build_slots(
    activity_id: str,
    specs: List[SlotSpec],
    default_coach: str,
    default_capacity: int,
    base: date,
) -> List[ScheduleSlot]:
    slots = []
    for spec in specs:
        start_min = minutes(spec.start)
        end_min = minutes(spec.end)
        slots.append(
            ScheduleSlot(
                id=f"slot_{activity_id}_{spec.dayOffset}_{spec.start.replace(':', '')}",
                activityId=activity_id,
                date=iso(plus_days(base, spec.dayOffset)),
                startTime=spec.start,
                endTime=spec.end,
                capacity=spec.capacity if spec.capacity is not None else default_capacity,
                registeredCount=spec.registered,
                status="cancelled" if spec.cancelled else "scheduled",
                coach=spec.coach if spec.coach is not None else default_coach,
                durationMin=end_min - start_min,
            )
        )
    return slots


@dataclass
class Database:
    sports: List[Sport]
    facilities: List[SportFacility]
    activities: List[Activity]
    slots: List[ScheduleSlot]
    registrations: list = field(default_factory=list)
    favorites: list = field(default_factory=list)
    users: list = field(default_factory=list)
    reminders: list = field(default_factory=list)
    events: list = field(default_factory=list)
    meta: dict = field(default_factory=dict)


def _facility(
    fid: str,
    name: str,
    district: str,
    address: str,
    lat: float,
    lng: float,
    description: str,
    ftype: str = "Клуб / зал",
    now: Optional[str] = None,
) -> SportFacility:
    return SportFacility(
        id=fid,
        name=name,
        type=ftype,
        address=address,
        city="Москва",
        district=district,
        latitude=lat,
        longitude=lng,
        description=description,
        source=DEMO_DATA_SOURCE,
        sourceUpdatedAt=now or iso_now(),
    )


def _activity(
    aid: str,
    facility_id: str,
    sport_id: str,
    atype: str,
    title: str,
    description: str,
    opts: Optional[dict] = None,
) -> Activity:
    opts = opts or {}
    return Activity(
        id=aid,
        facilityId=facility_id,
        sportId=sport_id,
        type=atype,
        title=title,
        description=description,
        ageCategory=opts.get("age", "adult"),
        skillLevel=opts.get("level", "beginner"),
        price=opts.get("price", 0),
        priceNote=opts.get("priceNote", "Разовое занятие"),
        organizer=opts.get("organizer", "Спортивная организация"),
        contact=opts.get("contact", "+7 (000) 000-00-00 (демо)"),
        status="active",
    )


def build_seed(now: Optional[datetime] = None) -> Database:
    now = now or datetime.now()
    base = now.date()
    now_iso = now.isoformat()

    sports = [
        Sport("football", "Футбол", "⚽"),
        Sport("basketball", "Баскетбол", "🏀"),
        Sport("swimming", "Плавание", "🏊"),
        Sport("tennis", "Теннис", "🎾"),
        Sport("running", "Бег", "🏃"),
        Sport("yoga", "Йога", "🧘"),
        Sport("volleyball", "Волейбол", "🏐"),
        Sport("fitness", "Фитнес", "💪"),
    ]

    facilities = [
        _facility("fc_forma", "Фитнес-клуб «Форма»", "Хамовники", "ул. Пречистенка, 40", 55.741, 37.599,
                  "Современный фитнес-клуб: тренажёрный зал, групповые программы, персональные тренировки.", now=now_iso),
        _facility("pool_volna", "Бассейн «Волна»", "Лефортово", "Госпитальная наб., 4", 55.762, 37.705,
                  "25-метровый бассейн с дорожками, группы для взрослых и детей, тренировки с тренером.", "Бассейн", now_iso),
        _facility("court_center", "Теннисный клуб «Корт»", "Пресненский", "ул. Красная Пресня, 9", 55.761, 37.565,
                  "Крытые корты, аренда, группы для начинающих и продолжающих.", "Теннисный клуб", now_iso),
        _facility("fc_forward", "Футбольная секция «Форвард»", "Сокольники", "ул. Стромынка, 4", 55.79, 37.678,
                  "Тренировки для взрослых в крытом манеже: футзал, техника, игровая практика.", "Спортивный комплекс", now_iso),
        _facility("hall_height", "Баскетбольный зал «Высота»", "Тверской", "ул. Тверская, 25", 55.768, 37.604,
                  "Зал с разметкой, любительская баскетбольная секция, тренировки по вечерам.", now=now_iso),
        _facility("studio_prana", "Йога-студия «Прана»", "Арбат", "ул. Новый Арбат, 21", 55.752, 37.592,
                  "Групповые занятия йогой для всех уровней: хатха, виньяса, восстановительная практика.", "Студия", now_iso),
        _facility("vc_setka", "Волейбольный центр «Сетка»", "Кунцево", "ул. Молодогвардейская, 41", 55.73, 37.442,
                  "Игровой зал для любительского волейбола, сборные группы, спарринги.", now=now_iso),
        _facility("run_tempo", "Беговой клуб «Темп»", "Хамовники", "Фрунзенская наб., 30", 55.731, 37.572,
                  "Клуб любительского бега: тренировки по набережной, план подготовки для новичков.", "Клуб", now_iso),
        _facility("wq_krepysh", "Площадка воркаута «Крепыш»", "Лужники", "Парк «Лужники», ул. Лужники, 24", 55.716, 37.562,
                  "Открытая площадка с турниками и брусьями для самостоятельных тренировок.", "Открытая площадка", now_iso),
        _facility("run_luzhniki", "Забег «Ночная десятка»", "Лужники", "Олимпийский комплекс «Лужники»", 55.715, 37.554,
                  "Ночной массовый забег на 10 км по территории Лужников. Медали всем финишировавшим.", "Соревнование", now_iso),
    ]

    activities = [
        _activity("a_football_adult", "fc_forward", "football", "section", "Футбол · взрослая секция",
                  "Крытый манеж, два тренировочных дня + субботний игровой день.",
                  {"age": "adult", "level": "beginner", "price": 400, "organizer": "СФК «Форвард»", "contact": "+7 (495) 100-20-30 (демо)"}),
        _activity("a_basketball_am", "hall_height", "basketball", "section", "Баскетбол · любительская секция",
                  "Сборная любительская группа, тренировки по вечерам в центре города.",
                  {"age": "adult", "level": "beginner", "price": 500, "organizer": "БК «Высота»", "contact": "+7 (495) 200-30-40 (демо)"}),
        _activity("a_swim_adult", "pool_volna", "swimming", "training", "Плавание · группа с тренером",
                  "Занятия в 25-метровом бассейне. Два варианта времени: утро и вечер.",
                  {"age": "adult", "level": "beginner", "price": 600, "organizer": "Бассейн «Волна»", "contact": "+7 (495) 300-40-50 (демо)"}),
        _activity("a_swim_kids", "pool_volna", "swimming", "section", "Плавание · детская группа",
                  "Обучение плаванию для детей 6–12 лет, группы до 10 человек.",
                  {"age": "child", "level": "beginner", "price": 500, "organizer": "Бассейн «Волна»", "contact": "+7 (495) 300-40-50 (демо)"}),
        _activity("a_tennis_group", "court_center", "tennis", "training", "Теннис · групповая тренировка",
                  "Группы на 4 человека, корт в помещении, ракетки можно взять в клубе.",
                  {"age": "adult", "level": "beginner", "price": 1200, "organizer": "ТК «Корт»", "contact": "+7 (495) 400-50-60 (демо)"}),
        _activity("a_tennis_pro", "court_center", "tennis", "training", "Теннис · индивидуальная тренировка",
                  "Занятие с тренером один на один, разбор техники.",
                  {"age": "adult", "level": "intermediate", "price": 2500, "priceNote": "Разовое занятие 60 мин", "organizer": "ТК «Корт»", "contact": "+7 (495) 400-50-60 (демо)"}),
        _activity("a_fitness_group", "fc_forma", "fitness", "training", "Фитнес · групповая тренировка",
                  "Комбинированная силовая тренировка для всех уровней подготовки.",
                  {"age": "adult", "level": "any", "price": 450, "organizer": "ФК «Форма»", "contact": "+7 (495) 500-60-70 (демо)"}),
        _activity("a_yoga_morning", "studio_prana", "yoga", "training", "Йога · утренняя практика",
                  "Утренняя практика хатха-йоги. Подходит новичкам.",
                  {"age": "adult", "level": "beginner", "price": 350, "organizer": "Студия «Прана»", "contact": "+7 (495) 600-70-80 (демо)"}),
        _activity("a_run_club", "run_tempo", "running", "training", "Бег · клубная тренировка",
                  "Легкая интервальная тренировка по набережной, маршрут 6–8 км.",
                  {"age": "adult", "level": "intermediate", "price": 0, "priceNote": "Бесплатно", "organizer": "Клуб «Темп»", "contact": "+7 (495) 700-80-90 (демо)"}),
        _activity("a_run_ten", "run_luzhniki", "running", "competition", "Забег «Ночная десятка» · 10 км",
                  "Массовый забег по Лужникам. Регистрация открыта, стартовый пакет включает номер и браслет.",
                  {"age": "adult", "level": "any", "price": 1500, "priceNote": "Стартовый взнос", "organizer": "Клуб «Темп»", "contact": "+7 (495) 700-80-90 (демо)"}),
        _activity("a_voley_sat", "vc_setka", "volleyball", "training", "Волейбол · игровая тренировка",
                  "Игровые тренировки в формате открытой сетки: собираем команды на месте.",
                  {"age": "adult", "level": "intermediate", "price": 300, "organizer": "ВЦ «Сетка»", "contact": "+7 (495) 800-90-10 (демо)"}),
        _activity("a_workout_free", "wq_krepysh", "basketball", "place", "Открытая площадка воркаута",
                  "Турники, брусья, баскетбольное кольцо. Самостоятельные тренировки без записи к тренеру.",
                  {"age": "any", "level": "any", "price": 0, "priceNote": "Бесплатно", "organizer": "Парк «Лужники»", "contact": "Администрация парка (демо)"}),
    ]

    slots = (
        # Футбол — секция, 3 слота
        build_slots("a_football_adult", [
            SlotSpec(1, "19:00", "20:30", coach="И. Соколов"),
            SlotSpec(3, "19:00", "20:30", coach="И. Соколов"),
            SlotSpec(6, "11:00", "12:30", coach="А. Морозов"),
        ], "И. Соколов", 20, base)
        + build_slots("a_basketball_am", [
            SlotSpec(2, "18:00", "19:30", coach="Д. Лебедев"),
            SlotSpec(4, "18:00", "19:30", coach="Д. Лебедев"),
            SlotSpec(5, "12:00", "13:30", coach="П. Виноградов"),
        ], "Д. Лебедев", 16, base)
        # Плавание взрослые — 4 слота, один полный
        + build_slots("a_swim_adult", [
            SlotSpec(0, "07:00", "08:00", coach="Е. Гусева"),
            SlotSpec(1, "19:00", "20:00", coach="Е. Гусева", registered=12),
            SlotSpec(3, "07:00", "08:00", coach="Е. Гусева"),
            SlotSpec(5, "19:00", "20:00", coach="М. Крылова"),
        ], "Е. Гусева", 12, base)
        + build_slots("a_swim_kids", [
            SlotSpec(1, "16:00", "17:00", coach="Н. Агеева"),
            SlotSpec(3, "16:00", "17:00", coach="Н. Агеева"),
            SlotSpec(5, "11:00", "12:00", coach="Н. Агеева"),
        ], "Н. Агеева", 10, base)
        + build_slots("a_tennis_group", [
            SlotSpec(1, "20:00", "21:15", coach="В. Орлов"),
            SlotSpec(3, "20:00", "21:15", coach="В. Орлов"),
            SlotSpec(6, "18:00", "19:15", coach="К. Смирнова"),
        ], "В. Орлов", 8, base)
        + build_slots("a_tennis_pro", [
            SlotSpec(2, "12:00", "13:00", capacity=1, registered=1),
            SlotSpec(4, "14:00", "15:00", capacity=1),
        ], "В. Орлов", 1, base)
        # Фитнес групповая — 4 слота, один полный
        + build_slots("a_fitness_group", [
            SlotSpec(0, "18:00", "19:00", coach="О. Фадеева"),
            SlotSpec(1, "20:00", "21:00", coach="О. Фадеева"),
            SlotSpec(2, "18:00", "19:00", coach="О. Фадеева", registered=12),
            SlotSpec(4, "20:00", "21:00", coach="И. Черных"),
        ], "О. Фадеева", 12, base)
        + build_slots("a_yoga_morning", [
            SlotSpec(1, "08:30", "09:30", coach="А. Шаповалова"),
            SlotSpec(4, "08:30", "09:30", coach="А. Шаповалова"),
            SlotSpec(6, "10:00", "11:00", coach="Л. Демидова"),
        ], "А. Шаповалова", 15, base)
        + build_slots("a_run_club", [
            SlotSpec(2, "19:00", "20:00", coach="М. Игнатьев"),
            SlotSpec(4, "19:00", "20:00", coach="М. Игнатьев"),
        ], "М. Игнатьев", 30, base)
        # Забег — 1 слот, частично заполнен
        + build_slots("a_run_ten", [
            SlotSpec(7, "22:00", "23:30", capacity=100, registered=63),
        ], "Организатор", 100, base)
        # Волейбол — 3 слота, один отменён
        + build_slots("a_voley_sat", [
            SlotSpec(0, "17:00", "19:00", coach="С. Козлов"),
            SlotSpec(2, "19:00", "21:00", coach="С. Козлов", cancelled=True),
            SlotSpec(6, "17:00", "19:00", coach="С. Козлов"),
        ], "С. Козлов", 24, base)
        + build_slots("a_workout_free", [
            SlotSpec(0, "10:00", "13:00", capacity=40),
            SlotSpec(2, "16:00", "19:00", capacity=40),
            SlotSpec(5, "10:00", "22:00", capacity=60),
        ], "Инструктор парка", 40, base)
    )

    return Database(
        sports=sports,
        facilities=facilities,
        activities=activities,
        slots=slots,
        registrations=[],
        favorites=[],
        users=[],
        reminders=[],
        events=[],
        meta={
            "source": DEMO_DATA_SOURCE,
            "refreshedAt": now_iso,
            "generatedDays": 7,
        },
    )


def database_to_dict(db: Database) -> dict:
    return {
        "sports": [{"id": s.id, "name": s.name, "emoji": s.emoji} for s in db.sports],
        "facilities": [f.to_dict() for f in db.facilities],
        "activities": [a.to_dict() for a in db.activities],
        "slots": [s.to_dict() for s in db.slots],
        "registrations": db.registrations,
        "favorites": db.favorites,
        "users": db.users,
        "reminders": db.reminders,
        "events": db.events,
        "meta": db.meta,
    }


def database_from_dict(data: dict, now_iso: Optional[str] = None) -> Database:
    sports = [Sport(**s) for s in data.get("sports", [])]
    facilities = [SportFacility(**f) for f in data.get("facilities", [])]
    activities = [Activity(**a) for a in data.get("activities", [])]
    slots = [ScheduleSlot(**s) for s in data.get("slots", [])]
    meta = data.get("meta") or {"source": DEMO_DATA_SOURCE, "refreshedAt": now_iso or iso_now(),
                                "generatedDays": 7}
    return Database(
        sports=sports,
        facilities=facilities,
        activities=activities,
        slots=slots,
        registrations=data.get("registrations", []),
        favorites=data.get("favorites", []),
        users=data.get("users", []),
        reminders=data.get("reminders", []),
        events=data.get("events", []),
        meta=meta,
    )


def _cli_run() -> None:
    """Пересоздать db.json с демо-данными (npm run seed:backend)."""
    import json
    from pathlib import Path
    from .config import config

    path = Path(config.data_dir) / "db.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    db = build_seed(datetime.now())
    with open(path, "w", encoding="utf-8") as f:
        json.dump(database_to_dict(db), f, ensure_ascii=False, indent=2)
    print(f"[seed] Записан demo-набор: {path} "
          f"({len(db.sports)} спортов, {len(db.facilities)} объектов, {len(db.activities)} активностей)")


if __name__ == "__main__":
    _cli_run()
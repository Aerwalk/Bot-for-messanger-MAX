"""Хранилище и доменная логика «Спорт рядом» на PostgreSQL (SQLAlchemy).

Интерфейс функций сохранён с прежней JSON-версии 1-в-1, чтобы контракт API не изменился.
"""

import math
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from .database import session
from .models import (
    MSK,
    Activity,
    AnalyticsEvent,
    Coach,
    Facility,
    Favorite,
    Organizer,
    Rating,
    Registration,
    Reminder,
    Slot,
    Sport,
    UserProfile,
    now_msk,
)


class ApiError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _now_iso() -> str:
    return now_msk().isoformat()


def _omit_optional(d: dict, keys: List[str]) -> dict:
    for k in keys:
        if d.get(k) is None:
            d.pop(k, None)
    return d


# ----------------------------- Гео -----------------------------

def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ----------------------------- Справочники -----------------------------

def get_sports() -> list:
    with session() as s:
        rows = s.scalars(select(Sport).order_by(Sport.name)).all()
        return [{"id": x.id, "name": x.name, "emoji": x.emoji} for x in rows]


def get_facilities() -> list:
    with session() as s:
        rows = s.scalars(select(Facility)).all()
        return [f.to_dict() for f in rows]


def find_facility(fid: str) -> Optional[dict]:
    with session() as s:
        f = s.get(Facility, fid)
        return f.to_dict() if f else None


# ----------------------------- Поиск -----------------------------

def _filter_by_day(slots: List[Slot], day: Optional[str], now: datetime) -> List[Slot]:
    if not day or day == "any":
        return slots
    today = now.date()
    today_str = today.isoformat()
    if day == "today":
        return [sl for sl in slots if sl.date == today_str]
    if day == "tomorrow":
        return [sl for sl in slots if sl.date == (today + timedelta(days=1)).isoformat()]
    if day == "week":
        end = today + timedelta(days=7)
        return [sl for sl in slots if today.isoformat() <= sl.date <= end.isoformat()]
    if day == "weekend":
        return [sl for sl in slots if datetime.strptime(sl.date, "%Y-%m-%d").weekday() in (5, 6)]
    return slots


def _filter_by_time_of_day(slots: List[Slot], tod: Optional[str]) -> List[Slot]:
    if not tod:
        return slots
    ranges = {"morning": (6, 12), "day": (12, 18), "evening": (18, 24)}
    rng = ranges.get(tod)
    if not rng:
        return slots
    lo, hi = rng
    return [sl for sl in slots if lo <= int(sl.startTime.split(":")[0]) < hi]


def get_activities(filters: dict, ref_lat: float = 55.7558, ref_lng: float = 37.6173) -> List[dict]:
    sport_ids = filters.get("sportIds") or []
    atype = filters.get("type")
    age_category = filters.get("ageCategory")
    skill_level = filters.get("skillLevel")
    max_distance = filters.get("maxDistanceKm")
    day = filters.get("day")
    time_of_day = filters.get("timeOfDay")

    with session() as s:
        stmt = select(Activity)
        if sport_ids:
            stmt = stmt.where(Activity.sportId.in_(sport_ids))
        if atype:
            stmt = stmt.where(Activity.type == atype)
        if age_category and age_category != "any":
            stmt = stmt.where(Activity.ageCategory.in_([age_category, "any"]))
        if skill_level and skill_level != "any":
            stmt = stmt.where(Activity.skillLevel.in_([skill_level, "any"]))
        activities = list(s.scalars(stmt).all())

        facilities = {f.id: f for f in s.scalars(select(Facility))}
        sports_map = {sp.id: sp for sp in s.scalars(select(Sport))}
        slots = list(s.scalars(select(Slot)))

        now = now_msk()
        today_str = now.date().isoformat()

        act_ids = [a.id for a in activities]
        rating_scores: dict[str, List[int]] = {}
        if act_ids:
            for r in s.scalars(select(Rating).where(Rating.activityId.in_(act_ids))):
                rating_scores.setdefault(r.activityId, []).append(r.activityScore)

        items = []
        for a in activities:
            facility = facilities.get(a.facilityId)
            sport = sports_map.get(a.sportId)
            if not facility or not sport:
                continue
            distance = round(haversine_km(ref_lat, ref_lng, facility.latitude, facility.longitude) * 10) / 10
            all_slots = [sl for sl in slots if sl.activityId == a.id and sl.date >= today_str]
            upcoming = [sl for sl in all_slots if sl.status != "cancelled"]
            day_slots = _filter_by_day(upcoming, day, now)
            filtered_slots = _filter_by_time_of_day(day_slots, time_of_day) if time_of_day else day_slots
            open_slots = [sl for sl in filtered_slots if sl.registeredCount < sl.capacity and sl.status == "scheduled"]
            next_slot = open_slots[0] if open_slots else None

            if max_distance and max_distance > 0 and distance > max_distance:
                continue
            has_any_slot = (next_slot is not None or len(open_slots) > 0
                            or (not day and not time_of_day
                                and len([sl for sl in slots if sl.activityId == a.id and sl.status != "cancelled"]) > 0))
            if not has_any_slot:
                continue

            summary = {
                "activity": a.to_dict(),
                "facility": facility.to_dict(),
                "sport": {"id": sport.id, "name": sport.name, "emoji": sport.emoji},
                "distanceKm": distance,
                "openSlots": len(open_slots),
            }
            avg = _avg(rating_scores.get(a.id) or [])
            if avg:
                summary["activityRating"] = avg
            if next_slot is not None:
                summary["nextSlot"] = {**next_slot.to_dict(), **_slot_coach_rating(s, next_slot)}
            items.append(summary)

    return items


def _slot_coach_rating(s: Session, slot: Slot) -> dict:
    """Рейтинг тренера слота: {'coachRating': {'avg': ..., 'count': ...}}, если он есть."""
    stmt = select(Rating.coachScore).where(Rating.coachScore.isnot(None))
    if slot.coachId:
        stmt = stmt.where(Rating.coachId == slot.coachId)
    else:
        coach_name = slot.coach or ""
        stmt = stmt.where(Rating.coachName == coach_name)
    scores = [int(x) for x in s.scalars(stmt).all()]
    avg = _avg(scores)
    if not avg:
        return {}
    return {"coachRating": avg}


def get_activity_detail(activity_id: str, ref_lat: float = 55.7558, ref_lng: float = 37.6173) -> Optional[dict]:
    with session() as s:
        a = s.get(Activity, activity_id)
        if not a:
            return None
        facility = s.get(Facility, a.facilityId)
        sport = s.get(Sport, a.sportId)
        if not facility or not sport:
            return None
        distance = round(haversine_km(ref_lat, ref_lng, facility.latitude, facility.longitude) * 10) / 10
        schedule = sorted(s.scalars(select(Slot).where(Slot.activityId == a.id)), key=lambda sl: (sl.date, sl.startTime))
        today_str = now_msk().date().isoformat()
        open_slots = [sl for sl in schedule if sl.date >= today_str and sl.status != "cancelled" and sl.registeredCount < sl.capacity]
        next_slot = open_slots[0] if open_slots else None

        act_avg = _avg([int(x) for x in s.scalars(select(Rating.activityScore).where(Rating.activityId == a.id)).all()])
        detail = {
            "activity": a.to_dict(),
            "facility": facility.to_dict(),
            "sport": {"id": sport.id, "name": sport.name, "emoji": sport.emoji},
            "distanceKm": distance,
            "schedule": [{**sl.to_dict(), **_slot_coach_rating(s, sl)} for sl in schedule],
            "openSlots": len(open_slots),
        }
        if act_avg:
            detail["activityRating"] = act_avg
        if next_slot is not None:
            detail["nextSlot"] = {**next_slot.to_dict(), **_slot_coach_rating(s, next_slot)}
        return detail


def get_schedule(activity_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None) -> list:
    with session() as s:
        stmt = select(Slot).where(Slot.activityId == activity_id)
        if date_from:
            stmt = stmt.where(Slot.date >= date_from)
        if date_to:
            stmt = stmt.where(Slot.date <= date_to)
        items = list(s.scalars(stmt))
        items.sort(key=lambda sl: (sl.date, sl.startTime))
        return [sl.to_dict() for sl in items]


# ----------------------------- Слоты -----------------------------

def get_slot_state(slot, now: Optional[datetime] = None) -> str:
    now = now or now_msk()
    if slot.status == "cancelled":
        return "cancelled"
    dt = datetime.strptime(f"{slot.date}T{slot.startTime}:00", "%Y-%m-%dT%H:%M:%S")
    if dt < now:
        return "past"
    if slot.registeredCount >= slot.capacity:
        return "full"
    return "open"


def to_slot_view(slot) -> dict:
    state = get_slot_state(slot)
    view = slot.to_dict()
    view["state"] = state
    view["seatsFree"] = max(0, slot.capacity - slot.registeredCount)
    return view


# ----------------------------- Записи -----------------------------

def build_reg_view(s: Session, reg: Registration) -> dict:
    slot = s.get(Slot, reg.slotId)
    activity = s.get(Activity, slot.activityId) if slot else None
    facility = s.get(Facility, activity.facilityId) if activity else None
    sport = s.get(Sport, activity.sportId) if activity else None
    reg_out = {
        "id": reg.id,
        "userId": reg.userId,
        "slotId": reg.slotId,
        "name": reg.name,
        "phone": reg.phone,
        "status": reg.status,
        "createdAt": reg.createdAt,
        "canceledAt": reg.canceledAt,
    }
    _omit_optional(reg_out, ["phone", "canceledAt"])
    slot_out = to_slot_view(slot) if slot else {}
    if slot:
        slot_out.update(_slot_coach_rating(s, slot))
    rating = s.scalar(select(Rating).where(Rating.userId == reg.userId, Rating.slotId == reg.slotId))
    view = {
        "registration": reg_out,
        "slot": slot_out,
        "activity": activity.to_dict() if activity else {},
        "facility": facility.to_dict() if facility else {},
        "sport": {"id": sport.id, "name": sport.name, "emoji": sport.emoji} if sport else {},
    }
    if rating:
        view["rating"] = rating_to_dict(rating)
    return view


def create_registration(user_id: str, slot_id: str, name: str, phone: Optional[str]) -> dict:
    with session() as s:
        slot = s.get(Slot, slot_id)
        if not slot:
            raise ApiError("NOT_FOUND", f"Слот {slot_id} не найден")
        activity = s.get(Activity, slot.activityId)
        if not activity or activity.status != "active":
            raise ApiError("NOT_FOUND", "Активность не найдена или неактивна")

        dup = s.scalar(select(Registration).where(
            Registration.userId == user_id, Registration.slotId == slot_id,
            Registration.status == "confirmed"))
        if dup:
            raise ApiError("DUPLICATE", "Вы уже записаны на этот слот")

        if slot.status == "cancelled":
            raise ApiError("CANCELLED", "Слот отменён")
        if slot.registeredCount >= slot.capacity:
            raise ApiError("SLOT_FULL", "Нет свободных мест")

        reg = Registration(
            id=_new_id("reg"),
            userId=user_id,
            slotId=slot_id,
            name=name,
            phone=phone,
            status="confirmed",
            createdAt=_now_iso(),
        )
        s.add(reg)
        slot.registeredCount += 1
        s.commit()
        return build_reg_view(s, reg)


def list_user_registrations(user_id: str) -> list:
    with session() as s:
        regs = list(s.scalars(select(Registration).where(Registration.userId == user_id)))
        regs.sort(key=lambda r: r.createdAt, reverse=True)
        return [build_reg_view(s, r) for r in regs]


def cancel_registration(user_id: str, registration_id: str) -> dict:
    with session() as s:
        reg = s.scalar(select(Registration).where(Registration.id == registration_id, Registration.userId == user_id))
        if not reg:
            raise ApiError("NOT_FOUND", "Запись не найдена")
        if reg.status == "cancelled":
            raise ApiError("ALREADY_CANCELLED", "Запись уже отменена")
        slot = s.get(Slot, reg.slotId)
        if slot and slot.registeredCount > 0:
            slot.registeredCount -= 1
        reg.status = "cancelled"
        reg.canceledAt = _now_iso()
        s.commit()
        return build_reg_view(s, reg)


# ----------------------------- Избранное -----------------------------

def add_favorite(user_id: str, activity_id: str) -> dict:
    with session() as s:
        existing = s.scalar(select(Favorite).where(Favorite.userId == user_id, Favorite.activityId == activity_id))
        if existing:
            return {"id": existing.id, "userId": existing.userId, "activityId": existing.activityId, "createdAt": existing.createdAt}
        fav = Favorite(id=_new_id("fav"), userId=user_id, activityId=activity_id, createdAt=_now_iso())
        s.add(fav)
        s.commit()
        return {"id": fav.id, "userId": fav.userId, "activityId": fav.activityId, "createdAt": fav.createdAt}


def remove_favorite(user_id: str, favorite_id: str) -> None:
    with session() as s:
        fav = s.scalar(select(Favorite).where(Favorite.id == favorite_id, Favorite.userId == user_id))
        if fav:
            s.delete(fav)
            s.commit()


def list_favorites(user_id: str) -> list:
    with session() as s:
        favs = s.scalars(select(Favorite).where(Favorite.userId == user_id)).all()
        return [{"id": f.id, "userId": f.userId, "activityId": f.activityId, "createdAt": f.createdAt} for f in favs]


# ----------------------------- Пользователи -----------------------------

def resolve_or_create_user(user_id: str, name: Optional[str] = None) -> dict:
    with session() as s:
        user = s.get(UserProfile, user_id)
        if not user:
            user = UserProfile(id=user_id, name=name or "Гость", city="Москва",
                               createdAt=_now_iso(), updatedAt=_now_iso())
            s.add(user)
            s.commit()
        elif name and not user.name:
            user.name = name
            user.updatedAt = _now_iso()
            s.commit()
        return _user_to_dict(user)


UPDATEABLE = ("name", "city", "district", "ageCategory", "preferredSports", "preferredTime", "latitude", "longitude")


def update_user(user_id: str, patch: dict) -> dict:
    with session() as s:
        user = s.get(UserProfile, user_id)
        if not user:
            raise ApiError("NOT_FOUND", "Пользователь не найден")
        for k in UPDATEABLE:
            if k in patch and patch[k] is not None:
                setattr(user, k, patch[k])
        user.updatedAt = _now_iso()
        s.commit()
        return _user_to_dict(user)


def get_user(user_id: str) -> Optional[dict]:
    with session() as s:
        user = s.get(UserProfile, user_id)
        return _user_to_dict(user) if user else None


def _user_to_dict(u: UserProfile) -> dict:
    out = {
        "id": u.id,
        "name": u.name,
        "city": u.city,
        "district": u.district,
        "ageCategory": u.ageCategory,
        "preferredSports": u.preferredSports,
        "preferredTime": u.preferredTime,
        "latitude": u.latitude,
        "longitude": u.longitude,
        "createdAt": u.createdAt,
        "updatedAt": u.updatedAt,
    }
    for k in ["name", "city", "district", "ageCategory", "preferredSports", "preferredTime", "latitude", "longitude"]:
        if out.get(k) is None:
            out.pop(k, None)
    return out


# ----------------------------- Напоминания -----------------------------

def _aware_utc(dt: datetime) -> datetime:
    """Any datetime → aware UTC. Наивные значения считаем локальным (МСК) временем."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=MSK)
    return dt.astimezone(timezone.utc)


def create_reminder(user_id: str, slot_id: str) -> dict:
    with session() as s:
        slot = s.get(Slot, slot_id)
        if not slot:
            raise ApiError("NOT_FOUND", "Слот не найден")
        remind_at = datetime.strptime(f"{slot.date}T{slot.startTime}:00", "%Y-%m-%dT%H:%M:%S")
        remind_at = remind_at - timedelta(hours=3)
        now = now_msk()
        if _aware_utc(remind_at) < _aware_utc(now):
            raise ApiError("VALIDATION_ERROR", "Напоминание невозможно: событие уже прошло")
        rem = Reminder(id=_new_id("rem"), userId=user_id, slotId=slot_id,
                       remindAt=remind_at.isoformat(), sent=False, createdAt=_now_iso())
        s.add(rem)
        s.commit()
        return {"id": rem.id, "userId": rem.userId, "slotId": rem.slotId,
                "remindAt": rem.remindAt, "sent": rem.sent, "createdAt": rem.createdAt}


def get_due_reminders(before: datetime) -> list:
    now = _aware_utc(before)
    with session() as s:
        reminders = s.scalars(select(Reminder).where(Reminder.sent == False)).all()  # noqa: E712
        result = []
        for r in reminders:
            try:
                remind = _aware_utc(datetime.fromisoformat(r.remindAt))
            except (TypeError, ValueError):
                continue
            if remind <= now:
                result.append({"id": r.id, "userId": r.userId, "slotId": r.slotId,
                               "remindAt": r.remindAt, "sent": r.sent, "createdAt": r.createdAt})
        return result


def mark_reminder_sent(ids: List[str]) -> None:
    with session() as s:
        reminders = s.scalars(select(Reminder).where(Reminder.id.in_(ids))).all()
        for r in reminders:
            r.sent = True
        s.commit()


def list_reminders(user_id: str) -> list:
    with session() as s:
        reminders = s.scalars(select(Reminder).where(Reminder.userId == user_id)).all()
        return [{"id": r.id, "userId": r.userId, "slotId": r.slotId,
                 "remindAt": r.remindAt, "sent": r.sent, "createdAt": r.createdAt} for r in reminders]


# ----------------------------- Аналитика -----------------------------

def track_event(user_id: str, name: str, payload: Optional[dict] = None) -> None:
    with session() as s:
        s.add(AnalyticsEvent(id=_new_id("evt"), userId=user_id, name=name,
                             payload=payload, createdAt=_now_iso()))
        s.commit()


# ----------------------------- Организаторы (админка) -----------------------------

def find_organizer_by_login(login: str) -> Optional[Organizer]:
    with session() as s:
        return s.scalar(select(Organizer).where(Organizer.login == login))


def get_organizer(org_id: str) -> Optional[Organizer]:
    with session() as s:
        return s.get(Organizer, org_id)


# ----------------------------- Тренеры -----------------------------

def list_coaches() -> list:
    with session() as s:
        rows = s.scalars(select(Coach).order_by(Coach.name)).all()
        return [c.to_dict() for c in rows]


def find_coach(coach_id: str) -> Optional[Coach]:
    with session() as s:
        return s.get(Coach, coach_id)


def create_coach(org_id: str, name: str, sport_id: Optional[str], bio: Optional[str]) -> dict:
    with session() as s:
        c = Coach(
            id=_new_id("coach"),
            organizerId=org_id,
            name=name,
            sportId=sport_id,
            bio=bio or None,
            createdAt=_now_iso(),
        )
        s.add(c)
        s.commit()
        return c.to_dict()


def update_coach(coach_id: str, patch: dict) -> Optional[dict]:
    with session() as s:
        c = s.get(Coach, coach_id)
        if not c:
            return None
        for key in ("name", "sportId", "bio"):
            if key in patch:
                setattr(c, key, patch[key])
        s.commit()
        return c.to_dict()


def delete_coach(coach_id: str) -> bool:
    with session() as s:
        c = s.get(Coach, coach_id)
        if not c:
            return False
        s.delete(c)
        s.commit()
        return True


# ----------------------------- Оценки -----------------------------

def _avg(scores: List[int]) -> Optional[dict]:
    if not scores:
        return None
    avg = round(sum(scores) / len(scores) * 10) / 10
    return {"avg": avg, "count": len(scores)}


def rating_to_dict(r: Rating) -> dict:
    out = {
        "id": r.id,
        "userId": r.userId,
        "slotId": r.slotId,
        "activityId": r.activityId,
        "coachId": r.coachId,
        "coachName": r.coachName,
        "activityScore": r.activityScore,
        "coachScore": r.coachScore,
        "comment": r.comment,
        "createdAt": r.createdAt,
    }
    _omit_optional(out, ["coachId", "coachScore", "comment"])
    return out


def activity_ratings(activity_id: str) -> Optional[dict]:
    """Средняя оценка «за тренировку» и число оценок для активности."""
    with session() as s:
        scores = s.scalars(select(Rating.activityScore).where(
            Rating.activityId == activity_id)).all()
        return _avg([int(x) for x in scores])


def coach_ratings(coach_id: Optional[str], coach_name: Optional[str]) -> Optional[dict]:
    """Средняя оценка тренера по coachId, а для свободной строки — по имени."""
    with session() as s:
        stmt = select(Rating.coachScore)
        if coach_id:
            stmt = stmt.where(Rating.coachId == coach_id)
        elif coach_name:
            stmt = stmt.where(Rating.coachName == coach_name)
        else:
            return None
        scores = s.scalars(stmt).all()
        return _avg([int(x) for x in scores])


def create_rating(
    user_id: str,
    slot_id: str,
    activity_score: int,
    coach_score: Optional[int],
    comment: Optional[str],
) -> dict:
    """Оценка после прошедшего занятия.

    Можно оценить только подтверждённый слот, который уже прошёл
    (по концу занятия). Повторная оценка того же пользователя запрещена.
    """
    now = now_msk()
    with session() as s:
        slot = s.get(Slot, slot_id)
        if not slot:
            raise ApiError("NOT_FOUND", "Слот не найден")

        reg = s.scalar(select(Registration).where(
            Registration.userId == user_id,
            Registration.slotId == slot_id,
            Registration.status == "confirmed"))
        if not reg:
            raise ApiError("NOT_ALLOWED", "Оценить занятие может только записанный участник")

        end_dt = datetime.strptime(f"{slot.date}T{slot.endTime}:00", "%Y-%m-%dT%H:%M:%S")
        if end_dt >= now:
            raise ApiError("NOT_ALLOWED", "Оценить можно только после окончания занятия")

        existing = s.scalar(select(Rating).where(
            Rating.userId == user_id, Rating.slotId == slot_id))
        if existing:
            raise ApiError("DUPLICATE", "Вы уже оценили это занятие")

        coach_id = slot.coachId
        r = Rating(
            id=_new_id("rat"),
            userId=user_id,
            slotId=slot_id,
            activityId=slot.activityId,
            coachId=coach_id,
            coachName=slot.coach or "",
            activityScore=activity_score,
            coachScore=coach_score,
            comment=comment or None,
            createdAt=_now_iso(),
        )
        s.add(r)
        s.commit()
        return rating_to_dict(r)


def list_user_ratings(user_id: str) -> list:
    with session() as s:
        rows = s.scalars(select(Rating).where(Rating.userId == user_id)).all()
        return [rating_to_dict(r) for r in rows]


def get_rating_for(user_id: str, slot_id: str) -> Optional[dict]:
    with session() as s:
        r = s.scalar(select(Rating).where(Rating.userId == user_id, Rating.slotId == slot_id))
        return rating_to_dict(r) if r else None
"""Админ-API организаторов: авторизация и CRUD мероприятий.

Авторизация: POST /api/admin/login {login, password} → {token}.
Дальше все запросы требуют заголовок Authorization: Bearer <token>.
Токен — это случайная строка (сессия в БД, таблица admin_sessions),
а не JWT: никакой подписи, просто opaque-идентификатор сессии.
"""

from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from fastapi.responses import JSONResponse
import bcrypt as bcrypt_mod
from sqlalchemy import select

from .config import config
from .database import session as db_session
from .db import create_coach, delete_coach, find_organizer_by_login, get_organizer, list_coaches, update_coach
from .models import Activity, AdminSession, Coach, Facility, Slot, Sport

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _create_token(org_id: str, login: str) -> str:
    token = token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with db_session() as s:
        s.add(AdminSession(
            id=_new_id("ss"),
            organizerId=org_id,
            token=token,
            expiresAt=(now + timedelta(seconds=config.admin_token_ttl_sec)).isoformat(),
        ))
        s.commit()
    return token


def _find_org_id_by_token(token: str) -> Optional[str]:
    with db_session() as s:
        row = s.scalar(select(AdminSession).where(AdminSession.token == token))
        if not row:
            return None
        try:
            expires = datetime.fromisoformat(row.expiresAt)
        except (TypeError, ValueError):
            return None
        if expires <= datetime.now(timezone.utc):
            return None
        return row.organizerId


def require_org(authorization: Optional[str] = Header(default=None, alias="Authorization")) -> dict:
    """Depends-функция: проверяет Bearer-токен по таблице сессий и возвращает организатора."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    org_id = _find_org_id_by_token(authorization[7:].strip())
    if not org_id:
        raise HTTPException(status_code=401, detail="Токен недействителен или истёк")
    org = get_organizer(org_id)
    if not org:
        raise HTTPException(status_code=401, detail="Организатор не найден")
    return {"id": org.id, "login": org.login, "name": org.name}


@router.post("/login")
async def admin_login(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    login = (body.get("login") or "").strip()
    password = body.get("password") or ""
    if not login or not password:
        return JSONResponse(status_code=400, content={"error": {"code": "VALIDATION_ERROR", "message": "Укажите логин и пароль"}})
    org = find_organizer_by_login(login)
    if not org or not bcrypt_mod.checkpw(password.encode("utf-8"), org.password_hash.encode("utf-8")):
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "Неверный логин или пароль"}})
    return {"token": _create_token(org.id, org.login), "organizer": {"id": org.id, "login": org.login, "name": org.name}}


@router.get("/me")
async def admin_me(org: dict = Depends(require_org)):
    return {"organizer": org}


def _activity_dict(a: Activity, facility: Optional[Facility], sport: Optional[Sport]) -> dict:
    return {
        "activity": a.to_dict(),
        "facility": facility.to_dict() if facility else {},
        "sport": {"id": sport.id, "name": sport.name, "emoji": sport.emoji} if sport else {},
    }


@router.get("/activities")
async def admin_activities(org: dict = Depends(require_org)):
    with db_session() as s:
        rows = s.scalars(select(Activity).order_by(Activity.title)).all()
        facilities = {f.id: f for f in s.scalars(select(Facility))}
        sports = {sp.id: sp for sp in s.scalars(select(Sport))}
        items = [_activity_dict(a, facilities.get(a.facilityId), sports.get(a.sportId)) for a in rows]
    return {"items": items, "count": len(items)}


def _parse_activity_body(body: dict) -> dict:
    required = {
        "facilityId": str, "sportId": str, "type": str, "title": str,
        "description": str, "ageCategory": str, "skillLevel": str,
    }
    for key, _t in required.items():
        if not body.get(key):
            raise HTTPException(status_code=400, detail=f"Поле {key} обязательно")
    return {
        "facilityId": str(body["facilityId"]),
        "sportId": str(body["sportId"]),
        "type": str(body["type"]),
        "title": str(body["title"]).strip(),
        "description": str(body["description"]).strip(),
        "ageCategory": str(body["ageCategory"]),
        "skillLevel": str(body["skillLevel"]),
        "price": int(body.get("price") or 0),
        "priceNote": str(body.get("priceNote") or "Разовое занятие"),
        "organizer": str(body.get("organizer") or "Спортивная организация"),
        "contact": str(body.get("contact") or ""),
        "status": str(body.get("status") or "active"),
    }


def _new_id(prefix: str) -> str:
    from uuid import uuid4
    return f"{prefix}_{uuid4().hex[:12]}"


@router.post("/activities")
async def admin_activity_create(request: Request, org: dict = Depends(require_org)):
    try:
        body = await request.json()
    except Exception:
        body = {}
    try:
        data = _parse_activity_body(body or {})
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректные значения полей (price должен быть числом)")
    with db_session() as s:
        if not s.get(Facility, data["facilityId"]):
            raise HTTPException(status_code=404, detail="Объект не найден")
        if not s.get(Sport, data["sportId"]):
            raise HTTPException(status_code=404, detail="Вид спорта не найден")
        from .db import _now_iso
        a = Activity(id=_new_id("act"), **data, createdBy=org["id"], createdAt=_now_iso(), updatedAt=_now_iso())
        s.add(a)
        s.commit()
        facility = s.get(Facility, a.facilityId)
        sport = s.get(Sport, a.sportId)
        return JSONResponse(status_code=201, content=_activity_dict(a, facility, sport))


@router.patch("/activities/{activity_id}")
async def admin_activity_update(activity_id: str, request: Request, org: dict = Depends(require_org)):
    try:
        body = await request.json()
    except Exception:
        body = {}
    with db_session() as s:
        a = s.get(Activity, activity_id)
        if not a:
            raise HTTPException(status_code=404, detail="Активность не найдена")
        allowed = {"title", "description", "type", "ageCategory", "skillLevel", "price",
                   "priceNote", "organizer", "contact", "status"}
        for key in body or {}:
            if key in allowed:
                setattr(a, key, body[key])
        from .db import _now_iso
        a.updatedAt = _now_iso()
        s.commit()
        facility = s.get(Facility, a.facilityId)
        sport = s.get(Sport, a.sportId)
        return _activity_dict(a, facility, sport)


@router.delete("/activities/{activity_id}")
async def admin_activity_delete(activity_id: str, org: dict = Depends(require_org)):
    with db_session() as s:
        a = s.get(Activity, activity_id)
        if not a:
            raise HTTPException(status_code=404, detail="Активность не найдена")
        s.delete(a)
        s.commit()
    return {"ok": True, "deleted": activity_id}


@router.post("/activities/{activity_id}/slots")
async def admin_slot_create(activity_id: str, request: Request, org: dict = Depends(require_org)):
    try:
        body = await request.json()
    except Exception:
        body = {}
    with db_session() as s:
        a = s.get(Activity, activity_id)
        if not a:
            raise HTTPException(status_code=404, detail="Активность не найдена")
        date = str(body.get("date") or "").strip()
        start = str(body.get("startTime") or "").strip()
        end = str(body.get("endTime") or "").strip()
        capacity = int(body.get("capacity") or 1)
        coach_id = str(body.get("coachId") or "") or None
        coach = str(body.get("coach") or "").strip()
        if coach_id:
            coach_obj = s.get(Coach, coach_id)
            if not coach_obj:
                raise HTTPException(status_code=404, detail="Тренер не найден")
            coach = coach_obj.name
        if not date or not start or not end:
            raise HTTPException(status_code=400, detail="Укажите date, startTime, endTime")
        if len(date) != 10 or len(start) != 5 or len(end) != 5:
            raise HTTPException(status_code=400, detail="Неверный формат даты/времени (YYYY-MM-DD, HH:MM)")
        h0, m0 = int(start.split(":")[0]), int(start.split(":")[1])
        h1, m1 = int(end.split(":")[0]), int(end.split(":")[1])
        slot_id = f"slot_{_new_id('act')[4:]}_{start.replace(':', '')}"
        sl = Slot(id=slot_id, activityId=activity_id, date=date, startTime=start, endTime=end,
                  capacity=capacity, registeredCount=int(body.get("registeredCount") or 0),
                  status="scheduled", coach=coach or "Тренер", coachId=coach_id,
                  durationMin=(h1 * 60 + m1) - (h0 * 60 + m0))
        s.add(sl)
        s.commit()
        return JSONResponse(status_code=201, content=sl.to_dict())


@router.get("/activities/{activity_id}/slots")
async def admin_activity_slots(activity_id: str, org: dict = Depends(require_org)):
    with db_session() as s:
        slots = s.scalars(select(Slot).where(Slot.activityId == activity_id).order_by(Slot.date, Slot.startTime)).all()
        return {"items": [sl.to_dict() for sl in slots]}


@router.delete("/slots/{slot_id}")
async def admin_slot_delete(slot_id: str, org: dict = Depends(require_org)):
    with db_session() as s:
        sl = s.get(Slot, slot_id)
        if not sl:
            raise HTTPException(status_code=404, detail="Слот не найден")
        s.delete(sl)
        s.commit()
    return {"ok": True, "deleted": slot_id}


@router.get("/facilities")
async def admin_facilities(org: dict = Depends(require_org)):
    with db_session() as s:
        rows = s.scalars(select(Facility)).all()
        return {"items": [f.to_dict() for f in rows]}


@router.get("/sports")
async def admin_sports(org: dict = Depends(require_org)):
    with db_session() as s:
        rows = s.scalars(select(Sport)).all()
        return {"items": [{"id": x.id, "name": x.name, "emoji": x.emoji} for x in rows]}


@router.get("/registrations")
async def admin_registrations(
    org: dict = Depends(require_org),
    activityId: Optional[str] = Query(default=None),
):
    from .db import build_reg_view
    with db_session() as s:
        from .models import Registration
        if activityId:
            slot_ids = [sl.id for sl in s.scalars(select(Slot).where(Slot.activityId == activityId))]
            regs = s.scalars(select(Registration).where(Registration.slotId.in_(slot_ids))).all() if slot_ids else []
        else:
            regs = s.scalars(select(Registration)).all()
        regs_list = sorted(regs, key=lambda r: r.createdAt, reverse=True)
        return {"items": [build_reg_view(s, r) for r in regs_list]}


@router.get("/activities/{activity_id}/registrations")
async def admin_activity_registrations(activity_id: str, org: dict = Depends(require_org)):
    """Записавшиеся на мероприятие: ФИО, телефон (если есть), дата записи, слот."""
    from .db import build_reg_view
    from .models import Registration

    with db_session() as s:
        if not s.get(Activity, activity_id):
            raise HTTPException(status_code=404, detail="Активность не найдена")
        slot_ids = [sl.id for sl in s.scalars(select(Slot).where(Slot.activityId == activity_id))]
        regs = s.scalars(select(Registration).where(Registration.slotId.in_(slot_ids))).all() if slot_ids else []
        regs_list = sorted(regs, key=lambda r: r.createdAt, reverse=True)
        return {"items": [build_reg_view(s, r) for r in regs_list], "count": len(regs_list)}


@router.post("/sports")
async def admin_sport_create(request: Request, org: dict = Depends(require_org)):
    """Создание нового вида спорта: {name, emoji}."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    name = str(body.get("name") or "").strip()
    emoji = str(body.get("emoji") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Поле name обязательно")
    if not emoji:
        raise HTTPException(status_code=400, detail="Поле emoji обязательно")
    sport_id = f"sport_{_new_id('x')[6:]}"
    with db_session() as s:
        existing = s.scalar(select(Sport).where(Sport.name == name))
        if existing:
            raise HTTPException(status_code=409, detail="Вид спорта с таким названием уже есть")
        sp = Sport(id=sport_id, name=name, emoji=emoji)
        s.add(sp)
        s.commit()
        return JSONResponse(status_code=201, content={"id": sp.id, "name": sp.name, "emoji": sp.emoji})


@router.post("/facilities")
async def admin_facility_create(request: Request, org: dict = Depends(require_org)):
    """Создание новой локации: {name, type, address, city, district, latitude, longitude, description}."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    required = {"name", "type", "address", "city", "district"}
    for key in required:
        if not str(body.get(key) or "").strip():
            raise HTTPException(status_code=400, detail=f"Поле {key} обязательно")
    try:
        lat = float(body.get("latitude") or 0)
        lng = float(body.get("longitude") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="latitude/longitude должны быть числами")
    from .db import _now_iso
    fid = f"fac_{_new_id('x')[6:]}"
    with db_session() as s:
        f = Facility(
            id=fid,
            name=str(body["name"]).strip(),
            type=str(body["type"]).strip(),
            address=str(body["address"]).strip(),
            city=str(body["city"]).strip(),
            district=str(body["district"]).strip(),
            latitude=lat,
            longitude=lng,
            description=str(body.get("description") or "").strip(),
            source="Добавлено организатором",
            sourceUpdatedAt=_now_iso(),
        )
        s.add(f)
        s.commit()
        return JSONResponse(status_code=201, content=f.to_dict())


@router.get("/coaches")
async def admin_coaches(org: dict = Depends(require_org)):
    coaches = list_coaches()
    return {"items": coaches, "count": len(coaches)}


@router.post("/coaches")
async def admin_coach_create(request: Request, org: dict = Depends(require_org)):
    """Создание тренера: {name, sportId?, bio?}."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Поле name обязательно")
    sport_id = str(body.get("sportId") or "") or None
    bio = str(body.get("bio") or "").strip() or None
    if sport_id:
        with db_session() as s:
            if not s.get(Sport, sport_id):
                raise HTTPException(status_code=404, detail="Вид спорта не найден")
    c = create_coach(org["id"], name, sport_id, bio)
    return JSONResponse(status_code=201, content=c)


@router.patch("/coaches/{coach_id}")
async def admin_coach_update(coach_id: str, request: Request, org: dict = Depends(require_org)):
    try:
        body = await request.json()
    except Exception:
        body = {}
    patch = {}
    for key in ("name", "sportId", "bio"):
        if key in (body or {}):
            value = body[key]
            if key == "name":
                if not str(value or "").strip():
                    raise HTTPException(status_code=400, detail="Поле name обязательно")
                patch[key] = str(value).strip()
            elif key == "sportId":
                patch[key] = str(value or "") or None
            else:
                patch[key] = str(value or "").strip() or None
    if not patch:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")
    if patch.get("sportId"):
        with db_session() as s:
            if not s.get(Sport, patch["sportId"]):
                raise HTTPException(status_code=404, detail="Вид спорта не найден")
    c = update_coach(coach_id, patch)
    if not c:
        raise HTTPException(status_code=404, detail="Тренер не найден")
    return c


@router.delete("/coaches/{coach_id}")
async def admin_coach_delete(coach_id: str, org: dict = Depends(require_org)):
    if not delete_coach(coach_id):
        raise HTTPException(status_code=404, detail="Тренер не найден")
    return {"ok": True, "deleted": coach_id}
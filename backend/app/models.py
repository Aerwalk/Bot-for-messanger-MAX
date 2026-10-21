"""SQLAlchemy-модели «Спорт рядом».

Схема повторяет контракт REST API: поля и форматы ответов совпадают с прежней
JSON-версией (опциональные поля отсутствуют, как undefined в JS).
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import Boolean, Float, Integer, JSON, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# Московское время (UTC+3) — единый часовой пояс всех таймстемпов сервиса.
MSK = timezone(timedelta(hours=3))


class Base(DeclarativeBase):
    pass


def now_msk() -> datetime:
    """Текущее время в МСК (наивное, без смещения)."""
    return datetime.now(MSK).replace(tzinfo=None)


def _now_iso() -> str:
    return now_msk().isoformat()


class Sport(Base):
    __tablename__ = "sports"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    emoji: Mapped[str] = mapped_column(String(8))

    activities: Mapped[List["Activity"]] = relationship(back_populates="sport")


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(60))
    address: Mapped[str] = mapped_column(String(300))
    city: Mapped[str] = mapped_column(String(100))
    district: Mapped[str] = mapped_column(String(100))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    description: Mapped[str] = mapped_column(String(1000))
    source: Mapped[str] = mapped_column(String(200))
    sourceUpdatedAt: Mapped[str] = mapped_column(String(40))

    activities: Mapped[List["Activity"]] = relationship(back_populates="facility")

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


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    facilityId: Mapped[str] = mapped_column(ForeignKey("facilities.id"))
    sportId: Mapped[str] = mapped_column(ForeignKey("sports.id"))
    type: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(1000))
    ageCategory: Mapped[str] = mapped_column(String(20))
    skillLevel: Mapped[str] = mapped_column(String(20))
    price: Mapped[int] = mapped_column(Integer)
    priceNote: Mapped[str] = mapped_column(String(100))
    organizer: Mapped[str] = mapped_column(String(200))
    contact: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="active")
    createdBy: Mapped[Optional[str]] = mapped_column("createdby", String(40), nullable=True)
    createdAt: Mapped[str] = mapped_column("createdat", String(40), default=_now_iso)
    updatedAt: Mapped[str] = mapped_column("updatedat", String(40), default=_now_iso)

    facility: Mapped["Facility"] = relationship(back_populates="activities")
    sport: Mapped["Sport"] = relationship(back_populates="activities")
    slots: Mapped[List["Slot"]] = relationship(back_populates="activity")

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
            "createdBy": self.createdBy,
            "createdAt": self.createdAt,
            "updatedAt": self.updatedAt,
        }


class Slot(Base):
    __tablename__ = "slots"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    activityId: Mapped[str] = mapped_column(ForeignKey("activities.id"))
    date: Mapped[str] = mapped_column(String(10))
    startTime: Mapped[str] = mapped_column(String(5))
    endTime: Mapped[str] = mapped_column(String(5))
    capacity: Mapped[int] = mapped_column(Integer)
    registeredCount: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20))
    coach: Mapped[str] = mapped_column(String(100))
    coachId: Mapped[Optional[str]] = mapped_column("coachid", String(40), nullable=True)
    durationMin: Mapped[int] = mapped_column(Integer)

    activity: Mapped["Activity"] = relationship(back_populates="slots")

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
            "coachId": self.coachId,
            "durationMin": self.durationMin,
        }


class Registration(Base):
    __tablename__ = "registrations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    userId: Mapped[str] = mapped_column(String(100))
    slotId: Mapped[str] = mapped_column(ForeignKey("slots.id"))
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)
    canceledAt: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    slot: Mapped["Slot"] = relationship()


class Favorite(Base):
    __tablename__ = "favorites"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    userId: Mapped[str] = mapped_column(String(100))
    activityId: Mapped[str] = mapped_column(ForeignKey("activities.id"))
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)


class UserProfile(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ageCategory: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    preferredSports: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    preferredTime: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)
    updatedAt: Mapped[str] = mapped_column(String(40), default=_now_iso)


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    userId: Mapped[str] = mapped_column(String(100))
    slotId: Mapped[str] = mapped_column(ForeignKey("slots.id"))
    remindAt: Mapped[str] = mapped_column(String(40))
    sent: Mapped[bool] = mapped_column(Boolean, default=False)
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)


class AnalyticsEvent(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    userId: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(100))
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)


class Organizer(Base):
    __tablename__ = "organizers"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    login: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(200))
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)


class AdminSession(Base):
    """Opaque-сессия администратора: случайный токен из БД вместо JWT.

    Токен — это случайная строка (secrets.token_urlsafe), хранится только в БД.
    Bearer-заголовок во фронте не меняется.
    """

    __tablename__ = "admin_sessions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    organizerId: Mapped[str] = mapped_column(ForeignKey("organizers.id"))
    token: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    expiresAt: Mapped[str] = mapped_column(String(40))
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)


class Coach(Base):
    """Тренер, которого организатор ведёт в админке и привязывает к слотам."""

    __tablename__ = "coaches"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    organizerId: Mapped[str] = mapped_column(String(40), default="org_admin")
    name: Mapped[str] = mapped_column(String(200))
    sportId: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "organizerId": self.organizerId,
            "name": self.name,
            "sportId": self.sportId,
            "bio": self.bio,
            "createdAt": self.createdAt,
        }


class Rating(Base):
    """Оценка клиента после прошедшего занятия: за тренировку и за тренера (1–5).

    Одна оценка на слот на пользователя (uq_rating_user_slot).
    coachId берётся из слота (или None, если тренер задан свободной строкой).
    """

    __tablename__ = "ratings"
    __table_args__ = (
        UniqueConstraint("userId", "slotId", name="uq_rating_user_slot"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    userId: Mapped[str] = mapped_column(String(100))
    slotId: Mapped[str] = mapped_column(String(60))
    activityId: Mapped[str] = mapped_column(String(40))
    coachId: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    coachName: Mapped[str] = mapped_column(String(100))
    activityScore: Mapped[int] = mapped_column(Integer)  # оценка тренировки 1–5
    coachScore: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # оценка тренера 1–5
    comment: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    createdAt: Mapped[str] = mapped_column(String(40), default=_now_iso)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "userId": self.userId,
            "slotId": self.slotId,
            "activityId": self.activityId,
            "coachId": self.coachId,
            "coachName": self.coachName,
            "activityScore": self.activityScore,
            "coachScore": self.coachScore,
            "comment": self.comment,
            "createdAt": self.createdAt,
        }
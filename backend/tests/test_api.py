"""Интеграционные тесты API «Спорт рядом» (pytest + FastAPI TestClient).

Портированы 1-в-1 из TS-версии (backend/src/__tests__/api.test.ts):
17 кейсов: health, справочники, поиск с фильтрами, карточка активности,
полный цикл записи → отмены, дубликаты, заполненный слот, валидации,
избранное, напоминания, аналитика.
"""

import json
import shutil
import tempfile
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient

import app.db as db
import app.database as database
from app.config import config
from app.main import create_app


@pytest.fixture(scope="module", autouse=True)
def setup_test_store(tmp_path_factory: pytest.TempPathFactory) -> Generator[str, None, None]:
    """Создаёт временную SQLite-БД на время модуля и восстанавливает конфигурацию после."""
    tmp = str(tmp_path_factory.mktemp("db"))
    old_database_url = config.database_url
    old_demo_mode = config.demo_mode
    old_serve_static = config.serve_static
    old_admin_login = config.admin_login
    old_admin_password = config.admin_password
    config.database_url = f"sqlite:///{tmp}/test.db"
    config.demo_mode = True
    config.serve_static = False
    config.admin_login = "admin"
    config.admin_password = "admin123"
    database.reset_config_for_test()
    yield tmp
    config.database_url = old_database_url
    config.demo_mode = old_demo_mode
    config.serve_static = old_serve_static
    config.admin_login = old_admin_login
    config.admin_password = old_admin_password
    database.reset_config_for_test()


@pytest.fixture(scope="module")
def client(setup_test_store: str) -> Generator[TestClient, None, None]:
    app = create_app()
    with TestClient(app) as c:
        yield c


USER = "test-user-1"


def api(client: TestClient, url: str, user: str = USER, method: str = "GET", json_body: dict | None = None):
    headers = {"x-user-id": user} if user else {}
    kwargs: dict = {}
    if json_body is not None and method.upper() in ("POST", "PUT", "PATCH"):
        kwargs["json"] = json_body
    resp = getattr(client, method.lower())(url, headers=headers, **kwargs)
    try:
        body = resp.json()
    except Exception:
        body = None
    return resp.status_code, body


class TestHealth:
    def test_health(self, client: TestClient):
        status, body = api(client, "/api/health", user="")
        assert status == 200
        assert body["ok"] is True
        assert body["demoMode"] is True
        assert "Демонстрационные данные" in body["source"]


class TestSportsFacilities:
    def test_sports(self, client: TestClient):
        status, body = api(client, "/api/sports", user="")
        assert status == 200
        assert len(body["items"]) >= 8
        assert any(s["id"] == "football" for s in body["items"])

    def test_facilities(self, client: TestClient):
        status, body = api(client, "/api/facilities", user="")
        assert status == 200
        assert len(body["items"]) >= 10

    def test_facilities_by_id(self, client: TestClient):
        status, body = api(client, "/api/facilities?id=fc_forma", user="")
        assert status == 200
        assert len(body["items"]) == 1
        assert body["items"][0]["id"] == "fc_forma"


class TestActivities:
    def test_activities(self, client: TestClient):
        status, body = api(client, "/api/activities?lat=55.7558&lng=37.6173", user="")
        assert status == 200
        assert body["count"] == len(body["items"])
        football = next((i for i in body["items"] if i["activity"]["id"] == "a_football_adult"), None)
        assert football is not None
        assert isinstance(football["distanceKm"], float)
        assert football["openSlots"] > 0
        assert football.get("nextSlot") is not None

    def test_activities_by_sport(self, client: TestClient):
        status, body = api(client, "/api/activities?sportIds=yoga", user="")
        assert status == 200
        assert len(body["items"]) > 0
        assert all(i["activity"]["sportId"] == "yoga" for i in body["items"])

    def test_activity_detail(self, client: TestClient):
        status, body = api(client, "/api/activities/a_football_adult", user="")
        assert status == 200
        assert body["activity"]["id"] == "a_football_adult"
        assert len(body["schedule"]) >= 3
        assert "Демонстрационные данные" in body["facility"]["source"]

    def test_activity_404(self, client: TestClient):
        status, body = api(client, "/api/activities/nope", user="")
        assert status == 404
        assert body["error"]["code"] == "NOT_FOUND"


class TestMe:
    def test_me_post(self, client: TestClient):
        status, body = api(client, "/api/me", user="me-user", method="POST", json_body={})
        assert status == 200
        assert body["user"]["id"] == "me-user"
        assert body["demo"] is True

    def test_me_patch(self, client: TestClient):
        api(client, "/api/me", user="patch-user", method="POST", json_body={})
        status, body = api(client, "/api/me", user="patch-user", method="PATCH",
                           json_body={"district": "Хамовники", "preferredSports": ["football", "yoga"]})
        assert status == 200
        assert body["user"]["district"] == "Хамовники"
        assert body["user"]["preferredSports"] == ["football", "yoga"]


def _first_open_slot_id(client: TestClient, activity_id: str) -> str:
    _, body = api(client, f"/api/activities/{activity_id}", user="")
    for s in body["schedule"]:
        if s["status"] == "scheduled" and s["registeredCount"] < s["capacity"]:
            return s["id"]
    raise RuntimeError(f"Нет открытого слота у {activity_id}")


def _first_full_slot_id(client: TestClient, activity_id: str) -> str:
    _, body = api(client, f"/api/activities/{activity_id}", user="")
    for s in body["schedule"]:
        if s["status"] == "scheduled" and s["registeredCount"] >= s["capacity"]:
            return s["id"]
    raise RuntimeError(f"Нет заполненного слота у {activity_id}")


class TestCoaches:
    def _token(self, client: TestClient) -> str:
        _, body = api(client, "/api/admin/login", user="", method="POST",
                      json_body={"login": "admin", "password": "admin123"})
        return body["token"]

    def test_list_coaches(self, client: TestClient):
        token = self._token(client)
        resp = client.get("/api/admin/coaches", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["count"] >= 1
        assert any("name" in c for c in resp.json()["items"])

    def test_coach_crud(self, client: TestClient):
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/admin/coaches", json={"name": "Тест Тренер", "bio": "Мастер спорта"},
                           headers=headers)
        assert resp.status_code == 201
        cid = resp.json()["id"]
        assert resp.json()["name"] == "Тест Тренер"

        resp = client.patch(f"/api/admin/coaches/{cid}", json={"name": "Тест Тренер 2", "sportId": "football"},
                            headers=headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "Тест Тренер 2"
        assert resp.json()["sportId"] == "football"

        resp = client.get("/api/admin/coaches", headers=headers)
        assert any(c["id"] == cid for c in resp.json()["items"])

        resp = client.delete(f"/api/admin/coaches/{cid}", headers=headers)
        assert resp.status_code == 200

    def test_coach_requires_name(self, client: TestClient):
        token = self._token(client)
        resp = client.post("/api/admin/coaches", json={}, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 400

    def test_coach_404(self, client: TestClient):
        token = self._token(client)
        resp = client.patch("/api/admin/coaches/nope", json={"name": "X"},
                            headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 404


class TestRatings:
    def _token(self, client: TestClient) -> str:
        _, body = api(client, "/api/admin/login", user="", method="POST",
                      json_body={"login": "admin", "password": "admin123"})
        return body["token"]

    def _share(self, client: TestClient, past_date: str):
        """Создаёт активность + прошедший слот с тренером, возвращает {activity_id, slot}."""
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/admin/coaches", json={"name": "Р. Оценкин"}, headers=headers)
        assert resp.status_code == 201
        coach_id = resp.json()["id"]
        resp = client.post("/api/admin/activities", json={
            "facilityId": "fc_forma", "sportId": "football", "type": "training",
            "title": "Тренировка для оценки", "description": "Описание", "ageCategory": "adult",
            "skillLevel": "any", "price": 0, "organizer": "Тест Org", "contact": "+7 999",
        }, headers=headers)
        assert resp.status_code == 201
        activity_id = resp.json()["activity"]["id"]
        resp = client.post(f"/api/admin/activities/{activity_id}/slots", json={
            "date": past_date, "startTime": "08:00", "endTime": "09:00", "capacity": 5, "coachId": coach_id,
        }, headers=headers)
        assert resp.status_code == 201
        return activity_id, resp.json()

    def _register(self, client: TestClient, slot_id: str, user: str = "rate-user-1"):
        return api(client, "/api/registrations", user=user, method="POST",
                   json_body={"slotId": slot_id, "name": "Оценщик", "consent": True})

    def test_rate_past_slot(self, client: TestClient):
        _, slot = self._share(client, "2020-01-01")
        user = "rate-user-1"
        assert self._register(client, slot["id"], user)[0] == 201
        status, body = api(client, "/api/ratings", user=user, method="POST",
                           json_body={"slotId": slot["id"], "activityScore": 5, "coachScore": 4, "comment": "Отлично"})
        assert status == 201
        assert body["activityScore"] == 5
        assert body["coachScore"] == 4
        assert body["slotId"] == slot["id"]

        status, mine = api(client, "/api/me/ratings", user=user)
        assert status == 200
        assert any(r["slotId"] == slot["id"] for r in mine["items"])

    def test_rate_duplicate(self, client: TestClient):
        _, slot = self._share(client, "2019-06-05")
        user = "rate-user-dup"
        self._register(client, slot["id"], user)
        api(client, "/api/ratings", user=user, method="POST",
            json_body={"slotId": slot["id"], "activityScore": 4})
        status, body = api(client, "/api/ratings", user=user, method="POST",
                           json_body={"slotId": slot["id"], "activityScore": 4})
        assert status == 409
        assert body["error"]["code"] == "DUPLICATE"

    def test_rate_not_registered(self, client: TestClient):
        _, slot = self._share(client, "2019-06-06")
        status, body = api(client, "/api/ratings", user="rate-user-outsider", method="POST",
                           json_body={"slotId": slot["id"], "activityScore": 5})
        assert status == 403
        assert body["error"]["code"] == "NOT_ALLOWED"

    def test_rate_future_slot_forbidden(self, client: TestClient):
        _, slot = self._share(client, "2099-01-01")
        user = "rate-user-future"
        self._register(client, slot["id"], user)
        status, body = api(client, "/api/ratings", user=user, method="POST",
                           json_body={"slotId": slot["id"], "activityScore": 5, "coachScore": 5})
        assert status == 403
        assert body["error"]["code"] == "NOT_ALLOWED"

    def test_rate_validation(self, client: TestClient):
        _, slot = self._share(client, "2019-06-07")
        user = "rate-user-bad"
        self._register(client, slot["id"], user)
        status, body = api(client, "/api/ratings", user=user, method="POST",
                           json_body={"slotId": slot["id"], "activityScore": 9})
        assert status == 400
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_rating_in_detail(self, client: TestClient):
        activity_id, slot = self._share(client, "2019-07-01")
        user = "rate-user-detail"
        self._register(client, slot["id"], user)
        api(client, "/api/ratings", user=user, method="POST",
            json_body={"slotId": slot["id"], "activityScore": 5, "coachScore": 3})
        status, detail = api(client, f"/api/activities/{activity_id}", user="")
        assert status == 200
        assert detail["activityRating"]["count"] == 1
        assert detail["activityRating"]["avg"] == 5.0
        schedule_slot = next(s for s in detail["schedule"] if s["id"] == slot["id"])
        assert schedule_slot["coachRating"]["avg"] == 3.0


class TestRegistrationFlow:
    def test_full_flow(self, client: TestClient):
        user = "flow-user"
        slot_id = _first_open_slot_id(client, "a_football_adult")
        status, created = api(client, "/api/registrations", user=user, method="POST",
                              json_body={"slotId": slot_id, "name": "Иван", "phone": "+7 900 000-00-00", "consent": True})
        assert status == 201
        assert created["registration"]["status"] == "confirmed"
        assert created["registration"]["slotId"] == slot_id
        reg_id = created["registration"]["id"]

        status, listing = api(client, "/api/me/registrations", user=user)
        assert status == 200
        assert any(r["registration"]["id"] == reg_id for r in listing["items"])

        status, cancelled = api(client, f"/api/registrations/{reg_id}/cancel", user=user, method="POST")
        assert status == 200
        assert cancelled["registration"]["status"] == "cancelled"

    def test_duplicate(self, client: TestClient):
        user = "dup-user"
        slot_id = _first_open_slot_id(client, "a_basketball_am")
        payload = {"slotId": slot_id, "name": "Пётр", "consent": True}
        api(client, "/api/registrations", user=user, method="POST", json_body=payload)
        status, body = api(client, "/api/registrations", user=user, method="POST", json_body=payload)
        assert status == 409
        assert body["error"]["code"] == "DUPLICATE"

    def test_no_consent(self, client: TestClient):
        slot_id = _first_open_slot_id(client, "a_yoga_morning")
        status, body = api(client, "/api/registrations", user="validation-user", method="POST",
                           json_body={"slotId": slot_id, "name": "Анна", "consent": False})
        assert status == 400
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_slot_full(self, client: TestClient):
        slot_id = _first_full_slot_id(client, "a_swim_adult")
        status, body = api(client, "/api/registrations", user="full-user", method="POST",
                           json_body={"slotId": slot_id, "name": "Олег", "consent": True})
        assert status == 409
        assert body["error"]["code"] == "SLOT_FULL"

    def test_cancel_twice(self, client: TestClient):
        user = "cancel-twice"
        slot_id = _first_open_slot_id(client, "a_tennis_group")
        created = api(client, "/api/registrations", user=user, method="POST",
                      json_body={"slotId": slot_id, "name": "Мария", "consent": True})[1]
        reg_id = created["registration"]["id"]
        api(client, f"/api/registrations/{reg_id}/cancel", user=user, method="POST")
        status, body = api(client, f"/api/registrations/{reg_id}/cancel", user=user, method="POST")
        assert status == 409
        assert body["error"]["code"] == "ALREADY_CANCELLED"


class TestFavorites:
    def test_favorites_cycle(self, client: TestClient):
        user = "fav-user"
        status, added = api(client, "/api/favorites", user=user, method="POST",
                            json_body={"activityId": "a_yoga_morning"})
        assert status == 201
        status, listing = api(client, "/api/me/favorites", user=user)
        assert status == 200
        assert len(listing["items"]) == 1
        status = api(client, f"/api/favorites/{added['id']}", user=user, method="DELETE")[0]
        assert status == 204
        status, after = api(client, "/api/me/favorites", user=user)
        assert len(after["items"]) == 0


class TestReminders:
    def test_reminders_cycle(self, client: TestClient):
        user = "rem-user"
        slot_id = _first_open_slot_id(client, "a_run_club")
        status, created = api(client, "/api/reminders", user=user, method="POST",
                              json_body={"slotId": slot_id})
        assert status == 201
        assert created.get("remindAt")

        from datetime import datetime, timedelta
        future = (datetime.now() + timedelta(days=30)).isoformat()
        status, due = api(client, f"/api/reminders/due?now={future}", user="")
        assert status == 200
        assert any(r["id"] == created["id"] for r in due["items"])

        status = api(client, "/api/reminders/sent", user="", method="POST",
                     json_body={"ids": [created["id"]]})[0]
        assert status == 204


class TestAnalytics:
    def test_events(self, client: TestClient):
        status, body = api(client, "/api/events", user="analytics-user", method="POST",
                           json_body={"name": "search_started", "payload": {"source": "test"}})
        assert status == 201
        assert body["ok"] is True


class TestDemoFallback:
    def test_no_auth(self, client: TestClient):
        status, body = api(client, "/api/me/registrations", user="")
        assert status == 200
        assert isinstance(body["items"], list)


class TestAdmin:
    def test_login_ok(self, client: TestClient):
        status, body = api(client, "/api/admin/login", user="", method="POST",
                           json_body={"login": "admin", "password": "admin123"})
        assert status == 200
        assert body["token"]
        assert body["organizer"]["login"] == "admin"

    def test_login_bad_password(self, client: TestClient):
        status, body = api(client, "/api/admin/login", user="", method="POST",
                           json_body={"login": "admin", "password": "wrong"})
        assert status == 401
        assert body["error"]["code"] == "UNAUTHORIZED"

    def _token(self, client: TestClient) -> str:
        _, body = api(client, "/api/admin/login", user="", method="POST",
                      json_body={"login": "admin", "password": "admin123"})
        return body["token"]

    def test_me_requires_token(self, client: TestClient):
        status, body = api(client, "/api/admin/me", user="")
        assert status == 401

    def test_me_with_token(self, client: TestClient):
        token = self._token(client)
        resp = client.get("/api/admin/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["organizer"]["login"] == "admin"

    def test_activity_crud(self, client: TestClient):
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        data = {
            "facilityId": "fc_forma", "sportId": "fitness", "type": "training",
            "title": "Тестовая тренировка", "description": "Описание", "ageCategory": "adult",
            "skillLevel": "any", "price": 300, "organizer": "Тест Org", "contact": "+7 999",
        }
        resp = client.post("/api/admin/activities", json=data, headers=headers)
        assert resp.status_code == 201
        aid = resp.json()["activity"]["id"]

        resp = client.get("/api/admin/activities", headers=headers)
        assert resp.status_code == 200
        assert any(i["activity"]["id"] == aid for i in resp.json()["items"])

        resp = client.patch(f"/api/admin/activities/{aid}", json={"price": 500}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["activity"]["price"] == 500

        slot = {"date": "2030-01-15", "startTime": "10:00", "endTime": "11:00", "capacity": 5, "coach": "П. Тестов"}
        resp = client.post(f"/api/admin/activities/{aid}/slots", json=slot, headers=headers)
        assert resp.status_code == 201
        slot_id = resp.json()["id"]

        resp = client.get(f"/api/admin/activities/{aid}/slots", headers=headers)
        assert resp.status_code == 200
        assert any(sl["id"] == slot_id for sl in resp.json()["items"])

        resp = client.delete(f"/api/admin/slots/{slot_id}", headers=headers)
        assert resp.status_code == 200
        resp = client.delete(f"/api/admin/activities/{aid}", headers=headers)
        assert resp.status_code == 200

    def test_facilities_and_sports_admin(self, client: TestClient):
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.get("/api/admin/facilities", headers=headers)
        assert resp.status_code == 200 and len(resp.json()["items"]) >= 10
        resp = client.get("/api/admin/sports", headers=headers)
        assert resp.status_code == 200 and len(resp.json()["items"]) >= 8

    def test_create_sport(self, client: TestClient):
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/admin/sports", json={"name": "Сквош", "emoji": "🏸"}, headers=headers)
        assert resp.status_code == 201
        sid = resp.json()["id"]
        assert resp.json()["name"] == "Сквош"
        resp = client.post("/api/admin/sports", json={"name": "Сквош", "emoji": "🏸"}, headers=headers)
        assert resp.status_code == 409
        resp = client.get("/api/admin/sports", headers=headers)
        assert any(s["id"] == sid and s["name"] == "Сквош" for s in resp.json()["items"])

    def test_create_facility(self, client: TestClient):
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/admin/facilities", json={
            "name": "Ледовый дворец", "type": "Ледовая арена", "address": "ул. Тестовая, 1",
            "city": "Москва", "district": "ЦАО", "latitude": 55.75, "longitude": 37.61,
            "description": "Тестовая локация",
        }, headers=headers)
        assert resp.status_code == 201
        fid = resp.json()["id"]
        assert resp.json()["name"] == "Ледовый дворец"
        resp = client.get("/api/admin/facilities", headers=headers)
        assert any(f["id"] == fid for f in resp.json()["items"])

    def test_create_facility_missing_field(self, client: TestClient):
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.post("/api/admin/facilities", json={"name": "X"}, headers=headers)
        assert resp.status_code == 400

    def test_activity_registrations(self, client: TestClient):
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        slot_id = _first_open_slot_id(client, "a_yoga_morning")
        api(client, "/api/registrations", user="org-client-1", method="POST",
            json_body={"slotId": slot_id, "name": "Клиент Тестов", "phone": "+7 999 123-45-67", "consent": True})
        api(client, "/api/registrations", user="org-client-2", method="POST",
            json_body={"slotId": slot_id, "name": "Клиент Без Номера", "consent": True})
        resp = client.get("/api/admin/activities/a_yoga_morning/registrations", headers=headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        by_name = {i["registration"]["name"]: i["registration"] for i in items}
        assert by_name["Клиент Тестов"]["phone"] == "+7 999 123-45-67"
        assert "phone" not in by_name["Клиент Без Номера"]
        assert by_name["Клиент Тестов"]["createdAt"]
        assert all(i["slot"]["activityId"] == "a_yoga_morning" for i in items)

    def test_activity_registrations_404(self, client: TestClient):
        token = self._token(client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.get("/api/admin/activities/nope/registrations", headers=headers)
        assert resp.status_code == 404

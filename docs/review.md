# Ревью кода MVP «Спорт рядом»

Дата: 16.09.2026 (обновлено: 20.09.2026). Цель: убедиться, что весь бэкенд и бизнес-логика написаны на Python,
TypeScript используется только для связки с MAX (бот, мини-приложение, админ-панель),
и зафиксировать найденные недочёты с решениями.

## 1. Граница языков (главный вывод)

| Слой | Язык | Что содержит | Бизнес-логика |
|---|---|---|---|
| `backend/` | **Python 3.12** | FastAPI-ручки, доменная логика, PostgreSQL (SQLAlchemy 2.0), seed-данные, валидация initData | ✅ вся |
| `shared/` | TypeScript | Только типы, константы, этикетки, `haversineKm` (утилита), `geo.ts` | ❌ типы/константы |
| `mini-app/` | TypeScript + React | UI мини-приложения в MAX, вызовы `/api/*` через `api.ts`, геолокация (`navigator.geolocation`) | ❌ только UI |
| `bot/` | TypeScript + `@maxhub/max-bot-api` | Связка с MAX: `/start`, поиск, карточки, запись, «Мои записи», избранное, профиль, напоминания, гео (`requestGeoLocation`), оценки, маршрут | ❌ только интеграция |
| `admin-app/` | TypeScript + React (Vite) | Панель организатора: вход, CRUD мероприятий/слотов/тренеров, мониторинг записей | ❌ только UI |

**Вердикт:** весь backend и вся бизнес-логика — Python. TypeScript встречается только там,
где это необходимо для MAX: мини-приложение (React), бот (`@maxhub/max-bot-api`) и админ-панель
организатора. Серверных JS/TS-файлов в `backend/` нет. Мини-приложение, бот и админка обращаются
к Python-бэкенду только по HTTP (`/api/*`), никакой логики синхронизации данных между клиентами в TS нет.

## 2. Что проверено

- ✅ Бэкенд 100% Python: `backend/app/{main,db,models,database,admin,auth,config,seed,reset}.py`, `backend/tests`.
- ✅ Нет `*.ts`/`*.js` внутри `backend/`.
- ✅ `npm run typecheck` (shared / bot / mini-app / admin-app) — 0 ошибок.
- ✅ `npm run test:backend` (pytest) — 40 passed.
- ✅ `npm run build:mini`, `npm run build:admin` — SPA собираются.
- ✅ Docker: `docker compose build` + smoke-тест (health, справочники, SPA, запись → отмена) из контейнера.
- ✅ Авторизация: HMAC-SHA256 initData (`backend/app/auth.py`), demo-вход по `x-user-id`;
  админка — opaque-токен (см. §3.1).
- ✅ Контракт: `docs/OPENAPI.yaml` соответствует фактическим ответам API.
- ✅ Ошибки внешних интеграций не имитируются; данные помечены «Демонстрационные данные MVP».

## 3. Найденные проблемы и решения

### 3.1 Исправлено в этом ревью

| # | Проблема | Правка |
|---|---|---|
| 1 | Хранилище JSON-файл с `threading.Lock` | Переведено на **PostgreSQL 16** (SQLAlchemy 2.0), схема создаётся автоматически, seed при первом старте |
| 2 | Админка на JWT-подписи | Заменено на **opaque-сессию** (`admin_sessions`): случайный `secrets.token_urlsafe` из БД, Bearer-заголовок прежний (`models.py`, `admin.py`) |
| 3 | Модель без тренеров/оценок | Добавлены `Coach` (управляется организатором) и `Rating` (оценка тренировки и тренера 1–5, unique по userId+slotId) |
| 4 | Геолокации не было | Профиль пользователя получил `latitude`/`longitude`; бот — кнопка `requestGeoLocation` в профиле; мини-апп — `navigator.geolocation` |
| 5 | Слот не виден в карточке активности при регистрации | Панель «Построить маршрут» (Яндекс Карты) добавлена в боте на подтверждении записи и после неё |
| 6 | Неиспользуемый импорт `StaticFiles` в `main.py` | Удалён |
| 7 | Дублирование логики `_require_user` / `_require_user_static` / вложенный `_resolve_user` | Сведено к одной `async def _resolve_user(request)` на уровне модуля |
| 8 | Мёртвая конфигурация `require_init_data` в `config.py` | Удалена |
| 9 | Неиспользуемые импорты (`os` в `db.py`, `Dict` из typing) | Удалены |
| 10 | `resolve_user` помечал запрос `validated=True`, даже если `MAX_BOT_TOKEN` не задан | Теперь: токен задан → строгая проверка; токена нет → `validated=False`, запрос считается demo |
| 11 | Докстрока `main.py` ссылалась на «TypeScript-версию» | Переписана: backend — Python, контракт — `docs/OPENAPI.yaml` |

### 3.2 Известные ограничения (осознанно оставлено для MVP)

| # | Ограничение | Почему оставлено | Когда менять |
|---|---|---|---|
| 1 | «Race condition» на последнее место слота: проверка «есть место» и инкремент не защищены единой транзакцией | Однопроцессный uvicorn, запросы сериализуются на event-loop без `await` внутри доменных функций → на практике не проявляется | При переходе на многопроцессность — атомарный UPDATE/сага |
| 2 | Напоминания работают только через опрос ботом `GET /api/reminders/due` (polling) | Максимально простая и тестируемая схема для MVP | При проде — очередь + cron/worker |
| 3 | Слот ПРО «19:00», сегодня: при поздней дате демо-набора часть слотов может быть в прошлом | Дата генерации seed — «сегодня», слоты на +0..+7 дней | `npm run seed:backend` обновляет |
| 4 | `validate_init_data` не проверяет TTL/auth_date | Совместимо с текущим SDK; для MVP достаточно | При загрузке на бой — добавить проверку `auth_date` |
| 5 | Бот отдаёт «Мои записи» по `x-user-id` (demo) без initData | В demo-режиме это работает | При интеграции с реальным MAX-аккаунтом |
| 6 | `navigator.geolocation` в мини-апп требует HTTPS-контекста | В MAX-bridge нет метода запроса геопозиции, поэтому используется стандарт браузера | Публикация мини-апп по HTTPS (`SERVE_STATIC=true` или внешний хостинг/туннель) |

## 4. Ревью по слоям

### 4.1 Python backend — замечания и статус

- **`main.py`**: чисто; дублирование `_resolve_user` устранено; обработчики читают тело через
  `await request.json()`, ошибки — единый JSON `{"error": {...}}`.
- **`models.py`**: 12 сущностей; ID — `uuid4().hex[:12]`; ограничения unique в таблицах
  (`uq_rating_user_slot` и др.).
- **`database.py`**: SQLAlchemy engine + Session; схема создаётся `create_all`, пароль админа
  хэшируется `bcrypt` при сидировании.
- **`admin.py`**: opaque-сессия вместо JWT; `bcrypt.checkpw` при входе; CRUD спорта/объектов/
  активностей/слотов/тренеров + просмотр записей.
- **`auth.py`**: HMAC-SHA256 корректен (secret = `HMAC(WebAppData, token)`, check_string =
  отсортированные `key=value`, хэш сравнивается `compare_digest`). Поведение при пустом токене
  исправлено (см. 3.1 #10).
- **`config.py`**: всё через env; мёртвые опции удалены.
- **`seed.py`**: автономные `dataclass` + `build_seed`; данные PostgreSQL.

### 4.2 Mini App (TS/React) — замечания

- Код соответствует контракту `shared/src/types.ts`; все данные — через `/api` (Python).
- `track()` отправляет события в `/api/events` (неблокирующе).
- Правильные UX-состояния: loading / empty / error / retry / disabled / validation.
- Геолокация: `navigator.geolocation` в `ProfilePage`, fallback на центр Москвы.
- Оценки: после прошедшего занятия в «Моих записях» доступна форма оценки (1–5 + комментарий).
- Замечание: страницы дублируют небольшую логику форматирования/`toSlotView` — приемлемо,
  т.к. это UI-вью, не источник истины; источник истины — Python-бэкенд.

### 4.3 Bot (TS, MAX integration) — замечания

- `@maxhub/max-bot-api` — официальный SDK MAX; `.callback`, `.link`, `.sendMessageToUser`, `setMyCommands`.
- Напоминания — polling `GET /api/reminders/due` → `POST /api/reminders/sent`.
- Гео: `Keyboard.button.requestGeoLocation` — только в профиле; координаты из `latitude`/`longitude`
  пользователя участвуют в поиске.
- В карточках и после записи показываются тренер с рейтингом и оценка занятия; кнопка
  «Построить маршрут» открывает Яндекс Карты.
- Замечание: `BACKEND_URL` в compose = `http://backend:8080` — корректно по имени сервиса.

### 4.4 Админ-панель (React) — замечания

- Вход организатора → opaque-токен; CRUD активностей, слотов (с тренером), тренеров;
  справочники спорта/объектов; мониторинг записей по активности.
- Замечание: nginx отдаёт SPA и проксирует `/api` на `backend:8080`.

## 5. Запуск проверок (итог)

```bash
npm run typecheck       # 0 ошибок
npm run test:backend    # 40 passed
npm run build:mini      # vite build OK
npm run build:admin     # vite build OK
docker compose build    # backend (python) + bot (node) + admin (nginx) собираются
```

## 6. Вывод

Backend и вся доменная логика — **Python**. TypeScript — только связка с MAX (бот), мини-приложение
в чате MAX и админ-панель организатора. Документация и контракт актуальны (`docs/OPENAPI.yaml`,
`docs/product.md`, `docs/test-plan.md`, `docs/uml/*.puml`, `README.md`). Найденные проблемы
исправлены; осознанные ограничения задокументированы и не блокируют демо.
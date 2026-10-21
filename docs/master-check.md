# Чек-лист соответствия мастер-промту (самопроверка)

Дата проверки: 16.09.2026 (обновлено: 20.09.2026). Статус обновляется по мере доводки MVP.

## 1. Продукт (проблема → решение)

| Требование | Статус | Где |
|---|---|---|
| Конкретная проблема (не весь спорт) | ✅ | docs/product.md §1 |
| Конкретный пользовательский сегмент | ✅ | docs/product.md §5 |
| Подтверждение актуальности | ✅ (аргументация) | docs/product.md §1, §5 |
| Один приоритетный сценарий | ✅ | README §8, docs/product.md §9 |
| As Is (пошагово, боль) | ✅ | docs/product.md §2 |
| To Be (что исчезло/сократилось) | ✅ | docs/product.md §3 |
| Продуктовая гипотеза (шаблон) | ✅ | README §5, docs/product.md §6 |
| Метрики эффекта | ✅ | README §6, docs/product.md §7 |
| Ограничение скоупа (Must/Should/Could/Won't) | ✅ | README §7, docs/product.md §8 |
| Разделение бот vs мини-приложение | ✅ | docs/product.md §11 |
| Пилотный план (конкретный) | ✅ | docs/product.md §15 |
| Масштабирование (ядро/переменная) | ✅ | docs/product.md §16 |

## 2. UX/UI

| Требование | Статус | Где |
|---|---|---|
| User flow от начала до результата | ✅ | README §8, docs/uml/01,02,03,04 |
| Экранные состояния: loading/success/empty/error/retry/disabled/validation | ✅ | mini-app/src/pages + StateViews.tsx |
| «Ничего не найдено» + действия | ✅ | ResultsPage (EmptyState) |
| Ошибка загрузки + «Повторить» | ✅ | ErrorState во всех страницах |
| Ошибка регистрации без тупика | ✅ | RegisterPage (сохранение выбора + retry) |
| Адаптивность / mobile + web / touch | ✅ | CSS в мини-приложении |
| Минимум действий | ✅ | форма: имя + согласие |
| Отсутствие несуществующих функций MAX | ✅ | только реальные API (bridge, requestGeoLocation, openApp, sendMessageToUser) |

## 3. MAX-интеграция

| Требование | Статус | Где |
|---|---|---|
| Чат-бот создан | ✅ (код) | bot/src/index.ts |
| Мини-приложение связано с ботом | ✅ (по HTTP /api/*) | mini-app/, shared/ |
| Сценарий доступен в MAX | 🟡 (код готов; публикация требует токена) | README §22 |
| Мобильная версия | 🟡 (проверяется после публикации) | — |
| Веб-версия | 🟡 (проверяется после публикации) | — |
| Актуальные API MAX | ✅ | @maxhub/max-bot-api, st.max.ru/js/max-web-app.js |
| HTTPS | 🟡 (деплой-задача; локально http) | README §22, docs/product.md §18 |

> Примечание: геолокация мини-апп реализована через стандарт `navigator.geolocation`
> (в MAX-bridge методы запроса геопозиции нет), поэтому требует HTTPS при публикации.
> В боте геопозиция запрашивается кнопкой `requestGeoLocation` (профиль).

## 4. Функциональность

| Требование | Статус | Где |
|---|---|---|
| Поиск/каталог/фильтры | ✅ | GET /api/activities |
| Карточка + расписание | ✅ | GET /api/activities/:id, /schedule |
| Регистрация + подтверждение + «Мои записи» | ✅ | POST /api/registrations |
| Race-condition: полный слот / дубликат / консистентность | ✅ | тесты 12–15 (409) |
| Отмена (слот снова доступен) | ✅ | POST /api/registrations/:id/cancel |
| Напоминания (бот) | ✅ | GET /api/reminders/due + bot |
| Валидация: поля/дата/время/доступность/дубль/отмена/закрытие | ✅ | тесты 12–15 + формы |
| Избранное | ✅ | /api/favorites |
| Оценки занятия и тренера (Rating) | ✅ | POST /api/ratings, /api/me/ratings |
| Тренеры (справочник, привязка к слотам) | ✅ | /api/coaches, /api/admin/coaches* |
| Геолокация пользователя | ✅ | PATCH /api/me (latitude/longitude), бот requestGeoLocation, мини-апп navigator.geolocation |
| Маршрут до объекта | ✅ | кнопка «Построить маршрут» (Яндекс Карты) в боте |
| Админ-панель организатора | ✅ | /api/admin/* (opaque-токен), admin-app/ |
| Аналитика событий (13 событий) | ✅ | shared EventName + POST /api/events |

## 5. Данные

| Требование | Статус | Где |
|---|---|---|
| Тестовые данные (масштаб) | ✅ | backend/app/seed.py (8/10/12/7 дней) |
| Пометка «Демонстрационные данные MVP» | ✅ | config.DEMO_DATA_SOURCE |
| source + sourceUpdatedAt в UI | ✅ | карточка активности |
| Нет имитации реальной интеграции | ✅ | README §17, §22 |
| Разделение факты/гипотезы/данные | ✅ | docs/product.md §6, §14 |
| Хранилище | ✅ PostgreSQL 16 | compose (db), SQLAlchemy 2.0 |

## 6. Технологии и структура

| Требование | Статус | Где |
|---|---|---|
| React-мини-приложение | ✅ | mini-app/ |
| MAX Bot | ✅ | bot/ |
| Админ-панель организатора (React) | ✅ | admin-app/ |
| Backend (FastAPI/Python + PostgreSQL) | ✅ | backend/app/ |
| Слои: bot → mini app → API → domain → data | ✅ | README §10, docs/uml/09,10 |
| Локальные данные не зашиты в UI | ✅ | всё через /api |
| Бэкенд и логика — Python; TS только для MAX (бот + мини-приложение + админка) | ✅ | docs/review.md §1 |
| UML-диаграммы клиентских путей и архитектуры | ✅ | docs/uml/*.puml (10 диаграмм) |

## 7. Docker / Воспроизводимость

| Требование | Статус | Где |
|---|---|---|
| Dockerfile | ✅ | Dockerfile (многостадийный) |
| compose.yaml | ✅ | compose.yaml (db + backend + admin + bot) |
| .dockerignore | ✅ | .dockerignore |
| Одна команда запуска | ✅ | `docker compose up -d --build` |
| Быстрый build | ✅ | многостадийные образы |
| Повторный запуск | ✅ | `docker compose up -d` |
| Корректное завершение | ✅ | `docker compose down` |
| .env.example | ✅ | .env.example |
| Зависимости зафиксированы | ✅ | package-lock.json, requirements.txt |
| README (24 обязательных раздела) | ✅ | README.md |

## 8. Безопасность

| Требование | Статус | Где |
|---|---|---|
| Секреты не в git | ✅ | grep-проверка: токенов нет |
| .env.example без секретов | ✅ | только заглушки |
| Валидация initData (HMAC-SHA256) | ✅ | backend/app/auth.py |
| Пароли организаторов | ✅ bcrypt | backend/app/admin.py, database.py |
| Админ-авторизация | ✅ opaque-токен из БД (не JWT) | backend/app/admin.py, models.py (AdminSession) |
| Нет закрытых библиотек/чужого кода | ✅ | только публичные зависимости |

## 9. Тестирование

| Требование | Статус | Где |
|---|---|---|
| Автотесты API (pytest) | ✅ 40 passed | backend/tests/test_api.py |
| Тест-план (API/rating/admin + happy/empty/full/duplicate/validation/network/retry/cancel/reopen + бот) | ✅ | docs/test-plan.md |
| typecheck (TS) | ✅ | npm run typecheck |
| Сборка SPA | ✅ | npm run build:mini, npm run build:admin |
| E2E smoke (API + SPA) | ✅ | см. docs/test-plan.md |

## 10. Документация (артефакты)

| # | Артефакт | Статус | Где |
|---|---|---|---|
| 1 | Product brief | ✅ | docs/product.md |
| 2 | Problem statement | ✅ | docs/product.md §1 |
| 3 | Target audience | ✅ | docs/product.md §5 |
| 4 | As Is | ✅ | docs/product.md §2 |
| 5 | To Be | ✅ | docs/product.md §3 |
| 6 | Product hypothesis | ✅ | docs/product.md §6 |
| 7 | Metrics | ✅ | docs/product.md §7 |
| 8 | MVP scope | ✅ | docs/product.md §8 |
| 9 | User flow | ✅ | docs/product.md §9, docs/uml/ |
| 10 | UX/UI structure | ✅ | docs/product.md §10 |
| 11 | Information architecture | ✅ | docs/product.md §10 |
| 12 | Data model | ✅ | docs/product.md §12, docs/uml/07 |
| 13 | Architecture diagram | ✅ | README §10, docs/uml/09,10 |
| 14 | API contract | ✅ | docs/OPENAPI.yaml |
| 15 | Test data | ✅ | backend/app/seed.py |
| 16 | React Mini App | ✅ | mini-app/ |
| 17 | MAX Bot | ✅ | bot/ |
| 18 | Backend | ✅ | backend/app/ |
| 19 | Dockerfile | ✅ | Dockerfile |
| 20 | compose.yaml | ✅ | compose.yaml |
| 21 | .dockerignore | ✅ | .dockerignore |
| 22 | .env.example | ✅ | .env.example |
| 23 | README.md | ✅ | README.md |
| 24 | Test plan | ✅ | docs/test-plan.md |
| 25 | Demo scenario | ✅ | README §21, docs/product.md §17 |
| 26 | Scaling plan | ✅ | docs/product.md §16 |
| 27 | Pilot plan | ✅ | docs/product.md §15 |
| 28 | Presentation structure | ✅ | docs/presentation.md |
| 29 | Code review (Python/TS boundary) | ✅ | docs/review.md |
| 30 | UML-диаграммы клиентских путей | ✅ | docs/uml/*.puml |

## 11. Общие правила мастер-промта

- Сначала проблема → затем механика → затем технология ✅
- Не имитируем несуществующие интеграции ✅
- Тестовые данные не выдаём за реальные ✅
- Ограничения не скрываем ✅
- LLM не добавляем там, где обычная логика лучше ✅
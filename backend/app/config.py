"""Конфигурация бэкенда «Спорт рядом» (переменные окружения)."""

import os
from pathlib import Path

DEMO_DATA_SOURCE = "Демонстрационные данные MVP"

_REPO_ROOT = Path(__file__).resolve().parents[2]


class Config:
    port: int = int(os.environ.get("PORT", "8080"))
    data_dir: str = os.environ.get("DATA_DIR", os.path.join("backend", "data"))
    demo_mode: bool = os.environ.get("DEMO_MODE", "true").lower() != "false"
    cors_origin: str = os.environ.get("CORS_ORIGIN", "*")
    bot_token: str = os.environ.get("MAX_BOT_TOKEN", "")
    mini_app_url: str = os.environ.get("MINI_APP_URL", "")
    bot_poll_interval_ms: int = int(os.environ.get("BOT_POLL_INTERVAL_MS", "60000") or "60000")
    serve_static: bool = os.environ.get("SERVE_STATIC", "true").lower() != "false"
    mini_app_dist: str = os.environ.get(
        "MINI_APP_DIST",
        str(_REPO_ROOT / "mini-app" / "dist"),
    )
    # PostgreSQL
    database_url: str = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://sport:sport@localhost:5432/sport",
    )
    # Админка организаторов: дефолтный аккаунт создаётся при первом старте
    admin_login: str = os.environ.get("ADMIN_LOGIN", "admin")
    admin_password: str = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin_token_ttl_sec: int = int(os.environ.get("ADMIN_TOKEN_TTL_SEC", "86400"))


config = Config()
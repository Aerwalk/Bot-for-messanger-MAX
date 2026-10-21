"""Валидация initData мини-приложения MAX.

Алгоритм (совместим с dev.max.ru/docs/webapps/validation):
1. secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
2. hash = HMAC_SHA256(key=secret_key, data=check_string)
   check_string = отсортированные по ключу параметры в формате key=value, разделённые "\n"
   (параметры без ключа "hash")
"""

import hashlib
import hmac
import json
from urllib.parse import parse_qs
from typing import Optional

from .config import config


def validate_init_data(init_data: str, bot_token: str) -> bool:
    if not bot_token or not init_data:
        return False
    params = parse_qs(init_data, keep_blank_values=True)
    values = {k: v[0] for k, v in params.items()}
    expected_hash = values.get("hash")
    if not expected_hash:
        return False

    pairs = sorted(
        f"{k}={v}" for k, v in values.items() if k != "hash"
    )
    check_string = "\n".join(pairs)

    secret = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    calculated = hmac.new(secret, check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(calculated, expected_hash)


def parse_init_data(init_data: str) -> dict:
    params = parse_qs(init_data, keep_blank_values=True)
    values = {k: v[0] for k, v in params.items()}
    user_raw = values.get("user")
    if user_raw:
        try:
            user = json.loads(user_raw)
        except ValueError:
            return {}
        return {
            "id": str(user["id"]) if user.get("id") is not None else None,
            "firstName": user.get("first_name"),
            "userId": str(user["user_id"]) if user.get("user_id") is not None else None,
        }
    user_id = values.get("user_id") or values.get("id") or values.get("mid")
    return {"id": user_id if user_id is not None else None}


def resolve_user(init_data: Optional[str], demo_name: Optional[str] = None) -> dict:
    """Возвращает {id, name, demo, validated} либо бросает ValueError."""
    if init_data:
        if config.bot_token:
            if not validate_init_data(init_data, config.bot_token):
                raise ValueError("initData не прошёл проверку")
            validated = True
        else:
            # Токен не задан — подпись проверить нельзя; считаем запрос демо-запросом.
            validated = False
        parsed = parse_init_data(init_data)
        user_id = parsed.get("id") or parsed.get("userId")
        if user_id is None:
            if config.demo_mode:
                user_id = demo_name or "demo-user"
            else:
                raise ValueError("initData не содержит идентификатор пользователя")
        return {"id": user_id, "name": parsed.get("firstName"), "demo": not validated, "validated": validated}

    if config.demo_mode:
        return {"id": demo_name or "demo-user", "name": demo_name, "demo": True, "validated": False}

    raise ValueError("Требуется initData или demo-режим")
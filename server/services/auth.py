"""API Key 鉴权与限流"""

from __future__ import annotations

import hashlib
import os
import secrets
from dataclasses import dataclass
from datetime import date
from typing import Optional

from database.db import get_connection
from config import get_settings


@dataclass
class ApiKeyRecord:
  key_hash: str
  key_prefix: str
  label: str
  daily_limit: int
  is_active: bool


def hash_api_key(key: str) -> str:
  return hashlib.sha256(key.encode("utf-8")).hexdigest()


def generate_api_key(prefix: str = "wh") -> str:
  return f"{prefix}_{secrets.token_urlsafe(24)}"


def _from_env_keys() -> dict[str, ApiKeyRecord]:
  """环境变量 API_KEYS=label:limit:key,label2:limit2:key2 或纯 key 列表"""
  raw = os.getenv("API_KEYS", "")
  result: dict[str, ApiKeyRecord] = {}
  default_limit = get_settings().default_daily_limit

  for i, item in enumerate(raw.split(",")):
    part = item.strip()
    if not part:
      continue
    label = f"env-{i + 1}"
    limit = default_limit
    key = part
    if part.count(":") >= 2:
      label, limit_str, key = part.split(":", 2)
      limit = int(limit_str)
    elif part.count(":") == 1:
      label, key = part.split(":", 1)

    kh = hash_api_key(key)
    result[kh] = ApiKeyRecord(
      key_hash=kh,
      key_prefix=key[:8] + "****",
      label=label.strip(),
      daily_limit=limit,
      is_active=True,
    )
  return result


def lookup_api_key(api_key: str) -> Optional[ApiKeyRecord]:
  if not api_key or len(api_key) < 16:
    return None

  kh = hash_api_key(api_key)
  env_keys = _from_env_keys()
  if kh in env_keys:
    return env_keys[kh]

  conn = get_connection()
  try:
    with conn.cursor() as cur:
      cur.execute(
        """
        SELECT key_hash, key_prefix, label, daily_limit, is_active
        FROM ai_api_keys WHERE key_hash = %s AND is_active = 1
        """,
        (kh,),
      )
      row = cur.fetchone()
      if not row:
        return None
      return ApiKeyRecord(
        key_hash=row["key_hash"],
        key_prefix=row["key_prefix"],
        label=row["label"],
        daily_limit=int(row["daily_limit"]),
        is_active=bool(row["is_active"]),
      )
  finally:
    conn.close()


def check_rate_limit(key_hash: str, daily_limit: int, cost_units: int = 1) -> tuple[bool, int, int]:
  """
  检查并递增当日用量。
  返回 (allowed, used, limit)
  """
  today = date.today()
  settings = get_settings()

  conn = get_connection()
  try:
    with conn.cursor() as cur:
      cur.execute(
        """
        SELECT request_count FROM ai_rate_limits
        WHERE key_hash = %s AND usage_date = %s
        FOR UPDATE
        """,
        (key_hash, today),
      )
      row = cur.fetchone()
      used = int(row["request_count"]) if row else 0
      limit = min(daily_limit, settings.global_daily_limit)

      if used + cost_units > limit:
        conn.rollback()
        return False, used, limit

      if row:
        cur.execute(
          """
          UPDATE ai_rate_limits SET request_count = request_count + %s
          WHERE key_hash = %s AND usage_date = %s
          """,
          (cost_units, key_hash, today),
        )
      else:
        cur.execute(
          """
          INSERT INTO ai_rate_limits (key_hash, usage_date, request_count)
          VALUES (%s, %s, %s)
          """,
          (key_hash, today, cost_units),
        )
      conn.commit()
      return True, used + cost_units, limit
  finally:
    conn.close()


def insert_api_key(key: str, label: str, daily_limit: Optional[int] = None) -> str:
  settings = get_settings()
  kh = hash_api_key(key)
  prefix = key[:8] + "****" if len(key) > 8 else "****"
  limit = daily_limit or settings.default_daily_limit

  conn = get_connection()
  try:
    with conn.cursor() as cur:
      cur.execute(
        """
        INSERT INTO ai_api_keys (key_hash, key_prefix, label, daily_limit, is_active)
        VALUES (%s, %s, %s, %s, 1)
        ON DUPLICATE KEY UPDATE label = VALUES(label), daily_limit = VALUES(daily_limit), is_active = 1
        """,
        (kh, prefix, label, limit),
      )
    conn.commit()
  finally:
    conn.close()
  return key

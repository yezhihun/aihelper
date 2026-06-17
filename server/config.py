"""应用配置（从环境变量读取）"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
  env: str
  api_auth_enabled: bool
  admin_token: str
  default_daily_limit: int
  global_daily_limit: int
  cors_origins: list[str]
  docs_enabled: bool
  site_url: str
  contact_email: str

  @property
  def is_production(self) -> bool:
    return self.env == "production"


@lru_cache
def get_settings() -> Settings:
  env = os.getenv("APP_ENV", "development")
  cors_raw = os.getenv("CORS_ORIGINS", "*")
  origins = [o.strip() for o in cors_raw.split(",") if o.strip()] if cors_raw != "*" else ["*"]

  return Settings(
    env=env,
    api_auth_enabled=os.getenv("API_AUTH_ENABLED", "false" if env == "development" else "true").lower()
    == "true",
    admin_token=os.getenv("ADMIN_TOKEN", ""),
    default_daily_limit=int(os.getenv("DEFAULT_DAILY_LIMIT", "50")),
    global_daily_limit=int(os.getenv("GLOBAL_DAILY_LIMIT", "10000")),
    cors_origins=origins,
    docs_enabled=os.getenv("DOCS_ENABLED", "true" if env == "development" else "false").lower() == "true",
    site_url=os.getenv("SITE_URL", "https://wenhaode.com").rstrip("/"),
    contact_email=os.getenv("CONTACT_EMAIL", "support@wenhaode.com"),
  )

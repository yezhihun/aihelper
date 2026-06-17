"""FastAPI 依赖：鉴权、限流、管理权限"""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException, Query

from config import get_settings
from services.auth import ApiKeyRecord, check_rate_limit, lookup_api_key


def _extract_api_key(
  x_api_key: Optional[str],
  authorization: Optional[str],
) -> Optional[str]:
  if x_api_key and x_api_key.strip():
    return x_api_key.strip()
  if authorization and authorization.lower().startswith("bearer "):
    return authorization[7:].strip()
  return None


_DEV_RECORD = ApiKeyRecord(
  key_hash="dev",
  key_prefix="dev",
  label="development",
  daily_limit=999999,
  is_active=True,
)


async def require_api_key(
  x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
  authorization: Optional[str] = Header(default=None),
) -> ApiKeyRecord:
  settings = get_settings()
  if not settings.api_auth_enabled:
    return _DEV_RECORD

  key = _extract_api_key(x_api_key, authorization)
  if not key:
    raise HTTPException(status_code=401, detail="缺少 API Key，请在插件设置中配置")
  record = lookup_api_key(key)
  if not record:
    raise HTTPException(status_code=401, detail="API Key 无效或已停用")
  return record


async def require_billed_api_key(
  record: ApiKeyRecord = Depends(require_api_key),
) -> ApiKeyRecord:
  """analyze / complete 等计费接口：鉴权 + 日限流"""
  settings = get_settings()
  if not settings.api_auth_enabled:
    return record

  allowed, used, limit = check_rate_limit(record.key_hash, record.daily_limit)
  if not allowed:
    raise HTTPException(
      status_code=429,
      detail=f"今日调用次数已达上限（{used}/{limit}），请明天再试或联系管理员",
    )
  return record


def verify_admin(
  token: Optional[str] = Query(default=None),
  x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
  authorization: Optional[str] = Header(default=None),
) -> None:
  settings = get_settings()
  if not settings.admin_token:
    if settings.is_production:
      raise HTTPException(status_code=503, detail="管理接口未配置 ADMIN_TOKEN")
    return

  candidates = [token, x_admin_token]
  if authorization and authorization.lower().startswith("bearer "):
    candidates.append(authorization[7:].strip())

  if any(c and c == settings.admin_token for c in candidates):
    return
  raise HTTPException(status_code=403, detail="无权访问管理接口")

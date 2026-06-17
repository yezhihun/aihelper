"""问得好 - AI 提问增强 API"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from config import get_settings
from database.db import init_db
from deps import require_api_key, require_billed_api_key, verify_admin
from schemas.analytics import RecentEvent, StatsSummary, UsageEventsRequest, UsageEventsResponse, UserStat
from schemas.requirement import AnalyzeRequest, AnalyzeResponse, CompleteRequest, CompleteResponse
from services.analyze import analyze_question
from services.analytics import get_recent_events, get_summary, get_users, log_event, log_events
from services.auth import ApiKeyRecord
from services.complete import complete_question
from services.cost import calc_cost

load_dotenv()

STATIC_DIR = Path(__file__).parent / "static"
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
  init_db()
  yield


app = FastAPI(
  title="问得好 API",
  description="AI 提问增强层后端",
  version="3.0.0",
  lifespan=lifespan,
  docs_url="/docs" if settings.docs_enabled else None,
  redoc_url="/redoc" if settings.docs_enabled else None,
  openapi_url="/openapi.json" if settings.docs_enabled else None,
)

if settings.cors_origins == ["*"]:
  app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
  )
else:
  app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Admin-Token", "Authorization"],
  )


def _meta(req) -> tuple:
  if not req.meta:
    return None, None, None
  return req.meta.sessionId, req.meta.clientId, req.meta.platform


@app.get("/", summary="服务信息")
async def root():
  return {
    "name": "问得好 API",
    "status": "running",
    "version": "3.0.0",
    "privacy": "/privacy",
    "terms": "/terms",
    "health": "/health",
  }


@app.get("/health", summary="健康检查")
async def health():
  return {"status": "ok", "env": settings.env}


@app.get("/privacy", include_in_schema=False)
async def privacy_page():
  return FileResponse(STATIC_DIR / "privacy.html")


@app.get("/terms", include_in_schema=False)
async def terms_page():
  return FileResponse(STATIC_DIR / "terms.html")


@app.get("/stats", include_in_schema=False)
async def stats_page():
  return FileResponse(STATIC_DIR / "stats.html")


@app.post("/api/events", response_model=UsageEventsResponse, summary="批量上报使用事件")
async def ingest_events(
  req: UsageEventsRequest,
  _key: ApiKeyRecord = Depends(require_api_key),
):
  try:
    return UsageEventsResponse(accepted=log_events(req.events))
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"写入失败: {e}")


@app.get("/api/stats/summary", response_model=StatsSummary, summary="使用数据汇总")
async def stats_summary(
  days: int = Query(default=7, ge=1, le=90),
  _: None = Depends(verify_admin),
):
  try:
    return get_summary(days)
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"查询失败: {e}")


@app.get("/api/stats/users", response_model=list[UserStat], summary="用户统计列表")
async def stats_users(
  limit: int = Query(default=100, ge=1, le=500),
  _: None = Depends(verify_admin),
):
  try:
    return get_users(limit)
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"查询失败: {e}")


@app.get("/api/stats/events", response_model=list[RecentEvent], summary="最近使用事件")
async def stats_events(
  limit: int = Query(default=50, ge=1, le=200),
  _: None = Depends(verify_admin),
):
  try:
    return get_recent_events(limit)
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"查询失败: {e}")


@app.post("/api/analyze", response_model=AnalyzeResponse, summary="分析问题完整度")
async def analyze(
  req: AnalyzeRequest,
  key: ApiKeyRecord = Depends(require_billed_api_key),
):
  sid, cid, platform = _meta(req)
  start = time.time()
  try:
    ctx = req.conversationContext or None
    result, chat = await analyze_question(req.question, ctx if ctx else None)
    cost = calc_cost(chat.prompt_tokens, chat.completion_tokens)
    log_event(
      "analyze_success",
      sid,
      cid,
      platform,
      {
        "score": result.score,
        "intent": result.graph.intent,
        "missingCount": len(result.graph.missingFields),
        "autoEnrichCount": len(result.graph.autoEnrichments),
        "contextCount": len(req.conversationContext),
        "questionLength": len(req.question),
        "durationMs": int((time.time() - start) * 1000),
        "apiKeyLabel": key.label,
      },
      prompt_tokens=chat.prompt_tokens,
      completion_tokens=chat.completion_tokens,
      cost=cost,
    )
    return result
  except ValueError as e:
    log_event("analyze_error", sid, cid, platform, {"error": str(e)})
    raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
    log_event("analyze_error", sid, cid, platform, {"error": str(e)})
    raise HTTPException(status_code=500, detail=f"分析失败: {e}")


@app.post("/api/complete", response_model=CompleteResponse, summary="生成增强后的问题")
async def complete(
  req: CompleteRequest,
  key: ApiKeyRecord = Depends(require_billed_api_key),
):
  sid, cid, platform = _meta(req)
  start = time.time()
  try:
    ctx = req.conversationContext or None
    enhanced, chat = await complete_question(
      req.question,
      req.answers,
      ctx if ctx else None,
      auto_enrichments=req.autoEnrichments,
      intent=req.intent,
      known_fields=req.knownFields or None,
      role_established=req.roleEstablished,
    )
    cost = calc_cost(chat.prompt_tokens, chat.completion_tokens)
    log_event(
      "complete_success",
      sid,
      cid,
      platform,
      {
        "answersCount": len(req.answers),
        "autoEnrichCount": len(req.autoEnrichments),
        "enhancedLength": len(enhanced),
        "contextCount": len(req.conversationContext),
        "durationMs": int((time.time() - start) * 1000),
        "apiKeyLabel": key.label,
      },
      prompt_tokens=chat.prompt_tokens,
      completion_tokens=chat.completion_tokens,
      cost=cost,
    )
    return CompleteResponse(enhancedQuestion=enhanced)
  except ValueError as e:
    log_event("complete_error", sid, cid, platform, {"error": str(e)})
    raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
    log_event("complete_error", sid, cid, platform, {"error": str(e)})
    raise HTTPException(status_code=500, detail=f"生成失败: {e}")

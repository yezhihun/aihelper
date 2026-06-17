"""使用数据统计服务（MySQL）"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Optional

from database.db import get_connection
from schemas.analytics import DailyStat, RecentEvent, StatsSummary, UsageEventIn, UserStat
from services.cost import calc_cost


def _mask_id(value: Optional[str]) -> Optional[str]:
  if not value or len(value) < 8:
    return value
  return value[:4] + "****" + value[-4:]


def _now() -> datetime:
  return datetime.now()


def _upsert_user(
  cur,
  client_id: str,
  platform: Optional[str],
  event_type: str,
  tokens: int,
  cost: float,
) -> None:
  now = _now()
  today = now.date()

  cur.execute("SELECT * FROM ai_users WHERE client_id = %s", (client_id,))
  row = cur.fetchone()

  if not row:
    cur.execute(
      """
      INSERT INTO ai_users (
        client_id, first_seen_at, last_seen_at, total_events, last_active_date,
        primary_platform, total_tokens, total_cost,
        total_optimize_clicks, total_analyze_success, total_complete_success, total_send_success
      ) VALUES (%s, %s, %s, 1, %s, %s, %s, %s, %s, %s, %s, %s)
      """,
      (
        client_id,
        now,
        now,
        today,
        platform,
        tokens,
        cost,
        1 if event_type == "optimize_click" else 0,
        1 if event_type == "analyze_success" else 0,
        1 if event_type == "complete_success" else 0,
        1 if event_type == "send_success" else 0,
      ),
    )
    return

  consecutive = row["consecutive_days"] or 1
  last_date = row["last_active_date"]
  if last_date:
    if last_date == today:
      pass
    elif (today - last_date).days == 1:
      consecutive += 1
    else:
      consecutive = 1
  else:
    consecutive = 1

  cur.execute(
    """
    UPDATE ai_users SET
      last_seen_at = %s,
      total_events = total_events + 1,
      total_tokens = total_tokens + %s,
      total_cost = total_cost + %s,
      last_active_date = %s,
      consecutive_days = %s,
      primary_platform = COALESCE(primary_platform, %s),
      total_optimize_clicks = total_optimize_clicks + %s,
      total_analyze_success = total_analyze_success + %s,
      total_complete_success = total_complete_success + %s,
      total_send_success = total_send_success + %s
    WHERE client_id = %s
    """,
    (
      now,
      tokens,
      cost,
      today,
      consecutive,
      platform,
      1 if event_type == "optimize_click" else 0,
      1 if event_type == "analyze_success" else 0,
      1 if event_type == "complete_success" else 0,
      1 if event_type == "send_success" else 0,
      client_id,
    ),
  )


def _touch_session(
  cur,
  session_id: Optional[str],
  client_id: Optional[str],
  platform: Optional[str],
  tokens: int,
  cost: float,
) -> None:
  if not session_id or not client_id:
    return

  now = _now()
  cur.execute("SELECT * FROM ai_sessions WHERE session_id = %s", (session_id,))
  row = cur.fetchone()

  if not row:
    cur.execute(
      """
      INSERT INTO ai_sessions (session_id, client_id, platform, started_at, ended_at, duration_sec, event_count, tokens_used, cost)
      VALUES (%s, %s, %s, %s, %s, 0, 1, %s, %s)
      """,
      (session_id, client_id, platform, now, now, tokens, cost),
    )
    cur.execute(
      "UPDATE ai_users SET total_sessions = total_sessions + 1 WHERE client_id = %s",
      (client_id,),
    )
    return

  duration = int((now - row["started_at"]).total_seconds())
  cur.execute(
    """
    UPDATE ai_sessions SET
      ended_at = %s,
      duration_sec = %s,
      event_count = event_count + 1,
      tokens_used = tokens_used + %s,
      cost = cost + %s
    WHERE session_id = %s
    """,
    (now, duration, tokens, cost, session_id),
  )

  cur.execute(
    """
    UPDATE ai_users SET max_session_duration_sec = GREATEST(max_session_duration_sec, %s)
    WHERE client_id = %s
    """,
    (duration, client_id),
  )


def log_event(
  event_type: str,
  session_id: Optional[str] = None,
  client_id: Optional[str] = None,
  platform: Optional[str] = None,
  properties: Optional[dict[str, Any]] = None,
  prompt_tokens: int = 0,
  completion_tokens: int = 0,
  cost: Optional[float] = None,
) -> None:
  tokens = prompt_tokens + completion_tokens
  if cost is None:
    cost = calc_cost(prompt_tokens, completion_tokens) if tokens else 0.0

  conn = get_connection()
  try:
    with conn.cursor() as cur:
      cur.execute(
        """
        INSERT INTO ai_usage_events (
          event_type, session_id, client_id, platform, properties,
          tokens_prompt, tokens_completion, cost
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
          event_type,
          session_id,
          client_id,
          platform,
          json.dumps(properties or {}, ensure_ascii=False),
          prompt_tokens,
          completion_tokens,
          cost,
        ),
      )
      if client_id:
        _upsert_user(cur, client_id, platform, event_type, tokens, cost)
      _touch_session(cur, session_id, client_id, platform, tokens, cost)
    conn.commit()
  finally:
    conn.close()


def log_events(events: list[UsageEventIn]) -> int:
  for e in events:
    log_event(
      e.eventType,
      e.sessionId,
      e.clientId,
      e.platform,
      e.properties,
    )
  return len(events)


def get_summary(days: int = 7) -> StatsSummary:
  conn = get_connection()
  try:
    with conn.cursor() as cur:
      cur.execute(
        """
        SELECT COUNT(*) AS c FROM ai_usage_events
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        (days,),
      )
      total = cur.fetchone()["c"]

      cur.execute(
        """
        SELECT COUNT(DISTINCT client_id) AS c FROM ai_usage_events
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY) AND client_id IS NOT NULL
        """,
        (days,),
      )
      unique_users = cur.fetchone()["c"]

      cur.execute(
        """
        SELECT COUNT(DISTINCT session_id) AS c FROM ai_usage_events
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY) AND session_id IS NOT NULL
        """,
        (days,),
      )
      unique_sessions = cur.fetchone()["c"]

      def count_type(event_type: str) -> int:
        cur.execute(
          """
          SELECT COUNT(*) AS c FROM ai_usage_events
          WHERE event_type = %s AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
          """,
          (event_type, days),
        )
        return cur.fetchone()["c"]

      cur.execute(
        """
        SELECT COALESCE(SUM(cost), 0) AS s, COALESCE(SUM(tokens_prompt + tokens_completion), 0) AS t
        FROM ai_usage_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        (days,),
      )
      cost_row = cur.fetchone()

      cur.execute(
        """
        SELECT event_type, COUNT(*) AS c FROM ai_usage_events
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        GROUP BY event_type ORDER BY c DESC
        """,
        (days,),
      )
      events_by_type = {r["event_type"]: r["c"] for r in cur.fetchall()}

      cur.execute(
        """
        SELECT DATE(created_at) AS d,
               COUNT(*) AS events,
               COUNT(DISTINCT client_id) AS users,
               COALESCE(SUM(cost), 0) AS cost,
               COALESCE(SUM(tokens_prompt + tokens_completion), 0) AS tokens
        FROM ai_usage_events
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        GROUP BY DATE(created_at) ORDER BY d DESC LIMIT 30
        """,
        (days,),
      )
      daily_stats = [
        DailyStat(
          date=str(r["d"]),
          events=r["events"],
          users=r["users"],
          cost=float(r["cost"]),
          tokens=int(r["tokens"]),
        )
        for r in cur.fetchall()
      ]

      cur.execute(
        """
        SELECT AVG(JSON_EXTRACT(properties, '$.score')) AS s
        FROM ai_usage_events
        WHERE event_type = 'analyze_success' AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        (days,),
      )
      avg_score_row = cur.fetchone()
      avg_score = round(float(avg_score_row["s"]), 1) if avg_score_row["s"] else None

      cur.execute(
        """
        SELECT AVG(JSON_EXTRACT(properties, '$.contextCount')) AS s
        FROM ai_usage_events
        WHERE event_type = 'analyze_success' AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        (days,),
      )
      avg_ctx = cur.fetchone()
      avg_context = round(float(avg_ctx["s"]), 1) if avg_ctx["s"] else None

      cur.execute(
        """
        SELECT AVG(JSON_EXTRACT(properties, '$.durationMs')) AS s
        FROM ai_usage_events
        WHERE event_type = 'analyze_success' AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        (days,),
      )
      avg_dur = cur.fetchone()
      avg_duration = round(float(avg_dur["s"]), 1) if avg_dur["s"] else None

      cur.execute(
        """
        SELECT AVG(duration_sec) AS s FROM ai_sessions
        WHERE started_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        (days,),
      )
      avg_sess = cur.fetchone()
      avg_session = round(float(avg_sess["s"]), 1) if avg_sess["s"] else None

      return StatsSummary(
        totalEvents=total,
        uniqueUsers=unique_users,
        uniqueSessions=unique_sessions,
        periodDays=days,
        optimizeClicks=count_type("optimize_click"),
        analyzeSuccess=count_type("analyze_success"),
        analyzeErrors=count_type("analyze_error"),
        completeSuccess=count_type("complete_success"),
        sendSuccess=count_type("send_success"),
        sendFail=count_type("send_fail"),
        totalCost=round(float(cost_row["s"]), 4),
        totalTokens=int(cost_row["t"]),
        avgScore=avg_score,
        avgContextCount=avg_context,
        avgAnalyzeDurationMs=avg_duration,
        avgSessionDurationSec=avg_session,
        eventsByType=events_by_type,
        dailyStats=daily_stats,
      )
  finally:
    conn.close()


def get_users(limit: int = 100) -> list[UserStat]:
  conn = get_connection()
  try:
    with conn.cursor() as cur:
      cur.execute(
        """
        SELECT * FROM ai_users ORDER BY last_seen_at DESC LIMIT %s
        """,
        (min(limit, 500),),
      )
      rows = cur.fetchall()
      result = []
      for r in rows:
        attempts = (r["total_complete_success"] or 0) + max(
          0, (r["total_optimize_clicks"] or 0) - (r["total_send_success"] or 0)
        )
        success_rate = None
        if attempts > 0:
          success_rate = round((r["total_send_success"] or 0) / attempts * 100, 1)

        result.append(
          UserStat(
            clientId=_mask_id(r["client_id"]) or "",
            firstSeenAt=r["first_seen_at"].strftime("%Y-%m-%d %H:%M:%S"),
            lastSeenAt=r["last_seen_at"].strftime("%Y-%m-%d %H:%M:%S"),
            totalEvents=r["total_events"] or 0,
            totalSessions=r["total_sessions"] or 0,
            optimizeClicks=r["total_optimize_clicks"] or 0,
            analyzeSuccess=r["total_analyze_success"] or 0,
            completeSuccess=r["total_complete_success"] or 0,
            sendSuccess=r["total_send_success"] or 0,
            totalTokens=r["total_tokens"] or 0,
            totalCost=round(float(r["total_cost"] or 0), 4),
            maxSessionDurationSec=r["max_session_duration_sec"] or 0,
            consecutiveDays=r["consecutive_days"] or 0,
            primaryPlatform=r["primary_platform"],
            successRate=success_rate,
          )
        )
      return result
  finally:
    conn.close()


def get_recent_events(limit: int = 50) -> list[RecentEvent]:
  conn = get_connection()
  try:
    with conn.cursor() as cur:
      cur.execute(
        """
        SELECT id, event_type, session_id, client_id, platform, properties,
               tokens_prompt, tokens_completion, cost, created_at
        FROM ai_usage_events ORDER BY id DESC LIMIT %s
        """,
        (min(limit, 200),),
      )
      rows = cur.fetchall()
      return [
        RecentEvent(
          id=r["id"],
          eventType=r["event_type"],
          sessionId=r["session_id"],
          clientId=_mask_id(r["client_id"]),
          platform=r["platform"],
          properties=json.loads(r["properties"]) if isinstance(r["properties"], str) else (r["properties"] or {}),
          tokensPrompt=r["tokens_prompt"] or 0,
          tokensCompletion=r["tokens_completion"] or 0,
          cost=float(r["cost"] or 0),
          createdAt=r["created_at"].strftime("%Y-%m-%d %H:%M:%S"),
        )
        for r in rows
      ]
  finally:
    conn.close()

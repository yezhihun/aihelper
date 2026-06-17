"""数据统计 Schema"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class AnalyticsMeta(BaseModel):
  sessionId: Optional[str] = None
  clientId: Optional[str] = None
  platform: Optional[str] = None


class UsageEventIn(BaseModel):
  eventType: str
  sessionId: Optional[str] = None
  clientId: Optional[str] = None
  platform: Optional[str] = None
  properties: dict[str, Any] = Field(default_factory=dict)
  timestamp: Optional[str] = None


class UsageEventsRequest(BaseModel):
  events: list[UsageEventIn] = Field(..., min_length=1, max_length=50)


class UsageEventsResponse(BaseModel):
  accepted: int


class DailyStat(BaseModel):
  date: str
  events: int
  users: int
  cost: float = 0
  tokens: int = 0


class StatsSummary(BaseModel):
  totalEvents: int
  uniqueUsers: int
  uniqueSessions: int
  periodDays: int
  optimizeClicks: int
  analyzeSuccess: int
  analyzeErrors: int
  completeSuccess: int
  sendSuccess: int
  sendFail: int
  totalCost: float = 0
  totalTokens: int = 0
  avgScore: Optional[float] = None
  avgContextCount: Optional[float] = None
  avgAnalyzeDurationMs: Optional[float] = None
  avgSessionDurationSec: Optional[float] = None
  eventsByType: dict[str, int] = Field(default_factory=dict)
  dailyStats: list[DailyStat] = Field(default_factory=list)


class UserStat(BaseModel):
  clientId: str = Field(..., description="用户ID（脱敏）")
  firstSeenAt: str = Field(..., description="首次使用时间")
  lastSeenAt: str = Field(..., description="最近使用时间")
  totalEvents: int = Field(..., description="总使用次数")
  totalSessions: int = Field(..., description="优化流程次数")
  optimizeClicks: int = Field(..., description="点击优化次数")
  analyzeSuccess: int = Field(..., description="分析成功")
  completeSuccess: int = Field(..., description="补全成功")
  sendSuccess: int = Field(..., description="发送成功")
  totalTokens: int = Field(..., description="累计Token")
  totalCost: float = Field(..., description="累计花费(元)")
  maxSessionDurationSec: int = Field(..., description="单次最长流程(秒)")
  consecutiveDays: int = Field(..., description="连续活跃天数")
  primaryPlatform: Optional[str] = Field(default=None, description="主要平台")
  successRate: Optional[float] = Field(default=None, description="发送成功率%")


class RecentEvent(BaseModel):
  id: int
  eventType: str
  sessionId: Optional[str]
  clientId: Optional[str]
  platform: Optional[str]
  properties: dict[str, Any]
  tokensPrompt: int = 0
  tokensCompletion: int = 0
  cost: float = 0
  createdAt: str

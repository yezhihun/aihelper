"""Pydantic 模型定义"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from schemas.analytics import AnalyticsMeta


class ConversationMessage(BaseModel):
  """会话历史消息"""

  role: str = Field(..., description="角色：user 或 assistant", examples=["user"])
  content: str = Field(..., description="消息正文", examples=["我想做一款仿英雄没有闪的手游"])


class MissingField(BaseModel):
  """缺失信息字段（需用户选择）"""

  fieldName: str = Field(..., description="字段标识，如 platform、budget", examples=["platform"])
  fieldLabel: Optional[str] = Field(
    default=None,
    description="面向用户展示的中文名称",
    examples=["目标平台"],
  )
  reason: str = Field(..., description="该字段为何重要", examples=["不同平台开发成本和变现差异大"])
  importance: int = Field(..., ge=1, le=10, description="重要程度 1-10", examples=[9])


class AutoEnrichment(BaseModel):
  """自动注入项（不展示为选项，写入增强文案）"""

  type: str = Field(
    ...,
    description="类型：role/output_format/perspective/answer_dimensions/constraints/tone",
    examples=["role"],
  )
  content: str = Field(
    ...,
    description="要注入的内容",
    examples=["以资深 Python 游戏开发导师的身份，用通俗易懂的语言回答"],
  )


class RequirementGraph(BaseModel):
  """需求图谱"""

  originalQuestion: str = Field(..., description="用户原始问题")
  intent: str = Field(..., description="识别到的意图", examples=["游戏开发"])
  completenessScore: int = Field(..., ge=0, le=100, description="完整度评分")
  knownFields: dict[str, str] = Field(default_factory=dict, description="已从问题中提取的已知信息")
  missingFields: list[MissingField] = Field(default_factory=list, description="需用户选择的缺失字段")
  autoEnrichments: list[AutoEnrichment] = Field(
    default_factory=list,
    description="按需自动注入项，不展示为选项",
  )
  roleEstablished: bool = Field(
    default=False,
    description="会话历史中是否已建立角色/视角",
  )
  suggestions: dict[str, list[str]] = Field(
    default_factory=dict,
    description="每个缺失字段的推荐选项",
    examples=[{"platform": ["微信小游戏", "App", "Steam", "自定义"]}],
  )
  enhancedQuestion: Optional[str] = Field(default=None, description="增强后的问题（complete 后填充）")


class AnalyzeRequest(BaseModel):
  """分析问题请求"""

  question: str = Field(
    ...,
    min_length=1,
    max_length=4000,
    description="用户输入框中当前准备发送的文字",
    examples=["我想开发一个小游戏赚钱"],
  )
  conversationContext: list[ConversationMessage] = Field(
    default_factory=list,
    description="当前会话已发送的历史消息，用于理解上下文",
  )
  meta: Optional[AnalyticsMeta] = Field(default=None, description="埋点元信息")


class AnalyzeResponse(BaseModel):
  """分析问题响应"""

  score: int = Field(..., ge=0, le=100, description="完整度评分")
  graph: RequirementGraph = Field(..., description="需求图谱")


class CompleteRequest(BaseModel):
  """补全问题请求"""

  question: str = Field(..., min_length=1, max_length=4000, description="用户当前提问")
  answers: dict[str, str] = Field(
    ...,
    description="用户对缺失字段的选择",
    examples=[{"platform": "微信小游戏", "budget": "5000以内"}],
  )
  autoEnrichments: list[AutoEnrichment] = Field(
    default_factory=list,
    description="分析阶段识别的自动注入项",
  )
  intent: Optional[str] = Field(default=None, description="识别到的意图")
  knownFields: dict[str, str] = Field(default_factory=dict, description="已知信息")
  roleEstablished: bool = Field(default=False, description="会话中是否已建立角色")
  conversationContext: list[ConversationMessage] = Field(
    default_factory=list,
    description="当前会话已发送的历史消息",
  )
  meta: Optional[AnalyticsMeta] = Field(default=None, description="埋点元信息")


class CompleteResponse(BaseModel):
  """补全问题响应"""

  enhancedQuestion: str = Field(..., description="增强后的自然语言问题，可直接发送给 AI")

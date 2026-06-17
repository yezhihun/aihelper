"""问题分析服务"""

from __future__ import annotations

from typing import Optional

from schemas.requirement import (
  AnalyzeResponse,
  AutoEnrichment,
  ConversationMessage,
  MissingField,
  RequirementGraph,
)
from services.ai_client import chat_json
from services.labels import (
  normalize_enrich_content,
  normalize_field_label,
  normalize_intent,
  normalize_reason,
)

ANALYZE_SYSTEM = """你是一个 AI 提问分析专家。分析用户问题，区分「需用户选择的信息」和「可自动注入的优化项」。

你会收到 JSON 输入，包含：
- question：用户输入框中当前准备发送的文字
- conversationContext（可选）：当前会话中已发送的历史消息

分析时必须：
1. 综合「对话历史 + 当前输入」理解完整意图，不要孤立看当前输入
2. 历史消息中已明确的信息必须写入 known，不要重复追问
3. 若当前输入是追问/省略句（如「那预算呢」「继续」），需结合历史补全语义
4. score 基于整体会话信息完整度，而非仅当前输入框字数

【两类信息，严格区分】

A. missing（需用户选择，展示为选项）：
- 只有用户偏好/个人情况不明、且无法从上下文推断时才列入
- 典型：预算范围、目标平台、具体需求方向（多选一时）
- 禁止把「角色设定」「回答格式」「回答维度」放入 missing

B. autoEnrich（自动注入，不展示为选项）：
- 对回答质量有帮助、且可由你推断的内容，写入此处
- 典型：专家角色（role）、回答视角（perspective）、回答维度（answer_dimensions）、
  输出格式（output_format）、语气（tone）、边界约束（constraints）
- 最多 3 项，按收益排序，宁少勿多
- 若会话历史中已明确角色/视角（如用户说过「你是游戏导师」或 AI 已按某角色回答多轮），
  设 roleEstablished=true，且不要再在 autoEnrich 中加 role

输出严格 JSON，禁止 Markdown，禁止解释。格式：
{
  "intent": "意图简述",
  "score": 42,
  "roleEstablished": false,
  "known": {"字段名": "值"},
  "missing": [
    {"fieldName": "budget", "fieldLabel": "预算范围", "reason": "为何需要用户确认", "importance": 8}
  ],
  "suggestions": {
    "budget": ["1000以内", "5000以内", "1万以内", "自定义"]
  },
  "autoEnrich": [
    {"type": "role", "content": "以资深少儿编程教育顾问的身份"},
    {"type": "answer_dimensions", "content": "从学习路径、推荐资源、家长配合建议三个维度回答"}
  ]
}

规则：
- fieldName 使用简短英文标识（内部用）
- fieldLabel 必须是简短中文（2-8字）
- missing 最多 5 项，按 importance 降序
- suggestions 的 key 必须与 missing 的 fieldName 一致，每项最后一项必须是「自定义」
- autoEnrich 最多 3 项，type 取 role/perspective/answer_dimensions/output_format/constraints/tone
- 若整体已足够完整，missing 可为空，score 应 >= 85

【语言要求 - 必须遵守】
- 所有面向用户展示的文案必须使用简体中文
- 包括：intent、fieldLabel、reason、suggestions 中的每个选项、autoEnrich 的 content
- fieldName 和 autoEnrich.type 是内部标识，可保留英文，但不会展示给用户
- 禁止在 reason、fieldLabel、content 中出现英文单词或 snake_case"""


def _trim_context(context: list[ConversationMessage]) -> list[ConversationMessage]:
  """限制上下文体积，避免 LLM 请求过慢或超时"""
  trimmed = context[-8:]
  total = 0
  result: list[ConversationMessage] = []
  for msg in reversed(trimmed):
    content = msg.content[:2000]
    if total + len(content) > 6000:
      break
    total += len(content)
    result.insert(0, ConversationMessage(role=msg.role, content=content))
  return result


def _build_analyze_user_payload(
  question: str,
  context: Optional[list[ConversationMessage]],
) -> str:
  import json

  payload: dict = {"question": question[:2000]}
  if context:
    payload["conversationContext"] = [
      {"role": m.role, "content": m.content} for m in _trim_context(context)
    ]
  return json.dumps(payload, ensure_ascii=False)


async def analyze_question(
  question: str,
  conversation_context: Optional[list[ConversationMessage]] = None,
) -> tuple[AnalyzeResponse, "ChatResult"]:
  from services.ai_client import ChatResult

  user_payload = _build_analyze_user_payload(question, conversation_context)
  chat = await chat_json(ANALYZE_SYSTEM, user_payload)
  data = chat.data

  missing = []
  for m in data.get("missing", []):
    fname = m["fieldName"]
    flabel = normalize_field_label(fname, m.get("fieldLabel"))
    missing.append(
      MissingField(
        fieldName=fname,
        fieldLabel=flabel,
        reason=normalize_reason(m.get("reason", ""), flabel),
        importance=int(m["importance"]),
      )
    )

  role_established = bool(data.get("roleEstablished", False))
  auto_enrich_raw = data.get("autoEnrich", [])[:3]
  auto_enrichments: list[AutoEnrichment] = []
  for item in auto_enrich_raw:
    if role_established and item.get("type") == "role":
      continue
    content = normalize_enrich_content(item.get("content") or "")
    if content:
      auto_enrichments.append(
        AutoEnrichment(type=item.get("type", "perspective"), content=content)
      )

  graph = RequirementGraph(
    originalQuestion=question,
    intent=normalize_intent(data.get("intent", "")),
    completenessScore=int(data.get("score", 50)),
    knownFields={k: str(v) for k, v in data.get("known", {}).items()},
    missingFields=missing,
    suggestions={k: list(v) for k, v in data.get("suggestions", {}).items()},
    autoEnrichments=auto_enrichments,
    roleEstablished=role_established,
  )

  return AnalyzeResponse(score=graph.completenessScore, graph=graph), chat

"""问题补全生成服务"""

from __future__ import annotations

import json
from typing import Optional

from schemas.requirement import AutoEnrichment, ConversationMessage
from services.ai_client import ChatResult, chat_json

COMPLETE_SYSTEM = """你是一个 AI 提问增强专家。根据对话历史、用户问题和补充信息，生成一条完整、自然的中文提问。

你会收到 JSON，包含：
- question：用户原始输入
- answers：用户对缺失项的选择（可能为空）
- autoEnrich：需自动融入文案的优化项（角色、回答维度等，用户不可见）
- intent、known：意图与已知信息
- conversationContext：会话历史

要求：
1. 综合对话历史理解完整意图，输出应自然衔接当前会话
2. 历史已提到的信息要保留；用户 answers 中的选择要自然融入
3. 将 autoEnrich 中的每一项**自然编织**进问题，不要分段标题（禁止【角色设定】【输出格式】等）
4. 若 roleEstablished 为 true 或历史中已有明确角色，不要再重复设定角色
5. autoEnrich 为空时，正常补全即可；有 autoEnrich 时控制总量，避免冗长（整体通常 80-200 字）
6. 若当前是追问，输出应自洽，避免重复历史里已有的大段背景
7. 只输出 JSON：{"enhancedQuestion": "增强后的问题文本"}
8. 禁止 Markdown，禁止解释"""


def _trim_context(context: list[ConversationMessage]) -> list[ConversationMessage]:
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


async def complete_question(
  question: str,
  answers: dict[str, str],
  conversation_context: Optional[list[ConversationMessage]] = None,
  auto_enrichments: Optional[list[AutoEnrichment]] = None,
  intent: Optional[str] = None,
  known_fields: Optional[dict[str, str]] = None,
  role_established: bool = False,
) -> tuple[str, ChatResult]:
  payload: dict = {
    "question": question,
    "answers": answers,
    "autoEnrich": [
      {"type": e.type, "content": e.content} for e in (auto_enrichments or [])
    ],
    "roleEstablished": role_established,
  }
  if intent:
    payload["intent"] = intent
  if known_fields:
    payload["known"] = known_fields
  if conversation_context:
    payload["conversationContext"] = [
      {"role": m.role, "content": m.content} for m in _trim_context(conversation_context)
    ]

  chat = await chat_json(COMPLETE_SYSTEM, json.dumps(payload, ensure_ascii=False))
  enhanced = chat.data.get("enhancedQuestion", "").strip()
  if not enhanced:
    raise ValueError("模型未返回增强后的问题")
  return enhanced, chat

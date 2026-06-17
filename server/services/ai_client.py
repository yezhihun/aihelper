"""DeepSeek / OpenAI 兼容 API 客户端"""

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

REQUEST_TIMEOUT = 60.0


@dataclass
class ChatResult:
  data: dict
  prompt_tokens: int = 0
  completion_tokens: int = 0


def _config() -> tuple[str, str, str]:
  api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY", "")
  base_url = os.getenv("DEEPSEEK_BASE_URL") or os.getenv(
    "OPENAI_BASE_URL", "https://api.deepseek.com/v1"
  )
  model = os.getenv("DEEPSEEK_MODEL") or os.getenv("OPENAI_MODEL", "deepseek-chat")
  return api_key, base_url, model


def _extract_json(text: str) -> dict:
  text = text.strip()
  if text.startswith("```"):
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
  return json.loads(text)


async def chat_json(system: str, user: str) -> ChatResult:
  if os.getenv("MOCK_AI") == "1":
    return ChatResult(data=_mock_response(system, user), prompt_tokens=800, completion_tokens=200)

  api_key, base_url, model = _config()
  if not api_key:
    raise ValueError("未配置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY，请在 server/.env 中设置")

  try:
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
      resp = await client.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
          "model": model,
          "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
          ],
          "temperature": 0.3,
          "response_format": {"type": "json_object"},
        },
      )
      if resp.status_code == 402:
        raise ValueError("DeepSeek 账户余额不足，请充值后重试")
      resp.raise_for_status()
      body = resp.json()
      content = body["choices"][0]["message"]["content"]
      usage = body.get("usage") or {}
      return ChatResult(
        data=_extract_json(content),
        prompt_tokens=int(usage.get("prompt_tokens") or 0),
        completion_tokens=int(usage.get("completion_tokens") or 0),
      )
  except httpx.TimeoutException as e:
    raise ValueError("DeepSeek 请求超时，请稍后重试") from e
  except httpx.HTTPError as e:
    raise ValueError(f"DeepSeek 请求失败: {e}") from e


def _mock_response(system: str, user: str) -> dict:
  if "增强" in system or "enhancedQuestion" in system:
    return {
      "enhancedQuestion": (
        "我是一名个人开发者，计划开发微信小游戏，预算5000元以内，希望通过广告变现。"
        "请从游戏类型选择、开发成本、开发周期、收益预估等维度给出详细方案。"
      )
    }
  return {
    "intent": "游戏开发",
    "score": 42,
    "known": {},
    "missing": [
      {"fieldName": "platform", "fieldLabel": "目标平台", "reason": "不同平台开发成本和变现差异大", "importance": 9},
      {"fieldName": "budget", "fieldLabel": "预算范围", "reason": "预算影响技术选型和团队规模", "importance": 8},
    ],
    "suggestions": {
      "platform": ["微信小游戏", "App", "Steam", "自定义"],
      "budget": ["1000以内", "5000以内", "1万以内", "自定义"],
    },
    "autoEnrich": [
      {"type": "role", "content": "以资深游戏开发顾问的身份"},
      {"type": "answer_dimensions", "content": "从游戏类型、开发成本、周期和收益预估等维度回答"},
    ],
  }

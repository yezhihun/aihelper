"""用户可见文案的中英文规范化"""

from __future__ import annotations

import re
from typing import Optional

# fieldName → 中文展示名
FIELD_LABELS: dict[str, str] = {
  "platform": "目标平台",
  "budget": "预算范围",
  "timeline": "时间周期",
  "monetization": "变现方式",
  "audience": "目标用户",
  "tech_stack": "技术栈",
  "risk_tolerance": "风险偏好",
  "market": "市场范围",
  "goal": "目标",
  "scope": "范围",
  "specific_need": "具体需求",
  "resource_type": "资源类型",
  "skill_level": "技能水平",
  "age_group": "适用年龄",
  "learning_goal": "学习目标",
  "output_format": "输出格式",
  "constraints": "限制条件",
  "context": "背景信息",
  "experience_level": "经验水平",
  "project_type": "项目类型",
  "delivery_format": "交付形式",
  "priority": "优先级",
  "use_case": "使用场景",
  "target_audience": "目标受众",
  "content_type": "内容类型",
  "difficulty": "难度级别",
  "learning_style": "学习方式",
  "time_commitment": "时间投入",
  "preferred_tools": "偏好工具",
  "investment_amount": "投入金额",
  "payment_preference": "付费偏好",
}

ENRICH_TYPE_LABELS: dict[str, str] = {
  "role": "专家角色",
  "perspective": "回答视角",
  "answer_dimensions": "回答维度",
  "output_format": "回答格式",
  "constraints": "边界约束",
  "tone": "语气风格",
}

_WORD_MAP: dict[str, str] = {
  "specific": "具体",
  "need": "需求",
  "needs": "需求",
  "type": "类型",
  "level": "水平",
  "format": "格式",
  "target": "目标",
  "user": "用户",
  "users": "用户",
  "resource": "资源",
  "resources": "资源",
  "budget": "预算",
  "timeline": "周期",
  "goal": "目标",
  "goals": "目标",
  "skill": "技能",
  "learning": "学习",
  "project": "项目",
  "platform": "平台",
  "market": "市场",
  "audience": "受众",
  "scope": "范围",
  "context": "背景",
  "preference": "偏好",
  "preferences": "偏好",
  "experience": "经验",
  "age": "年龄",
  "group": "群体",
  "time": "时间",
  "commitment": "投入",
  "payment": "付费",
  "investment": "投入",
  "amount": "金额",
  "content": "内容",
  "difficulty": "难度",
  "delivery": "交付",
  "use": "使用",
  "case": "场景",
  "tech": "技术",
  "stack": "栈",
  "risk": "风险",
  "tolerance": "偏好",
  "monetization": "变现",
  "output": "输出",
  "constraint": "约束",
  "constraints": "约束",
  "priority": "优先级",
  "tool": "工具",
  "tools": "工具",
  "preferred": "偏好",
}


def _is_mostly_english(text: str) -> bool:
  if not text or not text.strip():
    return False
  letters = re.findall(r"[A-Za-z]", text)
  cjk = re.findall(r"[\u4e00-\u9fff]", text)
  if not letters:
    return False
  return len(letters) > len(cjk)


def humanize_field_name(field_name: str) -> str:
  key = field_name.strip().lower().replace("-", "_")
  if key in FIELD_LABELS:
    return FIELD_LABELS[key]
  parts = re.split(r"[-_]+", key)
  translated = [_WORD_MAP.get(p, "") for p in parts if p]
  if translated and all(translated):
    return "".join(translated)
  return "补充信息"


def normalize_field_label(field_name: str, field_label: Optional[str]) -> str:
  label = (field_label or "").strip()
  if label and not _is_mostly_english(label):
    return label
  return humanize_field_name(field_name)


def normalize_reason(reason: str, field_label: str) -> str:
  text = (reason or "").strip()
  if text and not _is_mostly_english(text):
    return text
  return f"确认「{field_label}」有助于获得更准确的回答"


def normalize_enrich_type(enrich_type: str) -> str:
  key = enrich_type.strip().lower().replace("-", "_")
  return ENRICH_TYPE_LABELS.get(key, humanize_field_name(key) if _is_mostly_english(key) else key)


def normalize_enrich_content(content: str) -> str:
  text = (content or "").strip()
  if not text:
    return text
  if _is_mostly_english(text):
    return ""
  return text


def normalize_intent(intent: str) -> str:
  text = (intent or "").strip()
  if not text or _is_mostly_english(text):
    return "通用问答"
  return text

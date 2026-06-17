/** 界面文案中文规范化（与 extension 保持一致） */

export const FIELD_LABELS: Record<string, string> = {
  platform: '目标平台',
  budget: '预算范围',
  timeline: '时间周期',
  monetization: '变现方式',
  audience: '目标用户',
  tech_stack: '技术栈',
  risk_tolerance: '风险偏好',
  market: '市场范围',
  goal: '目标',
  scope: '范围',
  specific_need: '具体需求',
  resource_type: '资源类型',
  skill_level: '技能水平',
  age_group: '适用年龄',
  learning_goal: '学习目标',
  output_format: '输出格式',
  constraints: '限制条件',
  context: '背景信息',
  experience_level: '经验水平',
  project_type: '项目类型',
  delivery_format: '交付形式',
  priority: '优先级',
  use_case: '使用场景',
  target_audience: '目标受众',
  content_type: '内容类型',
  difficulty: '难度级别',
  learning_style: '学习方式',
  time_commitment: '时间投入',
  preferred_tools: '偏好工具',
  investment_amount: '投入金额',
  payment_preference: '付费偏好',
};

export const AUTO_ENRICH_LABELS: Record<string, string> = {
  role: '专家角色',
  perspective: '回答视角',
  answer_dimensions: '回答维度',
  output_format: '回答格式',
  constraints: '边界约束',
  tone: '语气风格',
};

const WORD_MAP: Record<string, string> = {
  specific: '具体',
  need: '需求',
  needs: '需求',
  type: '类型',
  level: '水平',
  format: '格式',
  target: '目标',
  user: '用户',
  resource: '资源',
  budget: '预算',
  timeline: '周期',
  goal: '目标',
  skill: '技能',
  learning: '学习',
  project: '项目',
  platform: '平台',
  audience: '受众',
  scope: '范围',
  context: '背景',
  preference: '偏好',
  experience: '经验',
  age: '年龄',
  group: '群体',
  payment: '付费',
  investment: '投入',
  content: '内容',
  difficulty: '难度',
  priority: '优先级',
  tool: '工具',
  tools: '工具',
};

function isMostlyEnglish(text: string): boolean {
  if (!text?.trim()) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  if (letters === 0) return false;
  return letters > cjk;
}

export function humanizeFieldName(fieldName: string): string {
  const key = fieldName.toLowerCase().replace(/-/g, '_');
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const parts = key.split(/[-_]+/);
  const translated = parts.map((p) => WORD_MAP[p] || '').filter(Boolean);
  if (translated.length === parts.length && translated.length > 0) {
    return translated.join('');
  }
  return '补充信息';
}

export function labelForField(fieldName: string, fieldLabel?: string): string {
  const label = fieldLabel?.trim();
  if (label && !isMostlyEnglish(label)) return label;
  return humanizeFieldName(fieldName);
}

export function labelForReason(reason: string, fieldLabel: string): string {
  const text = reason?.trim();
  if (text && !isMostlyEnglish(text)) return text;
  return `确认「${fieldLabel}」有助于获得更准确的回答`;
}

export function labelForAutoEnrichType(type: string): string {
  const key = type.toLowerCase().replace(/-/g, '_');
  if (AUTO_ENRICH_LABELS[key]) return AUTO_ENRICH_LABELS[key];
  if (isMostlyEnglish(key)) return humanizeFieldName(key);
  return type || '自动优化';
}

/** 对话中的一条消息 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 缺失字段（需用户选择） */
export interface MissingField {
  fieldName: string;
  /** 面向用户展示的中文名称 */
  fieldLabel?: string;
  reason: string;
  importance: number;
}

/** 自动注入项（不展示为选项，由 complete 写入增强文案） */
export interface AutoEnrichment {
  /** role | output_format | perspective | answer_dimensions | constraints | tone */
  type: string;
  /** 要注入的内容描述 */
  content: string;
}

/** 需求图谱 */
export interface RequirementGraph {
  originalQuestion: string;
  intent: string;
  completenessScore: number;
  knownFields: Record<string, string>;
  missingFields: MissingField[];
  suggestions: Record<string, string[]>;
  /** 按需自动注入，最多 3 项 */
  autoEnrichments: AutoEnrichment[];
  /** 会话中是否已建立角色/视角，true 则不再注入角色 */
  roleEstablished?: boolean;
  enhancedQuestion?: string;
}

export interface AnalyticsMeta {
  sessionId?: string;
  clientId?: string;
  platform?: string;
}

export interface AnalyzeRequest {
  question: string;
  conversationContext?: ConversationMessage[];
  meta?: AnalyticsMeta;
}

export interface CompleteRequest {
  question: string;
  answers: Record<string, string>;
  conversationContext?: ConversationMessage[];
  /** 分析阶段识别的自动注入项 */
  autoEnrichments?: AutoEnrichment[];
  intent?: string;
  knownFields?: Record<string, string>;
  roleEstablished?: boolean;
  meta?: AnalyticsMeta;
}

export interface AnalyzeResponse {
  score: number;
  graph: RequirementGraph;
}

export interface CompleteResponse {
  enhancedQuestion: string;
}

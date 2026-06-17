import type {
  AnalyzeResponse,
  AnalyticsMeta,
  CompleteResponse,
  ConversationMessage,
  RequirementGraph,
} from '@aihelper/requirement';
import { DEFAULT_API_BASE } from '../config';

const API_KEY_STORAGE = 'apiKey';
const API_BASE_STORAGE = 'apiBase';
const API_TIMEOUT_MS = 65000;

export async function getApiBase(): Promise<string> {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  return (apiBase as string).replace(/\/$/, '');
}

export async function setApiBase(apiBase: string): Promise<void> {
  await chrome.storage.sync.set({ apiBase: apiBase.replace(/\/$/, '') });
}

export async function getApiKey(): Promise<string> {
  const { apiKey } = await chrome.storage.sync.get({ apiKey: '' });
  return (apiKey as string).trim();
}

export async function setApiKey(apiKey: string): Promise<void> {
  await chrome.storage.sync.set({ apiKey: apiKey.trim() });
}

export async function getApiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = await getApiKey();
  if (apiKey) headers['X-API-Key'] = apiKey;
  return headers;
}

async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  const resp = await chrome.runtime.sendMessage({
    type: 'API_FETCH',
    path,
    body,
    timeoutMs: API_TIMEOUT_MS,
  });

  if (!resp?.ok) {
    throw new Error(resp?.error || '请求失败，请检查网络与 API 配置');
  }
  return resp.data as T;
}

export async function analyzeQuestion(
  question: string,
  conversationContext: ConversationMessage[] = [],
  meta?: AnalyticsMeta,
): Promise<AnalyzeResponse> {
  return apiFetch<AnalyzeResponse>('/api/analyze', {
    question,
    conversationContext,
    meta,
  });
}

export async function completeQuestion(
  question: string,
  answers: Record<string, string>,
  conversationContext: ConversationMessage[] = [],
  meta?: AnalyticsMeta,
  extras?: {
    autoEnrichments?: RequirementGraph['autoEnrichments'];
    intent?: string;
    knownFields?: Record<string, string>;
    roleEstablished?: boolean;
  },
): Promise<CompleteResponse> {
  return apiFetch<CompleteResponse>('/api/complete', {
    question,
    answers,
    conversationContext,
    meta,
    autoEnrichments: extras?.autoEnrichments ?? [],
    intent: extras?.intent,
    knownFields: extras?.knownFields ?? {},
    roleEstablished: extras?.roleEstablished ?? false,
  });
}

export type { RequirementGraph, ConversationMessage, AnalyticsMeta };

import type {
  AnalyzeResponse,
  AnalyticsMeta,
  CompleteResponse,
  ConversationMessage,
  RequirementGraph,
} from '@aihelper/requirement';

export interface SettingsStore {
  getApiBase(): Promise<string>;
  setApiBase(value: string): Promise<void>;
  getApiKey(): Promise<string>;
  setApiKey(value: string): Promise<void>;
}

export interface ApiClientOptions {
  store: SettingsStore;
  defaultApiBase: string;
  timeoutMs?: number;
}

export function createApiClient(options: ApiClientOptions) {
  const { store, defaultApiBase, timeoutMs = 65000 } = options;

  async function getApiHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = await store.getApiKey();
    if (apiKey) headers['X-API-Key'] = apiKey;
    return headers;
  }

  async function apiFetch<T>(path: string, body: unknown): Promise<T> {
    const base = (await store.getApiBase()).replace(/\/$/, '') || defaultApiBase;
    const headers = await getApiHeaders();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const detail = (err as { detail?: string }).detail || `HTTP ${resp.status}`;
        throw new Error(detail);
      }
      return (await resp.json()) as T;
    } catch (e) {
      clearTimeout(timer);
      const err = e as Error;
      if (err.name === 'AbortError') {
        throw new Error('请求超时，请稍后重试');
      }
      if (err.message.includes('Failed to fetch')) {
        const base = await store.getApiBase();
        throw new Error(`无法连接服务，请检查 API 地址（当前: ${base || defaultApiBase}）`);
      }
      throw err;
    }
  }

  return {
    getApiBase: () => store.getApiBase(),
    setApiBase: (v: string) => store.setApiBase(v),
    getApiKey: () => store.getApiKey(),
    setApiKey: (v: string) => store.setApiKey(v),
    analyzeQuestion(
      question: string,
      conversationContext: ConversationMessage[] = [],
      meta?: AnalyticsMeta,
    ): Promise<AnalyzeResponse> {
      return apiFetch<AnalyzeResponse>('/api/analyze', {
        question,
        conversationContext,
        meta,
      });
    },
    completeQuestion(
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
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

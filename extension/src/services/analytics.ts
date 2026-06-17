import type { AnalyticsMeta } from '@aihelper/requirement';

const CLIENT_ID_KEY = 'aihelper_client_id';
export const EXT_VERSION = '1.4.0';

export async function getClientId(): Promise<string> {
  const stored = await chrome.storage.sync.get(CLIENT_ID_KEY);
  if (stored[CLIENT_ID_KEY]) return stored[CLIENT_ID_KEY] as string;
  const id = crypto.randomUUID();
  await chrome.storage.sync.set({ [CLIENT_ID_KEY]: id });
  return id;
}

export function detectPlatform(url: string): string {
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('chatgpt.com') || url.includes('openai.com')) return 'chatgpt';
  return 'unknown';
}

export function createSessionId(): string {
  return crypto.randomUUID();
}

export async function buildMeta(sessionId: string, platform: string): Promise<AnalyticsMeta> {
  return {
    sessionId,
    clientId: await getClientId(),
    platform,
  };
}

interface TrackPayload {
  eventType: string;
  sessionId?: string;
  clientId?: string;
  platform?: string;
  properties?: Record<string, unknown>;
}

/** 上报埋点，失败静默 */
export function trackEvent(payload: TrackPayload): void {
  chrome.runtime
    .sendMessage({
      type: 'TRACK_EVENTS',
      events: [
        {
          eventType: payload.eventType,
          sessionId: payload.sessionId,
          clientId: payload.clientId,
          platform: payload.platform,
          properties: {
            ...payload.properties,
            extensionVersion: EXT_VERSION,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    })
    .catch(() => {});
}

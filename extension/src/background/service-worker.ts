import { DEFAULT_API_BASE } from '../config';
import { getApiBase, getApiHeaders } from '../services/api';

export interface PendingEnhance {
  question: string;
  tabId: number;
  url: string;
  sessionId: string;
  platform: string;
  clientId: string;
  conversationContext: Array<{ role: 'user' | 'assistant'; content: string }>;
}

let pending: PendingEnhance | null = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

function setPending(data: PendingEnhance) {
  pending = data;
  chrome.storage.session.set({ pendingEnhance: data }).catch(() => {});
}

async function apiRequest(path: string, body: unknown, timeoutMs = 65000) {
  const base = await getApiBase();
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
      return { ok: false as const, error: detail };
    }
    const data = await resp.json();
    return { ok: true as const, data };
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    if (err.name === 'AbortError') {
      return { ok: false as const, error: '请求超时，请稍后重试' };
    }
    return {
      ok: false as const,
      error: err.message.includes('Failed to fetch')
        ? `无法连接服务，请检查 API 地址（当前: ${base || DEFAULT_API_BASE}）`
        : err.message,
    };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_ENHANCE') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: '无法获取当前标签页' });
      return;
    }

    const data: PendingEnhance = {
      question: msg.question,
      tabId,
      url: msg.url,
      sessionId: msg.sessionId,
      platform: msg.platform,
      clientId: msg.clientId,
      conversationContext: msg.conversationContext ?? [],
    };

    setPending(data);
    sendResponse({ ok: true, pending: data });
    return;
  }

  if (msg.type === 'GET_PENDING') {
    if (pending) {
      sendResponse({ pending });
      return;
    }
    chrome.storage.session.get('pendingEnhance').then((store) => {
      sendResponse({ pending: store.pendingEnhance ?? null });
    });
    return true;
  }

  if (msg.type === 'TRACK_EVENTS') {
    apiRequest('/api/events', { events: msg.events })
      .then((r) => sendResponse({ ok: r.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'API_FETCH') {
    const timeoutMs = (msg.timeoutMs as number) || 65000;
    apiRequest(msg.path as string, msg.body, timeoutMs).then(sendResponse);
    return true;
  }

  if (msg.type === 'APPLY_TO_TAB') {
    const tabId = msg.tabId as number;
    chrome.tabs
      .sendMessage(tabId, {
        type: 'APPLY_ENHANCED',
        text: msg.text,
        autoSend: msg.autoSend !== false,
        sessionId: msg.sessionId,
        clientId: msg.clientId,
        platform: msg.platform,
      })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return;
});

export {};

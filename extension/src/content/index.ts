import { detectAdapter } from './adapters';
import { extractConversationContext } from './conversation';
import {
  buildMeta,
  createSessionId,
  detectPlatform,
  trackEvent,
} from '../services/analytics';
import {
  createEnhanceButton,
  ensureUiMounted,
  getEnhanceButton,
  hidePanelOverlay,
  showPanelOverlay,
  showToast,
  type PanelPending,
} from './ui-root';

const ENHANCED_FLAG = 'aihelper-enhanced';

function sendMessage<T>(msg: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('插件通信超时，请刷新页面后重试')), timeoutMs);
    chrome.runtime.sendMessage(msg, (resp) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(resp as T);
    });
  });
}

async function openEnhancePanel(question: string) {
  const sessionId = createSessionId();
  const platform = detectPlatform(location.href);
  const clientId = (await buildMeta(sessionId, platform)).clientId!;
  const conversationContext = extractConversationContext();

  trackEvent({
    eventType: 'optimize_click',
    sessionId,
    clientId,
    platform,
    properties: {
      questionLength: question.length,
      contextCount: conversationContext.length,
    },
  });

  const resp = await sendMessage<{ ok: boolean; error?: string; pending?: PanelPending }>({
    type: 'OPEN_ENHANCE',
    question,
    url: location.href,
    sessionId,
    platform,
    clientId,
    conversationContext,
  });

  if (!resp?.ok || !resp.pending) {
    trackEvent({
      eventType: 'panel_open_error',
      sessionId,
      clientId,
      platform,
      properties: { error: resp?.error || 'unknown' },
    });
    throw new Error(resp?.error || '打开优化面板失败');
  }

  showPanelOverlay(resp.pending);
}

function applyAndSend(
  text: string,
  autoSend: boolean,
  analytics?: { sessionId?: string; clientId?: string; platform?: string },
) {
  const adapter = detectAdapter();
  if (!adapter) return;

  adapter.setInputText(text);

  const finish = (sent: boolean) => {
    hidePanelOverlay();
    sessionStorage.setItem(ENHANCED_FLAG, text);
    trackEvent({
      eventType: sent ? 'send_success' : 'send_fail',
      sessionId: analytics?.sessionId,
      clientId: analytics?.clientId,
      platform: analytics?.platform,
      properties: { autoSend, enhancedLength: text.length },
    });
    if (sent) {
      showToast('已补全并发送 ✓');
    } else {
      showToast('已写回输入框，请手动点击发送', true);
    }
    refreshButtonVisibility();
  };

  if (!autoSend) {
    finish(false);
    return;
  }

  setTimeout(() => {
    const sent = adapter.submitMessage();
    if (!sent) {
      setTimeout(() => finish(adapter.submitMessage()), 300);
    } else {
      finish(true);
    }
  }, 250);
}

function refreshButtonVisibility() {
  ensureUiMounted();
  const adapter = detectAdapter();
  const button = getEnhanceButton();
  if (!adapter || !button) return;

  const text = adapter.getInputText();
  const lastSent = sessionStorage.getItem(ENHANCED_FLAG);

  if (!text || text.length < 4 || text === lastSent) {
    button.classList.add('hidden');
    return;
  }

  button.classList.remove('hidden');
}

function init() {
  ensureUiMounted();
  const adapter = detectAdapter();
  if (!adapter) return;

  const button = createEnhanceButton();

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = adapter.getInputText();
    if (!text) return;

    button.disabled = true;
    button.textContent = '分析中...';
    try {
      await openEnhancePanel(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '打开失败';
      console.error('[问得好]', msg);
      showToast(msg, true);
    } finally {
      button.disabled = false;
      button.textContent = '✨ 优化问题';
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'AIHELPER_CLOSE') hidePanelOverlay();
  });

  document.addEventListener('input', refreshButtonVisibility, true);
  document.addEventListener('keyup', refreshButtonVisibility, true);
  setInterval(refreshButtonVisibility, 1500);

  const bodyObserver = new MutationObserver(() => {
    const host = document.getElementById('aihelper-host');
    if (!host?.isConnected) ensureUiMounted();
  });
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'APPLY_ENHANCED') {
      applyAndSend(msg.text as string, msg.autoSend !== false, {
        sessionId: msg.sessionId,
        clientId: msg.clientId,
        platform: msg.platform,
      });
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'GET_CURRENT_QUESTION') {
      sendResponse({ question: adapter.getInputText() });
      return;
    }
  });

  refreshButtonVisibility();
}

function boot() {
  if (!document.body) {
    requestAnimationFrame(boot);
    return;
  }
  init();
  console.info('[问得好] 插件已加载', 'v1.3.0');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

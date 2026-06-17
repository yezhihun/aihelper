/** 在 Shadow DOM 中渲染 UI，规避页面 Trusted Types / CSP 限制 */

const HOST_ID = 'aihelper-host';
const STYLE_ID = 'aihelper-ui-styles';

export interface PanelPending {
  question: string;
  tabId: number;
  url: string;
  sessionId: string;
  platform: string;
  clientId: string;
  conversationContext: Array<{ role: 'user' | 'assistant'; content: string }>;
}

let hostEl: HTMLElement | null = null;
let uiRoot: ShadowRoot | null = null;

function injectStyles(root: ShadowRoot): void {
  if (root.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    .aihelper-btn {
      pointer-events: auto;
      position: fixed;
      bottom: 88px;
      right: 24px;
      padding: 10px 16px;
      border: none;
      border-radius: 20px;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 2147483647;
    }
    .aihelper-btn:hover { transform: translateY(-1px); }
    .aihelper-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .aihelper-btn.hidden { display: none; }

    .aihelper-backdrop {
      pointer-events: auto;
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.45);
      display: flex; justify-content: flex-end;
      z-index: 2147483646;
    }
    .aihelper-panel {
      width: 380px; max-width: 100vw; height: 100%;
      background: #f8fafc;
      box-shadow: -4px 0 24px rgba(0,0,0,0.15);
      position: relative; display: flex; flex-direction: column;
    }
    .aihelper-close {
      position: absolute; top: 8px; right: 12px; z-index: 2;
      width: 32px; height: 32px; border: none; border-radius: 8px;
      background: rgba(255,255,255,0.9); font-size: 22px; line-height: 1;
      cursor: pointer; color: #64748b;
    }
    .aihelper-frame { flex: 1; width: 100%; border: none; }

    .aihelper-toast {
      pointer-events: auto;
      position: fixed; bottom: 140px; right: 24px;
      padding: 10px 16px; border-radius: 10px; font-size: 13px;
      max-width: 320px; color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 2147483647;
    }
    .aihelper-toast.ok { background: #4f46e5; }
    .aihelper-toast.error { background: #dc2626; }
  `;
  root.appendChild(style);
}

function createHost(): HTMLElement {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.setProperty('position', 'fixed');
  host.style.setProperty('inset', '0');
  host.style.setProperty('z-index', '2147483647');
  host.style.setProperty('pointer-events', 'none');

  uiRoot = host.attachShadow({ mode: 'open' });
  injectStyles(uiRoot);
  hostEl = host;
  return host;
}

/** 确保 UI 宿主挂载在页面上（SPA 切换后可能被移除） */
export function ensureUiMounted(): ShadowRoot {
  const existing = document.getElementById(HOST_ID) as HTMLElement | null;

  if (existing?.shadowRoot) {
    hostEl = existing;
    uiRoot = existing.shadowRoot;
    if (!existing.isConnected) {
      (document.body || document.documentElement).appendChild(existing);
    }
    injectStyles(uiRoot);
    return uiRoot;
  }

  if (hostEl?.shadowRoot && hostEl.isConnected) {
    uiRoot = hostEl.shadowRoot;
    return uiRoot;
  }

  if (hostEl?.shadowRoot && !hostEl.isConnected) {
    (document.body || document.documentElement).appendChild(hostEl);
    uiRoot = hostEl.shadowRoot;
    return uiRoot;
  }

  const host = createHost();
  (document.body || document.documentElement).appendChild(host);
  return uiRoot!;
}

export function getUiRoot(): ShadowRoot {
  return ensureUiMounted();
}

export function getEnhanceButton(): HTMLButtonElement | null {
  ensureUiMounted();
  return uiRoot?.querySelector('.aihelper-btn') as HTMLButtonElement | null;
}

export function createEnhanceButton(): HTMLButtonElement {
  const root = getUiRoot();
  let btn = root.querySelector('.aihelper-btn') as HTMLButtonElement | null;
  if (btn) return btn;

  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'aihelper-btn hidden';
  btn.textContent = '✨ 优化问题';
  root.appendChild(btn);
  return btn;
}

function postInitToFrame(iframe: HTMLIFrameElement, pending: PanelPending): void {
  const send = () => {
    iframe.contentWindow?.postMessage({ type: 'AIHELPER_INIT', pending }, '*');
  };
  send();
  setTimeout(send, 100);
  setTimeout(send, 400);
}

export function showPanelOverlay(pending: PanelPending): void {
  const root = getUiRoot();
  root.querySelector('.aihelper-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'aihelper-backdrop';

  const panel = document.createElement('div');
  panel.className = 'aihelper-panel';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'aihelper-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.textContent = '×';

  const iframe = document.createElement('iframe');
  iframe.className = 'aihelper-frame';
  iframe.title = '问得好';

  const close = () => {
    backdrop.remove();
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  iframe.addEventListener('load', () => {
    postInitToFrame(iframe, pending);
  });

  panel.appendChild(closeBtn);
  panel.appendChild(iframe);
  backdrop.appendChild(panel);
  root.appendChild(backdrop);

  iframe.src = chrome.runtime.getURL('sidepanel.html');
}

export function hidePanelOverlay(): void {
  uiRoot?.querySelector('.aihelper-backdrop')?.remove();
}

export function showToast(message: string, isError = false): void {
  const root = getUiRoot();
  root.querySelector('.aihelper-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = `aihelper-toast ${isError ? 'error' : 'ok'}`;
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

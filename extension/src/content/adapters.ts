export interface PageAdapter {
  name: string;
  getInputElement(): HTMLElement | null;
  getInputText(): string;
  setInputText(text: string): void;
  submitMessage(): boolean;
  getAnchorElement(): HTMLElement | null;
}

function triggerInput(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  triggerInput(el);
}

function isClickable(el: Element): boolean {
  const html = el as HTMLElement;
  if (html.offsetParent === null) return false;
  if (html instanceof HTMLButtonElement || html instanceof HTMLInputElement) {
    return !html.disabled;
  }
  return html.getAttribute('aria-disabled') !== 'true';
}

export function createTextareaAdapter(
  name: string,
  selectors: string[],
  anchorSelectors: string[],
  sendSelectors: string[],
): PageAdapter {
  return {
    name,
    getInputElement() {
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return null;
    },
    getInputText() {
      const el = this.getInputElement();
      if (!el) return '';
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return el.value.trim();
      }
      return (el.textContent || el.innerText || '').trim();
    },
    setInputText(text: string) {
      const el = this.getInputElement();
      if (!el) return;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        setNativeValue(el, text);
        el.focus();
        return;
      }
      if (el.isContentEditable) {
        el.focus();
        el.textContent = text;
        triggerInput(el);
      }
    },
    submitMessage() {
      for (const sel of sendSelectors) {
        const btn = document.querySelector<HTMLElement>(sel);
        if (btn && isClickable(btn)) {
          btn.click();
          return true;
        }
      }

      const input = this.getInputElement();
      const form = input?.closest('form');
      if (form) {
        const submit = form.querySelector<HTMLElement>(
          'button[type="submit"], button[aria-label*="发送"], button[aria-label*="Send"]',
        );
        if (submit && isClickable(submit)) {
          submit.click();
          return true;
        }
      }

      return false;
    },
    getAnchorElement() {
      for (const sel of anchorSelectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return this.getInputElement()?.parentElement ?? null;
    },
  };
}

export const chatgptAdapter = createTextareaAdapter(
  'ChatGPT',
  [
    '#prompt-textarea',
    'textarea[data-id="root"]',
    'div[contenteditable="true"][id="prompt-textarea"]',
    'div.ProseMirror[contenteditable="true"]',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="消息"]',
  ],
  ['form[data-type="unified-composer"]', 'div[class*="composer"]', 'main form'],
  [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="发送"]',
  ],
);

export const deepseekAdapter = createTextareaAdapter(
  'DeepSeek',
  [
    'textarea#chat-input',
    'textarea[placeholder*="DeepSeek"]',
    'textarea[placeholder*="发送"]',
    'div[contenteditable="true"]',
    'textarea',
  ],
  ['div[class*="input"]', 'form', 'main'],
  [
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'button.ds-icon-button--filled',
    'button.ds-icon-button',
    'div[role="button"][aria-label*="发送"]',
  ],
);

export function detectAdapter(): PageAdapter | null {
  const host = location.hostname;
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
    return chatgptAdapter;
  }
  if (host.includes('deepseek.com')) {
    return deepseekAdapter;
  }
  return null;
}

/** 是否像已增强过的长问题，避免反复补全 */
export function looksAlreadyEnhanced(text: string): boolean {
  return text.length >= 280 || (text.length >= 120 && text.split(/[。！？.!?]/).length >= 3);
}

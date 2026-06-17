import type { ConversationMessage } from '@aihelper/requirement';

const MAX_MESSAGES = 12;
const MAX_CHARS = 8000;

function getText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button, svg, [aria-hidden="true"]').forEach((n) => n.remove());
  return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function trimMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const sliced = messages.slice(-MAX_MESSAGES);
  let total = 0;
  const result: ConversationMessage[] = [];
  for (let i = sliced.length - 1; i >= 0; i--) {
    const m = sliced[i];
    if (total + m.content.length > MAX_CHARS) break;
    total += m.content.length;
    result.unshift(m);
  }
  return result.filter((m) => m.content.length > 0);
}

/** ChatGPT / OpenAI 页面 */
function extractChatGPT(): ConversationMessage[] {
  const nodes = document.querySelectorAll('[data-message-author-role]');
  if (nodes.length === 0) return [];

  return trimMessages(
    Array.from(nodes).map((el) => ({
      role: el.getAttribute('data-message-author-role') as 'user' | 'assistant',
      content: getText(el),
    })),
  );
}

/** DeepSeek 页面 */
function extractDeepSeek(): ConversationMessage[] {
  // 策略1：data-role 属性
  const byRole = document.querySelectorAll('[data-role="user"], [data-role="assistant"]');
  if (byRole.length > 0) {
    return trimMessages(
      Array.from(byRole).map((el) => ({
        role: (el.getAttribute('data-role') === 'user' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        content: getText(el),
      })),
    );
  }

  // 策略2：class 含 user/assistant 的消息块
  const containers = document.querySelectorAll(
    [
      '[class*="user-message"]',
      '[class*="assistant-message"]',
      '[class*="UserMessage"]',
      '[class*="AssistantMessage"]',
      '.ds-message',
      '[class*="message-item"]',
    ].join(','),
  );

  if (containers.length > 0) {
    const messages: ConversationMessage[] = [];
    containers.forEach((el) => {
      const cls = el.className?.toString().toLowerCase() ?? '';
      const role: 'user' | 'assistant' =
        cls.includes('user') && !cls.includes('assistant') ? 'user' : 'assistant';
      const text = getText(el);
      if (text) messages.push({ role, content: text });
    });
    if (messages.length > 0) return trimMessages(messages);
  }

  // 策略3：主聊天区内成对气泡（奇数用户、偶数助手）
  const main = document.querySelector('main') ?? document.body;
  const bubbles = main.querySelectorAll(
    '[class*="markdown"], [class*="message-content"], [class*="bubble"]',
  );
  if (bubbles.length >= 2) {
    const messages: ConversationMessage[] = Array.from(bubbles).map((el, idx) => ({
      role: idx % 2 === 0 ? 'user' : 'assistant',
      content: getText(el),
    }));
    return trimMessages(messages);
  }

  return [];
}

export function extractConversationContext(): ConversationMessage[] {
  const host = location.hostname;
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
    return extractChatGPT();
  }
  if (host.includes('deepseek.com')) {
    return extractDeepSeek();
  }
  return [];
}

export function formatContextPreview(messages: ConversationMessage[]): string {
  if (messages.length === 0) return '';
  return `已读取 ${messages.length} 条历史消息`;
}

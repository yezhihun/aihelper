import { useCallback, useEffect, useRef, useState } from 'react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { sendNotification } from '@tauri-apps/plugin-notification';
import type { MissingField, RequirementGraph } from '@aihelper/requirement';
import { api } from './services/api';
import { DEFAULT_BASE } from './services/settings';
import {
  labelForAutoEnrichType,
  labelForField,
  labelForReason,
} from './utils/labels';

const CLIENT_ID_KEY = 'aihelper_desktop_client_id';

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function scoreColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

interface CompanionPanelProps {
  /** 来自全局热键 / 托盘触发的剪贴板文本 */
  incomingQuestion: string | null;
  onIncomingHandled: () => void;
}

export function CompanionPanel({ incomingQuestion, onIncomingHandled }: CompanionPanelProps) {
  const [question, setQuestion] = useState('');
  const [graph, setGraph] = useState<RequirementGraph | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [enhanced, setEnhanced] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiBase, setApiBaseState] = useState(DEFAULT_BASE);
  const [apiKey, setApiKeyState] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const sessionIdRef = useRef('');
  const analyzeStartRef = useRef(0);

  useEffect(() => {
    Promise.all([api.getApiBase(), api.getApiKey()]).then(([base, key]) => {
      setApiBaseState(base);
      setApiKeyState(key);
      if (!key.trim()) setShowSettings(true);
    });
  }, []);

  const runAnalyze = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('剪贴板为空，请先在 AI 客户端复制问题文本');
      return;
    }

    sessionIdRef.current = crypto.randomUUID();
    setQuestion(trimmed);
    setLoading(true);
    setError('');
    setGraph(null);
    setEnhanced('');
    analyzeStartRef.current = Date.now();

    try {
      const result = await api.analyzeQuestion(trimmed, [], {
        sessionId: sessionIdRef.current,
        clientId: getClientId(),
        platform: 'desktop-companion',
      });
      setGraph(result.graph);
      const initial: Record<string, string> = {};
      for (const m of result.graph.missingFields) {
        const opts = result.graph.suggestions[m.fieldName];
        if (opts?.length) initial[m.fieldName] = opts[0];
      }
      setAnswers(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!incomingQuestion?.trim()) return;
    runAnalyze(incomingQuestion);
    onIncomingHandled();
  }, [incomingQuestion, onIncomingHandled, runAnalyze]);

  const handleSaveSettings = async () => {
    await Promise.all([api.setApiBase(apiBase), api.setApiKey(apiKey)]);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    if (apiKey.trim()) setShowSettings(false);
  };

  const handleSelect = (field: MissingField, value: string) => {
    setAnswers((prev) => ({ ...prev, [field.fieldName]: value }));
  };

  const handleComplete = async () => {
    if (!question || !graph) return;
    setCompleting(true);
    setError('');
    try {
      const resolved: Record<string, string> = {};
      for (const m of graph.missingFields) {
        const selected = answers[m.fieldName];
        if (!selected) continue;
        resolved[m.fieldName] =
          selected === '自定义' ? customValues[m.fieldName] || '' : selected;
      }
      const result = await api.completeQuestion(
        question,
        resolved,
        [],
        {
          sessionId: sessionIdRef.current,
          clientId: getClientId(),
          platform: 'desktop-companion',
        },
        {
          autoEnrichments: graph.autoEnrichments ?? [],
          intent: graph.intent,
          knownFields: graph.knownFields,
          roleEstablished: graph.roleEstablished,
        },
      );
      setEnhanced(result.enhancedQuestion);
      await writeText(result.enhancedQuestion);
      await sendNotification({
        title: '问得好',
        body: '增强后的问题已复制到剪贴板，请回到 AI 客户端粘贴发送',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setCompleting(false);
    }
  };

  const handleManualAnalyze = () => {
    runAnalyze(question);
  };

  const allAnswered =
    graph?.missingFields.every((m) => {
      const sel = answers[m.fieldName];
      if (!sel) return false;
      if (sel === '自定义') return (customValues[m.fieldName] || '').trim().length > 0;
      return true;
    }) ?? false;

  return (
    <div className="panel">
      <header className="header">
        <div className="header-row">
          <h1>问得好</h1>
          <button
            type="button"
            className="settings-btn"
            onClick={() => setShowSettings((v) => !v)}
            title="API 设置"
            aria-label="API 设置"
          >
            ⚙️
          </button>
        </div>
        <p>PC 伴侣 · 优化后自动复制到剪贴板</p>
        <p className="hotkey-hint">快捷键：Ctrl+Shift+W（Mac：⌘+Shift+W）</p>
      </header>

      {showSettings && (
        <section className="card settings-card">
          <div className="card-label">API 设置</div>
          <label className="settings-label">API 地址</label>
          <input
            className="settings-input"
            value={apiBase}
            onChange={(e) => setApiBaseState(e.target.value)}
            placeholder="https://api.wenhaode.com"
          />
          <label className="settings-label">API Key</label>
          <input
            className="settings-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKeyState(e.target.value)}
            placeholder="wh_xxxxxxxx"
          />
          <button type="button" className="settings-save-btn" onClick={handleSaveSettings}>
            {settingsSaved ? '已保存 ✓' : '保存设置'}
          </button>
        </section>
      )}

      {!showSettings && !apiKey.trim() && (
        <div className="warn-banner">尚未配置 API Key，请点击右上角 ⚙️ 填写后保存。</div>
      )}

      {!incomingQuestion && !question && !loading && (
        <section className="card">
          <p className="hint">
            在 ChatGPT / DeepSeek 客户端中复制问题，然后按 <strong>Ctrl+Shift+W</strong>{' '}
           （Mac 为 <strong>⌘+Shift+W</strong>），或点击托盘菜单「优化剪贴板问题」。
          </p>
          <label className="settings-label">也可手动粘贴问题</label>
          <textarea
            className="question-input"
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="粘贴或输入你的问题…"
          />
          <button
            type="button"
            className="secondary-btn"
            disabled={!question.trim() || !apiKey.trim()}
            onClick={handleManualAnalyze}
          >
            开始分析
          </button>
        </section>
      )}

      {question && (
        <section className="card">
          <div className="card-label">原始问题</div>
          <p className="question-text">{question}</p>
        </section>
      )}

      {loading && (
        <div className="status">
          正在分析问题…
          <br />
          <span className="hint">通常需要 5–15 秒，请稍候</span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {graph && !loading && (
        <>
          <section className="card score-card">
            <div className="score-row">
              <span>问题完整度</span>
              <strong style={{ color: scoreColor(graph.completenessScore) }}>
                {graph.completenessScore}%
              </strong>
            </div>
            <div className="score-bar">
              <div
                className="score-fill"
                style={{
                  width: `${graph.completenessScore}%`,
                  background: scoreColor(graph.completenessScore),
                }}
              />
            </div>
            <div className="intent">意图：{graph.intent}</div>
          </section>

          {graph.autoEnrichments?.length > 0 && (
            <section className="card auto-enrich-card">
              <div className="card-label">将自动优化（无需选择）</div>
              <ul className="auto-enrich-list">
                {graph.autoEnrichments.map((item, i) => (
                  <li key={`${item.type}-${i}`}>
                    <span className="auto-enrich-tag">{labelForAutoEnrichType(item.type)}</span>
                    <span className="auto-enrich-text">{item.content}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {graph.missingFields.length === 0 ? (
            <section className="card">
              <p className="hint">关键信息已齐，确认后将优化并复制到剪贴板。</p>
            </section>
          ) : (
            graph.missingFields.map((field) => {
              const fieldLabel = labelForField(field.fieldName, field.fieldLabel);
              return (
                <section className="card" key={field.fieldName}>
                  <div className="field-header">
                    <strong>{fieldLabel}</strong>
                    <span className="importance">重要度 {field.importance}/10</span>
                  </div>
                  <p className="field-reason">{labelForReason(field.reason, fieldLabel)}</p>
                  <div className="options">
                    {(graph.suggestions[field.fieldName] || []).map((opt) => (
                      <label key={opt} className="option">
                        <input
                          type="radio"
                          name={field.fieldName}
                          checked={answers[field.fieldName] === opt}
                          onChange={() => handleSelect(field, opt)}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                  {answers[field.fieldName] === '自定义' && (
                    <input
                      className="custom-input"
                      placeholder="请输入自定义内容"
                      value={customValues[field.fieldName] || ''}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [field.fieldName]: e.target.value,
                        }))
                      }
                    />
                  )}
                </section>
              );
            })
          )}

          <button
            className="primary-btn"
            disabled={completing || (graph.missingFields.length > 0 && !allAnswered)}
            onClick={handleComplete}
          >
            {completing ? '生成中…' : '确认并复制到剪贴板'}
          </button>

          {enhanced && (
            <section className="card result-card">
              <div className="card-label">增强后的问题</div>
              <p className="enhanced-text">{enhanced}</p>
              <p className="hint success">已复制，请回到 AI 客户端粘贴（Ctrl+V / ⌘+V）</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

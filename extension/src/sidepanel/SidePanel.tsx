import { useCallback, useEffect, useRef, useState } from 'react';
import type { MissingField, RequirementGraph } from '@aihelper/requirement';
import { DEFAULT_API_BASE } from '../config';
import { trackEvent } from '../services/analytics';
import {
  analyzeQuestion,
  completeQuestion,
  getApiBase,
  getApiKey,
  setApiBase,
  setApiKey,
} from '../services/api';
import {
  labelForAutoEnrichType,
  labelForField,
  labelForReason,
} from '../utils/labels';

interface PendingEnhance {
  question: string;
  tabId: number;
  url: string;
  sessionId: string;
  platform: string;
  clientId: string;
  conversationContext?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function scoreColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

export function SidePanel() {
  const [pending, setPending] = useState<PendingEnhance | null>(null);
  const [graph, setGraph] = useState<RequirementGraph | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [enhanced, setEnhanced] = useState('');
  const [contextCount, setContextCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [apiBase, setApiBaseState] = useState(DEFAULT_API_BASE);
  const [apiKey, setApiKeyState] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const analyzeStartRef = useRef(0);

  useEffect(() => {
    Promise.all([getApiBase(), getApiKey()]).then(([base, key]) => {
      setApiBaseState(base);
      setApiKeyState(key);
      if (!key.trim()) setShowSettings(true);
    });
  }, []);

  const handleSaveSettings = async () => {
    await Promise.all([setApiBase(apiBase), setApiKey(apiKey)]);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    if (apiKey.trim()) setShowSettings(false);
  };

  const loadPending = useCallback(async () => {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_PENDING' });
    const p = resp?.pending as PendingEnhance | null;
    if (p?.question) {
      setPending(p);
      setContextCount(p.conversationContext?.length ?? 0);
      return p;
    }
    return null;
  }, []);

  const meta = pending
    ? {
        sessionId: pending.sessionId,
        clientId: pending.clientId,
        platform: pending.platform,
      }
    : undefined;

  const runAnalyze = useCallback(
    async (question: string, context: PendingEnhance['conversationContext'], p: PendingEnhance) => {
      setLoading(true);
      setError('');
      setGraph(null);
      setEnhanced('');
      analyzeStartRef.current = Date.now();
      try {
        const result = await analyzeQuestion(question, context ?? [], {
          sessionId: p.sessionId,
          clientId: p.clientId,
          platform: p.platform,
        });
        setGraph(result.graph);
        const initial: Record<string, string> = {};
        for (const m of result.graph.missingFields) {
          const opts = result.graph.suggestions[m.fieldName];
          if (opts?.length) initial[m.fieldName] = opts[0];
        }
        setAnswers(initial);
        trackEvent({
          eventType: 'panel_analyze_done',
          sessionId: p.sessionId,
          clientId: p.clientId,
          platform: p.platform,
          properties: {
            score: result.score,
            durationMs: Date.now() - analyzeStartRef.current,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '分析失败';
        setError(msg);
        trackEvent({
          eventType: 'panel_analyze_error',
          sessionId: p.sessionId,
          clientId: p.clientId,
          platform: p.platform,
          properties: { error: msg },
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let started = false;

    const startAnalyze = (p: PendingEnhance) => {
      if (started) return;
      started = true;
      setPending(p);
      setContextCount(p.conversationContext?.length ?? 0);
      runAnalyze(p.question, p.conversationContext, p);
    };

    const onInit = (e: MessageEvent) => {
      if (e.data?.type !== 'AIHELPER_INIT' || !e.data.pending) return;
      startAnalyze(e.data.pending as PendingEnhance);
    };

    window.addEventListener('message', onInit);

    loadPending().then((p) => {
      if (p) startAnalyze(p);
    });

    return () => window.removeEventListener('message', onInit);
  }, [loadPending, runAnalyze]);

  const handleSelect = (field: MissingField, value: string) => {
    setAnswers((prev) => ({ ...prev, [field.fieldName]: value }));
  };

  const handleComplete = async () => {
    if (!pending || !graph || !meta) return;
    setCompleting(true);
    setError('');
    const completeStart = Date.now();
    try {
      const resolved: Record<string, string> = {};
      for (const m of graph.missingFields) {
        const selected = answers[m.fieldName];
        if (!selected) continue;
        resolved[m.fieldName] =
          selected === '自定义' ? customValues[m.fieldName] || '' : selected;
      }
      const result = await completeQuestion(
        pending.question,
        resolved,
        pending.conversationContext ?? [],
        meta,
        {
          autoEnrichments: graph.autoEnrichments ?? [],
          intent: graph.intent,
          knownFields: graph.knownFields,
          roleEstablished: graph.roleEstablished,
        },
      );
      setEnhanced(result.enhancedQuestion);

      trackEvent({
        eventType: 'panel_complete_done',
        sessionId: pending.sessionId,
        clientId: pending.clientId,
        platform: pending.platform,
        properties: {
          durationMs: Date.now() - completeStart,
          enhancedLength: result.enhancedQuestion.length,
        },
      });

      await chrome.runtime.sendMessage({
        type: 'APPLY_TO_TAB',
        tabId: pending.tabId,
        text: result.enhancedQuestion,
        autoSend: true,
        sessionId: pending.sessionId,
        clientId: pending.clientId,
        platform: pending.platform,
      });

      if (window.parent !== window) {
        window.parent.postMessage({ type: 'AIHELPER_CLOSE' }, '*');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败';
      setError(msg);
      trackEvent({
        eventType: 'panel_complete_error',
        sessionId: pending.sessionId,
        clientId: pending.clientId,
        platform: pending.platform,
        properties: { error: msg },
      });
    } finally {
      setCompleting(false);
    }
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
        <p>补全缺失信息，一键发送给 AI</p>
        {contextCount > 0 && (
          <p className="context-badge">已关联 {contextCount} 条会话上下文</p>
        )}
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
          <p className="hint settings-hint">首次使用请先填写 API Key，保存后再点击「优化问题」。</p>
        </section>
      )}

      {!showSettings && !apiKey.trim() && (
        <div className="warn-banner">
          尚未配置 API Key，请点击右上角 ⚙️ 填写后保存。
        </div>
      )}

      {pending && (
        <section className="card">
          <div className="card-label">原始问题</div>
          <p className="question-text">{pending.question}</p>
        </section>
      )}

      {loading && (
        <div className="status">
          正在分析问题...
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
              <p className="hint">
                {graph.autoEnrichments?.length > 0
                  ? '关键信息已齐，确认后将自动优化并发送。'
                  : '问题已较完整，可直接发送或手动微调。'}
              </p>
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
            {completing ? '发送中...' : '确认并发送'}
          </button>

          {enhanced && (
            <section className="card result-card">
              <div className="card-label">增强后的问题</div>
              <p className="enhanced-text">{enhanced}</p>
              <p className="hint success">已自动发送给 AI，请查看对话回复</p>
            </section>
          )}
        </>
      )}

      {!pending && !loading && (
        <section className="card">
          <p className="hint">在 ChatGPT 或 DeepSeek 输入问题后，点击「优化问题」按钮。</p>
        </section>
      )}
    </div>
  );
}

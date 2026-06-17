import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_API_BASE, PRIVACY_URL, TERMS_URL } from '../config';
import { getApiBase, getApiKey, setApiBase, setApiKey } from '../services/api';
import './popup.css';

function Popup() {
  const [apiBase, setApiBaseState] = useState(DEFAULT_API_BASE);
  const [apiKey, setApiKeyState] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getApiBase(), getApiKey()]).then(([base, key]) => {
      setApiBaseState(base);
      setApiKeyState(key);
    });
  }, []);

  const handleSave = async () => {
    await Promise.all([setApiBase(apiBase), setApiKey(apiKey)]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="popup">
      <h1>问得好</h1>
      <p className="desc">AI 提问增强层</p>

      <label className="label">API 地址</label>
      <input
        className="input"
        value={apiBase}
        onChange={(e) => setApiBaseState(e.target.value)}
        placeholder="https://api.wenhaode.com"
      />

      <label className="label">API Key</label>
      <input
        className="input"
        type="password"
        value={apiKey}
        onChange={(e) => setApiKeyState(e.target.value)}
        placeholder="wh_xxxxxxxx"
      />

      <button className="btn" onClick={handleSave}>
        {saved ? '已保存 ✓' : '保存'}
      </button>

      <p className="hint">在 ChatGPT / DeepSeek 输入问题后，点击「优化问题」。</p>

      {(PRIVACY_URL || TERMS_URL) && (
        <p className="links">
          {PRIVACY_URL && (
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              隐私政策
            </a>
          )}
          {PRIVACY_URL && TERMS_URL && ' · '}
          {TERMS_URL && (
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">
              用户协议
            </a>
          )}
        </p>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);

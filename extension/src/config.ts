/** 插件运行时配置（构建时通过 VITE_* 注入） */

export const DEFAULT_API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

export const PRIVACY_URL = (import.meta.env.VITE_PRIVACY_URL as string | undefined) || '';
export const TERMS_URL = (import.meta.env.VITE_TERMS_URL as string | undefined) || '';

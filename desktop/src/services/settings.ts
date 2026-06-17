import { load } from '@tauri-apps/plugin-store';
import type { SettingsStore } from '@aihelper/api-client';

const STORE_PATH = 'settings.json';
const DEFAULT_BASE = import.meta.env.VITE_API_BASE || 'https://api.wenhaode.com';

let storePromise: ReturnType<typeof load> | null = null;

async function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_PATH);
  }
  return storePromise;
}

export const settingsStore: SettingsStore = {
  async getApiBase() {
    const store = await getStore();
    const value = await store.get<string>('apiBase');
    return (value || DEFAULT_BASE).replace(/\/$/, '');
  },
  async setApiBase(value: string) {
    const store = await getStore();
    await store.set('apiBase', value.replace(/\/$/, ''));
    await store.save();
  },
  async getApiKey() {
    const store = await getStore();
    const value = await store.get<string>('apiKey');
    return (value || '').trim();
  },
  async setApiKey(value: string) {
    const store = await getStore();
    await store.set('apiKey', value.trim());
    await store.save();
  },
};

export { DEFAULT_BASE };

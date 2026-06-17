import { createApiClient } from '@aihelper/api-client';
import { DEFAULT_BASE, settingsStore } from './settings';

export const api = createApiClient({
  store: settingsStore,
  defaultApiBase: DEFAULT_BASE,
});

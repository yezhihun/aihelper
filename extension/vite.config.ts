import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const root = resolve(__dirname);

function copyManifest(apiBase: string) {
  return {
    name: 'copy-manifest',
    writeBundle() {
      const dist = resolve(root, 'dist');
      mkdirSync(dist, { recursive: true });
      copyFileSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));

      const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf-8'));
      manifest.background.service_worker = 'background.js';
      manifest.side_panel.default_path = 'sidepanel.html';
      manifest.action.default_popup = 'popup.html';
      manifest.content_scripts = manifest.content_scripts.map(
        (cs: { js: string[] }) => ({
          ...cs,
          js: ['content.js'],
        }),
      );

      try {
        const origin = new URL(apiBase).origin;
        const perm = `${origin}/*`;
        if (!manifest.host_permissions.includes(perm)) {
          manifest.host_permissions.push(perm);
        }
      } catch {
        // ignore invalid URL at build time
      }

      writeFileSync(resolve(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
      cpSync(resolve(root, 'icons'), resolve(dist, 'icons'), { recursive: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const apiBase = env.VITE_API_BASE || 'http://localhost:8000';

  return {
    base: './',
    plugins: [react(), copyManifest(apiBase)],
  resolve: {
    alias: {
      '@aihelper/requirement': resolve(root, '../packages/requirement/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(root, 'sidepanel.html'),
        popup: resolve(root, 'popup.html'),
        background: resolve(root, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (asset) => {
          if (asset.name === 'sidepanel.html') return 'sidepanel.html';
          if (asset.name === 'popup.html') return 'popup.html';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  };
});

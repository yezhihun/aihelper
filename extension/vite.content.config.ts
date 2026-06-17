import { resolve } from 'path';
import { defineConfig } from 'vite';

const root = resolve(__dirname);

/** Content script 必须打包为单文件 IIFE，Chrome 不支持带 import 的 content script */
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@aihelper/requirement': resolve(root, '../packages/requirement/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(root, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'AiHelperContent',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        extend: true,
      },
    },
  },
});

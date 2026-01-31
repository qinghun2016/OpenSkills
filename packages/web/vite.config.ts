import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Web 默认端口 3848（与插件一致），可通过环境变量 VITE_PORT 覆盖
const webPort = process.env.VITE_PORT ? Number(process.env.VITE_PORT) : 3848;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: webPort,
    strictPort: true,
    watch: {
      // 在 Docker 中启用轮询以解决文件监听问题
      usePolling: true,
      interval: 1000,
    },
    hmr: {
      // 确保 HMR 在 Docker 环境中正常工作
      host: 'localhost',
      port: webPort,
    },
    proxy: {
      '/api': {
        // npm run dev 时 API 默认 3000；扩展内嵌 API 用 3847。可用 VITE_API_URL 覆盖
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});

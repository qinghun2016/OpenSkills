import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 测试需先启动 API 与 Web：
 * - 根目录: npm run dev:api (端口 3847) 与 npm run dev:web (端口 3848)
 * - 或: npm run dev 同时启动两者
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3848',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  timeout: 15000,
});

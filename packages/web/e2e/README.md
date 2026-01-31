# E2E 测试（Playwright）

## 前提

1. **安装浏览器**（首次或升级 Playwright 后）：
   ```bash
   cd packages/web && npx playwright install chromium
   ```

2. **启动 API 与 Web**（e2e 会请求 `http://localhost:3848`，Web 将 `/api` 代理到 API）：
   ```bash
   # 根目录
   npm run dev          # 同时启动 API(3847) 与 Web(3848)
   # 或分别启动
   npm run dev:api      # 端口 3847 或 3000（视配置）
   npm run dev:web      # 端口 3848
   ```

## 运行

```bash
cd packages/web
npm run test:e2e
# 或带 UI
npm run test:e2e:ui
```

## 用例

- **提议创建**（`proposals-create.spec.ts`）：通过「创建提议」表单填写 mock 数据，提交「仅创建」或「创建并立即通过并应用」，断言列表中出现对应提议。

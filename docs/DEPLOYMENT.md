# OpenSkills 部署指南

## 推荐方式：插件模式（日常使用）

安装 OpenSkills 扩展后，API 与 Web 由插件在 Cursor/VS Code 内自动启动，无需额外部署。

- API 默认端口：3847
- Web 默认端口：3848
- 运行 **OpenSkills: Open Web UI** 访问界面

## 开发调试：npm 本地运行

```bash
# 克隆并安装
git clone https://github.com/qinghun2016/OpenSkills.git
cd OpenSkills && npm install

# 启动 API + Web
npm run dev
```

- API 端口：`PORT` 环境变量（默认 3000），建议设为 3847 与插件一致
- Web 端口：`VITE_PORT` 环境变量（默认 3848）
- 工作区：`WORKSPACE_ROOT` 或当前目录

## 生产部署（无插件环境）

```bash
npm install && npm run build

# 启动 API
cd packages/api && npm start
# 或: PORT=3847 node dist/index.js

# 启动 Web（另一终端）
npx serve packages/web/dist -p 3848
```

### 环境变量

复制 `.env.example` 为 `.env`，配置：

| 变量 | 说明 |
|------|------|
| `PORT` | API 端口，默认 3000 |
| `GITHUB_TOKEN` | 爬虫功能（可选），用于 GitHub API |
| `WORKSPACE_ROOT` | 工作区路径（含 `.openskills`） |
| `VITE_API_URL` | Web 代理目标 API 地址 |
| `CORS_ORIGIN` | 允许的 Web 来源 |

### 配置文件

首次运行需有 `.openskills/config.json`。可从 `.openskills/config.json.example` 复制并修改。

## CI/CD

项目包含 GitHub Actions 工作流：

- `.github/workflows/ci.yml`：Lint、测试、构建
- `.github/workflows/release.yml`：发布
- `.github/workflows/deploy.yml`：部署

详见 [CI_CD_GUIDE.md](./CI_CD_GUIDE.md)。

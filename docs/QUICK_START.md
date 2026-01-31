# OpenSkills 快速入门

5 分钟快速上手 OpenSkills！

## 📋 前置要求

- Cursor 或 VS Code
- Node.js >= 18.0.0（用于编译 API/Web，插件启动时会用到）

## 🚀 快速开始

### 方式一：插件启动（推荐，日常使用）

**API 和 Web 由 OpenSkills 插件在 Cursor/VS Code 启动时自动启动，不再需要单独运行 Docker 或 `npm run dev`。**

1. 在 Cursor 中安装并启用 **OpenSkills** 扩展
2. 打开一个已初始化 OpenSkills 的工作区（或运行 `OpenSkills: Initialize`）
3. 插件激活后会自动启动内嵌 API 与 Web 服务

访问（默认端口，可在设置中修改）：
- 🌐 Web 界面: http://localhost:3848
- 🔌 API 服务: http://localhost:3847

可通过命令 **OpenSkills: Open Web UI** 打开浏览器，或从侧边栏/面板查看访问地址。若默认端口被占用，插件会自动换端口并提示。

卸载时扩展会自动关闭服务与进程，一般无需再操作。若扩展目录仍存在，可先关闭 Cursor 再手动删除该目录。

### 方式二：Docker 一键启动（可选，用于无插件或生产部署）

```bash
# 1. 克隆项目
git clone https://github.com/your-org/openskills.git
cd openskills

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f
```

访问：
- 🌐 Web 界面: http://localhost
- 🔌 API 服务端口由部署配置（如 `PORT`）决定，见 docker-compose 或环境变量

### 方式三：Makefile (推荐)

```bash
# 安装并启动
make install
make dev

# 或使用 Docker
make docker-up
```

## ⚙️ 首次克隆后的配置

1. **环境变量**：复制 `.env.example` 为 `.env`，在 `.env` 中设置 `GITHUB_TOKEN`（爬虫功能需要，可选）
2. **配置文件**：`.openskills/config.json` 已被 `.gitignore` 排除。可复制 `.openskills/config.json.example` 为 `.openskills/config.json`；若使用插件，运行 **OpenSkills: Initialize** 会自动创建配置

## 📚 第一次使用

### 1. 了解目录结构

```
.openskills/          # OpenSkills 配置与数据
├── config.json       # 系统配置
├── proposals/        # 提议文件
├── decisions/        # 决策记录
└── history/          # 变更历史

.cursor/skills/       # 项目级 Skills
├── open-skills-bootstrap/
└── skills-admin/
```

### 2. 创建第一个提议

#### 方式 A: 通过 Web 界面

1. 访问 Web 界面（插件模式默认 http://localhost:3848，或使用命令「OpenSkills: Open Web UI」）
2. 点击 "Create Proposal"
3. 填写表单：
   - Skill Name: `my-first-skill`
   - Scope: `project`
   - Reason: 测试提议
   - Diff: 你的改动内容
4. 点击 "Submit"

#### 方式 B: 通过 API

```bash
curl -X POST http://localhost:3847/api/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-proposal-001",
    "skillName": "my-first-skill",
    "scope": "project",
    "reason": "测试提议功能",
    "diff": "--- a/SKILL.md\n+++ b/SKILL.md\n@@ -1,0 +1,1 @@\n+# My First Skill",
    "status": "pending",
    "submittedBy": "test-user"
  }'
```

### 3. 审查和决策

#### 通过 Web 界面

1. 进入 "Proposals" 页面
2. 点击提议查看详情
3. 点击 "Approve" 或 "Reject"

#### 通过 API

```bash
# 创建决策（批准）
curl -X POST http://localhost:3847/api/decisions \
  -H "Content-Type: application/json" \
  -d '{
    "proposalId": "test-proposal-001",
    "decision": "approved",
    "reviewer": "admin",
    "comment": "看起来不错！"
  }'

# 应用改动（插件模式将 3847 改为你的 API 端口）
curl -X POST http://localhost:3847/api/decisions/test-proposal-001/apply
```

### 4. 查看历史记录

```bash
# 获取所有历史记录（插件模式默认端口 3847）
curl http://localhost:3847/api/history

# 查看特定 Skill 的历史
curl http://localhost:3847/api/history?skillName=my-first-skill
```

## 🎯 常用命令

### 开发命令

```bash
# 启动开发服务器（API + Web）
npm run dev

# 仅启动 API
npm run dev:api

# 仅启动 Web
npm run dev:web

# 运行测试
npm test

# 运行测试（覆盖率）
npm run test:coverage -w packages/api

# 代码检查
npm run lint -w packages/api
npm run lint -w packages/web
```

### 构建命令

```bash
# 构建所有包
npm run build

# 构建 API
npm run build -w packages/api

# 构建 Web
npm run build -w packages/web

# 启动生产服务器
cd packages/api && npm start
```

### Docker 命令

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看状态
docker-compose ps

# 进入容器
docker exec -it openskills-api sh
```

### Makefile 命令

```bash
make help              # 查看所有可用命令
make install           # 安装依赖
make dev               # 启动开发服务器
make build             # 构建项目
make test              # 运行测试
make lint              # 代码检查
make docker-build      # 构建 Docker 镜像
make docker-up         # 启动 Docker 服务
make backup            # 备份数据
```

## 🔧 配置

### 编辑系统配置

编辑 `.openskills/config.json`:

```json
{
  "adminMode": "agent_then_human",
  "wake": {
    "enabled": true,
    "schedule": "0 */4 * * *"
  },
  "crawl": {
    "enabled": false,
    "minStars": 100,
    "topics": ["cursor-skills"],
    "githubToken": "your-token-here"
  }
}
```

### 环境变量

复制 `.env.example` 为 `.env`:

```bash
cp .env.example .env
```

编辑 `.env`:

```env
# API 配置（PORT 为 API 服务端口，可改为 3847 等以避免与其它服务冲突）
NODE_ENV=development
PORT=3847

# GitHub Token (可选)
GITHUB_TOKEN=your_github_token
```

## 📖 下一步

### 学习更多

- 📘 [完整文档](../README.md)
- 🚀 [部署指南](./DEPLOYMENT.md)
- 🔄 [CI/CD 指南](./CI_CD_GUIDE.md)
- 🐛 [故障排查](../README.md#故障排查)

### 常见任务

#### 启用 GitHub 爬虫

1. 获取 GitHub Token:
   - 访问 https://github.com/settings/tokens
   - 创建 Personal Access Token
   - 权限：`public_repo`

2. 更新配置:
   ```json
   {
     "crawl": {
       "enabled": true,
       "githubToken": "ghp_your_token_here"
     }
   }
   ```

3. 手动触发爬取:
   ```bash
   curl -X POST http://localhost:<API_PORT>/api/crawler/trigger
   ```
   （将 `<API_PORT>` 替换为实际 API 端口，由 `PORT` 或扩展配置决定）

#### 设置自动唤醒

配置定时提醒审查提议：

```json
{
  "wake": {
    "enabled": true,
    "schedule": "0 */4 * * *",
    "reminderPrompt": "检查 pending proposals 并继续审查"
  }
}
```

#### 配置管理员模式

选择审查流程：

```json
{
  "adminMode": "human_only"        // 仅人类审查
  // 或
  "adminMode": "agent_only"        // 仅 Agent 审查
  // 或
  "adminMode": "agent_then_human"  // Agent 先审查，人类终审
}
```

## 🆘 遇到问题？

### 检查服务状态

```bash
# 检查 API 健康状态（<API_PORT> 为实际 API 端口，由 PORT 或扩展配置决定）
curl http://localhost:<API_PORT>/health

# 查看 API 端点
curl http://localhost:<API_PORT>/api
```

### 查看日志

```bash
# 如果使用 npm dev
# 日志会直接显示在终端

# 如果使用 Docker
docker-compose logs -f api
docker-compose logs -f web
```

### 常见错误

**端口已被占用**
```bash
# 修改 API 端口
PORT=<新端口> npm run dev:api

# 或在 .env 中设置
PORT=<新端口>
```

**依赖安装失败**
```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install
```

**Docker 构建失败**
```bash
# 清理 Docker 缓存
docker system prune -a
docker-compose build --no-cache
```

## 💡 提示

### 开发技巧

1. **热重载**: 修改代码后自动重启
   - API: 使用 `ts-node-dev`
   - Web: 使用 Vite HMR

2. **并行开发**: 同时启动 API 和 Web
   ```bash
   npm run dev
   ```

3. **调试**: 使用 VS Code 调试
   - 按 F5 启动调试
   - 在代码中设置断点

4. **测试驱动**: 先写测试再写代码
   ```bash
   npm run test:watch -w packages/api
   ```

### 性能优化

1. **使用 Docker 开发环境** 隔离依赖
2. **启用 npm 缓存** 加速安装
3. **使用 Makefile** 简化命令

## 🎉 完成！

现在你已经成功启动 OpenSkills 了！

接下来可以：
- ✅ 创建和管理提议
- ✅ 审查和应用改动
- ✅ 查看变更历史
- ✅ 配置自动化功能

有问题？查看 [常见问题](../README.md#常见问题-faq) 或提交 [Issue](https://github.com/your-org/openskills/issues)。

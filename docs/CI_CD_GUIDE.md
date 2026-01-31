# CI/CD 使用指南

本指南详细说明如何使用和配置 OpenSkills 的 CI/CD 流程。

> **说明**：CI 已移除 Docker 镜像构建步骤；部署工作流改为 npm 构建与上传。文档中涉及 Docker 镜像、docker-compose 的部分仅作参考。

## 目录

- [概述](#概述)
- [GitHub Actions 工作流](#github-actions-工作流)
- [配置步骤](#配置步骤)
- [工作流详解](#工作流详解)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)

## 概述

OpenSkills 使用 GitHub Actions 实现完整的 CI/CD 流程：

```
代码提交 → 自动测试 → 构建验证 → 安全扫描 → 部署
```

### 工作流文件

| 文件 | 触发时机 | 用途 |
|------|---------|------|
| `ci.yml` | Push/PR 到 main/develop | 持续集成：测试、构建、检查 |
| `release.yml` | 推送版本标签 (v*.*.*) | 创建 Release 和 Docker 镜像 |
| `deploy.yml` | 手动触发 | 部署到 staging/production |

## GitHub Actions 工作流

### 1. CI 工作流 (持续集成)

**触发条件**：
- Push 到 `main` 或 `develop` 分支
- Pull Request 到 `main` 或 `develop` 分支

**执行步骤**：

```yaml
# 1. Lint 检查 (并行)
- API 代码检查
- Web 代码检查

# 2. 测试 (多版本矩阵)
- Node.js 18 测试
- Node.js 20 测试
- 生成覆盖率报告

# 3. 构建验证
- 构建 API
- 构建 Web
- 上传构建产物

# 4. Docker 镜像构建 (仅 main 分支)
- 构建 API Docker 镜像
- 构建 Web Docker 镜像

# 5. 安全扫描
- npm audit
- Trivy 漏洞扫描
```

**查看结果**：
- 访问仓库的 "Actions" 标签
- 选择对应的工作流运行记录
- 查看每个步骤的详细日志

### 2. Release 工作流 (发布)

**触发条件**：
```bash
# 创建并推送版本标签
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

**执行步骤**：
1. 运行完整测试
2. 构建所有包
3. 创建 npm 发布包
4. 生成变更日志
5. 创建 GitHub Release
6. 构建并推送 Docker 镜像到 Docker Hub

**产物**：
- GitHub Release 页面
- Docker 镜像：`username/openskills-api:latest` 和 `:版本号`
- Docker 镜像：`username/openskills-web:latest` 和 `:版本号`

### 3. Deploy 工作流 (部署)

**触发方式**：手动在 GitHub Actions 页面触发

**步骤**：
1. 在 GitHub 仓库页面点击 "Actions"
2. 选择 "Deploy" 工作流
3. 点击 "Run workflow"
4. 选择部署环境：
   - `staging` - 测试环境
   - `production` - 生产环境
5. 可选：输入指定版本号
6. 点击 "Run workflow" 确认

**执行流程**：
```
测试 → 构建 → 部署到服务器 → 健康检查 → 通知
```

## 配置步骤

### 第一步：配置 GitHub Secrets

在仓库设置中添加必要的 Secrets：

1. 进入仓库 Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 添加以下 Secrets：

#### Docker Hub (用于镜像发布)

```
名称: DOCKER_USERNAME
值: 你的 Docker Hub 用户名

名称: DOCKER_PASSWORD
值: 你的 Docker Hub 密码或 Access Token
```

#### SSH 部署 (可选)

```
名称: SSH_PRIVATE_KEY
值: SSH 私钥内容 (cat ~/.ssh/id_rsa)

名称: SERVER_HOST
值: 服务器地址 (例如: example.com)

名称: SERVER_USER
值: SSH 用户名 (例如: ubuntu)
```

#### API 端点 (用于健康检查)

```
名称: STAGING_API_URL
值: https://staging-api.yourdomain.com

名称: PRODUCTION_API_URL
值: https://api.yourdomain.com
```

### 第二步：配置 GitHub Environments (可选)

为不同环境设置保护规则：

1. 进入 Settings → Environments
2. 创建环境：
   - `staging` - 测试环境
   - `production` - 生产环境

3. 为 production 环境添加保护规则：
   - ✅ Required reviewers (必需审批者)
   - ✅ Wait timer (等待时间)
   - ✅ Deployment branches (仅特定分支)

### 第三步：启用代码覆盖率 (可选)

使用 Codecov 查看测试覆盖率：

1. 访问 https://codecov.io
2. 使用 GitHub 登录
3. 添加仓库
4. 将 `CODECOV_TOKEN` 添加到 GitHub Secrets

## 工作流详解

### CI Pipeline 流程图

```
┌─────────────────┐
│  Git Push/PR    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Checkout Code  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌──────┐  ┌──────┐
│ Lint │  │ Test │
└──┬───┘  └───┬──┘
   │          │
   └────┬─────┘
        │
        ▼
   ┌────────┐
   │ Build  │
   └───┬────┘
       │
       ▼
   ┌─────────┐
   │ Docker  │
   └───┬─────┘
       │
       ▼
   ┌──────────┐
   │ Security │
   └──────────┘
```

### 并行执行优化

工作流使用 `needs` 关键字控制依赖关系：

```yaml
jobs:
  lint:
    # 独立运行
    
  test:
    # 独立运行（多版本并行）
    
  build:
    needs: [lint, test]  # 等待 lint 和 test 完成
    
  docker-build:
    needs: [build]       # 等待 build 完成
```

### 缓存策略

使用 GitHub Actions 缓存加速构建：

```yaml
# Node.js 依赖缓存
- uses: actions/setup-node@v4
  with:
    cache: 'npm'  # 自动缓存 node_modules

# Docker 层缓存
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

## 最佳实践

### 1. 分支策略

推荐使用 Git Flow：

```
main (生产)
  ↑
develop (开发)
  ↑
feature/* (功能分支)
```

**工作流程**：
1. 从 `develop` 创建 `feature/xxx` 分支
2. 开发完成后，PR 到 `develop`
3. CI 自动运行测试和检查
4. Code Review 后合并
5. 定期从 `develop` 合并到 `main`
6. 在 `main` 上打标签发布

### 2. 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```bash
# 功能
git commit -m "feat: 添加提议过滤功能"

# 修复
git commit -m "fix: 修复 diff 应用错误"

# 文档
git commit -m "docs: 更新 API 文档"

# 重构
git commit -m "refactor: 优化提议服务代码结构"

# 测试
git commit -m "test: 添加决策服务单元测试"

# 构建
git commit -m "chore: 更新依赖版本"
```

### 3. Pull Request 流程

创建 PR 时的检查清单：

- [ ] 代码通过 Lint 检查
- [ ] 所有测试通过
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] PR 描述清晰
- [ ] 链接了相关 Issue
- [ ] 截图（如果是 UI 改动）

### 4. 版本发布流程

```bash
# 1. 确保在 main 分支
git checkout main
git pull origin main

# 2. 更新版本号
# 编辑 package.json 中的 version 字段

# 3. 创建变更日志
# 编辑 CHANGELOG.md

# 4. 提交更改
git add .
git commit -m "chore: bump version to 1.0.0"

# 5. 创建标签
git tag -a v1.0.0 -m "Release version 1.0.0"

# 6. 推送
git push origin main
git push origin v1.0.0
```

### 5. 回滚策略

如果部署出现问题：

```bash
# 方法 1: 回滚到之前的标签
git checkout v0.9.0
git tag -a v0.9.1 -m "Rollback to v0.9.0"
git push origin v0.9.1

# 方法 2: 使用 Docker 镜像回滚
docker pull username/openskills-api:0.9.0
docker-compose up -d

# 方法 3: Kubernetes 回滚
kubectl rollout undo deployment/openskills-api -n openskills
```

## 故障排查

### 常见错误

#### 1. Lint 失败

**错误信息**：
```
Error: ESLint found 5 errors
```

**解决方案**：
```bash
# 本地运行 lint
npm run lint -w packages/api
npm run lint -w packages/web

# 自动修复
npm run lint -- --fix -w packages/api
```

#### 2. 测试失败

**错误信息**：
```
FAIL packages/api/src/__tests__/proposals.test.ts
```

**解决方案**：
```bash
# 本地运行测试
npm test

# 运行特定测试
npm test -- proposals.test.ts

# 更新快照
npm test -- -u
```

#### 3. Docker 构建失败

**错误信息**：
```
Error: failed to solve: process "/bin/sh -c npm ci" did not complete successfully
```

**解决方案**：
- 检查 Dockerfile 中的路径
- 确保 .dockerignore 正确配置
- 本地测试构建：
  ```bash
  docker build -f docker/Dockerfile.api -t test .
  ```

#### 4. 部署失败

**错误信息**：
```
Error: Health check failed
```

**解决方案**：
- 检查服务器日志
- 验证环境变量配置
- 手动测试健康检查端点：
  ```bash
  curl http://your-server:<API_PORT>/health
  ```

### 查看日志

```bash
# GitHub Actions 日志
# 在浏览器中查看 Actions 页面

# Docker 日志
docker-compose logs -f api
docker-compose logs -f web

# 服务器日志
ssh user@server
journalctl -u openskills-api -f
```

### 调试 GitHub Actions

在工作流中添加调试步骤：

```yaml
- name: Debug
  run: |
    echo "Node version: $(node --version)"
    echo "NPM version: $(npm --version)"
    echo "Working directory: $(pwd)"
    ls -la
```

启用调试日志：
1. 在仓库 Settings → Secrets 中添加：
   - `ACTIONS_STEP_DEBUG` = `true`
   - `ACTIONS_RUNNER_DEBUG` = `true`

## 监控和通知

### 配置通知

#### Slack 通知 (可选)

在工作流中添加：

```yaml
- name: Slack Notification
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
    payload: |
      {
        "text": "部署状态: ${{ job.status }}"
      }
```

#### Email 通知

GitHub 默认会在工作流失败时发送邮件通知到：
- 提交者
- PR 作者
- 仓库 watch 者

可在个人 Settings → Notifications 中配置。

### 状态徽章

在 README.md 中添加状态徽章：

```markdown
![CI](https://github.com/username/openskills/workflows/CI/badge.svg)
![Release](https://github.com/username/openskills/workflows/Release/badge.svg)
```

## 进阶配置

### 自定义构建矩阵

测试多个环境组合：

```yaml
strategy:
  matrix:
    node-version: [18, 20]
    os: [ubuntu-latest, windows-latest, macos-latest]
```

### 条件执行

根据条件执行步骤：

```yaml
- name: Deploy to production
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: npm run deploy
```

### 复用工作流

创建可复用的工作流：

```yaml
# .github/workflows/reusable-test.yml
name: Reusable Test
on:
  workflow_call:
    inputs:
      node-version:
        required: true
        type: string
```

## 相关资源

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Docker 最佳实践](https://docs.docker.com/develop/dev-best-practices/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)

## 获取帮助

遇到问题？
1. 查看 [GitHub Discussions](https://github.com/username/openskills/discussions)
2. 提交 [Issue](https://github.com/username/openskills/issues)
3. 查阅 Actions 日志获取详细错误信息

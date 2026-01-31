# CI/CD 配置总结

本文档总结了为 OpenSkills 项目创建的完整 CI/CD 配置。

## 📁 创建的文件

### GitHub Actions 工作流

| 文件路径 | 用途 | 触发条件 |
|---------|------|---------|
| `.github/workflows/ci.yml` | 持续集成 | Push/PR 到 main/develop |
| `.github/workflows/release.yml` | 版本发布 | 推送版本标签 (v*.*.*) |
| `.github/workflows/deploy.yml` | 部署流程 | 手动触发 |

### Docker 配置

| 文件路径 | 用途 |
|---------|------|
| `docker/Dockerfile.api` | API 生产镜像 |
| `docker/Dockerfile.web` | Web 生产镜像 |
| `docker/Dockerfile.dev.api` | API 开发镜像 |
| `docker/Dockerfile.dev.web` | Web 开发镜像 |
| `docker/nginx.conf` | Nginx 配置 |
| `docker-compose.yml` | 生产环境编排 |
| `docker-compose.dev.yml` | 开发环境编排 |
| `.dockerignore` | Docker 忽略文件 |

### 文档

| 文件路径 | 内容 |
|---------|------|
| `docs/DEPLOYMENT.md` | 完整部署指南 |
| `docs/CI_CD_GUIDE.md` | CI/CD 使用指南 |
| `docs/QUICK_START.md` | 快速入门指南 |

### 配置文件

| 文件路径 | 用途 |
|---------|------|
| `.env.example` | 环境变量模板 |
| `Makefile` | 常用命令快捷方式 |

## 🚀 功能特性

### 1. 持续集成 (CI)

#### 代码质量
- ✅ ESLint 代码检查
- ✅ TypeScript 类型检查
- ✅ 代码格式验证

#### 自动化测试
- ✅ 单元测试 (Jest)
- ✅ 集成测试
- ✅ 多 Node.js 版本测试 (18, 20)
- ✅ 测试覆盖率报告
- ✅ Codecov 集成

#### 构建验证
- ✅ API 构建检查
- ✅ Web 构建检查
- ✅ 构建产物上传

#### 安全扫描
- ✅ npm audit 依赖检查
- ✅ Trivy 漏洞扫描
- ✅ 安全报告上传

### 2. Docker 化

#### 生产镜像
- ✅ 多阶段构建优化
- ✅ Alpine Linux 基础镜像
- ✅ 非 root 用户运行
- ✅ 健康检查配置
- ✅ 信号处理 (dumb-init)

#### 开发环境
- ✅ 热重载支持
- ✅ 源码挂载
- ✅ 开发工具集成

#### 编排
- ✅ Docker Compose 配置
- ✅ 网络隔离
- ✅ 卷持久化
- ✅ 依赖管理

### 3. 自动化部署

#### 环境支持
- ✅ Staging 环境
- ✅ Production 环境
- ✅ 手动触发部署
- ✅ 版本选择

#### 部署流程
- ✅ 自动化测试验证
- ✅ 构建产物打包
- ✅ SSH 部署支持
- ✅ 健康检查
- ✅ 部署通知

#### 回滚机制
- ✅ 版本备份
- ✅ 快速回滚
- ✅ Docker 镜像版本管理

### 4. 版本发布

#### 自动化流程
- ✅ 变更日志生成
- ✅ GitHub Release 创建
- ✅ npm 包发布
- ✅ Docker 镜像发布
- ✅ 语义化版本

## 📊 CI/CD 流程图

### 完整流程

```
┌─────────────────────────────────────────────────────────┐
│                    代码提交                               │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  CI Pipeline                             │
├─────────────────────────────────────────────────────────┤
│  1. Lint 检查                                            │
│  2. 单元测试 + 集成测试 (Node 18/20)                      │
│  3. 构建验证 (API + Web)                                  │
│  4. Docker 镜像构建                                       │
│  5. 安全扫描 (npm audit + Trivy)                         │
└───────────────────────┬─────────────────────────────────┘
                        │
                    通过? ──No──> ❌ 失败通知
                        │
                      Yes
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Push Tag (v*.*.*)                          │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                Release Pipeline                          │
├─────────────────────────────────────────────────────────┤
│  1. 运行完整测试                                          │
│  2. 构建所有包                                            │
│  3. 创建发布包 (.tgz)                                     │
│  4. 生成变更日志                                          │
│  5. 创建 GitHub Release                                   │
│  6. 发布 Docker 镜像                                      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              手动触发部署                                 │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Deploy Pipeline                             │
├─────────────────────────────────────────────────────────┤
│  1. 运行测试                                              │
│  2. 构建项目                                              │
│  3. 部署到服务器                                          │
│  4. 健康检查                                              │
│  5. 发送通知                                              │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
                  ✅ 部署完成
```

### 分支策略

```
main (生产)
  │
  ├─ v1.0.0 (tag) ──> Release Pipeline
  │
  ├─ PR ──> CI Pipeline ──> Merge
  │
develop (开发)
  │
  ├─ PR ──> CI Pipeline ──> Merge
  │
feature/xxx (功能分支)
  │
  └─ PR ──> CI Pipeline
```

## 🔧 配置要求

### GitHub Secrets

需要在 GitHub 仓库设置中配置以下 Secrets：

#### 必需（用于 Release）
- `DOCKER_USERNAME` - Docker Hub 用户名
- `DOCKER_PASSWORD` - Docker Hub 密码

#### 可选（用于部署）
- `SSH_PRIVATE_KEY` - SSH 私钥
- `SERVER_HOST` - 服务器地址
- `SERVER_USER` - SSH 用户名
- `STAGING_API_URL` - Staging 环境 API 地址
- `PRODUCTION_API_URL` - Production 环境 API 地址

#### 可选（用于代码覆盖率）
- `CODECOV_TOKEN` - Codecov Token

### 环境变量

本地开发和部署需要配置 `.env` 文件：

```env
# API 配置
NODE_ENV=production
PORT=3000

# GitHub Token (用于爬虫)
GITHUB_TOKEN=your_token

# 其他配置...
```

详见 `.env.example` 文件。

## 📖 使用指南

### 开发工作流

```bash
# 1. 克隆项目
git clone https://github.com/your-org/openskills.git
cd openskills

# 2. 安装依赖
make install

# 3. 启动开发环境
make dev
# 或使用 Docker
make docker-dev

# 4. 开发功能
# 编辑代码...

# 5. 运行测试
make test

# 6. 提交代码
git add .
git commit -m "feat: 新功能"
git push

# 7. 创建 PR
# GitHub 自动运行 CI
```

### 发布流程

```bash
# 1. 更新版本号
# 编辑 package.json 中的 version

# 2. 更新变更日志
# 编辑 CHANGELOG.md

# 3. 提交并打标签
make release
# 输入版本号: 1.0.0

# 4. GitHub Actions 自动发布
# - 创建 GitHub Release
# - 发布 Docker 镜像
```

### 部署流程

```bash
# 方式 1: 使用 GitHub Actions（推荐）
# 1. 访问 GitHub Actions 页面
# 2. 选择 "Deploy" 工作流
# 3. 点击 "Run workflow"
# 4. 选择环境和版本
# 5. 确认执行

# 方式 2: 手动部署
make deploy-prod
```

### Docker 部署

```bash
# 本地测试
make docker-build
make docker-up

# 查看日志
make docker-logs

# 停止服务
make docker-down
```

## 🎯 最佳实践

### 代码提交
- ✅ 使用 Conventional Commits 规范
- ✅ 每次提交保持原子性
- ✅ 写清晰的提交信息

### Pull Request
- ✅ PR 描述清晰
- ✅ 关联相关 Issue
- ✅ 等待 CI 通过后再合并
- ✅ 请求 Code Review

### 版本管理
- ✅ 遵循语义化版本
- ✅ 主要变更更新大版本
- ✅ 新功能更新小版本
- ✅ Bug 修复更新补丁版本

### 部署策略
- ✅ 先部署到 Staging 测试
- ✅ 验证通过后部署到 Production
- ✅ 保持 Docker 镜像版本标签
- ✅ 准备回滚计划

## 📊 性能指标

### CI 执行时间

| 阶段 | 预估时间 |
|------|---------|
| Lint | ~30s |
| Test (Node 18) | ~1-2min |
| Test (Node 20) | ~1-2min |
| Build | ~1-2min |
| Docker Build | ~3-5min |
| Security Scan | ~1min |
| **总计** | **~5-10min** |

### 优化建议

1. **缓存优化**
   - ✅ npm 依赖缓存
   - ✅ Docker 层缓存
   - ✅ GitHub Actions 缓存

2. **并行执行**
   - ✅ Lint 和 Test 并行
   - ✅ 多版本测试矩阵
   - ✅ 独立 Job 并行

3. **失败快速**
   - ✅ Lint 失败立即停止
   - ✅ 测试失败跳过构建
   - ✅ 安全扫描不阻塞

## 🔐 安全特性

### 镜像安全
- ✅ 多阶段构建
- ✅ 最小化基础镜像
- ✅ 非 root 用户
- ✅ 漏洞扫描

### 依赖安全
- ✅ npm audit 检查
- ✅ Trivy 扫描
- ✅ 依赖版本锁定
- ✅ 定期更新

### 部署安全
- ✅ Secrets 管理
- ✅ 环境隔离
- ✅ HTTPS 支持
- ✅ 安全响应头

## 📈 监控和日志

### 集成建议

推荐集成以下工具：

1. **日志聚合**
   - ELK Stack (Elasticsearch, Logstash, Kibana)
   - Loki + Grafana

2. **指标监控**
   - Prometheus + Grafana
   - Datadog
   - New Relic

3. **错误追踪**
   - Sentry
   - Rollbar

4. **APM**
   - New Relic
   - Datadog APM

## 🚀 下一步计划

### 短期目标
- [ ] 添加 E2E 测试
- [ ] 集成性能测试
- [ ] 添加 PR 自动评论
- [ ] 实施自动化依赖更新

### 长期目标
- [ ] Kubernetes 部署配置
- [ ] 蓝绿部署
- [ ] 金丝雀发布
- [ ] 多区域部署

## 📚 相关文档

- [快速入门](./docs/QUICK_START.md)
- [部署指南](./docs/DEPLOYMENT.md)
- [CI/CD 指南](./docs/CI_CD_GUIDE.md)
- [README](./README.md)

## 🆘 故障排查

### CI 失败
1. 查看 GitHub Actions 日志
2. 本地复现问题
3. 检查依赖版本
4. 验证测试用例

### 部署失败
1. 检查服务器连接
2. 验证环境变量
3. 查看容器日志
4. 检查磁盘空间

### Docker 问题
1. 清理缓存：`docker system prune -a`
2. 重新构建：`docker-compose build --no-cache`
3. 检查日志：`docker-compose logs -f`

## 💡 贡献指南

欢迎提交 PR 改进 CI/CD 配置！

1. Fork 项目
2. 创建功能分支
3. 提交改动
4. 创建 Pull Request
5. 等待 Review

## 📝 变更日志

### 2026-01-24
- ✅ 创建完整 CI/CD 配置
- ✅ 添加 Docker 支持
- ✅ 编写配置文档
- ✅ 添加 Makefile 快捷命令
- ✅ 集成安全扫描
- ✅ 优化构建流程

## 📄 License

MIT

---

**创建日期**: 2026-01-24  
**最后更新**: 2026-01-24  
**作者**: OpenSkills 集成专家

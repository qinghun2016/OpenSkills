# OpenSkills 部署指南

本文档详细说明 OpenSkills 项目的部署流程和最佳实践。

> **说明**：项目已移除 Docker/K8s 目录与 compose 文件，以下文档中的 Docker/Kubernetes 小节仅作历史参考。当前推荐使用**插件自动启动**或 **npm 本地/服务器运行**（见 README、START_HERE、QUICK_START）。

## 目录

- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [Docker 部署](#docker-部署)
- [Kubernetes 部署](#kubernetes-部署)
- [CI/CD 配置](#cicd-配置)
- [监控和日志](#监控和日志)
- [故障排查](#故障排查)

## 快速开始

### 本地开发部署

```bash
# 使用 Docker Compose 启动开发环境
docker-compose -f docker-compose.dev.yml up

# 或者直接运行
npm install
npm run dev
```

访问：
- Web 端口由 `VITE_PORT` 或部署配置决定，默认 3848
- API 服务端口由环境变量 `PORT` 决定（未设置时见 packages/api 默认值）

### 生产环境部署

```bash
# 使用 Docker Compose 启动生产环境
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

访问：
- Web 界面: http://localhost
- API 服务端口由部署配置（如 `PORT`）决定

## 环境配置

### 环境变量

创建 `.env` 文件（基于 `.env.example`）：

```env
# API 配置（PORT 为 API 端口，可与插件默认 3847 一致）
NODE_ENV=production
PORT=3847
API_BASE_URL=http://localhost:3847

# Web 配置
VITE_API_URL=http://localhost:3847

# GitHub Token (用于爬虫功能)
GITHUB_TOKEN=your_github_token_here

# 数据库配置 (如果使用)
# DATABASE_URL=postgresql://user:password@localhost:5432/openskills

# 日志配置
LOG_LEVEL=info

# 安全配置（按实际 Web 端口配置，默认 3848）
CORS_ORIGIN=http://localhost:3848
```

### OpenSkills 配置

编辑 `.openskills/config.json`:

```json
{
  "adminMode": "agent_then_human",
  "skillsAdminSkillRef": "skills-admin",
  "proposalValidity": {
    "retentionDays": 90
  },
  "crawl": {
    "enabled": false,
    "schedule": "0 2 * * *",
    "minStars": 100,
    "topics": ["cursor-skills"],
    "githubToken": ""
  },
  "wake": {
    "enabled": true,
    "schedule": "0 */4 * * *",
    "reminderPrompt": "检查 pending proposals 并继续审查"
  },
  "handoff": {
    "maxContextTokens": 50000,
    "compressWhenAbove": 40000
  }
}
```

## Docker 部署

### 单个服务部署

#### API 服务

```bash
# 构建镜像
docker build -f docker/Dockerfile.api -t openskills/api:latest .

# 运行容器
docker run -d \
  --name openskills-api \
  -p 3000:3000 \
  -v $(pwd)/.openskills:/app/.openskills \
  -v $(pwd)/.cursor:/app/.cursor \
  -e NODE_ENV=production \
  openskills/api:latest

# 查看日志
docker logs -f openskills-api
```

#### Web 服务

```bash
# 构建镜像
docker build -f docker/Dockerfile.web -t openskills/web:latest .

# 运行容器
docker run -d \
  --name openskills-web \
  -p 80:80 \
  --link openskills-api:api \
  openskills/web:latest

# 查看日志
docker logs -f openskills-web
```

### Docker Compose 部署

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止并删除容器
docker-compose down

# 停止并删除容器及卷
docker-compose down -v
```

### 更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新构建并启动
docker-compose up -d --build

# 或者分步执行
docker-compose build
docker-compose up -d
```

## Kubernetes 部署

### 创建命名空间

```bash
kubectl create namespace openskills
```

### 部署配置

创建 `k8s/deployment.yml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: openskills

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: openskills-config
  namespace: openskills
data:
  NODE_ENV: "production"
  PORT: "3000"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openskills-api
  namespace: openskills
spec:
  replicas: 2
  selector:
    matchLabels:
      app: openskills-api
  template:
    metadata:
      labels:
        app: openskills-api
    spec:
      containers:
      - name: api
        image: openskills/api:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: openskills-config
        volumeMounts:
        - name: openskills-data
          mountPath: /app/.openskills
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
      volumes:
      - name: openskills-data
        persistentVolumeClaim:
          claimName: openskills-pvc

---
apiVersion: v1
kind: Service
metadata:
  name: openskills-api
  namespace: openskills
spec:
  selector:
    app: openskills-api
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openskills-web
  namespace: openskills
spec:
  replicas: 2
  selector:
    matchLabels:
      app: openskills-web
  template:
    metadata:
      labels:
        app: openskills-web
    spec:
      containers:
      - name: web
        image: openskills/web:latest
        ports:
        - containerPort: 80
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 3
          periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: openskills-web
  namespace: openskills
spec:
  selector:
    app: openskills-web
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
```

### 部署到 Kubernetes

```bash
# 应用配置
kubectl apply -f k8s/deployment.yml

# 查看部署状态
kubectl get pods -n openskills
kubectl get services -n openskills

# 查看日志
kubectl logs -f deployment/openskills-api -n openskills
kubectl logs -f deployment/openskills-web -n openskills

# 扩展副本
kubectl scale deployment openskills-api --replicas=3 -n openskills

# 删除部署
kubectl delete -f k8s/deployment.yml
```

## CI/CD 配置

### GitHub Actions

项目已配置三个主要工作流：

1. **CI 工作流** (`.github/workflows/ci.yml`)
   - 代码 Lint 检查
   - 单元测试和集成测试
   - 构建验证
   - Docker 镜像构建
   - 安全扫描

2. **Release 工作流** (`.github/workflows/release.yml`)
   - 创建 GitHub Release
   - 发布 Docker 镜像
   - 生成变更日志

3. **Deploy 工作流** (`.github/workflows/deploy.yml`)
   - 手动触发部署
   - 支持 staging 和 production 环境
   - 健康检查
   - 部署通知

### 配置 Secrets

在 GitHub 仓库设置中添加以下 Secrets：

```
# Docker Hub
DOCKER_USERNAME=your_dockerhub_username
DOCKER_PASSWORD=your_dockerhub_password

# SSH 部署 (如果使用)
SSH_PRIVATE_KEY=your_ssh_private_key
SERVER_HOST=your_server_host
SERVER_USER=your_server_user

# 环境 URL
STAGING_API_URL=https://staging-api.example.com
PRODUCTION_API_URL=https://api.example.com
```

### 发布新版本

```bash
# 创建并推送标签
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# 这会自动触发 Release 工作流
```

### 手动部署

在 GitHub Actions 页面：
1. 选择 "Deploy" 工作流
2. 点击 "Run workflow"
3. 选择环境 (staging/production)
4. 输入版本号（可选）
5. 点击运行

## 监控和日志

### Docker 日志

```bash
# 查看所有服务日志
docker-compose logs

# 查看特定服务日志
docker-compose logs api
docker-compose logs web

# 实时跟踪日志
docker-compose logs -f

# 查看最近 100 行
docker-compose logs --tail=100
```

### Kubernetes 日志

```bash
# 查看 Pod 日志
kubectl logs -f pod/openskills-api-xxx -n openskills

# 查看前一个容器的日志（崩溃时有用）
kubectl logs pod/openskills-api-xxx -n openskills --previous

# 查看所有 API Pod 的日志
kubectl logs -l app=openskills-api -n openskills
```

### 健康检查端点

- **API 健康检查**: `GET /health`
  ```bash
  curl http://localhost:3000/health
  ```

- **Web 健康检查**: `GET /`
  ```bash
  curl http://localhost/
  ```

### 性能监控

建议集成以下监控工具：

- **Prometheus + Grafana**: 指标收集和可视化
- **ELK Stack**: 日志聚合和分析
- **Sentry**: 错误追踪
- **Datadog/New Relic**: APM 监控

## 故障排查

### 常见问题

#### 1. 容器无法启动

```bash
# 查看容器日志
docker logs openskills-api

# 检查容器状态
docker inspect openskills-api

# 重启容器
docker restart openskills-api
```

#### 2. 端口冲突

```bash
# 查看端口占用
# Windows
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3000

# 修改 docker-compose.yml 中的端口映射
ports:
  - "3001:3000"  # 修改主机端口
```

#### 3. 数据持久化问题

```bash
# 检查挂载卷
docker volume ls
docker volume inspect openskills_openskills-data

# 备份数据
docker run --rm -v openskills_openskills-data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz /data
```

#### 4. API 无法连接

```bash
# 检查网络
docker network ls
docker network inspect openskills_openskills-network

# 测试 API 连接
curl http://localhost:3000/api/proposals
```

#### 5. 构建失败

```bash
# 清理 Docker 缓存
docker system prune -a

# 重新构建
docker-compose build --no-cache
```

### 回滚部署

```bash
# Docker 回滚到之前的镜像
docker tag openskills/api:previous openskills/api:latest
docker-compose up -d

# Kubernetes 回滚
kubectl rollout undo deployment/openskills-api -n openskills
kubectl rollout status deployment/openskills-api -n openskills
```

### 数据库备份和恢复

```bash
# 备份 .openskills 目录
tar -czf openskills-backup-$(date +%Y%m%d).tar.gz .openskills .cursor

# 恢复
tar -xzf openskills-backup-20260124.tar.gz
```

## 性能优化

### Docker 镜像优化

- ✅ 使用多阶段构建减小镜像大小
- ✅ 使用 Alpine 基础镜像
- ✅ 只安装生产依赖
- ✅ 使用 .dockerignore 排除不必要的文件

### 应用性能优化

- 启用 Gzip 压缩（已在 nginx.conf 中配置）
- 使用 CDN 加速静态资源
- 启用 HTTP/2
- 实施缓存策略
- 数据库连接池
- 负载均衡

## 安全最佳实践

- ✅ 使用非 root 用户运行容器
- ✅ 扫描镜像漏洞（已集成 Trivy）
- ✅ 定期更新依赖
- ✅ 使用环境变量管理敏感信息
- ✅ 实施网络隔离
- ✅ 添加安全响应头
- 启用 HTTPS（推荐使用 Let's Encrypt）
- 实施访问控制和认证
- 定期备份数据

## 扩展阅读

- [Docker 最佳实践](https://docs.docker.com/develop/dev-best-practices/)
- [Kubernetes 生产最佳实践](https://kubernetes.io/docs/setup/best-practices/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Nginx 配置指南](https://nginx.org/en/docs/)

## 获取帮助

如有部署相关问题：
1. 查看 [GitHub Issues](https://github.com/your-org/openskills/issues)
2. 查阅项目文档
3. 提交新的 Issue 并附上错误日志

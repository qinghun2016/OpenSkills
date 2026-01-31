# CI/CD 配置总结

## 工作流文件

| 文件 | 触发 | 用途 |
|------|------|------|
| `ci.yml` | Push/PR 到 main/develop | Lint、测试、构建、安全扫描 |
| `release.yml` | 推送标签 v*.*.* | 创建 GitHub Release 和 npm 包 |
| `deploy.yml` | 手动 | 部署到 staging/production |

## 功能

- **CI**：ESLint、Jest 测试、多 Node 版本、构建验证、npm audit、Trivy 扫描
- **Release**：测试 → 构建 → 生成 npm 包 → 创建 GitHub Release
- **Deploy**：npm 构建 → 打包 → SSH 部署 → 健康检查

## 配置

- **Secrets**：`SSH_PRIVATE_KEY`、`SERVER_HOST`、`SERVER_USER`、`STAGING_API_URL`、`PRODUCTION_API_URL`
- **Environments**：`staging`、`production`（可选）

详见 [CI_CD_GUIDE.md](./CI_CD_GUIDE.md)。

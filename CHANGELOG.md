# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 完整的 CI/CD 流程配置
- Docker 容器化支持
- GitHub Actions 工作流
- 部署文档和指南
- Makefile 快捷命令
- 健康检查端点增强

### Changed
- 优化 API 健康检查响应信息

### Fixed
- (待添加)

### Security
- 集成 npm audit 和 Trivy 安全扫描

## [0.1.0] - 2026-01-24

### Added
- 初始项目结构
- OpenSkills 核心功能
  - Proposals 管理
  - Decisions 审查
  - History 历史记录
  - Crawler GitHub 爬虫
  - Scheduler 定时任务
- React Web 界面
- REST API 服务
- VS Code 扩展
- 自进化机制
- 完整的测试套件

### Documentation
- README 文档
- API 端点文档
- 配置说明
- 故障排查指南

---

## 如何维护变更日志

### 版本号规则（语义化版本）

- **主版本号 (Major)**: 不兼容的 API 修改
- **次版本号 (Minor)**: 向下兼容的功能性新增
- **修订号 (Patch)**: 向下兼容的问题修正

### 变更类型

- **Added**: 新功能
- **Changed**: 现有功能的变更
- **Deprecated**: 即将移除的功能
- **Removed**: 已移除的功能
- **Fixed**: Bug 修复
- **Security**: 安全性修复

### 示例

```markdown
## [1.2.3] - 2026-02-01

### Added
- 新增用户认证功能
- 支持 OAuth 登录

### Changed
- 优化 Proposal 列表性能
- 更新依赖版本

### Fixed
- 修复 Diff 应用失败的问题
- 修复 Web 界面主题切换 bug

### Security
- 修复 XSS 漏洞
```

### 发布流程

1. 更新 CHANGELOG.md
2. 更新 package.json 版本号
3. 提交更改: `git commit -m "chore: bump version to x.y.z"`
4. 创建标签: `git tag -a vx.y.z -m "Release version x.y.z"`
5. 推送: `git push origin main && git push origin vx.y.z`
6. GitHub Actions 自动创建 Release

[Unreleased]: https://github.com/your-org/openskills/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/openskills/releases/tag/v0.1.0

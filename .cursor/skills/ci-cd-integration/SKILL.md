---
name: ci-cd-integration
description: CI/CD integration — GitHub Actions, GitLab CI, Jenkins pipelines and best practices (CI/CD 集成技能)
triggers:
  - "CI/CD"
  - "流水线"
  - "GitHub Actions"
  - "持续集成"
---

# CI/CD Integration

Complete CI/CD configuration and best practices.
<!-- 完整的 CI/CD 配置和最佳实践。 -->

## Use cases
<!-- 使用场景 -->

Use this skill when you need to:
- Create CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins)
- Automate test and build
- Set up deployment workflows
- Configure environment variables
- Automate releases
- Set code quality gates
- Configure notifications

## CI/CD platforms
<!-- CI/CD 平台 -->

- **GitHub Actions**: Popular, free for public repos
- **GitLab CI**: Integrates with GitLab
- **Jenkins**: Self-hosted, highly customizable
- **CircleCI**: Cloud-native, fast
- **Travis CI**: Simple config

## GitHub Actions
<!-- GitHub Actions -->

### Workflow config
- Automated test
- Code quality checks
- Docker image build
- Automated deploy

### Example config

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

## Pipeline stages
<!-- 流水线阶段 -->

1. **Lint**: Code style and quality
2. **Test**: Unit and integration tests
3. **Build**: Compile and package
4. **Security Scan**: Vulnerability scan
5. **Deploy**: Deploy to staging/production

## Docker deploy
<!-- Docker 部署 -->

- Multi-stage build
- Image optimization
- Health checks
- Rolling updates

## Best practices
<!-- 最佳实践 -->

- Fail fast: run quick checks first
- Use matrix build for multiple versions
- Cache dependencies to speed up build
- Run tests in parallel
- Use semantic versioning for releases
- Implement rollback strategy
- Monitor pipeline health
- Keep pipelines simple and maintainable

## Resources
<!-- 相关文件 -->

- GitHub Actions docs: https://docs.github.com/actions
- Project CI config: see .github/workflows/ in the repo

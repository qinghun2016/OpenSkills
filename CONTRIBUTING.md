# 贡献指南

感谢你对 OpenSkills 项目的关注！我们欢迎各种形式的贡献，包括但不限于：

- 🐛 报告 Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 提交代码修复或新功能
- ✅ 编写测试用例
- 🌐 翻译文档

## 目录

- [开发环境搭建](#开发环境搭建)
- [分支规范](#分支规范)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)
- [测试要求](#测试要求)
- [文档编写](#文档编写)

---

## 开发环境搭建

### 前置要求

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **Git**: 最新版本

### 克隆项目

```bash
git clone https://github.com/your-org/openskills.git
cd openskills
```

### 安装依赖

```bash
npm install
```

### 启动开发服务

```bash
# 启动 API 服务
npm run dev:api

# 启动 Web 界面
npm run dev:web

# 同时启动 API 和 Web
npm run dev
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- proposals.test.ts

# 监听模式
npm test -- --watch

# 运行性能测试（可选）
RUN_PERF_TESTS=1 npm test -- performance.test.ts
```

---

## 分支规范

### 主分支

- **`main`**: 生产分支，始终保持稳定可发布状态
- **`develop`**: 开发分支，包含最新的开发进度

### 功能分支命名

从 `develop` 分支创建功能分支，命名规范：

- `feature/描述`: 新功能开发
  - 示例: `feature/add-rollback-ui`
- `fix/描述`: Bug 修复
  - 示例: `fix/proposal-validation-error`
- `docs/描述`: 文档更新
  - 示例: `docs/update-api-reference`
- `refactor/描述`: 代码重构
  - 示例: `refactor/extract-common-utils`
- `test/描述`: 测试相关
  - 示例: `test/add-integration-tests`
- `chore/描述`: 构建、工具、依赖更新等
  - 示例: `chore/upgrade-dependencies`

### 创建分支示例

```bash
# 确保本地 develop 分支是最新的
git checkout develop
git pull origin develop

# 创建并切换到新分支
git checkout -b feature/my-new-feature
```

---

## 代码规范

### TypeScript 规范

- **类型安全**: 避免使用 `any`，尽量使用具体类型
- **接口优先**: 定义数据结构时优先使用 `interface`
- **命名规范**:
  - 变量、函数: `camelCase`
  - 类、接口、类型: `PascalCase`
  - 常量: `UPPER_SNAKE_CASE`
  - 私有成员: 前缀 `_` (可选)

### 代码风格

- **缩进**: 2 个空格
- **引号**: 单引号 `'`
- **分号**: 总是使用分号
- **行宽**: 最大 100 字符（可适当放宽）
- **换行**: 在逻辑块之间添加空行

### 注释规范

```typescript
/**
 * 函数说明（简短描述）
 * 
 * @param id - 参数说明
 * @returns 返回值说明
 */
export async function getProposal(id: string): Promise<ApiResponse<Proposal>> {
  // 实现逻辑...
}
```

### ESLint

项目已配置 ESLint，提交前请确保通过检查：

```bash
npm run lint
```

---

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

### 提交消息格式

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Type 类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整（不影响功能）
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建、工具、依赖等
- `perf`: 性能优化
- `ci`: CI/CD 配置

### Scope 范围（可选）

- `api`: API 服务
- `web`: Web 前端
- `extension`: VS Code 扩展
- `docs`: 文档
- `test`: 测试

### 提交示例

```bash
# 新功能
git commit -m "feat(api): add rollback endpoint for history"

# Bug 修复
git commit -m "fix(web): resolve proposal list rendering issue"

# 文档更新
git commit -m "docs: update installation guide"

# 多行提交消息
git commit -m "feat(api): implement concurrent decision handling

- Add mutex lock for file operations
- Improve error handling for race conditions
- Add integration tests for concurrent scenarios

Closes #123"
```

---

## Pull Request 流程

### 1. 准备工作

- 确保代码通过所有测试: `npm test`
- 确保代码通过 lint 检查: `npm run lint`
- 更新相关文档（如有必要）
- 添加或更新测试用例

### 2. 提交 PR

1. Push 你的分支到远程仓库

```bash
git push -u origin feature/my-new-feature
```

2. 在 GitHub 上创建 Pull Request
   - 目标分支: `develop`（不是 `main`）
   - 填写 PR 模板（如有）
   - 关联相关 Issue（使用 `Closes #issue_number`）

### 3. PR 描述模板

```markdown
## 变更说明

简要描述这个 PR 做了什么。

## 变更类型

- [ ] 新功能 (feature)
- [ ] Bug 修复 (fix)
- [ ] 文档更新 (docs)
- [ ] 代码重构 (refactor)
- [ ] 性能优化 (perf)
- [ ] 测试 (test)
- [ ] 其他 (chore)

## 测试

描述如何测试这些变更：

- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动测试步骤：
  1. ...
  2. ...

## Checklist

- [ ] 代码遵循项目规范
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 所有测试通过
- [ ] Lint 检查通过
- [ ] PR 标题遵循 Conventional Commits

## 截图（如适用）

添加截图或 GIF 演示变更效果。

## 相关 Issue

Closes #123
```

### 4. Code Review

- 等待维护者 review
- 根据反馈进行修改
- 保持沟通，及时响应评论

### 5. 合并

- PR 被批准后，维护者会合并到 `develop` 分支
- 定期从 `develop` 合并到 `main` 进行发布

---

## 测试要求

### 测试覆盖率

- 核心功能应达到 **80%** 以上覆盖率
- 新功能必须包含测试
- Bug 修复应添加回归测试

### 测试类型

#### 单元测试

测试单个函数或模块：

```typescript
describe('createProposal', () => {
  it('should create proposal with valid input', async () => {
    const input = createProposalInput();
    const result = await proposalService.createProposal(input);
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
```

#### 集成测试

测试完整流程：

```typescript
describe('Proposal → Decision → Apply flow', () => {
  it('should complete full approval flow', async () => {
    // 创建 proposal
    const proposal = await createProposal(...);
    
    // 创建 decision
    const decision = await createDecision(...);
    
    // 应用 decision
    const result = await applyDecision(...);
    
    expect(result.success).toBe(true);
  });
});
```

### 运行测试

```bash
# 运行所有测试
npm test

# 查看覆盖率
npm test -- --coverage

# 监听模式（开发时）
npm test -- --watch
```

---

## 文档编写

### 文档类型

- **README.md**: 项目概述、快速开始
- **API 文档**: API 端点说明
- **SKILL 文档**: Skills 使用指南
- **注释**: 代码内联注释

### 文档规范

- 使用清晰、简洁的语言
- 提供代码示例
- 包含必要的截图或图表
- 保持文档与代码同步更新

### Markdown 规范

- 使用标准 Markdown 语法
- 标题层级清晰（从 `#` 到 `####`）
- 代码块标注语言类型
- 链接使用相对路径（项目内文档）

---

## 常见问题

### 如何同步上游更新？

```bash
# 添加上游远程仓库（首次）
git remote add upstream https://github.com/your-org/openskills.git

# 获取上游更新
git fetch upstream

# 合并到本地 develop
git checkout develop
git merge upstream/develop
```

### 如何解决合并冲突？

```bash
# 更新本地分支
git checkout develop
git pull origin develop

# 切换到功能分支并 rebase
git checkout feature/my-feature
git rebase develop

# 解决冲突后
git add .
git rebase --continue

# 强制推送（谨慎使用）
git push -f origin feature/my-feature
```

### 提交后发现错误怎么办？

```bash
# 修改最后一次提交
git commit --amend

# 修改后推送（如果已推送）
git push -f origin feature/my-feature
```

---

## 获取帮助

如有任何问题，欢迎：

- 提交 [GitHub Issue](https://github.com/your-org/openskills/issues)
- 参与 [GitHub Discussions](https://github.com/your-org/openskills/discussions)
- 查阅项目文档

---

## 行为准则

请遵守我们的 [行为准则](CODE_OF_CONDUCT.md)（如有），尊重所有贡献者。

---

## 许可证

通过贡献代码，你同意你的贡献将根据项目的 [MIT License](LICENSE) 进行许可。

---

**感谢你的贡献！** 🎉

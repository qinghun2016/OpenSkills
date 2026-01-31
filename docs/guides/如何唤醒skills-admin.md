# 如何唤醒 skills-admin

## 前置条件

**必须安装以下任一 Agent CLI 工具**：

| CLI 类型 | 安装方式 | 适用场景 |
|----------|----------|----------|
| **Cursor Agent CLI** | `curl https://cursor.com/install -fsSL \| bash` | Cursor 编辑器用户（默认） |
| **OpenCode** | `go install github.com/opencode-ai/opencode@latest` | VS Code + Go 开发者 |
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | VS Code + Claude 用户 |

## 配置 CLI 类型

在 VS Code / Cursor 设置中配置 `openskills.agentCliType`：
- `cursor`（默认）：使用 Cursor Agent CLI
- `opencode`：使用 OpenCode CLI
- `claude`：使用 Claude Code CLI

## 唤醒步骤

1. 运行命令 **OpenSkills: Trigger Wake**
2. 会打开名为「OpenSkills Wake」的终端
3. **首次使用**：根据 CLI 类型，可能需要登录认证
4. Agent 开始执行审查流程

## 验证

- 根据配置的 CLI 类型，终端会执行对应命令：
  - Cursor: `agent chat "审查建议..."`
  - OpenCode: `opencode "审查建议..."`
  - Claude: `claude "审查建议..."`
- Agent 会读取 `.openskills/proposals/` 下的 pending proposals 并审查

## VS Code 兼容说明

OpenSkills 完全支持在 VS Code 中使用：
- 若项目中没有 `.cursor` 目录，扩展会自动使用 `.vscode` 目录
- Skills 存放在 `.vscode/skills/` 下
- Rules 存放在 `.vscode/rules/` 下

## 常见问题

### Q: 触发后无反应？

1. 确认 Agent CLI 已安装：在终端运行 `agent --version`
2. 重启 Cursor 或重新加载窗口（`Ctrl+Shift+P` → `Developer: Reload Window`）
3. 检查扩展配置：`openskills.wakeUseAgentCli` 应为 `true`

### Q: 提示「Agent CLI 不可用」？

- 配置 **OpenSkills: Agent Cli Path**，填入 `agent` 的完整路径
- 或将 `agent` 所在目录加入系统 PATH，并重启 Cursor

### Q: 在浏览器中点击「手动唤醒」没有启动 Agent？

管理员页面的「手动唤醒」按钮仅在 **Cursor 扩展面板内**（侧边栏 OpenSkills）点击时才会执行 Trigger Wake。在独立浏览器中打开时不会启动 Agent。请使用命令 **OpenSkills: Trigger Wake** 或从扩展面板进入管理员页面后点击。

## 相关文档

- [用户操作手册](用户操作手册.md) — CLI 登录、权限与环境问题
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — 故障排除

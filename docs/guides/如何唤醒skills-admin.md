# 如何唤醒 skills-admin

## 前置条件

**必须安装 Cursor Agent CLI**。安装 Cursor 编辑器 ≠ 安装 Agent CLI，需单独安装。详见 [QUICK_START.md](../QUICK_START.md#1-安装-cursor-agent-cli)。

## 唤醒步骤

1. 运行命令 **OpenSkills: Trigger Wake**
2. 会打开名为「OpenSkills Wake」的终端
3. **首次使用**：若终端显示「Signing in」和链接，请点击该链接在浏览器中完成 Cursor CLI 登录（与编辑器登录分开，仅需一次）
4. Agent 开始执行审查流程

## 验证

- 终端中应执行 `agent chat "审查建议..."` 命令
- Agent 会读取 `.openskills/proposals/` 下的 pending proposals 并审查

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

# OpenSkills 快速参考

## 启动方式

**插件模式**（推荐）：打开已初始化的工作区，插件自动启动 API 与 Web。

**npm 模式**（开发）：
```bash
npm run dev
```
- API: http://localhost:3000（或 `PORT` 指定）
- Web: http://localhost:3848

## 常用命令

| 命令 | 功能 |
|------|------|
| OpenSkills: Initialize | 初始化项目 |
| OpenSkills: Open Web UI | 打开 Web 界面 |
| OpenSkills: Trigger Wake | 触发 Agent 审查（需 Agent CLI） |
| OpenSkills: Diagnose | 系统诊断 |
| OpenSkills: Health Check | 检查 skills-admin 状态 |
| OpenSkills: Auto Fix | 自动修复常见问题 |

## 扩展界面位置

- **侧边栏**：活动栏 OpenSkills 图标 → Skills / Proposals
- **状态栏**：左下角 `OpenSkills` 或 `X pending`，点击打开面板
- **输出**：查看 → 输出 → OpenSkills

## 关键配置

| 配置 | 默认 | 说明 |
|------|------|------|
| openSkills.apiPort | 3847 | API 端口 |
| openSkills.webPort | 3848 | Web 端口 |
| openSkills.wakeUseAgentCli | true | 唤醒时使用 Agent CLI |
| openSkills.wakeAgentPrompt | "" | 自定义唤醒 prompt |

## 诊断命令

| 命令 | 何时使用 |
|------|----------|
| OpenSkills: Health Check | skills-admin 无法识别时 |
| OpenSkills: Diagnose | 遇到问题时首先运行 |
| OpenSkills: Auto Fix | 配置或文件异常时 |

## 前置要求

- **Cursor Agent CLI**：必须安装，用于 Trigger Wake 等功能。详见 [QUICK_START](../QUICK_START.md)。

# OpenSkills 架构修复：真正「唤醒」 Cursor/VSCode Agent

## 一、问题根源

当前设计的**根本偏差**在于：

| 原设计假设 | 实际情况 |
|-----------|----------|
| 「Wake」= 唤醒 Cursor/VSCode 的 **Agent** 来跑 skills-admin | 「Wake」仅写 `wake/pending.json`、记历史；**没有任何东西**去启动 Agent |
| 扩展「触发唤醒」= 让 Agent 开始审查 | 扩展只调 API，API 只跑 Wake 调度（统计 pending、写文件）；**不会**打开聊天、不会发消息、不会调用 Agent |
| skills-admin 可被「自动」触发 | skills-admin 是 Cursor Skill；只有**用户手动**在聊天里输入「审查建议」等时，Cursor 才会加载它 |

因此：**你想唤醒的是 Cursor/VSCode 的 Agent，但整个流水线里从未真正调用过 Agent。** 根基就在这里。

---

## 二、平台约束

- **VS Code / Cursor 扩展 API**：没有「打开 AI 聊天」「发送消息」「程序化调用 Agent」的公开接口。
- **Cursor Agent CLI**（2025）：提供 `agent chat "your task"`，可在终端/无头环境**程序化**跑 Agent，且在工作区目录下执行，能访问 `.cursor/skills`、`.openskills` 等。

所以：**在扩展里无法直接「打开聊天并代发消息」，但可以通过 Cursor Agent CLI 真正「唤醒」Agent。**

---

## 三、修复方向

### 1. 重新定义「唤醒」语义

- **唤醒** = 通过 **Cursor Agent CLI** 在项目目录执行 `agent chat "..."`，**真正启动** Cursor Agent 执行 skills-admin 审查流程。
- **触发唤醒**（扩展命令 / 后续可能的快捷方式）= 在**有工作区**的前提下，调 API 记录 + **执行 Agent CLI**；若未安装 CLI，则降级为「仅调 API + 提示用户手动开聊天」。

### 2. 谁可以「真正唤醒」Agent？

| 组件 | 能否直接跑 `agent chat` | 说明 |
|-----|--------------------------|------|
| **API 服务**（Docker 等） | 一般**不能** | 常无 Cursor CLI、无用户环境、无项目文件 |
| **扩展**（Cursor/VSCode） | **能** | 有工作区路径，可起终端或子进程在项目根跑 CLI |

因此：**真正唤醒 Agent 的入口放在扩展里**；API 侧的 Wake 调度保留为「写 pending、记历史、提醒有待办」，**不**负责启动 Agent。

### 3. 扩展「触发唤醒」新流程

1. **可选**：调 API `POST /api/scheduler/wake/trigger`（记录 wake、刷新状态）；API 不可用时不影响后续。
2. **若**配置启用「用 Agent CLI 唤醒」且工作区有效：
   - 在**项目根**执行 `agent chat "审查建议。请担任 skills-admin，按 SKILL 流程审查 .openskills/proposals/ 下的 pending。"`（或使用配置的 `reminderPrompt` / 自定义 prompt）。
   - 通过**终端**运行，用户可见 Agent 输出；若未安装 CLI，终端报错，扩展可提示安装方式。
3. **否则**：仅调 API（若可用）+ 提示「请手动在 Cursor 聊天输入『审查建议』或安装 Cursor CLI 后使用触发唤醒」。

### 4. 可选配置（扩展）

- `openskills.wakeUseAgentCli`：是否用 Cursor Agent CLI 唤醒（默认 `true`）。
- `openskills.wakeAgentPrompt`：自定义唤醒 prompt；为空则用默认（含「审查建议」「担任 skills-admin」等）。

### 5. 与现有机制的关系

- **Wake 调度（cron）**：继续只做「检查 pending → 写 `wake/pending.json` / 历史」。不跑 Agent。
- **Handoff / 交接**：不变；仍由 Agent 或 API 写 `handoff/latest.json`，新 Agent 读取续跑。
- **skills-admin**：仍是 Cursor Skill；**唤醒时**通过 `agent chat "..."` 的 prompt 明确要求「担任 skills-admin、审查 proposals」，Agent 会按 Skill 流程执行。

---

## 四、实施清单

- [x] 文档：`docs/ARCHITECTURE_FIX.md`（本文）
- [x] 更新 `QUICK_REFERENCE.md`、`skills-admin` 中关于「唤醒」的表述，与上述语义对齐
- [x] 扩展：`triggerWake` 增加「调用 Cursor Agent CLI」逻辑；可配置、可降级
- [x] 扩展：新增 `openskills.wakeUseAgentCli`、`openskills.wakeAgentPrompt` 配置项

---

## 五、使用 Cursor CLI 的前置条件

- 使用 **Cursor**（纯 VS Code 无 Cursor Agent CLI）。
- 已安装 [Cursor Agent CLI](https://cursor.com/docs/cli/overview)：
  
  **macOS / Linux / Windows (WSL)**：
  ```bash
  curl https://cursor.com/install -fsSL | bash
  export PATH="$HOME/.local/bin:$PATH"  # 加入 PATH
  agent --version  # 验证安装
  ```
  
  **Windows 本机（无 WSL）**：
  - **推荐**：使用 WSL（`wsl --install`），然后在 WSL 中执行上述命令
  - **备选**：在 Git Bash 中执行安装命令
  - **详细步骤**：参考 `QUICK_REFERENCE.md` 或 `README.md` 中的「Cursor Agent CLI 安装」章节
  
- 在**项目根**或包含 `.openskills` 的工作区中执行「触发唤醒」。

---

## 六、skills-admin 的创建方式

### 变更说明

从 v0.1.0 开始，`skills-admin` 的创建方式已更新：

- **优先方式**：通过 **Cursor Agent CLI** 让 Agent 创建 skills-admin
- **降级方案**：如果 Agent CLI 不可用或配置禁用，使用直接创建方式（写入预定义内容）

### 配置选项

在扩展配置中添加了 `openskills.useAgentCliForSkills`（默认 `true`）：

- `true`：优先使用 Agent CLI 创建 skills-admin，失败时降级到直接创建
- `false`：直接使用文件写入方式创建

### 创建流程

1. **检查配置**：读取 `openskills.useAgentCliForSkills` 配置
2. **Agent CLI 创建**（如果启用）：
   - 检查 Agent CLI 是否可用
   - 执行 `agent chat` 命令，使用专门的 prompt 引导 Agent 创建 skills-admin
   - 验证文件是否创建成功
3. **降级创建**（如果 Agent CLI 不可用或失败）：
   - 直接写入预定义的 `SKILLS_ADMIN_CONTENT`
   - 验证文件内容

### 优势

- **符合自进化理念**：skills-admin 由 Agent 创建，而非硬编码
- **智能优化**：Agent 可以根据项目情况优化 skills-admin 内容
- **灵活降级**：即使没有 Agent CLI，也能正常工作

---

## 七、总结

- **根源**：设计上「唤醒」的是 Agent，但实现里从未调用 Agent，只写了文件、调了 API。
- **修复**：把「唤醒」明确定义为**通过 Cursor Agent CLI 真正跑起 Agent**；实现上由**扩展**在项目目录执行 `agent chat "..."`，API 的 Wake 仅做记录与提醒。
- **结果**：用户点击「触发唤醒」时，可实际启动 Cursor Agent 跑 skills-admin；若无 CLI，则回退到「仅 API + 手动聊天」的旧行为，并给出清晰提示。
- **skills-admin 创建**：优先通过 Agent CLI 创建，符合自进化理念；支持配置和降级方案。

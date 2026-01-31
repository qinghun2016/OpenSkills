# OpenSkills 交接文档：Agent CLI 与 Skills Admin

**日期**: 2026-01-28  
**主题**: Skills Admin 自进化、Agent CLI 检测与诊断相关工作的整理与交接  
**状态**: 功能已实现，部分环境问题待用户侧验证

---

## 一、工作背景与目标

1. **Skills Admin 由 Cursor CLI 生成/管理**  
   期望 `skills-admin` 通过 Cursor Agent CLI 创建和管理，符合「自进化 Agent」设计；CLI 不可用时回退为直接创建。

2. **Agent CLI 检测与诊断**  
   扩展需要检测 Cursor Agent CLI 是否可用（用于唤醒 skills-admin），并在诊断/健康检查中给出清晰状态与修复建议。

3. **Health Check 与 Diagnose 区分**  
   明确两个命令的职责，避免重复，并统一使用全局输出通道、正确传递 `outputChannel`。

---

## 二、已完成的工作

### 2.1 核心代码

| 文件 | 变更摘要 |
|------|----------|
| `packages/extension/src/utils/agentCli.ts` | **核心**：Agent CLI 检测与执行；环境变量展开；输出编码处理；多级回退检测逻辑 |
| `packages/extension/src/commands/init.ts` | 集成 `createSkillViaAgent`、`checkAgentCliAvailable`；`createSkillsAdminSkill` 优先走 CLI，失败则直接创建 |
| `packages/extension/src/commands/healthCheck.ts` | 使用 `getOutputChannel()`；skills-admin 检查逻辑（含「需重新加载」提示） |
| `packages/extension/src/commands/diagnose.ts` | 使用 `getOutputChannel()`；调用 `checkAgentCliAvailable(outputChannel)`；复用 `performHealthCheck` |
| `packages/extension/src/commands/triggerWake.ts` | 移除重复的 `checkAgentCliAvailable` 实现，统一从 `../utils/agentCli` 引入 |
| `packages/extension/src/extension.ts` | 导出 `getOutputChannel()`，供健康检查/诊断等复用 |
| `packages/extension/package.json` | 新增配置项：`openskills.useAgentCliForSkills`、`openskills.agentCliPath` |

### 2.2 Agent CLI 检测逻辑（`agentCli.ts`）

- **配置优先**：若设置 `openskills.agentCliPath`，优先使用该路径。
- **多级回退**：  
  - 方法1：Windows 下用 PowerShell `Get-Command agent` 解析路径。  
  - 方法2：在 PATH 中搜索 `agent.exe`。  
  - 方法3：若得到完整路径则用该路径执行 `--version`；若未得到路径则**跳过**「直接用 PowerShell 执行 `agent --version`」，避免在扩展环境中因 PATH 不同而报错。  
  - 方法4：遍历 `getPossibleAgentPaths()` 的路径列表，对**展开环境变量后的路径**做存在检查并执行。
- **环境变量展开**：`expandEnvVars()` 支持 Windows `%VAR%`、Unix `$VAR`/`${VAR}`，避免如 `%NODE_HOME%\agent.exe` 未展开导致执行失败。
- **输出解码**：`decodeOutput()` 处理 Buffer/string，优先 UTF-8，失败时用系统编码，减轻中文 Windows 下 PowerShell 输出的乱码问题。
- **日志**：`checkAgentCliAvailable(outputChannel?)` 在传入 outputChannel 时输出 `[Agent CLI]` 前缀的详细步骤日志，便于排查。

### 2.3 文档与配置

- `docs/COMMANDS_DIFFERENCE.md`：说明 **Health Check**（专注 skills-admin）与 **Diagnose**（全量组件含 Agent CLI）的区别与使用场景。
- 用户可在 Cursor 设置中配置 **OpenSkills: Agent Cli Path** 为 agent 的完整路径，以绕过自动检测失败。

---

## 三、已知问题与当前状态

### 3.1 Agent CLI 在扩展中检测失败

- **现象**：用户在 PowerShell 中执行 `agent --version` 正常，但扩展内诊断/唤醒仍报「Agent CLI 不可用」或报错。
- **原因**：扩展通过 `child_process.exec` 启动的进程继承的环境与用户交互式 PowerShell 可能不同（如 PATH、Profile 中追加的路径），导致找不到 `agent` 或拿到错误路径。
- **已做缓解**：  
  - 跳过「在扩展进程中直接执行 `agent --version`」；  
  - 优先用 PowerShell 解析路径 + 直接路径列表 + 环境变量展开；  
  - 支持手动配置 `openskills.agentCliPath`。  
- **建议**：若自动检测仍失败，在设置中填写 agent 的绝对路径（例如 `D:\MyTools\cursor\resources\app\bin\agent.exe`）。

### 3.2 报错信息乱码

- **现象**：PowerShell 报错中的中文在扩展输出里显示为乱码。
- **原因**：Windows 下 PowerShell 输出常为 GBK/系统代码页，而 Node 默认按 UTF-8 或单一编码解析，导致解码错误。
- **已做**：在 `agentCli.ts` 中增加 `decodeOutput()`，对 Buffer 先尝试 UTF-8，失败再用 `buffer.toString()`（系统编码）。若仍乱码，可考虑在调用 PowerShell 时显式指定输出编码（如 `[Console]::OutputEncoding`）或使用 `chcp 65001` 等，需在后续迭代中验证。

### 3.3 Skills Admin「文件存在但 Agent 未加载」

- **现象**：健康检查/诊断显示「文件存在但 Agent 尚未加载，需重新加载窗口」。
- **原因**：Cursor 在启动时扫描 `.cursor/skills/`，之后不会自动重扫；新建或修改 SKILL.md 后需重新加载窗口才会被识别。
- **已做**：健康检查中采用保守策略，在文件存在时仍提示可能需要重新加载；并提供「重新加载窗口」等操作入口。
- **用户操作**：`Ctrl+Shift+P` → `Developer: Reload Window`。

---

## 四、关键文件与入口

- **Agent CLI 工具**：`packages/extension/src/utils/agentCli.ts`  
  - `checkAgentCliAvailable(outputChannel?)`：检测是否可用，供诊断、唤醒等调用。  
  - `getPossibleAgentPaths()`：生成候选路径（含配置、PATH、常见安装位置）。  
  - `expandEnvVars()`：路径环境变量展开。  
  - `decodeOutput()`：stdout/stderr 解码。
- **诊断**：`packages/extension/src/commands/diagnose.ts`  
  - 调用 `checkAgentCliAvailable(outputChannel)`，并在同一输出通道中展示 Agent CLI 状态与 `[Agent CLI]` 日志。
- **健康检查**：`packages/extension/src/commands/healthCheck.ts`  
  - 专注 skills-admin 文件与「是否需重新加载」。
- **唤醒**：`packages/extension/src/commands/triggerWake.ts`  
  - 使用 `checkAgentCliAvailable`（来自 `agentCli.ts`）判断是否可走 CLI 唤醒。

---

## 五、建议的下一步（接手方）

1. **验证与调试**  
   - 在目标 Windows 环境重新加载窗口后执行「OpenSkills: Diagnose」，查看输出通道中 `[Agent CLI]` 的每一步日志，确认卡在方法1/2/3/4 的哪一环。  
   - 若某路径存在但未在列表中，可在 `getPossibleAgentPaths()` 中补充或引导用户配置 `openskills.agentCliPath`。

2. **乱码**  
   - 若 `decodeOutput()` 仍不足，可在执行 PowerShell 时显式设置输出编码（如 UTF-8），或对 stderr 单独用 GBK 解码后再展示。

3. **体验**  
   - 在诊断/健康检查结果中，当 Agent CLI 不可用时，明确提示「可在设置中配置 OpenSkills: Agent Cli Path 为 agent 的完整路径」。

4. **编译与打包**  
   - 当前 `packages/extension` 下 `npm run compile` 通过即可；若有 CI，需保证该包在 Windows 节点上的编译通过。

---

## 六、相关文档索引

- **交接清单（可执行项）**：`docs/handover/交接清单-20260128-AgentCLI与SkillsAdmin.md`  
- 命令区别：`docs/COMMANDS_DIFFERENCE.md`  
- 交接历史：`docs/handover/` 下其他交接文档  
- 手动唤醒与排查：`docs/guides/如何唤醒skills-admin.md`、`docs/guides/手动唤醒问题排查.md`

---

## 七、Handoff 交接功能实现状态（2026-01-29 补充）

**问题**：此前交接（handoff）仅实现了 token 监控与 trigger，缺少「交接快照」的保存与读取，且 skills-admin 要求 Agent 直接写 `handoff/latest.json`，会导致任务挂起。

**已补全**：

1. **HandoffMonitor**（`packages/api/src/scheduler/handoffMonitor.ts`）
   - 新增 `saveSnapshot(snapshot)`、`readSnapshot()`，读写 `.openskills/handoff/latest.json`。
   - 快照结构：`{ pendingProposals, inProgressDecision?, summary, timestamp }`。

2. **API**
   - `GET /api/scheduler/handoff/snapshot`：获取交接快照（新 Agent 启动时调用）。
   - `POST /api/scheduler/handoff/snapshot`：保存交接快照（Agent 在 token 接近上限、压缩上下文时调用）。
   - Agent 不再直接写/读 `handoff/latest.json`，一律通过上述 API，避免任务挂起。

3. **skills-admin SKILL**
   - 压缩策略改为「调用 `POST /api/scheduler/handoff/snapshot` 保存快照」。
   - 新 Agent 改为「调用 `GET /api/scheduler/handoff/snapshot` 获取快照并从断点继续」。

**流程**：Token 接近上限 → Agent 调用 `POST /api/scheduler/handoff/snapshot` 保存 pending 列表与摘要 → 新 Agent 启动后调用 `GET /api/scheduler/handoff/snapshot` 获取并继续审查。

**新 Agent 启动时自动检查交接快照**（已补充）：

1. **skills-admin 唤醒流程**：将「获取交接快照」设为唤醒后**第一步**。新 Agent 被唤醒后必须先调用 `GET /api/scheduler/handoff/snapshot`；若返回有 `data`，则根据 `pendingProposals`、`inProgressDecision`、`summary` 从断点继续，不再从头拉全量；若为 null 则按原流程（同步规则 → 获取 pending → 审查）执行。
2. **扩展默认唤醒文案**（`packages/extension/src/commands/triggerWake.ts` 的 `DEFAULT_WAKE_PROMPT`）：改为「担任 skills-admin：启动后先调用 GET /api/scheduler/handoff/snapshot，若有交接快照则从断点继续；否则先执行 skill-proposer … 再审查所有 pending proposals。」这样通过 CLI 触发的 Agent 会在一开始就被提示先拉交接快照。

以上为本次 Agent CLI 与 Skills Admin 相关工作的整理与交接，后续可在此基础上继续优化检测逻辑与错误展示。

# 交接清单：Agent CLI 与 Skills Admin

**对应文档**：[交接文档-20260128-AgentCLI与SkillsAdmin.md](./交接文档-20260128-AgentCLI与SkillsAdmin.md)  
**用途**：接手方按项验证与跟进，完成后勾选并填写备注（可选）。

---

## 一、验证与调试

- [ ] **1.1** 在目标 Windows 环境执行「Developer: Reload Window」重新加载窗口。
- [ ] **1.2** 执行命令「OpenSkills: Diagnose」，打开输出通道查看完整日志。
- [ ] **1.3** 在输出中查找 `[Agent CLI]` 前缀的每一步日志，确认检测卡在：
  - [ ] 方法1（PowerShell `Get-Command agent`）
  - [ ] 方法2（PATH 中搜索 `agent.exe`）
  - [ ] 方法3（完整路径执行 `--version`）
  - [ ] 方法4（`getPossibleAgentPaths()` 列表逐项检查）
- [ ] **1.4** 若已知 agent 所在路径但未在列表中：在 `packages/extension/src/utils/agentCli.ts` 的 `getPossibleAgentPaths()` 中补充，或确认用户已通过「OpenSkills: Agent Cli Path」配置。

**备注（可选）**：  
_卡在第几步：_____ ；是否已配置 agentCliPath：_____

---

## 二、乱码处理

- [ ] **2.1** 在 PowerShell 有中文输出的场景下运行 Diagnose，检查扩展输出是否仍有乱码。
- [ ] **2.2** 若仍有乱码：在执行 PowerShell 时显式设置输出编码（如 UTF-8），或对 stderr 使用 GBK 解码后再展示（在 `agentCli.ts` 的 `decodeOutput()` 或调用处改进）。

**备注（可选）**：  
_是否仍乱码：_____ ；采用的方案：_____

---

## 三、体验优化

- [ ] **3.1** 当 Agent CLI 不可用时，在 **Diagnose** 结果/输出中增加提示：「可在设置中配置 OpenSkills: Agent Cli Path 为 agent 的完整路径」。
- [ ] **3.2** 当 Agent CLI 不可用时，在 **Health Check** 结果/输出中增加同上提示。

**涉及文件（参考）**：  
`packages/extension/src/commands/diagnose.ts`、`packages/extension/src/commands/healthCheck.ts`

**备注（可选）**：  
_已加提示位置：_____

---

## 四、编译与打包

- [ ] **4.1** 在项目根目录或 `packages/extension` 下执行 `npm run compile`，确认通过。
- [ ] **4.2** 若有 CI：确认 `packages/extension` 在 Windows 节点（或对应 OS）上编译通过。

**备注（可选）**：  
_编译环境：_____ ；CI 是否已覆盖：_____

---

## 五、相关文档（查阅用）

| 文档 | 路径 |
|------|------|
| 命令区别说明 | `docs/COMMANDS_DIFFERENCE.md` |
| 如何唤醒 skills-admin | `docs/guides/如何唤醒skills-admin.md` |
| 手动唤醒问题排查 | `docs/guides/手动唤醒问题排查.md` |

---

**清单完成日期**：__________  
**接手方**：__________

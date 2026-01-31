# 项目整理 — 不确定项（待人工确认）

**生成日期**: 2026-01-31  
以下为整理时无法 100% 确定是否删除/修改的项，请人工确认后处理。

---

## 1. 脚本与代码

### 1.1 `scripts/init-project.ts`

- **说明**：独立 CLI 脚本，用法 `npx ts-node scripts/init-project.ts [project-path]`，用于在指定目录初始化 OpenSkills 目录与配置。
- **现状**：扩展的「OpenSkills: Initialize」使用 `packages/extension/src/commands/init.ts` 的实现，**未调用**本脚本；package.json 与 CI 中无引用。
- **不确定点**：是否保留为「无插件/CI 场景下的备用初始化方式」，还是视为废弃代码删除。
- **建议**：若需支持无 IDE 环境初始化，可保留并在 README 或 docs 中说明用法；否则可删或移至 `scripts/archive/`。

### 1.2 `scripts/post-proposal.json`

- **说明**：示例 proposal 请求体（测试/参考用）。
- **现状**：未被代码或文档明确引用。
- **不确定点**：是否仍需要作为「创建 proposal 的示例」保留。
- **建议**：保留作示例无妨；若追求极简可删或合并到文档中的示例。

---

## 2. 文档与路径

### 2.1 根目录 `RESTART_DOCKER.md`

- **说明**：Docker 重启与热更新说明，内容有效。
- **现状**：保留在根目录，未移至 docs。
- **不确定点**：是否统一移至 `docs/guides/RESTART_DOCKER.md`，使根目录更简洁。
- **建议**：若希望「所有说明类文档都在 docs 下」，可移动并删根目录文件，并在 README/START_HERE 中加链接。

### 2.2 `docs/guides/现在按F5启动插件.md`

- **说明**：一次性指引「按 F5 启动插件」的短文，含预期效果与问题反馈提示。
- **现状**：与 `docs/guides/插件安装指南.md`、`docs/QUICK_START.md` 有部分重叠。
- **不确定点**：是否合并到「插件安装指南」或「快速入门」，然后删除本文件以减少重复。
- **建议**：若插件安装指南已覆盖 F5 启动，可合并后删除；否则保留作简短指引。

---

## 3. 其他

### 3.1 `docs/technical/` 下的报告类文档

- **文件**：如 `PROPOSAL_GENERATION_ISSUE.md`、`MERGE_EXECUTION_REPORT.md`、`MERGE_FEATURE_TEST.md` 等。
- **说明**：多为某次问题分析或功能测试的记录。
- **不确定点**：是否全部保留为历史参考，或将过时内容归档/删除。
- **建议**：按「是否仍有参考价值」逐份判断；若仅作历史可移至 `docs/archive/` 或保留不动。

---

**处理建议**：确认一项后可在本文件中补充「处理结果」并注明日期，或直接修改/删除对应文件。

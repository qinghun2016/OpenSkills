# Agent 自主进化：方向与 OpenSkills 的定位

<!-- 本文档梳理 agent 自主进化的可能方向，并说明本项目的意义与是否值得继续做下去。 -->

## 一、学界/业界的进化路线（2024–2025）

### 1. 四阶段进化轨迹（综述 2508.07407）

从「静态模型」到「终身自进化 agent」的典型划分：

| 阶段 | 英文 | 含义 |
|------|------|------|
| **MOP** | Model Offline Pretraining | 基础模型预训练后冻结部署 |
| **MOA** | Model Online Adaptation | 部署后 SFT/RLHF/Adapter 等有限在线适应 |
| **MAO** | Multi-Agent Orchestration | 多 agent 编排（消息、工作流），不改参数 |
| **MASE** | Multi-Agent Self-Evolving | 终身、闭环自进化：agent 自主优化 prompt、记忆、工具、交互，基于环境反馈与 meta-reward |

OpenSkills 做的是 **MASE 里的一类**：不直接改模型参数，而是进化 **技能与规则**（可审计、可版本化、可人工介入）。

### 2. 自进化涉及的优化对象

同一综述把「可被优化」的组件归纳为：

- **LLM 行为**：训练/推理时优化（SFT、RL、CoT、Tree-of-Thoughts、verifier 等）
- **Prompt**：编辑、生成、进化式搜索、text gradient 等
- **Memory**：短期/长期记忆、RAG、结构化记忆与优先级
- **Tool**：工具文档、选择策略、**工具创建与共进化**（仍被标为 underexplored）
- **多 agent**：工作流、拓扑、角色、协作策略的自动搜索与学习

**技能/规则作为一等公民的进化**，在综述里更多被归入「prompt/context 优化」或「tool 共进化」的周边，**显式、可审计、文件级的 skill/rule 进化**在 IDE/编辑器生态里仍较少被系统讨论——这正是 OpenSkills 的切入点。

### 3. 技能库与上下文进化（与 OpenSkills 最相关）

- **Skill Library Evolution**（agentic-patterns 等）：  
  技能从「临时代码」→「可复用函数」→「文档化能力」→「agent 能力」的阶梯式进化；技能持久化、复用、组合。  
  **OpenSkills 的 propose → review → apply 正是对这一链条的工程化实现**（技能以文件形式存在、以 diff 提议、经审查后应用）。

- **ACE (Agentic Context Engineering)**：  
  把 context 当作「可进化 playbook」，通过生成、反思、筛选不断更新，并控制 context collapse。  
  OpenSkills 中的 **skills/rules 本质是结构化、可版本的 context**，进化的是「何时用哪条技能/规则」，而不是单一大段 prompt。

- **Voyager / SAGE / SkillWeaver 等**：  
  在环境中通过课程、RL、程序验证等积累技能库；OpenSkills 侧重 **人类/agent 可审查、可回滚** 的 skill 进化，更适合 IDE 与协作场景。

---

## 二、OpenSkills 在「进化版图」中的位置

### 我们做的是哪一类进化？

- **不做什么**：不训模型、不直接改 LLM 参数、不替代 RAG/长期记忆实现。
- **做什么**：  
  **技能与规则作为可进化对象**，在 Cursor/IDE 生态内，通过 **提议 → 审查 → 应用** 的闭环，实现：
  - 可审计（每条改动都是 proposal + decision）
  - 可回滚（diff 应用可逆）
  - 可人工终审（adminMode：human_only / agent_then_human / agent_only）
  - 可扩展来源：Agent、Human、Crawler 都可提议；skills-admin 统一审查

因此，OpenSkills 落在 **MASE 中的「策略层/技能层进化」**：进化的是「agent 该做什么、何时用哪条技能与规则」，而不是模型或单次 prompt 文本。

### 与学术方向的对应关系

| 学术/业界方向 | OpenSkills 对应 |
|---------------|-----------------|
| Prompt / Context 进化 | 进化 .cursor/skills、.cursor/rules（结构化、可版本化） |
| Tool 共进化（underexplored） | 技能/规则即「何时调用何种能力」的声明式描述，进化即扩展/修正这些声明 |
| 多 agent 协作与治理 | Proposer / Admin 角色分离；人类可选的终审 |
| 安全与对齐 | 所有改动经 proposal，可审、可拒、可回滚，无静默自改 |

---

## 三、自主进化可能的方向（与本项目强相关）

下面这些方向既符合学界趋势，也直接决定 OpenSkills 能否持续产生价值。

### 方向 1：技能/规则即「可进化策略层」（当前核心）

- **现状**：提议 → 审查 → 应用；Agent/Human/Crawler 提议；skills-admin 审查；支持 agent_only 自动应用。
- **可深化**：  
  - 更细的触发与优先级（例如按任务类型、项目标签触发不同 skill 集）。  
  - 技能依赖与组合（skill A 依赖 skill B，进化时做一致性检查）。  
  - 与 Cursor 规则/上下文的更深绑定（例如规则也走同一套 propose→review→apply）。

### 方向 2：跨项目/跨用户的技能共享与「技能市场」

- 技能以文件形式存在，天然可复制、可 fork、可分享。  
- **可能形态**：  
  - 从 GitHub 等拉取社区 skill 并生成 proposal（已有爬虫雏形）。  
  - 项目内/组织内 skill 模板与推荐。  
  - 可选的「技能目录」或轻量 marketplace（评分、使用次数、兼容的 Cursor/IDE 版本）。

### 方向 3：多 Agent 参与提议与审查

- **现状**：单个 skills-admin agent 审查。  
- **可能形态**：  
  - 多个 agent 可提议；审查时可引入「多 agent 投票/辩论」再由人类或主 admin 裁决。  
  - 不同领域 agent（例如前端、后端、文档）拥有不同提议权重或专用 skill 子集。  
  - 与综述中的「多 agent 工作流/拓扑优化」对齐，但聚焦在 skill/rule 层面。

### 方向 4：进化质量与基准

- **问题**：自进化若无法度量，难以判断「有没有越变越好」。  
- **可能形态**：  
  - 定义「skill 进化质量」指标：例如提议通过率、应用后任务成功率、回滚率。  
  - 与既有 agent benchmark（如 SWE-bench、WebArena、ToolBench）结合：在固定任务集上，对比「进化 N 轮前后」的完成率。  
  - 为 OpenSkills 建一个小型「skill evolution benchmark」（例如一组标准任务 + 标准 skill 集，看提议是否改善表现）。

### 方向 5：安全、对齐与可解释性

- 综述强调：自进化系统需要 **evolution-aware** 的安全与对齐。  
- **OpenSkills 的天然优势**：  
  - 所有改动有 diff、有提议理由、有决策记录，便于审计与合规。  
  - 可做：敏感变更强制 human review；高风险 skill（如执行命令、访问网络）需额外审批或标签。  
- **可深化**：  
  - 与「安全策略」绑定：例如禁止某些类型的工具调用、禁止修改特定路径。  
  - 进化日志与可解释性报告（谁在何时提议/批准/应用了什么）。

### 方向 6：与「记忆 / 上下文」进化的衔接

- 技能与规则可视为 **长期、结构化上下文** 的一部分。  
- **可能形态**：  
  - 将「会话中产生的有用策略」沉淀为 skill 提议（例如 agent 在任务中总结出一条可复用规则 → 自动生成 proposal）。  
  - 与 RAG/记忆系统对接：某些「记忆」条目可被提议为 skill，经审查后纳入 .cursor/skills。  
  - 避免与 ACE 等「上下文进化」重复：OpenSkills 专注「持久化、可版本、可审查」的那一部分。

---

## 四、结论：项目有没有做下去的意义？

### 有，且方向清晰

1. **趋势一致**：  
   Agent 自进化（MASE、技能库进化、上下文进化）是当前研究与应用的重点；**可审计、可治理的技能/规则进化**在 IDE/编辑器生态中仍较少被系统化实现，OpenSkills 占位明确。

2. **差异化明确**：  
   - 不拼「训大模型」或「改参数」，而是拼「谁在用什么规则与技能」的 **显式、可审计、可回滚** 进化。  
   - 与 Cursor/.cursor/skills、.cursor/rules 深度结合，适合真实开发工作流。

3. **可延伸空间大**：  
   - 上面六个方向（策略层深化、技能共享/市场、多 agent 审查、质量与基准、安全与可解释性、与记忆/上下文衔接）都可作为 roadmap，且与学界「自进化 agent」「skill library evolution」对齐。

4. **风险可控**：  
   - 通过 propose→review→apply 和 human-in-the-loop 选项，避免「静默自改」；安全与对齐可随方向 5 逐步加强。

### 建议的下一步（供产品/技术决策）

- **短期**：  
  - 巩固「第一个 key 能用」的 Moltbook 发帖与反馈收集（若 X/Key 恢复），让更多 agent 使用者看到并讨论 OpenSkills。  
  - 在文档与对外描述中，明确写出「我们做的是 MASE 下的技能/规则进化，可审计、可回滚」，便于与综述和竞品区分。
- **中期**：  
  - 选 1–2 个方向做深：例如「方向 4：进化质量与基准」或「方向 2：跨项目技能共享」，形成可演示、可衡量的成果。  
  - 与一两篇相关论文（如 2508.07407、ACE、Voyager）做对照引用，增强「我们站在哪条学术脉络上」的可解释性。
- **长期**：  
  - 将 OpenSkills 纳入「自进化 agent」与「skill library evolution」的讨论与基准中，成为该细分方向的一个参考实现。

---

## 参考文献与链接（简要）

- **Self-Evolving AI Agents Survey**：arXiv:2508.07407（四阶段 MOP→MOA→MAO→MASE；prompt/memory/tool 优化；安全与评估）。  
- **Agentic Context Engineering (ACE)**：上下文作为可进化 playbook。  
- **Skill Library Evolution**：agentic-patterns.com；Voyager、SAGE、SkillWeaver 等技能库与 RL/课程学习。  
- **OpenSkills 机制**：`.cursor/skills/open-skills-bootstrap/SKILL.md`；提议格式 `.openskills/schemas/proposal.schema.json`。

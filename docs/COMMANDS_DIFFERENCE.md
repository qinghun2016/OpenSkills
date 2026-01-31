# OpenSkills 命令区别说明

## Health Check vs Diagnose

### OpenSkills: Health Check（健康检查）

**用途**：专门检查 `skills-admin` Agent 的状态

**检查内容**：
- skills-admin 文件是否存在
- 文件内容是否完整和有效
- Agent 是否已被 Cursor 加载（是否需要重新加载窗口）
- 提供创建/修复 skills-admin 的选项

**适用场景**：
- 初次设置 OpenSkills
- skills-admin Agent 无法使用时排查问题
- 需要创建或修复 skills-admin 文件时

**输出**：详细的文本报告，包含文件路径、验证状态、建议操作

---

### OpenSkills: Diagnose（系统诊断）

**用途**：全面检查整个 OpenSkills 系统的状态

**检查内容**：
1. 工作区状态
2. .openskills 目录
3. 配置文件（config.json）
4. skills-admin Agent（复用 Health Check 的结果）
5. **Agent CLI** 可用性
6. API 服务状态
7. Proposals 状态
8. 唤醒机制状态

**适用场景**：
- 系统出现问题时全面排查
- 需要了解所有组件的状态
- 快速定位问题根源

**输出**：结构化的诊断报告，包含所有组件的状态图标（✅/⚠️/❌）和修复建议

---

## 为什么需要两个命令？

1. **职责分离**：
   - Health Check：专注于 skills-admin（最常用的检查）
   - Diagnose：全面系统检查（更全面的诊断）

2. **使用频率**：
   - Health Check：日常使用，快速检查 skills-admin
   - Diagnose：问题排查时使用，全面了解系统状态

3. **输出格式**：
   - Health Check：详细的文本说明，适合创建/修复操作
   - Diagnose：结构化的状态报告，适合快速了解整体状态

## 建议使用场景

- **日常检查**：使用 `Health Check`
- **问题排查**：使用 `Diagnose`
- **初次设置**：先运行 `Diagnose` 了解整体状态，然后使用 `Health Check` 创建 skills-admin

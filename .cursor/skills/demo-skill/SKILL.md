---
name: demo-skill
description: Demo skill — showcase OpenSkills (演示技能 - 展示 OpenSkills 功能)
triggers:
  - "演示"
  - "demo"
  - "示例"
---

# Demo Skill

This skill demonstrates OpenSkills self-evolution and end-to-end workflow.
<!-- 演示技能，展示 OpenSkills 自进化机制和完整工作流程。 -->

## Overview
<!-- 功能概述 -->

Demo Skill illustrates core OpenSkills behavior:
- Proposal creation and submission
- Admin review flow
- Auto-apply mechanism
- Skill self-evolution

## Use cases
<!-- 使用场景 -->

- Test proposal creation
- Test review flow
- Test apply mechanism
- Learn OpenSkills workflow
- Use as a template for new skills

## Examples
<!-- 示例 -->

### Example 1: Basic use

```typescript
// Simple example
console.log('Hello OpenSkills!');
```

### Example 2: Create a new skill

1. Create a new folder under `.cursor/skills/`
2. Add a `SKILL.md` file
3. Add frontmatter and content
4. Submit an improvement proposal via OpenSkills (use API; do not create files under `.openskills/proposals/` directly)
<!-- 改进提议需通过 API（POST /api/proposals）提交，禁止直接创建 .openskills/proposals/ 下的文件 -->

## Best practices
<!-- 最佳实践 -->

- Keep skill content clear and concise
- Describe use cases clearly
- Provide working example code
- Follow OpenSkills skill format

## Resources
<!-- 相关资源 -->

- OpenSkills docs: see project README.md
- Skill template: refer to other skills in the repo

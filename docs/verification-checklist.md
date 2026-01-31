# OpenSkills 验证清单

本文档用于追踪 OpenSkills 各功能模块的测试和验证状态。

## API 测试

### Proposals CRUD

- [ ] 创建 Proposal (POST /api/proposals)
- [ ] 获取单个 Proposal (GET /api/proposals/:id)
- [ ] 列出所有 Proposals (GET /api/proposals)
- [ ] 按状态筛选 (GET /api/proposals?status=pending)
- [ ] 按范围筛选 (GET /api/proposals?scope=project)
- [ ] 分页限制 (GET /api/proposals?limit=10)
- [ ] 获取摘要 (GET /api/proposals?summary=true)
- [ ] 更新 Proposal 状态 (PATCH /api/proposals/:id)
- [ ] 删除 Proposal (DELETE /api/proposals/:id)

### Decisions CRUD

- [ ] 创建批准决策 (POST /api/decisions)
- [ ] 创建拒绝决策 (POST /api/decisions)
- [ ] 获取决策 (GET /api/decisions/:proposalId)
- [ ] 列出所有决策 (GET /api/decisions)
- [ ] 决策创建时更新 Proposal 状态

### Diff 应用

- [ ] 验证 Diff 可应用 (GET /api/decisions/:id/validate)
- [ ] 预览 Diff 结果 (GET /api/decisions/:id/preview)
- [ ] 应用 Diff (POST /api/decisions/:id/apply)
- [ ] 创建新文件时应用 Diff
- [ ] Diff 不匹配时正确报错

### Diff 回滚

- [ ] 获取历史记录 (GET /api/history)
- [ ] 按技能名筛选历史 (GET /api/history?skillName=xxx)
- [ ] 检查是否可回滚 (GET /api/history/:id/can-rollback)
- [ ] 执行回滚 (POST /api/history/:id/rollback)
- [ ] 从备份恢复文件
- [ ] 阻止重复回滚

### Preferences 合并

- [ ] 读取用户级偏好
- [ ] 读取项目级偏好
- [ ] 合并偏好（项目级覆盖用户级）
- [ ] 更新偏好并持久化
- [ ] 偏好历史记录

### Config 读写

- [ ] 读取配置 (GET /api/config)
- [ ] 更新配置 (PATCH /api/config)
- [ ] 配置验证

---

## Crawler 测试

### GitHub 搜索

- [ ] 按 topic 搜索仓库
- [ ] 按 stars 筛选
- [ ] 处理 API 限流
- [ ] 缓存搜索结果

### Skills 解析

- [ ] 解析 SKILL.md 文件
- [ ] 解析 frontmatter 元数据
- [ ] 处理无效/损坏的文件

### Proposal 生成

- [ ] 从爬取结果生成 Proposal
- [ ] 生成正确的 Diff 格式
- [ ] 设置正确的 proposerMeta

### 限流处理

- [ ] 检测 API 限流
- [ ] 正确等待并重试
- [ ] 记录限流日志

---

## 调度测试

### 自动唤醒触发

- [ ] 按 schedule 触发唤醒
- [ ] 生成唤醒提醒信息
- [ ] 记录唤醒历史
- [ ] 手动触发唤醒 (POST /api/scheduler/wake/trigger)

### 爬取调度

- [ ] 按 schedule 触发爬取
- [ ] 爬取完成后生成 Proposals
- [ ] 记录爬取历史
- [ ] 手动触发爬取 (POST /api/scheduler/crawl/trigger)

### 交接信号

- [ ] 监控上下文 token 数
- [ ] 触发交接信号
- [ ] 生成交接摘要
- [ ] 手动触发交接 (POST /api/scheduler/handoff/trigger)

---

## Web 前端

### Dashboard 加载

- [ ] 正确加载统计数据
- [ ] 显示待处理 Proposals 数量
- [ ] 显示最近活动

### Skills 列表与筛选

- [ ] 加载 Skills 列表
- [ ] 按范围筛选 (user/project)
- [ ] 搜索功能
- [ ] 点击查看详情

### Proposals 列表与筛选

- [ ] 加载 Proposals 列表
- [ ] 按状态筛选 (pending/approved/rejected)
- [ ] 按范围筛选
- [ ] 点击查看详情

### Diff 展示

- [ ] 正确渲染 Diff
- [ ] 语法高亮
- [ ] 行号显示
- [ ] 添加/删除行颜色区分

### 批准/拒绝操作

- [ ] 批准按钮功能
- [ ] 拒绝按钮功能
- [ ] 输入决策理由
- [ ] 操作后刷新列表

### 偏好设置

- [ ] 加载当前偏好
- [ ] 修改主题设置
- [ ] 修改通知设置
- [ ] 保存偏好

### Config 编辑

- [ ] 加载当前配置
- [ ] 编辑配置字段
- [ ] 验证配置格式
- [ ] 保存配置

---

## 插件

### 自动加载 skills-admin

- [ ] 检测 .cursor/skills/skills-admin/SKILL.md
- [ ] 自动加载 Skill 内容
- [ ] 在 Agent 上下文中可用

### 初始化命令

- [ ] 命令面板中显示 OpenSkills: Init
- [ ] 执行初始化流程
- [ ] 创建所需目录和文件

### TreeView 显示

- [ ] 显示 Skills 树
- [ ] 显示 Proposals 树
- [ ] 状态图标正确
- [ ] 点击打开详情

### 状态栏

- [ ] 显示 OpenSkills 状态
- [ ] 显示待处理 Proposals 数量
- [ ] 点击打开 Web 界面

### 降级模式

- [ ] API 不可用时显示警告
- [ ] 提供手动重连选项
- [ ] 保持基本功能可用

---

## 端到端

### Agent 提议 → 管理员审查 → 应用

- [ ] Agent 创建 Proposal
- [ ] 管理员审查并批准
- [ ] 自动应用变更
- [ ] 验证文件已更新

### Crawler 提议 → 审查 → 应用

- [ ] Crawler 发现新 Skill
- [ ] 生成 Proposal
- [ ] 管理员审查
- [ ] 应用或拒绝

### 回滚

- [ ] 选择历史记录
- [ ] 执行回滚
- [ ] 验证文件已恢复

### 自动唤醒

- [ ] 等待唤醒时间
- [ ] 检查唤醒提醒
- [ ] Agent 响应唤醒

### 交接

- [ ] 模拟上下文超限
- [ ] 触发交接信号
- [ ] 验证交接摘要
- [ ] 新 Agent 继续工作

---

## 运行测试

```bash
# 运行 API 测试
cd packages/api
npm test

# 运行端到端验证
npx ts-node scripts/verify-flow.ts

# 运行特定测试文件
npm test -- --testPathPattern=proposals

# 查看测试覆盖率
npm test -- --coverage
```

## 更新日志

| 日期 | 更新内容 | 负责人 |
|------|----------|--------|
| 2024-01-xx | 创建验证清单 | Test Agent |

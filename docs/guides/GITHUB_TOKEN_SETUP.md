# GitHub Token 配置指南

## 为什么需要 GitHub Token？

OpenSkills 的 Crawler 需要 GitHub Token 来访问 GitHub API，以便：
- 搜索包含 Skills 的仓库
- 获取仓库信息和内容
- 提高 API 速率限制（从 60 requests/hour 提升到 5000 requests/hour）

## 如何创建 GitHub Personal Access Token

由于 GitHub API 不支持直接用账密创建 token，需要手动创建：

### 步骤 1：访问 GitHub Token 设置页面

1. 打开浏览器，访问：https://github.com/settings/tokens
2. 使用您的 GitHub 账号登录

### 步骤 2：创建新的 Token

1. 点击页面右上角的 **"Generate new token"** 按钮
2. 选择 **"Generate new token (classic)"**

### 步骤 3：配置 Token

1. **Note（备注）**：输入 `OpenSkills Crawler` 或任何您喜欢的名称
2. **Expiration（过期时间）**：选择过期时间（建议选择 90 天或更长）
3. **Select scopes（选择权限）**：
   - ✅ 勾选 `public_repo`（访问公共仓库）
   - ✅ 可选：勾选 `repo`（如果需要访问私有仓库）

### 步骤 4：生成并复制 Token

1. 滚动到页面底部，点击 **"Generate token"** 按钮
2. **重要**：立即复制生成的 token（格式：`ghp_xxxxxxxxxxxx`）
   - ⚠️ 此 token 只会显示一次，请妥善保存
   - 如果丢失，需要重新生成

## 配置 Token 到 OpenSkills

### 方法 1：环境变量（推荐，更安全）

复制 `.env.example` 为 `.env`，设置：

```
GITHUB_TOKEN=ghp_您复制的token
```

API 与爬虫会优先读取 `GITHUB_TOKEN` 环境变量，**无需**写入配置文件。

### 方法 2：使用 Web UI

1. 启动 OpenSkills Web UI
2. 导航到 **Config** 页面
3. 在 **GitHub Token** 字段中输入您的 token
4. 点击 **Save** 保存  
   （会写入 `config.json`，建议仅本地使用，勿提交到 Git）

### 方法 3：使用 API

```bash
curl -X PUT http://localhost:<API_PORT>/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "crawl": {
      "githubToken": "ghp_your_token_here"
    }
  }'
```

## 验证配置

配置完成后，可以通过以下方式验证：

1. **检查 Crawler 状态**：
   ```bash
   curl http://localhost:<API_PORT>/api/crawler/status
   ```
   应该显示 `hasToken: true`

2. **手动触发一次爬取**：
   ```bash
   curl -X POST http://localhost:<API_PORT>/api/crawler/trigger
   ```
   检查是否成功搜索到仓库

3. **查看爬取记录**：
   检查 `.openskills/crawled/runs/` 目录下的最新记录
   应该显示 `reposSearched > 0`

## 安全注意事项

⚠️ **重要安全提示**：

1. **优先使用环境变量**
   - 在 `.env` 中设置 `GITHUB_TOKEN`（`.env` 已被 `.gitignore` 排除）
   - `.openskills/config.json` 已加入 `.gitignore`，请勿将 token 写入该文件后提交

2. **定期轮换 token**
   - 建议每 90 天更新一次 token
   - 如果 token 泄露，立即在 GitHub 设置中撤销

3. **使用最小权限原则**
   - 只授予必要的权限（`public_repo` 通常足够）
   - 不要授予不必要的权限

## 使用环境变量（可选，更安全）

如果您不想将 token 存储在配置文件中，可以使用环境变量：

1. **设置环境变量**：
   ```bash
   # Windows PowerShell
   $env:GITHUB_TOKEN="ghp_your_token_here"
   
   # Windows CMD
   set GITHUB_TOKEN=ghp_your_token_here
   
   # Linux/Mac
   export GITHUB_TOKEN=ghp_your_token_here
   ```

2. **修改代码读取环境变量**（需要代码支持）：
   在 `packages/api/src/crawler/githubClient.ts` 中，优先读取环境变量：
   ```typescript
   const token = process.env.GITHUB_TOKEN || config.githubToken;
   ```

## 故障排查

### 问题：Crawler 仍然显示 `reposSearched: 0`

**可能原因**：
1. Token 未正确配置
2. Token 已过期
3. Token 权限不足

**解决方案**：
1. 检查配置文件中的 token 是否正确
2. 访问 https://github.com/settings/tokens 检查 token 状态
3. 确保 token 有 `public_repo` 权限
4. 重新生成 token 并更新配置

### 问题：API 速率限制错误

**可能原因**：
1. 未配置 token（使用匿名访问，限制 60 requests/hour）
2. Token 无效

**解决方案**：
1. 配置有效的 GitHub token
2. 检查 token 是否过期

## 相关链接

- GitHub Token 设置：https://github.com/settings/tokens
- GitHub API 文档：https://docs.github.com/en/rest
- OpenSkills 文档：查看项目 README.md

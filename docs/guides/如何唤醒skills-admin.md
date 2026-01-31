# 如何唤醒 skills-admin

## 当前状态

✅ **扩展已正常运行**  
✅ **有 5 个 pending proposals 待审查**  
❌ **Cursor Agent CLI 未安装**（无法自动唤醒）

---

## ⚠️ Cursor CLI 登录与权限（必读）

- **编辑器登录 ≠ CLI 登录**。即使已在 Cursor 中登录，首次使用「触发唤醒」时，终端可能提示「Signing in」并给出链接，请**点击终端中的链接**在浏览器中完成 CLI 登录（仅需一次）。详见 **[用户操作手册 - Cursor CLI 登录](用户操作手册.md#二cursor-cli-登录必读)**。
- **CLI 可能没有某些命令执行权限**：若出现找不到 `agent`、下载/解压失败、写入权限错误等，请查阅 **[用户操作手册 - CLI 权限问题](用户操作手册.md#三cli-可能没有某些命令执行权限的问题)** 及 `TROUBLESHOOTING.md`。

---

## 解决方案

### 方案 1：安装 Cursor Agent CLI（推荐，支持自动唤醒）

#### Windows 用户（推荐使用 WSL）

1. **安装 WSL**（如果尚未安装）：
   ```powershell
   wsl --install
   ```
   安装后重启电脑。

2. **在 WSL 中安装 Cursor Agent CLI**：
   ```bash
   curl https://cursor.com/install -fsSL | bash
   ```

3. **将 CLI 加入 PATH**：
   编辑 `~/.bashrc`：
   ```bash
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   ```

4. **验证安装**：
   ```bash
   agent --version
   ```
   应该输出版本号。

5. **在 Cursor 中使用**：
   - 重启 Cursor 或重新加载窗口（`Ctrl+Shift+P` → `Developer: Reload Window`）
   - 现在可以使用「OpenSkills: Trigger Wake」命令自动唤醒

#### Windows 用户（使用 Git Bash）

1. **打开 Git Bash**

2. **安装 Cursor Agent CLI**：
   ```bash
   curl https://cursor.com/install -fsSL | bash
   ```

3. **将 CLI 加入 PATH**：
   编辑 `~/.bashrc`（在 Git Bash 中）：
   ```bash
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   ```

4. **验证安装**：
   ```bash
   agent --version
   ```

5. **在 Cursor 中使用**：
   - 确保 Cursor 的终端设置为 Git Bash
   - 使用「OpenSkills: Trigger Wake」命令

---

### 方案 2：手动唤醒（无需安装 CLI）

如果暂时不想安装 CLI，可以手动唤醒 skills-admin：

1. **在 Cursor 中打开聊天**（`Ctrl+L` 或点击聊天图标）

2. **输入以下任一命令**：
   - `审查建议`
   - `review proposals`
   - `担任管理员`
   - `审查 .openskills/proposals/ 下的 pending proposals`

3. **Cursor 会自动加载 skills-admin**，开始审查流程

---

## 验证唤醒是否成功

### 自动唤醒（使用 CLI）

1. 执行「OpenSkills: Trigger Wake」命令
2. 应该会打开一个名为「OpenSkills Wake」的终端
3. **若终端出现「Signing in」和链接**：请点击该链接在浏览器中完成 Cursor CLI 登录（与编辑器登录分开，仅需一次）
4. 终端中会执行 `agent chat "审查建议..."` 命令
5. Agent 开始运行并审查 proposals

### 手动唤醒

1. 在聊天中输入「审查建议」
2. Cursor 会加载 skills-admin Skill
3. Agent 会开始审查 `.openskills/proposals/` 下的 pending proposals
4. 查看聊天输出，应该能看到审查过程

---

## 常见问题

### Q: 为什么需要安装 Cursor Agent CLI？

A: Cursor Agent CLI 允许扩展程序化地启动 Cursor Agent。没有 CLI 时，只能手动在聊天中输入命令。

### Q: 安装 CLI 后还是无法唤醒？

A: 
1. 确保 CLI 在 PATH 中：`agent --version` 应该能运行
2. 重启 Cursor 或重新加载窗口
3. 检查扩展配置：`openskills.wakeUseAgentCli` 应该为 `true`

### Q: 手动唤醒时没有反应？

A:
1. 确保在 OpenSkills 项目目录中
2. 确保 `.cursor/skills/skills-admin/SKILL.md` 存在
3. 尝试更明确的命令：「审查 .openskills/proposals/ 下的 pending proposals」

### Q: 如何查看当前有多少 pending proposals？

A:
1. 查看扩展侧边栏的「Proposals」视图
2. 查看状态栏（左下角）显示的 pending 数量
3. 查看 `.openskills/wake/pending.json` 文件

### Q: 在管理员面板点击「手动唤醒管理员」没有启动 Agent？

A: **重要**：该按钮能否真正执行 Trigger Wake 并启动 Agent，取决于打开方式。
- **在 Cursor 扩展面板内**（侧边栏 OpenSkills → 管理员）：会执行 Trigger Wake，会启动 Agent。
- **在独立浏览器中**（如点击「在浏览器中打开」后访问 /admin）：只会触发 API 记录，**不会**执行 Trigger Wake，**不会**启动 Agent。

要真正启动 Agent，请：
1. 在 Cursor 侧边栏的 OpenSkills 面板中进入管理员页面，再点击「手动唤醒管理员」；或
2. 直接运行命令面板中的 **`OpenSkills: Trigger Wake`**。

---

## 下一步

1. **选择方案**：安装 CLI（自动）或手动唤醒（无需安装）
2. **执行唤醒**：使用扩展命令或手动输入
3. **查看结果**：在聊天中查看审查过程和决策

---

## 相关文档

- **用户操作手册**：`用户操作手册.md` — CLI 登录流程、CLI 权限/环境问题、日常操作
- `QUICK_REFERENCE.md` - 快速参考，包含 CLI 安装步骤
- `docs/ARCHITECTURE_FIX.md` - 架构修复说明
- `TROUBLESHOOTING.md` - 故障排除
- `交接文档.md` - 完整交接文档

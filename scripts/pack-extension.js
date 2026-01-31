#!/usr/bin/env node
/**
 * One-click pack: build extension + API + Web, bundle templates and servers, produce .vsix.
 * Run from repo root: node scripts/pack-extension.js
 * Or: npm run pack
 */

const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
process.chdir(repoRoot);

console.log('[pack] OpenSkills 一键打包');
console.log('[pack] 工作目录:', repoRoot);
console.log('[pack] 步骤: 编译扩展 → 构建 API/Web → 打包模板与内嵌服务 → 生成 .vsix\n');

try {
  execSync('npm run ext:package', {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });
  const vsixPath = path.join(repoRoot, 'packages', 'extension', 'openskills-0.1.0.vsix');
  console.log('\n[pack] 完成。安装包:', vsixPath);
  console.log('[pack] 安装: 命令面板执行 "Extensions: Install from VSIX" 并选择上述文件。');
} catch (e) {
  process.exit(e.status ?? 1);
}

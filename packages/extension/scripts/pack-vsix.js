/**
 * Package the extension in an isolated directory so workspace symlinks
 * (packages/api, packages/web) are not included in the .vsix.
 * Run from repo root: node packages/extension/scripts/pack-vsix.js
 * Or from packages/extension: node scripts/pack-vsix.js
 *
 * Auto-install after pack (local "pack = update"):
 *   node scripts/pack-vsix.js --install
 *   or set OPENSKILLS_INSTALL_AFTER_PACK=1 then run this script.
 *   npm run package:install (in packages/extension) / npm run pack:install (root) do both.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const extDir = path.resolve(__dirname, '..');
const packDir = path.join(extDir, '.vsix-pack');
const outDir = path.join(extDir, 'out');
const repoRoot = path.join(extDir, '..', '..');

const COPY = [
  { from: 'package.json', to: 'package.json' },
  { from: '.vscodeignore', to: '.vscodeignore' },
  { from: 'tsconfig.json', to: 'tsconfig.json' },
  { from: 'media', to: 'media' },
  { from: 'out', to: 'out' },
  { from: 'src', to: 'src' },
];

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) rmrf(p);
    else fs.unlinkSync(p);
  });
  fs.rmdirSync(dir);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((f) => copyRecursive(path.join(src, f), path.join(dest, f)));
  } else {
    if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  if (!fs.existsSync(outDir)) {
    console.error('Run compile first: npm run compile');
    process.exit(1);
  }

  // vsce requires PNG icon; media/icon.png is committed (generated from media/icon.svg)
  if (!fs.existsSync(path.join(extDir, 'media', 'icon.png'))) {
    console.error('media/icon.png missing. Add a 128x128 PNG (e.g. export from icon.svg).');
    process.exit(1);
  }

  console.log('Preparing isolated pack directory...');
  rmrf(packDir);
  fs.mkdirSync(packDir, { recursive: true });

  for (const { from, to } of COPY) {
    const src = path.join(extDir, from);
    const dst = path.join(packDir, to);
    if (!fs.existsSync(src)) {
      console.warn('Skip (missing):', from);
      continue;
    }
    copyRecursive(src, dst);
    console.log('Copied:', from, '->', to);
  }

  const licenseSrc = path.join(repoRoot, 'LICENSE');
  if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, path.join(packDir, 'LICENSE'));
    console.log('Copied: LICENSE (repo root -> extension)');
  }

  // Bundle .cursor, .openskills (templates only), .vscode from repo root so init can copy to workspace
  const templatesDir = path.join(packDir, 'resources', 'templates');
  const copyRepo = (repoSubdir, templateSubdir) => {
    const src = path.join(repoRoot, repoSubdir);
    const dst = path.join(templatesDir, templateSubdir || repoSubdir);
    if (!fs.existsSync(src)) {
      console.warn('Skip template (missing):', repoSubdir);
      return;
    }
    if (!fs.existsSync(path.dirname(dst))) fs.mkdirSync(path.dirname(dst), { recursive: true });
    copyRecursive(src, dst);
    console.log('Template:', repoSubdir, '->', path.join('resources/templates', templateSubdir || repoSubdir));
  };
  copyRepo('.cursor/rules', '.cursor/rules');
  copyRepo('.cursor/skills', '.cursor/skills');
  copyRepo('.cursor/agents', '.cursor/agents');
  copyRepo('.openskills/schemas', '.openskills/schemas');
  const configSrc = path.join(repoRoot, '.openskills', 'config.json');
  if (fs.existsSync(configSrc)) {
    const configDst = path.join(templatesDir, '.openskills', 'config.json');
    if (!fs.existsSync(path.dirname(configDst))) fs.mkdirSync(path.dirname(configDst), { recursive: true });
    // Strip secrets so vsce does not reject the package (GitHub token must not be published)
    let configJson;
    try {
      configJson = JSON.parse(fs.readFileSync(configSrc, 'utf-8'));
      if (configJson.crawl && typeof configJson.crawl.githubToken === 'string') {
        configJson.crawl = { ...configJson.crawl, githubToken: '' };
      }
    } catch (e) {
      configJson = {};
    }
    fs.writeFileSync(configDst, JSON.stringify(configJson, null, 2), 'utf-8');
    console.log('Template: .openskills/config.json -> resources/templates/.openskills/config.json (secrets stripped)');
  }
  const vscodeDir = path.join(templatesDir, '.vscode');
  if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });
  const tasksSrc = path.join(repoRoot, '.vscode', 'tasks.json');
  const launchSrc = path.join(repoRoot, '.vscode', 'launch.json');
  if (fs.existsSync(tasksSrc)) { fs.copyFileSync(tasksSrc, path.join(vscodeDir, 'tasks.json')); console.log('Template: .vscode/tasks.json'); }
  if (fs.existsSync(launchSrc)) { fs.copyFileSync(launchSrc, path.join(vscodeDir, 'launch.json')); console.log('Template: .vscode/launch.json'); }

  // Bundle built API and Web so embedded servers can start without workspace packages
  const serversDir = path.join(packDir, 'resources', 'servers');
  if (!fs.existsSync(serversDir)) fs.mkdirSync(serversDir, { recursive: true });

  let apiBuilt = false;
  let webBuilt = false;
  try {
    console.log('Building API for bundled servers...');
    execSync('npm run build -w packages/api', { cwd: repoRoot, stdio: 'inherit', shell: true });
    apiBuilt = true;
  } catch (e) {
    console.warn('API build failed (bundled API will be skipped). Fix packages/api TypeScript and re-pack to enable auto-start from .vsix.');
  }
  try {
    console.log('Building Web for bundled servers...');
    execSync('npm run build -w packages/web', { cwd: repoRoot, stdio: 'inherit', shell: true });
    webBuilt = true;
  } catch (e) {
    console.warn('Web build failed (bundled Web will be skipped). Fix packages/web and re-pack to enable auto-start from .vsix.');
  }

  const apiDist = path.join(repoRoot, 'packages', 'api', 'dist');
  const apiPkg = path.join(repoRoot, 'packages', 'api', 'package.json');
  const bundledApi = path.join(serversDir, 'api');
  if (apiBuilt && fs.existsSync(apiDist) && fs.existsSync(apiPkg)) {
    if (!fs.existsSync(bundledApi)) fs.mkdirSync(bundledApi, { recursive: true });
    copyRecursive(apiDist, path.join(bundledApi, 'dist'));
    fs.copyFileSync(apiPkg, path.join(bundledApi, 'package.json'));
    console.log('Installing API production deps in pack dir...');
    execSync('npm install --omit=dev', { cwd: bundledApi, stdio: 'inherit', shell: true });
    console.log('Bundled: resources/servers/api');
  }

  const webDist = path.join(repoRoot, 'packages', 'web', 'dist');
  const bundledWeb = path.join(serversDir, 'web');
  if (webBuilt && fs.existsSync(webDist)) {
    copyRecursive(webDist, path.join(bundledWeb, 'dist'));
    console.log('Bundled: resources/servers/web/dist');
  }

  const serveWebSrc = path.join(extDir, 'resources', 'servers', 'serve-web.js');
  if (fs.existsSync(serveWebSrc)) {
    fs.copyFileSync(serveWebSrc, path.join(serversDir, 'serve-web.js'));
    console.log('Bundled: resources/servers/serve-web.js');
  }

  console.log('Installing production dependencies in pack dir...');
  execSync('npm install --omit=dev', { cwd: packDir, stdio: 'inherit', shell: true });

  console.log('Running vsce package...');
  execSync('npx vsce package --allow-missing-repository', { cwd: packDir, stdio: 'inherit', shell: true });

  const vsixGlob = path.join(packDir, '*.vsix');
  const vsixFiles = fs.readdirSync(packDir).filter((f) => f.endsWith('.vsix'));
  if (vsixFiles.length === 0) {
    console.error('No .vsix produced');
    process.exit(1);
  }
  const vsixName = vsixFiles[0];
  const vsixSrc = path.join(packDir, vsixName);
  const vsixDest = path.join(extDir, vsixName);
  fs.renameSync(vsixSrc, vsixDest);
  console.log('Created:', vsixDest);

  console.log('Cleaning pack dir...');
  rmrf(packDir);

  // Optional: install into Cursor/VS Code so "pack = auto update" locally
  const shouldInstall = process.env.OPENSKILLS_INSTALL_AFTER_PACK === '1' || process.argv.includes('--install');
  if (shouldInstall) {
    const cursorExeWin = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'Cursor.exe');
    const candidates =
      process.platform === 'win32'
        ? [fs.existsSync(cursorExeWin) ? cursorExeWin : null, 'cursor', 'code'].filter(Boolean)
        : process.platform === 'darwin'
          ? ['/usr/local/bin/cursor', 'cursor', 'code']
          : ['cursor', 'code'];
    let installed = false;
    for (const cmd of candidates) {
      try {
        const runCmd = path.isAbsolute(cmd) ? `"${cmd}" --install-extension "${vsixDest}"` : `${cmd} --install-extension "${vsixDest}"`;
        execSync(runCmd, { stdio: 'inherit', shell: true });
        installed = true;
        console.log('Installed into editor. Reload the window (Ctrl+Shift+P -> "Developer: Reload Window") to use the new version.');
        break;
      } catch (e) {
        // try next candidate
      }
    }
    if (!installed) {
      console.warn('Could not install: cursor/code not found. Install manually: Extensions -> "..." -> Install from VSIX ->', vsixDest);
    }
  }

  console.log('Done.');
}

main();

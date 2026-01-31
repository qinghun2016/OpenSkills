/**
 * Serves bundled Web static files and proxies /api to the OpenSkills API.
 * Used when the extension is installed from .vsix (no workspace packages/api or packages/web).
 * Env: PORT (web port), API_PORT (API port to proxy to).
 */
if (process.env.OPENSKILLS_PROCESS_NAME) {
  process.title = process.env.OPENSKILLS_PROCESS_NAME;
}
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT) || 3848;
const API_PORT = Number(process.env.API_PORT) || 3847;
const SERVE_ROOT = process.env.SERVE_ROOT || path.join(__dirname, 'web', 'dist');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(filePath, res) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    if (res.headersSent) return;
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  res.writeHead(200, { 'Content-Type': mime });
  stream.pipe(res);
}

function proxyToApi(req, res, pathname, search) {
  const target = `http://127.0.0.1:${API_PORT}${pathname}${search || ''}`;
  const opts = url.parse(target);
  opts.method = req.method;
  opts.headers = { ...req.headers, host: `127.0.0.1:${API_PORT}` };
  const proxy = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', (err) => {
    res.writeHead(502);
    res.end(`Bad Gateway: ${err.message}`);
  });
  req.pipe(proxy);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (pathname.startsWith('/api')) {
    proxyToApi(req, res, pathname, parsed.search);
    return;
  }

  let filePath = path.join(SERVE_ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!pathname.includes('.')) {
    const tryIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(tryIndex)) filePath = tryIndex;
    else if (!fs.existsSync(filePath)) filePath = path.join(SERVE_ROOT, 'index.html');
  }
  serveStatic(filePath, res);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`OpenSkills Web: http://127.0.0.1:${PORT} (API proxy -> ${API_PORT})\n`);
});

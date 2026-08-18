/* =====================================================
 * 吃什么 · 本地服务器（零依赖，Node 14+）
 *
 * 作用：
 *  1. 静态托管本目录页面（电脑/手机浏览器都能开）
 *  2. /chat 代理转发到 DeepSeek（key 在服务端，前端零配置）
 *
 * 用法：
 *  电脑：node server.js  → 打开 http://localhost:8899
 *  手机：同一 WiFi 下打开 http://<电脑IP>:8899
 *  key 来源优先级：环境变量 DEEPSEEK_API_KEY → 本目录 deepseek.key 文件 → 请求头
 * ===================================================== */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8899;
const ROOT = __dirname;
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function send(res, code, text, headers) {
  res.writeHead(code, headers || { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/* ---- 静态文件（仅白名单扩展名，敏感文件一律拦截） ---- */
const ALLOWED_EXT = ['.html', '.css', '.js', '.png', '.ico', '.svg', '.webp', '.jpg', '.jpeg', '.webmanifest'];
const SENSITIVE_NAME = /^\.|\.key$|\.log$|\.pid$|^deepseek\.|^package\.json$|^railway\.json$|^start\.sh$|^deploy\.sh$|^\.gitignore$|^灵感收件箱/;
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  const base = path.basename(filePath);
  const ext = path.extname(filePath);
  /* 只允许白名单扩展名 + 拒绝敏感文件名 */
  if (!ALLOWED_EXT.includes(ext) || SENSITIVE_NAME.test(base)) return send(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    /* no-cache：让手机浏览器/主屏幕 App 每次都校验最新版本，避免旧代码缓存 */
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  });
}

/* ---- 读取服务端 DeepSeek key ---- */
function getServerKey(req) {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  try {
    /* 只取第一行，避免粘贴时带入换行/空格 */
    const f = fs.readFileSync(path.join(ROOT, 'deepseek.key'), 'utf8').split('\n')[0].trim();
    if (f) return f;
  } catch (e) { /* 文件不存在则忽略 */ }
  const h = req.headers['authorization'];
  if (h) return h.replace(/^Bearer\s+/i, '');
  return null;
}

/* ---- LLM 代理 ---- */
function proxyChat(req, res) {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch (e) { return send(res, 400, 'bad json'); }

    const apiKey = getServerKey(req);
    if (!apiKey) return send(res, 401, 'missing key (env DEEPSEEK_API_KEY or deepseek.key)');

    const payload = JSON.stringify({
      model: body.model || 'deepseek-chat',
      messages: body.messages || [],
      stream: false,
      temperature: body.temperature !== undefined ? body.temperature : 0.7
    });

    const u = new URL(DEEPSEEK_URL);
    const req2 = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': 'Bearer ' + apiKey
      }
    }, (res2) => {
      let out = '';
      res2.on('data', (c) => { out += c; });
      res2.on('end', () => {
        res.writeHead(res2.statusCode, { 'Content-Type': 'application/json' });
        res.end(out);
      });
    });
    req2.on('error', (e) => send(res, 502, JSON.stringify({ error: e.message })));
    req2.write(payload);
    req2.end();
  });
}

const server = http.createServer((req, res) => {
  // 允许来自任意来源（file:// 页面也能调）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (req.method === 'POST' && req.url.startsWith('/chat')) return proxyChat(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 405, 'Method Not Allowed');
});

server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  const ips = [];
  Object.values(nets).forEach(list => (list || []).forEach(n => {
    if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }));
  console.log('🍜 吃什么 · 已启动');
  console.log('  本机访问：   http://localhost:' + PORT);
  ips.forEach(ip => console.log('  手机访问：   http://' + ip + ':' + PORT));
  console.log('  AI key：' + (getServerKey({ headers: {} }) ? '已配置（服务端）' : '未配置（env DEEPSEEK_API_KEY 或 deepseek.key）'));
});

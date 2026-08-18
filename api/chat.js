/* =====================================================
 * Vercel Serverless 函数：LLM 代理（解决浏览器跨域）
 * 部署后自动成为 /api/chat，页面设置里 API 地址填 /api/chat
 * 本地预览：npx vercel dev
 * ===================================================== */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body;
  try { body = req.body || {}; } catch (e) { return res.status(400).json({ error: 'bad body' }); }

  const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!key) return res.status(401).json({ error: 'missing Authorization header' });

  const payload = {
    model: body.model || 'deepseek-chat',
    messages: body.messages || [],
    stream: false,
    temperature: body.temperature !== undefined ? body.temperature : 0.7
  };

  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e && e.message || e) });
  }
}

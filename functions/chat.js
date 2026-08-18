/* =====================================================
 * Cloudflare Pages Functions：LLM 代理（解决浏览器跨域）
 * 部署后自动成为 /chat，页面设置里 API 地址填 /chat
 * ===================================================== */
export async function onRequestPost(context) {
  const { request } = context;
  const key = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) {
    return new Response(JSON.stringify({ error: 'missing Authorization header' }), {
      status: 401, headers: { 'content-type': 'application/json' }
    });
  }

  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: 'bad json' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

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
    return new Response(JSON.stringify(data), {
      status: r.status, headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
      status: 502, headers: { 'content-type': 'application/json' }
    });
  }
}

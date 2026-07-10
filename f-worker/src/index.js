import { rejectSensitiveGetQuery } from './middleware/redact.js';
import { redactText } from './utils/redact.js';

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      console.error('fetch error', redactText(e?.message || 'unknown'));
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const { cleanupAuditLogs } = await import('./services/audit-service.js');
        const { cronRefreshBest } = await import('./services/best-service.js');
        if (env.off_log !== '1') {
          await cleanupAuditLogs(env);
        }
        await cronRefreshBest(env);
      })(),
    );
  },
};

async function handleRequest(request, env, ctx) {
  const blocked = rejectSensitiveGetQuery(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (pathname === '/health') {
    return new Response(
      JSON.stringify({ ok: true, service: 'f-ui', version: '1.0.0', domain: env.domain ?? null }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  if (pathname === '/ADD.txt' || pathname === '/add.txt') {
    return new Response('Forbidden', { status: 403 });
  }

  if (pathname.startsWith('/api/')) {
    const { default: app } = await import('./hono/app.js');
    return app.fetch(request, env, ctx);
  }

  if (pathname.startsWith('/sub/')) {
    const { handleSubRequest } = await import('./subscription/handler.js');
    return handleSubRequest(request, env);
  }

  if (env.proxy_enabled === '1') {
    const { handleProxyRequest } = await import('./proxy/handler.js');
    const proxyResponse = await handleProxyRequest(request, env);
    if (proxyResponse) return proxyResponse;
  }

  const assets = env.ASSETS ?? env.assets;
  if (!assets?.fetch) {
    return new Response('ASSETS binding missing', { status: 500 });
  }

  let response = await assets.fetch(request);

  if (response.status === 404 && !looksLikeStaticAsset(pathname)) {
    response = await assets.fetch(
      new Request(new URL('/index.html', url.origin), request),
    );
  }

  return response;
}

function looksLikeStaticAsset(pathname) {
  const last = pathname.split('/').pop() ?? '';
  return last.includes('.');
}


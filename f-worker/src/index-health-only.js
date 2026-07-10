export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ ok: true, service: 'f-ui', mode: 'health-only', domain: env.domain ?? null }),
        { headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }

    return new Response('F-UI health-only online', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};

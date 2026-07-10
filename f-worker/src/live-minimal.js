export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'f-ui-live',
        mode: 'minimal',
        time: new Date().toISOString(),
      }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return new Response('F-UI live online', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};

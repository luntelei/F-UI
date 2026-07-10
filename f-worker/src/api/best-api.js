import { Hono } from 'hono';
import { bestAccessMiddleware } from '../middleware/best-auth.js';
import { getBestCache, buildAddTxt, normalizeCacheEntries } from '../services/best-service.js';
import { ok } from '../utils/response.js';

const bestApi = new Hono();

bestApi.use('*', bestAccessMiddleware);

bestApi.get('/entries', async (c) => {
  const cache = await getBestCache(c.env);
  const entries = normalizeCacheEntries(cache);
  return c.json(
    ok({
      entries,
      ips: entries.map((e) => e.ip),
      updatedAt: cache?.updatedAt ?? null,
      count: entries.length,
    }),
  );
});

bestApi.get('/add.txt', async (c) => {
  const cache = await getBestCache(c.env);
  const body = buildAddTxt(normalizeCacheEntries(cache));
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
});

export default bestApi;

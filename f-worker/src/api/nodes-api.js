import { Hono } from 'hono';
import { ok, fail, AppError } from '../utils/response.js';
import {
  listNodes,
  getNode,
  createNode,
  updateNode,
  deleteNode,
  getNodeLink,
} from '../services/node-service.js';
import { clearNodePresence } from '../services/node-presence-service.js';
import { getUserId } from '../middleware/auth.js';

const nodesApi = new Hono();

nodesApi.get('/', async (c) => {
  return c.json(ok(await listNodes(c.env)));
});

nodesApi.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await getNode(c.env, id);
  if (!row) return c.json(fail('节点不存在', 404), 404);
  return c.json(ok(row));
});

nodesApi.post('/', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.config?.uuid && (body.type === 'vless_ws' || body.type === 'socks5_chain' || !body.type)) {
      body.config = { ...(body.config || {}), uuid: crypto.randomUUID() };
    }
    const row = await createNode(c.env, body);
    return c.json(ok(row));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '创建失败'), status);
  }
});

nodesApi.patch('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!id) return c.json(fail('id 不能为空', 400), 400);
    const body = await c.req.json();
    const row = await updateNode(c.env, id, body);
    return c.json(ok(row));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '更新失败'), status);
  }
});

nodesApi.delete('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!id) return c.json(fail('id 不能为空', 400), 400);
    await deleteNode(c.env, id);
    return c.json(ok());
  } catch (e) {
    return c.json(fail(e.message || '删除失败'), 500);
  }
});

nodesApi.post('/:id/link', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!id) return c.json(fail('id 不能为空', 400), 400);
    const link = await getNodeLink(c.env, id, {
      userId: getUserId(c),
      ip: c.req.header('CF-Connecting-IP') || null,
    });
    return c.json(ok({ link }));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '获取失败'), status);
  }
});

nodesApi.post('/:id/presence/reset', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!id) return c.json(fail('id 不能为空', 400), 400);
    await clearNodePresence(c.env, id);
    return c.json(ok());
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '重置失败'), status);
  }
});

export default nodesApi;

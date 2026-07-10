import { Hono } from 'hono';
import { ok, fail } from '../utils/response.js';
import {
  createRegKey,
  listRegKeys,
  deleteRegKey,
  isSuperAdminOnly,
  isSuperAdmin,
} from '../services/auth-service.js';
import { getUserId } from '../middleware/auth.js';

const regKeyApi = new Hono();

regKeyApi.get('/', async (c) => {
  return c.json(ok(await listRegKeys(c.env)));
});

regKeyApi.post('/', async (c) => {
  try {
    const user = c.get('user');
    if (isSuperAdminOnly(c.env) && !isSuperAdmin(c.env, user)) {
      return c.json(fail('仅 Super Admin 可发放邀请码', 403), 403);
    }
    const row = await createRegKey(c.env, getUserId(c), await c.req.json());
    return c.json(ok(row));
  } catch (e) {
    return c.json(fail(e.message || '创建失败'), 500);
  }
});

regKeyApi.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    if (isSuperAdminOnly(c.env) && !isSuperAdmin(c.env, user)) {
      return c.json(fail('仅 Super Admin 可删除邀请码', 403), 403);
    }
    await deleteRegKey(c.env, Number(c.req.param('id')));
    return c.json(ok());
  } catch (e) {
    return c.json(fail(e.message || '删除失败'), 500);
  }
});

export default regKeyApi;

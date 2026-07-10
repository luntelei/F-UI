import { Hono } from 'hono';
import { ok, fail, AppError } from '../utils/response.js';
import { listUsers, updateUser } from '../services/auth-service.js';

const usersApi = new Hono();

usersApi.get('/', async (c) => {
  const rows = await listUsers(c.env);
  return c.json(ok(rows));
});

usersApi.patch('/:id', async (c) => {
  try {
    const body = await c.req.json();
    const row = await updateUser(c.env, c.get('user'), { ...body, id: Number(c.req.param('id')) });
    return c.json(ok(row));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '更新失败'), status);
  }
});

export default usersApi;

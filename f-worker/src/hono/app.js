import { Hono } from 'hono';
import {
  authMiddleware,
  adminMiddleware,
  superAdminMiddleware,
  getUserId,
  getSessionToken,
} from '../middleware/auth.js';
import { blockSensitiveGetQuery, auditLogMiddleware } from '../middleware/redact.js';
import authApi from '../api/auth-api.js';
import regKeyApi from '../api/reg-key-api.js';
import manageApi from '../api/manage-api.js';
import nodesApi from '../api/nodes-api.js';
import usersApi from '../api/users-api.js';
import bestApi from '../api/best-api.js';
import { logoutUser, rotateSubToken } from '../services/auth-service.js';
import { queryCfUsage } from '../services/cf-usage-service.js';
import { getAnnouncementForUser } from '../services/settings-service.js';
import { ok, fail, AppError } from '../utils/response.js';

const app = new Hono();

app.use('*', blockSensitiveGetQuery);
app.use('*', auditLogMiddleware);

app.get('/health', (c) => {
  return c.json({
    ok: true,
    service: 'f-ui',
    version: '1.0.0',
    domain: c.env?.domain ?? null,
  });
});

app.route('/api/auth', authApi);
app.route('/api/best-ip', bestApi);

const accountApi = new Hono();
accountApi.use('*', authMiddleware);
accountApi.get('/profile', async (c) => {
  return c.json({ code: 0, message: 'ok', data: c.get('user') });
});
accountApi.post('/session/logout', async (c) => {
  await logoutUser(c.env, getUserId(c), getSessionToken(c));
  return c.json({ code: 0, message: 'ok', data: null });
});
accountApi.get('/announcement', async (c) => {
  const data = await getAnnouncementForUser(c.env);
  return c.json(ok(data));
});
accountApi.get('/subscription', async (c) => {
  const user = c.get('user');
  const domain = c.env.domain || '';
  const subUrl = domain ? `https://${domain}/sub/${user.subToken}?target=mixed` : null;
  return c.json({ code: 0, message: 'ok', data: { user, subUrl } });
});
accountApi.post('/subscription/rotate-token', async (c) => {
  const subToken = await rotateSubToken(c.env, getUserId(c));
  const domain = c.env.domain || '';
  const subUrl = domain ? `https://${domain}/sub/${subToken}?target=mixed` : null;
  return c.json({ code: 0, message: 'ok', data: { subUrl } });
});
app.route('/api/account', accountApi);

const adminApi = new Hono();
adminApi.use('*', authMiddleware);
adminApi.use('*', adminMiddleware);
adminApi.route('/', manageApi);
adminApi.post('/cloudflare/usage', async (c) => {
  try {
    const data = await queryCfUsage(c.env);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '查询失败'), status);
  }
});
adminApi.get('/ping', (c) => {
  return c.json({ code: 0, message: 'ok', data: { role: c.get('user').role } });
});
app.route('/api/admin', adminApi);

const superAdminNodesApi = new Hono();
superAdminNodesApi.route('/', nodesApi);

const superAdminUsersApi = new Hono();
superAdminUsersApi.route('/', usersApi);

const superAdminInviteCodesApi = new Hono();
superAdminInviteCodesApi.route('/', regKeyApi);

const superAdminApi = new Hono();
superAdminApi.use('*', authMiddleware);
superAdminApi.use('*', adminMiddleware);
superAdminApi.use('*', superAdminMiddleware);
superAdminApi.route('/nodes', superAdminNodesApi);
superAdminApi.route('/users', superAdminUsersApi);
superAdminApi.route('/invite-codes', superAdminInviteCodesApi);
superAdminApi.route('/', manageApi);
app.route('/api/super-admin', superAdminApi);

export default app;


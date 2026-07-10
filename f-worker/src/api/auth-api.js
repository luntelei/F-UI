import { Hono } from 'hono';
import { ok, fail, AppError } from '../utils/response.js';
import { registerUser, loginUser, countUsers } from '../services/auth-service.js';
import { verifyTurnstile, isInsecureDevAllowed } from '../services/turnstile-service.js';
import {
  getTurnstilePublicConfig,
} from '../services/settings-service.js';

const authApi = new Hono();

authApi.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const turnstile = await getTurnstilePublicConfig(c.env);
    if (turnstile.requireLogin) {
      await verifyTurnstile(
        c.env,
        body.turnstileToken || body.token,
        c.req.header('CF-Connecting-IP') || '',
      );
    }
    const data = await loginUser(c.env, body);
    c.set('userId', data.user?.id ?? null);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '登录失败'), status);
  }
});

authApi.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    if (body.termsAccepted !== true) {
      return c.json(fail('请先阅读并同意用户协议', 400), 400);
    }
    const total = await countUsers(c.env);
    if (total > 0 && !String(body.regKey || body.code || '').trim()) {
      return c.json(fail('注册需邀请码，请向管理员索取'), 403);
    }
    const turnstile = await getTurnstilePublicConfig(c.env);
    if (turnstile.requireRegister) {
      await verifyTurnstile(
        c.env,
        body.turnstileToken || body.token,
        c.req.header('CF-Connecting-IP') || '',
      );
    }
    const data = await registerUser(c.env, {
      email: body.email,
      password: body.password,
      regKeyCode: body.regKey || body.code,
    });
    c.set('userId', data.user?.id ?? null);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : (typeof e?.status === 'number' ? e.status : 500);
    return c.json(fail(e.message || '注册失败'), status);
  }
});

authApi.get('/bootstrap', async (c) => {
  const total = await countUsers(c.env);
  const allowBootstrap = total === 0;
  const turnstile = await getTurnstilePublicConfig(c.env);

  return c.json(
    ok({
      siteName: 'F-UI',
      version: '1.0.0',
      domain: c.env.domain ?? null,
      invitePolicy: c.env.invite_policy ?? 'super_admin_only',
      allowBootstrap,
      inviteOnly: !allowBootstrap,
      adminEmail: c.env.admin ?? null,
      turnstileSiteKey: isInsecureDevAllowed(c.env) ? null : turnstile.siteKey,
      requireTurnstile: !isInsecureDevAllowed(c.env) && turnstile.requireRegister,
      requireLoginTurnstile: !isInsecureDevAllowed(c.env) && turnstile.requireLogin,
    }),
  );
});

export default authApi;

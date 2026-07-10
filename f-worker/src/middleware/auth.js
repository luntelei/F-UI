import { AUTH_INFO_PREFIX, TOKEN_HEADER } from '../const/constants.js';
import { extractBearer, verifyJwt } from '../utils/jwt.js';
import { verifySession, isAdmin, isSuperAdmin } from '../services/auth-service.js';
import { fail } from '../utils/response.js';

const PUBLIC_PATHS = ['/api/auth/bootstrap', '/api/auth/login', '/api/auth/register'];

export async function authMiddleware(c, next) {
  const path = c.req.path;
  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
    return next();
  }
  if (!path.startsWith('/api/')) {
    return next();
  }

  if (!c.env.jwt_secret) {
    return c.json(fail('JWT_SECRET 未配置', 500), 500);
  }

  const raw = c.req.header(TOKEN_HEADER);
  const jwt = extractBearer(raw);
  if (!jwt) {
    return c.json(fail('未登录', 401), 401);
  }

  const payload = await verifyJwt(c.env, jwt);
  if (!payload?.userId || !payload?.token) {
    return c.json(fail('登录已过期', 401), 401);
  }

  const user = await verifySession(c.env, payload.userId, payload.token);
  if (!user) {
    return c.json(fail('登录已过期', 401), 401);
  }

  c.set('user', user);
  c.set('sessionToken', payload.token);
  c.set('userId', payload.userId);
  return next();
}

export async function adminMiddleware(c, next) {
  const user = c.get('user');
  if (!isAdmin(user)) {
    return c.json(fail('无权限', 403), 403);
  }
  return next();
}

export async function superAdminMiddleware(c, next) {
  const user = c.get('user');
  if (!isSuperAdmin(c.env, user)) {
    return c.json(fail('仅 Super Admin 可操作', 403), 403);
  }
  return next();
}

export function getUser(c) {
  return c.get('user');
}

export function getSessionToken(c) {
  return c.get('sessionToken');
}

export function getUserId(c) {
  return c.get('userId');
}


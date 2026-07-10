import { extractBearer, verifyJwt } from '../utils/jwt.js';
import { verifySession, isAdmin } from '../services/auth-service.js';
import { verifyBestToken } from '../services/best-service.js';
import { fail } from '../utils/response.js';

/** 拒绝只靠 query uuid 或 User-Agent 的伪鉴权方式。 */
function isLegacyUuidBypassAttempt(c) {
  const url = new URL(c.req.url);
  return url.searchParams.has('uuid');
}

export async function bestAccessMiddleware(c, next) {
  if (isLegacyUuidBypassAttempt(c)) {
    return c.json(fail('无权限', 403), 403);
  }

  const bestToken = c.req.header('X-Best-Token');
  if (bestToken && (await verifyBestToken(c.env, bestToken))) {
    c.set('bestAuth', 'token');
    return next();
  }

  if (!c.env.jwt_secret) {
    return c.json(fail('无权限', 403), 403);
  }

  const jwt = extractBearer(c.req.header('Authorization'));
  if (jwt) {
    const payload = await verifyJwt(c.env, jwt);
    if (payload?.userId && payload?.token) {
      const user = await verifySession(c.env, payload.userId, payload.token);
      if (user && isAdmin(user)) {
        c.set('user', user);
        c.set('bestAuth', 'admin');
        return next();
      }
    }
  }

  return c.json(fail('无权限', 403), 403);
}

import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { auditLogs, users } from '../db/schema.js';
import { redactUrl } from '../utils/redact.js';
import { getD1Binding } from '../utils/bindings.js';

const RETENTION_DAYS = 30;
const MAX_ROWS = 5000;

export async function writeAuditLog(env, {
  userId,
  action,
  method,
  ip,
  colo,
  country,
  asn,
  asOrganization,
  userAgent,
  pathRedacted,
  status,
}) {
  if (env.off_log === '1') return;
  const db = getDb(env);
  await db.insert(auditLogs).values({
    userId: userId ?? null,
    action,
    method: method ?? null,
    ip: ip ?? null,
    colo: colo ?? null,
    country: country ?? null,
    asn: Number(asn) || null,
    asOrganization: asOrganization ?? null,
    userAgent: userAgent ?? null,
    pathRedacted,
    status: status ?? null,
  });
}

export async function listAuditLogs(env, { limit = 50, offset = 0 } = {}) {
  const db = getDb(env);
  const rows = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      operatorEmail: users.email,
      operatorRole: users.role,
      action: auditLogs.action,
      method: auditLogs.method,
      ip: auditLogs.ip,
      colo: auditLogs.colo,
      country: auditLogs.country,
      asn: auditLogs.asn,
      asOrganization: auditLogs.asOrganization,
      userAgent: auditLogs.userAgent,
      pathRedacted: auditLogs.pathRedacted,
      status: auditLogs.status,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.id))
    .limit(Math.min(limit, 100))
    .offset(offset)
    .all();

  return rows.map((row) => ({
    ...row,
    operator: row.operatorEmail
      ? `${row.operatorEmail}${row.operatorRole ? ` (${row.operatorRole})` : ''}`
      : (row.userId ? `用户 #${row.userId}` : '公开访问'),
  }));
}

export function getRequestAuditContext(request) {
  const cf = request?.cf || {};
  return {
    ip: request.headers.get('CF-Connecting-IP') || null,
    colo: cf.colo || null,
    country: cf.country || null,
    asn: cf.asn || null,
    asOrganization: cf.asOrganization || null,
    userAgent: request.headers.get('User-Agent') || null,
  };
}

export function describeAuditAction(request, status) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const result = (okKey, failKey) => `logs.actions.${status < 400 ? okKey : (failKey || okKey)}`;
  const exact = (target, targetMethod, okKey, failKey) => (
    path === target && method === targetMethod ? result(okKey, failKey) : null
  );
  const match = (pattern, targetMethod, okKey, failKey) => (
    pattern.test(path) && method === targetMethod ? result(okKey, failKey) : null
  );

  if (path === '/api/auth/login') return result('login', 'loginFailed');
  if (path === '/api/auth/register') return result('register', 'registerFailed');
  if (path === '/api/account/session/logout') return result('logout');
  if (path === '/api/account/subscription/rotate-token') return result('rotateSub');
  if (path.startsWith('/sub/')) return result('fetchSub', 'fetchSubFailed');

  const mapped =
    exact('/api/super-admin/nodes', 'POST', 'nodeAdd', 'nodeAddFailed')
    || match(/^\/api\/super-admin\/nodes\/[^/]+$/, 'PATCH', 'nodeUpdate', 'nodeUpdateFailed')
    || match(/^\/api\/super-admin\/nodes\/[^/]+$/, 'DELETE', 'nodeDelete', 'nodeDeleteFailed')
    || match(/^\/api\/super-admin\/nodes\/[^/]+\/link$/, 'POST', 'nodeLink')
    || match(/^\/api\/super-admin\/nodes\/[^/]+\/presence\/reset$/, 'POST', 'nodeResetPresence')
    || match(/^\/api\/super-admin\/users\/[^/]+$/, 'PATCH', 'userUpdate', 'userUpdateFailed')
    || exact('/api/super-admin/invite-codes', 'POST', 'regKeyAdd', 'regKeyAddFailed')
    || match(/^\/api\/super-admin\/invite-codes\/[^/]+$/, 'DELETE', 'regKeyDelete', 'regKeyDeleteFailed')
    || exact('/api/super-admin/integrations/cloudflare/api-token', 'PUT', 'cfTokenSave', 'cfTokenSaveFailed')
    || exact('/api/super-admin/integrations/cloudflare/api-token', 'DELETE', 'cfTokenDelete')
    || exact('/api/super-admin/integrations/telegram/bot-token', 'PUT', 'tgBotSave', 'tgBotSaveFailed')
    || exact('/api/super-admin/integrations/telegram/bot-token', 'DELETE', 'tgBotDelete')
    || exact('/api/super-admin/integrations/telegram/chat', 'PUT', 'tgChatSave', 'tgChatSaveFailed')
    || exact('/api/super-admin/integrations/telegram/chat', 'DELETE', 'tgChatDelete')
    || exact('/api/super-admin/security/turnstile', 'PATCH', 'turnstileUpdate', 'turnstileUpdateFailed')
    || exact('/api/super-admin/announcement', 'PATCH', 'announcementUpdate', 'announcementUpdateFailed')
    || exact('/api/super-admin/integrations/telegram/test', 'POST', 'tgTest', 'tgTestFailed')
    || exact('/api/admin/subscription-converter/settings', 'PATCH', 'subConverterUpdate', 'subConverterUpdateFailed')
    || exact('/api/super-admin/best-ip/refresh', 'POST', 'bestRefresh', 'bestRefreshFailed')
    || exact('/api/super-admin/best-ip/access-tokens', 'POST', 'bestToken', 'bestTokenFailed')
    || exact('/api/super-admin/best-ip/settings', 'PATCH', 'bestSettings', 'bestSettingsFailed')
    || exact('/api/admin/cloudflare/usage', 'POST', 'cfUsage', 'cfUsageFailed');

  if (mapped) return mapped;

  return `${method} ${redactUrl(request.url)}`;
}

export async function cleanupAuditLogs(env) {
  const rawDb = getD1Binding(env);
  await rawDb
    .prepare(`DELETE FROM audit_logs WHERE datetime(created_at) < datetime('now', '-${RETENTION_DAYS} days')`)
    .run();
  await rawDb
    .prepare(
      `DELETE FROM audit_logs
       WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY id DESC LIMIT ?)`,
    )
    .bind(MAX_ROWS)
    .run();
}


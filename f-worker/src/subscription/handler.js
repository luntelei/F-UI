import { findSubscriptionUser, serveSubscription } from './subscription-service.js';
import {
  describeAuditAction,
  getRequestAuditContext,
  writeAuditLog,
} from '../services/audit-service.js';
import { redactUrl } from '../utils/redact.js';

const ALLOWED_SUB_QUERY = new Set(['target']);

export async function handleSubRequest(request, env) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  for (const name of url.searchParams.keys()) {
    if (!ALLOWED_SUB_QUERY.has(name)) {
      return new Response(
        JSON.stringify({ code: 400, message: '不支持的 query 参数', data: null }),
        { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }
  }

  const subToken = url.pathname.replace(/^\/sub\//, '').split('/')[0];
  if (!subToken) {
    return new Response('Forbidden', { status: 403 });
  }

  const target = url.searchParams.get('target') || 'mixed';
  const user = await findSubscriptionUser(env, subToken);
  const response = user?.status === 'active'
    ? await serveSubscription(env, subToken, target)
    : new Response('Forbidden', { status: 403 });

  await writeSubscriptionAudit(env, request, response.status, user);
  return response;
}

async function writeSubscriptionAudit(env, request, status, user) {
  try {
    await writeAuditLog(env, {
      userId: user?.id ?? null,
      action: describeAuditAction(request, status),
      method: request.method,
      ...getRequestAuditContext(request),
      pathRedacted: redactUrl(request.url),
      status,
    });
  } catch {
    // 审计失败不影响订阅响应
  }
}

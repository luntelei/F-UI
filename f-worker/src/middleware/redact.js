import { writeAuditLog } from '../services/audit-service.js';
import { describeAuditAction, getRequestAuditContext } from '../services/audit-service.js';
export {
  isSensitiveParam,
  redactText,
  redactUrl,
  SENSITIVE_QUERY_PARAMS,
} from '../utils/redact.js';
import { isSensitiveParam, redactUrl } from '../utils/redact.js';

/** 高频只读接口的成功响应不写日志，避免无意义占用 D1 写入额度。 */
const AUDIT_SKIP_READ_PATHS = new Set([
  '/api/auth/bootstrap',
  '/api/account/profile',
  '/api/account/subscription',
  '/api/account/announcement',
  '/api/admin/settings',
  '/api/admin/best-ip/settings',
  '/api/admin/subscription-converter/settings',
  '/api/super-admin/audit-logs',
  '/api/super-admin/invite-codes',
]);

const SENSITIVE_QUERY_JSON = {
  code: 400,
  message: '敏感参数不得出现在 GET query 中',
  data: null,
};

/** 在入口处拦截 GET query 中的敏感参数，覆盖接口、订阅、代理和静态资源。 */
export function rejectSensitiveGetQuery(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  for (const name of url.searchParams.keys()) {
    if (isSensitiveParam(name)) {
      return new Response(JSON.stringify(SENSITIVE_QUERY_JSON), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
  }
  return null;
}

export async function blockSensitiveGetQuery(c, next) {
  const blocked = rejectSensitiveGetQuery(c.req.raw);
  if (blocked) return blocked;
  return next();
}

function shouldWriteAudit(c) {
  const status = c.res.status;
  const method = c.req.method;
  const path = c.req.path;

  if (status >= 400) return true;
  if (method !== 'GET') return true;
  if (AUDIT_SKIP_READ_PATHS.has(path)) return false;
  return true;
}

export async function auditLogMiddleware(c, next) {
  if (c.env?.off_log === '1') {
    return next();
  }
  if (!c.req.path.startsWith('/api/')) {
    return next();
  }

  await next();

  if (!shouldWriteAudit(c)) {
    return;
  }

  try {
    await writeAuditLog(c.env, {
      userId: c.get('userId') ?? null,
      action: describeAuditAction(c.req.raw, c.res.status),
      method: c.req.method,
      ...getRequestAuditContext(c.req.raw),
      pathRedacted: redactUrl(c.req.url),
      status: c.res.status,
    });
  } catch {
    // 日志写入失败不影响主流程。
  }
}


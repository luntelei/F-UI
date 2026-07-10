/** 归一化后匹配：忽略大小写、下划线、连字符（api_token → apitoken） */
const SENSITIVE_PARAM_CORE = new Set([
  'token',
  'key',
  'password',
  'secret',
  'globalapikey',
  'apitoken',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'subtoken',
  'authorization',
  'cfapitoken',
  'cfglobalapikey',
  'uuid',
]);

/** 文档/验收用原始名示例（逻辑以 SENSITIVE_PARAM_CORE + normalizeParamName 为准） */
export const SENSITIVE_QUERY_PARAMS = [
  'token',
  'key',
  'password',
  'secret',
  'global_api_key',
  'cf_global_api_key',
  'global-api-key',
  'api_token',
  'cf_api_token',
  'api-token',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'sub_token',
  'authorization',
];

function normalizeParamName(name) {
  return String(name).toLowerCase().replace(/[_-]/g, '');
}

export function isSensitiveParam(name) {
  return SENSITIVE_PARAM_CORE.has(normalizeParamName(name));
}

function looksSensitiveValue(value) {
  if (!value || value.length < 8) return false;
  if (/^Bearer\s+/i.test(value)) return true;
  return false;
}

/** 脱敏普通字符串中的凭证片段（password=、user:pass@host 等） */
export function redactText(text) {
  if (typeof text !== 'string') return text;
  let s = text;
  s = s.replace(/vless:\/\/[^@]+@/gi, 'vless://[REDACTED]@');
  s = s.replace(/\/\/([^:@/]+):([^@/]+)@/g, '//$1:[REDACTED]@');
  s = s.replace(
    /([?&](?:password|token|secret|key|sub_token|uuid|api_token|global_api_key|cf_api_token|cf_global_api_key)=)[^&\s#]+/gi,
    '$1[REDACTED]',
  );
  s = s.replace(
    /\b([A-Za-z_-]*(?:token|key|password|secret|authorization)[A-Za-z_-]*=)[^&\s#]+/gi,
    '$1[REDACTED]',
  );
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  s = s.replace(/\bGlobalAPIKey[=:]\s*\S+/gi, 'GlobalAPIKey=[REDACTED]');
  if (s.includes('://')) {
    try {
      const u = new URL(s);
      if (u.password) u.password = '[REDACTED]';
      if (u.username) u.username = '[REDACTED]';
      for (const [name, value] of u.searchParams.entries()) {
        if (isSensitiveParam(name) || looksSensitiveValue(value)) {
          u.searchParams.set(name, '[REDACTED]');
        }
      }
      return u.toString();
    } catch {
      return s;
    }
  }
  return s;
}

export function redactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const [name, value] of url.searchParams.entries()) {
      if (isSensitiveParam(name) || looksSensitiveValue(value)) {
        url.searchParams.set(name, '[REDACTED]');
      }
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return '[invalid-url]';
  }
}

import { i18nError } from '@/i18n';

const TOKEN_KEY = 'token';

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

function normalizeParamName(name) {
  return String(name).toLowerCase().replace(/[_-]/g, '');
}

function isSensitiveQueryParam(name) {
  return SENSITIVE_PARAM_CORE.has(normalizeParamName(name));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('vpn_announcement_dismissed')) {
      sessionStorage.removeItem(key);
    }
  }
}

function assertNoSensitiveQuery(path) {
  const url = new URL(path, window.location.origin);
  for (const name of url.searchParams.keys()) {
    if (isSensitiveQueryParam(name)) {
      throw new Error(i18nError('敏感参数不得放入 URL query'));
    }
  }
}

/** 敏感凭证仅允许 POST body，禁止放入 URL query */
export async function api(path, options = {}) {
  assertNoSensitiveQuery(path);
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && json.code === undefined) {
    throw new Error(i18nError(json.message || `HTTP ${res.status}`));
  }
  if (json.code !== 0) {
    throw new Error(i18nError(json.message || '请求失败'));
  }
  return json.data;
}

export async function apiPost(path, body) {
  return api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

export async function apiPatch(path, body) {
  return api(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
}

export async function apiPut(path, body) {
  return api(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
}

export async function apiDelete(path) {
  return api(path, { method: 'DELETE' });
}

import { readSetting, upsertSetting } from './secrets-service.js';
import { listSubscriptionNodes } from './node-service.js';
import { isSensitiveParam, redactText } from '../middleware/redact.js';
import { AppError } from '../utils/response.js';
import { getKvBinding } from '../utils/bindings.js';

export const BEST_CACHE_KEY = 'best:cache:v1';
export const BEST_TOKEN_PREFIX = 'best:token:';
export const BEST_CACHE_TTL = 86400;
export const BEST_TOKEN_TTL = 300;
export const SETTING_INLINE = 'best_sub_inline_enabled';
export const SETTING_SOURCES = 'best_ip_sources';
const MAX_SOURCES = 10;

/** 规范化 IPv4：去前导零、校验每段 0–255，失败返回 null */
export function normalizeIpv4(raw) {
  const parts = String(raw || '').trim().split('.');
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(String(n));
  }
  return octets.join('.');
}

/**
 * 多源合并：lists 顺序 = 源优先级（行越靠前越高）。
 * 同 ip:port 保留高优先级条目；若高优先级无别名而低优先级有，则补全别名。
 */
function mergeBySourcePriority(lists) {
  const map = new Map();
  const order = [];

  for (const list of lists) {
    for (const entry of list) {
      const key = entryKey(entry);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...entry });
        order.push(key);
      } else if (!existing.label && entry.label) {
        existing.label = entry.label;
      }
    }
  }
  return order.map((k) => map.get(k));
}


const DEFAULT_BEST_PORT = 443;

/** 解析优选行：ip[:port][#label]，兼容 v2rayN / EDT 源格式 */
export function parseBestLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;

  let hostPart = trimmed;
  let label = '';
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    hostPart = trimmed.slice(0, hashIdx).trim();
    label = trimmed.slice(hashIdx + 1).trim();
  }

  const m = hostPart.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?(?:\/\d+)?$/);
  if (!m?.[1]) return null;

  const ip = normalizeIpv4(m[1]);
  if (!ip) return null;

  const port = m[2] ? Number(m[2]) : DEFAULT_BEST_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return { ip, port, label };
}

/** 解析文本为条目列表（不去重） */
export function parseBestLines(text) {
  const entries = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const entry = parseBestLine(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function parseBestEntries(text) {
  return mergeBySourcePriority([parseBestLines(text)]);
}

/** @deprecated 仅取 IP；优选汇聚请用 parseBestEntries */
export function parseIpList(text) {
  return parseBestEntries(text).map((e) => e.ip);
}

function entryKey(entry) {
  return `${entry.ip}:${entry.port}`;
}

export function normalizeCacheEntries(cache) {
  if (!cache) return [];
  if (Array.isArray(cache.entries) && cache.entries.length) {
    return mergeBySourcePriority([
      cache.entries.map((e) => {
        const ip = normalizeIpv4(e.ip) || e.ip;
        return {
          ip,
          port: e.port || DEFAULT_BEST_PORT,
          label: e.label || '',
        };
      }),
    ]);
  }
  if (Array.isArray(cache.ips) && cache.ips.length) {
    return mergeBySourcePriority([
      cache.ips.map((ip) => ({
        ip: normalizeIpv4(ip) || ip,
        port: DEFAULT_BEST_PORT,
        label: '',
      })),
    ]);
  }
  return [];
}

/** 每行一个 HTTPS URL；禁止敏感 query 参数（SEC-6） */
export function parseSourceUrls(raw) {
  if (!String(raw || '').trim()) return [];
  const lines = String(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const urls = [];
  for (const line of lines) {
    let u;
    try {
      u = new URL(line);
    } catch {
      throw new AppError(`无效 URL: ${line}`, 400);
    }
    if (u.protocol !== 'https:') {
      throw new AppError('优选源仅允许 HTTPS URL', 400);
    }
    for (const name of u.searchParams.keys()) {
      if (isSensitiveParam(name)) {
        throw new AppError('优选源 URL 不得含敏感 query 参数', 400);
      }
    }
    urls.push(u.toString());
  }
  return [...new Set(urls)].slice(0, MAX_SOURCES);
}

export async function readStoredSourceUrls(env) {
  const raw = await readSetting(env, SETTING_SOURCES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parseSourceUrls(parsed.join('\n'));
    }
  } catch {
    /* fallback: multiline text */
  }
  return parseSourceUrls(raw);
}

/** D1 页面配置的优选源（全部经 parseSourceUrls 校验） */
export async function listBestSourceUrls(env) {
  return readStoredSourceUrls(env);
}

function formatSourceFetchError(index, url, detail) {
  let origin = '[invalid]';
  try {
    origin = redactText(new URL(url).origin);
  } catch {
    /* keep [invalid] */
  }
  return `源 #${index + 1} (${origin}) → ${detail}`;
}

export async function saveBestSourceUrls(env, sourceUrlsRaw) {
  const urls = parseSourceUrls(sourceUrlsRaw);
  await upsertSetting(env, SETTING_SOURCES, JSON.stringify(urls));
  return urls;
}

export async function getBestCache(env) {
  return getKvBinding(env).get(BEST_CACHE_KEY, { type: 'json' });
}

async function fetchEntriesFromSources(urls) {
  const perSource = [];
  const errors = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'F-UI-BestRefresh/1' },
      });
      if (!res.ok) {
        errors.push(formatSourceFetchError(i, url, `HTTP ${res.status}`));
        continue;
      }
      perSource.push(parseBestLines(await res.text()));
    } catch (e) {
      const msg = redactText(e?.message || 'fetch failed');
      errors.push(formatSourceFetchError(i, url, msg));
    }
  }
  const entries = mergeBySourcePriority(perSource);
  if (!entries.length && errors.length) {
    throw new AppError(`优选源拉取失败: ${errors.join('; ')}`, 502);
  }
  return { entries, errors };
}

export async function refreshBestIps(env, { ipsText } = {}) {
  let entries = [];
  let sourceErrors = [];

  if (ipsText && String(ipsText).trim()) {
    entries = parseBestEntries(ipsText);
  } else {
    const urls = await listBestSourceUrls(env);
    if (!urls.length) {
      throw new AppError('请配置优选源 URL 或手动粘贴 IP 列表', 400);
    }
    const fetched = await fetchEntriesFromSources(urls);
    entries = fetched.entries;
    sourceErrors = fetched.errors;
  }

  if (!entries.length) {
    const hint = sourceErrors.length
      ? `优选源拉取失败: ${sourceErrors.join('; ')}`
      : '未解析到有效 IPv4（支持每行 ip、ip:port 或 ip:port#别名）';
    throw new AppError(hint, sourceErrors.length ? 502 : 400);
  }

  const payload = { entries, updatedAt: new Date().toISOString() };
  await getKvBinding(env).put(BEST_CACHE_KEY, JSON.stringify(payload), { expirationTtl: BEST_CACHE_TTL });
  return {
    count: entries.length,
    updatedAt: payload.updatedAt,
    entries,
    sourceErrors,
    sourceCount: (await listBestSourceUrls(env)).length,
  };
}

export async function mintBestToken(env, userId) {
  const token = crypto.randomUUID().replace(/-/g, '');
  const exp = Date.now() + BEST_TOKEN_TTL * 1000;
  await getKvBinding(env).put(
    BEST_TOKEN_PREFIX + token,
    JSON.stringify({ userId, exp }),
    { expirationTtl: BEST_TOKEN_TTL },
  );
  return { token, expiresIn: BEST_TOKEN_TTL, expiresAt: new Date(exp).toISOString() };
}

export async function verifyBestToken(env, token) {
  if (!token || String(token).length < 16) return false;
  const row = await getKvBinding(env).get(BEST_TOKEN_PREFIX + String(token), { type: 'json' });
  if (!row?.exp || row.exp < Date.now()) return false;
  return true;
}

export async function isInlineEnabled(env) {
  const v = await readSetting(env, SETTING_INLINE);
  return v === '1' || v === 'true';
}

export async function setInlineEnabled(env, enabled) {
  await upsertSetting(env, SETTING_INLINE, enabled ? '1' : '0');
  return { inlineInSubscription: Boolean(enabled) };
}

export async function updateBestSettings(env, { inlineInSubscription, sourceUrls } = {}) {
  if (inlineInSubscription !== undefined) {
    await setInlineEnabled(env, Boolean(inlineInSubscription));
  }
  if (sourceUrls !== undefined) {
    await saveBestSourceUrls(env, sourceUrls);
  }
  return getBestConfig(env);
}

export async function getBestConfig(env) {
  const cache = await getBestCache(env);
  const entries = normalizeCacheEntries(cache);
  const storedSources = await readStoredSourceUrls(env);
  const allSources = await listBestSourceUrls(env);
  return {
    cached: entries.length > 0,
    ipCount: entries.length,
    updatedAt: cache?.updatedAt ?? null,
    inlineInSubscription: await isInlineEnabled(env),
    tokenTtlSeconds: BEST_TOKEN_TTL,
    cacheTtlSeconds: BEST_CACHE_TTL,
    sourceCount: allSources.length,
    sourceUrls: storedSources,
    sourceUrlsText: storedSources.join('\n'),
  };
}

export function buildVlessWithServer(env, template, entry) {
  const domain = env.domain || '';
  const ip = entry.ip;
  const port = entry.port || DEFAULT_BEST_PORT;
  const name = entry.label || `Best-${ip}`;
  return `vless://${template.uuid}@${ip}:${port}?encryption=none&security=tls&sni=${domain}&type=ws&host=${domain}&path=${encodeURIComponent('/' + template.proxyPath)}#${encodeURIComponent(name)}`;
}

export async function listBestSubscriptionNodes(env) {
  if (!(await isInlineEnabled(env))) return [];
  const cache = await getBestCache(env);
  const entries = normalizeCacheEntries(cache);
  if (!entries.length) return [];

  const baseNodes = await listSubscriptionNodes(env);
  const template = baseNodes[0];
  if (!template) return [];

  return entries.map((entry) => ({
    name: entry.label || `Best-${entry.ip}`,
    type: 'vless_ws',
    vless: buildVlessWithServer(env, template, entry),
    uuid: template.uuid,
    server: entry.ip,
    port: entry.port || DEFAULT_BEST_PORT,
    proxyPath: template.proxyPath,
  }));
}

export function buildAddTxt(entries) {
  const lines = (entries || []).map((e) => {
    const port = e.port || DEFAULT_BEST_PORT;
    let line = `${e.ip}:${port}`;
    if (e.label) line += `#${e.label}`;
    return line;
  });
  return lines.join('\n') + (lines.length ? '\n' : '');
}

export async function cronRefreshBest(env) {
  const urls = await listBestSourceUrls(env);
  if (!urls.length) return { skipped: true, reason: 'no best_ip_sources configured' };
  try {
    const result = await refreshBestIps(env, {});
    return { skipped: false, count: result.count, sourceErrors: result.sourceErrors };
  } catch (e) {
    return { skipped: false, error: e?.message || 'refresh failed' };
  }
}

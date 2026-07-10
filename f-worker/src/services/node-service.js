import { eq, asc, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { nodes } from '../db/schema.js';
import { AppError } from '../utils/response.js';
import { encryptValue, decryptValue } from '../utils/secrets-crypto.js';
import { getNodePresenceMap } from './node-presence-service.js';
import { getKvBinding } from '../utils/bindings.js';

const NODE_CACHE_KEY = 'nodes:enabled:v1';
const NODE_CACHE_TTL = 60;

export const NODE_TYPES = {
  VLESS_WS: 'vless_ws',
  SOCKS5_CHAIN: 'socks5_chain',
  HTTP_PROXY: 'http_proxy',
};

const PUBLIC_SLUG_RE = /^[a-z0-9][a-z0-9-]{3,63}$/;

function normalizeProxyPath(path) {
  return String(path || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .split('/')[0];
}

async function parseConfigJson(env, raw) {
  if (typeof raw === 'object') return raw;
  const str = String(raw || '{}');
  if (str.startsWith('v1:')) {
    return JSON.parse(await decryptValue(env, str));
  }
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

async function encryptConfigJson(env, config) {
  return encryptValue(env, JSON.stringify(config));
}

function publicConfig(config, type) {
  const pub = {};
  if (type === NODE_TYPES.VLESS_WS || type === NODE_TYPES.SOCKS5_CHAIN) {
    pub.uuidConfigured = Boolean(config.uuid);
  }
  if (type === NODE_TYPES.SOCKS5_CHAIN && config.socks5) {
    pub.socks5 = {
      host: config.socks5.host,
      port: config.socks5.port,
      username: config.socks5.username || '',
      password: config.socks5.password ? '***' : '',
    };
  }
  if (type === NODE_TYPES.HTTP_PROXY && config.upstream) {
    try {
      const u = new URL(config.upstream);
      pub.upstream = `${u.protocol}//${u.host}${u.pathname}`;
      pub.upstreamConfigured = true;
    } catch {
      pub.upstreamConfigured = Boolean(config.upstream);
    }
  }
  return pub;
}

async function sanitizeNode(env, row, { includeConfig = true, presence } = {}) {
  if (!row) return null;
  const config = await parseConfigJson(env, row.configJson);
  const p = presence?.[row.id] || { online: false, activeConnections: 0 };
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    proxyPath: row.proxyPath,
    config: includeConfig ? publicConfig(config, row.type) : undefined,
    enabled: Boolean(row.enabled),
    online: p.online,
    activeConnections: p.activeConnections,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function invalidateNodeCache(env) {
  await getKvBinding(env).delete(NODE_CACHE_KEY);
}

export async function listEnabledNodes(env) {
  const kv = getKvBinding(env);
  const cached = await kv.get(NODE_CACHE_KEY, { type: 'json' });
  if (cached?.nodes && cached.expiresAt > Date.now()) {
    return cached.nodes;
  }

  const db = getDb(env);
  const rows = await db
    .select()
    .from(nodes)
    .where(eq(nodes.enabled, 1))
    .orderBy(asc(nodes.sortOrder), asc(nodes.id))
    .all();

  const mapped = rows.map((r) => ({ ...r, configJson: r.configJson }));

  await kv.put(
    NODE_CACHE_KEY,
    JSON.stringify({ nodes: mapped, expiresAt: Date.now() + NODE_CACHE_TTL * 1000 }),
    { expirationTtl: NODE_CACHE_TTL * 2 },
  );

  return mapped;
}

export async function findNodeByProxyPath(env, proxyPath) {
  const normalized = normalizeProxyPath(proxyPath);
  if (looksLikeUuid(normalized)) return null;
  const enabled = await listEnabledNodes(env);
  const node = enabled.find((n) => n.proxyPath === normalized) ?? null;
  if (!node) return null;
  const config = await parseConfigJson(env, node.configJson);
  return { ...node, configJson: JSON.stringify(config) };
}

export async function listNodes(env) {
  const db = getDb(env);
  const rows = await db.select().from(nodes).orderBy(asc(nodes.sortOrder), asc(nodes.id)).all();
  const presence = await getNodePresenceMap(
    env,
    rows.map((r) => r.id),
  );
  return Promise.all(rows.map((r) => sanitizeNode(env, r, { presence })));
}

export async function getNode(env, id) {
  const db = getDb(env);
  const row = await db.select().from(nodes).where(eq(nodes.id, id)).get();
  const presence = row ? await getNodePresenceMap(env, [row.id]) : {};
  return sanitizeNode(env, row, { presence });
}

const RESERVED_PATHS = new Set([
  'api',
  'login',
  'register',
  'dashboard',
  'manage',
  'sub',
  'health',
  'assets',
  'convert',
]);

function looksLikeUuid(path) {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path) ||
    /^[0-9a-f]{32}$/i.test(path)
  );
}

function isValidVlessUuid(uuid) {
  return /^[0-9a-f]{32}$/i.test(String(uuid).replace(/-/g, ''));
}

function validateNodeInput({ name, type, proxyPath, config, enabled, sortOrder }) {
  if (!name?.trim()) throw new AppError('节点名称不能为空', 400);
  const t = type || NODE_TYPES.VLESS_WS;
  if (!Object.values(NODE_TYPES).includes(t)) {
    throw new AppError('不支持的节点类型', 400);
  }
  if (t === NODE_TYPES.HTTP_PROXY) {
    throw new AppError('HTTP 反代暂未开放', 400);
  }
  const path = normalizeProxyPath(proxyPath);
  if (!path || path.length < 4) throw new AppError('代理路径至少 4 位', 400);
  if (RESERVED_PATHS.has(path)) throw new AppError('代理路径与系统路由冲突', 400);
  if (looksLikeUuid(path)) {
    throw new AppError('代理路径请使用公开 slug，勿使用 UUID 格式（鉴权靠 VLESS UUID）', 400);
  }
  if (!PUBLIC_SLUG_RE.test(path)) {
    throw new AppError('代理路径只能使用 4–64 位小写字母、数字和连字符的公开 slug', 400);
  }

  const cfg = config || {};
  if (t === NODE_TYPES.VLESS_WS || t === NODE_TYPES.SOCKS5_CHAIN) {
    if (!cfg.uuid) throw new AppError('VLESS 节点需要 uuid', 400);
    if (!isValidVlessUuid(cfg.uuid)) {
      throw new AppError('VLESS UUID 须为标准格式（xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）', 400);
    }
  }
  if (t === NODE_TYPES.SOCKS5_CHAIN) {
    if (!cfg.socks5?.host) throw new AppError('socks5_chain 需要 socks5.host', 400);
  }

  return {
    name: name.trim(),
    type: t,
    proxyPath: path,
    config: cfg,
    enabled: enabled === false ? 0 : 1,
    sortOrder: Number(sortOrder) || 0,
  };
}

export async function createNode(env, body) {
  const data = validateNodeInput(body);
  const configJson = await encryptConfigJson(env, data.config);
  const db = getDb(env);
  try {
    await db.insert(nodes).values({
      name: data.name,
      type: data.type,
      proxyPath: data.proxyPath,
      configJson,
      enabled: data.enabled,
      sortOrder: data.sortOrder,
    });
    const row = await db
      .select()
      .from(nodes)
      .where(eq(nodes.proxyPath, data.proxyPath))
      .get();
    if (!row) throw new AppError('节点创建失败', 500);
    await invalidateNodeCache(env);
    return sanitizeNode(env, row);
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (String(e.message).includes('UNIQUE')) {
      throw new AppError('代理路径已存在', 400);
    }
    throw new AppError('节点创建失败', 500);
  }
}

export async function updateNode(env, id, body) {
  const existing = await getDb(env).select().from(nodes).where(eq(nodes.id, id)).get();
  if (!existing) throw new AppError('节点不存在', 404);

  let config = await parseConfigJson(env, existing.configJson);
  if (body.config) {
    if (!body.config.uuid) {
      delete body.config.uuid;
    }
    config = { ...config, ...body.config };
    if (body.config.socks5) {
      const prevSocks = (await parseConfigJson(env, existing.configJson)).socks5 || {};
      config.socks5 = { ...prevSocks, ...body.config.socks5 };
      const pwd = body.config.socks5.password;
      if (!pwd || pwd === '***') {
        config.socks5.password = prevSocks.password;
      }
    }
  }

  const data = validateNodeInput({
    name: body.name ?? existing.name,
    type: body.type ?? existing.type,
    proxyPath: body.proxyPath ?? existing.proxyPath,
    config,
    enabled: body.enabled ?? Boolean(existing.enabled),
    sortOrder: body.sortOrder ?? existing.sortOrder,
  });

  const db = getDb(env);
  await db
    .update(nodes)
    .set({
      name: data.name,
      type: data.type,
      proxyPath: data.proxyPath,
      configJson: await encryptConfigJson(env, data.config),
      enabled: data.enabled,
      sortOrder: data.sortOrder,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(nodes.id, id));

  const row = await db.select().from(nodes).where(eq(nodes.id, id)).get();
  if (!row) throw new AppError('节点不存在', 404);

  await invalidateNodeCache(env);
  return sanitizeNode(env, row);
}

export async function deleteNode(env, id) {
  const db = getDb(env);
  await db.delete(nodes).where(eq(nodes.id, id));
  await invalidateNodeCache(env);
}

export async function listSubscriptionNodes(env) {
  const enabled = await listEnabledNodes(env);
  const out = [];
  for (const row of enabled) {
    if (row.type !== NODE_TYPES.VLESS_WS && row.type !== NODE_TYPES.SOCKS5_CHAIN) continue;
    const config = await parseConfigJson(env, row.configJson);
    const link = buildNodeLink(env, { name: row.name, proxyPath: row.proxyPath, config });
    if (!link?.vless) continue;
    out.push({
      name: row.name,
      type: row.type,
      vless: link.vless,
      uuid: config.uuid,
      proxyPath: row.proxyPath,
    });
  }
  return out;
}

export function buildNodeLink(env, node) {
  const domain = env.domain || '';
  const config = node.config ?? {};
  if (!domain || !config?.uuid) return null;
  const path = node.proxyPath;
  return {
    vless: `vless://${config.uuid}@${domain}:443?encryption=none&security=tls&sni=${domain}&type=ws&host=${domain}&path=${encodeURIComponent('/' + path)}#${encodeURIComponent(node.name)}`,
    wsPath: `/${path}`,
  };
}

export async function getNodeLink(env, id, { userId, ip } = {}) {
  const db = getDb(env);
  const row = await db.select().from(nodes).where(eq(nodes.id, id)).get();
  if (!row) throw new AppError('节点不存在', 404);

  const config = await parseConfigJson(env, row.configJson);
  const link = buildNodeLink(env, { ...row, config });
  if (!link) throw new AppError('无法生成链接', 400);

  return link;
}

import { getKvBinding } from '../utils/bindings.js';

const CONN_PREFIX = 'node:conn:';
/** 单连接 KV 槽位 TTL；长连接由 refresh 续期 */
const CONN_TTL = 90;

function connKey(nodeId, connId) {
  return `${CONN_PREFIX}${nodeId}:${connId}`;
}

function prefixForNode(nodeId) {
  return `${CONN_PREFIX}${nodeId}:`;
}

export function createConnectionId() {
  return crypto.randomUUID();
}

/** VLESS 握手成功：登记一条活动连接 */
export async function registerNodeConnection(env, nodeId, connId) {
  if (!nodeId || !connId) return;
  await getKvBinding(env).put(connKey(nodeId, connId), '1', { expirationTtl: CONN_TTL });
}

/** 长连接续期，防止误判断线 */
export async function refreshNodeConnection(env, nodeId, connId) {
  if (!nodeId || !connId) return;
  await getKvBinding(env).put(connKey(nodeId, connId), '1', { expirationTtl: CONN_TTL });
}

/** WebSocket 关闭：移除连接槽位 */
export async function unregisterNodeConnection(env, nodeId, connId) {
  if (!nodeId || !connId) return;
  await getKvBinding(env).delete(connKey(nodeId, connId));
}

export async function getNodePresence(env, nodeId) {
  const list = await getKvBinding(env).list({ prefix: prefixForNode(nodeId) });
  const n = list.keys?.length || 0;
  return { online: n > 0, activeConnections: n };
}

export async function getNodePresenceMap(env, nodeIds) {
  const out = {};
  await Promise.all(
    (nodeIds || []).map(async (id) => {
      out[id] = await getNodePresence(env, id);
    }),
  );
  return out;
}

/** 管理端：清空节点残留连接计数（修复历史泄漏） */
export async function clearNodePresence(env, nodeId) {
  const kv = getKvBinding(env);
  const list = await kv.list({ prefix: prefixForNode(nodeId) });
  await Promise.all((list.keys || []).map((k) => kv.delete(k.name)));
}

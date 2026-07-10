import { parseVlessHeader } from './vless.js';
import { proxyLog } from './debug.js';
import { findNodeByProxyPath } from '../services/node-service.js';
import {
  createConnectionId,
  registerNodeConnection,
  refreshNodeConnection,
  unregisterNodeConnection,
} from '../services/node-presence-service.js';

const RESERVED_PREFIXES = ['/api', '/login', '/register', '/dashboard', '/manage', '/sub', '/health', '/assets', '/ADD.txt', '/add.txt'];
const PRESENCE_REFRESH_MS = 45_000;

export async function handleProxyRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (RESERVED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }

  const proxyPath = pathname.replace(/^\//, '').split('/')[0];
  if (!proxyPath) return null;

  const node = await findNodeByProxyPath(env, proxyPath);
  if (!node || !Number(node.enabled)) return null;

  if (node.type === 'http_proxy') {
    return new Response('HTTP proxy not enabled', { status: 503 });
  }

  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket upgrade required', { status: 426 });
  }

  if (node.type === 'vless_ws' || node.type === 'socks5_chain') {
    return handleVlessWebSocket(request, node, env);
  }

  return new Response('Unsupported node type', { status: 501 });
}

function handleVlessWebSocket(request, node, env) {
  const config = parseConfig(node);
  if (!config?.uuid) {
    return new Response('Invalid VLESS config', { status: 502 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  const connId = createConnectionId();
  let remoteReady = false;
  let closed = false;
  let presenceActive = false;
  let presenceTimer = null;

  const releasePresence = () => {
    if (!presenceActive) return;
    presenceActive = false;
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
    unregisterNodeConnection(env, node.id, connId).catch(() => {});
  };

  const closeServer = (code = 1000, reason = 'closed') => {
    if (closed) return;
    closed = true;
    releasePresence();
    try {
      server.close(code, reason);
    } catch {
      /* ignore */
    }
  };

  // 空闲连接及时关闭，避免占用免费层并发额度。
  const idleTimer = setTimeout(() => closeServer(1000, 'idle timeout'), 30_000);

  server.addEventListener('message', async (event) => {
    if (remoteReady || closed) return;
    clearTimeout(idleTimer);

    try {
      const chunk =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new Uint8Array(await event.data.arrayBuffer());

      const parsed = parseVlessHeader(chunk, config.uuid);
      if (parsed.hasError) {
        proxyLog(env, 'vless parse error', parsed.message);
        closeServer(1008, 'invalid vless');
        return;
      }
      if (parsed.isUDP) {
        closeServer(1008, 'udp not supported');
        return;
      }

      const initial = chunk.slice(parsed.rawDataIndex);
      const vlessHeader = parsed.vlessResponseHeader;
      if (vlessHeader?.byteLength) {
        server.send(vlessHeader);
      }

      remoteReady = true;
      if (!presenceActive) {
        presenceActive = true;
        await registerNodeConnection(env, node.id, connId);
        presenceTimer = setInterval(() => {
          refreshNodeConnection(env, node.id, connId).catch(() => {});
        }, PRESENCE_REFRESH_MS);
      }

      const outbound = node.type === 'socks5_chain' && config.socks5 ? config.socks5 : null;
      if (outbound?.host) {
        const { pipeWebSocketToSocks5 } = await import('./socks5.js');
        await pipeWebSocketToSocks5(
          server,
          outbound,
          parsed.addressRemote,
          parsed.portRemote,
          initial,
          env,
        );
      } else {
        const { pipeWebSocketToTcp } = await import('./tcp.js');
        await pipeWebSocketToTcp(server, parsed.addressRemote, parsed.portRemote, initial, env);
      }
    } catch (e) {
      proxyLog(env, 'ws message error', e?.message);
      closeServer(1011, 'error');
    }
  });

  server.addEventListener('close', () => {
    closed = true;
    clearTimeout(idleTimer);
    releasePresence();
  });

  server.addEventListener('error', () => {
    closeServer(1011, 'error');
  });

  return new Response(null, { status: 101, webSocket: client });
}

function parseConfig(node) {
  try {
    return typeof node.configJson === 'string' ? JSON.parse(node.configJson) : node.configJson;
  } catch {
    return null;
  }
}


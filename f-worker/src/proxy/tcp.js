import { connect } from 'cloudflare:sockets';
import { proxyLog } from './debug.js';

/**
 * 建立到目标的 TCP 连接并双向转发 WebSocket 数据
 */
export async function pipeWebSocketToTcp(webSocket, address, port, initialData, env) {
  proxyLog(env, `connect ${address}:${port}`);

  let remoteSocket;
  try {
    remoteSocket = connect({ hostname: address, port });
  } catch (e) {
    proxyLog(env, 'connect failed', e?.message);
    webSocket.close(1011, 'connect failed');
    return;
  }

  const writer = remoteSocket.writable.getWriter();
  const reader = remoteSocket.readable.getReader();

  if (initialData?.byteLength) {
    await writer.write(initialData);
  }

  const pumpRemoteToWs = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (webSocket.readyState === WebSocket.OPEN) {
          webSocket.send(value);
        }
      }
    } catch (e) {
      proxyLog(env, 'remote->ws error', e?.message);
    } finally {
      try {
        webSocket.close();
      } catch {
        /* ignore */
      }
    }
  })();

  webSocket.addEventListener('message', async (event) => {
    try {
      const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data;
      await writer.write(data);
    } catch (e) {
      proxyLog(env, 'ws->remote error', e?.message);
      webSocket.close(1011, 'write failed');
    }
  });

  webSocket.addEventListener('close', () => {
    try {
      reader.cancel();
      writer.close();
    } catch {
      /* ignore */
    }
  });

  webSocket.addEventListener('error', () => {
    try {
      reader.cancel();
      writer.close();
    } catch {
      /* ignore */
    }
  });

  await pumpRemoteToWs;
}

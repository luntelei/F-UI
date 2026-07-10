import { connect } from 'cloudflare:sockets';
import { encodeSocks5Address } from './vless.js';
import { proxyLog } from './debug.js';

const encoder = new TextEncoder();

class BufferedReader {
  constructor(reader) {
    this.reader = reader;
    this.buffer = new Uint8Array(0);
  }

  async readExact(n) {
    while (this.buffer.length < n) {
      const { value, done } = await this.reader.read();
      if (done) throw new Error('SOCKS5 stream closed');
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
    }
    const out = this.buffer.slice(0, n);
    this.buffer = this.buffer.slice(n);
    return out;
  }

  async readChunk() {
    if (this.buffer.length > 0) {
      const out = this.buffer;
      this.buffer = new Uint8Array(0);
      return out;
    }
    const { value, done } = await this.reader.read();
    if (done) return null;
    return value instanceof Uint8Array ? value : new Uint8Array(value);
  }
}

/**
 * 通过 SOCKS5 代理连接到目标 host:port，返回已建立 CONNECT 的 socket
 */
export async function connectViaSocks5(socks5, targetHost, targetPort, env) {
  const { host, port = 1080, username = '', password = '' } = socks5;
  proxyLog(env, `socks5 ${host}:${port} -> ${targetHost}:${targetPort}`);

  const socket = connect({ hostname: host, port: Number(port) });
  const writer = socket.writable.getWriter();
  const reader = new BufferedReader(socket.readable.getReader());

  const needsAuth = Boolean(username || password);
  const greeting = new Uint8Array(needsAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]);
  await writer.write(greeting);

  const methodRes = await reader.readExact(2);
  if (methodRes[0] !== 0x05) throw new Error('SOCKS5 greeting failed');

  if (methodRes[1] === 0x02) {
    const u = encoder.encode(username);
    const p = encoder.encode(password);
    const auth = new Uint8Array(3 + u.length + p.length);
    auth[0] = 0x01;
    auth[1] = u.length;
    auth.set(u, 2);
    auth[2 + u.length] = p.length;
    auth.set(p, 3 + u.length);
    await writer.write(auth);
    const authRes = await reader.readExact(2);
    if (authRes[1] !== 0x00) throw new Error('SOCKS5 auth failed');
  } else if (methodRes[1] !== 0x00) {
    throw new Error('SOCKS5 no acceptable auth');
  }

  const addr = encodeSocks5Address(targetHost);
  const connectReq = new Uint8Array(4 + addr.length + 2);
  connectReq[0] = 0x05;
  connectReq[1] = 0x01;
  connectReq[2] = 0x00;
  connectReq.set(addr, 3);
  connectReq[3 + addr.length] = (targetPort >> 8) & 0xff;
  connectReq[4 + addr.length] = targetPort & 0xff;
  await writer.write(connectReq);

  const head = await reader.readExact(4);
  if (head[1] !== 0x00) throw new Error('SOCKS5 connect failed');

  const atyp = head[3];
  if (atyp === 0x01) await reader.readExact(4);
  else if (atyp === 0x03) {
    const len = await reader.readExact(1);
    await reader.readExact(len[0]);
  } else if (atyp === 0x04) await reader.readExact(16);
  await reader.readExact(2);

  return { socket, writer, reader };
}

export async function pipeWebSocketToSocks5(webSocket, socks5, address, port, initialData, env) {
  let writer;
  let reader;
  try {
    const conn = await connectViaSocks5(socks5, address, port, env);
    writer = conn.writer;
    reader = conn.reader;
  } catch (e) {
    proxyLog(env, 'socks5 failed', e?.message);
    webSocket.close(1011, 'socks5 failed');
    return;
  }

  if (initialData?.byteLength) {
    await writer.write(initialData);
  }

  const pumpRemoteToWs = (async () => {
    try {
      while (true) {
        const value = await reader.readChunk();
        if (!value) break;
        if (webSocket.readyState === WebSocket.OPEN) {
          webSocket.send(value);
        }
      }
    } catch {
      /* ignore */
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
    } catch {
      webSocket.close(1011, 'write failed');
    }
  });

  webSocket.addEventListener('close', () => {
    try {
      reader.reader?.cancel();
      writer.close();
    } catch {
      /* ignore */
    }
  });

  await pumpRemoteToWs;
}

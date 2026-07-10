const encoder = new TextEncoder();

export function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 解析 VLESS 请求头（首包）
 * @returns {{ hasError: boolean, message?: string, portRemote?: number, addressRemote?: string, rawDataIndex?: number, isUDP?: boolean }}
 */
export function parseVlessHeader(buffer, expectedUuid) {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (view.byteLength < 24) {
    return { hasError: true, message: 'VLESS header too short' };
  }
  if (view[0] !== 0) {
    return { hasError: true, message: 'Unsupported VLESS version' };
  }

  const uuidBytes = view.slice(1, 17);
  const expected = uuidToBytes(expectedUuid);
  if (!expected || !bytesEqual(uuidBytes, expected)) {
    return { hasError: true, message: 'Invalid VLESS UUID' };
  }

  const addonLen = view[17];
  let idx = 18 + addonLen;
  if (view.byteLength < idx + 4) {
    return { hasError: true, message: 'VLESS header incomplete' };
  }

  const command = view[idx++];
  const portRemote = (view[idx] << 8) | view[idx + 1];
  idx += 2;
  const addressType = view[idx++];

  let addressRemote = '';
  if (addressType === 1) {
    if (view.byteLength < idx + 4) return { hasError: true, message: 'Invalid IPv4' };
    addressRemote = [...view.slice(idx, idx + 4)].join('.');
    idx += 4;
  } else if (addressType === 2) {
    if (view.byteLength < idx + 1) return { hasError: true, message: 'Invalid domain' };
    const domainLen = view[idx++];
    if (view.byteLength < idx + domainLen) return { hasError: true, message: 'Invalid domain length' };
    addressRemote = new TextDecoder().decode(view.slice(idx, idx + domainLen));
    idx += domainLen;
  } else if (addressType === 3) {
    if (view.byteLength < idx + 16) return { hasError: true, message: 'Invalid IPv6' };
    const parts = [];
    for (let i = 0; i < 8; i++) {
      parts.push(((view[idx + i * 2] << 8) | view[idx + i * 2 + 1]).toString(16));
    }
    addressRemote = parts.join(':');
    idx += 16;
  } else {
    return { hasError: true, message: 'Unknown address type' };
  }

  return {
    hasError: false,
    portRemote,
    addressRemote,
    rawDataIndex: idx,
    isUDP: command === 0x02,
    vlessResponseHeader: new Uint8Array([0, 0]),
  };
}

export function buildVlessResponseHeader() {
  return new Uint8Array([0, 0]);
}

export function encodeSocks5Address(host) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number);
    return new Uint8Array([0x01, ...parts]);
  }
  const hostBytes = encoder.encode(host);
  return new Uint8Array([0x03, hostBytes.length, ...hostBytes]);
}

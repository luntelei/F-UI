const encoder = new TextEncoder();
// Cloudflare Workers Web Crypto 上限为 100000 次（非 Node 环境的 210000）
const PBKDF2_ITERATIONS = 100000;

export function generateSalt(length = 16) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

function decodeSalt(saltB64) {
  return Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
}

async function pbkdf2Hash(password, saltB64) {
  const salt = decodeSalt(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return `v2:${btoa(String.fromCharCode(...new Uint8Array(bits)))}`;
}

async function legacySha256Hash(password, saltB64) {
  const data = encoder.encode(saltB64 + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

export async function hashPassword(password) {
  const salt = generateSalt();
  const hash = await pbkdf2Hash(password, salt);
  return { salt, hash };
}

export async function verifyPassword(password, salt, storedHash) {
  if (storedHash.startsWith('v2:')) {
    const hash = await pbkdf2Hash(password, salt);
    return hash === storedHash;
  }
  const hash = await legacySha256Hash(password, salt);
  return hash === storedHash;
}

export function isLegacyPasswordHash(storedHash) {
  return storedHash && !storedHash.startsWith('v2:');
}

export function randomCode(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

export function newSubToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

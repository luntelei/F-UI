const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function importSecretsKey(env) {
  const raw = env.secrets_key || env.jwt_secret;
  if (!raw) {
    throw new Error('SECRETS_KEY 或 JWT_SECRET 未配置');
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptValue(env, plaintext) {
  const key = await importSecretsKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(String(plaintext)),
  );
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `v1:${ivB64}:${ctB64}`;
}

export async function decryptValue(env, stored) {
  if (!stored?.startsWith('v1:')) {
    throw new Error('不支持的密文格式');
  }
  const [, ivB64, ctB64] = stored.split(':');
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const key = await importSecretsKey(env);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return decoder.decode(plain);
}

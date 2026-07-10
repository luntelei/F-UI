import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { secrets, settings } from '../db/schema.js';
import { encryptValue, decryptValue } from '../utils/secrets-crypto.js';
import { AppError } from '../utils/response.js';

export const SECRET_TYPES = {
  CF_API_TOKEN: 'cf_api_token',
};

export async function isSecretConfigured(env, type) {
  const db = getDb(env);
  const row = await db.select({ id: secrets.id }).from(secrets).where(eq(secrets.type, type)).get();
  return Boolean(row);
}

export async function upsertSecret(env, type, plaintext) {
  if (!plaintext || String(plaintext).trim().length < 8) {
    throw new AppError('密钥长度过短', 400);
  }
  const ciphertext = await encryptValue(env, String(plaintext).trim());
  const db = getDb(env);
  const existing = await db.select().from(secrets).where(eq(secrets.type, type)).get();
  if (existing) {
    await db
      .update(secrets)
      .set({ ciphertext, updatedAt: new Date().toISOString() })
      .where(eq(secrets.type, type));
    return { type, configured: true, updated: true };
  }
  await db.insert(secrets).values({ type, ciphertext });
  return { type, configured: true, updated: false };
}

export async function readSecret(env, type) {
  const db = getDb(env);
  const row = await db.select().from(secrets).where(eq(secrets.type, type)).get();
  if (!row) return null;
  return decryptValue(env, row.ciphertext);
}

export async function deleteSecret(env, type) {
  const db = getDb(env);
  await db.delete(secrets).where(eq(secrets.type, type));
}

export async function upsertSetting(env, key, plaintext) {
  const ciphertext = await encryptValue(env, String(plaintext));
  const db = getDb(env);
  const existing = await db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    await db
      .update(settings)
      .set({ valueEncrypted: ciphertext, updatedAt: new Date().toISOString() })
      .where(eq(settings.key, key));
    return;
  }
  await db.insert(settings).values({ key, valueEncrypted: ciphertext });
}

export async function readSetting(env, key) {
  const db = getDb(env);
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  return decryptValue(env, row.valueEncrypted);
}

export async function deleteSetting(env, key) {
  const db = getDb(env);
  await db.delete(settings).where(eq(settings.key, key));
}

export async function getConfigWhitelist(env) {
  const [cfToken, tgBot] = await Promise.all([
    isSecretConfigured(env, SECRET_TYPES.CF_API_TOKEN),
    isSecretConfigured(env, 'telegram_bot_token'),
  ]);
  const tgChatConfigured = Boolean(await readSetting(env, 'telegram_chat_id'));

  return {
    cfUsage: {
      apiTokenConfigured: cfToken,
    },
    notify: {
      telegramBotConfigured: tgBot,
      telegramChatConfigured: tgChatConfigured,
    },
    security: {
      offLog: env.off_log === '1',
      allowInsecureDev: env.allow_insecure_dev === '1',
    },
  };
}

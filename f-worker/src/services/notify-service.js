import { upsertSecret, readSecret, deleteSecret, upsertSetting, readSetting } from './secrets-service.js';
import { redactText } from '../middleware/redact.js';
import { AppError } from '../utils/response.js';

export const TELEGRAM_BOT_SECRET = 'telegram_bot_token';
export const TELEGRAM_CHAT_SETTING = 'telegram_chat_id';

export async function saveTelegramBotToken(env, botToken) {
  if (!botToken || String(botToken).trim().length < 10) {
    throw new AppError('Bot Token 无效', 400);
  }
  return upsertSecret(env, TELEGRAM_BOT_SECRET, String(botToken).trim());
}

export async function saveTelegramChatId(env, chatId) {
  if (!chatId || !/^-?\d+$/.test(String(chatId).trim())) {
    throw new AppError('Chat ID 格式无效', 400);
  }
  await upsertSetting(env, TELEGRAM_CHAT_SETTING, String(chatId).trim());
  return { configured: true };
}

export async function clearTelegramBotToken(env) {
  await deleteSecret(env, TELEGRAM_BOT_SECRET);
}

export async function clearTelegramChatId(env) {
  const db = (await import('../db/client.js')).getDb(env);
  const { settings } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  await db.delete(settings).where(eq(settings.key, TELEGRAM_CHAT_SETTING));
}

function buildTestMessage(env) {
  const domain = env.domain || 'f-ui';
  return redactText(`F-UI 测试通知 - ${domain} - ${new Date().toISOString()}`);
}

/** 测试通知使用固定模板，避免把调用方传入的敏感内容发到 Telegram。 */
export async function sendTelegramTest(env) {
  const botToken = await readSecret(env, TELEGRAM_BOT_SECRET);
  const chatId = await readSetting(env, TELEGRAM_CHAT_SETTING);
  if (!botToken) throw new AppError('请先配置 Telegram Bot Token', 400);
  if (!chatId) throw new AppError('请先配置 Telegram Chat ID', 400);

  const text = buildTestMessage(env);
  return sendTelegramText(botToken, chatId, text);
}

export async function sendTelegramText(botToken, chatId, rawText) {
  const text = redactText(String(rawText || ''));
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new AppError(json.description || 'Telegram 发送失败', 502);
  }
  return { sent: true, messageId: json.result?.message_id ?? null };
}


import { Hono } from 'hono';
import { ok, fail, AppError } from '../utils/response.js';
import { getConfigWhitelist, upsertSecret, deleteSecret, SECRET_TYPES } from '../services/secrets-service.js';
import { listAuditLogs } from '../services/audit-service.js';
import {
  saveTelegramBotToken,
  saveTelegramChatId,
  clearTelegramBotToken,
  clearTelegramChatId,
  sendTelegramTest,
} from '../services/notify-service.js';
import { getSubConverterConfig, updateSubConverterConfig } from '../services/sub-converter-service.js';
import {
  getBestConfig,
  refreshBestIps,
  mintBestToken,
  updateBestSettings,
} from '../services/best-service.js';
import {
  updateTurnstileSettings,
  updateAnnouncementSettings,
  getTurnstileAdminConfig,
  getAnnouncementAdminConfig,
  getAboutConfig,
} from '../services/settings-service.js';
import { isSuperAdmin } from '../services/auth-service.js';

const manageApi = new Hono();

function resolveCfSecretType(rawType) {
  const t = String(rawType || '').trim().toLowerCase();
  if (t === 'api_token' || t === 'cf_api_token') {
    return SECRET_TYPES.CF_API_TOKEN;
  }
  throw new AppError('type 必须是 api_token', 400);
}

function requireSuperAdmin(c) {
  if (!isSuperAdmin(c.env, c.get('user'))) {
    throw new AppError('仅 Super Admin 可修改系统配置', 403);
  }
}

manageApi.get('/settings', async (c) => {
  const user = c.get('user');
  const [base, turnstile, announcement] = await Promise.all([
    getConfigWhitelist(c.env),
    getTurnstileAdminConfig(c.env),
    getAnnouncementAdminConfig(c.env),
  ]);
  return c.json(
    ok({
      version: '1.0.0',
      ...base,
      isSuperAdmin: isSuperAdmin(c.env, user),
      turnstile,
      announcement,
      about: getAboutConfig(c.env),
    }),
  );
});

manageApi.put('/integrations/cloudflare/api-token', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json();
    const type = resolveCfSecretType(body.type);
    if (!body.value) {
      return c.json(fail('value 不能为空', 400), 400);
    }
    const data = await upsertSecret(c.env, type, body.value);
    return c.json(ok({ ...data, value: undefined }));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '保存失败'), status);
  }
});

manageApi.delete('/integrations/cloudflare/api-token', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json().catch(() => ({ type: 'api_token' }));
    const type = resolveCfSecretType(body.type);
    await deleteSecret(c.env, type);
    return c.json(ok({ type: body.type, configured: false }));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '删除失败'), status);
  }
});

manageApi.get('/audit-logs', async (c) => {
  requireSuperAdmin(c);
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 100);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const rows = await listAuditLogs(c.env, { limit, offset });
  return c.json(ok(rows));
});

manageApi.put('/integrations/telegram/bot-token', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json();
    if (!body.botToken) return c.json(fail('botToken 不能为空', 400), 400);
    const data = await saveTelegramBotToken(c.env, body.botToken);
    return c.json(ok({ ...data, botToken: undefined }));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '保存失败'), status);
  }
});

manageApi.delete('/integrations/telegram/bot-token', async (c) => {
  try {
    requireSuperAdmin(c);
    await clearTelegramBotToken(c.env);
    return c.json(ok({ configured: false }));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '删除失败'), status);
  }
});

manageApi.put('/integrations/telegram/chat', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json();
    if (!body.chatId) return c.json(fail('chatId 不能为空', 400), 400);
    const data = await saveTelegramChatId(c.env, body.chatId);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '保存失败'), status);
  }
});

manageApi.delete('/integrations/telegram/chat', async (c) => {
  try {
    requireSuperAdmin(c);
    await clearTelegramChatId(c.env);
    return c.json(ok({ configured: false }));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '删除失败'), status);
  }
});

manageApi.patch('/security/turnstile', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json();
    const data = await updateTurnstileSettings(c.env, body);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '保存失败'), status);
  }
});

manageApi.patch('/announcement', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json();
    const data = await updateAnnouncementSettings(c.env, body);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '保存失败'), status);
  }
});

manageApi.post('/integrations/telegram/test', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json().catch(() => ({}));
    if (body.message != null && String(body.message).trim() !== '') {
      return c.json(fail('测试通知使用固定模板，不支持自定义 message', 400), 400);
    }
    const data = await sendTelegramTest(c.env);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '发送失败'), status);
  }
});

manageApi.get('/subscription-converter/settings', async (c) => {
  return c.json(ok(await getSubConverterConfig(c.env)));
});

manageApi.patch('/subscription-converter/settings', async (c) => {
  try {
    const body = await c.req.json();
    const data = await updateSubConverterConfig(c.env, body);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '保存失败'), status);
  }
});

manageApi.get('/best-ip/settings', async (c) => {
  return c.json(ok(await getBestConfig(c.env)));
});

manageApi.post('/best-ip/refresh', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json().catch(() => ({}));
    const data = await refreshBestIps(c.env, { ipsText: body.ipsText || body.ips });
    return c.json(
      ok({
        count: data.count,
        updatedAt: data.updatedAt,
        sourceErrors: data.sourceErrors?.length ? data.sourceErrors : undefined,
      }),
    );
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '刷新失败'), status);
  }
});

manageApi.post('/best-ip/access-tokens', async (c) => {
  try {
    requireSuperAdmin(c);
    const user = c.get('user');
    const data = await mintBestToken(c.env, user.id);
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '签发失败'), status);
  }
});

manageApi.patch('/best-ip/settings', async (c) => {
  try {
    requireSuperAdmin(c);
    const body = await c.req.json();
    const data = await updateBestSettings(c.env, {
      inlineInSubscription: body.inlineInSubscription,
      sourceUrls: body.sourceUrls,
    });
    return c.json(ok(data));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return c.json(fail(e.message || '保存失败'), status);
  }
});

export default manageApi;


import {
  readSetting,
  upsertSetting,
  deleteSetting,
  readSecret,
  upsertSecret,
  deleteSecret,
  isSecretConfigured,
} from './secrets-service.js';
import { AppError } from '../utils/response.js';
import { assertTurnstileReady, isTurnstileSiteKeyFormatValid } from './turnstile-keys.js';

const KEYS = {
  TURNSTILE_SITE_KEY: 'turnstile_site_key',
  TURNSTILE_REGISTER: 'turnstile_register_enabled',
  TURNSTILE_LOGIN: 'turnstile_login_enabled',
  ANN_ENABLED: 'announcement_login_enabled',
  ANN_TITLE: 'announcement_login_title',
  ANN_CONTENT: 'announcement_login_content',
  ANN_ICON: 'announcement_icon',
  ANN_POSITION: 'announcement_position',
  ANN_WIDTH: 'announcement_width',
  ANN_OFFSET: 'announcement_offset',
  ANN_DURATION: 'announcement_duration',
};

const TURNSTILE_SECRET_TYPE = 'turnstile_secret';

const ANN_ICONS = new Set(['none', 'info', 'success', 'warning']);
const ANN_POSITIONS = new Set(['top-right', 'top-left', 'bottom-right', 'bottom-left']);

function isInsecureDevAllowed(env) {
  return env.allow_insecure_dev === '1';
}

async function readBoolSetting(env, key, defaultValue = false) {
  const raw = await readSetting(env, key);
  if (raw === null || raw === undefined) return defaultValue;
  return raw === '1' || raw === 'true';
}

async function writeBoolSetting(env, key, value) {
  await upsertSetting(env, key, value ? '1' : '0');
}

async function readNumSetting(env, key, defaultValue) {
  const raw = await readSetting(env, key);
  if (raw === null || raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

async function writeNumSetting(env, key, value, { min = 0, max = 10000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new AppError(`数值须在 ${min}–${max} 之间`, 400);
  }
  await upsertSetting(env, key, String(Math.round(n)));
}

function maskSiteKey(siteKey) {
  if (!siteKey) return null;
  const s = String(siteKey);
  if (s.length <= 12) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

export async function resolveTurnstileConfig(env) {
  const dbSiteKey = await readSetting(env, KEYS.TURNSTILE_SITE_KEY);
  const dbSecret = await readSecret(env, TURNSTILE_SECRET_TYPE);
  return {
    siteKey: dbSiteKey || env.turnstile_site_key || null,
    secret: dbSecret || env.turnstile_secret || null,
  };
}

export async function getTurnstileAdminConfig(env) {
  const { siteKey, secret } = await resolveTurnstileConfig(env);
  const configured = Boolean(isTurnstileSiteKeyFormatValid(siteKey) && secret);
  const registerEnabled = await readBoolSetting(
    env,
    KEYS.TURNSTILE_REGISTER,
    configured,
  );
  const loginEnabled = await readBoolSetting(env, KEYS.TURNSTILE_LOGIN, false);

  return {
    registerEnabled,
    loginEnabled,
    siteKeyConfigured: Boolean(siteKey),
    siteKeyPreview: maskSiteKey(siteKey),
    secretConfigured: Boolean(secret),
    configured,
  };
}

export async function getTurnstilePublicConfig(env) {
  if (isInsecureDevAllowed(env)) {
    return {
      siteKey: null,
      registerEnabled: false,
      loginEnabled: false,
      requireRegister: false,
      requireLogin: false,
    };
  }

  const { siteKey, secret } = await resolveTurnstileConfig(env);
  const configured = Boolean(isTurnstileSiteKeyFormatValid(siteKey) && secret);
  const registerEnabled = await readBoolSetting(
    env,
    KEYS.TURNSTILE_REGISTER,
    configured,
  );
  const loginEnabled = await readBoolSetting(env, KEYS.TURNSTILE_LOGIN, false);

  return {
    siteKey: configured ? siteKey : null,
    registerEnabled,
    loginEnabled,
    requireRegister: configured && registerEnabled,
    requireLogin: configured && loginEnabled,
  };
}

async function readAnnouncementFields(env) {
  const enabled = await readBoolSetting(env, KEYS.ANN_ENABLED, false);
  const title = (await readSetting(env, KEYS.ANN_TITLE)) || '';
  const content = (await readSetting(env, KEYS.ANN_CONTENT)) || '';
  const iconRaw = (await readSetting(env, KEYS.ANN_ICON)) || 'none';
  const positionRaw = (await readSetting(env, KEYS.ANN_POSITION)) || 'top-right';
  const icon = ANN_ICONS.has(iconRaw) ? iconRaw : 'none';
  const position = ANN_POSITIONS.has(positionRaw) ? positionRaw : 'top-right';
  const width = await readNumSetting(env, KEYS.ANN_WIDTH, 340);
  const offset = await readNumSetting(env, KEYS.ANN_OFFSET, 24);
  const duration = await readNumSetting(env, KEYS.ANN_DURATION, 0);

  return { enabled, title, content, icon, position, width, offset, duration };
}

export async function getAnnouncementAdminConfig(env) {
  return readAnnouncementFields(env);
}

/** 登录后展示的网站公告，只通过已登录接口返回。 */
export async function getAnnouncementForUser(env) {
  const ann = await readAnnouncementFields(env);
  if (!ann.enabled || !String(ann.content || '').trim()) {
    return { enabled: false };
  }
  return ann;
}

export function getAboutConfig(env) {
  return {
    version: '1.0.0',
    community: {
      label: 'luntelei/F-UI',
      url: 'https://github.com/luntelei/F-UI',
      icon: 'https://github.githubassets.com/favicons/favicon.svg',
    },
    help: {
      label: 'developers.cloudflare.com',
      url: 'https://developers.cloudflare.com',
      icon: '/icons/cloudflare-docs.png',
    },
  };
}

async function resolveTurnstileConfigProspective(env, body) {
  const current = await resolveTurnstileConfig(env);
  let siteKey = current.siteKey;
  let secret = current.secret;

  if (body.siteKey !== undefined) {
    const v = String(body.siteKey || '').trim();
    siteKey = v || null;
  }
  if (body.secretKey !== undefined) {
    const v = String(body.secretKey || '').trim();
    secret = v || null;
  }
  return { siteKey, secret };
}

export async function updateTurnstileSettings(env, body) {
  const currentRegister = await readBoolSetting(env, KEYS.TURNSTILE_REGISTER, false);
  const currentLogin = await readBoolSetting(env, KEYS.TURNSTILE_LOGIN, false);

  const nextRegister =
    body.registerEnabled !== undefined ? Boolean(body.registerEnabled) : currentRegister;
  const nextLogin =
    body.loginEnabled !== undefined ? Boolean(body.loginEnabled) : currentLogin;
  const keysTouched = body.siteKey !== undefined || body.secretKey !== undefined;
  const enablingVerification =
    body.registerEnabled === true || body.loginEnabled === true;
  const verificationActiveOrEnabling = nextRegister || nextLogin;

  const shouldValidate =
    enablingVerification || (keysTouched && verificationActiveOrEnabling);

  if (shouldValidate && verificationActiveOrEnabling) {
    const prospective = await resolveTurnstileConfigProspective(env, body);
    await assertTurnstileReady(prospective.siteKey, prospective.secret);
  }

  if (body.registerEnabled !== undefined) {
    await writeBoolSetting(env, KEYS.TURNSTILE_REGISTER, Boolean(body.registerEnabled));
  }
  if (body.loginEnabled !== undefined) {
    await writeBoolSetting(env, KEYS.TURNSTILE_LOGIN, Boolean(body.loginEnabled));
  }
  if (body.siteKey !== undefined) {
    const siteKey = String(body.siteKey || '').trim();
    if (!siteKey) {
      await deleteSetting(env, KEYS.TURNSTILE_SITE_KEY);
    } else if (!isTurnstileSiteKeyFormatValid(siteKey)) {
      throw new AppError('Site Key 格式无效', 400);
    } else {
      await upsertSetting(env, KEYS.TURNSTILE_SITE_KEY, siteKey);
    }
  }
  if (body.secretKey !== undefined) {
    const secretKey = String(body.secretKey || '').trim();
    if (!secretKey) {
      await deleteSecret(env, TURNSTILE_SECRET_TYPE);
    } else if (secretKey.length < 8) {
      throw new AppError('Secret Key 长度过短', 400);
    } else {
      await upsertSecret(env, TURNSTILE_SECRET_TYPE, secretKey);
    }
  }
  return getTurnstileAdminConfig(env);
}

export async function updateAnnouncementSettings(env, body) {
  if (body.enabled !== undefined) {
    await writeBoolSetting(env, KEYS.ANN_ENABLED, Boolean(body.enabled));
  }
  if (body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (title) {
      await upsertSetting(env, KEYS.ANN_TITLE, title);
    } else {
      await deleteSetting(env, KEYS.ANN_TITLE);
    }
  }
  if (body.content !== undefined) {
    const content = String(body.content || '').trim();
    if (content) {
      await upsertSetting(env, KEYS.ANN_CONTENT, content);
    } else {
      await deleteSetting(env, KEYS.ANN_CONTENT);
    }
  }
  if (body.icon !== undefined) {
    const icon = String(body.icon || 'none');
    if (!ANN_ICONS.has(icon)) {
      throw new AppError('icon 无效', 400);
    }
    await upsertSetting(env, KEYS.ANN_ICON, icon);
  }
  if (body.position !== undefined) {
    const position = String(body.position || 'top-right');
    if (!ANN_POSITIONS.has(position)) {
      throw new AppError('position 无效', 400);
    }
    await upsertSetting(env, KEYS.ANN_POSITION, position);
  }
  if (body.width !== undefined) {
    await writeNumSetting(env, KEYS.ANN_WIDTH, body.width, { min: 240, max: 600 });
  }
  if (body.offset !== undefined) {
    await writeNumSetting(env, KEYS.ANN_OFFSET, body.offset, { min: 0, max: 200 });
  }
  if (body.duration !== undefined) {
    await writeNumSetting(env, KEYS.ANN_DURATION, body.duration, { min: 0, max: 600000 });
  }
  return getAnnouncementAdminConfig(env);
}

export async function isTurnstileSecretInDb(env) {
  return isSecretConfigured(env, TURNSTILE_SECRET_TYPE);
}

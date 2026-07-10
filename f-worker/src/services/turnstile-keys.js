import { AppError } from '../utils/response.js';

const TURNSTILE_SITE_KEY_RE = /^0x4[a-zA-Z0-9_-]{18,}$/;

export function isTurnstileSiteKeyFormatValid(siteKey) {
  return TURNSTILE_SITE_KEY_RE.test(String(siteKey || '').trim());
}

/** 开启验证前校验 Site Key + Secret Key 是否齐全且 Secret 可被 Cloudflare 接受 */
export async function assertTurnstileReady(siteKey, secret) {
  const sk = String(siteKey || '').trim();
  const sec = String(secret || '').trim();

  if (!sk && !sec) {
    throw new AppError(
      '开启人机验证需同时配置 Site Key 与 Secret Key。获取方式：登录 Cloudflare 控制台 → Turnstile → 添加站点（域名填本站）→ 在站点详情复制 Site Key 与 Secret Key，返回本页分别保存。',
      400,
    );
  }
  if (!sk) {
    throw new AppError(
      'Site Key 未配置。获取方式：Cloudflare 控制台 → Turnstile → 选择站点 → 复制 Site Key（以 0x 开头），在本页「Site Key → 编辑」保存。',
      400,
    );
  }
  if (!sec) {
    throw new AppError(
      'Secret Key 未配置。获取方式：Cloudflare 控制台 → Turnstile → 选择同一站点 → 复制 Secret Key，在本页「Secret Key → 编辑」保存（保存后不回显）。',
      400,
    );
  }
  if (!isTurnstileSiteKeyFormatValid(sk)) {
    throw new AppError(
      'Site Key 格式不正确。请核对：Cloudflare 控制台 → Turnstile → 站点详情中的 Site Key（通常以 0x4 开头）；切勿将 Secret Key 或随意字符串填入 Site Key。',
      400,
    );
  }

  await validateTurnstileSecret(sec);
}

async function validateTurnstileSecret(secret) {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: String(secret).trim(),
      response: '',
    }),
  });

  const result = await response.json().catch(() => ({}));
  const codes = result['error-codes'] || [];

  if (codes.includes('invalid-input-secret')) {
    throw new AppError(
      'Secret Key 无效。查询方式：Cloudflare 控制台 → Turnstile → 对应站点 → 查看 Secret Key 是否一致；若已轮换密钥，请在本页重新保存 Secret Key。',
      400,
    );
  }

  if (
    codes.includes('missing-input-response') ||
    codes.includes('invalid-input-response')
  ) {
    return;
  }

  if (!result.success && codes.length > 0) {
    throw new AppError(
      `Turnstile 密钥校验失败（${codes.join(', ')}）。请到 Cloudflare 控制台 → Turnstile 核对 Site Key 与 Secret Key 是否来自同一站点。`,
      400,
    );
  }
}

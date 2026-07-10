import { AppError } from '../utils/response.js';
import { resolveTurnstileConfig } from './settings-service.js';

export function isInsecureDevAllowed(env) {
  return env.allow_insecure_dev === '1';
}

export async function isTurnstileConfigured(env) {
  const { siteKey, secret } = await resolveTurnstileConfig(env);
  return Boolean(siteKey && secret);
}

export async function verifyTurnstile(env, token, remoteIp) {
  const { secret } = await resolveTurnstileConfig(env);

  if (!secret) {
    if (isInsecureDevAllowed(env)) {
      return { skipped: true };
    }
    throw new AppError('人机验证未配置完成，请联系管理员', 503);
  }

  if (!token) {
    throw new AppError('请完成人机验证', 400);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: remoteIp || '',
    }),
  });

  const result = await response.json();
  if (!result.success) {
    throw new AppError('人机验证失败', 400);
  }

  return { success: true };
}

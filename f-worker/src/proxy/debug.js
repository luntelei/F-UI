import { redactText } from '../middleware/redact.js';

export function isDebugEnabled(env) {
  return env.debug === '1';
}

/** 代理调试日志：默认关闭；开启时仍脱敏 URL */
export function proxyLog(env, ...args) {
  if (!isDebugEnabled(env)) return;
  const safe = args.map((a) => (typeof a === 'string' ? redactText(a) : a));
  console.log('[proxy]', ...safe);
}

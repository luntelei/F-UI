import { isSupportedTarget, normalizeTarget } from '../subscription/convert.js';
import { readSetting, upsertSetting } from './secrets-service.js';
import { AppError } from '../utils/response.js';

const DEFAULT_TARGET_KEY = 'sub_converter_default_target';
const SUPPORTED = ['mixed', 'clash', 'sing-box', 'singbox'];

export async function getSubConverterConfig(env) {
  const raw = await readSetting(env, DEFAULT_TARGET_KEY);
  const defaultTarget = raw && isSupportedTarget(normalizeTarget(raw)) ? normalizeTarget(raw) : 'mixed';
  return {
    supportedTargets: SUPPORTED,
    defaultTarget: defaultTarget === 'singbox' ? 'sing-box' : defaultTarget,
    externalApiDisabled: true,
    runtime: 'worker-local',
  };
}

export async function updateSubConverterConfig(env, { defaultTarget }) {
  const normalized = normalizeTarget(defaultTarget);
  if (!isSupportedTarget(normalized)) {
    throw new AppError('不支持的 target', 400);
  }
  await upsertSetting(env, DEFAULT_TARGET_KEY, normalized);
  return getSubConverterConfig(env);
}

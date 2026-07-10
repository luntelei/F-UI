import { findUserBySubToken } from '../services/auth-service.js';
import { listSubscriptionNodes } from '../services/node-service.js';
import { listBestSubscriptionNodes } from '../services/best-service.js';
import { convertSubscription, isSupportedTarget, normalizeTarget } from './convert.js';

const SUB_HEADERS_BASE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
};

export async function serveSubscription(env, subToken, targetRaw) {
  const target = normalizeTarget(targetRaw);
  if (!isSupportedTarget(target)) {
    return new Response('Unsupported target', { status: 400 });
  }

  const user = await findUserBySubToken(env, subToken);
  if (!user || user.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const nodes = await listSubscriptionNodes(env);
  const bestNodes = await listBestSubscriptionNodes(env);
  const allNodes = [...nodes, ...bestNodes];
  const { body, contentType } = convertSubscription(env, allNodes, target);

  return new Response(body, {
    status: 200,
    headers: {
      ...SUB_HEADERS_BASE,
      'Content-Type': contentType,
      'Content-Disposition': 'attachment; filename="subscription"',
    },
  });
}

export async function findSubscriptionUser(env, subToken) {
  return findUserBySubToken(env, subToken);
}

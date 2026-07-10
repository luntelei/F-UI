import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, regKeys } from '../db/schema.js';
import {
  hashPassword,
  verifyPassword,
  isLegacyPasswordHash,
  newSubToken,
  randomCode,
} from '../utils/crypto.js';
import { signJwt } from '../utils/jwt.js';
import { AUTH_INFO_PREFIX, ROLES, TOKEN_EXPIRE } from '../const/constants.js';
import { AppError } from '../utils/response.js';
import { getD1Binding, getKvBinding } from '../utils/bindings.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAdminEmail(env, email) {
  return normalizeEmail(email) === normalizeEmail(env.admin);
}

export async function countUsers(env) {
  const db = getDb(env);
  const row = await db.select({ count: sql`count(*)` }).from(users).get();
  return Number(row?.count ?? 0);
}

export async function findUserByEmail(env, email) {
  const db = getDb(env);
  return db.select().from(users).where(eq(users.email, normalizeEmail(email))).get();
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    subToken: user.subToken,
    createdAt: user.createdAt,
  };
}

export function sanitizeUserPublic(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

export async function listUsers(env) {
  const db = getDb(env);
  const rows = await db.select().from(users).orderBy(sql`${users.id} asc`).all();
  return rows.map(sanitizeUserPublic);
}

export async function updateUser(env, actor, { id, status, role }) {
  const db = getDb(env);
  const target = await db.select().from(users).where(eq(users.id, Number(id))).get();
  if (!target) throw new AppError('用户不存在', 404);

  if (normalizeEmail(target.email) === normalizeEmail(env.admin)) {
    if (status === 'disabled') throw new AppError('不能禁用 Super Admin', 400);
    if (role && role !== ROLES.ADMIN) throw new AppError('不能降级 Super Admin', 400);
  }

  if (actor?.id === target.id && status === 'disabled') {
    throw new AppError('不能禁用当前登录账号', 400);
  }

  const patch = {};
  if (status === 'active' || status === 'disabled') patch.status = status;
  if (role === ROLES.ADMIN || role === ROLES.USER) patch.role = role;
  if (!Object.keys(patch).length) throw new AppError('无有效更新字段', 400);

  await db.update(users).set(patch).where(eq(users.id, target.id));
  const updated = await db.select().from(users).where(eq(users.id, target.id)).get();
  return sanitizeUserPublic(updated);
}

async function saveSession(env, user, sessionToken) {
  const key = AUTH_INFO_PREFIX + user.id;
  const kv = getKvBinding(env);
  let authInfo = await kv.get(key, { type: 'json' });
  if (!authInfo) {
    authInfo = { tokens: [], user: sanitizeUser(user), refreshTime: new Date().toISOString() };
  } else {
    authInfo.user = sanitizeUser(user);
  }
  authInfo.tokens = [...(authInfo.tokens || []), sessionToken].slice(-10);
  await kv.put(key, JSON.stringify(authInfo), { expirationTtl: TOKEN_EXPIRE });
}

async function claimRegKey(env, code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const rawDb = getD1Binding(env);
  const existing = await rawDb
    .prepare('SELECT id FROM reg_keys WHERE code = ?')
    .bind(normalizedCode)
    .first();
  if (!existing) {
    throw new AppError('邀请码不存在', 400);
  }

  const result = await rawDb
    .prepare(
      `UPDATE reg_keys
       SET use_count = use_count + 1
       WHERE id = ?
         AND code = ?
         AND use_count < max_uses
         AND (expire_at IS NULL OR datetime(expire_at) > datetime('now'))`,
    )
    .bind(existing.id, normalizedCode)
    .run();

  if (!result.meta?.changes) {
    throw new AppError('邀请码已用完或已过期', 400);
  }

  return existing.id;
}

async function releaseRegKey(env, regKeyId) {
  await getD1Binding(env)
    .prepare(
      `UPDATE reg_keys
       SET use_count = use_count - 1
       WHERE id = ?
         AND use_count > 0`,
    )
    .bind(regKeyId)
    .run();
}

async function setRegKeyUsedBy(env, regKeyId, userId) {
  await getD1Binding(env)
    .prepare('UPDATE reg_keys SET used_by = ? WHERE id = ?')
    .bind(userId, regKeyId)
    .run();
}

export async function registerUser(env, { email, password, regKeyCode }) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) throw new AppError('邮箱格式不正确', 400);
  if (!password || password.length < 6) throw new AppError('密码至少 6 位', 400);
  if (password.length > 64) throw new AppError('密码过长', 400);

  const existing = await findUserByEmail(env, normalized);
  if (existing) throw new AppError('邮箱已注册', 400);

  const total = await countUsers(env);
  let regKeyId = null;
  let userInserted = false;

  try {
    if (total === 0 && isAdminEmail(env, normalized)) {
      // 首个 super admin 引导注册，无需邀请码
    } else {
      if (!String(regKeyCode || '').trim()) {
        throw new AppError('注册需邀请码，请向管理员索取', 403);
      }
      regKeyId = await claimRegKey(env, regKeyCode);
    }

    const { salt, hash } = await hashPassword(password);
    const role = isAdminEmail(env, normalized) ? ROLES.ADMIN : ROLES.USER;
    const subToken = newSubToken();
    const db = getDb(env);

    const inserted = await db
      .insert(users)
      .values({
        email: normalized,
        passwordHash: hash,
        salt,
        role,
        subToken,
        regKeyId,
      })
      .returning()
      .get();
    userInserted = true;

    if (regKeyId) {
      await setRegKeyUsedBy(env, regKeyId, inserted.id);
    }

    const sessionToken = crypto.randomUUID();
    const token = await signJwt(env, { userId: inserted.id, token: sessionToken });
    await saveSession(env, inserted, sessionToken);
    return { token, user: sanitizeUser(inserted) };
  } catch (e) {
    if (regKeyId && !userInserted) {
      await releaseRegKey(env, regKeyId).catch(() => {});
    }
    throw e;
  }
}

export async function loginUser(env, { email, password }) {
  const normalized = normalizeEmail(email);
  const user = await findUserByEmail(env, normalized);
  if (!user) throw new AppError('用户不存在或密码错误', 401);
  if (user.status !== 'active') throw new AppError('账号已禁用', 403);

  const ok = await verifyPassword(password, user.salt, user.passwordHash);
  if (!ok) throw new AppError('用户不存在或密码错误', 401);

  if (isLegacyPasswordHash(user.passwordHash)) {
    try {
      const { salt, hash } = await hashPassword(password);
      const db = getDb(env);
      await db
        .update(users)
        .set({ passwordHash: hash, salt })
        .where(eq(users.id, user.id));
      user.passwordHash = hash;
      user.salt = salt;
    } catch {
      // 升级失败不阻断登录，下次登录再试
    }
  }

  const sessionToken = crypto.randomUUID();
  const token = await signJwt(env, { userId: user.id, token: sessionToken });
  await saveSession(env, user, sessionToken);
  return { token, user: sanitizeUser(user) };
}

export async function findUserBySubToken(env, subToken) {
  if (!subToken || String(subToken).length < 16) return null;
  const db = getDb(env);
  return db.select().from(users).where(eq(users.subToken, String(subToken))).get();
}

export async function rotateSubToken(env, userId) {
  const db = getDb(env);
  const existing = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!existing) throw new AppError('用户不存在', 404);

  const subToken = newSubToken();
  await db.update(users).set({ subToken }).where(eq(users.id, userId));

  const key = AUTH_INFO_PREFIX + userId;
  const kv = getKvBinding(env);
  const authInfo = await kv.get(key, { type: 'json' });
  if (authInfo?.user) {
    authInfo.user = { ...authInfo.user, subToken };
    await kv.put(key, JSON.stringify(authInfo), { expirationTtl: TOKEN_EXPIRE });
  }

  return subToken;
}

export async function logoutUser(env, userId, sessionToken) {
  const key = AUTH_INFO_PREFIX + userId;
  const kv = getKvBinding(env);
  const authInfo = await kv.get(key, { type: 'json' });
  if (!authInfo?.tokens) return;
  authInfo.tokens = authInfo.tokens.filter((t) => t !== sessionToken);
  await kv.put(key, JSON.stringify(authInfo), { expirationTtl: TOKEN_EXPIRE });
}

export async function verifySession(env, userId, sessionToken) {
  const key = AUTH_INFO_PREFIX + userId;
  const kv = getKvBinding(env);
  const authInfo = await kv.get(key, { type: 'json' });
  if (!authInfo?.tokens?.includes(sessionToken)) return null;

  const db = getDb(env);
  const user = await db.select().from(users).where(eq(users.id, Number(userId))).get();
  if (!user || user.status !== 'active') return null;

  authInfo.user = sanitizeUser(user);
  await kv.put(key, JSON.stringify(authInfo), { expirationTtl: TOKEN_EXPIRE });
  return authInfo.user;
}

export async function createRegKey(env, adminUserId, { maxUses = 1, expireDays = 30 }) {
  const db = getDb(env);
  const code = randomCode(12);
  let expireAt = null;
  if (expireDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + expireDays);
    expireAt = d.toISOString();
  }
  return db
    .insert(regKeys)
    .values({
      code,
      maxUses: Math.max(1, Number(maxUses) || 1),
      createdBy: adminUserId,
      expireAt,
    })
    .returning()
    .get();
}

export async function listRegKeys(env) {
  const db = getDb(env);
  return db.select().from(regKeys).orderBy(sql`${regKeys.id} desc`).all();
}

export async function deleteRegKey(env, id) {
  const db = getDb(env);
  await db.delete(regKeys).where(eq(regKeys.id, id));
}

export function isAdmin(user) {
  return user?.role === ROLES.ADMIN;
}

export function isSuperAdminOnly(env) {
  return env.invite_policy === 'super_admin_only';
}

export function isSuperAdmin(env, user) {
  return normalizeEmail(user?.email) === normalizeEmail(env.admin);
}

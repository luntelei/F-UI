import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  role: text('role').notNull().default('user'),
  subToken: text('sub_token').notNull().unique(),
  status: text('status').notNull().default('active'),
  regKeyId: integer('reg_key_id'),
  createdAt: text('created_at').notNull().default(sql`datetime('now')`),
});

export const regKeys = sqliteTable('reg_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  maxUses: integer('max_uses').notNull().default(1),
  useCount: integer('use_count').notNull().default(0),
  createdBy: integer('created_by').notNull(),
  usedBy: integer('used_by'),
  expireAt: text('expire_at'),
  createdAt: text('created_at').notNull().default(sql`datetime('now')`),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueEncrypted: text('value_encrypted').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`datetime('now')`),
});

export const secrets = sqliteTable('secrets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull().unique(),
  ciphertext: text('ciphertext').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`datetime('now')`),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'),
  action: text('action').notNull(),
  method: text('method'),
  ip: text('ip'),
  colo: text('colo'),
  country: text('country'),
  asn: integer('asn'),
  asOrganization: text('as_organization'),
  userAgent: text('user_agent'),
  pathRedacted: text('path_redacted').notNull(),
  status: integer('status'),
  createdAt: text('created_at').notNull().default(sql`datetime('now')`),
});

export const nodes = sqliteTable('nodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull().default('vless_ws'),
  proxyPath: text('proxy_path').notNull().unique(),
  configJson: text('config_json').notNull(),
  enabled: integer('enabled').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`datetime('now')`),
  updatedAt: text('updated_at').notNull().default(sql`datetime('now')`),
});

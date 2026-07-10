export function getD1Binding(env) {
  const db = env.F_UI_DB || env.db;
  if (!db) {
    throw new Error('D1 binding is not configured');
  }
  return db;
}

export function getKvBinding(env) {
  const kv = env.F_UI_KV || env.kv;
  if (!kv) {
    throw new Error('KV binding is not configured');
  }
  return kv;
}

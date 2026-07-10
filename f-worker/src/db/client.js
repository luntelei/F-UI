import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';
import { getD1Binding } from '../utils/bindings.js';

export function getDb(env) {
  return drizzle(getD1Binding(env), { schema });
}

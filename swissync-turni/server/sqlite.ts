import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Db, DbStatement } from './env';

/** D1-compatible database on local SQLite, with the same migrations (development and tests). */
export function sqliteDb(file: string, migrationsDir: string): Db {
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (sqlite.prepare('SELECT 1 FROM d1_migrations WHERE name = ?').get(name)) continue;
    sqlite.exec(readFileSync(join(migrationsDir, name), 'utf8'));
    sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
  }
  const statement = (sql: string, params: unknown[]): DbStatement => {
    const args = () => params.map((v) => (v === undefined ? null : v)) as (string | number | null)[];
    return {
      bind: (...values) => statement(sql, values),
      first: async <T>() => (sqlite.prepare(sql).get(...args()) as T | undefined) ?? null,
      all: async <T>() => ({ results: sqlite.prepare(sql).all(...args()) as T[] }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args()).changes) } }),
    };
  };
  return { prepare: (sql) => statement(sql, []) };
}

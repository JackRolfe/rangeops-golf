import { readdir, readFile } from 'node:fs/promises';
import { PGlite, type PGliteInterface, type Transaction } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

/** Anything that can run a query: the database or a transaction inside it. */
export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * The small database surface the rest of the API uses. PGlite today; a hosted
 * Postgres driver later only has to provide the same four calls.
 */
export class Db {
  constructor(readonly pg: PGliteInterface) {}

  async many<T>(sql: string, params: unknown[] = [], q: Queryable = this.pg): Promise<T[]> {
    return (await q.query<T>(sql, params)).rows;
  }

  async maybeOne<T>(sql: string, params: unknown[] = [], q: Queryable = this.pg): Promise<T | undefined> {
    return (await q.query<T>(sql, params)).rows[0];
  }

  async one<T>(sql: string, params: unknown[] = [], q: Queryable = this.pg): Promise<T> {
    const row = await this.maybeOne<T>(sql, params, q);
    if (!row) throw new Error(`Expected one row from: ${sql}`);
    return row;
  }

  tx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.pg.transaction(fn);
  }

  close(): Promise<void> {
    return this.pg.close();
  }
}

const migrationsDir = new URL('./migrations/', import.meta.url);

/** Applies every numbered `.sql` file in `migrations/` not yet recorded. */
export async function migrate(pg: PGliteInterface): Promise<string[]> {
  await pg.exec(`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  const done = new Set(
    (await pg.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(new URL(file, migrationsDir), 'utf8');
    await pg.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

/** Opens PGlite on disk (`dataDir`) or in memory, with the extensions the schema uses. */
export async function openDatabase(dataDir?: string): Promise<Db> {
  const pg = await PGlite.create({ dataDir, extensions: { btree_gist } });
  await migrate(pg);
  return new Db(pg);
}

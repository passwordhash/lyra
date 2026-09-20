// Шим node:sqlite под интерфейс expo-sqlite SQLiteDatabase — общий для
// самопроверок слоя БД (check-db) и рескана (check-sync).
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

export function makeDb(): SQLiteDatabase {
  const native = new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys = ON');
  const begin = () => native.exec('BEGIN');
  const commit = () => native.exec('COMMIT');
  const rollback = () => native.exec('ROLLBACK');
  return {
    execAsync: async (sql: string) => {
      native.exec(sql);
    },
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = native.prepare(sql).run(...(params as never[])) as {
        changes: number | bigint;
        lastInsertRowid?: number | bigint;
      };
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid ?? 0) };
    },
    getAllAsync: async (sql: string, params: unknown[] = []) => native.prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      native.prepare(sql).get(...(params as never[])) ?? null,
    withTransactionAsync: async (task: () => Promise<void>) => {
      begin();
      try {
        await task();
        commit();
      } catch (e) {
        rollback();
        throw e;
      }
    },
    withExclusiveTransactionAsync: async (task: () => Promise<void>) => {
      begin();
      try {
        await task();
        commit();
      } catch (e) {
        rollback();
        throw e;
      }
    },
  } as unknown as SQLiteDatabase;
}

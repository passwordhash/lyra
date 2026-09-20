import type { SQLiteDatabase } from 'expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { migrate } from './migrations';

let dbPromise: Promise<SQLiteDatabase> | null = null;

/** Открыть БД и накатить миграции (один раз на запуск). */
export function initDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = SQLite.openDatabaseSync('lyra.db');
      await db.execAsync('PRAGMA foreign_keys = ON');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

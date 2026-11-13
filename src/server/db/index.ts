import { mkdirSync } from "node:fs";
import path from "node:path";

import { Db } from "./database";
import { seedDefaultCategories } from "./default-categories";
import { pairTransfers } from "../import/transfers";
import { migrate } from "./migrations";

export { Db } from "./database";
export type { RunResult, SqlParams, SqlValue } from "./database";

/** Opens (and if needed creates) a database, bringing its schema up to date. */
export function openDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Db(file);
  migrate(db);
  seedDefaultCategories(db);
  // pairs transfers that were imported before pairing existed; a no-op afterwards
  pairTransfers(db);
  return db;
}

export function databasePath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data", "finance.db");
}

// The connection lives on `globalThis` so that hot reloads in development
// reuse it instead of opening the file again on every edit.
const globalStore = globalThis as typeof globalThis & { __financeDb?: Db };

/** The app's single database connection, opened lazily on first use. */
export function getDb(): Db {
  if (!globalStore.__financeDb) {
    globalStore.__financeDb = openDb(databasePath());
  }
  return globalStore.__financeDb;
}

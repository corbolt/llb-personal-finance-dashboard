import { connection } from "next/server";

import { getDb, type Db } from "./index";

/**
 * The database for rendering a page.
 *
 * SQLite queries are synchronous, so without this Next.js would run them
 * while prerendering and freeze their results into the static shell.
 * Awaiting `connection()` defers everything after it to request time, which is
 * what a page showing live data needs. Server Components should always get
 * their database through this function.
 */
export async function requestDb(): Promise<Db> {
  await connection();
  return getDb();
}

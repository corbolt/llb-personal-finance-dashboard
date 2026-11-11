import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";

export type SqlValue = SQLInputValue;
export type SqlParams = Record<string, SqlValue> | SqlValue[];

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * Thin, synchronous wrapper around Node's built-in SQLite driver.
 *
 * - caches prepared statements by SQL text
 * - returns plain objects (the driver's rows have a null prototype, which
 *   React refuses to pass from Server to Client Components)
 * - provides nestable transactions
 */
export class Db {
  readonly raw: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;

  constructor(readonly path: string) {
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA foreign_keys = ON");
    this.raw.exec("PRAGMA busy_timeout = 5000");
    if (path !== ":memory:") {
      this.raw.exec("PRAGMA journal_mode = WAL");
      this.raw.exec("PRAGMA synchronous = NORMAL");
    }
  }

  private prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.raw.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  all<T>(sql: string, params: SqlParams = []): T[] {
    const statement = this.prepare(sql);
    const rows = Array.isArray(params) ? statement.all(...params) : statement.all(params);
    return rows.map((row) => ({ ...row })) as T[];
  }

  get<T>(sql: string, params: SqlParams = []): T | undefined {
    const statement = this.prepare(sql);
    const row = Array.isArray(params) ? statement.get(...params) : statement.get(params);
    return row ? ({ ...row } as T) : undefined;
  }

  run(sql: string, params: SqlParams = []): RunResult {
    const statement = this.prepare(sql);
    const result = Array.isArray(params) ? statement.run(...params) : statement.run(params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  }

  /** Runs one or more statements without parameters (DDL, pragmas). */
  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /**
   * Runs `fn` atomically. Nested calls become savepoints, so a failure in an
   * inner block only rolls back that block when the caller catches it.
   */
  transaction<T>(fn: () => T): T {
    const savepoint = `sp_${this.depth}`;
    const outermost = this.depth === 0;
    this.raw.exec(outermost ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
    this.depth += 1;
    try {
      const result = fn();
      this.depth -= 1;
      this.raw.exec(outermost ? "COMMIT" : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      this.depth -= 1;
      this.raw.exec(
        outermost ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`,
      );
      throw error;
    }
  }

  close(): void {
    this.statements.clear();
    this.raw.close();
  }
}

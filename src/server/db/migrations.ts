import type { Db } from "./database";

interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Schema migrations, applied in order and tracked with `PRAGMA user_version`.
 * Never edit a migration that has shipped — append a new one instead.
 */
const migrations: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    sql: /* sql */ `
      CREATE TABLE accounts (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        currency    TEXT NOT NULL DEFAULT 'CHF',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      ) STRICT;

      CREATE TABLE imports (
        id               INTEGER PRIMARY KEY,
        account_id       INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        filename         TEXT NOT NULL,
        file_hash        TEXT NOT NULL,
        imported_at      TEXT NOT NULL DEFAULT (datetime('now')),
        row_count        INTEGER NOT NULL,
        inserted_count   INTEGER NOT NULL,
        duplicate_count  INTEGER NOT NULL,
        skipped_count    INTEGER NOT NULL DEFAULT 0,
        date_from        TEXT,
        date_to          TEXT
      ) STRICT;

      CREATE TABLE categories (
        id          INTEGER PRIMARY KEY,
        slug        TEXT UNIQUE,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        kind        TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
        icon        TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE transactions (
        id                 INTEGER PRIMARY KEY,
        account_id         INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        import_id          INTEGER REFERENCES imports(id) ON DELETE SET NULL,
        -- position in the bank's own booking order (ascending = older first)
        seq                INTEGER NOT NULL,
        reference          TEXT,
        fingerprint        TEXT NOT NULL,
        booked_at          TEXT NOT NULL,
        value_date         TEXT,
        -- the day the money was actually spent or received
        date               TEXT NOT NULL,
        amount             INTEGER NOT NULL,
        currency           TEXT NOT NULL,
        original_amount    INTEGER,
        original_currency  TEXT,
        balance            INTEGER,
        kind               TEXT NOT NULL,
        raw_text           TEXT NOT NULL,
        merchant           TEXT NOT NULL,
        merchant_key       TEXT NOT NULL,
        location           TEXT,
        memo               TEXT,
        card_last4         TEXT,
        category_id        INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        category_source    TEXT NOT NULL DEFAULT 'none'
                           CHECK (category_source IN ('none', 'auto', 'rule', 'manual')),
        note               TEXT,
        excluded           INTEGER NOT NULL DEFAULT 0,
        created_at         TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
      ) STRICT;

      CREATE UNIQUE INDEX transactions_reference
        ON transactions(account_id, reference) WHERE reference IS NOT NULL;
      CREATE UNIQUE INDEX transactions_fingerprint ON transactions(account_id, fingerprint);
      CREATE INDEX transactions_date ON transactions(date);
      CREATE INDEX transactions_account_seq ON transactions(account_id, seq);
      CREATE INDEX transactions_merchant ON transactions(merchant_key);
      CREATE INDEX transactions_category ON transactions(category_id);
      CREATE INDEX transactions_import ON transactions(import_id);

      CREATE TABLE rules (
        id           INTEGER PRIMARY KEY,
        -- 'merchant': merchant_key equals pattern; 'text': booking text contains pattern
        match_type   TEXT NOT NULL CHECK (match_type IN ('merchant', 'text')),
        pattern      TEXT NOT NULL,
        category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (match_type, pattern)
      ) STRICT;

      CREATE TABLE budgets (
        category_id  INTEGER PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,
        amount       INTEGER NOT NULL CHECK (amount >= 0)
      ) STRICT;

      CREATE TABLE recurring_overrides (
        merchant_key  TEXT NOT NULL,
        direction     TEXT NOT NULL CHECK (direction IN ('out', 'in')),
        decision      TEXT NOT NULL CHECK (decision IN ('ignore', 'force')),
        cadence       TEXT,
        PRIMARY KEY (merchant_key, direction)
      ) STRICT;

      -- Transactions joined with their category and the money "flow" they count
      -- towards. Uncategorised bookings count by their sign.
      CREATE VIEW transactions_view AS
      SELECT
        t.*,
        c.name AS category_name,
        c.slug AS category_slug,
        c.icon AS category_icon,
        COALESCE(c.kind, CASE WHEN t.amount < 0 THEN 'expense' ELSE 'income' END) AS flow
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id;
    `,
  },
];

export function migrate(db: Db): void {
  const row = db.get<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
    });
  }
}

export const SCHEMA_VERSION = migrations[migrations.length - 1].version;

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## This project

A local, single-user personal finance app: bank exports (.xlsx) go in, a SQLite file holds the data, Next.js renders it. See `README.md` for what it does.

### Environment

- Needs Node.js 22.13 or newer (`.nvmrc`). The shell's default Node may be much older — run `nvm use` first, otherwise every command fails in confusing ways. In a non-interactive shell: `source ~/.nvm/nvm.sh && nvm use`.
- SQLite comes from Node's built-in `node:sqlite` on purpose: the development machine runs Ubuntu 20.04 (glibc 2.31), where the prebuilt binaries of current `better-sqlite3` do not load. Don't swap in a native driver without checking that.
- `data/finance.db` is the user's real financial data. Never run experiments, a dev server you are testing with, or scripts against it. Point `DATABASE_PATH` at a scratch file instead, e.g. `DATABASE_PATH=/tmp/scratch.db npm run dev`.
- Tests must never contain real bank data. `src/server/import/fixture.ts` builds synthetic exports in the bank's format.

### Checks

- `npm test` — unit and integration tests (Vitest, in-memory SQLite)
- `npm run typecheck` — route type generation plus `tsc`
- `npm run lint`
- `npm run build` — must list every page as `◐ Partial Prerender`

### Conventions that are easy to break

- **Data is read at request time.** SQLite queries are synchronous, so Next.js would run them during prerendering and freeze the result into the static shell. Server Components get the database through `requestDb()` (`src/server/db/request.ts`), which awaits `connection()` first, and sit inside a `<Suspense>` boundary. Server Actions use `getDb()` and end with `refresh()`.
- **No `Intl` in shared formatters.** `src/lib/money.ts` and `src/lib/dates.ts` format by hand because Node and browsers ship different ICU data ("1’234" vs "1'234", "Sep" vs "Sept"), which breaks hydration of Client Components.
- **Money is integer minor units** (Rappen), dates are `YYYY-MM-DD` strings, months `YYYY-MM`. No floats, no `Date` objects for calendar days.
- **Schema changes are appended** as a new entry in `src/server/db/migrations.ts`; shipped migrations are never edited.
- **`src/server/**` has no Next.js imports** except `db/request.ts`, so it runs in tests unchanged. Use relative imports there.
- **Chart colours are validated**, not picked: spending is `--accent`, income `--income`, anything else is context grey. Categories are told apart by icon and name, never by colour. Changing a series colour or a surface means re-validating for colour-vision deficiency and contrast.
- Category spending is net of refunds; transfers between own accounts and excluded bookings count nowhere (`transactions_view.flow`).
- **Every visible text comes from a catalog.** `src/i18n/messages/en.ts` is the source; `de-LI.ts` must have the same keys and placeholders (checked by type and by `src/i18n/i18n.test.ts`). Server Components use `await getI18n()`, Client Components `useI18n()`; both give `t`, `format` (dates) and `link` (addresses carry the language: `link("/budgets")` → `/de-LI/budgets`). Never build an internal `href` by hand.
- **`src/server/**` speaks no language.** Failures throw `UserFacingError` subclasses with an `error.*` key; actions return `{ key, params }` and the UI words it with `t.error()`. Built-in category and generated merchant names are stored in English and translated on display (`src/i18n/names.ts`) — don't change stored defaults.


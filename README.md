# Rappen

A personal finance app for your own computer. You upload the Excel export from
your online banking once a month; it sorts the transactions into categories,
finds subscriptions and bills, and shows where the money goes. Everything is
stored in one SQLite file on your machine — there is no account, no cloud and
no connection to the bank.

It was built against the transaction export of **LLB Online Banking**
(Liechtensteinische Landesbank).

## What you get

| Page | What it shows |
| --- | --- |
| **Overview** | Spending this month against last month day by day, balance, income, top categories, upcoming recurring payments, latest transactions |
| **Transactions** | Every booking, searchable and filterable; change a category in place or open a booking for details, notes and exclusion |
| **Spending** | By category, by merchant, day by day and month by month, for one month or a longer period |
| **Recurring** | Detected subscriptions, bills and regular income, what they cost per month and year, and what is due next |
| **Budgets** | A monthly limit per category, with suggestions from your own averages |
| **Categories** | Merchants that still need a category, your categories, and the rules that sort new imports |
| **Import** | Upload, accounts, import history (with undo) and warnings about missing transactions |

## Getting started

Requires **Node.js 22.13 or newer** (the app uses the SQLite driver built into
Node, so there is nothing to compile).

```bash
nvm use            # picks Node 22 from .nvmrc
npm install
npm run dev
```

Open <http://127.0.0.1:3000> and drop your export onto the page. The language follows your browser
(English or German); switch it in the sidebar — every address starts with it, e.g. `/de-LI/budgets`.

For everyday use the production build starts faster and feels snappier:

```bash
npm run build
npm start
```

To keep it running in the background, `./start.sh` starts it (building first if there is no build yet)
and writes its output to `server.log`; `./stop.sh` stops it again. After pulling changes, run `pnpm build`
before starting, so the server serves the new version.

## Importing

1. In your online banking, export the account's transactions as Excel (`.xlsx`).
2. Drop the file on the **Import** page (or the welcome screen). Several files at once work too.

Things worth knowing:

- **Overlapping exports are fine.** Bookings are recognised by their reference
  number (or, without one, by their content) and never imported twice.
- **The export can be capped.** The file only contains the rows listed on
  screen — the sample this was built with stopped at exactly 200. If more than
  that happens between two imports, widen the list or date range before
  exporting. The Import page reports a gap when the running balance does not
  add up between two stored bookings.
- **Don't sort or filter before exporting.** The bank's own order is what lets
  the app know the exact closing balance of each day.
- **Required columns:** `Buchungsdatum`, `Buchungstext`, `Betrag`. Recommended:
  `Referenz-Nr.`, `Valutadatum`, `Saldo`, `Betrag in Referenzwährung`.
  Columns are found by their header, so their order does not matter.
- An import can be **undone** from the import history; that removes exactly the
  transactions it added.

## How it decides things

**Dates.** A card payment is dated on the day of the purchase, which the bank
prints in the booking text, not on the day it was booked a few days later.
Everything else is dated on its booking day.

**Categories.** New transactions are categorised in this order:

1. your own rules,
2. the kind of booking (transfer between own accounts, bank fee, …),
3. known merchants (Coop, SBB, Swisscom, Netflix, … — well over a hundred
   Swiss, Liechtenstein, Austrian and German names),
4. keywords in the payment purpose (`Miete`, `Kindergeld`, …),
5. keywords in the merchant name (`Apotheke`, `Restaurant`, `Metzgerei`, …).

Whatever matches nothing shows up under **Categories → Needs a category**.
Pick a category there once per merchant: it applies to all of that merchant's
transactions and becomes a rule for future imports. Categories you set by hand
on a single transaction are never overwritten by rules.

**Totals.** Each category counts as spending, income or transfer. Refunds
booked into a spending category reduce it. Transfers between your own accounts
and transactions you exclude count nowhere.

**Recurring payments** are recognised when

- the same amount arrives at a steady rhythm (twice is enough for bank
  payments; card payments need three),
- the statement names a billing period (`Periode 01.07.2026-30.09.2026`),
- the merchant is a known subscription or utility, or
- the text says so (`Miete`, `Salär`, a standing order).

You can overrule it either way from a transaction's details ("Mark as
recurring" / "Not recurring"). With only a month or two imported, expect this
list to grow as more history comes in.

**Budgets** compare a category's spending in a month with the limit you set.
Suggestions are the average of the preceding months that are *completely*
covered by your data.

## Your data

- The database is `data/finance.db` (plus `-wal` and `-shm` files while the app
  runs). Set `DATABASE_PATH` to keep it somewhere else.
- **Backup:** stop the app and copy the `data` folder.
- The server listens on `127.0.0.1` only and additionally refuses requests that
  were not addressed to localhost, so other devices and other websites cannot
  read your data. To reach it from another device on purpose, copy
  `.env.example` to `.env`, set `HOST` to the machine's address in the network
  (e.g. `192.168.178.3`) and list the same address in `ALLOWED_HOSTS`, then start
  with `./start.sh`. There is no login — only do that on a network you trust.
- `.gitignore` excludes the database and all spreadsheet files, so bank data
  does not end up in a repository by accident.

## Development

```bash
npm test           # Vitest — import pipeline, queries, recurring detection, formatting
npm run typecheck  # generates route types, then runs tsc
npm run lint
```

To try things without touching your real data, point the app at a scratch
database:

```bash
DATABASE_PATH=/tmp/scratch.db npm run dev
```

### Stack

- [Next.js 16](https://nextjs.org) (App Router, Cache Components, Server
  Actions) with React 19 and the React Compiler
- SQLite through Node's built-in `node:sqlite`, plain SQL, migrations in
  `src/server/db/migrations.ts`
- Tailwind CSS 4, [Base UI](https://base-ui.com) for dialogs and selects,
  Lucide icons, Sonner for toasts
- [SheetJS](https://sheetjs.com) to read the export
- Charts are hand-written (SVG and CSS), server-rendered, with a table view
  behind every chart

### Layout

```
src/
  app/                 pages, layout, Server Actions (actions.ts)
  components/          UI; charts/ holds the chart kit
  i18n/                languages: catalogs (messages/), translator, date formatting
  lib/                 money, dates and URL helpers shared by server and client
  proxy.ts             localhost-only guard
  server/
    db/                connection, schema migrations, default categories
    import/            spreadsheet → transactions: reading, booking-text parsing,
                       merchant clean-up, categorising, ordering, storing
    queries/           everything the pages read
    recurring/         recurring-payment detection
    mutations.ts       everything the pages change
```

`AGENTS.md` lists the conventions that matter when changing the code.

## Limits

- Only the LLB export layout is supported. The parser was written from a single
  export: card payments, e-banking payments, credits, account transfers, fees
  and the quarterly closing are covered by what it contained; standing orders,
  direct debits and cash withdrawals are recognised by their German labels but
  have not been seen in real data yet.
- One currency per account. Foreign-currency purchases show the original amount
  but are counted in the account's currency, as booked by the bank.
- The interface is in English and in German as written in Liechtenstein; amounts use Swiss conventions in both.
- The name lives in `src/lib/site.ts`, the tagline with all other texts in `src/i18n/messages/`.

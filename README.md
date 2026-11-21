# Auriance Ops

An operations app for small retail and e-commerce teams. It covers:

- **Orders:** create orders, ship them fully or partially, handle returns and swaps, and track payments.
- **Products:** products with variants, SKUs, prices and reorder thresholds, plus CSV import.
- **Inventory:** stock levels, a full movement ledger, weighted-average cost, restocks and adjustments, and
  not-sellable (returned) stock.
- **Finance:** profit and loss on a shipped or paid basis, expenses, receivables, a monthly trend, and
  accounting CSV exports.
- **Team:** per-section access, invite links, notifications, and a password-protected Admin Mode for
  destructive actions.

## Stack

| Layer    | Tech                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| Frontend | React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, React Router                 |
| Backend  | Node 22, Hono, typed RPC (`/api/rpc/<procedure>`) with zod validation                    |
| Database | SQLite (better-sqlite3, WAL) with Drizzle ORM and committed migrations                   |
| Auth     | Email and password (scrypt), httpOnly session cookies, same-origin checks                |

The production build is a single process. It serves the API and the built web app from `dist/`.

## Development

```sh
pnpm install
cp .env.example .env     # optional: first admin, currency, timezone
pnpm dev                 # API on :3000 and Vite on :5173 (proxies /api)
```

Open http://localhost:5173. Without `ADMIN_EMAIL`/`ADMIN_PASSWORD` you'll see a setup screen that creates the
first admin. To add demo data to an empty database, run `pnpm seed` or start with `SEED_DEMO=true`.

| Command            | What it does                                                         |
| ------------------ | -------------------------------------------------------------------- |
| `pnpm dev`         | API (tsx watch) and web (Vite) together                              |
| `pnpm build`       | Type-check, build the SPA into `dist/client` and the server into `dist/server` |
| `pnpm start`       | Run the production build                                             |
| `pnpm test`        | Server tests (in-memory SQLite) and frontend unit tests              |
| `pnpm lint`        | ESLint                                                               |
| `pnpm smoke`       | End-to-end check of the production build over HTTP (run `pnpm build` first) |
| `pnpm seed`        | Add demo data to an empty database                                   |
| `pnpm db:generate` | Create a migration after changing `server/db/schema.ts`              |

## Project layout

```
server/            API server
  app.ts           Hono app: health, auth, RPC, static files and SPA fallback
  auth/            passwords, sessions, Admin Mode, invite/reset links
  db/              Drizzle schema, client and migrations
  modules/         procedures: orders, products, inventory, finance, users, …
  lib/             business rules (permissions, stock movements, finance report, …)
  rpc/             procedure builder and router (the API type the client imports)
  jobs/backup.ts   nightly SQLite backups
shared/            constants, types and date helpers used by both sides
src/               React app
  lib/api.ts       typed client: api.orders.list, useQuery, useMutation
  lib/auth.tsx     session, permissions and Admin Mode
  lib/format.ts    money and date formatting in the business currency and timezone
  components/      app shell, data-table helpers, dialogs, shadcn/ui
  pages/           one folder per section
```

## Deployment

See [DEPLOY.md](./DEPLOY.md). In short: Railway, one service, a volume at `/data`, and a few variables.

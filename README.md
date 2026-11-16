# Lobstore

Inventory and store management for a small clothing business. I started Lobstore while thinking about the clothing line I want to build: what would I need to keep track of products, people and more than one location?

The app has a React interface, an Express API and a PostgreSQL database. You can explore a local demo or create an account with a separate, initially empty business workspace.

[GitHub repository](https://github.com/deviitskiran-bot/lobstore)

## Features

- Add, edit, search, filter and delete inventory, employee, store and franchise records.
- Track stock thresholds, inventory cost, manually entered store totals and profit margins.
- Use Owner, Manager and Staff accounts with server-side permission checks.
- Record salary payments and advance the due date, including month-end handling. This records a payment; it does not transfer money.
- Review recent activity and computed low-stock/payroll notifications.
- Export the currently filtered records as CSV with spreadsheet-formula protection.
- Switch themes and use the interface on a narrow screen.

All demo businesses, people and activity are fictional. Demo changes stay in this browser's localStorage. Signing in uses PostgreSQL records; demo data is not copied into a new business.

## Architecture

```mermaid
flowchart LR
  UI[React interface] -->|same-origin JSON requests| API[Express API]
  API --> AUTH[Session and role checks]
  AUTH --> DB[(PostgreSQL)]
  UI -->|demo mode only| LOCAL[Browser localStorage]
```

During development, Vite proxies `/api` to Express. After a build, Express serves both the compiled interface and `/api` from one origin. There are no cloud resources required to run Lobstore.

## Run locally

Requirements: Node.js 22 or later, pnpm 11.25.0 and Docker with Compose (or your own PostgreSQL 17 instance).

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# The Compose database uses local-development credentials and a localhost-only port.
docker compose up -d
pnpm build
pnpm server
```

Open `http://127.0.0.1:3001`. Choose **Sign in → Create an account** to create an empty business. Add a store, then inventory and employee records. Owners can create Manager/Staff login accounts in Settings. Employee directory entries and login accounts are separate.

For frontend development, keep `pnpm server` running in one terminal and run `pnpm dev` in another. Open Vite's displayed local address. Only the interface supports hot reload; restart Express after server changes.

To stop the local database while keeping its data:

```sh
docker compose stop
```

`.env`, dependencies, generated builds and local database files are excluded from Git. The example database password is only for local development. Use separate credentials for any hosted database.

## Verification

```sh
# Helper tests only; API integration is reported as skipped without a test database.
pnpm test

# Run all tests against a separate database whose name ends in _test.
# Create that database first, and supply its connection string through your environment.
TEST_DATABASE_URL=postgresql://lobstore:lobstore@127.0.0.1:5432/lobstore_test pnpm test

pnpm build
pnpm format:check

# With the built application and API running at port 3001:
pnpm exec playwright install chromium
pnpm test:browser
```

The browser test creates fictional accounts and records in the running application. Use a disposable database when running it. Optional environment variables: `TEST_URL` selects a local app address; `BROWSER_CHANNEL=chrome` uses an installed Chrome instead of Playwright's Chromium.

The API tests cover authenticated CRUD, access across businesses, roles, salary privacy, transaction rollback, payroll dates, session invalidation, input validation and authentication throttling. Helper tests cover calendar dates and CSV escaping. Browser checks exercise the built interface against the real API. See [verification notes](docs/verification.md) for the latest local results.

GitHub Actions runs the tests with a PostgreSQL service, checks formatting, builds the interface and runs the browser checks. Its remote result should be checked on the repository's Actions tab.

## Security and scope

- Passwords are salted and hashed with scrypt. Session tokens are random; only their hashes are stored in PostgreSQL.
- Cookies are HttpOnly and SameSite Strict; `NODE_ENV=production` also enables Secure cookies.
- SQL values are parameterized. Record reads and changes are scoped to the signed-in business. Owners control payroll and account roles; staff cannot change records.
- Authentication is limited per IP in the single API process. Request bodies have a size limit, and writes validate accepted fields and reject unapproved browser origins.
- CSV quoting and formula-prefix neutralization reduce spreadsheet formula-injection risk. Treat exports as data and avoid enabling spreadsheet content you do not trust.

This is a personal application, not a production payroll or accounting system. Store revenue/expenses are editable totals, not a transaction ledger. Notifications are computed when the workspace loads; read state lasts only in the current UI session. There is no payment integration, password reset, email verification, location-specific access policy or automatic refresh across clients. Store assignments use names rather than foreign keys. Record fields use JSONB for a compact implementation; a more mature schema would add stronger relationships and migrations. Payroll month-end clamping uses the current due date, so February 28 advances to March 28 rather than restoring an original January 31 anchor.

Before hosting it for real users, configure HTTPS, production secrets, tested backups, appropriate cookie/proxy settings and a deployment-specific origin allowlist. The current local setup has not been assessed for public production use.

## Notes for understanding the code

[Design decisions and walkthrough](docs/decisions.md) describes the request flow, schema, permissions and current tradeoffs. Public source and documentation describe the application; they do not imply that it has paying users or a deployed clothing business.

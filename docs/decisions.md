# Design decisions and code walkthrough

## Why this application

Lobstore began as a personal idea for managing a clothing line in development. Its scope is store records: stock, employees, locations and payment records. It is not a storefront or checkout system.

## One frontend and one API

React keeps UI state and renders the dashboard/forms. Express provides a small JSON API and serves the production build. A single origin avoids needing a broad CORS configuration. Vite's development proxy forwards `/api` to the local API.

`src/main.jsx` contains navigation, workspace state and record forms; `src/components/` holds the authentication and account-management forms. `src/data.js` supplies fictional demo records and a currency formatter. `server/index.js` contains routes, authentication, validation and database queries. The app is intentionally small; extracting page components would be a reasonable next readability improvement.

## Two data modes

Demo records are stored only in localStorage. Authenticated records come from PostgreSQL. Creating an account creates an empty business, not a copy of the demo. SessionStorage holds a display hint about the user; it is not an authentication credential or an authorization decision. `/api/me` refreshes the identity and role from the actual server session.

Example: submit an inventory form → React converts numeric fields → POST `/api/records/inventory` → the API validates the session and role → the API validates fields and writes the business-scoped record/activity in a transaction → React reloads `/api/workspace`.

## PostgreSQL schema

- `businesses`: one workspace per business.
- `accounts`: login identity, salted password hash and role, linked to a business.
- `sessions`: SHA-256 hash of a random token, account and expiry.
- `records`: business, kind and JSONB fields for inventory/employees/stores/franchises.
- `activity`: business-scoped descriptions of changes.
- `payments`: employee payment amount and timestamp.

JSONB keeps the CRUD implementation compact across record types. It gives up some relational guarantees: locations are names, allowed record structures live in application code, and there is no migration framework. Startup creates missing tables; it does not migrate an existing schema.

## Authentication and authorization

Passwords are hashed using a random salt and scrypt; hashing is one-way, so login hashes the supplied password and compares the result with a constant-time comparison. The current implementation uses synchronous scrypt, which is simple but blocks the Node event loop during authentication. It would need asynchronous hashing and load testing before scaling.

The browser holds a random session token in an HttpOnly cookie. PostgreSQL holds its SHA-256 hash. Session lookup checks expiry and joins the account, so the server reads the current role for each request.

- Owner: all workspace records, salary fields, payroll and login-account management.
- Manager: inventory, employees and stores; no salary/due fields, payroll or franchises.
- Staff: read-only inventory, employees and stores; no salary/due fields or franchises.

Hiding buttons is for usability. Server checks are the access boundary. Salary fields must be removed from mutation responses as well as workspace reads. Business IDs come from the authenticated account rather than request data.

Logout invalidates all sessions for the current account. There is no session-cleanup job or password recovery. The in-memory IP rate limit resets when the API restarts and is not shared across instances. Development origins are explicitly permitted; a hosted deployment needs its own origin/proxy setup.

## Transactions and dates

Record mutation and its activity entry share a transaction. Payroll locks the employee record, inserts a payment, updates the next due date and adds activity, then commits. On an error, rollback avoids a partial payment update. Row locking does not make two intentional payment submissions idempotent: each successful call records another monthly payment.

`shared/dates.js` validates actual calendar dates and advances from day one before clamping the day to the destination month's end. That avoids JavaScript date rollover from January 31 into March. Clamping does not preserve a separate original day-of-month anchor.

## CSV and totals

`shared/csv.js` quotes cells, doubles embedded quotes and prefixes potentially executable spreadsheet formulas with an apostrophe. Frontend exports use the current filtered record set. Helper and browser-download tests check formula handling.

Dashboard totals come from record values. There are no invented growth percentages, time-series curves or period multipliers. Revenue and expenses are manually entered store totals; inventory value is stock multiplied by cost. Profit margin is `(revenue - expenses) / revenue`, shown only when revenue is positive.

## Learning checkpoints

To demonstrate understanding, trace a request without relying on the interface, explain why a manager cannot obtain salary data, reproduce an integration test failure, and make a small change with a test. Running this application is separate from being able to independently explain or modify all of it.

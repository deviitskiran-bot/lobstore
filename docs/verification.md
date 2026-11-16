# Verification

Local verification on macOS, November 16, 2026. Tests use a disposable PostgreSQL 17 container, not application/customer data.

- Production Vite build: passed.
- Node test runner with TEST_DATABASE_URL: 28 reported tests passed, 0 failed/skipped. This includes a parent integration test, its 21 subtests and 6 helper tests.
- Browser workflows: passed using an isolated headless Chrome session against the production build and PostgreSQL. Verified demo persistence, signup, authenticated store/product/employee creation, product edit/reload/delete, formula-protected CSV download, payroll, staff-account creation and read-only salary-hidden UI, theme switching and a 390px layout with no page overflow or runtime errors.
- Dependency advisory check (`pnpm audit --json`): 0 known vulnerabilities at verification time. This is not a guarantee that the application has no security bugs.
- GitHub Actions: remote result is available on the repository Actions tab after publication. Local checks do not establish that a remote run succeeded.

The local test database was bound to localhost at a separate port. The transferred original project was not modified. No actual cloud or payment service was used.

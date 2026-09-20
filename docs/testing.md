# Lead Core verification

No external test framework: Node's `node:test`, `assert`, built-in fetch and child processes use the existing application and Mongoose.

## Commands and isolation

```sh
npm run check:syntax
npm run test:unit
npm test
npm run test:smoke
```

Use `npm.cmd` in PowerShell if script execution policy blocks npm. Full and smoke suites require a local MongoDB server. Default test URI is `mongodb://127.0.0.1:27017/the_daily_web_test`; set `TEST_MONGODB_URI` to the same database name on the temporary server's port if different. Tests reject remote hosts and any other base database name.

Each integration file creates `the_daily_web_test_<label>_<pid>_<random>`. Cleanup checks that exact connection/name before dropping only that database. `.env` and development databases are not used. A failed MongoDB connection fails tests instead of skipping them. An abruptly killed test process can leave an isolated test database; inspect its exact name before manual removal. Do not point any cleanup at development data.

An official portable MongoDB ZIP is acceptable local test infrastructure: extract outside the repository, bind only `127.0.0.1`, use a dedicated temporary dbpath and free port, stop the owned process afterwards. It is not an npm dependency, service, project asset or replica set. Do not commit the binary, data files or test logs.

## Automated coverage

| File | What it verifies |
| --- | --- |
| `runtime.test.js` | Import does not start/connect, original page/static/health/404, malformed/oversized bodies, safe 500, environment and test-URI safeguards |
| `password.test.js` | Salted scrypt verification, wrong credentials, DTO and cookie safety |
| `articleValidation.test.js` | Required content object, incomplete strings allowed, submit completeness, invalid shapes/fields/limits/categories/image schemes |
| `articles.test.js` | HTTP create/save/submit/return/resubmit/approve/revision/delete, ownership/roles, invalid transitions, tampering, first-publication preservation and public snapshot isolation |
| `publicArticles.test.js` | Real 45-document fixture, 20/20/5 pagination, equal-date tie-break, public visibility across all states, no private leakage, invalid queries/IDs, public index and explain |
| `publicNews.test.js` | Approved-title search (including Hebrew), category/date sort combinations, 20-item pagination, public EJS complete body/escaping, revision visibility, unavailable/deleted pages and index plans |
| `feedClient.test.js` | Real client script with small DOM/fetch doubles: stale response protection, serial infinite scroll, deduplication, filter reset, error/retry, empty/end and load-more fallback; not a browser layout test |
| `browserIdentity.test.js` | Actual helper in VM: UUID reuse, clear/corrupt/blocked storage and unavailable secure generator |
| `articleTracking.test.js` | One anonymous POST per script execution; no retries, safe network/HTTP failure, missing identity/page |
| `viewStats.test.js` | Isolated MongoDB persistence, public/revision validation, concurrent bucket increments, duplicate-key retry, UTC boundaries and intact SSR during a statistics-write failure |
| `analytics.test.js` | Cross-browser/hour popularity totals, zero-view ordering, all viewed/search/category/sort combinations across pages, identity/cursor validation, Editor analytics totals/series/history/permissions, safe DTOs and actual lookup index plans |
| `analyticsPage.test.js` | Editor-only central page (Guest 401 / Reporter 403 / Editor 200), shared role-aware navigation, static assets and feed control/script wiring |
| `analyticsClient.test.js` | Real client script with DOM/fetch doubles: safe public article search/paging/selection, 7/30/90-day requests, stale responses, empty/low SVG data, zero-fill, exact supplied markers, resize math and visible retryable API/network errors |
| `coreIntegration.test.js` | Existing auth/User CRUD, uniqueness, session digest/expiry/logout/password revocation, removed User, repeatable index setup and real Node process restart with the same cookie |
| `ui.test.js` | Shared home/login/404 shell, Reporter/Editor session-aware HTML, authenticated login redirect, logout/revoked cookie, unchanged bad-login API contract |
| `scripts/smoke-test.js` | Original six HTTP status/content-type checks against an isolated DB, no in-memory Article fallback |

`runtime.test.js` also checks the guest Login page/assets without MongoDB and a controlled EJS 503 when a session lookup needs an unavailable database.

Test fixtures are deliberately small and temporary; they are not the team's 500-article seed. The index explain check proves the declared index supports the public sort; it is not a thousands-of-readers load benchmark. Simultaneous editing, external image availability and deferred feature UI behavior are not claimed as tested.

## Verified central view-insights UI run - 2026-09-20

- `npm.cmd run check:syntax`: PASS, 81 JavaScript files.
- `npm.cmd run test:unit`: PASS, 12 tests.
- `npm.cmd test`: PASS, 78 tests, zero failures/skips. Includes nine added UI/integration tests and all existing backend/auth/workflow regression tests.
- `npm.cmd run test:smoke`: PASS, all six HTTP checks.
- Tests use isolated local MongoDB databases, not development seed data. Before/after SHA-256 inventories show only the central page/feed/navigation/tests/docs changed; existing services, API routers/controllers, models, package files and teammate-owned files are unchanged. No Git operations.
- Actual visual checks at 360/768/1280 remain outstanding: browser inventory was empty and creating an in-app browser returned `Browser is not available: iab`. Client tests verify SVG widths/behavior, not real browser layout. No browser fixture server or development test accounts were created.

## Verified popularity/viewed/analytics backend run - 2026-09-19

- `npm.cmd run check:syntax`: PASS, 76 JavaScript files.
- `npm.cmd run test:unit`: PASS, 12 tests.
- `npm.cmd test`: PASS, 69 tests, zero failures/skips, including seven new analytics/query tests. The final rerun also covers multiple hourly points, the exclusive period end and update markers when first publication lies outside the window.
- `npm.cmd run test:smoke`: PASS, all six HTTP checks.
- Real MongoDB tests used isolated local databases; a final read-only inventory found no remaining `the_daily_web_test_*` databases. No development fixtures were created.
- Before/after SHA-256 inventories verified that models, workflow, package files, frontend and all existing teammate-owned files were unchanged. No Git operations or dependencies added.
- This is backend/index-plan verification, not a concurrent-reader load benchmark or final UI/browser test. See [analytics](analytics.md) for exact contracts and known pagination/resolution limits.

## Shared UI browser checks

### View-insights UI checklist

- Feed: select Popularity and each Reading status alongside search/category; inspect API parameters, load page two, change a filter and confirm paging restarts. All must omit viewed/browserId. Clear identity storage or block storage and confirm normal browsing remains usable. With no secure identity, selecting Viewed must visibly revert to All.
- Editor `/analytics`: no automatic article selection; title search and Load more use the public API. Select an article; change 7/30/90-day presets. Check totals, returned interval and marker lines/list. A missing bucket means zero, not interpolation across a gap. Select zero-view data and a period with no markers. Simulate failed requests/session expiry and use visible retry.
- At 360, 768 and 1280 CSS pixels: feed and analytics controls wrap, title/ID/timestamps break safely, no horizontal page overflow, chart ticks/legend remain readable. Keyboard navigation and the expandable text-data alternative should work.
- Current execution environment has no connected browser and its in-app browser reports unavailable. DOM/fetch tests verify behavior and SVG resize calculations, not actual viewport layout. Visual verification at these widths remains a manual acceptance check; do not label it passed based on unit tests alone.

Use local test accounts, never real credentials in screenshots or logs. The Node HTTP tests check server responses; they do not execute browser JavaScript. Verify these separately in a browser:

1. Open `/login` as a guest. Empty fields use native form validation; an incorrect password shows `Invalid username or password.` without navigating away, and the password input is cleared.
2. Login as Reporter, then as Editor after logging out. Each successful login redirects home and shows the correct username/role; refresh retains the session. An authenticated `/login` request redirects home.
3. Click Logout. Home shows Login again, and private API requests no longer authenticate with that session. A failed network request must show feedback rather than claiming success.
4. Visit an unknown page and return home: the shared shell remains available. Test narrow phone, tablet and desktop widths for wrapping and accessible controls.
5. Disable JavaScript using browser tools for a manual check: login fields remain disabled and the enable-JavaScript message appears. No normal form submission should expose a password in the URL. Re-enable JavaScript after the check.

`npm run db:indexes` creates current model indexes on the configured database without dropping existing indexes. Verify this utility only with a deliberately selected local database. See [manual verification](manual-verification.md) for a student-friendly API demonstration.

## Verified shared UI run — 2026-09-17

Windows, Node.js 24.20.0, official portable MongoDB 8.0.26 on loopback port 27018 with a dedicated temporary data folder. The downloaded ZIP matched the official SHA-256 checksum; no dependencies or Windows service were installed.

- `npm.cmd run check:syntax`: PASS, 51 JavaScript files.
- `npm.cmd run test:unit`: PASS, 12 tests.
- `npm.cmd test`: PASS, 29 tests, zero failures/skips; includes existing authentication/session restart, User, Article workflow and public API coverage.
- `npm.cmd run test:smoke`: PASS, all six existing checks.
- Real browser with isolated fixture accounts: invalid credentials/message/password clearing, required/blank username feedback, Reporter and Editor login, authenticated `/login` redirect, session after refresh, Logout and session-aware 404 navigation passed.
- Login and shared navigation checked at 360, 768 and 1280 CSS-pixel widths without horizontal overflow. This is a shared-shell check, not testing future feature layouts.
- After stopping the temporary HTTP server, the loaded Login page displayed the friendly connection-error message rather than navigating or claiming success.
- The initial UI test assumed cookie clearing used `Max-Age=0`; it was corrected to assert the existing expired-cookie contract. No auth backend change was needed.
- No Git operations. A before/after SHA-256 file inventory checked the scope; models, auth services/controllers/routes, article APIs, package files and the existing architecture SVG were unchanged.
- All isolated test databases were removed and both temporary servers stopped. The execution policy blocked filesystem deletion of the downloaded temporary MongoDB folder even after a scoped permission grant; those files remain outside the repository, not as an installed service.

## Verified Lead Core run — 2026-09-09

Environment: Windows, Node.js 24.20.0, official portable MongoDB Community 8.0.26 on `127.0.0.1:27018`, ordinary standalone server. The ZIP's SHA-256 matched the official download checksum. No npm dependencies or Windows service were installed.

- `npm.cmd run check:syntax`: PASS, 49 JavaScript files.
- `npm.cmd run test:unit`: PASS, 11 tests.
- `npm.cmd test`: PASS, 24 tests, zero failures/skips (includes the unit tests).
- `npm.cmd run test:smoke`: PASS, all six HTTP checks.
- Repeated index setup preserving an existing index and real Node-restart session persistence passed within the integration suite.
- `package-lock.json` and original home/error views, static assets and home route/controller matched their pre-change SHA-256 hashes. No Git commands were run, per user instruction; this is not a branch diff review.

Each suite removed its own temporary database. A smoke-test cleanup race found during verification was fixed by awaiting model/index initialization before running checks. A final database inventory contained only MongoDB's admin/config/local databases, and the temporary server was shut down. The portable server is not part of this repository or a permanent development installation. Rerunning DB-backed checks requires starting local MongoDB again.

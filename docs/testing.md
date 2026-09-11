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
| `coreIntegration.test.js` | Existing auth/User CRUD, uniqueness, session digest/expiry/logout/password revocation, removed User, repeatable index setup and real Node process restart with the same cookie |
| `scripts/smoke-test.js` | Original six HTTP status/content-type checks against an isolated DB, no in-memory Article fallback |

Test fixtures are deliberately small and temporary; they are not the team's 500-article seed. The index explain check proves the declared index supports the public sort; it is not a thousands-of-readers load benchmark. Simultaneous editing, external image availability, feature UI behavior and other deferred features are not claimed as tested.

`npm run db:indexes` creates current model indexes on the configured database without dropping existing indexes. Verify this utility only with a deliberately selected local database. See [manual verification](manual-verification.md) for a student-friendly API demonstration.

## Verified Lead Core run — 2026-09-09

Environment: Windows, Node.js 24.20.0, official portable MongoDB Community 8.0.26 on `127.0.0.1:27018`, ordinary standalone server. The ZIP's SHA-256 matched the official download checksum. No npm dependencies or Windows service were installed.

- `npm.cmd run check:syntax`: PASS, 49 JavaScript files.
- `npm.cmd run test:unit`: PASS, 11 tests.
- `npm.cmd test`: PASS, 24 tests, zero failures/skips (includes the unit tests).
- `npm.cmd run test:smoke`: PASS, all six HTTP checks.
- Repeated index setup preserving an existing index and real Node-restart session persistence passed within the integration suite.
- `package-lock.json` and original home/error views, static assets and home route/controller matched their pre-change SHA-256 hashes. No Git commands were run, per user instruction; this is not a branch diff review.

Each suite removed its own temporary database. A smoke-test cleanup race found during verification was fixed by awaiting model/index initialization before running checks. A final database inventory contained only MongoDB's admin/config/local databases, and the temporary server was shut down. The portable server is not part of this repository or a permanent development installation. Rerunning DB-backed checks requires starting local MongoDB again.

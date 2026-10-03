# The Daily Web

University news project using Node.js, Express, MongoDB/Mongoose, EJS and Vanilla JavaScript. The shared Lead Core and central public news experience are implemented; Reporter/Editor features remain assigned to the team. Read [AGENTS.md](AGENTS.md) before making changes.

## Local setup

Optional home weather widget: set `OPENWEATHER_API_KEY` in your ignored local `.env` and restart. The empty `.env.example` placeholder is safe to share. Without a key, only the widget shows an unavailable message; the feed still works. The server fetches/caches OpenWeatherMap data for 15 minutes, and browser code calls only `/api/weather`. See [weather UI](docs/weather-ui.md).

1. Use Node.js 24 and a running ordinary MongoDB server (no replica set required).
2. Run `npm ci` to install the existing lockfile dependencies: Express, Mongoose and EJS only.
3. Copy `.env.example` to `.env`. Keep it local and set `MONGODB_URI` for your development database. Never use the test database for development data.
4. Run `npm run db:indexes` to create declared indexes without dropping existing indexes.
5. Run `npm start`; open `http://127.0.0.1:3000`.

The start command uses Node's built-in `--env-file-if-exists=.env`: no dotenv package. Shell environment values take precedence. `environment.js` validates the loaded settings; it is not an ENV file. Startup fails clearly if MongoDB cannot be reached. `/health` indicates the HTTP process is alive, not database readiness. Windows PowerShell users can use `npm.cmd` if execution policy blocks `npm.ps1`.

For a local server without a Windows service, follow the [official MongoDB ZIP instructions](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows-zip/). Extract outside the repository. In a separate terminal, use the actual extracted executable path and a dedicated development data folder, for example:

```powershell
$mongoData = Join-Path $env:LOCALAPPDATA 'TheDailyWeb\MongoData'
New-Item -ItemType Directory -Force -Path $mongoData
& 'C:\path\to\mongodb\bin\mongod.exe' --dbpath $mongoData --bind_ip 127.0.0.1 --port 27017
```

Keep that terminal running while developing; Ctrl+C stops MongoDB without deleting its data. Do not use this development folder for temporary test-server data. A portable instance used only for automated verification is stopped afterwards and does not replace your development MongoDB setup.

## First accounts

There is no public registration or Admin role. The operator creates initial Editor/Reporter accounts with `npm run user:create`, supplying `ACCOUNT_USERNAME`, `ACCOUNT_ROLE` (`editor` or `reporter`) and `ACCOUNT_PASSWORD` as temporary environment values. Choose a unique password of 12–128 characters; do not put credentials in a committed file, command example or shell history. For PowerShell, read the password with `Read-Host -AsSecureString`, convert only when setting the child-process environment, then clear `ACCOUNT_PASSWORD` immediately afterwards. The script refuses duplicate usernames and never prints passwords or hashes.

```powershell
$env:ACCOUNT_USERNAME = Read-Host 'Username'
$env:ACCOUNT_ROLE = Read-Host 'Role (reporter or editor)'
$accountSecret = Read-Host 'Password (12-128 characters)' -AsSecureString
try {
  $env:ACCOUNT_PASSWORD = [System.Net.NetworkCredential]::new('', $accountSecret).Password
  npm.cmd run user:create
} finally {
  Remove-Item Env:ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
  $accountSecret.Dispose()
}
```

After bootstrapping an Editor, use the protected User API to create/manage Reporters. Self-updates require the current password. Password changes invalidate all of that user's sessions. See [API contracts](docs/api-contract.md) and [manual verification](docs/manual-verification.md).

## Implemented scope

- Persistent MongoDB sessions with opaque HttpOnly cookies, salted scrypt passwords and server-side role/ownership checks.
- Protected User CRUD and private article workspace list/detail APIs.
- Draft creation, working-content save, submission, return, approval, Start Revision and hard deletion.
- Safe MongoDB-backed public list/detail APIs, approved-title text search, category filtering, newest/oldest sorting and 20-card cursor pagination.
- Public feed with debounced search, infinite scroll, retry/load-more fallback and page-scoped responsive CSS.
- Public `/articles/:id` EJS page with the complete approved article in its initial HTML, readable without JavaScript.
- Public article Comments load/post through AJAX, including guests with a persistent server-side limit of three per rolling minute per existing browser UUID. Authenticated comment ownership rules remain unchanged; see [Comments](docs/comments.md).
- Anonymous browser UUID helper and best-effort public article view recording into atomic article/browser/hour ViewStat counters.
- Public popularity/viewed controls and a separate Editor-only `/analytics` page with public title selection, 7/30/90-day ranges, an hourly SVG chart and actual publication/update markers; see [analytics](docs/analytics.md).
- Shared validation, controlled API errors, request IDs and sanitized operational logs.
- Shared EJS header/navigation/footer, base styling and browser Login/Logout using the existing auth APIs.
- Role-protected Reporter/Editor page areas and existing feature API mounts; see [A/B/C/D ownership](docs/team-task-boundaries.md).
- Automated tests using Node's built-in test runner, including real process-restart session persistence.

`publishedAt` always means **first publication**. Each approval appends its timestamp to `publicationHistory`. A pending/returned/draft revision never hides or replaces the previous public content.

Central Comments adds guest posting/list UI and a BrowserIdentity throttle record, not trusted physical-device identification. Stronger anti-abuse, guest edit/delete, moderation UI, dependent cleanup, ReadReceipt and ViewStat management Update/Delete are outside this integration. Teammate Reporter/Editor/Weather/Seed work is not changed by it. Client-reported view counting is not an abuse-proof or unique-reader metric.

After this update, run `npm.cmd run db:indexes` to register Comment's article/time index and BrowserIdentity's expiry TTL index. Existing authenticated Comment records need no data migration. No new dependency is required.

After updating, run `npm.cmd run db:indexes` before recording views: ViewStat requires its unique bucket index. The helper stores only `daily_web_browser_id` in localStorage, independently of authentication. Clearing storage changes the identity; blocked storage falls back to a document-only ID. See [view tracking](docs/view-tracking.md) for API, view semantics, initialization and lifecycle limitations.

### Public news experience

After updating, rerun `npm.cmd run db:indexes` to add the approved-title text and public category/date indexes. No dependency change or data migration is required. The homepage loads up to 20 approved articles at a time. Search matches whole words in approved titles (quotes for phrases), not partial words; category and publication-date sorting run on the server. Later approved updates do not move the original publication date. See the [exact query contract](docs/api-contract.md#public-feed-query-contract).

The feed needs JavaScript; full article pages do not. Existing approved content remains visible while its working revision is draft/pending/returned. Popularity and All/Viewed/Unviewed controls use server queries; unavailable browser identity falls back to All. Article Comments load/post with JavaScript independently of the initial article body. For focused checks run `node --test tests/publicArticles.test.js tests/publicNews.test.js tests/feedClient.test.js tests/analyticsPage.test.js tests/analyticsClient.test.js tests/comments.test.js tests/commentsClient.test.js`. See [public news verification](docs/public-news.md) for browser checks and boundaries.

## Shared UI foundation

Open `/login` and use an account created through the existing account script or User API. The browser submits to `POST /api/auth/login`; MongoDB stores the existing Session and the browser retains its HttpOnly cookie. Successful login returns to `/`. Authenticated visitors to `/login` are redirected to `/`. Navigation includes only the user's matching Reporter/Editor Workspace link. Those routes render protected scaffolds, not implemented article-management tools.

Navigation displays the current username/role. `public/js/main.js` checks `GET /api/auth/session` on page display (including Back/Forward restores) and sends `DELETE /api/auth/session` for Logout. `public/js/login.js` handles only the login form. Neither script stores credentials/tokens or decides server permissions. Login/Logout require JavaScript; the login fields remain disabled until their submit handler is attached, preventing accidental password submission in a URL.

New pages should reuse `views/partials/header.ejs`, `navigation.ejs` and `footer.ejs`, with their own `<main id="main-content">`. Use `public/css/base.css` for the shell, and page-specific CSS/JS for features. `style.css` retains the existing home/error detail. See [team extension points](docs/team-workflow.md#shared-ui-extension-points).

## Checks

```sh
npm run check:syntax
npm run test:unit
npm test
npm run test:smoke
```

The last two require local MongoDB. Optionally set `TEST_MONGODB_URI=mongodb://127.0.0.1:27017/the_daily_web_test` (change the port for a temporary instance). Tests create uniquely named databases and remove only their own test databases; they do not use `.env` or the development database. MongoDB unavailability is a failure, not a skipped success. See [testing](docs/testing.md).

## Project map and team handoff

- `app.js`: middleware/routes, EJS/static setup, startup and shutdown.
- `config/`, `models/`: validated runtime settings, connection, article constants and persistent structures.
- `routes/`, `middleware/`, `controllers/`: HTTP routing, access/error checks and responses.
- `services/`, `utils/`: business rules, queries and small reusable helpers.
- `views/`, `public/`: shared EJS shell, Login, public feed and server-rendered articles; isolated Reporter/Editor scaffolds.
- `scripts/`, `tests/`: account/index utilities and isolated verification.
- `docs/`: [architecture](docs/architecture.md), [models](docs/data-models.md), [workflow](docs/article-workflow.md), [API](docs/api-contract.md), [team guide](docs/team-workflow.md).

Keep `.env`, credentials and session tokens out of Git, logs and the submission ZIP. Retain `.env.example` with safe placeholders. Students must understand every submitted line. All branch/commit/PR operations are manual unless separately authorized.

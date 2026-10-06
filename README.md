# The Daily Web

The Daily Web is a university news application where guests read approved articles and comment, Reporters write and submit stories, and Editors review and publish them. The application includes public news pages, Reporter and Editor workspaces, analytics and a weather sidebar. Read [AGENTS.md](AGENTS.md) before making changes.

## Technology stack

Node.js, Express, MongoDB/Mongoose, EJS, semantic HTML5, CSS/Flexbox and Vanilla JavaScript with fetch/AJAX. The server follows MVC, with services for business logic. There is no React/Vue/Angular frontend. Password hashing and automated tests use Node.js built-ins.

## Local setup

Optional home weather widget: set `OPENWEATHER_API_KEY` in your ignored local `.env` and restart. The empty `.env.example` placeholder is safe to share. Without a key, only the widget shows an unavailable message; the feed still works. The server fetches/caches OpenWeatherMap data for 15 minutes, and browser code calls only `/api/weather`. See [weather UI](docs/weather-ui.md).

1. Clone or extract the project, then open a terminal in its root (the directory containing `package.json`).
2. Install Node.js 24 with npm. Confirm both are available with `node --version` and `npm --version`.
3. Install and start MongoDB Community Server. MongoDB Compass alone is not a database server. An ordinary local server on port 27017 is sufficient; no replica set is required.
4. Run `npm install` to install Express, Mongoose and EJS. Alternatively, `npm ci` installs the exact versions in the supplied lockfile.
5. Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on macOS/Linux), then configure it as described below. Do not overwrite an existing configured `.env`.
6. Run `npm run db:indexes` to create the declared indexes without dropping existing indexes.
7. For the populated demonstration, follow the demo seed instructions below before starting the application. Otherwise the public feed starts empty; create accounts using the account script.
8. Start the application from the project root:

```sh
npm start
```

Open `http://127.0.0.1:3000` (adjust for your HOST/PORT). Keep MongoDB running. Stop the application with Ctrl+C.

### Environment configuration

The supplied `.env.example` contains safe local defaults, not real credentials:

| Variable | Setup and purpose |
| --- | --- |
| `PORT` | `3000` by default; the HTTP port. |
| `HOST` | `127.0.0.1` by default; bind locally for evaluation. |
| `MONGODB_URI` | Local example: `mongodb://127.0.0.1:27017/the-daily-web`. The app and seed must use the same database. |
| `NODE_ENV` | Keep `development` for local evaluation. The seed refuses production mode. |
| `OPENWEATHER_API_KEY` | Supply your own active OpenWeatherMap key in the ignored `.env`; leave empty to demonstrate the friendly unavailable state. Never put the key in browser code. |
| `SEED_PASSWORD` | Required only when running the demo seed. Set a private 12-128 character value. Supply it through the secure PowerShell prompt below, or add it only to your ignored local `.env`. `.env.example` contains only an empty placeholder. No default/demo password is committed. |

Never commit `.env`, real passwords, API keys or session tokens. Do not include them in the submission ZIP. The seed password is used only when creating missing demo accounts; changing the environment value does not reset existing passwords.

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
- Reporter `/reporter` workspace: own-article list, create/edit forms, autosave, submission/resubmission, returned notes and published revisions.
- Editor `/editor` workspace: status filtering, review of working versus public content, edit, approve, return with a note and delete.
- Safe MongoDB-backed public list/detail APIs, approved-title text search, category filtering, newest/oldest sorting and 20-card cursor pagination.
- Public feed with debounced search, infinite scroll, retry/load-more fallback and page-scoped responsive CSS.
- Public `/articles/:id` EJS page with the complete approved article in its initial HTML, readable without JavaScript.
- Public article Comments load/post through AJAX, including guests with a persistent server-side limit of three per rolling minute per existing browser UUID. Authenticated comment ownership rules remain unchanged; see [Comments](docs/comments.md).
- Anonymous browser UUID helper and best-effort public article view recording into atomic article/browser/hour ViewStat counters.
- Public popularity/viewed controls and a separate Editor-only `/analytics` page with public title selection, 7/30/90-day ranges, an hourly SVG chart and actual publication/update markers; see [analytics](docs/analytics.md).
- Responsive weather sidebar using only the Express weather API, with a 15-minute server cache and independent unavailable/retry UI.
- Shared validation, controlled API errors, request IDs and sanitized operational logs.
- Shared EJS header/navigation/footer, base styling and browser Login/Logout using the existing auth APIs.
- Role-protected Reporter/Editor workspaces and server-side ownership checks; see [A/B/C/D ownership](docs/team-task-boundaries.md) for team responsibilities.
- Automated tests using Node's built-in test runner, including real process-restart session persistence.

`publishedAt` always means **first publication**. Each approval appends its timestamp to `publicationHistory`. A pending/returned/draft revision never hides or replaces the previous public content.

### Roles and article workflow

- **Guest:** public feed/articles and comments; no User document or login required. Guest posting is limited server-side to three comments per rolling minute per browser identity.
- **Reporter:** creates articles and edits only owned drafts/returned articles; submits for review but cannot publish directly.
- **Editor:** reviews all articles, edits submitted content, approves, returns with a correction note, deletes articles and accesses analytics.

New articles start as `draft`. Submission changes `draft` or `returned` to `pending`. An Editor changes `pending` to `published` or `returned`. Start Revision changes `published` to `draft` and copies the approved content into `workingContent`. The previous `publishedContent` stays public throughout editing/review; only approval replaces it. Other transitions are rejected server-side. Sessions are stored in MongoDB and survive a Node server restart while unexpired and not revoked.

Central Comments adds guest posting/list UI and a BrowserIdentity throttle record, not trusted physical-device identification. Stronger anti-abuse, guest edit/delete, moderation UI and ReadReceipt remain outside this integration. Editor-only Article deletion now also deletes its Comments and ViewStats; retry the same DELETE after partial cleanup failure. ViewStat counter increments provide Update, and dependent deletion provides Delete, without exposing arbitrary deletion to guests. Client-reported view counting is not an abuse-proof or unique-reader metric.

After this update, run `npm.cmd run db:indexes` to register Comment's article/time index and BrowserIdentity's expiry TTL index. Existing authenticated Comment records need no data migration. No new dependency is required.

After updating, run `npm.cmd run db:indexes` before recording views: ViewStat requires its unique bucket index. The helper stores only `daily_web_browser_id` in localStorage, independently of authentication. Clearing storage changes the identity; blocked storage falls back to a document-only ID. See [view tracking](docs/view-tracking.md) for API, view semantics, initialization and lifecycle limitations.

### Public news experience

After updating, rerun `npm.cmd run db:indexes` to add the approved-title text and public category/date indexes. No dependency change or data migration is required. The homepage loads up to 20 approved articles at a time. Search matches whole words in approved titles (quotes for phrases), not partial words; category and publication-date sorting run on the server. Later approved updates do not move the original publication date. See the [exact query contract](docs/api-contract.md#public-feed-query-contract).

The feed needs JavaScript; full article pages do not. Existing approved content remains visible while its working revision is draft/pending/returned. Popularity and All/Viewed/Unviewed controls use server queries; unavailable browser identity falls back to All. Article Comments load/post with JavaScript independently of the initial article body. For focused checks run `node --test tests/publicArticles.test.js tests/publicNews.test.js tests/feedClient.test.js tests/analyticsPage.test.js tests/analyticsClient.test.js tests/comments.test.js tests/commentsClient.test.js`. See [public news verification](docs/public-news.md) for browser checks and boundaries.

## Shared UI foundation

Open `/login` and use a demo account from the seed, an account created through the account script, or a Reporter created through the protected User API. The browser submits to `POST /api/auth/login`; MongoDB stores the Session and the browser retains its HttpOnly cookie. Successful login returns to `/`. Authenticated visitors to `/login` are redirected to `/`. Use the navigation link to open your Reporter or Editor Workspace; Editors also have access to `/analytics`.

Navigation displays the current username/role. `public/js/main.js` checks `GET /api/auth/session` on page display (including Back/Forward restores) and sends `DELETE /api/auth/session` for Logout. `public/js/login.js` handles only the login form. Neither script stores credentials/tokens or decides server permissions. Login/Logout require JavaScript; the login fields remain disabled until their submit handler is attached, preventing accidental password submission in a URL.

New pages should reuse `views/partials/header.ejs`, `navigation.ejs` and `footer.ejs`, with their own `<main id="main-content">`. Use `public/css/base.css` for the shell, and page-specific CSS/JS for features. `style.css` retains the existing home/error detail. See [team extension points](docs/team-workflow.md#shared-ui-extension-points).

## Repeatable local demo seed

Use an idle local development/demo database, never production. Set `MONGODB_URI` in the ignored `.env`, then provide its **exact database name** as the script argument (the old generic `development` argument is no longer accepted unless that is actually the database name). Choose a private 12-128-character `SEED_PASSWORD` using a prompt, not a literal in shell history:

For `MONGODB_URI=mongodb://127.0.0.1:27017/the-daily-web`, the exact command is:

```sh
node --env-file-if-exists=.env scripts/seed-articles.js the-daily-web
```

Run it only after supplying `SEED_PASSWORD`. It can read that variable from your ignored `.env` on any platform. Alternatively, the following PowerShell block prompts securely and runs the seed without storing the password in a file:

```powershell
$demoDatabase = Read-Host 'Exact local database name from MONGODB_URI'
$demoSecret = Read-Host 'Demo password (12-128 characters)' -AsSecureString
try {
  $env:SEED_PASSWORD = [System.Net.NetworkCredential]::new('', $demoSecret).Password
  node --env-file-if-exists=.env scripts/seed-articles.js $demoDatabase
} finally {
  Remove-Item Env:SEED_PASSWORD -ErrorAction SilentlyContinue
  $demoSecret.Dispose()
}
```

The script creates `demo_reporter_1`, `demo_reporter_2`, `demo_reporter_3`, and `demo_editor` with salted password hashes. Existing demo passwords are preserved. Reserved-name/ID collisions fail before data changes. It creates 500 articles (125 per status, across all five categories), including incomplete drafts, complete pending/published content and a bundled local image. Three working revisions retain their approved public copies; 45 stories have two approved update markers. There are 256 comments and 7,760 time-distributed ViewStat buckets, with more views after updates to illustrate the analytics graph.

To log in, use one of those exact usernames (for example `demo_reporter_1`, not `reporter1`) and the password supplied when that account was first created, unless subsequently changed through the application. There is no universal demo password. Rerunning with a different `SEED_PASSWORD` does not replace existing account passwords. No pre-existing Reporter/Editor is required on a fresh database.

Reruns replace only the 500 reserved demo article IDs, reset their dependent comments/views and preserve unrelated records/users. This intentionally resets edits and interactions on those demo articles; stop demo traffic first. No whole-database deletion or transaction is used. A stopped run can be rerun. Legacy random-ID records from the old seed are left alone: use a fresh dedicated demo database to avoid mixing old and new datasets. Never commit the password or seed the development database as part of automated tests.

Reporter saves now flush on blur, pagehide and hidden visibilitychange, with keepalive for small requests. Submit/Back still await the complete serialized queue. MongoDB remains the source of truth. Pending work behind an in-flight save, large payloads, offline exits and forced termination cannot be guaranteed; see [autosave limits](docs/article-workflow.md#autosave-integration). The weather widget is now a responsive sidebar; its backend/API/cache is unchanged.

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
- `views/`: EJS public article/home/login pages, Reporter/Editor workspaces, analytics and shared partials.
- `public/`: CSS, page-specific Vanilla JavaScript and static images (including the bundled demo image).
- `scripts/`, `tests/`: account/index utilities and isolated verification.
- `docs/`: [architecture](docs/architecture.md), [models](docs/data-models.md), [workflow](docs/article-workflow.md), [API](docs/api-contract.md), [team guide](docs/team-workflow.md).

Keep `.env`, credentials and session tokens out of Git, logs and the submission ZIP. Retain `.env.example` with safe placeholders. Students must understand every submitted line. All branch/commit/PR operations are manual unless separately authorized.

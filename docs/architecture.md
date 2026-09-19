# Lead Core architecture

```text
Browser / Postman
  -> app.js (request ID, JSON size limit, session loading)
  -> Route -> authentication/role/database middleware
  -> Controller -> Service (validation, ownership, workflow/query)
  -> Mongoose Model -> MongoDB
  <- explicit DTO <- JSON response

GET / or /login -> indexRoutes -> loadSession -> homeController -> shared EJS -> HTML
GET /articles/:id -> indexRoutes -> loadSession -> requireDatabase -> homeController.showArticle
  -> articleQueryService.getPublic -> Article -> MongoDB -> public DTO -> article.ejs (complete body)
Home feed.js -> GET /api/articles?q=&category=&sort=&cursor= -> existing Article route/controller/query -> JSON cards
GET /reporter/* -> reporterPageRoutes -> loadSession -> requireRole(reporter) -> reporterPageController -> EJS scaffold
GET /editor/* -> editorPageRoutes -> loadSession -> requireRole(editor) -> editorPageController -> EJS scaffold
Errors -> errorHandler -> JSON for /api, EJS for page requests
```

The controller translates HTTP inputs/outputs. The service holds reusable business decisions. A Mongoose model defines storage and provides database operations; it does not decide who may approve an article. A DTO is an explicitly chosen response object: public callers never receive raw Article or User documents.

![Public article request flow between project files and the JSON response](assets/architecture-flow.svg)

## Directory responsibilities

| Directory | Responsibility |
| --- | --- |
| `config` | Environment validation, MongoDB connection, shared article categories/limits |
| `routes` | Existing home, auth, User, private workspace and article endpoint mappings |
| `middleware` | Request IDs, session lookup, authentication/roles, DB guard, 404 and centralized errors |
| `controllers` | Read request inputs, call services, choose JSON/status or existing EJS templates |
| `services` | Password/session/User operations and Article visibility/workflow rules |
| `models` | User, Session, Article and ViewStat schemas/indexes |
| `utils` | Small validation, cookie, logging, DTO, authorization and pagination helpers |
| `views`, `public` | Shared EJS shell, Login page, base CSS and login/session/logout browser behavior |
| `scripts`, `tests` | Local maintenance and repeatable isolated checks |
| `docs` | Stable API contracts and student/team explanations |

## Runtime and sessions

Importing `app.js` only constructs Express; it does not connect or listen. Direct execution validates configuration, connects to MongoDB, then listens. Tests can import the same app and bind a free local port.

After JSON/static handling, `/api` requests pass through `loadSession` in `app.js`. The `/` and `/login` page routes also use that same middleware, once per request. The browser sends `daily_web_session` automatically. Only a SHA-256 digest of its random token is stored in a Session record. A valid, unexpired record loads the current User; services check that user's current role and article ownership. MongoDB survives a Node restart, so the cookie continues to work. See [models](data-models.md).

`loadSession` exposes only the safe User DTO as `res.locals.currentUser` for EJS and sets `Cache-Control: no-store`. It never exposes the session token or password hash to templates. An absent cookie needs no DB query; an expired/revoked cookie is cleared. The shared navigation tolerates missing locals on early errors/unknown page routes; `main.js` then checks the existing session API. Static assets and `/health` do not perform session lookups.

## Article boundaries

`articleQueryService` owns private reads and public reads. Private queries restrict Reporters to their own records in MongoDB. Public queries require approved content plus a publication date, independently of workflow status. Public projections/DTOs exclude working content, editor notes, status and history.

`articleWorkflowService` validates action-specific inputs and performs status-guarded, single-document updates. Approval sets the public snapshot and pushes history in the same atomic operation. There are no transactions, revision counters or simultaneous-edit guarantees. Future clients must serialize saves and finish saving before submitting.

Dates, ownership and workflow status cannot be supplied through general content saves. Start Revision copies the approved snapshot. Hard deletion removes the Article directly; dependent cleanup must be added by feature owners when dependent collections actually exist.

## Frontend integration boundary

`/` renders the news-feed controls and shared header/navigation/footer. `feed.js` loads the first 20 public cards through the existing API. Search is debounced 300 ms; category/date sorting reset the cursor and results. An AbortController plus a request sequence number ignores stale responses (this is client request bookkeeping, not Article revision concurrency). Only one pagination request runs at a time. IntersectionObserver requests the next batch near the bottom; an explicit Load more button also works without it. IDs are deduplicated; errors preserve loaded cards and offer a manual retry of the same page, without an automatic retry loop. Empty/loading/end states are announced. All text uses textContent, never raw HTML.

`GET /login` still renders a form for guests or redirects authenticated users to `/`. `login.js` sends JSON to the existing auth API and returns home on success. `main.js` refreshes the session display and handles Logout. The cookie stays HttpOnly; browser role display is not authorization.

`GET /articles/:id` renders the complete approved body in its initial HTML using `articleQueryService.getPublic`, with no internal HTTP request. `article.ejs` uses escaped EJS `<%=` and preserves plain-text line breaks through CSS. Title, category, first publication date, reporter, summary and main image accompany the body. It remains readable without JavaScript. Private content never reaches these templates. Comments, viewed state, popularity, analytics and Weather UI remain unimplemented.

After HTML parsing, `browser-identity.js` provides a same-origin localStorage UUID and `article.js` sends one anonymous POST to `/api/view-stats`. The route/database guard/controller/service validates inputs and calls `articleQueryService.requirePublicArticle` (exists-only, shared public filter). ViewStat atomically increments an article/browser/hour bucket. Article has no per-view array, auth tokens are not reused, and tracking failure never changes the page. This is best-effort client-reported counting, not unique-reader or abuse-proof analytics. See [view tracking](view-tracking.md) for initialization, growth and cleanup boundaries.

Public CSS is page-scoped and uses a wrapping Flexbox card layout: one column at 360px, two at 768px, three at 1280px. Shared layout and teammate styles are unchanged. The homepage itself can render without a database for guests; its Ajax request then shows the existing API error. Article pages require MongoDB and use the shared EJS error handler.

## Isolated team integration points

Reporter and Editor page routers are mounted once in `app.js`, load the existing session once, and apply the existing role guard to the entire namespace. Their controllers render placeholders only. Edit/review IDs are format-validated; no article is queried or changed. Future private reads/writes must go through the existing Article contracts, not new copies of ownership/workflow logic.

Each area owns its EJS directory, page-specific JS directory and scoped stylesheet. The shared header accepts an optional server-chosen `pageStylesheet`; shared navigation and `main.js` handle role-link visibility. Login/logout/session behavior and destinations are unchanged.

The empty Comments and Weather routers are already mounted under `/api/comments` and `/api/weather`, after shared session loading. They currently fall through to the normal JSON 404. No Comment/Weather service or controller, new model, seed script, external fetch or cache exists yet. A/B/C/D ownership and central follow-up integration are listed in [team task boundaries](team-task-boundaries.md).

## Errors and logs

Express 5 forwards rejected async controller promises to the existing error handler. API errors use `{ error: { code, message, fields? }, requestId }`. Input shape/IDs use 400, login 401, role 403, hidden/missing resources 404, illegal state/duplicates 409, oversize body 413, field validation 422, unavailable DB 503, sanitized unexpected errors 500.

JSON logs contain timestamp, level, event and selected IDs/status/code/port. They never include request bodies, password hashes, raw session tokens, database URIs or arbitrary error messages. Events cover startup, auth, User mutations and Article transitions/deletion. Frequent working-content saves are not logged individually. Deployment can capture stdout/stderr; no logging framework is required.

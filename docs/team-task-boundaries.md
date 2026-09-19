# Team task boundaries: A / B / C / D

This is the current ownership agreement. It supersedes the earlier Member 2–5 feature split. Four teammates can start within disjoint files; central integration is deliberately separate, not eliminated. Read AGENTS.md, [API contracts](api-contract.md) and [Article workflow](article-workflow.md) first.

## Rule: edit only your allowlist

Each assignment below lists its entire write allowlist. Existing files may be read/imported, but **anything outside your assignment must not be modified without explicit approval**. Do not create duplicate auth, middleware, Article models, services or routes. Do not add dependencies or alter shared contracts. No Git operations were performed by this scaffolding task; the user handles Git manually.

Shared/central files include `app.js`, `package.json`, `package-lock.json`, `config/*`, `middleware/*`, `utils/*`, `models/User.js`, `models/Article.js`, `models/Session.js`, all existing auth/User/Article/workspace route/controller/service files, `routes/indexRoutes.js`, `controllers/homeController.js`, `views/partials/*`, the root EJS pages, `public/js/main.js`, `public/js/login.js`, `public/css/base.css`, `public/css/style.css`, `scripts/setup-indexes.js`, `scripts/create-user.js`, existing tests/helpers/fixtures, README and shared docs. A/B/C/D do not edit one another's files.

Feature-specific test and note files below are reserved, not created as dummy implementations. `npm test` already finds `tests/*.test.js`, so no package edit is needed for new tests. Reuse `tests/helpers.js` and `tests/fixtures.js`; create only isolated local test databases, never seed/test the development database implicitly.

## What is wired now

| Namespace | Owner | Current behavior |
| --- | --- | --- |
| `/reporter`, `/reporter/edit/:id` | A | GET-only EJS scaffolds; Reporter required |
| `/editor`, `/editor/review/:id` | B | GET-only EJS scaffolds; Editor required |
| `/api/comments` | C | Empty router, no implemented endpoints; falls through to shared JSON 404 |
| `/api/weather` | D | Empty router, no implemented endpoints; falls through to shared JSON 404 |

Page routers run `loadSession` once, then existing `requireRole`, before any controller. Missing login returns 401 HTML; wrong role returns 403 HTML. `requireRole` already includes the authentication check. API routers already receive session context from the shared `/api` mount; do not add a second `loadSession` there. Future protected actions must use the existing role/auth/DB guards as appropriate.

The edit/review scaffolds only validate the ID format. They do not query article existence/ownership, load content, or mutate data. A well-formed unknown ID can currently render an empty scaffold; that is not permission to read/edit an article. Future data access must use the private/workflow APIs below, which enforce ownership and status. Do not use public article data to populate editing forms.

The common header accepts an optional, server-chosen `pageStylesheet`; A/B controllers already supply their own stylesheet. Each EJS page loads its own JS entry point. All four JS entry points are currently comments only. Keep styles scoped to `.reporter-workspace` / `.editor-workspace`. Navigation and session-refresh logic are already wired centrally. Login/logout still redirect to `/`; follow the role-specific workspace link.

## A — Reporter Workspace UI

**Own/edit:**

- `routes/reporterPageRoutes.js`, `controllers/reporterPageController.js`
- `views/reporter/*` (currently `index.ejs`, `edit.ejs`)
- `public/js/reporter/*` (currently `index.js`, `edit.js`)
- `public/css/reporter.css`

**May create:** additional partials and page scripts inside those directories, `tests/reporter.test.js`, `docs/tasks/reporter.md`. Additional Reporter page routes go in the already-mounted Reporter router, after its existing guards.

**Must not modify:** every file outside this allowlist, especially shared navigation/auth, `app.js`, Article schema/services/APIs, and B's Editor files. Do not create a Reporter-specific workflow backend.

**Reuse:**

- GET `/api/workspace/articles` and `/api/workspace/articles/:id` for owned private data.
- POST `/api/articles` to create a draft; PATCH `/api/articles/:id/working-content` to save the complete five-field content object.
- POST `/api/articles/:id/submissions` for submit/resubmit; POST `/api/articles/:id/revisions` to start revising published content.
- Existing session/error contracts and shared EJS partials. If server rendering needs private data, call `articleQueryService.findAccessibleArticle(req.user, id)` directly, not internal HTTP or new query logic.

**Definition of Done for future feature work:** own-article list, create/edit forms, last saved working version, serialized debounced autosave with saving/saved/error feedback, submit/resubmit, editor-note display and Start Revision through existing APIs. Handle 401/403/404/409/422 safely. Finish the pending save before submitting; do not claim abrupt browser termination guarantees delivery. Add focused tests and feature notes. This scaffold implements none of those actions yet.

**Central later:** any requested API/validation/category change, shared navigation change, final cross-feature testing and public-feed integration. A can implement its UI with the existing contracts without waiting for B/C/D.

## B — Editor Workspace UI

**Own/edit:**

- `routes/editorPageRoutes.js`, `controllers/editorPageController.js`
- `views/editor/*` (currently `index.ejs`, `review.ejs`)
- `public/js/editor/*` (currently `index.js`, `review.js`)
- `public/css/editor.css`

**May create:** additional partials/page scripts inside those directories, `tests/editor.test.js`, `docs/tasks/editor.md`. Additional Editor page routes go in the already-mounted Editor router, after its existing guards.

**Must not modify:** every file outside this allowlist, especially Reporter UI, Comments files, Article schema/workflow, authentication or shared infrastructure. Editor UI does not imply ownership of Comments backend.

**Reuse:** GET `/api/workspace/articles?status=pending` (and other supported status filters), GET private detail, PATCH working-content, POST `/:id/approvals`, POST `/:id/returns` with `editorNote`, POST `/:id/revisions`, DELETE `/api/articles/:id`. The action suffixes belong under `/api/articles`. Use `articleQueryService` for any server-side private reads.

**Definition of Done for future feature work:** all-article/status-filtered queue, review/edit working content, clearly distinguish workingContent from the currently public publishedContent, approve/return/delete through existing APIs with feedback and tests. Reporter-only create/submit actions must not be invented for Editors. No duplicated transition rules.

**Central later:** dependent deletion cleanup when Comments/statistics exist, shared API/navigation changes and final public-version verification. B need not wait for A or build Comments UI.

## C — Comments Backend/API

**Own/edit now:** `routes/commentRoutes.js`, already mounted once at `/api/comments`.

**May create:**

- `models/Comment.js`
- `services/commentService.js`
- `controllers/commentController.js`
- `tests/comments.test.js`
- `docs/tasks/comments.md` for endpoint/body/DTO/permission notes

**Must not modify:** every file outside this allowlist, especially `app.js`, Article workflow/schema, public article templates, Editor UI, shared session/auth, `BrowserIdentity` or statistics. Do not create a replacement identity/rate-limit collection.

**Reuse:** current `req.user`, `requireAuth`, `requireRole`, `requireDatabase`, `utils/validation.js`, `httpError` and centralized errors. Use `articleQueryService.getPublic(id)` to check public article visibility instead of testing `status === "published"`. Keep business logic in the Comment service, HTTP handling in its controller.

**Definition of Done for future feature work:** Comment model plus list/create/read/update/delete APIs, input validation, server-side ownership/role restrictions and isolated tests, with a documented contract for the future UI. Listing must not expose private/unpublished articles. Return existing JSON/error shapes. Authenticated comment operations and service tests can be developed independently now.

**Central later:** public article comments UI, trusted Guest device identity, the required server-enforced three-comments-per-minute limit, Guest update/delete ownership policy, and bounded Article-delete cleanup/index registration. Guest writes must remain disabled until the central identity/rate-limit integration exists; do not accept a client-supplied user/device ID as trusted identity. Full Guest-comment acceptance is therefore a central milestone, not a claim of this independent task's completion.

## D — Seed Data + Weather Backend

**Own/edit now:** `routes/weatherRoutes.js`, already mounted once at `/api/weather`.

**May create:**

- `services/weatherService.js`
- `controllers/weatherController.js`
- `tests/weather.test.js`
- `scripts/seed-articles.js`
- `tests/seedArticles.test.js`
- `docs/tasks/seed-weather.md` for seed usage and weather response notes

**Must not modify:** every file outside this allowlist, especially `package.json`, `app.js`, shared schemas, page templates, ViewStat/analytics/popularity or other teammates' modules. Weather UI is not part of D's backend assignment.

**Reuse:** Node built-in fetch/time utilities, current JSON/error/logging conventions, User/Article models, `passwordService.hashPassword`, article categories/content validation and the approved version/date semantics. Seeded `publishedAt` is the first publication; later approvals belong in `publicationHistory` without changing it.

**Definition of Done for future feature work:** independently testable weather fetching with shared server-side caching, freshness/failure behavior and a documented DTO; repeatable/idempotent seeding of at least 500 articles with varied categories/statuses/reporters and published update history. Tests mock external weather requests and use disposable DBs. Seed commands must require an explicit target and must not clear unrelated users/articles or commit credentials. No provider calls or seed generation are implemented in this scaffold.

**Central later:** weather sidebar/UI, final seed command registration, Comment seed data once C is merged, and ViewStat/analytics demo data once those central models exist. D can run its future real script directly with `node --env-file-if-exists=.env scripts/seed-articles.js`. No `db:seed` command or fake seed script is added now; the integrator adds the package command after the real script exists.

## Central integration — not assigned to A/B/C/D

- Public news feed, search/category/date-sort/infinite-scroll UI and query extensions are now implemented centrally; changes remain centrally owned.
- Public `views/article.ejs` and complete approved content in initial HTML are now implemented centrally.
- Comments UI integration into the existing `article.ejs` remains future central work.
- Client BrowserIdentity and ViewStat recording are now central implementations, including their files, tests and index registration.
- Popularity/viewed public queries and Editor analytics aggregation are now central backend implementations; their final feed controls/graph remain central follow-up work. See [analytics](analytics.md).
- Trusted Guest identity/comment limiting and ReadReceipt remain future work. Viewed filtering currently uses ViewStat existence per browser. The localStorage UUID is replaceable, not authentication or the sole comment limiter.
- ViewStat management Update/Delete and dependent cleanup remain central future work; no duplicated Article counters are stored.
- Weather widget/sidebar; full defense seed combining article/comment/statistics data.
- Comment-dependent Article deletion cleanup and registration of future model indexes.
- Shared configuration, package scripts, navigation, API docs and cross-feature regression tests.

The integrator incorporates each task's notes into shared docs and approves any changes to shared files. Submit feature changes restricted to the allowlist; request approval before expanding it. This keeps normal A/B/C/D implementation disjoint while acknowledging the final integration and course requirements that still remain.

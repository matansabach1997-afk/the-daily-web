# Stable Lead Core API

Base URL: `http://127.0.0.1:3000`. JSON requests use `Content-Type: application/json`. Browser/Postman cookie jars retain the session; same-origin browser fetch sends it automatically. No bearer tokens, role fields or passwords in query strings. All feature endpoints below return JSON, not HTML.

## Response vocabulary

- User: `{ _id, username, role }`; never passwordHash.
- Content: `{ title, summary, body, category, imageUrl }` (all strings).
- PrivateArticle: `{ _id, reporter: { _id, username } | null, workingContent, publishedContent, status, editorNote, publishedAt, publicationHistory, createdAt, updatedAt }`.
- PublicCard: `{ _id, title, summary, imageUrl, category, reporter: { _id, username } | null, publishedAt }`; `sort=popularity` additionally returns numeric `totalViews` per card.
- PublicDetail: PublicCard plus `body`, always from publishedContent.
- Item: `{ data: item }`; list: `{ data: [...], meta: { nextCursor: string | null, hasMore: boolean } }`.
- Errors: `{ error: { code, message, fields? }, requestId }`. Every response has `X-Request-Id`; API responses use `Cache-Control: no-store`.
- IDs are 24-character ObjectId strings; dates are ISO strings; null publication dates/content mean never published.

Paginated Article/User lists have a fixed size of 20; the existing Comments list returns all comments for one article, without meta/cursor. Pass the returned opaque cursor unchanged to the same paginated query; preserve filters when paging and reset cursor if filters change. There is no total-count query. Ordering is deterministic using `_id` as a tie-breaker; workspace updates may move entries between pages, so clients should deduplicate IDs/reset on refresh. This is not snapshot isolation.

All DB-backed endpoints may return 503 if MongoDB is unavailable and sanitized 500 for unexpected faults. Body parsing can return 400/413. Guest requests to protected endpoints return 401; authenticated wrong-role requests 403. Unknown fields are rejected where an input schema is defined. HTTP payload limit is 256 KB. No arbitrary Mongo query/update operators are accepted.

## Authentication and Users

| Method/path | Caller | Body/query | Success | Main errors |
| --- | --- | --- | --- | --- |
| POST `/api/auth/login` | Anyone | `{username,password}` | 200 Item User; sets cookie | 400 shape, 401 invalid credentials, 422 bounds |
| GET `/api/auth/session` | Anyone | None | 200 `{data:{user:User or null}}` | 503 if a session lookup requires unavailable DB |
| DELETE `/api/auth/session` | Anyone | None | 204; revoke current session, clear cookie | 503 |
| POST `/api/users` | Editor | `{username,password}` | 201 Item User, always Reporter | 400, 403, 409 duplicate, 422 |
| GET `/api/users` | Editor | optional `q` username prefix, `cursor` | 200 User list, username ascending | 400, 403 |
| GET `/api/users/:id` | Self or Editor reading Reporter | None | 200 Item User | 400, 404 |
| PATCH `/api/users/:id` | Self or Editor updating Reporter | `username` and/or `password`; `currentPassword` required for any self-update | 200 Item User | 400 empty/unknown, 401 wrong current password, 404, 409 duplicate, 422 |
| DELETE `/api/users/:id` | Editor; Reporter target only | None | 204 | 400, 404, 409 Reporter still owns articles |

No public registration or new Admin role. Editors cannot change roles or use these APIs to delete/manage other Editors. An Editor can read/update their own account with current password. Password update revokes every target-user session; self-update also clears that browser's cookie. Use the local account script to bootstrap initial accounts; never expose that capability in a public route.

## Private workspace reads

| Method/path | Caller | Query | Success | Main errors |
| --- | --- | --- | --- | --- |
| GET `/api/workspace/articles` | Reporter own / Editor all | optional `status`, `cursor`; optional `reporterId` for Editor only | 200 PrivateArticle list, updatedAt descending | 400 invalid filters/cursor, 403 Reporter using reporterId |
| GET `/api/workspace/articles/:id` | Owner Reporter / Editor | None | 200 Item PrivateArticle | 400 ID, 404 missing/not owned |

The private namespace provides workingContent, status, note and complete history. Public article reads expose none of these; the separate Editor analytics endpoint exposes only history-derived markers in its requested window. UI roles do not replace these server restrictions.

## Public reads and Article writes

| Method/path | Caller | Body/query | Success | Main errors |
| --- | --- | --- | --- | --- |
| GET `/api/articles` | Anyone | optional `cursor`, `q`, `category`, `sort=newest\|oldest\|popularity`, `viewed=true\|false`, `browserId` | 200 PublicCard list; default newest | 400 unsupported query/cursor/category/sort/viewed/identity, 422 search length |
| GET `/api/articles/:id` | Anyone | None | 200 Item PublicDetail | 400 ID, 404 absent/unpublished |
| POST `/api/articles` | Reporter | `{workingContent:{...}}`; fields may be omitted on creation | 201 Item PrivateArticle, draft | 400, 403, 422 |
| PATCH `/api/articles/:id/working-content` | Owner Reporter draft/returned; Editor draft/pending/returned | `{workingContent:Content}`; all five keys, empty strings allowed | 200 Item PrivateArticle | 400 shape, 404 ownership, 409 state, 422 content |
| POST `/api/articles/:id/submissions` | Owner Reporter | No body or `{}` | 200 Item PrivateArticle, pending | 400 body, 403, 404, 409 state, 422 incomplete |
| POST `/api/articles/:id/returns` | Editor | `{editorNote:string}` | 200 Item PrivateArticle, returned | 400, 403, 404, 409 not pending, 422 note |
| POST `/api/articles/:id/approvals` | Editor | No body or `{}` | 200 Item PrivateArticle, published | 400, 403, 404, 409 not pending, 422 incomplete |
| POST `/api/articles/:id/revisions` | Owner Reporter / Editor | No body or `{}` | 200 Item PrivateArticle, draft copied from public | 400, 404, 409 not published |
| DELETE `/api/articles/:id` | Editor | No body or `{}` | 204, including already absent valid ID | 400, 403 |

DELETE also removes this article's Comments and ViewStats. This is the protected Delete operation for statistics CRUD; there is no guest statistics-delete endpoint. Each cleanup query is article-scoped and time-bounded. Retry the same DELETE after a database failure, even if the Article is already absent. No API request/response shape changes.

Public visibility depends on publishedContent and publishedAt, never the current status. Public APIs do not return workingContent, status, notes, history, body in list rows, passwordHash or session information. `publishedAt` stays at first approval even after updates. JSON detail GETs do not record views; the full article page sends a separate best-effort tracking POST after rendering.

Example create body: `{ "workingContent": {} }`.

Example save body:

```json
{
  "workingContent": {
    "title": "A science report",
    "summary": "A short summary",
    "body": "The complete plain-text article.",
    "category": "science",
    "imageUrl": "https://example.com/article.jpg"
  }
}
```

See [workflow](article-workflow.md) for lengths, validation and all transitions. Public search/filter/sort is specified below. Popularity/viewed and Editor analytics reuse the existing services. Comments now support the central guest integration described below. Do not create duplicate Article routes/controllers/services.

### Public feed query contract

- `q`: optional string, trimmed, maximum 100 characters; blank means no search. MongoDB text search of **publishedContent.title only**, not summary/body/workingContent. Case-insensitive whole words; multiple words match any term; quoted phrases and minus-term exclusion follow MongoDB `$text` syntax. This is not substring/autocomplete search. The index uses `default_language: none` (no stemming or stop-word removal).
- `category`: omit for all, otherwise exactly one of `technology`, `science`, `culture`, `sport`, `local`, checked against the approved category only.
- `sort`: `newest` (default) or `oldest` orders by first `publishedAt`, then `_id` in the same direction. Later approvals do not change that date. `popularity` orders by the sum of all recorded ViewStat views descending, then `_id` descending; articles without views have zero. Only popularity cards include totalViews; no counter is stored on Article.
- `viewed`: optional exact string `true` or `false`, requiring `browserId` as a valid UUID v4. Viewed means any ViewStat exists for article/browser, independent of hour/count; unviewed means none. Filtering happens server-side before pagination. Both guests and authenticated users use browser identity, not account history.
- `browserId`: optional unless viewed is supplied; validated whenever supplied, normalized lowercase. No browser-supplied viewed-ID arrays. A client without identity can still use the normal/popularity feed by omitting viewed/browserId. Invalid/missing required identity returns 400.
- `cursor`: existing opaque pagination token. Keep q/category/sort/viewed/browserId unchanged when using it; reset it when any control changes. Tokens are not signed query snapshots. Each response contains up to 20 cards, plus the unchanged `meta.nextCursor/hasMore` contract. Popularity uses a numeric totalViews/ID cursor. New views can move ranking between pages, so deduplicate/reset on refresh. No total-count query or browser-side full-collection filtering.
- Unsupported/repeated filter values return controlled errors. Pagination under concurrent publication/deletion is not a snapshot; the browser deduplicates IDs.

Example: `GET /api/articles?q=telescope&category=science&sort=oldest`.

Run the existing `npm.cmd run db:indexes` after updating: the Article model adds an approved-title text index and a category/date/ID index. The existing script creates indexes without dropping others. Text matching uses its index, then MongoDB sorts matching results by date; the text index does not itself provide date ordering. See [MongoDB text search](https://www.mongodb.com/docs/manual/reference/operator/query/text/) and [text-index sort limitations](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/text-index-restrictions/).

## Existing page endpoints

| Method/path | Behavior |
| --- | --- |
| GET `/` | 200 public news feed shell with filters; browser requests first 20 cards from the public API |
| GET `/articles/:id` | 200 EJS with complete approved article in initial HTML; 404 absent/unpublished, 400 invalid ID/query, 503 DB unavailable |
| GET `/login` | 200 HTML login form for guests; 302 to `/` for authenticated users |
| GET `/analytics` | Editor-only central analytics shell; Guest 401 HTML, Reporter 403 HTML; client selects from existing public cards and loads the existing analytics API |
| GET `/reporter` | 200 Reporter Workspace scaffold; Reporter only |
| GET `/reporter/edit/:id` | 200 Reporter edit scaffold; Reporter only; validates ID format, no article read/write yet |
| GET `/editor` | 200 Editor Workspace scaffold; Editor only |
| GET `/editor/review/:id` | 200 Editor review scaffold; Editor only; validates ID format, no article read/write yet |
| GET `/health` | Existing `{status:"ok"}` HTTP liveness check |
| GET `/css/base.css`, `/css/style.css`, `/js/main.js`, `/js/login.js` | Static shared/page assets |

Home, public article, Login and workspaces use `Cache-Control: no-store`; a session-cookie lookup requiring an unavailable DB returns the existing 503 EJS error page. Protected pages return 401 HTML to Guests and 403 HTML to the wrong role; invalid edit/review IDs return 400 HTML. A well-formed ID is not proof of article existence/ownership: Reporter/Editor scaffolds currently display no article data. Unknown authorized page URLs still render 404 EJS; unknown API URLs still return the shared JSON error.

The public article page calls the same `getPublic` service as the JSON detail API, not an internal HTTP endpoint. EJS escapes the entire approved plain-text body; CSS preserves line breaks. JavaScript is not required for reading. Deferred `/js/browser-identity.js` and `/js/article.js` add independent best-effort view tracking and AJAX comments. The feed uses `/js/feed.js` and `/css/feed.css`; the detail uses `/css/article.css`.

## Public view recording

| Method/path | Caller | Body/query | Success | Main errors |
| --- | --- | --- | --- | --- |
| POST `/api/view-stats` | Anyone, no login | Only `{articleId,browserId}`; no query | 204, no body | 400 invalid ID/UUID/shape/fields, 404 non-public/missing article, 503 DB unavailable |

`browserId` is a UUID v4 (uppercase accepted, stored lowercase), a client-controlled label, not authentication. Server-selected time determines the article/browser/UTC-hour counter. Each accepted POST adds one, including repeat visits; no automatic client retry or unique-view deduplication. No raw-record endpoint. The page tracker omits session credentials. See [view semantics and lifecycle](view-tracking.md).

### Editor analytics

| Method/path | Caller | Query | Success | Main errors |
| --- | --- | --- | --- | --- |
| GET `/api/view-stats/articles/:id/analytics` | Editor only | optional `from`, `to`: canonical UTC ISO hour boundaries including milliseconds | 200 `{data:{articleId,publishedAt,totalViews,period:{from,to,interval:"hour"},periodViews,series:[{bucketStart,views}],publicationMarkers:[{at,type}]}}` | 400 ID/period/query, 401 Guest, 403 Reporter, 404 missing Article, 503 DB |

totalViews covers all recorded time; series/periodViews cover `[from,to)`, combining all browsers per hour. Default: last 30 days through the next hour boundary; maximum 90 days. Missing hours mean zero. Markers come only from publicationHistory (`publication` for the first entry, `update` afterwards) within that window. Editors may inspect any existing article; no content or browser identities are returned. See [analytics](analytics.md) for exact bounds, examples, indexes and pagination limitations.

The central `/analytics` page consumes this unchanged API using 7/30/90-day presets, a responsive SVG and exact returned marker times. It selects approved titles through the existing public list/search/cursor API, not workspace reads. Feed controls now send popularity/viewed parameters; All omits viewed/browserId. The identity helper loads before the feed, and identity failure falls back visibly to All. No JSON API changes were needed for this UI layer.

Login uses the existing POST auth route; Logout uses the existing DELETE session route. Both require browser JavaScript and redirect home on success. Navigation refreshes through the existing GET session API and displays only the matching role's workspace link. No authentication endpoints, existing JSON contracts or role redirects changed. Workspace pages load `/css/reporter.css` or `/css/editor.css` and their own scripts under `/js/reporter/` or `/js/editor/`; the scripts contain no feature behavior yet.

## Merged feature routers

The merged Comments and Weather routers retain their original mounts. Their central public UI integrations need no app.js changes. See [ownership boundaries](team-task-boundaries.md).

## Weather (existing backend, now displayed on home)

`GET /api/weather?city=Tel%20Aviv` is public and returns `{weather:{city,temperature,description,humidity,windSpeed,fetchedAt}}`, not the Article `{data:...}` envelope. Units: Celsius, humidity percent, wind m/s. Missing city: 400; missing `OPENWEATHER_API_KEY`: 503; provider/network failure: 502. Existing error envelopes/statuses are unchanged.

The service calls OpenWeatherMap server-side and caches one successful city result for 15 minutes. The home widget calls only our Express endpoint, displays a loading/fallback state independently of the feed, and refreshes at the returned fetchedAt age limit. The server-only key has an empty `.env.example` placeholder; it must never reach HTML or browser JS. See [weather UI](weather-ui.md) for cache details, setup and manual checks.

## Comments: public reads and guest/authenticated creation

| Method/path | Caller/input | Success | Main errors |
| --- | --- | --- | --- |
| GET `/api/comments?articleId=<id>` | Anyone; public article only | 200 `{data:[CommentDto...]}`, newest first, no pagination meta | 400, 404 |
| GET `/api/comments/:id` | Anyone; public article only | 200 Item CommentDto | 400, 404 |
| POST `/api/comments` | Guest `{articleId,body,browserId}`; authenticated `{articleId,body}` with optional valid browserId | 201 Item CommentDto | 400 shape/identity, 404 non-public, 422 body, 429 guest limit |
| PATCH `/api/comments/:id` | Authenticated author only; `{body}` | 200 Item CommentDto | 400, 401, 403, 404, 422 |
| DELETE `/api/comments/:id` | Authenticated author only; empty body | 204 | 400, 401, 403, 404 |

CommentDto: `{_id,article,body,author:{_id,username}|null,createdAt,updatedAt}`. Guest identity is never returned. Body is trimmed, 1–2000 characters. Guest browserId is the existing UUID v4, required and normalized lowercase; unknown fields are rejected. Three Guest admissions per rolling 60 seconds per identity across all articles; the fourth returns 429 `COMMENT_RATE_LIMIT`. This is enforced atomically in MongoDB, not by the form. Existing authenticated creation and author-only update/delete remain; a browser ID does not grant ownership. See [Comments](comments.md) for persistence, concurrency, failure behavior and the limitation of client-replaceable IDs.

The existing full article page loads/posts comments using fetch, without reloading or replacing its server-rendered body. Run `npm.cmd run db:indexes` to register Comment and BrowserIdentity indexes. No dependencies or auth API changes.

# Central Comments integration

The merged Comment model/service/controller/router are reused. Only comment creation becomes public; existing session loading, other APIs, Article workflow and authenticated comment ownership rules are unchanged. The controller needs no change. No dependency, fingerprint, second browser-ID generator, transaction or replica set is added.

## API

| Method/path | Caller/input | Result |
| --- | --- | --- |
| GET `/api/comments?articleId=<id>` | Anyone; valid public Article ID | 200 `{data:[CommentDto...]}`, newest first |
| GET `/api/comments/:id` | Anyone; comment must belong to a public article | 200 `{data:CommentDto}` |
| POST `/api/comments` | Guest: `{articleId,body,browserId}`; authenticated: `{articleId,body}` (optional valid browserId accepted) | 201 `{data:CommentDto}` |
| PATCH `/api/comments/:id` | Authenticated author only; `{body}` | 200 `{data:CommentDto}` |
| DELETE `/api/comments/:id` | Authenticated author only; empty body | 204 |

CommentDto remains `{_id,article,body,author,createdAt,updatedAt}`. author is populated `{_id,username}` or null for guests/unavailable authors. Browser IDs and throttle records never appear in public DTOs. No Guest User document is created. Guest browser IDs are not credentials: they cannot authorize editing/deletion. Editor moderation privileges and guest editing/deletion are not introduced by this task; the existing author-only policy stays intact.

Input: valid 24-character Article ID; trimmed body of 1–2000 characters; guest browserId is the existing UUID v4, normalized lowercase by the same validator as view tracking. Unknown body fields are rejected. Authenticated author comes from req.user, never client input. If authenticated callers supply browserId it is validated but is not stored or charged to the guest quota. Existing clients may omit it.

Errors use the existing `{error:{code,message,fields?},requestId}` format: 400 invalid shape/ID/browserId; 422 invalid length; 404 absent/non-public article or missing comment; 429 `COMMENT_RATE_LIMIT`; existing 401/403 for protected ownership operations and 503/500 for unavailable/unexpected storage errors. No raw identity/password/token logging is added.

List/detail/create reuse Article's public visibility rule, independent of workflow status: an approved snapshot remains visible during draft/pending/returned revisions. The full article remains server-rendered. Never-published articles cannot receive or publicly expose comments.

## Three guest comments per rolling minute

The existing client helper still creates/reuses `daily_web_browser_id`; its code is unchanged. A new technical `BrowserIdentity` MongoDB record uses **that same UUID as `_id`**, not a second identity. It stores only the latest three admitted guest comment timestamps and expiresAt.

Before creating a valid public-article guest comment, the Comment service reserves a slot with one conditional atomic update:

1. Fewer than three stored timestamps, or the oldest of the latest three is at least 60 seconds old: allow.
2. Push the server timestamp, sort ascending and retain only the latest three. Extend expiresAt to at least 60 seconds after this reservation.
3. Otherwise reject with 429 and a message to wait up to 60 seconds. The limit is global across articles for that identity, not per article.

The `_id` unique index prevents competing records for the same identity. An upsert blocked by an existing full record, or a racing first insert, gets duplicate-key error 11000; the service retries once without upsert using the same predicate. Only a successful match admits the request. Thus concurrent requests cannot use a separate count-then-insert race to exceed three.

MongoDB persistence shares the quota across server processes/restarts; there is no process-local map. The expiresAt TTL index eventually deletes inactive throttle documents, not comments or view history. Enforcement checks timestamps directly and never waits for TTL cleanup. Storage is bounded to three timestamps per active identity. Validation and public-article existence run before reservation and do not consume quota.

No cross-document transaction: if Comment insertion fails after a successful reservation, that slot remains consumed for at most 60 seconds. This conservative failure behavior avoids over-admitting requests after an uncertain database write. The client never retries POST automatically and retains draft text on failure; after a network failure it asks users to refresh comments before retrying, since a request may have reached the server.

**Identity limitation:** this enforces the limit per supplied browser UUID, not per physical person/device. Clearing storage, switching profiles or intentionally rotating UUIDs can bypass it. The requested existing BrowserIdentity is client-controlled; it is neither fingerprinting nor trusted ownership/anti-bot proof. Blocked storage uses the existing document-only ID. No secure UUID support means guests can still read comments but cannot post without a valid ID; authenticated posting remains possible. Stronger abuse prevention is a separate decision.

## Model/index setup

- Comment adds an optional, default-excluded browserId; author becomes nullable for guests. Schema requires an author or browserId, and limits body length. Existing authenticated documents remain compatible; no migration of their data is required.
- Existing Comment index `(article,createdAt descending,_id descending)` is registered in `scripts/setup-indexes.js` (it was previously absent).
- BrowserIdentity uses its automatic unique `_id` index plus TTL `{expiresAt:1}`, `expireAfterSeconds:0`.
- Run `npm.cmd run db:indexes` for the configured development database as an explicit setup step. This task runs setup checks only on disposable databases, not development data. No indexes are dropped.

## UI flow

The existing `views/article.ejs`, `public/js/article.js` and `public/css/article.css` now contain the comment list/form. No parallel page or script replaces the article. Comment loading is independent of best-effort view tracking. On load/Refresh, fetch the existing list endpoint; display empty/loading/error states. Comments and author labels use textContent, never raw HTML.

POST uses same-origin session credentials and the existing browser helper when available. Server req.user decides authenticated vs Guest, so the UI does not grant roles. Prevent duplicate in-flight submissions, show server validation/429 errors, and keep the user's text on failure. After success, immediately insert the returned DTO then refresh the area without reloading the document. Cancel/ignore older GET results so they cannot erase the new comment. Form controls stay disabled without JavaScript; the approved article is still readable.

## Tests and boundaries

`comments.test.js`: existing authenticated CRUD/ownership, guest creation/identity/privacy, three-per-minute/fourth rejection, separate identities, cross-article cap, ten parallel requests admitting exactly three, preexisting-window persistence/expiry, invalid content/non-public article not consuming quota, and actual SSR comment-control wiring. `commentsClient.test.js`: actual browser script with DOM/fetch doubles covers text safety, AJAX payload/credentials, instant insertion, stale GETs, empty/list errors, duplicate-submit prevention, 429/validation/network errors and missing identity. Existing tracking tests still protect one independent anonymous view POST.

Manual checks: real browser on desktop/mobile; post as Guest and while logged in; fourth Guest POST shows a useful error without losing text; refresh after the rolling window expires; inspect disabled-JavaScript readability and keyboard focus. Automated DOM doubles do not claim visual browser verification.

Not expanded here: the existing list returns all comments for one article (no new pagination contract), guest edit/delete ownership, moderation UI or anti-bot protection. The central compliance update now cleans Comments and ViewStats through the existing Editor-only Article DELETE. Comment insertion rechecks parent existence and removes a late orphan if deletion raced with the initial visibility check. Partial database failures require retrying the Article DELETE; no transactions or background cleanup framework are added. See [deletion behavior](article-workflow.md#deletion-boundary).

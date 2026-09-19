# Anonymous browser identity and view tracking

## Scope and flow

This central layer records anonymous public-article views only. No popularity, viewed/unviewed, analytics endpoints/graphs, Comments, rate limiting, Weather or seed features are added. Teammate files and Article workflow/model semantics are unchanged.

```text
GET /articles/:id -> existing public service -> complete article.ejs HTML
  -> deferred browser-identity.js: getBrowserId()
  -> deferred article.js: POST /api/view-stats
  -> viewStatRoutes -> requireDatabase -> viewStatController.record
  -> viewStatService.recordView
  -> articleQueryService.requirePublicArticle (exists query, shared public rule)
  -> ViewStat atomic hourly counter -> MongoDB -> 204, no body
```

The existing `/api` session middleware still runs, but the tracker sends `credentials: omit`. No login is required and no user/session is stored in a view record. Server rendering never calls the tracking service; its failure cannot fail the already-rendered article.

## BrowserIdentity lifecycle

Interface: `window.DailyWebBrowserIdentity.getBrowserId()` returns a UUID v4 string, or null if no secure generator is available.

- Stores only `daily_web_browser_id` in same-origin localStorage.
- Generates lazily with `crypto.randomUUID()` when no valid stored ID exists. Use HTTPS in production; local loopback development supports this API.
- Reads storage on each call, reusing the ID across refreshes, normal visits and tabs. Profiles/origins/devices are separate. Simultaneous first-ever tab calls can briefly generate different IDs; later calls read the last stored value. This is not a physical-device guarantee.
- Clearing/corrupting storage creates a new identity; old server records are not relinked. No fingerprinting or reconstruction.
- Blocked/full storage falls back to an in-memory ID for this document only. If secure UUID generation is unavailable, returns null and tracking is skipped.
- No password, session token/cookie, user data or fingerprint is stored. The ID is not secret, authentication, a unique person or proof of ownership.

This phase adds a helper, **not a BrowserIdentity MongoDB collection**. Future trusted Guest identity/ownership/rate limiting remains central work. This freely replaceable UUID must not be the sole anti-spam/authorization mechanism.

## Exact view definition

Each successful validated POST adds one. The article script attempts one POST per normal document load, including refresh. Repeated visits count again; this is not unique-reader counting. No automatic client retry or duplicate suppression: retrying an accepted request would count again.

No pageshow listener: a Back/Forward cache restoration without re-executing scripts does not add a view. Feed impressions, raw HTML/API GETs, JavaScript-disabled clients, missing secure identity generators and blocked/failed tracking requests do not count. `keepalive` helps during navigation but cannot guarantee delivery. This is best-effort client-reported traffic; fabricated valid UUIDs/POSTs can inflate it. No bot prevention is claimed.

## ViewStat schema and indexes

Collection: `viewstats`.

| Field | Meaning |
| --- | --- |
| article | Required ObjectId reference to Article |
| browserId | Required lowercase UUID v4, anonymous client-controlled label |
| bucketStart | Server-selected UTC hour boundary, Date aligned to 3,600,000 ms |
| views | Positive integer, incremented only by server code |
| lastViewedAt | Latest server observation time within this bucket |
| createdAt / updatedAt | Mongoose timestamps |

- Unique `{article:1,browserId:1,bucketStart:1}`: one counter per combination under concurrent upserts.
- `{article:1,bucketStart:1}`: future article/time aggregation across browsers.
- `{browserId:1,article:1}`: future browser/article existence queries.

`$inc` avoids read-modify-save lost increments. `$max` prevents out-of-order writes moving lastViewedAt backwards. Duplicate-key insertion failure retries once as a non-upsert increment; arbitrary write failures are not retried. No transactions or replica set.

This retains browser association for future viewed state while merging repeat visits within an hour. No per-load document or ever-growing Article array is introduced. Tradeoff: more documents than article/hour-only counters; growth follows distinct article/browser/hour combinations, so thousands of distinct readers can create thousands of buckets. Later aggregation can sum views across browsers. Retention/rollups and cross-device authenticated ReadReceipt design are future decisions; no silent TTL/history deletion is introduced.

## Initialization

Run `npm.cmd run db:indexes` before tracking traffic. The existing script includes ViewStat, creates its unique/query indexes and does not drop others. ViewStat disables automatic collection/index creation because it is imported before connection with buffering disabled; this avoids a cached pre-connection createCollection failure. Tests explicitly create its indexes after connecting.

## API/security

`POST /api/view-stats`, public, JSON body **only** `{articleId,browserId}`, no query parameters.

- 204: increment recorded, no raw records/counters/history returned.
- 400: missing/malformed ObjectId or UUID, invalid body, unknown fields/query.
- 404: absent/non-public article; 503 unavailable DB; sanitized 500 unexpected fault. Existing 413 payload limit applies.

Public means a BSON date in publishedAt plus an existing non-null publishedContent, independent of workflow status. The existence check reuses the query service filter without fetching any body or reporter information. Client role, count, content, publication state and timestamps are rejected. Uppercase UUIDs normalize to lowercase. No GET/list/raw-history endpoint or per-view/body/identity logging is added.

## Lifecycle boundaries / next phase

Requests for already-deleted articles fail the visibility check. References do not cascade. Existing Article hard deletion is unchanged: historical buckets remain, and deletion concurrent with an already-validated POST can leave a historical bucket. Bounded dependent cleanup and its race policy must be integrated centrally with the other dependent collections; no cleanup framework is added here. Future public/Editor aggregation reads must enforce visibility/permissions.

Deferred: trusted Guest identity/comment limit, ReadReceipt/viewed UI, popularity/totalViews, analytics/publication markers, protected ViewStat Read/Update/Delete compliance operations, retention/cleanup, Comments/Weather UI and demo seed. The current write-only API does not claim full ViewStat CRUD completion.

## Tests

- `browserIdentity.test.js`: persistence/reuse, storage clearing/corruption, blocked storage, unavailable crypto.
- `articleTracking.test.js`: actual client script in VM, one POST, omitted credentials, safe HTTP/network failure and missing identity/page.
- `viewStats.test.js`: real isolated MongoDB, revision/public visibility, persisted counters, concurrent increments, duplicate-key recovery, validation, UTC buckets and SSR independence from a failed statistics write.
- Existing public/auth/workflow/scaffolding suites are regression coverage. These are not a production-load benchmark or real-browser run.

Verified on 2026-09-19: syntax passed for 75 JavaScript files; `test:unit` passed 12 tests; `npm.cmd test` passed 62 tests with zero failures/skips; smoke passed all 6 checks. Integration tests used isolated local MongoDB databases and cleaned them up. File hashes confirmed all 16 existing teammate-owned files, Article model/workflow and package files unchanged. No Git operations or new dependencies. Initial checks exposed a pre-connection ViewStat auto-creation failure (fixed with explicit index initialization) and a test assertion affected by Mongoose's lowercase query setter (corrected using the native collection); the final full run passed.

# Central public news experience

## Data and ownership

Reuse `articleQueryService` for both public JSON and EJS. Visibility requires a BSON date in `publishedAt` plus an existing, non-null `publishedContent`, never `status === published`. DTOs and query projections omit workingContent, status, editorNote and history. Search/indexes use only the approved title/category. The first publication date stays fixed across approvals.

The new UI files are `views/article.ejs`, `public/js/feed.js`, `public/css/feed.css` and `public/css/article.css`. Home uses the existing `index.ejs`, index router and home controller. No new duplicate service/controller/router, dependency or empty article.js is needed. Shared partials and all A/B/C/D files are unchanged.

## Queries and indexes

See [API contract](api-contract.md#public-feed-query-contract). Run `npm.cmd run db:indexes` after updating an existing checkout. This uses the existing non-destructive index script; do not use syncIndexes. Date-only queries use the existing partial date/ID index; category queries use the new partial category/date/ID index (both reverse for oldest). Title queries use a text index with language none, then sort matching records by date; a broad search still has a matching-result sort cost. Queries are limited to 21 candidate rows (20 + hasMore) and have a five-second database time limit. No all-article download, skip pagination or collection scan regex is used.

## Client behavior

A compact Tel Aviv weather aside above the filters now calls the existing `/api/weather` through its own deferred `weather.js`. It displays temperature/conditions, humidity, wind and retrieval time. Loading/failure/Retry are independent of feed requests; no provider call/key goes to the browser. The existing 15-minute server cache is unchanged, and expired details are hidden/refreshed. See [weather integration](weather-ui.md) for setup and verification.

The Sort by control now includes Newest first, Oldest first and Popularity. Reading status offers All, Viewed and Unviewed. These send `sort=popularity` and `viewed=true|false` to the existing API, composing with search/category/cursor. The browser never sorts popularity or filters only loaded cards. See [analytics](analytics.md) for server definitions and costs.

`browser-identity.js` loads before `feed.js`. Viewed/Unviewed calls `DailyWebBrowserIdentity.getBrowserId()` and sends its ID; All sends neither browserId nor viewed. No separate read list is stored. Blocked storage keeps working through the helper's document-only fallback, but cannot retain history across pages; the UI explains this. Missing/throwing identity resets visibly to All and still loads the feed. A changed identity detected before loading another page resets the cursor/cards instead of mixing identities. All filter changes keep existing abort/stale-response/deduplication/error/end behavior.

The initial feed request fetches 20 cards. Search changes debounce for 300 ms; filters/sort submit immediately. Reset clears the cursor, loaded IDs and cards, aborts the old fetch and ignores late results. Pagination is serial; a Set prevents duplicate cards. IntersectionObserver triggers near the bottom (300px margin). Load more is a keyboard-accessible fallback. Failed pages preserve previous cards and cursor; only an explicit retry retries the failure. End/empty/error/loading feedback is visible and announced. There is no snapshot guarantee while editors publish/delete between requests.

Article HTML is completely server-rendered from the approved DTO, with escaped text and preserved body line breaks. JavaScript is not required to retrieve/read its body. Missing/private/deleted IDs return shared HTML 404; malformed IDs 400; unavailable database 503. The subsequent [view-tracking layer](view-tracking.md) adds an independent best-effort POST without fetching/replacing the body.

## Automated checks

- `publicArticles.test.js`: existing projection/visibility/date-pagination regression checks.
- `publicNews.test.js`: real MongoDB search, combined category/date queries, both sort directions, 20-item paging, indexes, HTML SEO/full-body escaping, revision visibility and failure responses.
- `feedClient.test.js`: executes the actual feed script with small DOM/fetch doubles; checks stale responses, serial loading, deduplication, filter reset, end/empty states, API/network failures and manual retry/fallback. Not a browser layout test.
- The full existing suite also protects login/sessions/workflow/team scaffolding.

Verification on 2026-09-19: `npm.cmd run check:syntax` passed (66 JavaScript files); `npm.cmd run test:unit` passed (12 tests); `npm.cmd test` passed (49 tests, zero failures/skips); `npm.cmd run test:smoke` passed (6 checks). MongoDB checks used isolated test databases with cleanup, not the development database. File-hash comparison confirmed all 16 existing teammate-owned files and both package files were unchanged; no Git operations were used.

## Browser acceptance checklist

Use local test/development articles approved through the existing workflow; do not expect drafts to appear. Do not populate the development DB implicitly just to run tests.

1. With more than 40 approved articles: verify the initial 20 cards, approach the bottom twice, no duplicate IDs, final end state and card navigation.
2. Type quickly while a request is in flight; only the newest search must appear. Try a whole title word, a quoted phrase, a category and both date sort directions; none should reload the document. Change a filter after loading page two: restart at page one.
3. Simulate an offline/failed API request: keep existing cards, show retry, recover without duplicates. Try a query with no matches.
4. At viewport widths 360, 768 and 1280: check readable controls/bylines, one/two/three card columns, no horizontal overflow, image sizing, keyboard focus and navigation. Check the full article with long text and line breaks at all widths.
5. Disable JavaScript for a direct `/articles/:id` visit: the entire approved body, image, reporter/date/title/category must already be present. Compare against public API content. Unknown/unpublished articles show 404.

The implementation session could not perform visual browser checks: no connected browser was available and the in-app browser reported unavailable. Responsive CSS and automated HTTP/client behavior checks are provided; viewport rendering still needs this manual check.

## Deliberately deferred

Comments load and submit via AJAX in the existing article page, with server-enforced guest limits using the existing browser UUID; see [Comments](comments.md). Home now includes the central weather widget using the unchanged teammate backend. Stronger trusted-device anti-abuse, comment moderation/edit UI and dependent cleanup remain separate work. Reporter/Editor/Seed implementations are unchanged by these central integrations.

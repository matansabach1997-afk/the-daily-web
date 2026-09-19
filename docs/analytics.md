# Popularity, viewed state and analytics backend

This central backend extends the existing Article query and ViewStat service. It adds no model, stored Article counter, dependency or UI. Recording semantics remain in [view tracking](view-tracking.md).

## Definitions and public API

- Popularity is the sum of **all recorded `ViewStat.views`** for an article, across browsers and UTC-hour buckets. Repeated visits count. There is no decay, artificial score or unique-reader calculation. No rows means zero.
- Viewed means at least one ViewStat exists for the article and supplied browserId, regardless of bucket/count. Unviewed means no such row. This is a MongoDB filter applied before the page limit, not filtering the 20 downloaded cards.
- `GET /api/articles?sort=popularity` orders by totalViews descending, then `_id` descending. Only this sort adds `totalViews` to each existing PublicCard DTO. Date-sort cards and detail responses remain unchanged.
- Add `viewed=true` or `viewed=false` together with `browserId=<UUID-v4>`. Both combine with q, category, all three sorts and cursor pagination. Repeated/invalid values and missing required identity return 400. Uppercase UUIDs normalize to lowercase using the same validator as recording. Browser-supplied article-ID arrays are rejected.
- Without a viewed filter, browserId is optional. Normal and popularity feeds work without identity. If supplied, browserId is validated even without a filter. A client unable to create an identity should omit both parameters and leave viewed controls unavailable.

Example: `/api/articles?category=science&q=telescope&sort=popularity&viewed=false&browserId=12345678-1234-4123-8123-123456789abc`.

Identity belongs to the browser profile/origin, not an authenticated account. Guests and logged-in users follow the same rule; logging in does not transfer history between devices. Clearing localStorage creates a fresh identity. The UUID is client-controlled, not authorization or a private-history credential. Responses reveal neither raw buckets nor other browser IDs.

Pages contain up to 20 items with the existing meta contract. Reuse the opaque cursor with unchanged q/category/sort/viewed/browserId; reset it when any of these changes. Numeric popularity cursors use totalViews plus `_id`; date cursors keep the existing date plus `_id`. Ordering is deterministic for unchanged data, **not a snapshot**: new views can move articles across page boundaries, causing skips/repeats. Clients should deduplicate and refresh from the first page for current ranking. No snapshot/revision infrastructure is added.

## Editor analytics endpoint

`GET /api/view-stats/articles/:id/analytics?from=2026-01-01T00:00:00.000Z&to=2026-01-03T00:00:00.000Z`

Existing session loading -> requireRole(editor) -> requireDatabase -> viewStatController.analytics -> viewStatService.getAnalytics -> Article and ViewStat -> JSON. The service also checks the actor role. Guests receive 401; Reporters 403; malformed IDs/periods/unknown parameters 400; missing articles 404; unavailable DB 503. Editors may inspect any existing article, including a draft, without exposing any working content through this endpoint.

Response shape (illustrative values):

```json
{
  "data": {
    "articleId": "0123456789abcdef01234567",
    "publishedAt": "2026-01-01T00:30:00.000Z",
    "totalViews": 15,
    "period": { "from": "2026-01-01T00:00:00.000Z", "to": "2026-01-03T00:00:00.000Z", "interval": "hour" },
    "periodViews": 10,
    "series": [{ "bucketStart": "2026-01-01T01:00:00.000Z", "views": 10 }],
    "publicationMarkers": [
      { "at": "2026-01-01T00:30:00.000Z", "type": "publication" },
      { "at": "2026-01-02T12:15:00.000Z", "type": "update" }
    ]
  }
}
```

- totalViews is lifetime; periodViews sums just the requested period. No statistics returns zero totals and an empty series.
- Bounds are canonical UTC ISO timestamps including milliseconds, on whole-hour boundaries. Interval is `[from,to)`: from included, to excluded. It must be positive and at most 90 days (2,160 hourly points).
- Default to is the next UTC-hour boundary, including the current partial hour. Default from is 30 days before to. Either bound can be supplied independently, subject to validation.
- Series combines all browser buckets per hour, sorts oldest first and is sparse: absent hours mean zero. The future graph may fill zeros; the backend does not invent individual visits.
- Markers come only from actual publicationHistory entries within the period. Array entry zero is publication; subsequent entries are updates, even if the first entry lies outside the requested period. No marker is inferred from updatedAt, Start Revision or autosave. publishedAt remains the first publication date and may be null.
- Hourly aggregation cannot distinguish visits before/after an update within the same hour. Markers retain their exact approval times; graph comparisons must respect this resolution.

## Queries, indexes and limits

No index/schema changes are needed. Existing indexes must already have been created with `npm run db:indexes`:

| Existing index | Use |
| --- | --- |
| ViewStat unique `(article,browserId,bucketStart)` | Recording uniqueness and article/browser existence lookup |
| ViewStat `(article,bucketStart)` | Article-leading totals and hour queries |
| ViewStat `(browserId,article)` | Browser/article lookup alternative |
| Article partial publishedAt/ID and category/date/ID | Public eligibility and date ordering |
| Article approved-title text index | q search before lookups |

The public aggregation starts with eligible Article records and approved title/category filters. A viewed lookup stops after one matching row. Popularity joins and sums only matching articles' ViewStat records, defaults missing totals to zero, applies the score cursor and sorts before limiting to 21 candidates. Public projection/DTO excludes body, workingContent, status, notes and history; reporter population selects ID/username only. Ordinary date feeds without viewed filtering keep their existing find query.

Computed popularity cannot use an index on the computed total: it must sum matching buckets before sorting. This avoids duplicated counters while remaining reasonable for the assignment's hundreds/thousands of articles. It is not constant-cost or a proof of thousands-of-concurrent-readers capacity; accumulated bucket volume still matters. Queries have a five-second database limit. Load measurements, caching or retention would be separate work, not silently introduced here.

Analytics first matches one article using an article-leading index, then uses a facet for lifetime sum and period/hour grouping. Because lifetime totals need all its buckets, this operation scans that article's history, not only the selected period. The existing time index also supports direct range queries; no additional index is justified. Tests check index plans and actual public lookup index usage, not just declared index names.

Existing hard deletion/recording behavior is unchanged. Historical orphan buckets are excluded from public ranking because queries start from existing public Articles; analytics for a deleted article returns 404. Cleanup/retention policy remains deferred.

## Handoff and checks

No feed controls, graph, Reporter/Editor/Comments/Weather/Seed-owned files changed. Future central UI integration can use the current browser helper, new query parameters and Editor endpoint. ViewStat management Update/Delete operations remain deferred; this task does not claim complete statistics CRUD.

`tests/analytics.test.js` exercises real isolated MongoDB data: cross-browser/hour totals, zero-view articles, all filter/sort combinations across pages, malformed inputs, missing identity fallback, permissions, exact markers, empty data, safe DTOs and lookup index plans. Run the full commands in [testing](testing.md).

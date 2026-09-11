# Stable Lead Core API

Base URL: `http://127.0.0.1:3000`. JSON requests use `Content-Type: application/json`. Browser/Postman cookie jars retain the session; same-origin browser fetch sends it automatically. No bearer tokens, role fields or passwords in query strings. All feature endpoints below return JSON, not HTML.

## Response vocabulary

- User: `{ _id, username, role }`; never passwordHash.
- Content: `{ title, summary, body, category, imageUrl }` (all strings).
- PrivateArticle: `{ _id, reporter: { _id, username } | null, workingContent, publishedContent, status, editorNote, publishedAt, publicationHistory, createdAt, updatedAt }`.
- PublicCard: `{ _id, title, summary, imageUrl, category, reporter: { _id, username } | null, publishedAt }`.
- PublicDetail: PublicCard plus `body`, always from publishedContent.
- Item: `{ data: item }`; list: `{ data: [...], meta: { nextCursor: string | null, hasMore: boolean } }`.
- Errors: `{ error: { code, message, fields? }, requestId }`. Every response has `X-Request-Id`; API responses use `Cache-Control: no-store`.
- IDs are 24-character ObjectId strings; dates are ISO strings; null publication dates/content mean never published.

List size is fixed at 20. Pass the returned opaque cursor unchanged to the same query; preserve filters when paging and reset cursor if filters change. There is no total-count query. Ordering is deterministic using `_id` as a tie-breaker; workspace updates may move entries between pages, so clients should deduplicate IDs/reset on refresh. This is not snapshot isolation.

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

The private namespace is the only source for workingContent, status, note and history. UI roles do not replace these server restrictions.

## Public reads and Article writes

| Method/path | Caller | Body/query | Success | Main errors |
| --- | --- | --- | --- | --- |
| GET `/api/articles` | Anyone | optional `cursor` only | 200 PublicCard list, first publishedAt descending | 400 unsupported query/cursor |
| GET `/api/articles/:id` | Anyone | None | 200 Item PublicDetail | 400 ID, 404 absent/unpublished |
| POST `/api/articles` | Reporter | `{workingContent:{...}}`; fields may be omitted on creation | 201 Item PrivateArticle, draft | 400, 403, 422 |
| PATCH `/api/articles/:id/working-content` | Owner Reporter draft/returned; Editor draft/pending/returned | `{workingContent:Content}`; all five keys, empty strings allowed | 200 Item PrivateArticle | 400 shape, 404 ownership, 409 state, 422 content |
| POST `/api/articles/:id/submissions` | Owner Reporter | No body or `{}` | 200 Item PrivateArticle, pending | 400 body, 403, 404, 409 state, 422 incomplete |
| POST `/api/articles/:id/returns` | Editor | `{editorNote:string}` | 200 Item PrivateArticle, returned | 400, 403, 404, 409 not pending, 422 note |
| POST `/api/articles/:id/approvals` | Editor | No body or `{}` | 200 Item PrivateArticle, published | 400, 403, 404, 409 not pending, 422 incomplete |
| POST `/api/articles/:id/revisions` | Owner Reporter / Editor | No body or `{}` | 200 Item PrivateArticle, draft copied from public | 400, 404, 409 not published |
| DELETE `/api/articles/:id` | Editor | No body or `{}` | 204, including already absent valid ID | 400, 403 |

Public visibility depends on publishedContent and publishedAt, never the current status. Public APIs do not return workingContent, status, notes, history, body in list rows, passwordHash or session information. `publishedAt` stays at first approval even after updates. Detail requests do not yet record views; Member 5 will integrate that feature at the full-page visit boundary.

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

See [workflow](article-workflow.md) for lengths, validation and all transitions. No search/category/popularity/viewed parameters, comments, analytics or weather endpoints are silently implemented here. Feature owners must agree additive contracts and indexes before exposing those operations; do not create duplicate Article routes/controllers/services.

## Existing page endpoints

`GET /` renders the existing `views/index.ejs` skeleton. `GET /health` returns `{status:"ok"}`. `GET /css/style.css` and `/js/main.js` serve existing assets. Unknown page URLs render 404 EJS; unknown API URLs return the shared JSON error. Full public article pages and login/workspace UIs are future team features.

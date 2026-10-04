# Article workflow contract

`workingContent` is editable. `publishedContent` is the last Editor-approved snapshot. `publishedAt` is the FIRST approval timestamp, never updated by subsequent approvals. Every approval adds its own timestamp to `publicationHistory`; its first entry equals `publishedAt`.

| Action | Caller/precondition | Database change | Public effect |
| --- | --- | --- | --- |
| Create | Reporter | New owned draft, required content object; missing strings default empty | None |
| Save | Owner Reporter in draft/returned; Editor in draft/pending/returned | Replace workingContent only | None |
| Submit/resubmit | Owner Reporter, draft/returned, complete valid content | status pending | Previous public snapshot unchanged |
| Return | Editor, pending, nonempty note max 2000 | status returned, editorNote | Previous public snapshot unchanged |
| Approve | Editor, pending, complete valid content | Copy working to public, status published, clear note, append approval timestamp; set publishedAt only if first approval | New approved content becomes public |
| Start Revision | Owner Reporter or Editor, published with valid public snapshot/date | Copy published to working, status draft | Snapshot/date/history unchanged |
| Delete | Editor | Hard delete; repeated valid-ID delete returns 204 | Article no longer public |

All other state transitions return 409. Wrong role returns 403; no authentication 401; another Reporter's private article is hidden with 404. Invalid ID returns 400. Incomplete submission/approval returns 422. Editors cannot create drafts or submit on a Reporter's behalf using these endpoints; they can edit and approve submitted work.

## Content rules

The object contains exactly `title`, `summary`, `body`, `category`, `imageUrl`. Limits respectively: 200, 500, 50000, 40, 2048 characters. Strings default empty in the schema, with no content-field `required` validators. `workingContent` itself is required. Non-body fields are trimmed; body whitespace is preserved. All five must contain non-whitespace text at submission and approval.

Categories are `technology`, `science`, `culture`, `sport`, `local`. Blank is allowed while drafting. Images may use HTTPS URLs without embedded credentials, or `/images/...` image paths. This is URL validation only: no upload, remote fetching, reachability or image-host guarantee. Body is plain text; no rich HTML or sanitization dependency.

Creation accepts `{ "workingContent": {} }`, or a partial object with valid supplied strings. Saves require the complete five-field object, allowing empty strings. That prevents an accidentally incomplete request from silently blanking unspecified fields. Unknown root/nested keys, nonstrings and excessive lengths are rejected before writes. Clients cannot set reporter/status/public content/history/date through save.

## Autosave integration

The Reporter client debounces changes for 700ms and serializes requests: one save in flight, retaining the newest pending snapshot until completion. Submit and Back to Reporter Workspace await the entire queue and do not proceed after a failed save. Loading uses the private detail endpoint's workingContent. The form shows saving/saved/error state; failed saves require deliberate retry. A blank field is an intentional deletion and is allowed.

Blur, hidden visibilitychange and pagehide flush a pending debounce through the same queue. Every save up to 60 KiB of UTF-8 JSON uses fetch keepalive, including saves started while the page is visible. Larger drafts use ordinary fetch intact (no truncation). This leaves some margin under the browser's shared 64 KiB keepalive budget, but other requests can still exhaust that budget. No unload/beforeunload async hacks or browser article store are introduced.

Limits: keepalive protects a request already dispatched, not JavaScript continuation after a document is destroyed. If a newer snapshot is waiting behind an in-flight save at final close, it may not be sent. Offline, forced browser termination and large in-flight ordinary requests also cannot be guaranteed. Wait for Saved before final close/refresh or changing computers. The latest acknowledged workingContent is restored from MongoDB. Therefore this improves exit reliability, but does not claim absolute zero-loss for every closing scenario. No revision counters or simultaneous-edit support are added.

## Deletion boundary

The existing Editor-only DELETE first removes the Article, then deletes its Comments and ViewStats using article-indexed filters and a 5-second per-operation limit. Success (204) means all three operations completed. A failure returns the normal error response; repeating DELETE repairs cleanup even when the Article is already absent. No other article's records or shared BrowserIdentity/session records are removed. Comment/view creation rechecks parent existence after insertion to clean up a write admitted before deletion. A process crash or DB failure during these independent operations can still require retrying DELETE. No transaction, soft deletion or background cleanup framework is introduced.

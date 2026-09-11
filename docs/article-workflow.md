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

## Autosave integration, not implemented here

Member 2 should debounce changes and serialize requests: one save in flight, retain the newest pending snapshot, send it after completion. Do not send competing saves or submit before the final save succeeds. On load use the private detail endpoint's workingContent. Show saving/saved/error state; retry deliberately, not by sending older snapshots after newer ones. A complete blank field is an intentional user deletion and is allowed.

No revision counters, simultaneous-edit support or optimistic concurrency is promised. HTTP state guards prevent invalid transitions but do not resolve two people editing the same article. Later blur/navigation/pagehide behavior must not claim delivery is guaranteed after an abrupt browser/process crash; confirm server acknowledgements and explain any recovery fallback separately.

## Deletion boundary

Only Article currently has dependent business data in scope, so there are no placeholder cleanup collections. Comments, ReadReceipt and ViewStat owners must integrate bounded, repeatable dependent cleanup when their models are added. No soft deletion, background cleanup framework or transaction requirement is introduced.

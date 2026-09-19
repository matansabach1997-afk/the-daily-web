# Current persistent data

Only `User`, `Article`, `Session` are implemented in Lead Core. MongoDB normally stores them as `users`, `articles`, `sessions`. A schema is the field/validation definition; a model supplies operations such as `find`, `create` and `findOneAndUpdate`. An ObjectId reference stores another document's ID; `populate` loads selected referenced fields. It is not a foreign-key constraint.

## User

- `username`: required unique trimmed string (3–40); API allows letters, digits, underscore and case-sensitive names.
- `passwordHash`: required, excluded from ordinary queries. Contains `scrypt$1$salt$hash`, not an encrypted/recoverable password.
- `role`: reporter or editor, never Guest.
- Mongoose timestamps: `createdAt`, `updatedAt`; regular `_id` remains.
- Unique `username` index prevents duplicates in the database. Mongoose `unique` is an index instruction, not an ordinary required validator.

Each password hash uses a new random 16-byte salt and Node's async scrypt with one fixed versioned configuration. Login derives a candidate with the stored salt and compares with `timingSafeEqual`. Salt is not secret; it prevents identical passwords from producing identical stored hashes and defeats precomputed shared tables. Passwords are never logged. No advanced tuning/concurrency system is added.

Existing User CRUD policy: Editor manages Reporter accounts, users can read/update themselves with current-password confirmation, no Admin role or Editor-management UI. A Reporter owning any Article cannot be deleted (409). This is the minimal chosen interpretation of the assignment's User CRUD; confirm it with the course evaluator if needed.

## Article

- `reporter`: required ObjectId reference to User; assigned from the authenticated Reporter, not request input.
- `workingContent`: required nested content object. All five strings may be empty for drafts.
- `publishedContent`: same reusable nested schema, null before first publication.
- `status`: draft/pending/returned/published, initially draft.
- `editorNote`: trimmed string, initially empty; workflow limits return notes to 2000.
- `publishedAt`: first publication date or null.
- `publicationHistory`: date array, one entry per approval, not per view or autosave.
- `createdAt`/`updatedAt`: automatic persistence timestamps, distinct from editorial publication events.

Nested content uses `{ _id: false }` because snapshots are parts of the Article, not separate entities. The Article still receives its own MongoDB `_id`. Validation allows incomplete drafts but bounds content sizes; services enforce completeness, ownership and transitions. History grows with approvals only; no per-reader event array.

Indexes (the `_id` index is automatic):

| Key | Query |
| --- | --- |
| reporter, updatedAt descending, _id descending | Reporter's workspace or Editor filtering by Reporter |
| reporter, status, updatedAt descending, _id descending | Ownership plus workflow filter |
| status, updatedAt descending, _id descending | Editor status queue |
| updatedAt descending, _id descending | Editor all-article workspace |
| publishedAt descending, _id descending; partial publishedAt is Date | Public 20-item feed, stable first-publication ordering |
| publishedContent.category, publishedAt descending, _id descending; partial publishedAt is Date | Public category filter and date ordering (reverse scan for oldest) |
| publishedContent.title text; default_language none | Whole-word approved-title search, no stemming or stop-word removal; never indexes workingContent |

## Session

- `tokenHash`: unique SHA-256 digest of a cryptographically random 32-byte opaque cookie token; excluded from ordinary queries.
- `user`: required indexed User reference.
- `expiresAt`: absolute expiry, seven days after login.
- `createdAt`/`updatedAt`: timestamps.
- TTL index on expiresAt with `expireAfterSeconds: 0` eventually removes expired records. Request lookup checks expiry itself because TTL cleanup is asynchronous.

Cookie: `daily_web_session`, HttpOnly, SameSite=Lax, Path=/, seven-day max age; Secure in production (use HTTPS). Cookie carries the raw random token; the database stores its hash. Restarting Node retains MongoDB records, so users remain authenticated until expiry/logout/password change. Login replaces that browser's previous session; logout deletes its record and clears the cookie. Password changes revoke all user's sessions. No session secret in a process-local map is required. Guests have no User/Session records in this phase.

## Later team-owned collections

Comment, ViewStat, BrowserIdentity and ReadReceipt remain deferred, not pre-created. They will complete the approved seven-collection design. No RateLimit collection, transactions or replica-set deployment. Public search/category indexes are now declared above; popularity/read-state indexes remain deferred. `npm run db:indexes` creates declared indexes; it does not drop unknown existing ones or migrate data.

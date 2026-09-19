# Team onboarding and ownership

Read repository AGENTS.md, README, API contract and article workflow before starting. Inspect existing files; extend the existing route/controller/service instead of duplicating it. No new dependency without explicit approval. Use small, explainable MVC changes and include tests/documentation in each feature.

## Stable handoff

- Auth cookie/session and User DTO/error envelope are shared; do not add separate auth implementations.
- Private workspace list/detail supplies workingContent, publicationHistory and notes.
- Article mutation routes and their status/ownership rules are stable (see API table).
- Public list/detail supplies only approved content with first-publication cursor ordering and 20-item batches.
- Content categories and bounds are centralized in `config/articleRules.js`; match client validation to these, never trust it instead of server validation.
- `publishedAt` is first publication. Analytics update markers come from publicationHistory; latest approval is its last entry.
- All saves use the full five-field object. Serialize saves client-side; await the final save before a transition.

## Current parallel assignments

[Team task boundaries](team-task-boundaries.md) is the authoritative A/B/C/D file allowlist and Definition of Done. It replaces the earlier Member 2–5 allocation. No teammate edits shared files or another assignment's files without explicit approval.

| Owner | Small work units | Integration dependency |
| --- | --- | --- |
| Lead/integrator | Shared files, public feed/article integration, Guest identity/limiting, views/popularity/analytics and integration review | Preserve auth/ownership/workflow contracts |
| A | Reporter Workspace UI | Mounted Reporter page router; private reads + create/save/submission/revision APIs |
| B | Editor Workspace UI | Mounted Editor page router; private reads + existing workflow APIs |
| C | Comments Backend/API | Mounted `/api/comments`; existing session, validation and error conventions |
| D | Seed Data + Weather Backend | Mounted `/api/weather`; existing User/Article models and version/date semantics |

BrowserIdentity, ReadReceipt, Guest comment limiting and dependent hard-delete cleanup remain central integration work. C must not enable Guest writes before trusted identity and limiting exist. No placeholder collections, transactions or replica sets are introduced. The explicit custom CSRF-token infrastructure and login throttling remain deferred; HttpOnly/SameSite=Lax cookies plus server auth/roles/ownership remain the current policy. Review origin/CSRF hardening before any broader deployment rather than claiming cookie flags alone solve every CSRF risk.

## Shared UI extension points

- Reuse `views/partials/header.ejs` and `footer.ejs` around one `<main id="main-content">`. Header includes `navigation.ejs`, `base.css`, the small existing `style.css` and shared `main.js`. Include a feature's own deferred browser script only on its page; do not copy login/logout code.
- For a page needing session-aware HTML, put existing `loadSession` before its controller, then `requireAuth`/`requireRole` where access is restricted. API routes already load sessions in `app.js`; do not load them twice. EJS receives safe `currentUser` through `res.locals`; it can be null. Unknown/early-error pages fall back to guest markup and refresh their navigation through the session API.
- Navigation contains Home, Login or username/role + Logout, and only the matching role's Reporter/Editor Workspace link. Both server HTML and the existing session refresh maintain those links. Shared navigation remains central-owned; client role visibility never replaces server authorization.
- Keep feature styles/scripts inside the ownership allowlist. Reporter/Editor controllers supply the optional server-chosen `pageStylesheet` to the header, so no shared-template edit is needed. `main.js` owns session refresh and Logout; `login.js` owns only Login. After login/logout the destination remains `/`; role-specific workspace links are available there.
- A/B/C/D can start independently from these integration points. Public page UI, Guest-comment identity/limiting and statistics are deliberately integrated centrally later. No `db:seed` package entry exists until D supplies a real script; run that future script directly during development.

## Manual Git workflow

The user performs all Git operations for this implementation. Suggested later branches: `feature/reporter-workspace`, `feature/editor-workspace`, `feature/comments-api`, `feature/seed-weather`, with smaller task branches if helpful. Follow the ownership allowlists before parallel edits. Each student should author small meaningful commits and explain their changes in PRs; peers should review and rehearse explaining code outside their own feature.

For each PR: document endpoint/data changes, run syntax and relevant tests, show status/diff manually, confirm no secrets or unrelated changes, and explain student-facing concepts. Merge only with explicit project approval. Recommended Lead Core commit boundaries: Article workflow, public query/index contract, automated integration checks, docs/onboarding. Existing runtime/auth work can remain its own earlier logical group; do not rewrite it merely to reorganize commits.

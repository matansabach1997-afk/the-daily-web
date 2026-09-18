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

## Parallel tasks after Lead Core

| Owner | Small work units | Integration dependency |
| --- | --- | --- |
| Lead/integrator | Review API extensions; integration tests; PR review and shared docs | Preserve auth/ownership/workflow contracts |
| Member 2 | Reporter list/forms; serialized debounced autosave and status UI; submit/resubmit and note display | Private reads + create/save/submission/revision APIs |
| Member 3 | Public server-rendered full article; feed UI; search/category/sort/viewed API extensions; infinite scrolling and responsive public pages | Public query service; later ReadReceipt/identity and statistics contracts |
| Member 4 | Editor queue/review/comparison UI; approval/return/deletion controls; Comment CRUD; BrowserIdentity-backed guest limiting | Private reads/workflow; coordinate BrowserIdentity with Member 3 |
| Member 5 | ViewStat buckets/CRUD and counts; analytics graph/markers; cached weather; idempotent large demo seed | Article publicationHistory, public page view hook; coordinate popularity with Member 3 |

BrowserIdentity and ReadReceipt designs must be integrated jointly with their owners before viewed filtering or guest limiting. Dependent hard-delete cleanup is implemented with those feature models, not placeholder infrastructure in this core. No transactions or replica sets. The explicit custom CSRF-token infrastructure and login throttling remain deferred; HttpOnly/SameSite=Lax cookies plus server auth/roles/ownership remain the current policy. Review origin/CSRF hardening before any broader deployment rather than claiming cookie flags alone solve every CSRF risk.

## Shared UI extension points

- Reuse `views/partials/header.ejs` and `footer.ejs` around one `<main id="main-content">`. Header includes `navigation.ejs`, `base.css`, the small existing `style.css` and shared `main.js`. Include a feature's own deferred browser script only on its page; do not copy login/logout code.
- For a page needing session-aware HTML, put existing `loadSession` before its controller, then `requireAuth`/`requireRole` where access is restricted. API routes already load sessions in `app.js`; do not load them twice. EJS receives safe `currentUser` through `res.locals`; it can be null. Unknown/early-error pages fall back to guest markup and refresh their navigation through the session API.
- Navigation currently contains Home, Login or username/role + Logout. Its marked extension point is where owners may add links once their real page routes exist. Client role visibility never replaces server authorization.
- Keep shared shell changes in `base.css` and feature styles/scripts in their own files. `main.js` owns session refresh and Logout; `login.js` owns only Login. After login/logout the fixed destination is `/` until workspace pages are agreed.
- The four feature workstreams can start from this shell and the stable APIs. Public viewed state/comment identity and popularity/view counting still require the coordination already listed above; readiness does not mean those cross-feature dependencies have disappeared.

## Manual Git workflow

The user performs all Git operations for this implementation. Suggested later branches: `feature/reporter-workspace`, `feature/public-feed`, `feature/editor-comments`, `feature/analytics-weather`, with smaller task branches if helpful. Agree shared-file ownership before parallel edits. Each student should author small meaningful commits and explain their changes in PRs; peers should review and rehearse explaining code outside their own feature.

For each PR: document endpoint/data changes, run syntax and relevant tests, show status/diff manually, confirm no secrets or unrelated changes, and explain student-facing concepts. Merge only with explicit project approval. Recommended Lead Core commit boundaries: Article workflow, public query/index contract, automated integration checks, docs/onboarding. Existing runtime/auth work can remain its own earlier logical group; do not rewrite it merely to reorganize commits.

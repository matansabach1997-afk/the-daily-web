# Manual API / defense rehearsal

Use a disposable development database, not shared production data. Bootstrap one Editor and two Reporters with the account script. Use separate Postman cookie jars/environments or separate browser profiles; never export real passwords or cookie tokens into a shared collection. Set `baseUrl` locally and record the created IDs.

## End-to-end flow (24 steps)

Use JSON request bodies and the exact account-provisioning instructions in README. In the paths below, replace `:id` with the ID from step 4. Use the Content object from `api-contract.md` for saves.

1. Provision Reporter A and an Editor with `npm run user:create`; then run `npm start`.
2. POST `/api/auth/login` with A's `{username,password}`. Let Postman retain its cookie.
3. GET `/api/auth/session`: 200 with A's safe User DTO, no passwordHash.
4. POST `/api/articles` with `{ "workingContent": {} }`: 201 draft. Store the returned `_id`. Submitting this empty draft would return 422.
5. PATCH `/api/articles/:id/working-content` with `{workingContent:Content}`: 200. All five keys are required in a save; their strings may still be empty while drafting. Use complete content for the next step.
6. POST `/api/articles/:id/submissions` with `{}`: 200 pending.
7. Login as Editor using POST `/api/auth/login` (same jar now holds the Editor's session).
8. GET `/api/workspace/articles?status=pending`, then `/api/workspace/articles/:id`: inspect workingContent.
9. POST `/api/articles/:id/returns` with `{ "editorNote": "Please clarify the summary" }`: returned.
10. Login as A again; private detail shows the note and returned state.
11. PATCH the complete workingContent with the correction; POST `/:id/submissions` under `/api/articles`: pending again.
12. Login as Editor again and inspect the submitted private content.
13. POST `/api/articles/:id/approvals` with `{}`: published. Record publishedAt and publicationHistory; both first timestamps are identical.
14. GET `/api/articles/:id` without a cookie: approved body/title only. GET `/api/articles` shows a card without body or private metadata.
15. As A or Editor, POST `/api/articles/:id/revisions` with `{}`: draft. Verify the working snapshot is copied from publishedContent.
16. PATCH `/api/articles/:id/working-content` with all five fields, including a changed title.
17. GET `/api/articles/:id`: title remains the old approved title. Private detail shows the changed working title.
18. Login as A, POST submissions; login as Editor, POST approvals. Public content now reflects the approved update.
19. Inspect private detail: publishedAt must equal the original timestamp recorded in step 13.
20. Verify publicationHistory now has both approval timestamps, oldest first.
21. Stop only the Node application with Ctrl+C; leave MongoDB running and retain the Editor cookie.
22. Restart Node with `npm start` against the same development database.
23. Reuse the existing Postman cookie without calling login.
24. GET `/api/auth/session` and `/api/workspace/articles/:id`: authenticated Editor still works.

## Additional checks

- User CRUD: as Editor, POST `/api/users`, GET `/api/users?q=prefix`, GET/PATCH the returned ID, DELETE the article-free Reporter. Duplicate username: 409. Reporters cannot list/create/delete users. Self-update requires currentPassword.
- Ownership: provision Reporter B; another Reporter's private read/save/submit/revision returns 404. Guest writes: 401. Reporter approve/return/delete: 403. Tampered reporter/status/publishedContent fields in saves: 400 with no mutation.
- Invalid transitions (approve twice, return draft, submit published without Start Revision): 409. Malformed ID/cursor: 400; missing/unpublished detail: 404. A subsequent `/health` request still succeeds.
- Logout with DELETE `/api/auth/session`; its old cookie no longer authenticates. Changing a password invalidates that user's other sessions too.
- Editor hard-deletes the test article: 204; public/private reads become 404. Repeat valid-ID deletion: 204. Delete a Reporter owning articles: 409, not cascading Article deletion.
- Automated public fixtures demonstrate 45 records in pages of 20/20/5 with same-date ordering. Do not edit cursor contents; reset when changing workspace filters.

No full article EJS/SEO, autosave client, feed UI, weather, comments, viewed state or analytics are demonstrated by this core rehearsal. Those remain team-owned acceptance scenarios after integration. Full course defense also needs the team seed, responsive pages and meaningful individual Git contributions; no Git action is automated by these scripts.

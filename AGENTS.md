# The Daily Web - Project Instructions

The Daily Web is a university Node.js/Express/MongoDB project. These instructions apply throughout the repository.

## Repository workflow

- Inspect the existing repository, relevant files, and Git status before creating or modifying files.
- Never create duplicate models, routes, controllers, middleware, or utilities. Find and reuse or extend the existing implementation.
- Preserve the existing MVC architecture and folder responsibilities.
- Use only course-approved technologies: HTML, CSS, Vanilla JavaScript, Node.js, Express, MongoDB/Mongoose, and EJS.
- Do not introduce new npm dependencies unless the user explicitly approves them.
- Keep changes limited to the requested feature. Do not modify unrelated files or overwrite existing unrelated changes.
- Prefer small, reviewable changes.
- Do not commit, push, merge, or change branches unless the user explicitly requests that action.
- Before any authorized commit, show Git status and the relevant Git diff, including new files.
- After implementation, run relevant checks and report what was tested, the results, and any checks that could not be completed. Keep verification proportionate to the change.
- Keep code understandable to students who may be asked to explain any line during the project defense. Prefer clear names and straightforward implementations.

## Article and user architecture

- `workingContent` is the editable/review version of an article.
- `publishedContent` is the last editor-approved public version of an article.
- A previous `publishedContent` remains public while a new `workingContent` is in `draft`, `pending`, or `returned` status. Do not use the current workflow status alone to determine public visibility.
- Workflow transition logic belongs outside the Mongoose schema, in controllers or services.
- Guest users are not stored as `User` documents.

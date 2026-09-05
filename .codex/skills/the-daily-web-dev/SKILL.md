---
name: the-daily-web-dev
description: Implement requested features in The Daily Web university project using its existing MVC patterns, focused checks, and student-friendly explanations. Use for feature development in this repository; explanation-only requests do not authorize changes.
---

# The Daily Web Development

Follow this workflow for the requested feature:

1. Read and follow the repository-root [AGENTS.md](../../../AGENTS.md) and any applicable instructions in the affected directories. AGENTS.md is the source of truth for project rules and architecture constraints.
2. Inspect Git status and the existing code relevant to the feature, including its callers and available checks. Identify reusable implementations before adding files.
3. Briefly identify the files to change, their MVC responsibilities, and how the feature fits the existing request/data flow.
4. Implement only the requested feature, preserving existing project patterns and unrelated work. Keep changes small and understandable for a student defending the code.
5. Run appropriate checks using existing tooling. Select checks relevant to the change, such as syntax/model loading, validation, or the existing smoke test; report any checks that could not run.
6. Inspect Git diff and Git status after implementation, including the contents of new files. Confirm that the changes stay within the requested scope.
7. Summarize the files changed, why they changed, checks performed and their results, and the important concepts the student should understand. Explain concepts in small, plain-language steps.
8. Stop before committing or pushing unless the user explicitly requested that action. Follow AGENTS.md for any authorized Git operation.

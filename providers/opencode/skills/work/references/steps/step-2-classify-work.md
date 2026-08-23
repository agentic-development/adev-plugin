## Step 2: Classify Work

If the user provided a description (as an argument, or in response to the state scan prompt, or as their initial message), classify it into exactly one work type.

### Work Type Classification Table

This table covers the full skill surface — route any intent to exactly one target. Grouped by lifecycle area; the first several rows are the common path.

| Intent | Signal Keywords / Patterns | Target Skill |
|--------|---------------------------|-------------|
| New feature / capability | "new feature", "add capability", "build X", "I want to create" | `/adev:brainstorm` |
| New spec (charter exists) | "write a spec", "specify", "define behavior for" | `/adev:specify` |
| Update / refactor a spec | "update the spec", "revise", "refactor", "clean up", "tech debt" | `/adev:specify --module <m>` / `--refactor` |
| Review specs | "review specs", "architecture review", "are the specs ready" | `/adev:review-specs` |
| Plan work | "plan", "break into tasks", "create tasks" | `/adev:plan` |
| Ship a spec end-to-end | "build it", "end to end", "run the pipeline", "review through validate" | `/adev:build` |
| Implement a plan | "implement", "start coding", "build the plan" | `/adev:implement` |
| Write tests first | "write tests", "TDD", "failing test for" | `/adev:write-test` |
| Bug / broken behavior | "bug", "broken", "failing test", "error", "not working" | `/adev:debug` |
| Drain P2/P3 bugs unattended | "drain the bug backlog", "bugfix loop", "run the loop unattended" | `/adev:bugfix-loop` |
| Validate an implementation | "validate", "check it works", "verify the feature" | `/adev:validate` |
| Score / grade quality | "eval", "score", "grade", "how good is" | `/adev:eval` |
| Project status | "status", "where do things stand", "progress", "what's done" | `/adev:status` |
| Context health / drift | "audit", "staleness", "drift", "hygiene", "context health" | `/adev:hygiene` |
| Fix lifecycle mismatches | "reconcile", "orphaned", "stale epics", "untraced code" | `/adev:reconcile` |
| Dead / stale code | "dead code", "unused exports", "orphan files" | `/adev:codehealth` |
| Manage work items | "create an issue", "file a bug", "issue board", "what needs doing" | `/adev:issues` |
| Research a topic | "research", "investigate", "compare", "best practices for" | `/adev:research` |
| Generate docs | "generate docs", "document the codebase", "architecture docs" | `/adev:document` |
| Deploy / release | "deploy", "publish", "push to production", "release" | `/adev:deploy` |
| Retrospective | "retro", "what went well", "delivery metrics", "review the sprint" | `/adev:retro` |
| Curate golden samples | "find good examples", "reference code", "golden samples" | `/adev:sample` |
| Capture a lesson | "remember this", "save this lesson", "heuristic" | `/adev:learn` |
| Set up / repair adev | "set up adev", "initialize", "diagnose context-index" | `/adev:init` |
| Sync agent files | "sync agent files", "constitution changed", "update CLAUDE.md" | `/adev:sync` |
| Sketch UI / API | "prototype", "mockup", "sketch the screen" | `/adev:prototype` |
| Map the repo | "map the codebase", "symbol index", "repomap" | `/adev:repomap` |

### Classification rules

- Use both keyword matching and semantic understanding of the user's intent.
- Match against the table above. If multiple types match, prefer the most specific one (e.g., "fix the failing spec review test" matches both `bug-fix` and `review` — choose `bug-fix` because the user describes a broken test, not a review request).
- Context from the state scan can refine classification (see Step 3).

### If no description is provided

Ask a single classifying question:

> What are you working on? For example:
> - A new feature or idea
> - A bug or failing test
> - Implementing an existing plan
> - Reviewing or planning specs
> - Something else

Wait for the user's response, then classify.

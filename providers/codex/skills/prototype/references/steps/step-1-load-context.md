### Step 1: Load Context and Heuristics

1. Read the charter at `.context-index/specs/features/<module>/charter.md`.
2. Read `.context-index/constitution.md` for constraint validation.
3. Read `.context-index/platform-context.yaml` for framework defaults (if it exists).
4. Load module heuristics via the CLI:

```bash
adev heuristics retrieve --module <module> --format text
```

Stdout is either rendered markdown blocks (one per heuristic, separated by blank lines) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic loading stays non-blocking.

If heuristics are found (output is not `__NONE__`), present them to the user:

> **Previous design learnings for this module:**
>
> (heuristic summaries)

If `retrieveHeuristics()` fails or returns empty, proceed silently. Do not block the session.


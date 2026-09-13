### Step 7: Extract Heuristic

After the recovery record is written in Step 6, extract a transferable heuristic from the root-cause diagnosis via `lib/heuristics.mjs`. This step is non-blocking — extraction failures log a warning and allow `/adev:recover` to exit normally.

#### Category Templates

Map the confirmed diagnosis category to the heuristic's `pattern` and `antiPattern` fields using the table below.

- **MISSING_CONTEXT** — `pattern`: the context that should be included in future packets for similar tasks. `antiPattern`: the assumption that failed. Distill, do not quote verbatim.
- **AMBIGUOUS_SPEC** — `pattern`: the language clarification needed. `antiPattern`: paraphrased version of the ambiguous spec phrase — NEVER quote verbatim (avoids capturing credentials or env-specific strings).
- **CONSTRAINT_CONFLICT** — `pattern`: the constraint ordering or precedence rule. `antiPattern`: the conflict that triggered the failure.
- **NOVEL_PROBLEM** — `pattern`: the new pattern or tool introduced. `antiPattern`: empty (leave unset).
- **TOOL_FAILURE** — `pattern`: the pre-flight check or setup that prevents the failure. `antiPattern`: the tool state that caused the crash.
- **BUDGET_EXHAUSTION** — `pattern`: the task-splitting rule that should have been applied. `antiPattern`: the task-size signal that was missed.

> **Warning:** Distill, do not quote verbatim. Raw source-document content (especially from AMBIGUOUS_SPEC) may contain credentials, API keys, or environment-specific strings that must not land in git-tracked heuristic files.

#### Scope Derivation Rule

Derive the heuristic `scope` from the active plan path:

1. Read the active plan path from `.context-index/hygiene/.active-plan` or the recover invocation's `--task` argument.
2. Split the path on `/` and find the segment immediately after `features/`.
3. Apply `path.basename()` to strip any traversal sequences.
4. Check the result against `manifest.yaml` `modules[].slug`.
5. If the normalized segment matches a known module slug, use it as `scope`.
6. Otherwise, fall back to `_global`.

Worked example: `.context-index/specs/features/hooks/*.plan.md` → `hooks` (matches a module slug). `.context-index/specs/features/unknown/*.plan.md` → `_global` (fallback).

#### Title Derivation Rule

Compose the heuristic `title` as `"<category-label>: <short-summary>"` where:

- `<category-label>` is one of: `"Missing context"`, `"Ambiguous spec"`, `"Constraint conflict"`, `"Novel problem"`, `"Tool failure"`, `"Budget exhaustion"`.
- `<short-summary>` is a distilled 5-10 word summary of the root cause (generalized, not verbatim).
- Total title length must not exceed 120 characters (matches the heuristic schema cap).

#### Key Derivation (via the shared verb)

Both keys come from the shared signature verb — never derive them by hand, and never restate the hashing or normalization rule here. The verb is the single implementation.

- `signature`: run `adev heuristics signature --origin recover --text "<root-cause>"` → the verb prints `recover-<digest>`. Use that line verbatim.
- `id`: run `adev heuristics signature --origin recover --text "<root-cause>" --digest-only` → the verb prints `<digest>`, then compose `<category-slug>-<digest>` where `<category-slug>` is the lowercased diagnosis category with underscores replaced by hyphens — one of `missing-context`, `ambiguous-spec`, `constraint-conflict`, `novel-problem`, `tool-failure`, `budget-exhaustion`.

The resulting id must match `/^[_a-z0-9][_a-z0-9-]{0,63}$/`.

Purpose: recurrence detection — the same root cause yields the same digest across `/adev:recover` invocations, so the id repeats and triggers the helper's auto-promotion path, while the `recover-<digest>` signature lets the same failure be correlated across origins.

Worked example: `MISSING_CONTEXT` + "Error: cache miss on third-party API" → `adev heuristics signature --origin recover --text "Error: cache miss on third-party API" --digest-only` prints `a1b2c3d4` → id `missing-context-a1b2c3d4`; the same invocation without `--digest-only` prints `recover-a1b2c3d4`, the signature.

**Fail-closed rule.** If the signature verb is unavailable or exits non-zero, skip heuristic extraction entirely, log the line below, and continue the recovery workflow (Step 7 is still non-blocking):

```
heuristics: extraction skipped — signature verb unavailable
```

Without the verb there is neither a signature nor an id, so there is no partially-degraded entry to write. This is the one degradation in Step 7 that is fail-closed rather than partial — contrast the write verb below, which degrades to a warning and still exits 0.

#### projectRoot Resolution

- Walk up from `process.cwd()` to find the nearest `.context-index/` directory — that is the project root.
- Fallback to `process.env.CLAUDE_PROJECT_ROOT` if the walk-up finds nothing.
- This matches the convention used by `lib/execution-state.mjs`.

#### Contradiction Scan (before write)

Before writing the new heuristic, scan for semantic contradictions with existing heuristics:

1. Read existing heuristics for the target scope: call `readHeuristics(projectRoot, { module: scope })` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`, where `<ADEV_ROOT>` is the resolved plugin root).
2. For each existing entry, compare semantically: does the new heuristic's `pattern` directly conflict with an existing entry's `antiPattern`, or does the new heuristic's `antiPattern` conflict with an existing entry's `pattern`?
3. If a semantic contradiction is detected, call `addContradiction(projectRoot, existingId, { path: '<recovery-record-path>', date: '<today>', source: 'recovery' })` before writing the new heuristic. Wrap in try/catch — if `addContradiction` throws (e.g., `HEURISTICS_NOT_FOUND` because the entry was archived between read and write), log a warning and proceed.
4. If no contradiction is detected, proceed directly to writeHeuristic.

This is a best-effort semantic comparison performed by you (the agent), not a programmatic string match. When in doubt, do not record a contradiction — `/adev:retro` consolidation is the backstop for missed contradictions.

#### Inline Node Invocation

Run the extraction via an inline Node invocation that imports `writeHeuristic` from the adev plugin's `lib/heuristics.mjs`, builds the entry using the derivation rules above, and wraps the call in `try`/`catch` so any failure degrades to a stderr warning without blocking the recovery workflow. The `evidence[]` array must contain exactly one entry: `{ source: "recovery", path: "<recovery-record-path>", date: "<today>" }`.

**Plugin root resolution:** The `lib/` directory lives at the adev plugin root, NOT the project root. Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. Replace `<ADEV_ROOT>` below with the resolved absolute path.

On success, print a single confirmation line using the helper's return value (which reflects any auto-promotion):

```
Heuristic extracted: <id> (scope: <scope>, confidence: low)
```

On failure inside `writeHeuristic`, log to stderr and exit code 0 (non-blocking):

```
heuristics: extraction skipped — <error-message>
```

If the helper import itself fails (e.g., `lib/heuristics.mjs` is absent), log once and skip:

```
heuristics: helper unavailable, extraction skipped
```

Concrete invocation via the CLI:

```bash
adev heuristics write \
    --id missing-context-a1b2c3d4 \
    --signature recover-a1b2c3d4 \
    --scope hooks \
    --title "Missing context: cache layer assumptions" \
    --pattern "Include cache invalidation docs in context packets for hook tasks" \
    --anti-pattern "Assuming cache behavior without reading the cache module" \
    --confidence low \
    --evidence-source recovery \
    --evidence-path .context-index/hygiene/recoveries/2026-04-09-cache-task.md \
    --evidence-date 2026-04-09
```

The verb wraps `writeHeuristic`, emits a single line on stdout:

```
Heuristic written: <id> (scope: <scope>, confidence: <confidence>)
```

and exits 0. On schema failure, the verb writes `heuristics: extraction skipped — <error>` to stderr and still exits 0 — lesson capture is best-effort. The confidence value in the success line comes from the helper return value (which may apply auto-promotion), not the `--confidence` flag input.

Step 7's last printed output on success must therefore be exactly the verb's stdout line.

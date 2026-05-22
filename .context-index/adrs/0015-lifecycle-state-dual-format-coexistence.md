# ADR 0015: Lifecycle-State Directory Hosts Two Coexisting Formats

## Status

**Proposed**

> **Proposed 2026-05-22**: Documents that `.context-index/lifecycle-state/` intentionally hosts two distinct file formats — `<slug>.jsonl` event logs (tracked) and `<slug>.json` build orchestrator snapshots (gitignored) — written by separate libraries for separate concerns.

## Date

2026-05-22

## Context

The `.context-index/lifecycle-state/` directory was created by the `agent-reliable-state-artifacts` charter (charter rev 3) as the home for the per-spec lifecycle event log specified in `lifecycle-event-log.spec.md`. Each spec gets a `<slug>.jsonl` file containing one JSON event per line, written append-only via `lib/lifecycle-state.mjs`. Events capture every reviewer report, validator verdict, plan-task transition, debug intervention, and partial recovery for the spec. State is reconstructed at read time by `currentState()` folding the log into a projection.

Separately, the `/adev:build` end-to-end orchestrator (specified in `adev-build-skill.spec.md`) tracks its own pipeline progress for resume-after-interruption: which lifecycle step ran, what verdict it returned, when. This state is written by `lib/build-state.mjs` to a per-spec `<slug>.json` file — a single-snapshot JSON object, not an append-only log. Before the `agent-reliable-state-artifacts` charter renamed the host directory, these files lived in `.context-index/build-state/<slug>.json`. The one-shot migration (`lib/migrate-state-artifacts.mjs`) converted legacy `build-state/*.json` artifacts into the new `lifecycle-state/*.jsonl` event-log format AND renamed the directory `build-state/` → `lifecycle-state/`, but did not rename or merge the `/adev:build` snapshot files. Those continued to be written to the same path, just under the new directory name. Their format (`.json`, single-snapshot) was preserved because they serve a different concern — orchestrator resume state, not lifecycle history.

The result, on any project that has run `/adev:build` at least once, is a directory containing both:

- `<slug>.jsonl` — one per spec with any lifecycle activity (review, validate, implement, etc.), tracked in git
- `<slug>.json` — one per spec that went through `/adev:build`, gitignored (`.gitignore:27`)

On the project where this ADR was authored (2026-05-22 snapshot): 130 `.jsonl` files alongside 5 `.json` files. The mismatch is correct — only 5 specs have been built via the orchestrator; the rest were built piecemeal (manual `/adev:specify` → `/adev:plan` → `/adev:implement`).

The coexistence is currently documented **only** in the JSDoc header of `lib/build-state.mjs`:

```
// `.context-index/lifecycle-state/<slug>.json`. Coexists with the JSONL
// event log written by `lib/lifecycle-state.mjs` in the same directory
// (distinct filename suffixes: `.json` here, `.jsonl` there).
```

There is no architectural record explaining the design. New contributors and agents (including this ADR's author during a `/adev:debug` session) read the directory contents and reasonably assume the two formats are a migration mid-state or an unresolved bug. This ADR exists to close that documentation gap.

## Decision

**We will document the coexistence as intentional, retain both formats at their current paths, and require future state-related artifacts in this directory to declare their format and ownership in this ADR.**

The two formats serve two distinct concerns and remain separate:

| File | Writer | Format | Tracked | Owner Spec |
|---|---|---|---|---|
| `<slug>.jsonl` | `lib/lifecycle-state.mjs` | append-only JSON Lines | ✅ yes | `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` |
| `<slug>.json` | `lib/build-state.mjs` | single JSON snapshot | ❌ gitignored | `strategic-planning/adev-build-skill.spec.md` |

### Alternatives Considered

#### Option A: Merge build-state into the event log

Fold the `/adev:build` resume state into the JSONL event log. Replace `build-state.mjs` snapshot reads with a projection over the existing event stream (e.g., synthesize "last completed orchestrator step" by scanning `lifecycle_step` events).

- **Pros:** One format, one directory, no coexistence question. Eliminates the gitignored ephemeral state — resume becomes deterministic from the tracked event log.
- **Cons:** Requires `/adev:build` to re-derive orchestrator state on every resume by replaying the whole log, including events from non-build invocations (manual `/adev:plan`, etc.). The orchestrator's view of "what step ran via me" diverges from "what step ran on this spec at all" — those are different questions, and the event log can't distinguish them without a new event variant. Adding a `dispatch_mode` field to every step event to flag orchestrator-vs-manual would expand the event schema for one orchestrator's bookkeeping. Net: more complexity for a single consumer.
- **Rejected because:** The orchestrator's resume state is an internal implementation detail of `/adev:build`, not project-wide lifecycle truth. Forcing it through the shared event log overloads that contract.

#### Option B: Move build-state out of `lifecycle-state/`

Relocate `<slug>.json` files to a separate directory (e.g., `.context-index/build-state/` — un-rename what the migration renamed; or `.context-index/.build-cache/` to signal ephemerality).

- **Pros:** Removes visual ambiguity in the directory listing. Names match concerns: `lifecycle-state/` for tracked event logs, `build-state/` (or `.build-cache/`) for orchestrator resume state.
- **Cons:** Breaks the migration's directory consolidation (the rename to `lifecycle-state/` was the deliberate output of `lib/migrate-state-artifacts.mjs`). Requires a new migration pass to relocate existing snapshots on initialized projects, plus updates to `lib/build-state.mjs:BUILD_STATE_DIR`, `LEGACY_BUILD_STATE_DIR`, and the resume-mode skill prose that references the current path. Cost is moderate.
- **Rejected because:** The directory naming question is cosmetic. The coexistence is fine once it is documented. A move would invalidate every project that has already migrated, for a benefit (visual clarity) that this ADR delivers without code changes.

#### Option C: Rename the snapshot files for clearer differentiation

Keep both in `lifecycle-state/` but rename build-state files from `<slug>.json` to `<slug>.build.json` (or `<slug>.orchestrator.json`).

- **Pros:** At-a-glance distinction in directory listings. No directory move. Pattern-matches the dual-format precedent established by `lib/build-state.mjs:resolveStatePath()`.
- **Cons:** Code change in `resolveStatePath`, plus a migration pass to rename existing files on initialized projects. Breaks `/adev:build` resume on projects that have not run the new migration. Same cost-benefit ratio as Option B, just smaller scope.
- **Rejected because:** Same reason as B — the issue is documentation, not naming. An ADR is sufficient; a rename is over-engineering.

### Why This Decision

The two formats are appropriate for their respective concerns:

- **JSONL for the event log.** Append-only writes via `fs.appendFile` give crash-safety and concurrent-writer support without locks. Schema evolution is open — unknown event variants pass through. The fold-on-read projection (`currentState()`) lets callers query different views without storage changes.
- **Single-snapshot JSON for orchestrator state.** `/adev:build` needs a small, deterministic, read-modify-write structure: "I am at step N, last verdict was X." JSONL would force a fold on every resume, and the data has only one writer (the orchestrator itself, single-threaded per spec). The simpler format is the correct format for the concern.

Co-locating them in `lifecycle-state/` is a historical artifact of the rename, but it is also reasonable: both formats describe the lifecycle of one spec; locality keeps related state near each other. The `.gitignore` rule on `*.json` keeps the orchestrator state out of project history without affecting the event log.

The remaining concern is solely **discoverability**: a contributor reading the directory cannot tell which file format belongs to which concern. This ADR fixes that.

## Consequences

### Positive

- New contributors and agents have a single canonical reference for why both formats exist. The `/adev:debug` session that motivated this ADR will not need to be re-run by future readers.
- Future state-related artifacts proposed for `lifecycle-state/` must declare their format and ownership against the table in this ADR's Decision section, surfacing the design question at proposal time rather than discovery time.
- `/adev:hygiene` Pass 21 (Lifecycle Audit) can use this ADR as the authority for "files in `lifecycle-state/` are expected to be one of two formats" — flagging anything else as drift.

### Negative

- The directory listing still mixes two formats. Anyone scanning `lifecycle-state/` for the first time still has to consult this ADR to disambiguate. The cost is one extra layer of indirection, traded for the cost of code/data migration that the alternatives would entail.
- `*.json` files in `lifecycle-state/` are gitignored, so they are invisible in PR review. Operators relying on PR-only auditing won't see orchestrator state — they must inspect locally. This is intentional (build resume state is per-developer ephemeral) but worth flagging.

### Neutral

- The `lib/migrate-state-artifacts.mjs` migration's existing behavior (rename `build-state/` → `lifecycle-state/` AND convert old build-state JSON files to JSONL where they represent lifecycle events) is preserved. No re-migration is triggered by this ADR.
- The `LEGACY_BUILD_STATE_DIR = ".context-index/build-state"` constant in `lib/build-state.mjs` remains as a read-only fallback path for projects that have not yet run `adev migrate`. This ADR does not change its lifecycle.
- The 5-vs-130 ratio of `.json` to `.jsonl` files on a given project is expected to grow as `/adev:build` adoption grows. There is no upper bound or cleanup policy for `*.json` snapshots; they are bounded by the number of specs ever built through the orchestrator.

## Related

- **Owning specs:**
  - `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — JSONL event log
  - `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` — JSON orchestrator snapshot
- **Owning libraries:**
  - `lib/lifecycle-state.mjs` — JSONL writer/reader
  - `lib/build-state.mjs` — JSON snapshot writer/reader
  - `lib/migrate-state-artifacts.mjs` — one-shot migration that renamed the directory
- **Configuration:**
  - `.gitignore:27` — `.context-index/lifecycle-state/*.json` gitignored
- **Prior ADRs in this area:**
  - ADR-0009 (Lifecycle Artifact Taxonomy) — establishes the kind enumeration for specs and charters; orthogonal to file-format concerns but shares the lifecycle vocabulary.
  - ADR-0012 (Plan-Adjacent Sidecar Artifacts) — separate sidecar pattern (`.routing.json`) for plan files; demonstrates the project's tolerance for multiple formats in the same directory when concerns are distinct.

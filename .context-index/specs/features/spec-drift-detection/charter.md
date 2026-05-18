---
status: approved
revision: 3
updated: 2026-05-17
tracker-ref: issue-213
---

# Feature Charter: spec-drift-detection

## Business Intent

The spec-drift-detection module provides real-time awareness when implementation code diverges from its governing spec. By extending the existing PostToolUse:Edit hook to detect edits to source-manifest-tracked files, it closes the gap between "drift happened" and "drift discovered" — shifting detection from periodic hygiene audits to the moment of change. This enables the agent to make informed decisions about spec updates without blocking workflow.

## Scope and Boundaries

### In Scope

- Extend `sync-trigger.sh` to detect edits to files tracked by spec source manifests
- Companion `lib/spec-drift.mjs` module with scan-and-stamp logic (scan spec frontmatter, match file paths, stamp drift flag)
- Advisory warning message emitted via hook stdout when drift is detected
- `drift_detected: true` frontmatter field stamped on affected spec(s)
- Downstream skill integration: `/adev:plan` blocks on drift flag, `/adev:validate` warns, `/adev:implement` clears the flag after GREEN, `/adev:hygiene` reports drifted specs
- All downstream skill changes are skill-markdown edits only (autonomous per Architecture Boundaries) — no hook protocol changes, no new skills added to lifecycle order

### Relationship to spec-lifecycle Drift Detection

This module complements — not replaces — spec-lifecycle's existing `git-drift-detection` capability. The two detect different directions of drift:

- **spec-lifecycle (existing):** Detects *spec-side* drift — when a spec file is edited after review (revision drift, file drift). Guards `/adev:plan` against planning on stale reviews.
- **spec-drift-detection (this module):** Detects *code-side* drift — when implementation code is edited after the source manifest was stamped. Guards against code diverging from its governing spec.

When both signals are present on the same spec, both independently block `/adev:plan`. They are complementary checks, not redundant.

### Out of Scope

- File-system event watchers (inotify/fswatch) — this uses Claude Code's hook system, not OS-level events
- Automatic spec updates — the feature detects and flags drift, it does not auto-edit specs
- Reverse direction (spec edit → code update prompts) — future enhancement
- Source manifest index file — scan on demand is sufficient for now
- Blocking edits (PreToolUse gate) — advisory only

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| spec-lifecycle | internal module | Reads `source-manifest` from spec frontmatter; uses `lib/source-manifest.mjs` for verification |
| hooks | internal module | Extends existing `sync-trigger.sh` PostToolUse:Edit hook |
| validation | consumed by | `/adev:validate` reads `drift_detected` flag |
| planning | consumed by | `/adev:plan` reads `drift_detected` flag to block |
| implementation | consumed by | `/adev:implement` clears `drift_detected` after re-stamping manifest |
| maintenance | consumed by | `/adev:hygiene` reports specs with `drift_detected: true` |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Drift Event | A detected edit to a source-manifest-tracked file. Persisted as a `code_drift_detected` JSONL event in `.context-index/lifecycle-state/<slug>.jsonl` (rev 3). | `spec_path`, `drift_source` (canonical project-root-relative path), `drift_at` (ISO timestamp) |
| Source Manifest | Existing spec frontmatter block mapping spec to implementation files | `sha`, `files[]`, `computed-at` (already defined in spec-lifecycle) |
| Drift Flag | Single inline `drift_detected: true` boolean on the spec frontmatter (rev 3 — the derived rolled-up view; `drift_source`/`drift_at` live on the Drift Event JSONL). | `drift_detected` (boolean) |

### Relationships

- A Spec has one Source Manifest (existing)
- A Source Manifest tracks one or more files (existing)
- A Drift Event produces one Drift Flag on the owning Spec
- A Drift Flag is cleared when `/adev:implement` re-stamps the Source Manifest

### Invariants

- `drift_detected` can only be `true` if the spec has a `source-manifest` block
- `drift_source` must be a file listed in the spec's `source-manifest.files[]`
- Clearing the drift flag requires re-computing and re-stamping the source manifest SHA
- Every detection appends a `code_drift_detected` event to the spec's JSONL; the inline `drift_detected` boolean is the derived rolled-up view. Multiple sources are preserved as separate events, not overwritten. (Rev 3 — supersedes the prior overwrite-only invariant per `jsonl-drift-events.spec.md`.)

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Edit-Time Drift Scan | Scan spec frontmatter for source manifests matching the edited file path | must-have |  | validated |
| Drift Flag Stamping | Append `code_drift_detected` JSONL event + inline `drift_detected: true` boolean (rev 3 — `drift_source`/`drift_at` removed from frontmatter) | must-have |  | implementing |
| Advisory Warning Output | Emit a human-readable warning via hook stdout identifying the affected spec | must-have |  | validated |
| Drift Flag Clearing | `/adev:implement` appends `code_drift_cleared` JSONL event and removes inline `drift_detected` boolean | must-have |  | implementing |
| Plan Gate Integration | `/adev:plan` blocks when target spec has `drift_detected: true` | must-have |  | validated |
| Validate Integration | `/adev:validate` warns (non-blocking) when spec has `drift_detected: true` | should-have |  | validated |
| Hygiene Integration | `/adev:hygiene` reports all specs with `drift_detected: true` in its audit | should-have |  | validated |
| Multi-file Drift Tracking | Every drift detection appended to per-spec JSONL; inline boolean is the derived view. Multi-source history preserved. | must-have |  | implementing |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Source Manifest Index | On-demand scan is sufficient for now; add index if performance degrades |  | — |
| Reverse Sync (spec → code prompts) | Requires deeper integration; focus on code → spec direction first |  | — |
| Automatic Spec Updates | Advisory-only in v1; auto-edit adds risk of unwanted spec changes |  | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `scanForDrift(filePath, contextIndexRoot)` | function | Delegates to `buildReverseIndex()` from `lib/source-manifest.mjs` to find specs whose source manifests track `filePath`. Returns array of `{ specPath, specName }` matches |
| `stampDrift(specPath, driftSource)` | function | Canonicalizes `driftSource` (SEC-1 traversal-reject), appends a `code_drift_detected` JSONL event with `{drift_source, drift_at}`, and ensures `drift_detected: true` is present in spec frontmatter. (Rev 3 — `drift_source`/`drift_at` are no longer written to frontmatter.) |
| `clearDrift(specPath)` | function | Appends a `code_drift_cleared` JSONL event with `{drift_at}` and removes the inline `drift_detected` boolean from spec frontmatter. (Rev 3 — only `/adev:implement` is authorized to call this per ADR 0011.) |
| `hasDrift(specPath)` | function | Reads the inline `drift_detected: true` boolean from spec frontmatter (the derived rolled-up view), returns boolean. |

All exported from `lib/spec-drift.mjs`.

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `CLAUDE_TOOL_INPUT_file_path` | Claude Code hook env | File path of the edited file, read by sync-trigger.sh |
| `buildReverseIndex(specsDir, projectRoot)` | lib/source-manifest.mjs | Builds file-to-spec mapping from source manifest frontmatter |
| `verifyManifest(manifest)` | lib/source-manifest.mjs | Recomputes SHA for skill-level fallback drift detection on non-Claude-Code hosts |
| Source manifest frontmatter | spec-lifecycle | YAML `source-manifest.files[]` block in spec files |
| Hook JSON stdout protocol | hooks module | Exit 0 + JSON stdout for advisory messages |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Frontmatter scan completes in < 2 seconds for up to 100 specs. Hook must not noticeably delay the Edit tool response. |
| Host Portability | Real-time drift detection requires Claude Code hooks. On other hosts, drift is detected at skill invocation time (`/adev:plan`, `/adev:validate`) via existing `verifyManifest()` checks. The drift flag is an acceleration, not a requirement. |
| Idempotency | Multiple edits to the same tracked file re-stamp `drift_at` but do not corrupt the spec. Stamping is safe to re-run. |
| Zero Dependencies | `lib/spec-drift.mjs` uses only Node.js built-ins (`fs`, `path`). No external packages. |
| Backward Compatibility | Specs without `source-manifest` blocks are silently skipped. Specs with `drift_detected: true` are readable by older skill versions (unknown frontmatter fields are ignored by YAML parsers). |

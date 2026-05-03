---
status: approved
revision: 2
updated: 2026-05-02
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
| Drift Event | A detected edit to a source-manifest-tracked file | `spec_path`, `drift_source` (edited file), `drift_at` (timestamp) |
| Source Manifest | Existing spec frontmatter block mapping spec to implementation files | `sha`, `files[]`, `computed-at` (already defined in spec-lifecycle) |
| Drift Flag | Frontmatter fields stamped on a spec when drift is detected | `drift_detected` (boolean), `drift_source` (string), `drift_at` (ISO timestamp) |

### Relationships

- A Spec has one Source Manifest (existing)
- A Source Manifest tracks one or more files (existing)
- A Drift Event produces one Drift Flag on the owning Spec
- A Drift Flag is cleared when `/adev:implement` re-stamps the Source Manifest

### Invariants

- `drift_detected` can only be `true` if the spec has a `source-manifest` block
- `drift_source` must be a file listed in the spec's `source-manifest.files[]`
- Clearing the drift flag requires re-computing and re-stamping the source manifest SHA
- Multiple edits to different tracked files overwrite `drift_source` with the most recent — the flag is binary (drifted or not), not a list

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Edit-Time Drift Scan | Scan spec frontmatter for source manifests matching the edited file path | must-have | v1 | validated |
| Drift Flag Stamping | Write `drift_detected`, `drift_source`, `drift_at` to the spec's frontmatter | must-have | v1 | validated |
| Advisory Warning Output | Emit a human-readable warning via hook stdout identifying the affected spec | must-have | v1 | validated |
| Drift Flag Clearing | `/adev:implement` clears drift fields after re-stamping source manifest | must-have | v1 | validated |
| Plan Gate Integration | `/adev:plan` blocks when target spec has `drift_detected: true` | must-have | v1 | validated |
| Validate Integration | `/adev:validate` warns (non-blocking) when spec has `drift_detected: true` | should-have | v1 | validated |
| Hygiene Integration | `/adev:hygiene` reports all specs with `drift_detected: true` in its audit | should-have | v1 | validated |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Source Manifest Index | On-demand scan is sufficient for now; add index if performance degrades | v2 | — |
| Reverse Sync (spec → code prompts) | Requires deeper integration; focus on code → spec direction first | v2 | — |
| Automatic Spec Updates | Advisory-only in v1; auto-edit adds risk of unwanted spec changes | v2 | — |
| Multi-file Drift Tracking | Track list of all drifted files instead of most-recent-only | v2 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `scanForDrift(filePath, contextIndexRoot)` | function | Delegates to `buildReverseIndex()` from `lib/source-manifest.mjs` to find specs whose source manifests track `filePath`. Returns array of `{ specPath, specName }` matches |
| `stampDrift(specPath, driftSource)` | function | Writes `drift_detected: true`, `drift_source`, `drift_at` to spec frontmatter |
| `clearDrift(specPath)` | function | Removes `drift_detected`, `drift_source`, `drift_at` from spec frontmatter |
| `hasDrift(specPath)` | function | Reads spec frontmatter, returns boolean |

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

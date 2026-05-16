# Implementation Plan: `adev diagnose` CLI Verb

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli-driver-surface/charter.md (rev 3)
> **Spec:** .context-index/specs/features/cli-driver-surface/adev-diagnose-cli.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-14)
> **Platform:** Node.js (ESM, .mjs), node:test, zero external deps

**Goal:** Implement `adev diagnose` as a `lib/cli/diagnose.mjs` helper following the driver-substrate contract. Consumes the diagnostic-registry engine and exposes filtered runs (`--spec`, `--tier`, `--only`, `--json`, `--quiet`, `--strict-warnings`) with stable JSON output, hook-protocol exit codes, and a sub-1-second project-wide budget.

**Architecture:** Single helper module `lib/cli/diagnose.mjs` exporting `run({ projectRoot, argv, manifest })` + `help()` (no `LIFECYCLE_STEP` — diagnose is a query primitive, not a lifecycle step). `run` parses argv via `node:util::parseArgs`, calls `runDiagnostics` from `lib/diagnostics/index.mjs`, formats the result via one of two internal formatters (human-readable with ANSI severity coloring on stdout-stdout; stable JSON `{ schema_version, fired, skipped, errors, summary }` for `--json` mode), and exits 0 / 1 / 2 per the spec's matrix. Verb is registered in `cli/index.mjs::VERB_REGISTRY`. Help text reads from `governance/diagnostics.yaml` to list registered diagnostic IDs.

---

## File Structure

**Create:**
- `lib/cli/diagnose.mjs` — `run({...})`, `help()`, internal `formatHuman` + `formatJson` formatters.
- `tests/cli/diagnose.test.mjs` — covers all behaviors, error cases, exit codes; JSON schema locked via golden snapshot.
- `tests/cli/fixtures/diagnose/*` — minimal fixture specs + a fixture `governance/diagnostics.yaml` exercising each producer.

**Modify:**
- `cli/index.mjs::VERB_REGISTRY` — add `['diagnose', () => import('../lib/cli/diagnose.mjs')]` (one-line registration per driver-substrate pattern).

**Reference (read, do not modify):**
- `lib/diagnostics/index.mjs` (from the `diagnostic-registry` plan) — engine API; depend on `runDiagnostics({ projectRoot, spec, tier, only, scope })` returning `{ fired, skipped, errors }`.
- `lib/cli/gate.mjs` — existing exemplar helper; follow its `run({...})` + `help()` + path-containment shape.
- `cli/index.mjs:1267-1289` — verb registry pattern.
- `governance/diagnostics.yaml` (from the `diagnostic-registry` plan) — source of truth for `--help` ID listing.

---

## Context Packets

### Task 1 Context (run + parse argv)
- Spec: Behaviors 1–4, 8, 9
- Sample: `lib/cli/gate.mjs:37-103` (run skeleton + argv parsing + path containment)
- Engine API: `runDiagnostics({...})` return shape

### Task 2 Context (human formatter)
- Spec: Behaviors 1, 11 (registry-level errors at top) + Behavior 9 (`--quiet`)
- Constitution P1: ANSI escape sequences inline (no chalk / kleur)

### Task 3 Context (JSON formatter)
- Spec: Behaviors 5, 6 — full stable schema
- AC: golden snapshot lock

### Task 4 Context (help)
- Spec: Behavior 10 — read `governance/diagnostics.yaml`, list IDs grouped by tier + severity
- Reuse `loadRegistry(projectRoot)` from the engine

### Task 5 Context (registry entry)
- File: `cli/index.mjs::VERB_REGISTRY` (line 1267)
- Sample: existing `['gate', ...]` entry on line 1288

### Task 6 Context (tests)
- Spec: full Acceptance Criteria + Error Cases table
- Sample: `tests/cli/gate.test.mjs` (closest pattern — spawnSync against CLI, temp-project fixtures)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (shared file `lib/cli/diagnose.mjs`).
- Group B (after A): Task 4 (help) — same file but isolated to one exported function.
- Group C (sequential): Task 5 (registry entry) — touches `cli/index.mjs`, doesn't conflict with Group A.
- Group D (after A, B, C): Task 6 (tests) — exercises the assembled binary.

A and C can run in parallel. B follows A. D waits on all.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | lib/cli/diagnose.mjs::run + argv parse | Medium | unit | — | 1 create, 0 modify |
| 2 | Human-readable formatter | Medium | unit | Task 1 | 0 create, 1 modify |
| 3 | JSON formatter + stable schema | Small | unit | Task 1 | 0 create, 1 modify |
| 4 | help() reading registry | Small | unit | Task 1 | 0 create, 1 modify |
| 5 | Register diagnose in verb registry | Small | unit | Task 1 | 0 create, 1 modify |
| 6 | Test coverage + golden JSON snapshot | Medium | unit | Tasks 1–5 | 1 create, +fixtures |

---

## Test Infrastructure Requirements

None. spawnSync against the in-tree CLI binary with temp-project fixtures (writable temp dir + minimal `governance/diagnostics.yaml`). Golden JSON snapshot lives in `tests/cli/fixtures/diagnose/expected.json`.

---

### Task 1: lib/cli/diagnose.mjs::run + argv parse [specialist: none]

**Charter capability:** `adev diagnose` CLI verb
**Strategy:** unit
**Files:**
- Create: `lib/cli/diagnose.mjs` exporting `run({ projectRoot, argv, manifest })` + `help()` (latter implemented in Task 4)

**Implementation outline:**
- Parse argv via `node:util::parseArgs` with options: `spec` (string), `tier` (string, comma-separated), `only` (string, comma-separated), `json` (boolean), `quiet` (boolean), `strict-warnings` (boolean), `help` (boolean).
- If `--help` set, dispatch to `help()` and exit 0.
- Validate `--spec` path containment (project-root containment via `path.resolve` + `startsWith`).
- Validate `--tier` values are in `{1, 2, 3}`; reject otherwise.
- Validate `--only` IDs against `loadRegistry(projectRoot)`; warn-and-continue for unknown IDs; fail if no valid IDs remain after filtering.
- Reject conflicting `--json` + `--quiet` combination (warn-on-stderr, ignore `--quiet`).
- Call `runDiagnostics({ projectRoot, spec, tier, only, scope: 'workspace' })`.
- Branch on `--json`: call `formatJson(result)` (Task 3) or `formatHuman(result, { quiet })` (Task 2).
- Compute exit code: 2 if any error-severity fired OR (warning fired AND `--strict-warnings`); else 0.

- [ ] **Write failing test** — `tests/cli/diagnose.test.mjs` with minimal "exits 0 on no firings" assertion against a temp project.
- [ ] **Implement skeleton** with parseArgs + dispatch.
- [ ] **Verify** the no-firings path works end-to-end.
- [ ] **Commit:** `feat(cli): diagnose.mjs (run + argv parsing)`

---

### Task 2: Human-readable formatter [specialist: none]

**Charter capability:** `adev diagnose` CLI verb — human surface
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `lib/cli/diagnose.mjs` — add `formatHuman(result, { quiet })`

**Implementation outline:**
- Group firings by `spec` (the `spec?` field on each verdict).
- Order severities consistently: error → warning → info within each spec.
- Color via inline ANSI escape: `\x1b[31m` (red) for error, `\x1b[33m` (yellow) for warning, `\x1b[36m` (cyan) for info, `\x1b[0m` reset. No color library.
- Suppress info-severity rows when `--quiet`.
- Print registry-level errors (from `result.errors`) at the TOP of output, prefixed `[registry-error]`.
- Print citations in `path:line` form when present.
- Final line: `"<N> finding(s) total, <M> error(s), <K> warning(s)"` or `"All checks passed."` if empty.

- [ ] Write tests covering ordering, color codes, registry-errors-at-top, quiet suppression.
- [ ] Implement.
- [ ] **Commit:** `feat(cli): diagnose human-readable formatter`

---

### Task 3: JSON formatter + stable schema [specialist: none]

**Charter capability:** `adev diagnose` CLI verb — JSON surface
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `lib/cli/diagnose.mjs` — add `formatJson(result)`

**Implementation outline:**
- Build `{ schema_version: "1", fired: [...], skipped: [...], errors: [...], summary: { total_fired, by_severity: { info, warning, error }, exit_code } }`.
- Sort `fired` entries by `severity` (error → warning → info), then by `id`, then by `spec` — stable ordering critical for golden snapshot.
- `JSON.stringify(result, null, 2)` for human-readable; no compact form needed.
- Document the schema in the file's header comment (per AC).
- Stable key order: use explicit object construction in the documented order (not iteration).

- [ ] Write golden snapshot test: feed a known fixture result, assert stdout matches `tests/cli/fixtures/diagnose/expected.json` byte-for-byte.
- [ ] Implement.
- [ ] **Commit:** `feat(cli): diagnose JSON formatter (schema_version=1)`

---

### Task 4: help() reading registry [specialist: none]

**Charter capability:** `adev diagnose` CLI verb — discoverability
**Strategy:** unit
**Depends on:** Task 1
**Files:**
- Modify: `lib/cli/diagnose.mjs` — implement `help()`

**Implementation outline:**
- Print usage line + each flag with one-line description.
- Print "Examples:" section with 3 invocations.
- Print "Registered diagnostics:" section: call `loadRegistry(projectRoot)`, group by tier (1, 2, 3), within tier sort by ID, print `<id> (<severity>) — <one-line description from yaml>`.
- If `loadRegistry` fails, print fallback `"(registry unavailable: <error>)"` and continue.

- [ ] Test that help output contains all 3 Tier-1 IDs.
- [ ] Implement.
- [ ] **Commit:** `feat(cli): diagnose help() lists registered IDs from registry`

---

### Task 5: Register diagnose in verb registry [specialist: none]

**Charter capability:** Verb dispatch
**Strategy:** unit
**Files:**
- Modify: `cli/index.mjs::VERB_REGISTRY` (line 1267)

**Implementation:** add `['diagnose', () => import('../lib/cli/diagnose.mjs')],` to the Map.

- [ ] Write test that `adev diagnose --help` exits 0 with non-empty output.
- [ ] Add registry line.
- [ ] **Commit:** `feat(cli): register diagnose verb`

---

### Task 6: Test coverage + golden JSON snapshot [specialist: none]

**Charter capability:** `adev diagnose` CLI verb — test discipline
**Strategy:** unit
**Depends on:** Tasks 1–5
**Files:**
- Create: `tests/cli/diagnose.test.mjs`
- Create: `tests/cli/fixtures/diagnose/expected.json`, fixture `governance/diagnostics.yaml`, fixture specs.

**Test scenarios:**
1. `adev diagnose` against clean tree → exit 0, `"All checks passed."` on stdout.
2. `adev diagnose --spec <good>` → exit 0.
3. `adev diagnose --spec <bad>` (where bad has illegal status) → exit 2, message names the producer.
4. `adev diagnose --spec ../../../etc/passwd` → exit 1, `"spec not found"`.
5. `adev diagnose --tier 1` → only Tier-1 IDs in output.
6. `adev diagnose --tier 1,2` → both tiers.
7. `adev diagnose --tier 4` → exit 1, usage error.
8. `adev diagnose --only adev/status-enum-legal` → only that producer runs.
9. `adev diagnose --only adev/nonexistent` → warning on stderr, exit 1 if no valid IDs remain.
10. `adev diagnose --json` against firing scenario → stdout matches golden snapshot.
11. `adev diagnose --json --quiet` → warning on stderr, JSON proceeds (exit 0).
12. `adev diagnose --strict-warnings` against warning-only firing → exit 2.
13. `adev diagnose --quiet` against info-only firing → human output empty, exit 0.
14. `adev diagnose --help` → exits 0, output lists all 3 Tier-1 IDs.
15. Registry-level error case: missing `governance/diagnostics.yaml` → `adev/registry-missing` shown at top of human output / in `errors` array of JSON.
16. Performance: project-wide Tier-1 run completes in <1 s wall-clock (measured in the test via `performance.now()`).
17. Single-spec Tier-1 run completes in <500 ms.

- [ ] Write all scenarios.
- [ ] Capture initial golden snapshot, verify it locks the schema.
- [ ] **Commit:** `test(cli): diagnose coverage (behaviors, error cases, JSON snapshot)`

---

## Quality Gates

- `npm test` (full suite)
- Manual: `node cli/index.mjs diagnose --json` on this repo → JSON matches schema
- Manual: `node cli/index.mjs diagnose --help` → lists registered diagnostics
- `/adev:validate --spec .context-index/specs/features/cli-driver-surface/adev-diagnose-cli.spec.md`

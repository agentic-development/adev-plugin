<!-- DO NOT EDIT statuses inline — see lifecycle log configurable-checks.jsonl -->
# Implementation Plan: Configurable Validate Check Registry

> **Methodology:** adev
> **Charter:** .context-index/specs/features/validation/charter.md
> **Spec:** .context-index/specs/features/validation/configurable-checks.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-19)
> **Platform:** JavaScript (ESM), Node.js, npm, node:test

**Goal:** Replace the hardcoded Check 2-12 prose in `/adev:validate` with a governance-driven registry. Quality-gate commands execute via `execFile` (argv-only, no shell, no interpolation) with subprocess env scoped to profile-declared keys. Stdout/stderr pass through the cross-cutting redaction pipeline.

**Architecture:** `lib/governance/validate-config.mjs` loads bundled defaults + project overlay, validates kinds/profiles/schedules, topologically sorts by `after`. `lib/governance/quality-gate.mjs` runs argv-form commands with redacted output. SKILL.md loads the registry, iterates in topo order, gates each check on `enabled` and fail-fast chains. Bundled subagent-review checks continue to execute via the existing SKILL.md prose (v1 migration path); new project checks must supply a `prompt`.

---

## File Structure

**Create:**
- `lib/governance/validate-config.mjs` — loader + validator + topo-sort
- `lib/governance/quality-gate.mjs` — argv-only runner + redaction + 64 KiB cap
- `templates/validate/defaults.yaml` — 12 bundled check entries (metadata-only for v1 migration)
- `tests/governance/validate-config.test.mjs`
- `tests/governance/quality-gate.test.mjs`

**Modify:**
- `skills/validate/SKILL.md` — new Step 0 (load registry, filter/sort), per-check enabled gates

**Reference:**
- `lib/profiles/` — profile resolution + redactor
- `lib/governance/review-config.mjs` — pattern template

---

## Task Map

### Task 1: validate-config loader
`lib/governance/validate-config.mjs` exports:
- `loadValidateConfig(repoRoot, { pluginRoot, profiles })` returning `{ checks, warnings, errors, notes }`
- Reads `templates/validate/defaults.yaml` first, overlays `.context-index/governance/validate.yaml`
- Validates each check: `id` required; `kind` in {quality-gate, subagent-review, deterministic-check, observational}; `enabled` bool
- Per-kind rules:
  - `quality-gate`: `command` must be a YAML list (argv form); reject string form; reject `{{...}}`, `$VAR`, `${VAR}`, `%VAR%` tokens; `profile` required (no implicit default); default severity `error`
  - `subagent-review`: `prompt` required for project-added entries (bundled entries may carry `internal: true` to defer to SKILL.md prose); default severity `error`
  - `deterministic-check`: projects may NOT register new entries; only bundled ids allowed
  - `observational`: default severity `info`; severity `error` rejected at load
- Topological sort by `after`; cycle detection; unknown `after` IDs → WARN
- Deterministic tie-breaker: lexicographic by `id`

### Task 2: Quality-gate runner
`lib/governance/quality-gate.mjs` exports `runQualityGate(check, { env, redactor, cwd })`:
- Uses `child_process.execFile` with `shell: false`
- Environment = profile-resolved `env` + minimal startup set (`PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR`, `USER`)
- Captures stdout/stderr through `redactor.redact(...)` before any use
- 64 KiB combined cap on report output; truncated tail marker
- Returns `{ status, exitCode, redactedStdout, redactedStderr, wasTruncated, durationMs }`

### Task 3: Bundled defaults YAML
`templates/validate/defaults.yaml` with 12 entries:
- `validate.check-1.5-source-manifest` (deterministic-check)
- `validate.check-2-spec-compliance` through `validate.check-10-platform-drift` (subagent-review, `internal: true`)
- `validate.check-11-visual-verification` (subagent-review, `profile: browser-review`, `internal: true`)
- `validate.check-12-heuristic-extraction` (observational, `internal: true`)
- `after` chain reflects today's fail-fast ordering

### Task 4: SKILL.md wrapper
Add Step 0: call `loadValidateConfig(repoRoot)`. Filter out `enabled: false`; produce ordered list. Each existing per-check section gets a preamble: "If this check is disabled in the registry, record SKIPPED-DISABLED and continue."

### Task 5: Tests
- `tests/governance/validate-config.test.mjs`: kind validation, quality-gate argv-only, interpolation rejection, profile required, topological sort, cycle detection, disabled-check exclusion, deterministic-check restriction
- `tests/governance/quality-gate.test.mjs`: shell=false, env isolation (no LD_PRELOAD leak), redaction in stdout/stderr, 64 KiB cap

### Task 6: Commit + push

---

## Acceptance Criteria Mapping

| AC | Task |
|----|------|
| Zero-config identical to pre-change | 3, 4 |
| Disabling a check → SKIPPED-DISABLED | 1, 4 |
| Project subagent-review with `after` runs after predecessor | 1 |
| Project cannot register deterministic-check | 1 |
| `severity: warning` downgrades FAIL to WARN | 1, 4 |
| Malformed YAML fails load with line citation | 1 (parser already reports lines) |
| Check 11's browser-review profile verified at load | 1 (via profiles primitive) |
| Observational never contributes to verdict | 1, 4 |
| Context-pack sharing between registries | already shared via lib/governance/context-pack.mjs |
| Multi-repo env consumer-repo-local | inherited from profiles primitive |
| quality-gate env.allow missing key → load fail | inherited from profiles primitive |
| quality-gate string-form command → load fail | 1 |
| quality-gate interpolation → load fail | 1 |
| quality-gate omitted profile → load fail | 1 |
| quality-gate stdout/stderr redacted | 2 |
| quality-gate minimal env; no invoking-shell leak | 2 |

---

## Quality Gates

- `npm test` passes
- No new external dependencies

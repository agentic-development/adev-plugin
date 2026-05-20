# Validation Report: Cursor Plugin Manifest and Three-Way Version Parity

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/cursor-provider/plugin-manifest-and-parity.spec.md
> **Plan:** .context-index/specs/features/cursor-provider/plugin-manifest-and-parity.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Tests (`npm test`): PASS — 3201 passed, 0 failed, 0 skipped, 2 todo, duration 161s
- Lint: SKIP — no lint gate configured in `governance/gates.yaml`
- Typecheck: SKIP — no typecheck gate configured

`tests/version-parity.test.mjs` runs as part of the suite and passes all 5 of its assertions:
- all three manifests exist and parse as JSON
- every manifest has a non-empty version field
- package.json, .claude-plugin/plugin.json, .cursor-plugin/plugin.json have strictly equal version fields (`0.26.0`)
- `.cursor-plugin/plugin.json:name === "adev"`
- release-please-config.json extra-files lists both manifests

## Check 1.5: Source Manifest Verification — PASS

- CLI verdict: `Check 1.5: PASS — source manifest matches (sha: 2aed756)`
- Git-tracked check: all three files committed:
  - `.cursor-plugin/plugin.json` → 2d60b5a
  - `release-please-config.json` → 630f1e8
  - `tests/version-parity.test.mjs` → 57a996f

## Check 1.6: Code-Side Drift Warning — PASS

- `drift_detected` flag not set; `adev verify spec --check-drift` returns `{drifted: false, drift_source: null, drift_at: null}`.
- Non-blocking; no warning to emit.

## Check 2: Spec Compliance — PASS

All 11 acceptance criteria verified against actual file content:

- **AC1 `.cursor-plugin/plugin.json` exists**: PASS — file present at plugin root.
- **AC2 valid JSON parseable by JSON.parse**: PASS — `tests/version-parity.test.mjs:38-40` asserts `JSON.parse` succeeds; manual cat shows well-formed JSON.
- **AC3 name === "adev"**: PASS — `.cursor-plugin/plugin.json:2` declares `"name": "adev"`.
- **AC4 three-way strict equality on version**: PASS — all three files show `"version": "0.26.0"`:
  - `package.json:3`: `"version": "0.26.0"`
  - `.claude-plugin/plugin.json:3`: `"version": "0.26.0"`
  - `.cursor-plugin/plugin.json:3`: `"version": "0.26.0"`
- **AC5 description, author, homepage, repository, license copied verbatim**: PASS — byte-for-byte identical to `.claude-plugin/plugin.json:4-12`; additionally `category` and `keywords` copied (addresses review CON-1).
- **AC6 release-please extra-files contains both**: PASS — `release-please-config.json:12-15`:
  ```
  "extra-files": [
    ".claude-plugin/plugin.json",
    ".cursor-plugin/plugin.json"
  ]
  ```
- **AC7 tests/version-parity.test.mjs uses only built-ins**: PASS — `tests/version-parity.test.mjs:15-18` imports only `node:test`, `node:assert/strict`, `node:fs`, `node:path`.
- **AC8 strict === equality across version fields**: PASS — `tests/version-parity.test.mjs:67-79` contains three `assert.strictEqual` calls comparing all pairs.
- **AC9 both manifest paths asserted in extra-files**: PASS — `tests/version-parity.test.mjs:95-104` asserts both via `extraFiles.includes(...)`.
- **AC10 npm test passes**: PASS — 3201/3201.
- **AC11 no constitutional violations; Autonomous lane**: PASS — no new external deps, no protocol/install-path/registration-format changes; pure ESM.

## Check 4: Constitution Compliance — PASS

- Architecture boundaries: PASS — Autonomous-lane work (new manifest file, config modification, new test); no Requires-Human-Approval boundary touched.
- Non-negotiable principles:
  - Principle 1 (Minimize external dependencies): PASS — only Node built-ins.
  - Principle 3 (Pure ESM): PASS — `tests/version-parity.test.mjs` is `.mjs` with ESM imports.
  - Principle 5 (Version parity): PASS — extends 2-manifest invariant to 3 with first programmatic enforcement.
- Coding standards: PASS — kebab-case filenames; camelCase function (`readJson`); built-ins-first import ordering observed.

## Check 8: Boundary Compliance — N/A

- `.context-index/governance/boundaries.yaml` declares `boundaries: []` (no rules configured). No file content to scan.

## Check 9: Transition Gates — N/A

- `.context-index/governance/gates.yaml` declares `transitions: {}` (no transitions configured). No requirements to verify.

## Check 11: Visual Verification — N/A

- Implementation diff touches `.cursor-plugin/plugin.json`, `release-please-config.json`, `tests/version-parity.test.mjs`. None match UI file patterns. SKIP per Case A of the trigger guard.

---

**Summary:** 5 passed (Check 1, 1.5, 1.6, 2, 4), 3 N/A (Check 8, 9, 11). 0 failed.

The implementation satisfies the spec, stays within charter scope, respects the constitution, and passes all quality gates. The three-way version-parity invariant is now programmatically enforced — the first concrete enforcement of constitution Principle 5.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs`, `/adev:hygiene` Audit Pass 20, `/adev:reconcile` lifecycle-sync, and `hooks/post-validate-extract-heuristics.{sh,mjs}` for the relocated concerns.

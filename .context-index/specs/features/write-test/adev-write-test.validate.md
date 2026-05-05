# Validation Report: adev:write-test

> **Date:** 2026-03-27
> **Spec:** All 10 Live Specs in `.context-index/specs/features/adev:write-test/`
> **Plan:** `.context-index/specs/features/adev:write-test/adev:write-test.plan.md`
> **Overall Status:** FAIL

---

## Check 1: Quality Gates — FAIL

`npm test` produces 2 failures in the worktree:

```
✖ AST Parser — Error: ENOENT: no such file or directory,
  open '.../warm-doodling-octopus/node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm'
✖ integration - full pipeline (same root cause)
```

**Root cause:** Git worktree infrastructure. The worktree has no `node_modules` directory
of its own. `lib/repomap/index.mjs` resolves `PLUGIN_ROOT` from `import.meta.url`, which
points to the worktree path, causing the tree-sitter WASM lookup to fail at
`<worktree>/node_modules/…` (which does not exist).

**Evidence this is pre-existing and not introduced by adev:write-test:**
- Main branch passes `npm test` with 221/221 tests.
- `tests/adev:write-test/*.test.mjs` passes 67/67.
- The 2 failing suites (`repomap/parse.test.mjs`, `repomap/index.test.mjs`) are not related
  to the adev:write-test implementation.
- The failures are reproducible on the worktree without any adev:write-test change.

**Fix options:**
1. Merge the branch back to main and run `npm test` there (all tests pass).
2. Run `ln -s $(pwd)/../../../node_modules node_modules` from the worktree to symlink
   node_modules, or `npm install` in the worktree.

Per fail-fast policy, Checks 2–11 are reported for context only (the failures found there
are independent of the quality gate issue).

---

## Check 2: Spec Compliance — PARTIAL

### framework-detection.md

- vitest, jest, node:test, mocha, jasmine, pytest, go test, cargo test detectable: **PASS** — tested
- Commands from allowlist only, never `scripts.test`: **PASS** — `detect-framework.mjs:9-12` uses hardcoded allowlist
- File scan reads ≤ 4096 bytes per file, skips non-UTF-8: **PASS** — `detect-framework.mjs:86-88`
- Priority order respected (vitest > jest > node:test): **PASS** — tested
- Falls back to file scan when no package.json match: **PASS** — tested
- Returns null when not detectable: **PASS** — tested

### gaming-violation-detection.md

- All 9 canonical patterns detected: **PASS** — `tests/adev:write-test/detect-gaming.test.mjs`
- blocking violations prevent Handoff Block production: **PASS** — documented in SKILL.md Step 4
- advisory violations logged but non-blocking: **PASS** — tested
- `--verify` detects new gaming violations not in original Handoff Block: **PARTIAL** — SKILL.md
  Step 6e documents `UNDECLARED_MOCK` check, but there is no test for the new-violation-introduced-at-GREEN
  detection path in `detect-gaming.mjs`. The spec acceptance criterion says "All canonical pattern tests pass"
  (PASS) and "--verify mode detects new gaming violations" (untested in helper).

### immutable-handoff-block.md

- Block written to `.context-index/packets/<slug>-tests.md`: **PASS** — `write-handoff.test.mjs`
- Contains all required fields (slug, spec, locked, hash, created, framework, preexisting_check,
  gaming_check, test file list, original contents, verification command, RED state evidence,
  locked constraints, mocking boundaries): **PASS** — tested
- Original test file contents stored verbatim: **PASS** — `write-handoff.mjs` verified
- RED State Evidence redacts secret patterns: **PASS** — `write-handoff.test.mjs:105`
- hash is SHA-256 of all test files concatenated in path-alphabetical order: **PASS** — tested
- Overwrites packet and records previous_hash: **PASS** — tested
- Packet directory created if absent: **PASS** — tested

### post-green-semantic-verification.md

- `--verify` returns PASS on hash match: **PASS** — `write-handoff.test.mjs:verifyHandoff PASS`
- `--verify` returns PASS_WITH_COSMETIC_CHANGES on hash mismatch with no assertion changes:
  **PARTIAL** — Documented in SKILL.md Step 6d. `verifyHandoff()` returns `HASH_MISMATCH`
  and the skill then dispatches a semantic diff subagent. The distinction between PASS_WITH_COSMETIC_CHANGES
  and TAMPERED is a SKILL.md-level behavior (Claude's reasoning), but there are no tests exercising
  the cosmetic-changes path through the helper.
- `--verify` returns TAMPERED with diff report on weakened assertions: **PARTIAL** — same as above;
  the 5 tamper classifications are documented in SKILL.md and tested for presence in skill-structure.test.mjs
  but are not integration-tested end-to-end.
- Diff report includes file/line/original/current/classification per entry: **PASS** — SKILL.md Step 6d
  specifies format; structural test confirms diff report path string present.
- `--verify` uses fast model tier: **PASS** — SKILL.md Step 6b, structural test confirms.
- Handoff Block not modified by `--verify`: **PASS** — SKILL.md invariants.
- Missing packet causes immediate block: **PASS** — `verifyHandoff` throws PACKET_NOT_FOUND.

### preexisting-failure-protocol.md

- Tests pass before --red → stash skipped: **PASS** — documented in SKILL.md Step 3
- Failure predates changes → Pre-existing Failure Record attached: **PASS** — documented in SKILL.md Step 3
- Failure caused by changes → REGRESSION_DETECTED block: **PASS** — documented in SKILL.md Step 3;
  structural test confirms error code present.
- Uses `git stash --include-untracked`: **PASS** — skill-structure test confirms phrase present.
- Creates `.write-test.lock` before stash, removes after pop: **PASS** — SKILL.md Step 3.
- `git stash pop` always runs after `git stash`: **PASS** — SKILL.md invariant.
- Timed-out test run → kill + stash pop: **PASS** — SKILL.md Step 3.
- Failed stash pop → immediate block with stash SHA: **PASS** — SKILL.md Step 3.
- Clean tree → skipped with `preexisting_check: skipped (clean tree)`: **PASS** — SKILL.md Step 3.
- **Missing: integration tests** — preexisting-failure-protocol.md Actionable Task Map says
  "Write integration tests: Test the protocol logic using `runHook` / bash test helpers in
  `tests/adev:write-test/`". No such integration tests exist. Coverage is via SKILL.md structural
  keyword checks only.

### handoff-block-diff-report.md

- TAMPERED produces diff report at `packets/<slug>-verify-report.md`: **PASS** — SKILL.md Step 6d.
- All 5 tamper classifications in report format: **PASS** — skill-structure test confirms all 5 codes.
- Report printed inline: **PASS** — SKILL.md Step 6d specifies "AND print inline".
- PASS_WITH_COSMETIC_CHANGES does not produce report file: **PASS** — SKILL.md Step 6d.
- DIFF_UNAVAILABLE on missing Original Test File Contents section: **PASS** — SKILL.md Step 6b;
  structural test confirms DIFF_UNAVAILABLE code present.

### standalone-invocation.md

- `--spec` produces identical output standalone vs dispatched: **PASS** — SKILL.md Step 0.
- `--file` derives contracts from exported interface: **PASS** — SKILL.md Step 4.
- Free-form description → `spec: inline-description` in Handoff Block: **PASS** — SKILL.md Step 4.
- Pre-flight summary shown before authoring: **PASS** — SKILL.md Step 0; structural test confirms.
- Works without `.context-index/` → `./packets/` fallback: **PASS** — SKILL.md Step 0; structural test confirms.
- `--verify --packet <path>` works standalone: **PASS** — SKILL.md Step 6.

### mocking-boundary-declaration.md

- Internal module mock → MOCK_VIOLATION block: **PASS** — SKILL.md Step 4.
- fetch/DB clients/node:fs/third-party SDKs permitted with declared entry: **PASS** — SKILL.md Step 4.
- Every mock has a Mocking Boundaries entry: **PASS** — SKILL.md Step 4.
- Mock without justification → MISSING_JUSTIFICATION: **PASS** — SKILL.md Step 4.
- `--verify` flags new undeclared mocks → UNDECLARED_MOCK: **PASS** — SKILL.md Step 6e.
- `write-handoff.mjs` records Mocking Boundaries table: **PASS** — `write-handoff.test.mjs:182`

### model-selection.md

- RED phase uses `capable` tier: **PASS** — SKILL.md Step 4; structural test.
- `--verify` uses `fast` tier: **PASS** — SKILL.md Step 6b; structural test.
- Gaming judgment uses `fast` tier: **PASS** — SKILL.md Step 4; structural test.
- Missing `model_tiers` → hardcoded defaults + advisory: **PASS** — SKILL.md Step 1; structural test.
- Empty tier → fallback to `capable`: **PASS** — SKILL.md Step 1.
- SKILL.md contains no hardcoded model names: **PASS** — structural test scans and verifies.
- `templates/platform-context.yaml` has model_tiers with all 3 keys: **PASS** — platform-context-template.test.mjs

---

## Check 3: Charter Consistency — PASS

All 8 capabilities in the Capability Map are implemented:
- RED Phase Test Authoring → SKILL.md Step 4 + detect-framework.mjs + detect-gaming.mjs
- Immutable Handoff Block → SKILL.md Step 5 + write-handoff.mjs
- Pre-existing Failure Protocol → SKILL.md Step 3
- Post-GREEN Semantic Verification → SKILL.md Step 6
- Gaming Violation Detection → detect-gaming.mjs + SKILL.md Step 4
- Standalone Invocation → SKILL.md Step 0
- Mocking Boundary Declaration → SKILL.md Step 4 + write-handoff.mjs Mocking Boundaries table
- Model Selection → SKILL.md Step 1

Domain model entities (Handoff Block, Test Contract, Mocking Boundary, Pre-existing Failure Record,
Gaming Violation) are all represented in SKILL.md. No out-of-scope functionality added.

---

## Check 4: Constitution Compliance — PASS

- **Minimize external dependencies:** All helpers (`detect-framework.mjs`, `detect-gaming.mjs`,
  `write-handoff.mjs`) use only `node:fs`, `node:path`, `node:crypto`. No external packages. ✓
- **Skills are primarily markdown:** `SKILL.md` is the primary deliverable. Helpers are
  explicitly described as "acceleration aids" and the skill documents that Claude can follow
  the same rules manually if helpers are unavailable. ✓
- **Pure ESM:** All new files use `.mjs` extension with `import`/`export` syntax. ✓
- **No executable logic in SKILL.md:** SKILL.md contains only markdown instructions. ✓
- **Naming conventions:** kebab-case filenames, camelCase functions. ✓

---

## Check 5: ADR Compliance — PASS

- **ADR-0001 (web-tree-sitter as optional dependency):** adev:write-test does not add or
  modify any tree-sitter usage. Not relevant to this implementation.
- **ADR-0002 (TypeScript as dev dependency):** adev:write-test adds no TypeScript or type
  annotations. Compliant.

---

## Check 6: Cross-Cutting Specs — PARTIAL

### model-routing.md

Requirements relevant to adev:write-test:
- SKILL.md specifies tier names, not hardcoded model IDs: **PASS**
- `templates/platform-context.yaml` has `model_tiers` section: **PASS**
- Fallback advisory documented: **PASS**

Requirements scoped to other skills (out of scope for this plan):
- `adev:implement` SKILL.md reads `model_tiers`: **NOT DONE** — not in plan scope
- `adev:eval` SKILL.md Layer 3 dispatch uses `reasoning` tier: **NOT DONE** — not in plan scope
- `adev:review-specs` SKILL.md dispatches reference tier names: **NOT DONE** — not in plan scope

The remaining cross-cutting model-routing criteria affect other skills and require a separate
feature or maintenance task. They do not block the adev:write-test validation.

---

## Check 7: Specialist Review — SKIPPED

No specialists in `.context-index/manifest.yaml` match the implementation's file patterns
(`skills/write-test/*.mjs`, `tests/adev:write-test/*.mjs`, `templates/platform-context.yaml`).

---

## Check 8: Boundary Compliance — N/A

No `governance/boundaries.yaml` configured.

---

## Check 9: Transition Gates — N/A

No `governance/gates.yaml` configured.

---

## Check 10: Platform Drift — PASS

`platform-context.yaml` declares:
- `framework: none` — correct (CLI tool, no web framework in package.json) ✓
- `language: javascript` — all source files are `.mjs` ✓
- `module_system: esm` — all files use `import`/`export` ✓
- `test_runner: "node:test"` — `node:test` used throughout ✓
- `package_manager: npm` — npm used ✓

Note: `.context-index/platform-context.yaml` does not yet have a `model_tiers` section. The
template has it (per the spec). Existing projects must add it manually; the skill uses fallback
defaults when absent. This is expected behavior, not drift.

---

## Check 11: Visual Verification — N/A

No UI files touched by this implementation.

---

## Issues Requiring Action

### Blocker: Quality gate failure (Check 1)
**Impact:** `npm test` fails in the worktree (2 failures in unrelated repomap tests).
**Fix:** Either run `npm install` in the worktree to create a local `node_modules` symlink/copy,
or merge to main and run `npm test` there. The adev:write-test code itself is not the cause.

### Gap: Missing integration tests for preexisting-failure-protocol (Check 2)
**Impact:** The spec's Actionable Task Map explicitly called for integration tests of the git
stash protocol. Only keyword-presence structural tests exist.
**Recommendation:** Add `tests/adev:write-test/preexisting-failure-protocol.test.mjs` using
a stub git repo created with `createTempDir()` + `git init` to test the stash sequence logic.

### Gap: Cross-cutting model-routing updates for other skills (Check 6)
**Impact:** `adev:implement`, `adev:eval`, `adev:review-specs` SKILL.md files do not yet
reference model tiers. These are out of scope for the adev:write-test plan but represent
unfinished work on the model-routing spec.
**Recommendation:** Open a separate task for "Apply model-routing cross-cutting spec to
remaining skills."

---

## Summary

**Overall Status: FAIL**

| Check | Result | Note |
|-------|--------|------|
| 1. Quality Gates | FAIL | Worktree node_modules missing — pre-existing, not introduced by this feature |
| 2. Spec Compliance | PARTIAL | Missing integration tests for stash protocol; --verify semantic diff path untested |
| 3. Charter Consistency | PASS | All 8 capabilities implemented |
| 4. Constitution | PASS | All principles respected |
| 5. ADR Compliance | PASS | No relevant ADR conflicts |
| 6. Cross-cutting Specs | PARTIAL | Other skills not yet updated for model-routing (out of scope) |
| 7. Specialist Review | SKIPPED | No matching specialists |
| 8. Boundary Compliance | N/A | No governance/boundaries.yaml |
| 9. Transition Gates | N/A | No governance/gates.yaml |
| 10. Platform Drift | PASS | Stack declarations match implementation |
| 11. Visual Verification | N/A | No UI files |

Fix the issues above and re-run: `/adev:validate --spec .context-index/specs/features/adev:write-test/`

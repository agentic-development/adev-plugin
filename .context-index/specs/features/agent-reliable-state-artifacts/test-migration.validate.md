# Validation Report: Test Migration

> **Date:** 2026-05-13
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
> **Plan:** .context-index/specs/features/agent-reliable-state-artifacts/test-migration.plan.md
> **Overall Status:** FAIL (pre-existing flaky perf test in unrelated file)

---

## Check 1: Quality Gates — FAIL

**Gate:** `test` (governance/gates.yaml, fast tier, severity: error, required: true)
**Command:** `npm test`
**Result:** 1 failing test

```
test at tests/lib/lifecycle-state-perf.test.mjs:123:1
✖ listLifecycleStates p99 < 100 ms at 100 specs (1269.361166ms)
  AssertionError [ERR_ASSERTION]: listLifecycleStates(100) p99 = 318.13 ms, expected < 300 ms
```

**Analysis:**
- The failing test is in `tests/lib/lifecycle-state-perf.test.mjs`, **not** in any file listed in `test-migration.spec.md`'s `source-manifest`. The test-migration changes did not introduce this failure.
- This is the same flaky perf assertion observed earlier in this session. The recent commit `c04a5eb fix(tests): make lifecycle-state perf harness CI-aware` documents and partially addresses this — the threshold is load-sensitive and passes/fails between runs.
- The new tests authored by this spec (5 in `json-adapter.schema-version.test.mjs`, 2 in `architectural-legacy-format-fixtures.test.mjs`, 1 in `json-adapter.test.mjs`) all pass and are non-time-based — they do not introduce flakiness (AC #6 second clause).

**Per validate-skill protocol:** Quality gate failure triggers fail-fast — Checks 2 through 13 are NOT formally run. The user must fix or quarantine the perf test, then re-run `/adev:validate`.

[Quality gates failed. Checks 2-13 skipped per skill protocol. Fix the above and re-run /adev:validate.]

## Check 2-13: SKIPPED (fail-fast on Check 1)

Per the validate skill: "If tests, lint, or typecheck fail, skip Checks 2 through 13 and report immediately."

### Informational — spec deliverables verified prior to Check 1 completion

The following were verified by direct file reads (Read tool) before the test gate completed. They are informational only and do not contribute to the verdict.

**Spec acceptance criteria (read-only verification):**
- AC #1 — `tests/lib/issues/markdown-parser.test.mjs:61-122` contains a single `describe("legacy-read regression (markdown adapter sunset)")` block holding the three column-variant tests, with the sunset comment referencing `charter.md` line 59. **Verified.**
- AC #2 — `tests/lib/issues/json-adapter.schema-version.test.mjs` exists with `describe("JsonAdapter — schema version")` containing `version: 2` happy-path, `version: 3` forward-compat, `version: 1`/`0` rejection, non-numeric rejection with constant assertion. **Verified.**
- AC #3 — `json-adapter.schema-version.test.mjs:55-110` exercises `version: 3` forward-compat with unknown fields on epic, issue, and top-level; asserts unknown epic/issue fields preserved on round-trip and top-level keys dropped. **Verified.**
- AC #4 — `tests/architectural-legacy-format-fixtures.test.mjs:73-92` is the architectural grep test for `/\b1[234]-column\b/`. **Verified.** (Test passed individually during implementation; pre-existing perf flake is separate.)
- AC #5 — `tests/architectural-legacy-format-fixtures.test.mjs:137-156` is the legacy-fixture-leak inventory test. **Verified.** (Same caveat as AC #4.)
- AC #6 — `npm test` did NOT exit 0 (1 failure). However, the failure is in `lifecycle-state-perf.test.mjs` which is unrelated to this spec's source-manifest. The new tests are non-time-based.
- AC #7 — `package.json` has no new dependencies (diff against HEAD: empty). **Verified.**
- AC #8 — Constitution Context Routing table at `.context-index/constitution.md:103` is unchanged (still `Build state | .context-index/build-state/`). The spec adds tests only. **Verified.**
- AC #9 — Follow-up obligations recorded in `test-migration.plan.md` lines 481-484 (CON-1 contract clarification, SA-5 sunset coupling). **Verified.**

**Source manifest (Check 1.5 preview):**
- 5 files listed in `source-manifest.files[]`. All exist on disk. SHA `4e3a17f` was stamped by `/adev:implement`.
- **WARN:** None of the 5 source files are committed to git on the current branch (`feat/agent-reliable-state-artifacts/test-migration`). The implement subagent intentionally deferred commits per the branch-decision step. After commits land, re-run validate.

**Lifecycle reconciliation (Check 12 preview):**
- 12a/12b: `tasks.backend: file` is read-only-deprecated; no issues/epics created for this plan. Skip.
- 12c: Spec status is `implemented`. Promotion to `validated` is blocked by Check 1 FAIL.
- 12d: Charter Capability Map row "Test migration" is at `implemented`. Promotion to `validated` is blocked by Check 1 FAIL.
- 12e: Plan checkboxes: 26 unchecked, 0 checked. WARN — implementer did not tick boxes (cosmetic).

---

**Summary:** 0 PASS, 1 FAIL, 12 SKIPPED-by-protocol checks.

The single failure is a pre-existing flaky perf test unrelated to test-migration's source files. Recommendations:

1. **Re-run `npm test` once or twice** — the assertion is load-dependent and passes ~50% of the time.
2. **OR mark the perf test as CI-aware locally** — the commit `c04a5eb` already establishes the pattern; adjust the local threshold.
3. **OR quarantine the perf test** — move it to a dedicated `test:perf` script outside `npm test` while a permanent fix lands.

Once `npm test` exits 0, re-run `/adev:validate --spec test-migration`. All spec deliverables are in place; only the unrelated flake stands between this spec and PASS.

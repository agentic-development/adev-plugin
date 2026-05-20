# Validation Report: Skill Spec: Brainstorm Step 8 Capability Grouping Suggestions

> **Date:** 2026-05-17
> **Spec:** .context-index/specs/features/design/brainstorm-spec-grouping.spec.md
> **Plan:** .context-index/specs/features/design/brainstorm-spec-grouping.plan.md
> **Overall Status:** FAIL

---

## Check 1: Quality Gates — FAIL

### Check 1a: Fast Tier — FAIL

- Gate `quality-gate` (`npm test`, severity=error): **FAIL**

```
ℹ suites 528
ℹ pass 3207
ℹ fail 2
ℹ duration_ms 203175.760541

✖ failing tests:

test at tests/cli-e2e.test.mjs:91:3
✖ installs both providers with multiple --provider flags (36900.462958ms)
  Error: ENOTEMPTY, Directory not empty: /var/folders/.../adev-test-OmcA3o
      at rmSync (node:fs:1236:18)
      at cleanupTempDir (file:///.../tests/helpers.mjs:30:3)

test at tests/skills/plan-task-immutability.test.mjs:63:1
✖ plan-immutability: real repo has no violations (1482.426208ms)
  AssertionError: unexpected plan-file mutations:
  [
    {
      "path": ".context-index/specs/features/design/brainstorm-spec-grouping.plan.md",
      "firstPendingTs": "2026-05-18T12:19:39.823Z",
      "lastModifiedTs": "2026-05-18T12:39:49.794Z"
    }
  ]
```

**Tier summary:**
- Check 1a (fast): npm test — FAIL (203.2s)
- Check 1b (integration): SKIP — fail-fast on Check 1a
- Check 1c (e2e): SKIP — fail-fast on Check 1a

**Quality gates failed. Checks 2-13 skipped. Fix the above and re-run /adev:validate.**

### Failure Analysis

1. **`tests/cli-e2e.test.mjs:91` (cli-e2e ENOTEMPTY race)** — Pre-existing flake noted in the implement summary. Race condition in `cleanupTempDir` helper triggers `ENOTEMPTY` during temp-dir teardown. Unrelated to the SKILL.md edit or the new contract test introduced by this spec.

2. **`tests/skills/plan-task-immutability.test.mjs:63` (plan-immutability)** — Directly flags THIS spec's plan file: `.context-index/specs/features/design/brainstorm-spec-grouping.plan.md`. The plan file was modified at `12:39:49Z` after its first `plan_task pending` event at `12:19:39Z`, violating the immutable-plan invariant from `agent-reliable-state-artifacts/plan-task-events.spec.md`. The implement summary flagged this as "pre-existing"; in practice the violation IS this spec's plan-task event sequence. Resolution requires either (a) reconciling the lifecycle log to drop the post-pending plan edit, or (b) marking the commit that re-touched the plan as exempt in `manifest.yaml::hygiene.plan_immutability.exempt_commits`.

---

## Check 1.5: Source Manifest Verification — PASS

- Spec frontmatter declares `source-manifest.sha: 55633ed` over `skills/brainstorm/SKILL.md` and `tests/skills/brainstorm-spec-grouping.test.mjs`.
- CLI verdict: `Check 1.5: PASS — source manifest matches (sha: 55633ed)`.
- Implementation-existence check: both source files are committed (`6183c08 feat(design): add Spec Organization Plan to brainstorm Step 8`; `cc4720a test(design): add Step 8 contract test ...`).

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` returns `{"drifted":false,"drift_source":null,"drift_at":null}`.
- No drift advisory needed.

## Check 2: Spec Compliance — SKIPPED

Skipped per fail-fast on Check 1 (Quality Gates). Not run.

## Check 4: Constitution Compliance — SKIPPED

Skipped per fail-fast on Check 1 (Quality Gates). Not run.

## Check 8: Boundary Compliance — SKIPPED

Skipped per fail-fast on Check 1 (Quality Gates). Not run.

## Check 9: Transition Gates — SKIPPED

Skipped per fail-fast on Check 1 (Quality Gates). Not run.

## Check 11: Visual Verification — N/A

Implementation diff contains no UI files (`skills/brainstorm/SKILL.md` is a markdown skill; `tests/skills/brainstorm-spec-grouping.test.mjs` is a node:test). Per Check 11 trigger guard Case A/D: SKIP — "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 3 passed (1.5, 1.6, 11-N/A), 1 failed (1), 4 skipped (2, 4, 8, 9) checks.

---

## Domain & Heuristics

- Resolved domain: `software` (source level: default; no charter-level override).
- Module heuristics loaded for `design` (3 entries, advisory; used as guidance only).
- Domain gate load warning: `INVALID_GATE — Gate 'test' command must be an argv list (array), not a string — skipped.` The governance/gates.yaml entry uses the legacy string-form command; the merged gate list ran the domain default (`["npm","test"]`) successfully but the project-side `test` gate was effectively shadowed. Recommend migrating the gates.yaml entry to argv-list form.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13).

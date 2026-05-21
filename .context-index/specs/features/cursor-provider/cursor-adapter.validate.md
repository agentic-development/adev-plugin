# Validation Report: CursorAdapter with Skill Name Sanitization

> **Date:** 2026-05-17
> **Spec:** .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
> **Plan:** .context-index/specs/features/cursor-provider/cursor-adapter.plan.md
> **Overall Status:** FAIL

---

## Check 1: Quality Gates — FAIL

Domain gate set: `quality-gate` (fast tier, error severity) → `npm test`.
Project gates.yaml `test` entry skipped at load (string form rejected — see `INVALID_GATE` warning emitted by `adev domain load-gates`).

### Check 1a (fast): npm test — FAIL (~202s)

- `ℹ tests 3243` / `ℹ pass 3240` / `ℹ fail 1` / `ℹ skipped 0` / `ℹ todo 2`

**Failing test:**

```
test at tests/skills/plan-task-immutability.test.mjs:63:1
✖ plan-immutability: real repo has no violations (2550.788417ms)
  AssertionError [ERR_ASSERTION]: unexpected plan-file mutations:
  [
    {
      "path": "/Users/dpavancini/Development/adev-test/.context-index/specs/features/cursor-provider/cursor-adapter.plan.md",
      "firstPendingTs": "2026-05-18T21:01:40.805Z",
      "lastModifiedTs": "2026-05-18T21:03:41.576Z"
    }
  ]
```

**Failure analysis:**

- The failing assertion is in a meta/hygiene test (`tests/skills/plan-task-immutability.test.mjs`) that scans `.context-index/specs/features/**/<spec>.plan.md` for files modified after their first pending task timestamp.
- The flagged plan file is `cursor-adapter.plan.md`. The first pending task was stamped at 21:01:40Z and the file was last modified at 21:03:41Z (a ~2-minute drift after the plan-immutability watermark, plausibly from `/adev:implement` task-completion writes during this same run).
- No cursor-adapter source code is implicated by the failure. The adapter test suite itself passes 26/26 (`tests/provider/cursor-adapter.test.mjs`, see Check 2 evidence below).
- Per fail-fast protocol, Checks 2, 4, 8, 9, 11 are SKIPPED.

[Quality gates failed. Checks 2-13 skipped. Fix the above and re-run /adev:validate.]

## Check 1.5: Source Manifest Verification — SKIP

`adev source-manifest verify --spec ...` returned:

```
Check 1.5: SKIP — no source manifest found. Run /adev:implement to stamp one.
```

The spec frontmatter does not contain a `source-manifest` block, despite the pipeline context advertising `source_manifest_stamped: true`. This is a metadata gap to surface — the implementer should re-stamp via `/adev:implement` finalize, or `adev source-manifest stamp`, so future Check 1.5 runs have something to verify.

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --spec ... --check-drift` returned `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift advisory raised.

## Check 2: Spec Compliance — SKIPPED (fail-fast)

Skipped due to Check 1 (Quality Gates) failure. Per skill protocol, Checks 2-13 do not run when Check 1 fails — the user must address the failing test first and re-run `/adev:validate`.

**Informational evidence collected before fail-fast was applied (not a validation verdict):** The adapter implementation files exist and the dedicated adapter test suite is green:

- `providers/cursor/adapter.mjs` (read at lines 1-257) — exports `CursorAdapter` with `name`, `pluginRoot`, `version`, `getAgentFile()`, `install()`, `uninstall()`, `detect()`, `detectConflicts()`, `disableConflictingPlugin()`. Uses `fs.cpSync` (line 130, 172); no `~/.claude/` references; no `execSync` of `cp -r`; pure ESM.
- `tests/provider/cursor-adapter.test.mjs` (read at lines 1-360) — covers install, idempotency, sanitization (frontmatter-only scope), uninstall, detect, detectConflicts, disableConflictingPlugin, CLI dispatch loadability, source constraints.
- `lib/provider/registry.mjs` (read at lines 1-43) — `cursor` registered, `getProviderNames()` includes `cursor`.

These observations are NOT a PASS verdict; a complete Check 2 sweep (file:line cross-referencing every acceptance criterion against the spec) must run after Check 1 is green.

## Check 4: Constitution Compliance — SKIPPED (fail-fast)

## Check 8: Boundary Compliance — SKIPPED (fail-fast)

## Check 9: Transition Gates — SKIPPED (fail-fast)

## Check 11: Visual Verification — N/A

No UI files in the implementation diff (cursor adapter is a CLI provider module). Per Check 11 trigger guard Case A/D: SKIP — "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 1 failed (Check 1 — quality gates), 1 passed (Check 1.6), 1 skipped (Check 1.5 — no source manifest stamped), 4 fail-fast-skipped (Checks 2, 4, 8, 9), 1 N/A (Check 11).

**Domain-load-gates warnings (logged at startup):**
- `INVALID_GATE`: project gate `test` command must be argv list, not string — skipped.

**Operator action required:**
1. Investigate `tests/skills/plan-task-immutability.test.mjs:63` flagging `cursor-adapter.plan.md`. Options:
   - Add the implementing commit SHA to `manifest.yaml: hygiene.plan_immutability.exempt_commits` if the post-pending mutations were structural / non-content.
   - Otherwise, audit the plan file for mutations that violate the immutability rule and reconcile.
2. Stamp a source manifest on `cursor-adapter.spec.md` (the pipeline context claimed `source_manifest_stamped: true` but the frontmatter has no `source-manifest` block).
3. Re-run `/adev:validate --spec .context-index/specs/features/cursor-provider/cursor-adapter.spec.md --plan .context-index/specs/features/cursor-provider/cursor-adapter.plan.md` once Check 1 passes.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — ADR / cross-cutting / specialist / charter consistency review.
> - `/adev:hygiene` Audit Pass 20 — platform drift.
> - `/adev:reconcile` — lifecycle reconciliation.
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — heuristic extraction.

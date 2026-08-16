---
kind: validate
spec: .context-index/specs/cross-cutting/spec-behavior-ids.spec.md
date: 2026-08-15
tier: quick
verdict: FAIL
---

# Validation Report: Behavior IDs — stable referents for spec behaviors

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/spec-behavior-ids.spec.md` (revision 2)
> **Plan:** `.context-index/specs/cross-cutting/spec-behavior-ids.plan.md`
> **Rigor tier:** `quick` (explicit `--tier quick`)
> **Overall Status:** FAIL

Check 1a (fast-tier quality gate) failed, so the quick tier's synthesized
spec+constitution compliance check was not dispatched. Per the skill's fail-fast
rule, that is mandatory, not discretionary: compliance is not assessed on a tree
whose own gate is red.

**The failure is not attributable to this spec's implementation.** That
distinction is recorded below rather than used to soften the verdict — the gate
is `npm test`, `npm test` exited non-zero, so Check 1a is FAIL.

---

## Check 1a: Quality Gates (fast tier) — FAIL

Gate set resolved via `adev domain load-gates --module spec-lifecycle`
(domain `software`, `source_level: default`):

| Gate | Command | Tier | Severity | Result |
|---|---|---|---|---|
| `quality-gate` | `npm test` | fast | error | **FAIL** |
| `test` | `npm test` | fast | error | not reached (intra-tier fail-fast) |
| `integration-test` | `npm run test:evals` | integration | warning | not reached (tier skipped) |

Loader warning surfaced: `GATE_OVERRIDE — Governance gate 'integration-test' overrides domain gate.`

**`npm test` result:** `tests 6050 · suites 836 · pass 6042 · fail 6 · todo 2`

The six failures:

| # | Failing test | Cluster |
|---|---|---|
| 1 | `adev diagnose --json firing scenario matches golden snapshot (schema lock)` | diagnose |
| 2 | `adev diagnose --spec surfaces validated-without-report in --json output` | diagnose |
| 3 | `adev diagnose --tier 1 project-wide completes in <1 s` | perf |
| 4 | `adev verify spec --check-drift completes in <100ms with 100 accumulated JSONL events (CON-5)` | perf |
| 5 | `plan-immutability: clean fixture with no inline Routing and no sidecar yields no violations` | plan-immutability |
| 6 | `plan-immutability: real repo has no violations` | plan-immutability |

### Attribution evidence

Both clusters were investigated directly rather than assumed pre-existing.

**Clusters 1-4 (diagnose + perf) — contention artifacts, not real failures.**
Re-run in isolation, `tests/cli/diagnose.test.mjs` and
`tests/cli/diagnose-validated-without-report.test.mjs` report **37 tests, 37 pass,
0 fail**, with zero references to this spec. Two of the four are wall-clock
assertions (`<1 s`, `<100ms`). During the gate run the host had a **second
concurrent `npm test` invocation** plus a **`tests/cli.test.mjs` process hung for
2h16m (PID 39941)** left over from an earlier session. Both perf assertions and the
golden-snapshot timing are sensitive to that load.

**Clusters 5-6 (plan-immutability) — 26 pre-existing plan files.** The check
compares each plan's embedded `firstPendingTs` against its filesystem mtime; a
fresh worktree checkout resets mtimes to checkout time, so every checked-in plan
trips it. The violation list contains **26 paths**, and
`spec-behavior-ids.plan.md` appears in it **0 times** — verified by exact-filename
grep, after this spec's plan became git-tracked in `fceb42aa` and therefore
in-scope for the scan.

> Caution for future readers: grepping these violation paths for the bare string
> `spec-behavior-ids` returns 56 hits and is **misleading** — the worktree
> directory itself is `.adev/worktrees/spec-behavior-ids/`, so it matches every
> path. Match `spec-behavior-ids\.plan\.md` instead.

### Consequence

Per the fail-fast rule, Checks 1b, 1c, and the quick-tier synthesized compliance
check were skipped. Overall verdict: **FAIL**.

---

## Check 1.5: Source Manifest — PASS (run out-of-band)

Quick tier skips Check 1.5 as a registry check; it was run directly to answer the
traceability question:

```
Check 1.5: PASS — source manifest matches (sha: 3539b26)
```

All five manifest files are committed and unmodified since stamping. The stamped
`sha: 3539b26` was independently recomputed in this session via
`adev source-manifest compute` and matched exactly — an agreement between two
separate computations, not a re-read of the same value.

---

## Synthesized Spec + Constitution Compliance — SKIP

Skipped — prerequisite Check 1a failed (fail-fast). Not assessed.

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff (`git diff --name-only d81166c8..HEAD`
matches zero of `*.tsx|jsx|vue|svelte|css|scss|html`, `components/`, `pages/`,
`views/`, `public/`). Case A of the trigger-guard matrix: no UI files, Playwright
unavailable → SKIP, not BLOCK.

## Checks 1.6, 8, 9 — SKIP

Skipped — quick rigor tier.

---

**Summary:** 1 failed (Check 1a), 1 passed out-of-band (Check 1.5), 5 skipped.

**Nothing in this run contradicts the spec.** No check produced a finding against
the spec's behaviors, acceptance criteria, or the constitution — the sole failure
is a repository-wide gate that was already red on unrelated suites.

**To clear:** the six failures are independent of this branch. Reap the hung
`tests/cli.test.mjs` process, avoid concurrent `npm test` runs, and re-run
`/adev:validate --spec .context-index/specs/cross-cutting/spec-behavior-ids.spec.md --tier quick`.
The `plan-immutability` mtime sensitivity is a standing repo issue affecting 26
checked-in plans and needs its own fix.

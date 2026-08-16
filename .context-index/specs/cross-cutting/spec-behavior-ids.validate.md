---
spec: .context-index/specs/cross-cutting/spec-behavior-ids.spec.md
plan: .context-index/specs/cross-cutting/spec-behavior-ids.plan.md
date: 2026-08-15
rigor_tier: quick
overall_status: FAIL
fail_cause: pre-existing-quality-gate
---

# Validation Report: Behavior IDs — stable referents for spec behaviors

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/spec-behavior-ids.spec.md`
> **Plan:** `.context-index/specs/cross-cutting/spec-behavior-ids.plan.md`
> **Rigor tier:** quick (explicit `--tier quick`)
> **Overall Status:** FAIL — on a pre-existing gate failure unrelated to this change

---

## Check 1: Quality Gates — FAIL (pre-existing)

Resolved gate set (domain `software` + governance): fast tier `npm test` (severity `error`), integration tier `npm run test:evals` (severity `warning`).

**Check 1a (fast): `npm test` — FAIL**

```
ℹ tests 6050
ℹ suites 836
ℹ pass 6046
ℹ fail 2
```

Both failures are in `tests/skills/plan-task-immutability.test.mjs`:

- `plan-immutability: real repo has no violations`
- `plan-immutability: clean fixture with no inline Routing and no sidecar yields no violations`

**This failure is pre-existing and not caused by this change.** Evidence:

1. `main` at `d81166c8` was extracted to a scratch directory via `git archive` and the suite run there. `plan-immutability: real repo has no violations` fails **identically on clean main**.
2. The violation list contains ~25 checked-in `.plan.md` files under `.context-index/specs/features/**` dated May 2026, plus a fixture whose embedded `firstPendingTs` is `2020-01-01`. The test compares embedded plan timestamps against filesystem mtimes, and a fresh `git worktree` checkout resets every mtime to checkout time.
3. **`spec-behavior-ids.plan.md` — this change's own plan — is not among the violations.**
4. This change touches no `.plan.md` file and no code that the test exercises.

An earlier run also showed 11 failures across repomap / tree-sitter / AST / PageRank suites; those were caused by `node_modules` being absent in the fresh worktree (`tree-sitter-typescript` and `web-tree-sitter` are real dependencies). After `npm install` they all pass. A transient `installProviders — cursor end-to-end` failure was a flake from concurrent test runs contending on the shared `~/.cursor/config.json`; `tests/cli.test.mjs` passes 38/38 in isolation on both this branch and clean main.

**Delta attributable to this change: zero.** The change's own suite, `tests/behavior-id-convention.test.mjs`, passes 23/23 together with `tests/sync/provider-skill-parity.test.mjs`.

## Check 2 + Check 4 (synthesized): Spec + Constitution Compliance — PASS

Quick tier runs one synthesized compliance check. Every citation below comes from a Read of the actual file in this run.

| # | Acceptance criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Step 4 states `BEH-<n>` form, unordered rendering, allocation rule, tombstone comment | PASS | `skills/specify/SKILL.md` — standard-mode Step 4 now carries a fenced `markdown` example plus **Allocation** and **Tombstones** paragraphs |
| 2 | Revision obligations: keep on rewrite (BEH-3), retire+mint on redefinition (BEH-5), never reuse (BEH-4) | PASS | "**Revising behaviors.**" paragraph in the same block |
| 3 | Legacy specs not retro-migrated (BEH-7) | PASS | Closing paragraph: "Specs authored before this convention landed … are **not retro-migrated**" |
| 4 | `--extract` and `--from-diff` cross-reference the convention | PASS | `Step 4: Generate Snapshot Spec` and `Step 4: Generate Retroactive Spec` each gained a cross-reference sentence naming `BEH-<n>` and the tombstone comment |
| 5 | Three templates render `- **BEH-<n>** — **When** … **then** …` + tombstone | PASS | `spec-template.behavioral.md`, `spec-template.refactor.md` converted from `1. 2. 3.`; `domains/software/spec-template.md` had a placeholder **added** (it previously had only a heading + comment), exactly as the spec's Task 4 predicted |
| 6 | No Behaviors-bearing template renders a bare `N.` ordinal | PASS | `tests/behavior-id-convention.test.mjs:188` asserts `doesNotMatch(/^\d+\.\s+\*\*When\*\*/m)` per template |
| 7 | A test asserts both across every Behaviors-bearing template | PASS | `tests/behavior-id-convention.test.mjs:135-196` discovers templates from disk rather than hardcoding, and asserts the bearing/omitting partition explicitly (`:171-181`), so a template added later cannot escape the guard |
| 8 | Inserting a behavior changes one line, other IDs unchanged (BEH-2) | PASS | Witnessed by the spec itself: revision 2 retired BEH-6 and BEH-7 **kept its number**. `retired-behavior-ids: BEH-6` is live in the spec's Behaviors section; no renumbering occurred |
| 9 | No inline Node or executable directive in the edited section | PASS | `tests/skills-no-inline-node.test.mjs` + `tests/skills-extension-coverage.test.mjs` pass 34/34; grep for `node -e`, `node --input-type`, `Run inline Node` in `skills/specify/SKILL.md` returns nothing. The one fence added is ```markdown (descriptive), not ```javascript |
| 10 | All quality gates pass (`npm test`) | **FAIL** | See Check 1. Pre-existing, reproduced on clean `main` |
| 11 | No constitutional violations introduced | PASS | Principle 2 (skills are primarily markdown) — the deliverable is authoring prose + template shape, no runtime validator, as the spec's Out of Scope states. Principle 1 — no dependency added. Principle 3 — the one new file is ESM `.mjs` using `node:test` + `node:assert/strict` |

**Test-integrity review (anti-gaming).** `tests/behavior-id-convention.test.mjs` is substantive, not shaped to pass:

- It discovers spec templates from the filesystem (`:135-145`) instead of hardcoding a list.
- It asserts the exact bearing/omitting partition with `deepEqual` (`:171-181`), so silently dropping a template from coverage fails the suite.
- It carries a real negative assertion (`doesNotMatch` on the ordinal form), not just a positive existence check.
- The `section()` helper tracks code fences (`:38-45`) so assertions cannot be satisfied by prose outside the targeted block — a defect the plan reviewer caught and the implementation fixed.
- The BEH-4 test (`:77-85`) carries a comment explaining that two of its three matchers are satisfied by the allocation guidance alone, and adds a third assertion that actually binds the deletion rule. That is the opposite of assertion-weakening.

No loose matchers standing in for exact values, no conditional skips, no always-true assertions.

## Checks 1.5, 1.6, 8, 9 — SKIP

Skipped — quick rigor tier.

Note: `adev source-manifest verify` was run manually during implementation wrap-up and returned `Check 1.5: PASS — source manifest matches (sha: 3539b26)`.

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff (markdown authoring guidance, templates, one test file). Not applicable.

---

**Summary:** 1 check failed (Check 1, quality gates — pre-existing), 1 synthesized compliance check passed, 5 skipped.

**Spec-compliance result: 10 of 11 acceptance criteria PASS.** The single failure is AC10, which restates Check 1's repo-wide gate. Every criterion describing *this change's own deliverable* passes.

**Recommended disposition.** The implementation is complete and correct. `plan-task-immutability` is red on `main` independently of this branch and should be tracked as its own defect — it asserts against filesystem mtimes, which any fresh `git worktree` checkout invalidates. This spec should not be held open on it.

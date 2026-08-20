---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: BLOCK
review-round: 6
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 6
blockers-sidecar: scoring-engine.blockers.md
file-sha: b22134f83b395c928db9fe5b2dc0589008384b0eace86d3372c63d6b749638f2
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** BLOCK
> **Round:** 6 (revision 6; rounds 1-3 BLOCKed, round 4 PASS_WITH_NOTES, round 5 PASS)
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Scope of This Round

Revision 5 passed review, was planned, implemented across 11 tasks and 12 commits, and then failed `/adev:validate` on a reproduced integration defect. Revision 6 is the spec-side fix. This review targets the new material — BEH-11, three new Error Cases rows, two new Acceptance Criteria lines, one new task-map row — and does not re-open BEH-1 through BEH-10, which passed at revision 5 and are confirmed untouched.

Both blockers are in the new material. Both are security-boundary findings. Neither reopens settled ground.

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it was directed to read the full charter, `skills/eval/SKILL.md`, `lib/evals/score-schema.mjs`, `lib/evals/score.mjs`, `lib/cli/eval.mjs`, `lib/evals/rubric.mjs`, and `cli/index.mjs` from disk. All findings cite specific lines in those files.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | plugin:review-specs/quick-synthesized-reviewer-prompt.md |

Per the `quick` tier branch, the registry's specialist reviewers (`consistency-analyzer`, `referent-integrity`, `wiring-reviewer`, `boundary-reviewer`, and the keyword-triggered `termination-reviewer`) were NOT dispatched.

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service) where it fits the artifact class. Prompt retained on disk. |

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** FAIL

Two blockers, one suggestion. Both blockers carried valid `blocker_id` and `section_anchor`, validated with `parseBlockerId`.

### SEC-1 — severity: blocker

- **Location:** Actionable Task Map / BEH-11 wiring
- **blocker_id:** `quick-synthesized-reviewer:skill-passes-resolved-path-not-keyword:c0163abf`
- **section_anchor:** `actionable-task-map`
- **Finding:** `skills/eval/SKILL.md` is the only real caller of `adev eval score --rubric`, and it resolves the rubric *before* invoking the verb. Its documented resolution order names the shipped default as the absolute path `<ADEV_ROOT>/skills/eval/default-rubric.yaml`, and its invocation line reads `adev eval score --rubric <resolved rubric path>`. The literal string `default` is therefore never what the verb receives — it receives a pre-resolved absolute plugin-cache path.

  BEH-11 only teaches the CLI verb to special-case the literal token. It does nothing for a caller that resolves the keyword upstream. That absolute path still fails BEH-9's project-root containment in any real install, so **the validate-caught defect reproduces end-to-end even after BEH-11 ships correctly in isolation**. No task-map row and no acceptance criterion requires updating SKILL.md's resolution order.
- **Recommendation:** Add a BEH-11-scoped task-map row *and* an acceptance criterion requiring SKILL.md to stop pre-resolving `default` and instead pass the literal token through as `adev eval score --rubric default`, verified by the same regression test that exercises a differing plugin root.

**Orchestrator verification — confirmed.** Read `skills/eval/SKILL.md` directly. Its `Rubric resolution` section states "The shipped default rubric is `<ADEV_ROOT>/skills/eval/default-rubric.yaml`", its step 3 is "Otherwise the shipped rubric", and its scoring invocation is `adev eval score --rubric <resolved rubric path> --input <verdict file path>`. The finding holds exactly as stated.

This is the sharpest possible version of the question the author asked — "does BEH-11 close the hole or relocate it?" The answer is neither: as specified, BEH-11 does not reach the code path where the defect occurs.

### SEC-2 — severity: blocker

- **Location:** Behaviors, BEH-11
- **blocker_id:** `quick-synthesized-reviewer:plugin-root-provenance-unpinned:657a9f82`
- **section_anchor:** `behaviors-beh-11`
- **Finding:** BEH-11 never states how "the plugin root" is derived at runtime, and the verb contract does not currently supply one. `cli/index.mjs` defines a trustworthy, non-caller-controllable `PLUGIN_ROOT` (`resolve(__dirname, "..")`, line 16), but `dispatch()` passes verb modules only `{ projectRoot, argv, manifest }` — `PLUGIN_ROOT` is never plumbed through. `lib/cli/eval.mjs`'s signature is `run({ projectRoot, argv })`, with no plugin-root input at all. Meanwhile `process.env.CLAUDE_PLUGIN_ROOT` is an established read elsewhere in this codebase (`lib/session-capture.mjs:715`).

  An implementer wiring BEH-11 therefore finds no plugin root on the verb contract and a precedented, low-friction environment-variable source close to hand. That source is caller-settable: `CLAUDE_PLUGIN_ROOT=/etc adev eval score --rubric default` would turn BEH-9's benign refusal into an attacker-directed file read. That is the hole relocated and worsened, not closed.
- **Recommendation:** BEH-11 must require the plugin root be sourced from a `__dirname`-derived constant — either the `PLUGIN_ROOT` `cli/index.mjs` already computes, plumbed through `dispatch()`/`run()`, or `getPluginRoot()` — and must explicitly prohibit env-var or any other caller-influenced derivation, as a normative clause rather than commentary.

**Orchestrator verification — confirmed, with one moderating fact the reviewer did not mention.** Every factual claim checks out: `run({ projectRoot, argv })` at `lib/cli/eval.mjs:40`; `mod.run({ projectRoot, argv: verbArgs, manifest })` at `cli/index.mjs:2066` with no plugin root; `process.env.CLAUDE_PLUGIN_ROOT` at `lib/session-capture.mjs:715`.

The moderating fact: `getPluginRoot()` in `lib/profiles/index.mjs` is an importable, `__dirname`-derived, safe source an implementer could simply use. So the accurate framing is "the spec leaves provenance open and the lowest-friction path is unsafe", not "only an unsafe path exists". **That moderates likelihood, not severity, and it does not lift the blocker** — this entire round exists because an assumption about what an implementer would obviously do proved wrong at validate. A security boundary that depends on the implementer picking the right one of two available sources is not specified.

### SA-1 — severity: suggestion

- **Location:** Error Cases table (implementation-side)
- **Finding:** `lib/evals/score-schema.mjs` carries inline comments asserting that `SCORE_INVALID_VERDICT_CONTEXT` and `SCORE_INPUT_PARSE_ERROR` are "not in the spec's Error Cases table, which enumerates nine". Revision 6 added rows for both, so those comments are now stale — and one of them explicitly instructs a future reader to "add a one-line row for it to the spec", which has now been done.
- **Recommendation:** Update the comments during implementation. Implementation-comment drift, not a spec defect; it does not affect this verdict.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict computed from post-cap findings across all reviewers. Two blocker-severity findings against `verdict_rules.blocker_threshold: 1` give the consolidated BLOCK in the header.

## Answers to the Five Verification Points

1. **Does BEH-11 close the hole or relocate it?** Neither, and the reason is worse than either option the question offered. As specified, BEH-11 never reaches the real call site (SEC-1), and it leaves the containment boundary's own provenance unpinned in a way the codebase's nearest precedent would make caller-controllable (SEC-2). On the narrower sub-question the author raised: **the "literal value `default`" wording itself is precise and sound.** Case variants (`DEFAULT`, `Default`), surrounding whitespace, a trailing slash, `./default`, and encoded forms all fall through to the ordinary BEH-9 path branch. There is no hole in the keyword-matching wording.

2. **Do BEH-9 and BEH-11 partition `--rubric` cleanly?** Yes, for the CLI verb's own argument in isolation. Exactly `"default"` (strict equality) reaches the keyword branch; every other value reaches BEH-9. No value satisfies both; no value satisfies neither. The round-3 class of defect — a region claimed by no behaviour — does not recur here.

3. **Is the Error Cases table complete against the implementation?** Yes. All 11 codes in `SCORE_ERROR_CODES` and every throw site in `score.mjs` and `eval.mjs` match the table, with no gap in either direction. `SCORE_DEFAULT_RUBRIC_MISSING` is correctly absent from the shipped constant because BEH-11 is not implemented yet — expected, not a defect. The two previously-undeclared codes validate flagged are now properly declared.

4. **Is the regression-test requirement strong enough to survive planning?** Partially — and this is the question that most deserved asking. The task-map row does forbid the collapsed case (plugin root == project root), which prevents a literal repeat of how the defect hid. But two gaps remain:
   - It does not require the test to exercise the real `dispatch()` -> verb-module wiring end to end. A unit test that stubs an internal helper with a fake plugin root would satisfy the letter of the requirement while proving nothing about how the plugin root is actually obtained — the same gap underlying SEC-2.
   - It does not require testing SKILL.md's actual resolution flow, which is where SEC-1 lives. A test that invokes `adev eval score --rubric default` directly would pass while the only real caller still passes a resolved path.

   Suggested wording: require an end-to-end CLI invocation through `dispatch()` with the plugin root at a path outside the project root, *plus* an assertion on the argument SKILL.md's documented flow actually passes.

5. **New problems in revision 6's material.** SEC-1 and SEC-2, both confined to BEH-11, the task map, and the acceptance criteria. Nothing in BEH-1 through BEH-10 is reopened or disturbed.

## Assessment of the Rejected Alternatives

The author asked for an assessment of the two paths not taken. Both rejections were correct, and SEC-1/SEC-2 do not change that:

- **Widening containment to permit `ADEV_ROOT`** would loosen a security boundary in this spec *and* in the shipped loader (`lib/evals/rubric.mjs` carries the same latent limitation) to serve one known-good case. Rejecting it was right. Note that SEC-2 is a warning that the *implementation* of the chosen alternative could arrive at an equivalent-or-worse posture by accident, which is an argument for pinning provenance, not for revisiting this decision.
- **Copying the rubric into each project** would change install semantics and create a drift surface between the shipped rubric and per-project copies. Rejecting it was right.

The keyword approach remains the correct design. Both blockers are about completing it, not replacing it.

## Charter-Constraint Check

Both charter constraints remain satisfied at revision 6; neither is implicated in either blocker:

- **Split-delta invariant** — untouched by revision 6. The halves remain separately addressable and the number-or-status model is unchanged.
- **ScoreComparison outcome set** — not re-opened. `SCORE_DEFAULT_RUBRIC_MISSING` is an error code, not a comparison outcome.

## Reviewer-Output Compliance

**The mandatory-output requirement was exercised this round and satisfied.** Both blockers carried `blocker_id` and `section_anchor`; both parse cleanly under `parseBlockerId`; the sidecar was written with 2 entries and no collisions. Across six rounds the fields were emitted correctly in rounds 1, 2 and 6, absent in round 3, and untested in rounds 4 and 5 — consistent with the intermittent-failure hypothesis on P1 `adev-plugin-quick-reviewer-blocker-id-s0et`, and a data point that the failure is not permanent.

## Process Note

This round is the strongest available evidence for a claim made in the round-5 report: the value of this gate has depended on a human at every step. Revision 5 passed review, plan, implement and 12 commits before the defect surfaced, and it surfaced only because `/adev:validate` ran in an environment the test suite could not simulate. Two observations follow.

First, a test suite that runs in the repository where `<ADEV_ROOT>` and the project root coincide is structurally blind to this entire class of defect. That is worth a heuristic entry independent of this spec.

Second, the framework defects tracked across earlier rounds remain open and still block the automated path: `adev specify revise` cannot edit spec body content (`adev-plugin-revise-loop-no-content-edits-q6q0`), and `adev report --type step` stamps no revision (`adev-plugin-gkfv.3`), so all six rounds project under `byRevision: {"1": ...}` with `lastReviewedRevision` unset.

---

## Summary

**Total findings:** 3 (2 blockers, 0 warnings, 1 suggestion)
**Action required:** Address both blockers before re-review. SEC-1 requires a task-map row and an acceptance criterion covering the `skills/eval/SKILL.md` resolution-order change — without it BEH-11 ships correct and the defect still reproduces. SEC-2 requires BEH-11 to pin plugin-root provenance to a `__dirname`-derived constant and explicitly prohibit caller-influenced derivation. Consider strengthening the regression-test wording at the same time (verification point 4): as written, a conforming test could still miss both blockers. The `.blockers.md` sidecar carries both entries keyed by `blocker_id` for `/adev:specify --revise`.

---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: PASS_WITH_NOTES
review-round: 7
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 7
file-sha: eab50163a57d80cad859f175975345a40b498826104555c5770bb98efb2d6709
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Round:** 7 (revision 7; rounds 1-3 and 6 BLOCKed, round 4 PASS_WITH_NOTES, round 5 PASS)
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Scope of This Round

Revision 7 answers round 6's two security blockers: BEH-12 is new (the caller obligation), BEH-11 is amended (plugin-root provenance pinned to `getPluginRoot()`, `CLAUDE_PLUGIN_ROOT` named as forbidden), two task-map rows and four Acceptance Criteria lines are new or changed. BEH-1 through BEH-10 passed at revision 5 and were confirmed undisturbed.

Both round-6 blockers are closed at the root. The remaining findings are about proving the fix rather than about the fix.

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it was directed to read the full charter plus `skills/eval/SKILL.md`, both provider mirrors, `lib/cli/eval.mjs`, `lib/profiles/index.mjs`, and `cli/index.mjs` from disk, and to grep for every `adev eval score` call site.

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

**Verdict:** PASS_WITH_NOTES

Zero blockers. One warning, one suggestion.

### SEC-1 — severity: warning

- **Location:** Behaviors BEH-11 / Actionable Task Map, end-to-end regression test row
- **Finding:** The prohibition on reading `CLAUDE_PLUGIN_ROOT` is pinned by an Acceptance Criteria line ("no code path reads it from the environment"), but the mandatory three-property end-to-end test the task-map row requires — real `dispatch()` wiring, plugin root outside the project root, an assertion on the argv the skill's documented flow passes — never requires setting a conflicting `CLAUDE_PLUGIN_ROOT` and asserting it is ignored. An implementation can satisfy every literal test requirement in the row while never behaviourally proving env-var immunity. A regression that reintroduced `process.env.CLAUDE_PLUGIN_ROOT` as a fallback would be caught only by code review, not by the test the spec mandates.
- **Recommendation:** Add a fourth required property to the task-map row (or a dedicated BEH-11 unit test): during the end-to-end run, set `CLAUDE_PLUGIN_ROOT` to a decoy path and assert the shipped rubric — not the decoy — is what loads.

This is the round-6 SEC-2 concern one layer out. The rule is now stated normatively; what is still missing is a test that would fail if the rule were broken. Given that this spec's entire history is defects surviving until something executed them, that gap is worth closing before implementation rather than after.

### SA-1 — severity: suggestion

- **Location:** Behaviors, BEH-12
- **Finding:** BEH-12's when/then clause names only `skills/eval/SKILL.md`; the provider-mirror obligation appears solely in a task-map row and an Acceptance Criteria bullet. This is *not* the unenforced gap round 4's SA-1 described: `tests/sync/provider-skill-parity.test.mjs` runs `scripts/sync-provider-skills.mjs --dry-run` as a quality gate and fails `npm test` on any drift between canonical `skills/` and `providers/{codex,opencode}/skills/`, so a BEH-12 fix to the canonical file cannot land without the mirrors following.
- **Recommendation:** Cite that parity mechanism by name in BEH-12 or the task-map row, for a reader who does not already know it exists.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict computed from post-cap findings across all reviewers. Zero blockers and at least one warning give the consolidated PASS_WITH_NOTES in the header.

## Orchestrator Verification Notes

Three checks the orchestrator ran independently. The first two confirm reviewer claims; the third is an additional finding at warning severity that the reviewer noted the existence of but did not pursue. None changes the consolidated verdict, which is PASS_WITH_NOTES either way.

**1. The provider-parity mechanism is real — SA-1's refutation stands.** `tests/sync/provider-skill-parity.test.mjs` exists and runs the real sync script in `--dry-run`, failing on any reported pending update. Its header documents the exact failure mode it was written for: mirrors silently drifting and serving stale skill instructions for weeks. This refutes the orchestrator's own pre-dispatch hypothesis that the mirrors were an unenforced BEH/AC scope mismatch of the round-4 SA-1 kind. They are enforced, by a mechanism outside this spec.

**2. `getPluginRoot()` matches BEH-11's text exactly.** `lib/profiles/index.mjs` derives it as `join(__dirname, "..", "..")` with no environment fallback, and `cli/index.mjs` independently computes `PLUGIN_ROOT = resolve(__dirname, "..")`. BEH-11 names a source that exists and is unforgeable.

**3. `docs/cli-reference.md` still teaches the pattern BEH-12 forbids — orchestrator finding, warning severity.** Lines 850-851 document the verb as:

```
adev eval score --rubric skills/eval/default-rubric.yaml --input .adev/eval/latest-verdicts.json
adev eval score --rubric skills/eval/default-rubric.yaml --input .adev/eval/latest-verdicts.json --json
```

That is a project-root-relative path to the *shipped* rubric. It resolves only because this repository collapses `<ADEV_ROOT>` and the project root — the precise condition that hid the original defect through review, plan, implement and into validate. In any consumer project no such file exists under the project root, so a user copying the documented command gets a failure, and `CLAUDE.md`'s Context Routing table directs agents to `docs/cli-reference.md` as the authority for CLI verb signatures, so an agent may reproduce it too.

Revision 7 fixes the callee (BEH-11), the canonical caller (BEH-12), and the mirrors (by parity). The documented example is a fourth surface that emits this argument and no behaviour, task-map row or acceptance criterion covers it. It is the same defect class as round 6's SEC-1 — the fix reaching some emitters of the argument but not all of them — one surface further out.

Recommendation: extend BEH-12's scope, or add a task-map row, covering `docs/cli-reference.md`'s example so it reads `--rubric default`. Warning, not blocker: it misleads a reader rather than breaking the contract, and the same end-to-end test that proves BEH-12 would not catch it.

## Answers to the Five Verification Points

1. **The end-to-end path closes; no unreachable link remains.** Every route by which a `--rubric` value reaches the verb was enumerated and attributed:

   | Route | Governed by |
   |---|---|
   | Skill step 1 — explicit `--rubric <path>` | BEH-9, project-root containment, unchanged |
   | Config `rubric: default` in `.context-index/evals/config.yaml` | BEH-12 — its trigger ("rubric resolution selects the shipped default") reads broadly enough to cover the config route, not only the step-3 fallback |
   | Config `rubric: <path>` | BEH-9, ordinary path |
   | Step-3 fallback, nothing configured | BEH-12 — the case it was written against |
   | Provider mirrors | Not named in BEH-12's prose, but structurally kept in sync by the parity gate (SA-1) |
   | `docs/cli-reference.md` example | **Nothing** — orchestrator note 3 above |
   | Other callers | None. Grepped; only the skill, its two mirrors, docs, and tests invoke the verb |

   `lib/cli/eval.mjs` currently has no `default` handling at all, which is correct for a review-pending spec ahead of implementation.

2. **BEH-12 is testable, and the technique is already precedented here.** `tests/skills/eval-layer3-scoring-verb.test.mjs` asserts SKILL.md prose via `readFileSync` plus a regex, which fits the constitution's "skills are primarily markdown" stance, and the mandated end-to-end test goes further by asserting the actual argv through real `dispatch()` wiring rather than a grep. One refinement to the reviewer's answer: **the existing test is precedent for the technique, not sufficient for BEH-12.** Its assertion is `assert.match(layer3, /adev eval score/)`, which passes whether the skill emits `--rubric default` or a resolved path — so it would not catch a BEH-12 regression. The mandated new test is what does the work; the old one only shows the shape is available. Residual limitation, correctly identified: no test can prove a live agent follows markdown prose, only that the documented template is correct if followed. That ceiling is inherent to a markdown-only skill architecture, not a defect of this spec.

3. **The env-var prohibition is normative, but under-tested.** It sits as prose inside BEH-11's single when/then rather than as its own clause, but it is tied directly to the "then" branch's containment mechanism and is pinned by a standalone Acceptance Criteria line, so an implementer cannot read it as optional and a reviewer can hold code to it. Adequate as a constraint. The gap is testability, which is SEC-1: nothing the spec mandates would fail if the rule were broken.

4. **New material introduced only SEC-1 and SA-1**, both stemming from the two new or amended behaviours, plus the orchestrator's docs finding. Nothing structural.

5. **Regression sweep — round 6's blockers closed at the root, not relocated.** SEC-1 of round 6 (keyword branch unreachable) is closed by BEH-12 making the caller obligation contractual. SEC-2 of round 6 (provenance unpinned) is closed by BEH-11 naming `getPluginRoot()` and forbidding `CLAUDE_PLUGIN_ROOT`, verified against the actual source. BEH-1 through BEH-10 show no disturbance.

## Charter-Constraint Check

Both charter constraints remain satisfied at revision 7 and neither is implicated in any finding:

- **Split-delta invariant** — untouched by revisions 6 and 7, which concern rubric resolution rather than scoring. The halves remain separately addressable.
- **ScoreComparison outcome set** — not re-opened. `SCORE_DEFAULT_RUBRIC_MISSING` is an error code, not a comparison outcome.

## Reviewer-Output Compliance

No blocker this round, so the mandatory `blocker_id` / `section_anchor` requirement went unexercised. Across seven rounds the fields were emitted correctly in rounds 1, 2 and 6, absent in round 3, and untested in rounds 4, 5 and 7 — still consistent with the intermittent-failure hypothesis on P1 `adev-plugin-quick-reviewer-blocker-id-s0et`.

## Process Note

Round 6's report observed that a test suite running where `<ADEV_ROOT>` and the project root coincide is *structurally* blind to this class of defect. Orchestrator note 3 is the same blindness showing up in a third artifact — the documentation — which strengthens the case for filing that observation as a heuristic independent of this spec, as the author intends. The three surfaces found so far (the verb, the skill, the docs) were each discovered by a different mechanism: validate, review, and an orchestrator grep. None was found by the test suite.

Two framework defects remain open and still block the automated path: `adev specify revise` cannot edit spec body content (`adev-plugin-revise-loop-no-content-edits-q6q0`), and `adev report --type step` stamps no revision (`adev-plugin-gkfv.3`), so all seven rounds project under `byRevision: {"1": ...}` with `lastReviewedRevision` unset.

---

## Summary

**Total findings:** 3 (0 blockers, 2 warnings, 1 suggestion)
**Action required:** None blocking; the spec is ready for `/adev:plan`. Two warnings are worth folding in first, both cheap: add a decoy-`CLAUDE_PLUGIN_ROOT` property to the mandated end-to-end test (SEC-1), so the env-var prohibition has a test that would fail if broken; and bring `docs/cli-reference.md`'s example onto `--rubric default` (orchestrator note 3), so the documentation stops teaching the pattern BEH-12 forbids. SA-1 is a one-line citation of the existing parity gate.

## Charter Capability Map — Deliberate Deviation

Step 7 of `/adev:review-specs` directs a PASS/PASS_WITH_NOTES verdict to set the parent charter's Capability Map row to `review-passed`. That step was **not** applied this round, deliberately.

The row for "Scoring engine and `adev eval score`" currently reads `implemented`. It advanced there legitimately: revision 5 passed review at round 5, and the capability was then planned and implemented across 11 tasks and 12 commits. Writing `review-passed` over `implemented` would regress a status that reflects real, completed lifecycle progress.

The Step 7 rule assumes the ordinary ordering, where review precedes implementation and the row has not yet advanced past it. Rounds 6 and 7 are re-reviews of an already-implemented capability — the case the rule does not anticipate. Regressing the row is destructive and carries no benefit, so the row is left at `implemented`. Flagged here rather than performed silently.

---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: PASS
review-round: 9
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 9
file-sha: d8ae8effc31222b353a34ab62c17507539cb493fe6fa54fe005e27dc4c702834
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** PASS
> **Round:** 9 — final round before operator handoff (rounds 1-3 and 6 BLOCKed; rounds 4, 5, 7 and 8 passed)
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Scope and Bar for This Round

This round was run at a deliberately raised bar: structural findings only, cosmetics let go, because the verdict goes to a human operator rather than into another revision cycle. Scope was the replaced Acceptance Criterion (line 98), the widened docs task row, the decoy-env-var wording on the end-to-end test row, and the new re-anchoring task row for `tests/skills/eval-default-rubric.test.mjs`. BEH-1 through BEH-12 have all passed review and were confirmed undisturbed.

Nothing structural was found. The single suggestion below is recorded for completeness and explicitly does not require action before planning.

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it read the full charter, `skills/eval/SKILL.md`, `templates/eval-config-template.yaml`, `docs/cli-reference.md`, `lib/profiles/index.mjs`, and `tests/skills/eval-default-rubric.test.mjs` from disk.

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

**Verdict:** PASS

Zero blockers, zero warnings, one suggestion.

### CON-1 — severity: suggestion

- **Location:** Acceptance Criteria, line 98
- **Finding:** The static test's scope (`skills/**`, `providers/**`, `docs/**`) does not cover a hand-edited `.context-index/evals/config.yaml` pointing its `rubric:` key at a resolved shipped-rubric path.
- **Recommendation:** Optionally note it as a known-scope limitation, or leave it for a future capability. Not required for this round.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict computed from post-cap findings across all reviewers. Zero blockers and zero warnings — only `suggestion` severity — gives the consolidated PASS in the header.

## Predicate Verification (verification point 1)

Both the orchestrator and the reviewer executed AC 98's predicate independently against the tree and agree exactly.

```
grep -rnE -- "--rubric[ =][^ ]*default-rubric\.yaml" skills/ providers/ docs/
```

**Result: exactly two matches** — `docs/cli-reference.md:851` and `:852` — which are precisely the two lines the docs task row is written to fix. The predicate terminates cleanly, matches nothing legitimate, and returns zero once that row lands. It is dischargeable as specified.

**The `--rubric` anchor is load-bearing, and confirmed tight enough.** Seven mentions of `default-rubric.yaml` live in the same scoped directories and must survive:

| Location | Why it is legitimate |
|---|---|
| `skills/eval/default-rubric.yaml:3` | The rubric file's own header comment naming where it ships |
| `skills/eval/SKILL.md:118` | Documents where the shipped rubric lives — descriptive prose, not a flag emission |
| `skills/eval/SKILL.md:288` | Config-block comment explaining what `default` resolves to |
| Both provider mirrors of lines 118 and 288 (4 lines) | Kept in sync by the parity gate |

A looser implementation — grepping for any occurrence of `default-rubric.yaml` in the scoped directories, dropping the `--rubric` anchor — would false-positive on all seven, including the rubric file's own self-reference, and the test could never pass. AC 98's phrasing ("any `--rubric` value whose path component ends in `default-rubric.yaml`") pins the narrow form, and `SKILL.md:118`'s survival after BEH-12 is unambiguous because it emits no argument.

This is the substantive difference from revision 8. The criterion is no longer an assertion a reader must adjudicate; it is a command with a determinate answer, and it becomes a test rather than a claim.

## The `.context-index/` Exclusion (verification point 2)

**Rated acceptable — not a blind spot worth acting on, and the reasoning is worth recording since the author asked to know now rather than discover it later.**

The candidate was `.context-index/evals/config.yaml`: a live input, not an archive, living under the excluded path, whose `rubric:` value the skill reads and forwards to `adev eval score --rubric`. Four facts settle it:

1. **The file does not exist in this repository** — `.context-index/evals/` holds only `model-routing-eval.md`. It is generated on demand by `/adev:eval --configure`.
2. **What generates it is safe.** `templates/eval-config-template.yaml` scaffolds `rubric: default`, the keyword, not a path.
3. **The predicate would miss it for two independent reasons**, not one: the directory exclusion, *and* the fact that the predicate is anchored on the literal `--rubric` flag while config.yaml carries a bare `rubric:` key. Removing the exclusion would therefore not catch it either — which means the exclusion is not the thing to change.
4. **The failure mode is loud, not silent.** If a user hand-wrote `rubric: skills/eval/default-rubric.yaml` into a consumer project's config, that path passes BEH-9 containment (it resolves under the project root) but no such file exists there, so the run fails on the read with a named error. It is a correctness footgun, not a containment or security gap, and it announces itself.

AC 98 scopes its verifiable claim explicitly to three shipped directories and does not claim to cover locally-generated, non-shipped config. That is the correct scope discipline — it is exactly what replaced revision 8's unbounded universal, and widening it again would reintroduce the defect this revision fixed. Recorded as CON-1 at suggestion severity for a future round if anyone wants defence in depth.

## New Material in Revision 9 (verification point 3)

Each of the four changes was checked against the live tree:

- **Docs task row (widened).** Confirmed both the broken example *and* the "every `--rubric` value is project-root-contained" signature prose are still present on disk — consistent with "required but not yet implemented", which is the correct state for a review-pending spec.
- **Decoy-env-var wording.** Checked against `getPluginRoot()` in `lib/profiles/index.mjs`; confirmed `__dirname`-derived with no environment fallback, matching BEH-11's citation exactly. The spawned-process `env:` requirement now pins the safe form rather than relying on the precedent of 20 of 21 files.
- **Re-anchoring task row.** Confirmed `tests/skills/eval-default-rubric.test.mjs` derives its regex from the still-surviving prose at `SKILL.md:118`, so the task is well-scoped and the test is not silently broken by BEH-12.
- **AC 98.** Verified above.

No structural defects found in any of them.

## Charter-Constraint Check

Both charter constraints this spec exists to honour are satisfied at revision 9:

- **Split-delta invariant** — honoured and untouched by revisions 6-9, which concern rubric resolution rather than scoring. The deterministic and judged halves remain separately addressable, and the number-or-status model keeps "earned nothing", "could not be judged" and "nothing to judge" distinguishable, which is what makes `judge-attributable` classification computable downstream.
- **ScoreComparison outcome set** — not re-opened at any point across nine rounds. `INSUFFICIENT_EVIDENCE` and `NOT_SCORED` are half-value statuses; `SCORE_DEFAULT_RUBRIC_MISSING`, `SCORE_INVALID_THRESHOLD` and the rest are error codes. No parallel outcome vocabulary was introduced.

## Charter Capability Map — Deliberate Deviation (unchanged from rounds 7 and 8)

Step 7 directs a passing verdict to set the parent charter's Capability Map row to `review-passed`. Not applied, for the third time and the same reason: the row for "Scoring engine and `adev eval score`" reads `implemented`, having advanced there legitimately after round 5 passed and the capability was built across 11 tasks and 12 commits. Writing `review-passed` over it would regress real lifecycle progress. The Step 7 rule assumes review precedes implementation; rounds 6-9 are re-reviews of an already-implemented capability, which it does not anticipate. The row is left at `implemented`, flagged rather than done silently.

**Operator note:** this is a genuine gap in `/adev:review-specs` Step 7, not a one-off. Any re-review of an already-implemented capability hits it. Worth an issue against the skill.

## Reviewer-Output Compliance

No blocker this round, so the mandatory `blocker_id` / `section_anchor` requirement went unexercised. Final tally across nine rounds: emitted correctly in rounds 1, 2 and 6; absent in round 3; untested in rounds 4, 5, 7, 8 and 9. Consistent with the intermittent-failure hypothesis on P1 `adev-plugin-quick-reviewer-blocker-id-s0et`, which remains open.

## Operator Handoff Summary

Nine rounds, converging monotonically and without regression: a contradiction in the scoring model; that fix incompletely applied; a boundary case at `threshold = 100`; a traceability gap; a section-ordering nit; then — after the spec was planned, implemented and failed validate — an integration defect whose fix reached the callee but not the caller; the caller obligation with unpinned provenance; a fourth emitter in the docs; an unverifiable criterion written to prevent a fifth; and finally a specified predicate that discharges cleanly. No defect was ever reintroduced once fixed at the root.

**Recommendation to the operator: proceed to `/adev:plan`.** The spec is behaviourally complete, its security boundary is pinned to an unforgeable source, its caller obligation is contractual, and its one universally-quantified claim has been replaced by an executable check.

Three open items travel with it, none blocking:

1. **CON-1** — `.context-index/evals/config.yaml` sits outside the predicate's scope by design. Loud failure mode; defence-in-depth only.
2. **Three framework defects** that made this review slower than it should have been, all open: `adev specify revise` cannot edit spec body content (`adev-plugin-revise-loop-no-content-edits-q6q0`), so every revision here was hand-made; `adev report --type step` stamps no revision (`adev-plugin-gkfv.3`), so all nine rounds project under `byRevision: {"1": ...}` with `lastReviewedRevision` unset; and the quick reviewer intermittently omits `blocker_id` (`adev-plugin-quick-reviewer-blocker-id-s0et`). Together they mean the automated review-block retry loop cannot currently converge unaided.
3. **The Step 7 re-review gap** described above.

The durable lesson, already being filed as a heuristic: the defect surfaces here were each caught by a different mechanism — validate, review, an orchestrator grep — and none by the test suite, because a suite running where `<ADEV_ROOT>` and the project root coincide is structurally blind to this class. Revision 9's answer, an executable predicate rather than a broader assertion, is the right shape of fix.

---

## Summary

**Total findings:** 1 (0 blockers, 0 warnings, 1 suggestion)
**Action required:** None. The spec is ready for `/adev:plan`. CON-1 is optional and can be recorded as a known-scope limitation or deferred.

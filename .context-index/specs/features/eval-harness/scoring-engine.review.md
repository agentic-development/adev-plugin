---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: PASS_WITH_NOTES
review-round: 8
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 8
file-sha: fdd58d532d330b289936d45efff9a28c74201fb4647235a5c0e2cd96c5cd517f
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Round:** 8 (revision 8; rounds 1-3 and 6 BLOCKed, rounds 4, 5 and 7 passed)
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Scope of This Round

Revision 8 closes round 7's two warnings and applies its suggestion. Scope was the amended BEH-12 final clause, new task-map row 72, the amended end-to-end test row 71, and Acceptance Criteria lines 96-97. BEH-1 through BEH-11 have passed review and were confirmed undisturbed.

Round 7 passed and opened the gate; the author re-opened it rather than editing past a PASS, the same call made after revision 5. Both remaining findings concern the *wording* of the new criteria, not the design.

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it was directed to read the full charter plus `skills/eval/SKILL.md`, `docs/cli-reference.md`, `docs/skill-reference.md`, `templates/eval-config-template.yaml`, the two rubric-related skill tests, `tests/lib/session-capture-tool-use.test.mjs`, `scripts/run-tests.mjs`, and `lib/session-capture.mjs` from disk.

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

Zero blockers. Two warnings, one suggestion.

### SA-1 — severity: warning

- **Location:** Acceptance Criteria, line 97
- **Finding:** AC 97 reads "No emitter of the `--rubric` argument anywhere in the repository passes a path to the shipped rubric — skill, provider mirrors, and `docs/cli-reference.md` all use the keyword." The shape is an unbounded universal followed by a bounded enumeration of three, and the two halves disagree. A repo-wide grep for the forbidden pattern matches beyond the three named surfaces — in archival review and validate artifacts that intentionally preserve historical quotes of the broken invocation. Read literally, "anywhere in the repository" is therefore perpetually false, or else requires a "live emitter versus archival record" judgment that no predicate in the spec draws. The enumeration is checkable; the universal prefix is not.
- **Recommendation:** Narrow AC 97 to the exact checkable set, or scope it to an explicit grep over `skills/**`, `providers/**`, and `docs/**` excluding `.context-index/`.

### SA-2 — severity: warning

- **Location:** Task-map row 72 / `docs/cli-reference.md` signature prose
- **Finding:** Row 72 changes only the example line. Verified on disk: the surrounding signature prose at lines 821-834 still states "`--rubric <path>` — a rubric YAML file, containment-checked against the project root", with no mention of the `default` keyword or the plugin-root containment branch BEH-11 adds. Once row 72 lands, the page shows `--rubric default` in an example sitting immediately below prose asserting that every `--rubric` value is a project-root-contained path — internally inconsistent, and describing a contract BEH-11 supersedes. AC 97 is framed around *emitters*, and prose describing the contract is not an emitter, so it does not catch this.
- **Recommendation:** Widen row 72 to update the `--rubric <path>` bullet so it describes the `default` keyword branch (BEH-11) alongside the path branch (BEH-9).

### SA-3 — severity: suggestion

- **Location:** Task-map row 71, end-to-end test
- **Finding:** Row 71 does not state that the decoy `CLAUDE_PLUGIN_ROOT` must be set per child process rather than by mutating `process.env` in place. Property (2) — plugin root outside the project root — almost certainly forces a spawned child in practice, which naturally aligns with the safe `env:`-option pattern that 20 of the 21 existing files use. But the spec does not say so, and the one exception (`tests/lib/session-capture-tool-use.test.mjs`) shows the in-process pattern already exists here.
- **Recommendation:** One-line implementation note pinning the safe form rather than relying on precedent.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict computed from post-cap findings across all reviewers. Zero blockers with at least one warning gives the consolidated PASS_WITH_NOTES in the header.

## Orchestrator Verification Notes

**1. SA-1's falsifier is real, and broader than the reviewer found.** Running the repo-wide grep independently, the forbidden pattern appears in four places outside `docs/cli-reference.md`, excluding session logs:

| Match | Nature |
|---|---|
| `.context-index/specs/features/eval-harness/scoring-engine.review.md:88-89` | Round 7's report, quoting the two doc lines as evidence |
| `.context-index/specs/features/eval-harness/scoring-engine.validate.md:92,101,103` | The validate report, quoting the failing invocation and its `UNSAFE_SCORE_PATH` output (an absolute-path variant the exact-string grep misses) |
| `.context-index/sessions/2026-08-20-c857b3f.md:22` | A session log |
| **`.context-index/specs/features/eval-harness/scoring-engine.spec.md:72`** | **Task-map row 72 itself**, which quotes the forbidden pattern in order to describe the fix |

The last one is the sharpest form of the finding and the reviewer did not reach it: **the spec that states AC 97 is itself a repository-wide match for the pattern AC 97 says appears nowhere.** Any literal grep check discharging AC 97 fails on the criterion's own document. This is not a reason to weaken the requirement — it is a precise demonstration that the universal quantifier is the wrong instrument, and that the author's stated preference for narrow-and-checkable over broad-and-aspirational should govern here.

Note also that the exact-string grep is itself insufficient: `validate.md:101` carries an absolute plugin-cache path ending in `skills/eval/default-rubric.yaml`, which a naive literal predicate would miss. Whatever check discharges AC 97 needs to be specified alongside the criterion, not left for a planner to invent.

**2. `docs/cli-reference.md` signature prose — SA-2 confirmed on disk.** Lines 821-834 read as the reviewer describes. Confirmed.

**3. `docs/cli-reference.md` still showing the old example is expected, not a defect.** Revision 8's job was to *require* the fix; row 72 performs it during implementation. Explicitly excluded from the verdict.

## Answers to the Five Verification Points

1. **AC 97 is aspirational as worded, not checkable.** The bounded enumeration is discharge-able; the unbounded prefix is falsified by archival artifacts and by the spec itself. See SA-1 and orchestrator note 1. The author's instinct to prefer narrow and checkable is correct and this is the case for acting on it.

2. **The decoy-env-var property does not introduce a flakiness source — the risk is contained, with one residual gap.** `scripts/run-tests.mjs` spawns `node --test <files...>`, and Node's test runner isolates per file by process, so the in-process `process.env` mutation in `tests/lib/session-capture-tool-use.test.mjs` cannot leak into the hook tests that read `CLAUDE_PLUGIN_ROOT` (`session-capture`, `session-start`, `session-end`, `pre-compact`, `lifecycle-gate-equivalence`) — different files, different processes. The new BEH-11 test lands in a different file again, and its own "plugin root outside the project root" property pushes toward a spawn-with-`env:` implementation, which is the pattern 20 of 21 existing files already use. Residual gap: the spec does not *mandate* the safe form. That is SA-3, a one-line fix.

3. **No fifth live emitter.** The four known surfaces (skill, two provider mirrors, `docs/cli-reference.md`) remain the complete live set. Everything else swept came back clean or benign:
   - `templates/eval-config-template.yaml` already scaffolds `rubric: default` — correct, not an emitter of the forbidden pattern.
   - `docs/skill-reference.md:470` documents the *skill's* `--rubric <path>` flag and passes no shipped-rubric path.
   - `tests/skills/eval-layer3-scoring-verb.test.mjs:9` asserts only `/adev eval score/` — passes either way, so it neither emits nor guards.
   - `tests/skills/eval-default-rubric.test.mjs` derives the rubric path *from SKILL.md prose* rather than hardcoding it. Worth flagging to the implementer, not as a defect: BEH-12 changes that prose, so this test either breaks or silently stops testing what its header says it exists to test. Its own comment — that a test hardcoding the path "would still pass if the skill later pointed somewhere else, which is the exact drift being fixed" — makes it the test most likely to need attention when BEH-12 lands.
   - What the grep *did* surface repo-wide is archival, and its significance is to SA-1 rather than to the emitter set.

   Standing caveat, unchanged: four surfaces were each found by a different mechanism and none by the test suite, so "no fifth emitter" is a statement about what this sweep reached, not a proof of completeness. The durable fix is the mechanical check SA-1 asks for — a specified predicate, run by something, beats another careful manual sweep.

4. **The two adjacent gaps:** (a) the `docs/cli-reference.md` signature prose is a **real gap**, promoted to SA-2. (b) the config-key nesting mismatch (`llm_judge.rubric` in the template versus the skill's flat `rubric:` reference) is a **non-issue for this spec** — pre-existing, unrelated to the shipped-default path, and harmless because the config route and the step-3 fallback resolve to the same outcome when the nested key is missed. Out of scope; worth a separate issue if anyone wants the resolution order and the template to agree.

5. **Round 7's warnings are closed at the source, not relocated.** SEC-1 is answered by test property (4) on row 71. Orchestrator note 3 is answered by row 72 plus AC 97 — though row 72's scoping leaves the prose inconsistency SA-2 names. SA-1 of round 7 is applied: BEH-12 now cites `tests/sync/provider-skill-parity.test.mjs` by name. No new defect in the round-8 diff beyond the two warnings.

## Charter-Constraint Check

Both charter constraints remain satisfied at revision 8 and neither is implicated in any finding:

- **Split-delta invariant** — untouched by revisions 6-8, which concern rubric resolution rather than scoring. The halves remain separately addressable.
- **ScoreComparison outcome set** — not re-opened. No new outcome names; `SCORE_DEFAULT_RUBRIC_MISSING` and `SCORE_INVALID_THRESHOLD` are error codes.

## Charter Capability Map — Deliberate Deviation (unchanged from round 7)

Step 7 directs a passing verdict to set the parent charter's Capability Map row to `review-passed`. Not applied, for the same reason recorded in round 7: the row for "Scoring engine and `adev eval score`" reads `implemented`, having advanced there legitimately after round 5 passed and the capability was built across 11 tasks and 12 commits. Writing `review-passed` over it would regress real lifecycle progress. The Step 7 rule assumes review precedes implementation; rounds 6-8 are re-reviews of an already-implemented capability, which it does not anticipate. The row is left at `implemented`, flagged rather than done silently.

## Reviewer-Output Compliance

No blocker this round, so the mandatory `blocker_id` / `section_anchor` requirement went unexercised. Across eight rounds the fields were emitted correctly in rounds 1, 2 and 6, absent in round 3, and untested in rounds 4, 5, 7 and 8 — still consistent with the intermittent-failure hypothesis on P1 `adev-plugin-quick-reviewer-blocker-id-s0et`.

## Process Note

The heuristic being filed from round 7 — that the surfaces were each caught by a different mechanism and none by the test suite — gets a further data point here, in an unexpected direction. Revision 8's response to that blindness was to write a universal criterion ("no emitter anywhere"), and the criterion turns out to be unfalsifiable by grep because the repository archives its own history, including inside the spec that states it. The lesson generalises: when the answer to "we keep missing surfaces" is a broader assertion, the assertion needs its checking predicate specified in the same breath, or it converts a known gap into an unverifiable claim.

Two framework defects remain open and still block the automated path: `adev specify revise` cannot edit spec body content (`adev-plugin-revise-loop-no-content-edits-q6q0`), and `adev report --type step` stamps no revision (`adev-plugin-gkfv.3`), so all eight rounds project under `byRevision: {"1": ...}` with `lastReviewedRevision` unset.

---

## Summary

**Total findings:** 3 (0 blockers, 2 warnings, 1 suggestion)
**Action required:** None blocking; the spec is ready for `/adev:plan`. Two cheap edits are worth folding in first: narrow AC 97 to a scoped, mechanically checkable predicate (SA-1 — note it is currently falsified by the spec's own task-map row 72), and widen task row 72 to update `docs/cli-reference.md`'s signature prose as well as its example (SA-2). SA-3 is a one-line note pinning the decoy env var to a per-child-process form. Separately, flag `tests/skills/eval-default-rubric.test.mjs` to the implementer: it derives the rubric path from SKILL.md prose that BEH-12 changes.

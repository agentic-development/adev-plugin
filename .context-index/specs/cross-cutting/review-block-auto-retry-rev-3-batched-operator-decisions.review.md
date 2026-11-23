---
spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.spec.md
charter: (cross-cutting amendment — no parent charter)
date: 2026-11-22
verdict: PASS_WITH_NOTES
rigor-tier: full
last-reviewed-revision: 4
file-sha: f26b88d0a4f92c1f44eb8ea16d537367ce33200aac028d3605e4cf905d2f8088
findings-total: 25
blockers: 0
warnings: 11
suggestions: 14
---

# Architecture Review: review-block-auto-retry-rev-3-batched-operator-decisions (round 4)

> **Date:** 2026-11-22
> **Spec:** .context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.spec.md (revision 4)
> **Charter:** none (cross-cutting amendment of review-block-auto-retry.spec.md, target rev 3; reviewed with reduced context, no parent charter)
> **Rigor tier:** full
> **Verdict:** PASS_WITH_NOTES. There are 0 blockers, 11 warnings and 14 suggestions.
> **Diff scope:** `diff-scoped` (BEH-8). Changed anchors: amendment rationale, behavioral delta (added and amended), postconditions, error cases, system constitution reference, module impact map, integration points, actionable task map, known gaps, acceptance criteria.
> **Prior round:** revision 3 was BLOCKed with 3 blockers covering two defects. Every reviewer that addressed them confirms both are resolved. (1) The truncation marker (prior CON-1 and RI-1): BEH-2 now redacts, truncates with the single-line `…[truncated]` marker, then runs the gate on the truncated value. (2) The unbounded no-flag ask round (prior TR-1): BEH-4 bounds the round at ceil(n/4) structured calls plus at most one message, and an unanswered question stays open with the verdict BLOCK. The round-3 recurring warnings are reported closed: CON-2 to CON-11, WR-2 to WR-6, BD-1 to BD-4 and TR-2.
> **Operator-settled decisions:** rev-1 CON-1 (answers live on `.blockers.md`, `adev specify revise` is the sole writer of `## Decisions of Record`, ADR-0012 complied with and not amended) and rev-1 BD-2 (spec-body decision entries trusted, writers guarded structurally). This round they reached reviewers only through the prior-round report fence, not as an orchestrator `--note`. No reviewer re-raised either choice. CON-2 below touches the ADR-0012 producer column. Only its first remedy (state that the producer column is informational and that the closed-peer rule is what binds) is consistent with the settled decision. Its alternative remedy, an ADR amendment, is excluded by that decision.
> **Registry warnings:** `BROADEN_TOOL` (profile `browser-review` adds mcp_server `playwright`), `BROADEN_TOOL` (profile `browser-review` adds category `web-fetch`), `BROADEN_NETWORK` (profile `browser-review` network `deny` → `read-only`). None of them affects a reviewer dispatched in this round.
> **Dispatch note:** `adev governance dispatch --tier full` (no `--module`: the spec has no `charter:` field, so no heuristics were attached) produced each reviewer's plan prompt. Each prompt was 94–340 KB, too large to inline in an Agent call, so it was delivered verbatim through a file the reviewer read in full. Plan model ids were mapped to the harness model aliases (haiku, opus, sonnet). The harness ran the dispatches as background tasks, and the orchestrator waited for every one to complete before consolidating. The consistency and termination reviewers labelled the spec "revision 3" in their headers. Their findings cite revision-4 text (the single-line marker, the ceil(n/4) bound), so this is a label slip only.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md (triggered, score=3 ≥ 1) |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES (0 blockers, 2 warnings, 2 suggestions)

Prior CON-1 (truncation marker) and TR-1 (ask round) are resolved. Prior CON-2 to CON-14, RI-2, WR-2 to WR-6, BD-1 to BD-7, TR-2 and TR-3 are addressed in the current text and not re-raised.

- **CON-1** | warning | module-boundary | `behaviors-added`, `module-impact-map-delta`: BEH-2 requires `adev blockers write --json` to return `decisionsRequired` with `question` "falling back to the BEH-3 derived question when none was stored". BEH-3 places derivation in `lib/decisions.mjs`, and the Module Impact Map says `lib/decisions.mjs` writes answer keys through `lib/blockers-writer.mjs`. Together these imply an unacknowledged circular dependency between `blockers-writer` and `decisions`. **Recommendation:** name the owner of the derived-question function. Either move it into a leaf helper both modules import, or state that `decisionsRequired` carries `question` only when one is stored and the verb layer adds the derived value.
- **CON-2** | warning | adr-compliance | `integration-points-delta`, `module-impact-map-delta`: the spec says `adev decisions record` becomes a second producer of `.blockers.md` and calls this "a documentation update to the table, not a rule change". ADR-0012's Permitted peers table (line 61) lists `/adev:build` Step 1 as the sole producer. Line 64 closes the peer set. Lines 99 and 125 describe each peer as having "a different producer skill". The file stays inside the closed set, so this is not a blocker. **Recommendation:** state in the spec that the ADR's producer column is informational and that the closed-peer rule (line 64) is what binds, citing it. (The reviewer's alternative, an ADR-0012 amendment, is excluded by the operator-settled rev-1 CON-1 decision.)
- **CON-3** | suggestion | contract | `error-cases-delta`, `behaviors-added`: `SPLICE_VALIDATION_FAILED` is used both as a per-anchor advisory and as an exit-1 whole-revise abort (the BEH-9 byte-identity check). **Recommendation:** give the whole-revise abort its own code, or state that the code's severity depends on scope. This overlaps RI-2.
- **CON-4** | suggestion | terminology | `behaviors-added`, `error-cases-delta`: `decisionsRequired` entries use `section_anchor`, but the `.review.md` table column is `section`. `DECISION_TEXT_REJECTED` is worded "a line beginning with" in the Error Cases row and "value begins with" in BEH-2. **Recommendation:** align the column name, or document the rename once, and use one wording.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES (0 blockers, 2 warnings, 0 suggestions)

Prior RI-1 (truncation marker) and RI-2 (`NO_REVIEW_SIDECARS` scope) are resolved. The reviewer verified each named referent at file:line, including `_redactForBlockers`, `truncateProse`, `renderRemedyRef`, `parseBlockerId`, `parseBlockersSidecar`, `groupBlockersByAnchor`, `validateAuthoredBody`, the `group-blockers` output fields, the build loop codes, ADR-0012's peer table and all 8 reviewer prompts. It also confirmed that none of the 10 new error codes collides with an existing one.

- **RI-1** | warning | `behaviors-added` (BEH-2, BEH-3, BEH-4), Integration Points "Shared helpers", Module Impact Map: the spec says render paths "reuse `renderRemedyRef`" for stripping. Called as written, `lib/governance/remedy-ref-render.mjs:35-57` also truncates any value over 256 characters (`MAX_LEN = 256`, marker `...`). A 500-character `question` or a 300-character `implications` would be cut in the `## Decisions Required` table and in the ask round. Only `renderRemedyRef` is exported, and the strip regexes are module-private. **Recommendation:** either state that display is additionally capped at 256 characters, or name a new strip-only export and add it to the Module Impact Map.
- **RI-2** | warning | `behaviors-added` (BEH-9), `error-cases-delta`, `module-impact-map-delta`: the spec labels `SPLICE_VALIDATION_FAILED` an "existing code" in its whole-revise abort role. At `lib/specify-revise.mjs:572` and `:634` it is only pushed into `advisories`, and it is absent from the `@throws` list (lines 453–454). **Recommendation:** say that the code gains a second, fatal use (thrown, exit 1) alongside its advisory use, or mint a distinct code for the post-compose byte-identity abort.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES (0 blockers, 1 warning, 8 suggestions)

Prior WR-2 to WR-6 are each now backed by an acceptance criterion (the end-to-end integration AC, the authoring-dispatch AC, the build contract-test AC, the advisory ACs, the `## Decisions Required` table AC), and none is re-raised.

- **WR-5** | warning | `behaviors-added` (BEH-4, BEH-7): build passes `--defer-decisions`, and the `--auto` halt names `adev decisions record`, then `/adev:build --resume`. Nothing states or tests that `--resume` picks up the recorded answers (sidecar `decision_choice`) and proceeds through `group-blockers` into authoring. The contract test checks only the message text, and `BLOCKERS_REVISION_MISMATCH` is not tied to the resume path. **Recommendation:** state which step `--resume` re-enters after answers are recorded, and add a test that `--resume` with recorded answers reaches `group-blockers` and revise.
- **WR-1** | suggestion | BEH-1 to BEH-4: the `question`/`options` producer-to-consumer chain is complete but spread across four behaviors. **Recommendation:** optionally state it once.
- **WR-2** | suggestion | BEH-2, BEH-4: `decisionsRequired` and the `## Decisions Required` table are fully wired and tested. No action.
- **WR-3** | suggestion | BEH-5, BEH-6: the answer keys are wired and tested. `decision_recorded` is read only for display. **Recommendation:** optionally say it is audit-only.
- **WR-4** | suggestion | BEH-3: the `decided` list from `pending` has no named runtime reader. Only the operator and the integration AC observe it. **Recommendation:** name the operator or skill as its consumer, or accept it as display-only.
- **WR-6** | suggestion | Module Impact Map, Task 10: the ADR-0012 peer-table note is documentation, not runtime state. Noted for completeness.
- **WR-7** | suggestion | Module Impact Map, Tasks 1–2: `lib/decisions.mjs`, `lib/cli/decisions.mjs` and the `pending`/`record` verbs are fully wired, and registration in `cli/index.mjs` is named. No action.
- **WR-8** | suggestion | BEH-1, BEH-8: the 8 reviewer prompt edits are wired and covered by the prompt-contract AC. No action.
- **WR-9** | suggestion | `error-cases-delta`: all five advisory codes have ACs, which closes the prior WR-5 gap. No action.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES (0 blockers, 4 warnings, 3 suggestions)

The spec weakens no existing containment, consent or validation contract. It adds no subprocess or command string. Unanswered questions stay open, which fails closed, and `--auto` never records an answer.

- **BD-1** | warning | path containment | BEH-3, BEH-5, Error Cases (`INVALID_SPEC_PATH`): "realpath containment" is not tied to `assertContained` (`lib/extensions/exec-payload.mjs`). No lexical pre-check is stated, and an unresolvable candidate (ENOENT or a broken symlink) is not said to be refused. `pending` with an absent sidecar cannot realpath the derived path, so containment there is undefined. **Recommendation:** reuse `assertContained`. For an absent sidecar, realpath the parent directory and check the derived name lexically. For `record`, refuse an unresolvable candidate.
- **BD-2** | warning | path containment | BEH-3, BEH-5, BEH-9: containment is "inside the project root" only, and `--spec` is not restricted to `.context-index/specs/**/*.spec.md`. A crafted `--spec` pointing at any in-root `.md` file could get a `## Decisions of Record` section written into it. **Recommendation:** require the spec path to resolve under `.context-index/specs/` and end in `.spec.md`, or refuse with `INVALID_SPEC_PATH`.
- **BD-3** | warning | destructive operations | BEH-9: "re-deciding a blocker already named in the section replaces that entry in place", but the byte-identity check exempts the whole section and an entry's extent is not defined. A malformed bullet could swallow adjacent lines. Re-deciding one member of a `duplicate_of` group could overwrite the other members' choice. **Recommendation:** define an entry as exactly the marker line plus the one following bullet line. Refuse, preserve verbatim and advise when that shape does not hold. State the multi-blocker case, and check that the section's other entries stay byte-identical.
- **BD-4** | warning | artifact leakage | BEH-5, Integration Points: the spec does not say whether `.blockers.md` is committed or gitignored. Nothing says the redaction set is checked against operator free text (`note`, `choice`, `implications`) before it reaches the committed spec body. **Recommendation:** state the sidecar's git status. State that answer text reaches the committed spec only after redaction, and name the review point (an operator preview or the PR).
- **BD-5** | suggestion | privilege posture | BEH-5, Known Gaps: any agent that can run `adev decisions record` can settle a `decision` blocker. The spec accepts this risk explicitly. **Recommendation (optional hardening):** record a `decision_source` field, or have `--auto` flows refuse `record` without an explicit operator flag.
- **BD-6** | suggestion | input trust | BEH-4, BEH-2: `|` is escaped at render, but a `\` before `|` renders as `\\|`, which GFM can read as an unescaped pipe. **Recommendation:** refuse `|` and `\` in the five decision fields, or escape `\` before `|`.
- **BD-7** | suggestion | path containment | BEH-5, BEH-9: containment is checked at validation time, but the rename happens later, leaving a symlink-swap window. **Recommendation:** re-run `assertContained` immediately before each temp-then-rename.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES (0 blockers, 2 warnings, 1 suggestion)

Constructs in scope: the review-specs Step 8 ask round (BEH-4), the build interactive ask round and its retry-bounded cycle (BEH-7), and the `NOTHING_TO_REVISE` / `LOOP_NO_PROGRESS` exit (BEH-6). Prior TR-2 (retry accounting) and TR-3 (no-progress exit) are resolved. Prior TR-1 is resolved for the no-answer, error and no-reply paths.

- **TR-1** | warning | `behaviors-added` (BEH-4): the residual gap is a structured-question call that never returns. The "nothing waits" and "no timeout exists" claims depend on the harness tool returning, and BEH-4 does not say what happens if it blocks indefinitely in a headless session. **Recommendation:** name a failure disposition for a non-returning call, or state that the skill must not invoke the structured tool when no operator is present.
- **TR-2** | warning | `behaviors-added` (BEH-4, BEH-3): the ceil(n/4) bound is stated, but n (pending decision groups per review) is never capped, so the call count has no concrete maximum. **Recommendation:** state a maximum number of decisions asked per round, and the overflow disposition (for example, overflow stays open and is listed in the BLOCK summary).
- **TR-3** | suggestion | `behaviors-added` (BEH-6, BEH-7), `error-cases-delta`: the ask round's cap, cap-trip and unattended rules are spread across BEH-4, BEH-6, BEH-7, the Error Cases rows and Known Gaps, and "interactive mode" is undefined. Both paths fail closed. **Recommendation:** consolidate these rules in one behavior, and define "interactive mode" in terms of the `--auto` flag.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated*
> verdict in the header above, computed from post-cap findings across all
> reviewers. No severity cap demoted any finding in this round (every
> dispatched reviewer's `severity_cap` is `blocker`).

---

## Summary

**Total findings:** 25 (0 blockers, 11 warnings, 14 suggestions)
**Action required:** None before planning. The spec is `review-passed`. Proceed to `/adev:plan --spec .context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.spec.md`. The 11 warnings carry forward into the plan's `## Review Notes`, each assigned to the task that touches its section. Several warnings cluster: path containment (BD-1, BD-2), the in-place DEC entry replacement (BD-3), the `SPLICE_VALIDATION_FAILED` dual role (RI-2, with CON-3), the display cap from `renderRemedyRef` (RI-1), the `--resume` path (WR-5), and the ask round's non-returning call and per-round cap (TR-1, TR-2). Another revise-and-review round is not recommended.

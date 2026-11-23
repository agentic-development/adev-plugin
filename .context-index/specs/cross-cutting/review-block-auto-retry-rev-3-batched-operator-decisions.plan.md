<!-- partial_schema: plan@1 -->

# Implementation Plan: Amendment — Auto-Retry Loop on Review BLOCK, Batched Operator Decisions (targeting rev 3)

> **Methodology:** adev
> **Charter:** cross-cutting (affects: `review`, `spec-lifecycle`, `strategic-planning`, `agent-reliable-state-artifacts`). No parent charter. This amends `review-block-auto-retry.spec.md` and builds on rev 2 (`review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md`).
> **Spec:** `.context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.spec.md` (revision 4, target-revision 3, tracker `adev-plugin-lifecycle-cycle-time-qa41.5`)
> **Review:** PASS_WITH_NOTES (2026-11-22). 0 blockers, 11 warnings and 14 suggestions across 5 dispatched reviewers (consistency-analyzer, referent-integrity, wiring-reviewer, boundary-reviewer, termination-reviewer). See `.review.md`. Every warning is assigned to a task in `## Review Notes`.
> **Platform:** JavaScript (ESM, `.mjs`), Node.js, npm, node:test. Zero runtime dependencies.
> **Implementation mode:** tdd
> **Risk level:** medium

**Goal:** Turn a review BLOCK's `decision` findings into one batched operator ask round. Reviewers state a `question` and `options` with implications. `adev decisions pending|record` lists open decisions and records answers on the `.blockers.md` sidecar. `adev specify revise` authors the answered blockers into the spec and writes a `## Decisions of Record` section, which later reviewers treat as settled.

**Architecture:** The text rules are shared by three gates: reviewer input at `adev blockers write`, operator input at `adev decisions record`, and the re-check at `adev specify revise`. They live in a new leaf module, `lib/decision-text.mjs`, which imports nothing from `blockers-writer` or `decisions`. That breaks the cycle CON-1 flagged. A second leaf, `lib/decisions-of-record.mjs`, owns the section's fence-aware location, marker grammar, entry extent, `DEC-<n>` allocation and in-place replacement as pure functions. `lib/decisions.mjs` composes the two with `lib/blockers-writer.mjs` (sidecar I/O) and `lib/specify-revise.mjs::parseBlockersSidecar` to implement `pending` and `record`. `lib/cli/decisions.mjs` wraps it as `adev decisions`. `reviseSpec()` gains the Decisions of Record write inside its existing temp-then-rename, plus a fatal post-compose byte-identity check. The skill surfaces stay markdown. Review-specs Step 8 gains a bounded ask round, loaded by progressive disclosure, and build's loop gains the orchestrator-run ask round and the `--defer-decisions` dispatch flag. Each skill names a verb, never a lib import, so the runtime decisions live in the verbs.

---

## File Structure

**Create:**
- `lib/decision-text.mjs`: a leaf module that imports only `lib/blocker-id.mjs`. It holds the field bounds (`question` 500, `label` 60, `implications` 300, `choice`/`note` 1,000), the code-point truncation with the single-line `…[truncated]` marker, and the unsafe decision text gate (`\p{C}`, U+2028/U+2029, a leading `---`/`#`, a triple backtick, `<!--`, `-->`, `**`). It also holds the reviewer-field pipeline (redact → truncate → gate, with the redactor injected), question normalization, the derived question and its neutral `Which option resolves blocker <id>?` fallback, the ≤12-character header, and (Task 2) the `## Decisions Required` table renderer.
- `lib/decisions-of-record.mjs`: a pure leaf with no I/O. It locates headings fence-aware (`## Decisions of Record`, `## Acceptance Criteria`). It parses `<!-- adev:decision DEC-<n> blockers=… -->` markers, where an entry is exactly the marker line plus the one following `- **DEC-<n>** — …` line, and preserves malformed lines verbatim. It allocates `DEC-<n>` as the highest present plus 1, malformed lines included. It also composes entries, replaces them in place, and places the section.
- `lib/decisions.mjs`: path resolution and containment for the spec, the derived sidecar and `--answers @path`. It reuses `assertContained` (`lib/extensions/exec-payload.mjs`) and restricts specs to `.context-index/specs/**/*.spec.md`. It computes `pending` (`pending` / `answered` / `decided`, ordering, `structured`, `header`, `duplicate_of`, and the per-round ask cap). It validates `record` input and delegates the byte-surgical sidecar write to `lib/blockers-writer.mjs`.
- `lib/cli/decisions.mjs`: the `adev decisions pending --spec <p> [--json]` and `adev decisions record --spec <p> --answers <json|@path> [--json]` verbs, plus `help()`.
- `tests/lib/decision-text.test.mjs`, `tests/lib/decisions-of-record.test.mjs`, `tests/lib/decisions.test.mjs`, `tests/cli/decisions.test.mjs`: new unit and CLI suites.
- `tests/integration/decisions-end-to-end.test.mjs`: traces `record` → `pending` → `group-blockers` → `revise` → `DEC-<n>` → `pending` `decided`, plus the resume-shaped re-entry (WR-5).
- `tests/skills/review-specs-decisions-ask-round.test.mjs`: a contract test over review-specs' frontmatter `allowed-tools`, its Arguments table, Step 8 and the ask-round reference.
- `tests/skills/build/blocker-loop-decisions.test.mjs`: a contract test that build passes `--defer-decisions` on every review dispatch, that the loop runs pending → record → group-blockers in that order, that the `--auto` halt text is present, and that the resume re-entry is specified.
- `skills/review-specs/references/steps/step-8-decision-ask-round.md`: the bounded ask round (BEH-4), loaded on demand from Step 8 so the SKILL.md body stays inside the size guidance.

**Modify:**
- `lib/governance/remedy-ref-render.mjs`: export a strip-only `stripForDisplay(value)` (ANSI CSI plus C0/C1/U+2028/U+2029 removal, no length cap). `renderRemedyRef` becomes `stripForDisplay` plus its existing 256-character cap, unchanged in behavior. This is a configured sensitive path (`lib/governance/**`).
- `lib/blockers-writer.mjs`: in the render loop (`writeBlockers`, lines ~389-426), persist `question` and `options` on `decision` entries. Emit the `DECISION_TEXT_REJECTED`, `OPTIONS_REJECTED` and `DECISION_FIELDS_IGNORED` advisories, return `decisionsRequired` beside `externalRemedies`, and drop reviewer-supplied answer keys. Add `readSidecarRevision(text)` and `writeDecisionAnswers(projectRoot, specPath, answers)`. The latter edits only the answer-key lines inside each named entry's YAML fence and writes atomically.
- `lib/specify-revise.mjs`: `parseBlockersSidecar` (lines 177-214) reads `question`, `options`, `decision_choice`, `decision_note` and `decision_recorded` with `JSON.parse`. `groupBlockersByAnchor` (263-321) groups answered `decision` entries. `validateAuthoredBody` (339-346) refuses `<!-- adev:decision`. `reviseSpec` (479-699) refuses `decisions-of-record` as an authoring target and writes the section inside the same temp-then-rename. It also runs the `UNSAFE_DECISION_TEXT` re-check and a fatal `SPLICE_VALIDATION_FAILED` byte-identity check, and updates the `@throws` doc (453-454).
- `lib/cli/specify.mjs`: `runGroupBlockers` (227-312) attaches `decisions` to anchors and filters `decision_blocker_ids`. The revise error mapping (~186-197) maps `UNSAFE_DECISION_TEXT` and the fatal `SPLICE_VALIDATION_FAILED` to exit 1. Help text is updated.
- `lib/cli/blockers.mjs`: the non-JSON output prints one `Decision required for <id> (<anchor>): <question>` line per `decisionsRequired` entry. The `--json` output already serializes the whole result.
- `cli/index.mjs`: register `["decisions", () => import("../lib/cli/decisions.mjs")]` in the verb table (~line 2149).
- `skills/review-specs/{structural-architect,security-reviewer,consistency-analyzer,boundary-reviewer,referent-integrity,termination-reviewer,wiring-reviewer,quick-synthesized-reviewer}-prompt.md`: add the `question`/`options`/follow-on instruction (BEH-1) and the settled-decision rule (BEH-8) to each prompt's `finding_class` section.
- `skills/review-specs/SKILL.md`: `allowed-tools` gains `AskUserQuestion`, the Arguments table gains `--defer-decisions`, and Step 8's BLOCK branch gains a pointer to the ask-round reference.
- `skills/review-specs/references/steps/step-5-consolidate-findings.md` gets the `## Decisions Required` table, filled from `decisionsRequiredTable`. `step-6-events-and-report.md` gets the `question`/`options` passthrough onto the `adev blockers write` findings array.
- `skills/specify/references/revise-mode-authoring-dispatch.md`: pass each anchor's attached `decisions` to its author as a binding instruction (BEH-6).
- `skills/build/references/blocker-auto-retry-loop.md`: step 4's `DECISION_REQUIRED` branch becomes the interactive ask round, run by the top-level orchestrator. It covers `LOOP_BUDGET_EXHAUSTED` with open decisions, the `--auto` halt message, and the resume re-entry point (WR-5).
- `skills/build/references/pipeline/step-1-review.md`: dispatch `/adev:review-specs` with `--defer-decisions`.
- `skills/build/references/resume-mode.md`: a review step that failed `DECISION_REQUIRED` resumes at loop step 4 (`group-blockers`), not at a fresh review dispatch (WR-5).
- `tests/lib/blockers-writer.test.mjs`, `tests/cli/blockers-write.test.mjs`, `tests/lib/specify-revise.test.mjs`, `tests/cli/specify-revise.test.mjs`, `tests/cli/specify-group-blockers.test.mjs`, `tests/skills/review-specs-finding-class-prompts.test.mjs`, `tests/lib/governance/remedy-ref-render.test.mjs`: extended.
- `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md`: in the Permitted peers table (line 61), the `.blockers.md` row's Producer names `adev decisions record` beside the BLOCK path. A sentence states that the producer column is informational and that the closed-peer rule (line 64) is what binds (CON-2).
- `docs/cli-reference.md` gets the new `decisions` verb section and the `blockers write` `decisionsRequired` output. `docs/skill-reference.md` gets review-specs `--defer-decisions` and the ask round.
- `providers/*/skills/**`: regenerated with `node scripts/sync-provider-skills.mjs`.

**Reference (read, do not modify):**
- `lib/extensions/exec-payload.mjs:158-201`: `assertContained`, which does a lexical pre-check, then realpath, and refuses anything unresolvable. BD-1 reuses it.
- `lib/partial-artifact.mjs:193-215`: `assertWithin`, the lexical-only containment `reviseSpec` uses today.
- `lib/blocker-id.mjs:113`: `parseBlockerId`, which validates marker ids and the neutral question's id.
- `lib/section-anchors.mjs`: `HEADING_RE`, `slugifyHeading`, `listSections` and `resolveSectionAnchors`. These are not fence-aware, so `lib/decisions-of-record.mjs` adds its own fence tracking.
- `lib/cli/review-notes.mjs`: the CLI verb shape to mirror (`run({ projectRoot, argv })`, `help()`, `parseArgs`, `--json`).
- `skills/hygiene/SKILL.md`: the progressive-disclosure reference pattern for the Step 8 ask-round reference.
- `.context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md`: rev-2 BEH-1 (the `finding_class` taxonomy), BEH-2 (`DECISION_REQUIRED`) and BEH-5a (per-anchor splice refusal), which this amendment extends.

---

## Context Packets

The spec has no `source-manifest`, so the packets fall back to the Module Impact Map and the files read while planning. "Spec" below is `.context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.spec.md`. "Review" is its `.review.md`.

### Task 1 Context
- Spec: BEH-2 (the redact → truncate → gate order, the single-line marker, the gate's character set, and the render-path stripping), BEH-3 (the derived question and neutral fallback, the ≤12-character header, normalized-question equality), Integration Points "Shared helpers". AC 1 and AC 2.
- Source files: `lib/governance/remedy-ref-render.mjs` (full; 57 lines), `lib/blocker-id.mjs:113-128` (`parseBlockerId`), `lib/blockers-writer.mjs:176-212` (`_redactForBlockers`, `truncateProse`, to see what NOT to reuse for truncation)
- Test: `tests/lib/governance/remedy-ref-render.test.mjs` (signatures)
- Boundary rules: `lib/governance/**` is a configured sensitive path, so keep the `renderRemedyRef` output byte-identical
- Review notes: CON-1, RI-1 (see ## Review Notes)

### Task 2 Context
- Spec: BEH-1, BEH-2 (all), BEH-5 (the answer-key persistence half and the sole-writer rule), the Error Cases rows for `OPTIONS_REJECTED` / `DECISION_FIELDS_IGNORED` / `DECISION_TEXT_REJECTED`, Integration Points "rev-2 sidecar contract" and "Shared helpers" (`|` escaping in the table renderer). AC 1-4.
- Source files: `lib/blockers-writer.mjs` (full), `lib/specify-revise.mjs:149-214` (`parseBlockersSidecar`, `decodeRemedyRef`), `lib/cli/blockers.mjs:68-157`, `lib/decision-text.mjs` (from Task 1; this task adds `renderDecisionsRequiredTable`)
- Review: suggestion BD-6 (escape `\` before `|` in the table renderer)
- Test: `tests/lib/blockers-writer.test.mjs`, `tests/cli/blockers-write.test.mjs`, `tests/lib/specify-revise.test.mjs`, `tests/lib/decision-text.test.mjs` (signatures)
- Depends on: Task 1

### Task 3 Context
- Spec: BEH-9 (the marker format, entry composition, `DEC-<n>` allocation, in-place replacement, `DECISION_MARKER_MALFORMED`, fence-aware placement), BEH-3 (`decided` parsing), and the Error Cases row for `DECISION_MARKER_MALFORMED`. AC 7 and AC 13.
- Source files: `lib/section-anchors.mjs` (full; 83 lines), `lib/blocker-id.mjs` (full)
- Review: BD-3 (Boundary Reviewer), which defines entry extent and the multi-blocker re-decide case
- Review notes: BD-3 (see ## Review Notes)

### Task 4 Context
- Spec: BEH-3 (all), BEH-5 (all), Preconditions Delta, Postconditions Delta bullet 1, and the Error Cases rows for `UNSAFE_DECISION_TEXT`, `UNKNOWN_DECISION_BLOCKER`, `NOT_A_DECISION_BLOCKER`, `NO_REVIEW_SIDECARS`, `BLOCKERS_REVISION_MISMATCH`, `INVALID_DECISION_ANSWERS` and `INVALID_SPEC_PATH`. Also Known Gaps "Any agent that can run…". AC 6-8, AC 10 and AC 11.
- Source files: `lib/extensions/exec-payload.mjs:136-201` (`assertContained`, full), `lib/decision-text.mjs` (Task 1), `lib/blockers-writer.mjs` `readSidecarRevision` / `writeDecisionAnswers` / `_redactForBlockers` (Task 2), `lib/specify-revise.mjs::parseBlockersSidecar` (Task 2), `lib/decisions-of-record.mjs` (Task 3), `lib/section-anchors.mjs::listSections`
- Review: BD-1, BD-2, BD-4 (Boundary Reviewer) and TR-2 (Termination Reviewer)
- Review notes: BD-1, BD-2, BD-4, TR-2 (see ## Review Notes)
- Depends on: Tasks 1, 2, 3

### Task 5 Context
- Spec: BEH-3 and BEH-5 (the CLI surface, the `--json` `advisories` array), System Constitution Reference "Error handling". AC 6-8, AC 10 and AC 11.
- Source files: `lib/cli/review-notes.mjs` (full, the verb-shape sample), `cli/index.mjs:2135-2165` (the verb table), `lib/decisions.mjs` (Task 4)
- Test: `tests/cli/blockers-write.test.mjs` (CLI test pattern, signatures), `tests/helpers.mjs` (`createTempDir`, `writeFixture`, `runCLI`)
- Depends on: Task 4

### Task 6 Context
- Spec: BEH-6 (all), Behaviors Amended "rev-2 BEH-2", BEH-9's last three sentences (the section is never an authoring target, and an authored body containing `<!-- adev:decision` is refused per anchor), and the Error Cases rows for `SPLICE_VALIDATION_FAILED` (advisory) and `NOTHING_TO_REVISE`. AC 12 and AC 15.
- Source files: `lib/specify-revise.mjs:226-346` (`groupBlockersByAnchor`, `validateAuthoredBody`), `lib/specify-revise.mjs:548-597` (the authored-sections loop), `lib/cli/specify.mjs:214-312` (`runGroupBlockers`), `skills/specify/references/revise-mode-authoring-dispatch.md` (full)
- Test: `tests/cli/specify-group-blockers.test.mjs`, `tests/lib/specify-revise.test.mjs` (signatures)
- Depends on: Task 2 (the parsed answer keys)

### Task 7 Context
- Spec: BEH-9 (all), Postconditions Delta bullet 2, and the Error Cases rows for `UNSAFE_DECISION_TEXT` (the revise re-check) and `SPLICE_VALIDATION_FAILED` (the whole-revise abort). AC 1 (the over-length question reaches `DEC-<n>`), AC 13 and AC 14.
- Source files: `lib/specify-revise.mjs:416-699` (full), `lib/cli/specify.mjs:101-212` (the revise CLI and its exit mapping), `lib/decisions-of-record.mjs` (Task 3), `lib/decisions.mjs::resolveDecisionPaths` (Task 4), `lib/decision-text.mjs` (Task 1)
- Test: `tests/lib/specify-revise.test.mjs`, `tests/cli/specify-revise.test.mjs` (signatures)
- Review: RI-2 (Referent Integrity), and suggestion CON-3, which overlaps it
- Review notes: RI-2 (see ## Review Notes)
- Depends on: Tasks 3, 4, 6

### Task 8 Context
- Spec: BEH-1 (the prompt instruction and the follow-on rule), BEH-8 (the settled-decision rule). AC 5.
- Source files: the 8 `skills/review-specs/*-prompt.md` files (the `finding_class` section of each), `tests/skills/review-specs-finding-class-prompts.test.mjs` (full)
- No dependencies.

### Task 9 Context
- Spec: BEH-4 (all), BEH-2 (the last two sentences, on `decisionsRequired` and render stripping), Integration Points "Harness question tools", the Error Cases rows for the ask round and for a harness with no structured-question tool, and Known Gaps "Differently-phrased duplicates…". AC 4 and AC 9.
- Source files: `skills/review-specs/SKILL.md` (frontmatter, Arguments, Step 8, lines 1-40 and 213-260), `skills/review-specs/references/steps/step-5-consolidate-findings.md` (full), `skills/review-specs/references/steps/step-6-events-and-report.md` (full), `skills/hygiene/SKILL.md` (the conditional-loading pattern), the `adev blockers write --json` output shape (`decisionsRequired`, `decisionsRequiredTable`, from Task 2)
- Test: `tests/skills/skill-size-cap.test.mjs`, `tests/skills-extension-coverage.test.mjs` (signatures; must stay green)
- Review: TR-1 (Termination Reviewer)
- Review notes: TR-1 (see ## Review Notes)
- Depends on: Tasks 2, 5

### Task 10 Context
- Spec: BEH-7 (all), BEH-4 (the `--defer-decisions` dispatch rule), Behaviors Amended "rev-2 BEH-2", and the Error Cases row for `LOOP_BUDGET_EXHAUSTED`. AC 16 and AC 17.
- Source files: `skills/build/references/blocker-auto-retry-loop.md` (full), `skills/build/references/pipeline/step-1-review.md` (full), `skills/build/references/resume-mode.md` (full), `skills/build/SKILL.md:150-200` (the resume pointer)
- Test: `tests/integration/build-loop-auto-retry.test.mjs` (signatures), `tests/skills/review-notes-carry-forward.test.mjs` (contract-test pattern)
- Review: WR-5 (Wiring Reviewer)
- Review notes: WR-5 (see ## Review Notes)
- Depends on: Tasks 5, 6, 9

### Task 11 Context
- Spec: AC 18 (the end-to-end trace), BEH-3, BEH-5, BEH-6, BEH-9
- Source files: `tests/integration/build-loop-auto-retry.test.mjs` (full, the fixture pattern), `lib/cli/decisions.mjs` (Task 5), `lib/cli/specify.mjs` (Tasks 6 and 7)
- Review notes: WR-5's runtime half is tested here; the task is owned by Task 10
- Depends on: Tasks 5, 7, 10

### Task 12 Context
- Spec: Module Impact Map rows for ADR-0012, provider mirrors and docs; Integration Points "ADR-0012"; the header's operator-settled rev-1 CON-1 note (the ADR is complied with, not amended)
- Source files: `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md:55-70`, `docs/cli-reference.md` (the `blockers` section at ~379 and the `specify` section at ~636), `docs/skill-reference.md` (the review-specs and build entries), `scripts/sync-provider-skills.mjs` (usage header)
- Review: CON-2 (Consistency Analyzer). Only the first remedy applies; the ADR amendment is excluded by the settled decision.
- Review notes: CON-2 (see ## Review Notes)
- Depends on: Tasks 5, 6, 8, 9, 10

No heuristics section: the spec has no `charter:` field, so no module slug exists for `adev heuristics retrieve`.

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 9 → Task 10 → Task 11
- Group B (independent): Task 8

Group B touches only the 8 reviewer prompts and their contract test, which no Group A task edits. Task 12 runs last, after both groups. It regenerates the provider mirrors from every edited skill file, so it cannot overlap any skill edit.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Decision-text leaf helper + strip-only display export | small | unit | — | 2 create, 2 modify |
| 2 | blockers-writer `question`/`options`, `decisionsRequired` + table renderer, answer-key persistence, sidecar parser | medium | unit | Task 1 | 0 create, 8 modify (4 source, 4 test) |
| 3 | Decisions of Record pure module (fence-aware location, marker grammar, entry extent, `DEC-<n>`) | medium | unit | — | 2 create, 0 modify |
| 4 | `lib/decisions.mjs`: containment, `pending`, `record` | medium | unit | Tasks 1, 2, 3 | 2 create, 0 modify |
| 5 | `adev decisions pending\|record` CLI verbs | small | unit | Task 4 | 2 create, 1 modify |
| 6 | Answered decisions authorable: `group-blockers` + revise per-anchor refusal + authoring dispatch | medium | unit | Task 2 | 0 create, 5 modify |
| 7 | Revise writes `## Decisions of Record` (BEH-9) with re-check and fatal byte-identity abort | medium | unit | Tasks 3, 4, 6 | 0 create, 4 modify |
| 8 | Reviewer prompt edits (BEH-1, BEH-8) across 8 prompts | small | unit | — | 0 create, 9 modify |
| 9 | review-specs: `--defer-decisions`, bounded ask round, Decisions Required table placement | small | unit | Tasks 2, 5 | 2 create, 3 modify |
| 10 | build loop: orchestrator ask round, `--auto` halt, `--defer-decisions` dispatch, resume re-entry | small | unit | Tasks 5, 6, 9 | 1 create, 3 modify |
| 11 | End-to-end integration test | small | unit | Tasks 5, 7, 10 | 1 create, 0 modify |
| 12 | ADR-0012 peer-table note, docs, provider mirror regeneration | small | unit | Tasks 5, 6, 8, 9, 10 | 0 create, 3 modify + mirrors |

## Review Notes

> Carried forward from the PASS_WITH_NOTES review (`.context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.review.md`). Each open warning is assigned to the task that resolves it, which is the first task that touches the spec text it cites. `adev review-notes show` returned `section: null` for CON-1 and CON-2 and an empty `summary` for several rows, so those cells were taken from the `.review.md` findings directly. This is the Step 1 fallback for a best-effort parse.

| ID | Warning | Cited section | Assigned to |
|----|---------|---------------|-------------|
| CON-1 | The `decisionsRequired` derived-question fallback implies a `blockers-writer` ↔ `decisions` import cycle, and the function has no named owner | `behaviors-added`, `module-impact-map-delta` | Task 1 |
| CON-2 | ADR-0012's peer table names `/adev:build` as the sole `.blockers.md` producer, so the binding rule must be stated | `integration-points-delta`, `module-impact-map-delta` | Task 12 |
| RI-1 | `renderRemedyRef` also truncates at 256 characters, so a strip-only display export is needed for 500/300-character values | BEH-2, BEH-3, BEH-4, Integration Points "Shared helpers", Module Impact Map | Task 1 |
| RI-2 | `SPLICE_VALIDATION_FAILED` is advisory-only today, so its fatal whole-revise use is new and must be thrown with exit 1 | BEH-9, `error-cases-delta`, `module-impact-map-delta` | Task 7 |
| WR-5 | Nothing states or tests that `/adev:build --resume` picks up recorded answers and proceeds through `group-blockers` into authoring | BEH-4, BEH-7 | Task 10 |
| BD-1 | "Realpath containment" is not tied to `assertContained`, and the absent-sidecar and unresolvable-candidate cases are undefined | path containment (BEH-3, BEH-5, `INVALID_SPEC_PATH`) | Task 4 |
| BD-2 | `--spec` is not restricted to `.context-index/specs/**/*.spec.md`, so a crafted path could get a Decisions of Record section | path containment (BEH-3, BEH-5, BEH-9) | Task 4 |
| BD-3 | In-place replacement has no defined entry extent, and re-deciding one member of a multi-blocker entry could overwrite the others | destructive operations (BEH-9) | Task 3 |
| BD-4 | The `.blockers.md` git status and the redaction of operator text before it reaches the committed spec are unstated | artifact leakage (BEH-5, Integration Points) | Task 4 |
| TR-1 | A structured-question call that never returns in a headless session has no failure disposition | BEH-4 | Task 9 |
| TR-2 | The ceil(n/4) bound has no concrete maximum, because n is never capped | BEH-4, BEH-3 | Task 4 |

**Resolutions, fixed here so each task implements the same decision:**

- **CON-1:** the derived question (`deriveQuestion`, `neutralQuestion`) lives in the leaf `lib/decision-text.mjs`. Both `blockers-writer` and `decisions` import it, and `decision-text` imports neither. The redactor is injected (`{ redact }`), so `_redactForBlockers` stays in `lib/blockers-writer.mjs` as the spec names it.
- **RI-1:** `lib/governance/remedy-ref-render.mjs` exports `stripForDisplay`. Every decision-field display path uses it: `decisionsRequired`, the `pending` header, the ask round and the table. None uses `renderRemedyRef`, so a 500-character `question` is shown whole. `renderRemedyRef` stays byte-identical for `remedy_ref`.
- **RI-2:** `SPLICE_VALIDATION_FAILED` gains a second, fatal use. The post-compose byte-identity check throws `mkErr('SPLICE_VALIDATION_FAILED', …)`, the CLI exits 1, and nothing is written. The per-anchor use stays an advisory. The `@throws` list and `docs/cli-reference.md` both state the two severities. A distinct code is not minted, because the spec's Error Cases table names this one.
- **WR-5:** when a build's review step failed with `DECISION_REQUIRED`, `/adev:build --resume` re-enters the loop at step 4 (`adev specify group-blockers`). It does not re-dispatch `/adev:review-specs`, because a fresh review would rewrite `.blockers.md` and discard the recorded answers. If `group-blockers` still returns open `decision_blocker_ids`, the halt repeats. Otherwise authoring and revise run with the `retries_remaining` read from build state. `BLOCKERS_REVISION_MISMATCH` from `record` is named as the signal that the sidecar is stale, which happens when the spec was hand-edited and its revision bumped. The fix is to re-review. Task 10 specifies this and contract-tests it. Task 11 tests the runtime half: answers recorded on a sidecar survive to `group-blockers` and revise.
- **BD-1:** `resolveDecisionPaths` lexically pre-checks the input, then calls `assertContained(projectRoot, candidate)`. It maps `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` and `GOVERNANCE_PAYLOAD_MISSING` to `INVALID_SPEC_PATH`, or to `INVALID_DECISION_ANSWERS` for `--answers @path`, with a message naming only the path. For an absent sidecar (`pending` only), it realpaths and contains the parent directory and checks the derived file name lexically. `record` refuses an unresolvable sidecar (`NO_REVIEW_SIDECARS` when the file is absent, `INVALID_SPEC_PATH` when it is a dangling symlink).
- **BD-2:** `resolveDecisionPaths` requires the spec's realpath to sit under `<root>/.context-index/specs/` and to end in `.spec.md`. Otherwise it refuses with `INVALID_SPEC_PATH`. Revise applies the same check before it writes a Decisions of Record section (Task 7), so the section can only land in a Live Spec. Existing revise callers are unaffected, because every revise fixture already sits under `.context-index/specs/`.
- **BD-3:** an entry is exactly a well-formed marker line plus the immediately following line, which must match `^- \*\*DEC-<n>\*\* — ` with the same `<n>`. Any other shape is malformed: preserved verbatim, flagged `DECISION_MARKER_MALFORMED`, and never replaced. When a re-decided group covers every blocker id of an existing entry, that entry is replaced in place and keeps its `DEC-<n>`. When it covers only some of them (one member of a `duplicate_of` group re-decided differently), the old entry keeps its bullet line byte-identical, and its marker is rewritten to drop the re-decided ids. The new decision gets a new `DEC-<n>`. A test asserts that every other entry stays byte-identical.
- **BD-4:** `.blockers.md` is committed. `git check-ignore` reports it as not ignored, and the `.gitignore` adev block keeps it tracked. `record` applies `_redactForBlockers` to `choice` and `note` before storage, and the reviewer fields are redacted at `blockers write`. So no unredacted text reaches the sidecar or, through revise, the committed spec. The review point is the PR diff of the spec's `## Decisions of Record` section. `docs/cli-reference.md` states both facts (Task 12).
- **TR-1:** Step 8 invokes the structured-question tool only when an operator is attending. That means `--defer-decisions` is absent, and the skill is not running as a dispatched subagent (build always passes the flag, BEH-4). A headless, scheduled or scripted caller must pass `--defer-decisions`. The reference states that the round has no timeout of its own: a call that does not return is a harness hang, outside the skill's bound. The skill-side guarantee is that the tool is never reached without an operator.
- **TR-2:** `adev decisions pending` marks at most 16 `duplicate_of` groups per round as `ask: true`, in `pending` order. That is 4 structured calls at 4 questions each. Every later group is `ask: false`, and the JSON carries `ask_round: { limit: 16, asked: <n>, overflow: <n> }`. Overflow groups stay open and are listed in the BLOCK summary with their question and options, exactly like unanswered ones. The cap is a module constant, `ASK_ROUND_GROUP_LIMIT`.

---

## Tasks

Commit trailers for every task (CLAUDE.md "Commit Trailers"):

```
Spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-3-batched-operator-decisions.spec.md
Plan-task: <n>
```

Branch: `feat/operator-decision-round` (already created). Test command: `node --test <file>` per suite, and `npm test` for the full gate.

### Task 1: Decision-text leaf helper + strip-only display export [specialist: none]

**Charter capability:** review: auto-retry on BLOCK (shared decision-text rules, BEH-2/BEH-3)
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `lib/decision-text.mjs`
- Modify: `lib/governance/remedy-ref-render.mjs:39-57`
- Test: `tests/lib/decision-text.test.mjs` (create), `tests/lib/governance/remedy-ref-render.test.mjs` (extend)

**Tests:** `tests/lib/decision-text.test.mjs` (create, per-behavior suite for BEH-2's text rules), `tests/lib/governance/remedy-ref-render.test.mjs` (extend)

**Context to load:** Task 1 Context packet. Review notes: CON-1, RI-1.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_TEXT_BOUNDS, truncateDecisionText, checkUnsafeDecisionText,
  processReviewerDecisionField, normalizeQuestion, deriveQuestion, neutralQuestion, headerFor,
} from '../../lib/decision-text.mjs';
import { buildBlockerId } from '../../lib/blocker-id.mjs';

test('truncation counts code points and appends the single-line marker', () => {
  const out = truncateDecisionText('é'.repeat(501), DECISION_TEXT_BOUNDS.question);
  assert.equal([...out].length, 500 + [...'…[truncated]'].length);
  assert.ok(out.endsWith('…[truncated]') && !out.includes('\n'));
});
for (const bad of ['a\u0085b', 'a\u202Eb', 'a\u2028b', 'a\u2029b', '---x', '# x', 'a```b', 'a<!--b', 'a-->b', 'a**b', 'a\nb'])
  test(`gate refuses ${JSON.stringify(bad)}`, () => assert.equal(checkUnsafeDecisionText(bad).ok, false));
test('a value BEH-2 accepts always passes the re-check', () => {
  const r = processReviewerDecisionField('x'.repeat(900), 'question', { redact: s => s });
  assert.equal(checkUnsafeDecisionText(r.value).ok, true);
});
test('derived question falls back to the neutral question when the first sentence fails the gate', () => {
  const id = buildBlockerId({ reviewer: 'consistency-analyzer', type: 'decision-needed', sectionAnchor: 'behaviors-added', findingText: 'Pick a cap.' });
  assert.equal(deriveQuestion('Use **bold** here. More.', id, { redact: s => s }).question, `Which option resolves blocker ${id}?`);
});
test('normalizeQuestion lowercases, collapses whitespace, trims', () =>
  assert.equal(normalizeQuestion('  Pick   A\tor B? '), 'pick a or b?'));
test('headerFor strips and caps at 12 code points', () => assert.ok([...headerFor('Behaviors Added \x1b[31m')].length <= 12));
```

Extend `remedy-ref-render.test.mjs` with tests showing that `stripForDisplay` removes ANSI and C0/C1/U+2028/U+2029 and never truncates a 600-character value, and that `renderRemedyRef` output is unchanged for the existing fixtures.

- [ ] **Verify test fails**

Run: `node --test tests/lib/decision-text.test.mjs tests/lib/governance/remedy-ref-render.test.mjs`
Expected: FAIL. `Cannot find module '../../lib/decision-text.mjs'` and `stripForDisplay is not a function`.

- [ ] **Implement**

```javascript
// lib/decision-text.mjs — imports only ./blocker-id.mjs
export const DECISION_TEXT_BOUNDS = Object.freeze({ question: 500, label: 60, implications: 300, choice: 1000, note: 1000 });
export const SINGLE_LINE_TRUNCATION_MARKER = '…[truncated]';
// \p{C} covers Cc/Cf/Cs/Co/Cn: newline, CR, NEL, bidi overrides. U+2028/U+2029 are Zl/Zp, so they are listed explicitly.
const UNSAFE_CHARS = /[\p{C}\u2028\u2029]/u;
const UNSAFE_START = /^(?:---|#)/;
const UNSAFE_SEQ = ['```', '<!--', '-->', '**'];
export function checkUnsafeDecisionText(v) { /* returns { ok } or { ok: false, reason } and never throws */ }
export function truncateDecisionText(v, bound) { const cps = [...v]; return cps.length <= bound ? v : cps.slice(0, bound).join('') + SINGLE_LINE_TRUNCATION_MARKER; }
export function processReviewerDecisionField(raw, field, { redact }) { /* redact → truncate(bound[field]) → gate; returns { value } or { rejected: reason } */ }
export function neutralQuestion(blockerId) { parseBlockerId(blockerId); return `Which option resolves blocker ${blockerId}?`; }
export function deriveQuestion(prose, blockerId, { redact }) { /* first sentence → processReviewerDecisionField(…, 'question'); on reject → neutralQuestion */ }
export function normalizeQuestion(q) { return q.toLowerCase().replace(/\s+/g, ' ').trim(); }
export function headerFor(headingText) { /* stripForDisplay, then the first 12 code points */ }
```

In `remedy-ref-render.mjs`, export `stripForDisplay(value)`, which is the existing ANSI and control replace with no cap. Rewrite `renderRemedyRef` as `stripForDisplay` plus the cap. `headerFor` imports `stripForDisplay`. That is a leaf-to-leaf import, so it adds no cycle.

- [ ] **Verify test passes**

Run: `node --test tests/lib/decision-text.test.mjs tests/lib/governance/remedy-ref-render.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/decision-text.mjs lib/governance/remedy-ref-render.mjs tests/lib/decision-text.test.mjs tests/lib/governance/remedy-ref-render.test.mjs
git commit -m "feat(review): add shared decision-text gate and strip-only display helper"   # + Spec/Plan-task: 1 trailers
```

### Task 2: blockers-writer `question`/`options`, `decisionsRequired`, answer-key persistence, sidecar parser [specialist: none]

**Charter capability:** review: auto-retry on BLOCK (`.blockers.md` decision fields, BEH-1/BEH-2/BEH-5)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/blockers-writer.mjs:303-437` (`writeBlockers` render loop), plus new exports `readSidecarRevision` and `writeDecisionAnswers`
- Modify: `lib/specify-revise.mjs:149-214` (`parseBlockersSidecar`)
- Modify: `lib/cli/blockers.mjs:143-157` (non-JSON output line)
- Modify: `lib/decision-text.mjs` (add `renderDecisionsRequiredTable`)
- Test: `tests/lib/blockers-writer.test.mjs`, `tests/cli/blockers-write.test.mjs`, `tests/lib/specify-revise.test.mjs`, `tests/lib/decision-text.test.mjs` (all extend)

**Tests:** `tests/lib/blockers-writer.test.mjs` (extend), `tests/cli/blockers-write.test.mjs` (extend), `tests/lib/specify-revise.test.mjs` (extend: parser round-trip), `tests/lib/decision-text.test.mjs` (extend: table renderer)

**Context to load:** Task 2 Context packet.

- [ ] **Write failing test**

```javascript
test('decision question/options round-trip JSON-quoted through writeBlockers and parseBlockersSidecar', () => {
  const r = writeBlockers(root, spec, [decisionFinding({ question: 'Pick a cap?', options: [{ label: 'A', implications: 'a: b, "c"' }, { label: 'B', implications: 'd' }] })], { revision: 3 });
  const [e] = parseBlockersSidecar(readFileSync(join(root, r.sidecarPath), 'utf8'));
  assert.equal(e.question, 'Pick a cap?');
  assert.deepEqual(e.options.map(o => o.label), ['A', 'B']);
  assert.deepEqual(r.decisionsRequired[0].options.length, 2);
});
test('an over-length question is stored truncated with the single-line marker', ...);
test('options with 1 or 5 entries, or an empty label -> OPTIONS_REJECTED, question kept', ...);
test('a label containing ** -> DECISION_TEXT_REJECTED, whole options dropped, entry and prose kept', ...);
test('question on a defect entry -> DECISION_FIELDS_IGNORED, not written', ...);
test('reviewer-supplied decision_choice/decision_note/decision_recorded -> DECISION_FIELDS_IGNORED, keys absent from sidecar', ...);
test('decisionsRequired falls back to the derived question when none was stored', ...);
test('writeDecisionAnswers rewrites only answer-key lines; every other byte unchanged; re-record without note removes decision_note', ...);
test('readSidecarRevision reads the "> Spec revision: N" header', ...);
// tests/lib/decision-text.test.mjs
test('renderDecisionsRequiredTable: header "| blocker_id | section | question | options |", option labels in order, | escaped as \\|, \\ escaped first; "" for an empty array', ...);
test('writeBlockers returns decisionsRequiredTable built from decisionsRequired', ...);
// tests/cli/blockers-write.test.mjs
test('--json output carries decisionsRequired and every advisory in advisories', ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/blockers-writer.test.mjs tests/cli/blockers-write.test.mjs tests/lib/specify-revise.test.mjs`
Expected: FAIL. The `question` key is missing from the sidecar, `decisionsRequired` is undefined, and `writeDecisionAnswers is not a function`.

- [ ] **Implement**

- In the render loop, after `resolveRemedyRef`, add `resolveDecisionFields(first, findingClass, id, advisories)`. For `decision` entries, it runs `processReviewerDecisionField` on `question`. For `options`, it checks the shape first (an array of 2–4 entries, each with a non-empty `label`), else `OPTIONS_REJECTED`. It then gates every `label` and `implications`, and any refusal drops the whole array with `DECISION_TEXT_REJECTED`. For non-`decision` entries carrying `question` or `options`, it pushes `DECISION_FIELDS_IGNORED`. For any entry carrying `decision_choice`, `decision_note` or `decision_recorded`, it pushes `DECISION_FIELDS_IGNORED`. Those keys are never rendered.
- Write `question: ${JSON.stringify(q)}` and `options: ${JSON.stringify(opts)}` inside the YAML fence, before `reviewer_count:`.
- Build `decisionsRequired.push({ blocker_id, section_anchor, question: stripForDisplay(q ?? deriveQuestion(first.prose, id, { redact: _redactForBlockers }).question), options: opts.map(o => ({ label: stripForDisplay(o.label), implications: stripForDisplay(o.implications) })) })`. Return it beside `externalRemedies`, including on the two early-return paths, as `[]`.
- `writeDecisionAnswers(projectRoot, specPath, answers /* [{ blocker_id, choice, note|null, recorded }] */)`: read the sidecar and locate each entry's YAML fence by its `blocker_id:` line. Remove any existing `decision_choice:`, `decision_note:` and `decision_recorded:` lines in that fence, and insert the new lines immediately before the fence's closing line. Compose the whole new text in memory, then write it once as `.tmp` and rename it, which makes the write all-or-nothing. The function trusts its input: validation is `lib/decisions.mjs`'s job (Task 4). State that contract in the JSDoc.
- `parseBlockersSidecar`: generalize the per-field `within` lookup to a field table. Add `question` (`JSON.parse`, or `null`), `options` (`JSON.parse`, or `[]` on failure or when absent), `decision_choice` and `decision_note` (`JSON.parse`, or `null`), and `decision_recorded` (raw string, or `null`). Existing keys keep their current semantics.
- `lib/cli/blockers.mjs`: in non-JSON mode, print `  Decision required for <id> (<anchor>): <question>` per entry.
- `renderDecisionsRequiredTable(decisionsRequired)` in `lib/decision-text.mjs` returns markdown, or `''` when the array is empty. Each cell goes through `stripForDisplay`, then `\` → `\\`, then `|` → `\|` (suggestion BD-6). `writeBlockers` returns it as `decisionsRequiredTable` beside `decisionsRequired`. Task 9's skill prose copies it verbatim and never assembles table rows itself, because rendering logic stays out of skill prose.

- [ ] **Verify test passes**

Run: `node --test tests/lib/blockers-writer.test.mjs tests/cli/blockers-write.test.mjs tests/lib/specify-revise.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/blockers-writer.mjs lib/specify-revise.mjs lib/cli/blockers.mjs lib/decision-text.mjs tests/lib/blockers-writer.test.mjs tests/cli/blockers-write.test.mjs tests/lib/specify-revise.test.mjs tests/lib/decision-text.test.mjs
git commit -m "feat(review): persist decision question/options and answer keys on .blockers.md"   # + Spec/Plan-task: 2
```

### Task 3: Decisions of Record pure module [specialist: none]

**Charter capability:** spec-lifecycle: Decisions of Record (BEH-9 grammar, BEH-3 `decided`)
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `lib/decisions-of-record.mjs`
- Test: `tests/lib/decisions-of-record.test.mjs` (create)

**Tests:** `tests/lib/decisions-of-record.test.mjs` (create, per-behavior suite for BEH-9's section grammar)

**Context to load:** Task 3 Context packet. Review notes: BD-3.

- [ ] **Write failing test**

```javascript
import { findHeadingFenceAware, parseDecisionsOfRecord, composeEntry, applyDecisions, placeSection } from '../../lib/decisions-of-record.mjs';

test('a ## Acceptance Criteria inside a ``` fence is ignored; the section goes before the real heading', ...);
test('absent Acceptance Criteria -> section appended at end of file', ...);
test('entry = marker line + exactly the next "- **DEC-<n>** — " line with the same n', ...);
test('marker with an id parseBlockerId rejects -> DECISION_MARKER_MALFORMED, line preserved verbatim, absent from entries', ...);
test('DEC-<n> allocation = highest present + 1, malformed marker lines included', ...);
test('re-deciding all ids of an entry replaces it in place and keeps DEC-<n>; other entries byte-identical', ...);
test('re-deciding one id of a multi-blocker entry: old bullet byte-identical, marker drops the id, new DEC-<n> appended (BD-3)', ...);
test('a malformed entry is never replaced even when its marker names a re-decided id', ...);
test('composeEntry: "- **DEC-n** — <q> → **<choice>**. <implications>. <note>" with implications only when choice matches a label', ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/decisions-of-record.test.mjs`
Expected: FAIL (`Cannot find module`)

- [ ] **Implement**

- `findHeadingFenceAware(text, level, title)`: line scan that toggles on lines opening/closing a ``` or ~~~ fence (same fence char and ≥ same length closes), matches `HEADING_RE` only outside fences, returns `{ headingStart, contentStart, end }` where `end` is the next same-or-higher heading outside a fence, or `text.length`.
- `MARKER_RE = /^<!-- adev:decision DEC-(\d+) blockers=([^\s]+) -->$/`; ids split on `,`, each through `parseBlockerId` (catch → malformed). `ENTRY_RE(n) = ^- \*\*DEC-${n}\*\* — `.
- `parseDecisionsOfRecord(sectionText)` → `{ entries: [{ dec, blockerIds, start, end }], malformed: [{ start, end, reason }], maxDec, advisories }`. `maxDec` also scans `DEC-(\d+)` in any line that starts with `<!-- adev:decision`.
- `applyDecisions(sectionText, decisions /* [{ blockerIds, question, choice, implications|null, note|null }] */)` → `{ text, written: [{ dec, blockerIds }], advisories }` implementing the BD-3 rule from `## Review Notes`; untouched entries and malformed lines are copied byte-for-byte.
- `placeSection(body, sectionText)`: when `## Decisions of Record` exists (fence-aware) replace its content range; else insert `## Decisions of Record\n\n<text>\n` immediately before `## Acceptance Criteria` or append at EOF.

- [ ] **Verify test passes**

Run: `node --test tests/lib/decisions-of-record.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/decisions-of-record.mjs tests/lib/decisions-of-record.test.mjs
git commit -m "feat(spec-lifecycle): add Decisions of Record section grammar module"   # + Spec/Plan-task: 3
```

### Task 4: `lib/decisions.mjs` — containment, `pending`, `record` [specialist: none]

**Charter capability:** review: batched operator decisions (BEH-3, BEH-5)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Create: `lib/decisions.mjs`
- Test: `tests/lib/decisions.test.mjs` (create)

**Tests:** `tests/lib/decisions.test.mjs` (create, per-behavior suite for BEH-3 and BEH-5)

**Context to load:** Task 4 Context packet. Review notes: BD-1, BD-2, BD-4, TR-2.

- [ ] **Write failing test**

```javascript
import { resolveDecisionPaths, computePending, recordDecisions, ASK_ROUND_GROUP_LIMIT } from '../../lib/decisions.mjs';

// containment (BD-1, BD-2)
test('spec outside .context-index/specs/ or not *.spec.md -> INVALID_SPEC_PATH, message names path only', ...);
test('spec symlink resolving outside root -> INVALID_SPEC_PATH', ...);
test('absent sidecar: parent dir realpath-contained, derived name checked lexically, pending still works', ...);
test('dangling sidecar symlink -> INVALID_SPEC_PATH on record', ...);
// pending (BEH-3, TR-2)
test('pending lists only decision entries without decision_choice, ordered by section heading position then blocker_id; unresolvable anchors last', ...);
test('structured is true exactly when options has 2-4 entries; header <= 12 code points', ...);
test('missing question -> derived with QUESTION_DERIVED; unsafe first sentence -> neutral question', ...);
test('identical normalized questions in one section -> later entries duplicate_of the first; different section or text -> no mark', ...);
test('answered lists decision_choice/decision_note/decision_recorded with no DEC-<n>; decided read from the spec section', ...);
test('malformed marker -> DECISION_MARKER_MALFORMED, absent from decided', ...);
test('no sidecar -> pending [] and decided still read', ...);
test('more than 16 groups -> first 16 ask:true, rest ask:false, ask_round {limit:16, asked:16, overflow:n-16}', ...);
// record (BEH-5, BD-4)
test('record writes only the named entries answer keys; spec byte-identical; other sidecar bytes unchanged', ...);
test('record applies _redactForBlockers to choice/note before storage', ...);
test('record rejects UNKNOWN_DECISION_BLOCKER / NOT_A_DECISION_BLOCKER / BLOCKERS_REVISION_MISMATCH / INVALID_DECISION_ANSWERS / NO_REVIEW_SIDECARS, writing nothing', ...);
test('choice or note over 1000 chars or failing the gate -> UNSAFE_DECISION_TEXT, nothing written (refused, not truncated)', ...);
test('all-or-nothing: one bad answer in the array -> no answer written', ...);
test('--answers input over 64 KiB, or @path outside the root -> INVALID_DECISION_ANSWERS, no file content echoed', ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/decisions.test.mjs`
Expected: FAIL (`Cannot find module '../../lib/decisions.mjs'`)

- [ ] **Implement**

- `resolveDecisionPaths(projectRoot, specPath)`: lexical check, then `assertContained`, mapping its codes per the BD-1 resolution. The specs-root restriction follows BD-2. Returns `{ absSpec, relSpec, absSidecar, sidecarExists }`. Export it for Task 7.
- `readAnswersInput(projectRoot, raw)`: reject when `Buffer.byteLength(raw) > 65536`. For `@path`, apply `assertContained`, then `statSync().size > 65536`. Then `JSON.parse` and the shape checks, with no file content in any message (`INVALID_DECISION_ANSWERS`).
- `computePending(projectRoot, specPath)` → `{ spec, pending, answered, decided, ask_round, advisories }`. Use `parseBlockersSidecar` for sidecar entries, and `listSections(body)` for the heading order of each `section_anchor`. `parseDecisionsOfRecord` on the fence-aware section supplies `decided`. Each pending item is `{ blocker_id, section_anchor, question, options, header, structured, duplicate_of?, ask }`. Re-gate every stored value after `JSON.parse`. A stored value that fails is treated as absent, falling back to the derived question or to empty options, with `DECISION_TEXT_REJECTED`.
- `recordDecisions(projectRoot, specPath, answers)`: validate every answer before writing anything. Check the sidecar exists, that `readSidecarRevision` matches the spec's `revision:`, that each id exists and is `decision`-classed, that `choice` is non-empty, that the `blocker_ids` array is non-empty, and the gate plus the 1,000-character cap on `choice` and `note`. Then redact and call `writeDecisionAnswers` once with `recorded: new Date().toISOString()`. Return `{ recorded: <ids>, advisories }`.
- In a module JSDoc paragraph, state the two BD-4 facts as constraints: the sidecar is a committed artifact, and nothing reaches it unredacted.

- [ ] **Verify test passes**

Run: `node --test tests/lib/decisions.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/decisions.mjs tests/lib/decisions.test.mjs
git commit -m "feat(review): add decisions library for pending and record"   # + Spec/Plan-task: 4
```

### Task 5: `adev decisions pending|record` CLI verbs [specialist: none]

**Charter capability:** review: batched operator decisions (CLI surface, BEH-3/BEH-5)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `lib/cli/decisions.mjs`
- Modify: `cli/index.mjs:2149` (verb table)
- Test: `tests/cli/decisions.test.mjs` (create)

**Tests:** `tests/cli/decisions.test.mjs` (create)

**Context to load:** Task 5 Context packet.

- [ ] **Write failing test**

```javascript
test('adev decisions pending --json prints {pending, answered, decided, ask_round, advisories}, exit 0', ...);
test('adev decisions pending on a spec with no sidecar -> pending [], exit 0', ...);
test('adev decisions record --answers <inline json> writes and exits 0; --answers @file works', ...);
test('each fatal code exits 1 with "<CODE>: <message>" on stderr and nothing written', ...);
test('missing --spec / unknown subcommand -> usage on stderr, exit 1', ...);
test('adev decisions --help lists both subcommands', ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/decisions.test.mjs`
Expected: FAIL (unknown command `decisions`)

- [ ] **Implement**

`lib/cli/decisions.mjs` mirrors `lib/cli/review-notes.mjs`. It exports `run({ projectRoot, argv })` and `help()`, and uses `parseArgs` with `spec`, `answers` and `json`. Every coded error thrown by `lib/decisions.mjs` prints `${code}: ${message}` and exits 1, and advisories never fail the verb. Without `--json`, `pending` prints one line per pending item (`<blocker_id> [<header>] <question>`, followed by an indented line per option) and a summary of the `ask_round` counts. Register the verb in `cli/index.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/decisions.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/decisions.mjs cli/index.mjs tests/cli/decisions.test.mjs
git commit -m "feat(cli): add adev decisions pending and record verbs"   # + Spec/Plan-task: 5
```

### Task 6: Answered decisions authorable — `group-blockers`, per-anchor refusal, authoring dispatch [specialist: none]

**Charter capability:** spec-lifecycle: revise authors recorded decisions (BEH-6)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/specify-revise.mjs:226-346` (`groupBlockersByAnchor`, `validateAuthoredBody`) and `:561-582` (authored-sections loop)
- Modify: `lib/cli/specify.mjs:286-312` (`runGroupBlockers` output)
- Modify: `skills/specify/references/revise-mode-authoring-dispatch.md` (§1 output shape, §2 binding-decision instruction)
- Test: `tests/cli/specify-group-blockers.test.mjs`, `tests/lib/specify-revise.test.mjs` (extend). The dispatch-doc contract lives in `tests/cli/specify-group-blockers.test.mjs` as a prose assertion over the reference file.

**Tests:** `tests/cli/specify-group-blockers.test.mjs` (extend), `tests/lib/specify-revise.test.mjs` (extend)

**Context to load:** Task 6 Context packet.

- [ ] **Write failing test**

```javascript
test('answered decision blocker is grouped under its anchor with decisions [{blocker_id, choice, note}] and absent from decision_blocker_ids', ...);
test('open decision blocker stays in decision_blocker_ids and in no anchor', ...);
test('authored body containing "<!-- adev:decision" -> SPLICE_VALIDATION_FAILED advisory, anchor prior text kept, blocker unresolved', ...);
test('an authoredSections key "decisions-of-record" is refused per anchor and never spliced', ...);
test('answered blocker whose section comes back unchanged is unresolved; with --auto and no change -> NOTHING_TO_REVISE, nothing written, sidecar kept', ...);
test('revise-mode-authoring-dispatch.md tells the author each attached decision is binding: implement the recorded choice, do not reopen it', ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/specify-group-blockers.test.mjs tests/lib/specify-revise.test.mjs`
Expected: FAIL. The answered blocker is still listed in `decision_blocker_ids`, and the `decisions` key is undefined.

- [ ] **Implement**

- `groupBlockersByAnchor`: an entry is groupable when `finding_class` is `defect`, or when it is `decision` with a non-null `decision_choice`. Return a `decisions: Map<anchor, [{ blocker_id, choice, note }]>` beside `grouped`, carried through the parent-fold and the remap so it follows the anchor its blocker lands on.
- `runGroupBlockers`: `anchors[a].decisions = decisions.get(a) ?? []`, and `decision_blocker_ids` filters to entries with no `decision_choice`. Update the stale comment at lines 286-293, which still says only `defect` reaches `anchors`.
- `validateAuthoredBody`: refuse `/<!--\s*adev:decision/` with reason `decision-marker`.
- Authored-sections loop: skip and advise `SPLICE_VALIDATION_FAILED` (reason `decisions-of-record-not-authorable`) for the `decisions-of-record` anchor.
- Dispatch reference: §1 documents `decisions` on each anchor. §2 adds this instruction: "For each entry in the anchor's `decisions`, the rewritten section MUST implement `choice` (and honor `note`). The decision is settled. Do not reopen it, offer alternatives, or write a `<!-- adev:decision` marker." §5 notes that an anchor whose only blockers are answered decisions is still authored.

- [ ] **Verify test passes**

Run: `node --test tests/cli/specify-group-blockers.test.mjs tests/lib/specify-revise.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/specify-revise.mjs lib/cli/specify.mjs skills/specify/references/revise-mode-authoring-dispatch.md tests/cli/specify-group-blockers.test.mjs tests/lib/specify-revise.test.mjs
git commit -m "feat(spec-lifecycle): make answered decision blockers authorable"   # + Spec/Plan-task: 6
```

### Task 7: Revise writes `## Decisions of Record` with re-check and fatal byte-identity abort [specialist: none]

**Charter capability:** spec-lifecycle: Decisions of Record writer (BEH-9)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 3, Task 4, Task 6
**Files:**
- Modify: `lib/specify-revise.mjs:416-699` (`reviseSpec` and its `@throws` doc)
- Modify: `lib/cli/specify.mjs:186-197` (exit mapping) and the help text
- Test: `tests/lib/specify-revise.test.mjs`, `tests/cli/specify-revise.test.mjs` (extend)

**Tests:** `tests/lib/specify-revise.test.mjs` (extend), `tests/cli/specify-revise.test.mjs` (extend)

**Context to load:** Task 7 Context packet. Review notes: RI-2.

- [ ] **Write failing test**

```javascript
test('answered decision -> one marker+entry in ## Decisions of Record, placed before the real ## Acceptance Criteria (fenced decoy ignored)', ...);
test('entries written in the same atomic write as the authored sections, before .blockers.md is cleared', ...);
test('duplicate_of group with the same choice and note -> one entry naming every blocker_id', ...);
test('re-decided blocker keeps its DEC-<n>; other entries byte-identical; new entry = highest + 1', ...);
test('an over-length reviewer question (stored truncated) yields a DEC-<n> entry, not UNSAFE_DECISION_TEXT', ...);
test('tampered sidecar choice containing ** -> UNSAFE_DECISION_TEXT, exit 1; spec and sidecar unchanged; no entry for any decision', ...);
test('byte outside the section and the authored anchors differs after compose -> SPLICE_VALIDATION_FAILED thrown, exit 1, nothing written', ...);
test('revise with no answered blockers leaves an existing ## Decisions of Record byte-identical', ...);
test('spec outside .context-index/specs/ with answered decisions -> INVALID_SPEC_PATH before any write', ...);
```

To exercise the byte-identity abort, inject a faulty composer. `reviseSpec` takes an internal `_composeDecisions` test seam (an underscore-prefixed option, documented as test-only), which mirrors how `assertHeadingsOutsideSplicesIntact` is exported for direct testing.

- [ ] **Verify test fails**

Run: `node --test tests/lib/specify-revise.test.mjs tests/cli/specify-revise.test.mjs`
Expected: FAIL. No `## Decisions of Record` section is written.

- [ ] **Implement**

- After the splice gate, collect answered `decision` entries from `blockerEntries`. Group them by the BEH-3 rule (same `section_anchor`, equal `normalizeQuestion`, same choice and note). The question is the stored `question` or `deriveQuestion(...)`. Implications come from the option whose `label === choice`.
- Re-check `question`, the chosen `implications`, `choice` and `note` with `checkUnsafeDecisionText` and the bounds. Any failure throws `UNSAFE_DECISION_TEXT` before any write.
- When at least one answered decision exists, call `resolveDecisionPaths` (the BD-2 check), then `placeSection(finalBody, applyDecisions(existingSectionText, groups).text)`.
- Byte-identity check: strip the Decisions of Record range and each accepted splice range from both the prior and the new body, then compare. Any difference throws `mkErr('SPLICE_VALIDATION_FAILED', 'post-compose byte-identity check failed')`. Add `SPLICE_VALIDATION_FAILED` (fatal, whole revise) and `UNSAFE_DECISION_TEXT` to `@throws`. The JSDoc states the two severities of `SPLICE_VALIDATION_FAILED`.
- The single `renderFullText` → `.tmp` → rename already carries both the authored sections and the section. The sidecar is unlinked after the rename, so the existing ordering holds the "before the sidecar is cleared" guarantee. Return a `decisions_written: [{ dec, blocker_ids }]` field, and add it to the CLI JSON.
- CLI: `UNSAFE_DECISION_TEXT` and `SPLICE_VALIDATION_FAILED` take the default exit 1 branch, and a test pins it.

- [ ] **Verify test passes**

Run: `node --test tests/lib/specify-revise.test.mjs tests/cli/specify-revise.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/specify-revise.mjs lib/cli/specify.mjs tests/lib/specify-revise.test.mjs tests/cli/specify-revise.test.mjs
git commit -m "feat(spec-lifecycle): revise writes Decisions of Record entries"   # + Spec/Plan-task: 7
```

### Task 8: Reviewer prompt edits (BEH-1, BEH-8) across 8 prompts [specialist: none]

**Charter capability:** review: reviewer finding contract (BEH-1, BEH-8)
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `skills/review-specs/structural-architect-prompt.md`, `security-reviewer-prompt.md`, `consistency-analyzer-prompt.md`, `boundary-reviewer-prompt.md`, `referent-integrity-prompt.md`, `termination-reviewer-prompt.md`, `wiring-reviewer-prompt.md`, `quick-synthesized-reviewer-prompt.md` (each prompt's `finding_class` section)
- Test: `tests/skills/review-specs-finding-class-prompts.test.mjs` (extend)

**Tests:** `tests/skills/review-specs-finding-class-prompts.test.mjs` (extend)

**File count is over the 5-file guideline on purpose.** The edit is one identical block appended to the `finding_class` section of each of the 8 prompts, and a single contract test pins all 8 to the same phrases. Splitting the task would let the prompts drift apart, which the test exists to prevent.

**Context to load:** Task 8 Context packet.

- [ ] **Write failing test**

```javascript
for (const p of PROMPTS_DEFINING_FINDING_CLASS) {   // the existing 8-prompt list
  test(`${p} asks for question + 2-4 options {label, implications} on every decision finding`, ...);
  test(`${p} asks for foreseeable follow-on decisions as separate decision findings in the same round`, ...);
  test(`${p} carries the settled-decision rule for ## Decisions of Record`, () => {
    // asserts: must not re-raise a decided choice; contradiction -> defect; new decision only for a different or follow-on choice
  });
}
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/review-specs-finding-class-prompts.test.mjs`
Expected: FAIL on all 8 prompts

- [ ] **Implement**

Append one identical block to each prompt's `finding_class` section. Use the same wording everywhere so the contract test can match exact phrases.
- `question`: one sentence ending in `?`. `options`: 2–4 `{ label (≤ 60 chars), implications (≤ 300 chars, including any follow-on decision it opens) }`. Both are optional, but supply them for every `decision` finding.
- A follow-on decision that arises whichever option is chosen is raised now, as its own `decision` finding.
- Settled-decision rule: an entry in the spec's `## Decisions of Record` section is settled. Do not re-raise that choice. Raise a `defect` where the spec text contradicts it. A new `decision` is allowed only for a different choice, including one a decided entry opened.
- Do not put markdown emphasis, HTML comments, fences, or line breaks in `question`, `label` or `implications`, because they are refused at persistence.

- [ ] **Verify test passes**

Run: `node --test tests/skills/review-specs-finding-class-prompts.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/review-specs/*-prompt.md tests/skills/review-specs-finding-class-prompts.test.mjs
git commit -m "feat(review): reviewers state decision questions, options, and honor Decisions of Record"   # + Spec/Plan-task: 8
```

### Task 9: review-specs — `--defer-decisions`, bounded ask round, Decisions Required table [specialist: none]

**Charter capability:** review: batched operator decisions (BEH-4)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 2, Task 5
**Files:**
- Create: `skills/review-specs/references/steps/step-8-decision-ask-round.md`
- Create: `tests/skills/review-specs-decisions-ask-round.test.mjs`
- Modify: `skills/review-specs/SKILL.md` (frontmatter `allowed-tools` line 4, the Arguments table at lines 33-38, the Step 8 BLOCK branch at ~246-260)
- Modify: `skills/review-specs/references/steps/step-5-consolidate-findings.md` (the `## Decisions Required` table)
- Modify: `skills/review-specs/references/steps/step-6-events-and-report.md` (the `question`/`options` passthrough at ~46)
- Test: `tests/skills/review-specs-decisions-ask-round.test.mjs` (create)

**Tests:** `tests/skills/review-specs-decisions-ask-round.test.mjs` (create)

This task is skill prose only. The table renderer and the `decisionsRequiredTable` return are built and tested in Task 2.

**Context to load:** Task 9 Context packet. Review notes: TR-1.

- [ ] **Write failing test**

```javascript
// tests/skills/review-specs-decisions-ask-round.test.mjs
test('step-5 reference writes decisionsRequiredTable verbatim under ## Decisions Required and never assembles rows', ...);
test('SKILL.md allowed-tools includes AskUserQuestion', ...);
test('Arguments table declares --defer-decisions', ...);
test('Step 8 BLOCK branch carries a <ADEV_ROOT>-anchored conditional-loading pointer to step-8-decision-ask-round.md', ...);
test('ask-round reference: runs adev decisions pending, asks each duplicate_of group once, <=4 questions per call, ceil(n/4) calls back-to-back, then at most one numbered message', ...);
test('ask-round reference: unanswered / errored / no-reply stays open, no re-ask, no default, verdict stays BLOCK', ...);
test('ask-round reference: records with one adev decisions record, answer applied to every blocker_id in the group', ...);
test('ask-round reference: only ask:true groups are asked; overflow listed in the summary (TR-2)', ...);
test('ask-round reference: structured tool never invoked without an attending operator; headless callers pass --defer-decisions (TR-1)', ...);
test('with --defer-decisions Step 8 lists every pending question and options and asks nothing', ...);
test('BLOCK summary names adev decisions record then /adev:specify --revise', ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/review-specs-decisions-ask-round.test.mjs`
Expected: FAIL

- [ ] **Implement**

- Step 6: pass `question` and `options` through unmodified on `decision` findings, alongside `finding_class`, and never pass answer keys.
- Step 5: when `decisionsRequiredTable` is non-empty, write it under `## Decisions Required` in `.review.md`.
- SKILL.md: add `AskUserQuestion` to `allowed-tools`. In Arguments, add `--defer-decisions`: "never ask. List pending decisions in the BLOCK summary and return. Required for every non-interactive caller (build passes it on every dispatch)". In the Step 8 BLOCK branch, add a one-line summary plus a `> **Conditional loading:** Read \`<ADEV_ROOT>/skills/review-specs/references/steps/step-8-decision-ask-round.md\`` pointer. Load it whenever the verdict is BLOCK and `adev decisions pending` lists any item.
- Ask-round reference: write the BEH-4 procedure as numbered steps naming only `adev decisions pending --spec <p> --json` and `adev decisions record --spec <p> --answers @<tmp>`. Include the TR-1 and TR-2 rules from `## Review Notes`, the no-tool fallback, and the summary format, which gives the recorded count, then the open decisions with question and options, then the next steps.
- Run `node --test tests/skills/skill-size-cap.test.mjs tests/skills-no-inline-node.test.mjs` to confirm the body stays within both limits.

- [ ] **Verify test passes**

Run: `node --test tests/skills/review-specs-decisions-ask-round.test.mjs tests/skills/skill-size-cap.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/review-specs/SKILL.md skills/review-specs/references/steps/ tests/skills/review-specs-decisions-ask-round.test.mjs
git commit -m "feat(review): bounded decision ask round and Decisions Required table in review-specs"   # + Spec/Plan-task: 9
```

### Task 10: build loop — orchestrator ask round, `--auto` halt, `--defer-decisions`, resume re-entry [specialist: none]

**Charter capability:** strategic-planning: build auto-retry loop (BEH-7)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 5, Task 6, Task 9
**Files:**
- Modify: `skills/build/references/blocker-auto-retry-loop.md` (step 4's `DECISION_REQUIRED` branch, step 6's re-review dispatch, the step 8 `BUDGET_EXHAUSTED` row, the sidecar+fail-loud halt message)
- Modify: `skills/build/references/pipeline/step-1-review.md` (dispatch args)
- Modify: `skills/build/references/resume-mode.md` (the `DECISION_REQUIRED` re-entry)
- Create: `tests/skills/build/blocker-loop-decisions.test.mjs`

**Tests:** `tests/skills/build/blocker-loop-decisions.test.mjs` (create)

**Context to load:** Task 10 Context packet. Review notes: WR-5.

- [ ] **Write failing test**

```javascript
test('every /adev:review-specs dispatch in step-1-review.md and blocker-auto-retry-loop.md carries --defer-decisions', () => {
  // scan both files for "adev:review-specs" dispatch args; each occurrence includes --defer-decisions
});
test('interactive branch runs adev decisions pending, then adev decisions record, then adev specify group-blockers, in that order', ...);
test('ask round is run by the top-level orchestrator, never the review subagent; at most one per review cycle; consumes no retry', ...);
test('open decision after the round -> DECISION_REQUIRED halt', ...);
test('retries exhausted with open decisions -> LOOP_BUDGET_EXHAUSTED, no ask round, report lists each open question and options', ...);
test('--auto halt lists pending questions and options and names adev decisions record then /adev:build --resume', ...);
test('resume-mode.md: review failed DECISION_REQUIRED -> resume re-enters loop step 4 (group-blockers), never re-dispatches review (WR-5)', ...);
test('resume-mode.md names BLOCKERS_REVISION_MISMATCH as the stale-sidecar signal requiring a fresh review', ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/build/blocker-loop-decisions.test.mjs`
Expected: FAIL

- [ ] **Implement**

- `step-1-review.md`: the dispatch template uses `args="--spec <path> --defer-decisions"` (plus `--tier` when propagated). Add one sentence explaining why: the review subagent has no operator.
- Loop step 4. When `decision_blocker_ids` is non-empty:
  - **Interactive** (no `--auto`) and `retries_remaining > 0`: the top-level orchestrator runs `adev decisions pending --spec <p> --json`, then the ask round per `<ADEV_ROOT>/skills/review-specs/references/steps/step-8-decision-ask-round.md`, then `adev decisions record`, then re-runs `adev specify group-blockers`. With none left open, it continues to step 5 in the same cycle. Otherwise it halts `DECISION_REQUIRED`.
  - **Retries exhausted:** exit `LOOP_BUDGET_EXHAUSTED`, and list the open decisions from `pending`.
  - **`--auto`:** halt `DECISION_REQUIRED` with the full pending list and the recovery line.
- Loop step 6's re-review dispatch also carries `--defer-decisions`.
- `resume-mode.md`: add a "Resuming a `DECISION_REQUIRED` halt" subsection covering the WR-5 resolution from `## Review Notes`.

- [ ] **Verify test passes**

Run: `node --test tests/skills/build/blocker-loop-decisions.test.mjs tests/integration/build-loop-auto-retry.test.mjs`
Expected: PASS (the existing loop suite stays green)

- [ ] **Commit**

```bash
git add skills/build/references/ tests/skills/build/blocker-loop-decisions.test.mjs
git commit -m "feat(build): batched operator decisions in the review auto-retry loop"   # + Spec/Plan-task: 10
```

### Task 11: End-to-end integration test [specialist: none]

**Charter capability:** review + spec-lifecycle: one decision traced end to end (AC 18)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 5, Task 7, Task 10
**Files:**
- Create: `tests/integration/decisions-end-to-end.test.mjs`

**Tests:** `tests/integration/decisions-end-to-end.test.mjs` (create)

**Context to load:** Task 11 Context packet.

- [ ] **Write failing test**

```javascript
test('record -> pending(answered) -> group-blockers(attached) -> revise(DEC-1, sidecar cleared) -> pending(decided)', () => {
  // fixture: temp project, .context-index/specs/cross-cutting/e2e.spec.md (status review-blocked, revision 2)
  // adev blockers write with one decision finding (question + 2 options) at --revision 2
  // adev decisions pending --json      -> pending[0].blocker_id === id
  // adev decisions record --answers    -> exit 0
  // adev decisions pending --json      -> answered has id, pending empty
  // adev specify group-blockers        -> anchors[<anchor>].decisions[0].choice === 'A'; decision_blocker_ids []
  // adev specify revise --auto --authored-sections {<anchor>: <changed body>}
  //                                    -> exit 0; spec has "<!-- adev:decision DEC-1 blockers=<id> -->"; .blockers.md gone
  // adev decisions pending --json      -> decided[0].dec === 'DEC-1'
});
test('resume-shaped re-entry: answers recorded after a DECISION_REQUIRED halt survive to group-blockers and revise with no review run in between (WR-5)', ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/integration/decisions-end-to-end.test.mjs`
Expected: FAIL on the first run if any earlier task's wiring is incomplete. If Tasks 1-10 are already complete, the test passes on its first run. Confirm it fails by temporarily reverting the `decision_choice` filter in `runGroupBlockers` before you commit, then restore the filter.

- [ ] **Implement**

Fix any wiring gap the test exposes in the owning module. The test itself has no production code.

- [ ] **Verify test passes**

Run: `node --test tests/integration/decisions-end-to-end.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/integration/decisions-end-to-end.test.mjs
git commit -m "test(review): end-to-end batched operator decision trace"   # + Spec/Plan-task: 11
```

### Task 12: ADR-0012 peer-table note, docs, provider mirror regeneration [specialist: none]

**Charter capability:** cross-cutting documentation (Module Impact Map rows for ADR-0012, mirrors, docs)
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 5, Task 6, Task 8, Task 9, Task 10
**Files:**
- Modify: `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md:61-64`
- Modify: `docs/cli-reference.md` (Summary Table, the new `### decisions` section, `### blockers` `decisionsRequired`/`decisionsRequiredTable`, `### specify` revise codes)
- Modify: `docs/skill-reference.md` (review-specs `--defer-decisions` and the ask round, the build decision handling)
- Modify: `providers/*/skills/**` (regenerated)
- Test: the existing doc and mirror suites. Under `tdd` this task still names a suite: `npm test`, which covers the provider-mirror parity and docs-reference tests.

**Tests:** `npm test` (the full suite, including the provider-mirror parity, skill-size-cap and no-inline-Node tests)

**Context to load:** Task 12 Context packet. Review notes: CON-2.

- [ ] **Write failing test**

Run `node scripts/sync-provider-skills.mjs --dry-run`. Expected: it lists the mirrors made stale by Tasks 6, 8, 9 and 10. That stale state is this task's red signal.

- [ ] **Verify test fails**

Run: `node scripts/sync-provider-skills.mjs --dry-run`
Expected: a non-empty change list

- [ ] **Implement**

- ADR-0012: in the `.blockers.md` row, the Producer becomes "`/adev:build` Step 1 / `/adev:review-specs` (BLOCK path); `adev decisions record` (answer keys only)". Add one sentence under the table: "The Producer column is informational. What binds is the closed-peer rule below. A new producer of an existing peer is a table update, not an amendment." Do not add a new peer or change the rules (operator-settled rev-1 CON-1).
- `docs/cli-reference.md`: document `decisions pending|record` (signature, JSON shape, `ask_round`, error codes, the 64 KiB cap), the `blockers write` additions, and `specify revise`'s two `SPLICE_VALIDATION_FAILED` severities (RI-2). Add the BD-4 notes: `.blockers.md` is committed, answer text is redacted before storage, and the review point is the PR diff of `## Decisions of Record`.
- `docs/skill-reference.md`: review-specs `--defer-decisions` and the ask round, and build's interactive ask round, `--auto` halt and resume re-entry.
- Run `node scripts/sync-provider-skills.mjs`.

- [ ] **Verify test passes**

Run: `node scripts/sync-provider-skills.mjs --dry-run && npm test`
Expected: no pending mirror changes; the full suite passes

- [ ] **Commit**

```bash
git add .context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md docs/cli-reference.md docs/skill-reference.md providers/
git commit -m "docs(review): document batched operator decisions; regenerate provider mirrors"   # + Spec/Plan-task: 12
```

---

## Spec Coverage

| Acceptance criterion (spec order) | Task(s) |
|---|---|
| 1. `question`/`options` round-trip; truncate-then-gate; over-length question reaches `DEC-<n>` | 1, 2, 7 |
| 2. Unsafe `question`/`label`/`implications` refused with `DECISION_TEXT_REJECTED` | 1, 2 |
| 3. `OPTIONS_REJECTED`, `DECISION_FIELDS_IGNORED` (both forms) in `advisories` | 2 |
| 4. `decisionsRequired` + `## Decisions Required` table with `\|` escaping | 2, 9 |
| 5. 8 reviewer prompts carry BEH-1 and BEH-8 instructions | 8 |
| 6. `pending` lists open/answered/decided, ordering, `structured`, empty on no sidecar | 4, 5 |
| 7. `QUESTION_DERIVED` with neutral fallback; `DECISION_MARKER_MALFORMED` | 1, 3, 4 |
| 8. `duplicate_of` marking | 4 |
| 9. review-specs Step 8 bounded ask round / `--defer-decisions` / `allowed-tools` | 9 |
| 10. `record` sole writer; re-record; all rejection codes | 2, 4, 5 |
| 11. Containment: `INVALID_SPEC_PATH`, `INVALID_DECISION_ANSWERS`, 64 KiB | 4, 5 |
| 12. `group-blockers` attaches decisions; dispatch binding; `NOTHING_TO_REVISE` | 6 |
| 13. Revise creates/updates the section, fence-aware placement, `DEC-<n>`, re-check, before clear | 3, 7 |
| 14. Byte-identity `SPLICE_VALIDATION_FAILED`; no-answer revise leaves the section byte-identical | 7 |
| 15. Per-anchor refusal of `<!-- adev:decision`; section never an authoring target | 6 |
| 16. Interactive build ask round / `LOOP_BUDGET_EXHAUSTED` / `--auto` halt | 10 |
| 17. Build contract test (`--defer-decisions`, order, halt text) | 10 |
| 18. End-to-end integration trace | 11 |
| 19. `npm test` passes incl. size cap and no-inline-Node guard | 9, 12 |
| 20. No constitutional violations | all (see Constitution Check) |

## Constitution Check

- **Minimize external dependencies:** satisfied. Only `node:fs`, `node:path`, `node:util` and existing lib helpers are used.
- **Skills are primarily markdown:** satisfied. The ask round, the defer flag and the build branch are prose naming `adev decisions …` and `adev specify …` verbs. Ordering, grouping, the cap, table rendering and the section rewrite all live in `lib/`.
- **Pure ESM:** satisfied. All new files are `.mjs`.
- **Hook protocol:** not touched.
- **Version parity:** no manifest version is bumped (release-please owns it).
- **Requires human approval:** none triggered. No lifecycle skill is added, the hook protocol, CLI install paths and plugin registration are unchanged, and no dependency is added. The new `adev decisions` verb is a CLI subcommand, not a change to the installation path structure. ADR-0012 gets a documentation-only table update, consistent with the operator-settled rev-1 CON-1 decision.
- **Boundary rules (`governance/boundaries.yaml`):** every rule is `severity: warning`, matched on content. The planned files introduce no CommonJS, no inline Node in SKILL.md, and no fenced executable JavaScript in skill prose. Sensitive paths: `lib/governance/remedy-ref-render.mjs` (Task 1) sits under the configured `lib/governance/**`. Its change is additive, and the existing `renderRemedyRef` output is pinned byte-identical by tests.
- **Cross-boundary operation:** Task 6 touches both `lib/` and `skills/specify/`. Task 12 touches `.context-index/adrs/`, `docs/` and `providers/`.

## Quality Gates

After all tasks are complete, `/adev:validate` runs the full quality gate suite and records the results in the validation report (`.validate.md`), not in this plan. The gates come from `.context-index/governance/gates.yaml`:

- `test`: `npm test` (deterministic)
- `quality-gate`: `npm test` (deterministic)
- `integration-test`: `npm run test:evals` (deterministic; needs live evals and is not part of the default run)
- `lint` / `typecheck`: commented-out templates with no command, so they are skipped
- All acceptance criteria from the spec are satisfied (see Spec Coverage)

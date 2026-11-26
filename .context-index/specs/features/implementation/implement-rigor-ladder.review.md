---
spec: .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: 314790ad7b7bf6401056a8e9cbf498cbd6e95b1d57cc0865c5d94d872aa4c202
reviewed: 2026-11-25
---

# Architecture Review: implement-rigor-ladder

> **Date:** 2026-11-25
> **Spec:** .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
> **Charter:** .context-index/specs/features/implementation/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full (spec `risk_level: high` → `policies.high.review_mode: full`)
> **Diff scope:** first review, full-context dispatch
> **Warnings from registry load:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` on profile `browser-review` (not used by any dispatched reviewer)
> **Dispatch note:** prompts were assembled by `adev governance dispatch` (worktree CLI; the installed 0.28.1 CLI predates the verb) and delivered to each reviewer as a file reference because of their size (56–302 KB). Content is byte-identical to the `buildReviewerDispatches` output.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | (triggered: loop, retry, iterate, convergence) | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

- **CON-1 (blocker, contract, `output-contract`).** `Review-round: lite=0` conflicts with `review-provenance.spec.md` Contract A: the stage enum is `spec-compliance|code-quality|synthesized`, `cycles >= 1` is required, and every task commit must carry at least one trailer. `buildReviewRoundTrailer` rejects both. Amend review-provenance and the builder, or drop the trailer.
- **CON-2 (blocker, contract, `behaviors-4`).** Removing the `batched-task` floor leg contradicts `batched-task-dispatch.spec.md` C.3 ("both review stages, per task, at today's depth") and `graduated-review-depth.spec.md` Output Contract G, which added the leg to avoid reinterpreting C.3 silently. Amend C.3 and its acceptance text, or keep a narrower batch rule.
- **CON-3 (warning).** `graduated-review-depth.spec.md` (validated, rev 12) and `graduated-rigor-tiers.spec.md` sections would be left contradicting this spec. A "spec note" (T7) is not enough. Commit to revising them with a `supersedes` relation.
- **CON-4 (warning).** The Arguments table says build and work forward `--lite` to `implement` only. BEH-11 says they forward it "unchanged to every child". Forward `--tier lite` to review-specs and validate, and `--lite` only to implement.
- **CON-5 (warning, adr-compliance).** "Skips test-depth resolution" is not reconciled with ADR-0017 §2, under which `adev test-policy resolve` is the sole writer of the assignment event.
- **CON-6 (suggestion).** Disambiguate `implement_mode` (review depth) from `implementation_mode` (test discipline), and use the exact cap name (`implement.max_review_cycles` / `--review-cycles`).

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

- **RI-1 (blocker, contract-violating-trailer-format, `output-contract`).** `Review-round: lite=0` is refused by `REVIEW_ROUND_STAGES` and `buildReviewRoundTrailer` (lib/lifecycle-state.mjs:1340, :1640, :1708). The Output Contract lists no change to either, or to review-provenance.
- **RI-2 (blocker, misdescribed-error-code, `failure-modes`).** A malformed `implement_mode` does not raise `INVALID_TIER` today. It silently falls back (review-depth.mjs:331, rigor-mode.mjs:96), and under BEH-2 it would fall back to `quick`. Either add policy-value validation or correct the row.
- **RI-3 (warning).** The depth enum is `REVIEW_DEPTHS` in lib/lifecycle-state.mjs:1461, not lib/diagnostics/event-schemas.mjs.
- **RI-4 (warning).** `build-leaf-mode` does not resolve on this branch. It is unmerged and exists only in the main checkout's working tree.
- **RI-5 (warning).** lib/cli/governance.mjs:350 hardcodes `full|quick`, and the implement.mjs usage banners say `full|quick`. Widening `RIGOR_MODES` does not reach them.
- **RI-6 (suggestion).** `init prompt implement-rigor` needs a cli/index.mjs dispatch entry. `QUALITY_GATES_FAILED` is a new code and is not marked as new.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1 (blocker, unreachable-config-key, `behaviors-6`).** The `lite=0` trailer has no producer that can accept it (`buildReviewRoundTrailer` rejects it), and Library changes does not list the helper.
- **WR-2 (blocker, no-caller, `output-contract`).** `lib/cli/implement.mjs` (`resolve-depth`) is missing from Library changes and the task map. No CLI surface is named that carries `--lite` or `implement_mode: lite` to `liteGrant()`, or that returns the BEH-7 escalated depth.
- **WR-3 (blocker, no-caller, `arguments`).** `CONFLICTING_TIER_FLAGS` has no named raising code. A SKILL.md prerequisite cannot enforce an exit code, and no acceptance criterion exercises it.
- **WR-4 (warning).** The emitter of `LITE_TRIPWIRE_ESCALATED`, `LITE_SUPPRESSED_PARALLEL` and the BEH-5 failing-condition summary is unstated (CLI or skill prose).
- **WR-5 (warning).** No verb is named that computes route's `lite-eligible: <n> of <m>` line.
- **WR-6 (warning).** The cli/index.mjs dispatch entry for the new init verb is missing. The non-interactive preset-default path is not tied to a verb or test.
- **WR-7 (warning).** BEH-10 names no reader for the validate advisory and no rule for choosing which implement run counts.
- **WR-8 (suggestion).** Add `LITE_NOT_ALLOWED_FOR_HIGH` to an acceptance criterion explicitly.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

- **BD-1 (blocker, input-trust, `behaviors-6`).** The `lite=0` trailer either hits the validated helper's refusal or gets hand-written as free text. That reopens the CWE-93/CWE-113 surface that review-provenance SEC-1 closed, on the path that has no reviewer.
- **BD-2 (warning).** The BEH-7 test/doc exemption is lexical. `*.spec.*` matches the project's own `*.spec.md`, so a lite task could rewrite its governing spec without tripping the check. Symlinks under `docs/` or `tests/` are also exempt. Narrow the globs, exclude `.context-index/**` and `*.spec.md`, never exempt mode-120000 entries, and state that the sensitive-path and boundary checks run on every touched path.
- **BD-3 (warning).** A non-interactive init writes `lite` for `prototype` with no typed choice, and a re-run could overwrite an existing `implement_mode`. Never overwrite non-interactively, write `lite` only on an explicit choice, or record the default as a decision of record.
- **BD-4 (warning).** The init prompt's `--mode` and typed input need a closed-enum, exact-match refusal that writes the enum constant, never the raw input (`governance-values.mjs` contract). Add an injection test.
- **BD-5 (suggestion).** Read policy, boundary and sidecar inputs from the dispatch-time snapshot or base commit, so an inline agent cannot influence its own later resolutions.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TR-1 (blocker, unsafe-unattended-default, `behaviors-7`).** The `cq-<n>` loops are bounded only by reference, and no cap-trip verdict is given for unattended runs (`--lite` through `/adev:build` or `/adev:work`). State that at the cap the task stops, the run reports the unconverged task ids, and no further work proceeds on that task.
- **TR-2 (suggestion).** State the tripwire bound ("upward only, at most two levels") once, in BEH-7.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

- *A universal coverage claim must ship with the predicate that checks it* (medium)
- *Use session JSONL for token measurement, not file-size estimates* (medium)
- *Cache reads are 71% of session cost — minimize context accumulation* (medium)

None of the three is a signature match for any blocker here; they are the module's general entries.

---

## Summary

**Total findings:** 29 (9 blockers, 14 warnings, 6 suggestions), which reduce to 6 distinct blocking problems:

1. **`Review-round: lite=0` trailer** is refused by the validated builder and contradicts review-provenance (CON-1, RI-1, WR-1, BD-1).
2. **Batched-task floor removal** silently reinterprets the validated `batched-task-dispatch` C.3 contract (CON-2).
3. **`resolve-depth` CLI surface** is not named for `--lite`, policy authorization, or tripwire escalation (WR-2).
4. **`CONFLICTING_TIER_FLAGS`** has no raising code (WR-3).
5. **Unattended cap-trip default** is missing for the review loops (TR-1).
6. **Malformed `implement_mode`** is misdescribed as raising `INVALID_TIER` (RI-2).

**Action required:** run `/adev:specify --revise .context-index/specs/features/implementation/implement-rigor-ladder.spec.md` to address the blockers recorded in `implement-rigor-ladder.blockers.md` (and the warnings in the same revision), then re-run `/adev:review-specs`.

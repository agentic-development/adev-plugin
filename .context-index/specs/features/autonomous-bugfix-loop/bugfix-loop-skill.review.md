---
last-reviewed-revision: 3
file-sha: 5da1a1fe39b038e77e5c011f0a1844df28e1fb130d83c4f31acfc24f0d976ec9
---

# Architecture Review: bugfix-loop-skill (round 3)

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full
> **Note:** re-review after round-2 BLOCK. Round-2 findings verified resolved unless restated below. This round was run against the spec as it exists on disk at revision 3, including verification against actual current source (not just the spec's own prose) for every referent, wiring, and boundary claim.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via `adev extension install web-service`). Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** [warning] (contract, `system-constitution-reference`): The System Constitution Reference and Output Contract sections assert, in the present tense, that `debug` is already a third member of the `completion-tokens.spec.md` convention and that `single-front-door.spec.md` already excludes "this skill" (and `debug`) from footer chaining. Verified against both cross-cutting specs directly: `completion-tokens.spec.md` (rev 1) names only `ADEV-BUILD`/`ADEV-VALIDATE`; `single-front-door.spec.md` names only `build`/`validate` as excluded from chaining — `debug`/`bugfix-loop` appear nowhere in either file outside a generic skill-route enumeration. The sibling `debug-completion-and-auto.spec.md` states the equivalent claim carefully in future/pending tense ("this spec adds `debug` as a third, and its implementer should coordinate a small addition there"); this spec should match that framing rather than asserting the coordination as already done.
- **CON-2** [warning] (adr-compliance, `output-contract`): The Output Contract states "[the run-state file's] format/ownership **is registered** in ADR-0015's Decision-section table as part of implementation." Verified against `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` — the Decision table does **not** yet contain a `bugfix-loop-runs-<run_id>.json` row (this is the same gap round-2 CON-3 flagged; it is tracked correctly as an unchecked Acceptance Criteria item, but the Output Contract prose's present-tense "is registered" doesn't say so). The sibling `tracker-provider-bridge.spec.md` was itself corrected in an earlier round to add an explicit "not yet registered" caveat after making the same present-tense overclaim — this spec should adopt that same corrected wording rather than reintroducing the ambiguity.
- **CON-3** [suggestion] (n/a, `n/a`): This reviewer's materialized context pack (`base` — constitution + platform-context only, per this project's `.context-index/governance/review.yaml`) does not include sibling specs, cross-cutting specs, or ADRs by default. To verify the specific cross-referenced claims above, sibling specs and the two named cross-cutting specs were read directly via Read/Grep rather than relying on pack inclusion; a broader unscoped sweep of all ADRs/cross-cutting specs was not performed. If deeper corpus-wide consistency checking is desired for this reviewer role going forward, consider widening its context_pack from `base` to `consistency` in `review.yaml`.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

- **RI-1** (round-2 blocker, now resolved): Verified `skills/debug/SKILL.md:161` still hardcodes `--owner "${USER}/local"` today, and `debug-completion-and-auto.spec.md:43` (BEH-9) exists exactly as this spec describes it, explicitly framing the env-var read as a currently-unmet forward dependency rather than an already-working mechanism. The spec's revised wording is accurate, not aspirational-presented-as-fact. No longer a blocker.
- **RI-2** (round-2 blocker, now resolved): `adev issues release <id> --owner bugfix-loop` — verified `adev issues release`/`claim` accept `--owner` (`lib/cli/issues-claim.mjs:28-30,40`), and the CLI's own `resolveOwner` already falls back to `ADEV_ISSUE_OWNER` when `--owner` is absent (`lib/cli/issues-claim.mjs:48-52`). No longer a blocker.
- **RI-3, RI-4** — Clean passes: `adev issues next --type bug --max-priority P3 --json` correctly attributed to the sibling `bug-selection-and-eligibility` spec's BEH-1/BEH-8 as a not-yet-implemented Milestone-1 verb (confirmed absent from `lib/cli/issues.mjs` today, matching the sibling spec's own Task Map); `AttemptRecord`/`FAILING-CHECKS:` referents match `per-issue-attempt-cap.spec.md` and `debug-completion-and-auto.spec.md` respectively.
- **RI-5** [warning] (unclear-forward-reference, `output-contract`): `run_id` generation via `crypto.randomUUID()` has no existing precedent in this codebase's `lifecycle-state/` producers to sanity-check against — `/adev:build`'s own state file is spec-slug-keyed, not UUID-keyed, so this is a net-new convention for the charter rather than reuse of an established pattern. Not a false claim (the built-in is real and constitution-compliant), but the spec should note this is a new convention rather than implicitly reading as consistent with an existing one.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1** [suggestion] (n/a, `output-contract`): `bugfix-loop-runs-<run_id>.json` producer/consumer/trigger/test chain (self-write, `--resume` self-read) is complete and stated.
- **WR-2** [blocker] (write-only-state, `output-contract`): `BugfixLoopRun.degraded_sync_note` has a verified real producer (`tracker-provider-bridge.spec.md`'s Error Propagation: "this spec is that field's only writer," firing on the 5th consecutive degraded GitHub-sync turn) but **no named consumer anywhere** in either spec, the codebase, or a companion change. This spec's own text explicitly disclaims reading it ("this skill never reads or acts on it itself, it only reserves the schema slot"), and the sibling spec's only claimed reader is an unspecified "human reviewing `BugfixLoopRun` state" — no CLI surface (`/adev:status`, `/adev:issues`), doc pointer, or acceptance criterion in either spec establishes that the field is ever read back. This is the write-side mirror of "no caller": a value that is only ever set, never observed.
  - **Recommendation:** Either add a concrete consumer (surface `degraded_sync_note` in `/adev:status` output or the loop's own terminal summary) with a corresponding acceptance criterion, or explicitly scope the field as diagnostic-only and state that no consumer is required for Milestone 1.
- **WR-3** [warning] (n/a, `output-contract`): `ADEV_ISSUE_OWNER` producer/consumer both verified real (per RI-1 above), but no single test exercises the actual cross-skill handoff end-to-end — each side has only its own isolated acceptance criterion.
- **WR-4** [warning] (n/a, `output-contract`): `AttemptRecord` write → `adev issues next` exclusion wiring is real (`lib/bugfix-loop-attempts.mjs::recordDebugAttempt` exists, currently uncalled by non-test code, expected pre-implementation) but no test spans write-in-turn-N → exclusion-in-turn-N+1 end to end.
- **WR-5** [warning] (n/a, `output-contract`): `FAILING-CHECKS:` block producer (debug-completion-and-auto BEH-8) and consumer (this spec's `AttemptRecord`-write step) are both named, but no acceptance criterion covers the actual parse/extraction step.
- **WR-6** [suggestion] (n/a, `arguments`): `--github-sync` flag wiring to the tracker-provider-bridge is fully named and tested on both sides — no issue.
- **WR-7** [warning] (n/a, `output-contract`): `ADEV-BUGFIXLOOP` completion token is produced and consumed (user/transcript, optional `/goal`), but the existing completion-tokens drift-guard test (`tests/skills/completion-tokens.test.mjs`) currently asserts only `build`/`validate`; this spec names the Task Map coordination as a note rather than committing it via an acceptance criterion, so grammar-conformance coverage for this token isn't guaranteed to land with the same change.
- **WR-8** [suggestion] (n/a, `output-contract`): Load Skill Extensions block wiring is fully verified (`tests/skills-extension-coverage.test.mjs`) — no issue.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1** [warning] (path-containment, `invocation-modes`): `--resume-run-id <id>` is operator-suppliable and flows directly into the `bugfix-loop-runs-<run_id>.json` path, but the spec states no format validation (e.g. a UUID-shape check, mirroring `exec-payload.mjs`'s `EXTENSION_NAME_PATTERN.test()` pattern) before that externally-typed value is used to build a filename.
- **BD-2** [suggestion] (subprocess-interpolation, `output-contract`): CLI invocations are represented as literal command strings, consistent with `skills/debug/SKILL.md`'s existing convention — not a new crossing.
- **BD-3**: Item 3 (input trust) — not applicable; no new YAML-parsing surface introduced.
- **BD-4** [warning] (privilege-escalation, `invocation-modes`): A single top-level invocation authorizes up to `--max-turns` (default 20) autonomous `--apply` code-changing turns with no per-turn re-confirmation. This mirrors `/adev:build --resume`'s already-approved precedent but the spec never states that grounding explicitly, unlike the extension-install flow's explicit per-install consent contract.
- **BD-5**: Item 5 (artifact leakage) — verified correct; `.gitignore`'s `.context-index/lifecycle-state/*.json` glob does cover the flat run-state filename.
- **BD-6** [warning] (destructive-operation, `invocation-modes`): The `--resume` (no `--resume-run-id`) fallback resolves ambiguity by mtime alone across all `bugfix-loop-runs-*.json` files with no identity check (branch, status), risking an accidental resume-and-overwrite of the wrong run's state file when multiple stale/crashed runs coexist (e.g. across worktrees).

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

- **TR-1** [suggestion] (n/a, `arguments`): Outer self-re-invocation loop (`--max-turns`/`--max-bugs`) has all three termination properties present but split across the Arguments and Failure Modes tables rather than co-located.
- **TR-2**: Per-turn claim-failure retry (bounded to 3) — a model instance of the pattern; cap, cap-trip verdict, and safe unattended default all stated together. No issue.
- **TR-3** [warning] (n/a, `failure-modes`): The cross-run "PARKED bug re-selected" dynamic defers its actual per-issue attempt-cap number entirely to the sibling `per-issue-attempt-cap` spec without restating it, and without explicitly noting that `--max-turns` remains the global backstop if that sibling mechanism ever fails to converge an issue to an excluding verdict — a reader of this spec alone cannot confirm the dynamic terminates safely without also verifying the sibling spec's guarantees.

---

## Summary

**Total findings:** 17 (1 blocker, 11 warnings, 5 suggestions)
**Action required:** Address the 1 blocker (WR-2 — `degraded_sync_note` is write-only state with no named consumer) and, ideally, the warnings above, then run `/adev:specify --revise --spec .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md` to produce revision 4, and re-review.

**Note on round-2 blockers:** All three round-2 blockers (CON-1, RI-1, RI-2) are verified resolved in revision 3 — CON-1 (`ADEV-BUGFIXLOOP` persona carve-out) was independently confirmed by this round's Consistency Analyzer as no longer present as a gap in the same form (the spec now correctly names the required carve-out edit as an acceptance criterion), and RI-1/RI-2 (claim-owner mismatch, missing `--owner` on release) were independently re-verified against current source by this round's Referent Integrity Reviewer and found genuinely fixed. Round 3 surfaces one new blocker (WR-2) that round 2 did not catch, plus several new warnings from reviewers doing deeper source verification than a pure text-consistency pass.

**Note on `blocker_id`:** Per this project's bundled reviewer prompts (all five reviewers dispatched under a read-only, no-shell-execute profile), no reviewer emits a `blocker_id` for its blocker finding — the prompts explicitly instruct reviewers not to fabricate one. WR-2 therefore carries no `blocker_id`. Per the aggregator validation rules (`skills/review-specs/SKILL.md`, Step 6b-bis), a BLOCK finding with no `blocker_id` is logged as a `LEGACY_REVIEWER_OUTPUT` advisory and excluded from the `.blockers.md` sidecar — consistent with round 2 (which also produced zero-`blocker_id` findings and no sidecar). No `.blockers.md` was written for this round, matching that precedent.

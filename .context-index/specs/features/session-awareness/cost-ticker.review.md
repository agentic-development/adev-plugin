# Architecture Review: cost-ticker

> **Date:** 2026-05-22
> **Spec:** .context-index/specs/features/session-awareness/cost-ticker.spec.md
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Verdict:** PASS_WITH_NOTES

last-reviewed-revision: 1
file-sha: 8c27f8a75d61d467220fca52b92f4068e7777acd98ef7f3a8b34758e6965dd5f

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

### Findings

- **SA-1** | warning | Location: Behaviors §11 (cost-warn sticky tracker)
  - **Finding:** Behavior 11 specifies the `[cost warn]` line "fires at most once per `(spec, threshold-crossing)` boundary — once `cost_usd >= N` it is sticky for the rest of the build." However, the verb is invoked per-step as a fresh process; there is no defined persistence layer for the "sticky" state. The spec does not say whether the tracker lives in the lifecycle log, in a side file, or in the `/adev:build` orchestrator's in-memory state.
  - **Recommendation:** Clarify ownership of the sticky tracker. Two options: (a) Compute "first crossing" deterministically inside the verb by comparing cumulative cost against `--since` baseline (no state needed, idempotent); or (b) Specify that `/adev:build` SKILL prose tracks the boolean across step invocations and the verb itself always emits the warning when threshold is exceeded — the dedup lives at the orchestrator. Either is acceptable; the spec must pick one.

- **SA-2** | warning | Location: Behaviors §6 (default `--since` resolution)
  - **Finding:** Behavior 6 says "default to the most recent `lifecycle_step` event with `step: 'review'`, `status: 'started'` for this spec found in `.context-index/lifecycle-state/<slug>.jsonl`." The slug-derivation rule is unspecified — does it come from the spec's path basename, from a `slug` frontmatter field, or via the source-manifest? Different derivation rules will produce different default `--since` values for the same spec.
  - **Recommendation:** Reference the canonical slug resolver used elsewhere (e.g., `lib/lifecycle-state.mjs` already resolves spec → log path internally). Specify that the verb calls that helper rather than constructing the path itself, or pin the rule explicitly (spec path basename minus `.spec.md` suffix).

- **SA-3** | suggestion | Location: Integration Points §1, Behaviors §8
  - **Finding:** Behavior 8 says `/adev:build` invokes the verb "between pipeline steps" after each step's `completed` event. This is one of two design options — alternatively the verb could be invoked once per build at the end. The current design produces a ticker per step (5 invocations per spec on a full pipeline), which is the desired UX, but adds 5 JSONL re-reads per build. For a 50 MB JSONL the per-step cost is non-trivial.
  - **Recommendation:** Confirm the per-step UX is preferred. If so, a future plan task could add a per-build aggregator cache; flagging only — not a blocker.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

### Findings

- **SEC-1** | suggestion | Category: rate-limiting / DoS | Location: Behaviors §1, Error Cases
  - **Finding:** The aggregator reads `.context-index/.session-tracking.jsonl` line-by-line. The spec mentions "single-pass line-stream reader" in the constitution section but defines no upper bound on the file size, line count, or per-line size. Token-cost-logging.spec.md sets a 50 MB cap on the *Claude Code session file* being parsed for usage data, but no cap exists on the JSONL the aggregator reads. A malformed JSONL with multi-megabyte lines could exhaust memory.
  - **Recommendation:** Either (a) bound the aggregator with a max line length (e.g., 1 MB per line; lines exceeding the cap are counted as malformed under Behavior 13 and skipped), or (b) document that the line-stream design naturally degrades since per-line memory is bounded by line length and reject lines > a documented threshold. OWASP "Resource Exhaustion" guidance applies.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### Findings

- **CON-1** | suggestion | Category: terminology / contract | Location: Behaviors §4, §6
  - **Finding:** The spec refers to "`lifecycle_step` events" and "`lifecycle_step` event of type `started`" when scoping checkpoint grouping and default `--since`. The canonical lifecycle event taxonomy (per `lib/lifecycle-state.mjs` and `lifecycle-gate.spec.md` cross-cutting) uses `type: "step"` events with a `step` field. The cost-ticker spec's wording ("event of type `started`") inverts that — `started` is a `status`, not a `type`.
  - **This Spec:** `lifecycle_step event of type 'started' with step ∈ {review, plan, ...}` (§4) and similarly in §6.
  - **Conflicts With:** `lib/lifecycle-state.mjs::reportStep` and the API-reference appendix in `skills/review-specs/SKILL.md` (which uses `{ step: "review", status: "started" }`).
  - **Recommendation:** Reword to `step` events with `status: "started"` (or `status: "completed"` per the integration point) so consumers can locate matching log entries with the same shape the canonical lib emits.

---

## Summary

**Total findings:** 5 (0 blockers, 2 warnings, 3 suggestions)
**Action required:** Address SA-1 (sticky tracker ownership) and SA-2 (slug derivation) inline in the spec OR carry them as Plan-level decisions. SEC-1, SA-3, and CON-1 are non-blocking nudges. The spec is ready for planning.

### Lifecycle gate transition note

`gates.yaml` defines no `approver_role` for the `spec-to-plan` transition; PASS_WITH_NOTES does not require human-in-the-loop approval per `risk-policies.yaml` (`medium`: `require_hitl_approval: false`).

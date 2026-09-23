---
spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
charter: cli-driver-surface
date: 2026-08-19
verdict: PASS_WITH_NOTES
rigor-tier: quick
last-reviewed-revision: 1
file-sha: f01acafdba952ac40a10f5cf40836f237786254d7fe319715373b4b112f2baa9
---

# Architecture Review: issues-skill-lib-directive-extraction

> **Date:** 2026-08-19
> **Spec:** `.context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md`
> **Charter:** `.context-index/specs/features/cli-driver-surface/charter.md`
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** quick (explicit `--tier quick`; also matches `risk_level: low` → `review_mode: quick` in `risk-policies.yaml`)

## Registry Warnings

| Code | Message |
|---|---|
| BROADEN_TOOL | Profile `browser-review`: allow_add broadens posture by adding mcp_server `playwright`. |
| BROADEN_TOOL | Profile `browser-review`: allow_add broadens posture by adding category `web-fetch`. |
| BROADEN_NETWORK | Profile `browser-review`: network broadened `deny` → `read-only`. |
| UNKNOWN_REVIEWER_DEFAULTED | Reviewer `quick-synthesized-reviewer` not declared in domain `software` — severity defaulted to `warning` on the lifecycle event. |

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable (read-only) | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` |

Quick tier dispatches exactly one synthesized reviewer covering all three lenses.
The three registry defaults (`structural-architect`, `security-reviewer`,
`consistency-analyzer`) are **not** dispatched in this tier.

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** PASS_WITH_NOTES

### SA-1 — warning — Migration Path Step 4 / BEH-7 / Changes Catalog

BEH-7 requires `adev issues milestone ship` without `--yes` to print pending
confirmations, exit `2`, and mutate nothing. The backing lib does the opposite
today: `lib/milestones.mjs:921` gates confirmations on
`if (confirms.length > 0 && options.confirmFn)` — with no `confirmFn` it skips
confirmations entirely and proceeds through `updateStatusAndCloseEpic()` (status
write, epic close, tag/release-please side effects). The Changes Catalog lists no
MODIFIED entry for `lib/milestones.mjs`, and INV-1 forbids touching existing
tests, so the spec asserts a contract nothing in the change set is stated to
deliver. "Mutates no file" is also imprecise: `evaluateShipCriteria` runs before
confirmations are inspected and executes gate commands.

**Recommendation:** Either add `lib/milestones.mjs` to MODIFIED, or state that the
unconfirmed-ship refusal is decided in the verb before `milestoneShip` is entered,
and tighten BEH-7's "mutates no file" to name what may still execute (gate checks).

### SA-2 — warning — Error Cases / BEH-7

`milestoneShip` also returns `{ shipped: false, results }` when auto-checks fail
(`lib/milestones.mjs:917`), and gate execution can time out or throw. The Error
Cases table covers only "ship without `--yes`" and generic adapter throws, leaving
the failed-ship-criteria and gate-timeout paths with no defined exit code or
output shape — the two most likely real-world outcomes of the verb.

**Recommendation:** Add rows for "ship criteria failed" and "gate check
errored/timed out" with explicit exit codes distinguishing refusal (2) from
failure (1).

### CON-1 — warning — Migration Path Step 5 / Acceptance Criteria

Step 5 ("Regenerate provider mirrors") and the acceptance criterion "Provider
mirrors regenerated; parity test passes" run against the charter's Out of Scope,
which states provider mirror sync "remains hand-maintained until a dedicated
`provider-mirror-sync` charter" and scopes the pre-commit hook to canonical
`skills/**` only. The spec's `charter-extension: true` header comment documents
only the lib-directive divergence, not this one.

**Recommendation:** Extend the charter-extension note to record the provider-mirror
divergence (`scripts/sync-provider-skills.mjs` and the parity test do exist, so the
charter text may simply be stale), or drop mirror regeneration from the acceptance
criteria.

### CON-2 — suggestion — Invariants (INV-5)

INV-5 defines exit `2` as "refused by a guard (close-blocked, cycle, unconfirmed
ship)", broader than charter Invariant 3 and Interface Contracts, which define `2`
as gate-blocked. Existing precedent supports the broader reading
(`lib/cli/issues-claim.mjs:32`, `lib/cli/diagnose.mjs:210`), so this is terminology
drift rather than a real conflict.

**Recommendation:** Note in INV-5 that `2` means "refusal, caller must not proceed"
and that gate-blocked is one instance of it.

### SEC-1 — suggestion — Changes Catalog (`milestone ship`)

The new verb makes reachable-by-argv a path that executes gate commands from
`.context-index/governance/gates.yaml` via `execFileSync` (`lib/milestones.mjs:659`)
and, under `tag-only`, shells out to `git`. Trust boundary is unchanged (config is
repo-local and already agent-reachable) and the milestone name is validated by
`validateMilestoneName`, so this is informational.

**Recommendation:** Mention in the spec that `ship` inherits gates.yaml command
execution, so reviewers of the verb do not treat it as pure board mutation.

### Verified factual claims

The reviewer independently confirmed: the fenced JS at `skills/issues/SKILL.md:49-63`,
the 16 prose directive sites, the `lib/cli/issues.mjs` sub-verb roster,
`dispatchesSubcommandHelp`, `renderTasksMd` having no verb while `adev status --render`
writes `tasks.md` (`cli/index.mjs:1471`), the `--priority` error string, and
`milestoneShip`'s `confirmFn` callback. Numeric return codes from `run()` are honored
by `cli/index.mjs:2006-2011`, so the exit-code contracts in BEH-4/5/7 are
implementable as written.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in
> the header above, computed from post-cap findings across all reviewers.
> `verdict_rules.blocker_threshold: 1`. No severity cap applied (reviewer cap is
> `blocker`; no finding was demoted).

## Summary

**Total findings:** 5 (0 blockers, 3 warnings, 2 suggestions)
**Action required:** None blocking. The spec is cleared for `/adev:plan`. The three
warnings all concentrate on Migration Path Step 4 (milestone lifecycle) and should be
resolved during planning: the `milestone ship` confirmation contract needs an explicit
owner (verb vs. `lib/milestones.mjs`), the milestone error-case table needs the
failed-criteria and gate-error rows, and the provider-mirror acceptance criterion needs
either a charter-extension note or removal.

**Transition gate:** `.context-index/governance/gates.yaml` was consulted; no
`spec-to-plan` approver_role blocks this transition (informational only).

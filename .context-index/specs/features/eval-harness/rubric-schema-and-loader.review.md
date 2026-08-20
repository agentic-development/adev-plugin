---
spec: .context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
verdict: PASS
rigor-tier: quick
reviewed: 2026-08-19
last-reviewed-revision: 1
file-sha: 138867edce26c8195769813aeca948f1fd1ed9fd58f145228db0c6365bf096dc
---

# Architecture Review: rubric-schema-and-loader

> **Date:** 2026-08-19
> **Spec:** `.context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md`
> **Charter:** `.context-index/specs/features/eval-harness/charter.md`
> **Rigor tier:** quick (explicit `--tier quick`; overrides the `medium` risk-policy `review_mode: full`)
> **Verdict:** PASS

## Registry Notes

Registry loader warnings (`adev governance reviewers`):

- `BROADEN_TOOL` — Profile `browser-review`: `allow_add` broadens posture by adding mcp_server `playwright`.
- `BROADEN_TOOL` — Profile `browser-review`: `allow_add` broadens posture by adding category `web-fetch`.
- `BROADEN_NETWORK` — Profile `browser-review`: network broadened `deny` → `read-only`.

None of these profiles were used by this review.

A `UNKNOWN_REVIEWER_DEFAULTED` advisory was emitted when recording the reviewer event: `quick-synthesized-reviewer` is not declared in domain `software`, so its event severity defaulted to `warning`. This is expected for the synthesized quick-tier reviewer, which is a bundled prompt rather than a registry entry.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` |

Quick tier dispatches exactly one synthesized reviewer covering the structural, security, and consistency lenses in a single pass. The registry's `always`-dispatch reviewers (`consistency-analyzer`, `referent-integrity`, `wiring-reviewer`, `boundary-reviewer`) and the `triggered` reviewer (`termination-reviewer`) were **not** dispatched — that is the defined behavior of the `quick` tier, not an omission.

Context pack rendered: `review-base` (inline delivery, 24,228 bytes) — constitution, platform context, and the parent charter. No sibling specs exist under this charter yet.

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via `adev extension install web-service`) where it fits the artifact class. Prompt retained on disk. |

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** PASS

### SA-1 — suggestion

- **Location:** Behaviors (BEH-8) / Error Cases table
- **Finding:** BEH-8's legacy-scale detection is specified as "numeric 1-5 `weight` values on `quality_dimensions` entries," but the precise detection rule is left implicit — whether a single out-of-range weight is enough, whether the whole set must look like a 1-5 scale, and whether a `weight` value of `3.5` or `6` counts. BEH-2, BEH-3, and BEH-6 all specify their triggering conditions with more precision than BEH-8 does.
- **Recommendation:** Tighten BEH-8's wording to state whether any single numeric `weight` in the 1-5 range is sufficient to trigger `RUBRIC_LEGACY_SCALE`, and name the boundary values that count as legacy scale versus a coincidental valid flat value.

### SA-2 — suggestion

- **Location:** Error Cases table
- **Finding:** `RUBRIC_NOT_FOUND` and `RUBRIC_DUPLICATE_ID` appear in the Error Cases table without a corresponding lettered behavior in the Behaviors section, unlike the other six error codes. The Acceptance Criteria reference the duplicate-id postcondition informally ("Element and criterion ids are asserted unique") without a BEH id.
- **Recommendation:** Consider adding BEH-9 and BEH-10 for `RUBRIC_NOT_FOUND` and `RUBRIC_DUPLICATE_ID` for full traceability. Not blocking — the Error Cases table and Postconditions already carry enough detail for implementation.

### Security lens

No findings. BEH-7 and the Preconditions require path containment before any read (`UNSAFE_RUBRIC_PATH`), consistent with the `UNSAFE_TEMPLATE_PATH` precedent and the charter's Security quality attribute. The loader is declared read-only, no-network, and no-write, matching the charter's Dependencies table — session JSONL and network access are explicitly out of this spec's scope and deferred to `collectRunRecord`.

### Consistency lens

No findings. Constitutional alignment (Node built-ins only, `.mjs` ESM, no executable logic in SKILL.md) is explicitly justified in the spec's own System Constitution Reference section and is consistent with constitution principles 1-3. No contradictions found against the parent charter's Domain Model (the Rubric entity fields match), the Interface Contracts (`loadRubric(path)` signature matches), or any ADR.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the header above, computed from post-cap findings across all reviewers, using `verdict_rules.blocker_threshold: 1`.

## Summary

**Total findings:** 2 (0 blockers, 0 warnings, 2 suggestions)
**Action required:** None blocking. The spec is ready for planning. The two suggestions may be folded into a future revision of the spec or handled during planning.

## Advisory Notes (orchestrator)

- The spec file opens with an HTML comment (`<!-- partial_schema: spec@1 -->`) above its frontmatter delimiter. Every lifecycle event written for this spec carries the `adev/frontmatter-present` diagnostic warning as a result. Not a review finding, but worth correcting so the diagnostic clears.
- Two `lifecycle_step review status=started` events are present in `.context-index/lifecycle-state/rubric-schema-and-loader.jsonl` (00:36:59Z and 00:37:36Z). The first belongs to an earlier invocation that did not reach a terminal event.
- Cross-repo `depends-on` validation: skipped — the spec declares no `depends-on` references.
- Governance gates: `.context-index/governance/gates.yaml` is present; no `spec-to-plan` `approver_role` was applied to this review.

## Next Step

Verdict PASS → `/adev:plan --spec .context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md`

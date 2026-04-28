# Architecture Review: adev-build-skill

> **Date:** 2026-04-27
> **Spec:** .context-index/specs/features/strategic-planning/adev-build-skill.md
> **Charter:** .context-index/specs/features/strategic-planning/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 6
> **file-sha:** 13d916c3d8934d14d8a607e715edacb4542f2a52

## Reviewers Dispatched

| ID | Name | Mode | Tier |
|----|------|------|------|
| structural-architect | Structural Architect | inline | reasoning |
| security-reviewer | Security Reviewer | inline | capable |
| consistency-analyzer | Consistency Analyzer | inline | capable |

---

## Review History

- **Revision 4** (2026-04-27): BLOCK — 2 blockers (invalid status, phase filter contradiction), 4 warnings
- **Revision 5** (2026-04-27): PASS_WITH_NOTES — blockers and warnings resolved; 1 warning (review-blocked in phase filter), 2 suggestions
- **Revision 6** (2026-04-27): PASS — all findings resolved
- **Revision 6** (2026-04-27, re-review): PASS_WITH_NOTES — hash drift detected (status-field update artifact); re-review surfaces new warnings on B1 route omission, phase filter SKILL.md drift, prompt injection surface, model tier declaration gap

---

## Structural Architect

**Verdict:** PASS_WITH_NOTES

**SA-1 (warning — downgraded from blocker):** The existing SKILL.md does not implement `--full` / Full Pipeline (specify → review → plan → route → implement → validate). Reviewer flagged as blocker; downgraded by consolidator because the SKILL.md is the *implementation target*, not the source of truth. The spec describes intended behavior; this gap is the reason a plan is needed. The plan must include Full Pipeline as first-class tasks. **Implementer note:** ensure plan tasks explicitly cover: `--full` flag, specify step dispatch, blocker-fix loop, `build.max_review_retries` config resolution.

**SA-2 (suggestion — downgraded from blocker):** Spec Behavior 5a defines `specify` as a valid `--from <step>` value; the existing SKILL.md omits it (Full Pipeline only step). Downgraded: the spec is internally consistent and the SKILL.md is the old implementation. Once Full Pipeline is implemented, `specify` will be a valid resume point. The plan should ensure `--from specify` is wired in the Full Pipeline path.

**SA-3 (warning):** Behavior B1 text reads "plan → implement → validate" — omits `route`. The canonical Implement Pipeline steps table (Step 2: Route) and acceptance criteria both correctly include route. B1 wording is misleading for implementers.

**SA-4 (warning):** Actionable Task Map contains only 3 tasks (Create SKILL.md, Define build state format, Create build-state directory). These are stale relative to the current spec scope (Full Pipeline, blocker-fix loop, zombie build detection, phase filter refinement, retry policy). The plan should not rely on this task map as a starting point.

**SA-5 (warning):** Phase Mode filter drift: the existing SKILL.md filters to `review-pending or later` for `--phase` (no `--full`), but the spec's Behavior 3 explicitly filters to `review-passed`, `implemented`, or `validated` — excluding `review-pending`. The plan must explicitly task correcting this filter to match the spec.

**SA-6 (suggestion):** Postconditions do not specify whether `/adev:build` updates the spec's `status` frontmatter (e.g., to `implemented` or `validated`) after a successful pipeline run, or whether child skills own that update.

**SA-7 (suggestion):** Workspace Build Mode section references `workspace-aware-vision spec` by name without a file path. If this spec has been renamed or superseded, the cross-reference is broken.

---

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

**SEC-1 (warning):** Prompt injection surface in blocker-context and RETRY_CONTEXT. B17 passes raw `.review.md` reviewer text as `--blocker-context <findings>` into a specify subagent prompt. The retry loop passes validation failure strings as RETRY_CONTEXT into the implement subagent prompt. Neither the spec nor SKILL.md requires sanitization or structural quoting before interpolation into the Agent() prompt. A maliciously crafted `.review.md` or validation report could embed directives that alter subagent behavior. The spec should require that extracted findings be enclosed in a fenced block (triple-backtick delimiters) to prevent interpretation as prompt directives.

**SEC-2 (suggestion):** Build state slug derivation is unspecified and lacks path traversal guards. A spec path containing `../../` could produce a slug like `../../evil` and result in writes outside `.context-index/build-state/`. The spec should require `path.basename()` derivation plus assertion that the final path remains within `.context-index/build-state/`.

**SEC-3 (suggestion):** The `error` field in build state step records is unbounded. If reused in subagent prompts on resume, it becomes a secondary injection surface. Recommend capping at 512 bytes and documenting it as display-only.

**SEC-4 (suggestion):** `parseUserConfig()` returns strings. The spec states clamping for `build.max_retries` (0–3) but does not require explicit non-integer handling. `parseInt(NaN)` passes the `< 0` and `> 3` checks silently. The skill should require explicit `Number.isInteger()` validation before clamping.

**SEC-5 (suggestion):** Build state files embed spec paths, milestone names, error details, and retry history. No access permission note or cleanup policy is stated beyond "not committed to git." On shared machines, the `.context-index/build-state/` directory should be created with restricted permissions.

---

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

**CON-1 (warning):** B1 omits `route` from Implement Pipeline step list (duplicate of SA-3).

**CON-2 (warning):** The spec does not declare a model tier or cost-routing role for the build orchestrator. The `subagent-cost-routing` cross-cutting spec defines `build-orchestrator` as a named role with a `reasoning` default tier. The spec should reference this role so manifest-based tier overrides apply correctly (e.g., "This skill runs at the `build-orchestrator` role tier; see subagent-cost-routing spec for tier resolution.").

**CON-3 (suggestion):** AC for `--phase <name> --full` states "includes `review-pending` specs" but omits `review-blocked`. Behavior B3a explicitly includes both. The AC should enumerate both statuses.

**CON-4 (suggestion):** Build state JSON example array does not include a `validate` step entry. Valid step names line correctly lists it. Adding an example entry would make the format self-documenting.

---

## Summary

**Total findings:** 5 warnings, 9 suggestions (0 blockers)

**Warnings to address before or during implementation:**
- SA-3 / CON-1: Fix B1 wording to include route
- SA-5: Ensure plan task corrects phase filter from `review-pending or later` → `review-passed/implemented/validated`
- SA-1: Plan must include Full Pipeline tasks explicitly
- SEC-1: Add blocker-context / RETRY_CONTEXT fencing requirement to spec or SKILL.md
- CON-2: Declare `build-orchestrator` role tier reference in spec

**Action required:** None blocking. Spec is ready for planning.

Run `/adev:plan --spec .context-index/specs/features/strategic-planning/adev-build-skill.md` to proceed.

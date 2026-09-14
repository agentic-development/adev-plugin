---
spec: .context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md
revision-validated: 10
manifest-sha: 9582bcd
---

# Validation Report: Progressive disclosure for SKILL.md bodies

> **Date:** 2026-09-13
> **Spec:** .context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md
> **Plan:** none — retroactive spec (see spec's own frontmatter comment: implementation shipped via chore/skills/progressive-disclosure before this spec existed)
> **Overall Status:** PASS_WITH_NOTES

---

## Retroactive-Spec Note

This spec documents already-shipped work. There is no `.plan.md` and there was no `/adev:implement` run against it. To satisfy the `implement`-step lifecycle gate that `/adev:validate` requires, the `implement` step was retroactively stamped (`--verdict PASS_WITH_NOTES`) immediately prior to this run, backed by a freshly computed `source-manifest` (414 files, sha `9582bcd`) derived from the spec's own `diff-source` range (`90fcc8bf..61064c9a`), filtered to files still present on disk (414 of 417 — 3 were superseded by later reconciliation commits, consistent with the spec's own note). `adev source-manifest verify` confirms the stamped manifest matches the current tree.

## Check 1: Quality Gates — PASS_WITH_NOTES
- Fast tier — `test` / `quality-gate` (both `npm test`): **PASS** — 7767/7769 tests pass, 0 fail, 2 todo (31.9s)
- Integration tier — `integration-test` (`npm run test:evals`), severity `warning`: **WARN** — 380/394 pass, 14 fail. All 14 are either (a) Postgres-fixture infra tests requiring a live database on port 5433, unavailable in this environment and unrelated to this spec, or (b) two `token-budget-eval` assertions carrying a stale regex that predates the `<ADEV_ROOT>`-anchoring convention this very spec establishes — the actual shipped content (`## Milestone Planning Mode` in `plan/SKILL.md`, `## Resume Mode` in `build/SKILL.md`) is correctly anchored; the test's expected pattern is what's out of date. Non-blocking per declared `warning` severity.
- E2E tier: no gates configured — skipped.

## Check 1.5: Source Manifest Verification — PASS
- `adev source-manifest verify` → PASS, sha `9582bcd` matches.
- All 414 manifest files confirmed committed to git (`git log -1 -- <file>` non-empty for every entry).

## Check 1.6: Code-Side Drift Warning — PASS
- `drift_detected` not set; `adev verify spec --check-drift` → `{"drifted":false}`.

## Check 2: Spec Compliance — PASS_WITH_NOTES
Sampled representatively across BEH-1–BEH-10 and the Acceptance Criteria (full subagent report on file in this run's transcript).

- AC1 (all 31 bodies ≤ ~5,000-token guidance): **PASS** — `wc -c` on all 31 `skills/*/SKILL.md`, max is `eval` at 19,508 B; `tests/skills/skill-size-cap.test.mjs` passes.
- AC2 (all 31 under 65,536 B hard cap, `eval` headroom 46,028 B): **PASS** — 65,536 − 19,508 = 46,028, exact match to the spec's own claimed figure.
- BEH-3 (heading + summary + `<ADEV_ROOT>`-anchored pointer per relocated section): **PARTIAL** — `skills/build/SKILL.md:141` (and its `providers/codex` / `providers/opencode` mirrors) carries a bare, unanchored pointer to `skills/build/step4-tier-propagation.md`, the exact confused-deputy pattern Invariant 3 forbids. This landed via a separate commit (`36a73803`) 11 minutes after this spec's own migration commit (`61064c9a`) — it belongs to a different, explicitly-disclosed concurrent fix on the branch (issue `adev-plugin-reviewer-tier-not-applied-wohx`), named in the spec's own "Scope of this spec vs the branch" text as deliberately not covered here. Not counted against this spec's own compliance; flagged as a real gap worth a follow-up ticket, since it is invisible to both `whole-invocation-rules-in-body.test.mjs` and `provider-companion-parity.test.mjs` (both guards' regexes only match `references/`/`scripts/` subpaths, not a bare skill-root companion).
- BEH-6, BEH-7, BEH-8, BEH-9/9a/9b/9c: **PASS** — verified via `tests/skills-extension-coverage.test.mjs`, `tests/skills/whole-invocation-rules-in-body.test.mjs`, `tests/sync/provider-companion-parity.test.mjs` (DAG/depth + both-direction mirror equality), and a direct read of `skills/work/SKILL.md:99-149` (no-re-entry, 3-attempt cap, unattended-stop-on-failure all present verbatim).
- Both size limits documented in `.context-index/constitution.md:70-71` and `docs/skill-reference.md:899-968`: **PASS**.
- Test integrity: **PASS** — two of the guard test files read in full; strict `deepEqual`/`equal` assertions, cap value recovered behaviorally (not duplicated), vacuous-sweep sanity floors (`checked > 100`) present. No gaming anti-patterns found.
- 8 spec-relevant test files run directly: 103/103 pass.

**Scope Expansion Sub-Finding (`source-manifest.files` present, 414 entries; SEC-3 fallback used — no plan, no prior validated commit):** `git diff $(git merge-base HEAD main)..HEAD` shows 874 changed files against 414 declared, across 23 commits. Breakdown: (a) legitimately this spec's own work but under-declared in `source-manifest.files` — `scripts/sync-provider-skills.mjs`, `tests/provider/cursor-path-containment.test.mjs`, `skills/bugfix-loop/**` + mirrors, `tests/evals/skill-disclosure/**`, and the full ~222-file-per-provider companion count (vs. 41 listed per provider); (b) explicitly spec-disclaimed and correctly excluded — the reviewer-model-tier fix (`lib/model-tiers.mjs`, `tests/governance/reviewer-model-tier.test.mjs`); (c) genuinely unrelated content carried onto this branch by a separate commit (`557d22bb`, eval-rubric/scoring-engine feature) — not this spec's scope expanding. Severity: warning. Recommended action: widen `source-manifest.files` to cover (a) in a future revision or amendment.

## Check 4: Constitution Compliance — PASS
- **Architecture Boundaries:** PASS — `package.json`, `.claude-plugin/plugin.json`, `hooks/hooks.json`, `cli/index.mjs` byte-identical between merge-base with `main` (`182a658a`) and HEAD (empty diff). No dependency, hook-protocol, CLI-install-path, or plugin-registration-format change — all four are Requires-Human-Approval boundaries, none touched. `providers/cursor/adapter.mjs`'s path-containment fix is a defensive fix inside an existing provider (Autonomous territory).
- **Non-Negotiable Principles:** PASS — zero `package.json` dependency changes across the branch's 5 landed progressive-disclosure commits; `grep -rn "node --input-type=module -e\|node -e \|Run inline Node" skills/*/SKILL.md skills/*/references/**/*.md` returns no matches; touched `.mjs` files (`scripts/sync-provider-skills.mjs`, `providers/cursor/adapter.mjs`, relocated `skills/write-test/scripts/*.mjs`) are pure ESM, no `require`/`module.exports`.
- **Coding Standards:** PASS — kebab-case file/dir naming intact; the only `~/.claude/` string hits (`skills/init/references/behavior-by-project-state.md:266,308,627`) are pre-existing prose describing `init`'s own job of discovering a user's global config, moved verbatim out of the body (confirmed via `git show efbc71e9`), not the hardcoded-install-path anti-pattern. One disclosed, out-of-scope observation carried over from Check 2's BEH-3 finding (`skills/build/SKILL.md:141`) — not attributed to this spec.

## Check 8: Boundary Compliance — PASS
- `no boundary violations in 47 changed file(s) against 3 rule(s)`.
- Disabled: `no-manual-version-bump` — "the boundary evaluator matches file content, not diffs; a version field is not a version bump, so this rule would fire on package.json forever. Needs a diff-aware evaluator."

## Check 9: Transition Gates — PASS
- Transition: `implement-to-validate`.
- `test`: pass — reason `recorded-pass`, `command_attested: true`.

## Check 11: Visual Verification — N/A
- SKIP — no UI files (`*.tsx`/`*.jsx`/`*.vue`/`*.svelte`/`*.css`/`*.scss`/`*.html`/`components/`/`pages/`/`views/`/`public/`) in the manifest's 414-file scope. This is a markdown/skill/test/plugin repo; visual verification is not applicable.

---

**Summary:** 6 passed, 0 failed, 1 skipped (N/A) checks; 2 of the passes carry notes (Check 1, Check 2). One real, out-of-spec-scope drift item was surfaced (`skills/build/SKILL.md:141` unanchored pointer, from a different concurrent commit) and one scope-manifest under-declaration was identified — both are follow-up items, neither blocks this spec's own validation.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.

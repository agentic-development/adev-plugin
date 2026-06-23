# Validation Report: Cross-Cutting Live Spec: First-Class Spec Amendments

> **Date:** 2026-06-19
> **Spec:** .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
> **Plan:** .context-index/specs/cross-cutting/spec-amendment-artifacts.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- Tests: PASS — `npm test`: 4201 tests, 4199 pass, 0 fail, 2 todo, 0 skipped (duration ~111.6s)
- Lint: N/A (no lint gate configured in governance/gates.yaml)
- Typecheck: N/A (no typecheck gate configured)

Tier summary:
- Check 1a (fast): npm test — PASS

Amend-specific suites (subset re-run, 45 tests, all PASS): `tests/specify-amend.test.mjs`, `tests/amendment-graph.test.mjs`, `tests/lifecycle/spec-amended-event.test.mjs`, `tests/cli/specify-amend.test.mjs`, `tests/specify-amend.integration.test.mjs`, `tests/specify-amend-skill.test.mjs`.

## Check 1.5: Source Manifest Verification — PASS
- `adev source-manifest verify`: PASS — source manifest matches (sha: bbf814a).
- Git-tracked existence check: all 19 manifest files are committed to git (none untracked/staged-only).

## Check 1.6: Code-Side Drift Warning — PASS
- `adev verify spec --check-drift`: `{ drifted: false }` — no drift detected.

## Check 2: Spec Compliance — PASS
All nine acceptance criteria verified against actual source reads:

- AC1 (scaffold co-located `<base-stem>-rev-<N>-<descriptor>.spec.md` with `amends:`+`target-revision:`+inherited/overridable `kind:`): PASS — `lib/specify-amend.mjs:105-247` (`amendSpec`); co-located naming at `:168-172`, frontmatter render at `:192-225`, kind inheritance/override at `:143-151`.
- AC2 (keeps `.spec.md`; `slugFromSpec` unchanged; own lifecycle log): PASS — `SPEC_SUFFIX = '.spec.md'` (`lib/specify-amend.mjs:44`); amendment file keeps the extension (`:172`); no change to `slugFromSpec`.
- AC3 (`spec_amended` appended to BASE log; base file unmodified): PASS — `reportSpecAmended` emitted on base path at `lib/specify-amend.mjs:234-238`; emitter at `lib/lifecycle-state.mjs:1120-1135`; base text only read, never written.
- AC4 (`--kind amendment` rejected with `INVALID_KIND`): PASS — `lib/cli/specify.mjs:170-171`; reinforced by closed-enum comment in `lib/kinds.mjs:24-29`.
- AC5 (status/hygiene report relationships + effective revision = `max(base, validated amendment target-revisions)`): PASS — `computeEffectiveRevision` (`lib/amendment-graph.mjs:260-291`) restricts max to `STATUS_VALIDATED` amendments (SA-2); status surface wired at `skills/status/SKILL.md:458-462`.
- AC6 (`DANGLING_AMENDMENT`, `INCOMPLETE_AMENDMENT_LINK`, `AMENDMENT_CYCLE` findings): PASS — `auditAmendments` (`lib/amendment-graph.mjs:371-420`) emits all three; hygiene pass documented at `skills/hygiene/SKILL.md:996-1028`.
- AC7 (`--amend` mutually exclusive with `--revise`/`--extract`/`--refactor`/`--from-diff`/`--cross-cutting` → `CONFLICTING_FLAGS`): PASS — `AMEND_CONFLICTING_FLAGS` enforced at `lib/cli/specify.mjs:35,138-139`.
- AC8 (ADR-0009 amended for relationship-overlay decision + `--kind amendment` rejection): PASS — `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` §8 (lines 107-121) records all four points.
- AC9 / "all amend logic in lib + verb; SKILL.md no inline Node": PASS — control flow lives in `lib/specify-amend.mjs` + `lib/amendment-graph.mjs`; `skills/specify/SKILL.md`, `skills/status/SKILL.md`, `skills/hygiene/SKILL.md` contain no `node -e` / inline-Node directives (guard grep clean).

Behavior coverage (1-10) confirmed: descriptor sanitization SEC-1 (`DESCRIPTOR_RE`, `lib/specify-amend.mjs:49,128-133`), target-revision strictly-greater rule (`:153-166`), schema strictness SA-1 (`lib/diagnostics/event-schemas.mjs:166-171`, `lib/lifecycle-state.mjs:1120-1135`), cycle-safe chain traversal (`lib/amendment-graph.mjs:166-202`).

Test integrity: amend suites assert exact values and error codes (e.g. `INVALID_TARGET_REVISION`, `INVALID_AMENDMENT_DESCRIPTOR`, `AMENDMENT_CYCLE`); no loose matchers, conditional skips, or never-fail assertions observed. 0 skipped tests in the full run.

## Check 4: Constitution Compliance — PASS
- Architecture boundaries: PASS — the two boundary-touching changes (adding `spec_amended` to `CANONICAL_EVENTS`; amending ADR-0009) are explicitly `[BOUNDARY: human-approved]` per the plan and review PASS_WITH_NOTES; both are sanctioned taxonomy changes, not silent violations.
- Non-negotiable principles: PASS — Principle 1 (minimize deps): `lib/specify-amend.mjs` and `lib/amendment-graph.mjs` import only `node:fs`/`node:path` + existing helpers; no new dependency. Principle 2 (skills are markdown): amend logic in CLI/lib, SKILL.md names `adev specify amend`. Principle 3 (pure ESM): no CommonJS in new files. Principle 5 (version parity): `package.json` and `.claude-plugin/plugin.json` both at 0.27.7.
- Coding standards: PASS — camelCase functions, kebab-case files, Node built-ins first in import order, dedicated error codes; cli-driver-surface anti-pattern (no inline Node) respected.

## Check 8: Boundary Compliance — PASS
- `governance/boundaries.yaml` exists but the `boundaries:` list is empty (only commented examples). No active rules to evaluate.

## Check 9: Transition Gates — N/A
- `governance/gates.yaml` `transitions:` is `{}` — no `implement-to-validate` / `implement-to-merge` transition configured. SKIP.

## Check 11: Visual Verification — N/A
- No UI files in the implementation diff (manifest contains only `.mjs`, `.md`, `.yaml` files). SKIP — visual verification not applicable.

---

**Summary:** 6 passed (Checks 1, 1.5, 1.6, 2, 4, 8), 2 skipped/N-A (Checks 9, 11). 0 failed. Full suite: 4201 tests, 4199 pass, 0 fail, 2 todo. All nine acceptance criteria satisfied; constitution respected; the two boundary-touching changes are human-approved.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs` (ADR/cross-cutting/specialist/charter), `/adev:hygiene` Audit Pass 20 (platform drift), `/adev:reconcile` (lifecycle reconciliation), and `hooks/post-validate-extract-heuristics.{sh,mjs}` (heuristic extraction).

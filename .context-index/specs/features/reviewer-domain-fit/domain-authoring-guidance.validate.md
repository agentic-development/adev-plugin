---
spec: .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
plan: .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.plan.md
date: 2026-08-18
overall_status: PASS_WITH_NOTES
tier: full
---

# Validation Report: Domain Authoring Guidance

> **Date:** 2026-08-18
> **Spec:** .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
> **Plan:** .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.plan.md
> **Overall Status:** PASS (with advisory notes)

---

## Check 1: Quality Gates — PASS (with notes)

Gate source: `.context-index/governance/gates.yaml`, merged with the domain-resolved set (`adev domain load-gates --module reviewer-domain-fit`), resolved domain `software` (default).

- **Check 1a (fast tier):** `test` and `quality-gate` (both `npm test`) — **PASS**
  - tests: 6929, suites: 983, pass: 6927, fail: 0, todo: 2, duration: 67.0s
- **Check 1b (integration tier):** `integration-test` (`npm run test:evals`) — **WARN** (severity: warning, non-blocking)
  - tests: 391, suites: 115, pass: 379, fail: 12, duration: 23.5s
  - Failures are concentrated in `tests/evals/integration-sandbox/reality-check.test.mjs` (reality-check/confidence-scoring integration sandbox) — pre-existing, unrelated to this spec's declared scope (domain-config authoring guidance / specify skill wiring / template headers). Not touched by any of the 13 files in this spec's source-manifest.
- **Check 1c (e2e tier):** no gates configured — SKIP

Gate outcomes attestation (emitted with Check 1's `validator_report`): `test: pass`, `quality-gate: pass`, `integration-test: fail` (tier `integration`, severity `warning` — does not block).

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify --spec <spec>` → `Check 1.5: PASS — source manifest matches (sha: 45e2c66)`
- Implementation-existence check: all 13 files in the manifest verified committed via `git log --oneline -1 -- <file>` — every file has a commit (de345123, 53aec50d, eb30e1b6, 5e053b5e, 618df6ba, c608f391, eea5fb86). None untracked/staged-only.

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`

## Check 2: Spec Compliance — PASS

Dispatched to a subagent-review (profile `reviewer-capable`). Full findings:

- All 14 Acceptance Criteria items verified PASS against actual source reads (not plan checkboxes), e.g.:
  - No `column not found → 404` / `drags a card` in `skills/specify/SKILL.md` or either provider mirror (grep, zero matches); 3 legitimate pre-existing "drag" occurrences confirmed untouched.
  - `templates/spec-template.behavioral.md:79` and `templates/spec-template.refactor.md:145` both read `| Condition | Expected Behavior | Error Code |`; `grep -rn "HTTP Status"` returns no matches.
  - `lib/domains/constants.mjs:20,33` — `specify-guidance` present in `DOMAIN_CONFIG_TYPES`/`DOMAIN_CONFIG_FILENAMES`, absent from `STRUCTURED_CONFIG_TYPES` (lines 37-44).
  - `lib/cli/domain.mjs:233-236,379-399` — `load-guidance` subcommand wired into dispatch, calls `resolveActiveDomain` then `loadDomainConfig(..., 'specify-guidance', ...)`, prints `{domain, guidance, warnings}`.
  - `templates/domains/software/specify-guidance.md` — CLI/library-shaped content, no HTTP codes, no UI language.
  - `skills/specify/SKILL.md:361` — empty-state message text matches spec verbatim.
  - `tests/lib/domains/constants.test.mjs:17-37` — 9-entry set assertions present.
- All 6 Behaviors (BEH-1..BEH-6) verified PASS with file:line citations (see subagent report for full detail); BEH-3/BEH-4 precedence and BEH-6 mirror-parity independently confirmed via `diff` and `tests/sync/provider-skill-parity.test.mjs`.
- All 5 Error Cases rows verified PASS (`--module` omitted, `INVALID_DOMAIN_ARG`, `BUNDLED_OVERRIDE_BLOCKED`, `DOMAIN_CONFIG_TOO_LARGE`, `guidance: null`/exit 0).
- Test integrity: no loose-matcher, conditional-skip, or tautological-assertion anti-patterns found.

### Scope Expansion Sub-Finding — PASS (in scope)

`git diff --stat` across the implementing commits touches exactly the 13 files declared in `source-manifest.files` — no files outside declared scope.

## Check 4: Constitution Compliance — PASS

Dispatched to a subagent-review (profile `reviewer-capable`), evidence-citation contract enforced (`UNCITED_FINDING` rule).

- **Architecture Boundaries:** PASS — no new skill added to lifecycle order, no hook-protocol change (`git diff -- hooks/ .githooks/` empty), no CLI installation path change (`cli/index.mjs` untouched), no plugin-registration change (`.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json` untouched), no new external dependency (`package.json` diff empty; `lib/cli/domain.mjs` uses only pre-existing imports).
- **Non-Negotiable Principles:** PASS on all 5 — minimize dependencies (no new imports), skills primarily markdown (new Step 4 text is a ` ```bash ` CLI-verb fence, not inline Node), pure ESM (no `require`/`module.exports` in the diff), hook protocol untouched, version parity untouched (`package.json` / `.claude-plugin/plugin.json` both still `0.27.8`, no bump).
- **Coding Standards:** PASS — camelCase (`runLoadGuidance`), kebab-case new files, Node-builtins-first import ordering preserved, no CommonJS, no hardcoded `~/.claude/` paths, no inline-Node directives or `node -e` patterns in `skills/specify/SKILL.md` (grep confirms; `hooks/pre-commit-no-inline-node.sh`'s trigger patterns would not fire), old hardcoded HTTP/drag-and-drop text fully removed from skill + both mirrors.

## Check 8: Boundary Compliance — PASS

- `adev boundaries check --json` → `verdict: PASS`, reason: "no boundary violations in 2 changed file(s) against 3 rule(s)".
- 1 rule disabled: `no-manual-version-bump` — disabled_reason: "the boundary evaluator matches file content, not diffs; a version field is not a version bump, so this rule would fire on package.json forever. Needs a diff-aware evaluator."
- No registry warnings.

## Check 9: Transition Gates — PASS

- `adev gate transitions --transition implement-to-validate --json` → `verdict: PASS`, reason: "every required gate has a fresh, attested, passing outcome".
- Gate `test`: `pass`, reason `recorded-pass`, `command_attested: true`.

## Check 11: Visual Verification — N/A (SKIP)

- Trigger guard: none of the 13 implementation files match UI patterns (`*.tsx/.jsx/.vue/.svelte/.css/.scss/.html`, `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`) — all are `.mjs` or `.md`.
- Recorded: "No UI files in implementation diff — visual verification not applicable."

## Check 14: Gate Executability and Test Collection — PASS (with notes)

- `adev gate doctor --json` → 4 warning-severity findings, 0 errors:
  - `gate-doctor/runner-unknown` × 3 (gates `test`, `quality-gate`, `integration-test` — `npm test`/`npm run test:evals` runner not identified for collection verification).
  - `gate-doctor/ci-gate-not-invoked` × 1 (gate `integration-test` does not appear in `.github/workflows/{ci,propagate-to-next,release}.yml`).
- Registry severity for this check is `warning` — does not fail validation on its own. Findings describe pre-existing, project-wide gate-tooling conditions unrelated to this spec's changes.

---

## Overall Summary

8 dispatched checks (1, 1.5, 1.6, 2, 4, 8, 9, 11-N/A, 14) evaluated. 6 clean PASS, 2 PASS-with-advisory-notes (Check 1's integration-tier WARN and Check 14's warning-only findings), 0 FAIL. The implementation satisfies all 14 acceptance criteria, all 6 behaviors, and all 5 error-case rows in the spec; stays within declared scope; respects the constitution; and passes all required (error-severity) quality gates.

**Aggregate verdict: PASS_WITH_NOTES** (no FAILs; Check 1 integration tier and Check 14 gate-doctor findings are advisory only, at warning severity, and pre-existing / unrelated to this spec's changes).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, 8, 9, 11, 14) are intentional to preserve report readability.

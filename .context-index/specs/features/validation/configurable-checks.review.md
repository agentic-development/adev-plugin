# Architecture Review: configurable-checks

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/features/validation/configurable-checks.md
> **Charter:** .context-index/specs/features/validation/charter.md
> **Verdict:** BLOCK

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning):** `deterministic-check` kind has a hidden coupling between canonical IDs and implementation functions with no schema field. Add an explicit binding field or document the implicit registry.
- **SA-2 (warning, Behaviors 7, 22):** Spec depends on reviewer-spec URI rules but `configurable-reviewers.md` is not in `depends-on` frontmatter. Add it, or extract shared URI rules into a cross-cutting reference.
- **SA-3 (warning, Behavior 23):** Shared context-pack namespace across review.yaml and validate.yaml has unclear ownership and load-order. Specify deterministically or cross-reference the spec that does.
- **SA-4 (low, Behavior 18 vs 19):** Two fail-fast models coexist (SKILL-enforced for Check 1, `after`-graph for Checks 2-12). Rationale exists but isn't cross-referenced at the boundary.
- **SA-5 (low, Behavior 9):** Observational checks "run" but error handling is unspecified (throws, timeouts, degradation to WARN?). Clarify.
- **SA-6 (low, Behavior 26):** Report shows "prompt source" for subagent-review but no equivalent for deterministic-check (which library function ran). Extend for auditability.
- **SA-7 (low, Behavior 15):** Check 11's `browser-review` profile fails load if Playwright MCP is missing, even for non-UI specs. Clarify conditional load vs deferred dispatch check.
- **SA-8 (low, Behavior 16):** Topological sort tie-breaking for independent checks unspecified; affects report determinism. Add a deterministic tie-breaker.
- **SA-9 (informational):** Validation charter describes "11 ordered checks" in prose; stale relative to rev-2 spec. Flag charter update in Task Map.
- **SA-10 (informational):** No constitutional conflicts. Principles #1, #2, #3 all honored.

## Security Reviewer

**Verdict:** BLOCK

- **SEC-1 (blocker, input-validation):** `kind: quality-gate` runs `command` "in a shell" with no argv-form mandate, no restrictions on shell metacharacters, no prohibition on interpolating spec metadata. A malicious `governance/validate.yaml` runs arbitrary code as the developer. Require argv-form (`execFile`), prohibit interpolation of spec-derived values into `command`, or require signed governance.
- **SEC-2 (blocker, secrets):** Quality-gate stdout/stderr captured in the report is not required to pass through `redactionSet`. The cross-cutting redaction contract (Behavior 36) applies to subagent tool output, not top-level check command output. State explicitly that `quality-gate` captured output MUST be redacted before report/log emission. Add an AC proving it.
- **SEC-3 (blocker, authorization):** Default `profile: read-only` for quality-gate is misleading — profile permissions describe subagent tools, not subprocess sandboxing. Users will assume `read-only` sandboxes shell commands; it does not. Require opt-in: quality-gate without explicit profile should fail load, forcing explicit acknowledgement of the privilege surface.
- **SEC-4 (warning, prompt-injection):** Subagent-review prompts are project-controlled with no provenance fingerprint; context-pack collisions "WARN second-wins" silently enables pack override. Hash the resolved prompt into the report; escalate context-pack collision in `severity: error` checks from WARN to load failure.
- **SEC-5 (warning, secrets):** Consumer-repo-local env resolution (Behavior 24) means a spec from an untrusted sibling repo in an `adev-workspace.yaml` context can cause `@workspace/.env` values to flow into that repo's checks. Require explicit workspace-level trust declaration for `@workspace/` resolution.
- **SEC-6 (warning, authorization/fail-open):** Error Cases "All checks disabled → exit 0 if gates pass" lets a project ship a `governance/validate.yaml` disabling every security-relevant check and still pass. Emit WARN-level notice when any bundled default is disabled; force verdict to `PASS_WITH_NOTES` minimum. Consider requiring ADR reference for disabling `severity: error` bundled checks.
- **SEC-7 (warning, input-validation):** Behavior 3 says `severity` defaults "below" but per-kind defaults are never enumerated. Ambiguity compounds SEC-6. Specify: subagent-review default `error`; quality-gate default `error`; observational default `info`; fail load if observational has `severity: error`.
- **SEC-8 (suggestion, rate-limiting):** No bound on registered check count or aggregate dispatch timeout. Introduce a soft cap (~20) with WARN; hard cap (~100) with load failure; aggregate timeout field.
- **SEC-9 (suggestion, data-exposure):** `prompt source` in report may leak absolute paths / internal plugin layout. Normalize to repo-relative or `plugin:` form.
- **SEC-10 (suggestion, supply-chain):** Bundled `plugin:validate/defaults.yaml` is the source of truth; a plugin upgrade can silently change check behavior. Include defaults hash/version in the report header; emit diff on upgrade.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning, contract):** `verifyManifest` in `lib/source-manifest.mjs` breaks from sibling `lib/governance/*` convention. Either relocate or explain in Key Files.
- **CON-2 (warning, pattern):** Acceptance says "identical" where reviewer spec says "byte-identical." Tighten to match the sibling-capability contract or document deviation.
- **CON-3 (warning, domain-model):** Verdict vocabulary mixes `FAIL/WARN/PASS/SKIP` (gates) with `PASS/PASS_WITH_NOTES/BLOCK` (reviews) without explicit mapping. Add a "Verdict Vocabulary" subsection.
- **CON-4 (low, terminology):** New status `SKIPPED-DISABLED` diverges from `unified-gate-system.md`'s lowercase `skip`. Align or document asymmetry.
- **CON-5 (warning, contract):** `validate.check-7-specialist-review` at validate-time duplicates specialists now migrated to `governance/review.yaml:reviewers` (per reviewer spec Behavior 39). Clarify or remove.
- **CON-6 (low, naming):** `validate.check-1.5-source-manifest` uses `1.5` — a dot in a kebab-case slug breaks the CLAUDE.md naming convention. Rename to `check-1b` or drop numeric encoding entirely.
- **CON-7 (low, pattern):** Uses "second-wins WARN"; sibling uses "later wins." Align phrasing.
- **CON-8 (low, external-ref):** Missing `depends-on` entry for `configurable-reviewers.md` despite Behaviors 22-23 citing its resolution rules.
- **CON-9 (low, terminology):** "registry" (title) vs "config" (function name `loadValidateConfig`) used interchangeably. Add a `ValidateConfig` or `ValidateRegistry` entity in the charter and align.

---

## Summary

**Total findings:** 28 (3 blockers, 13 warnings, 12 suggestions)
**Action required:** Resolve SEC-1 (shell-injection posture for quality-gate), SEC-2 (quality-gate output redaction requirement), SEC-3 (profile semantics for subprocesses). After blockers are fixed, address warnings — notably SA-2 (missing depends-on), SEC-4/5/6 (prompt provenance, workspace trust declaration, coverage floor), and CON-3 (verdict vocabulary alignment). Then re-run `/adev:review-specs --spec .context-index/specs/features/validation/configurable-checks.md`.

---

last-reviewed-revision: 2
file-sha: 1e3dde3dcb666c3fed27d00fa602ebfc65b35c69

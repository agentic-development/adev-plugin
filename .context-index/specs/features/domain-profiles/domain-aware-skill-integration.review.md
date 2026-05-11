# Architecture Review: domain-aware-skill-integration

> **Date:** 2026-05-10
> **Spec:** .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 5
> **file-sha:** PENDING

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | inline |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | inline |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | inline |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning): Task map covers 7 integration points but charter/spec template merge functions lack explicit module paths.** The Companion Code Requirement (lines 33-38) lists five merge modules in `lib/domains/` with explicit filenames: `merge-reviewers.mjs`, `merge-gates.mjs`, `merge-verification.mjs`, `merge-gate-config.mjs`, `merge-test-config.mjs`. The task map includes two additional entries for "charter template merge function" and "spec template merge function" (H2 section matching), but these have no assigned filename or module path. Assign explicit module paths (e.g., `lib/domains/merge-charter-overlay.mjs`, `lib/domains/merge-spec-overlay.mjs`) for consistency and to prevent ambiguity about where the H2 section matching logic lives. This resolves the prior rev-3 finding SA-1 (template merge semantics) which requested section-matching criteria -- the spec now defines H2 heading matching, but the module location is still unspecified.

- **SA-2 (warning): `review-config.mjs` refactoring has a coupling risk around `BUNDLED_REVIEWER_IDS` warning logic.** The task "Refactor `lib/governance/review-config.mjs`" (line 169) removes `BUNDLED_REVIEWER_IDS` and hardcoded defaults. Currently, `BUNDLED_REVIEWER_IDS` is used in `mergeReviewers()` (review-config.mjs line 313) to emit `BUNDLED_DEFAULT_OVERRIDE` warnings when governance overrides a bundled reviewer. After refactoring, this warning logic must migrate to `lib/domains/merge-reviewers.mjs`, which needs to distinguish domain-sourced from governance-sourced entries. The current `__source` tracking pattern (`"bundled"`, `"project-override"`, `"project"`) in review-config.mjs (lines 307-324) provides this capability, but the spec does not specify how the new `mergeReviewers()` tracks entry provenance for warning emission. Recommend specifying the source-tracking mechanism in Behavior 6 to prevent the refactored code from losing the `BUNDLED_DEFAULT_OVERRIDE` audit trail.

- **SA-3 (suggestion): `mergeGateConfig()` and `mergeTestConfig()` have no governance layer -- should be stated explicitly.** Behaviors 17-18 (gate-config) and 19-20 (test-config) load domain config via `loadOverlay()` but do not mention a governance merge step. The Behavioral Contract preamble (lines 20-28) describes a generic pipeline where step 3 reads governance files "if any" and step 4 merges. However, the postcondition (line 125) states "Config merge order is always: domain profile -> governance overlay (governance wins on conflict)." For gate-config and test-config, no governance file is defined. This is likely intentional (not all overlay types have governance counterparts), but it should be stated explicitly to prevent implementers from searching for non-existent `governance/gate-config.yaml` or `governance/test-config.yaml` files. Add a note clarifying which overlay types have governance counterparts (reviewers, gates) and which do not (charter-overlay, spec-overlay, verification, gate-config, test-config).

- **SA-4 (suggestion): Function naming inconsistency across merge modules.** Behavior 5 (line 64) says review-specs calls `loadReviewerConfig()` from `lib/domains/merge-reviewers.mjs`. Behavior 10 references `loadGateConfig()` from `merge-gates.mjs`. Behavior 17 references `loadGateHookConfig()` from `merge-gate-config.mjs`. The naming convention is inconsistent: some use `load*Config()` (which implies I/O + merge), while the companion code section names only the module files. Standardize function names across all five modules. Given the constitution's testability preference ("pure function -- deterministic output from inputs"), pure `merge*()` functions that accept pre-loaded inputs are preferable, with thin `load*Config()` wrappers if needed. This also resolves the prior rev-3 finding SA-3 requesting merge function signatures.

- **SA-5 (info): All 7 skill integration points are covered with behaviors, error handling, and task map entries.** The spec addresses brainstorm (charter overlay), specify (spec overlay), review-specs (reviewers), validate (gates), implement (verification), lifecycle gate hooks (gate-config), and write-test/implement (test-config). Coverage is complete. The rev-5 additions of gate-config and test-config are well-integrated.

- **SA-6 (info): Prior rev-3 finding SA-2 (single verification type per domain) is acknowledged as v1 limitation.** The spec retains a single `type` field per verification config. This is acceptable for v1 since each bundled domain maps cleanly to one verification approach (software=visual, data-engineering=output, process-automation=flow). Custom domains with mixed needs can use `extends` and override.

- **SA-7 (info): Prior rev-3 finding SA-4 (immutability enforcement) is resolved.** Behavior 21 (line 118) now specifies: "Immutability is enforced by convention and verified by tests (merge functions return new objects, not mutated inputs)." The acceptance criteria (line 197) include a corresponding test requirement.

- **SA-8 (info): Prior rev-3 finding SA-5 (OVERLAY_MERGE_WARN granularity) remains.** `OVERLAY_MERGE_WARN` is still used for multiple distinct conditions. The rev-5 spec adds more specific codes for some cases (`INVALID_GATE`, `UNKNOWN_PROFILE`, `UNKNOWN_VERIFY_TYPE`, `TOOL_UNAVAILABLE`, `INVALID_PATTERN`), which significantly reduces the ambiguity. The remaining `OVERLAY_MERGE_WARN` cases (malformed fields, empty overlays, unknown merge_strategy, missing reviewer id) are appropriately coarse-grained for merge-time warnings that do not require programmatic branching.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

- **SEC-1 (info): Gate command execution via `execFile` is correctly specified and consistent with existing security model.** Behavior 10 (line 86) specifies `execFile` (no shell interpolation) for gate commands. This aligns with `validate-config.mjs` (lines 227-232) which rejects shell-form strings and enforces argv-list format. No new attack surface.

- **SEC-2 (suggestion): Gate `command` format should explicitly require argv-list form.** The existing `validate-config.mjs` validates that gate commands are YAML lists (not shell strings) and rejects interpolation patterns. The integration spec (Behavior 10) says gate entries require `id` and `command` fields, and entries missing either are skipped with `INVALID_GATE`. However, the spec does not state whether `command` must be an argv list (as in validate-config) or could be a string. Since domain `gates.yaml` files are authored by profile creators (including user-authored custom profiles), the same argv-list-only enforcement should be explicitly required. Recommend adding: "Gate `command` values must be YAML lists (argv tokens); shell-form strings are rejected with `INVALID_GATE`." This resolves the prior rev-3 finding SEC-1 more concretely.

- **SEC-3 (info): Governance override trust boundary is well-defined.** The merge order (domain -> governance, governance wins) correctly positions governance as the project policy layer. The `merge_strategy: replace` mechanism (Behavior 7) drops base reviewers but governance still applies on top -- a domain profile cannot silence project-level policy. Warning emissions (Behaviors 7, 11) provide auditability. This resolves the prior rev-3 finding SEC-1 (gate override risk).

- **SEC-4 (warning): `trigger_patterns` symlink edge case.** Behavior 12 (line 92) correctly rejects `trigger_patterns` containing `..` and absolute paths with `INVALID_PATTERN`. This resolves the prior rev-3 finding SEC-2. However, if a project contains symlinks, a pattern like `*.html` could match a symlink pointing outside the project root during verification. The spec should clarify whether `trigger_patterns` are matched against logical paths (as stored in git) or resolved real paths. For consistency with the resolution spec's `realpathSync()` approach, matching against real paths would be more secure. This is a v1 edge case.

- **SEC-5 (info): Missing/corrupted domain profile safety net is adequate.** Behavior 1 (line 50) specifies that when `loadOverlay()` returns `null`, skills log a warning and operate with empty config. The cascade (missing profile -> null overlay -> empty config -> skill warns) produces visible failures rather than silent misbehavior. Correct fail-open-with-warning approach for a development tool.

- **SEC-6 (info): Prior rev-3 finding SEC-3 (duplicate reviewer ID semantics) is resolved.** Behavior 6 now explicitly states: "If a governance reviewer `id` matches a domain reviewer `id`, the governance entry overrides the domain entry (governance wins)." No ambiguity remains.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CA-1 (blocker): Charter entity model still missing GateHookConfig and TestConfig entities.** The charter's Entities table (lines 55-60) defines 6 entities; the integration spec adds `gate-config` and `test-config` overlay types with distinct merge behavior. The charter's Relationships section (line 64) lists 5 overlay components per DomainProfile; should be 7. The Quality Attributes file-read count (line 120) says "at most 5 file reads"; should be 7. The bundled profiles spec (Behavior 22) correctly requires 7 files per profile. **This was flagged as CA-3 in the sibling resolution spec review (rev 5) and remains unresolved in charter revision 3.**

- **CA-2 (blocker): Charter `software` domain invariant contradicts the spec.** The charter's Invariants (lines 72-73) state: "No `domains/software/` overlay directory is shipped or consulted -- the base templates ARE the software behavior. `loadOverlay()` will never be called with `domain: 'software'`." The integration spec (Behaviors 6, 16, 18, 20) references the `software` profile shipping with specific defaults (e.g., 44 file exclusions, 32 bash passthrough commands, `type: visual` verification). The bundled profiles spec (Behaviors 1-7) elaborates the full `software` profile content. **This was flagged as CA-2 in the sibling resolution spec review (rev 5) and remains unresolved in charter revision 3.**

- **CA-3 (warning): Merge order terminology inconsistency with sibling spec acceptance criteria.** The integration spec postcondition (line 125) correctly says: "Config merge order is always: domain profile -> governance overlay (governance wins on conflict)" (two layers). The resolution spec's acceptance criteria (line 223) says: "Config merge order is: domain profile -> project-local domain override -> governance overlay" (three layers). The integration spec is correct (project-local override is part of `loadOverlay()` resolution, not a separate merge step). Ensure the resolution spec's AC is fixed (flagged as SA-4 in the sibling review) to prevent implementation confusion.

- **CA-4 (warning): `loadGateConfig()` function name may collide with existing codebase.** The integration spec Behavior 10 names the gate merge function `loadGateConfig()`. The existing `lib/lifecycle-gate-config.mjs` exports `resolveGateConfig()`. The existing `lib/governance/validate-config.mjs` exports `loadValidateConfig()`. During the refactoring phase, both old and new code will coexist. Recommend a more specific name like `loadDomainGateConfig()` or `mergeDomainGates()` to avoid confusion.

- **CA-5 (warning): `DEFAULT_SEVERITY_BY_KIND` removal scope requires clarifying how severity defaults flow.** The task "Refactor `lib/governance/validate-config.mjs`" (line 170) targets `DEFAULT_SEVERITY_BY_KIND` (validate-config.mjs line 27). This constant is used as a fallback in `validateCheck()` (line 142): `const severity = raw.severity ?? DEFAULT_SEVERITY_BY_KIND[kind]`. If this moves to the domain profile, `validateCheck()` must receive the domain-sourced severity defaults as a parameter rather than using a module-level constant. The spec's Behavior 10 does not mention severity defaults -- only gate commands and ID-based merging. Clarify whether severity defaults are part of `gates.yaml` schema or a separate concern.

- **CA-6 (info): Error codes are consistent with sibling specs and do not collide.** The integration spec introduces `OVERLAY_MERGE_WARN`, `INVALID_GATE`, `UNKNOWN_PROFILE`, `UNKNOWN_VERIFY_TYPE`, `TOOL_UNAVAILABLE`, and `INVALID_PATTERN`. The resolution spec owns `INVALID_DOMAIN_NAME`, `PATH_ESCAPE`, `OVERLAY_PARSE_ERROR`, `OVERLAY_TOO_LARGE`, `BUNDLED_OVERRIDE_BLOCKED`, `EXTENDS_NOT_FOUND`, `EXTENDS_DEPTH_EXCEEDED`, `DOMAIN_NOT_FOUND`. The parse-time vs. merge-time boundary is clean.

- **CA-7 (info): Refactoring targets match existing codebase constants accurately.** The spec correctly identifies: `BUNDLED_REVIEWER_IDS` in `review-config.mjs` (line 22), `DEFAULT_SEVERITY_BY_KIND` in `validate-config.mjs` (line 27), `DEFAULT_FILE_EXCLUSIONS` and `DEFAULT_BASH_PASSTHROUGH` in `lifecycle-gate-config.mjs` (lines 16, 50), and `UNIT_PROFILE.permitted_tools` in `test-strategies/profiles.mjs` (line 31). All constants exist at the cited locations and the refactoring scope is accurate.

- **CA-8 (info): `extends` model transparency is consistent across specs.** The integration spec (Behavior 1, line 50) states skills receive fully resolved config without awareness of inheritance. This matches the resolution spec's design where `loadOverlay()` handles the extends chain internally. No leaky abstraction.

- **CA-9 (suggestion): Add a negative acceptance criterion for hardcoded constant remnants.** The spec has acceptance criteria for each refactored module (lines 181-184) as positive checks ("no longer has X"). Consider adding a grep/lint acceptance criterion verifying no hardcoded reviewer IDs, gate defaults, file exclusions, or test tool lists remain anywhere in `lib/` outside `lib/domains/`. This prevents accidental re-introduction during implementation.

---

## Summary

**Total findings:** 17 (2 blockers, 5 warnings, 4 suggestions, 6 informational)

**Prior rev-3 findings resolved:** SA-1 (template merge semantics -- now defines H2 matching), SA-4 (immutability enforcement -- now specifies convention + tests), SA-5 (OVERLAY_MERGE_WARN granularity -- mitigated by adding specific error codes), SEC-2 (trigger_patterns traversal -- now rejects `..` and absolute paths), SEC-3 (duplicate reviewer ID -- now explicitly defined).

**Action required:**

1. **CA-1 (blocker):** Update charter revision 3 to include GateHookConfig and TestConfig entities, update Relationships to list 7 overlay components per DomainProfile, and adjust Quality Attributes file-read count from 5 to 7. (Repeat finding from sibling review.)

2. **CA-2 (blocker):** Update charter's `software` domain invariant (lines 72-73) to reflect that `software` is a real bundled profile with its own directory containing 7 overlay files. (Repeat finding from sibling review.)

3. **SA-1 (warning):** Assign explicit module paths for charter and spec template merge functions (e.g., `lib/domains/merge-charter-overlay.mjs`).

4. **SA-2 (warning):** Specify how `mergeReviewers()` tracks entry provenance (domain vs. governance) for `BUNDLED_DEFAULT_OVERRIDE` warning emission.

5. **CA-4 (warning):** Rename `loadGateConfig()` to avoid collision with existing `resolveGateConfig()` naming.

6. **CA-5 (warning):** Clarify how `DEFAULT_SEVERITY_BY_KIND` flows from domain profile into check validation after refactoring.

7. **SEC-2 (suggestion):** Explicitly require argv-list format for gate `command` values in domain `gates.yaml`.

Both blockers are charter-level issues (not spec defects), already flagged in the sibling resolution spec review. Once the charter is updated to revision 4 reflecting the 7-overlay-type model and the `software`-as-real-profile design, the spec is ready for planning.

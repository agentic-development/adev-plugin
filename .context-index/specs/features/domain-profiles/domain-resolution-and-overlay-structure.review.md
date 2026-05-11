# Architecture Review: domain-resolution-and-overlay-structure

> **Date:** 2026-05-10
> **Spec:** .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 5
> **file-sha:** 7888517

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | inline |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | inline |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | inline |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning): `extends` one-level-deep enforcement mechanism vs. error code naming.** The spec enforces exactly one level of inheritance (custom -> bundled only). This is sound for v1. However, the error code `EXTENDS_DEPTH_EXCEEDED` implies depth counting, yet the spec's actual rule is: "a custom domain can extend a bundled domain; a bundled domain cannot extend another domain" (Behavior 7, Error Cases line 173). The enforcement is therefore a type check (is the parent bundled?), not a depth counter. Recommend clarifying in the behavioral contract that the check is "extends target must be a bundled domain name" rather than "depth must be <= 1" -- this prevents future confusion if custom-extends-custom is ever considered. The current wording is internally consistent but the error code name suggests a different mechanism than what is specified.

- **SA-2 (suggestion): Task map is missing an explicit task for `domain.yaml` schema definition.** The spec describes `domain.yaml` as containing an `extends` field (Behavior 14), and states it is "the only required file" in a custom domain directory. But no task covers defining and validating the schema of this file. What other fields are valid beyond `extends`? Consider adding a small task to define and validate the `domain.yaml` schema, even if minimal (`extends: <string>` only), to prevent ad-hoc field additions without spec coverage.

- **SA-3 (suggestion): `loadDomainConfig()` helper (Task 8) lacks a corresponding behavior.** Task 8 describes a `loadDomainConfig()` convenience function in `lib/domains/config.mjs` that wraps `resolveDomain()` + `loadOverlay()` + governance merge. However, no behavior in the Behavioral Contract section specifies this function's contract, error handling, or return type. The sibling spec (`domain-aware-skill-integration`) also does not reference `loadDomainConfig()` -- each skill calls the lower-level functions directly (integration spec Behaviors 1-20). Either remove this task (skills compose the calls themselves per the integration spec) or add a behavioral contract for it. An unspecified convenience function in the task map risks implementation drift.

- **SA-4 (suggestion): Acceptance criteria line 223 mentions a three-layer merge order that diverges from the behavioral contract's two-layer model.** The AC reads: "Config merge order is: domain profile -> project-local domain override -> governance overlay." The behavioral contract (Config Merge Order section, lines 101-108) defines only two layers: (1) domain profile resolved via `loadOverlay()` including extends chain, and (2) governance. The "project-local domain override" in the AC is the custom `.context-index/domains/<domain>/` directory, which is already part of `loadOverlay()` resolution (step 3a of the resolution order). Recommend aligning the AC wording with the two-layer model to avoid ambiguity.

- **SA-5 (warning): `DOMAIN_NOT_FOUND` error code semantics are unclear.** The Error Cases table (line 170) says when a bundled profile directory is missing for a resolved domain, `loadOverlay()` returns `null` and "skills log a warning." But the table also assigns `DOMAIN_NOT_FOUND` as an error code. Other error codes in this spec (`BUNDLED_OVERRIDE_BLOCKED`, `OVERLAY_PARSE_ERROR`, `PATH_ESCAPE`) are thrown errors. Returning `null` is not throwing. Clarify whether `DOMAIN_NOT_FOUND` is emitted as a warning/diagnostic (non-throwing) or thrown as an error that skills must catch. The current ambiguity could lead to inconsistent implementations.

- **SA-6 (suggestion): Overlay type constants module lacks its own acceptance criterion.** Task 3 defines `lib/domains/constants.mjs` to enumerate all valid overlay types, filenames, bundled domain names, and merge order. AC-9 covers type validation in `loadOverlay()`, but no AC specifically verifies the constants module exports all seven types. Adding one tightens coverage and prevents a constants module that is missing `gate-config` or `test-config` from slipping through.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

- **SEC-1 (suggestion): Domain name regex allows leading digits.** The pattern `/^[a-z0-9][a-z0-9-]*$/` accepts names like `123-domain`. While not a security risk, leading-digit domain names could create minor confusion. This is cosmetic, not a blocker.

- **SEC-2 (info): Path traversal prevention is thorough and layered.** Defense-in-depth at three layers: (1) domain name regex rejects `/`, `\`, and `..`; (2) `loadOverlay()` resolves roots via `fs.realpathSync()` and asserts candidate paths stay within root boundaries via PATH_ESCAPE (Behavior 6); (3) unknown overlay types short-circuit before any path construction (Behavior 6). Well-designed.

- **SEC-3 (info): `BUNDLED_OVERRIDE_BLOCKED` guard is sound.** The check runs before any file reads (Behavior 9), preventing a `.context-index/domains/software/` directory from injecting content into the bundled profile resolution path. The bundled name list is a compile-time constant in `lib/domains/constants.mjs`. No bypass vector identified.

- **SEC-4 (suggestion): `extends` value should explicitly be validated against the domain name regex.** Behavior 12 validates domain values from `resolveDomain()`, but the spec does not explicitly state that the `extends` value in `domain.yaml` is validated against `/^[a-z0-9][a-z0-9-]*$/` before being used for path construction. The `extends` value is interpolated into a filesystem path in Behavior 7 (`<pluginRoot>/templates/domains/<extends>/<file>`). While the realpath-and-prefix check (Behavior 6) provides a second defense layer, the regex validation should be explicitly specified for the `extends` field. Recommend adding one sentence to the `loadOverlay() Resolution with extends` section confirming that `extends` values undergo the same domain name validation.

- **SEC-5 (info): File size limit and TOCTOU mitigation are appropriate.** The 512 KB OVERLAY_TOO_LARGE guard uses `fs.stat()` on the resolved real path (after symlink resolution), with the read immediately following in the same synchronous call chain. Appropriate for single-process Node.js.

- **SEC-6 (info): Trust boundaries are well-defined.** Bundled profiles (plugin directory, trusted) -> custom profiles (`.context-index/domains/`, user-controlled) -> governance (`.context-index/governance/`, user-controlled, final say). The merge order (domain -> governance, governance wins) correctly gives project policy the last word.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CA-1 (blocker): Charter `resolveDomain()` signature includes `pluginRoot`; spec does not.** The charter's Interface Contracts table (line 101) defines `resolveDomain(manifest, charterFrontmatter, moduleSlug, pluginRoot)` with `pluginRoot` described as "reserved for future extensibility." The spec's Function Signatures section (line 34) defines `resolveDomain(manifest, charterFrontmatter, moduleSlug)` -- three parameters, no `pluginRoot`. Since `resolveDomain()` resolves domain names (not files), it does not need `pluginRoot`, and the spec's 3-parameter signature is correct. The charter must be updated to remove the `pluginRoot` parameter from `resolveDomain()`. Note: this was flagged as SA-1 (warning) in the rev-3 review and has not been addressed.

- **CA-2 (warning): Charter `software` domain invariant contradicts the spec.** The charter's Invariants section (line 72-73) states: "`software` is a reserved domain name. ... No `domains/software/` overlay directory is shipped or consulted -- the base templates ARE the software behavior. ... `loadOverlay()` will never be called with `domain: 'software'`." The spec (Behavior 5, rev 5) explicitly reverses this: `software` is now a real, bundled profile with its own directory; `loadOverlay("software", ...)` reads from `templates/domains/software/` like any other domain. This was an intentional design change between rev 3 and rev 5, but the charter (still at revision 3) has not been updated. The charter invariant directly contradicts the spec and must be updated.

- **CA-3 (warning): Charter entity/relationship counts are stale (5 vs. 7 overlay types).** The charter's Relationships section (line 64) says a DomainProfile contains five components: charter overlay, spec overlay, reviewer set, gate set, verification config. The spec defines seven overlay types (adding `gate-config` and `test-config`). The charter's Quality Attributes section (line 120) says "Overlay loading adds at most 5 file reads" -- should be 7. The charter's entity list should be updated to include GateHookConfig and TestConfig entities, and the file read count adjusted.

- **CA-4 (info): Overlay type list is consistent across all three sibling specs.** The resolution spec, integration spec, and bundled profiles spec all reference the same 7 overlay types with matching filenames: `charter-overlay.md`, `spec-overlay.md`, `reviewers.yaml`, `gates.yaml`, `verification.yaml`, `gate-config.yaml`, `test-config.yaml`. No inconsistency found.

- **CA-5 (info): Error code taxonomy is consistent across sibling specs.** Parse-time errors (`OVERLAY_PARSE_ERROR`) are owned by the resolution spec; merge-time errors (`OVERLAY_MERGE_WARN`, `INVALID_GATE`, `UNKNOWN_PROFILE`, `UNKNOWN_VERIFY_TYPE`, `TOOL_UNAVAILABLE`, `INVALID_PATTERN`) are owned by the integration spec. The Schema Responsibility Boundary section in the resolution spec correctly delineates this split. No error code collisions or misattributions.

- **CA-6 (info): ADR alignment is sound.** ADR-0003 (configurable review registry) owns `governance/review.yaml`; ADR-0004 (execution profiles) owns profile dispatch. The domain-profiles spec adds a layer below governance (domain profile defaults) that governance overlays on top of. Merge order (domain -> governance, governance wins) is consistent with ADR-0003's intent. No conflicts.

- **CA-7 (info): Lifecycle gate spec will need a revision note.** The lifecycle-gate cross-cutting spec hardcodes `DEFAULT_FILE_EXCLUSIONS` and `DEFAULT_BASH_PASSTHROUGH` in `lib/lifecycle-gate-config.mjs`. The integration spec (Behaviors 17-18) plans to replace these with domain profile config via `gate-config.yaml`. No current inconsistency -- the specs are sequential (domain profiles will update lifecycle gate config), not contradictory.

---

## Summary

**Total findings:** 13 (1 blocker, 3 warnings, 6 suggestions, 3 informational)

**Action required:**

1. **CA-1 (blocker):** Resolve the `resolveDomain()` signature mismatch between charter (4 params with `pluginRoot`) and spec (3 params without). Update the charter to match the spec's 3-parameter signature.

2. **CA-2 (warning):** Update charter revision 3 to reflect that `software` is now a real bundled profile with its own directory, not a special-case alias for base templates. The charter's invariant on line 72-73 directly contradicts spec Behavior 5.

3. **CA-3 (warning):** Update charter entity list, relationships, and quality attribute file-read counts from 5 to 7 overlay types.

4. **SA-1 (warning):** Clarify whether `EXTENDS_DEPTH_EXCEEDED` is a depth counter or a "target must be bundled" type check. Consider renaming to `EXTENDS_TARGET_NOT_BUNDLED` if the latter.

5. **SA-5 (warning):** Clarify whether `DOMAIN_NOT_FOUND` is a thrown error or a non-throwing diagnostic. Current Error Cases table is ambiguous.

Once the blocker (CA-1) and charter staleness issues (CA-2, CA-3) are resolved, the spec is ready for planning.

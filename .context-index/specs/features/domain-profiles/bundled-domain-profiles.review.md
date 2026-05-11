# Architecture Review: bundled-domain-profiles

> **Date:** 2026-05-10
> **Spec:** .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 5
> **file-sha:** 3b5bcf28ab3c45317356dbe45edf16bf512e13de

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | inline |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | inline |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | inline |

## Structural Architect (structural-architect)

**Verdict:** PASS

- **SA-1 (info): Task map structure is well-designed.** The separation between extraction tasks (software profile — pulling existing hardcoded values from codebase into overlay files) and authoring tasks (data-engineering, process-automation — creating new domain-specific content) correctly reflects the asymmetric nature of the work. Software profile extraction is mechanical and verifiable against existing constants; non-software profiles require domain expertise in the content.

- **SA-2 (info): Backward-compatibility test (Behavior 26) is the strongest verification anchor.** A test suite that compares pre- and post-migration outputs for the software profile catches any accidental behavioral drift during extraction. This is well-specified and should be the first test written.

- **SA-3 (info): Counts are now correct.** Behavior 6 states 27 file exclusion patterns and 31 bash passthrough commands. Verified against `lib/lifecycle-gate-config.mjs` (commit acca614): `DEFAULT_FILE_EXCLUSIONS` contains exactly 27 entries and `DEFAULT_BASH_PASSTHROUGH` contains exactly 31 entries. The counts match.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

- **SEC-1 (info): Profile overlays are static data files with no security concerns.** All overlay files are markdown or YAML containing configuration values (section names, reviewer entries, gate commands, file patterns). No executable code, no credentials, no user-controlled input interpolation into commands. The `gate-config.yaml` bash passthrough entries are consumed by the lifecycle gate hook's prefix-matching logic, which does not shell-interpolate the patterns.

- **SEC-2 (info): Bundled profile immutability is enforced by sibling spec.** The `BUNDLED_OVERRIDE_BLOCKED` guard (resolution spec Behavior 9) prevents users from creating `.context-index/domains/software/` to tamper with the bundled profile. This is a defense-in-depth measure — even if a user bypassed it, the bundled files in `templates/domains/` are in the plugin installation directory (npm-managed), not in the project repo.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CA-1 (warning): Spec frontmatter `charter-revision: 3` is stale.** The charter is currently at revision 4 (updated 2026-05-10). The spec's `charter-revision` field should be updated to `4`. This is metadata-only and does not affect behavioral correctness — the spec content already aligns with charter revision 4's model (7 overlay types, software as real profile, 3-parameter `resolveDomain()`).

- **CA-2 (info): Cross-spec consistency is excellent.** The resolution spec (validated) defines `loadOverlay()` and the extends model. The integration spec (validated) defines merge functions for each overlay type. This bundled-profiles spec defines the content that flows through both. All three specs reference the same 7 overlay types with matching filenames and the same error codes without collisions.

- **CA-3 (info): Charter capability map alignment.** The charter's Capability Map correctly shows `Bundled Software Profile`, `Bundled Data-Engineering Profile`, and `Bundled Process-Automation Profile` at status `specified`. The sibling specs' capabilities (Domain Resolution, Overlay File Structure, etc.) are at `validated`, consistent with their completed implementation.

- **CA-4 (info): Behavioral contract counts match codebase values.** Behavior 6 (27 file exclusions, 31 bash passthrough) matches `DEFAULT_FILE_EXCLUSIONS` (27 entries) and `DEFAULT_BASH_PASSTHROUGH` (31 entries) in the pre-refactor `lib/lifecycle-gate-config.mjs`. The refactored version (current) has removed these constants (replaced by domain profile loading), which is expected — this spec creates the overlay files that replace them.

---

## Summary

**Total findings:** 4 (0 blockers, 1 warning, 0 suggestions, 3 informational)

**Action required:**

1. **CA-1 (warning):** Update `charter-revision: 3` to `charter-revision: 4` in spec frontmatter to match the current charter revision.

The spec is ready for planning. The one warning is metadata-only and can be addressed during implementation.

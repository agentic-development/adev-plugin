# Architecture Review: bundled-domain-profiles

> **Date:** 2026-05-10
> **Spec:** .context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 5
> **file-sha:** c87e9ba461e59c2c2a3ddb59ab12a1e9fc7fddc6

## Reviewers Dispatched
| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | inline |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | inline |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | inline |

## Structural Architect (structural-architect)
**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning): File exclusion count is wrong.** The spec (Behavior 6) claims "44 file exclusion patterns" but `lib/lifecycle-gate-config.mjs:DEFAULT_FILE_EXCLUSIONS` contains exactly **27 entries**. The software profile extraction task and Acceptance Criteria reference this count. The spec must be corrected to 27 before implementation, otherwise the backward-compatibility tests will either be written against the wrong count or the extractor will pad bogus entries.

- **SA-2 (warning): Bash passthrough count is wrong.** The spec (Behavior 6) claims "32 bash passthrough commands" but `lib/lifecycle-gate-config.mjs:DEFAULT_BASH_PASSTHROUGH` contains exactly **31 entries**. Same risk as SA-1 — must be corrected to 31.

- **SA-3 (warning): `max_test_file_size` value does not match codebase.** Behavior 7 specifies `max_test_file_size: 524288` (512 KB) for the software profile, but `lib/test-strategies/gaming.mjs` defines `MAX_FILE_SIZE = 500 * 1024` (512000 bytes, i.e. 500 KB). These differ by 12288 bytes. The spec must use the actual codebase value (512000) or the backward-compatibility tests will fail.

- **SA-4 (warning): Skip patterns are incomplete.** Behavior 7 lists four JavaScript-specific skip patterns (`\.skip\(`, `xit\(`, `xdescribe\(`, `\.todo\(`), but the actual `SKIP_RE` regex in `lib/test-strategies/gaming.mjs:68` contains seven patterns, adding `test\.skip\(`, `it\.skip\(`, and `describe\.skip\(`. The software profile must extract all seven for backward-compatible behavior.

- **SA-5 (suggestion): Software profile extraction tasks should reference exact source locations.** The task map says "Extract current permitted_tools, max_test_file_size, skip patterns from `lib/test-strategies/`" but does not distinguish between `profiles.mjs` (which has `UNIT_PROFILE.permitted_tools`) and `gaming.mjs` (which has `MAX_FILE_SIZE` and `SKIP_RE`). The implementer needs both files. Adding explicit file paths reduces ambiguity.

- **SA-6 (info): Data-engineering and process-automation profiles are internally consistent.** Each profile's 7 files cover the same overlay types. Domain vocabulary is coherent within each profile (data-engineering uses data contracts/lineage/freshness consistently; process-automation uses integration points/recovery/flow consistently). Verification types (`output`, `flow`) align logically with their domains. No structural issues found.

- **SA-7 (info): Extends/clone model is sound.** The BUNDLED_OVERRIDE_BLOCKED + extends pattern provides a clean separation between immutable bundled profiles and user customization. The one-level depth limit prevents inheritance complexity. Reset via domain name change is simple and predictable. No usability concerns.

- **SA-8 (info): 7-file completeness requirement is well-defined.** Behavior 22 explicitly enumerates all seven required files. The Overlay Type-to-Filename Mapping in the resolution spec covers all seven types. Acceptance Criteria require all 21 files (3 profiles x 7 files).

- **SA-9 (info): Backward compatibility testing approach is adequate.** Behavior 26 requires a dedicated test suite comparing pre- and post-migration outputs. The acceptance criteria reinforce this for reviewers, gate-config, test-config, and verification. Combined with the refactoring tasks in the integration spec (removing hardcoded constants), this ensures regression detection.

## Security Reviewer (security-reviewer)
**Verdict:** PASS

- **SEC-1 (info): No trust escalation from bundled profiles.** Bundled profiles ship in `<plugin-root>/templates/domains/` (trusted plugin directory) and contain only static YAML/markdown data, no executable code. Domain resolution validates names against `/^[a-z0-9][a-z0-9-]*$/`, preventing path traversal. `loadOverlay()` resolves real paths via `fs.realpathSync()` and checks containment within roots. The trust model is sound.

- **SEC-2 (info): BUNDLED_OVERRIDE_BLOCKED is robust.** The guard runs before any file reads (Behavior 9 in the resolution spec). The bundled name list is a compile-time constant. The name comparison uses exact string matching on the directory name component after path resolution. Bypass vectors considered:
  - **Symlinks:** Resolved via `fs.realpathSync()` before path containment check. A symlink from `.context-index/domains/my-domain/` to `templates/domains/software/` would not bypass the guard because the guard checks the directory *name* in `.context-index/domains/`, not the resolved target.
  - **Case sensitivity:** The domain name regex requires lowercase only (`[a-z0-9][a-z0-9-]*`). On case-insensitive filesystems (macOS HFS+), creating `.context-index/domains/Software/` would match the directory but the domain name `Software` would be rejected by `resolveDomain()` validation before `loadOverlay()` is called. No bypass.
  - **Unicode normalization:** The regex restricts to ASCII lowercase + digits + hyphens. No Unicode normalization attack surface.

- **SEC-3 (info): Custom domain extensions cannot inject malicious configs that bypass governance.** The merge order (domain profile -> governance) ensures governance always wins on conflict. Custom domains can only extend bundled profiles (one level), so they inherit from trusted sources. A custom domain's `extends` field is validated against existing bundled profiles (`EXTENDS_NOT_FOUND` if missing). Gate commands execute via `execFile` (no shell interpolation). `trigger_patterns` reject `..` and absolute paths. No injection vector identified.

- **SEC-4 (suggestion): Consider whether `gate-config.yaml` bash passthrough entries in custom domains could weaken security posture.** A custom domain extending `software` could add entries like `rm -rf` to `bash_passthrough`, bypassing lifecycle gate enforcement. While governance does not currently have a mechanism to restrict passthrough entries, this is an inherent design choice (users control their own project config). Worth documenting as a "trust your project contributors" assumption.

## Consistency Analyzer (consistency-analyzer)
**Verdict:** PASS_WITH_NOTES

- **CA-1 (warning): File exclusion and bash passthrough counts do not match codebase values.** Cross-referencing Behavior 6 against `lib/lifecycle-gate-config.mjs`:
  - Behavior 6: "44 file exclusions" -- actual is 27 (off by 17)
  - Behavior 6: "32 bash passthrough" -- actual is 31 (off by 1)
  - These duplicate SA-1 and SA-2 but are confirmed from a consistency verification perspective.

- **CA-2 (warning): Charter invariant contradicts spec design for `software` domain.** The charter (rev 3, Invariants section) states: *"No `domains/software/` overlay directory is shipped or consulted... `loadOverlay()` will never be called with `domain: 'software'`."* However, the bundled-domain-profiles spec (rev 5, Behaviors 1-7) and the resolution spec (rev 5, Behavior 5) explicitly define `software` as a real bundled profile with a directory at `templates/domains/software/`. The charter must be updated to match the current design where `software` is a real profile directory, not a special case.

- **CA-3 (info): Overlay types are consistent across all three sibling specs.** All three specs reference the same 7 overlay types with matching filenames: `charter-overlay.md`, `spec-overlay.md`, `reviewers.yaml`, `gates.yaml`, `verification.yaml`, `gate-config.yaml`, `test-config.yaml`. The type-to-filename mapping table in the resolution spec is the canonical reference.

- **CA-4 (info): Merge order is consistent across specs.** The bundled-domain-profiles spec (Behavior 25) states governance is applied as a second layer on top of domain profiles. The resolution spec defines the same order: domain profile -> governance. The integration spec's merge functions follow this order in all five integration points. No inconsistency.

- **CA-5 (info): Error codes are consistent across specs.** Error codes used in this spec (`DOMAIN_NOT_FOUND`, `UNKNOWN_PROFILE`, `OVERLAY_PARSE_ERROR`) match their definitions in the sibling specs. No code collision or semantic mismatch.

- **CA-6 (info): Behaviors 1-26 are sequential and complete.** Behaviors 1-7 cover the software profile (7 overlay types), 8-14 cover data-engineering (7 overlay types), 15-21 cover process-automation (7 overlay types), 22-24 cover shared profile mechanics, 25 covers governance layering, 26 covers backward compatibility. No gaps or duplicates in the numbering.

- **CA-7 (info): Software profile reviewer config matches current codebase defaults.** The spec (Behavior 3) lists `structural-architect` (reviewer-reasoning), `security-reviewer` (reviewer-capable), `consistency-analyzer` (reviewer-fast) with `merge_strategy: append` and `blocker_threshold: 1`. This exactly matches `templates/review-specs/defaults.yaml` and the `BUNDLED_REVIEWER_IDS` set in `lib/governance/review-config.mjs`. Consistent.

- **CA-8 (info): Software profile severity defaults match codebase.** Behavior 4 lists `quality-gate=error, subagent-review=error, deterministic-check=error, observational=info`. This exactly matches `DEFAULT_SEVERITY_BY_KIND` in `lib/governance/validate-config.mjs`. Consistent.

- **CA-9 (info): Software profile permitted_tools match codebase.** Behavior 7 lists `["node:test", "jest", "vitest", "mocha", "pytest", "go test", "cargo test"]`. This exactly matches `UNIT_PROFILE.permitted_tools` in `lib/test-strategies/profiles.mjs`. Consistent.

---
## Summary
**Total findings:** 13 (0 blockers, 5 warnings, 2 suggestions, 6 info)
**Action required:** Fix the five warnings before planning:
1. Correct file exclusion count from 44 to 27 (SA-1, CA-1)
2. Correct bash passthrough count from 32 to 31 (SA-2, CA-1)
3. Correct `max_test_file_size` from 524288 to 512000 (SA-3)
4. Add three missing skip patterns to Behavior 7: `test\.skip\(`, `it\.skip\(`, `describe\.skip\(` (SA-4)
5. Update charter.md invariants to reflect `software` as a real bundled profile directory (CA-2)

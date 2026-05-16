---
spec: .context-index/specs/features/cli-driver-surface/adev-diagnose-cli.spec.md
charter: .context-index/specs/features/cli-driver-surface/charter.md
date: 2026-05-14
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: 6c6e9e94e64e5c1b03db7d44a53bdf4064e8dc2e8e5443d5d9f6e96e63addb6d
---

# Architecture Review: adev-diagnose-cli

> **Date:** 2026-05-14
> **Spec:** `.context-index/specs/features/cli-driver-surface/adev-diagnose-cli.spec.md`
> **Charter:** `.context-index/specs/features/cli-driver-surface/charter.md`
> **Verdict:** PASS_WITH_NOTES (initial: BLOCK; blocker resolved inline)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|---|---|---|---|---|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning): Exit codes 0/1/2 documented but opening paragraph cites only 0/2 (hook protocol); inconsistency. **Status:** Deferred — opening paragraph wording polish; non-functional.
- **SA-2** (warning): JSON schema `citation?` type unspecified; golden snapshot will lock in arbitrary choice. **Status:** Deferred — captured as a plan task to define `citation` as `string` in `"path/to/file:line"` form.
- **SA-3** (suggestion): Postconditions don't state how lifecycle skills invoke `adev diagnose` (subprocess vs. direct import). **Status:** Deferred — `/adev:plan` task to document subprocess invocation as the public contract.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning, input-validation): `--spec <path>` not constrained to projectRoot — symlink + extension match could expose sensitive files. **Resolution:** Behavior 2 strengthened — `--spec` resolved path must be contained within `projectRoot` (`path.resolve(spec).startsWith(path.resolve(projectRoot))`); out-of-bounds paths exit 1 with "spec not found."
- **SEC-2** (suggestion, data-exposure): Default human mode emits ANSI sequences; hook consumers without `--json` could corrupt JSON-injection parsing. **Status:** Deferred — already addressed by Behavior 7 mandating `--json` for hook invocations; implementation may add `process.stdout.isTTY` check.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES (initial: BLOCK)

- **CON-1** (blocker, contract): `runner_path` field in JSON schema (Behavior 6) not declared in `diagnostic-registry.spec.md` runner verdict shape. **Resolution:** `diagnostic-registry.spec.md` Behavior 4 updated — runner verdicts now carry `runner_path`; engine annotates each verdict with resolved path before returning. Two specs aligned.
- **CON-2** (warning, naming): Error Cases table 6 cross-references `driver-substrate behavior 6` by number; fragile to driver-substrate revisions. **Resolution:** Replaced numeric cross-reference with prose description of the dispatch-level error-handling contract.
- **CON-3** (suggestion, terminology): Schema versioning policy undefined (`schema_version` field documented but bump policy missing). **Status:** Deferred — `/adev:plan` task to add SemVer-style policy: major bump for breaking, additive uses current version.

---

## Summary

**Total findings:** 8 (1 blocker resolved, 3 warnings, 4 suggestions/deferred)
**Initial verdict:** BLOCK
**Post-resolution verdict:** PASS_WITH_NOTES
**Action required:** Spec ready for `/adev:plan`.

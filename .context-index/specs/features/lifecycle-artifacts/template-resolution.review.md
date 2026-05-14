---
last-reviewed-revision: 2
file-sha: cafae8d3e8e7b4a631f2582ce43882d5ec33f4fca90540da4e36340cd3ccc7c6
---

# Architecture Review: template-resolution

> **Date:** 2026-05-14
> **Spec:** .context-index/specs/features/lifecycle-artifacts/template-resolution.spec.md
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning (claude-opus-4-7) | single-pass module review |
| security-reviewer | Security Reviewer | subagent | reasoning (claude-opus-4-7) | single-pass module review |
| consistency-analyzer | Consistency Analyzer | subagent | reasoning (claude-opus-4-7) | single-pass module review |

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-3** (warning): `kind` invalidity and `layer` invalidity share the single error code `INVALID_KIND`. `kind-enumeration.spec.md` distinguishes them via `INVALID_LAYER` for the underlying helper; the resolver should propagate `INVALID_LAYER` separately (or document the merge explicitly) so consumers can give precise error messages.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning): No explicit path-containment check on resolved template paths. `resolveTemplate(layer, kind, domain)` reads from domain-extension directories and the bundled `templates/` directory but the spec does not require validation that the resolved path is a descendant of an allowed root. A malicious or misconfigured domain extension could return a symlink/`..` path outside the extension dir, yielding arbitrary file read. Add a precondition that the resolved absolute path must be contained within either the plugin's `templates/` directory or the named domain extension's `domain/` directory; otherwise throw `INVALID_KIND` (or a new `UNSAFE_TEMPLATE_PATH`).

## Consistency Analyzer

**Verdict:** PASS

No findings.

---

## Summary

**Total findings:** 2 (0 blockers, 2 warnings, 0 suggestions)
**Action required:** Spec advances to `review-passed`. Two issues to address before implementation: (a) add path-containment guard (SEC-1); (b) preserve `INVALID_LAYER` / `INVALID_KIND` distinction (SA-3). Neither blocks /adev:plan.

**Reviewer summary:** Resolution mechanics are clear, but the spec needs an explicit path-containment guard for domain overrides and should preserve the `INVALID_LAYER` / `INVALID_KIND` distinction established in `kind-enumeration`.

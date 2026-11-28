# Architecture Review: direct-fs-consumer-migration

> **Date:** 2026-05-12 (round 2)
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/direct-fs-consumer-migration.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS

last-reviewed-revision: 2
file-sha: 6f1f1cfe35cc8898b9ff453d6b4026307b3169b7

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Round 1 → Round 2

Round 1 returned 1 blocker (CON-1 incorrect claim that `viz/build.mjs` reads `build-state/*.json`), 5 warnings, 2 suggestions. Round 2 deletes the bogus "build-state JSON migration" task and AC and replaces them with an explicit smoke-test-only obligation correctly attributing spec-implemented-by edges to the `source-manifest` frontmatter block (`viz/build.mjs` lines 337–348). Other round-1 findings addressed: SA-2/CON-2 (declares dependency on `lib/manifest.mjs::loadManifest` promotion owned by `lifecycle-skill-instruction-updates.spec.md`), SEC-1 (adds `/^[a-zA-Z0-9_-]+$/` issueId validator), SEC-2 (two-channel exit model: stdout for happy path, stderr one-liner for unexpected errors, exit 0 always), SEC-3 (mandates `--` and double-quoted shell invocation), SA-3 (drops `--cwd` — `projectRoot` is `process.cwd()`), CON-5 (adds "only file" scope note for hooks).

## Structural Architect (structural-architect)

**Verdict:** PASS

- SA-1 · suggestion · CLI Helper Contract · Clarify whether `INVALID_PROJECT_ROOT`-style throws from `loadManifest` fall into the `expected-miss` (silent) or `unexpected error` (stderr one-liner) bucket. Sensible default: stderr bucket. Non-blocking.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

No findings. SEC-1/2/3 from round 1 are all addressed. The `/^[a-zA-Z0-9_-]+$/` regex, `--` argument terminator, double-quoted shell variable, and two-channel exit model collectively close the subprocess-injection and silent-failure gaps. Path Safety section inherits the containment contract from `json-issue-board-adapter.spec.md` rather than re-rolling one.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

- CON-1 · suggestion · interface-contract · Usage string `node lib/issues/cli-get-epic.mjs -- <issue-id>` omits the plugin-root prefix used in the shell-invocation snippet. **Recommendation:** Make the Usage string `node <ADEV_ROOT>/lib/issues/cli-get-epic.mjs -- <issue-id>` for consistency with the `<ADEV_ROOT>` convention enforced by `lifecycle-skill-instruction-updates.spec.md`. Non-blocking.
- CON-2 · suggestion · cross-spec-dependency · The prose declares the `loadManifest` dependency; consider also surfacing it as a "Prerequisites" bullet in the task map for tooling parseability. Non-blocking.

---

## Summary

**Total findings:** 0 blockers, 0 warnings, 3 suggestions.

**Action required:** Ready for planning. Run `/adev:plan --spec direct-fs-consumer-migration.spec.md` to proceed.

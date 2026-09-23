## Report Format

**Persona adaptation:** The validation report written to disk always uses the full format below. The chat summary presented to the user should follow the active persona's output rules.

**Atomic write protocol (per epic-85 / issue-496):** Write the validation report in two steps so that a session terminated mid-write never leaves a partial `.validate.md` on disk:

1. Use the Write tool to write the full report body to `.context-index/specs/features/<module>/<spec-slug>.validate.md.tmp` (note the `.tmp` suffix).
2. Commit the artifact via the CLI:

```bash
adev artifact commit --spec .context-index/specs/features/<module>/<spec-slug>.spec.md --kind validate
```

**Frontmatter must come first.** The first non-blank line of the report body MUST be the `---` frontmatter delimiter — before any heading or HTML comment. `adev/frontmatter-present` (severity: `error`) rejects a markdown body above the delimiter, and `lib/specify-revise.mjs` cannot parse an artifact whose frontmatter is not first. `adev artifact commit` enforces this and exits non-zero with `ARTIFACT_FRONTMATTER_NOT_FIRST`, leaving the `.tmp` in place for you to fix and re-run.

The verb resolves source (`<spec-path>.validate.md.tmp`) and destination (`<spec-path>.validate.md`) from the spec path, validates that the temp file exists, is non-empty (rejects zero-byte artifacts), and opens with frontmatter, then performs a same-directory `fs.renameSync` — atomic on POSIX. Until the commit step runs, the canonical `.validate.md` either reflects the prior run or is absent; the new content is never partially observable. On any failure the verb exits non-zero with a diagnostic message and the temp file remains for inspection.

**Write-state suffix choice (`.tmp` not `.partial`).** Per the write-state suffix taxonomy invariant in `agent-reliable-state-artifacts/charter.md` (Invariant #10) and `incremental-artifact-writes.spec.md` Integration Point 4, validate keeps the existing `.tmp` (byte-level, ms-scale, never recovered) and does NOT migrate to `.partial` (artifact-level, minutes-to-hours, durable). Rationale: the entire validate report is computed in memory and written in a single Write call — there is no incremental-checkpoint surface for `.partial` to protect. The `.tmp` + `adev artifact commit` idiom is the right tool for byte-level atomicity here; `.partial` is the right tool for skills (like `/adev:plan`, `/adev:specify`, `/adev:implement`) that author across multiple Write calls over minutes.

```markdown
# Validation Report: [Spec Title]

> **Date:** [YYYY-MM-DD]
> **Spec:** [path to Live Spec]
> **Plan:** [path to plan, if provided]
> **Overall Status:** PASS | FAIL

---

## Check 1: Quality Gates — PASS | FAIL
- Tests: PASS | FAIL [command output if failed]
- Lint: PASS | FAIL (auto-fixed) [command output if failed]
- Typecheck: PASS | FAIL [command output if failed]
- [Custom gate]: PASS | FAIL

[If FAIL: "Quality gates failed. Checks 2-13 skipped. Fix the above and re-run /adev:validate."]

## Check 2: Spec Compliance — PASS | FAIL
- [Criterion 1]: PASS | FAIL | PARTIAL
  - [file:line reference and explanation if not PASS]
- [Criterion 2]: PASS
- ...

## Cross-Repo Dependency Validation — PASS | WARN | N/A
- [@repo-slug/spec-slug]: Resolved — interface contracts verified (PASS | FAIL | PARTIAL)
- [@repo-slug/spec-slug]: WARN — reference unresolvable (repo not in workspace)
- N/A — no cross-repo depends-on references

## Check 4: Constitution Compliance — PASS | FAIL
- Architecture boundaries: PASS | FAIL [boundary violated, file:line]
- Non-negotiable principles: PASS | FAIL [principle violated, file:line]
- Coding standards: PASS | FAIL [standard violated, file:line]

## Check 8: Boundary Compliance — PASS | WARN | FAIL | SKIP
- Verdict and reason as returned by `adev boundaries check --json`
- [rule-id]: FAIL | WARN [file:line — message]
- Disabled: [rule-id] — [disabled_reason]  (omit when none)
- Registry warnings: [code] — [message]  (omit when none)
- SKIP means no rules were declared, or all declared rules are disabled — not that boundaries held

## Check 9: Transition Gates — PASS | FAIL | SKIP
- Transition: implement-to-validate
- [gate-id]: pass | blocked [reason: no-recorded-outcome | stale-gate-record | no-manifest-stamp | unattested-gate-record | disabled-gate | unknown-gate]
- [gate-id]: command_attested: false  (when attestation did not hold)

## Check 11: Visual Verification — PASS | FAIL | N/A
- [expectation 1]: PASS | FAIL [what was seen]
- [expectation 2]: PASS | FAIL [what was seen]
- Responsive (375px): PASS | FAIL [details]
- Responsive (768px): PASS | FAIL [details]
- Responsive (1280px): PASS | FAIL [details]
- Dark mode: PASS | FAIL | N/A [details]

---

**Summary:** [N] passed, [N] failed, [N] skipped checks. [If any skipped due to missing configuration: "Run `/adev:init` to configure missing components."]

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
```

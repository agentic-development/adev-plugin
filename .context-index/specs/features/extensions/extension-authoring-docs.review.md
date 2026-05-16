---
spec: .context-index/specs/features/extensions/extension-authoring-docs.spec.md
date: 2026-05-16
verdict: PASS_WITH_NOTES
last-reviewed-revision: 2
file-sha: 7505adc9e3265e114831d39541189682447ac92be2dfc8c0e66c36f337493cd9
---

# Architecture Review: extension-authoring-docs (revision 2)

> **Date:** 2026-05-16
> **Spec:** `.context-index/specs/features/extensions/extension-authoring-docs.spec.md` (rev 2)
> **Charter:** `.context-index/specs/features/extensions/charter.md` (rev 4)
> **Verdict:** **PASS_WITH_NOTES**
> **Prior review:** rev 1 returned PASS_WITH_NOTES with 11 warnings + 14 suggestions; all 11 warnings ADDRESSED in rev 2.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Prior-finding disposition (rev 1 → rev 2)

| Prior ID | Severity | Rev 2 status |
|---|---|---|
| SA-1 stale task | warning | ADDRESSED |
| SA-2 missing depends-on | warning | ADDRESSED |
| SA-3 Out-of-Scope: authoring tooling | warning | ADDRESSED (charter rev 4 amendment) |
| SA-4 Out-of-Scope: executable code | warning | ADDRESSED (charter rev 4 amendment; bash binary) |
| SA-5 untestable budget | warning | ADDRESSED (moved to Quality Attributes) |
| SA-6 loose hook ref | warning | ADDRESSED |
| SA-7 PR #116 citation | warning | ADDRESSED (canonical spec path) |
| SA-8 / SA-9 / SA-10 | suggestion | ADDRESSED |
| SEC-1 PATH_TRAVERSAL implicit | warning | ADDRESSED |
| SEC-2 profile scope confusion | warning | ADDRESSED |
| SEC-3 bin/check exfil vector | warning | ADDRESSED |
| SEC-4 collision visibility | warning | ADDRESSED |
| SEC-5 / SEC-6 / SEC-7 | suggestion | ADDRESSED |
| CON-1 column header | warning | ADDRESSED |
| CON-2 governance schema | warning | ADDRESSED |
| CON-3 test path | warning | ADDRESSED |
| CON-4 / CON-5 / CON-6 / CON-7 / CON-8 | suggestion | ADDRESSED (CON-8 carried forward as charter-family hygiene) |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

**Summary:** Rev 2 addresses all 10 prior findings; two minor residual concerns around charter Out-of-Scope wording precision and one untested postcondition.

- **SA2-1** _suggestion_ — Charter Out-of-Scope row "Executable code SHIPPED BY extensions for runtime adev consumption" uses ambiguous emphasis. Define "runtime adev consumption" inline as "loaded into the adev process via require/import" to forestall future disputes.
  - Citation: `charter.md:37`

- **SA2-2** _suggestion_ — AC line "Install report surfaces ALL colliding ids in a dedicated section" lacks a referenced test fixture. The install test Task mentions a negative fixture for string-form `command:` but not for id collision. Add a collision-report assertion.
  - Citation: `extension-authoring-docs.spec.md` AC line 110 vs Task Map line 96

- **SA2-3** _suggestion_ — Postcondition "reads neither env nor argv beyond `$0`" is testable for argv (positional count) but harder for env reads in bash (a script inherits env without "reading" it). Tighten to "the script body contains no `$VAR`, `${VAR}`, or `printenv`/`env` invocations" so the install test can grep-assert deterministically.
  - Citation: `extension-authoring-docs.spec.md` Postconditions line 61, AC line 103

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

**Summary:** All 7 prior findings ADDRESSED. Two new warnings around bash-specific attack surface and untrusted-source threat-model coverage.

- **SEC2-8** _warning_ — Bash switch removes Node attack surface but introduces shell-quoting/word-splitting risk. Spec mandates no env/stdin/argv reads but does NOT require `set -euo pipefail`, IFS hardening, or forbid `eval`/`source`/command substitution. A future contributor could add `eval "$1"` and pass postconditions on a literal read. Add: "MUST NOT use eval, source, backticks, or `$(...)` command substitution; MUST begin with `set -euo pipefail`."
  - Citation: `extension-authoring-docs.spec.md` Postconditions line 61, Behavior 4 line 46

- **SEC2-9** _warning_ — Threat-model coverage of untrusted sources is partial. Behavior 5(d) covers subprocess privilege after install, but the spec is silent on differential trust posture between npm/git/local sources. Add to Behavior 5(d) pitfalls: "installing extensions from untrusted npm/git sources grants their quality-gate commands the same privilege as the user — review `bin/*` before first `/adev:validate` run."
  - Citation: `extension-authoring-docs.spec.md` Behavior 5(d) line 52

- **SEC2-10** _suggestion_ — "Reads neither env nor argv" is partly advisory at the static level. The install test could perform BOTH a static grep (for `$1`, `$@`, `$#`, `$*`, `${[A-Z]`, `printenv`, `env\b`) AND a runtime sentinel-env test (set `SECRET=hunter2`, assert it doesn't appear in stdout). Pick the enforcement mechanism explicitly to avoid drift to advisory-only.
  - Citation: `extension-authoring-docs.spec.md` AC line 103

- **SEC2-11** _suggestion_ — `bin/check.sh` runs via `command: [bash, bin/check.sh]`. `configurable-checks.spec.md` Behavior 6c locks `cwd` to consumer repo root with `shell: false`. However the spec doesn't state how `bin/check.sh` resolves — a malicious project with `bin/check.sh` in its repo root could shadow the extension's binary. Clarify that the installer rewrites `command` argv to an absolute path under `.context-index/extensions/<name>/bin/check.sh` at install time.
  - Citation: `extension-authoring-docs.spec.md` Task Map line 92, `configurable-checks.spec.md` Behavior 6c

- **SEC2-1 to SEC2-7** _confirmations_ — All prior security warnings ADDRESSED cleanly (see prior-finding disposition table above).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**Summary:** All 4 prior warnings ADDRESSED; rev 2 is internally consistent. Two minor polish residuals carried forward.

- **CON2-1** _suggestion_ — `lib/cli/report.mjs` cited twice (Preconditions lines 33 + 35) without a line range. `install.mjs` got the line range treatment (85-97) inline; `report.mjs` should get the same for parity.
  - Citation: `extension-authoring-docs.spec.md:33,35`

- **CON2-2** _suggestion_ — Line 81 retains a `bin/check.mjs` reference inside a parenthetical example (`[node, bin/check.mjs, --spec]`). This is INTENTIONAL — illustrates the alternative runtime path while keeping the canonical bash reference. Consider an inline note (`...e.g. bin/check.mjs for Node-shipped extensions...`) to make the deliberate divergence explicit.
  - Citation: `extension-authoring-docs.spec.md:81`

- **CON2-3** _suggestion_ — Charter rev 4 line 39 phrasing "Documentation, manifest templates, and reference example extensions" matches the spec's framing in essence, but the spec never echoes this exact tri-part phrase. Lifting it into the spec's opening or Preconditions would tighten charter→spec lineage and aid future consistency audits.
  - Citation: `extension-authoring-docs.spec.md:21-36` vs `charter.md:39`

- **CON2-4** _suggestion_ — Frontmatter style inconsistency carried forward (charter-family hygiene): charter.md uses minimal frontmatter while extension specs use extended frontmatter. Out-of-scope for this spec; track as a charter-family hygiene item.
  - Citation: `charter.md:1-5` vs `extension-authoring-docs.spec.md:1-19`

---

## Summary

**Total findings:** 16 (0 blockers, 2 warnings, 14 suggestions)

- **All 25 rev 1 findings were addressed in rev 2** (11 warnings ADDRESSED, 14 suggestions ADDRESSED or carried forward as charter-family hygiene).
- **New in rev 2:** 2 warnings, both implementation-level hardening for the bash binary and the docs threat-model section (not blocking; can be addressed during implementation).
- **Verdict:** PASS_WITH_NOTES — eligible for `/adev:plan`. The two new warnings (SEC2-8 bash hardening, SEC2-9 untrusted-source threat model) should be folded into the implementation plan as explicit tasks rather than discovered reactively.

**Suggested next action:** Proceed to `/adev:plan`. The two new warnings translate cleanly into specific tasks:
- Task: enforce `set -euo pipefail` and forbid eval/source/cmd-sub in `bin/check.sh` (add to install test's static-grep assertions).
- Task: add an "Untrusted sources" subsection to `docs/extensions.md` pitfalls.

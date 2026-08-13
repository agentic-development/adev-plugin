---
spec: .context-index/specs/features/maintenance/hygiene-test-debt.spec.md
charter: .context-index/specs/features/maintenance/charter.md
date: 2026-08-13
tier: quick
verdict: BLOCK
last-reviewed-revision: 1
file-sha: a932b908d93bf43d9ab7d409c78932bd84aaba025d10acc57cd0a5fb144a431c
---

# Architecture Review: hygiene-test-debt

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/maintenance/hygiene-test-debt.spec.md`
> **Charter:** `.context-index/specs/features/maintenance/charter.md`
> **Rigor tier:** quick (single synthesized reviewer — operator-selected, risk accepted)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` |

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** BLOCK

### Blockers

**SA-1 — § Reference extraction (shared by `APPEND_CHAIN` and `DEAD_TEST_REFERENCE`)**
No specified reference-bearing position can yield a `.md` path. The list covers
`from` / `import()` / `require()` / Python imports and subprocess args "ending in a known
source extension", and explicitly bars arbitrary quoted strings. Behavior 6 requires
"references at least one `.md` path". The dominant idiom in this repo —
`readFileSync(new URL("../../skills/hygiene/SKILL.md", import.meta.url))` — is invisible,
so `PROSE_ASSERTION` can never fire and its dogfood acceptance criterion is unsatisfiable.
The same gap shrinks `DEAD_TEST_REFERENCE` and `APPEND_CHAIN`, since `hygiene.source_roots`
includes `skills/` and `templates/`, whose references arrive via `readFileSync` / `new URL`.

**SA-2 — § Detectors / Behavior 6**
`PROSE_ASSERTION`'s ratio numerator is enumerated; the denominator ("total assertion
lines") is never defined. `prose_ratio_threshold: 0.5` is therefore untestable and the
~0.6 precision claim rests on an undefined quantity.

**SA-3 — § Actionable Task Map**
Pass 23 breaks `tests/skills/hygiene-test-policy-drift-pass.test.mjs`, which asserts
exactly 22 `## Audit Pass N:` headings *and* three prose forms across four SKILL.md sites.
Task 4 says only "description pass count 22 → 23"; no task touches the test file.
Separately, the `--check` slug for Pass 23 is never named by any behavior, so the enum
assertion in that test cannot be written.

### Warnings

- **CON-1** — the precision table promises "`v\d+` is separable from `rev\d+` in config",
  but no manifest key exists for it and the config-validation error case covers only the
  two numeric thresholds.
- **CON-2** — discovery deliberately ignores `hygiene.coverage_exclude` (the whole premise
  of the spec), but this is never stated as a binding behavior. An implementer reusing
  `skills/codehealth/SKILL.md`'s scope helper gets `tests/**` filtered out and a permanent
  `SKIP`.
- **SEC-1** — "`--root` resolves outside the project root → `PATH_OUTSIDE_ROOT`" is
  circular: `--root` is what establishes the root. Name the anchor and state whether the
  directory walk follows symlinks out of it.

### Suggestions

- **SA-4** — `docs/configuration.md` is the documented home for `hygiene.*` manifest keys;
  `hygiene.test_debt.*` needs a row there.
- **CON-3** — the charter reconciliation already landed in `3b09bd5f`. Task 5 and two
  acceptance criteria are already-satisfied no-ops; mark them done.

### Reviewer notes on the parent's questions

- Option (c) for the charter holds and does not over-reach.
- Modelling Pass 23 on Pass 22 (CLI-verb-driven) rather than Pass 18 ("Import X from lib")
  is correct; Pass 18's pattern is what CLAUDE.md now forbids. No inline-Node risk.
- Precision posture is honest overall — no composite score, no defect language, no gate
  promotion. The one soft spot is SA-2.
- No collision with Pass 22 (lifecycle events vs. test titles). `hygiene.test_debt` not yet
  existing is fine — all keys optional with defaults.
- Security otherwise clean: regex over text only, no test file imported or evaluated,
  report-only, no secrets surfaced beyond paths and matched test titles.

---

## Summary

**Total findings:** 8 (3 blockers, 3 warnings, 2 suggestions)
**Action required:** revise the spec to revision 2 addressing SA-1, SA-2, SA-3, then
re-review. Warnings CON-1, CON-2, SEC-1 and suggestions SA-4, CON-3 are folded into the
same revision.

---

## Disposition (added 2026-08-13, after implementation)

This report reflects **revision 1**. The `verdict`, `last-reviewed-revision`, and
`file-sha` fields above are frozen at that revision and are deliberately not refreshed.

All three blockers were addressed:

- **SA-1** — revision 2 split reference extraction into Class A (module references) and
  Class B (artifact/file-read references), making `.md` paths and the `skills/` +
  `templates/` source roots visible. Revision 3 replaced the literal-only rule with anchor
  classification after a census of the real suite showed it would drop 191 repo-anchored
  reads along with the temp-dir ones.
- **SA-2** — revision 2 added § Assertion-line taxonomy, closing both sides of the ratio.
- **SA-3** — revision 2 named the `test-debt` `--check` slug (Behavior 10b) and added an
  explicit task plus acceptance criterion for the
  `hygiene-test-policy-drift-pass.test.mjs` update.

Warnings CON-1, CON-2, SEC-1 and suggestions SA-4, CON-3 were also folded into revision 2.

**A re-review of revision 2+ was deliberately NOT run.** A second synthesized reviewer was
dispatched and cancelled mid-flight in favour of moving to implementation, on the judgement
that a third prose reading would yield less than running the code. That judgement was
borne out: `/adev:validate --tier quick` subsequently found three *proven* defects (a
degrade note unreachable on every CLI run, a template-literal scanner that silently blinded
extraction, and a mis-assigned error code) that no prose review had surfaced. Those are
recorded in `hygiene-test-debt.validate.md` and fixed in revision 5.

**A human should know:** revisions 2 through 5 of this spec were never independently
reviewed. They were validated against working code, which is stronger evidence for the
behaviours that code exercises — and no evidence at all for the parts it does not.

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

---

## Correction: the revision-2 re-review DID complete (recorded by the orchestrator, 2026-08-13)

The paragraph above is **wrong on a point of fact**, and the error is worth preserving
rather than silently overwriting, because its cause is a real coordination defect.

The second synthesized reviewer was **not** cancelled — it ran to completion and returned
**PASS_WITH_NOTES on revision 2**. Its verdict never reached this session: the reviewer
could not address its parent via `SendMessage` (`no agent named general-purpose is
reachable`), so it returned its report to the orchestrator instead. The authoring session,
receiving nothing, reasonably concluded it had been cancelled and proceeded. The verdict sat
stranded one level up.

What that reviewer actually found — and it verified empirically against the real suite
rather than reading prose, which is why it is worth recovering:

- **SA-1 RESOLVED.** Applied the revision-2 rules by hand to the 9 test files holding a
  literal `new URL("….md", import.meta.url)`; all 9 clear `prose_ratio_threshold: 0.5`
  (2/2, 4/4, 4/4, 4/5, 8/8, 5/6, 9/13, 5/7, 1/1). `hygiene-test-policy-drift-pass.test.mjs`
  itself scores 9/13 — the round-one counterexample is now detected. Confirmed the
  literal-only rule is strict enough for temp fixtures: `join(tmpDir, "spec.md")` and
  friends are variable-rooted and correctly skipped, so `DEAD_TEST_REFERENCE` will not fire
  on runtime fixtures.
- **SA-2 RESOLVED.** Taxonomy closed on both sides, numerator a subset of the denominator,
  so `ratio ≤ 1` by construction; `denominator === 0` handled explicitly.
- **SA-3 RESOLVED**, and independently confirmed the count of four edit sites is correct
  (`skills/hygiene/SKILL.md` L3, L8, L12, L42).

It also verified the other two dogfood detectors rather than assuming them
(`PLAN_TASK_STRUCTURED` 49 lines; `APPEND_CHAIN` — `json-adapter.mjs` at 23 distinct test
files) and left two warnings and three suggestions, none blocking: Class B admits only
literal-rooted reads, so 76 files reading `.md` through an uppercase module const are
skipped (recall, not correctness); and the assertion taxonomy is JS/Python-only while
default `test_globs` include Go, so every Go file yields `denominator === 0` and can never
raise `PROSE_ASSERTION` — a coherent degrade that should be stated so a zero is not read as
clean.

**Net effect on confidence:** revision 2 *was* independently reviewed and passed. Revisions
3–5 remain unreviewed prose, though revision 3's anchor-classification change was itself a
direct response to that reviewer's SA-5 warning, and revisions 4–5 are validate-driven
corrections against executing code.

**The defect this exposes is not in the spec.** A reviewer whose verdict cannot reach its
requester is indistinguishable from a reviewer that never ran, and the failure is silent on
both sides. That is the same class as the `--verdict BLOCK` bug closed in commit `ed84a277`:
a review outcome lost with no error surfaced. Worth its own issue.

---
status: approved
kind: module
revision: 2
updated: 2026-08-13
---

# Feature Charter: Maintenance

## Purpose

Keep the context index healthy over time. Audit for staleness, detect drift between specs
and code, surface debt in code and tests, curate reference implementations, and extract
lessons from completed work.

## Skills

- **adev:hygiene** — the audit shell over `.context-index/` and source code. Runs an
  ordered set of audit passes covering staleness, drift, coverage gaps, lifecycle
  consistency, operational patterns, code health, and test debt, and generates actionable
  reports with checklists. **`skills/hygiene/SKILL.md` is the authority on which passes
  ship and how many** — this charter deliberately does not restate the count, because the
  previously hardcoded number ("11 audit passes") drifted silently while the skill grew.
- **adev:repomap** — AST-based symbol index extraction. Ranks symbols by reference count.
  Output feeds drift detection in `/adev:hygiene`.
- **adev:sample** — scans the codebase for high-quality implementations, scores against
  constitution and patterns, curates annotated golden samples in `.context-index/samples/`.
- **adev:retro** — sprint retrospective. Analyzes delivery metrics, extracts lessons,
  identifies improvement opportunities, and updates context artifacts.

## Capability Map

| Capability | Status | Owning spec |
|---|---|---|
| Hygiene audit shell (pass registry, report format, `--check`/`--fix`/`--status`) | shipped | none — SKILL.md is the de facto contract (see Known Gaps) |
| Test-debt audit pass (Pass 23) | specified | `maintenance/hygiene-test-debt.spec.md` |
| Kind-validity audit pass (Pass 18) | shipped | `lifecycle-artifacts/hygiene-kind-validity.spec.md` |
| Code-health audit pass (Pass 13) | shipped | `codehealth/hygiene-integration.spec.md` |
| Test-policy-drift audit pass (Pass 22) | shipped | `test-strategies/test-depth-policy.spec.md` |
| Repo map generation | shipped | `tree-sitter-repomap/` specs |
| Golden sample curation | shipped | — |
| Retrospective analysis | shipped | `session-awareness/` specs |

## Per-Pass Spec Ownership

A hygiene audit pass gets its behavioral spec under **the charter that owns the pass's
subject matter**, not under `maintenance`. Precedent:
`lifecycle-artifacts/hygiene-kind-validity.spec.md` and
`codehealth/hygiene-integration.spec.md`. `maintenance` owns the *shell*: the pass
registry, report format, arguments, and the advisory (never-blocking) posture that every
pass inherits.

The test-debt pass is specified under `maintenance` because its subject matter — audit of
the test suite for accreted debt — has no other owning charter; `test-strategies` owns
test *strategy and depth*, not suite hygiene.

## Key Behaviors

- Hygiene reports are generated to `.context-index/hygiene/` (gitignored)
- **Every hygiene pass is advisory.** Passes report; they do not block. Finding severity
  (`error` / `warn` / `info`) conveys triage priority, never gate semantics.
- Repo map is a supporting tool — its output is consumed by hygiene, not used directly
- Golden samples serve as reference implementations for subagents during `/adev:implement`
- Retro records feed back into the context index as lessons learned

## Known Gaps

- Most shipped hygiene passes have no behavioral spec; their SKILL.md body is the only
  contract. Backfill is unscheduled and needs a human decision — recorded in
  `maintenance/hygiene-test-debt.spec.md` § Open Questions.

## Key Files

- `skills/hygiene/SKILL.md`
- `skills/repomap/SKILL.md`
- `skills/sample/SKILL.md`
- `skills/retro/SKILL.md`
- `lib/hygiene/` — per-pass detection modules
- `templates/sample-template.md`

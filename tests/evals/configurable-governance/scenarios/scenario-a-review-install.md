# Scenario A: Install and run /adev:review-specs with project overlay

## Skill
`adev:review-specs`

## Target Project
`tests/evals/configurable-governance/fixture` — a consumer project that has "installed" the plugin and declared its governance configs.

## Prompt
Run `/adev:review-specs --spec .context-index/specs/features/billing/invoice-generation.md` on this project. Honor the project's `governance/review.yaml` (disables `consistency-analyzer`, caps `security-reviewer` at `warning`, adds `project.billing-domain`). Honor the project profiles at `.context-index/profiles.yaml`.

## Expected Behavior
- Loader reports three dispatched reviewers: `structural-architect`, `security-reviewer` (cap: warning), `project.billing-domain`.
- `consistency-analyzer` is excluded.
- `project.billing-domain` dispatches because the target path matches `specs/features/billing/**/*.md`.
- A bundled-default-override WARN is surfaced (`BUNDLED_DEFAULT_OVERRIDE`).
- Reviewer report lists mode (`subagent`), profile, and prompt source for each reviewer.

## Success Criteria
- Three reviewers execute; `consistency-analyzer` absent.
- The review report shows `Reviewers Dispatched` table with exactly those three ids.
- The report's verdict follows the default threshold (`blocker_threshold: 1`).
- No reviewer with `filesystem-write`/`shell` posture is dispatched.

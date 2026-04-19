# Configurable Governance Eval

End-to-end install + run eval for the configurable reviewer and validate skills shipped in 0.18.0.

## What it proves

- Bundled profile defaults + a project `.context-index/profiles.yaml` overlay merge correctly.
- `/adev:review-specs` honors `governance/review.yaml` (disable, override, add project reviewer with triggered dispatch).
- `/adev:validate` honors `governance/validate.yaml` (disable a check, add a quality-gate with argv-form + env-scoped profile, add a subagent-review with `after:` ordering, add an observational check).
- Negative configurations fail closed at load with specific error codes (no API spend, no subprocess spawn).
- Quality-gate subprocess runs with `shell: false`, env scoped to profile-declared keys + minimal startup whitelist, stdout/stderr redacted through the profile pipeline.

## Layout

```
tests/evals/configurable-governance/
  setup-fixture.sh                         # builds tests/evals/configurable-governance/fixture/
  configurable-governance.test.mjs         # deterministic integration tests — run via node --test
  scenarios/*.md                           # human-readable scenario descriptions
  rubrics/*.yaml                           # rubrics for LLM-level scoring of captured outputs
  run-eval.mjs                             # scores outputs/<variant>/<scenario>/output.md vs rubrics
  outputs/<variant>/<scenario>/output.md   # (created when you capture a skill run)
  README.md                                # this file
```

## Deterministic run (no LLM needed)

```bash
# Build the fixture and run the integration tests in one shot.
bash tests/evals/configurable-governance/setup-fixture.sh
node --test tests/evals/configurable-governance/configurable-governance.test.mjs
```

The tests each clone the fixture into a temp directory before mutating it, so they do not pollute the parent plugin's `.context-index/` state.

## LLM-level run (optional)

1. Build the fixture: `bash tests/evals/configurable-governance/setup-fixture.sh`
2. `cd tests/evals/configurable-governance/fixture` and run each scenario's prompt against the skill (e.g. `/adev:review-specs --spec .context-index/specs/features/billing/invoice-generation.md`).
3. Capture the skill's output to `outputs/<variant>/<scenario>/output.md`.
4. `node tests/evals/configurable-governance/run-eval.mjs`

Replace `<variant>` with a short name for the model + configuration you ran (e.g., `baseline`, `sonnet-4-6`, `with-browser-mcp`).

## Fixture contents

- `.context-index/constitution.md`, `manifest.yaml`, `platform-context.yaml`
- `.context-index/profiles.yaml` \u2014 one project profile (`project-gate-profile`) that extends the bundled minimal set with an `env.allow` whitelist for a long `API_TOKEN` + short `DEBUG_FLAG`
- `.env` \u2014 real values for those keys
- `.context-index/governance/review.yaml` \u2014 disables `consistency-analyzer`, caps `security-reviewer` at `warning`, adds `project.billing-domain` with `dispatch: triggered`
- `.context-index/governance/validate.yaml` \u2014 disables `check-10-platform-drift`, adds `project.npm-test` (quality-gate, argv form), `project.billing-domain-rules` (subagent-review after `check-2`), `project.adoption-metric` (observational)
- `.context-index/specs/features/billing/invoice-generation.md` \u2014 the target spec
- `.context-index/negative/*.yaml` \u2014 malicious or invalid configs used one at a time to verify fail-closed behavior:
  - `traversal.yaml` \u2014 `prompt: ../../../../etc/passwd`
  - `implementer-reviewer.yaml` \u2014 reviewer references `implementer` profile
  - `cross-plugin.yaml` \u2014 `prompt: plugin:other-plugin:...`
  - `shell-gate.yaml` \u2014 quality-gate `command: "npm test"` (string form)
  - `interpolation-gate.yaml` \u2014 quality-gate argv with `{{ spec.slug }}`
  - `secret-pack.yaml` \u2014 context pack `include: [".env*"]`
  - `project-deterministic.yaml` \u2014 project tries to register `kind: deterministic-check`

## Scoring

- **Deterministic layer** (`configurable-governance.test.mjs`): hard pass/fail on library behavior. Runs in the normal `npm test` suite.
- **LLM layer** (`run-eval.mjs` + rubrics): regex match over captured skill output + quality-dimension rubrics for an LLM judge.

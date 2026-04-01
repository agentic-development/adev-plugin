# Plan: Model Routing

## Spec Reference
- Spec: `.context-index/specs/cross-cutting/model-routing.md`
- Review: PASS_WITH_NOTES

## Current State

Several skills already comply with the model-routing spec:
- `templates/platform-context.yaml` — already has `model_tiers` with blank values and comments
- `skills/adev-test-write/SKILL.md` — already uses tier names, no hardcoded models
- `skills/adev-implement/SKILL.md` — already reads `model_tiers` in Load Context step
- `skills/adev-eval/SKILL.md` — already references `reasoning` tier with fallback
- `skills/adev-review-specs/SKILL.md` — already has tier annotations for all three subagents

Remaining work:
- `skills/adev-brainstorm/SKILL.md` — dispatches charter-reviewer subagent without tier annotation or model tier resolution step
- `skills/adev-init/SKILL.md` — contains hardcoded model names (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-6`) as default examples in the model tier prompt; spec says no SKILL.md should contain hardcoded model IDs
- Cross-skill compliance test — no single test validates the "no hardcoded model IDs" invariant across all skills

## Tasks

### Task 1: Add model tier resolution to adev-brainstorm SKILL.md
- **Files:** `skills/adev-brainstorm/SKILL.md`
- **Tests:** `tests/model-routing/brainstorm-routing.test.mjs`
- **TDD:** RED — write test asserting (1) SKILL.md contains `model_tiers` reference, (2) charter-reviewer dispatch references `capable` tier, (3) no hardcoded model IDs present. Then update the skill.
- **Description:** Add a model tier resolution step to the brainstorm skill's Load Context phase (Step 1). Annotate the charter-reviewer subagent dispatch in Step 6 with `capable` tier. Add fallback documentation (when `model_tiers` is absent, fall back to hardcoded defaults from the model-routing spec and log advisory). The subagent prompt block should not contain a model name — only the tier annotation above it.

### Task 2: Remove hardcoded model IDs from adev-init SKILL.md
- **Files:** `skills/adev-init/SKILL.md`
- **Tests:** `tests/model-routing/init-routing.test.mjs`
- **TDD:** RED — write test asserting SKILL.md does not contain `claude-sonnet`, `claude-haiku`, `claude-opus`, `gpt-4`, or `gemini` as literal model IDs. Then update the skill.
- **Description:** Replace the hardcoded model names in the model tier prompt (lines 98-100) with a reference to the model-routing spec's default table. Change the prompt text to say "Defaults are defined in `.context-index/specs/cross-cutting/model-routing.md`" and instruct the init flow to read defaults from the spec rather than embedding model names. This keeps the init skill provider-agnostic while still offering sensible defaults.

### Task 3: Add cross-skill model routing compliance test
- **Files:** (no source changes)
- **Tests:** `tests/model-routing/no-hardcoded-models.test.mjs`
- **TDD:** RED — write test that reads every `skills/*/SKILL.md` file and asserts none contain hardcoded model IDs (claude-sonnet, claude-opus, claude-haiku, gpt-4, gpt-3, gemini). This is a regression guard.
- **Description:** Create a single test file that dynamically discovers all SKILL.md files under `skills/` and checks each one for hardcoded model names. This ensures future skills cannot accidentally introduce provider-specific model references. Pattern follows the existing `platform-context-template.test.mjs` approach. The test should pass after Tasks 1 and 2 are complete.

### Task 4: Add subagent-dispatching skills tier documentation test
- **Files:** (no source changes)
- **Tests:** `tests/model-routing/tier-annotations.test.mjs`
- **TDD:** RED — write test that checks each skill known to dispatch subagents (`adev-implement`, `adev-eval`, `adev-review-specs`, `adev-brainstorm`, `adev-test-write`) references `model_tiers` and at least one tier name (`fast`, `capable`, or `reasoning`).
- **Description:** Regression guard ensuring skills that dispatch subagents always document their tier resolution. The list of dispatching skills is maintained as a constant in the test file. When a new dispatching skill is added, it must be added to this list (the test serves as a checklist). Should pass after Tasks 1-2 are complete.

## Task Order

```
Task 1 ──┐
Task 2 ──┤── Task 3 (depends on 1+2 for GREEN)
         └── Task 4 (depends on 1 for GREEN)
```

Tasks 1 and 2 are independent and can be implemented in parallel. Tasks 3 and 4 can be written (RED) at any time but will only pass (GREEN) after Tasks 1 and 2 are complete.

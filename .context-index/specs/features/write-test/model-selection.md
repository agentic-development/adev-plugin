# Live Spec: Model Selection

<!-- Live Spec within the adev:write-test charter.
     Parent Charter: .context-index/specs/features/adev:write-test/charter.md
     Cross-cutting dependency: .context-index/specs/cross-cutting/model-routing.md -->

---
charter: adev:write-test
status: implemented
risk_level: low
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-27
cross-cutting-refs:
  - .context-index/specs/cross-cutting/model-routing.md
source-manifest:
  sha: "794bc64"
  files:
    - skills/write-test/SKILL.md
    - templates/platform-context.yaml
    - tests/write-test/platform-context-template.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
---

## Behavioral Contract

### Preconditions

- The skill is about to dispatch a subagent (test authoring or semantic verification)
- `.context-index/platform-context.yaml` is readable (or fallback defaults apply)

### Behaviors

1. **When** the skill prepares to dispatch the test-authoring subagent (RED phase) **then** it reads `model_tiers.capable` from `platform-context.yaml` and uses that model ID. This is the highest-stakes dispatch — code generation and behavioral reasoning require a capable model.

2. **When** the skill prepares to dispatch the semantic diff subagent (`--verify`) **then** it reads `model_tiers.fast` from `platform-context.yaml` and uses that model ID. Verification is a comparison task suited for a fast, cheap model.

3. **When** the skill prepares to dispatch the gaming violation judgment subagent (for edge cases not caught by `detect-gaming.mjs` regex) **then** it reads `model_tiers.fast` from `platform-context.yaml`.

4. **When** `model_tiers` is absent from `platform-context.yaml` **then** the skill uses the hardcoded defaults defined in the model-routing cross-cutting spec and logs a one-time advisory. The canonical fallback table (all three tiers) is defined in `.context-index/specs/cross-cutting/model-routing.md`. For reference, the tiers used by this skill fall back to:

   | Tier | Hardcoded Default |
   |------|-------------------|
   | `capable` | `claude-sonnet-4-6` |
   | `fast` | `claude-haiku-4-5` |
   | `reasoning` | `claude-opus-4-7` |

5. **When** a tier key exists in `model_tiers` but its value is empty or null **then** the skill falls back to the `capable` tier value; if `capable` is also empty, falls back to the hardcoded default `claude-sonnet-4-6`. Resolution order: tier-specific value → `capable` value → hardcoded default `claude-sonnet-4-6`.

6. **When** `platform-context.yaml` is unreadable (permission error, malformed YAML) **then** the skill uses hardcoded defaults and logs a warning with the file path and error.

### Postconditions

- Every subagent dispatch in `adev:write-test` uses a model ID resolved from `platform-context.yaml` or a documented fallback
- No hardcoded model name appears in `SKILL.md`
- A one-time advisory is logged when fallback is active

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `platform-context.yaml` not found | Use hardcoded defaults, log advisory | — |
| `model_tiers` key missing | Use hardcoded defaults, log advisory | — |
| Tier value empty | Fall back to `capable` value or hardcoded default | — |
| YAML parse error | Use hardcoded defaults, log warning with parse error | — |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — YAML parsing uses a simple line-by-line reader or Node.js built-in if available. No `js-yaml` or external YAML library.
- **Principle:** "Skills are primarily markdown" — Model tier resolution is a read step described in SKILL.md instructions. The `.mjs` helper (if any) is an acceleration aid.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add tier resolution step to `SKILL.md` | Document: read `platform-context.yaml`, extract `model_tiers`, apply per-dispatch tier, fall back with advisory | Small |
| Update `templates/platform-context.yaml` | Add `model_tiers` section with blank `fast`, `capable`, `reasoning` keys and explanatory comments | Small |

## Acceptance Criteria

- [ ] RED phase dispatches the `capable` tier model
- [ ] `--verify` dispatches the `fast` tier model
- [ ] Gaming judgment dispatches the `fast` tier model
- [ ] When `model_tiers` is absent, hardcoded defaults are used and an advisory is logged once
- [ ] When a tier is empty, falls back to `capable` value
- [ ] `SKILL.md` contains no hardcoded model names
- [ ] `templates/platform-context.yaml` includes `model_tiers` with `fast`, `capable`, `reasoning` keys
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced

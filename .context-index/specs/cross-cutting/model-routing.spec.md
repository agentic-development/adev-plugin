# Live Spec: Model Routing

<!-- Cross-cutting spec for provider-agnostic model tier selection.
     Applies to all skills that dispatch subagents.
     This defines a behavioral contract for how skills select models — never a specific model name. -->

---
mode: cross-cutting
status: validated
risk_level: medium
milestone:
revision: 2
created: 2026-03-27
updated: 2026-05-04
affects:
  - implementation
  - validation
  - assessment
  - design
  - adev:write-test
source-manifest:
  sha: "01fae0a"
  files:
    - templates/platform-context.yaml
    - skills/implement/SKILL.md
    - skills/eval/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/brainstorm/SKILL.md
    - skills/write-test/SKILL.md
  computed-at: "2026-07-03T22:27:11.225Z"
---

## Behavioral Contract

### Preconditions

- The project has a `.context-index/platform-context.yaml` file (scaffolded by `/adev:init`)
- A skill is about to dispatch a subagent and must select a model

### Behaviors

1. **When** a skill dispatches a subagent **then** it reads `model_tiers` from the project's `.context-index/platform-context.yaml` before composing the subagent prompt, and maps the required tier (`fast`, `capable`, or `reasoning`) to the concrete model ID declared there.

2. **When** `model_tiers` is absent from `platform-context.yaml` **then** the skill falls back to these hardcoded defaults and logs a one-time advisory to configure `model_tiers`:

   | Tier | Hardcoded Default |
   |------|-------------------|
   | `fast` | `claude-haiku-4-5` |
   | `capable` | `claude-sonnet-4-6` |
   | `reasoning` | `claude-opus-4-7` |

3. **When** a tier key is present in `model_tiers` but its value is empty or null **then** the skill falls back to the `capable` tier value (or the `capable` hardcoded default if `capable` is also unset).

4. **When** a skill documents a subagent dispatch in its SKILL.md **then** it specifies the required tier by name (`fast`, `capable`, `reasoning`) — never a concrete model ID.

5. **When** `/adev:init` scaffolds a new project **then** `templates/platform-context.yaml` includes a `model_tiers` section with all three tier keys present and blank, with inline comments explaining each tier's intended use.

6. **When** a skill determines the appropriate tier for a dispatch **then** it uses these tier assignments as defaults:

   | Tier | Intended Use | Prompt Quality |
   |------|-------------|----------------|
   | `fast` | Pattern matching, diffs, semantic comparison, gaming detection, low-stakes judgment | Return ≤1,500 tokens |
   | `capable` | Code generation, test authoring, behavioral reasoning, spec compliance review | Return ≤2,000 tokens (implementers), ≤1,500 tokens (reviewers). Include self-check. |
   | `reasoning` | Architecture review, cross-cutting analysis, highest-stakes quality judgment | Prepend `ultrathink`. Return ≤1,500 tokens. Include self-check. |

7. **When** a skill dispatches a subagent **then** the prompt includes a return size constraint appropriate to the role: reviewer subagents ≤1,500 tokens, implementer subagents ≤2,000 tokens. This prevents context pollution when results return to the coordinator.

8. **When** a skill dispatches a `reasoning`-tier subagent **then** the prompt begins with the `ultrathink` keyword to activate extended thinking for deep architectural or quality assessment reasoning.

9. **When** a skill dispatches a reviewer subagent **then** the prompt includes a "Before Finalizing" self-check section tailored to the reviewer's scope, instructing the reviewer to verify findings are grounded and not invented.

10. **When** a skill dispatches an implementer subagent **then** the prompt includes a scope discipline instruction preventing out-of-scope refactoring: the subagent should only make changes directly required by the task and note other improvements in a Concerns section.

### Postconditions

- Every subagent dispatch uses a model ID resolved from `platform-context.yaml` or a documented fallback
- No SKILL.md file contains a hardcoded model name (e.g., `claude-sonnet-4-6`, `gpt-4o`)
- Changing the provider requires editing only `platform-context.yaml`, not any skill file

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `model_tiers` key missing entirely | Use hardcoded defaults, log advisory once per session | Warning (non-blocking) |
| Tier key present but value empty | Fall back to `capable` tier value | Warning (non-blocking) |
| `platform-context.yaml` unreadable | Use hardcoded defaults, log warning | Warning (non-blocking) |
| Unknown tier name referenced in skill | Treat as `capable`, log warning | Warning (non-blocking) |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because model tier resolution is a read of a local YAML file, requiring no external SDK or API call. The fallback is hardcoded strings — zero dependencies.
- **Principle:** "Skills are primarily markdown" — Applies because tier names in SKILL.md are instructions to Claude, not executable code. The resolution logic is a read step in the skill's instructions, not a compiled helper.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| implementation | High | `adev:implement` dispatches 3+ subagents per task. Each dispatch must specify tier. Implementer = `capable`, spec reviewer = `capable`, code quality reviewer = `capable`, visual verifier = `capable` |
| adev:write-test | High | RED phase authoring = `capable`, verify mode = `fast`, gaming judgment = `fast` |
| validation | Medium | `adev:eval` LLM-as-judge dispatch = `reasoning`. `adev:validate` dispatches = `capable` |
| assessment | Medium | `adev:review-specs` dispatches structural architect = `reasoning`, security reviewer = `capable`, consistency analyzer = `fast` |
| design | Low | `adev:brainstorm` charter reviewer = `capable` |

## Integration Points

1. **All skills → `platform-context.yaml`:** Every skill that dispatches subagents reads `model_tiers` as its first step. This is the single resolution point — no other file is consulted for model IDs.

2. **`/adev:init` → `templates/platform-context.yaml`:** The template scaffolds the `model_tiers` section with blank values. Existing projects that upgrade can add the section manually.

3. **`adev:write-test` → model-routing:** `adev:write-test` is the primary beneficiary. Its per-phase tier assignments (`capable` for RED, `fast` for verify) are the canonical example of how to document tier usage in a skill.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `templates/platform-context.yaml` | Add `model_tiers` section with blank values and inline comments explaining each tier | Small |
| Update `adev:implement` SKILL.md | Replace any model references with tier names. Add model tier resolution step to Step 1 (Load Context) | Small |
| Update `adev:eval` SKILL.md | Replace model reference in Layer 3 LLM-as-Judge dispatch with `reasoning` tier | Small |
| Update `adev:review-specs` SKILL.md | Add tier annotations to specialist subagent dispatches | Small |
| Update `adev:brainstorm` SKILL.md | Add tier annotation to charter reviewer dispatch | Small |
| Document resolution fallback | Add fallback table and advisory log behavior to each updated skill | Small |

## Acceptance Criteria

- [ ] `templates/platform-context.yaml` contains `model_tiers` with `fast`, `capable`, and `reasoning` keys, blank values, and explanatory comments
- [ ] No SKILL.md file in `skills/` contains a hardcoded model ID (e.g., `claude-sonnet-4-6`, `gpt-4o`, `gemini`)
- [ ] `adev:implement` SKILL.md reads `model_tiers` in its Load Context step
- [ ] `adev:eval` SKILL.md Layer 3 dispatch references `reasoning` tier, not a model name
- [ ] `adev:review-specs` SKILL.md dispatches reference tier names
- [ ] Each skill's fallback behavior (missing `model_tiers`) is documented in the skill
- [ ] Every reviewer subagent prompt contains a "Before Finalizing" self-check section
- [ ] Every implementer subagent prompt contains a scope discipline instruction
- [ ] Every `reasoning`-tier dispatch prepends `ultrathink`
- [ ] Every subagent prompt specifies a return size constraint
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced

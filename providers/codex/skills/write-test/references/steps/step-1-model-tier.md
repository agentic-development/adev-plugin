## Step 1: Model Tier Resolution

Before any subagent dispatch, read `model_tiers` from `.context-index/platform-context.yaml`:

```yaml
model_tiers:
  fast:      # low-stakes: pattern matching, diffs, semantic comparison, gaming detection
  capable:   # high-stakes: code generation, test authoring, behavioral reasoning
  reasoning: # highest-stakes: architecture review, cross-cutting analysis
```

**Tier assignments for this skill:**
- RED phase test authoring subagent → `capable` tier
- `--verify` semantic diff subagent → `fast` tier
- Gaming violation judgment subagent (edge cases) → `fast` tier

**Fallback behavior** (when `model_tiers` is absent or a tier value is empty):

The canonical hardcoded defaults for each tier are defined in `.context-index/specs/cross-cutting/model-routing.md`. Do not hardcode model names in this file. When a tier is unset:
- Resolution order: tier-specific value → `capable` value → hardcoded default from the model-routing spec.

Log a one-time advisory when fallback is active: "model_tiers not configured in platform-context.yaml — using hardcoded defaults. See .context-index/specs/cross-cutting/model-routing.md for default values."

**This skill never contains hardcoded model names.** Use only tier names (`fast`, `capable`, `reasoning`) in all subagent dispatch instructions.

---

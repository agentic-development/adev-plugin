## Step 6: Plan Review Loop

After writing the complete plan, dispatch a plan-reviewer subagent.



**Dispatch the reviewer** (`capable` tier — read from `model_tiers` in `.context-index/platform-context.yaml`; fall back to hardcoded defaults from `.context-index/specs/cross-cutting/model-routing.md` if unset). Dispatch the subagent with `Agent({description, prompt, run_in_background: false})` and nothing else:
```
Agent({
  description: "Review implementation plan",
  prompt: `
    <content of <ADEV_ROOT>/skills/plan/references/plan-reviewer-prompt.md>

    ---

    ## Constitution
    <constitution content>

    ## Parent Charter
    <charter content>

    ## Live Spec
    <spec content>

    ## Implementation Plan
    <the plan just written>
  `,
  run_in_background: false,
})
```

Provide: the plan document, the Live Spec, the parent charter, and the constitution. Do not pass session history.

**If the reviewer returns "Issues Found":**
1. Read the issues.
2. Fix them in the plan (same agent that wrote the plan fixes it, preserving context).
3. Re-dispatch the reviewer with the updated plan.
4. Maximum 3 iterations. If the loop exceeds 3 iterations, present the remaining issues to the user for guidance.

**If the reviewer returns "Approved":**
Proceed to the execution handoff.

**Disagreements:** If you believe reviewer feedback is incorrect (e.g., flagging something that is intentionally designed that way based on the spec or ADR), explain your reasoning in the plan as a comment and do not change it. The reviewer is advisory.

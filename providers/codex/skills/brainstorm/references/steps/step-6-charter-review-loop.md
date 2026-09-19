## Step 6: Charter Review Loop

Dispatch a charter-reviewer subagent to validate the written charter.

**Tier:** `capable` — read from `model_tiers` in `.context-index/platform-context.yaml`. Fall back to the hardcoded default in `.context-index/specs/cross-cutting/model-routing.md` if unset, and log a one-time advisory.



**Subagent dispatch:** dispatch the subagent with `Agent({description, prompt, run_in_background: false})` and nothing else.

```
Agent({
  description: "Review feature charter for completeness and consistency",
  prompt: `
    You are a Feature Charter reviewer for the Agentic Development Framework.

    **Charter to review:** [CHARTER_FILE_PATH]
    **Constitution:** [Paste .context-index/constitution.md]
    **Platform context:** [Paste .context-index/platform-context.yaml]
    **Existing charters:** [Paste file path + Business Intent + Scope for each, or "None"]
    **ADRs:** [Paste file path + decision summary for each, or "None"]

    ## Review Checklist
    - [ ] All 6 sections present and non-empty (Business Intent, Scope, Domain Model, Capabilities, Interfaces, Quality Attributes)
    - [ ] No TODOs, placeholders, "TBD", or "..." remaining; every table has real rows
    - [ ] Business Intent is clear enough to understand the module from this section alone
    - [ ] In Scope / Out of Scope are specific enough to resolve ownership disputes — not vague like "handles user stuff"
    - [ ] Domain Model entities have concrete attributes, not just names; invariants are testable statements, not aspirational goals
    - [ ] Capabilities are distinct, decomposable into Live Specs, with priorities assigned
    - [ ] Every exposed API has type and description; consumed APIs reference real modules
    - [ ] No conflicts with constitution Non-Negotiable Principles OR Architecture Boundaries
    - [ ] No capability/entity/interface overlaps with other charters
    - [ ] Design is compatible with platform-context.yaml tech stack

    ## Calibration
    Only flag issues that would cause real problems during specification or implementation.
    A missing section, a contradiction with the constitution, or an overlap with another charter are issues.
    Minor wording improvements and stylistic preferences are not issues.
    Approve unless there are structural gaps or compliance violations.

    Before finalizing, verify: (1) every flagged issue would cause a real problem
    during specification, (2) no issue is a stylistic preference.

    Keep the response under 1,500 tokens. Focus on issues, not restating the charter.

    ## Output Format
    ## Charter Review
    **Status:** Approved | Issues Found
    **Issues (if any):**
    - [Section]: [specific issue] — [why it matters]
    **Recommendations (advisory, do not block approval):**
    - [suggestions]
  `,
  run_in_background: false,
})
```

**Handling review results:**

- **Approved:** Proceed to Step 7.
- **Issues Found:** Fix each issue, re-dispatch reviewer. Only escalate to user if fixing requires an unmade design decision.
- **After 2 iterations without approval:** Present remaining issues to user. Ask: fix together, accept as-is, or abandon.

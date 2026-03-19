# Charter Reviewer Prompt Template

Use this template when dispatching a charter-reviewer subagent in Step 6 of `/adev-brainstorm`.

**Purpose:** Verify the Feature Charter is structurally complete, constitutionally compliant, and consistent with existing charters and ADRs.

**Dispatch after:** Charter is written to `.context-index/specs/features/<module>/charter.md`

```
Task tool (general-purpose):
  description: "Review feature charter for completeness and consistency"
  prompt: |
    You are a Feature Charter reviewer for the Agentic Development Framework.

    **Charter to review:** [CHARTER_FILE_PATH]
    **Constitution:** [Read and paste the full content of .context-index/constitution.md]
    **Platform context:** [Read and paste the full content of .context-index/platform-context.yaml]
    **Existing charters:** [For each existing charter, paste its file path and Business Intent + Scope sections. If there are no other charters, state "No other charters exist."]
    **ADRs:** [For each ADR, paste its file path and decision summary. If there are no ADRs, state "No ADRs exist."]

    ## What to Check

    | Category | What to Look For |
    |----------|------------------|
    | Structure | All 6 required sections present and non-empty: Business Intent, Scope and Boundaries, Domain Model, Capability Map, Interface Contracts, Quality Attributes |
    | Completeness | No TODOs, placeholders, "TBD", or "..." remaining. Every table has at least one real row. |
    | Business Intent | Clear, specific, 2-3 sentences. If you cannot tell what the module does from this section alone, it fails. |
    | Scope Clarity | In Scope and Out of Scope are specific enough to resolve ownership disputes. Not vague like "handles user stuff." |
    | Domain Model | Entities have concrete attributes, not just names. Invariants are testable statements, not aspirational goals. |
    | Capability Map | Each capability is distinct and decomposable into a Live Spec. Priorities are assigned. |
    | Interface Contracts | Every exposed API has a type and description. Consumed APIs reference real modules. |
    | Constitution Compliance | No capability or design decision conflicts with Non-Negotiable Principles or Architecture Boundaries in the constitution. |
    | Cross-Charter Consistency | No capability overlaps with other charters' In Scope lists. No entity duplicates another charter's Domain Model. Interface contracts are compatible with existing charters' exposed APIs. |
    | Platform Fit | Design decisions are compatible with the tech stack in platform-context.yaml. No implicit technology additions. |

    ## Calibration

    Only flag issues that would cause real problems during specification or implementation.
    A missing section, a contradiction with the constitution, or an overlap with another charter are issues.
    Minor wording improvements and stylistic preferences are not issues.

    Approve unless there are structural gaps or compliance violations.

    ## Output Format

    ## Charter Review

    **Status:** Approved | Issues Found

    **Issues (if any):**
    - [Section]: [specific issue] — [why it matters]

    **Recommendations (advisory, do not block approval):**
    - [suggestions for improvement]
```

**Reviewer returns:** Status (Approved or Issues Found), Issues (if any), Recommendations (advisory).

**Loop rules:**
- If Issues Found: fix the issues in the charter, then re-dispatch with updated content.
- If the loop exceeds 3 iterations without approval, surface remaining issues to the user.
- Do not ask the user about issues you can fix yourself (structural fixes, missing details that were discussed during brainstorming). Only escalate design decisions.

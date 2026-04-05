# Test Scenario: adev:brainstorm

You are a Claude Code agent running the adev:brainstorm skill. Execute the skill for the test case below.

## Test Case

Brainstorm a new "skill-metrics" module for the adev-plugin project. This module would track token usage per skill invocation, measure skill effectiveness over time, and help users identify which skills are consuming the most tokens.

## Simulated User Responses

When you would ask the user a question, simulate the following responses in order:

1. **Problem clarification:** "Users are hitting Claude session rate limits. They need visibility into which skills cost the most tokens so they can optimize or compress them."
2. **Scope question:** "Just tracking and reporting. No automatic optimization — that is a separate module."
3. **Key entities:** "SkillInvocation (skill name, timestamp, token count, session ID), SkillReport (aggregated metrics per skill)"
4. **Approach selection:** "Option 1 — the file-based approach. Keep it simple, no external deps."
5. **Business Intent approval:** "Yes, looks right"
6. **Scope and Boundaries approval:** "Yes"
7. **Domain Model approval:** "Yes"
8. **Capability Map approval:** "Yes"
9. **Interface Contracts approval:** "Yes"
10. **Quality Attributes approval:** "Yes"

## Project Context

The project has these files available:

**Constitution** (at .context-index/constitution.md):
- Identity: adev-plugin is a Claude Code plugin and zero-dependency CLI
- Non-Negotiable Principles: minimize external deps, skills are markdown, pure ESM, hook protocol compliance, version parity
- Coding Standards: JavaScript ESM, Node.js, npm

**Existing Feature Charters:**
- cli: CLI for installing and managing the plugin
- hooks: Session-start, pre/post tool-use hooks
- setup: adev:init and adev:sync skills
- design: adev:brainstorm skill
- assessment: adev:review-specs skill
- planning: adev:plan skill
- implementation: adev:implement skill
- validation: adev:validate skill
- maintenance: adev:hygiene, adev:repomap, adev:retro skills

**Platform Context:**
- Runtime: Node.js
- Language: JavaScript (ESM)
- No external dependencies allowed without ADR

## Instructions

Execute the adev:brainstorm skill completely. Show:
1. Context exploration summary
2. Clarifying questions (one at a time, using simulated responses)
3. 2-3 approach proposals with trade-offs and constitution compliance
4. Each charter section (4a-4f) presented for approval
5. The complete charter file content you would write
6. Charter review dispatch
7. Transition to /adev:specify

Output everything as if executing the skill for real, simulating user responses as specified above.

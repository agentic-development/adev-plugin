### Step 3: Diagnose

Classify the root cause into one of six categories. Each category has a distinct corrective action (Step 4), so accurate classification matters.

#### Category 1: MISSING_CONTEXT

The subagent lacked information that exists somewhere in `.context-index/` but was not included in its prompt.

**Indicators:**
- Subagent reported NEEDS_CONTEXT with a specific question
- The answer to the question exists in an ADR, charter, cross-cutting spec, golden sample, or orientation doc
- The context packet did not include the relevant file

**Example:** Subagent asked "How should authentication be handled?" but the auth cross-cutting spec was not in its context packet.

#### Category 2: AMBIGUOUS_SPEC

The spec language is unclear or acceptance criteria are vague, leaving the subagent unable to determine the correct implementation.

**Indicators:**
- Subagent reported DONE_WITH_CONCERNS or BLOCKED citing "unclear requirement"
- Acceptance criteria use words like "appropriate," "should handle," or "as needed" without specific definitions
- Multiple valid interpretations exist for a requirement

**Example:** Spec says "handle errors appropriately" but does not define the error response shape, status codes, or logging expectations.

#### Category 3: CONSTRAINT_CONFLICT

Two constitutional principles, spec requirements, or architectural decisions contradict each other. The subagent cannot satisfy both.

**Indicators:**
- Subagent attempted implementation but flagged a contradiction
- Two requirements point to incompatible approaches (e.g., "use server components" + "add client-side interactivity")
- An ADR decision conflicts with a spec requirement

**Example:** Constitution says "no direct database access from API routes" but the spec requires a query that the existing data layer does not support.

#### Category 4: NOVEL_PROBLEM

No golden sample, established pattern, or prior implementation covers this case. The subagent has no reference for how to approach the problem in this project's style.

**Indicators:**
- Subagent reported NEEDS_CONTEXT but the context does not exist anywhere
- The task involves a technology, pattern, or integration not previously used in the project
- No specialist pattern matches the task's domain

**Example:** First-ever WebSocket implementation in a project that has only done REST APIs.

#### Category 5: TOOL_FAILURE

An external tool (test runner, linter, build tool, package manager) failed, preventing the subagent from completing its TDD cycle or verifying its work.

**Indicators:**
- Subagent reported BLOCKED with a command error
- Error output shows a tool crash, missing dependency, or configuration issue
- The failure is not in the subagent's code but in the tooling environment

**Example:** `npm run test` fails with "Cannot find module '@prisma/client'" because `prisma generate` was not run after a schema change.

#### Category 6: BUDGET_EXHAUSTION

The task is too large or complex for a single subagent dispatch. The subagent ran out of context window or hit iteration limits before completing all requirements.

**Indicators:**
- Subagent reported DONE_WITH_CONCERNS but only completed part of the task
- The task has 10+ acceptance criteria or touches 8+ files
- The subagent's output was truncated or it reported running out of space

**Example:** A task that requires implementing 5 API endpoints, their tests, and their client-side consumers in a single dispatch.

#### Present Diagnosis

```
## Diagnosis

**Root Cause:** MISSING_CONTEXT
**Confidence:** High

**Evidence:**
- Subagent asked: "What error response shape should I use for validation errors?"
- Answer exists in: .context-index/specs/cross-cutting/error-handling.md (Section: Validation Errors)
- This file was NOT included in the task's context packet.

**Proposed corrective action:** Add error-handling.md to the context packet and re-dispatch.

Is this diagnosis correct? (y/n/adjust)
```

Wait for user confirmation. If the user says "n" or provides a different diagnosis, update the classification. If the user says "adjust," refine based on their input.

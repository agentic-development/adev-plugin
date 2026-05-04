---
name: adev:recover
description: "Structured diagnosis-correction-resume cycle when agents get stuck during implementation. Classifies root causes into six categories, injects corrective context, and re-dispatches with enriched prompts. Writes recovery records for retrospective analysis. Use when a subagent is stuck, a task has stalled, an agent failed mid-execution, or the user reports 'the agent is looping' or 'it is not making progress'. In Codex, invoke with $adev:recover"
---

# Agent Recovery Workflow

When a subagent gets stuck during `/adev:implement`, this skill provides a structured diagnosis, corrective injection, and resume cycle. Instead of blindly retrying or escalating to the user with vague "it did not work" messages, this skill classifies the root cause, applies the targeted fix, and re-dispatches with enriched context.

## Arguments

- `--task <N>`: recover a specific stuck task (references task number from the active plan)
- `--blocker <path>`: recover from a specific blocker file in `.context-index/hygiene/blockers/`
- No arguments: interactive mode (check for recent blockers or ask which task is stuck)
- `--no-infra`: skip infrastructure preflight checks (user-only — the agent must never set this flag)

## Prerequisites

The project must have `.context-index/` initialized with `constitution.md` and `manifest.yaml`. An active implementation plan should exist (produced by `/adev:plan`). If no plan is found, ask the user for the plan path.

## Process

**Announce at start:**
```
Starting agent recovery workflow.
Mode: [task N | blocker <path> | interactive]
```

### Step 1: Detect

Identify the stall point. The goal is to understand exactly where and why progress stopped.

#### With `--task <N>`

1. Find the active plan. Look for the most recent plan file in `.context-index/specs/features/` or ask the user for the path.
2. Load task N from the plan. Extract the task title, description, file list, dependencies, and specialist routing.
3. Check if a blocker file exists at `.context-index/hygiene/blockers/` for this task.
4. Check if a subagent report exists (from the last `/adev:implement` run). Look for status BLOCKED or NEEDS_CONTEXT in the report.

#### With `--blocker <path>`

1. Read the blocker file at the specified path.
2. Extract the task reference, error description, and any file references from the blocker.
3. Locate the corresponding plan and task entry.

#### Interactive (no arguments)

1. Scan `.context-index/hygiene/blockers/` for blocker files created in the last 7 days. Sort by date descending.
2. If blockers exist, present them:
   ```
   Recent blockers found:

   1. 2026-03-18-user-profile-api.md — BLOCKED: missing auth context
   2. 2026-03-17-payment-webhook.md — NEEDS_CONTEXT: Stripe event schema

   Select a blocker to investigate, or describe which task is stuck.
   ```
3. If no blockers exist, ask the user: "Which task is stuck? Provide a task number from the plan or describe the problem."

### Step 1.5: Infrastructure Preflight

After detecting the stall point, check whether the relevant spec or plan declares `infra_requirements`. If so, run the infrastructure preflight. This step always runs when `infra_requirements` are present — recovery must verify infrastructure state before gathering evidence, since infrastructure failure may be the root cause.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Spec/plan resolution:** Use the plan and spec identified in Step 1 (Detect). The plan path comes from the active plan or `--task` resolution. The spec path comes from the plan's `Spec:` header.

**Invocation:** Run inline Node.js:

```bash
node --input-type=module -e "
import { runPreflight, formatPreflightReport } from '<ADEV_ROOT>/lib/infra-preflight.mjs';
const report = await runPreflight('<specPath>', '<planPath>', { timeout: 10, noInfra: <noInfra> });
console.log(JSON.stringify(report));
"
```

Where `<ADEV_ROOT>` is the resolved absolute plugin root path.

If `report.passed === false`, display the formatted report and block:

```
Infrastructure Preflight: FAILED

<formatted report output>

Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `report.passed === true` and `report.skipped === false`, proceed silently.

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

**Infrastructure-related recovery context:** When the recovery skill classifies the root cause as infrastructure-related (e.g., TOOL_FAILURE caused by unreachable services, missing credentials, or connection failures), include the formatted preflight report (from `formatPreflightReport()`, not the raw object) in the corrective context injected into the re-dispatched subagent. This gives the subagent awareness of current infrastructure state.

### Step 2: Gather Evidence

Collect every piece of context relevant to the stuck task. The goal is to see exactly what the subagent saw (and what it did not see).

1. **Context packet.** Read `.context-index/packets/<task-slug>.md` if it exists. This is the pre-composed context that was sent to the subagent. If no context packet exists, reconstruct what context the subagent likely received by reading the plan's `context_packet` section for the task.
2. **Subagent report.** Read the last subagent output for this task. Look for the status code (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED), the "Missing context" or "Blocker" sections, and any error output.
3. **Plan entry.** Re-read the full task entry from the plan, including dependencies, specialist routing, and file lists.
4. **Spec.** Read the Live Spec referenced by the plan. Focus on the acceptance criteria relevant to this task.
5. **Error output.** If the subagent reported a tool failure, read any error logs, test output, or build output it referenced.
6. **Git state.** Check `git status` and `git diff` to see what the subagent changed (if anything) before getting stuck.

Print a summary of evidence gathered:
```
Evidence collected:
- Context packet: [found | reconstructed | missing]
- Subagent report: [found with status BLOCKED | found with status NEEDS_CONTEXT | not found]
- Plan task: Task 3 — "Implement user profile API endpoint"
- Spec: .context-index/specs/features/users/user-profile-spec.md
- Error output: [found | none]
- Git changes: [N files modified | no changes]
```

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

### Step 4: Inject Corrective Context

Based on the confirmed root cause category, generate the targeted fix.

#### For MISSING_CONTEXT

1. Identify the specific file(s) the subagent needed.
2. If a context packet file exists at `.context-index/packets/<task-slug>.md`, add the missing file references to it.
3. If no context packet exists, create one listing all context the task needs (original context plus the missing files).
4. Print what was added and why.

#### For AMBIGUOUS_SPEC

1. Identify the ambiguous acceptance criteria.
2. Draft a clarification addendum with specific, testable language. For example, replace "handle errors appropriately" with "Return HTTP 422 with `{ error: string, field: string }` body for validation errors."
3. Present the addendum to the user for confirmation.
4. Once confirmed, append the clarification to the spec as a "Clarifications" section (or update the existing one).

#### For CONSTRAINT_CONFLICT

1. Surface both conflicting requirements with their sources (spec section, constitution principle, ADR number).
2. Present the conflict clearly:
   ```
   Conflict detected:
   - Constitution (Architecture Boundaries): "No direct database queries in API routes"
   - Spec (AC-3): "Query user preferences with custom filter not supported by data layer"

   Options:
   A. Update the data layer to support the filter (stays within constitution)
   B. Grant a one-time exception in the spec with an ADR documenting why
   C. Modify the spec requirement to use existing data layer capabilities
   ```
3. Wait for user resolution. Record the decision.

#### For NOVEL_PROBLEM

1. Check if a golden sample should be created for this pattern. If the pattern will recur, recommend running `/adev:sample --from <reference-file>` after implementation to capture the pattern.
2. If no reference exists anywhere, draft a one-time implementation guide:
   - Research the framework or library documentation (if accessible)
   - Define the expected file structure, naming conventions, and integration points based on the constitution
   - Write a mini-spec for the novel pattern: inputs, outputs, error handling, test approach
3. Add the implementation guide to the context packet.

#### For TOOL_FAILURE

1. Diagnose the specific tool error from the error output.
2. Suggest the fix:
   - Missing dependency: `npm install <package>` or `prisma generate`
   - Configuration error: identify the misconfigured file and suggest the fix
   - Environment issue: suggest environment variable, PATH update, or version change
3. If the fix can be applied automatically (e.g., running a command), offer to run it. Wait for user confirmation.
4. Verify the fix by re-running the failing command.

#### For BUDGET_EXHAUSTION

1. Analyze the task size. Count acceptance criteria, files to create/modify, and estimated complexity.
2. Propose a task split. Break the task into 2-4 subtasks, each with:
   - A subset of the acceptance criteria
   - A subset of the files
   - Clear boundaries (each subtask is independently testable)
3. Present the split to the user:
   ```
   Task 3 is too large for a single dispatch. Proposed split:

   Task 3a: "Implement user profile GET endpoint" (AC-1, AC-2)
     Files: src/app/api/users/[id]/route.ts, tests/api/users.test.ts

   Task 3b: "Implement user profile UPDATE endpoint" (AC-3, AC-4)
     Files: src/app/api/users/[id]/route.ts (extend), tests/api/users.test.ts (extend)

   Task 3c: "Implement user avatar upload" (AC-5, AC-6)
     Files: src/app/api/users/[id]/avatar/route.ts, tests/api/users-avatar.test.ts

   Update the plan with this split? (y/n)
   ```
4. If confirmed, update the plan file with the new subtasks.

### Step 5: Resume

Re-dispatch the implementation with the enriched context.

1. Summarize the corrective action taken.
2. If the fix involved updating a context packet, spec, or plan, verify the changes are saved.
3. Suggest the next command. **Persona adaptation:** Adapt the chat summary to the active persona's output rules.
   ```
   Corrective context injected. Ready to resume.

   Next step: /adev:implement <plan-path> --task <N>
   ```
4. If the plan was split (BUDGET_EXHAUSTION), suggest running the first subtask:
   ```
   Plan updated with split tasks. Resume with:

   /adev:implement <plan-path> --task 3a
   ```

### Step 6: Enrich

Write a recovery record for retrospective analysis. This feeds into `/adev:hygiene` and `/adev:retro`.

1. Create `.context-index/hygiene/recoveries/` directory if it does not exist.
2. Write the recovery record to `.context-index/hygiene/recoveries/<date>-<task-slug>.md` using the format below.
3. Print confirmation:
   ```
   Recovery record saved: .context-index/hygiene/recoveries/2026-03-19-user-profile-api.md
   Root cause: MISSING_CONTEXT
   Outcome: resolved
   ```

#### Recovery Record Format

```markdown
# Recovery Record: <task-slug>

> **Date:** YYYY-MM-DD
> **Task:** <task reference from plan>
> **Root Cause:** MISSING_CONTEXT | AMBIGUOUS_SPEC | CONSTRAINT_CONFLICT | NOVEL_PROBLEM | TOOL_FAILURE | BUDGET_EXHAUSTION
> **Time to Recovery:** <minutes from start of /adev:recover to resume>
> **Outcome:** resolved | escalated | deferred

## Diagnosis

<What was found. Evidence that led to the root cause classification.>

## Corrective Action

<What was done. Files modified, context added, spec clarified, task split, etc.>

## Prevention

<What should change to prevent recurrence. Spec update, sample addition, constitution clarification, context packet improvement, etc.>
```

### Step 7: Extract Heuristic

After the recovery record is written in Step 6, extract a transferable heuristic from the root-cause diagnosis via `lib/heuristics.mjs`. This step is non-blocking — extraction failures log a warning and allow `/adev:recover` to exit normally.

#### Category Templates

Map the confirmed diagnosis category to the heuristic's `pattern` and `antiPattern` fields using the table below.

- **MISSING_CONTEXT** — `pattern`: the context that should be included in future packets for similar tasks. `antiPattern`: the assumption that failed. Distill, do not quote verbatim.
- **AMBIGUOUS_SPEC** — `pattern`: the language clarification needed. `antiPattern`: paraphrased version of the ambiguous spec phrase — NEVER quote verbatim (avoids capturing credentials or env-specific strings).
- **CONSTRAINT_CONFLICT** — `pattern`: the constraint ordering or precedence rule. `antiPattern`: the conflict that triggered the failure.
- **NOVEL_PROBLEM** — `pattern`: the new pattern or tool introduced. `antiPattern`: empty (leave unset).
- **TOOL_FAILURE** — `pattern`: the pre-flight check or setup that prevents the failure. `antiPattern`: the tool state that caused the crash.
- **BUDGET_EXHAUSTION** — `pattern`: the task-splitting rule that should have been applied. `antiPattern`: the task-size signal that was missed.

> **Warning:** Distill, do not quote verbatim. Raw source-document content (especially from AMBIGUOUS_SPEC) may contain credentials, API keys, or environment-specific strings that must not land in git-tracked heuristic files.

#### Scope Derivation Rule

Derive the heuristic `scope` from the active plan path:

1. Read the active plan path from `.context-index/hygiene/.active-plan` or the recover invocation's `--task` argument.
2. Split the path on `/` and find the segment immediately after `features/`.
3. Apply `path.basename()` to strip any traversal sequences.
4. Check the result against `manifest.yaml` `modules[].slug`.
5. If the normalized segment matches a known module slug, use it as `scope`.
6. Otherwise, fall back to `_global`.

Worked example: `.context-index/specs/features/hooks/*.plan.md` → `hooks` (matches a module slug). `.context-index/specs/features/unknown/*.plan.md` → `_global` (fallback).

#### Title Derivation Rule

Compose the heuristic `title` as `"<category-label>: <short-summary>"` where:

- `<category-label>` is one of: `"Missing context"`, `"Ambiguous spec"`, `"Constraint conflict"`, `"Novel problem"`, `"Tool failure"`, `"Budget exhaustion"`.
- `<short-summary>` is a distilled 5-10 word summary of the root cause (generalized, not verbatim).
- Total title length must not exceed 120 characters (matches the heuristic schema cap).

#### ID Derivation Rule

Compose the heuristic `id` as `<category-slug>-<hash>` where:

- `<category-slug>` is the lowercased diagnosis category with underscores replaced by hyphens (e.g., `missing-context`, `tool-failure`).
- `<hash>` is the first 8 characters of the lowercase hex SHA-256 of the normalized root-cause text.
- **Normalization:** lowercase, collapse consecutive whitespace to single spaces, strip leading/trailing whitespace, strip punctuation except `-` and `_`.
- The resulting id must match `/^[_a-z0-9][_a-z0-9-]{0,63}$/`.
- Purpose: recurrence detection — the same normalized root cause produces the same id across `/adev:recover` invocations, triggering the helper's auto-promotion path.

Worked example: `MISSING_CONTEXT` + "Error: cache miss on third-party API" → normalized to `error cache miss on third-party api` → SHA-256 prefix `a1b2c3d4` → id `missing-context-a1b2c3d4`.

#### projectRoot Resolution

- Walk up from `process.cwd()` to find the nearest `.context-index/` directory — that is the project root.
- Fallback to `process.env.CLAUDE_PROJECT_ROOT` if the walk-up finds nothing.
- This matches the convention used by `lib/execution-state.mjs`.

#### Contradiction Scan (before write)

Before writing the new heuristic, scan for semantic contradictions with existing heuristics:

1. Read existing heuristics for the target scope: call `readHeuristics(projectRoot, { module: scope })` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`, where `<ADEV_ROOT>` is the resolved plugin root).
2. For each existing entry, compare semantically: does the new heuristic's `pattern` directly conflict with an existing entry's `antiPattern`, or does the new heuristic's `antiPattern` conflict with an existing entry's `pattern`?
3. If a semantic contradiction is detected, call `addContradiction(projectRoot, existingId, { path: '<recovery-record-path>', date: '<today>', source: 'recovery' })` before writing the new heuristic. Wrap in try/catch — if `addContradiction` throws (e.g., `HEURISTICS_NOT_FOUND` because the entry was archived between read and write), log a warning and proceed.
4. If no contradiction is detected, proceed directly to writeHeuristic.

This is a best-effort semantic comparison performed by you (the agent), not a programmatic string match. When in doubt, do not record a contradiction — `/adev:retro` consolidation is the backstop for missed contradictions.

#### Inline Node Invocation

Run the extraction via an inline Node invocation that imports `writeHeuristic` from the adev plugin's `lib/heuristics.mjs`, builds the entry using the derivation rules above, and wraps the call in `try`/`catch` so any failure degrades to a stderr warning without blocking the recovery workflow. The `evidence[]` array must contain exactly one entry: `{ source: "recovery", path: "<recovery-record-path>", date: "<today>" }`.

**Plugin root resolution:** The `lib/` directory lives at the adev plugin root, NOT the project root. Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. Replace `<ADEV_ROOT>` below with the resolved absolute path.

On success, print a single confirmation line using the helper's return value (which reflects any auto-promotion):

```
Heuristic extracted: <id> (scope: <scope>, confidence: low)
```

On failure inside `writeHeuristic`, log to stderr and exit code 0 (non-blocking):

```
heuristics: extraction skipped — <error-message>
```

If the helper import itself fails (e.g., `lib/heuristics.mjs` is absent), log once and skip:

```
heuristics: helper unavailable, extraction skipped
```

Concrete invocation:

```bash
node --input-type=module -e "
import { writeHeuristic } from '<ADEV_ROOT>/lib/heuristics.mjs';
try {
  const h = await writeHeuristic(projectRoot, {
    id: 'missing-context-a1b2c3d4',
    scope: 'hooks',
    title: 'Missing context: cache layer assumptions',
    pattern: 'Include cache invalidation docs in context packets for hook tasks',
    antiPattern: 'Assuming cache behavior without reading the cache module',
    confidence: 'low',
    evidence: [{ path: '.context-index/hygiene/recoveries/2026-04-09-cache-task.md', date: '2026-04-09', source: 'recovery' }],
  });
  console.log(\`Heuristic extracted: \${h.id} (scope: \${h.scope}, confidence: \${h.confidence})\`);
} catch (err) {
  process.stderr.write(\`heuristics: extraction skipped — \${err.message}\n\`);
}
"
```

Step 7's last printed output on success must be exactly: `Heuristic extracted: <id> (scope: <scope>, confidence: low)` — or whatever confidence the helper returns after auto-promotion, since the confidence value must come from the `writeHeuristic` return value rather than the caller-supplied input.

## Patterns Across Multiple Recoveries

When writing the recovery record, check for patterns in existing records:

1. Read all files in `.context-index/hygiene/recoveries/`.
2. Count root cause frequency. If the same category appears 3+ times, flag it:
   ```
   Pattern detected: MISSING_CONTEXT has occurred 4 times.

   Recurring missing context:
   - error-handling.md (missing from 3 context packets)
   - auth cross-cutting spec (missing from 2 context packets)

   Recommendation: Add these files as default context in the plan template.
   ```
3. Include the pattern observation in the recovery record's Prevention section.

## Red Flags

**Never:**
- Skip the diagnosis step and jump straight to re-dispatching (guessing wastes more time than diagnosing)
- Modify implementation code during recovery (recovery injects context, it does not write code)
- Re-dispatch without user confirmation of the diagnosis
- Ignore the subagent's own assessment (BLOCKED and NEEDS_CONTEXT reports contain valuable signal)
- Apply the same fix twice without investigating why the first fix did not work
- Skip writing the recovery record (the retrospective data is essential for process improvement)
- Blame the subagent (root causes are always context, spec, or tooling problems, not agent capability problems)

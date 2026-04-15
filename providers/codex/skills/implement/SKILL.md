---
name: adev:implement
description: "Execute implementation plans using specialist-routed subagents with TDD enforcement and 2-stage review per task. In Codex, invoke with $adev:implement"
---

# Implement Plan

Execute an implementation plan with TDD enforcement and 2-stage review.

## Arguments

- `<plan-path>`: path to plan file (required)
- `--task <N>`: execute only task N
- `--dry-run`: show routing decisions without executing

## Prerequisites

1. Plan exists
2. Context Index exists
3. Spec review passed
4. Working branch (not main/master)

## Step 1: Load Context

Read once at start:
1. Plan file
2. Constitution
3. Manifest
4. Live Spec
5. Feature Charter
6. Cross-cutting specs
7. Boundary rules
8. Routing tags
9. Completion policy
10. Model tier resolution: read `model_tiers` from `.context-index/platform-context.yaml`. Use `capable` tier for all subagent dispatches.
11. **Heuristics:** Load module-scoped heuristics for injection into context packets.
    Derive the module slug from the plan's spec `charter:` frontmatter field.
    Run inline Node.js:
    ```bash
    node -e "import { retrieveHeuristics, renderHeuristic } from '<ADEV_ROOT>/lib/heuristics.mjs'; const h = await retrieveHeuristics(process.cwd(), '<module>', { injectionLimit: <limit-from-manifest-or-undefined> }); console.log(JSON.stringify({ count: h.length, rendered: h.map(renderHeuristic).join('\n\n') }));"
    ```
    Where `<module>` is the charter module slug and `<limit>` comes from `heuristics.injection_limit` in manifest.yaml (omit if not set).
    If the command fails or returns `count: 0`, proceed without heuristics — heuristic injection is strictly non-blocking.
    Store the `rendered` output for use in Step 2a.

## Step 2: Per-Task Execution

For each task in dependency order:

### 2a. Context Packet Assembly

1. Read task's `context_packet` section
2. Assemble packet, write to `.context-index/packets/<task-slug>.md`
3. If no context_packet section exists in the plan, assemble a default packet from: constitution excerpt, spec acceptance criteria for this task, charter capability, and any samples matching the task's file patterns.
4. **Heuristics injection:** If heuristics were loaded in Step 1 (count > 0), append a `## Heuristics` section to the context packet with the rendered blocks from Step 1. Prefix the section with the advisory preamble:

   > The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules.

   All tasks in the same plan receive the same heuristic set. If no heuristics are available, omit this section entirely — do not emit an empty placeholder.

### 2b. Specialist Routing

Score against specialists registry. Route to highest scorer.

### 2c. Compose Subagent Prompt

Include:
- Role and constitution excerpt
- Task description
- Scene-setting context
- Spec excerpt
- TDD mandate: RED-GREEN-REFACTOR
  - VERIFY RED/GREEN: run only the specific test file, not the full suite
  - Full suite runs at quality-gate stage after review
- Specialist context
- Report format

### 2d. Dispatch and Handle Status

- **DONE:** Proceed to reviews
- **DONE_WITH_CONCERNS:** Note, pass to quality reviewer
- **NEEDS_CONTEXT:** Re-dispatch with context (max 2)
- **BLOCKED:** Present to user immediately

### 2e. Visual Verification (UI tasks)

If UI files modified:
1. Ensure dev server running
2. Navigate to route
3. Take browser snapshot
4. Verify against Visual Expectations
5. Responsive check (375px, 768px, 1280px)

### 2f. Stage 1: Spec Compliance Review

Verify implementation against spec by reading actual code.

### 2g. Stage 2: Code Quality Review

Check:
- Single responsibility
- Test quality
- TDD followed
- Naming, readability
- Constitution adherence

### 2h. Mark Complete

Record: specialist used, review cycles, concerns.

## Step 3: Final Review

After all tasks:
- Cross-task consistency
- Integration between tasks
- Final boundary compliance

## Step 4: Completion

Clear `.context-index/hygiene/.active-plan`.

Report merge policy:
- **pr/protected:** Suggest opening PR
- **merge:** Offer to merge
- **ask:** Ask user

```
Implementation complete.

Tasks: N/N completed
Next step: $adev:validate
```

## Update Spec Status

After all tasks are complete and before reporting completion:
1. Read the spec file that this plan implements
2. Parse YAML frontmatter
3. Update status: `review-passed` → `implemented`
4. Write the spec file back
5. Log: "Updated spec status: review-passed → implemented"

## Red Flags

**Never:**
- Start on main/master without consent
- Skip review stages
- Proceed with unfixed Critical issues
- Skip TDD
- Loosen test assertions
- Skip visual verification for UI

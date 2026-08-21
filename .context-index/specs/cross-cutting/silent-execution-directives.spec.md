---
mode: cross-cutting
status: review-pending
risk_level: low
revision: 1
created: 2026-05-03
updated: 2026-05-03
affects:
  - implementation
  - validation
  - assessment
  - design
  - planning
  - strategic-planning
  - maintenance
tracker-ref: issue-226
---

# Cross-Cutting Spec: Silent Execution Directives

## Behavioral Contract

### Preconditions

- A SKILL.md file exists for any adev lifecycle skill that may be invoked as a subagent (i.e., dispatched via the Agent tool from a parent orchestrator like `/adev:build` or `/adev:implement`).
- The skill produces a deliverable artifact (plan file, review file, validation report, implementation code, etc.) that is either written to disk or reported back to the parent.

### Behaviors

1. **When** a skill is invoked as a subagent **then** it chains all sequential steps into continuous execution without emitting intermediate commentary, confirmations, or step-by-step narration between tool calls. Only the final result (artifact summary or STEP_RESULT block) is reported.

2. **When** a skill completes a context-loading phase (reading constitution, charter, spec, platform-context) **then** it proceeds immediately to the next substantive step without emitting any summary of what was loaded (e.g., no "I've loaded the constitution. The relevant principles are...").

3. **When** a skill transitions between numbered steps in its SKILL.md protocol **then** it does not announce the transition with narration (e.g., no "Now proceeding to Step 3: Validation" or "Good, moving on to the next phase"). It simply executes.

4. **When** a skill encounters a decision point that does not require user input (e.g., skip conditions, mode detection, gate evaluation) **then** it resolves the decision silently and proceeds without explaining its reasoning in the conversation output.

5. **When** a skill is invoked interactively by the user (NOT as a subagent) **then** the silent execution directive does NOT apply. The skill may provide progress updates, explain its reasoning, and confirm decisions with the user as appropriate for the active persona.

6. **When** multiple files need to be read as part of a skill step **then** the skill uses parallel tool calls (multiple Read/Grep/Glob in a single turn) rather than sequential single-tool turns, reducing total turn count.

### Postconditions

- The skill's deliverable artifact (file on disk or structured result) is identical in quality and completeness regardless of whether the silent directive is active.
- The parent orchestrator receives a structured result block (STEP_RESULT or equivalent) with status, verdict, artifacts list, and summary.
- No intermediate narration tokens appear in the subagent's output history between the first and last tool-using turns.

### Verbose Override

7. **When** the subagent prompt contains `VERBOSE: true` **then** the silent execution directive is disabled and the skill narrates each step as if running interactively. This enables debugging pipeline failures by re-running with `--verbose`.

8. **When** `/adev:build --verbose` or `/adev:implement --verbose` is invoked **then** the orchestrator includes `VERBOSE: true` in all subagent prompts, causing the entire pipeline to run in narrated mode.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Skill encounters a blocking error mid-execution | Report the error in the final STEP_RESULT with status FAILED; do not narrate the error discovery process | N/A |
| Skill requires user input but is running as subagent | Report BLOCKED in STEP_RESULT; do not attempt to simulate user input or narrate the blockage | N/A |
| Skill's silent execution produces an incomplete artifact | Same behavior as non-silent — the quality gates and validation catch this downstream | N/A |

## System Constitution Reference

- **"Skills are primarily markdown"** (Principle 2) — The silent execution directive is implemented as markdown instructions within SKILL.md files, not as code enforcement. It guides agent behavior through written protocol.
- **"Minimize external dependencies"** (Principle 1) — Silent execution reduces token cost with zero new dependencies. It is a behavioral instruction, not infrastructure.
- **"Editing skill markdown content" is Autonomous** (Architecture Boundaries) — Adding execution directives to SKILL.md files falls within the agent's autonomous scope.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| implementation (implement, write-test, debug, recover) | High | Add silent execution preamble to SKILL.md; restructure context-loading steps to use parallel reads |
| validation (validate, eval) | High | Add silent execution preamble; suppress check-by-check narration when running as subagent |
| planning (plan) | High | Add silent execution preamble; batch context-loading reads |
| assessment (review-specs, route, assess) | Medium | Add silent execution preamble; suppress per-reviewer commentary |
| design (brainstorm, specify) | Low | Add silent execution preamble (these are mostly interactive, directive rarely activates) |
| strategic-planning (build, research, issues, status, document) | Medium | Add silent execution preamble to build subagent prompts |
| maintenance (hygiene, repomap, codehealth, sample, retro, reconcile) | Medium | Add silent execution preamble; suppress per-audit-pass narration |

## Integration Points

1. **build orchestrator -> all skills**: The build orchestrator dispatches subagents via the Agent tool. The silent execution directive activates automatically when a skill detects it is running as a subagent (no direct user interaction channel).
2. **implement -> write-test, implementer, reviewers**: Per-task subagents dispatched by implement should all execute silently.
3. **review-specs -> specialist reviewers**: The three reviewer subagents (structural, security, consistency) should execute silently and return only their verdict.

## Directive Text

The following standardized preamble is added to every SKILL.md that may be invoked as a subagent. It is placed immediately after the skill's opening description paragraph (before ## Arguments or ## Prerequisites):

```markdown
## Execution Protocol

**Silent execution (subagent mode):** When this skill is invoked as a subagent (via the Agent tool from a parent orchestrator), execute all steps silently:
- Chain steps continuously without intermediate commentary or narration.
- Do NOT emit confirmations like "Loaded the context" or "Proceeding to step N."
- Do NOT summarize intermediate findings between steps.
- Use parallel tool calls (multiple Read/Grep/Glob in one turn) for context-loading phases.
- Report ONLY the final result in the structured format expected by the parent.

This directive does NOT apply when the skill is invoked interactively by a user.
```

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Add the silent execution preamble to all 28 SKILL.md files that may run as subagents | medium |
| 2 | Identify and annotate context-loading steps in each skill where parallel Read batching applies (mark with "Read these files in a single turn using parallel tool calls") | medium |
| 3 | Update the build orchestrator's subagent prompt template to include a reminder: "Execute silently — no intermediate narration" | small |
| 4 | Update the implement skill's per-task subagent prompt to include the silent execution reminder | small |
| 5 | Verify that skills invoked interactively (user-facing) still produce helpful progress output (no regression on interactive UX) | small |

## Acceptance Criteria

- [ ] AC-1: Every SKILL.md file that may be invoked as a subagent contains the standardized "Execution Protocol" preamble section with the silent execution directive.
- [ ] AC-2: Context-loading steps in the top 6 skills (plan, validate, build, hygiene, implement, specify) include explicit parallel Read batching instructions.
- [ ] AC-3: The build orchestrator's subagent prompt template includes a "silent execution" reminder line.
- [ ] AC-4: The implement skill's per-task subagent dispatch includes a "silent execution" reminder line.
- [ ] AC-5: Skills invoked interactively by a user (not as subagent) continue to provide progress output appropriate to the active persona (no regression).
- [ ] AC-6: All quality gates pass (npm test).
- [ ] AC-7: No constitutional violations introduced.

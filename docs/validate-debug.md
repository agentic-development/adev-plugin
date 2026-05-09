[adev docs](README.md) > Workflow Guides

# Validate & Debug

This phase covers quality assurance and troubleshooting. After implementation, you validate the finished work against specs and quality gates. When things go wrong, you debug systematically with full project context. You can also score implementation quality with graduated evaluations and recover stuck agents.

## Validate

**Skill:** `/adev:validate`

**What it does:** Runs post-implementation validation with 13 ordered checks against specs, constitution, charters, ADRs, quality gates, governance boundaries, and transition gates. Produces a structured PASS/FAIL report with specific file references for every failure. For UI features, includes browser-based visual verification using Playwright.

**When to use it:** After implementation is complete. Validation is the quality gate before a feature can be considered done. It checks everything from spec compliance to lifecycle artifact consistency.

**Prerequisites:** The Live Spec must exist at `implemented` status, and the files referenced in the spec must exist on disk.

**Example invocation:**

```
/adev:validate --spec .context-index/specs/features/auth/login.spec.md
```

Use `--fix` to auto-fix minor issues (lint errors, formatting) before reporting.

**Output:** A structured validation report with PASS/FAIL per check, file references for failures, and a summary verdict.

See the [Skill Reference](skills.md) for full details on the 13 checks and fail-fast behavior.

## Debug

**Skill:** `/adev:debug`

**What it does:** Systematic debugging grounded in project context. Before investigating, it checks ADRs for known issues, specs for expected behavior, and orientation documents for architecture context. Follows a strict "no fixes without root cause investigation first" protocol.

**When to use it:** For any bug, test failure, or unexpected behavior. Use this instead of ad-hoc fixing — it ensures the fix addresses the root cause, not just the symptom.

**Prerequisites:** A failing test, error message, or symptom to investigate.

**Example invocation:**

```
/adev:debug --error "TypeError: Cannot read property 'id' of undefined"
```

You can scope debugging to a specific spec's domain with `--spec <path>`, or apply the fix directly with `--apply`.

**Output:** A root cause analysis with a targeted fix. If the fix touches spec-tracked code, the relevant spec and ADR artifacts are updated.

See the [Skill Reference](skills.md) for full details on the investigation phases and root cause classification.

## Eval

**Skill:** `/adev:eval`

**What it does:** Runs a graduated evaluation harness scoring implementation quality from 0-100 across four layers: deterministic checks, architectural analysis against golden samples, LLM-as-Judge assessment, and human-in-the-loop review. Complements `/adev:validate` with nuanced quality scoring beyond binary pass/fail.

**When to use it:** For quality scoring and benchmarking after validation passes. Useful when you want to measure how good an implementation is, not just whether it meets the minimum bar.

**Prerequisites:** `.context-index/` must be initialized, and `/adev:validate` should have passed first. For the architectural layer, golden samples in `.context-index/samples/` improve scoring accuracy.

**Example invocation:**

```
/adev:eval --spec .context-index/specs/features/auth/login.spec.md
```

Use `--layer <N>` to run only a specific evaluation layer (1-4), or `--configure` for interactive setup.

**Output:** A graduated quality score (0-100) with per-layer breakdowns and improvement recommendations.

See the [Skill Reference](skills.md) for full details on evaluation layers and rubric configuration.

## Recover

**Skill:** `/adev:recover`

**What it does:** Provides a structured diagnosis-correction-resume cycle when agents get stuck during implementation. Classifies root causes into six categories, injects corrective context into the agent's prompt, and re-dispatches with enriched information. Writes recovery records for retrospective analysis.

**When to use it:** When a subagent is stuck, a task has stalled, an agent is looping, or you see "not making progress" during `/adev:implement`. Rather than blindly retrying, recover diagnoses the specific problem and applies a targeted fix.

**Prerequisites:** `.context-index/` must be initialized with `constitution.md` and `manifest.yaml`. An active implementation plan should exist.

**Example invocation:**

```
/adev:recover --task 3
```

You can also recover from a specific blocker file (`--blocker <path>`) or run interactively with no arguments.

**Output:** A recovery record documenting the root cause classification, corrective context injected, and the result of the re-dispatch.

See the [Skill Reference](skills.md) for full details on root cause categories and recovery strategies.

## Next: Maintain

Once your feature is validated, move on to [ongoing maintenance](maintain.md) — tracking issues, auditing context health, running retrospectives, and keeping your project artifacts in sync.

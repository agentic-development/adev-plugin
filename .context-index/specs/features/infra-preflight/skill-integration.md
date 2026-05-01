---
charter: infra-preflight
status: review-pending
risk_level: medium
milestone: 1
revision: 1
charter-revision: 1
created: 2026-05-01
updated: 2026-05-01
---

# Live Spec: Skill Integration

**Capabilities covered:** Skill Integration (Mandatory), Skill Integration (Conditional)

**Capability:** Add an infrastructure preflight step to 7 skills that execute code or tests. Mandatory skills (implement, validate, build, write-test) always run the preflight when `infra_requirements` is present. Conditional skills (debug, eval, recover) run the preflight only when they can locate a relevant spec/plan with `infra_requirements`. All skills accept `--no-infra` as a user-only bypass flag, with `ADEV_NO_INFRA=1` env var as fallback.

> **Dependency:** This spec depends on the sibling spec `verification-runner-and-schema.md` which defines the `runPreflight()` API, `parseInfraRequirements()`, and `formatPreflightReport()` functions in `lib/infra-preflight.mjs`.

## Behavioral Contract

### Preconditions

- `lib/infra-preflight.mjs` exists and exports `runPreflight()`, `parseInfraRequirements()`, and `formatPreflightReport()`
- The skill has a reference to a spec or plan file (directly via arguments, via active plan, or via inference)
- The spec or plan file contains YAML frontmatter (may or may not contain `infra_requirements`)

### Behaviors

---

### Shared Behaviors (apply to all 7 skills)

**1. `--no-infra` flag resolution**

**When** a skill is invoked with `--no-infra` **then** it sets `options.noInfra = true` and passes it to `runPreflight()`, which returns `{ passed: true, systems: [], skipped: true }` without running any checks.

**When** `--no-infra` is not passed but the environment variable `ADEV_NO_INFRA=1` is set **then** the skill treats it as equivalent to `--no-infra` and sets `options.noInfra = true`. Priority: skill argument > env var.

**When** neither `--no-infra` nor `ADEV_NO_INFRA` is set **then** the preflight runs normally.

**When** the agent attempts to set `--no-infra` or `ADEV_NO_INFRA` autonomously **then** the skill must not allow it. The SKILL.md instructions explicitly state: "The `--no-infra` flag and `ADEV_NO_INFRA` env var are user-only controls. The agent must never set, suggest setting, or default these to bypass preflight. If preflight fails, report the failure and wait for user direction."

**2. Preflight invocation**

**When** the skill has resolved its spec/plan path(s) and `infra_requirements` is present in at least one of them **then** it calls `runPreflight(specPath, planPath, options)` via inline Node.js (same pattern as heuristics loading). The call happens after prerequisites are verified but before any code execution, test running, or subagent dispatch.

**When** no `infra_requirements` is found in any resolved spec/plan **then** the preflight step is skipped entirely. No output, no delay, no behavioral change (backward compatible).

**3. Blocking on failure**

**When** `runPreflight()` returns `{ passed: false }` **then** the skill calls `formatPreflightReport(report)` and displays the formatted output, followed by the blocking message. The skill stops execution and does not proceed to any subsequent steps.

**When** `runPreflight()` returns `{ passed: true }` **then** the skill proceeds normally. If `skipped: true`, it emits a one-line advisory: "Infrastructure preflight skipped (--no-infra)."

**4. Lib load failure**

**When** `lib/infra-preflight.mjs` fails to import (module not found, syntax error, etc.) **then** the skill emits a warning: "Infrastructure preflight library could not be loaded: <error>. Pass --no-infra to bypass, or fix the library." The skill blocks execution (does not silently continue without preflight).

---

### Mandatory Skills

#### implement (skills/implement/SKILL.md)

**5. Preflight step placement**

**When** `/adev:implement` runs **then** the preflight step is inserted as a new "Step 0.5: Infrastructure Preflight" after the existing prerequisites (Step 0: Prerequisites — plan exists, context index, spec review passed, working branch) and after Step 1: Load Context (which resolves the spec and plan paths), but before Step 2: Execute Tasks.

**6. Spec and plan path resolution**

**When** the implement skill loads the plan file and its referenced spec **then** it passes both paths to `runPreflight(specPath, planPath, options)`. The plan path is the `<plan-path>` argument. The spec path is extracted from the plan's `Spec:` header field.

**7. Per-task infrastructure hint**

**When** preflight blocks and the plan contains tasks with mixed strategies (some unit, some integration) **then** the blocking message includes:

```
Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
  3. Use --task N to run only tasks that don't need this infrastructure
```

**When** all tasks require the failed infrastructure **then** option 3 is omitted.

#### validate (skills/validate/SKILL.md)

**8. Preflight step placement**

**When** `/adev:validate` runs **then** the preflight step is inserted as a new check before Step 0: Load Check Registry, immediately after the existing prerequisites (context index, spec exists, implementation exists). The spec path is the `--spec <path>` argument. The plan path is the `--plan <path>` argument if provided, otherwise `null`.

**9. Validate-specific blocking message**

**When** preflight blocks during validate **then** the blocking message is:

```
Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

#### build (skills/build/SKILL.md)

**10. No special preflight logic**

**When** `/adev:build` orchestrates implement and validate **then** each sub-skill runs its own preflight independently. Build does not add a separate preflight step. If implement's preflight fails, build reports the failure as a pipeline step failure and stops.

**11. --no-infra passthrough**

**When** `/adev:build` is invoked with `--no-infra` **then** it passes the flag through to the implement and validate invocations. The flag is documented in build's Arguments section.

#### write-test (skills/write-test/SKILL.md)

**12. Preflight step placement**

**When** `/adev:write-test` runs in standalone mode (`--red --spec <path>`) **then** the preflight step is inserted after Step 0: Standalone Pre-flight (framework detection) and after Step 1: Model Tier Resolution, but before Step 2: Strategy Resolution. The spec path is the `--spec <path>` argument. Plan path is `null`.

**When** `/adev:write-test` is dispatched by `/adev:implement` **then** the preflight is not run by write-test (implement already ran it). The skill detects dispatch mode by the absence of standalone pre-flight. No duplicate preflight.

**13. Strategy-aware trigger**

**When** the resolved test strategy is `unit` and no `infra_requirements` is declared in the spec **then** the preflight step is skipped (no external infrastructure needed for unit tests).

---

### Conditional Skills

#### debug (skills/debug/SKILL.md)

**14. Preflight step placement**

**When** `/adev:debug` runs **then** the preflight step is inserted at the end of Phase 1: Reproduce (after reading error messages, reproducing, and checking recent changes), before Phase 2: Investigate. This placement ensures the debug skill has gathered enough context to resolve which spec/plan is relevant.

**15. Three-tier spec/plan resolution**

**When** the debug skill needs to find `infra_requirements` **then** it uses a three-tier resolution strategy:

1. **Arguments:** If `--spec <path>` was passed, read `infra_requirements` from that spec and its associated plan (if a `.plan.md` sibling exists).
2. **Active plan:** If no `--spec` was passed, check `.context-index/hygiene/.active-plan`. If it contains a plan path, read the plan and its referenced spec for `infra_requirements`.
3. **Inference:** If neither arguments nor active plan yield a result, check which module the buggy file belongs to (using `manifest.yaml` module paths). Glob for specs under that module's charter directory. If any spec has `infra_requirements`, use it.

**When** none of the three tiers yields `infra_requirements` **then** the preflight step is skipped (the bug may not involve external infrastructure).

**16. Non-blocking advisory for debug**

**When** preflight fails during debug and the failure is from inference (tier 3) rather than explicit arguments **then** the skill emits a warning instead of blocking:

```
Infrastructure may be unavailable (inferred from <module> specs):
  ✗ Postgres 15: DATABASE_URL not set

This may affect reproduction if the bug involves external systems.
Continue debugging? (yes / fix infra first / --no-infra)
```

**When** preflight fails from explicit arguments (tier 1) or active plan (tier 2) **then** the skill blocks with the standard blocking message.

#### eval (skills/eval/SKILL.md)

**17. Preflight step placement**

**When** `/adev:eval` runs **then** the preflight step is inserted after prerequisites (context index, validate passed) and before Layer 1: Deterministic Checks. The spec path is the `--spec <path>` argument. The plan path is resolved by globbing for a `.plan.md` sibling of the spec.

**18. Layer-aware trigger**

**When** `--layer 1` or `--layer 2` is specified (deterministic checks and architectural conformance only — no code execution against external systems) **then** the preflight step is skipped regardless of `infra_requirements`.

**When** `--layer 3` or `--layer 4` or no `--layer` is specified (full evaluation including code execution) **then** the preflight runs normally if `infra_requirements` is present.

#### recover (skills/recover/SKILL.md)

**19. Preflight step placement**

**When** `/adev:recover` runs **then** the preflight step is inserted after Step 1: Detect (which identifies the stuck task and its plan) and before Step 2: Classify (which diagnoses the root cause). The spec and plan paths are resolved from the detected task's plan reference.

**20. Root-cause-aware trigger**

**When** the recovery skill classifies the root cause as infrastructure-related (e.g., "tool failure", "connection refused", "credentials missing") **then** the preflight report is included in the corrective context injected into the re-dispatched subagent — showing exactly which systems are down.

**When** the root cause is not infrastructure-related (e.g., "missing context", "ambiguous spec", "scope creep") **then** the preflight step is skipped.

### Postconditions

- Skills that encounter `infra_requirements` in their resolved spec/plan either pass preflight and proceed, or block with actionable diagnostics
- Skills without `infra_requirements` in their resolved spec/plan behave identically to before (backward compatible)
- The `--no-infra` flag is never set or suggested by the agent autonomously

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--no-infra` flag set by agent (not user) | Blocked by SKILL.md instruction: "agent must never set this flag" | `INFRA_AGENT_BYPASS` |
| `lib/infra-preflight.mjs` import fails | Skill blocks with warning, suggests `--no-infra` or fixing lib | `INFRA_LIB_MISSING` |
| Spec/plan path cannot be resolved (conditional skills) | Preflight step is skipped silently (no infra requirements to check) | — |
| `ADEV_NO_INFRA` env var set to value other than `1` | Treated as not set (only exact value `1` activates bypass) | — |
| Build sub-skill preflight fails | Build reports pipeline step failure and stops | `BUILD_INFRA_BLOCKED` |

## System Constitution Reference

- **"Skills are primarily markdown"** — All changes are SKILL.md instruction edits. The preflight step is a markdown section that calls `lib/infra-preflight.mjs` via inline Node.js. No new executable files are created.
- **"Minimize external dependencies"** — No new dependencies introduced. Uses existing `lib/infra-preflight.mjs` (from sibling spec).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add preflight step to implement SKILL.md | Insert Step 0.5 after Load Context, before Execute Tasks. Include spec+plan path resolution, blocking message with --task N hint, --no-infra argument documentation. | medium |
| Add preflight step to validate SKILL.md | Insert preflight after prerequisites, before Load Check Registry. Include --spec/--plan path passthrough, blocking message. | small |
| Add --no-infra passthrough to build SKILL.md | Document --no-infra in Arguments section, pass through to implement/validate invocations. No separate preflight step. | small |
| Add preflight step to write-test SKILL.md | Insert after Model Tier Resolution, before Strategy Resolution. Skip when dispatched by implement. Skip when strategy is unit and no infra_requirements. | small |
| Add preflight step to debug SKILL.md | Insert at end of Phase 1. Implement three-tier resolution (args > active plan > inference). Non-blocking advisory for inferred context. | large |
| Add preflight step to eval SKILL.md | Insert after prerequisites, before Layer 1. Skip for --layer 1 or --layer 2. | small |
| Add preflight step to recover SKILL.md | Insert after Detect, before Classify. Root-cause-aware trigger. Include preflight report in corrective context for infra-related failures. | medium |
| Add --no-infra and ADEV_NO_INFRA documentation | Add to each skill's Arguments section. Include the agent-must-never-set instruction in each SKILL.md. | small |
| Write tests for SKILL.md content assertions | Static content-presence tests verifying each SKILL.md contains the preflight step text, --no-infra documentation, and agent bypass prohibition. Follow pattern from `specify-feature-binding.test.mjs`. | medium |

## Acceptance Criteria

- [ ] implement SKILL.md contains "Infrastructure Preflight" step after Load Context and before Execute Tasks
- [ ] implement SKILL.md blocking message includes `--task N` option when plan has mixed strategies
- [ ] validate SKILL.md contains preflight step after prerequisites and before Load Check Registry
- [ ] build SKILL.md documents `--no-infra` in Arguments and passes it through to sub-skills
- [ ] build SKILL.md does NOT contain its own preflight step (relies on sub-skill preflight)
- [ ] write-test SKILL.md contains preflight step after Model Tier Resolution, skips when dispatched by implement
- [ ] write-test SKILL.md skips preflight when strategy is `unit` and no `infra_requirements` declared
- [ ] debug SKILL.md contains preflight step at end of Phase 1 with three-tier resolution (args > active plan > inference)
- [ ] debug SKILL.md uses non-blocking advisory when infra_requirements was inferred (tier 3), blocks for tiers 1 and 2
- [ ] eval SKILL.md contains preflight step after prerequisites, skips for `--layer 1` and `--layer 2`
- [ ] recover SKILL.md contains preflight step after Detect, before Classify, with root-cause-aware trigger
- [ ] recover SKILL.md includes preflight report in corrective context for infra-related root causes
- [ ] All 7 SKILL.md files document `--no-infra` in their Arguments section
- [ ] All 7 SKILL.md files contain the instruction: "agent must never set --no-infra or ADEV_NO_INFRA autonomously"
- [ ] `ADEV_NO_INFRA` env var is documented as fallback (`1` = bypass, any other value = ignored)
- [ ] Skills with no `infra_requirements` in resolved spec/plan behave identically to before (backward compatible)
- [ ] Static content-presence tests pass for all 7 SKILL.md files
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced

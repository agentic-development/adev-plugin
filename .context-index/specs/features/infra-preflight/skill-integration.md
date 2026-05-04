---
charter: infra-preflight
status: validated
risk_level: medium
milestone: 1
revision: 3
charter-revision: 1
created: 2026-05-01
updated: 2026-05-04
---

# Live Spec: Skill Integration

**Capabilities covered:** Skill Integration (Mandatory), Skill Integration (Conditional)

**Capability:** Add an infrastructure preflight step to 7 skills that execute code or tests. Mandatory skills (implement, validate, build, write-test) always run the preflight when `infra_requirements` is present. Conditional skills (debug, eval, recover) run the preflight only when they can locate a relevant spec/plan with `infra_requirements`. All skills accept `--no-infra` as a user-only bypass flag, with `ADEV_NO_INFRA=1` env var as fallback.

> **Dependency:** This spec depends on the sibling spec `verification-runner-and-schema.md` which defines the `runPreflight()` API, `parseInfraRequirements()`, and `formatPreflightReport()` functions in `lib/infra-preflight.mjs`.

> **Enforcement note:** The `--no-infra` bypass is enforced at the SKILL.md instruction level (agent must not set it). Hook-level enforcement (a pre-tool-call hook that detects autonomous `ADEV_NO_INFRA=1` injection) is a valuable hardening layer but is out of scope for this spec — it would require a new hook entry in `hooks/hooks.json`, which is a separate capability. This spec establishes the instruction-level control; a future spec can add hook-level enforcement.

## Behavioral Contract

### Preconditions

- `lib/infra-preflight.mjs` exists and exports `runPreflight()`, `parseInfraRequirements()`, and `formatPreflightReport()`
- The skill has a reference to a spec or plan file (directly via arguments, via active plan, or via inference)
- The spec or plan file contains YAML frontmatter (may or may not contain `infra_requirements`)

### Behaviors

---

### Shared Behaviors (apply to all 7 skills)

**1. `--no-infra` flag resolution**

**When** a skill is invoked with `--no-infra` **then** it reads the flag once at skill entry and sets `options.noInfra = true`. This value is passed to `runPreflight()`, which returns `{ passed: true, systems: [], skipped: true }` without running any checks.

**When** `--no-infra` is not passed but the environment variable `ADEV_NO_INFRA` is set to exactly `1` **then** the skill reads it once at skill entry and treats it as equivalent to `--no-infra`, setting `options.noInfra = true`. A malformed `ADEV_NO_INFRA` value (not exactly `1`) does not activate bypass and does not affect the evaluation of `--no-infra`. Priority: skill argument > env var.

**When** neither `--no-infra` nor `ADEV_NO_INFRA=1` is set **then** the preflight runs normally.

> **Trust boundary:** The skill reads `--no-infra` and `ADEV_NO_INFRA` once at entry and converts to `options.noInfra`. The library (`lib/infra-preflight.mjs`) must never read `process.env.ADEV_NO_INFRA` directly — it only honors the `options.noInfra` boolean passed by the caller. This makes the bypass decision explicit and auditable at the skill level.

**When** the agent attempts to set `--no-infra` or `ADEV_NO_INFRA` autonomously **then** the skill must not allow it. The SKILL.md instructions explicitly state: "The `--no-infra` flag and `ADEV_NO_INFRA` env var are user-only controls. The agent must never set, suggest setting, or default these to bypass preflight. If preflight fails, report the failure and wait for user direction."

**2. Preflight invocation**

**When** the skill has resolved its spec/plan path(s) and `infra_requirements` is present in at least one of them **then** it calls `runPreflight()` via inline Node.js, using the same pattern as heuristics loading in implement/debug skills. The call happens after prerequisites are verified but before any code execution, test running, or subagent dispatch.

The invocation pattern is:

```bash
node --input-type=module -e "
import { runPreflight, formatPreflightReport } from '<ADEV_ROOT>/lib/infra-preflight.mjs';
const report = await runPreflight('<specPath>', '<planPath>', { timeout: <timeout>, noInfra: <noInfra> });
console.log(JSON.stringify(report));
"
```

Where `<ADEV_ROOT>` is the resolved absolute plugin root path (derived from the skill file's base directory by stripping `skills/<name>/`), `<specPath>` and `<planPath>` are the resolved paths (or `null`), and options are populated from skill-level flag resolution (Behavior 1).

The skill parses the JSON output and uses `formatPreflightReport()` for display if the report has `passed: false`.

**When** no `infra_requirements` is found in any resolved spec/plan **then** the preflight step is skipped entirely. No output, no delay, no behavioral change (backward compatible).

**3. Blocking on failure**

**When** `runPreflight()` returns `{ passed: false }` in a **mandatory skill** (implement, validate, write-test) **then** the skill calls `formatPreflightReport(report)` and displays the formatted output, followed by the blocking message. The skill stops execution and does not proceed to any subsequent steps.

**When** `runPreflight()` returns `{ passed: false }` in a **conditional skill** (debug, eval, recover) **then** the behavior depends on the per-skill policy defined in Behaviors 16, 18, and 20. Conditional skills may use advisory mode instead of blocking when `infra_requirements` were discovered through inference. Behaviors 16 and 20 define the per-skill policy.

**When** `runPreflight()` returns `{ passed: true }` **then** the skill proceeds normally. If `skipped: true`, it emits a one-line advisory: "Infrastructure preflight skipped (--no-infra)."

**4. Lib load failure**

**When** `lib/infra-preflight.mjs` fails to import (module not found, syntax error, etc.) **then** the skill emits a warning: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding." The skill blocks execution (does not silently continue without preflight). The `--no-infra` flag remains available to the user as a bypass but is not advertised in the error message.

**5. Handling `runPreflight()` exceptions**

**When** `runPreflight()` throws `PREFLIGHT_FILE_NOT_FOUND` **then** the skill emits: "Preflight error: spec or plan file not found at <path>. Verify the path and retry." The skill blocks execution.

**When** `runPreflight()` throws `PREFLIGHT_PARSE_ERROR` **then** the skill emits: "Preflight error: could not parse frontmatter in <path>. Check YAML syntax." The skill blocks execution.

---

### Mandatory Skills

#### implement (skills/implement/SKILL.md)

**6. Preflight step placement**

**When** `/adev:implement` runs **then** the preflight step is inserted as a new "Step 1.5: Infrastructure Preflight" after Step 1: Load Context (which resolves the spec and plan paths) and before Step 2: Execute Tasks. Step 1 provides both the spec path (from the plan's `Spec:` header) and the plan path (the `<plan-path>` argument).

**7. Spec and plan path resolution**

**When** the implement skill loads the plan file and its referenced spec **then** it passes both paths to `runPreflight(specPath, planPath, options)`. The plan path is the `<plan-path>` argument. The spec path is extracted from the plan's `Spec:` header field.

**8. Per-task infrastructure hint**

**When** preflight blocks and the plan contains tasks with mixed strategies (some unit, some integration) **then** the blocking message includes:

```
Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
  3. Use --task N to run only tasks that don't need this infrastructure
```

**When** all tasks require the failed infrastructure **then** option 3 is omitted.

#### validate (skills/validate/SKILL.md)

**9. Preflight step placement**

**When** `/adev:validate` runs **then** the preflight step is inserted as "Preflight: Infrastructure Verification" immediately following the three Prerequisites conditions (1. Context Index exists, 2. Spec exists, 3. Implementation exists) and before Step 0: Load Check Registry. The spec path is the `--spec <path>` argument. The plan path is the `--plan <path>` argument if provided, otherwise `null`.

**10. Validate-specific blocking message**

**When** preflight blocks during validate **then** the blocking message is:

```
Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

#### build (skills/build/SKILL.md)

**11. No special preflight logic**

**When** `/adev:build` orchestrates implement and validate **then** each sub-skill runs its own preflight independently. Build does not add a separate preflight step. If implement's preflight fails, build reports the failure as a pipeline step failure and stops.

**12. --no-infra passthrough**

**When** `/adev:build` is invoked with `--no-infra` **then** it passes the flag through to the implement and validate invocations by setting the environment variable `ADEV_NO_INFRA=1` for sub-skill processes. The `--no-infra` flag is documented in build's Arguments section.

#### write-test (skills/write-test/SKILL.md)

**13. Preflight step placement**

**When** `/adev:write-test` runs in standalone mode (`--red --spec <path>`) **then** the preflight step is inserted after Step 1: Model Tier Resolution, but before strategy resolution. The spec path is the `--spec <path>` argument. Plan path is `null` (write-test does not consume plans directly).

**14. Dispatch detection**

**When** `/adev:write-test` is dispatched by `/adev:implement` **then** the preflight is not run by write-test (implement already ran it). Dispatch mode is detected by the presence of the environment variable `ADEV_DISPATCHED_BY=implement`, which implement sets when dispatching write-test subagents. No duplicate preflight.

**When** `ADEV_DISPATCHED_BY` is absent or has a value other than `implement` **then** write-test treats itself as standalone and runs the preflight step normally (if `infra_requirements` is present).

> **Agent prohibition:** The agent must not set `ADEV_DISPATCHED_BY=implement` except when dispatching a write-test subagent from within the implement skill. Setting it in any other context to bypass preflight is prohibited, same as `--no-infra`. When `ADEV_DISPATCHED_BY=implement` is set, `ADEV_NO_INFRA` is irrelevant (dispatch detection already suppresses preflight) — the dispatch signal takes priority.

**15. Strategy-aware trigger**

**When** the resolved test strategy is `unit` **then** the preflight step is skipped regardless of whether `infra_requirements` is declared — unit tests do not exercise external infrastructure.

---

### Conditional Skills

#### debug (skills/debug/SKILL.md)

**16. Preflight step placement**

**When** `/adev:debug` runs **then** the preflight step is inserted at the end of Phase 1: Reproduce (after reading error messages, reproducing, and checking recent changes), before Phase 2: Investigate. This placement ensures the debug skill has gathered enough context to resolve which spec/plan is relevant.

**17. Three-tier spec/plan resolution**

**When** the debug skill needs to find `infra_requirements` **then** it uses a three-tier resolution strategy:

1. **Arguments:** If `--spec <path>` was passed, read `infra_requirements` from that spec. Attempt to locate its `.plan.md` sibling; if found, use both spec and plan paths. If no sibling exists, call `runPreflight(specPath, null, options)`.
2. **Active plan:** If no `--spec` was passed, check `.context-index/hygiene/.active-plan`. If it contains a plan path, read the plan and its referenced spec for `infra_requirements`.
3. **Inference:** If neither arguments nor active plan yield a result, check which module the buggy file belongs to (using `manifest.yaml` module paths — validate that resolved paths are within the project root before globbing). Glob for specs under that module's charter directory (cap at 10 specs per inference attempt). For each spec found, attempt to locate its `.plan.md` sibling. If any spec has `infra_requirements`, use it (prefer the spec with the most relevant file path overlap).

**When** none of the three tiers yields `infra_requirements` **then** the preflight step is skipped (the bug may not involve external infrastructure).

**18. Non-blocking advisory for debug**

**When** preflight fails during debug and the failure is from inference (tier 3) rather than explicit arguments **then** the skill emits a warning instead of blocking:

```
Infrastructure may be unavailable (inferred from <module> specs):
  ✗ Postgres 15: DATABASE_URL not set

This may affect reproduction if the bug involves external systems.
Waiting for user direction. Fix the infrastructure issues above, or
re-run with --no-infra to bypass.
```

The skill pauses and waits for an explicit user response. The agent must not infer, assume, or answer this prompt on behalf of the user. This is a hard pause requiring human input.

**When** preflight fails from explicit arguments (tier 1) or active plan (tier 2) **then** the skill blocks with the standard blocking message (same as mandatory skills).

#### eval (skills/eval/SKILL.md)

**19. Preflight step placement**

**When** `/adev:eval` runs **then** the preflight step is inserted after prerequisites (context index, validate passed) and before Layer 1: Deterministic Checks. The spec path is the `--spec <path>` argument. The plan path is resolved by globbing for a `.plan.md` sibling of the spec; if no sibling exists, plan path is `null`.

**20. Layer-aware trigger**

**When** `--layer 1` or `--layer 2` is specified (deterministic checks and architectural conformance only — no code execution against external systems) **then** the preflight step is skipped regardless of `infra_requirements`.

**When** `--layer 3` or `--layer 4` or no `--layer` is specified (full evaluation including code execution) **then** the preflight runs normally if `infra_requirements` is present.

#### recover (skills/recover/SKILL.md)

**21. Preflight step placement and execution**

**When** `/adev:recover` runs **then** the preflight step is inserted after Step 1: Detect (which identifies the stuck task and its plan) and before Step 2: Gather Evidence. The spec and plan paths are resolved from the detected task's plan reference (available by the end of Step 1: Detect). The preflight always runs at this point if `infra_requirements` is present — it is not deferred to classification.

**22. Root-cause-aware corrective context injection**

**When** the recovery skill classifies the root cause as infrastructure-related (e.g., "tool failure", "connection refused", "credentials missing") **then** the formatted preflight report (from `formatPreflightReport()`, not the raw `PreflightReport` object) is included in the corrective context injected into the re-dispatched subagent — showing exactly which systems are down in sanitized form.

**When** the root cause is not infrastructure-related (e.g., "missing context", "ambiguous spec", "scope creep") **then** the preflight report is not included in the corrective context (but the preflight still ran at Step 1.5 — it just doesn't inform the re-dispatch).

### Postconditions

- Skills that encounter `infra_requirements` in their resolved spec/plan either pass preflight and proceed, or block with actionable diagnostics
- Skills without `infra_requirements` in their resolved spec/plan behave identically to before (backward compatible)
- The `--no-infra` flag and `ADEV_DISPATCHED_BY` are never set or suggested by the agent autonomously (except `ADEV_DISPATCHED_BY=implement` when implement dispatches write-test)
- `lib/infra-preflight.mjs` never reads `process.env.ADEV_NO_INFRA` — it only honors `options.noInfra`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `lib/infra-preflight.mjs` import fails | Skill blocks with warning: "Fix the library before proceeding." | `INFRA_LIB_MISSING` |
| `runPreflight()` throws `PREFLIGHT_FILE_NOT_FOUND` | Skill emits path error and blocks | `PREFLIGHT_FILE_NOT_FOUND` |
| `runPreflight()` throws `PREFLIGHT_PARSE_ERROR` | Skill emits parse error and blocks | `PREFLIGHT_PARSE_ERROR` |
| Spec/plan path cannot be resolved (conditional skills) | Preflight step is skipped silently (no infra requirements to check) | — |
| `ADEV_NO_INFRA` env var set to value other than `1` | Treated as not set (only exact value `1` activates bypass) | — |
| Build sub-skill preflight fails | Build reports pipeline step failure and stops | `BUILD_INFRA_BLOCKED` |

## System Constitution Reference

- **"Skills are primarily markdown"** — All changes are SKILL.md instruction edits. The preflight step is a markdown section that calls `lib/infra-preflight.mjs` via inline Node.js (same pattern as heuristics loading). No new executable files are created.
- **"Minimize external dependencies"** — No new dependencies introduced. Uses existing `lib/infra-preflight.mjs` (from sibling spec).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add preflight step to implement SKILL.md | Insert Step 1.5 after Load Context, before Execute Tasks. Include spec+plan path resolution, inline Node.js invocation, blocking message with --task N hint, --no-infra argument documentation. | medium |
| Add preflight step to validate SKILL.md | Insert "Preflight: Infrastructure Verification" after the three Prerequisites conditions, before Step 0: Load Check Registry. Include --spec/--plan path passthrough, blocking message. | small |
| Add --no-infra passthrough to build SKILL.md | Document --no-infra in Arguments section, propagate via ADEV_NO_INFRA=1 env var to implement/validate invocations. No separate preflight step. | small |
| Add preflight step to write-test SKILL.md | Insert after Step 1: Model Tier Resolution, before strategy resolution. Detect dispatch via ADEV_DISPATCHED_BY=implement env var — skip preflight if set. Skip when strategy is unit. | small |
| Update implement SKILL.md to set ADEV_DISPATCHED_BY | When implement dispatches write-test subagents, set ADEV_DISPATCHED_BY=implement in the subagent env. | small |
| Add preflight step to debug SKILL.md | Insert at end of Phase 1. Implement three-tier resolution (args > active plan > inference with .plan.md sibling lookup). Non-blocking advisory for tier 3 with hard pause for user response. | large |
| Add preflight step to eval SKILL.md | Insert after prerequisites, before Layer 1. Skip for --layer 1 or --layer 2. Resolve plan via .plan.md sibling glob (null if absent). | small |
| Add preflight step to recover SKILL.md | Insert after Detect, before Classify. Always run preflight if infra_requirements present. Inject formatted report (not raw object) into corrective context for infra-related root causes. | medium |
| Add --no-infra and ADEV_NO_INFRA documentation | Add to each skill's Arguments section. Include the agent-must-never-set instruction in each SKILL.md. Include trust boundary note (skill reads env var once at entry, lib never reads process.env). | small |
| Write tests for SKILL.md content assertions | Static content-presence tests verifying each SKILL.md contains the preflight step text, --no-infra documentation, ADEV_DISPATCHED_BY check (write-test), and agent bypass prohibition. Follow pattern from `tests/skills/specify-feature-binding.test.mjs`. | medium |

## Acceptance Criteria

- [ ] implement SKILL.md contains "Infrastructure Preflight" step after Load Context and before Execute Tasks
- [ ] implement SKILL.md blocking message includes `--task N` option when plan has mixed strategies
- [ ] implement SKILL.md sets `ADEV_DISPATCHED_BY=implement` when dispatching write-test subagents
- [ ] validate SKILL.md contains "Preflight: Infrastructure Verification" after the three Prerequisites conditions and before Step 0: Load Check Registry
- [ ] build SKILL.md documents `--no-infra` in Arguments and propagates via `ADEV_NO_INFRA=1` env var
- [ ] build SKILL.md does NOT contain its own preflight step (relies on sub-skill preflight)
- [ ] write-test SKILL.md contains preflight step after Model Tier Resolution, skips when `ADEV_DISPATCHED_BY=implement` is set
- [ ] write-test SKILL.md skips preflight when strategy is `unit` (regardless of infra_requirements)
- [ ] debug SKILL.md contains preflight step at end of Phase 1 with three-tier resolution (args > active plan > inference)
- [ ] debug SKILL.md three-tier resolution attempts `.plan.md` sibling lookup at each tier
- [ ] debug SKILL.md uses non-blocking advisory with hard user pause when infra_requirements was inferred (tier 3), blocks for tiers 1 and 2
- [ ] eval SKILL.md contains preflight step after prerequisites, skips for `--layer 1` and `--layer 2`
- [ ] eval SKILL.md resolves plan path via `.plan.md` sibling glob, passes `null` if absent
- [ ] recover SKILL.md contains preflight step after Detect, before Gather Evidence (always runs if infra_requirements present)
- [ ] recover SKILL.md includes formatted preflight report (via `formatPreflightReport()`, not raw object) in corrective context for infra-related root causes
- [ ] All 7 SKILL.md files document `--no-infra` in their Arguments section
- [ ] All 7 SKILL.md files contain the instruction: "agent must never set --no-infra or ADEV_NO_INFRA autonomously"
- [ ] write-test SKILL.md contains the instruction: "agent must not set ADEV_DISPATCHED_BY=implement except when dispatching from implement"
- [ ] `ADEV_NO_INFRA` env var is documented: read once at skill entry, only `1` activates bypass, lib never reads process.env
- [ ] Skills with no `infra_requirements` in resolved spec/plan behave identically to before (backward compatible)
- [ ] Inline Node.js invocation pattern matches heuristics-loading pattern (plugin root resolution, JSON output parsing)
- [ ] Static content-presence tests pass for all 7 SKILL.md files
- [ ] All quality gates pass
- [ ] No constitutional violations introduced

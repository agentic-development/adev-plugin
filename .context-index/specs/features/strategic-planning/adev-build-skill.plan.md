# Plan: adev-build Orchestrator

## Spec Reference
- Spec: `.context-index/specs/features/strategic-planning/adev-build-skill.md`
- Charter: `.context-index/specs/features/strategic-planning/charter.md`
- Review: PASS_WITH_NOTES

## Overview

Create a new `skills/adev-build/SKILL.md` — the end-to-end build orchestrator that chains review, plan, route, implement, and validate for one or more specs. This skill coordinates the full lifecycle pipeline, supports resume from failure via persisted build state JSON, batch processing via `--phase`, and preview via `--dry-run`. This is a milestone v2 skill and the most complex addition to the strategic planning feature set.

## Tasks

### Task 1: Create SKILL.md with pipeline steps
- **Files:** `skills/adev-build/SKILL.md` (create)
- **Tests:** `tests/skills/adev-build.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Create the core SKILL.md with frontmatter, arguments, prerequisites, and the 5-step pipeline:
  1. Add YAML frontmatter with `name: adev-build` and description for the orchestrator skill
  2. Add announcement line: "I'm using the adev-build skill to orchestrate a full build pipeline."
  3. Define Arguments section:
     - `--spec <path>`: Build a single spec end-to-end
     - `--phase <name>`: Build all specs with matching milestone
     - `--resume`: Resume an interrupted build from last successful step
     - `--dry-run`: Show what would happen without executing
     - `--no-route`: Skip the route step
  4. Define Prerequisites: `.context-index/` must exist with `constitution.md` and `manifest.yaml`; at least one spec must be provided or discoverable
  5. Define the Build Pipeline section with 5 steps per spec:
     - Step 1: Review — invoke `/adev-review-specs --spec <path>`; skip if `.review.md` exists and is current (not stale); STOP if verdict is BLOCK
     - Step 2: Plan — invoke `/adev-plan --spec <path>`; skip if `.plan.md` exists; STOP if constitution violation detected
     - Step 3: Route — invoke `/adev-route --plan <plan-path>`; optional/advisory; skip if `--no-route` flag set
     - Step 4: Implement — invoke `/adev-implement <plan-path>`; STOP if quality gates fail
     - Step 5: Validate — invoke `/adev-validate --spec <path> --plan <plan-path>`; report PASS/FAIL
  6. Define skip conditions for each step (review already passed, plan already exists)
  7. Per review note CON-1, ensure pipeline step ordering in SKILL.md matches the 5-step flow consistently throughout
  8. Define the summary output format: "N specs attempted, N passed, N failed, N skipped"

  **Test cases:**
  - SKILL.md exists at `skills/adev-build/SKILL.md`
  - SKILL.md has valid frontmatter with `name: adev-build`
  - SKILL.md contains `--spec` argument
  - SKILL.md contains `--phase` argument
  - SKILL.md contains `--resume` argument
  - SKILL.md contains `--dry-run` argument
  - SKILL.md contains all 5 pipeline step names: review, plan, route, implement, validate
  - SKILL.md references `/adev-review-specs`, `/adev-plan`, `/adev-implement`, `/adev-validate`

### Task 2: Define build state JSON format
- **Files:** `skills/adev-build/SKILL.md` (modify)
- **Tests:** `tests/skills/adev-build.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add the Build State section to SKILL.md defining the JSON persistence format:
  1. Define storage location: `.context-index/build-state/<slug>.json` where `<slug>` is derived from the spec filename
  2. Define the JSON schema with fields: `spec` (path), `phase` (milestone name or null), `status` (in_progress/completed/failed), `steps` (array of step objects), `started` (ISO-8601), `updated` (ISO-8601)
  3. Define step object fields: `name` (review/plan/route/implement/validate), `status` (completed/failed/skipped), `timestamp` (ISO-8601), `error` (string, only on failure)
  4. Specify that the build state file is written after each step completes (incremental persistence)
  5. Specify that on successful completion of all steps, `status` is set to `completed`
  6. Specify that the `.context-index/build-state/` directory is created if it does not exist on first build
  7. Per review note SA-2, specify that `--resume` in `--phase` mode re-discovers all specs from frontmatter rather than relying solely on cached build state, to handle specs added or modified between sessions

  **Test cases:**
  - SKILL.md contains `build-state` directory path
  - SKILL.md contains JSON schema example with spec, phase, status, steps fields
  - SKILL.md describes incremental state persistence after each step
  - SKILL.md describes `.context-index/build-state/` directory creation

### Task 3: Implement `--resume` logic
- **Files:** `skills/adev-build/SKILL.md` (modify)
- **Tests:** `tests/skills/adev-build.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add the Resume section to SKILL.md defining how interrupted builds are continued:
  1. Define heading: `### Resume Mode`
  2. When `--resume` is invoked without `--spec` or `--phase`, scan `.context-index/build-state/` for any file with `status: in_progress` or `status: failed`
  3. When `--resume --spec <path>` is invoked, read the specific build state file for that spec
  4. When `--resume --phase <name>` is invoked, re-discover all specs with matching milestone (per review note SA-2), then check per-spec build state for each
  5. For each resumable spec, identify the last completed step and resume from the next step in the pipeline
  6. If a step previously failed, retry it (the underlying issue may have been fixed)
  7. Per review note SEC-1, add support for `--from <step>` override so users can force restart from a specific pipeline phase if the state file is corrupted or stale
  8. Error case: if `--resume` is invoked but no build state files exist, print "No interrupted build found" and stop

  **Test cases:**
  - SKILL.md contains "Resume Mode" section
  - SKILL.md describes scanning for `in_progress` or `failed` build state files
  - SKILL.md describes `--from <step>` override
  - SKILL.md describes "No interrupted build found" error message

### Task 4: Implement `--phase` batch mode
- **Files:** `skills/adev-build/SKILL.md` (modify)
- **Tests:** `tests/skills/adev-build.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add the Phase Mode section to SKILL.md defining batch processing of milestone specs:
  1. Define heading: `### Phase Mode`
  2. Step 1: Discover all specs with `milestone: <name>` in frontmatter by scanning `.context-index/specs/`
  3. Step 2: Filter to specs with status `review-pending` or later (skip `draft` specs)
  4. Step 3: Build each spec independently through the full pipeline
  5. Specify that failure of one spec does not block others unless they have explicit dependencies (check for `depends-on` in frontmatter)
  6. After all specs are processed, print a phase summary: "Phase '<name>': N specs attempted, N passed, N failed, N skipped"
  7. If issue board is configured (`tasks.backend` in manifest), mark the milestone epic as `in_progress` at start; do not auto-close at end (manual decision)
  8. Error case: if no specs found for the milestone, print "No specs found for milestone '<name>'" and stop

  **Test cases:**
  - SKILL.md contains "Phase Mode" section
  - SKILL.md describes spec discovery by milestone frontmatter
  - SKILL.md describes independent spec builds (failure isolation)
  - SKILL.md describes phase summary output format
  - SKILL.md describes "No specs found for milestone" error

### Task 5: Implement `--dry-run` mode
- **Files:** `skills/adev-build/SKILL.md` (modify)
- **Tests:** `tests/skills/adev-build.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add the Dry Run section to SKILL.md defining the preview mode:
  1. Define heading: `### Dry Run Mode`
  2. When `--dry-run` is combined with `--spec <path>`, show: spec path, which steps would execute vs skip (based on existing .review.md, .plan.md), estimated task count from plan if it exists
  3. When `--dry-run` is combined with `--phase <name>`, show: all discovered specs for the milestone, per-spec step breakdown, total estimated tasks across all specs
  4. Specify that `--dry-run` never invokes any skill, writes any file, or modifies any state
  5. Per review note SA-3, include a `completed_with_warnings` note in the dry-run output to flag specs that may need attention even after passing
  6. Output format: structured text showing the pipeline plan for each spec

  **Test cases:**
  - SKILL.md contains "Dry Run Mode" section
  - SKILL.md describes `--dry-run` as read-only (no modifications)
  - SKILL.md describes showing which steps would execute vs skip
  - SKILL.md describes combining `--dry-run` with `--spec` and `--phase`

## File Structure

**Create:**
- `skills/adev-build/SKILL.md` — The build orchestrator skill
- `tests/skills/adev-build.test.mjs` — Tests verifying SKILL.md structure and key sections

**Modify:**
- None

**Reference (read, do not modify):**
- `.context-index/specs/features/strategic-planning/adev-build-skill.md` — Behavioral contract
- `.context-index/specs/features/strategic-planning/adev-build-skill.review.md` — Review notes (SA-2, SA-3, SEC-1, CON-1)
- `.context-index/specs/features/strategic-planning/charter.md` — Charter context
- `skills/adev-issues/SKILL.md` — Issue board integration patterns
- `skills/adev-start/SKILL.md` — Routing and classification patterns
- `skills/adev-assess/SKILL.md` — Frontmatter and structure reference for new skills
- `tests/skills/adev-assess.test.mjs` — Test pattern reference for SKILL.md tests

## Context Packets

### Task 1 Context
- Spec: `adev-build-skill.md` (Build Pipeline Steps, Behaviors 1-2, 6-8)
- Review: `adev-build-skill.review.md` (CON-1 — pipeline order consistency)
- Charter: `charter.md` (Interface Contracts — /adev-build)
- `skills/adev-assess/SKILL.md`: Frontmatter and structure pattern for new skills

### Task 2 Context
- Spec: `adev-build-skill.md` (Build State File Format, Behaviors 10-11)
- Review: `adev-build-skill.review.md` (SA-2 — phase resume re-discovery)

### Task 3 Context
- Spec: `adev-build-skill.md` (Behaviors 3-4, Error Cases — resume and failure)
- Review: `adev-build-skill.review.md` (SEC-1 — `--from` override, SA-2 — phase re-discovery)

### Task 4 Context
- Spec: `adev-build-skill.md` (Behaviors 2, 9, Error Cases — no specs for phase)
- Spec: `adev-build-skill.md` (Issue Board Integration section)

### Task 5 Context
- Spec: `adev-build-skill.md` (Behavior 5, Error Cases)
- Review: `adev-build-skill.review.md` (SA-3 — completed_with_warnings)

## Parallelization

- Task 1: Runs first — creates the SKILL.md file with core pipeline definition
- Task 2: Sequential after Task 1 — adds build state section to the file created in Task 1
- Task 3: Sequential after Task 2 — references build state format defined in Task 2
- Task 4: Sequential after Task 2 — references build state format and pipeline from Tasks 1-2
- Task 5: Can run after Task 1 (only needs pipeline definition), but sequential due to shared file
- Overall: strictly sequential (Tasks 1 → 2 → 3 → 4 → 5) since all tasks modify the same file

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `--spec <path>` builds a single spec end-to-end
  - [ ] `--phase <name>` discovers and builds all matching specs
  - [ ] Stops on review BLOCK
  - [ ] Stops on quality gate failure during implement
  - [ ] Skips review if .review.md exists and is current
  - [ ] Skips plan if .plan.md exists
  - [ ] `--resume` correctly resumes from last successful step
  - [ ] `--dry-run` shows pipeline without executing
  - [ ] Build state file is written at each step
  - [ ] Phase mode handles spec dependencies (independent failures don't block others)
  - [ ] Summary printed at end with pass/fail/skip counts
  - [ ] No constitutional violations introduced

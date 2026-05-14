# Live Spec: Lifecycle Skill Instruction Updates

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: validated
risk_level: high
milestone: 0.26.0
revision: 2
charter-revision: 4
created: 2026-05-12
updated: 2026-05-12
source-manifest:
  sha: "553870d"
  files:
    - lib/issues/render-markdown.mjs
    - lib/manifest.mjs
    - lib/migrate-state-artifacts.mjs
    - lib/milestones.mjs
    - skills/build/SKILL.md
    - skills/build/resume-mode.md
    - skills/debug/SKILL.md
    - skills/hygiene/SKILL.md
    - skills/implement/SKILL.md
    - skills/issues/SKILL.md
    - skills/plan/SKILL.md
    - skills/reconcile/SKILL.md
    - skills/research/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/specify/SKILL.md
    - skills/standalone/SKILL.md
    - skills/status/SKILL.md
    - skills/sync/SKILL.md
    - skills/validate/SKILL.md
    - skills/work/SKILL.md
    - tests/lib/manifest.test.mjs
    - tests/skills/api-reference-appendix.test.mjs
    - tests/skills/no-stale-format-refs.test.mjs
  computed-at: "2026-05-12T18:38:32.899Z"
drift_detected: true
drift_source: lib/migrate-state-artifacts.mjs
drift_at: 2026-05-13T18:59:51.237Z
---

## Behavioral Contract

This spec rewrites every lifecycle skill's `SKILL.md` so that instructions reference the new JSON / JSONL APIs (`lib/issues/json-adapter.mjs`, `lib/lifecycle-state.mjs`, `lib/execution-state.mjs`, `lib/milestones.mjs`) and the new lifecycle-state gate (`requireGate` + `resolveGateMode`) instead of describing the old markdown-table format, YAML frontmatter parsing, or filesystem-grep of `.review.md`. It is the **adoption pass** for two capabilities the foundation specs implemented as library code but did not roll out across the skill prose: **severity stamping at write time** (`reportReviewer` / `reportValidator` callers) and **lifecycle-state gates** (`requireGate(state, stepName)` callers). After this spec lands, no skill instruction tells an agent to parse markdown tables, grep `.review.md` for verdicts, or hand-edit `.execution-state.md` YAML frontmatter.

The skills in scope (matching the charter's enumerated list, with mode-file coverage expanded to the actual filesystem):

`adev:issues`, `adev:plan` (+ ALL of `skills/plan/*.md` — currently `release-mode.md`, `epic-mode.md`, `feature-mode.md`, `milestone-mode.md`, `mode-router.md`, `plan-reviewer-prompt.md`), `adev:implement`, `adev:work`, `adev:specify`, `adev:validate`, `adev:reconcile`, `adev:debug`, `adev:status`, `adev:hygiene`, `adev:research`, `adev:sync`, `adev:build` (+ ALL of `skills/build/*.md` — currently `resume-mode.md`, `charter-mode.md`, `milestone-mode.md`, `workspace-mode.md`), and `adev:review-specs`.

The architectural test in this spec (`tests/skills/no-stale-format-refs.test.mjs`) does NOT use the enumeration above as its glob target — it runs against `skills/**/*.md` (all skill files under canonical `skills/`) excluding `skills/*/SKILL.md`-only items that are non-lifecycle (per Skills Out of Scope below). This way new mode files added in the future are automatically covered without a spec revision.

Behavior changes in `/adev:plan` and `/adev:implement` that drive *what* events are emitted are owned by `plan-task-events.spec.md`. This spec owns the *how-to-read/write* instruction surface across the entire lifecycle, including the `/adev:plan` and `/adev:implement` instruction text outside the plan-task channel.

## Naming Conventions (CON-1)

- Instruction prose uses the field-name domains established by the foundation specs (Issue camelCase + snake_case mixed, Event snake_case, StateProjection camelCase). No new conventions; no renames.
- API references in prose use the exact exported function names: `appendEvent`, `readEvents`, `currentState`, `requireGate`, `resolveGateMode`, `listLifecycleStates`, `reportReviewer`, `reportValidator`, `reportStep`, `reportPlanTask`, `reportIntervention`, `ensureLifecycleState`, `hasLifecycleState`, `filterEvents`, `slugFromSpec`, `renderMarkdown`. Where a skill references the issue manager, prose says `getIssueManager(manifest)` (returning the adapter instance) and method names exactly as in the `IssueManagerInterface`.

## Severity Stamping Adoption (CON-4)

Every reviewer- or validator-style write that today is described in skill prose as "append a row to the review/validation table" is replaced with a call through the convenience writers. Severity stamping is owned by `lifecycle-event-log.spec.md` § Severity-resolution helper; this spec MUST NOT restate severity sources in skill prose (per `lifecycle-event-log.spec.md` § Canonical Enums and Field Extensions / Severity-resolution restatement).

- **`/adev:review-specs`** — for each reviewer agent's verdict, the skill instructs the orchestrator to call `reportReviewer(projectRoot, specPath, { step: "review", reviewer: <name>, verdict, notes })`. The writer stamps severity per `lifecycle-event-log.spec.md`. Reviewer-table generation in the `.review.md` artifact is now a **render** of the projection (via `renderMarkdown` or the per-skill snippet defined in `markdown-rendering-layer.spec.md`), not an inline write target for skill instructions.
- **`/adev:validate`** — each validator agent's result is written via `reportValidator(projectRoot, specPath, { step: "validate", validator: <name>, verdict, error, score, duration_ms })`. The `.validate.md` artifact remains a wholesale-rewrite summary (out-of-scope per charter), but verdict aggregation comes from `currentState(spec).steps.validate` rather than parsing the prior validation file.
- **`/adev:debug`** — debug interventions are written via `reportIntervention(projectRoot, specPath, { kind: "debug", note })`. The debug skill's existing prose about "appending to the debug log" is replaced by this call.
- **`/adev:specify`**, **`/adev:plan`**, **`/adev:implement`** — emit `reportStep(projectRoot, specPath, { step, status, verdict? })` at step entry and exit, so the projection's `currentStep` and per-step `status` are accurate without a separate state file.

Failed domain-config lookups follow the best-effort fallback established in `lifecycle-event-log.spec.md` (stamp `severity: warning`, emit `DOMAIN_CONFIG_DEGRADED` once, append). Skill prose explicitly does not catch or handle this — it's a library concern.

`notes` and `error` arguments to these writers MUST NOT include API keys, tokens, file contents, or stack traces beyond the immediate error message. The lib caps at 4 KB and truncates with a `NOTES_TRUNCATED` warning, but operator-facing summaries should stay ≤ 200 characters in practice.

## `lib/manifest.mjs` Public Helper

The pseudocode below depends on a public `loadManifest(projectRoot) → manifestObject` export from `lib/manifest.mjs`. Today the repo has three private copies of `loadManifestForStorage()` (in `lib/migrate-state-artifacts.mjs`, `lib/milestones.mjs`, `lib/issues/render-markdown.mjs`). This spec's implementation work includes promoting one of those copies to a shared `lib/manifest.mjs::loadManifest` export and switching the three existing call sites to use it. Path-containment semantics already in those copies (resolve `projectRoot`, assert `.context-index/manifest.yaml` exists) are preserved unchanged on lift.

## Gate Adoption (CON-2)

Every prerequisite check that today is described as "scan the prior step's `.review.md` for `status: review-passed`" or "grep for `verdict: PASS`" is replaced by:

```javascript
// Pseudocode shown in skill prose for the agent to translate into the appropriate dispatch.
import { currentState, requireGate, resolveGateMode } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
import { loadManifest } from '<ADEV_ROOT>/lib/manifest.mjs';

const state = currentState(projectRoot, specPath);
const mode = resolveGateMode(loadManifest(projectRoot));
requireGate(state, "<prior-step>", { mode });
```

Skill prose MUST NOT pre-validate or normalize `projectRoot` / `specPath` — the lib enforces path-containment per `lifecycle-event-log.spec.md` § Path Safety and surfaces `INVALID_PROJECT_ROOT` / `INVALID_SPEC_PATH` to the operator unchanged. Same posture as `GateError`: not caught by skill prose.

Per-skill gate adoption (gate runs as the FIRST action in the skill, before any plan-file authoring, lifecycle-state writes, or `reportPlanTask` emission):

- **`/adev:plan`** — gate on `step: "review"`. Applies in the base SKILL.md and every mode file (`release-mode.md`, `epic-mode.md`, `feature-mode.md`, `milestone-mode.md`, `mode-router.md`).
- **`/adev:implement`** — gate on `step: "plan"`.
- **`/adev:validate`** — gate on `step: "implement"`.
- **`/adev:build`** (orchestrator) — gates between every chained sub-skill invocation, using the prior step's name. In `resume-mode.md`, the resume entry point checks the projection to discover the next step rather than reading `.execution-state.json` directly. The same gate applies in `charter-mode.md`, `milestone-mode.md`, `workspace-mode.md`.
- **`/adev:review-specs`** — gate on `step: "specify"` before reviewer dispatch (the spec must exist and have a `lifecycle_step: specify, status: completed` event).

In `mode === "advisory"`, gate failures log a warning to the skill output and proceed; in `mode === "strict"` (default), gate failures throw `GateError` and the skill stops with a one-line operator message naming the failing prior step. Skill prose explicitly avoids catching `GateError`; it surfaces to the operator unchanged.

## Issue Board Adoption

Every skill that reads or writes Issues today uses `getIssueManager(manifest)` and the `IssueManagerInterface`. The skills affected by board-format prose:

- **`/adev:issues`** — the existing prose describing markdown-table columns (`| id | title | status | ... |`) is removed. All interactive operations (`create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`) call the manager directly. The "render the board to markdown" view becomes a call to `renderTasksMd(board)` from `markdown-rendering-layer.spec.md` (the skill no longer hand-writes table rows).
- **`/adev:status`** — board reads via `getIssueManager(manifest).list(...)`; lifecycle reads via `listLifecycleStates(projectRoot)`. The existing prose about parsing `tasks.md` or `<slug>.json` (the old per-spec build-state format) is removed.
- **`/adev:hygiene`** — coverage and drift audits read Issues via the manager. Spec-status reads via `listLifecycleStates`.
- **`/adev:reconcile`** — repair operations operate on Issue manager calls and `appendEvent` calls. No direct file manipulation of `tasks.json` or `<slug>.jsonl` from skill prose.
- **`/adev:research`** — when the research artifact records a "next steps" Issue, it calls the manager.

## Execution-State Adoption

`/adev:work`, `/adev:build` (+ `resume-mode.md`), and `/adev:implement` reference `lib/execution-state.mjs` (already rewritten by `execution-state-migration.spec.md`) for read/write of `.execution-state.json`. Skill prose explicitly does not parse YAML frontmatter or hand-edit the file. The exact API (`readExecutionState`, `writeExecutionState`, transitions) is referenced verbatim from `execution-state-migration.spec.md`.

## Milestones Adoption

`/adev:issues milestone *` subcommands, `/adev:status`, and the milestone-status checks in `/adev:hygiene` reference `lib/milestones.mjs` (already added by `milestones-migration.spec.md`). Skill prose for milestone CRUD operations uses the `lib/milestones.mjs` API rather than hand-editing `milestones.yaml`.

## Inline Code-Sample Format

Skill instructions may include short JavaScript snippets (≤10 lines) showing the agent how to invoke a helper. Each snippet:

- Begins with the import line(s) it requires.
- Uses the `<ADEV_ROOT>` placeholder for the plugin root (resolved at runtime per the existing skill convention).
- Documents the return shape inline when the API surface is new in this charter (e.g., `currentState` returns `{ spec, status, currentStep, currentTask, steps, planTasks, interventions, started, updated }`).
- Never executes; it's reference for the agent to translate into a tool call.

## Removed Prose (Audit Targets)

After this spec lands, a grep over the affected skill files MUST return zero matches for the following anti-patterns:

- `tasks\.md` parsing instructions outside of `/adev:status --render` and `/adev:issues` (deprecated read-only) prose.
- `build-state` directory references (replaced by `lifecycle-state`).
- Inline YAML frontmatter parsing of `.execution-state.md` (file no longer exists post-migration).
- Markdown-table column lists like `| id | title | status |` describing the issue board format.
- Instructions to grep `.review.md` for `verdict:` or `status:`.
- `last-reviewed-revision:` and `file-sha:` frontmatter manipulation instructions in `/adev:plan` and `/adev:review-specs` (these fields are written by the review skill but no skill should be parsing them inline; the lifecycle log holds the canonical step state).
- `git hash-object` invocations in skill prose (the lib computes hashes internally; skills should not shell out).
- Any snippet referencing a plugin-root prefix other than `<ADEV_ROOT>` (catches hardcoded `~/.claude/` or absolute paths).

An architectural test (`tests/skills/no-stale-format-refs.test.mjs` per the charter's Quality Attributes) enforces these grep gates. The test runs against `skills/**/*.md` (all canonical skill files), excluding the Skills Out of Scope list below.

## Skills Out of Scope

- **`/adev:init`**, **`/adev:repomap`**, **`/adev:assess`**, **`/adev:retro`**, **`/adev:codehealth`**, **`/adev:document`**, **`/adev:eval`**, **`/adev:learn`**, **`/adev:sample`**, **`/adev:prototype`**, **`/adev:deploy`** — none of these mutate lifecycle state. Untouched.
- **`/adev:recover`** — writes recovery records as `event: "recovery_record"` already; no instruction rewrite needed beyond confirming the API reference matches.
- **`/adev:route`** — read-only routing scoring of plan tasks; consumes plan-task data via `currentState(spec).planTasks` only. No lifecycle writes. Its SKILL.md may receive a small `currentState` reference (added by `plan-task-events.spec.md` adoption), but no severity/gate/board adoption work happens here.
- **`plan-reviewer-prompt.md`** (under `skills/plan/`) — reviewer-prompt file, not lifecycle skill instructions. The architectural test excludes files matching `*-prompt.md`.

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Applies directly. This spec is a markdown rewrite across the skill surface.
- **Principle:** "Hook protocol compliance" — Applies because `/adev:build` instructions reference hook entry points (e.g., `session-start.sh`) without changing the protocol — instructions only describe what the hook's Node helper returns.
- **Principle:** "Version parity" — Does NOT apply. No version bump required by this spec (cumulative version bump for the charter is handled by the rollout PR).
- **Architecture Boundary (Autonomous):** "Editing skill markdown content" — Applies. This spec is enumerated as autonomous work.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `/adev:issues` SKILL.md rewrite | Remove markdown-table column instructions. Add `getIssueManager` flow. Render path via `renderTasksMd`. | medium |
| `/adev:plan` SKILL.md + ALL `skills/plan/*-mode.md` files + `mode-router.md` | Remove `.review.md` grep prose. Add `requireGate` gate on `step: "review"` as the first action. Reference `reportStep` at entry/exit. Plan-task emission is owned by `plan-task-events.spec.md` — this row only touches the non-plan-task instruction surface. | medium |
| `/adev:implement` SKILL.md | Remove plan-checkbox mutation prose. Add `requireGate` gate on `step: "plan"` as the first action. Reference `reportStep` and `reportIntervention`. Plan-task adoption (`reportPlanTask` calls) is owned by `plan-task-events.spec.md`; cross-reference it but do not duplicate the prose. | medium |
| Promote `lib/manifest.mjs::loadManifest` | Lift `loadManifestForStorage` from `lib/migrate-state-artifacts.mjs` (or whichever copy is canonical) to `lib/manifest.mjs` as a public named export `loadManifest`. Update the three existing call sites (`migrate-state-artifacts`, `milestones`, `issues/render-markdown`) to import from the new shared module. Preserve path-containment semantics. | small |
| `/adev:work` SKILL.md | Replace tasks.md parsing prose with `getIssueManager(manifest).list({ status: "open" })` flow. Replace `.execution-state.md` references with `lib/execution-state.mjs` API. Plan-task language reinforced per `plan-task-events.spec.md` (cross-reference, do not duplicate). | medium |
| `/adev:specify` SKILL.md | Add `reportStep` at entry/exit only. Charter capability-map mutation prose is acknowledged dual-write (charter Out-of-Scope) and is NOT touched here. Step 5.6 Issue creation prose is unchanged but reinforced (Issue carries `spec_ref` only — never `planRef` + `planTask`). | small |
| `/adev:validate` SKILL.md | Replace prior-validation-file parse prose with `currentState(spec).steps.validate`. Add `reportValidator` flow for each validator. Gate on `step: "implement"`. | medium |
| `/adev:reconcile` SKILL.md | Add the `collapse-per-task-issues` operation reference (defined in `issue-board-granularity-cleanup.spec.md`). Replace direct-file repair prose with manager calls. | medium |
| `/adev:debug` SKILL.md | Replace debug-log append prose with `reportIntervention`. Replace `.review.md` reads with `currentState`. | small |
| `/adev:status` SKILL.md | Replace `tasks.md` parsing with `getIssueManager(manifest).list`. Replace per-spec build-state JSON reads with `listLifecycleStates`. | medium |
| `/adev:hygiene` SKILL.md | Replace tasks.md and build-state coverage scans with manager + `listLifecycleStates` calls. | medium |
| `/adev:research` SKILL.md | Replace Issue creation prose with `getIssueManager`. | small |
| `/adev:sync` SKILL.md | Update the constitution-sync references for the `Build state` → `Lifecycle state` row (already done in the constitution itself; this is a skill-instruction follow-up). | small |
| `/adev:build` SKILL.md + ALL `skills/build/*-mode.md` files (`resume-mode.md`, `charter-mode.md`, `milestone-mode.md`, `workspace-mode.md`) | Add `requireGate` between every chained sub-skill invocation. `resume-mode.md` uses `currentState` to discover the next step. | medium |
| `/adev:review-specs` SKILL.md | Add the `reportReviewer` flow per dispatched reviewer. Gate on `step: "specify"`. | medium |
| `tests/skills/no-stale-format-refs.test.mjs` | Architectural test asserting the removed-prose audit-target list returns zero matches across `skills/**/*.md` (excluding `*-prompt.md` files and the Skills Out of Scope list). Also asserts every code snippet uses `<ADEV_ROOT>` as the plugin-root placeholder. | small |
| Inline API-reference appendix | Each updated SKILL.md gains a short "API reference" section at the bottom linking to `lib/lifecycle-state.mjs` and `lib/issues/json-adapter.mjs` with one-line summaries, to anchor the agent's mental model. | small |

## Acceptance Criteria

- [ ] Every skill in the charter's enumerated list is rewritten per its task above. No skill instruction tells the agent to parse `tasks.md`, grep `.review.md`, or hand-edit `.execution-state.md`.
- [ ] All `skills/plan/*.md` mode files AND `skills/build/*.md` mode files are covered, including ones not listed in the charter's original capability description.
- [ ] `tests/skills/no-stale-format-refs.test.mjs` runs in CI and passes (zero matches for the audit-target list against `skills/**/*.md` excluding `*-prompt.md`).
- [ ] Every gate in `/adev:plan`, `/adev:implement`, `/adev:validate`, `/adev:build`, `/adev:review-specs` is described in prose as a `requireGate` call positioned as the first action in the skill.
- [ ] Every reviewer / validator / debug-intervention write in skill prose calls the corresponding convenience writer (`reportReviewer` / `reportValidator` / `reportIntervention`).
- [ ] No skill prose restates severity sources (`reviewers.yaml::severity_cap`, `gates.yaml::severity`); it cross-references `lifecycle-event-log.spec.md` instead.
- [ ] No skill prose pre-validates or normalizes paths; the lib enforces containment.
- [ ] No skill prose contains `last-reviewed-revision:`, `file-sha:`, or `git hash-object` references.
- [ ] Every code snippet in skill prose uses `<ADEV_ROOT>` as the plugin-root placeholder.
- [ ] The "API reference" appendix is present at the bottom of each updated SKILL.md.
- [ ] `lib/manifest.mjs` exports `loadManifest(projectRoot)` and the three former private call sites import from it.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.

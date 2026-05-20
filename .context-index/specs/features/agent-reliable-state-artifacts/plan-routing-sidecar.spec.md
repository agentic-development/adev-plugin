# Live Spec: Plan-Routing Sidecar (`.routing.md`)

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     Resolves issue-526 (/adev:route plan mutation) and the CON-8 violation
     surfaced by tests/skills/plan-task-immutability.test.mjs.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
     Related ADR: .context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md -->

---
charter: agent-reliable-state-artifacts
kind: behavioral
status: implemented
risk_level: medium
revision: 1
charter-revision: 8
created: 2026-05-19
updated: 2026-05-20
source-manifest:
  sha: "b3dac14"
  files:
    - .context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md
    - .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
    - cli/index.mjs
    - lib/cli/implement.mjs
    - lib/cli/route.mjs
    - lib/plan-immutability.mjs
    - lib/plan-routing-sidecar.mjs
    - skills/implement/SKILL.md
    - skills/route/SKILL.md
    - tests/adrs/0012-status.test.mjs
    - tests/cli/implement-read-routing.test.mjs
    - tests/cli/route-emit-sidecar.test.mjs
    - tests/fixtures/plan-immutability/clean-plan/.context-index/lifecycle-state/foo.jsonl
    - tests/fixtures/plan-immutability/clean-plan/.context-index/specs/features/x/foo.plan.md
    - tests/fixtures/plan-immutability/mutate-then-single-add/.context-index/lifecycle-state/foo.jsonl
    - tests/fixtures/plan-immutability/mutate-then-single-add/.context-index/specs/features/x/foo.plan.md
    - tests/fixtures/plan-immutability/sidecar-present-plus-inline/.context-index/lifecycle-state/foo.jsonl
    - tests/fixtures/plan-immutability/sidecar-present-plus-inline/.context-index/specs/features/x/foo.plan.md
    - tests/fixtures/plan-immutability/sidecar-present-plus-inline/.context-index/specs/features/x/foo.routing.md
    - tests/lib/plan-routing-sidecar.test.mjs
    - tests/skills/implement.test.mjs
    - tests/skills/plan-task-immutability.test.mjs
    - tests/skills/route.test.mjs
    - tests/specs/plan-task-events-con8.test.mjs
  computed-at: "2026-05-20T02:57:56.751Z"
---

## Behavioral Contract

`/adev:route` MUST NOT mutate the plan markdown body. Routing decisions (selected agent, four-dimension scores, rationale) are persisted to a sibling sidecar file `<plan-stem>.routing.md` keyed by `task_id`. `/adev:implement` reads routing from this sidecar — never from inline annotations in the plan body. The detector in `lib/plan-immutability.mjs` is extended so it catches the "mutate-then-single-add-commit" pattern (inline `**Routing:**` blocks present in the plan body with no sibling `.routing.md`) regardless of git history. The `plan-task-events.spec.md` invariant CON-8 is amended to explicitly enumerate the four permitted sidecar peers (`.review.md`, `.validate.md`, `.routing.md`, `.blockers.md`) so future readers cannot mistake a `<stem>.routing.md` for a CON-8 violation.

### Preconditions

- The plan file exists at `<plan-stem>.plan.md` and was authored by `/adev:plan` (i.e., one `plan_task` event per task already exists in the lifecycle log).
- The plan task table carries stable `task_id` anchors (`t1`, `t2`, …) per `plan-task-events.spec.md` CON-3.
- The active charter's parent module appears under `.context-index/specs/features/<module>/`.
- For detector behavior: the project root is a git working tree (the detector reads `git log` and the working tree).

### Behaviors

1. **When** `/adev:route` runs Step 4 against a plan with N tasks, **then** it writes a single file `<plan-stem>.routing.md` containing one per-task entry per task. The plan markdown body is NOT modified; its mtime and content hash are unchanged across the run.
2. **When** `/adev:route` writes `<plan-stem>.routing.md`, **then** each per-task entry carries the fields: `task_id` (matching the plan's anchor), `selected_agent` (specialist slug or `auto-agent` / `assisted-agent` / `human-only`), `scores` (object with the four routing dimensions: `spec_completeness`, `pattern_coverage`, `blast_radius`, `novelty`, each `0..1`), and `rationale` (short prose, ≤ 400 chars).
3. **When** `/adev:route` is re-run on the same plan, **then** `<plan-stem>.routing.md` is fully rewritten (writer-owned, not append-only). The earlier file is replaced atomically via temp-then-rename. No history is preserved inside the sidecar; consult git history for prior runs.
4. **When** `/adev:implement` looks up the routing for `task_id`, **then** it parses `<plan-stem>.routing.md`, locates the entry whose `task_id` matches, and uses `selected_agent` to dispatch the subagent. It never reads `**Routing:**` blocks from the plan body, even if present.
5. **When** `/adev:implement` looks up routing and the sidecar is missing, **then** it errors with `ROUTING_SIDECAR_MISSING` and instructs the user to run `/adev:route` against the plan. It does not silently fall back to inline parsing.
6. **When** the plan-immutability detector runs against a plan, **then** it flags a violation if the plan body contains an inline `**Routing:**`, `**Scores:**`, or `**Rationale:**` block AND no sibling `<plan-stem>.routing.md` exists at the same path. This check is independent of git history — it catches plans committed as a single add commit.
7. **When** the plan-immutability detector runs against a plan that has a sibling `<plan-stem>.routing.md`, **then** inline `**Routing:**` blocks are tolerated (treated as legacy / migration noise) but the per-task M-commit history check still applies. Migration commits stamped in `manifest.yaml :: hygiene.plan_immutability.exempt_commits[]` are exempted as usual.
8. **When** any consumer reads `plan-task-events.spec.md` invariant CON-8 after this spec lands, **then** the prose explicitly enumerates the four permitted sidecar peers: `.review.md`, `.validate.md`, `.routing.md`, `.blockers.md`. Adding a fifth peer requires an ADR amendment per ADR-0012.

### Postconditions

- After `/adev:route` runs, `<plan-stem>.routing.md` exists and validates against the per-task schema; the plan body is byte-identical to its pre-run state.
- After `/adev:implement` dispatches task `tN`, the dispatched subagent matches the `selected_agent` recorded in the sidecar for `tN`.
- After the detector enhancement lands, `tests/skills/plan-task-immutability.test.mjs` (and any new fixtures added by this spec) pass against both clean plans and the cursor-provider-style mutate-then-single-add fixtures.
- After CON-8 is amended, the four sidecar peers are normative documentation in `plan-task-events.spec.md`; the ADR-0012 cross-reference is in place; future skills authoring a fifth peer fail review until an ADR amendment lands.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `/adev:route` Step 4 attempts to write inline `**Routing:**` into plan body | Refuse; no plan mutation; write only the sidecar | (skill-level guard, no code path exists) |
| `<plan-stem>.routing.md` write fails mid-rename | Temp file left for inspection; surface error; do not commit a partial sidecar | `SIDECAR_WRITE_FAILED` |
| `/adev:implement` runs and `<plan-stem>.routing.md` is missing | Stop with clear message; instruct user to run `/adev:route` | `ROUTING_SIDECAR_MISSING` |
| `/adev:implement` runs and `<plan-stem>.routing.md` has no entry for `task_id` | Stop with clear message; instruct user to re-run `/adev:route` | `ROUTING_ENTRY_MISSING` |
| `/adev:implement` runs and sidecar entry's `selected_agent` is not a registered specialist or routing token | Stop with clear message; instruct user to re-run `/adev:route` | `ROUTING_AGENT_INVALID` |
| Plan body contains inline `**Routing:**` block AND no sibling `<plan-stem>.routing.md` | Detector flags `PLAN_MUTATED_WITHOUT_SIDECAR` violation | `PLAN_MUTATED_WITHOUT_SIDECAR` |
| CON-8 consumer encounters a sidecar peer not in the enumerated set (`review` / `validate` / `routing` / `blockers`) | Hygiene flags as `UNKNOWN_SIDECAR_PEER` advisory | `UNKNOWN_SIDECAR_PEER` (advisory) |

## System Constitution Reference

- **Principle: "Minimize external dependencies — prefer Node.js built-ins."** — The sidecar parser and writer use `fs.writeFile` + temp-then-rename (the atomic-write pattern already exercised by `lib/build-state.mjs`). The detector enhancement uses `fs.existsSync` + the existing markdown grep already in `lib/plan-immutability.mjs`. No new dependency.
- **Principle: "Skills are primarily markdown — companion code allowed but skill must not require it for function."** — `/adev:route` and `/adev:implement` SKILL.md files are updated to name `adev route emit-sidecar` / `adev implement read-routing` CLI verbs (or equivalent lib helpers). The skill prose remains the source of truth; the CLI verbs are descriptive references per the cli-driver-surface charter's anti-pattern boundary.
- **Charter invariant: "Plan markdown is read-only after authoring." (CON-8)** — This spec resolves the only known existing violation of CON-8 (`/adev:route` Step 4) and tightens the detector so future violations are caught regardless of git-history shape.
- **ADR-0012 acceptance gate** — Three of ADR-0012's "Consequences → Acceptance criteria for Accepted status" are this spec's outcome: (a) `/adev:route` no longer mutates plans; (b) CON-8 enumerates the four peers; (c) the detector catches the mutate-then-single-add pattern. Landing this spec is the precondition for flipping ADR-0012 from Proposed to Accepted.

## Actionable Task Map

<!-- Preliminary breakdown. /adev:plan refines into a detailed plan with TDD ordering. -->

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Sidecar schema + writer lib | `lib/plan-routing-sidecar.mjs` exports `writeRoutingSidecar(planPath, entries)` and `readRoutingSidecar(planPath)`. Atomic write; schema validation on read. | small |
| `adev route emit-sidecar` CLI verb | New subcommand wrapping the writer for `/adev:route` Step 4. | small |
| `adev implement read-routing` CLI verb | New subcommand wrapping the reader for `/adev:implement` task dispatch. Handles all four error codes. | small |
| `/adev:route` SKILL.md Step 4 rewrite | Replace plan-mutation directive with sidecar-write directive. Update integration note pointing `/adev:implement` at the sidecar. Tighten Red Flag section. | small |
| `/adev:implement` SKILL.md reader update | Replace inline `**Routing:**` parsing with sidecar read. Handle missing-sidecar error path. | small |
| `plan-task-events.spec.md` CON-8 amendment | Enumerate the four permitted peers; cross-reference ADR-0012. Bump revision. | small |
| Plan-immutability detector enhancement | Extend `lib/plan-immutability.mjs` to flag `PLAN_MUTATED_WITHOUT_SIDECAR` when inline `**Routing:**` is present and sidecar is absent. Update tests. | medium |
| Test fixtures | Mutate-then-single-add fixture (mirrors cursor-provider Specs A–E shape); clean-plan fixture; sidecar-present-plus-inline fixture. | small |
| ADR-0012 transition | Flip ADR-0012 from Proposed to Accepted with a footnote citing this spec's path. | small |

## Acceptance Criteria

- [ ] `/adev:route` Step 4 writes `<plan-stem>.routing.md` and leaves the plan file byte-identical (verified by hash comparison in test).
- [ ] `<plan-stem>.routing.md` contains one entry per task with `task_id`, `selected_agent`, `scores` (4 dimensions), `rationale`.
- [ ] `/adev:implement` dispatches the subagent named in the sidecar; missing sidecar / missing entry / invalid agent all fail with the documented error codes.
- [ ] `plan-task-events.spec.md` CON-8 enumerates the four permitted sidecar peers; ADR-0012 cross-reference is present.
- [ ] `lib/plan-immutability.mjs` flags `PLAN_MUTATED_WITHOUT_SIDECAR` for plans with inline `**Routing:**` blocks and no sibling `.routing.md`, independent of `--diff-filter=M` history.
- [ ] `tests/skills/plan-task-immutability.test.mjs` (and any new fixtures) pass against clean plans, mutate-then-single-add fixtures, and sidecar-present fixtures.
- [ ] ADR-0012 status flips from Proposed to Accepted once this spec is implemented and validated.
- [ ] Out of scope (separately tracked): migration of the 5 existing cursor-provider plans (`hook-config-generator`, `cursor-adapter`, `plugin-manifest-and-parity`, `cli-install-integration`, `sync-target-output`). This spec MUST work with un-migrated plans (detector flags them; migration is a follow-up).
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.

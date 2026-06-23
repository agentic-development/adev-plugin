---
charter: agent-reliable-state-artifacts
kind: behavioral
status: review-pending
risk_level: medium
revision: 2
charter-revision: 8
created: 2026-05-19
updated: 2026-05-20
---

# Live Spec: Plan-Routing Sidecar (`.routing.json`)

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     Resolves issue-526 (/adev:route plan mutation) and the CON-8 violation
     surfaced by tests/skills/plan-task-immutability.test.mjs.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
     Related ADR: .context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md

     Revision history:
       rev 1 (2026-05-19): initial — markdown sidecar with fenced-YAML blocks per task.
       rev 2 (2026-05-20): pre-ship correction — switch from markdown to JSON for
         the persisted sidecar; add `adev route render-sidecar` for the on-demand
         markdown view. Rationale: routing data is relational/structured (18+ entries
         each with 4 numeric dimensions), matching the charter's "JSON for relational
         state" principle. Markdown-with-fenced-YAML required two parses (markdown →
         YAML); native JSON is one. ADR-0012 amended in lockstep to generalise the
         naming convention to `<stem>.<purpose>.<ext>` with `.md` for human-primary
         and `.json` for machine-primary sidecars. -->

## Behavioral Contract

`/adev:route` MUST NOT mutate the plan markdown body. Routing decisions (selected agent, four-dimension scores, rationale) are persisted to a sibling sidecar file `<plan-stem>.routing.json` keyed by `task_id`. The persisted format is JSON (machine-primary); a human-readable markdown view is produced on demand by `adev route render-sidecar`. `/adev:implement` reads routing from the JSON sidecar — never from inline annotations in the plan body. The detector in `lib/plan-immutability.mjs` flags the "mutate-then-single-add-commit" pattern (inline `**Routing:**` blocks present in the plan body with no sibling `<plan-stem>.routing.json`) regardless of git history. The `plan-task-events.spec.md` invariant CON-8 enumerates the four permitted sidecar peers (`.review.md`, `.validate.md`, `.routing.json`, `.blockers.md`) and explicitly accepts the mixed-extension convention per ADR-0012.

### Preconditions

- The plan file exists at `<plan-stem>.plan.md` and was authored by `/adev:plan` (i.e., one `plan_task` event per task already exists in the lifecycle log).
- The plan task table carries stable `task_id` anchors (`t1`, `t2`, …) per `plan-task-events.spec.md` CON-3.
- The active charter's parent module appears under `.context-index/specs/features/<module>/`.
- For detector behavior: the project root is a git working tree (the detector reads `git log` and the working tree).

### Behaviors

1. **When** `/adev:route` runs Step 4 against a plan with N tasks, **then** it writes a single file `<plan-stem>.routing.json` containing one entry per task. The plan markdown body is NOT modified; its mtime and content hash are unchanged across the run.
2. **When** `/adev:route` writes `<plan-stem>.routing.json`, **then** the file is a JSON document with shape `{ version: 1, _generated_by: "<header string>", entries: [...] }` where each entry carries the fields: `task_id` (matching the plan's anchor), `selected_agent` (specialist slug or `auto-agent` / `assisted-agent` / `human-only`), `scores` (object with the four routing dimensions: `spec_completeness`, `pattern_coverage`, `blast_radius`, `novelty`, each `0..1`), and `rationale` (short prose, ≤ 400 chars).
3. **When** `/adev:route` is re-run on the same plan, **then** `<plan-stem>.routing.json` is fully rewritten (writer-owned, not append-only). The earlier file is replaced atomically via temp-then-rename. Entries are emitted sorted by `task_id` ascending with deterministic key order so re-runs produce byte-identical output for identical input.
4. **When** `/adev:implement` looks up the routing for `task_id`, **then** it parses `<plan-stem>.routing.json` (single `JSON.parse`), locates the entry whose `task_id` matches, and uses `selected_agent` to dispatch the subagent. It never reads `**Routing:**` blocks from the plan body, even if present.
5. **When** `/adev:implement` looks up routing and the sidecar is missing, **then** it errors with `ROUTING_SIDECAR_MISSING` and instructs the user to run `/adev:route` against the plan. It does not silently fall back to inline parsing.
6. **When** the plan-immutability detector runs against a plan, **then** it flags a violation if the plan body contains an inline `**Routing:**`, `**Scores:**`, or `**Rationale:**` block AND no sibling `<plan-stem>.routing.json` exists at the same path. This check is independent of git history — it catches plans committed as a single add commit.
7. **When** the plan-immutability detector runs against a plan that has a sibling `<plan-stem>.routing.json`, **then** inline `**Routing:**` blocks are tolerated (treated as legacy / migration noise) but the per-task M-commit history check still applies. Migration commits stamped in `manifest.yaml :: hygiene.plan_immutability.exempt_commits[]` are exempted as usual.
8. **When** any consumer reads `plan-task-events.spec.md` invariant CON-8 after this spec lands, **then** the prose explicitly enumerates the four permitted sidecar peers — `.review.md`, `.validate.md`, `.routing.json`, `.blockers.md` — and notes that machine-primary sidecars (currently routing) use `.json` while human-primary sidecars use `.md`. Adding a fifth peer requires an ADR amendment per ADR-0012.
9. **When** an operator runs `adev route render-sidecar --plan <plan-path>`, **then** the CLI verb reads the JSON sidecar and writes a human-readable markdown table to stdout. The persisted JSON file is unchanged; no file is written. This mirrors the `markdown-rendering-layer` pattern used by `tasks.json` and the lifecycle log.

### Postconditions

- After `/adev:route` runs, `<plan-stem>.routing.json` exists and validates against the per-task schema (`version: 1`, `entries[]` with the four required fields per entry); the plan body is byte-identical to its pre-run state.
- After `/adev:implement` dispatches task `tN`, the dispatched subagent matches the `selected_agent` recorded in the sidecar for `tN`.
- After the detector enhancement lands, `tests/skills/plan-task-immutability.test.mjs` (and any new fixtures added by this spec) pass against both clean plans and the cursor-provider-style mutate-then-single-add fixtures.
- After CON-8 is amended, the four sidecar peers are normative documentation in `plan-task-events.spec.md`; the ADR-0012 cross-reference is in place; future skills authoring a fifth peer fail review until an ADR amendment lands.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `/adev:route` Step 4 attempts to write inline `**Routing:**` into plan body | Refuse; no plan mutation; write only the sidecar | (skill-level guard, no code path exists) |
| `<plan-stem>.routing.json` write fails mid-rename | Temp file left for inspection; surface error; do not commit a partial sidecar | `SIDECAR_WRITE_FAILED` |
| `<plan-stem>.routing.json` is present but unparseable or has wrong schema version | Stop with clear message; do NOT silently fall back to inline parsing | `INVALID_SIDECAR_JSON` |
| `/adev:implement` runs and `<plan-stem>.routing.json` is missing | Stop with clear message; instruct user to run `/adev:route` | `ROUTING_SIDECAR_MISSING` |
| `/adev:implement` runs and `<plan-stem>.routing.json` has no entry for `task_id` | Stop with clear message; instruct user to re-run `/adev:route` | `ROUTING_ENTRY_MISSING` |
| `/adev:implement` runs and sidecar entry's `selected_agent` is not a registered specialist or routing token | Stop with clear message; instruct user to re-run `/adev:route` | `ROUTING_AGENT_INVALID` |
| Plan body contains inline `**Routing:**` block AND no sibling `<plan-stem>.routing.json` | Detector flags `PLAN_MUTATED_WITHOUT_SIDECAR` violation | `PLAN_MUTATED_WITHOUT_SIDECAR` |
| CON-8 consumer encounters a sidecar peer not in the enumerated set (`review` / `validate` / `routing` / `blockers`) | Hygiene flags as `UNKNOWN_SIDECAR_PEER` advisory | `UNKNOWN_SIDECAR_PEER` (advisory) |

## System Constitution Reference

- **Principle: "Minimize external dependencies — prefer Node.js built-ins."** — The sidecar writer uses `fs.writeFile` + temp-then-rename (the atomic-write pattern already exercised by `lib/build-state.mjs`) and native `JSON.stringify` / `JSON.parse`. The detector enhancement uses `fs.existsSync` + the existing markdown grep already in `lib/plan-immutability.mjs`. No new dependency.
- **Principle: "Skills are primarily markdown — companion code allowed but skill must not require it for function."** — `/adev:route` and `/adev:implement` SKILL.md files name the `adev route emit-sidecar` / `adev route render-sidecar` / `adev implement read-routing` CLI verbs. The skill prose remains the source of truth; the CLI verbs are descriptive references per the cli-driver-surface charter's anti-pattern boundary.
- **Charter principle: "JSON for relational state."** — The `agent-reliable-state-artifacts` charter establishes JSON as the canonical format for relational/structured state (the same reasoning that drove `tasks.md` → `tasks.json`). Routing data — 18+ entries each with 4 numeric dimensions plus categorical fields — is relational, not narrative. Rev 2 of this spec brings the routing sidecar in line with that principle.
- **Charter invariant: "Plan markdown is read-only after authoring." (CON-8)** — This spec resolves the only known existing violation of CON-8 (`/adev:route` Step 4) and tightens the detector so future violations are caught regardless of git-history shape.
- **ADR-0012 acceptance gate** — All four of ADR-0012's "Consequences → Acceptance criteria for Accepted status" are this spec's outcome: (a) `/adev:route` no longer mutates plans; (b) CON-8 enumerates the four peers; (c) the detector catches the mutate-then-single-add pattern; (d) the naming convention is generalised to `<stem>.<purpose>.<ext>` for the mixed-extension peer set. Landing rev 2 satisfies the ADR's amendment-2026-05-20 amendment.

## Actionable Task Map

<!-- Preliminary breakdown. /adev:plan refines into a detailed plan with TDD ordering. -->

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Sidecar schema + writer lib | `lib/plan-routing-sidecar.mjs` exports `writeRoutingSidecar(planPath, entries)`, `readRoutingSidecar(planPath)`, and `renderRoutingMarkdown(entries)`. Atomic write; schema validation on read; deterministic key order. | small |
| `adev route emit-sidecar` CLI verb | Wraps the writer for `/adev:route` Step 4. JSON in, JSON out. | small |
| `adev route render-sidecar` CLI verb | New verb: reads `<plan-stem>.routing.json` and prints a markdown table to stdout. No file write. | small |
| `adev implement read-routing` CLI verb | Wraps the reader for `/adev:implement` task dispatch. Handles all error codes including `INVALID_SIDECAR_JSON`. | small |
| `/adev:route` SKILL.md Step 4 rewrite | Replace plan-mutation directive with sidecar-write directive; reference both `emit-sidecar` and `render-sidecar`. Tighten Red Flag section. | small |
| `/adev:implement` SKILL.md reader update | Replace inline `**Routing:**` parsing with sidecar read via `adev implement read-routing`. Handle missing-sidecar error path. | small |
| `plan-task-events.spec.md` CON-8 amendment | Enumerate the four permitted peers with their extensions; cross-reference ADR-0012. Bump revision. | small |
| Plan-immutability detector enhancement | Extend `lib/plan-immutability.mjs` to flag `PLAN_MUTATED_WITHOUT_SIDECAR` when inline `**Routing:**` is present and `<stem>.routing.json` is absent. Update tests/fixtures. | medium |
| Test fixtures | Mutate-then-single-add fixture (mirrors cursor-provider Specs A–E shape); clean-plan fixture; sidecar-present-plus-inline fixture (uses `.routing.json`). | small |
| ADR-0012 transition | Flip ADR-0012 from Proposed to Accepted with a footnote citing this spec's path; amend the naming convention to `<stem>.<purpose>.<ext>`. | small |

## Acceptance Criteria

- [ ] `/adev:route` Step 4 writes `<plan-stem>.routing.json` and leaves the plan file byte-identical (verified by hash comparison in test).
- [ ] `<plan-stem>.routing.json` parses as a single `JSON.parse` call and validates against the per-task schema (`version: 1`, `entries[]` each with `task_id`, `selected_agent`, `scores` 4 dimensions, `rationale`).
- [ ] `/adev:implement` dispatches the subagent named in the sidecar; missing sidecar / missing entry / invalid agent / invalid JSON all fail with the documented error codes.
- [ ] `adev route render-sidecar --plan <path>` reads the JSON sidecar and prints a markdown table to stdout; no file write occurs.
- [ ] `plan-task-events.spec.md` CON-8 enumerates the four permitted sidecar peers with their extensions (`.review.md`, `.validate.md`, `.routing.json`, `.blockers.md`); ADR-0012 cross-reference is present.
- [ ] `lib/plan-immutability.mjs` flags `PLAN_MUTATED_WITHOUT_SIDECAR` for plans with inline `**Routing:**` blocks and no sibling `.routing.json`, independent of `--diff-filter=M` history.
- [ ] `tests/lib/plan-routing-sidecar.test.mjs` exercises JSON write/read roundtrip, schema-version mismatch, malformed JSON, deterministic output, and atomic-rename failure.
- [ ] `tests/skills/plan-task-immutability.test.mjs` (and any new fixtures) pass against clean plans, mutate-then-single-add fixtures, and sidecar-present fixtures using `.routing.json`.
- [ ] ADR-0012 status is `Accepted` with the rev-2 amendment paragraph noting the `<stem>.<purpose>.<ext>` generalisation.
- [ ] Out of scope (separately tracked): migration of the 5 existing cursor-provider plans (`hook-config-generator`, `cursor-adapter`, `plugin-manifest-and-parity`, `cli-install-integration`, `sync-target-output`). This spec MUST work with un-migrated plans (detector flags them; migration is a follow-up).
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.

---
charter: test-strategies
status: validated
kind: behavioral
risk_level: medium
milestone:
revision: 7
charter-revision: 3
created: 2026-08-10
updated: 2026-08-13
charter-extension: true
affects:
  - planning
  - implementation
  - design
  - setup
  - maintenance
  - strategic-planning
source-manifest:
  sha: "f665551"
  files:
    - .context-index/governance/risk-policies.yaml
    - .context-index/governance/sensitive-paths.yaml
    - .context-index/specs/features/spec-lifecycle/plan-test-mapping-rev-2-test-depth-granularity.spec.md
    - .context-index/specs/features/test-strategies/charter.md
    - .context-index/specs/features/test-strategies/test-depth-policy.spec.md
    - cli/index.mjs
    - docs/README.md
    - docs/cli-reference.md
    - docs/configuration.md
    - docs/getting-started.md
    - docs/governance.md
    - docs/test-strategies.md
    - lib/cli/test-policy.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/governance/rigor-mode.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - lib/test-strategies/depth.mjs
    - lib/test-strategies/policy.mjs
    - lib/test-strategies/sensitive-paths.mjs
    - lib/test-strategies/suite-path.mjs
    - lib/test-strategies/task-files.mjs
    - providers/codex/skills/hygiene/SKILL.md
    - providers/codex/skills/implement/SKILL.md
    - providers/codex/skills/init/SKILL.md
    - providers/codex/skills/plan/SKILL.md
    - providers/codex/skills/specify/SKILL.md
    - providers/codex/skills/status/SKILL.md
    - providers/codex/skills/write-test/SKILL.md
    - providers/opencode/skills/hygiene/SKILL.md
    - providers/opencode/skills/implement/SKILL.md
    - providers/opencode/skills/init/SKILL.md
    - providers/opencode/skills/plan/SKILL.md
    - providers/opencode/skills/specify/SKILL.md
    - providers/opencode/skills/status/SKILL.md
    - providers/opencode/skills/write-test/SKILL.md
    - skills/hygiene/SKILL.md
    - skills/implement/SKILL.md
    - skills/init/SKILL.md
    - skills/plan/SKILL.md
    - skills/specify/SKILL.md
    - skills/status/SKILL.md
    - skills/write-test/SKILL.md
    - templates/manifest-template.yaml
    - templates/risk-policies-template.yaml
    - tests/cli/status-test-depth-counting.test.mjs
    - tests/cli/test-policy.test.mjs
    - tests/diagnostics/event-schemas.test.mjs
    - tests/docs/test-depth-policy-docs.test.mjs
    - tests/governance/rigor-mode-test-depth.test.mjs
    - tests/lib/governance/sensitive-paths-self-hosting.test.mjs
    - tests/lib/lifecycle-events.test.mjs
    - tests/lib/lifecycle-state.test.mjs
    - tests/lib/test-strategies/depth.test.mjs
    - tests/lib/test-strategies/policy.test.mjs
    - tests/lib/test-strategies/sensitive-paths.test.mjs
    - tests/lib/test-strategies/suite-path.test.mjs
    - tests/lib/test-strategies/task-files.test.mjs
    - tests/skills/hygiene-test-policy-drift-pass.test.mjs
    - tests/skills/implement-test-depth-integration.test.mjs
    - tests/skills/init-test-policy-emission.test.mjs
    - tests/skills/plan-test-depth-integration.test.mjs
    - tests/skills/specify-test-depth-frontmatter.test.mjs
    - tests/skills/write-test-standalone-depth.test.mjs
    - tests/specs/plan-test-mapping-amendment.test.mjs
    - tests/specs/test-strategies-charter-revision-3.test.mjs
  computed-at: "2026-08-13T01:22:53.638Z"
drift_detected: true
---

# Live Spec: Test Depth Policy and Escalation-Only Coverage Scaling

<!-- Live Spec within the test-strategies charter.
     Parent Charter: .context-index/specs/features/test-strategies/charter.md

     CHARTER EXTENSION: the charter governs *which kind* of test applies (the 9 strategies),
     not *how much*. Charter revision 3 must land in the same change: capability row,
     qualified Out of Scope line, governance dependency, the TestDepthAssignment entity, and
     the `Spec test_depth field | design` Consumed-API row alongside the existing
     `Spec test_strategy field`. `charter-revision:` stays at 2 (the charter's actual current
     revision) per repo convention — it is bumped when the charter edit lands, not before.

     `affects:` is additive breadth metadata naming manifest module slugs. This is NOT a
     cross-cutting spec: it keeps its charter anchor and its features/ path, because
     skills/hygiene/SKILL.md:518 scans only specs/features/ and relocating would drop it from
     revision and charter-drift auditing.

     Revision history (details in the lifecycle log and prior .review.md rounds):
     - Rev 6 DESCOPED end-to-end floor enforcement. The floor assigns and records depth; it
       does not verify suites. Filed as issue-559 on the shared task board (this repo is a
       worktree of adev-plugin; the board lives at the main repo's
       .context-index/tasks/tasks.json). See Scope Boundary.
     - Rev 7 unifies the missing-floor-input policy to degrade-with-record (MISSING_FLOOR_INPUT
       is removed), keys the **Files:** parse per task including the inline label form, and
       persists `floor_inputs` in the assignment payload and ADR-0017 §4.
     - Revs 1-5 statements superseded by the descope (e.g. "enforced end-to-end", the shared
       rigor floor, fail-closed floor inputs) are historical; where a prior claim was wrong,
       the correction is recorded inline in the section that replaced it. -->

## Capability

Declarative, risk-scaled control over how much test coverage a change warrants (`depth`) and
how test suites map onto units of change (`granularity`), with routing complexity able to
escalate depth upward but never reduce it, and a **sensitive-path floor** that raises the
depth assigned to security-sensitive work.

**The floor is advisory, not enforced.** It determines the depth a task is *assigned* and
records that assignment; nothing in this capability verifies that the authored suite matches
it. End-to-end enforcement is deliberately out of scope — see Scope Boundary.

## Behavioral Contract

Two independent axes, resolved at different lifecycle points because they are consumed at
different points (ADR-0017):

- **Granularity** — how suites map onto units of change: `per-task`, `per-behavior`,
  `per-spec`. Consumed by `/adev:plan` when emitting each task's `**Tests:**` field, so it
  resolves at **plan time from static configuration only** — deterministic, no routing input.
- **Depth** — how many case classes a suite must cover: `minimal` (happy path plus declared
  acceptance criteria), `standard` (adds declared error cases), `thorough` (adds boundary and
  edge conditions). Resolved at **test-authoring time**, owned by `/adev:implement`.

**Routing coupling is escalation-only.** Routing complexity may raise the depth the static
chain produced; it may never lower it. Escalation is a post-chain pass, not a chain stage, so
a derived signal can never make an operator-authored override unreachable. This also bounds
the consequence of routing scores being LLM judgment rather than computed values:
non-determinism can only ever produce more coverage, never less.

**Depth never scopes test-integrity enforcement.** Depth selects which case classes the RED
phase authors; it does not select which gaming detectors run. The blocker sets in
`lib/test-strategies/gaming.mjs` are content scanners over whatever tests exist and are
**depth-invariant**.

**This spec does not modify `resolveRigorMode`.** Revision 1 wrongly claimed the safety floor
was shared with the rigor mechanism; revision 2 tried to make that true. Both are withdrawn.
`graduated-rigor-tiers` keeps its documented precedence and its shipped tests unchanged.

### Ownership

`/adev:implement` owns depth resolution for plan tasks. It already reads the routing sidecar
per task and dispatches write-test (`skills/implement/SKILL.md:362`), so it holds every input
at the moment tests are authored. It calls `adev test-policy resolve`, and passes the
resolved depth into the write-test subagent — the established pattern at
`skills/implement/SKILL.md:~378`, where `adev domain load-test-config` output is passed in the
same way. `/adev:write-test` never resolves depth; it consumes what it is given.

### Preconditions

- `.context-index/manifest.yaml`, `governance/risk-policies.yaml`, and
  `governance/boundaries.yaml` are readable and parse as YAML.
  `governance/sensitive-paths.yaml` is optional (Behavior 7).
- A plan task normally declares its target files in a `**Files:**` block; a task whose block
  is absent or yields no parseable paths resolves in the degraded mode of Behavior 8 rather
  than failing.
- For the escalation pass: `<plan-stem>.routing.json` exists and carries an entry for the
  task. Its absence means no escalation — a defined outcome, not an error.
- Strategy resolution (`resolveStrategy`) has already run.

### Behaviors

1. **When** granularity resolution runs and no `test_policy` block is declared **then** it
   returns `{ granularity: "per-behavior", source: "fallback" }` — a shipped default yielding
   fewer test artifacts than the current per-task mandate, because several tasks implementing
   one behavior share one suite.

2. **When** the manifest declares `test_policy.granularity` **then** `/adev:plan` emits
   `**Tests:**` fields accordingly: one suite path per task under `per-task`, one per spec
   behavior statement under `per-behavior`, one for the whole spec under `per-spec`. Every
   task `/adev:plan` emits carries its own `**Files:**` block (the per-task format at
   `skills/plan/SKILL.md:608`), so newly authored plans always give depth resolution its
   path inputs; granularity governs only the `**Tests:**` field.

3. **When** granularity permits reuse and a suite already covers the target behavior **then**
   `/adev:plan` emits a `**Tests:**` field referencing that existing suite and the task
   instruction reads "extend" rather than "create". Depth is not reconciled across tasks
   sharing a suite: see Known Limitations.

4. **When** `test_policy.escalation` is `true` **and** routing scores exist for the task
   **then** the escalation pass runs: each `escalation_rules` entry whose `when:` expression
   matches raises depth to that entry's level. Escalation is **monotonic upward only** — a
   matching rule naming a lower depth than the chain produced is a no-op. **When** two
   matching rules name different depths **then** the highest wins and a
   `CONFLICTING_ESCALATION_RULE` advisory names both rules. **When** `escalation` is `false`,
   or no routing entry exists, or no rule matches **then** no escalation occurs and the
   assignment records `escalated: false` with
   `escalation_skipped: "disabled" | "no-routing-entry" | "no-match"` so an operator can tell
   the three apart.

5. **When** depth is resolved for a plan task and the spec's frontmatter declares
   `test_depth:` **then** that value wins over every configured default
   (`source: "spec-declared"`), including a `modules[].test_depth` override and the
   risk-policy default. The escalation pass and floor may still raise it; nothing may lower
   it. Standalone `/adev:write-test` resolves no chain at all (Behavior 17), so this and every
   other resolution behavior below are scoped to plan-task resolution.

6. **When** any floor leg with available inputs holds during plan-task resolution **then**
   depth is floored at `thorough`, applied **last — after the chain and after escalation, in
   every resolution path within `resolveTestDepth`** — escalating only. The three legs are:
   the spec's `risk_level: high`; a boundary rule crossed per `boundaries.yaml`; and any
   target path matching the effective sensitive-path set (this last leg is skipped when the
   task's path inputs are unavailable — Behavior 8). The assignment records
   `floor_applied: true` together with `floor_legs` — the list of evaluated legs that held,
   drawn from `"risk-level" | "boundary" | "sensitive-path"`, mirroring the
   `escalation_skipped` discriminator precedent — and a `DEPTH_FLOOR_APPLIED` advisory is
   emitted whenever any evaluated **floor condition held**, whether or not the floor changed
   the resolved value: a sensitive-path task that escalation already raised to `thorough` is
   still recorded as floored, and the record names which leg fired.

7. **When** the effective sensitive-path set is computed **then** it is the union of the
   built-in `DEFAULT_SENSITIVE_PATHS` constant and any entries in
   `governance/sensitive-paths.yaml`. Configuration can extend the set and can never shrink
   it below the built-in default; an absent or empty file resolves to the built-in set, so
   upgrading a project that predates this capability never breaks. Deleting the file does
   drop every *project-added* entry — the overlay itself is not protected (Known
   Limitations). **When** `sensitive-paths.yaml` is present but unparseable, or an entry is
   not a string, **then** resolution proceeds on the built-in set alone and an
   `INVALID_SENSITIVE_PATHS` advisory names the offending file or entry — the built-in set is
   a strictly safe fallback, and halting every task over one malformed byte would be
   disproportionate to an advisory control while deleting the same file legally narrows it.

8. **When** `resolve` gathers `targetPaths` for a task **then** it parses that task's own
   `**Files:**` block and its `**Tests:**` field — per task, because the shipped format
   (`skills/plan/SKILL.md:608`) places both per task, and shipped plans cover the block only
   partially, so any rule keyed per plan misfits the format.

   **Task-region mapping.** Two heading families share the `Task N` prefix in shipped plans,
   and the *context-packet* family (`### Task N Context`, `### Task N-N Context`,
   `### Tasks 10-14 Context`, under `## Context Packets`) appears **before** the task bodies
   (under `## Task Structure`, `skills/plan/SKILL.md:420,597`) — so a naive first-match rule
   would resolve to the context packet and never reach the `**Files:**` block. The mapping
   therefore distinguishes them:

   - A heading matching `^#{2,4}\s+Task <N>\b` is **context-family** iff its remainder —
     the text after `Task <N>` — matches `^(\s*[-–]\s*\d+)?\s+Context\b` (case-sensitive):
     the word `Context` in the position the context-packet template puts it, with an
     optional range suffix (`Task 1-3 Context`). The test is positional, not a substring
     scan, because shipped task **titles** legitimately contain the word
     (`### Task 1: Context-pack library`, `### Task 2: Prototype Context Reception`) and a
     substring rule would misclassify them. A **task-body heading** for N is any
     `^#{2,4}\s+Task <N>\b` heading that is not context-family. Plural range headings
     (`### Tasks 10-14 Context`) fail the `Task <N>` pattern outright — `Tasks` is not
     `Task` — so they are never task-body headings and never open or close a region,
     whichever family they belong to.
   - `--task-id` `t<N>` resolves to the region opened by the **first task-body heading for
     N** and closed by the next task-body heading **for a different task number**, or end of
     file. Context-family headings never open or close a region; same-task sub-headings
     (`### Task N — Tests`) fall inside it.

   `<N>` is the numeric task number (`\d+`), and only `t<N>` anchors in that form
   participate in the mapping; suffixed or ranged headings (`### Task 9b:`,
   `### Tasks 7–9:`) are outside the mapping's contract — a `--task-id` targeting one
   resolves to no region and degrades visibly, and a suffixed heading neither opens nor
   closes a region (its paths, if any, fall into the enclosing numeric task's region, which
   can only widen it — the monotone-safe direction). Pinned here because no shipped artifact
   defines this join: plan bodies carry `Task N` headings while `.routing.json` keys on
   `t<N>` anchors. A `--task-id` resolving to no task-body heading yields zero paths and
   degrades exactly like an absent block. The parse
   of a resolved region:

   - scans both shipped shapes: the block form (label line followed by `Create:` / `Modify:` /
     `Test:` sub-bullets, plus unlabelled sub-bullets) and the inline form
     (`- **Files:** \`path\``, paths on the label line itself);
   - applies **one predicate to every candidate token, backticked or bare** — backticks only
     delimit a token, they are never themselves sufficient: a token is a path iff it contains
     `/` **or** its final segment matches `\.[A-Za-z0-9_-]+$` (a dot-extension; the rule covers
     leading-dot files such as `.gitignore` and `.env.production`). Everything else — prose,
     parentheticals like `(no source changes)`, backticked identifiers and flags such as
     `_acquireLock` or `--dry-run`, em-dash annotations — contributes nothing. Extension-less
     bare names (`Makefile`) are a known false negative, accepted for predicate simplicity;
   - treats sub-bullet labels as advisory, not gating: shipped plans use labels beyond the
     three named (`Delete:`, `Regenerate:`), and the token predicate — not the label — decides
     what enters `targetPaths`;
   - strips a trailing line range (`existing.ts:123-145`) before matching — the floor matches
     paths, not spans;
   - includes `Test:` sub-bullet paths and the `**Tests:**` field's paths: a test file under a
     sensitive path is itself sensitive;
   - normalises to repo-relative POSIX before matching.

   **When** the parse yields zero paths for the task — block absent, block present but
   prose-only, or inline label without a path token — **then** the sensitive-path leg is
   skipped for that task and the assignment records `floor_inputs: "unavailable"`; the
   `risk_level` and boundary legs still evaluate, and the task remains implementable.
   **When** it yields one or more paths **then** the assignment records
   `floor_inputs: "available"` — meaning **at least one** parsed path, not necessarily every
   path the task touches; a partially declared task records `"available"` on the declared
   subset.

   *Decision note.* A fail-closed alternative (hard-fail tasks without path inputs, or only
   legacy plans exempt) was considered and rejected: it either reinstates two opposite
   policies for one input class or blocks the in-flight plans whose tasks predate the block
   convention, and under an **advisory** floor a hard failure protects nothing — the record is
   the product. Degradation is instead made visible: the event field, the `floor_inputs`
   facet `explain` renders (Behavior 15), and the hygiene drift pass (Behavior 20) all
   surface it. And because the task-region mapping above resolves the task **body** — not the
   context packet — a plan emitted by the current template parses correctly, so Behavior 2's
   per-task `**Files:**` requirement means the degraded population only shrinks.

9. **When** any configured value is outside its closed enumeration — `granularity`,
   `test_depth` from any source, `escalation` (boolean), an `escalation_rules` dimension
   name, a `when:` expression against the pinned grammar, or the rule count against the cap —
   **then** resolution fails with an error naming the offending value, its source file, and
   the legal set or grammar (`INVALID_TEST_GRANULARITY`, `INVALID_TEST_DEPTH`,
   `INVALID_ESCALATION_FLAG`, `UNKNOWN_ROUTING_DIMENSION`,
   `INVALID_ESCALATION_RULE_EXPRESSION`, `ESCALATION_RULES_LIMIT_EXCEEDED`). There is no
   silent fallback for malformed *policy* — the Behavior 7 sensitive-paths fallback is safe
   because it can only widen coverage, whereas a malformed policy value could narrow it.

10. **When** `/adev:init` runs on a greenfield project **then** it writes literal scalars:
    `granularity` into `manifest.yaml` `test_policy`, and `test_depth` into
    `risk-policies.yaml` per risk level. It does **not** write `sensitive-paths.yaml` — the
    built-in default applies until a project chooses to extend it. An emitted block containing
    an unsubstituted `{{ }}` placeholder or a commented-out policy fails init with
    `UNSUBSTITUTED_POLICY_PLACEHOLDER` naming the offending field.

11. **When** `/adev:init --brownfield` runs on a repo with an existing test suite **then** it
    infers granularity from the existing layout and proposes that inferred value instead of
    the domain default, labelling it inferred and naming the evidence.

12. **When** `adev test-policy resolve --plan <path> --task-id <id>` runs **then** it resolves
    depth through chain → escalation → floor, prints the assignment as JSON, and appends the
    `test_depth_assigned` event. Before any append it validates `--task-id` against
    `^[a-z0-9][a-z0-9._-]{0,63}$` — pinned here because no shipped artifact defines a
    plan-anchor grammar (`plan-task-events.spec.md` calls `t1`/`t2` "typical" and
    `lib/plan-routing-sidecar.mjs` accepts any non-empty string) — raising `INVALID_TASK_ID`
    on mismatch; rejects a `--plan` path resolving outside the project root with
    `PATH_OUTSIDE_ROOT` (the shipped code, `lib/source-manifest.mjs:60`, already uses this
    name); and refuses to run at a workspace root (`detectWorkspace()` reporting
    `currentRepoSlug === null`, per ADR-0005) with `WORKSPACE_ROOT_REFUSED`. This verb is the
    **sole writer** of `test_depth_assigned`; no generic event-append verb may be introduced.

13. **When** depth is resolved for a plan task **then** a `test_depth_assigned` event is
    appended carrying
    `{ plan, task_id, depth, source, escalated, escalation_skipped?, floor_applied, floor_legs, floor_inputs, dimensions? }`
    (`floor_legs` is the possibly-empty list of evaluated floor legs that held).
    A task may accumulate **more than one** such event across re-routes and recovery
    re-invocations; the event log is append-only and never rewritten. Where a single value is
    required, the **most recent** event for that `plan` + `task_id` wins, "most recent"
    meaning the last matching event in the log's append order — position in the JSONL file,
    not timestamp, which can tie.

14. **When** `/adev:implement` accepts a write-test subagent's suite for a task **then** it
    calls `adev test-policy assert-assigned --plan <path> --task-id <id>`, which verifies that
    an assignment event exists for the task; a missing event fails the write-test step with
    `MISSING_DEPTH_ASSIGNMENT` rather than passing silently.

    **This is a presence check, not a conformance check.** It proves depth was resolved and
    recorded for the task; it does **not** verify that the authored suite matches the assigned
    depth. Verifying conformance is deliberately out of scope — see Scope Boundary below. The
    call is instructed in skill prose; nothing at the CLI layer forces it (Known Limitations).

15. **When** `adev test-policy show [--module <slug>]` runs **then** it prints the effective
    policy with the layer that supplied each field, and the effective sensitive-path set with
    built-in and configured entries distinguished — these are operator-authored configuration
    patterns, not task data. **When** `adev test-policy explain --plan <path> --task-id <id>`
    runs **then** it reports, from the most recent assignment event: the winning chain layer,
    whether escalation fired or why it was skipped, the contributing scores, and the floor as
    **two orthogonal facets rendered together** — whether any evaluated leg held
    (`floor_applied`, with the holding legs from `floor_legs`) and whether the path leg was
    evaluated (`floor_inputs`) — because the facets are not exclusive: a `risk_level: high`
    task with no parseable block is both *floored* and *path-leg-not-evaluated*, and rendering
    either alone would over-state what was checked. `explain` labels the floor advisory. `explain` never echoes
    `targetPaths` or any task file path; the assignment payload carries none. **When**
    `explain` targets a task with no assignment event **then** it reports that the task
    predates the policy (`NO_RECORDED_ASSIGNMENT`, warning).

16. **When** `adev test-policy set` runs **then** it validates against the closed
    enumerations; verifies `--module` matches `^[a-z0-9][a-z0-9-]*$` and already exists in
    `modules[]`, rejecting violations with `UNKNOWN_POLICY_MODULE`; refuses to run at a
    workspace root with `WORKSPACE_ROOT_REFUSED` and rejects a target path outside the project
    root with `PATH_OUTSIDE_ROOT`; writes via temp-file-plus-`rename()`; and re-parses to
    confirm round-trip before the rename commits. Any failure leaves every config file
    byte-identical.

17. **When** `/adev:write-test` is invoked standalone — `--red --spec`, `--red --file`, or
    `--red "<description>"`, with or without a `.context-index/` — **then** it authors at the
    built-in `standard` depth. It performs no chain resolution, no escalation, and no floor
    evaluation, and it emits no `test_depth_assigned` event, because there is no plan task to
    key one to. Standalone mode reads no policy configuration at all, so no resolution logic
    enters `skills/write-test/SKILL.md`.

18. **When** granularity is anything other than `per-task` **then** task-completion counting
    that keys on "tasks with an existing test file" is invalid, because N tasks share one
    suite path. `/adev:status` must count completion from plan-task lifecycle events. This
    supersedes Behavior 3 of `plan-test-mapping.spec.md`, which **must be amended** (per
    `spec-amendment-artifacts.spec.md`) in the same change as this spec ships.

19. **When** any test suite is scanned for gaming patterns **then** the full cross-strategy and
    strategy-profile blocker set applies regardless of resolved depth.

20. **When** `/adev:hygiene` runs its test-policy drift pass **then** it reports every task
    whose most recent assignment records `floor_inputs: "unavailable"`, naming the plan and
    task id — this is the third visibility mechanism the Behavior 8 decision note relies on,
    so it is specified here rather than existing only as a Task Map row.

### Postconditions

- Every plan task whose suite `/adev:implement` accepted through the Behavior 14 check carries
  **at least one** `test_depth_assigned` event; the most recent event (append order) is
  authoritative. The check itself is skill-instructed, not CLI-forced — see Known Limitations.
- Given fixed static configuration and a fixed routing sidecar, resolution is deterministic.
  Where routing scores vary between runs, variation can only raise depth.
- For every plan task, the floor legs with available inputs have been evaluated last in every
  resolution path within `resolveTestDepth`, over an effective path set never smaller than the
  built-in default, with the holding legs recorded in `floor_legs`. Tasks resolved with
  `floor_inputs: "unavailable"` had the path leg skipped and that fact recorded; standalone
  `/adev:write-test` is out of scope (Behavior 17).
- Gaming-blocker enforcement is identical at every depth.
- `resolveRigorMode` and `graduated-rigor-tiers` are unchanged by this spec.

### Scope Boundary — enforcement is out of scope

This capability **assigns and records** a depth per task. It does not verify that the authored
suite matches the assignment. That boundary is deliberate, and revision 5 established why:

- The Handoff Block cannot carry trustworthy evidence. `write-handoff.mjs` hashes test file
  *contents* only, so any depth field added to its frontmatter would be unattested and written
  by the same subagent being checked. And "the case classes actually covered" has no
  machine-decidable definition — `lib/test-strategies/gaming.mjs` is depth-invariant by design,
  so nothing computes it.
- The Handoff Block is keyed on a spec-derived slug and overwritten on each RED run
  (`immutable-handoff-block.spec.md:37,41`), so under the shipped `per-behavior` default N
  tasks share one packet and a later task destroys an earlier task's record.
- A diff-based check cannot run at suite acceptance: that point is RED-complete, so the source
  edits it would target have not happened yet, and `git diff --name-only` cannot see the
  untracked files a `Create:` task produces.

Making enforcement work therefore requires amending `immutable-handoff-block.spec.md`, giving
conformance a per-task key, and relocating the check to task-commit time. That is a separate
capability — issue-559 on the shared task board.

**What this means in practice:** a task floored to `thorough` receives `thorough` in its
write-test prompt and an event recording it. If the subagent authors a shallower suite, nothing
here catches that. The floor raises intent and creates an audit trail; it does not guarantee
coverage.

### Known Limitations

- **Depth is not reconciled across tasks sharing a suite.** Under the shipped `per-behavior`
  default, suite extension is the **routine path, not an edge case** — several tasks implement
  one behavior and each records its own assignment. A task assigned `thorough` routinely
  extends a suite authored at `minimal`; nothing raises the existing suite, because doing so
  would mutate hash-locked test files. The floor's coverage effect on an extending task is
  therefore bounded to the newly authored cases and is often nil for the pre-existing suite.
- **Standalone write-test ignores declared and floored depth.** Behavior 17 pins standalone
  `/adev:write-test` to the built-in `standard`, so a spec carrying `test_depth: thorough`, or
  one whose paths match the sensitive set, gets `standard` when authored outside a plan.
  Standalone has no plan task to key policy or an assignment event to. Reaching it requires
  deliberately authoring outside the lifecycle — `/adev:implement` resolves for every plan task
  and there is no implement→standalone route.
- **A handful of pre-convention plans degrade wholesale.** A few shipped plans predate the
  `Task N Context` packet-heading convention and title their packet headings freely
  (`### Task 1 — Module skeleton`); those headings classify as task bodies, so `t<N>`
  resolves to the packet and yields zero paths — the specified degrade
  (`floor_inputs: "unavailable"`, surfaced by Behavior 20), not a wrong answer, and the
  current template does not reproduce the shape.
- **The floor reads declared paths, not written paths.** `targetPaths` comes from the task's
  agent-authored `**Files:**` block and `**Tests:**` field, and plan immutability is enforced
  only post-hoc. Removing a path before `resolve` runs removes the path leg's view of it;
  omitting every path source skips the leg — visibly, as `floor_inputs: "unavailable"`. A
  **partial** omission is worse: dropping one path while keeping others records
  `floor_inputs: "available"` and is indistinguishable in the record from an honest clean
  resolution.
- **Two of the three floor legs are project-mutable, and flooring governance edits is
  visibility, not protection.** Only the sensitive-path leg is bounded below by
  `DEFAULT_SENSITIVE_PATHS`. `risk_level` is author-set spec frontmatter, `boundaries.yaml` is
  project-editable, and deleting `sensitive-paths.yaml` drops every project-added entry while
  remaining legal. A task editing governance config is floored, but under an advisory floor
  that means a larger assigned depth in a prompt and a record — it does not stop the edit.
- **Assignment events carry no attempt discriminator.** The event keys on `plan` + `task_id`,
  so after a re-route or `/adev:recover` a prior run's event satisfies the presence check even
  if `resolve` was not re-invoked for the current attempt.
- **Nothing at the CLI layer forces the Behavior 14 call.** `assert-assigned` is invoked by
  `/adev:implement` per its skill instructions; a dispatch path that omits the call (a
  hand-rolled `--parallel` group prompt, a `/adev:recover` re-dispatch) skips the presence
  check entirely. Closing this requires suite acceptance itself to run through a verb, which
  belongs to the enforcement follow-on (issue-559).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| A `test_depth` outside `minimal \| standard \| thorough`, from any source | Fails; names value, source file, legal set | `INVALID_TEST_DEPTH` |
| `test_policy.granularity` outside its enumeration | Fails; names value and legal set | `INVALID_TEST_GRANULARITY` |
| `test_policy.escalation` not a boolean | Fails; names the value | `INVALID_ESCALATION_FLAG` |
| An `escalation_rules` entry names an unknown routing dimension | Fails; names it and the four legal dimensions | `UNKNOWN_ROUTING_DIMENSION` |
| An `escalation_rules` `when:` expression fails the pinned grammar | Fails; names the offending expression | `INVALID_ESCALATION_RULE_EXPRESSION` |
| `escalation_rules` exceeds the cap (32) | Fails; names the count and the cap | `ESCALATION_RULES_LIMIT_EXCEEDED` |
| Two escalation rules match with different depths | Take the highest; advisory naming both | `CONFLICTING_ESCALATION_RULE` (warning) |
| Evaluated floor conditions held | Recorded `floor_applied: true` with the holding legs in `floor_legs`; advisory | `DEPTH_FLOOR_APPLIED` (warning) |
| `sensitive-paths.yaml` present but unparseable, or an entry is not a string | Proceed on the built-in set alone; advisory names the offending file or entry | `INVALID_SENSITIVE_PATHS` (warning) |
| `resolve` receives a `--task-id` failing the pinned grammar | Reject before any append | `INVALID_TASK_ID` |
| `resolve` or `set` given a path resolving outside the project root | Reject before any write | `PATH_OUTSIDE_ROOT` |
| `resolve` or `set` run at a workspace root (`currentRepoSlug === null`) | Refuse before any write (ADR-0005) | `WORKSPACE_ROOT_REFUSED` |
| `set --module <slug>` names an absent module or fails the charset | Reject; config files byte-identical | `UNKNOWN_POLICY_MODULE` |
| An emitted policy block contains an unsubstituted `{{ }}` placeholder | Init fails; names the offending field | `UNSUBSTITUTED_POLICY_PLACEHOLDER` |
| `/adev:implement` finds no assignment event for an accepted suite | Fails the write-test step for that task | `MISSING_DEPTH_ASSIGNMENT` |
| `explain` targets a task with no assignment event | Report that the task predates the policy | `NO_RECORDED_ASSIGNMENT` (warning) |

## Configuration Schema

### Relationship to graduated rigor tiers

`graduated-rigor-tiers` scales review and validation breadth from `risk_level` and the routing
"easy" signal. Test depth is the analogous question for test authoring and is declared in the
same place — a `test_depth` field per risk level in `risk-policies.yaml` — so verification
effort is configured by risk in one file. The two mechanisms are otherwise **independent**;
this spec makes no change to `resolveRigorMode`, its precedence, its signature, or its tests.
A `quick` rigor tier with `thorough` depth is legal and expected.

**Vocabulary caution.** `tier` already means `fast|integration|e2e` in `gates.yaml` and
`full|quick` in rigor mode. This capability introduces no third meaning; its axis is `depth`.
The `*_depth` / `*_mode` divergence is deliberate — gates need two levels, test authoring three.

```yaml
# governance/risk-policies.yaml
policies:
  high:    { review_mode: full,  validate_mode: full,  test_depth: thorough }
  medium:  { review_mode: full,  validate_mode: full,  test_depth: standard }
  low:     { review_mode: quick, validate_mode: quick, test_depth: minimal }
```

```yaml
# governance/sensitive-paths.yaml — OPTIONAL and EXTEND-ONLY.
# The effective set is DEFAULT_SENSITIVE_PATHS ∪ these entries. Absent or empty is legal and
# resolves to the built-in default; configuration cannot shrink the set below that default.
sensitive_paths:
  - "src/billing/**"
```

**Matching semantics.** Patterns are matched against **repo-relative POSIX paths** using the
project's existing glob matcher (`matchGlob` in `lib/test-strategies/manifest.mjs`, already used
for `test_strategies` path matching — no new dependency). Every entry must be independently
anchored: a bare `.env*` matches only the repo root, so peers carrying `**/` would silently
under-match nested files.

`DEFAULT_SENSITIVE_PATHS` ships in `lib/` and covers at minimum, in both directory and file
form so that `src/auth.ts` and `services/api/.env.production` both floor:

```
**/auth/**        **/auth*           **/crypto/**      **/crypto*
**/secrets/**     **/*secret*       **/credentials/** **/*credential*
**/.env*          **/*.pem           **/*.key          **/*.p12
.context-index/governance/**         .github/workflows/**
```

Governance config is included deliberately: a task editing `gates.yaml`,
`risk-policies.yaml`, `boundaries.yaml`, or `sensitive-paths.yaml` itself is the
highest-leverage change class in a consumer repo and should carry the deepest assigned tests —
with the caveat, recorded in Known Limitations, that an advisory floor makes this visibility
rather than protection.

**Self-hosting note.** In adev's own repository the highest-leverage class is the policy
implementation rather than the policy config — `lib/test-strategies/`, `lib/governance/`, and
`lib/lifecycle-events.mjs`. Those paths are deliberately **not** in the shipped default (they
would be wrong for consumer repos); adev's own `governance/sensitive-paths.yaml` must extend
the set with them.

### Project structure config

```yaml
test_policy:
  granularity: per-behavior     # per-task | per-behavior | per-spec
  escalation: true              # allow routing complexity to RAISE depth (never lower)
  escalation_rules:             # post-chain pass; monotonic upward only
    - when: { blast_radius: "<=0.3" }    # 0..1 floats per the .routing.json contract
      depth: thorough
    - when: { novelty: "<=0.3" }
      depth: thorough
```

`test_policy` carries no `depth:` field — the per-risk default lives in `risk-policies.yaml`.
`when:` values are pinned to `^(<=|>=|<|>|==)\s*(0(\.\d+)?|1(\.0+)?)$`, evaluated by regex match
only; `eval` and `new Function` are prohibited. At most 32 rules.

**Threshold intent.** Shipped rules fire only in the bottom ~30% of the blast-radius and
novelty scales (route scores *lower* for higher actual blast radius), so a routine change does
not escalate and the reduced-volume default holds. Escalation is a ratchet: loosening these
thresholds silently increases test volume, the failure mode this policy exists to prevent.

Per-module overrides key on `slug:`, matching how shipped manifests key `modules[]`:

```yaml
modules:
  - slug: payments
    test_depth: thorough
    test_policy:
      granularity: per-task           # partial override; escalation settings inherit
```

### Resolution

**Granularity chain** — plan time, static only:

1. `modules[].test_policy.granularity` (`source: "module"`)
2. `test_policy.granularity` (`source: "manifest"`)
3. Domain `test-config.yaml` default (`source: "domain"`)
4. Built-in — `per-behavior` (`source: "fallback"`)

**Depth chain** — test-authoring time, static only, strictly first-match-wins:

1. Spec-declared `test_depth:` frontmatter (`source: "spec-declared"`)
2. `modules[].test_depth` override (`source: "module"`)
3. `risk-policies.yaml` `policies[<risk_level>].test_depth` (`source: "risk-policy"`)
4. Domain `test-config.yaml` default (`source: "domain"`)
5. Built-in — `standard` (`source: "fallback"`)

Then two monotonic-upward passes that can only raise the chain result: the **escalation pass**
(Behavior 4), then the **floor** (Behavior 6), always last. No derived signal occupies a chain
stage, so an operator-authored override is always consulted.

The two passes are deliberately distinct and are not unified: the floor is not
configuration-gateable and its sensitive-path trigger set cannot be narrowed below the built-in
default, while escalation is gated by `escalation: false` and driven by project-authored rules.

### Configuration Lifecycle

**At onboarding (`/adev:init`).** The audit's sharpest finding was a project that shipped with
an unedited constitution template still containing `{{ test_command }}`, so its declared gates
could never execute and nobody noticed. Init emits literal values, with the domain overlay
supplying the starting point so the question is a confirmation rather than an interrogation.

**After onboarding (`adev test-policy`).** Reconfiguration needs visibility (`show`), a
validated atomic write path (`set`), and an answer to "why did this task get this depth"
(`explain`). The last decides adoption: a policy that cannot explain itself gets switched off.

**Migration semantics are inert.** Changing the policy never rewrites a plan and never touches
a test file. Upgrading a project that predates this capability requires no new config file, and
its pre-convention plan tasks resolve in Behavior 8's degraded mode rather than failing.

### Interface Contract

| Interface | Type | Description |
|-----------|------|-------------|
| `adev test-policy resolve --plan <path> --task-id <id>` | CLI verb | Sole depth-resolution entry point and **sole writer** of `test_depth_assigned`. Chain → escalation → floor; JSON stdout; validated `--task-id` (`INVALID_TASK_ID`), containment (`PATH_OUTSIDE_ROOT`), workspace guard (`WORKSPACE_ROOT_REFUSED`); typed non-zero exits. |
| `adev test-policy assert-assigned --plan <path> --task-id <id>` | CLI verb | **Presence check only** — verifies an assignment event exists for the task and exits non-zero with `MISSING_DEPTH_ASSIGNMENT`. Does not verify the authored suite against the assigned depth (Scope Boundary). Called by `/adev:implement` so the check is a verb, not skill prose. |
| `adev test-policy show \| set \| explain` | CLI verb | Operator surface. `set` performs validated, workspace-guarded, atomic writes. `explain` renders the floor as two orthogonal facets (held-with-legs; path leg evaluated or not) and labels the floor advisory. |
| `resolveTestDepth({ spec, riskLevel, policies, moduleOverride, domainDefault, routingScore, escalationRules, escalationEnabled, boundaryCrossing, targetPaths, sensitivePaths })` | function | Pure. `targetPaths` may be empty: the sensitive-path leg is then skipped and the returned assignment carries `floor_inputs: "unavailable"`. Returns `floor_legs`, the evaluated legs that held. `sensitivePaths` is the already-unioned effective set. |
| `readTaskFiles(planPath, taskId)` | function | The plan-task file reader (Behavior 8): resolves `t<N>` to its plan region per Behavior 8's pinned mapping, parses the region's `**Files:**` block and `**Tests:**` field in both shipped shapes, applies the token predicate and normalisation, returns `{ targetPaths, available }`, where `available` is the boolean the caller maps onto the assignment's `floor_inputs` enum. |
| `effectiveSensitivePaths(configured)` | function | Returns `DEFAULT_SENSITIVE_PATHS ∪ configured`. Never returns fewer entries than the built-in default. Malformed input degrades to the built-in set with an `INVALID_SENSITIVE_PATHS` advisory. |
| `resolveGranularity({ moduleOverride, manifestPolicy, domainDefault })` | function | Plan-time resolution; no routing input. Pure. |
| `loadRigorPolicies(projectRoot)` | reused | Existing loader, extended read-only to surface `test_depth`. No behavior change for existing callers. |
| `parseTestPolicy(manifest)` | function | Parses/validates `test_policy`. Returns the built-in default when absent. |
| `inferGranularity(projectRoot, sourceRoots)` | function | Brownfield inference; returns a proposed granularity plus its evidence. |
| `test_depth_assigned` | lifecycle event | Registered in **both** `CANONICAL_EVENTS` (`lib/lifecycle-events.mjs`) and `REQUIRED_FIELDS_BY_EVENT` (`lib/diagnostics/event-schemas.mjs`). Payload carries `plan` (matching every shipped task-scoped event), `floor_inputs`, and `floor_legs`; carries no `granularity` — a plan-time property already visible in the plan's `**Tests:**` fields — and no file paths. |

## Documentation Requirements

Documentation is part of the definition of done. This capability **changes default behavior on
adoption** — projects will plan fewer test files, and a silent reduction in test volume erodes
trust when discovered rather than read about. And a policy nobody can find is a policy nobody
configures.

| Document | Required content |
|----------|------------------|
| `docs/test-strategies.md` | Both axes, both chains, the two monotonic passes, why escalation is upward-only, standalone write-test behavior, worked examples under each granularity — and a plain statement that **the floor is advisory**: it assigns depth and records it, it does not verify suites. Extends the existing `## Priority chain` section. |
| `docs/governance.md` | `test_depth` in `risk-policies.yaml`; `sensitive-paths.yaml` as an extend-only overlay on `DEFAULT_SENSITIVE_PATHS`; the independence of rigor and depth; and the same plain **advisory-floor** statement — this page is where an operator forms their belief about what the floor guarantees. |
| `docs/configuration.md` | The `test_policy` block: fields, enumerations, defaults, `modules[]` override forms, the pinned rule grammar, the escalation-threshold intent. |
| `docs/cli-reference.md` | `adev test-policy resolve \| assert-assigned \| show \| set \| explain`, including the two floor facets `explain` renders. |
| `docs/getting-started.md` | What init asks, what the answer changes, and the brownfield inference path. |
| `docs/README.md` | Index entries accurate for every page touched. |

The upgrade note must state plainly that adopting projects will plan fewer test files, that
`granularity: per-task` restores previous behavior, and that no new config file is required to
upgrade. Documented defaults must be verified against shipped values rather than transcribed.
Documentation prose is **not** a substitute for enforcement and must not be tested by
string-matching its content.

## System Constitution Reference

- **Principle 2 — "Skills are primarily markdown."** The central constraint: policy expressed
  only as skill prose drifts. This repo's own suite illustrates the failure mode — over a
  hundred test files assert on SKILL.md prose rather than production behavior
  (`grep -rl "SKILL.md" tests --include="*.test.mjs"` matches 109 files); they break on wording
  changes and catch no regressions. All resolution here is control flow and lives in
  `lib/test-strategies/policy.mjs` behind `adev test-policy resolve`; Behaviors 12, 14, and 17
  exist so no skill has to branch.

- **Anti-pattern — "If a fenced JavaScript block contains control-flow logic… that logic
  belongs inside the CLI verb's implementation."** The chains, escalation pass, floor, and the
  assignment assertion are exactly such logic.

- **Principle 1 — "Minimize external dependencies."** Reuses the existing manifest and
  rigor-policy readers; rule evaluation is regex-only with `eval`/`new Function` prohibited.

- **Charter quality attribute — Backward compatibility.** Applies with a deliberate exception
  reviewers must weigh: this capability changes default behavior on adoption. That is the
  intent, and `granularity: per-task` is the explicit opt-out. Upgrades require no new file,
  and pre-convention plans resolve in degraded mode rather than failing.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Amend `plan-test-mapping.spec.md` | Per `spec-amendment-artifacts.spec.md`: supersede its Behavior 3 counting rule | medium |
| Extend specify frontmatter contract | `/adev:specify` accepts `test_depth:` as legal frontmatter (SKILL.md legal-field set + spec templates); amend specify's spec if required. Without this, depth chain stage 1 has no authoring path | medium |
| Charter revision 3 | Capability row, qualified Out of Scope, governance dependency, `TestDepthAssignment` entity, and `Spec test_depth field \| design` Consumed-API row. Bump `charter-revision:` to 3 in this spec when it lands | small |
| `DEFAULT_SENSITIVE_PATHS` | `lib/` constant + `effectiveSensitivePaths()` union with malformed-input degradation; optional `sensitive-paths.yaml` overlay loader | small |
| Policy schema and parser | `parseTestPolicy()`; enum, grammar, and cap validation | small |
| Risk-policy extension | `test_depth` in `risk-policies.yaml` + init template; extend `loadRigorPolicies()` read-only | small |
| Granularity resolution | `resolveGranularity()` + plan-time wiring | small |
| Depth resolution | `resolveTestDepth()`: chain, monotonic escalation pass, floor legs with `floor_legs` and `floor_inputs` recording | medium |
| Plan-task file reader | `readTaskFiles()` per Behavior 8: pinned `t<N>`→task-region mapping, both shipped shapes, one token predicate, line-range stripping, `**Tests:**` field, POSIX normalisation, degrade-on-zero. No such reader exists in `lib/` today | medium |
| Event canon | `test_depth_assigned` in `CANONICAL_EVENTS` **and** `event-schemas.mjs` (payload incl. `floor_inputs` and `floor_legs`), projection, unknown-event handling. Canon additions carry a `[BOUNDARY: human-approved]` marker and review confirmation, per the `spec_amended` precedent (`lib/lifecycle-events.mjs:61-63`) | medium |
| `adev test-policy` verb | `resolve` / `assert-assigned` / `show` / `set` / `explain`; guarded atomic writes; validated `--task-id`; two floor facets in `explain` | medium |
| Implement integration | Call `resolve` per task, pass depth into the write-test subagent, call `assert-assigned` (presence only) before accepting a suite | medium |
| Status integration | `/adev:status` counts task completion from plan-task lifecycle events instead of test-file existence (Behavior 18; `skills/status/SKILL.md:60` currently checks file existence) | small |
| Suite path resolution | `resolveSuitePath()`; detect existing coverage so tasks extend rather than create | medium |
| Plan integration | Replace the per-task `**Tests:**` mandate with granularity-driven emission; every emitted task carries a `**Files:**` block (Behavior 2) | medium |
| Write-test standalone | Pin standalone mode to the built-in `standard` depth; no policy reads, no event | small |
| Init integration | Two-file emission, placeholder guard, brownfield inference | medium |
| Hygiene drift pass | Declared policy versus actual test-tree layout; reports tasks whose assignments record `floor_inputs: "unavailable"` (Behavior 20); feeds the test-debt audit | medium |
| Documentation | The six doc updates, upgrade note, defaults verified against shipped values | medium |

## Acceptance Criteria

- [ ] Granularity resolves at plan time with no routing input; plan output is reproducible from static config alone
- [ ] The depth chain contains only static stages; no derived signal occupies a chain stage
- [ ] A spec-declared `test_depth:` beats a `modules[].test_depth` override and the risk-policy default
- [ ] A `modules[].test_depth` override is always consulted and is never made unreachable by routing
- [ ] Escalation is monotonic upward: a matching rule naming a lower depth than the chain result is a no-op
- [ ] Two matching rules naming different depths resolve to the highest with a `CONFLICTING_ESCALATION_RULE` advisory naming both
- [ ] `escalation: false`, a missing routing entry, and no rule matching are distinguishable via `escalation_skipped`
- [ ] With the shipped rules, a routine task (mid-range blast radius and novelty) does **not** escalate
- [ ] Escalation rules consume `0..1` floats; a rule written against a 1–5 scale is rejected by the pinned grammar
- [ ] Rule expressions are evaluated by regex only; the implementation contains no `eval` or `new Function`; exceeding 32 rules is rejected
- [ ] Malformed `escalation` flags, dimensions, expressions, and rule counts each raise their named error code
- [ ] `effectiveSensitivePaths()` never returns fewer entries than `DEFAULT_SENSITIVE_PATHS`; a config file cannot remove a built-in entry
- [ ] An absent or empty `sensitive-paths.yaml` resolves to the built-in set and does not raise; a project that predates this capability upgrades without adding any config file
- [ ] A present-but-unparseable `sensitive-paths.yaml`, or a non-string entry, degrades to the built-in set with an `INVALID_SENSITIVE_PATHS` advisory — resolution proceeds
- [ ] A task modifying `.context-index/governance/**`, including `sensitive-paths.yaml` itself, is assigned `thorough` via the floor
- [ ] The floor fires on a sensitive-path match with `risk_level: low` and `boundaries: []`
- [ ] `floor_applied: true` and a `DEPTH_FLOOR_APPLIED` advisory are recorded whenever evaluated floor conditions held, including when escalation had already raised the depth to `thorough`
- [ ] The floor legs with available inputs are evaluated last — after chain and escalation — in every resolution path within `resolveTestDepth`, and only escalate
- [ ] Against a plan emitted by the current template — `## Context Packets` with `### Task N Context` entries preceding `## Task Structure` — `readTaskFiles()` resolves `t<N>` to the task **body** region containing its `**Files:**` block, never to the context packet; an unresolvable `--task-id` degrades like an absent block
- [ ] Context-family headings (`Task N Context`, `Task N-N Context`, `Tasks 10-14 Context`) never open or close a task region; a same-task sub-heading (`Task N — Tests`) stays inside it
- [ ] A task-body heading whose **title** contains the word (`### Task 1: Context-pack library`, `### Task 2: Prototype Context Reception`) still opens its region, and that region contains its `**Files:**` block
- [ ] A suffixed heading (`### Task 9b:`) neither opens nor closes a region; a `--task-id` targeting it resolves to no region and degrades visibly
- [ ] `readTaskFiles()` parses both shipped `**Files:**` shapes — block form with labelled and unlabelled sub-bullets, and inline label form — plus the `**Tests:**` field, unwrapping backticks, tolerating surrounding prose, stripping `Modify:` line ranges, and normalising to repo-relative POSIX
- [ ] One predicate governs backticked and bare tokens alike — a token is a path iff it contains `/` or its final segment matches `\.[A-Za-z0-9_-]+$` — so `.gitignore` and `.env.production` are accepted while `--dry-run`, `_acquireLock`, and `(no source changes)` yield nothing
- [ ] A task whose parse yields zero paths resolves with the sensitive-path leg skipped, records `floor_inputs: "unavailable"`, and remains implementable; the `risk_level` and boundary legs still evaluate
- [ ] A task whose parse yields paths records `floor_inputs: "available"` (defined as at least one parsed path, not necessarily all paths the task touches)
- [ ] The assignment records `floor_legs`, naming which evaluated legs held; a `risk_level: high` task with no parseable block records `floor_applied: true`, `floor_legs: ["risk-level"]`, and `floor_inputs: "unavailable"` together
- [ ] A task declaring a test path under a sensitive directory — via the `Test:` sub-bullet or the `**Tests:**` field — is assigned `thorough` via the floor
- [ ] Every task emitted by `/adev:plan` after this change carries its own `**Files:**` block
- [ ] `resolveRigorMode`, its precedence, its signature, and `tests/governance/rigor-mode.test.mjs` are unchanged by this change
- [ ] `adev test-policy resolve` is the sole writer of `test_depth_assigned`; no generic event-append verb exists
- [ ] `resolve` rejects a malformed `--task-id` (`INVALID_TASK_ID`, incl. `../../x`) before any append; both `resolve` and `set` reject a path outside the project root (`PATH_OUTSIDE_ROOT`) and a workspace-root invocation (`WORKSPACE_ROOT_REFUSED`) before any append or write
- [ ] `/adev:implement` calls `adev test-policy assert-assigned` — the check is a verb, not skill-prose branching — and fails the step with `MISSING_DEPTH_ASSIGNMENT` when no event exists
- [ ] `assert-assigned` performs a presence check only and makes no claim about suite content
- [ ] A task may carry more than one assignment event; the last in append order wins, and `explain` reports from it
- [ ] `explain` renders the floor as two orthogonal facets — whether any evaluated leg held (with `floor_legs`) and whether the path leg was evaluated — and labels the floor advisory
- [ ] `explain` never echoes `targetPaths` or any task file path; `show` prints only operator-authored configuration patterns
- [ ] Standalone `/adev:write-test` in all three invocation forms, with or without `.context-index/`, authors at `standard`, reads no policy config, evaluates no floor, and emits no event
- [ ] `test_depth_assigned` is registered in `CANONICAL_EVENTS` and `event-schemas.mjs`, carries `plan`, `floor_inputs`, and `floor_legs`, carries no `granularity` and no file paths, and does not land in `unknownEvents[]`
- [ ] Sensitive-path matching is repo-relative POSIX via the existing `matchGlob`; `src/auth.ts` and `services/api/.env.production` both floor
- [ ] adev's own `governance/sensitive-paths.yaml` extends the default with `lib/test-strategies/**`, `lib/governance/**`, and `lib/lifecycle-events.mjs`
- [ ] A suite authored at `minimal` is scanned with the identical blocker set as one authored at `thorough`
- [ ] `/adev:status` counts completion from plan-task events and reports correctly under `per-spec`
- [ ] `/adev:hygiene`'s test-policy drift pass reports every task whose most recent assignment records `floor_inputs: "unavailable"`, naming the plan and task id
- [ ] An amendment to `plan-test-mapping.spec.md` ships in the same change
- [ ] A spec authored through `/adev:specify` can declare `test_depth:` without the frontmatter being rejected, so depth chain stage 1 has an authoring path
- [ ] Charter revision 3 lands with the capability row, qualified Out of Scope, governance dependency, `TestDepthAssignment` entity, and the `test_depth` Consumed-API row; this spec's `charter-revision:` is bumped to 3 at that point
- [ ] Per-module overrides key on `slug:` and resolve against a shipped manifest
- [ ] Under `per-behavior`, a task whose behavior is already covered gets an "extend" instruction referencing the existing suite
- [ ] `parseTestPolicy()` returns `{ granularity: "per-behavior", escalation: true }` with no warning when the block is absent; terminal source is `fallback`
- [ ] `show` names the winning layer per field and distinguishes built-in from configured sensitive paths
- [ ] `set` rejects an unknown or malformed `--module` (`UNKNOWN_POLICY_MODULE`), writes via temp+`rename()`, and round-trip-verifies; failures leave every config file byte-identical
- [ ] `/adev:init` emits literal scalars into `manifest.yaml` and `risk-policies.yaml`; an unsubstituted `{{ }}` placeholder or commented-out policy fails with `UNSUBSTITUTED_POLICY_PLACEHOLDER`; it does not emit `sensitive-paths.yaml`
- [ ] `/adev:init --brownfield` proposes the inferred granularity with evidence; with no suite it falls back to the domain default and says so
- [ ] A plan generated under `per-behavior` emits strictly fewer distinct test files than the same plan under `per-task`
- [ ] Given fixed static config and a fixed routing sidecar, resolution is deterministic; where scores vary, depth can only rise
- [ ] The six documented files are updated; `docs/test-strategies.md` and `docs/governance.md` each state plainly that the floor is advisory; the upgrade note states the default-behavior change and the no-new-file upgrade path; documented defaults are verified against shipped values
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced

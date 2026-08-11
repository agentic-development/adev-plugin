---
charter: test-strategies
status: review-pending
kind: behavioral
risk_level: medium
milestone:
revision: 6
charter-revision: 2
created: 2026-08-10
updated: 2026-08-11
charter-extension: true
affects:
  - planning
  - implementation
  - write-test
  - setup
  - maintenance
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

     `affects:` is additive breadth metadata only. This is NOT a cross-cutting spec: it keeps
     its charter anchor and its features/ path, because skills/hygiene/SKILL.md:518 scans only
     specs/features/ and relocating would drop it from revision and charter-drift auditing.

     Revision 6 DESCOPES end-to-end floor enforcement (filed as issue-559). The round-5
     review found the enforcement machinery unimplementable: the Handoff Block hashes test
     content only so a depth field there is self-attested, it is slug-keyed and overwritten
     between tasks sharing a suite, and a diff check at suite acceptance runs before the
     source edits exist. The floor now assigns and records depth; it does not verify suites.
     See the Scope Boundary section.

     Revision 4 addressed the 6 blockers from the revision-3 review. Revision 5 addressed
     the round-4 SECURITY findings (SEC-6 through SEC-12): the floor is now enforced
     end-to-end via conformance and evasion checks at suite acceptance, sensitive-path
     matching is pinned, and the Capability no longer overstates un-narrowability. The
     round-4 non-security blockers are also now addressed: SA-20 (resolution behaviors are
     scoped to plan tasks and the standalone downgrade is a recorded limitation), SA-21
     (Behavior 8 pins the `**Files:**` parse and a reader task exists), and CON-25
     (ADR-0016 §2 and §4 brought back into line). -->

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
different points (ADR-0016):

- **Granularity** — how suites map onto units of change: `per-task`, `per-behavior`,
  `per-spec`. Consumed by `/adev:plan` when emitting each task's `tests:` field, so it
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
  `governance/sensitive-paths.yaml` is optional — absent or empty, the built-in
  `DEFAULT_SENSITIVE_PATHS` applies (Behavior 7).
- The plan task under resolution declares at least one target file path.
- For the escalation pass: `<plan-stem>.routing.json` exists and carries an entry for the
  task. Its absence means no escalation — a defined outcome, not an error.
- Strategy resolution (`resolveStrategy`) has already run.

### Behaviors

1. **When** granularity resolution runs and no `test_policy` block is declared **then** it
   returns `{ granularity: "per-behavior", source: "fallback" }` — a shipped default yielding
   fewer test artifacts than the current per-task mandate, because several tasks implementing
   one behavior share one suite.

2. **When** the manifest declares `test_policy.granularity` **then** `/adev:plan` emits
   `tests:` fields accordingly: one suite path per task under `per-task`, one per spec
   behavior statement under `per-behavior`, one for the whole spec under `per-spec`.

3. **When** granularity permits reuse and a suite already covers the target behavior **then**
   `/adev:plan` emits a `tests:` field referencing that existing suite and the task
   instruction reads "extend" rather than "create". Depth is not reconciled across tasks
   sharing a suite: see Scope Boundary.

4. **When** `test_policy.escalation` is `true` **and** routing scores exist for the task
   **then** the escalation pass runs: each `escalation_rules` entry whose `when:` expression
   matches raises depth to that entry's level. Escalation is **monotonic upward only** — a
   matching rule naming a lower depth than the chain produced is a no-op. **When**
   `escalation` is `false`, or no routing entry exists, or no rule matches **then** no
   escalation occurs and the assignment records `escalated: false` with
   `escalation_skipped: "disabled" | "no-routing-entry" | "no-match"` so an operator can tell
   the three apart.

5. **When** depth is resolved for a plan task and the spec's frontmatter declares
   `test_depth:` **then** that value wins over every configured default
   (`source: "spec-declared"`), including a `modules[].test_depth` override and the
   risk-policy default. The escalation pass and floor may still raise it; nothing may lower
   it. Standalone `/adev:write-test` resolves no chain at all (Behavior 17), so this and every
   other resolution behavior below are scoped to plan-task resolution.

6. **When** the safety floor conditions hold during plan-task resolution **then** depth is
   floored at `thorough`, applied **last — after the chain and after escalation, in every
   resolution path within `resolveTestDepth`** — escalating only. The
   floor triggers on any of: the spec's `risk_level: high`; a boundary rule crossed per
   `boundaries.yaml`; or any target path matching the effective sensitive-path set. The
   assignment records `floor_applied: true` whenever the **floor conditions held**, whether or
   not the floor changed the resolved value — so a sensitive-path task that escalation already
   raised to `thorough` is still recorded as floored.

7. **When** the effective sensitive-path set is computed **then** it is the union of the
   built-in `DEFAULT_SENSITIVE_PATHS` constant and any entries in
   `governance/sensitive-paths.yaml`. Configuration may only **extend** the set, never shrink
   it — the same monotonicity the escalation pass adopts. An absent or empty
   `sensitive-paths.yaml` therefore resolves to the built-in set rather than failing, so
   upgrading a project that predates this capability never breaks. Configuration cannot narrow
   the set *below the built-in default* — but deleting the file does drop every project
   extension, so an overlay a project depends on is not itself protected.

8. **When** `targetPaths` is empty or absent for a plan task, or `boundaryCrossing` is absent
   **then** resolution fails closed with `MISSING_FLOOR_INPUT`. There is no qualifier and no
   exemption: a plan task always declares target files, so an empty list is a contract
   violation, not a special case.

   `resolve` derives `targetPaths` by parsing the task's **`**Files:**` block** — the shipped
   plan task format (`skills/plan/SKILL.md:608`), which is prose bullets, not a YAML `files:`
   list. A new plan-task file reader owns this parse and pins the following rules:

   - Recognised sub-bullets are `Create:`, `Modify:`, and `Test:`; any other label is ignored.
   - A trailing line range on a `Modify:` entry (`existing.ts:123-145`) is **stripped** before
     matching — the floor matches paths, not spans.
   - `Test:` paths **are included** in `targetPaths`: a test file living under a sensitive
     path is itself sensitive, and excluding them would let a task escape the floor by
     declaring only its test target.
   - Paths are normalised to repo-relative POSIX before matching.
   - Paths are unwrapped from surrounding backticks and tolerate leading/trailing prose in
     the bullet (`- Test: extend \`tests/x.test.mjs\``); tokens that are not paths are dropped.
     Unlabelled bullets are parsed as paths.
   - A task whose `**Files:**` block is present but yields zero paths after normalisation
     raises `MISSING_FLOOR_INPUT`. A task in a plan with **no `**Files:**` block at all** —
     17 of 150 plans shipped in this repo predate the convention — resolves without a floor
     path check and records `floor_inputs: "unavailable"`, so in-flight plans stay
     implementable. Only the path leg degrades; `risk_level` and `boundaries.yaml` still apply.

9. **When** any configured value is outside its closed enumeration — `granularity`,
   `test_depth` from any source, `escalation` (boolean), an `escalation_rules` dimension
   name, a `when:` expression against the pinned grammar, or the rule count against the cap —
   **then** resolution fails with an error naming the offending value, its source file, and
   the legal set or grammar. There is no silent fallback for malformed policy.

10. **When** `/adev:init` runs on a greenfield project **then** it writes literal scalars:
    `granularity` into `manifest.yaml` `test_policy`, and `test_depth` into
    `risk-policies.yaml` per risk level. It does **not** write `sensitive-paths.yaml` — the
    built-in default applies until a project chooses to extend it. No emitted block contains a
    `{{ }}` placeholder or a commented-out policy.

11. **When** `/adev:init --brownfield` runs on a repo with an existing test suite **then** it
    infers granularity from the existing layout and proposes that inferred value instead of
    the domain default, labelling it inferred and naming the evidence.

12. **When** `adev test-policy resolve --plan <path> --task-id <id>` runs **then** it resolves
    depth through chain → escalation → floor, prints the assignment as JSON, and appends the
    `test_depth_assigned` event. It validates `--task-id` against
    `^[a-z0-9][a-z0-9._-]{0,63}$` — pinned here because no shipped artifact defines a
    plan-anchor grammar (`plan-task-events.spec.md` calls `t1`/`t2` "typical" and
    `lib/plan-routing-sidecar.mjs` accepts any non-empty string) — raising `INVALID_TASK_ID`
    on mismatch, and applies the same project-root containment and `detectWorkspace()` guard
    as `test-policy set`, raising `POLICY_PATH_OUTSIDE_ROOT`, all before any append. This verb
    is the **sole writer** of
    `test_depth_assigned`; no generic event-append verb may be introduced.

13. **When** depth is resolved for a plan task **then** a `test_depth_assigned` event is
    appended carrying `{ plan, task_id, depth, source, escalated, escalation_skipped?, floor_applied, dimensions? }`.
    A task may accumulate **more than one** such event across re-routes and recovery
    re-invocations; the event log is append-only and never rewritten. Where a single value is
    required, the **most recent** event for that `plan` + `task_id` wins.

14. **When** `/adev:implement` accepts a write-test subagent's suite for a task **then** it
    calls `adev test-policy assert-assigned --plan <path> --task-id <id>`, which verifies that
    an assignment event exists for the task; a missing event fails the write-test step with
    `MISSING_DEPTH_ASSIGNMENT` rather than passing silently.

    **This is a presence check, not a conformance check.** It proves depth was resolved and
    recorded for the task; it does **not** verify that the authored suite matches the assigned
    depth. Verifying conformance is deliberately out of scope — see Scope Boundary below.

    **When** `MISSING_FLOOR_INPUT` is raised mid-implement **then** the task is marked blocked
    with the offending input named and `/adev:recover` is the resume path — the plan is not
    rewritten.

15. **When** `adev test-policy show [--module <slug>]` runs **then** it prints the effective
    policy with the layer that supplied each field, and the effective sensitive-path set with
    built-in and configured entries distinguished. **When** `adev test-policy explain --plan
    <path> --task-id <id>` runs **then** it reports, from the most recent assignment event:
    the winning chain layer, whether escalation fired or why it was skipped, the contributing
    scores, and whether the floor conditions held. Neither verb echoes `targetPaths` or any
    other file path in its output — the assignment payload carries none, and that closed shape
    must survive into the rendered explanation.

16. **When** `adev test-policy set` runs **then** it validates against the closed
    enumerations, verifies `--module` matches `^[a-z0-9][a-z0-9-]*$` and already exists in
    `modules[]`, refuses to write when `detectWorkspace()` reports `currentRepoSlug === null`
    (ADR-0005), writes via temp-file-plus-`rename()`, and re-parses to confirm round-trip
    before the rename commits. Any failure leaves every config file byte-identical.

17. **When** `/adev:write-test` is invoked standalone — `--red --spec`, `--red --file`, or
    `--red "<description>"`, with or without a `.context-index/` — **then** it authors at the
    built-in `standard` depth. It performs no chain resolution, no escalation, and no floor
    evaluation; `MISSING_FLOOR_INPUT` cannot arise; and it emits no `test_depth_assigned`
    event, because there is no plan task to key one to. Standalone mode reads no policy
    configuration at all, so no resolution logic enters `skills/write-test/SKILL.md`.

18. **When** granularity is anything other than `per-task` **then** task-completion counting
    that keys on "tasks with an existing test file" is invalid, because N tasks share one
    suite path. `/adev:status` must count completion from plan-task lifecycle events. This
    supersedes Behavior 3 of `plan-test-mapping.spec.md`, which **must be amended** (per
    `spec-amendment-artifacts.spec.md`) in the same change as this spec ships.

19. **When** any test suite is scanned for gaming patterns **then** the full cross-strategy and
    strategy-profile blocker set applies regardless of resolved depth.

### Postconditions

- Every plan task whose tests were authored carries **at least one** `test_depth_assigned`
  event, asserted by `/adev:implement` before the suite is accepted; the most recent event is
  authoritative.
- Given fixed static configuration and a fixed routing sidecar, resolution is deterministic.
  Where routing scores vary between runs, variation can only raise depth.
- For every plan task, the floor has been evaluated last in every resolution path within
  `resolveTestDepth`, over an effective path set never smaller than the built-in default.
  Standalone `/adev:write-test` is out of scope for this postcondition (Behavior 17).
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
capability, filed as follow-on work rather than smuggled into this one.

**What this means in practice:** a task floored to `thorough` receives `thorough` in its
write-test prompt and an event recording it. If the subagent authors a shallower suite, nothing
here catches that. The floor raises intent and creates an audit trail; it does not guarantee
coverage.

### Known Limitations

- **Depth is not reconciled across tasks sharing a suite.** Under the shipped `per-behavior`
  default, several tasks extend one suite, and each records its own assignment. A task assigned
  `thorough` may extend a suite authored at `minimal`; nothing raises the existing suite,
  because doing so would mutate hash-locked test files.
- **Standalone write-test ignores declared and floored depth.** Behavior 17 pins standalone
  `/adev:write-test` to the built-in `standard`, so a spec carrying `test_depth: thorough`, or
  one whose paths match the sensitive set, gets `standard` when authored outside a plan.
  Standalone has no plan task to key policy or an assignment event to. Reaching it requires
  deliberately authoring outside the lifecycle — `/adev:implement` resolves for every plan task
  and there is no implement→standalone route.
- **The floor reads declared paths, not written paths.** `targetPaths` comes from the task's
  `**Files:**` block, which is agent-authored, and plan immutability is enforced only post-hoc.
  Removing a path before `resolve` runs removes the floor for that task.
- **Two of the three floor legs are project-mutable.** Only the sensitive-path leg is bounded
  below by `DEFAULT_SENSITIVE_PATHS`. `risk_level` is author-set spec frontmatter,
  `boundaries.yaml` is project-editable, and deleting `sensitive-paths.yaml` drops every
  project extension while remaining legal.
- **Assignment events carry no attempt discriminator.** The event keys on `plan` + `task_id`,
  so after a re-route or `/adev:recover` a prior run's event satisfies the presence check even
  if `resolve` was not re-invoked for the current attempt.

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
| `targetPaths` empty/absent, or `boundaryCrossing` absent | **Fails closed** | `MISSING_FLOOR_INPUT` |
| Floor conditions held | Recorded `floor_applied: true`; advisory | `DEPTH_FLOOR_APPLIED` (warning) |
| `resolve` receives a `--task-id` failing the plan-anchor form | Reject before any append | `INVALID_TASK_ID` |
| `resolve` or `set` run at a workspace root, or targeting a path outside the project root | Reject before writing | `POLICY_PATH_OUTSIDE_ROOT` |
| `set --module <slug>` names an absent module or fails the charset | Reject; config files byte-identical | `UNKNOWN_POLICY_MODULE` |
| An emitted policy block contains an unsubstituted `{{ }}` placeholder | Init fails; names the offending field | `UNSUBSTITUTED_POLICY_PLACEHOLDER` |
| `/adev:implement` finds no assignment event for an accepted suite | Fails the write-test step for that task | `MISSING_DEPTH_ASSIGNMENT` |
| `sensitive-paths.yaml` is present but unparseable, or an entry is not a string | **Fails closed**; names the offending file or entry | `INVALID_SENSITIVE_PATHS` |
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
# resolves to the built-in default, so upgrades never break and narrowing is impossible.
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
**/secrets/**     **/*secret*        **/credentials/** **/*credential*
**/.env*          **/*.pem           **/*.key          **/*.p12
.context-index/governance/**         .github/workflows/**
```

Governance config is included deliberately: a task editing `gates.yaml`,
`risk-policies.yaml`, `boundaries.yaml`, or `sensitive-paths.yaml` itself is the
highest-leverage change class in a consumer repo and must be floored.

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
(Behavior 4), then the **safety floor** (Behavior 6), always last. No derived signal occupies a
chain stage, so an operator-authored override is always consulted.

The two passes are deliberately distinct and are not unified: the floor is not
configuration-gateable and its trigger set cannot be narrowed, while escalation is gated by
`escalation: false` and driven by project-authored rules.

### Configuration Lifecycle

**At onboarding (`/adev:init`).** The audit's sharpest finding was a project that shipped with
an unedited constitution template still containing `{{ test_command }}`, so its declared gates
could never execute and nobody noticed. Init emits literal values, with the domain overlay
supplying the starting point so the question is a confirmation rather than an interrogation.

**After onboarding (`adev test-policy`).** Reconfiguration needs visibility (`show`), a
validated atomic write path (`set`), and an answer to "why did this task get this depth"
(`explain`). The last decides adoption: a policy that cannot explain itself gets switched off.

**Migration semantics are inert.** Changing the policy never rewrites a plan and never touches
a test file. Upgrading a project that predates this capability requires no new config file.

### Interface Contract

| Interface | Type | Description |
|-----------|------|-------------|
| `adev test-policy resolve --plan <path> --task-id <id>` | CLI verb | Sole depth-resolution entry point and **sole writer** of `test_depth_assigned`. Chain → escalation → floor; JSON stdout; validated `--task-id`, project-root containment, workspace guard; typed non-zero exits. |
| `adev test-policy assert-assigned --plan <path> --task-id <id>` | CLI verb | **Presence check only** — verifies an assignment event exists for the task and exits non-zero with `MISSING_DEPTH_ASSIGNMENT`. Does not verify the authored suite against the assigned depth (Scope Boundary). Called by `/adev:implement` so the check is a verb, not skill prose. |
| `adev test-policy show \| set \| explain` | CLI verb | Operator surface. `set` performs validated, workspace-guarded, atomic writes. |
| `resolveTestDepth({ spec, riskLevel, policies, moduleOverride, domainDefault, routingScore, escalationRules, escalationEnabled, boundaryCrossing, targetPaths, sensitivePaths })` | function | Pure. `boundaryCrossing` and `targetPaths` are required; empty `targetPaths` raises `MISSING_FLOOR_INPUT` unconditionally. `sensitivePaths` is the already-unioned effective set. |
| `effectiveSensitivePaths(configured)` | function | Returns `DEFAULT_SENSITIVE_PATHS ∪ configured`. Never returns fewer entries than the built-in default. |
| `resolveGranularity({ moduleOverride, manifestPolicy, domainDefault })` | function | Plan-time resolution; no routing input. Pure. |
| `loadRigorPolicies(projectRoot)` | reused | Existing loader, extended read-only to surface `test_depth`. No behavior change for existing callers. |
| `parseTestPolicy(manifest)` | function | Parses/validates `test_policy`. Returns the built-in default when absent. |
| `inferGranularity(projectRoot, sourceRoots)` | function | Brownfield inference; returns a proposed granularity plus its evidence. |
| `test_depth_assigned` | lifecycle event | Registered in **both** `CANONICAL_EVENTS` (`lib/lifecycle-events.mjs`) and `REQUIRED_FIELDS_BY_EVENT` (`lib/diagnostics/event-schemas.mjs`). Payload carries `plan`, matching every shipped task-scoped event. Carries no `granularity` — that is a plan-time property already visible in the plan's `tests:` fields. |

## Documentation Requirements

Documentation is part of the definition of done. This capability **changes default behavior on
adoption** — projects will plan fewer test files, and a silent reduction in test volume erodes
trust when discovered rather than read about. And a policy nobody can find is a policy nobody
configures.

| Document | Required content |
|----------|------------------|
| `docs/test-strategies.md` | Both axes, both chains, the two monotonic passes, why escalation is upward-only, standalone write-test behavior, and worked examples under each granularity. Extends the existing `## Priority chain` section. |
| `docs/governance.md` | `test_depth` in `risk-policies.yaml`; `sensitive-paths.yaml` as an extend-only overlay on `DEFAULT_SENSITIVE_PATHS`; the independence of rigor and depth. |
| `docs/configuration.md` | The `test_policy` block: fields, enumerations, defaults, `modules[]` override forms, the pinned rule grammar, the escalation-threshold intent. |
| `docs/cli-reference.md` | `adev test-policy resolve \| assert-assigned \| show \| set \| explain`. |
| `docs/getting-started.md` | What init asks, what the answer changes, and the brownfield inference path. |
| `docs/README.md` | Index entries accurate for every page touched. |

The upgrade note must state plainly that adopting projects will plan fewer test files, that
`granularity: per-task` restores previous behavior, and that no new config file is required to
upgrade. Documented defaults must be verified against shipped values rather than transcribed.
Documentation prose is **not** a substitute for enforcement and must not be tested by
string-matching its content.

## System Constitution Reference

- **Principle 2 — "Skills are primarily markdown."** The central constraint: policy expressed
  only as skill prose drifts. This repo carries **103 test files that assert on markdown prose
  rather than production behavior** — they break on wording changes and catch no regressions.
  All resolution here is control flow and lives in `lib/test-strategies/policy.mjs` behind
  `adev test-policy resolve`; Behaviors 12, 14, and 17 exist so no skill has to branch.

- **Anti-pattern — "If a fenced JavaScript block contains control-flow logic… that logic
  belongs inside the CLI verb's implementation."** The chains, escalation pass, floor, and the
  assignment assertion are exactly such logic.

- **Principle 1 — "Minimize external dependencies."** Reuses the existing manifest and
  rigor-policy readers; rule evaluation is regex-only with `eval`/`new Function` prohibited.

- **Charter quality attribute — Backward compatibility.** Applies with a deliberate exception
  reviewers must weigh: this capability changes default behavior on adoption. That is the
  intent, and `granularity: per-task` is the explicit opt-out. Upgrades require no new file.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| ADR-0016 revision | Bring §2 and §4 into line with this spec: standalone reads no policy (not "the static chain alone"); payload drops `granularity` and adds `escalation_skipped?`; assignments accumulate (not one per task); `adev test-policy resolve` is the sole writer (not `/adev:implement`) | small |
| Amend `plan-test-mapping.spec.md` | Per `spec-amendment-artifacts.spec.md`: supersede its Behavior 3 counting rule | medium |
| Extend specify frontmatter contract | Add `test_depth:` to `skills/specify/SKILL.md`'s legal frontmatter set and the spec templates; amend specify's spec if required. Without this, depth chain stage 1 has no authoring path | medium |
| Charter revision 3 | Capability row, qualified Out of Scope, governance dependency, `TestDepthAssignment` entity, and `Spec test_depth field \| design` Consumed-API row. Bump `charter-revision:` to 3 in this spec when it lands | small |
| `DEFAULT_SENSITIVE_PATHS` | `lib/` constant + `effectiveSensitivePaths()` union; optional `sensitive-paths.yaml` overlay loader | small |
| Policy schema and parser | `parseTestPolicy()`; enum, grammar, and cap validation | small |
| Risk-policy extension | `test_depth` in `risk-policies.yaml` + init template; extend `loadRigorPolicies()` read-only | small |
| Granularity resolution | `resolveGranularity()` + plan-time wiring | small |
| Depth resolution | `resolveTestDepth()`: chain, monotonic escalation pass, fail-closed floor | medium |
| Event canon | `test_depth_assigned` in `CANONICAL_EVENTS` **and** `event-schemas.mjs`, projection, unknown-event handling. Canon additions carry a `[BOUNDARY: human-approved]` marker and review confirmation, per the `spec_amended` precedent (`lib/lifecycle-events.mjs:61-63`) | medium |
| `adev test-policy` verb | `resolve` / `assert-assigned` / `show` / `set` / `explain`; guarded atomic writes; validated `--task-id` | medium |
| Implement integration | Call `resolve` per task, pass depth into the write-test subagent, call `assert-assigned` (presence only) before accepting a suite, block-and-recover on `MISSING_FLOOR_INPUT` | medium |
| Plan-task file reader | Parse the `**Files:**` block per Behavior 8 — Create/Modify/Test labels, line-range stripping, repo-relative POSIX normalisation, fail-closed on empty. No such reader exists in `lib/` today | medium |
| Suite path resolution | `resolveSuitePath()`; detect existing coverage so tasks extend rather than create | medium |
| Plan integration | Replace the per-task `tests:` mandate with granularity-driven emission | medium |
| Write-test standalone | Pin standalone mode to the built-in `standard` depth; no policy reads, no event | small |
| Init integration | Two-file emission, placeholder guard, brownfield inference | medium |
| Hygiene drift pass | Declared policy versus actual test-tree layout; feeds the test-debt audit | medium |
| Documentation | The six doc updates, upgrade note, defaults verified against shipped values | medium |

## Acceptance Criteria

- [ ] Granularity resolves at plan time with no routing input; plan output is reproducible from static config alone
- [ ] The depth chain contains only static stages; no derived signal occupies a chain stage
- [ ] A spec-declared `test_depth:` beats a `modules[].test_depth` override and the risk-policy default
- [ ] A `modules[].test_depth` override is always consulted and is never made unreachable by routing
- [ ] Escalation is monotonic upward: a matching rule naming a lower depth than the chain result is a no-op
- [ ] `escalation: false`, a missing routing entry, and no rule matching are distinguishable via `escalation_skipped`
- [ ] With the shipped rules, a routine task (mid-range blast radius and novelty) does **not** escalate
- [ ] Escalation rules consume `0..1` floats; a rule written against a 1–5 scale is rejected by the pinned grammar
- [ ] Rule expressions are evaluated by regex only; the implementation contains no `eval` or `new Function`; exceeding 32 rules is rejected
- [ ] Malformed `escalation` flags, dimensions, expressions, and rule counts each raise their named error code
- [ ] `effectiveSensitivePaths()` never returns fewer entries than `DEFAULT_SENSITIVE_PATHS`; a config file cannot remove a built-in entry
- [ ] An absent or empty `sensitive-paths.yaml` resolves to the built-in set and does **not** raise; a project that predates this capability upgrades without adding any config file
- [ ] A task modifying `.context-index/governance/**`, including `sensitive-paths.yaml` itself, is floored to `thorough`
- [ ] Empty or absent `targetPaths` raises `MISSING_FLOOR_INPUT` unconditionally, with no "declares target files" qualifier anywhere in the spec or implementation
- [ ] The floor fires on a sensitive-path match with `risk_level: low` and `boundaries: []`
- [ ] `floor_applied: true` is recorded whenever floor conditions held, including when escalation had already raised the depth to `thorough`
- [ ] The floor is evaluated last — after chain and escalation — in every path, and only escalates
- [ ] `resolveRigorMode`, its precedence, its signature, and `tests/governance/rigor-mode.test.mjs` are unchanged by this change
- [ ] `adev test-policy resolve` is the sole writer of `test_depth_assigned`; no generic event-append verb exists
- [ ] `resolve` rejects a malformed `--task-id` and refuses to write outside the project root or at a workspace root, before any append
- [ ] `/adev:implement` calls `adev test-policy assert-assigned` — the check is a verb, not skill-prose branching — and fails the step with `MISSING_DEPTH_ASSIGNMENT` when no event exists
- [ ] A task may carry more than one assignment event; the most recent wins, and `explain` reports from it
- [ ] `MISSING_FLOOR_INPUT` mid-implement blocks the task with the offending input named and resumes via `/adev:recover`; the plan is not rewritten
- [ ] `assert-assigned` performs a presence check only and makes no claim about suite content
- [ ] The Capability, Behavior 14, and the Scope Boundary agree that the floor is advisory; no behavior, postcondition, or AC asserts that an authored suite matches its assigned depth
- [ ] A task in a plan with no `**Files:**` block resolves without a floor path check, records `floor_inputs: "unavailable"`, and remains implementable
- [ ] Backticked paths and bullets with surrounding prose parse correctly; non-path tokens are dropped
- [ ] `resolve` parses the `**Files:**` block per Behavior 8: line ranges stripped from `Modify:`, `Test:` paths included, repo-relative POSIX, fail-closed on an empty or absent block
- [ ] A task declaring only a `Test:` path under a sensitive directory is still floored
- [ ] Standalone `/adev:write-test` in all three invocation forms, with or without `.context-index/`, authors at `standard`, reads no policy config, evaluates no floor, and emits no event
- [ ] `test_depth_assigned` is registered in `CANONICAL_EVENTS` and `event-schemas.mjs`, carries `plan`, carries no `granularity`, and does not land in `unknownEvents[]`
- [ ] Sensitive-path matching is repo-relative POSIX via the existing `matchGlob`; `src/auth.ts` and `services/api/.env.production` both floor
- [ ] A present-but-unparseable `sensitive-paths.yaml`, or a non-string entry, fails closed with `INVALID_SENSITIVE_PATHS`
- [ ] adev's own `governance/sensitive-paths.yaml` extends the default with `lib/test-strategies/**`, `lib/governance/**`, and `lib/lifecycle-events.mjs`
- [ ] `--task-id` is validated against the pinned grammar and `../../x` is rejected before any append
- [ ] Neither `show` nor `explain` echoes any file path
- [ ] A suite authored at `minimal` is scanned with the identical blocker set as one authored at `thorough`
- [ ] `/adev:status` counts completion from plan-task events and reports correctly under `per-spec`
- [ ] An amendment to `plan-test-mapping.spec.md` ships in the same change
- [ ] `skills/specify/SKILL.md` and the spec templates accept `test_depth:` as legal frontmatter, so depth chain stage 1 has an authoring path
- [ ] Charter revision 3 lands with the capability row, qualified Out of Scope, governance dependency, `TestDepthAssignment` entity, and the `test_depth` Consumed-API row; this spec's `charter-revision:` is bumped to 3 at that point
- [ ] Per-module overrides key on `slug:` and resolve against a shipped manifest
- [ ] Under `per-behavior`, a task whose behavior is already covered gets an "extend" instruction referencing the existing suite
- [ ] `parseTestPolicy()` returns `{ granularity: "per-behavior", escalation: true }` with no warning when the block is absent; terminal source is `fallback`
- [ ] `show` names the winning layer per field and distinguishes built-in from configured sensitive paths
- [ ] `set` rejects an unknown or malformed `--module`, refuses to write at a workspace root, writes via temp+`rename()`, and round-trip-verifies; failures leave every config file byte-identical
- [ ] `/adev:init` emits literal scalars into `manifest.yaml` and `risk-policies.yaml`; no `{{ }}` placeholder or commented-out policy survives; it does not emit `sensitive-paths.yaml`
- [ ] `/adev:init --brownfield` proposes the inferred granularity with evidence; with no suite it falls back to the domain default and says so
- [ ] A plan generated under `per-behavior` emits strictly fewer distinct test files than the same plan under `per-task`
- [ ] Given fixed static config and a fixed routing sidecar, resolution is deterministic; where scores vary, depth can only rise
- [ ] The six documented files are updated, the upgrade note states the default-behavior change and the no-new-file upgrade path, and documented defaults are verified against shipped values
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced

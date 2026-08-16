---
mode: cross-cutting
affects: [validation, unified-gates, review, cli-driver-surface, agent-reliable-state-artifacts, domain-extensions]
depends-on:
  - .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
kind: refactor
status: implemented
risk_level: medium
revision: 5
created: 2026-08-14
updated: 2026-08-16
tracker-ref: adev-plugin-8ekd.1
source-manifest:
  sha: "35d210b"
  files:
    - .context-index/governance/boundaries.yaml
    - .context-index/governance/diagnostics.yaml
    - .context-index/governance/gates.yaml
    - .context-index/governance/review.yaml
    - .context-index/governance/validate.yaml
    - .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
    - cli/index.mjs
    - docs/cli-reference.md
    - docs/configuration.md
    - docs/extensions.md
    - docs/governance.md
    - lib/cli/boundaries.mjs
    - lib/cli/diagnose.mjs
    - lib/cli/domain.mjs
    - lib/cli/gate.mjs
    - lib/cli/governance.mjs
    - lib/cli/report.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/diagnostics/index.mjs
    - lib/domains/merge-gates.mjs
    - lib/extensions/content-install.mjs
    - lib/extensions/governance-registry.mjs
    - lib/extensions/governance-splice.mjs
    - lib/extensions/governance-values.mjs
    - lib/extensions/install.mjs
    - lib/gates/doctor.mjs
    - lib/gates/gate-sets.mjs
    - lib/governance/boundaries.mjs
    - lib/governance/boundary-worker.mjs
    - lib/governance/enablement.mjs
    - lib/governance/materialize.mjs
    - lib/governance/registry-marker.mjs
    - lib/governance/review-config.mjs
    - lib/governance/source-vocabulary.mjs
    - lib/governance/transitions.mjs
    - lib/governance/validate-config.mjs
    - lib/hygiene/registry-drift.mjs
    - lib/lifecycle-state.mjs
    - providers/codex/skills/hygiene/SKILL.md
    - providers/codex/skills/init/SKILL.md
    - providers/codex/skills/review-specs/SKILL.md
    - providers/codex/skills/validate/SKILL.md
    - providers/opencode/skills/hygiene/SKILL.md
    - providers/opencode/skills/init/SKILL.md
    - providers/opencode/skills/review-specs/SKILL.md
    - providers/opencode/skills/validate/SKILL.md
    - skills/hygiene/SKILL.md
    - skills/init/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/validate/SKILL.md
    - skills/validate/checks/validate.check-1-quality-gates.md
    - skills/validate/checks/validate.check-8-boundaries.md
    - skills/validate/checks/validate.check-9-transition-gates.md
    - templates/diagnostics-template.yaml
    - templates/domains/software/validate.yaml
    - templates/gates-template.yaml
    - templates/governance/review.example.yaml
    - tests/cli/boundaries-check.test.mjs
    - tests/cli/diagnose-validated-without-report.test.mjs
    - tests/cli/diagnose.test.mjs
    - tests/cli/domain.test.mjs
    - tests/cli/gate-doctor.test.mjs
    - tests/cli/report-gate-outcomes.test.mjs
    - tests/diagnostics/event-schemas.test.mjs
    - tests/diagnostics/registry.test.mjs
    - tests/evals/configurable-governance/configurable-governance.test.mjs
    - tests/evals/configurable-governance/golden/no-registry-review.md
    - tests/evals/configurable-governance/setup-fixture.sh
    - tests/evals/configurable-governance/tier2-dispatch-shape.test.mjs
    - tests/fixtures/governance/no-commonjs.clean
    - tests/fixtures/governance/no-commonjs.violating
    - tests/fixtures/governance/no-hardcoded-claude-home.clean
    - tests/fixtures/governance/no-hardcoded-claude-home.violating
    - tests/fixtures/governance/no-inline-node-in-skills.clean
    - tests/fixtures/governance/no-inline-node-in-skills.violating
    - tests/gates/doctor-consumer-parity.test.mjs
    - tests/gates/shipped-defaults.test.mjs
    - tests/governance/boundaries.test.mjs
    - tests/governance/boundary-rules-corpus.test.mjs
    - tests/governance/deterministic-check-migration.test.mjs
    - tests/governance/enabled-flag.test.mjs
    - tests/governance/materialize.test.mjs
    - tests/governance/registry-effective-set.test.mjs
    - tests/governance/registry-marker.test.mjs
    - tests/governance/review-config.test.mjs
    - tests/governance/source-vocabulary.test.mjs
    - tests/governance/transitions-config.test.mjs
    - tests/governance/transitions.test.mjs
    - tests/governance/validate-config-single-source.test.mjs
    - tests/hygiene/registry-drift-pass-19.test.mjs
    - tests/lib/domains/merge-gates.test.mjs
    - tests/lib/extensions/content-install.test.mjs
    - tests/lib/extensions/governance-marker-gate.test.mjs
    - tests/lib/extensions/governance-merge-hardening.test.mjs
    - tests/lib/extensions/governance-registry.test.mjs
    - tests/lib/extensions/governance-splice.test.mjs
    - tests/lib/extensions/governance-values.test.mjs
    - tests/lib/extensions/install.test.mjs
    - tests/lib/extensions/invariant-dependencies.test.mjs
    - tests/lib/gates/doctor.test.mjs
    - tests/lib/lifecycle-state.test.mjs
    - tests/lifecycle/gate-outcomes.test.mjs
    - tests/skills/validate-gate-resolution.test.mjs
    - tests/specs/explicit-governance-registries-contract.test.mjs
  computed-at: "2026-08-16T00:22:19.907Z"
---

# Live Spec: Explicit Governance Registries

<!-- Cross-cutting refactor. Frontmatter precedes the H1 deliberately: `adev specify
     revise` cannot parse a spec whose frontmatter is not the first non-blank content. -->

## Current State

### Structure

| File | Role (per ADR-0010) | Composition model | Contents today |
|---|---|---|---|
| `.context-index/governance/validate.yaml` | Composite post-implementation verdict | **Replace-all** — no bundled read, no overlay (`lib/governance/validate-config.mjs:74`) | 7 checks, explicit |
| `.context-index/governance/review.yaml` | Subjective architectural review | **Three-layer overlay** — bundled → domain → project (`lib/governance/review-config.mjs:53-79`) | `reviewers: []` — 3 reviewers run, none named |
| `.context-index/governance/diagnostics.yaml` | Artifact-level verifiability | **Append, first-wins**; bundled `plugin:` entries unshadowable | 4 entries, explicit |
| `.context-index/governance/gates.yaml` | Process gates | **Domain-merged** via `lib/domains/merge-gates.mjs` | `test` only; `lint`, `typecheck`, `integration-test` commented out; `transitions: {}` |
| `.context-index/governance/boundaries.yaml` | Single-regex content rules | n/a | `boundaries: []` |

### Problems

1. **Three composition models across four adjacent files.** Editing `review.yaml` means "state my deltas"; editing `validate.yaml` means "state everything." Nothing in either file's name or location signals which. The effective rule set cannot be read off any single file.

2. **Two rulesets ship empty and are never populated.** `boundaries: []` and `transitions: {}` have been empty since scaffold. `/adev:validate` Check 8 dispatches an LLM subagent, per spec, per run, at `severity: error`, to evaluate zero rules — measured 40 PASS / 0 FAIL. Check 9 does the same over `transitions: {}` — 39 PASS + 1 PWN / 0 FAIL. Neither can fail. Meanwhile the rules that *should* live in `boundaries.yaml` exist as prose in `CLAUDE.md`'s Anti-Patterns section, and one of them (`no inline Node in SKILL.md`) was implemented as a bespoke git hook because prose did not bind agents.

3. **A check whose body is an algorithm runs as a subagent.** `skills/validate/checks/validate.check-8-boundaries.md` reads in full: *"Run regex `pattern` against file contents, respecting `exclude` globs. `severity: error` → FAIL. `severity: warning` → WARN."* That is a predicate, dispatched at ~95K tokens per validate run against implement's ~25K (`adev-plugin-gyad`). ADR-0010 assigns `review.yaml` the role "checks that require *reasoning*… **NOT** for anything answerable by a regex" — Check 8 contradicts its own surface's role.

4. **The gate doctor inspects a different gate set than its consumers execute.** `lib/gates/doctor.mjs::loadGates` (line 1109) reads `gates.yaml` raw — `readFileSync` → `parseYaml` → `doc.gates`. Every consumer runs the domain-merged set. A gate contributed by a domain profile or extension overlay is invisible to the doctor, which inverts the verb's own thesis (`adev-plugin-3sw`).

5. **Bundled defaults cannot be seen, disabled, or audited.** `review.yaml`'s header states the three bundled reviewers "run by default and are not listed here." A project cannot express "we deliberately do not run the security reviewer" — an absent entry is indistinguishable from an entry the project never knew existed. This is the same failure class as `adev-plugin-ogjm` (scaffolds silently losing string-command gates on upgrade), which is filed for gates only.

### Dependencies

- `lib/governance/validate-config.mjs`, `lib/governance/review-config.mjs` — registry loaders; the composition models live here.
- `lib/domains/merge-gates.mjs`, `lib/domains/merge-reviewers.mjs::mergeReviewers` (exported; sole consumer `lib/cli/domain.mjs:53`) — the overlay machinery this spec makes explicit rather than implicit. It is **retained**, and moves from run time to scaffold time. This is a different function from the module-private `mergeReviewers` in `lib/governance/review-config.mjs:312`, which REMOVED targets; the two share a name and nothing else (CON-4).
- `lib/gates/doctor.mjs` — consumes gates; blocks this work (`adev-plugin-3sw`).
- `skills/hygiene/SKILL.md` Audit Pass 19 (Validate Config Drift) — the compensating mechanism the validation charter pairs with single-source. Extending single-source to three more registries extends this pass's remit.
- ADR-0010 (Proposed) — role assignments consumed here as normative. This spec does **not** move any check between surfaces, so neither of the ADR's two deferrals is implicated.

## Target State

### Structure

| File | Composition model | Contents after |
|---|---|---|
| `validate.yaml` | Explicit single-source (unchanged) | 7 checks; Checks 8 and 9 flip to `kind: deterministic-check` |
| `review.yaml` | **Explicit single-source** | 3 reviewers named in full, each with `enabled: true\|false` |
| `diagnostics.yaml` | **Explicit single-source** | 4 entries named in full, bundled `plugin:` runners still referenced by path |
| `gates.yaml` | **Explicit single-source** | Merged result materialized; `transitions` populated |
| `boundaries.yaml` | unchanged role | Populated from the constitution's mechanical anti-patterns |

### Improvements

- **One composition model.** What a governance file contains is what runs. Reading `.context-index/governance/` answers "what will gate my change" without consulting bundled defaults, domain profiles, or loader source.
- **Opting out becomes a statement.** `enabled: false` with a reason replaces absence-as-opt-out, so a deliberately-disabled check is distinguishable from one the project never saw.
- **Upgrades stay visible, not silent.** New bundled checks surface through the existing hygiene drift pass — opt-in adoption, matching the model the validation charter already chose, rather than arriving unannounced or never arriving at all.
- **The doctor's defect dissolves.** With gates explicit and unmerged, `loadGates` reading the raw file is correct by construction. `adev-plugin-3sw` is resolved by removing the divergence rather than by teaching the doctor to reproduce it.
- **Checks get cheaper as they get more numerous.** Checks 8 and 9 stop being subagent dispatches. Populating `boundaries.yaml` then costs approximately nothing per rule, so the constitution's mechanical rules can be enforced at plan, implement *and* validate time rather than only at pre-commit.

### Extension contribution — split out

Extensions already use this spec's target model: `provides.governance` is merged into the project's
own governance file **at install time**, project-wins on collision, with no run-time overlay. Single
source is the model extensions already follow; bundled and domain defaults are being brought into
line with *them*.

The merge implementation is, however, unsafe — path traversal, no field allowlist, a fill-gap loop
that can inject `command:` into a project-owned gate, destructive serialization, and no escaping
contract. **That work is now `extension-governance-merge-hardening.spec.md`**, split out of this spec
at revision 4 on 2026-08-15.

The split is by contract, not convenience. That spec's claim is *"an extension's contribution writes
exactly what it declared, only where it is permitted, and never mutates what it did not create"* — a
security property over untrusted input, provable against the registries exactly as they are today.
This spec's claim is *"what a governance file contains is what runs"* — a composition property. They
share files but not a failure mode, and holding them together is what produced two consecutive
revisions that closed blockers while introducing new ones.

**This spec depends on that one.** Step 4 populates `transitions:` in `gates.yaml`, which the current
merge deletes, and Step 6's drift pass keys on `source`, which that spec stamps. The dependency is
one-way.

## Changes Catalog

### ADDED

- `adev boundaries check [--json]` — CLI verb evaluating `boundaries.yaml` regexes against changed files. Wraps a new `lib/governance/boundaries.mjs`.
- `adev gate transitions [--json]` — CLI verb evaluating `transitions` required-gates for a lifecycle transition. Two tokens, not three: `docs/cli-reference.md` has no three-token precedent (`adev gate doctor`, `adev gate require`, `adev domain load-gates`), so the earlier three-token spelling (which appended a `check` token) is dropped (CON-5, DDR-8).
- `skills/validate/checks/validate.check-1-quality-gates.md` — **a new file.** Check 1 has no check body on disk today (`skills/validate/checks/` holds `check-1.5` through `check-14`, but no `check-1`), so this is an addition, not a modification. Its body records the per-gate outcome array described in MODIFIED.
- `enabled` + `disabled_reason` fields on entries in `review.yaml`, `diagnostics.yaml`, `gates.yaml`, `validate.yaml`.
- `adev governance materialize --registry <name>` — one-shot verb writing the currently-effective merged set into the project's yaml, so existing projects can adopt single-source without hand-transcribing defaults.
- Boundary rules in `boundaries.yaml` derived from the constitution's mechanical anti-patterns.
- `transitions` entries in `gates.yaml` naming gates that carry real argv commands.
- `source:` **vocabulary extension only.** The field itself is declared and installer-stamped by `extension-governance-merge-hardening.spec.md` (value `extension:<name>`). This spec adds the `project` | `bundled` | `domain:<slug>` values, written by `adev governance materialize`, and consumes the field in Step 6's drift pass. Declaring it there rather than here is what keeps the dependency one-way — that spec is implementable against the registries as they stand today.
- `materialized_at` — **top-level root key** in a **marked registry** (a sibling of `reviewers:` / `diagnostics:` / `gates:`, never an entry field), holding an ISO-8601 UTC timestamp. It is the sole discriminator of the un-materialized state, so its applicable set, its writers and its immutability are contract, not incidental:
  - **Marked registries, exhaustively (SA-2):** `review.yaml`, `diagnostics.yaml`, `gates.yaml` — exactly the three that Step 5 materializes. `validate.yaml` and `boundaries.yaml` are **exempt**: both are already explicit single-source today, so there is no implicit-to-explicit transition for a marker to record (the Target State table lists both "unchanged"). Marking them would make `/adev:validate` Check 8 unreachable on the current tree (`boundaries: []` with no marker would halt the caller instead of reaching Behavior 1's SKIP) and would make an extension install against `validate.yaml` — the reference extension's actual target, `tests/lib/extensions/example-validation-check-install.test.mjs:49` — refuse.
  - **Writers, exhaustively:** `adev governance materialize` stamps it when absent, and `/adev:init` scaffolding stamps it when creating a registry from a domain starter. Nothing else writes it.
  - **Write-once.** Once present it is never refreshed. Re-materialization preserves the original value, which is what keeps Behavior 6's byte-identical guarantee true on the second and subsequent runs.
  - **Installer-immutable.** Extension install never writes, refreshes or removes it, and an extension-supplied `materialized_at` in entry data is rejected exactly as a supplied `source` is.

### MODIFIED

- `lib/governance/review-config.mjs` — drop the three-layer overlay; read the project file as authoritative. Also carries the `__source` → on-disk `source:` vocabulary mapping declared under Review-Debt Dispositions (DDR-4), which is what makes `project-override` and `manifest-specialist` entries defined rather than undefined for Step 6's drift pass.
- `lib/diagnostics/index.mjs` — bundled `plugin:` entries become explicit registry rows rather than implicit additions.
- `lib/domains/merge-gates.mjs` — retained for `adev governance materialize` and `/adev:init` scaffolding; no longer consulted at run time.
- `skills/validate/checks/validate.check-8-boundaries.md` — body becomes a call to `adev boundaries check --json`, following the `check-14-gate-executability` pattern.
- `skills/validate/checks/validate.check-9-transition-gates.md` — same, calling `adev gate transitions --json`.
- `.context-index/governance/validate.yaml` — Checks 8 and 9 change `kind: subagent-review` → `deterministic-check`.
- `skills/hygiene/SKILL.md` Audit Pass 19 — remit extended from `validate.yaml` to all four registries. The non-`project` `source` exclusion is **narrowed to unadopted-upgrade findings only** (DDR-6): a non-`project` entry is still exempt from "you have not adopted this new bundled entry" noise, but Pass 19 additionally emits a sub-finding listing every non-`project` entry carrying an execution-bearing field (`command`, `runner`, `prompt`, `pattern`).
- **The `validator_report` payload** — Check 1 additionally records a per-gate outcome array (`gate_outcomes`) alongside its existing aggregate verdict. This is a payload extension to an existing `CANONICAL_EVENTS` variant, **not** a new variant, so it does not cross the ADR-0009 `[BOUNDARY: human-approved]` line that adding a gate-outcome event would. The two writers are named below, because today neither can carry the array (SA-1):
- `lib/cli/report.mjs` — gains a **`--gate-outcomes <json>` flag** on `adev report --type validator`, carrying the per-gate outcome array. Today the validator flag set is closed (`--error` / `--score` / `--duration-ms` / `--notes`, `lib/cli/report.mjs:427-442`), so an unlisted array has no transport.
- `lib/lifecycle-state.mjs::reportValidator` — gains `gate_outcomes` and `manifest_sha` in its destructured argument list and in the constructed `payload`. Today it destructures a fixed argument list and builds `payload` from only those fields (`lib/lifecycle-state.mjs:866-886`), so an unlisted field is silently dropped. `manifest_sha` is the spec source-manifest `sha` at the moment of the gate run, consumed by Behavior 4's freshness rule.
  Both optional fields are recorded against the `validator_report` variant in `lifecycle-event-log.spec.md`, attributed to this spec — the mechanism that spec already uses to record `revision` contributed by `review-block-auto-retry`. That charter (`agent-reliable-state-artifacts`) is in this spec's `affects:` list for exactly this reason.

### REMOVED

- Implicit bundled-reviewer injection in `review-config.mjs` — specifically the module-private `mergeReviewers` at `lib/governance/review-config.mjs:312` and its call site at `:85`. The identically-named **exported** `mergeReviewers` in `lib/domains/merge-reviewers.mjs:26` is **not** removed; it is retained for scaffold-time use by its one consumer, `lib/cli/domain.mjs:53` (CON-4).
- Run-time domain merging of gates.

### RENAMED

None. Check identifiers are untouched — the ID-namespace work is `check-id-enum.spec.md`, blocked on ADR-0010, and deliberately excluded here.

## Migration Path

### Step 1: Fix the doctor's blocking defect

Resolve `adev-plugin-3sw` by making the divergence impossible: once Step 5 lands, `loadGates` reading the raw file is correct. Until then, add a doctor finding when the raw and merged sets differ, so the divergence is reported rather than silently wrong.

- **Risk:** Low — additive finding only.
- **Verify:** `adev gate doctor --json` reports a divergence finding on a project with a domain-contributed gate.

### Step 2: Make Checks 8 and 9 deterministic

Add `lib/governance/boundaries.mjs` + `adev boundaries check`, and the transitions equivalent. Rewrite both check prompts to call the verbs. Flip `kind` in `validate.yaml`.

- **Risk:** Low — both checks currently evaluate empty rulesets, so the **pass/fail outcome** is unchanged (40 and 39 historical PASSes, zero FAILs). The **verdict does change**: PASS becomes SKIP, per Behaviors 1 and 3. A regression test for this step must pin SKIP, not PASS — pinning PASS-preservation would contradict the contract.
- **Verify:** Both checks return SKIP with a reason on empty rulesets; a seeded violating file produces FAIL; no subagent dispatch is recorded for either check.

### Step 3: Land the extension-merge hardening first (external dependency)

`extension-governance-merge-hardening.spec.md` must be implemented and validated before Step 4.
This step is a gate, not work owned here: Step 4 populates `transitions:` in `gates.yaml`, and the
current merge deletes sibling keys on any extension install, so populating before that spec lands
means the block can be silently destroyed later.

- **Risk:** None owned here. The risk is in the dependency, which carries `risk_level: high`.
- **Verify:** that spec's status is `validated`, and its acceptance criterion "installing any
  extension targeting `gates.yaml` leaves a populated `transitions:` block byte-identical" passes.

### Step 4: Populate the rulesets

Translate the constitution's mechanical anti-patterns into `boundaries.yaml` rules. Populate `transitions` for gates carrying real argv commands.

- **Risk:** Medium — the first step that can fail a build. Land rules at `severity: warning` first, promote to `error` after one clean cycle.
- **Verify:** Each rule fires on a deliberately-violating fixture and stays silent on the current tree.

### Step 5: Materialize the three implicit registries

**The upgrade window (blocker SA-1).** Removing the run-time overlay ships in the plugin; running
`materialize` happens in each consumer project. They deploy from different artifacts at different
times, so between plugin upgrade and materialization a project's `review.yaml` is `reviewers: []`
with nothing left to populate the effective set — `/adev:review-specs` would dispatch zero reviewers
while still reporting a verdict. Invariant 2 forbids exactly that.

**Resolution: fail closed, do not silently degrade.** The loaders gain an explicit
un-materialized state. **A marked registry — `review.yaml`, `diagnostics.yaml`, `gates.yaml` — is
un-materialized if and only if its project file lacks a `materialized_at` marker.** Entry count is
irrelevant, and so is whether bundled or domain defaults exist. The marked set is exactly the set
this step materializes; `validate.yaml` and `boundaries.yaml` are exempt (SA-2, see ADDED).

Both properties are deliberate. Keying on emptiness would leave the *partially*-populated case open:
registries compose additively (`review-config.mjs:80-83` merges project reviewers on top of the
bundled base), so a project with one hand-added reviewer plus the three bundled ones has a non-empty
list, is not "empty", and would silently lose the three bundled reviewers — including
`security-reviewer` — the moment the overlay is removed. One entry would have been enough to defeat
the guard, and hand-adding one reviewer is the workflow `review.yaml`'s own header documents.

Keying on "defaults exist" would also be undecidable: that is a question about the merged set, and
this same step removes run-time merging. The marker is a property of the project file alone, which
is the only thing the loader can still read.

In the un-materialized state the loader raises `REGISTRY_NOT_MATERIALIZED` naming the registry and
the remedy (`adev governance materialize --registry <name>`), and the calling skill halts. It never
proceeds with a partial or empty set.

Extension install is subject to the same gate: installing into a **marked** registry that lacks the
marker is refused, so an install cannot pre-empt materialization and thereby stamp a registry as materialized
with only its own entry in it. **This rule is owned here, not by
`extension-governance-merge-hardening.spec.md`** — the marker is this spec's construct, so the gate
layers onto the install path after that spec lands. That spec's Invariant 4 anticipates it by
reserving "any marker owned by the composition model" as installer-immutable, which is why the two
compose without a circular dependency.

Auto-materializing on first read was rejected: it would perform a silent config write during an
unrelated command, and the whole point of this spec is that governance changes are visible.


Ship `adev governance materialize`, run it for `review`, `diagnostics` and `gates`, then remove run-time merging.

- **Risk:** Medium — highest blast radius. A project whose materialized file omits a bundled entry silently loses that check.
- **Verify:** For each registry, the effective set before and after materialization is byte-identical when serialized in canonical order. This is the invariant that makes the step safe, and it must be a test, not an inspection.

### Step 6: Extend the drift pass

Widen hygiene Audit Pass 19 to all four registries so upgrades surface as findings, and add a
disabled-check audit: flag any entry carrying `enabled: false` whose `source` is `bundled` or
`domain:*`. Absent this, a bundled check can be switched off in an ordinary one-line PR diff and the
drift pass — which reports only *unadopted new* entries — stays silent (SEC-4). Add the
execution-bearing-field sub-finding from DDR-6 in the same pass: list every non-`project` entry
carrying `command`, `runner`, `prompt` or `pattern`, so an appended extension gate that reaches
`spawnSync` is visible even though it is exempt from unadopted-upgrade findings.

- **Risk:** Low.
- **Verify:** Adding an entry to a bundled default produces a drift finding naming the registry and entry.

## Invariants

1. All existing tests pass at every step.
2. **The effective check set never changes silently.** At every step, the set of checks that run — with their severities — is either identical to the previous step or differs only where this spec explicitly says so. Step 5 makes this a mechanical equality test.
3. No check moves between surfaces. Surface assignment is ADR-0010's concern; this spec changes composition and execution mechanism only.
4. Check identifiers are unchanged. `check-id-enum.spec.md` owns that vocabulary.
5. A disabled check is always distinguishable from an absent one.
6. Deterministic checks emit the same verdict vocabulary as the subagent checks they replace (`PASS` / `FAIL` / `SKIP` / `WARN`), so historic `.validate.md` reports stay comparable.

## Behavioral Contract

### Behaviors

1. **When** `/adev:validate` runs Check 8 and `boundaries.yaml` declares no rules **then** the check records SKIP with the reason "no boundary rules declared" and dispatches no subagent.
2. **When** `boundaries.yaml` declares rules and a changed file matches a rule's `pattern` outside its `exclude` globs **then** the check records FAIL for `severity: error` rules and WARN for `severity: warning` rules, naming file, rule id and matched line.
3. **When** `/adev:validate` runs Check 9 and `transitions` is empty **then** the check records SKIP, not PASS — a PASS asserts a verification that did not occur.
4. **When** `transitions` declares `required_gates` for a lifecycle transition **then**
   `adev gate transitions --transition <name>` reads the **per-gate outcomes carried in Check
   1's `validator_report` payload** and records FAIL naming any required gate without a passing
   outcome. It does **not** execute gates — execution belongs to `gates.yaml` (Check 1) — and it does
   **not** evaluate workflow preconditions such as "did the prior step complete", which ADR-0010's
   decision-flow step 1 routes to `requireGate` in `lib/lifecycle-state.mjs`. Check 9 answers only
   "did the gates this transition requires actually pass?"

   **Substrate note.** The lifecycle log has no per-gate record today: `CANONICAL_EVENTS`
   (`lib/lifecycle-events.mjs:36-79`) has no gate variant, and Check 1 emits one aggregate
   `validator_report` for the whole gate run, so gate ids are never event subjects. Read against
   that substrate the check would FAIL every required gate — build-breaking once Step 4 promotes
   rules to `error`. This spec therefore **extends Check 1's existing `validator_report` payload**
   with a per-gate outcome array rather than adding a new event variant. That choice is deliberate:
   adding a `CANONICAL_EVENTS` variant is a `[BOUNDARY: human-approved]` change under ADR-0009, and
   enriching an existing payload stays inside this spec's authority. See MODIFIED.

   **Outcome record shape.** Each element of `gate_outcomes` is
   `{ id, verdict, tier, command_sha? }`. This supersedes the earlier `{id, verdict, tier}` triple.
   `command_sha` is the SHA-256 of the gate's resolved argv, computed by the executor at run time.

   **Staleness (CON-1).** `sha` is a content fingerprint with no temporal ordering, so it cannot be
   the left side of an "at or after" comparison — `computed-at` is the only ordered field in the
   `{sha, files, computed-at}` stamp (ADR-0011). An outcome is therefore **fresh** if and only if
   both hold:
   1. the enclosing `validator_report` event's own `ts` is at or after the `computed-at` timestamp
      of the spec's current source-manifest stamp; **and**
   2. when the payload carries `manifest_sha`, that value equals the spec's current source-manifest
      `sha`.

   A payload with no `manifest_sha` is a pre-upgrade record: condition 2 is vacuously satisfied and
   the timestamp comparison alone decides. An outcome that is not fresh records SKIP with reason
   `stale-gate-record`, never a pass.

   **Attestation (SEC-2).** `gate_outcomes` is written **only** by Check 1, from its own gate
   execution results. It is never accepted as an authority from an arbitrary
   `adev report --type validator` payload, because that verb is an open CLI surface any agent or
   skill-extension block can call. Check 9 therefore re-checks each outcome it reads:
   - an outcome whose `id` is absent from the resolved `gates.yaml` gate set records SKIP with
     reason `unattested-gate-record`, never a pass;
   - an outcome whose `command_sha` **is present** and does not equal the SHA-256 of the resolved
     argv for that gate id records SKIP with the same reason;
   - an outcome whose `command_sha` is **missing** is not an error. It is a pre-upgrade record, and
     the gate-id membership check alone applies — the same fail-soft posture the staleness rule
     gives a missing `manifest_sha`.
5. **When** a governance registry entry carries `enabled: false` **then** the check does not run and the report records it as deliberately disabled with its `disabled_reason`, distinct from a check that is absent.
6. **When** `adev governance materialize --registry <name>` runs against a registry with no `materialized_at` **then** it writes the currently-effective merged set into the project's yaml and stamps `materialized_at` with the current UTC time, and makes no other change.
7. **When** `adev governance materialize` runs against a registry that already carries `materialized_at` **then** it refreshes the entry set but preserves the existing timestamp verbatim, so a second run against an unchanged effective set produces byte-identical output. Stamping is write-once; the marker records when the registry left the un-materialized state, not when it was last written.
8. **When** `/adev:init` scaffolds a registry from a domain starter **then** it stamps `materialized_at` at scaffold time, so a freshly initialized project is born materialized and never hits the fail-closed guard on its first run.
9. **When** a registry has been materialized and the plugin later adds a bundled entry **then** `/adev:hygiene` Audit Pass 19 reports a drift finding naming the registry and the entry, and the project's behaviour is unchanged until it adopts.
10. **When** `adev gate doctor` inspects gates **then** it inspects exactly the set its consumers execute.
11. **When** a **marked** registry's project file — `review.yaml`, `diagnostics.yaml` or `gates.yaml` — lacks a `materialized_at` marker **then** the loader raises `REGISTRY_NOT_MATERIALIZED` and the calling skill halts — regardless of how many entries the file holds, and without consulting bundled or domain defaults. `validate.yaml` and `boundaries.yaml` are exempt (SA-2): both are already explicit single-source and the Target State table leaves both "unchanged", so their loaders never evaluate the marker and never raise.
12. **When** a boundary rule's evaluation exceeds its 250 ms per-file budget **then** the worker running it is terminated and the check fails closed naming the rule, exactly as for an invalid pattern — it never hangs the caller. Files above the 1 MB input cap are not scanned; the check **records a finding at the rule's own severity, naming file and rule** (SEC-3 — a silent SKIP would let padding a file past the cap silence every boundary rule on it, a fail-open bypass of a merge gate this spec introduces). The cap is applied via `statSync().size` before reading. Binary content is skipped by the same rule and reported the same way (DDR-14).

### Error Cases

| Condition | Expected behavior | Code |
|---|---|---|
| `boundaries.yaml` rule has an invalid regex | Verb exits non-zero naming the rule id; no partial evaluation | `INVALID_BOUNDARY_PATTERN` |
| `transitions` names a gate id absent from `gates` | Hygiene Pass 8 finding (existing behavior, preserved) | — |
| `adev governance materialize` would drop an entry present in the effective set | Refuses to write; reports the entry | `MATERIALIZE_WOULD_DROP` |
| A row the project file declares failed to LOAD (loader error, or the id is absent from the effective set) | Refuses to write and refuses to stamp, naming the rows and the loader errors; `--dry-run` reports the identical refusal. A WARNING-severity loader diagnostic does not block — it is surfaced on the result envelope | `MATERIALIZE_LOAD_INCOMPLETE` |
| Registry file missing after materialization | Hard error, as `validate.yaml` already does | `MISSING_REGISTRY_CONFIG` |
| `enabled: false` without `disabled_reason` | Schema warning; check still disabled | `DISABLED_WITHOUT_REASON` |
| Boundary rule exceeds its evaluation time budget | Check fails closed naming the rule | `BOUNDARY_PATTERN_TIMEOUT` |
| A **marked** registry project file (`review.yaml`, `diagnostics.yaml`, `gates.yaml`) lacks `materialized_at` | Loader raises; calling skill halts. `validate.yaml` and `boundaries.yaml` are exempt and never raise | `REGISTRY_NOT_MATERIALIZED` |
| Extension install targets a **marked** registry (`review.yaml`, `diagnostics.yaml`, `gates.yaml`) lacking `materialized_at` | Install refuses; cannot pre-empt materialization. Installs into the exempt `validate.yaml` / `boundaries.yaml` are unaffected | `REGISTRY_NOT_MATERIALIZED` |

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| validation | High | Checks 8/9 execution mechanism; registry loader semantics; hygiene drift-pass remit |
| unified-gates | High | Gates become explicit; `transitions` populated; doctor defect resolved |
| review | Medium | Bundled reviewers materialized into `review.yaml`; loader drops overlay |
| cli-driver-surface | Medium | Three new CLI verbs; check bodies become verb calls (the established `check-14` pattern) |
| agent-reliable-state-artifacts | Low | Two optional `validator_report` payload fields (`gate_outcomes`, `manifest_sha`) recorded in `lifecycle-event-log.spec.md`; `reportValidator` and `adev report --type validator` carry them |
| domain-extensions | Low — install refuses into a **marked** registry lacking `materialized_at` | The marker gate layers onto `lib/extensions/content-install.mjs` after `extension-governance-merge-hardening.spec.md` lands; no other install-path change |

## Integration Points

1. `/adev:validate` ↔ `boundaries.yaml`: Check 8 calls `adev boundaries check --json` rather than reasoning over the file.
2. `/adev:hygiene` ↔ all four registries: Audit Pass 19 becomes the single upgrade-adoption channel, which is what makes single-source safe.
3. `/adev:init` ↔ domain starters: scaffolding still uses `merge-gates` / `merge-reviewers` to seed a new project's explicit files. The merge machinery moves from run time to scaffold time.
4. `adev gate doctor` ↔ `gates.yaml`: consumer and inspector read the same set by construction.

## System Constitution Reference

- **Minimize external dependencies** — all three new verbs use Node built-ins only. Regex evaluation uses `RegExp` plus `node:worker_threads` for the per-rule time budget (see Step 3); both are built-ins, so no dependency is added. The earlier claim that evaluation "needs nothing beyond `RegExp`" was wrong — a synchronous regex cannot be interrupted, which made the budget unimplementable as written.
- **Hook protocol compliance** — boundary evaluation becomes reusable by `.githooks/`, letting the bespoke `pre-commit-no-inline-node` hook eventually become one boundary rule among many.
- **Skills are primarily markdown** — check bodies shrink to a verb invocation; the logic moves to `lib/`, matching the cli-driver-surface charter.
- **Architecture Boundaries / Requires Human Approval** — this spec changes what blocks a merge. Step 4 lands rules at `warning` before `error` for that reason.

## Acceptance Criteria

- [ ] Check 8 records SKIP, not PASS, on an empty `boundaries.yaml`, and dispatches no subagent.
- [ ] Check 9 records SKIP, not PASS, on empty `transitions`.
- [ ] Checks 8 and 9 carry `kind: deterministic-check` in `validate.yaml`.
- [ ] `boundaries.yaml` contains at least the constitution's regex-decidable anti-patterns, each with a fixture proving it fires and a fixture proving it does not fire on the current tree.
- [ ] `transitions` names only gates carrying real argv commands; hygiene Pass 8 passes.
- [ ] `review.yaml`, `diagnostics.yaml` and `gates.yaml` list every entry that runs; no entry runs that is not listed.
- [ ] A test asserts the effective set is byte-identical before and after materialization, per registry.
- [ ] `enabled: false` entries appear in the validate report as deliberately disabled with their reason.
- [ ] `adev gate doctor` and `/adev:validate` Check 1 operate on the same gate set, asserted by a test.
- [ ] Hygiene Audit Pass 19 reports drift for all four registries.
- [ ] Every governance entry carries a `source:` value; hygiene **unadopted-upgrade** findings exclude non-`project` sources, and a separate Pass 19 sub-finding lists every non-`project` entry carrying `command`, `runner`, `prompt` or `pattern`.
- [ ] A **marked** registry (`review.yaml`, `diagnostics.yaml`, `gates.yaml`) holding entries but no `materialized_at` marker still raises `REGISTRY_NOT_MATERIALIZED` — asserted with a non-empty `review.yaml`, which is the case a list-emptiness predicate would miss. The exempt registries (`validate.yaml`, `boundaries.yaml`) never raise it, asserted by loading both without a marker.
- [ ] The loader decides materialization from the project file alone, with no read of bundled or domain defaults — asserted by a test that removes the defaults and observes the same verdict.
- [ ] An extension install into a **marked** registry lacking `materialized_at` is refused; an install into `validate.yaml` or `boundaries.yaml` is unaffected by the marker gate.
- [ ] Round trip: a registry with no marker raises `REGISTRY_NOT_MATERIALIZED`; after `adev governance materialize` the loader proceeds; a second materialize produces byte-identical output including an unchanged `materialized_at`.
- [ ] A freshly `/adev:init`-scaffolded project carries `materialized_at` on every **marked** registry (`review.yaml`, `diagnostics.yaml`, `gates.yaml`) and never raises the guard on first run.
- [ ] `adev gate transitions` reads per-gate outcomes from Check 1's `validator_report` payload; a gate outcome whose event `ts` precedes the `computed-at` of the spec's current source-manifest stamp records SKIP with `stale-gate-record`, not a pass.
- [ ] A gate outcome whose payload carries a `manifest_sha` unequal to the spec's current source-manifest `sha` records SKIP with `stale-gate-record`, even when its `ts` is recent. A payload with no `manifest_sha` is judged on `ts` alone.
- [ ] A hand-appended `validator_report` carrying `gate_outcomes` for a gate id absent from the resolved `gates.yaml` set records SKIP with `unattested-gate-record` and does not satisfy a transition's `required_gates`.
- [ ] An outcome whose `command_sha` is present and does not match the SHA-256 of the gate's resolved argv records SKIP with `unattested-gate-record`, not a pass.
- [ ] An outcome with **no** `command_sha` is not rejected on that basis — it is judged by gate-id membership alone, asserted by a fixture holding a pre-upgrade record.
- [ ] `lib/cli/report.mjs` accepts `--gate-outcomes` and `reportValidator` persists `gate_outcomes` and `manifest_sha` into the `validator_report` payload, asserted by a round-trip test that writes and re-reads the event.
- [ ] No new `CANONICAL_EVENTS` variant is introduced — asserted by a test pinning the variant list, so the ADR-0009 boundary stays uncrossed.
- [ ] `adev gate transitions` records FAIL naming any required gate without a passing record, and never executes a gate.
- [ ] A catastrophically-backtracking pattern (`(a+)+$`) against a crafted input terminates within the 250 ms budget and records a failure naming the rule — asserted by a test that would hang without worker termination.
- [ ] A file above the 1 MB input cap produces a finding at the offending rule's own severity naming file and rule — not a silent SKIP — asserted by a fixture padded past the cap that would otherwise match an `error`-severity rule.
- [ ] Hygiene flags `enabled: false` on any `bundled`/`domain:*` entry.
- [ ] No check identifier changed; no check moved between surfaces.
- [ ] All quality gates pass; no constitutional violations.

## Review-Debt Dispositions

The revision-4 architecture review carried four warnings that had survived multiple revisions
untouched. They are decided here, so the next reviewer reads a disposition rather than silence.

| Ref | Finding | Disposition |
|---|---|---|
| DDR-4 | SA-4 / CON-3 — the on-disk `source:` enum has no counterpart in `review-config.mjs`'s runtime `__source` vocabulary | **ADDRESSED** — mapping declared below |
| DDR-6 | SEC-4 — Pass 19 is blind to an extension-appended `command` because it excludes all non-`project` sources | **PARTIALLY ADDRESSED** — exclusion narrowed + sub-finding taken now; ledger diff and install-time summary DEFERRED |
| DDR-14 | SEC-6 — no aggregate ceiling on boundary evaluation cost | **PARTIALLY ADDRESSED** — binary-content skip taken now; wall-clock budget and changed-file ceiling DEFERRED |
| DDR-15 | SEC-7 — containment via `resolve()` + `startsWith` does not resolve symlinks | **ADOPTED**, in narrow form |

**DDR-4 — `source:` vocabulary mapping (ADDRESSED).** `adev governance materialize` writes the
on-disk enum from the runtime provenance value:

| Runtime `__source` (`lib/governance/review-config.mjs`) | On-disk `source:` |
|---|---|
| `bundled` | `bundled` |
| `project` | `project` |
| `project-override` | `project` |
| `manifest-specialist` | `project` |
| domain-sourced | `domain:<slug>` |
| installer-stamped | `extension:<name>` |

The three project-flavoured runtime values collapse to `project` because they differ only in *how*
the project expressed the entry, not in *who owns* it — and ownership is the only question Step 6's
drift pass and the `enabled: false` audit ask. This closes the previously-undefined treatment of
`project-override` entries.

**DDR-6 — Pass 19 scope (PARTIALLY ADDRESSED).** Taken now: the non-`project` exclusion applies
only to unadopted-upgrade findings, plus the new execution-bearing-field sub-finding (see MODIFIED
and Step 6). Deferred with an issue: the ledger-based *changed-since-last-install* diff and the
install-time summary line naming any appended entry carrying an execution-bearing field. Both need
an install ledger that does not exist yet; the sub-finding covers the standing state without one.

**DDR-14 — boundary evaluation cost (PARTIALLY ADDRESSED).** Taken now: binary content is skipped
(Behavior 12). Deferred with an issue: the aggregate wall-clock budget across all rules × changed
files, and the changed-file ceiling. Both are cross-cutting cost controls over the whole check set
rather than properties of this spec's two checks, and pinning either number without measurement
would be arbitrary.

**DDR-15 — symlink containment (ADOPTED, narrow form).** Every write path in this spec resolves its
target, and **when the target already exists**, `realpathSync`es it and re-asserts containment
within `.context-index/governance/`. The `realpath` step is conditional on existence because a
not-yet-created registry file has no real path to resolve; the plain containment assertion still
covers that case. The known registry set is enumerated explicitly (`validate.yaml`, `review.yaml`,
`diagnostics.yaml`, `gates.yaml`, `boundaries.yaml`) rather than left implicit.

## Out of Scope

- **Check-ID namespace and enum enforcement.** Owned by `check-id-enum.spec.md`, blocked on ADR-0010's boundary decision. Bundling it here would repeat the packaging error that dissolved `measurement-integrity.spec.md`.
- **Migrating checks into the diagnostics registry.** ADR-0010 defers this; the `check-14` pattern makes Checks 8/9 deterministic without it.
- **Subsuming `boundaries.yaml` into `diagnostics.yaml`.** ADR-0010's second deferral. Its precondition is not "regex evaluation exists" — Step 2 of this spec builds that — but a regex **runner template inside the diagnostic registry** (`plugin:diagnostics/runners/regex-boundary.mjs`, ADR-0010:68), plus a migration window for projects already using boundaries. Neither exists. `lib/governance/boundaries.mjs` is deliberately built as a pure evaluator so the later consolidation can wrap it rather than reimplement it.
- **Schema-driven artifact linting** (`adev-plugin-kast`) — needs the diagnostics deferral lifted.
- **Check read-once caching** (`adev-plugin-gyad`) and **early skip generalization** (`adev-plugin-l7gu`) — same epic, separate contracts; this spec makes two checks cheap, those make all checks cheap.

---
mode: cross-cutting
affects: [validation, unified-gates, review, cli-driver-surface, domain-extensions]
kind: refactor
status: review-pending
risk_level: medium
revision: 4
created: 2026-08-14
updated: 2026-08-15
tracker-ref: adev-plugin-8ekd.1
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
| `.context-index/governance/gates.yaml` | Process gates | **Domain-merged** via `lib/domains/merge-gates.mjs` | 1 uncommented gate (`test`); `integration-test` present; `transitions: {}` |
| `.context-index/governance/boundaries.yaml` | Single-regex content rules | n/a | `boundaries: []` |

### Problems

1. **Three composition models across four adjacent files.** Editing `review.yaml` means "state my deltas"; editing `validate.yaml` means "state everything." Nothing in either file's name or location signals which. The effective rule set cannot be read off any single file.

2. **Two rulesets ship empty and are never populated.** `boundaries: []` and `transitions: {}` have been empty since scaffold. `/adev:validate` Check 8 dispatches an LLM subagent, per spec, per run, at `severity: error`, to evaluate zero rules — measured 40 PASS / 0 FAIL. Check 9 does the same over `transitions: {}` — 39 PASS + 1 PWN / 0 FAIL. Neither can fail. Meanwhile the rules that *should* live in `boundaries.yaml` exist as prose in `CLAUDE.md`'s Anti-Patterns section, and one of them (`no inline Node in SKILL.md`) was implemented as a bespoke git hook because prose did not bind agents.

3. **A check whose body is an algorithm runs as a subagent.** `skills/validate/checks/validate.check-8-boundaries.md` reads in full: *"Run regex `pattern` against file contents, respecting `exclude` globs. `severity: error` → FAIL. `severity: warning` → WARN."* That is a predicate, dispatched at ~95K tokens per validate run against implement's ~25K (`adev-plugin-gyad`). ADR-0010 assigns `review.yaml` the role "checks that require *reasoning*… **NOT** for anything answerable by a regex" — Check 8 contradicts its own surface's role.

4. **The gate doctor inspects a different gate set than its consumers execute.** `lib/gates/doctor.mjs::loadGates` (line 1109) reads `gates.yaml` raw — `readFileSync` → `parseYaml` → `doc.gates`. Every consumer runs the domain-merged set. A gate contributed by a domain profile or extension overlay is invisible to the doctor, which inverts the verb's own thesis (`adev-plugin-3sw`).

5. **Bundled defaults cannot be seen, disabled, or audited.** `review.yaml`'s header states the three bundled reviewers "run by default and are not listed here." A project cannot express "we deliberately do not run the security reviewer" — an absent entry is indistinguishable from an entry the project never knew existed. This is the same failure class as `adev-plugin-ogjm` (scaffolds silently losing string-command gates on upgrade), which is filed for gates only.

### Dependencies

- `lib/governance/validate-config.mjs`, `lib/governance/review-config.mjs` — registry loaders; the composition models live here.
- `lib/domains/merge-gates.mjs`, `lib/domains/merge-reviewers.mjs` — the overlay machinery this spec makes explicit rather than implicit.
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

### Extension contribution

Extensions already conform to the target model in principle: `provides.governance: [{target, entries}]`
is merged into the project's own governance file **at install time** by
`lib/extensions/content-install.mjs::mergeGovernanceEntries`, project-wins on id collision. There is
no run-time extension overlay, so single-source does not break the extension path — it is the model
extensions already use, and bundled/domain defaults are being brought into line with *them*.

The implementation, however, is destructive, and this spec cannot land without fixing it — Step 4
populates `transitions:` in `gates.yaml`, which the current merge would delete. That is why the merge
fix is sequenced as Step 3, ahead of any step that writes to a governance file.

**Verified 2026-08-14** by running the reference extension's own entry against a real `validate.yaml`
(7 checks, 20 lines of comments). Result: the file was replaced with three lines under `validators:`.
All seven checks destroyed. Two compounding defects:

1. **Root-key mismatch.** `inferRootKey('validate.yaml')` returns `'validators'`
   (`content-install.mjs:235`), but the schema key is `checks:` — what `validate-config.mjs:110`
   reads, and what the project file and `templates/domains/software/validate.yaml` both use. The
   merge reads `parsed['validators']`, finds nothing, and starts from an empty set.
2. **Serialization drops siblings and comments.** `serializeGovernanceYaml` emits one root key and
   its entries only. Even with the key corrected, an extension targeting `gates.yaml` would erase
   `transitions:`.

`tests/lib/extensions/example-validation-check-install.test.mjs:206` encodes defect 1 as intent
(`const entries = validate.validators || validate.checks || []`), which is why it has survived.

Blast radius today is narrow — neither shipped extension uses `provides.governance`; both go through
`installDomainProfile`. The only consumer is the reference example that documents the mechanism.

Three further gaps this spec closes:

- **No provenance.** Merged entries carry no marker, so an extension-contributed entry is
  indistinguishable from a project-authored one. That breaks uninstall, and would make the widened
  hygiene drift pass (Step 5) report extension entries as project drift.
  `review-config.mjs` already tracks provenance via `__source` on the run-time overlay path — the
  install-time path needs the same field, which is also what makes the two paths consistent.
- **No uninstall.** Nothing under `lib/extensions/` reverses a governance merge; entries are
  permanent once installed.
- **`boundaries.yaml` and `diagnostics.yaml` work only by accident.** `inferRootKey` falls through
  to the filename stem, which happens to be correct for both. The mapping should be an explicit
  table so a future registry does not inherit `validate.yaml`'s failure.

## Changes Catalog

### ADDED

- `adev boundaries check [--json]` — CLI verb evaluating `boundaries.yaml` regexes against changed files. Wraps a new `lib/governance/boundaries.mjs`.
- `adev gate transitions check [--json]` — CLI verb evaluating `transitions` required-gates for a lifecycle transition.
- `enabled` + `disabled_reason` fields on entries in `review.yaml`, `diagnostics.yaml`, `gates.yaml`, `validate.yaml`.
- `adev governance materialize --registry <name>` — one-shot verb writing the currently-effective merged set into the project's yaml, so existing projects can adopt single-source without hand-transcribing defaults.
- Boundary rules in `boundaries.yaml` derived from the constitution's mechanical anti-patterns.
- `transitions` entries in `gates.yaml` naming gates that carry real argv commands.
- `source:` provenance field on every governance entry (`project` | `bundled` | `domain:<slug>` | `extension:<name>`), written by materialize and by extension install.
- `materialized_at` — **top-level root key** in each governance yaml (a sibling of `checks:` / `reviewers:` / `gates:` / `diagnostics:` / `boundaries:`, never an entry field), holding an ISO-8601 UTC timestamp. It is the sole discriminator of the un-materialized state, so its writers and immutability are contract, not incidental:
  - **Writers, exhaustively:** `adev governance materialize` stamps it when absent, and `/adev:init` scaffolding stamps it when creating a registry from a domain starter. Nothing else writes it.
  - **Write-once.** Once present it is never refreshed. Re-materialization preserves the original value, which is what keeps Behavior 6's byte-identical guarantee true on the second and subsequent runs.
  - **Installer-immutable.** Extension install never writes, refreshes or removes it, and an extension-supplied `materialized_at` in entry data is rejected exactly as a supplied `source` is.
- `adev extension uninstall --name <n>` governance reversal: removes entries whose `source` matches, leaving project-authored entries untouched.

### MODIFIED

- `lib/governance/review-config.mjs` — drop the three-layer overlay; read the project file as authoritative.
- `lib/diagnostics/index.mjs` — bundled `plugin:` entries become explicit registry rows rather than implicit additions.
- `lib/domains/merge-gates.mjs` — retained for `adev governance materialize` and `/adev:init` scaffolding; no longer consulted at run time.
- `skills/validate/checks/validate.check-8-boundaries.md` — body becomes a call to `adev boundaries check --json`, following the `check-14-gate-executability` pattern.
- `skills/validate/checks/validate.check-9-transition-gates.md` — same, calling `adev gate transitions check --json`.
- `.context-index/governance/validate.yaml` — Checks 8 and 9 change `kind: subagent-review` → `deterministic-check`.
- `skills/hygiene/SKILL.md` Audit Pass 19 — remit extended from `validate.yaml` to all four registries; entries with a non-`project` `source` are excluded from drift findings.
- `skills/validate/checks/validate.check-1-quality-gates.md` + the `validator_report` payload — Check 1 additionally records a per-gate outcome array (`[{id, verdict, tier}]`) alongside its existing aggregate verdict. This is a payload extension to an existing `CANONICAL_EVENTS` variant, **not** a new variant, so it does not cross the ADR-0009 `[BOUNDARY: human-approved]` line that adding a gate-outcome event would.
- `lib/extensions/content-install.mjs::inferRootKey` — replace stem-inference with an explicit registry→root-key table; `validate.yaml` maps to `checks`, not `validators`.
- `lib/extensions/content-install.mjs::serializeGovernanceYaml` — preserve sibling root keys and comments; write only the targeted key's array.
- `tests/lib/extensions/example-validation-check-install.test.mjs:206` — assert the `checks` contract instead of accommodating `validators || checks`.

### REMOVED

- Implicit bundled-reviewer injection in `review-config.mjs`.
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

### Step 3: Fix the extension merge before anything writes to a governance file

Correct `inferRootKey` to an explicit table, make `serializeGovernanceYaml` non-destructive, add the
`source:` provenance field, and add governance reversal to uninstall. This must precede Step 4
because Step 4 populates `transitions:`, which the current merge deletes.

**Three security defects in the existing merge must be fixed in this step** — they are live in
shipped code today, independent of this spec, and are tracked as `adev-plugin-xg1f.1` and
`adev-plugin-xg1f.2`. This spec depends on the code path, so it cannot land while they stand:

- **Path containment (SEC-2, reproduced).** `install.mjs:91` takes `target` from the extension
  manifest; `mergeGovernanceEntries` does `join(govDir, targetFile)` + `writeFileSync` with no
  containment check. `target: '../../ESCAPED.yaml'` writes outside `.context-index/governance/`
  without error. Apply the `resolve()` + `startsWith(resolvedDir + '/')` pattern that
  `installSamples` (`content-install.mjs:307-318`) and `installSkillExtensions` (`:383-384`) already
  use in the same file, and additionally constrain `target` to the known registry set. Error code
  `PATH_TRAVERSAL`, distinct from `UNKNOWN_GOVERNANCE_TARGET`.
- **Field allowlist, and removal of fill-gap merging (SEC-1).** `validateGovernanceEntry`
  (`content-install.mjs:101-119`) validates only `id`. Add a per-registry field allowlist, and stamp
  `source` from install context while rejecting an extension-supplied `source` or `materialized_at`.

  **Delete the collision fill-gap loop outright** (`content-install.mjs:206-210`) rather than
  guarding it with a protected-key list. A key list cannot be made safe: `gates.yaml` entries carry
  `command:`, which reaches `spawnSync`, and `command` is a *legitimate* field for that registry —
  so an extension colliding on a gate id whose entry has no command injects a shell command into a
  project-owned entry, permanently, because the entry then reads as project-authored. Per Behavior
  16 a colliding entry is **skipped** and the existing entry left byte-identical. Fill-gap's only
  value was populating absent optional fields, which explicit single-source makes unnecessary.
- **Regex time budget (SEC-3).** `adev boundaries check` must bound each rule's evaluation and treat
  a timeout exactly as an invalid pattern: fail closed naming the rule. Because `boundaries.yaml` is
  extension-writable, an unbounded pattern is a denial-of-service lever on a merge gate, not only an
  author-carelessness risk.

  **Mechanism, named.** A synchronous `RegExp.exec` cannot be interrupted mid-backtrack — no timer,
  `AbortSignal`, or wall-clock check runs while the engine backtracks — so a budget expressed over
  plain `RegExp` is untestable by construction. Each rule is therefore evaluated inside a
  `node:worker_threads` worker (a Node built-in, so the zero-dependency principle holds) and the
  parent calls `worker.terminate()` when the budget expires. **Budget: 250 ms per rule per file**,
  with an input-size cap of 1 MB per file above which the rule records SKIP rather than running.
  Termination is reported identically to `INVALID_BOUNDARY_PATTERN` — fail closed, name the rule.

- **Risk:** Low in blast radius (no shipped extension uses `provides.governance`), high in
  consequence if skipped.
- **Verify:** Installing the reference extension against a `validate.yaml` holding 7 checks yields 8
  checks under `checks:`, with comments intact and `transitions:` untouched in `gates.yaml`. This is
  a regression test, not an inspection — the current test encodes the defect as expected behavior.

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
un-materialized state. **A registry is un-materialized if and only if its project file lacks a
`materialized_at` marker.** Entry count is irrelevant, and so is whether bundled or domain defaults
exist.

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

Extension install is subject to the same gate: installing into a registry that lacks the marker is
refused, so an install cannot pre-empt materialization and thereby stamp a registry as materialized
with only its own entry in it.

Auto-materializing on first read was rejected: it would perform a silent config write during an
unrelated command, and the whole point of this spec is that governance changes are visible.


Ship `adev governance materialize`, run it for `review`, `diagnostics` and `gates`, then remove run-time merging.

- **Risk:** Medium — highest blast radius. A project whose materialized file omits a bundled entry silently loses that check.
- **Verify:** For each registry, the effective set before and after materialization is byte-identical when serialized in canonical order. This is the invariant that makes the step safe, and it must be a test, not an inspection.

### Step 6: Extend the drift pass

Widen hygiene Audit Pass 19 to all four registries so upgrades surface as findings, and add a
disabled-check audit: flag any entry carrying `enabled: false` whose `source` is `bundled` or
`domain:*`. Absent this, a bundled check can be switched off in an ordinary one-line PR diff and the
drift pass — which reports only *unadopted new* entries — stays silent (SEC-4).

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
   `adev gate transitions check --transition <name>` reads the **per-gate outcomes carried in Check
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

   **Staleness.** A gate outcome is usable only if recorded at or after the source-manifest SHA the
   spec currently carries. An outcome predating the current implementation state records SKIP with
   reason `stale-gate-record`, never a pass.
5. **When** a governance registry entry carries `enabled: false` **then** the check does not run and the report records it as deliberately disabled with its `disabled_reason`, distinct from a check that is absent.
6. **When** `adev governance materialize --registry <name>` runs against a registry with no `materialized_at` **then** it writes the currently-effective merged set into the project's yaml and stamps `materialized_at` with the current UTC time, and makes no other change.
7. **When** `adev governance materialize` runs against a registry that already carries `materialized_at` **then** it refreshes the entry set but preserves the existing timestamp verbatim, so a second run against an unchanged effective set produces byte-identical output. Stamping is write-once; the marker records when the registry left the un-materialized state, not when it was last written.
8. **When** `/adev:init` scaffolds a registry from a domain starter **then** it stamps `materialized_at` at scaffold time, so a freshly initialized project is born materialized and never hits the fail-closed guard on its first run.
9. **When** a registry has been materialized and the plugin later adds a bundled entry **then** `/adev:hygiene` Audit Pass 19 reports a drift finding naming the registry and the entry, and the project's behaviour is unchanged until it adopts.
10. **When** `adev gate doctor` inspects gates **then** it inspects exactly the set its consumers execute.
11. **When** an extension declaring `provides.governance` is installed **then** its entries are appended to the target registry under that registry's own root key, every other key and comment in the file is preserved byte-identically, and each appended entry carries `source: extension:<name>`.
12. **When** an extension whose id collides with an existing entry is installed **then** the existing entry wins untouched and the install reports the collision as skipped, naming the id.
13. **When** an extension is uninstalled **then** entries carrying its `source` are removed and no other entry is touched.
14. **When** a registry's project file lacks a `materialized_at` marker **then** the loader raises `REGISTRY_NOT_MATERIALIZED` and the calling skill halts — regardless of how many entries the file holds, and without consulting bundled or domain defaults.
15. **When** an extension supplies a `source` or `materialized_at` field on an entry **then** the installer rejects it; `source` is stamped from install context only.
16. **When** an extension's entry id collides with an existing entry **then** the colliding entry is recorded as **skipped** and the existing entry is left byte-identical. The merge introduces no key onto an existing entry — not an absent one, not an optional one, none. Fill-gap merging is removed outright rather than protected by a key list.
17. **When** an extension's `target` resolves outside `.context-index/governance/` **then** the install refuses with `PATH_TRAVERSAL` and writes nothing.
18. **When** a boundary rule's evaluation exceeds its 250 ms per-file budget **then** the worker running it is terminated and the check fails closed naming the rule, exactly as for an invalid pattern — it never hangs the caller. Files above the 1 MB input cap record SKIP rather than being scanned.

### Error Cases

| Condition | Expected behavior | Code |
|---|---|---|
| `boundaries.yaml` rule has an invalid regex | Verb exits non-zero naming the rule id; no partial evaluation | `INVALID_BOUNDARY_PATTERN` |
| `transitions` names a gate id absent from `gates` | Hygiene Pass 8 finding (existing behavior, preserved) | — |
| `adev governance materialize` would drop an entry present in the effective set | Refuses to write; reports the entry | `MATERIALIZE_WOULD_DROP` |
| Registry file missing after materialization | Hard error, as `validate.yaml` already does | `MISSING_REGISTRY_CONFIG` |
| `enabled: false` without `disabled_reason` | Schema warning; check still disabled | `DISABLED_WITHOUT_REASON` |
| Extension targets a registry with no root-key mapping | Install refuses; names the registry | `UNKNOWN_GOVERNANCE_TARGET` |
| Extension merge would drop an existing root key | Install refuses; names the key | `MERGE_WOULD_TRUNCATE` |
| Extension `target` resolves outside `.context-index/governance/` | Install refuses; writes nothing | `PATH_TRAVERSAL` |
| Extension entry carries a field outside its registry's allowlist | Install refuses; names field and registry | `GOVERNANCE_FIELD_NOT_ALLOWED` |
| Extension entry supplies `source` | Install refuses; `source` is installer-stamped only | `GOVERNANCE_SOURCE_FORGED` |
| Boundary rule exceeds its evaluation time budget | Check fails closed naming the rule | `BOUNDARY_PATTERN_TIMEOUT` |
| Registry project file lacks `materialized_at` | Loader raises; calling skill halts | `REGISTRY_NOT_MATERIALIZED` |
| Extension install targets a registry lacking `materialized_at` | Install refuses; cannot pre-empt materialization | `REGISTRY_NOT_MATERIALIZED` |

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| validation | High | Checks 8/9 execution mechanism; registry loader semantics; hygiene drift-pass remit |
| unified-gates | High | Gates become explicit; `transitions` populated; doctor defect resolved |
| review | Medium | Bundled reviewers materialized into `review.yaml`; loader drops overlay |
| cli-driver-surface | Medium | Three new CLI verbs; check bodies become verb calls (the established `check-14` pattern) |
| domain-extensions | High | Extension governance merge becomes non-destructive and provenance-tracked; uninstall gains governance reversal |

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
- [ ] Installing the reference extension against a 7-check `validate.yaml` yields 8 entries under `checks:`, comments intact.
- [ ] Installing any extension targeting `gates.yaml` leaves `transitions:` byte-identical.
- [ ] Every governance entry carries a `source:` value; hygiene drift findings exclude non-`project` sources.
- [ ] Uninstalling an extension removes exactly its entries.
- [ ] A registry holding entries but no `materialized_at` marker still raises `REGISTRY_NOT_MATERIALIZED` — asserted with a non-empty `review.yaml`, which is the case a list-emptiness predicate would miss.
- [ ] The loader decides materialization from the project file alone, with no read of bundled or domain defaults — asserted by a test that removes the defaults and observes the same verdict.
- [ ] An extension install into a registry lacking `materialized_at` is refused.
- [ ] Round trip: a registry with no marker raises `REGISTRY_NOT_MATERIALIZED`; after `adev governance materialize` the loader proceeds; a second materialize produces byte-identical output including an unchanged `materialized_at`.
- [ ] A freshly `/adev:init`-scaffolded project carries `materialized_at` on every registry and never raises the guard on first run.
- [ ] An extension supplying `materialized_at` in entry data is rejected.
- [ ] `adev gate transitions check` reads per-gate outcomes from Check 1's `validator_report` payload; a gate outcome older than the spec's current source-manifest SHA records SKIP with `stale-gate-record`, not a pass.
- [ ] No new `CANONICAL_EVENTS` variant is introduced — asserted by a test pinning the variant list, so the ADR-0009 boundary stays uncrossed.
- [ ] `adev gate transitions check` records FAIL naming any required gate without a passing record, and never executes a gate.
- [ ] An extension `target` of `../../x.yaml` is refused with `PATH_TRAVERSAL` and writes nothing — asserted by a test that reproduces the current escape.
- [ ] An extension supplying `source: project` is refused; installer-stamped `source` survives uninstall correctly.
- [ ] An extension colliding on id cannot introduce **any** key onto the existing entry; the collision is reported as skipped and the entry is byte-identical afterwards.
- [ ] An extension cannot introduce a `command` onto an existing `gates.yaml` entry — the specific arbitrary-code-execution path, asserted directly.
- [ ] A catastrophically-backtracking pattern (`(a+)+$`) against a crafted input terminates within the 250 ms budget and records a failure naming the rule — asserted by a test that would hang without worker termination.
- [ ] Hygiene flags `enabled: false` on any `bundled`/`domain:*` entry.
- [ ] No check identifier changed; no check moved between surfaces.
- [ ] All quality gates pass; no constitutional violations.

## Out of Scope

- **Check-ID namespace and enum enforcement.** Owned by `check-id-enum.spec.md`, blocked on ADR-0010's boundary decision. Bundling it here would repeat the packaging error that dissolved `measurement-integrity.spec.md`.
- **Migrating checks into the diagnostics registry.** ADR-0010 defers this; the `check-14` pattern makes Checks 8/9 deterministic without it.
- **Subsuming `boundaries.yaml` into `diagnostics.yaml`.** ADR-0010's second deferral. Its precondition is not "regex evaluation exists" — Step 2 of this spec builds that — but a regex **runner template inside the diagnostic registry** (`plugin:diagnostics/runners/regex-boundary.mjs`, ADR-0010:68), plus a migration window for projects already using boundaries. Neither exists. `lib/governance/boundaries.mjs` is deliberately built as a pure evaluator so the later consolidation can wrap it rather than reimplement it.
- **Schema-driven artifact linting** (`adev-plugin-kast`) — needs the diagnostics deferral lifted.
- **Check read-once caching** (`adev-plugin-gyad`) and **early skip generalization** (`adev-plugin-l7gu`) — same epic, separate contracts; this spec makes two checks cheap, those make all checks cheap.

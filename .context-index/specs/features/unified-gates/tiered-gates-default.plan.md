<!-- DO NOT EDIT statuses inline — see lifecycle log tiered-gates-default.jsonl -->
# Implementation Plan: Tiered Gates by Default — Active Integration Tier in the Gates Template

> **Methodology:** adev
> **Charter:** .context-index/specs/features/unified-gates/charter.md
> **Spec:** .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-13)
> **Platform:** Node.js (ESM, `.mjs`), `node:test`, npm — zero external dependencies

**Goal:** Make the already-shipped tier engine reachable by default, by activating a
declared integration tier in every template and starter surface, teaching the argv-list
`command` form the loader actually accepts, and letting `adev gate doctor` diagnose
argv gates instead of reporting them as empty.

**Architecture:** Seven tasks across four surface classes — one library change
(`lib/gates/doctor.mjs` argv normalisation, the hard dependency), three YAML artifact
changes (the generic template plus the three stack-committed starters), two SKILL.md
prose changes (`/adev:implement` Step 2-post, `/adev:init` Step 7a), and one docs
section. The rule the spec adopts governs the split: **activity belongs where the stack
is known.** The stack-agnostic `templates/gates-template.yaml` ships live entries whose
`command: ""` is an explicit unwired sentinel that `mergeGates` drops with a named
`INVALID_GATE` warning; the stack-committed starters ship a live error-severity
integration gate whose command (`[npm, run, --if-present, test:integration]`) is a
verified no-op until the project defines the script. No new gate schema fields are
introduced. Tests assert against the **shipped** artifacts, not hand-written fixtures —
that is the specific gap the spec's "Systemic Pattern" section names.

**Issue board:** Epic/issue creation was **deliberately skipped** for this plan run
(pipeline constraint: the shared board `.context-index/tasks/tasks.json` must not be
written from this worktree). Plan-task `pending` events are still emitted to the
lifecycle log, which is the authoritative task-state channel per
`agent-reliable-state-artifacts/plan-task-events.spec.md`. No epic exists for this plan;
create one manually if the board needs a board-granularity item.

---

## Plan-Level Decisions

Three decisions are resolved here rather than left to the implementer.

### D1 — SA-5: per-gate `severity` wins, with the tier default as fallback

Review note SA-5 (warning) identified a contradiction: behavior 9 feeds
`/adev:implement` Step 2-post a **merged** gate list whose entries carry per-gate
`severity`, but Step 2-post's existing prose (`skills/implement/SKILL.md:599`) declares
tier-uniform severity.

**Resolution (Task 4):** a gate's own `severity` wins when present; the tier default
(`error` for fast and integration, `warning` for e2e) applies only when the gate omits
it; and `required: false` still forces `severity: warning` regardless of any explicit
value. This matches `/adev:validate` Check 1 (`skills/validate/SKILL.md:173`, which
enumerates `severity` as a per-gate field) and the charter capability "Severity and
Required Reconciliation" (`charter.md:86`), so the two integration-gate consumers agree.

Task 4 **replaces** — does not merely amend — this sentence at
`skills/implement/SKILL.md:599`:

> All commands within the integration tier share the tier's severity (default: `error`).
> Individual commands do not have their own severity.

That sentence must not survive the edit in any form. Its replacement states the
per-gate-wins model explicitly.

### D2 — Gate id reuse across the template and the starter surfaces

The integration gate added to the software starter and both extension overlays (Task 2)
uses the id **`integration-test`** — the same id the template's integration entry
carries. This is deliberate, and `mergeGates` (`lib/domains/merge-gates.mjs:57-88`) makes
it the correct composition:

- A fresh scaffold's governance layer carries `integration-test` with `command: ""`.
  `validateGate` rejects a falsy command (line 29) and returns `null`, so the governance
  entry never enters `byId` and never clobbers the live domain gate. The scaffold gets
  the starter's working no-op integration gate **and** the named `INVALID_GATE` warning
  the spec's behavior 3 requires.
- Once `/adev:init` seeds a real command (Task 5), the governance entry validates and
  overrides the domain gate by id, emitting `GATE_OVERRIDE` — the intended precedence.

Distinct per-domain ids would break both properties. Do not rename them.

Layering note: `loadDomainConfig` (`lib/domains/domain-config.mjs:36`) resolves **exactly
one** domain directory per project (custom → extension → bundled), so the two extension
overlays are *alternative* domains and are never stacked on top of the software starter.
Id reuse here is about template-vs-domain precedence, not about deduplicating two
simultaneously-active domain gates.

### D3 — What survives `mergeGates`, and what that means for consumers

`validateGate` (`lib/domains/merge-gates.mjs:41-47`) returns a **narrowed** object —
`{ id, command, description?, severity?, tier? }` plus an injected `__source`. It drops
`kind`, `name`, `scope`, `required`, and `triggers`. Every consumer of the merged list
must therefore apply defaults rather than read absent fields:

- absent `kind` → treat as `deterministic` (already `/adev:validate`'s stated default
  rule, `skills/validate/SKILL.md:180`);
- absent `tier` → `fast`; absent `severity` → the tier default;
- `required` and `triggers` are **unobservable** post-merge. A consumer reading the
  merged list must not filter on them, and the `required: false → warning` rule in D1
  applies only where the raw gate entry is available (Step 2h's direct
  `governance/gates.yaml` read, and `/adev:validate`'s own resolution).

This is binding on Task 4 (Step 2-post filters on `tier`, never on `triggers`, and must
not require a literal `kind: deterministic` on a merged entry — doing so would skip every
integration gate and defeat the task) and on Task 2's assertions (compare named fields,
never deep-equality against the raw YAML entry).

---

## File Structure

**Create:**
- `tests/domains/starter-integration-tier.test.mjs` — mergeGates over the shipped
  software starter and both extension overlays yields a live `tier: integration`,
  `severity: error` gate
- `tests/gates/shipped-defaults.test.mjs` — argv-form parity sweep across every shipped
  gate surface + doctor-clean-on-fresh-scaffold fixture

**Modify:**
- `lib/gates/doctor.mjs:706` (plus a new exported `normaliseCommand` helper and the
  `scriptNameOf` flag skip at `:562-573`) — accept argv-list `command`
- `templates/gates-template.yaml` — activate `test` (fast) + `integration-test`
  (integration); argv form in the schema header and every example; document the
  `command: ""` sentinel and the `transitions` decision
- `templates/domains/software/gates.yaml` — add the live integration gate
- `extensions/data-engineering/domain/gates.yaml` — add the live integration gate
- `extensions/process-automation/domain/gates.yaml` — add the live integration gate
- `skills/implement/SKILL.md:590-614` (Step 2-post) — merged gate source, argv guard,
  D1 severity model
- `skills/init/SKILL.md:~211` (Step 7a foundation-files bullet) — seed both tiers in
  argv form
- `docs/governance.md` — one new `gates.yaml` gate-schema section
- `tests/lib/gates/doctor.test.mjs` — argv-command regression tests
- `tests/templates/gates-template.test.mjs` — assertions updated for the live entries
  and argv form (this file already asserts against the template Task 3 changes)
- `tests/skills/implement-integration-gate.test.mjs` — existing Step 2-post coverage,
  extended for the merged source, the argv guard, and the D1 severity model
- `tests/skills/init-governance-scaffolding.test.mjs` — existing Step 7a coverage,
  extended for two-tier argv seeding
- `tests/docs/advanced-guides.test.mjs` — existing `docs/governance.md` coverage
  (`describe` block at line 74), extended for the new gate-schema section

**Reference (read, do not modify):**
- `lib/domains/merge-gates.mjs` — `validateGate` / `mergeGates` semantics (SEC-2)
- `skills/validate/SKILL.md:99-108, 169-209` — the merged-gate-source and per-gate
  severity model Step 2-post must mirror
- `.context-index/governance/gates.yaml` — **out of scope**, see Open Question 1
- `.context-index/specs/features/unified-gates/gate-doctor.spec.md` — behavior 3
  (`empty-command`) narrows to genuinely empty commands

---

## Context Packets

### Task 1 Context
- Spec: `tiered-gates-default.spec.md` (behavior 6; Defect C; error-case table row 5)
- Charter: `unified-gates/charter.md` (capability: Gate Doctor)
- Source files: `lib/gates/doctor.mjs` (full read — `runGateDoctor` line 706,
  `tokenize`, `resolveBinary`, `resolveCommandChain`, `scriptNameOf`)
- Test file: `tests/lib/gates/doctor.test.mjs` (signatures only — mirror its temp-dir
  fixture style; every fixture is a synthetic project, never this repo)
- Sibling spec: `gate-doctor.spec.md` (behavior 3, `empty-command` semantics)
- Helpers: `tests/helpers.mjs` — `createTempDir`, `cleanupTempDir`, `writeFixture`

### Task 2 Context
- Spec: `tiered-gates-default.spec.md` (behaviors 4, 5; "The default this spec chooses")
- Source files: `templates/domains/software/gates.yaml`,
  `extensions/data-engineering/domain/gates.yaml`,
  `extensions/process-automation/domain/gates.yaml` (all full — 6 lines each)
- Reference: `lib/domains/merge-gates.mjs` (`validateGate` required fields, id-merge)
- Plan decision: D2 (gate id reuse)

### Task 3 Context
- Spec: `tiered-gates-default.spec.md` (behaviors 1, 2, 3; "On `transitions: {}`")
- Source files: `templates/gates-template.yaml` (full), `tests/templates/gates-template.test.mjs` (full)
- Reference: `lib/domains/merge-gates.mjs:29-40` (why `""` is the sentinel and `[]` is not)

### Task 4 Context
- Spec: `tiered-gates-default.spec.md` (behaviors 9, 10; Defect D; postconditions)
- Review: `tiered-gates-default.review.md` (SA-1, SA-2, SA-5)
- Charter: `unified-gates/charter.md` (capabilities: Skill Migration, Severity and
  Required Reconciliation)
- Source files: `skills/implement/SKILL.md:552-614` (Step 2h guard + Step 2-post),
  `skills/validate/SKILL.md:96-110, 169-209` (the merged-list contract to mirror)
- Constitution: "No executable logic inside SKILL.md files"; the cli-driver-surface
  anti-patterns (name `adev domain load-gates`, never inline Node)
- Plan decision: D1

### Task 5 Context
- Spec: `tiered-gates-default.spec.md` (behavior 8)
- Source files: `skills/init/SKILL.md` Step 7a foundation-files bullet (~line 211)
- Reference: `templates/gates-template.yaml` as amended by Task 3

### Task 6 Context
- Spec: `tiered-gates-default.spec.md` (Defect B and the CON-1 citation caveat;
  Constitution Reference on templates affecting new scaffolds only)
- Source files: `docs/governance.md:24-38` (the governance-files table),
  `docs/governance.md:281-296` (Quality-gate hardening — the `validate.yaml` runner
  section that owns `QUALITY_GATE_COMMAND_SHELL`), `docs/governance.md:377-403`
  (Recipe 3)
- Constraint: exactly one new section; a sibling agent may be editing this file

### Task 7 Context
- Spec: `tiered-gates-default.spec.md` (behavior 7; Systemic Pattern; acceptance criteria)
- Source files: `lib/gates/doctor.mjs` (`runGateDoctor` signature, `gatesPath` option),
  `lib/domains/merge-gates.mjs`
- Artifacts under test: the shipped `templates/gates-template.yaml`,
  `templates/domains/software/gates.yaml`, and both extension overlays — read from disk,
  never re-authored inline
- Helpers: `tests/helpers.mjs`

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: First-run PASS: Unified Gate System (confidence: medium)
- **Pattern:** First-run PASS for Unified Gate System: implementation matched all acceptance criteria without revision
- **Evidence:** 1 observations

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (message.usage fields).
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** Reduce what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Anti-pattern:** Focus on reducing input token counts.
- **Evidence:** 1 observations

---

## Parallelization

- Group A: Task 1 (`lib/gates/doctor.mjs` + `tests/lib/gates/doctor.test.mjs`)
- Group B: Task 2 (three starter `gates.yaml` files + a new domain test)
- Group C: Task 3 (`templates/gates-template.yaml` + `tests/templates/gates-template.test.mjs`)
- Group D: Task 4 (`skills/implement/SKILL.md`)
- Group E: Task 5 (`skills/init/SKILL.md`)
- Group F: Task 6 (`docs/governance.md`)
- Group G (join): Task 7 — depends on Tasks 1, 2, 3, 5

Groups A through F are file-disjoint and may run concurrently. Group G runs only after
A, B, C, and E have merged.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Doctor accepts argv-list gate commands | small | unit | — | 0 create, 2 modify |
| 2 | Live integration tier in the starters and overlays | small | unit | — | 1 create, 3 modify |
| 3 | Activate and re-form `gates-template.yaml` | medium | unit | — | 0 create, 2 modify |
| 4 | Step 2-post: merged gate source, argv guard, per-gate severity | small | unit | — | 0 create, 2 modify |
| 5 | Init Step 7a seeds both tiers in argv form | small | unit | — | 0 create, 2 modify |
| 6 | `docs/governance.md` gates.yaml schema section | small | unit | — | 0 create, 2 modify |
| 7 | Shipped-defaults parity + doctor-clean fresh scaffold | medium | unit | 1, 2, 3, 5 | 1 create, 0 modify |

All tasks resolve to the `unit` strategy (source: fallback — the spec declares no
`test_strategy` and `manifest.yaml` declares no `test_strategies` entry), so no Strategy
Summary section is emitted. The spec declares no `infra_requirements:` and no task is
assigned a non-unit strategy, so no Test Infrastructure Requirements section is emitted:
every test in this plan is a `node:test` unit test over temp-dir fixtures and shipped
files, with no external system.

`.context-index/manifest.yaml` declares `specialists: []`, so every task is
`[specialist: none]`.

Boundary check: `.context-index/governance/boundaries.yaml` declares `boundaries: []` —
no boundary rules apply to any planned path. Constitution check: no task adds a
dependency, creates a service, changes the hook protocol, changes the plugin
registration format, or adds a skill to the lifecycle order. No task requires human
approval. No version bump is planned (release-please owns versions).

---

## Tasks

### Task 1: Doctor accepts argv-list gate commands [specialist: none]

**Charter capability:** Gate Doctor (and the "argv-form gates are diagnosable" clause of
Tiered Gates by Default)
**Strategy:** unit (source: fallback, confidence: high)
**Spec behaviors:** 6
**Files:**
- Modify: `lib/gates/doctor.mjs` — new exported `normaliseCommand`; call site at `:706`;
  `scriptNameOf` at `:562-573`
- Test: `tests/lib/gates/doctor.test.mjs`

**Tests:** `tests/lib/gates/doctor.test.mjs`

**Context to load:** see Task 1 Context above.

**Why this is first.** `lib/gates/doctor.mjs:706` reads
`typeof gate?.command === "string" ? gate.command : ""`, so every correctly-authored
argv gate is reported as `gate-doctor/empty-command` and skipped by the placeholder,
binary-resolution, path, glob, runner, and CI checks. Until this changes, Tasks 2, 3, and
5 would ship defaults the doctor cannot see, and behavior 7 ("reports cleanly") would be
nominally true and actually false.

- [ ] **Write failing test**

Add to `tests/lib/gates/doctor.test.mjs`, in its existing synthetic-temp-dir style:

1. A gate with `command: ["npm", "test"]` produces **no** `gate-doctor/empty-command`
   finding, and `runners` reports a detected runner for it (the `npm test` →
   `package.json scripts.test` chain resolves as it does for the string form).
2. The same argv gate is subject to the command-level checks: a gate with
   `command: ["definitely-not-a-real-binary-xyz"]` yields `gate-doctor/binary-not-found`
   (error), proving the checks now run rather than being skipped.
3. `command: []`, `command: {}`, `command: 42`, and a missing `command` still yield
   `gate-doctor/empty-command` (warning). An empty argv list normalises to `""`, which
   is the correct diagnosis — a gate with nothing to run.
4. Round-trip safety: a gate with `command: ["sh", "-c", "exit 3"]` normalises such that
   `tokenize()` recovers three tokens, not four — a token containing whitespace must be
   quoted by the join.
5. Operator safety: a gate with `command: ["echo", "&&"]` must not be split into two
   sub-commands by `splitOnOperators` — argv gates carry no shell operators by
   construction, and the join must not manufacture one.
6. `scriptNameOf` regression: `["npm", "run", "--if-present", "test:integration"]`
   resolves the script name `test:integration`, not `--if-present`.

- [ ] **Verify test fails**

Run: `node --test tests/lib/gates/doctor.test.mjs`
Expected: FAIL — argv gates report `gate-doctor/empty-command`; `normaliseCommand` is
not exported.

- [ ] **Implement**

Add an exported helper and use it at the single call site:

```javascript
export function normaliseCommand(command) { /* string → as-is; string[] → quoted join; else "" */ }
```

Rules, in order:
- `typeof command === "string"` → return it unchanged (existing behavior preserved for
  every string-form gate, including this repo's own `governance/gates.yaml`).
- `Array.isArray(command)` → join the tokens with a single space, wrapping any token
  that contains whitespace, a quote, or a shell metacharacter (`&|;<>()$\``*?[]!#~=%`)
  in single quotes. Caveat for the implementer: `tokenize` (`:145`) has no
  backslash-escape handling *inside* quotes, so a token containing a single quote cannot
  be made to round-trip through it. No shipped default contains one; prefer double
  quotes for such a token and note the limitation in a comment rather than reworking
  `tokenize`. An empty array joins to `""`
  and is therefore diagnosed as an empty command. A non-string element makes the whole
  command `""` rather than producing a coerced token.
- anything else → `""`.

Then replace `lib/gates/doctor.mjs:706` with `const command = normaliseCommand(gate?.command);`.

Also fix `scriptNameOf` (`:562-573`) to skip leading flag tokens after `run` /
`run-script` before taking the script name. This is two lines, lives in the same file,
and is directly caused by the `npm run --if-present <script>` idiom Task 2 ships:
without it the chain resolver looks up `pkg.scripts["--if-present"]`, which also feeds
`ciMatchCandidates` and can produce a spurious `gate-doctor/ci-gate-not-invoked`
warning on projects that do have CI. Keep the fix to the flag skip; do not restructure
the function.

Note for the implementer: no operator or command-chain logic needs special-casing.
Argv gates cannot contain shell operators by construction, so the quoted join is not
lossy and `splitOnOperators` sees exactly one segment.

- [ ] **Verify test passes**

Run: `node --test tests/lib/gates/doctor.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/unified-gates/tiered-gates-default`

```bash
git add lib/gates/doctor.mjs tests/lib/gates/doctor.test.mjs
git commit -m "feat(gates): diagnose argv-list gate commands in gate doctor

Spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
Plan-task: 1"
```

---

### Task 2: Live integration tier in the starters and overlays [specialist: none]

**Charter capability:** Tiered Gates by Default
**Strategy:** unit (source: fallback, confidence: high)
**Spec behaviors:** 4, 5
**Files:**
- Modify: `templates/domains/software/gates.yaml`
- Modify: `extensions/data-engineering/domain/gates.yaml`
- Modify: `extensions/process-automation/domain/gates.yaml`
- Create: `tests/domains/starter-integration-tier.test.mjs`

**Tests:** `tests/domains/starter-integration-tier.test.mjs`

**Context to load:** see Task 2 Context above. Plan decision **D2** governs the gate id.

- [ ] **Write failing test**

Create `tests/domains/starter-integration-tier.test.mjs`. It reads each **shipped**
starter file from disk (never an inline fixture) and runs it through `mergeGates`:

1. For each of the three surfaces, `mergeGates({ gates: <parsed file> }, null)` returns
   zero warnings and at least one gate with `tier: "integration"`.
2. That gate has `severity: "error"` and
   `command: ["npm", "run", "--if-present", "test:integration"]`.
3. The pre-existing fast-tier gate (`quality-gate` / `data-quality` / `flow-coverage`)
   is still present — this is an addition, not a replacement. Assert **named fields**
   (`id`, `command`, `severity`, `tier`, `description`), not deep-equality against the
   raw YAML entry: per **D3**, `mergeGates` narrows every entry and injects `__source`,
   so a deep-equal assertion fails for reasons unrelated to this change.
4. Every `command` in every one of the three files is an array of strings.
5. Composition check (D2): merging a governance overlay carrying
   `{ id: "integration-test", command: "" }` on top of the software starter yields the
   starter's live integration gate **plus** an `INVALID_GATE` warning naming
   `integration-test` — the unwired sentinel never clobbers the working gate.

- [ ] **Verify test fails**

Run: `node --test tests/domains/starter-integration-tier.test.mjs`
Expected: FAIL — no integration-tier gate exists in any starter surface.

- [ ] **Implement**

Append the same entry to all three files, preserving each file's existing key order and
description voice:

```yaml
  - id: integration-test
    description: "Run integration tests (no-op until a test:integration script exists)"
    command: ["npm", "run", "--if-present", "test:integration"]
    severity: error
    tier: integration
```

`npm run --if-present <script>` exits 0 when the script is undefined, so the gate is
active rather than advisory: it costs nothing on a fresh scaffold, never fails closed,
and becomes a real enforced integration gate the moment someone adds the script. Do not
substitute a `{{ }}` placeholder — `gate-doctor/unsubstituted-placeholder` is
error-severity and would fail behavior 7 by construction. Do not vary the id per domain
(see D2).

- [ ] **Verify test passes**

Run: `node --test tests/domains/starter-integration-tier.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/domains/software/gates.yaml extensions/data-engineering/domain/gates.yaml extensions/process-automation/domain/gates.yaml tests/domains/starter-integration-tier.test.mjs
git commit -m "feat(gates): ship a live integration tier in every domain starter

Spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
Plan-task: 2"
```

---

### Task 3: Activate and re-form `gates-template.yaml` [specialist: none]

**Charter capability:** Tiered Gates by Default
**Strategy:** unit (source: fallback, confidence: high)
**Spec behaviors:** 1, 2, 3
**Files:**
- Modify: `templates/gates-template.yaml`
- Modify: `tests/templates/gates-template.test.mjs`

**Tests:** `tests/templates/gates-template.test.mjs`

**Context to load:** see Task 3 Context above.

`tests/templates/gates-template.test.mjs` **already** asserts against this file and its
current assertions are satisfied by comments alone (`content.includes(field)`). It must
be strengthened in the same task, not left behind — a template test that passes on a
fully commented-out file is precisely the "no test exercises the artifact a user
actually receives" failure the spec's Systemic Pattern section records.

- [ ] **Write failing test**

Rewrite `tests/templates/gates-template.test.mjs` to parse the template with
`parseYaml` from `lib/profiles/yaml.mjs` instead of substring-matching the raw text:

1. `doc.gates` is an array with a live `test` entry (`tier: fast`) and a live
   `integration-test` entry (`tier: integration`).
2. Each live entry carries all nine documented fields: `id`, `name`, `kind`, `tier`,
   `command`, `scope`, `required`, `severity`, `triggers`.
3. `integration-test.triggers` includes `post-implement`.
4. Both live entries have `command: ""` — the unwired sentinel. Assert the exact empty
   string, not merely falsy: `command: []` must fail this test (an empty array is truthy,
   passes both `validateGate` guards, and would reach an executor carrying an empty argv
   list).
5. `mergeGates(null, doc)` drops both live entries and emits an `INVALID_GATE` warning
   naming each — the behavior-3 contract, asserted against the shipped template.
6. `doc.transitions` is an empty object (live, unpopulated).
7. Argv-form sweep over the raw text: no line matching `command:` (live or commented)
   uses a **non-empty** quoted-string value. Every example is argv form. The `""`
   unwired sentinel is the one permitted quoted value and must be explicitly exempted
   by the matcher — the sweep targets string-form *commands* (`command: "npm test"`),
   not the sentinel that assertion 4 requires.
8. Retain the existing coverage: all three tier values and both severity values appear;
   the `group` field is documented; `transitions` and `required_gates` are present.

- [ ] **Verify test fails**

Run: `node --test tests/templates/gates-template.test.mjs`
Expected: FAIL — `doc.gates` is `null`/empty (every entry is commented out) and the
`command:` examples are string form.

- [ ] **Implement**

Edit `templates/gates-template.yaml`:

1. **Schema header** (`:10`): change the `command:` description from "Shell command to
   execute (deterministic gates only)" to an argv-list description with a live example —
   `command: [npm, test]` — and state that a string value is rejected at load with
   `INVALID_GATE`. Cite that `lib/domains/merge-gates.mjs` enforces this (SEC-2).
2. **Uncomment** the `test` entry (`:24-34`) and the `integration-test` entry (`:58-67`)
   as live YAML, unchanged in field set and ordering. `test` keeps
   `triggers: [post-task, post-implement]`; `integration-test` keeps
   `triggers: [post-implement]`.
3. Both live entries carry `command: ""` with an inline comment naming it the **unwired
   sentinel**: `/adev:init` Step 7a seeds it; until then `mergeGates` drops the gate with
   `INVALID_GATE: Gate '<id>' missing required command field — skipped`, so the tier is
   *declared* in every scaffold and an unseeded init produces a named, actionable warning
   rather than silence.
4. Add a short comment block explaining why the sentinel is `""` and **not** `[]`: an
   empty array is truthy, passes both of `validateGate`'s guards, and is returned as a
   valid gate carrying an empty argv list — a gate that reaches the executor with nothing
   to run.
5. Convert **every** remaining commented example (`lint`, `typecheck`, `e2e-smoke`,
   `e2e-full`) to argv form: `command: ""  # e.g., [npm, run, lint]`,
   `[ruff, check, .]`, `[npx, tsc, --noEmit]`, `[mypy, .]`,
   `[npm, run, test:e2e:smoke]`, `[npm, run, test:e2e]`. No string-form example survives
   anywhere in the file.
6. Leave `transitions: {}` live and empty, and add a comment recording **why**: the
   charter invariant requires every id in `transitions.*.required_gates` to exist in
   `gates`, and `/adev:hygiene` Pass 8 enforces it — binding `implement-to-validate` to a
   gate whose command is still the unwired sentinel would make a fresh scaffold fail
   closed. Issue-554's "uncomment `transitions: {}`" is already satisfied; no edit is
   made for it.
7. Do **not** add any `{{ }}` placeholder to a `command` value.

Leave the `ai-review` probabilistic example commented and command-free (charter
invariant: probabilistic gates carry no `command`).

- [ ] **Verify test passes**

Run: `node --test tests/templates/gates-template.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/gates-template.yaml tests/templates/gates-template.test.mjs
git commit -m "feat(gates): ship live fast and integration tiers in gates-template

Spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
Plan-task: 3"
```

---

### Task 4: Step 2-post — merged gate source, argv guard, per-gate severity [specialist: none]

**Charter capability:** Skill Migration; Severity and Required Reconciliation
**Strategy:** unit (source: fallback, confidence: high)
**Spec behaviors:** 9, 10 (review blockers SA-1, SA-2; review warning SA-5 via **D1**)
**Files:**
- Modify: `skills/implement/SKILL.md:590-614` (Step 2-post)
- Test: `tests/skills/implement-integration-gate.test.mjs`

**Tests:** `tests/skills/implement-integration-gate.test.mjs` — this file already exists
and already covers Step 2-post. **Extend it; do not create a new test file.**

**Context to load:** see Task 4 Context above. Plan decision **D1** is binding.

Step 2-post currently reads `governance/gates.yaml` directly, so it cannot see
`templates/domains/software/gates.yaml` or either extension overlay — the exact surfaces
Task 2 makes carry a live integration gate. It also lacks the non-empty/argv guard that
Step 2h applies to per-task gates (`skills/implement/SKILL.md:556`), so a live
`command: ""` sentinel would reach an unguarded executor. Both are required for the
spec's postcondition to hold.

- [ ] **Write failing test**

Assert against the shipped `skills/implement/SKILL.md` text (this is markdown prose, so
the test is a contract test over the file):

1. The Step 2-post section names `adev domain load-gates` and does **not** instruct a
   direct read of `governance/gates.yaml` as the gate source.
2. The tier-uniform severity sentence is **absent**: the file no longer contains
   "Individual commands do not have their own severity."
3. The section states that a gate's own `severity` takes precedence over the tier
   default, and that `required: false` forces `warning`.
4. The section states that a gate whose `command` is empty, absent, or not an argv list
   is recorded as **skipped** with a named reason and executes nothing.
5. Constitution guard: the Step 2-post section contains no inline-Node directive
   (`node -e`, `node --input-type=module -e`, `Run inline Node`).

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-integration-gate.test.mjs`
Expected: FAIL — the section still reads `governance/gates.yaml` and still declares
tier-uniform severity.

- [ ] **Implement**

Rewrite `skills/implement/SKILL.md:592-599` (prose only; no executable logic — the
constitution forbids it, and the cli-driver-surface charter requires naming the CLI verb):

1. Replace steps 1-2 with: resolve integration gates from the **merged** gate list via
   `adev domain load-gates --module <module-slug> [--charter <charter-path>]`, the same
   source `/adev:validate` Check 1 uses via `mergedGates` (`skills/validate/SKILL.md:99`),
   then filter `tier: integration`. If the merged list yields no integration-tier gates,
   skip this step silently (existing behavior preserved — Step 3 follows Step 2
   directly). Surface any loader `warnings` (e.g. `INVALID_GATE`, `GATE_OVERRIDE`) in the
   step output rather than swallowing them.
2. Keep step 3 (`--task <N>` single-task re-run skips this step) and step 4 (E2E
   exclusion) unchanged.
3. Add the **argv guard**, mirroring Step 2h: execute only gates that are deterministic
   and carry a non-empty argv-list `command`. **Apply D3's defaults** — the merged list
   drops `kind`, so a gate with no `kind` is `deterministic` (matching
   `skills/validate/SKILL.md:180`); requiring a literal `kind: deterministic` on a merged
   entry would skip every integration gate and defeat this task. Any gate whose `command`
   is empty, absent, or not an argv list is recorded as **skipped** with a named reason
   (e.g. `skipped: command is the unwired sentinel — run /adev:init or set the command
   in governance/gates.yaml`) and nothing is spawned. Gate commands execute without
   shell interpolation, consistent with the argv-only contract.
4. **Replace** the sentence at `:599` — "All commands within the integration tier share
   the tier's severity (default: `error`). Individual commands do not have their own
   severity." — with the D1 model, stated explicitly:

   > **Execute gates sequentially.** Each gate's severity is its own `severity` field
   > when present; a gate that omits `severity` inherits the tier default (`error` for
   > the integration tier). A gate with `required: false` is always `warning`, whatever
   > its explicit severity says. This matches `/adev:validate` Check 1, so both
   > integration-gate consumers agree on both the source and the severity of every gate.

   The old sentence must not survive in any form. Per **D3**, `required` is unobservable
   on a merged entry, so the `required: false → warning` clause is stated as the
   governing rule wherever the raw gate is visible (Step 2h, `/adev:validate`); Step
   2-post applies per-gate `severity` with the tier default as fallback.
5. Leave the error/warning outcome blocks (`:601-614`) as they are, but make them read
   per-gate rather than per-tier-uniform, and have the "Integration Gates" completion
   report section include skipped gates with their reason alongside pass/fail/warn.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-integration-gate.test.mjs && npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-integration-gate.test.mjs
git commit -m "feat(implement): source integration gates from the merged gate list

Spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
Plan-task: 4"
```

---

### Task 5: Init Step 7a seeds both tiers in argv form [specialist: none]

**Charter capability:** Tiered Gates by Default
**Strategy:** unit (source: fallback, confidence: high)
**Spec behaviors:** 8
**Files:**
- Modify: `skills/init/SKILL.md` Step 7a foundation-files bullet (~line 211)
- Test: `tests/skills/init-governance-scaffolding.test.mjs`

**Tests:** `tests/skills/init-governance-scaffolding.test.mjs` — this file already exists
and already covers Step 7a. **Extend it; do not create a new test file.**

**Context to load:** see Task 5 Context above.

**Scope fence.** This task edits **one bullet** in Step 7a. Everything else in
`skills/init/SKILL.md` — the test-policy defaults, the
`UNSUBSTITUTED_POLICY_PLACEHOLDER` guard, sub-steps 7b-7e — is out of scope and must not
be touched.

- [ ] **Write failing test**

Extend `tests/skills/init-governance-scaffolding.test.mjs` with assertions over the
shipped `skills/init/SKILL.md`:

1. The Step 7a `gates.yaml` bullet names **both** the fast tier and the integration tier
   as seeded targets, not just "gate commands".
2. It states that seeded commands are argv lists, and shows argv-form examples.
3. It names the `--if-present` no-op idiom for the integration tier when the detected
   stack has no integration entrypoint yet.
4. It states that an unseeded gate keeps `command: ""` and is dropped at load with a
   named `INVALID_GATE` warning — the scaffold is still valid, and the warning is the
   actionable signal.
5. No inline-Node directive is introduced (constitution / `hooks/pre-commit-no-inline-node.sh`).

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-governance-scaffolding.test.mjs`
Expected: FAIL — the bullet says only "seeding gate commands from the quality-gate values
collected in Step 2".

- [ ] **Implement**

Replace the single `gates.yaml` bullet in Step 7a with prose (no executable logic) that
says: generate `gates.yaml` from `templates/gates-template.yaml` and seed **both** live
tiers from the Step 2 constitution-wizard answers —

- the fast-tier `test` gate from the wizard's test command, in argv form
  (`command: [npm, test]`, `command: [pytest]`, …);
- the integration-tier `integration-test` gate in argv form. When the detected stack has
  a real integration entrypoint, seed it. When it does not, seed the no-op-if-absent
  idiom the domain starters use — `command: [npm, run, --if-present, test:integration]`
  on npm stacks — so the tier is live and costs nothing until the script exists.

State explicitly that commands are **argv lists, never shell strings**: a string is
rejected at load by `lib/domains/merge-gates.mjs` with `INVALID_GATE` (SEC-2). State that
a tier the wizard cannot seed keeps `command: ""`, which is dropped at load with a named
`INVALID_GATE` warning — a declared-but-unwired tier, not a broken scaffold. Do not emit
a `{{ }}` placeholder into a `command` value (`gate-doctor/unsubstituted-placeholder` is
error-severity).

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-governance-scaffolding.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/skills/init-governance-scaffolding.test.mjs
git commit -m "feat(init): seed both gate tiers in argv form at Step 7a

Spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
Plan-task: 5"
```

---

### Task 6: `docs/governance.md` gates.yaml schema section [specialist: none]

**Charter capability:** Unified Gate Schema (documentation surface)
**Strategy:** unit (source: fallback, confidence: high)
**Spec behaviors:** supports 1-5, 8 (the CON-1 citation caveat)
**Files:**
- Modify: `docs/governance.md` — **exactly one new section**
- Test: `tests/docs/advanced-guides.test.mjs`

**Tests:** `tests/docs/advanced-guides.test.mjs` — its
`describe('docs/governance.md — Governance Guide')` block (line 74) already asserts over
this file. **Extend that block; do not create a new test file.**

**Context to load:** see Task 6 Context above.

**Scope fence.** A sibling agent may be editing `docs/governance.md`. Add **one**
section; change nothing else in the file. Keep the edit anchored so it does not conflict:
insert it immediately after the "The governance files" table (`:24-38`) and before
"Test depth policy in `risk-policies.yaml`" (`:39`).

**The citation caveat (CON-1) is load-bearing.** The document's existing argv-only
sentence lives in the *`validate.yaml` quality-gate runner* section and names **that
runner's** error code, `QUALITY_GATE_COMMAND_SHELL`. The `gates.yaml` loader
(`lib/domains/merge-gates.mjs`) enforces the same rule and reports **`INVALID_GATE`**.
The new section must distinguish the two rather than cross-referencing the existing one
as if it covered `gates.yaml`.

- [ ] **Write failing test**

Assert over the shipped `docs/governance.md`:

1. A `gates.yaml` gate-schema section exists (an `## `/`### ` heading naming the gate
   schema for `gates.yaml`).
2. It documents argv-only `command` and names `INVALID_GATE` as the `gates.yaml` loader's
   error code, distinctly from `QUALITY_GATE_COMMAND_SHELL`.
3. It documents the three tiers and their severity defaults.
4. It documents the shipped default — the live `test` / `integration-test` entries, the
   `command: ""` unwired sentinel, and the starters' `npm run --if-present
   test:integration` gate.
5. It documents the graduation path and that templates affect **new scaffolds only**
   (existing projects rerun `/adev:init` or edit by hand).

- [ ] **Verify test fails**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: FAIL — the document carries no gate schema section for `gates.yaml` at all.

- [ ] **Implement**

Add one section covering, concisely:

- **Gate schema** — the nine fields (`id`, `name`, `kind`, `tier`, `command`, `scope`,
  `required`, `severity`, `triggers`) plus e2e-only `group`, with a live argv example.
- **`command` is argv-only.** `command: [npm, test]`. A string is dropped at load by
  `lib/domains/merge-gates.mjs` with `INVALID_GATE: Gate '<id>' command must be an argv
  list (array), not a string — skipped.` Note explicitly that this is a *different* error
  code from the `validate.yaml` quality-gate runner's `QUALITY_GATE_COMMAND_SHELL`
  (documented under "Quality-gate hardening"): same rule, two loaders, two codes.
  Cross-link Recipe 3 for the conversion.
- **Tiers** — `fast → integration → e2e`, fail-fast between error-severity tiers;
  severity defaults `error` for fast/integration, `warning` for e2e; `required: false`
  forces `warning`; an explicit per-gate `severity` overrides the tier default (this is
  the model both `/adev:validate` Check 1 and `/adev:implement` Step 2-post use — see D1).
- **The shipped default** — a new scaffold gets live `test` (fast) and `integration-test`
  (integration) entries whose `command: ""` is an unwired sentinel dropped at load with a
  named `INVALID_GATE` warning, plus a **live** error-severity integration gate from the
  domain starter (`[npm, run, --if-present, test:integration]`), which is a verified
  no-op until the project defines a `test:integration` script.
- **Graduating it** — add a `test:integration` script and the gate starts enforcing, with
  no configuration change. To wire the template's own entries, rerun `/adev:init` or set
  the commands by hand. Templates are consumed verbatim by `cpSync()`, so these defaults
  reach **new** scaffolds only; existing projects are untouched.
- **Verifying it** — `adev gate doctor`. On a fresh scaffold, expect exit 0 with zero
  error-severity findings; `gate-doctor/ci-config-missing` and
  `gate-doctor/runner-unknown` warnings are normal for a new project and are not
  regressions.

- [ ] **Verify test passes**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add docs/governance.md tests/docs/advanced-guides.test.mjs
git commit -m "docs(governance): document the gates.yaml gate schema and shipped default

Spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
Plan-task: 6"
```

---

### Task 7: Shipped-defaults parity + doctor-clean fresh scaffold [specialist: none]

**Depends on:** Task 1, Task 2, Task 3, Task 5
**Charter capability:** Tiered Gates by Default; Gate Doctor
**Strategy:** unit (source: fallback, confidence: high)
**Spec behaviors:** 7 (plus end-to-end coverage of 1-5)
**Files:**
- Create: `tests/gates/shipped-defaults.test.mjs`

**Tests:** `tests/gates/shipped-defaults.test.mjs`

**Context to load:** see Task 7 Context above.

**Why this task exists separately.** The spec's Systemic Pattern section names the
failure this closes: *no test exercises the artifact a user actually receives.* Tasks 1-6
each test their own file. This task tests the **composition** — the exact bytes a
scaffolded project gets — and it must read every artifact from disk. Any hand-written
inline gate fixture in this file defeats its purpose and should be rejected in review.

- [ ] **Write failing test**

Create `tests/gates/shipped-defaults.test.mjs`:

1. **Argv parity sweep.** For each shipped gate surface —
   `templates/gates-template.yaml`, `templates/domains/software/gates.yaml`,
   `extensions/data-engineering/domain/gates.yaml`,
   `extensions/process-automation/domain/gates.yaml` — every `command` value in the file
   (live YAML *and* commented examples, matched over the raw text) is argv form. No
   **non-empty** quoted-string command survives on any surface; the template's `""`
   unwired sentinel is the one permitted quoted value and must be exempted by the
   matcher (same exemption as Task 3's sweep).
2. **No starter surface ships a fast-only tier map.** Each of the three starters, parsed
   and merged, yields at least one `tier: integration` gate. (Behavior 5's "no
   fast-only starter" postcondition, asserted across all three at once.)
3. **Doctor-clean on a fresh scaffold.** Build a temp-dir project that mirrors what
   `/adev:init` produces: copy the **shipped** `templates/gates-template.yaml` to
   `<tmp>/.context-index/governance/gates.yaml`, seed both live entries' commands in argv
   form exactly as Task 5's Step 7a prose specifies (`[npm, test]` and
   `[npm, run, --if-present, test:integration]`), and add a minimal `package.json`.
   `runGateDoctor` is `async` (`lib/gates/doctor.mjs:649`) — **await** it. Note it reads
   `<projectRoot>/.context-index/governance/gates.yaml` directly and performs no domain
   merge, so this fixture exercises the template surface only. Assert:
   - `summary.errors === 0` — the acceptance bar is **exit 0 / zero error-severity
     findings**, not zero findings;
   - **no** `gate-doctor/empty-command` finding for either seeded argv gate (this is the
     regression that proves Task 1 landed and that the seeded form is diagnosable);
   - `gate-doctor/ci-config-missing` and `gate-doctor/runner-unknown` warnings are
     tolerated by name — a fresh scaffold has no CI config and its
     `npm run --if-present test:integration` gate exposes no identifiable runner. Assert
     the tolerated set explicitly so an unexpected warning still fails the test.
4. **Unseeded scaffold is safe.** Copy the shipped template **without** seeding, run
   `mergeGates(<software starter>, <template>)`, and assert: both sentinel entries are
   dropped with named `INVALID_GATE` warnings, the starter's live integration gate
   survives (D2), and no gate in the merged result carries an empty argv list.

- [ ] **Verify test fails**

Run: `node --test tests/gates/shipped-defaults.test.mjs`
Expected: FAIL before Tasks 1-3 land (string-form commands on every surface; argv gates
reported as `empty-command`). If Tasks 1-3 are already merged when this runs, verify the
RED state by temporarily reverting one assertion's precondition rather than skipping the
RED step.

- [ ] **Implement**

No production code changes are expected here. If a genuine defect surfaces (for example,
a seeded argv gate still producing an error-severity finding), fix it in the owning
file — `lib/gates/doctor.mjs` for a doctor defect, the starter YAML for a starter defect
— and note the fix in the commit body. Do not weaken an assertion to make it pass.

- [ ] **Verify test passes**

Run: `node --test tests/gates/shipped-defaults.test.mjs && npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/gates/shipped-defaults.test.mjs
git commit -m "test(gates): assert the shipped gate defaults a scaffold actually receives

Spec: .context-index/specs/features/unified-gates/tiered-gates-default.spec.md
Plan-task: 7"
```

---

## Acceptance Criteria Coverage

| Spec acceptance criterion | Covered by |
|---|---|
| Template has live `test` (fast) + `integration-test` (integration); triggers `post-implement` | Task 3 |
| Every `command:` in the template, software starter, and both overlays is argv form | Tasks 2, 3; swept by Task 7 |
| `mergeGates` on the software starter yields ≥ 1 `tier: integration` gate with `severity: error` | Task 2 |
| Both extension overlays yield an integration-tier gate | Task 2; swept by Task 7 |
| `gate doctor` runs all command-level checks on argv gates (no `empty-command`) | Task 1; re-asserted by Task 7 |
| `gate doctor` on a fresh scaffold exits 0 with zero error-severity findings | Task 7 |
| `/adev:init` Step 7a documents seeding both tiers in argv form | Task 5 |
| Step 2-post sources integration gates from the merged list | Task 4 |
| Step 2-post skips empty/non-argv `command` with a named reason | Task 4 |
| `docs/governance.md` documents the shipped default and graduation path, one section | Task 6 |
| This repo's own `.context-index/governance/gates.yaml` is **not** modified | No task touches it — enforced by the scope fence below |
| All quality gates pass (`npm test`) | Quality Gates section |
| No constitutional violations introduced | Constitution check in Task Summary; Tasks 4 and 5 carry explicit inline-Node guards |

## Out of Scope (do not plan or implement)

These are the spec's Open Questions for a Human and the review's restated scoping
warnings. No task covers them, and none should be added:

- **This repo's own `.context-index/governance/gates.yaml`.** Its `test` gate is string
  form and is dropped by `mergeGates` today. Converting it would activate a second
  `npm test` on top of the starter's `quality-gate` — the exact per-task full-suite cost
  issue-554 complains about. Deduplicating them is a judgment call about this repo's
  workflow, not a framework change. Leave the file untouched.
- **Per-stack (non-npm) domain starters.** `templates/domains/software/` hardcodes npm
  today and this spec follows that precedent. Stack detection at init time is real
  follow-up work, not this plan's.
- **Review warnings SA-3, SA-4, CON-2.** Restated scoping/follow-up notes already covered
  by the spec's Open Questions section. No plan tasks.
- **Version bumps.** `package.json` / `.claude-plugin/plugin.json` versions are owned by
  release-please.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite.
Results are recorded in the validation report (`.validate.md`), not in this plan.

`.context-index/governance/gates.yaml` exists, so its gate definitions govern (per the
Quality Gates contract), merged with the domain starter:

| Gate | Tier | Command | Notes |
|---|---|---|---|
| `test` (governance) | fast | `npm test` | **String form — dropped at load** by `mergeGates` with `INVALID_GATE`. Deliberately left as-is (see Out of Scope). |
| `quality-gate` (domain starter) | fast | `["npm", "test"]` | The gate that actually executes. |
| `lint`, `typecheck` | fast | — | Commented out in this repo's `gates.yaml`; not configured, not run. |

Effective deterministic gate for this plan: **`npm test`**.

Additional verification specific to this plan:

- `adev gate doctor` reports no new error-severity findings for this repo (its gates are
  string form and are unaffected by Task 1's argv path).
- `.githooks/pre-commit-no-inline-node` passes for the two SKILL.md edits (Tasks 4, 5):
  no `Run inline Node.js:` heading, no `node -e` / `node --input-type=module -e` fenced
  block, and no H3 section containing both an inline-Node form and an `adev <verb>`
  invocation.
- All acceptance criteria from the spec satisfied (see the coverage table above).

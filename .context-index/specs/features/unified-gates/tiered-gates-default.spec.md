---
charter: unified-gates
status: review-pending
kind: behavioral
risk_level: medium
milestone:
revision: 2
charter-revision: 4
created: 2026-08-13
updated: 2026-08-13
charter-extension: true
affects:
  - setup
  - validation
  - implementation
---

# Live Spec: Tiered Gates by Default — Active Integration Tier in the Gates Template

<!-- Live Spec within the unified-gates charter.
     Parent Charter: .context-index/specs/features/unified-gates/charter.md
     Traces to issue-554, from the 2026-08-10 three-repo audit. -->

## Behavioral Contract

The tier engine is fully shipped. `templates/gates-template.yaml` documents
`tier: fast | integration | e2e`, `/adev:validate` Check 1 implements per-tier
fail-fast (sub-checks 1a/1b/1c), `/adev:implement` Step 2-post filters
`tier: integration`, and `adev gate doctor` (revision 3 of this charter)
verifies that declared gates can execute. Yet every audited project runs
exactly one fast-tier gate and nothing else. This spec makes the shipped
engine reachable by default.

### Root Cause (established empirically, not assumed)

Two independent defects compound. Both were reproduced against this repo
before this spec was written.

**Defect A — every gate entry in the template is commented out.** Only the
schema documentation is active. A project scaffolded by `/adev:init` receives
a `gates.yaml` whose `gates:` key has no live entries, so the only gate that
ever executes is the one in the domain starter
(`templates/domains/software/gates.yaml`), which is a single fast-tier
`npm test`. The integration-tier example — the one entry wired to
`post-implement` — is commented out along with the rest.

**Defect B — the template teaches a command form the loader rejects.** The
template's schema header documents `command:` as a shell string and every
commented example uses string form (`command: ""  # e.g., "npm test"`).
`lib/domains/merge-gates.mjs::validateGate` enforces argv-list form (SEC-2,
a reviewed security decision that prevents shell interpretation) and *drops*
any gate whose `command` is a string:

```
Gate 'test' command must be an argv list (array), not a string — skipped.
```

Reproduced on this repo: `adev domain load-gates --module unified-gates`
returns exactly one gate (`quality-gate`, from the domain starter) plus an
`INVALID_GATE` warning for the repo's own governance `test` gate. So even a
project that *does* uncomment a template gate and fill in a command gets it
silently discarded before `/adev:validate` Check 1 ever sees it.

Argv-only is already the house rule, but the citation needs care (CON-1 from
review). `docs/governance.md` states "**argv form only.** `command: "npm test"`
(string) fails load with `QUALITY_GATE_COMMAND_SHELL`" — that sentence sits in
the *`validate.yaml` quality-gate runner* section and names that runner's error
code. The `gates.yaml` loader (`lib/domains/merge-gates.mjs`) enforces the same
rule but reports `INVALID_GATE`. `docs/governance.md` Recipe 3 ("you had a
shell-form gate command") already instructs operators to convert
`command: "npm test"` to `command: [npm, test]`, so the intent is unambiguous —
but the document carries **no gate schema section for `gates.yaml` at all**.
Fixing the template is therefore an **alignment to a rule the codebase already
enforces**, not a schema change; and the docs task below must add the missing
`gates.yaml` schema section rather than merely cross-referencing the
`validate.yaml` one.

The change does not contradict `gate-doctor.spec.md`, which describes `command`
behaviorally without pinning its YAML type (verified in review).

**Defect D — `/adev:implement` Step 2-post reads raw `gates.yaml`, not the
merged list.** Raised as SA-1/SA-2 in review and verified against
`skills/implement/SKILL.md`. Step 2-post reads `governance/gates.yaml`
directly and filters `tier: integration`; it never calls
`adev domain load-gates`, so it cannot see `templates/domains/software/gates.yaml`
or either extension overlay — the exact surfaces this spec makes carry a live
integration gate. `/adev:validate` Check 1 already sources from the merged list
(`mergedGates`, Step 0). Step 2-post also lacks the non-empty/argv-form guard
that Step 2h (per-task gates) applies, so making the template's
`integration-test` entry live would hand an unwired gate to an unguarded
executor at post-implement. Both are in scope: without them the postcondition
"the integration tier executes at post-implement" is unreachable through the
mechanism this spec chooses.

**Defect C — `adev gate doctor` cannot see argv-form gates.**
`lib/gates/doctor.mjs` coerces a non-string `command` to `""`
(`typeof gate?.command === "string" ? gate.command : ""`), so every
correctly-authored argv gate is reported as `gate-doctor/empty-command` and
skipped by the binary-resolution, path, glob, runner, and CI checks. This is
a hard dependency of the fix: without it, "the new default is verifiable by
`gate doctor`" would be nominally true and actually false.

### The default this spec chooses, and why

The hard question is what a *sensible* default is. A pre-wired integration
gate that names a command a fresh project does not have would fail closed on
every new scaffold — strictly worse than the status quo. Three candidates were
considered:

1. **Active gate with a concrete command** (e.g. `npm run test:integration`).
   Rejected for the generic template: it fails closed on any project that has
   not yet written that script.
2. **Active gate emitted by a new stack-detecting CLI verb.** Rejected as
   scope inflation: `/adev:init` Step 7a already seeds gate commands from the
   constitution wizard. The seeding mechanism exists; the entries it should
   seed into did not.
3. **Active-but-unwired in the generic template; active-and-real in the
   stack-committed domain starters.** Chosen.

**The rule this spec adopts: activity belongs where the stack is known.**

- `templates/gates-template.yaml` is stack-agnostic — it is filled in by
  `/adev:init` from the wizard answers. Its `test` (fast) and
  `integration-test` (integration) entries become **live YAML** with
  `command: ""` as an explicit unwired sentinel. The tier is then *declared*
  in every scaffold, so the integration tier exists the moment a command is
  supplied, and an init run that fails to seed produces a **named, actionable
  warning** (`INVALID_GATE: Gate 'integration-test' missing required command
  field — skipped`) rather than silence. Verified: `command: ""` is falsy, so
  `validateGate` drops it with that warning and never hands an empty argv list
  to a spawner.

  `command: []` is explicitly **not** used as the sentinel. An empty array is
  truthy, passes both of `validateGate`'s guards, and is returned as a valid
  gate carrying an empty argv list — a gate that would reach the executor with
  nothing to run. This was verified directly against `mergeGates`.

- `templates/domains/software/gates.yaml` and the two extension overlays
  (`extensions/data-engineering/domain/gates.yaml`,
  `extensions/process-automation/domain/gates.yaml`) are already
  stack-committed — each hardcodes `["npm", "test"]` today. These gain a
  **live, error-severity integration-tier gate** with a command that is a
  verified no-op until the project defines the script:

  ```yaml
  command: [npm, run, --if-present, test:integration]
  ```

  `npm run --if-present <script>` exits 0 when the script is undefined
  (verified empirically against npm 11.6.2 in a scratch package, both flag
  positions). So the gate is **active, not advisory**: it costs nothing on a
  fresh scaffold, never fails closed, and graduates into a real enforced
  integration gate the instant someone adds a `test:integration` script — with
  zero configuration and no second decision point. This is the
  "active with a documented no-op-if-absent semantic" option, made true by a
  package-manager feature rather than by an invented schema field.

No new gate schema fields are introduced. No `{{ }}` placeholder ever appears
in a template `command` — `gate-doctor/unsubstituted-placeholder` is
error-severity, so a mustache default would fail the doctor bar by
construction.

### On `transitions: {}`

Issue-554 asks to "uncomment `transitions: {}`". **This is already done** —
`transitions: {}` is live YAML in the current template, with only the
illustrative sub-keys commented. The issue text is stale on this point and
this spec records that rather than performing a no-op edit.

`transitions` is deliberately left empty. The charter invariant requires every
ID in `transitions.*.required_gates` to exist in the `gates` list, and
`/adev:hygiene` Pass 8 enforces it. Populating `implement-to-validate:
required_gates: [test]` in the template would bind a transition to a gate
whose command may still be the unwired sentinel — a fail-closed transition on
a fresh scaffold, the exact failure mode this spec exists to avoid.

### Preconditions

- `.context-index/governance/gates.yaml` is the sole source of governance gate
  definitions (charter: Single Source of Truth).
- `lib/domains/merge-gates.mjs` enforces argv-list `command` (SEC-2). This
  spec does not relax it.
- `adev gate doctor` exists and is reachable from `/adev:validate` check-14 and
  `/adev:hygiene` Pass 8 (charter revision 3).

### Behaviors

1. **When** `templates/gates-template.yaml` is read **then** the `gates:` list
   contains at least two live (uncommented) entries: `test` with `tier: fast`
   and `integration-test` with `tier: integration`, each carrying `id`, `name`,
   `kind`, `tier`, `command`, `scope`, `required`, `severity`, and `triggers`.
   `integration-test` declares `triggers: [post-implement]`.

2. **When** the template's schema header documents the `command:` field
   **then** it specifies an argv list (`command: [npm, test]`), matching
   `docs/governance.md` and `lib/domains/merge-gates.mjs`, and every live and
   commented example in the file uses argv form.

3. **When** a gate declares `command: ""` (the unwired sentinel emitted by the
   template before `/adev:init` seeds it) **then** `mergeGates` drops it with a
   named `INVALID_GATE` warning and no gate with an empty argv list reaches any
   executor.

4. **When** `templates/domains/software/gates.yaml` is loaded **then** the
   merged gate list contains a live `tier: integration` gate with
   `severity: error` whose command is
   `[npm, run, --if-present, test:integration]`, in addition to the existing
   fast-tier gate.

5. **When** either extension overlay
   (`extensions/data-engineering/domain/gates.yaml`,
   `extensions/process-automation/domain/gates.yaml`) is loaded **then** it
   likewise contributes a live integration-tier gate, so no starter surface
   ships a fast-only tier map.

6. **When** `adev gate doctor` analyses a gate whose `command` is an argv list
   **then** it normalises the list to a command string and runs every
   command-level check (placeholders, binary resolution, referenced paths,
   globs, runner detection, CI invocation) against it, instead of reporting
   `gate-doctor/empty-command`. Argv gates cannot contain shell operators by
   construction, so the operator-splitting and command-chain checks are
   trivially clean for them and the join is not lossy.

7. **When** `adev gate doctor` runs against a freshly scaffolded project
   carrying the new defaults **then** it exits 0 with **no error-severity
   findings**. Warnings inherent to a fresh scaffold
   (`gate-doctor/ci-config-missing` — a new project has no CI config;
   `gate-doctor/runner-unknown` — an unpopulated `package.json` exposes no
   identifiable runner) are expected and are not regressions. "Reports
   cleanly" means exit 0 / zero errors, not zero findings.

8. **When** `/adev:init` Step 7a generates `governance/gates.yaml` **then** it
   seeds both the fast-tier and the integration-tier command in argv form, and
   uses the `--if-present`-style no-op idiom for the integration tier when the
   detected stack has no integration entrypoint yet.

9. **When** `/adev:implement` Step 2-post resolves integration-tier gates
   **then** it sources them from the **merged** gate list
   (`adev domain load-gates --module <module>`, the same source
   `/adev:validate` Check 1 uses via `mergedGates`), not from a direct read of
   `governance/gates.yaml`. Without this, the live domain-starter and extension
   integration gates added by behaviors 4 and 5 are invisible at
   `post-implement` and reachable only from `/adev:validate` Check 1b.
   (Addresses review blocker SA-1.)

10. **When** `/adev:implement` Step 2-post encounters a gate whose `command` is
    empty, absent, or not an argv list **then** it records the gate as
    **skipped** with a named reason and executes nothing — mirroring the guard
    Step 2h already applies to per-task gates ("for each gate with
    `kind: deterministic` and non-empty `command`"). This is what makes the
    live `command: ""` sentinel safe on an unseeded scaffold at the one
    consumer where `mergeGates`' own drop behavior does not apply.
    (Addresses review blocker SA-2.)

### Postconditions

- Every newly scaffolded project declares at least two tiers, and its
  integration tier executes (as a no-op or for real) at `post-implement` —
  reachable because behavior 9 routes Step 2-post through the merged gate list.
- Both integration-gate consumers agree on their source: `/adev:validate`
  Check 1b and `/adev:implement` Step 2-post read the same merged list.
- An unwired (`command: ""`) gate is never executed by any consumer: dropped by
  `mergeGates`, and skipped-with-reason by Step 2-post's own guard.
- No template or starter surface teaches string-form `command`.
- `adev gate doctor` diagnoses every gate the loader accepts.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Gate `command` is a string | Gate dropped, named warning | `INVALID_GATE` |
| Gate `command` is `""` (unwired sentinel) | Gate dropped, named warning; nothing spawned | `INVALID_GATE` |
| Gate `command` is `[]` | Not emitted by any template surface (see rationale); if authored by hand, Step 2-post's argv guard (behavior 10) records it as skipped rather than executing an empty argv list | — |
| Integration gate reaches `/adev:implement` Step 2-post with an empty or non-argv `command` | Recorded as skipped with a named reason; nothing spawned; Step 3 proceeds | — |
| `npm` absent on a non-Node project using the software domain starter | `gate-doctor/binary-not-found` (error) — pre-existing condition of the starter's `[npm, test]` gate, not introduced here | `gate-doctor/binary-not-found` |
| `test:integration` script undefined | `npm run --if-present` exits 0; gate passes as a no-op | — |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins."
  The no-op-if-absent semantic is delivered by an existing npm flag, not by a
  new schema field or a new detection library.
- **Principle:** "Templates are consumed verbatim by `cpSync()` — changes only
  affect new scaffolds." This spec changes defaults for **new** projects only.
  Existing projects are untouched; the migration path is `/adev:init` rerun or
  a manual edit, and this is called out in `docs/governance.md`.
- **Principle:** "No executable logic inside SKILL.md files" / cli-driver
  surface. The `/adev:init` change is prose naming what to seed, not new
  inline logic; the argv normalisation lives in `lib/gates/doctor.mjs`.
- **Principle:** "Updating specs/ADRs when code changes affect their
  assumptions is required." This spec records that `gate-doctor.spec.md`
  behavior 3 (`empty-command`) now applies only to genuinely empty commands,
  not to argv lists.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Doctor argv normalisation | `lib/gates/doctor.mjs` accepts argv-list `command`, joins for analysis; tests | small |
| Gates template alignment | Activate `test` + `integration-test`; argv form throughout the schema header and all examples; document the unwired sentinel and the transitions decision | medium |
| Domain + overlay integration tier | Add live integration gate to the software starter and both extension overlays | small |
| Init seeding prose | `/adev:init` Step 7a seeds both tiers in argv form | small |
| Implement Step 2-post gate source | `skills/implement/SKILL.md` Step 2-post sources integration gates from the merged list (`adev domain load-gates`), matching validate Check 1, and adds the non-empty/argv guard mirroring Step 2h (blockers SA-1 + SA-2) | small |
| Docs | Add the missing `gates.yaml` gate-schema section to `docs/governance.md` (argv-only, tiers, `INVALID_GATE` vs `QUALITY_GATE_COMMAND_SHELL`), the shipped default, and how to graduate it — one scoped section | small |
| Tests | Template/starter parity assertions + doctor-clean-on-fresh-scaffold fixture | medium |

## Acceptance Criteria

- [ ] `templates/gates-template.yaml` has live `test` (fast) and
      `integration-test` (integration) entries; `integration-test` triggers
      `post-implement`.
- [ ] Every `command:` in the template, the software domain starter, and both
      extension overlays is argv form.
- [ ] `mergeGates` on the software starter yields ≥ 1 `tier: integration` gate
      with `severity: error`.
- [ ] Both extension overlays yield an integration-tier gate.
- [ ] `adev gate doctor` runs all command-level checks on argv gates
      (regression test asserts no `empty-command` finding for an argv gate).
- [ ] `adev gate doctor` on a fresh scaffold carrying the new defaults exits 0
      with zero error-severity findings.
- [ ] `/adev:init` Step 7a documents seeding both tiers in argv form.
- [ ] `/adev:implement` Step 2-post sources integration gates from the merged
      list (`adev domain load-gates`), so the domain-starter integration gate
      is reachable at `post-implement` and not only from `/adev:validate`.
- [ ] `/adev:implement` Step 2-post skips any gate whose `command` is empty or
      not an argv list, recording a named reason and executing nothing.
- [ ] `docs/governance.md` documents the shipped default and the graduation
      path, in one scoped section.
- [ ] This repo's own `.context-index/governance/gates.yaml` is **not**
      modified (see Open Question 1).
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.

## Open Questions for a Human

1. **This repo's own `gates.yaml` is currently broken and is left that way.**
   Its `test` gate uses string form and is dropped by `mergeGates` with an
   `INVALID_GATE` warning; the only gate that actually runs is the domain
   starter's `quality-gate` (`npm test`, fast tier). Converting it to argv form
   would activate a **second** `npm test` — the governance `test` gate triggers
   `post-task` *and* `post-implement`, on top of the starter's `quality-gate` —
   which is precisely the "full suite after every task, 2m50s × every task"
   pain issue-554 complains about. Deduplicating those two gates is a judgment
   call about this repo's own workflow, not a framework change, so it is
   deliberately out of scope here.

2. **Non-npm stacks in the domain starters.** `templates/domains/software/`
   hardcodes npm for every software-domain project, and this spec follows that
   existing precedent for the integration tier. Per-stack starters (or
   stack detection at init time) is real follow-up work and is not attempted
   here.

## Systemic Pattern (recorded for retro)

adev repeatedly ships an engine with its defaults commented out and its
invocation left in agent prose. Three instances are now on record: tiered gates
(this spec — engine shipped, every entry commented), gate doctor (the charter
asserted the executability invariant for two revisions before anything checked
it), and the string/argv `command` split (docs stated the rule, the template
taught the opposite, and nothing tested that a template-authored gate survives
the loader). The common failure is that **no test exercises the artifact a
user actually receives.** The tests added by this spec close that specific gap
for gates: they assert against the shipped template and starters, not against
hand-written fixtures.

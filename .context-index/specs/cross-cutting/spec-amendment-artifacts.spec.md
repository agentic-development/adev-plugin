---
partial_schema: spec@1
mode: cross-cutting
kind: behavioral
status: validated
risk_level: medium
revision: 1
charter-revision: 1
created: 2026-06-19
updated: 2026-06-19
affects: [lifecycle-artifacts, spec-lifecycle, agent-reliable-state-artifacts, cli-driver-surface]
source-manifest:
  sha: "bbf814a"
  files:
    - .context-index/adrs/0009-lifecycle-artifact-taxonomy.md
    - lib/amendment-graph.mjs
    - lib/cli/specify.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/hygiene/amendment-audit.mjs
    - lib/kinds.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - lib/specify-amend.mjs
    - skills/hygiene/SKILL.md
    - skills/specify/SKILL.md
    - skills/status/SKILL.md
    - templates/spec-template.behavioral.md
    - tests/amendment-graph.test.mjs
    - tests/cli/specify-amend.test.mjs
    - tests/lifecycle/spec-amended-event.test.mjs
    - tests/specify-amend-skill.test.mjs
    - tests/specify-amend.integration.test.mjs
    - tests/specify-amend.test.mjs
  computed-at: "2026-06-19T14:09:30.910Z"
drift_detected: true
---

# Cross-Cutting Live Spec: First-Class Spec Amendments

> **Intent:** Give adev a first-class, machine-readable way to **amend an
> already-shipped (validated) spec** without editing it in place — formalizing
> the ad-hoc `<base>-rev-N-<descriptor>.spec.md` pattern that surged organically
> in downstream projects into a governed relationship field, a scaffolding CLI
> verb, and a lifecycle link, while leaving the closed `kind:` taxonomy and the
> `slugFromSpec` `.spec.md` contract untouched.

## Problem and Motivation

Long-lived specs that already reached `validated` sometimes need a **coordinated
revision** (a downstream contract changes, a dependency lands, a schema element
is dropped). Editing the shipped spec in place re-opens a closed lifecycle and
destroys the audit trail. The existing `/adev:specify --revise` flow does **not**
cover this — it is scoped to the review-BLOCK retry loop (bump `revision:` N→N+1
in place on a spec that has not yet shipped, clearing `.blockers.md`).

In the absence of a first-class mechanism, operators improvised: they author a
**separate coordinating spec** named `<base-stem>-rev-N-<descriptor>.spec.md`
with a full sidecar lifecycle (`.review.md`, `.plan.md`, `.validate.md`,
`.signoff.md`, and an `.equivalence-report.md`). This works, but only by
accident and with sharp edges:

- **No machine-readable link.** The amendment→base relationship lives in prose
  intent and a loose `related-specs:` entry, so `/adev:status` and
  `/adev:hygiene` cannot traverse base↔amendment.
- **Naming and location drift.** `rev-N` is baked into the slug by convention,
  and the amendment file can drift into an unrelated directory.
- **It survives only on the `.spec.md` extension loophole.** `slugFromSpec`
  (`lib/lifecycle-state.mjs:64`) throws `INVALID_SPEC_PATH` for any path not
  ending in `.spec.md`. The organic pattern gets a lifecycle event log *only*
  because it kept that extension. The moment an operator names a file
  `*-amendment.md`, it gets **no lifecycle states at all** — the original
  friction that motivated this spec.
- **No scaffolding.** Every operator reinvents the layout, guaranteeing drift.

### Relationship to prior decisions

- **`spec-lifecycle` charter de-scoped an "Amendment Log"** ("git log with
  structured commits replaces this"). This spec does **not** reintroduce that.
  An *amendment log* is a chronological journal of changes; an *amendment
  artifact* is a first-class, independently-reviewed spec that amends another
  spec. They are different concepts; this spec delivers the latter.
- **ADR-0009 defines a closed 6-value `kind:` enum** where `kind:` denotes
  artifact *shape*. An amendment of a behavioral spec is still behavioral-shaped.
  Therefore "amendment" is modeled as an **orthogonal relationship field**
  (`amends:`), **not** a 7th `kind:` value — mirroring adev's existing
  workflow-axis-vs-kind-axis orthogonality. The closed `kind:` enum is unchanged.

## Behavioral Contract

### Preconditions

- A base spec exists on disk, ends with `.spec.md`, and is resolvable within the
  project root.
- The `lifecycle-artifacts` `kind:` taxonomy and `lib/kinds.mjs` closed
  enumeration are in force (amendments reuse, not extend, this enum).
- The lifecycle event log (`agent-reliable-state-artifacts`) is available for
  appending events.

### Behaviors

1. **When** an author runs `/adev:specify --amend <base-spec>` against an
   existing spec, **then** the skill (via the CLI verb `adev specify amend`)
   scaffolds a new amendment spec **co-located with the base** at
   `<base-dir>/<base-stem>-rev-<target>-<descriptor>.spec.md`, where
   `<descriptor>` is a kebab-case slug supplied by the author (prompted if
   omitted).

2. **When** the amendment is scaffolded, **then** its frontmatter carries
   `amends: <project-root-relative base-spec path>`, `target-revision: <N>`,
   an explicit `kind:` (defaulting to the base spec's `kind:`, overridable),
   `revision: 1`, and `status: review-pending`. The file keeps the `.spec.md`
   extension.

3. **When** `target-revision` is computed, **then** it is set to the base spec's
   current `revision:` + 1, unless the author overrides it; the override must
   still be strictly greater than the base's current `revision:`.

4. **When** the amendment spec file is written, **then** a `spec_amended`
   lifecycle event is appended to the **base spec's** event log carrying
   `{ amendment_slug, amendment_path, target_revision }`, **and** the amendment
   spec receives its own lifecycle log through the standard `.spec.md` slug
   derivation (no change to `slugFromSpec`).

5. **When** `/adev:status` or `/adev:hygiene` reads a spec that carries
   `amends:`, **then** it resolves and validates the base spec and reports the
   base↔amendment relationship (e.g., "amends `<base>` targeting rev `<N>`,
   status `<amendment-status>`").

6. **When** computing a base spec's **effective revision**, **then** status
   reports `max(base.revision, highest target-revision among its validated
   amendments)` — the base file is **never silently rewritten**; immutability of
   the shipped spec is preserved and the amendment carries the delta.

7. **When** an amendment's `amends:` points at a non-existent or out-of-root
   base, **then** hygiene emits a dangling-amendment finding rather than
   crashing.

8. **When** a spec carries exactly one of `amends:` / `target-revision:` (not
   both), **then** specify and hygiene flag `INCOMPLETE_AMENDMENT_LINK` — an
   amendment must declare both its base and the revision it targets.

9. **When** `amends:` links form a chain (an amendment of an amendment),
   **then** status reports the full chain; **when** the chain contains a cycle,
   **then** the traversal halts and reports `AMENDMENT_CYCLE` instead of
   looping.

10. **When** an author passes `--kind amendment`, **then** specify rejects it
    with the existing closed-enum `INVALID_KIND` error — "amendment" is not a
    kind. This decision is recorded so the rejection is intentional, not a gap.

### Postconditions

- The amendment spec is a valid `.spec.md` with its own lifecycle log and a
  machine-readable `amends:` + `target-revision:` link to its base.
- The base spec's event log contains a `spec_amended` event; the base spec file
  itself is unchanged.
- `/adev:status` and `/adev:hygiene` can traverse base↔amendment in both
  directions.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Base spec does not exist | Scaffold aborts; nothing written | `INVALID_AMENDMENT_BASE` |
| Base spec path escapes project root | Abort; report malformed path | `INVALID_SPEC_PATH` |
| `amends:` without `target-revision:` (or vice versa) | Flagged by specify/hygiene | `INCOMPLETE_AMENDMENT_LINK` |
| `target-revision` ≤ base `revision:` | Abort scaffold | `INVALID_TARGET_REVISION` |
| `amends:` chain contains a cycle | Traversal halts, reports chain | `AMENDMENT_CYCLE` |
| `--kind amendment` supplied | Reject with closed-enum list | `INVALID_KIND` |
| `amends:` target missing at hygiene time | Non-fatal dangling finding | `DANGLING_AMENDMENT` |

## System Constitution Reference

- **Principle 1 — "Minimize external dependencies; prefer Node.js built-ins."**
  Applies because the amendment scaffolder and traversal logic
  (`lib/specify-amend.mjs`) must use only `fs`/`path` and existing helpers — no
  new dependency.
- **Principle 2 — "Skills are primarily markdown."** Applies because the
  `/adev:specify --amend` surface must name the CLI verb `adev specify amend`;
  the executable logic lives in `lib/specify-amend.mjs`, not in SKILL.md.
- **CLI-driver-surface anti-pattern — "No inline Node / `node -e` in SKILL.md."**
  Applies because amend control flow (base resolution, target-revision
  computation, event emission) belongs in the CLI verb, not in skill prose.
- **Architecture Boundary — "Changing the hook protocol / plugin registration
  requires human approval."** Applies because adding the `spec_amended` canonical
  event touches the lifecycle event schema governed by ADR-0009 and must be an
  explicit, human-approved taxonomy change rather than a silent addition.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `lifecycle-artifacts` | High | Define the `amends:` + `target-revision:` frontmatter contract; record the decision that amendment is a relationship overlay, **not** a 7th `kind:`; amend ADR-0009 to document it. |
| `agent-reliable-state-artifacts` | High | Add `spec_amended` to `CANONICAL_EVENTS` + its event schema; emit it on the base spec's log. `slugFromSpec` is explicitly **unchanged** (amendments keep `.spec.md`). |
| `cli-driver-surface` | High | New `adev specify amend` subcommand wrapping `lib/specify-amend.mjs`; new `/adev:specify --amend` workflow axis (orthogonal to `--kind`, mutually exclusive with `--revise`/`--extract`/`--refactor`/`--from-diff`/`--cross-cutting`). |
| `spec-lifecycle` | Medium | `/adev:status` + `/adev:hygiene` traversal, effective-revision computation, and the dangling/incomplete/cycle findings; distinguish from the de-scoped "Amendment Log". |

## Integration Points

1. **`adev specify amend` ↔ lifecycle-state:** the scaffolder calls
   `appendEvent(... spec_amended ...)` against the **base** spec's log after the
   amendment file is atomically written.
2. **status / hygiene ↔ frontmatter:** both read `amends:` / `target-revision:`,
   compute effective revision, and emit `DANGLING_AMENDMENT`,
   `INCOMPLETE_AMENDMENT_LINK`, and `AMENDMENT_CYCLE` findings.
3. **ADR-0009 ↔ taxonomy:** the ADR is amended to state that amendment is a
   relationship field, the `kind:` enum stays closed at 6, and `--kind amendment`
   is intentionally rejected.
4. **`--revise` vs `--amend`:** distinct workflows — `--revise` bumps a
   **not-yet-shipped, review-blocked** spec in place (N→N+1, clears
   `.blockers.md`); `--amend` produces a **new co-located artifact** that amends
   a **shipped/validated** spec while keeping the base immutable.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Frontmatter contract | Document `amends:` + `target-revision:` in templates + ADR-0009; confirm `kind:` enum unchanged | small |
| `spec_amended` event | Add to `CANONICAL_EVENTS` + event schema + emitter on base log | medium |
| `lib/specify-amend.mjs` | Base resolution, target-revision computation, co-located naming, atomic write, event emission, path containment | medium |
| `adev specify amend` verb | CLI subcommand wrapping the lib; flag mutual-exclusion with other workflow axes | small |
| `/adev:specify --amend` surface | Skill workflow-axis prose naming the verb (no inline Node) | small |
| status / hygiene traversal | Read `amends:`, compute effective revision, emit dangling/incomplete/cycle findings | medium |
| ADR-0009 amendment | Record relationship-overlay decision + `--kind amendment` rejection rationale | small |
| Tests | Scaffold, frontmatter validation, event emission, traversal, cycle/dangling/incomplete error paths | medium |

## Acceptance Criteria

- [ ] `/adev:specify --amend <base>` scaffolds `<base-stem>-rev-<N>-<descriptor>.spec.md` co-located with the base, with `amends:` + `target-revision:` frontmatter and an inherited/overridable `kind:`.
- [ ] Amendments keep the `.spec.md` extension; `slugFromSpec` is unchanged and the amendment gets its own lifecycle log.
- [ ] A `spec_amended` event is appended to the **base** spec's log; the base file is not modified.
- [ ] `--kind amendment` is rejected with the closed-enum `INVALID_KIND` error.
- [ ] `/adev:status` and `/adev:hygiene` report base↔amendment relationships and compute effective revision as `max(base, validated amendment target-revisions)`.
- [ ] Hygiene emits `DANGLING_AMENDMENT`, `INCOMPLETE_AMENDMENT_LINK`, and `AMENDMENT_CYCLE` findings for the respective malformed states.
- [ ] `--amend` is mutually exclusive with `--revise`/`--extract`/`--refactor`/`--from-diff`/`--cross-cutting` (exits `CONFLICTING_FLAGS`).
- [ ] ADR-0009 is amended to record the relationship-overlay decision and the intentional `--kind amendment` rejection.
- [ ] All amend logic lives in `lib/specify-amend.mjs` + the CLI verb; SKILL.md contains no inline Node.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.

# Implementation Plan: Explicit Governance Registries

> **Methodology:** adev
> **Charter:** cross-cutting — spec `affects: [validation, unified-gates, review, cli-driver-surface]`
> today; Task 1 adds **`agent-reliable-state-artifacts`** (SA-1's payload co-ownership) and
> **`domain-extensions`** (DDR-13, Task 12's install-path edits), so the post-Task-1 list is six.
> (`.context-index/specs/features/validation/charter.md`, `.../unified-gates/charter.md`,
> `.../review/charter.md`, `.../cli-driver-surface/charter.md`,
> `.../agent-reliable-state-artifacts/charter.md`, `.../domain-extensions/charter.md`)
> **Spec:** `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md` (revision 4)
> **Review:** PASS_WITH_NOTES (2026-08-15) — **operator override**; reviewers returned BLOCK.
> SA-1, SA-2 and CON-1 are **not waived**. SA-1 is closed by Tasks 1, 4, 5, 6; CON-1 by Tasks 1, 4,
> 7; SA-2 is bounded by Task 1 and **enforced** by Tasks 9, 10 and 12.
> **Platform:** JavaScript (ESM, `.mjs`), Node.js built-ins only, npm, `node:test`

**Goal:** Make every governance registry say exactly what runs — one composition model, no
implicit bundled or domain overlay at run time — and turn the two checks that reason over
those registries into deterministic CLI verbs.

**Architecture:** The registries keep their current file locations and root keys
(`lib/extensions/governance-registry.mjs::WRITABLE_REGISTRIES` is already the authoritative
table). Composition moves from run time to two explicit writers: `adev governance materialize`
and `/adev:init` scaffolding, both of which reuse the existing `lib/domains/merge-*.mjs`
machinery. Writes go through `lib/extensions/governance-splice.mjs` (in-place splice, sibling
keys and comments preserved) rather than a serializer, and every scalar passes
`lib/extensions/governance-values.mjs::assertSafeScalar`. Checks 8 and 9 become
`adev boundaries check` and `adev gate transitions`, following the shipped
`check-14-gate-executability` pattern (check body = one verb call + result mapping).

---

## Review-Blocker Closure Map

The review verdict was an operator override. Three blockers stand. This plan closes each with
named tasks; nothing here is deferred to `/adev:validate` to rediscover.

| Blocker | Defect | Closed by | How |
|---|---|---|---|
| **SA-1** | Behavior 4 reads a per-gate outcome array `[{id, verdict, tier}]` from the `validator_report` payload, but `reportValidator` (`lib/lifecycle-state.mjs:866-886`) destructures a closed argument list and `lib/cli/report.mjs` (`options` block, lines 96-121) is a closed string-flag set. Nothing can write the array. Neither file appears in the Changes Catalog. | **Tasks 1, 4, 5, 6** | Task 1 adds both files to the spec's Changes Catalog MODIFIED and records the optional field in `lifecycle-event-log.spec.md`'s Canonical Event Variants table (the precedent is `revision`, contributed by `review-block-auto-retry`), adding `agent-reliable-state-artifacts` to `affects:`. Task 4 extends `reportValidator` to accept and emit `gate_outcomes` + `manifest_sha`. Task 5 adds the `--gate-outcomes` flag to `lib/cli/report.mjs`. Task 6 makes Check 1 the sole writer, from its own execution results. |
| **SA-2** | Revision 4 widened `materialized_at` to "each governance yaml" / "every registry", which made AC "installing the reference extension against a 7-check `validate.yaml`…" unsatisfiable against the `REGISTRY_NOT_MATERIALIZED` Error Case row, and made Behavior 1 (Check 8 SKIPs on empty `boundaries.yaml`) unreachable. | **Task 1**, enforced by **Tasks 9, 12** | Task 1 bounds the marker to exactly the three registries Step 5 materializes — `review.yaml`, `diagnostics.yaml`, `gates.yaml` — and states the exemption for `validate.yaml` and `boundaries.yaml` in ADDED, Behavior 11 and both Error Case rows. Tasks 9 and 12 implement the bounded set and pin the exemption with tests (the reference-extension install into `validate.yaml` still succeeds; Check 8 still reaches its SKIP on an unmarked `boundaries.yaml`). |
| **CON-1** | "A gate outcome is usable only if recorded **at or after the source-manifest SHA**" compares a timestamp against a content hash. Per ADR-0011 the stamp is `{sha, files, computed-at}`; `sha` has no temporal ordering, `computed-at` is the only ordered field, and `{id, verdict, tier}` carries neither. | **Tasks 1, 4, 7** | Task 1 rewrites the staleness clause and its AC to compare the **event's own `ts`** (every lifecycle event is stamped ISO-8601 by `normaliseEventInPlace`, `lib/lifecycle-state.mjs:208-221`) against the spec's source-manifest `computed-at`, and adds `manifest_sha` to the payload for an equality check. Task 4 writes `manifest_sha`. Task 7 implements the comparator: an outcome is fresh iff `event.ts >= computed-at` **and**, when `manifest_sha` is present, it equals the spec's current `sha`; otherwise SKIP `stale-gate-record`. |

**SEC-1 is moot — verified against current code, not assumed.** `serializeGovernanceYaml`,
`serializeYamlValue`, `inferRootKey`, `isValidGovernanceValue` and `validateGovernanceEntry` are
all absent from `lib/extensions/content-install.mjs`. Their replacements shipped with
`extension-governance-merge-hardening.spec.md`: `lib/extensions/governance-splice.mjs`
(`spliceRegistryEntries`, `emitEntry`) and `lib/extensions/governance-values.mjs`
(`assertSafeScalar`, `assertSafeArgvToken`, `assertValidValue`, `assertWithinCaps`,
`assertStringId`, `isArgvPathElement`, `CAPS`). No task in this plan re-does that work; Task 10
consumes the splice writer rather than reimplementing serialization.

---

## Already Implemented by the Dependency — Do Not Re-Plan

Verified in this worktree at planning time. The spec's Current State section predates this work.

| Spec item | Status | Evidence |
|---|---|---|
| Safe governance-YAML writing (SEC-1) | **Done** | `lib/extensions/governance-splice.mjs::spliceRegistryEntries` splices in place, preserving every other byte. |
| Scalar refusal layer | **Done** | `lib/extensions/governance-values.mjs::assertSafeScalar` / `assertValidValue`; `command` takes the argv rule via `assertSafeArgvToken`. |
| Writable-registry → root-key table | **Done** | `lib/extensions/governance-registry.mjs::WRITABLE_REGISTRIES` + `resolveRootKey`. Five registries; `risk-policies.yaml` / `sensitive-paths.yaml` explicitly non-writable. |
| Per-registry field allowlists, incl. `enabled` / `disabled_reason` | **Done** | `FIELD_ALLOWLIST` allowlists both fields for **all five** registries, so the "ADDED: `enabled` + `disabled_reason`" catalog row is already shipped at the contribution boundary. |
| `enabled: false` honoured by the **validate** loader | **Done** | `lib/governance/validate-config.mjs:191, 196` skip a disabled check; `:244` defaults `enabled: true`. Task 13 must **not** re-implement this. |
| `disabled_reason` read by any loader | **Not done** | Zero reads. This, plus review/diagnostics parity and `DISABLED_WITHOUT_REASON`, is the whole of Task 13. |
| `source` / `__source` / `exec_consented_at` as installer-owned | **Done** | `INSTALLER_OWNED`; supplying one raises `GOVERNANCE_SOURCE_FORGED`. |
| Install-time exec consent (`--allow-exec`, `exec_consented_at`) | **Done** | `lib/extensions/exec-consent.mjs`. |
| Open-namespace resolution (`profile` / `prompt` / `context_pack`) | **Done** | `OPEN_NAMESPACE_FIELDS` is exported from `lib/extensions/governance-registry.mjs`; `assertOpenNamespacesResolvable` (its consumer) lives in `content-install.mjs`. |
| Argv-list enforcement for gate `command` | **Done** | `assertArgvCommand` (module-private inside `governance-registry.mjs`); mirrors `lib/domains/merge-gates.mjs:34-40`. |
| Bundled `plugin:` diagnostics as explicit registry rows | **Likely already done — confirm before editing** | The four `plugin:` entries are already explicit rows in `.context-index/governance/diagnostics.yaml`; `lib/diagnostics/index.mjs` only resolves the prefix (first-wins, `:23-24`, `:288`) and injects nothing. Tasks 10/11/13 must verify there is anything to remove before planning an edit there. |

**Consequence for scope:** the extension-write-path hardening is landed, and so is half of the
`enabled` work. This plan's remaining share is Task 13 (`disabled_reason` + parity) and Task 12
(marker gate on install).

---

## In-Scope Decision: the `test` gate the loaders disagree about

The pipeline flagged that `.context-index/governance/gates.yaml` declares
`command: "npm test"` (a string). Reproduced at planning time:

```
$ adev domain load-gates --module cross-cutting
… "warnings":[{"code":"INVALID_GATE","message":"Gate 'test' command must be an argv list (array), not a string — skipped."}]
```

The gate is silently dropped by `lib/domains/merge-gates.mjs::validateGate`, and the run is saved
only by the domain starter's own `quality-gate` (`["npm","test"]`). Meanwhile
`lib/gates/doctor.mjs::loadGates` (line 1147) reads the raw file and *does* see `test`. Two
consumers, two different gate sets, from one file.

**Decision: in scope.** This is Problem 4 in the spec's own Current State ("the gate doctor
inspects a different gate set than its consumers execute") with a second, sharper instance: the
project's declared gate does not run at all. Closing it is Task 2 (doctor divergence finding +
argv conversion) and Task 3 (a test asserting doctor and Check 1 resolve the same set,
AC "…operate on the same gate set, asserted by a test"). No spec amendment is needed —
Behavior 10 and Integration Point 4 already cover it.

---

## File Structure

**Create:**
- `lib/governance/boundaries.mjs` — pure boundary-rule evaluator (load, validate, match, budget accounting)
- `lib/governance/boundary-worker.mjs` — static `node:worker_threads` worker; compiles `new RegExp(pattern, flags)` from `workerData` only
- `lib/governance/transitions.mjs` — transition required-gate evaluator over `validator_report` gate outcomes
- `lib/governance/materialize.mjs` — effective-set computation + write-once `materialized_at` stamping
- `lib/governance/registry-marker.mjs` — the bounded marker registry set, `readMarker`, `assertMaterialized` (`REGISTRY_NOT_MATERIALIZED`)
- `lib/cli/boundaries.mjs` — `adev boundaries check [--json]`
- `lib/cli/governance.mjs` — `adev governance materialize --registry <name> [--dry-run] [--json]`
- `tests/specs/explicit-governance-registries-contract.test.mjs`
- `tests/gates/doctor-consumer-parity.test.mjs`
- `tests/governance/boundaries.test.mjs`
- `tests/cli/boundaries-check.test.mjs`
- `tests/lifecycle/gate-outcomes.test.mjs`
- `tests/cli/report-gate-outcomes.test.mjs`
- `tests/governance/transitions.test.mjs`
- `tests/governance/deterministic-check-migration.test.mjs`
- `tests/governance/registry-marker.test.mjs`
- `tests/governance/materialize.test.mjs`
- `tests/governance/registry-effective-set.test.mjs`
- `tests/lib/extensions/governance-marker-gate.test.mjs`
- `tests/governance/enabled-flag.test.mjs`
- `tests/governance/boundary-rules-corpus.test.mjs`
- `tests/governance/transitions-config.test.mjs`
- `tests/governance/source-vocabulary.test.mjs`
- `tests/hygiene/registry-drift-pass-19.test.mjs`
- `tests/fixtures/governance/` — violating and clean fixtures for each boundary rule

**Modify:**
- `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md` — SA-1/SA-2/CON-1 closures + warning-debt dispositions
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — Canonical Event Variants row for `gate_outcomes` / `manifest_sha`
- `lib/gates/doctor.mjs:1147-1172` — divergence finding; string-command finding
- `.context-index/governance/gates.yaml` — `test` gate → argv form; populate `transitions:`; `materialized_at`
- `lib/lifecycle-state.mjs:866-890` — `reportValidator` accepts `gate_outcomes` + `manifest_sha`
- `lib/cli/report.mjs:96-121, 428-442` — `--gate-outcomes` flag, parse + validate + pass-through
- `skills/validate/SKILL.md` — Check 1 emits per-gate outcomes; Check 8/9 sections mirror the new bodies
- `skills/validate/checks/validate.check-1-quality-gates.md` *(create if absent — the registry has no entry for Check 1 today; see Task 6)*
- `skills/validate/checks/validate.check-8-boundaries.md` — body becomes `adev boundaries check --json`
- `skills/validate/checks/validate.check-9-transition-gates.md` — body becomes `adev gate transitions --json`
- `.context-index/governance/validate.yaml` — Checks 8/9 `kind: subagent-review` → `deterministic-check`
- `templates/domains/software/validate.yaml` — same flip in the starter
- `lib/cli/gate.mjs` — `transitions` sub-verb alongside `require` / `doctor`
- `cli/index.mjs:1722-1789` — register `boundaries` and `governance` in `VERB_REGISTRY`
- `lib/governance/review-config.mjs:40-140, 312-330` — drop the three-layer overlay; `__source` → on-disk `source` mapping
- `lib/diagnostics/index.mjs` — bundled `plugin:` entries become explicit rows
- `lib/cli/domain.mjs:281` — `load-gates` reads the materialized project file; merge retained for materialize/init only
- `lib/extensions/content-install.mjs` — refuse install into an unmarked registry (`REGISTRY_NOT_MATERIALIZED`)
- `lib/governance/validate-config.mjs` — honour `enabled: false` + `disabled_reason`
- `.context-index/governance/boundaries.yaml` — populated from the constitution's mechanical anti-patterns
- `.context-index/governance/review.yaml`, `.context-index/governance/diagnostics.yaml` — materialized + marked
- `skills/init/SKILL.md:211-227, 320-406` — stamp `materialized_at` at scaffold time
- `templates/gates-template.yaml`, `templates/diagnostics-template.yaml`, `templates/governance/review.example.yaml` — marker in scaffolded output (`templates/boundaries-template.yaml` is deliberately **not** touched: `boundaries.yaml` is marker-exempt under DDR-1)
- `skills/hygiene/SKILL.md:919-968` — Audit Pass 19 widened to four registries + two sub-audits
- `docs/governance.md`, `docs/cli-reference.md` — three new verbs, marker semantics (owned by Task 18)

**Reference (read, do not modify):**
- `lib/extensions/governance-registry.mjs` — registry table + allowlists; the authority for which files are writable
- `lib/extensions/governance-splice.mjs` — the only sanctioned writer into a governance yaml
- `lib/extensions/governance-values.mjs` — the only sanctioned scalar/argv validators
- `skills/validate/checks/validate.check-14-gate-executability.md` — the pattern every migrated check body must follow
- `lib/domains/merge-gates.mjs`, `lib/domains/merge-reviewers.mjs` — merge machinery, moved to scaffold/materialize time
- `lib/source-manifest.mjs:169-204` — `{sha, files, computedAt}` shape backing the staleness comparator
- `.context-index/adrs/` — ADR-0009 (event variants), ADR-0010 (surface roles), ADR-0011 (source manifest)

---

## Context Packets

### Task 1 Context
- Spec: `explicit-governance-registries.spec.md` (ADDED lines 99-109; Behaviors 4 and 11; Error Cases; ACs)
- Review: `explicit-governance-registries.review.md` (SA-1, SA-2, CON-1, and the operator-override blockquote)
- Cross-cutting: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (Canonical Event Variants table)
- Source files: `lib/lifecycle-state.mjs` (`reportValidator`, `normaliseEventInPlace`), `lib/cli/report.mjs` (`options` block), `lib/source-manifest.mjs` (signatures only)
- ADR: `.context-index/adrs/` — ADR-0009 (decision + rationale only), ADR-0011 (stamp shape)

### Task 2 Context
- Spec: Migration Step 1; Behavior 10; Integration Point 4
- Source files: `lib/gates/doctor.mjs:780-830, 1147-1172` (full), `lib/domains/merge-gates.mjs` (full — it is 90 lines), `lib/cli/domain.mjs:270-300`
- Config: `.context-index/governance/gates.yaml`, `templates/domains/software/gates.yaml`

### Task 3 Context
- Spec: AC "`adev gate doctor` and `/adev:validate` Check 1 operate on the same gate set"
- Source files: `lib/gates/doctor.mjs` (`loadGates` signature), `lib/cli/domain.mjs::load-gates` output shape
- Test helpers: `tests/helpers.mjs` (`createTempDir`, `writeFixture`, `runHook`)

### Task 4 Context
- Spec: Behavior 4 + Substrate note; Changes Catalog MODIFIED (as amended by Task 1)
- Source files: `lib/lifecycle-state.mjs:851-890` (full), `lib/lifecycle-events.mjs:36-79` (`CANONICAL_EVENTS`), `lib/diagnostics/event-schemas.mjs:25-45` ("closed discriminator, open per-type fields")
- Sample: `.context-index/samples/` — nearest emitter pattern (`reportReviewer`'s optional `revision` field, same file)

### Task 5 Context
- Source files: `lib/cli/report.mjs` (full), `lib/cli/gate.mjs:1-60` (verb-module shape: `export async function run({projectRoot, argv})`)
- Spec: Behavior 4
- Constitution: "CLI uses `process.exit(1)` for fatal errors"

### Task 6 Context
- Spec: Behavior 4; review finding SEC-2 (attestation)
- Source files: `skills/validate/SKILL.md:96-200, 390-400` (Check 1 + Per-Check Event Emission), `skills/validate/checks/validate.check-14-gate-executability.md` (pattern)
- Constitution: Anti-Patterns — no inline Node in SKILL.md; skills name a CLI verb

### Task 7 Context
- Spec: Behavior 4 (as amended); Error Cases; AC on `stale-gate-record`
- Source files: `lib/source-manifest.mjs:169-204` (`extractManifestFromFrontmatter`), `lib/lifecycle-state.mjs` (`filterEvents` signature), `.context-index/governance/gates.yaml`
- Cross-cutting: ADR-0010 decision-flow step 1 (workflow preconditions route to `requireGate`, not here)

### Task 8 Context
- Spec: Behaviors 1, 2, 3, 12; Error Cases `INVALID_BOUNDARY_PATTERN`, `BOUNDARY_PATTERN_TIMEOUT`; review findings SEC-3, SEC-5, SEC-6
- Source files: `lib/governance/quality-gate.mjs` (spawn/env pattern), `lib/extensions/governance-values.mjs` (signatures only)
- Constitution: "Minimize external dependencies" — `RegExp` + `node:worker_threads` only

### Task 9 Context
- Spec: Behaviors 6, 7; Migration Step 5; ADDED `materialized_at` (writers, write-once, installer-immutable); Error Case `MATERIALIZE_WOULD_DROP`; review findings SA-5 (sibling-root-key preservation) and SEC-7 (symlink containment)
- Source files: `lib/extensions/governance-splice.mjs` (full — it is the writer), `lib/domains/merge-gates.mjs`, `lib/domains/merge-reviewers.mjs`, `lib/cli/domain.mjs:270-300`, `lib/extensions/governance-registry.mjs` (`WRITABLE_REGISTRIES`, read-only)

### Task 10 Context
- Spec: Behaviors 8, 11; Migration Step 5's fail-closed argument (why emptiness is the wrong predicate)
- Source files: `lib/governance/review-config.mjs:40-140` (full), `lib/cli/domain.mjs:270-300`, `lib/diagnostics/index.mjs:20-30, 280-295` (confirm whether any guard is warranted)

### Task 11 Context
- Spec: REMOVED (implicit bundled-reviewer injection; run-time domain merging); Invariant 2
- Source files: `lib/governance/review-config.mjs` (full), `lib/cli/domain.mjs` (full), `lib/diagnostics/index.mjs`
- Depends on Task 10's byte-identity test as the safety net

### Task 12 Context
- Spec: Migration Step 5 ("Extension install is subject to the same gate"); Error Case row
- Source files: `lib/extensions/content-install.mjs` (`mergeGovernanceEntries`, `assertOpenNamespacesResolvable`), `lib/extensions/governance-registry.mjs`
- Tests to keep green: `tests/lib/extensions/example-validation-check-install.test.mjs` (targets `validate.yaml`, which Task 1 exempts)

### Task 13 Context
- Spec: Behavior 5; Invariant 5; Error Case `DISABLED_WITHOUT_REASON`
- Source files: `lib/governance/validate-config.mjs:186-250` (**read `:191`, `:196`, `:244` first — `enabled` is already honoured here**), `lib/governance/review-config.mjs:312-400`, `lib/diagnostics/index.mjs`
- Note: `FIELD_ALLOWLIST` already permits both fields; the gap is `disabled_reason` plus review/diagnostics parity

### Task 14 Context
- Spec: Migration Step 4; AC on boundary fixtures
- Reference: `CLAUDE.md` Anti-Patterns section (the source rules), `hooks/pre-commit-no-inline-node.sh` (the bespoke hook a rule replaces), `tests/skills-no-inline-node.test.mjs`

### Task 15 Context
- Spec: Migration Step 4 (`transitions`); Error Case "transitions names a gate id absent from gates" (hygiene Pass 8, preserved)
- Source files: `.context-index/governance/gates.yaml`, `skills/hygiene/SKILL.md` (Pass 8)

### Task 16 Context
- Spec: ADDED `source:` vocabulary extension; review findings SA-4 / CON-3
- Source files: `lib/governance/review-config.mjs:107, 315, 326, 328` (the four `__source` values), `lib/extensions/governance-registry.mjs::INSTALLER_OWNED`

### Task 17 Context
- Spec: Migration Step 6; Behavior 9; review finding SEC-4
- Source files: `skills/hygiene/SKILL.md:919-968` (Audit Pass 19, full), `lib/domains/domain-config.mjs` (`loadDomainConfig` signature)

### Task 18 Context
- Spec: Migration Step 2 (incl. its risk note — pin SKIP, never PASS-preservation); Behaviors 1, 3; Invariant 6
- Source files: `skills/validate/checks/validate.check-14-gate-executability.md` (the pattern to copy), `skills/validate/checks/validate.check-8-boundaries.md`, `.../validate.check-9-transition-gates.md`, `.context-index/governance/validate.yaml:44-62`
- Docs: `docs/cli-reference.md` (verb-signature table), `docs/governance.md`
- Constitution: Anti-Patterns — no inline Node, no executable logic in SKILL.md, no fenced-JavaScript directive

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (`message.usage` fields). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions. These overstate savings by 2-2.5x vs real measurements.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Anti-pattern:** Focus on reducing input token counts. Input is <1% of cost.

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation.
- **Anti-pattern:** Assume shorter output means lower artifact quality.

> **Relevance to this plan:** Tasks 8, 15 and 17 all reduce subagent dispatch (Checks 8 and 9
> stop being LLM calls). Measure the before/after with session JSONL, not estimates.

---

## Design Decisions of Record

Made autonomously under `AUTO: true`. Each records the option chosen, the alternatives, and why
the conservative reading was taken. A human should audit these before Task 1 is committed, since
Task 1 writes several of them into the spec as normative text.

**DDR-1 — SA-2 bounding: exempt `validate.yaml` and `boundaries.yaml` from `materialized_at`.**
The reviewer offered two remedies: exempt the two registries, or add a Step-5 sub-step that stamps
them and amend the reference-extension AC to materialize first. **Chose exempt.** It is the
smaller change, it matches the spec's own Target State table (both files are listed "unchanged"),
and it keeps two shipped behaviours working untouched — the reference-extension install test
(`tests/lib/extensions/example-validation-check-install.test.mjs:49`, whose target is
`validate.yaml`) and Behavior 1's SKIP path over the empty `boundaries.yaml` now on disk. The
alternative would have required a migration for every existing project's `validate.yaml` in
exchange for no new guarantee: both files are *already* explicit single-source, so the marker
would discriminate nothing. Recorded in the spec by Task 1 as an explicit three-registry set,
not as prose.

**DDR-2 — CON-1 comparator: event `ts` vs source-manifest `computed-at`, plus `manifest_sha`
equality.** The reviewer offered "compare against `computed-at`" or "add the SHA to the record and
compare for equality." **Chose both, with `ts` as the primary.** Every lifecycle event is already
stamped ISO-8601 by `normaliseEventInPlace` (`lib/lifecycle-state.mjs:218-220`), so the ordered
field exists with no schema change — that alone makes the comparator implementable. Adding
`manifest_sha` on top costs one payload field and closes the case where a manifest is re-stamped
without its `computed-at` moving (same second). Freshness therefore requires `ts >= computed-at`
**and**, when `manifest_sha` is present, `manifest_sha === current sha`. An absent `manifest_sha`
(records written before this lands) falls back to the `ts` rule alone rather than failing —
fail-soft on **history**, not on **verdicts**, because a hard failure here would break every
in-flight spec on upgrade.

**DDR-3 — SEC-2 (fabricated gate outcomes) PARTIALLY addressed; the residue is filed, not hidden.**
SEC-2 is the direct security consequence of the SA-1 writer this plan adds: `adev report --type
validator` is an open verb with a caller-supplied payload, so nothing binds a recorded
`verdict: pass` to an actual gate execution.

**What Tasks 6 and 7 do close:** (a) `gate_outcomes` is written only by Check 1 from its own
execution results — stated normatively in the SKILL; (b) an outcome naming a gate absent from the
resolved `gates.yaml` set records SKIP `unattested-gate-record`, never a pass; (c) each outcome
carries `command_sha` — SHA-256 of the gate's resolved argv — stamped by Check 1, and Task 7
recomputes it from `gates.yaml` and refuses on mismatch. That catches a stale or drifted record and
a copy-pasted outcome from a different gate definition.

**What it does NOT close, stated plainly:** `command_sha` is derivable from a file the forger can
read, so a deliberate forger can compute it. Closing forgery outright needs an attestation the
caller cannot produce — a per-run nonce minted by the executor and checked against execution state,
or a keyed MAC — which is a new mechanism, not a rule inside existing work, and touches the event
substrate this spec deliberately does not extend beyond a payload field. **Task 7 files a follow-up
issue for it via `/adev:issues`.** The earlier claim that deferring "would mean shipping a known
bypass" was itself too strong: the bypass exists either way; this plan narrows it and records the
remainder rather than asserting a closure it does not deliver.

**DDR-4 — warning debt: SA-4/CON-3 addressed (Task 16).** The `source:` enum is load-bearing for
Step 6: the drift pass excludes non-`project` entries, so an undefined mapping for the shipped
`project-override` value means undefined drift behaviour. **Address.** Mapping chosen —
`bundled` → `bundled`, `project` → `project`, `project-override` → `project` (a project entry that
overrides a bundled one is authored by the project and must remain visible to drift),
`manifest-specialist` → `project`, domain-sourced → `domain:<slug>`, installer-stamped →
`extension:<name>` (already shipped, untouched).

**DDR-5 — warning debt: SEC-3 (1 MB fail-open cap) addressed (Task 8).** As specified, an
oversized file silently skips every boundary rule, so padding a file past 1 MB disables a merge
gate. **Address**, in the minimal form the reviewer named: apply the cap with `statSync().size`
before reading, and record the skip as a finding **at the rule's own severity**, naming file and
rule, so oversize is a visible WARN/FAIL rather than silence. No spec amendment is needed —
Behavior 12's "record SKIP" becomes "record a finding at rule severity", which Task 1 writes in
as a one-clause edit.

**DDR-6 — warning debt: SEC-4 partially addressed (Task 17), remainder deferred with an issue.**
The full remedy wants a diff against an install ledger ("execution-bearing fields that *appeared or
changed* since the last install ledger entry"). No such ledger exists today, and building one is a
separate contract. **Addressed now:** the Pass 19 exclusion narrows to *unadopted-upgrade* findings
only, and a new sub-finding lists every non-`project` entry carrying an execution-bearing field
(`command`, `runner`, `prompt`, `pattern`) — so an extension-appended `command` is visible, which
today it is not. **Deferred:** the ledger-based *changed-since* diff and the install-time summary
line. Task 17 files a follow-up issue rather than leaving it unrecorded.

**DDR-7 — SA-5 (sibling-key preservation on materialize) folded into Task 10.** Materialize runs
*after* Task 15 writes `transitions:` into `gates.yaml`; the extension path got an explicit
sibling-key guarantee and materialize did not. Task 10 writes through
`spliceRegistryEntries` — which preserves every byte outside the target key by construction — and
pins it with a test that materializes `gates` and asserts a populated `transitions:` block is
byte-identical afterwards.

**DDR-8 — SA-6 / CON-7 (duplicated collision rule) and CON-5 (verb naming).** The duplicated
id-collision statement sits in behaviors that revision 4 renumbered; folding them is a spec-text
edit with no code consequence, so Task 1 folds them. CON-5 asked for `adev gate transitions`
rather than the three-token `adev gate transitions check`, since the CLI has no three-token
precedent. **Adopted:** the verb is `adev gate transitions`, a sub-verb of `gate` alongside
`require` and `doctor`, matching `lib/cli/gate.mjs`'s existing dispatch on `argv[0]`. Task 1
updates the spec's ADDED row.

**DDR-9 — CON-6 (baseline accuracy) adopted.** Task 1 corrects the Current State `gates.yaml` row
to "`test` only; `lint`, `typecheck`, `integration-test` commented out." Step 5's safety argument
rests on a byte-identical before/after equality test, so an inexact stated baseline is not
cosmetic.

**DDR-10 — the string-command `test` gate is in scope (Task 2).** See the in-scope section above.
Conservative reading: converting `"npm test"` → `["npm","test"]` *adds* a gate to the executed set
that the project always believed was running. That is a behaviour change, so it is landed with the
divergence finding in the same task and with `npm test` as its own gate command — no new command,
just the argv form of the one already declared.

**DDR-11 — boundary rules land at `severity: warning` (Task 14).** The spec's own Step 4 risk note
requires it ("promote to `error` after one clean cycle"). Promotion is deliberately **not** a task
in this plan; it is a follow-up after one clean cycle, filed as an issue by Task 14.

**DDR-12 — no `CANONICAL_EVENTS` variant is added.** `gate_outcomes`, `manifest_sha` and the
per-outcome `command_sha` are payload fields on the existing `validator_report` variant.
`lib/diagnostics/event-schemas.mjs:36-39` states the posture — closed discriminator, open per-type
fields — and Task 4 adds the test pinning the variant list, so the ADR-0009
`[BOUNDARY: human-approved]` line stays uncrossed. No human approval is requested by this plan.

**DDR-13 — `domain-extensions` joins `affects:` rather than Task 12 being mislabelled.** Task 12
modifies `lib/extensions/content-install.mjs`, which is domain-extensions territory and appears in
neither the spec's `affects:` nor its Module Impact Map. Retagging the task under `validation`
would have been the smaller edit but would misstate what the work touches. **Chosen:** Task 1 adds
`domain-extensions` to `affects:` and a Module Impact Map row ("Low — install refuses into an
unmarked registry"). This is a widening of a spec contract and is flagged here for that reason.

**DDR-14 — SEC-6 (aggregate evaluation ceiling) deferred, with the cheap half taken.** SEC-6 wants
an aggregate wall-clock budget, a changed-file ceiling and a binary-content skip on top of the
per-file 250 ms budget. **Taken now (Task 8):** the binary-content skip, because scanning binary
blobs with text regexes produces noise rather than findings and costs one `Buffer.includes(0)`
check. **Deferred:** the aggregate wall-clock budget and changed-file ceiling — both need a
policy knob (where does the ceiling live? what happens to unevaluated rules?) that the spec does
not define, and inventing one here would be a contract decision made by a planner. Task 8 files
the follow-up issue.

**DDR-15 — SEC-7 (symlink containment) adopted in the narrow form.** Any write path this plan adds
(`adev governance materialize`) resolves its target, then — when the target exists —
`realpathSync`es it and re-asserts containment, because `resolve()` + `startsWith(dir + '/')` does
not resolve symlinks and `writeFileSync` follows them. The registry set is enumerated explicitly
from `WRITABLE_REGISTRIES` rather than left implicit. Folded into Task 9, not a separate task.

**DDR-16 — CON-4 (Dependencies vs REMOVED naming mismatch) corrected in Task 1.** The spec's
Dependencies section cites `lib/domains/merge-reviewers.mjs` as "the overlay machinery this spec
makes explicit", while REMOVED targets the *private* `mergeReviewers` inside
`lib/governance/review-config.mjs:312`. Both confirmed to exist as separate functions with
different consumers (`lib/cli/domain.mjs:53` for the former). Task 1 names each precisely, since
Task 11 must remove one and retain the other.

---

## Parallelization

- **Group A (sequential, spec text first):** Task 1 → (nothing else may quote spec text until it lands)
- **Group B (sequential, gate substrate):** Task 4 → Task 5 → Task 6 → Task 7
- **Group C (sequential, boundary substrate):** Task 8 → Task 14
- **Group D (sequential, doctor parity):** Task 2 → Task 3
- **Group E (sequential, materialization):** Task 9 → Task 10 → Task 11 → Task 12
- **Group F (sequential, tail):** Task 13; Task 16 → Task 17 → Task 18
- **Task 15** depends on Task 7 (Group B) and Task 9 (Group E); it runs after both.

Groups B, C and D touch disjoint files and can run concurrently once Task 1 lands.

**Group E must not start before Group C and Group D complete.** Two reasons, each previously
mis-stated: Task 9's fixtures call `checkBoundaries`, which Group C's Task 8 creates; and Task 11
edits `tests/gates/doctor-consumer-parity.test.mjs`, which **Group D** (Tasks 2-3) owns — the
earlier text named Group B, which is wrong.

**Task 18 is last and is not optional.** It completes Migration Step 2 (the check bodies and the
`kind` flip) and needs Tasks 7 and 8's verbs to exist. Group F's Task 17 runs before it because
Pass 19 audits registry content, not check bodies.

**Dependency edges** (`→` means "must complete before"). Distinct from scheduling order:

    1 → {2, 4, 8, 13}      2 → 3      4 → 5 → 6 → 7      8 → {9, 14}
    9 → {10, 15}           10 → {11, 12}      {3, 10} → 11      11 → 16 → 17
    {7, 9} → 15            {7, 8} → 18

Acyclic. Note **Task 18 depends only on 7 and 8** — it is *scheduled* last (after 17) because it is
the user-visible cutover and benefits from landing once everything else is stable, but 17 is not its
prerequisite. An earlier draft wrote the chain as `11 → 16 → 17 → 18`, which asserted a dependency
that does not exist and contradicted Task 18's own `Depends on: 7, 8`.

Sequencing note: Migration Step 3 of the spec (land the extension-merge hardening first) is
**already satisfied** — `extension-governance-merge-hardening.spec.md` is `validated` and its code
is in this worktree. No task implements it.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Close SA-1 / SA-2 / CON-1 in the spec text | medium | unit | — | 1 create, 2 modify |
| 2 | Doctor divergence finding + argv `test` gate | medium | unit | 1 | 1 create, 3 modify |
| 3 | Doctor gate-set divergence is reported | small | unit | 2 | 0 create, 1 modify |
| 4 | `reportValidator` carries `gate_outcomes` + `manifest_sha` | medium | unit | 1 | 1 create, 1 modify |
| 5 | `adev report --gate-outcomes` writer flag | medium | unit | 4 | 1 create, 1 modify |
| 6 | Check 1 emits per-gate outcomes (sole attested writer) | medium | unit | 5 | 1 create, 3 modify |
| 7 | `lib/governance/transitions.mjs` + `adev gate transitions` | large | unit | 6 | 2 create, 1 modify |
| 8 | Boundary evaluator + worker + `adev boundaries check` | large | unit | 1 | 5 create, 1 modify |
| 9 | `adev governance materialize` (producer first) | large | unit | 1, 8 | 5 create, 4 modify |
| 10 | `materialized_at` fail-closed loader guard | medium | unit | 9 | 1 create, 3 modify |
| 11 | Remove run-time overlays | medium | unit | 3, 10 | 0 create, 4 modify |
| 12 | Install + init marker rules | medium | unit | 10 | 1 create, 5 modify |
| 13 | `disabled_reason` + disabled-entry parity across loaders | medium | unit | 1 | 1 create, 3 modify |
| 14 | Populate `boundaries.yaml` from the constitution | medium | unit | 8 | 2 create, 1 modify |
| 15 | Populate `transitions:` in `gates.yaml` | small | unit | 7, 9 | 1 create, 1 modify |
| 16 | `source:` vocabulary mapping | small | unit | 11 | 1 create, 2 modify |
| 17 | Hygiene Audit Pass 19 widened + two sub-audits | large | unit | 16 | 1 create, 1 modify |
| 18 | Migrate Check 8/9 bodies, flip `kind`, update docs | medium | unit | 7, 8 | 0 create, 6 modify |

**Producer-before-guard ordering (Tasks 9 and 10 are deliberately in this order).** An earlier
draft landed the fail-closed guard first and accepted a red tree until the producer arrived. That
violates spec Invariant 1 ("all existing tests pass at every step") and would halt
`/adev:implement` at its post-task gate. Materialize therefore ships **first** — it needs no
guard — and marks this repo's three registries in the same commit; only then does the guard land,
against a tree where every registry is already marked. **Every task in this plan leaves
`npm test` green at its own commit.**

All eighteen tasks resolve to `strategy: unit` (source: fallback — the manifest declares no
`test_strategies`, and every task's files sit under `lib/`, `cli/`, `skills/` or `.context-index/`,
none of which the detector maps to a non-unit strategy). The **Strategy Summary** section is
therefore omitted, and no **Test Infrastructure Requirements** section is emitted: the spec
declares no `infra_requirements:`, and `node:test` needs no external system.

Granularity resolves to **per-behavior** (source: fallback — no `test_policy.granularity` in
`manifest.yaml`, none in `templates/domains/software/test-config.yaml`). Tasks implementing the
same spec behavior therefore share one suite and read "extend" rather than "create".

`.context-index/manifest.yaml` declares `specialists: []`, so every task is tagged
`[specialist: none]`. No secondary matches exist to note.

---

## Tasks

### Task 1: Close SA-1 / SA-2 / CON-1 in the spec text [specialist: none]

**Charter capability:** validation — lifecycle artifact correctness
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/specs/explicit-governance-registries-contract.test.mjs`
- Modify: `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md`
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (Canonical Event Variants table)

**Tests:** `tests/specs/explicit-governance-registries-contract.test.mjs` — create.

**Context to load:** the spec's ADDED / Behaviors 4 and 11 / Error Cases / ACs; the review's SA-1,
SA-2, CON-1 entries and the operator-override blockquote; `lifecycle-event-log.spec.md`'s variants
table (note the `revision` precedent from `review-block-auto-retry`).

**Commit-trailer rule for every task in this plan.** CLAUDE.md requires a `Spec:` trailer on
spec-tracked commits and a `Plan-task:` trailer when implementing a plan task. Every commit block
below carries both; do not drop them.

**Edits, exhaustively** (each closes a named blocker or an adopted DDR):

1. **SA-1** — Changes Catalog MODIFIED gains two rows naming the writers:
   `lib/cli/report.mjs` (new `--gate-outcomes` flag carrying the array) and
   `lib/lifecycle-state.mjs::reportValidator` (payload construction for `gate_outcomes` and
   `manifest_sha`). Add `agent-reliable-state-artifacts` to `affects:`. Record the two optional
   fields in `lifecycle-event-log.spec.md`'s Canonical Event Variants table under
   `validator_report`, attributed to this spec — the same mechanism the table already uses for
   `revision`.
2. **SA-2** — bound the marker (DDR-1). In ADDED, Behavior 11 and **both**
   `REGISTRY_NOT_MATERIALIZED` Error Case rows, replace "each governance yaml" / "every registry"
   with the explicit set **`review.yaml`, `diagnostics.yaml`, `gates.yaml`**, and state that
   `validate.yaml` and `boundaries.yaml` are exempt because they are already explicit
   single-source (Target State lists both "unchanged"). Amend **both** affected ACs, by name:
   the "every registry" AC, and the `/adev:init` AC at spec line 318 ("carries `materialized_at`
   on every registry") — the latter becomes "on every **marked** registry".
3. **CON-1** — replace the staleness clause in Behavior 4 and its AC (DDR-2): an outcome is fresh
   iff the `validator_report` event's own `ts` is at or after the spec's source-manifest
   `computed-at`, **and** — when the payload carries `manifest_sha` — that value equals the spec's
   current `sha`. Otherwise SKIP with `stale-gate-record`. Delete the "at or after the ... SHA"
   phrasing everywhere it appears.
4. **DDR-3** — add the attestation rule to Behavior 4, and **declare the per-gate outcome record's
   full shape** as `{ id, verdict, tier, command_sha? }` (the earlier `{id, verdict, tier}` triple
   is superseded; `command_sha` is SHA-256 of the gate's resolved argv). `gate_outcomes` is written
   only by Check 1 from its own execution results. An outcome whose gate id is absent from the
   resolved `gates.yaml` set records SKIP `unattested-gate-record`, never a pass; so does one whose
   `command_sha` is present and does not match. A **missing** `command_sha` is not an error — it
   means a pre-upgrade record, and the gate-id membership check alone applies (same fail-soft
   posture DDR-2 gives `manifest_sha`). Add an AC for the mismatch case and one for the
   missing-field case.
5. **DDR-5** — Behavior 12's oversize clause: "records SKIP" → "records a finding at the rule's own
   severity, naming file and rule". Add an AC.
6. **DDR-8** — rename the ADDED verb row `adev gate transitions check` → `adev gate transitions`;
   fold the duplicated id-collision statement into a single behavior.
7. **DDR-9** — correct the Current State `gates.yaml` row to "`test` only; `lint`, `typecheck`,
   `integration-test` commented out."
8. Record the warning-debt dispositions (DDR-4, DDR-6, DDR-14, DDR-15) in the spec so the next
   reviewer sees them decided rather than ignored.
9. **DDR-13** — add `domain-extensions` to `affects:` and a Module Impact Map row
   ("Low — install refuses into a registry lacking `materialized_at`"), so Task 12's edits to
   `lib/extensions/content-install.mjs` sit inside a declared surface.
10. **DDR-16 / CON-4** — disambiguate the two merge functions: Dependencies cites
    `lib/domains/merge-reviewers.mjs` (consumer: `lib/cli/domain.mjs:53`), while REMOVED targets the
    private `mergeReviewers` in `lib/governance/review-config.mjs:312`. Name each precisely; Task 11
    removes the latter and retains the former.
11. Move `skills/validate/checks/validate.check-1-quality-gates.md` from MODIFIED to **ADDED** — the
    file does not exist today, so listing it as modified misdescribes Task 6.

- [ ] **Write failing test**

```javascript
// tests/specs/explicit-governance-registries-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SPEC = ".context-index/specs/cross-cutting/explicit-governance-registries.spec.md";

test("SA-1: Changes Catalog names both writers of the per-gate outcome array", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.match(spec, /lib\/cli\/report\.mjs/);
  assert.match(spec, /reportValidator/);
});

test("SA-2: the materialized_at registry set is bounded, not universal", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.doesNotMatch(spec, /each governance yaml|every registry/i);
  assert.match(spec, /review\.yaml.*diagnostics\.yaml.*gates\.yaml/s);
});

test("CON-1: staleness compares timestamps, never a SHA ordering", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.doesNotMatch(spec, /at or after the source-manifest SHA/i);
  assert.match(spec, /computed-at/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/explicit-governance-registries-contract.test.mjs`
Expected: FAIL — all three assertions fail against revision 4.

- [ ] **Implement** — apply edits 1-11 above via `/adev:specify --revise`, bumping `revision` to 5.

- [ ] **Verify test passes**

Run: `node --test tests/specs/explicit-governance-registries-contract.test.mjs` → PASS,
then `npm test` → 0 failures.

- [ ] **Commit**

Branch (already created): `adev/governance-checks-unbundle`

```bash
git add .context-index/specs/cross-cutting/explicit-governance-registries.spec.md \
        .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md \
        tests/specs/explicit-governance-registries-contract.test.mjs
git commit -m "docs(validation): close SA-1, SA-2 and CON-1 in explicit-governance-registries spec" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 1"
```

---

### Task 2: Doctor divergence finding + argv `test` gate [specialist: none]

**Charter capability:** unified-gates — gate diagnosis
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/gates/doctor-consumer-parity.test.mjs`
- Modify: `lib/gates/doctor.mjs:1147-1172` (and the finding table around `:797-810`)
- Modify: `.context-index/governance/gates.yaml` (the `test` gate's `command`)
- Modify: `templates/domains/software/gates.yaml` (keep starter and project shapes aligned)

**Tests:** `tests/gates/doctor-consumer-parity.test.mjs` — create (Behavior 10; shared with Tasks 3
and 11, which extend it).

**Context to load:** Migration Step 1; Behavior 10; Integration Point 4;
`lib/domains/merge-gates.mjs::validateGate` (the argv rule that silently drops the gate).

Two findings and one config fix:
- `gate-doctor/gate-set-divergence` (**warning**) — raised when the raw `gates.yaml` set differs
  from the domain-merged set, naming each id present in one and not the other. This is the
  interim measure Migration Step 1 asks for; Task 11 makes it structurally impossible, and the
  finding then reports nothing rather than being deleted.
- `gate-doctor/shell-form-command` (**error**) — raised for a gate whose `command` is a string
  rather than an argv list, because `merge-gates.mjs:34-40` drops it. Today the doctor happily
  analyses `test` while every consumer skips it.
- `.context-index/governance/gates.yaml`: `command: "npm test"` → `command: ["npm", "test"]`
  (DDR-10 — the argv form of the command already declared, not a new command).

- [ ] **Write failing test**

```javascript
test("doctor reports divergence between raw and merged gate sets", async () => {
  const dir = await createTempDir();
  writeFixture(dir, ".context-index/governance/gates.yaml",
    'gates:\n  - id: proj-only\n    command: ["npm","test"]\n');
  const report = await runDoctor(dir, { domainGates: [{ id: "domain-only", command: ["npm","run","x"] }] });
  const ids = report.findings.map(f => f.id);
  assert.ok(ids.includes("gate-doctor/gate-set-divergence"));
});

test("doctor flags a shell-form command its consumers drop", async () => {
  const dir = await createTempDir();
  writeFixture(dir, ".context-index/governance/gates.yaml",
    'gates:\n  - id: test\n    command: "npm test"\n');
  const report = await runDoctor(dir, {});
  const f = report.findings.find(x => x.id === "gate-doctor/shell-form-command");
  assert.equal(f.severity, "error");
  assert.equal(f.gate, "test");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/gates/doctor-consumer-parity.test.mjs`
Expected: FAIL — neither finding id exists.

- [ ] **Implement** — add both findings in `loadGates`'s caller; convert the project gate to argv.

- [ ] **Verify test passes**

Run: `node --test tests/gates/doctor-consumer-parity.test.mjs` → PASS.
Then confirm the reproduction is gone: `adev domain load-gates --module cross-cutting` emits
**no** `INVALID_GATE` warning and the merged set now contains `test`.

- [ ] **Commit**

```bash
git add lib/gates/doctor.mjs .context-index/governance/gates.yaml \
        templates/domains/software/gates.yaml tests/gates/doctor-consumer-parity.test.mjs
git commit -m "fix(unified-gates): report gate-set divergence and shell-form gate commands" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 2"
```

---

### Task 3: Doctor gate-set divergence is reported, with named loaders [specialist: none]

**Charter capability:** unified-gates — gate diagnosis
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `tests/gates/doctor-consumer-parity.test.mjs` (extend)

**Tests:** `tests/gates/doctor-consumer-parity.test.mjs` — **extend** (same behavior, Behavior 10,
per-behavior granularity).

**Scope correction.** An earlier draft had this task write the *equality* assertion, expect it to
fail, and then leave it failing until Task 11 — a RED test that its own task never turns GREEN,
which stalls `/adev:implement`. The equality assertion now lives wholly in **Task 11**, the task
that actually delivers it. Task 3 does two things that can both go green here:

1. Extracts the two gate-set loaders behind named, test-visible helpers (`loadDoctorGates`,
   `loadCheck1Gates`) so Task 11 has a seam to assert against rather than inventing one.
2. Asserts the *divergence-is-reported* property precisely: when the two loaders disagree, the
   doctor emits `gate-doctor/gate-set-divergence` naming every id in the symmetric difference.

- [ ] **Write failing test**

```javascript
test("the two gate-set loaders are separately addressable", async () => {
  const dir = await createTempDir();
  writeFixture(dir, ".context-index/governance/gates.yaml",
    'gates:\n  - id: test\n    command: ["npm","test"]\n');
  assert.equal(typeof loadDoctorGates, "function");
  assert.equal(typeof loadCheck1Gates, "function");
  assert.ok((await loadDoctorGates(dir)).some(g => g.id === "test"));
});

test("divergence names every id in the symmetric difference", async () => {
  const dir = await seedDivergentGates();   // project-only + domain-only
  const f = (await runDoctor(dir, {})).findings
    .find(x => x.id === "gate-doctor/gate-set-divergence");
  assert.match(f.message, /proj-only/);
  assert.match(f.message, /domain-only/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/gates/doctor-consumer-parity.test.mjs`
Expected: FAIL — the loaders are not exported, and the divergence message lists only one side.

- [ ] **Implement** — extract and export the two loaders; complete the symmetric-difference message.

- [ ] **Verify test passes**

Run: `node --test tests/gates/doctor-consumer-parity.test.mjs` → PASS. No skipped tests, no
`adev test-debt` entry, no assertion deferred to a later task.

- [ ] **Commit**

```bash
git add lib/gates/doctor.mjs tests/gates/doctor-consumer-parity.test.mjs
git commit -m "test(unified-gates): name the two gate-set loaders and pin divergence reporting" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 3"
```

---

### Task 4: `reportValidator` carries `gate_outcomes` + `manifest_sha` [specialist: none]

**Charter capability:** validation — lifecycle event emission (**closes SA-1, writer half**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/lifecycle/gate-outcomes.test.mjs`
- Modify: `lib/lifecycle-state.mjs:866-890` (`reportValidator`)

**Tests:** `tests/lifecycle/gate-outcomes.test.mjs` — create (Behavior 4).

**Context to load:** `reportValidator` in full; `normaliseEventInPlace:208-221` (the `ts` stamp
DDR-2 relies on); `lib/lifecycle-events.mjs::CANONICAL_EVENTS`;
`lib/diagnostics/event-schemas.mjs:36-39` ("closed discriminator, open per-type fields").

Add two optional args to the destructure and two optional payload fields:

- `gate_outcomes` — array of
  `{ id: string, verdict: "pass"|"fail"|"skip", tier: string, command_sha?: string }`.
  Validated shape-wise: array, each element an object, `id` a non-empty string, `verdict` in the
  closed set, `tier` a non-empty string, and `command_sha` — when present — a non-empty string.
  **`command_sha` is optional but accepted**: Check 1 (Task 6) always emits it, and Task 7's
  attestation rule reads it. An unknown *key* throws `EVENT_SCHEMA_INVALID` with the offending
  index — consistent with the module's `mkErr` posture and with `revision`'s validation two
  functions above — so the accepted key set must be stated exactly, not inferred.
- `manifest_sha` — optional string; the spec's source-manifest `sha` at emission time.

**Upgrade path for both optional fields (mirrors DDR-2's fail-soft rule).** Records written before
this lands carry neither field. A missing `manifest_sha` falls back to the `ts >= computed-at`
comparison alone; a missing `command_sha` skips the command-hash comparison and relies on the
gate-id membership check alone. Neither absence is an error, and neither turns an otherwise-fresh
outcome into a pass it did not earn — the remaining checks still apply. Fail-soft on **history**,
never on **verdicts**.

No new `CANONICAL_EVENTS` variant (DDR-12). Add the pinning test here rather than later, so the
ADR-0009 boundary is guarded by the same commit that gets close to it.

- [ ] **Write failing test**

```javascript
test("reportValidator carries a per-gate outcome array into the payload", () => {
  const { dir, spec } = seedSpec();
  const outcome = { id: "test", verdict: "pass", tier: "fast", command_sha: "9f2b1c…" };
  reportValidator(dir, spec, {
    step: "validate", validator: "validate.check-1-quality-gates", verdict: "PASS",
    gate_outcomes: [outcome],
    manifest_sha: "abc1234",
  });
  const ev = lastEvent(dir, spec);
  assert.deepEqual(ev.gate_outcomes, [outcome]);   // command_sha survives, it is not stripped
  assert.equal(ev.manifest_sha, "abc1234");
  assert.ok(Date.parse(ev.ts) > 0, "event carries its own ordered timestamp");
});

test("an outcome without command_sha is accepted (pre-upgrade records)", () => {
  const { dir, spec } = seedSpec();
  assert.doesNotThrow(() => reportValidator(dir, spec, {
    step: "validate", validator: "x", verdict: "PASS",
    gate_outcomes: [{ id: "test", verdict: "pass", tier: "fast" }],
  }));
});

test("malformed gate_outcomes are refused, not silently dropped", () => {
  const { dir, spec } = seedSpec();
  assert.throws(() => reportValidator(dir, spec, {
    step: "validate", validator: "x", verdict: "PASS",
    gate_outcomes: [{ id: "test", verdict: "maybe", tier: "fast" }],
  }), /EVENT_SCHEMA_INVALID/);
});

test("no new CANONICAL_EVENTS variant is introduced", () => {
  assert.deepEqual([...CANONICAL_EVENTS].sort(), EXPECTED_VARIANTS.sort());
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lifecycle/gate-outcomes.test.mjs`
Expected: FAIL — `ev.gate_outcomes` is `undefined` (the destructure drops it).

- [ ] **Implement**

```javascript
const { step, validator, verdict, error, score, duration_ms, notes, domain, pluginRoot,
        gate_outcomes, manifest_sha } = args;
// … existing payload construction …
if (gate_outcomes !== undefined) payload.gate_outcomes = validateGateOutcomes(gate_outcomes);
if (manifest_sha !== undefined) payload.manifest_sha = String(manifest_sha);
```

- [ ] **Verify test passes**

Run: `node --test tests/lifecycle/gate-outcomes.test.mjs` → PASS; `npm test` → 0 failures.

- [ ] **Commit**

```bash
git add lib/lifecycle-state.mjs tests/lifecycle/gate-outcomes.test.mjs
git commit -m "feat(validation): carry per-gate outcomes on the validator_report payload" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 4"
```

---

### Task 5: `adev report --gate-outcomes` writer flag [specialist: none]

**Charter capability:** cli-driver-surface — verb surface (**closes SA-1, CLI half**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `tests/cli/report-gate-outcomes.test.mjs`
- Modify: `lib/cli/report.mjs` (`options` block ~`:96-121`; validator delegation ~`:428-442`; `help()`)

**Tests:** `tests/cli/report-gate-outcomes.test.mjs` — create (Behavior 4, CLI surface).

`--gate-outcomes <json>` accepts either a JSON array literal or `@<path>` to a JSON file (long
gate sets would otherwise hit argv limits). `--manifest-sha <sha>` accompanies it. Both parse and
validate in the verb, then delegate; the verb never constructs the payload itself — that stays in
`reportValidator`, matching the module's existing "the lib stamps severity; we never compute it
here" comment.

- [ ] **Write failing test**

```javascript
test("--gate-outcomes writes the array through to the event", async () => {
  const { dir, spec } = seedSpec();
  const r = await runCli(dir, ["report", "--type", "validator", "--spec", spec,
    "--step", "validate", "--validator", "validate.check-1-quality-gates", "--verdict", "PASS",
    "--manifest-sha", "abc1234",
    "--gate-outcomes",
    '[{"id":"test","verdict":"pass","tier":"fast","command_sha":"9f2b1c"}]']);
  assert.equal(r.code, 0);
  const ev = lastEvent(dir, spec);
  assert.equal(ev.gate_outcomes[0].id, "test");
  assert.equal(ev.gate_outcomes[0].command_sha, "9f2b1c");   // plumbed end to end
});

test("malformed --gate-outcomes JSON exits 1 with a named error", async () => {
  const r = await runCli(dir, [... , "--gate-outcomes", "{not json"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--gate-outcomes/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/report-gate-outcomes.test.mjs`
Expected: FAIL — `parseArgs` rejects the unknown option.

- [ ] **Implement** — add `"gate-outcomes": { type: "string" }` and
      `"manifest-sha": { type: "string" }` to `options`; parse (`@path` → `readFileSync`), and pass
      `args.gate_outcomes` / `args.manifest_sha` into `reportValidator`. Extend `help()`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/report-gate-outcomes.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add lib/cli/report.mjs tests/cli/report-gate-outcomes.test.mjs
git commit -m "feat(cli): add adev report --gate-outcomes for per-gate validator outcomes" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 5"
```

---

### Task 6: Check 1 emits per-gate outcomes as the sole attested writer [specialist: none]

**Charter capability:** validation — quality gates (**closes SA-1, emitter half; DDR-3**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Create: `tests/governance/deterministic-check-migration.test.mjs`
- Create: `skills/validate/checks/validate.check-1-quality-gates.md`
- Modify: `skills/validate/SKILL.md` (Check 1 section ~`:169-201`; Per-Check Event Emission ~`:390-400`)
- Modify: `templates/domains/software/validate.yaml` (registry entry for Check 1)
- Modify: `.context-index/governance/validate.yaml` (**the same entry** — this project's file is its
  own single source and explicitly documents "Check 1 … is NOT represented here", so adding the row
  only to the starter would leave the severity defaulting to `warning` in this very repo)

**Tests:** `tests/governance/deterministic-check-migration.test.mjs` — create (shared with Task 18's
check-body migration; Behavior 4 emitter half + Behaviors 1/3 bodies).

Check 1 gains one instruction: after running the tiered gate set, emit **one**
`adev report --type validator --validator validate.check-1-quality-gates` carrying
`--gate-outcomes` built from its own execution results, and `--manifest-sha` from the spec's
source-manifest stamp. Each outcome is `{ id, verdict, tier, command_sha }`, where `command_sha` is
SHA-256 of the gate's resolved argv (DDR-3 mitigation (c)). The SKILL states normatively that
Check 1 is the **only** sanctioned writer of `gate_outcomes`; Task 7 enforces what it can of that
and files the residue.

Constitutional constraint: no inline Node, no `node -e`, and no fenced-JavaScript directive in the
check body. The body names the verb and maps outcomes, following
`validate.check-14-gate-executability.md`. The new file must not introduce an H3 section carrying
both an inline-Node block and an `adev <verb>` call — `.githooks/pre-commit-no-inline-node` rejects
that, and `tests/skills-no-inline-node.test.mjs` asserts it.

- [ ] **Write failing test**

```javascript
test("check-1 body names the gate-outcome writer verb and no inline Node", () => {
  const body = readFileSync("skills/validate/checks/validate.check-1-quality-gates.md", "utf8");
  assert.match(body, /adev report --type validator[\s\S]*--gate-outcomes/);
  assert.doesNotMatch(body, /node\s+(--input-type=module\s+)?-e|Run inline Node/);
});

test("check-1 has a registry entry in BOTH the starter and this project's own file", () => {
  for (const p of ["templates/domains/software/validate.yaml",
                   ".context-index/governance/validate.yaml"]) {
    const doc = parseYaml(readFileSync(p, "utf8"));
    assert.ok(doc.checks.some(c => c.id === "validate.check-1-quality-gates"), p);
  }
});

test("each emitted outcome carries a command_sha", () => {
  const body = readFileSync("skills/validate/checks/validate.check-1-quality-gates.md", "utf8");
  assert.match(body, /command_sha/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/deterministic-check-migration.test.mjs`
Expected: FAIL — the check file does not exist.

- [ ] **Implement** — author the check body; wire the emission step into `skills/validate/SKILL.md`;
      add the registry entry (this also removes the "unknown-validator fallback" caveat the SKILL
      documents at `:399`).

- [ ] **Verify test passes**

Run: `node --test tests/governance/deterministic-check-migration.test.mjs tests/skills-no-inline-node.test.mjs tests/skills-extension-coverage.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add skills/validate/checks/validate.check-1-quality-gates.md skills/validate/SKILL.md \
        templates/domains/software/validate.yaml .context-index/governance/validate.yaml \
        tests/governance/deterministic-check-migration.test.mjs
git commit -m "feat(validation): Check 1 records per-gate outcomes on its validator_report" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 6"
```

---

### Task 7: `lib/governance/transitions.mjs` + `adev gate transitions` [specialist: none]

**Charter capability:** unified-gates — transition compliance (**closes CON-1 comparator; DDR-3**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 6
**Files:**
- Create: `lib/governance/transitions.mjs`
- Create: `tests/governance/transitions.test.mjs`
- Modify: `lib/cli/gate.mjs` (dispatch `transitions` alongside `require` / `doctor`; extend `USAGE`)

**Tests:** `tests/governance/transitions.test.mjs` — create (Behaviors 3 and 4).

Contract, precisely as amended by Task 1:

- Reads `transitions` from `gates.yaml`. Empty or absent → **SKIP** with reason
  "no transitions configured" (Behavior 3 — SKIP, **never PASS**; a PASS asserts a verification
  that did not occur). The regression test pins SKIP.
- For a named transition, resolves `required_gates` and looks for each id in the **latest**
  `validator_report` event carrying `gate_outcomes`.
- **Freshness (DDR-2):** an outcome counts only if the event's `ts >= computed-at` of the spec's
  current source-manifest stamp, and — when `manifest_sha` is present — it equals the current
  `sha`. Otherwise SKIP `stale-gate-record`.
- **Attestation (DDR-3, partial and honestly scoped).** Three sub-rules, and the third is the one an
  implementer would otherwise have to invent:
  1. An outcome whose gate id is absent from the resolved `gates.yaml` set records SKIP
     `unattested-gate-record`.
  2. An outcome whose `command_sha` is **present and does not match** SHA-256 of that gate's
     resolved argv records SKIP `unattested-gate-record`.
  3. An outcome whose `command_sha` is **absent** is a pre-upgrade record. It is **not** refused and
     **not** treated as a mismatch: rule 1 and the freshness rules still apply, and if it survives
     them it counts. This mirrors DDR-2's fail-soft handling of a missing `manifest_sha` — fail-soft
     on history, never on verdicts. A hard refusal here would fail every spec whose Check 1 ran
     before this work landed.

  Never a pass under rules 1 or 2. This catches drift and cross-gate copying. It does **not** stop a
  deliberate forger, who can compute `command_sha` from a readable file — Task 7 files the
  follow-up issue for a nonce- or MAC-based attestation rather than pretending the hole is closed.
- Any required gate with no fresh, attested, passing outcome → **FAIL**, naming the gate.
- **Never executes a gate.** Execution belongs to Check 1. It also does not evaluate workflow
  preconditions — ADR-0010's decision-flow step 1 routes those to `requireGate`.
- Verb name is `adev gate transitions` (DDR-8), not the three-token form.

- [ ] **Write failing test**

```javascript
test("empty transitions records SKIP, never PASS", async () => {
  const r = await evaluateTransitions(dir, spec, { transition: null });
  assert.equal(r.verdict, "SKIP");
  assert.match(r.reason, /no transitions configured/);
});

test("a required gate with no recorded outcome FAILs and names the gate", async () => {
  seedTransitions(dir, { "implement-to-validate": { required_gates: ["test"] } });
  const r = await evaluateTransitions(dir, spec, { transition: "implement-to-validate" });
  assert.equal(r.verdict, "FAIL");
  assert.match(r.message, /\btest\b/);
});

test("an outcome older than the source-manifest computed-at is stale, not a pass", async () => {
  seedOutcome(dir, spec, { id: "test", verdict: "pass", tier: "fast" }, { ts: "2020-01-01T00:00:00Z" });
  const r = await evaluateTransitions(dir, spec, { transition: "implement-to-validate" });
  assert.equal(r.gates.test.verdict, "SKIP");
  assert.equal(r.gates.test.reason, "stale-gate-record");
});

test("an outcome naming a gate absent from gates.yaml is unattested, not a pass", async () => {
  seedOutcome(dir, spec, { id: "ghost", verdict: "pass", tier: "fast" });
  seedTransitions(dir, { "implement-to-validate": { required_gates: ["ghost"] } });
  const r = await evaluateTransitions(dir, spec, { transition: "implement-to-validate" });
  assert.equal(r.gates.ghost.reason, "unattested-gate-record");
});

test("a mismatched command_sha is unattested", async () => {
  seedOutcome(dir, spec, { id: "test", verdict: "pass", tier: "fast", command_sha: "deadbeef" });
  const r = await evaluateTransitions(dir, spec, { transition: "implement-to-validate" });
  assert.equal(r.gates.test.reason, "unattested-gate-record");
});

test("an ABSENT command_sha is a pre-upgrade record, not a mismatch", async () => {
  seedOutcome(dir, spec, { id: "test", verdict: "pass", tier: "fast" }); // no command_sha
  const r = await evaluateTransitions(dir, spec, { transition: "implement-to-validate" });
  assert.equal(r.gates.test.verdict, "pass");
  assert.notEqual(r.gates.test.reason, "unattested-gate-record");
});

test("evaluation never spawns a process", async () => {
  const spawns = interceptSpawns();
  await evaluateTransitions(dir, spec, { transition: "implement-to-validate" });
  assert.equal(spawns.length, 0);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/transitions.test.mjs`
Expected: FAIL — `lib/governance/transitions.mjs` does not exist.

- [ ] **Implement** — pure evaluator in `lib/governance/transitions.mjs`
      (`evaluateTransitions(projectRoot, specPath, { transition })` → `{ verdict, reason, gates }`),
      plus the `transitions` branch in `lib/cli/gate.mjs::run` with `--json` and exit codes
      matching the module's documented convention (0 pass/skip, 2 fail, 1 argument error).
      Then file the DDR-3 residue via `/adev:issues`: *"Bind gate outcomes to an unforgeable
      attestation (per-run nonce or keyed MAC); `command_sha` is derivable by any caller."*

- [ ] **Verify test passes**

Run: `node --test tests/governance/transitions.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add lib/governance/transitions.mjs lib/cli/gate.mjs tests/governance/transitions.test.mjs
git commit -m "feat(unified-gates): add adev gate transitions over recorded gate outcomes" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 7"
```

---

### Task 8: Boundary evaluator + worker + `adev boundaries check` [specialist: none]

**Charter capability:** validation — boundary compliance (**DDR-5**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/governance/boundaries.mjs`
- Create: `lib/governance/boundary-worker.mjs`
- Create: `lib/cli/boundaries.mjs`
- Create: `tests/governance/boundaries.test.mjs`
- Create: `tests/cli/boundaries-check.test.mjs`
- Modify: `cli/index.mjs:1722-1789` (register `boundaries` in `VERB_REGISTRY`)

**Tests:** `tests/governance/boundaries.test.mjs` — create (Behaviors 1, 2, 12);
`tests/cli/boundaries-check.test.mjs` — create (verb surface).

Contract:
- Loads `boundaries.yaml`. No rules → **SKIP** "no boundary rules declared", no subagent, exit 0.
- Per rule: match `pattern` against changed-file contents, honouring `exclude` globs.
  `severity: error` → FAIL, `severity: warning` → WARN, naming file, rule id, matched line.
- Invalid regex → exit non-zero with `INVALID_BOUNDARY_PATTERN`, naming the rule; **no partial
  evaluation** (validate every pattern before evaluating any).
- 250 ms per-file budget enforced by terminating a `node:worker_threads` worker;
  `BOUNDARY_PATTERN_TIMEOUT`, fails closed naming the rule.
- **Oversize (DDR-5 / SEC-3):** cap checked with `statSync().size` **before** reading. Over the cap
  → a finding at the **rule's own severity** naming file and rule, not silence.
- **Worker safety (SEC-5):** `boundary-worker.mjs` is a static file. Pattern, flags and content
  arrive via `workerData`; the regex is built with `new RegExp(pattern, flags)` only. No `eval`,
  no `Function`, no `new Worker(src, { eval: true })`.
- **Binary skip (DDR-14, the cheap half of SEC-6):** a file whose first 8 KB contains a NUL byte is
  skipped as binary with an INFO note. The aggregate wall-clock budget and changed-file ceiling are
  **deferred** — this task files that issue via `/adev:issues`.
- Built on Node built-ins only (`RegExp`, `node:worker_threads`, `node:fs`) — no new dependency,
  so no ADR is required.
- Deliberately a **pure evaluator**: the spec's Out of Scope section keeps the later
  boundaries-into-diagnostics consolidation able to wrap this rather than reimplement it. No
  diagnostics-registry coupling here.

- [ ] **Write failing test**

```javascript
test("no rules declared records SKIP and dispatches nothing", async () => {
  const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
  assert.equal(r.verdict, "SKIP");
  assert.match(r.reason, /no boundary rules declared/);
});

test("an error-severity rule match FAILs naming file, rule and line", async () => {
  seedRules(dir, [{ id: "no-require", severity: "error", pattern: "\\brequire\\(" }]);
  writeFixture(dir, "src/a.mjs", "const x = require('y');\n");
  const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
  assert.equal(r.verdict, "FAIL");
  assert.match(r.findings[0].message, /src\/a\.mjs.*no-require/s);
});

test("exclude globs suppress a match", async () => { /* … */ });

test("a catastrophically-backtracking pattern terminates within budget", async () => {
  seedRules(dir, [{ id: "redos", severity: "error", pattern: "(a+)+$" }]);
  writeFixture(dir, "src/b.mjs", "a".repeat(40) + "!");
  const t0 = Date.now();
  const r = await checkBoundaries(dir, { changed: ["src/b.mjs"] });
  assert.ok(Date.now() - t0 < 5000, "worker was terminated, not awaited forever");
  assert.match(JSON.stringify(r), /BOUNDARY_PATTERN_TIMEOUT/);
  assert.match(JSON.stringify(r), /redos/);
});

test("an invalid pattern refuses before any file is evaluated", async () => { /* INVALID_BOUNDARY_PATTERN */ });

test("an oversized file is a finding at rule severity, not silence", async () => {
  seedRules(dir, [{ id: "no-require", severity: "error", pattern: "\\brequire\\(" }]);
  writeOversizeFixture(dir, "src/big.mjs");
  const r = await checkBoundaries(dir, { changed: ["src/big.mjs"] });
  const f = r.findings.find(x => x.rule === "no-require");
  assert.equal(f.severity, "error");
  assert.match(f.message, /exceeds the input cap/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/boundaries.test.mjs`
Expected: FAIL — `lib/governance/boundaries.mjs` does not exist. The ReDoS test would **hang**
without worker termination, which is the point of pinning it.

- [ ] **Implement** — evaluator, worker, verb module, registry entry.

- [ ] **Verify test passes**

Run: `node --test tests/governance/boundaries.test.mjs tests/cli/boundaries-check.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add lib/governance/boundaries.mjs lib/governance/boundary-worker.mjs lib/cli/boundaries.mjs \
        cli/index.mjs tests/governance/boundaries.test.mjs tests/cli/boundaries-check.test.mjs
git commit -m "feat(validation): add deterministic boundary evaluator and adev boundaries check" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 8"
```

---

### Task 9: `adev governance materialize` — the producer, landed first [specialist: none]

**Charter capability:** cli-driver-surface / unified-gates — registry materialization (**DDR-7, DDR-15**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 8
**Files:**
- Create: `lib/governance/registry-marker.mjs`
- Create: `lib/governance/materialize.mjs`
- Create: `lib/cli/governance.mjs`
- Create: `tests/governance/materialize.test.mjs`
- Create: `tests/governance/registry-effective-set.test.mjs`
- Modify: `cli/index.mjs` (register `governance` in `VERB_REGISTRY`)
- Modify: `.context-index/governance/review.yaml`, `.../diagnostics.yaml`, `.../gates.yaml`
  (materialized + marked in this same commit — that is what keeps Task 10's guard green on arrival)

**Tests:** `tests/governance/materialize.test.mjs` — create (Behaviors 6, 7);
`tests/governance/registry-effective-set.test.mjs` — create (Invariant 2, the byte-identity test).

**Size note (reviewer minor 7).** This is the largest task in the plan: 5 created files (2 of them
tests) and 4 modified, 7 of which are non-test. It is tagged `large` deliberately and is a
subagent-stall candidate. It is **not** split because the three parts are one atomic unit — the
marker module, the writer that stamps it, and the act of marking this repo's registries must land
in a single commit or the tree goes red between them, which is the exact failure this ordering
exists to prevent. If `/adev:implement` stalls here, split at the commit boundary is not available;
recover with `/adev:recover` instead.

**Why this is Task 9 and the guard is Task 10.** Materialize needs no guard to run, and running it
marks this repo's registries. Landing it first means the guard in Task 10 arrives against a tree
where every marked registry already carries its marker — so `npm test` is green at both commits.
The reverse order (guard first) leaves the tree red across a commit boundary, which breaks spec
Invariant 1 and halts `/adev:implement` at its post-task gate.

`registry-marker.mjs` is created here (the writer needs it) and owns:
- `MARKED_REGISTRIES = new Set(["review.yaml", "diagnostics.yaml", "gates.yaml"])` — the bounded
  set from DDR-1, with a comment naming the two exempt files and why.
- `readMarker(filePath)` → ISO string or `null`. Reads the **top-level root key** only; an entry
  field named `materialized_at` is not a marker.
- `stampMarker(text)` — write-once; returns the text unchanged when a marker is already present.

`assertMaterialized` is deliberately **not** added here — it belongs with the guard (Task 10).

Contract:
- Computes the currently-effective merged set using the existing machinery
  (`lib/domains/merge-gates.mjs`, `lib/domains/merge-reviewers.mjs`, the diagnostics first-wins
  rule), then writes it into the project file **through
  `lib/extensions/governance-splice.mjs::spliceRegistryEntries`** — the only sanctioned writer.
  Sibling root keys and comments survive by construction (DDR-7).
- Stamps `materialized_at` (ISO-8601 UTC) **only when absent**. Write-once: a second run preserves
  the original value verbatim, so an unchanged effective set produces byte-identical output.
- Refuses with `MATERIALIZE_WOULD_DROP`, naming the entry, if the write would drop an entry present
  in the effective set.
- Every entry gets a `source:` value (`project` | `bundled` | `domain:<slug>`) — Task 16 supplies
  the mapping from today's `__source` vocabulary.
- **Symlink containment (DDR-15 / SEC-7):** the target is resolved, then — when it exists —
  `realpathSync`ed and re-checked for containment, because `resolve()` + `startsWith(dir + '/')`
  does not resolve symlinks and `writeFileSync` follows them. The registry set is enumerated from
  `WRITABLE_REGISTRIES`, never inferred.
- `--dry-run` prints the diff and writes nothing. `--json` for machine consumers.

The byte-identity test is the invariant that makes Step 5 safe and the spec is explicit that it
"must be a test, not an inspection".

- [ ] **Write failing test**

```javascript
test("effective set is byte-identical before and after materialization", async () => {
  for (const registry of ["review", "diagnostics", "gates"]) {
    const before = canonicalise(await effectiveSet(dir, registry));
    await runCli(dir, ["governance", "materialize", "--registry", registry]);
    const after = canonicalise(await effectiveSet(dir, registry));
    assert.equal(after, before, `${registry} effective set changed`);
  }
});

test("materialize is write-once and idempotent", async () => {
  await runCli(dir, ["governance", "materialize", "--registry", "gates"]);
  const first = readFileSync(gatesPath, "utf8");
  const stamp = readMarker(gatesPath);
  await runCli(dir, ["governance", "materialize", "--registry", "gates"]);
  assert.equal(readFileSync(gatesPath, "utf8"), first);
  assert.equal(readMarker(gatesPath), stamp);
});

test("materialize preserves a populated transitions block byte-for-byte", async () => {
  seedTransitions(dir, { "implement-to-validate": { required_gates: ["test"] } });
  const before = extractBlock(readFileSync(gatesPath, "utf8"), "transitions");
  await runCli(dir, ["governance", "materialize", "--registry", "gates"]);
  assert.equal(extractBlock(readFileSync(gatesPath, "utf8"), "transitions"), before);
});

test("materialize refuses rather than dropping an effective entry", async () => {
  const r = await runCli(dir, ["governance", "materialize", "--registry", "review"], { forceDrop: true });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /MATERIALIZE_WOULD_DROP/);
});

test("a symlinked registry outside the project is refused", async () => {
  symlinkOutside(dir, ".context-index/governance/gates.yaml");
  const r = await runCli(dir, ["governance", "materialize", "--registry", "gates"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /containment/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/materialize.test.mjs tests/governance/registry-effective-set.test.mjs`
Expected: FAIL — the verb does not exist.

- [ ] **Implement** — marker module + evaluator + verb + registry entry; then run the verb once for
      `review`, `diagnostics` and `gates` in this repo so the dogfooded registries are materialized
      and marked **in this commit**.

- [ ] **Verify test passes**

Run: `node --test tests/governance/materialize.test.mjs tests/governance/registry-effective-set.test.mjs` → PASS; then `npm test` → **0 failures**. Nothing is left red for a later task.

- [ ] **Commit**

```bash
git add lib/governance/registry-marker.mjs lib/governance/materialize.mjs \
        lib/cli/governance.mjs cli/index.mjs \
        .context-index/governance/review.yaml .context-index/governance/diagnostics.yaml \
        .context-index/governance/gates.yaml tests/governance/materialize.test.mjs \
        tests/governance/registry-effective-set.test.mjs
git commit -m "feat(cli): add adev governance materialize with write-once marker" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 9"
```

---

### Task 10: `materialized_at` fail-closed loader guard [specialist: none]

**Charter capability:** validation / review — registry composition (**enforces the SA-2 bounding**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 9
**Files:**
- Create: `tests/governance/registry-marker.test.mjs`
- Modify: `lib/governance/registry-marker.mjs` (add `assertMaterialized`)
- Modify: `lib/governance/review-config.mjs:40-140`
- Modify: `lib/cli/domain.mjs:270-300` (gates load path)

**Tests:** `tests/governance/registry-marker.test.mjs` — create (Behaviors 8, 11).

`assertMaterialized(filePath, registryName)` throws `REGISTRY_NOT_MATERIALIZED` naming the registry
and the remedy (`adev governance materialize --registry <name>`). One call at the top of each marked
registry's loader. Fail closed: never proceed with a partial or empty set.

Decidability is contract: the marker is a property of the **project file alone**, so the loader must
not read bundled or domain defaults to decide. Task 11 removes run-time merging anyway, which would
make "do defaults exist" undecidable there.

**Diagnostics caveat (see the Already Implemented table):** `lib/diagnostics/index.mjs` may need no
edit at all — the bundled `plugin:` entries are already explicit rows in `diagnostics.yaml` and the
module only resolves the prefix. Confirm before touching it; if a guard call is warranted, add it,
otherwise record that the file needed no change.

- [ ] **Write failing test**

```javascript
test("a registry with entries but no marker still raises", () => {
  writeFixture(dir, ".context-index/governance/review.yaml",
    "reviewers:\n  - id: my-reviewer\n    prompt: prompts/x.md\n");
  assert.throws(() => loadReviewConfig(dir), /REGISTRY_NOT_MATERIALIZED/);
});

test("materialization is decided from the project file alone", () => {
  removeBundledAndDomainDefaults(dir);
  assert.throws(() => loadReviewConfig(dir), /REGISTRY_NOT_MATERIALIZED/);
});

test("validate.yaml and boundaries.yaml are exempt from the marker", () => {
  writeFixture(dir, ".context-index/governance/boundaries.yaml", "boundaries: []\n");
  assert.doesNotThrow(() => checkBoundaries(dir, { changed: [] }));
  assert.doesNotThrow(() => loadValidateConfig(dir));
});

test("the round trip closes: raise, materialize, proceed", async () => {
  assert.throws(() => loadReviewConfig(dir), /REGISTRY_NOT_MATERIALIZED/);
  await runCli(dir, ["governance", "materialize", "--registry", "review"]);
  assert.doesNotThrow(() => loadReviewConfig(dir));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/registry-marker.test.mjs`
Expected: FAIL — loaders return an empty/merged set instead of raising.

- [ ] **Implement** — `assertMaterialized` plus one call per marked-registry loader. Update any
      fixture in the existing suites that seeds an unmarked registry to materialize it first; this
      is fixture maintenance, not a weakening of the guard.

- [ ] **Verify test passes**

Run: `node --test tests/governance/registry-marker.test.mjs` → PASS; `npm test` → **0 failures**.
This repo's registries were already marked by Task 9, so nothing here goes red.

- [ ] **Commit**

```bash
git add lib/governance/registry-marker.mjs lib/governance/review-config.mjs \
        lib/cli/domain.mjs tests/governance/registry-marker.test.mjs
git commit -m "feat(validation): fail closed on un-materialized governance registries" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 10"
```

---

### Task 11: Remove run-time overlays [specialist: none]

**Charter capability:** review / unified-gates — composition (**spec REMOVED section**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 10
**Files:**
- Modify: `lib/governance/review-config.mjs:40-140, 312-330` (drop the three-layer overlay)
- Modify: `lib/cli/domain.mjs:281` (`load-gates` reads the materialized project file)
- Modify: `lib/diagnostics/index.mjs` — **only if** the Task 10 confirmation found bundled injection
  to remove; the evidence says the entries are already explicit rows
- Modify: `tests/gates/doctor-consumer-parity.test.mjs` (add the equality assertion — this is where
  it belongs, since this is the task that makes it true)

**Tests:** `tests/gates/doctor-consumer-parity.test.mjs` — **extend** (Behavior 10, same suite as
Tasks 2-3); `tests/governance/registry-effective-set.test.mjs` — **extend** (Invariant 2).

**Naming precision (DDR-16 / CON-4).** Two different functions share a name. Remove the **private**
`mergeReviewers` inside `lib/governance/review-config.mjs:312`. **Retain**
`lib/domains/merge-reviewers.mjs::mergeReviewers` (consumer: `lib/cli/domain.mjs:53`) and
`lib/domains/merge-gates.mjs::mergeGates` — `adev governance materialize` and `/adev:init`
scaffolding are their remaining callers. Only the run-time call sites go.

- [ ] **Write failing test**

```javascript
test("a domain-only reviewer no longer appears at run time", () => {
  seedDomainReviewers(dir, [{ id: "domain-only" }]);
  materialize(dir, "review");            // effective set captured
  seedDomainReviewers(dir, [{ id: "domain-only" }, { id: "added-later" }]);
  const ids = loadReviewConfig(dir).reviewers.map(r => r.id);
  assert.ok(!ids.includes("added-later"), "run-time overlay is gone; adoption is via hygiene");
});

test("doctor's gate set equals the set Check 1 executes", async () => {
  const dir = await createTempDir();
  writeFixture(dir, ".context-index/governance/gates.yaml",
    'materialized_at: 2026-01-01T00:00:00Z\ngates:\n  - id: test\n    command: ["npm","test"]\n');
  const doctorIds = (await loadDoctorGates(dir)).map(g => g.id).sort();
  const check1Ids = (await loadCheck1Gates(dir)).map(g => g.id).sort();
  assert.deepEqual(doctorIds, check1Ids);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/gates/doctor-consumer-parity.test.mjs`
Expected: FAIL — the overlay still injects `added-later`, and the merged gate set still adds the
domain's `quality-gate` / `integration-test` so the two loaders disagree.

- [ ] **Implement** — remove the overlay reads; keep provenance stamping.

- [ ] **Verify test passes**

Run: `npm test` → 0 failures. Re-run the byte-identity suite: the effective set must be unchanged
by this task (Invariant 2 — that is what makes the removal safe).

- [ ] **Commit**

```bash
git add lib/governance/review-config.mjs lib/cli/domain.mjs lib/diagnostics/index.mjs \
        tests/gates/doctor-consumer-parity.test.mjs
git commit -m "refactor(review): drop run-time governance overlays in favour of materialized files" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 11"
```

---

### Task 12: Install-time and init-time marker rules [specialist: none]

**Charter capability:** domain-extensions — install boundary (**Behavior 8 + Error Case row**).
Task 1 edit 9 adds `domain-extensions` to the spec's `affects:` and Module Impact Map (DDR-13), so
this tag names a declared surface rather than an untracked one.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 10
**Files:**
- Create: `tests/lib/extensions/governance-marker-gate.test.mjs`
- Modify: `lib/extensions/content-install.mjs` (gate **before** `mkdirSync`/write — SEC-8)
- Modify: `skills/init/SKILL.md:211-227, 320-406`
- Modify: `templates/gates-template.yaml`, `templates/diagnostics-template.yaml`, `templates/governance/review.example.yaml`

**Tests:** `tests/lib/extensions/governance-marker-gate.test.mjs` — create (Behaviors 8, 11 install
half).

Two rules:
- Install into one of the **three marked registries** lacking `materialized_at` → refuse with
  `REGISTRY_NOT_MATERIALIZED`, so an install cannot pre-empt materialization and stamp a registry
  with only its own entry in it. The gate is evaluated **before** any directory or file creation —
  `mergeGovernanceEntries` currently creates unconditionally.
- `/adev:init` stamps `materialized_at` when scaffolding a registry from a domain starter, so a
  fresh project is born materialized and never hits the guard on first run.

The two exempt registries (DDR-1) keep working untouched. The reference-extension install test
targets `validate.yaml`, so it must stay green **without modification** — that is the direct
evidence SA-2 is closed rather than merely reworded.

- [ ] **Write failing test**

```javascript
test("install into an unmarked gates.yaml is refused before any write", async () => {
  writeFixture(dir, ".context-index/governance/gates.yaml", "gates: []\n");
  const before = readFileSync(gatesPath, "utf8");
  await assert.rejects(() => installGovernance(dir, "gates.yaml", [{ id: "x", command: ["npm","test"] }]),
    /REGISTRY_NOT_MATERIALIZED/);
  assert.equal(readFileSync(gatesPath, "utf8"), before);
});

test("install into validate.yaml needs no marker (exempt registry)", async () => {
  await assert.doesNotReject(() => installGovernance(dir, "validate.yaml", [{ id: "x", kind: "deterministic-check", severity: "warning" }]));
});

test("a freshly scaffolded project carries the marker on all three registries", async () => {
  await scaffold(dir);
  for (const f of ["review.yaml", "diagnostics.yaml", "gates.yaml"]) {
    assert.ok(readMarker(join(dir, ".context-index/governance", f)), `${f} missing marker`);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/governance-marker-gate.test.mjs`
Expected: FAIL — install succeeds and scaffolds carry no marker.

- [ ] **Implement**

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/ tests/skills/` → PASS, and confirm
`tests/lib/extensions/example-validation-check-install.test.mjs` is green **unedited**.

- [ ] **Commit**

```bash
git add lib/extensions/content-install.mjs skills/init/SKILL.md templates/ \
        tests/lib/extensions/governance-marker-gate.test.mjs
git commit -m "feat(extensions): refuse installs into un-materialized registries; init stamps the marker" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 12"
```

---

### Task 13: `disabled_reason` + disabled-entry parity across loaders [specialist: none]

**Charter capability:** validation — check enablement (**Behavior 5, Invariant 5**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/governance/enabled-flag.test.mjs`
- Modify: `lib/governance/validate-config.mjs:186-200, 240-250` (surface `disabled_reason`; the
  `enabled: false` skip at `:191, :196` and the `enabled: true` default at `:244` already exist)
- Modify: `lib/governance/review-config.mjs:370-400` (add the parity this loader lacks entirely)
- Modify: `lib/diagnostics/index.mjs` (same parity)

**Tests:** `tests/governance/enabled-flag.test.mjs` — create (Behavior 5).

**Scope correction.** An earlier draft claimed "no loader reads them today". That is wrong:
`lib/governance/validate-config.mjs` **already** honours `enabled: false` (`:191`, `:196`) and
defaults `enabled: true` (`:244`). What is genuinely missing, and is the whole of this task:
1. `disabled_reason` is read by nothing (zero hits repo-wide) — a disabled check is currently
   indistinguishable from an absent one in the *report*, which is exactly what Invariant 5 forbids.
2. `review-config.mjs` and `lib/diagnostics/index.mjs` have no `enabled` handling at all.
3. `DISABLED_WITHOUT_REASON` does not exist.

`FIELD_ALLOWLIST` already permits both fields on all five registries, so nothing is needed at the
contribution boundary. `enabled: false` without `disabled_reason` emits `DISABLED_WITHOUT_REASON` as
a **schema warning** and the entry stays disabled — a warning, not a refusal, because refusing would
make the field unusable in the exact case where an operator is in a hurry.

- [ ] **Write failing test**

```javascript
test("a disabled check surfaces its reason in the loaded config", () => {
  seedChecks(dir, [{ id: "validate.check-8-boundaries", enabled: false, disabled_reason: "no rules yet" }]);
  const cfg = loadValidateConfig(dir);
  const c = cfg.checks.find(x => x.id === "validate.check-8-boundaries");
  assert.equal(c.disabled_reason, "no rules yet");   // currently dropped
});

test("a disabled entry is distinguishable from an absent one", () => {
  assert.notDeepEqual(loadValidateConfig(disabledDir), loadValidateConfig(absentDir));
});

test("review and diagnostics loaders honour enabled:false too", () => {
  assert.ok(!loadReviewConfig(disabledReviewDir).reviewers.some(r => r.id === "security-reviewer"));
  assert.ok(!loadDiagnostics(disabledDiagDir).some(d => d.id === "adev/status-enum-legal"));
});

test("enabled:false without a reason warns but stays disabled", () => {
  const cfg = loadValidateConfig(noReasonDir);
  assert.ok(cfg.warnings.some(w => w.code === "DISABLED_WITHOUT_REASON"));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/enabled-flag.test.mjs`
Expected: FAIL on `disabled_reason` (dropped), on review/diagnostics parity (no handling), and on
`DISABLED_WITHOUT_REASON` (code does not exist). The validate-loader skip itself already passes —
do not re-implement it.

- [ ] **Implement**

- [ ] **Verify test passes**

Run: `node --test tests/governance/enabled-flag.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add lib/governance/validate-config.mjs lib/governance/review-config.mjs \
        lib/diagnostics/index.mjs tests/governance/enabled-flag.test.mjs
git commit -m "feat(validation): surface disabled_reason and add enabled parity across registries" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 13"
```

---

### Task 14: Populate `boundaries.yaml` from the constitution [specialist: none]

**Charter capability:** validation — boundary rules (**DDR-11**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 8
**Files:**
- Create: `tests/governance/boundary-rules-corpus.test.mjs`
- Create: `tests/fixtures/governance/` (one violating + one clean fixture per rule)
- Modify: `.context-index/governance/boundaries.yaml`

**Tests:** `tests/governance/boundary-rules-corpus.test.mjs` — create (Behavior 2, applied to the
project's own rules).

Translate the constitution's **regex-decidable** anti-patterns — and only those. Candidates from
`CLAUDE.md`'s Anti-Patterns section:
- `no-commonjs` — `require(` / `module.exports` in `**/*.mjs`
- `no-inline-node-in-skills` — `node -e` / `node --input-type=module -e` / `Run inline Node` in `skills/**/SKILL.md` (the rule that currently exists only as `hooks/pre-commit-no-inline-node.sh`)
- `no-hardcoded-claude-home` — a literal `~/.claude/` path outside the installer
- `no-manual-version-bump` — `"version"` edits in `package.json` / `.claude-plugin/plugin.json` (warning only; release-please owns these)

Non-mechanical anti-patterns (e.g. "no executable logic inside SKILL.md", which needs judgement)
stay prose. Every rule ships at `severity: warning` (DDR-11) with a fixture proving it fires and a
run against the current tree proving it stays silent. Promotion to `error` is a follow-up after one
clean cycle — Task 14 files that issue rather than doing it.

- [ ] **Write failing test**

```javascript
for (const rule of loadRules()) {
  test(`${rule.id} fires on its violating fixture`, async () => {
    const r = await checkBoundaries(repo, { changed: [`tests/fixtures/governance/${rule.id}.violating`] });
    assert.ok(r.findings.some(f => f.rule === rule.id));
  });
  test(`${rule.id} is silent on its clean fixture`, async () => { /* … */ });
}

test("no rule fires on the current tree", async () => {
  const r = await checkBoundaries(repo, { changed: await trackedFiles(repo) });
  assert.deepEqual(r.findings, []);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/boundary-rules-corpus.test.mjs`
Expected: FAIL — `boundaries: []`, so the loop body never runs and the corpus assertion is empty.

- [ ] **Implement** — author the rules and fixtures. If the current-tree assertion fires, fix the
      **rule**, not the tree (a rule that flags existing sanctioned code is mis-specified). Then
      file the DDR-11 follow-up via `/adev:issues`: *"Promote boundary rules from `warning` to
      `error` after one clean cycle."*

- [ ] **Verify test passes**

Run: `node --test tests/governance/boundary-rules-corpus.test.mjs` → PASS; `npm test` → 0 failures.

- [ ] **Commit**

```bash
git add .context-index/governance/boundaries.yaml tests/governance/boundary-rules-corpus.test.mjs \
        tests/fixtures/governance/
git commit -m "feat(validation): populate boundaries.yaml from the constitution's mechanical rules" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 14"
```

---

### Task 15: Populate `transitions:` in `gates.yaml` [specialist: none]

**Charter capability:** unified-gates — transition requirements
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7, Task 9
**Files:**
- Create: `tests/governance/transitions-config.test.mjs`
- Modify: `.context-index/governance/gates.yaml` (`transitions` block)

**Tests:** `tests/governance/transitions-config.test.mjs` — create (Behavior 4 applied to the
project's own config).

`transitions` names **only** gates carrying real argv commands — after Task 2 that is `test`
(plus the domain's `quality-gate` / `integration-test` once materialized). `lint` and `typecheck`
remain commented out, so naming them would create the exact hygiene Pass 8 finding the spec's Error
Case row preserves.

Ordering matters: this runs **after** Task 9 so the block is written into an already-materialized
`gates.yaml`, and Task 9's byte-identity test then proves materialize will not destroy it (DDR-7).

- [ ] **Write failing test**

```javascript
test("every gate named in transitions exists and carries an argv command", () => {
  const doc = parseYaml(readFileSync(".context-index/governance/gates.yaml", "utf8"));
  const byId = new Map((doc.gates ?? []).map(g => [g.id, g]));
  for (const [name, t] of Object.entries(doc.transitions ?? {})) {
    for (const id of t.required_gates ?? []) {
      const g = byId.get(id);
      assert.ok(g, `${name} requires unknown gate ${id}`);
      assert.ok(Array.isArray(g.command), `${name} requires ${id} which has no argv command`);
    }
  }
});

test("transitions is non-empty, so Check 9 no longer SKIPs on this project", () => {
  const doc = parseYaml(readFileSync(".context-index/governance/gates.yaml", "utf8"));
  assert.ok(Object.keys(doc.transitions ?? {}).length > 0);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/transitions-config.test.mjs`
Expected: FAIL — `transitions: {}`.

- [ ] **Implement** — populate `implement-to-validate: { required_gates: [test] }` and
      `validate-to-merge: { required_gates: [test] }`; leave `approver_role` empty.

- [ ] **Verify test passes**

Run: `node --test tests/governance/transitions-config.test.mjs` → PASS; then
`adev gate transitions --transition implement-to-validate --json` on a spec with a recorded
Check-1 outcome and confirm it reads the outcome rather than executing anything.

- [ ] **Commit**

```bash
git add .context-index/governance/gates.yaml tests/governance/transitions-config.test.mjs
git commit -m "feat(unified-gates): populate transitions with gates carrying argv commands" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 15"
```

---

### Task 16: `source:` vocabulary mapping [specialist: none]

**Charter capability:** review — provenance (**DDR-4 / review SA-4 + CON-3**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 11
**Files:**
- Create: `tests/governance/source-vocabulary.test.mjs`
- Modify: `lib/governance/review-config.mjs:107, 312-330` (emit the on-disk enum)
- Modify: `lib/governance/materialize.mjs` (stamp `source` per entry)

**Tests:** `tests/governance/source-vocabulary.test.mjs` — create (ADDED `source:` vocabulary).

The four run-time `__source` values must map onto the on-disk enum, or Step 6's drift exclusion has
undefined behaviour for `project-override`. Mapping (DDR-4):

| Run-time `__source` | On-disk `source:` | Why |
|---|---|---|
| `bundled` | `bundled` | identity |
| `project` | `project` | identity |
| `project-override` | `project` | a project entry overriding a bundled one is project-authored and must stay visible to the drift pass |
| `manifest-specialist` | `project` | migrated from the project's own manifest |
| domain overlay | `domain:<slug>` | slug from the resolved domain |
| installer-stamped | `extension:<name>` | already shipped; untouched |

- [ ] **Write failing test**

```javascript
test("every materialized entry carries a source from the on-disk enum", async () => {
  await runCli(dir, ["governance", "materialize", "--registry", "review"]);
  for (const r of parseYaml(readFileSync(reviewPath, "utf8")).reviewers) {
    assert.match(r.source, /^(project|bundled|domain:[a-z0-9-]+|extension:.+)$/);
  }
});

test("project-override maps to project, not to a fifth value", () => {
  assert.equal(mapSourceVocabulary("project-override"), "project");
  assert.equal(mapSourceVocabulary("manifest-specialist"), "project");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/source-vocabulary.test.mjs`
Expected: FAIL — entries carry `__source: "project-override"`, which is outside the enum.

- [ ] **Implement**

- [ ] **Verify test passes**

Run: `node --test tests/governance/source-vocabulary.test.mjs` → PASS.

- [ ] **Commit**

```bash
git add lib/governance/review-config.mjs lib/governance/materialize.mjs \
        tests/governance/source-vocabulary.test.mjs
git commit -m "fix(review): map run-time __source provenance onto the on-disk source enum" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 16"
```

---

### Task 17: Hygiene Audit Pass 19 widened + two sub-audits [specialist: none]

**Charter capability:** validation — drift detection (**Behavior 9; DDR-6 / review SEC-4**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 16
**Files:**
- Create: `tests/hygiene/registry-drift-pass-19.test.mjs`
- Modify: `skills/hygiene/SKILL.md:919-968` (Pass 19 ends at `:968`; Pass 20 begins at `:969`)

**Tests:** `tests/hygiene/registry-drift-pass-19.test.mjs` — create (Behavior 9).

Three changes to Pass 19:
1. **Remit** widens from `validate.yaml` alone to all four registries
   (`validate.yaml`, `review.yaml`, `diagnostics.yaml`, `gates.yaml`). This becomes the single
   upgrade-adoption channel, which is what makes single-source safe.
2. **Disabled-check sub-audit:** flag any entry carrying `enabled: false` whose `source` is
   `bundled` or `domain:*`. Without it, a bundled check can be switched off in a one-line PR and
   the drift pass — which reports only *unadopted new* entries — stays silent.
3. **Execution-bearing sub-audit (DDR-6, partial SEC-4):** the non-`project` exclusion narrows to
   *unadopted-upgrade* findings only. A new sub-finding lists every non-`project` entry carrying
   `command`, `runner`, `prompt` or `pattern`, so an extension-appended `command` — which reaches
   `spawnSync` at every post-task trigger — is visible. The ledger-based *changed-since* diff and
   the install-time summary line are **deferred**; this task files the follow-up issue.

Severity stays INFO per the pass's existing policy, except the disabled-bundled sub-audit, which is
**WARN**: switching off a bundled check is a decision someone should see, not a note.

- [ ] **Write failing test**

```javascript
test("a new bundled entry produces a drift finding for each registry", async () => {
  for (const reg of ["validate", "review", "diagnostics", "gates"]) {
    addStarterEntry(dir, reg, { id: `new-${reg}` });
    const findings = await runPass19(dir);
    assert.ok(findings.some(f => f.registry === reg && /new-/.test(f.message)));
  }
});

test("enabled:false on a bundled entry is flagged", async () => {
  seedEntry(dir, "review", { id: "security-reviewer", source: "bundled", enabled: false, disabled_reason: "n/a" });
  const findings = await runPass19(dir);
  const f = findings.find(x => x.id === "hygiene/disabled-bundled-entry");
  assert.equal(f.severity, "warning");
});

test("an extension-appended command is listed, not excluded", async () => {
  seedEntry(dir, "gates", { id: "ext-gate", source: "extension:acme", command: ["curl","https://x"] });
  const findings = await runPass19(dir);
  assert.ok(findings.some(f => f.id === "hygiene/non-project-execution-field" && /ext-gate/.test(f.message)));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/hygiene/registry-drift-pass-19.test.mjs`
Expected: FAIL — the pass covers only `validate.yaml` and has no sub-audits.

- [ ] **Implement** — rewrite Pass 19; file the deferred-SEC-4 follow-up via
      `/adev:issues` (local task board, never `gh issue create`).

- [ ] **Verify test passes**

Run: `node --test tests/hygiene/registry-drift-pass-19.test.mjs` → PASS; `npm test` → 0 failures.

- [ ] **Commit**

```bash
git add skills/hygiene/SKILL.md tests/hygiene/registry-drift-pass-19.test.mjs
git commit -m "feat(validation): widen hygiene Pass 19 to all governance registries" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 17"
```

---

### Task 18: Migrate Check 8/9 bodies, flip `kind`, update docs [specialist: none]

**Charter capability:** validation / cli-driver-surface — check execution mechanism
(**completes Migration Step 2 — the spec's headline deliverable**)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7, Task 8
**Files:**
- Modify: `skills/validate/checks/validate.check-8-boundaries.md` — body becomes `adev boundaries check --json`
- Modify: `skills/validate/checks/validate.check-9-transition-gates.md` — body becomes `adev gate transitions --json`
- Modify: `.context-index/governance/validate.yaml` (checks 8 at `:49` and 9 at `:58`: `kind: subagent-review` → `deterministic-check`; drop `profile` / `context_pack`, which only apply to subagent checks)
- Modify: `templates/domains/software/validate.yaml` (the same flip in the starter)
- Modify: `skills/validate/SKILL.md:309-329` — **both** check sections. Check 8 sits at `:309-321`
  and carries the same regex-algorithm prose the migration removes (`severity: error → FAIL /
  severity: warning → WARN`); Check 9 sits at `:322-329`. Also update the report template at
  `:464-468`, which states both checks.
- Modify: `docs/cli-reference.md`, `docs/governance.md` (the three new verbs; marker semantics)
- Test: `tests/governance/deterministic-check-migration.test.mjs` (**extend** — created by Task 6)

**Tests:** `tests/governance/deterministic-check-migration.test.mjs` — **extend** (Behaviors 1 and 3,
same suite as Task 6's emitter work, per-behavior granularity).

**Why this is a separate task and why it is last.** An earlier draft listed these three files in the
File Structure and then never assigned them to any task, leaving the spec's two headline ACs
("Check 8 records SKIP… dispatches no subagent" and "Checks 8 and 9 carry `kind: deterministic-check`")
unimplemented. It is last because both verbs must exist first — flipping `kind` before Tasks 7 and 8
land would point the registry at commands that do not run.

Both bodies follow the shipped `validate.check-14-gate-executability.md` pattern exactly: invoke the
verb, parse the JSON envelope, map outcomes to PASS / FAIL / WARN / SKIP, and nothing else. Per the
constitution, no inline Node, no `node -e`, and no fenced-JavaScript directive. Verdict vocabulary is
unchanged (Invariant 6), so historic `.validate.md` reports stay comparable.

- [ ] **Write failing test**

```javascript
test("check-8 and check-9 bodies call their verbs and dispatch no subagent", () => {
  const b8 = readFileSync("skills/validate/checks/validate.check-8-boundaries.md", "utf8");
  const b9 = readFileSync("skills/validate/checks/validate.check-9-transition-gates.md", "utf8");
  assert.match(b8, /adev boundaries check --json/);
  assert.match(b9, /adev gate transitions[^\n]*--json/);
  for (const b of [b8, b9]) {
    assert.doesNotMatch(b, /node\s+(--input-type=module\s+)?-e|Run inline Node/);
  }
});

test("checks 8 and 9 are deterministic in BOTH registries", () => {
  for (const p of [".context-index/governance/validate.yaml",
                   "templates/domains/software/validate.yaml"]) {
    const doc = parseYaml(readFileSync(p, "utf8"));
    for (const id of ["validate.check-8-boundaries", "validate.check-9-transition-gates"]) {
      const c = doc.checks.find(x => x.id === id);
      assert.equal(c.kind, "deterministic-check", `${p} :: ${id}`);
    }
  }
});

test("check 8 SKIPs, not PASSes, on an empty boundaries.yaml — and pins SKIP deliberately", async () => {
  // Migration Step 2's risk note: the pass/fail outcome is unchanged, but the VERDICT changes
  // from PASS to SKIP. Pinning PASS-preservation here would contradict the contract.
  //
  // The "dispatches no subagent" half of the AC is pinned by the `kind: deterministic-check`
  // assertion above, which is the only observable that exists: the check body is markdown read
  // by an agent, and no harness in tests/ counts dispatches. Asserting a dispatch counter here
  // would be asserting against nothing.
  const r = await checkBoundaries(emptyBoundariesDir, { changed: ["src/a.mjs"] });
  assert.equal(r.verdict, "SKIP");
  assert.match(r.reason, /no boundary rules declared/);
});

test("the three new verbs are documented", () => {
  const ref = readFileSync("docs/cli-reference.md", "utf8");
  for (const v of ["adev boundaries check", "adev gate transitions", "adev governance materialize"]) {
    assert.match(ref, new RegExp(v.replace(/ /g, "\\s+")));
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/deterministic-check-migration.test.mjs`
Expected: FAIL — both bodies still describe a regex algorithm in prose, both registries still say
`kind: subagent-review`, and the docs name none of the three verbs.

- [ ] **Implement** — rewrite both bodies; flip `kind` in both registries; update the SKILL's Check 9
      section and the two docs pages.

- [ ] **Verify test passes**

Run: `node --test tests/governance/deterministic-check-migration.test.mjs tests/skills-no-inline-node.test.mjs` → PASS; `npm test` → 0 failures. Then run `/adev:validate` end-to-end on this
spec and confirm the report shows Checks 8 and 9 as deterministic with **no** subagent dispatch.

- [ ] **Commit**

```bash
git add skills/validate/checks/validate.check-8-boundaries.md \
        skills/validate/checks/validate.check-9-transition-gates.md \
        skills/validate/SKILL.md .context-index/governance/validate.yaml \
        templates/domains/software/validate.yaml docs/cli-reference.md docs/governance.md \
        tests/governance/deterministic-check-migration.test.mjs
git commit -m "feat(validation): make Checks 8 and 9 deterministic verb calls" \
  -m "Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md" \
  -m "Plan-task: 18"
```

---

## Acceptance-Criteria Coverage

Every acceptance criterion in the spec maps to at least one task. Criteria added by Task 1
(attestation, oversize finding, corrected staleness) are covered by the tasks that introduce them.

| Spec AC (abbreviated) | Task |
|---|---|
| Check 8 SKIPs on empty `boundaries.yaml`, no subagent | 8 (evaluator), **18** (check body) |
| Check 9 SKIPs on empty `transitions` | 7 (evaluator), **18** (check body) |
| Checks 8/9 carry `kind: deterministic-check` | **18** (both registries) |
| `boundaries.yaml` holds the constitution's regex-decidable rules, with fixtures both ways | 14 |
| `transitions` names only argv-command gates; hygiene Pass 8 passes | 15 |
| Three registries list every entry that runs | 9, 11 |
| Byte-identical effective set before/after materialization, per registry | 9 |
| `enabled: false` appears as deliberately disabled with its reason | 13 |
| Doctor and Check 1 operate on the same gate set, asserted by a test | 2, 3, 11 |
| Pass 19 reports drift for all four registries | 17 |
| Every entry carries `source:`; drift excludes non-`project` (narrowed) | 16, 17 |
| Non-empty unmarked registry still raises `REGISTRY_NOT_MATERIALIZED` | 10 |
| Marker decided from the project file alone, defaults removed | 10 |
| Extension install into an unmarked registry refused | 12 |
| Round trip: raise → materialize → proceed → re-materialize byte-identical | 9, 10 |
| Fresh `/adev:init` project born materialized | 12 |
| `adev gate transitions` reads outcomes; stale → SKIP `stale-gate-record` | 4, 7 |
| No new `CANONICAL_EVENTS` variant, pinned by a test | 4 |
| Records FAIL for a required gate without a passing record; never executes a gate | 7 |
| `(a+)+$` terminates within budget, failure names the rule | 8 |
| Hygiene flags `enabled: false` on `bundled` / `domain:*` | 17 |
| No check identifier changed; no check moved surface | Invariant, asserted in 6, 17 and 18 |
| All quality gates pass; no constitutional violations | Quality Gates below |

Every AC now has an owning task. The three previously-orphaned entries — both check bodies and the
`kind` flip — are Task 18.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are
recorded in the validation report (`.validate.md`), not in this plan.

`.context-index/governance/gates.yaml` exists, so its gate definitions govern (not the
constitution's Quality Gates block):

| Gate | Command | Tier | Severity | Note |
|---|---|---|---|---|
| `test` | `npm test` | fast | error | argv form after Task 2; **skipped by every consumer today** because it is declared as a string |
| `quality-gate` (domain) | `npm test` | fast | error | the reason the `test` gate's silence went unnoticed |
| `integration-test` (domain) | `npm run --if-present test:integration` | integration | error | no-op until a `test:integration` script exists |
| `lint`, `typecheck` | — | — | — | commented out in `gates.yaml`; **not** named in `transitions` (Task 15) |

No probabilistic or command-less gates are declared, so nothing is skipped for lack of a command.

Baseline to preserve: `npm test` is green at **6047 tests, 0 failures, exit 0**, and it stays green
at **every** task's commit. The producer-before-guard ordering (Task 9 materializes, Task 10 guards)
exists precisely so no commit in this plan leaves the tree red.

- Tests pass: `npm test`
- Boundary rules clean on the current tree: `adev boundaries check --json` (after Task 14)
- Gate diagnosis clean: `adev gate doctor --json` reports no error-severity finding (after Task 2)
- Transition compliance: `adev gate transitions --transition implement-to-validate --json` (after Task 15)
- All acceptance criteria from the spec satisfied (see coverage table above)

---

## Next Steps

- `/adev:route --plan .context-index/specs/cross-cutting/explicit-governance-registries.plan.md`
- `/adev:implement --plan .context-index/specs/cross-cutting/explicit-governance-registries.plan.md`

**Human audit requested before Task 1 commits:** the sixteen Design Decisions of Record above were
made autonomously under `AUTO: true`. Four change normative spec text and are the ones most worth a
second pair of eyes:
- **DDR-1** (SA-2 bounding — exempts `validate.yaml` and `boundaries.yaml` from the marker),
- **DDR-2** (CON-1 comparator — event `ts` vs `computed-at`, plus `manifest_sha`),
- **DDR-13** (widens the spec's `affects:` to include `domain-extensions`),
- **DDR-3** (SEC-2 is closed only **partially**; the forgery residue is filed, not fixed).

This plan was reviewed once by a plan-reviewer subagent, which returned Issues Found with eleven
items. All eleven are addressed above — most consequentially: Task 18 now owns the check-body
migration and `kind` flip that no task previously owned; Tasks 9 and 10 were reordered so no commit
leaves the tree red; Task 3 no longer writes a RED test it cannot turn GREEN; Task 13 was rescoped
after `enabled` handling was found already shipped in `validate-config.mjs`; and DDR-3 was restated
honestly rather than claiming a closure it does not deliver.



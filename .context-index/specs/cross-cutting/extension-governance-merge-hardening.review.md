---
spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
date: 2026-08-15
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 3
file-sha: 66d5a991d032738e684fa170d30dcb1c228bc49bd278bc486c75ffe70f6b1c9a
reviewers-dispatched: 3
findings-total: 16
blockers: 6
warnings: 7
suggestions: 3
---

# Architecture Review: extension-governance-merge-hardening

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md` (revision 3)
> **Charter:** none (cross-cutting spec; `affects: [domain-extensions, validation, unified-gates]`)
> **Rigor tier:** full (explicit `--tier full`)
> **Risk level:** high
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry resolution: domain `software` (source level `default`), `.context-index/governance/review.yaml` carries `reviewers: []`, so the three bundled defaults dispatched unmodified. `severity_cap: blocker` on all three — no finding was demoted. Skill extensions: `__NONE__`.

## What rev 3 got right

Recorded first because it bounds the remaining work. All three reviewers independently verified the following citations against source and found them accurate:

- `lib/domains/merge-gates.mjs:29-33` — `command` is a required field; a gate lacking it is discarded with `INVALID_GATE`. The rev-3 conclusion that `gates.yaml` has no safe writable subset follows, and rev 2's "omit `command` from the gate allowlist" fix would indeed have broken the feature rather than secured it.
- `lib/gates/doctor.mjs:965` — `spawnSync("sh", ["-c", command])`, the execution sink.
- `lib/profiles/yaml.mjs` — integer coercion (`:179`), flow-map parsing, and `unquote`'s no-unescape behavior (`:244-252`). Invariant 2 and Behavior 7's flow-indicator set are correctly grounded, and Behavior 8's non-string-`id` refusal is real.
- `lib/diagnostics/index.mjs` — a containment guard of the shape Invariant 6 describes exists (raw `..` rejection → prefix-scoped roots → realpath → per-root containment).
- The writable-registry → root-key table: `checks` / `reviewers` / `diagnostics` / `boundaries` all match their loaders and their on-disk files. Seven registries on disk, confirmed.
- The `diagnostics.yaml` allowlist row matches `validateEntryShape` verbatim.
- The three splice forms are all genuinely present on disk (`boundaries: []`, `reviewers: []`, indented comment scaffolds).
- Dropping `MERGE_WOULD_TRUNCATE` is self-consistent with the in-place splice.
- The one-way dependency framing against `explicit-governance-registries.spec.md` agrees on both sides.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — blocker

- **blocker_id:** `structural-architect:allowlist-schema-mismatch:621ebb0e`
- **section_anchor:** `changes-catalog`
- **Location:** Changes Catalog → per-registry field allowlist, `validate.yaml` row; Target State → "The write is inert"; Behavior 9; Acceptance Criteria (reference-extension row)

The `validate.yaml` row is not derived from its consumer. `lib/governance/validate-config.mjs` reads `fail_fast` (`:246`) — absent from the row — and `validateQualityGate` (`:431-435`) makes `command` **required** for `kind: quality-gate`, rejecting entries without it as `QUALITY_GATE_COMMAND_MISSING`. `kind` is allowlisted with no value constraint, so an extension may declare `quality-gate` but can never satisfy it. This is precisely the rev-2 failure the spec says it corrected for `gates.yaml`, relocated to a registry that *is* writable. The sole consumer proves it: `extensions/example-validation-check/adev-extension.yaml` declares `target: validate.yaml`, `kind: quality-gate`, `command: [bash, …/check.sh]` — refused outright under this allowlist and unfixable by dropping `command`. The acceptance criterion "or is updated in the same change if it does not" cannot be met; there is no valid rewrite. The converse horn: `validate.yaml` carries an executable `command` field, so "an extension cannot contribute an executable field at all" and Behavior 9's "no install path introduces a shell string" are both false as scoped. (`deterministic-check` is likewise dead for extensions, restricted to `BUNDLED_DETERMINISTIC_IDS` at `:214`.)

**Recommendation:** Decide `validate.yaml`'s executable surface explicitly, as was done for `gates.yaml`: either constrain `kind` to a value subset needing no `command` (`subagent-review`, `observational`) and state that consequence for the reference extension, or admit `command` with its argv-list-only, no-interpolation, no-`shell`, no-`cwd` constraints (`:437-476`) restated as spec obligations. Add `fail_fast` either way, and reconcile the "inert" claim and Behavior 9 with whichever is chosen.

### SA-2 — blocker

- **blocker_id:** `structural-architect:nested-shape-unspecified:6b6a9cf0`
- **section_anchor:** `changes-catalog`
- **Location:** Changes Catalog → per-registry field allowlist, `review.yaml` row; Behavior 7; Migration Path Step 2

`patterns`, `keywords`, `min_score` are listed as top-level `review.yaml` fields. `review-config.mjs` never reads them there — they live at `dispatch.triggered.{patterns,keywords,min_score}` (`:97-103`, `:180+`). More structurally: the allowlist is a flat name list with no depth semantics, yet `review.yaml`'s schema is nested and mandatory — `validateReviewer` requires exactly one of `prompt` (string) or `package` (**object**, with required `package.skill` and `package.adapter`, `:349-411`), and `dispatch` in `triggered` form is an object. Three contracts are undefined for nested values: (a) whether allowlisting `package`/`dispatch` admits arbitrary sub-keys unchecked, defeating the exhaustiveness claim; (b) Behavior 7 says "any supplied scalar" without specifying traversal into nested maps; (c) Step 2's splice never says how an object-valued field is emitted — today's `serializeGovernanceYaml` handles only scalars and string arrays, and `validateGovernanceEntry` (`:95-96`) rejects nested objects outright, so `review.yaml` is currently unwritable in its own required shape.

**Recommendation:** Replace the three phantom fields with `dispatch` in its documented forms, and state the allowlist's depth contract: which fields may be objects, the permitted key set at each level, that scalar rejection applies recursively to every leaf, and that the splice emits nested maps. Then re-derive whether `package` — which resolves and invokes an external skill plus adapter (ADR-0003 §Decision) — belongs in the writable set at all, using the same reasoning applied to `gates.yaml`.

### SA-3 — warning

**Location:** Behaviors 2 and 9, Acceptance Criteria, Improvements.

"not one of the **five** known registry files" contradicts the four-row table and Invariant 5 ("one of the four writable registries"). `install.mjs` constraining `target` to a "known registry set" inherits the ambiguity. Normalize every occurrence to four.

### SA-4 — warning

**Location:** Changes Catalog → `gates.yaml` exclusion rationale.

Routing all extension execution to `diagnostics.yaml` reads against ADR-0010's role table, which names diagnostics **NOT for** "Shell-command quality gates (use `gates.yaml`)" and scopes it to artifact-level verifiability; decision-flow step 2 sends deterministic commands to `gates.yaml`. The substitution is defensible for *third-party* contributions but is a narrowing ADR-0010 does not make. State it as a third-party-specific exception rather than as what "ADR-0010 assigns that surface."

### SA-5 — warning

**Location:** Invariants 4 and 6, Behavior 6.

(a) `review.yaml`'s actual provenance field is `__source` (`review-config.mjs:390`), which Invariant 4 never names — a forged `__source` falls through to `GOVERNANCE_FIELD_NOT_ALLOWED`, contradicting Behavior 6's stated precedence for installer-owned fields. Name `__source` explicitly. (b) Invariant 6 correctly declares the `lib/diagnostics/index.mjs` guard a dependency, but nothing pins it: no acceptance criterion asserts it, and the spec does not modify that module. Add a criterion that an extension-contributed `runner` containing `..` or resolving outside the allowlist roots is refused end-to-end through install, so a regression there fails this spec's suite rather than silently voiding the invariant.

### SA-6 — suggestion

**Location:** Acceptance Criteria.

The "round-trip a maximal valid entry per registry through that registry's loader" criterion is the right test and would have caught SA-1 and SA-2. Keep it, and make the maximal entries explicit per registry so the assertion cannot be satisfied by a minimal one.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

### SEC-1 — blocker

- **blocker_id:** `security-reviewer:input-validation:1dc5f548`
- **section_anchor:** `changes-catalog`
- **Category:** input-validation

The `validate.yaml` allowlist omits `command` while admitting `kind`; `validate-config.mjs:250,430-460` requires an argv `command` for `kind: quality-gate`, which the only shipped governance extension declares. So the spec both (a) reproduces the exact rev-2 failure mode it rejected for gates — an entry that installs and is then discarded by its own consumer, breaking the reference extension — and (b) leaves the arbitrary-execution closure incomplete in principle: `validate.yaml` is a second command-bearing registry, and "each row is derived from the schema its consumer enforces" is falsified for it. Excluding `gates.yaml` while admitting `kind: quality-gate` in a writable registry is inconsistent: **the sink moved, it did not close.**

**Recommendation:** Decide explicitly and state it: either restrict the `validate.yaml` allowlist's `kind` to non-executing kinds and refuse `quality-gate` with a named code, or admit `command` under the argv-only constraints `validate-config` already enforces plus a per-token scalar check — then drop the Improvements claim "an extension cannot contribute an executable field at all," which is untrue either way. Update the acceptance criterion so the reference extension's outcome is asserted, not left as "or is updated."

### SEC-2 — blocker

- **blocker_id:** `security-reviewer:input-validation:926c7e60`
- **section_anchor:** `behaviors-7`
- **Category:** input-validation

Behavior 7 constrains scalars but never array elements; every allowlist admits array fields (`after`, `patterns`, `keywords`, `exclude`), and array serialization is unspecified. The one place today's writer emits quotes is arrays (`content-install.mjs:266`, `` [${value.map(v => `"${v}"`).join(', ')}] ``), with no escaping. An element such as `a", x: {command: rm -rf /}, y: "b` re-parses through `parseFlowSeq`/`splitFlow`/`parseFlowMap` into attacker-chosen structure — the precise breach Invariant 2 claims to prevent, reached without any rejected character appearing in a top-level scalar. Nested arrays/objects inside a supplied array are also unaddressed.

**Recommendation:** State that scalar rejection applies recursively to every string an entry contributes, array elements included, and that a non-string array element or any nested array/object is refused with `GOVERNANCE_SCALAR_UNSAFE` / `GOVERNANCE_FIELD_NOT_ALLOWED`. Pin the array emission form in Step 2 (flow sequence of unquoted, already-rejection-checked tokens) and add an acceptance criterion asserting an element of `a", x: {command: y}, z: "b` is refused.

### SEC-3 — warning · authorization

**The diagnostics redirect is not available.** No install path writes into `.context-index/diagnostics/` — `content-install.mjs` writes only to `domains/`, `governance/`, `samples/`, `skill-extensions/` (`:64,:169,:286,:406`), and the plugin runner root is `<plugin>/lib/diagnostics` (`lib/diagnostics/index.mjs:343-348`), which no extension can write. An extension-contributed `runner:` can therefore only name a plugin-shipped module or a nonexistent path that fails `realpathSync` containment. "Extensions that need to execute something contribute a `diagnostics.yaml` runner instead" specifies behavior against a mechanism that does not exist — the defect class this spec's own Out of Scope section invokes to defer uninstall. Security-wise the posture is *stronger* than claimed, but a later implementer closing the gap by adding a runner-install path would reopen third-party code execution under a guard that bounds only *where* the file is, never *whose* code it is.

**Recommendation:** Restate the exclusion as "extensions have no governance execution surface today," note the redirect requires a runner-install path that does not exist, and record it as a tracked follow-up with an explicit precondition: an extension-installed runner is untrusted code, so containment alone is not the control.

### SEC-4 — warning · input-validation

"Refuses and writes nothing" (Behaviors 1, 5, 6, 7, 10) is not achievable as written. `install.mjs:89-98` loops over every `provides.governance` block calling `mergeGovernanceEntries` per target, and domain-profile/sample writes (`:75-105`) already completed. A manifest with a valid first target and a malicious second leaves the first registry mutated with no rollback.

**Recommendation:** Specify validation of *all* governance blocks and all their entries before the first write, and scope the guarantee precisely: "no governance registry is modified when any entry in any block is refused."

### SEC-5 — warning · input-validation

The splice table covers three on-disk forms but not three reachable ones: target key absent from an otherwise valid file; registry file absent entirely (today auto-created, `:170-172`); key appearing more than once or nested under another key. Related: existing entries come from `parsed[rootKey]` being an array (`:184`) — when it is a scalar or map, `existingEntries` stays `[]` and collision detection silently degrades to append-everything.

**Recommendation:** Add rows for key-absent, file-absent, duplicate/nested key, and root-key-present-but-not-an-array (refuse — never treat as empty, same reasoning as defect 7).

### SEC-6 — suggestion · input-validation

Three load-bearing citations are inaccurate. (a) Invariant 6 cites `lib/diagnostics/index.mjs:13-14, :61-68` — those are a doc comment and `PLUGIN_ROOT`; the actual guard is `containsDotDot` `:73-75` plus `resolveRunnerContained` `:88-147`, including the cross-root confused-deputy check `:130-137`. (b) `merge-gates.mjs` requires `command` (`:29-31`) *and* rejects shell-form strings, requiring an argv list (`:34-38`), so "no valid extension-contributed gate that does not carry a shell string" is wrong in form though right in consequence — the argv is joined back into a string that `doctor.mjs:965` runs under `sh -c`. (c) The rationale text says "`command` is deliberately absent from the `gates.yaml` row" of a table that, at rev 3, has no `gates.yaml` row.

### SEC-7 — suggestion · input-validation

Type-coercion coverage is narrower than the parser. Behavior 8 cites only integer coercion, but `parseInlineValue` also maps `null`/`~`→null and `true`/`false`→boolean (`:176-178`). An empty-string field serializes to a bare `key:` line, which `parseMap:108-111` turns into `{}` — a nested object the current validator forbids on input. Nothing caps field length (only `id`, at 128) or entry count.

**Recommendation:** Generalize Behavior 8 to "any supplied scalar that does not re-parse as the same string is refused," refuse empty scalars, and add a per-field length cap and per-target entry cap.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

### CON-1 — blocker · contract

- **blocker_id:** `consistency-analyzer:contract:54079edf`
- **section_anchor:** `changes-catalog-added-per-registry-field-allowlist`

**This spec:** the `validate.yaml` allowlist row, plus "Each row is derived from the schema its consumer enforces, not from convention."
**Conflicts with:** `lib/governance/validate-config.mjs::validateQualityGate` (`:415-478`) makes `command` (argv-list) required for `kind: quality-gate`; `validateCheck` (`:246`) also reads `fail_fast`. Neither is in the allowlist. The only shipped consumer of the whole path, `extensions/example-validation-check/adev-extension.yaml`, declares exactly `kind: quality-gate` with `command: [bash, …/check.sh]` — refused with `GOVERNANCE_FIELD_NOT_ALLOWED`, and no `quality-gate` entry can ever pass.
**Recommendation:** Add `command` (and `fail_fast`), or explicitly state `quality-gate` is not an extension-contributable kind for `validate.yaml` (mirroring the `gates.yaml` reasoning) and update the reference extension and acceptance criteria to reflect a deliberate exclusion rather than a silent gap.

### CON-2 — blocker · contract

- **blocker_id:** `consistency-analyzer:contract:19536469`
- **section_anchor:** `changes-catalog-added-per-registry-field-allowlist`

**This spec:** the `review.yaml` allowlist includes `dispatch`, `package`, `patterns`, `keywords`, `min_score`, citing `package` as "the two-stage reviewer form documented by ADR-0003," derived from `review-config.mjs`.
**Conflicts with:** (a) `content-install.mjs::isValidGovernanceValue` (`:139-147`, unchanged by this spec's ADDED/MODIFIED/REMOVED sections) rejects any nested-object value, yet `dispatch` (`{triggered:{…}}`) and `package` (`{skill, adapter, args}`) per `validateReviewer` (`:334-421`) require object values to function at all. (b) `patterns`/`keywords`/`min_score` are never top-level entry fields — they live under `dispatch.triggered` (`shouldDispatch`, `:163-189`). The acceptance criterion "Each allowlist accepts every field its consumer's schema reads, asserted by round-tripping a maximal valid entry" cannot pass for `review.yaml` as specified.
**Recommendation:** Either state that the nested-object restriction is relaxed for `dispatch`/`package` and specify how the splice/serializer handles composite values (the three-form table does not cover it), or drop the object forms from extension-contributable scope and correct the table to show `patterns`/`keywords`/`min_score` as nested under `dispatch`.

### CON-3 — warning · contract (cross-cutting/ADR)

**This spec** retains `validate.yaml` as extension-writable, and its worked example throughout is a `kind: quality-gate` contribution to it.
**Conflicts with** ADR-0010 §"Role assignments", which states `validate.yaml` is explicitly **NOT** for "new project-defined checks (those go to diagnostics or boundaries) — the skill is the surface that *runs* the checks; it is not a registry for additional ones."
**Recommendation:** Either note this as a deliberate, ADR-documented deviation (as the spec does for its other exclusions), or redirect the reference extension's example toward the surface ADR-0010 assigns.

---

## Summary

**Total findings:** 16 (6 blockers, 7 warnings, 3 suggestions)

Rev 3's method — deriving the tables from the consumer code — worked where it was applied. The `gates.yaml` exclusion, the root-key table, the splice forms, the `diagnostics.yaml` allowlist, and the parser-grounded scalar and `id` rules all verified clean against source, independently, by three reviewers. That is real progress over rev 2.

It was not applied uniformly. All three reviewers converged, without coordination, on the same two rows:

1. **`validate.yaml`** — the row omits `command` and `fail_fast`, both read by `validate-config.mjs`, while allowlisting `kind` without constraining its value. The consequence is the rev-2 failure mode verbatim, relocated: an extension declaring `kind: quality-gate` installs and is then discarded by its own loader. The only shipped extension does exactly this, and the acceptance criterion's escape hatch ("or is updated in the same change") has no satisfying rewrite. It also means the executable-field closure is scoped to `gates.yaml` when a second command-bearing registry remains writable.
2. **`review.yaml`** — three of its listed fields are read nowhere at that position, and the two fields the schema actually requires (`dispatch` in triggered form, `package`) are objects, which the entry model still forbids and the splice does not specify emitting.

Two further items are worth the revision's attention beyond the blockers: the `diagnostics.yaml` redirect offered in exchange for `gates.yaml` writability has no delivery mechanism today (SEC-3), which weakens the trade the exclusion is presented as; and the "writes nothing" guarantee is per-target, not per-install (SEC-4).

**Action required:** Run `/adev:specify --revise` against `extension-governance-merge-hardening.blockers.md` to produce revision 4, then re-review. Do not proceed to `/adev:plan`.

**Governance footer:** `.context-index/governance/gates.yaml` defines `transitions: {}` — no `spec-to-plan` `approver_role` is configured, so no additional human approver is named for this transition. The spec's own System Constitution Reference notes that this change alters what a third party may write into governance config and is therefore a "Requires Human Approval" boundary under the constitution.

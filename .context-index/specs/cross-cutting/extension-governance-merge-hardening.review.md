---
spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
date: 2026-08-15
verdict: BLOCK
rigor_tier: full
tier_source: explicit --tier full
risk_level: high
domain: software
domain_source: default
last-reviewed-revision: 1
file-sha: ecac25c96fe746663d1c36b843b744c22468c9bcdea249cf5f56b211c9321496
blockers: 12
warnings: 7
suggestions: 3
---

# Architecture Review: extension-governance-merge-hardening

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md`
> **Charter:** none (cross-cutting spec; `affects: [domain-extensions, validation, unified-gates]`)
> **Rigor tier:** full (explicit `--tier full`; risk policy for `risk_level: high` also resolves `review_mode: full`)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry source: `adev domain load-reviewers --module domain-extensions` → domain `software` (source level `default`), three bundled reviewers, all `dispatch: always`, all `severity_cap: blocker` (no severity clamping applied). `.context-index/governance/review.yaml` declares `reviewers: []`, so no project overrides. Zero registry warnings.

Heuristics injected: 2 module heuristics for `domain-extensions` (extension packaging pattern; end-to-end `installExtension` integration testing).

---

## Structural Architect (structural-architect)

**Verdict:** BLOCK — 5 blockers, 2 warnings, 1 suggestion

The split is sound: the retained scope is one contract (a write-integrity property over untrusted manifest input), and the Contract sentence genuinely entails Behaviors 1-9. Dependency direction is one-way in *this* spec's text — no behavior here needs `materialized_at`, `enabled`, or `materialize`, and Invariant 4's "any marker owned by the composition model" is the right generic reservation. The blockers below are all of the parent's recurring class: named mechanisms that neither exist today nor appear in the Changes Catalog.

### SA-1 — blocker — no mechanism for comment-preserving serialization

- `blocker_id`: `structural-architect:missing-mechanism:d2eb2a69`
- `section_anchor`: `behaviors-3`
- **Location:** Behavior 3; Target State (`serializeGovernanceYaml` row); Changes Catalog ADDED; Migration Step 2.

Behavior 3 requires that "every other key and comment in the file is preserved byte-identically," and the Acceptance Criteria require comments intact and a `transitions:` block untouched. `serializeGovernanceYaml` rewrites the file from a parsed object; a comment-preserving round trip requires either a YAML emitter or a text-splice strategy. `lib/profiles/yaml.mjs` exports `parseYaml` only — there is no serializer and no round-trip facility anywhere in the repo, and the constitution forbids a new dependency without an ADR. The Changes Catalog adds scalar escaping but names no mechanism for preservation.

**Recommendation:** Name the mechanism in Changes Catalog ADDED (e.g. an in-place text splice over the target root key's block, which needs no emitter), and state what happens to comments interleaved *inside* the target key's entry list — Behavior 3 currently scopes preservation to "every other key," leaving those undefined.

### SA-2 — blocker — no uninstall entry point to add reversal to

- `blocker_id`: `structural-architect:missing-mechanism:4613f443`
- `section_anchor`: `migration-path-step-4`
- **Location:** Migration Step 4; Behavior 9; Target State (`uninstallExtension` row); Changes Catalog ADDED ("Governance reversal in extension uninstall").

There is no extension uninstall path to add reversal *to*. No `uninstallExtension` exists in `lib/`, and `adev extension` has exactly two subcommands (`install`, `list`, `cli/index.mjs:1207-1295`); the `uninstall` verb at `:822`/`:1195` is plugin/provider uninstall. The Target State table lists `uninstallExtension` under "Function | After" as though it were an existing function being modified. Behavior 9 and the byte-identical round-trip criterion are unimplementable as written.

**Recommendation:** Either add the uninstall entry point (CLI verb + function) explicitly to Changes Catalog ADDED, or move Step 4 / Behavior 9 out of scope until an uninstall path exists. Note the same item is claimed by the parent spec (see SA-5 / CON-1).

### SA-3 — blocker — the registry set and root-key table are never enumerated

- `blocker_id`: `structural-architect:undefined-enumeration:e36744fa`
- `section_anchor`: `behaviors-2`
- **Location:** Behavior 2; Target State Improvements ("one of five known registry files"); Changes Catalog ADDED ("Explicit registry → root-key table"); Error Cases (`UNKNOWN_GOVERNANCE_TARGET`).

The registry set and its root keys — the central ADDED artifact — are never enumerated. The count given is five; `.context-index/governance/` holds seven files (`boundaries`, `diagnostics`, `gates`, `review`, `risk-policies`, `sensitive-paths`, `validate`). Behavior 2 as written would refuse `risk-policies.yaml` and `sensitive-paths.yaml` with `UNKNOWN_GOVERNANCE_TARGET`, a scope decision the spec never states. Only `validate.yaml → checks` is fixed (defect 5); the other six mappings are unspecified.

**Recommendation:** Enumerate the table explicitly (file → root key), and state whether excluding `risk-policies.yaml`/`sensitive-paths.yaml` is deliberate. Fix the "five" quantifier wherever it appears.

### SA-4 — blocker — per-registry allowlist contents undefined, and the worked example turns on the undefined case

- `blocker_id`: `structural-architect:ambiguous-behavior:7a4914e2`
- `section_anchor`: `behaviors-5`
- **Location:** Behavior 5; Problems defects 2 and 3; Acceptance Criteria.

`extensions/example-validation-check/adev-extension.yaml` supplies `command:` on a `validate.yaml` entry; defect 3 asserts `command` is "a legitimate `gates.yaml` field," implying it is not legitimate elsewhere. If `command` is outside `validate.yaml`'s allowlist, Behavior 5 refuses the reference install, contradicting the criterion "installing the reference extension … yields 8 entries under `checks:`" and breaking `install-argv-form-preserved (SEC2-11)`, which currently passes and asserts `command` survives — against Invariant 1. Additionally, `source` is stamped by the installer yet refused when supplied (Behavior 6), so it must simultaneously be inside and outside each allowlist; the relationship between the allowlist and the installer-owned set is unstated.

**Recommendation:** Specify each registry's allowlist (at minimum `validate.yaml`'s, and whether `command` is in it), and state the allowlist/installer-owned-field relationship as two disjoint sets rather than one predicate. Then reconcile SEC2-11 explicitly — Changes Catalog MODIFIED currently touches only `:206`.

### SA-5 — blocker — the split is one-way in direction but not in ownership

- `blocker_id`: `structural-architect:module-boundary-violation:bc1f397a`
- `section_anchor`: `integration-points`
- **Location:** Integration Points 1 ("This spec does not depend on that one … The dependency is one-way"); Changes Catalog.

Four items in this spec's Changes Catalog are still claimed by `explicit-governance-registries.spec.md`'s own catalog: `inferRootKey` root-key table (`:122`), `serializeGovernanceYaml` sibling-key preservation (`:123`), `tests/lib/extensions/example-validation-check-install.test.mjs:206` (`:124`), and `adev extension uninstall --name <n>` governance reversal (`:110`). Two specs planning the same edits will produce conflicting tasks, and the uninstall item is the one whose entry point does not yet exist (SA-2) — so neither spec establishes it.

**Recommendation:** Prune those four from the parent's Changes Catalog (leaving its Step 3 gate reference), or state ownership explicitly here. The split is only clean once each edit has exactly one owner.

### SA-6 — warning — defect count contradicts the defect list

**Location:** Current State / Problems.

"Five defects, all in the same function cluster" precedes a list of **seven**, and defect 7 (no uninstall reversal) is not in that cluster — nothing under `lib/extensions/` implements uninstall at all. The Target State table lists five functions, one of which does not exist.

**Recommendation:** Correct the count and separate defect 7 as a gap rather than a defect in the cluster.

### SA-7 — warning — `MERGE_WOULD_TRUNCATE` is unreachable as specified

**Location:** Behavior 8 / Error Cases.

If Behavior 3 preserves sibling keys by construction, no merge can drop a root key, so Behavior 8 is unreachable and no acceptance criterion exercises it. Its detection predicate ("would drop") is also unspecified — it implies a pre/post comparison the spec never describes.

**Recommendation:** Either declare it an explicit post-write assertion with a stated comparison, or remove it. (See SEC-2 for a reachable trigger.)

### SA-8 — suggestion — error-code name is narrower than its quantifier

**Location:** Behavior 6 / Error Cases.

`GOVERNANCE_SOURCE_FORGED` fires for *any* installer-owned field, not just `source`, and Invariant 4 anticipates markers owned by the other spec. A name like `INSTALLER_OWNED_FIELD_SUPPLIED` would keep the code stable when the composition spec adds `materialized_at` to that set.

### No findings on

ADR compliance (ADR-0003's merge-by-id is narrowed, not contradicted — the narrowing to append-or-skip is stated and justified; ADR-0010 and ADR-0019 are untouched), the Contract's entailment of the behavior list, and the Step 1 sequencing rationale, which is correct — escaping and containment do gate every later guard.

---

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK — 4 blockers, 3 warnings, 2 suggestions

The spec correctly identifies the traversal, the fill-gap injection, and the escaping gap. The findings below are where the stated remedy does not close the surface it claims, or where a named behavior is unimplementable/ambiguous as written.

### SEC-1 — blocker — input-validation — append-only does not close the `command:` injection path

- `blocker_id`: `security-reviewer:command-injection:d010f2a7`
- `section_anchor`: `behaviors-3`

The spec claims (Target State → Improvements) that "the `command:` injection path is closed by construction" by making writes append-only. It is not. Append-only closes only the *collision* half. Behavior 3 explicitly permits an extension to **append a brand-new entry** to `gates.yaml` carrying any `command:` value, and `lib/gates/doctor.mjs:965` executes gate commands as `spawnSync("sh", ["-c", command])` — shell form, full metacharacter surface. The reference extension already declares a `command:` field, so this is the designed path, not a hypothetical. Nothing in the Behaviors, Invariants, or Error Cases constrains the *value* of a newly appended executable field. Note the asymmetry the spec should be exploiting: `validate.yaml` quality-gates are already hardened (`validate-config.mjs:437` rejects shell-form strings, requires argv lists, blocks interpolation; `quality-gate.mjs:44` uses `execFile` with `shell:false`), while `gates.yaml` has no equivalent and runs through `sh -c`.

**Recommendation:** Add a behavior: an extension-supplied `command` **must** be a YAML list of argv tokens (reuse the `QUALITY_GATE_COMMAND_SHELL` / `QUALITY_GATE_INTERPOLATION` rules at `validate-config.mjs:437-463`); a string `command` is refused with a new `GOVERNANCE_SHELL_COMMAND` code. Additionally, appending *any* entry carrying an executable field must require explicit operator opt-in at install (a `--allow-commands` flag or interactive confirm that prints the argv), since install-time write == later execution. OWASP A03:2021 (Injection); also matches the constitution's "Requires Human Approval" boundary.

### SEC-2 — blocker — input-validation — the parse-failure fallback is a silent destructive write

- `blocker_id`: `security-reviewer:input-validation:62c5590b`
- `section_anchor`: `behaviors-8`

`mergeGovernanceEntries` currently does `try { parseYaml(raw) } catch { /* start fresh */ }` (`content-install.mjs:187-189`). The spec never addresses this branch. Two consequences survive every proposed fix:

1. `lib/profiles/yaml.mjs` is a documented **subset** parser (no block scalars, anchors, multi-line strings). A perfectly valid `gates.yaml` it cannot parse causes the whole project registry to be silently replaced by the extension's entries — the exact truncation `MERGE_WOULD_TRUNCATE` claims to prevent.
2. On parse failure `existingEntries` is empty, so `byId` is empty, so **collision detection reports no collision** — Invariant 3 ("an existing entry is never mutated") and Behavior 4 are both bypassed, and the existing entry is destroyed rather than skipped.

Meanwhile, as written, Behavior 8 is *unreachable*: if Behavior 3 preserves every other key byte-identically, no merge can ever "drop an existing root key," so `MERGE_WOULD_TRUNCATE` has no triggering condition.

**Recommendation:** Redefine Behavior 8's trigger to the reachable one: *when the target registry exists and cannot be parsed, or when the post-merge document does not contain every root key present pre-merge, refuse with `MERGE_WOULD_TRUNCATE` and write nothing.* Delete the `catch { start fresh }` fallback explicitly in the REMOVED section (it is a silent-failure destructive write, not error handling). Add an acceptance criterion: a `validate.yaml` containing a construct the minimal parser rejects is left byte-identical and the install fails.

### SEC-3 — blocker — authorization — an unenumerated allowlist is not an allowlist

- `blocker_id`: `security-reviewer:authorization:c1a46dad`
- `section_anchor`: `behaviors-2`

Behavior 2, the Improvements bullet, and Acceptance Criterion 2 all rest on "the five known registry files," which the spec never enumerates. `.context-index/governance/` holds **seven**. Two of the seven are the project's own guard boundary: `sensitive-paths.yaml` (extend-only; the effective set is `DEFAULT_SENSITIVE_PATHS ∪ entries`, so it can only ever be widened) and `risk-policies.yaml` (`require_review`, `require_hitl_approval`, `additional_gates`). A third-party extension that can append to either weakens the controls that would otherwise catch it, and `risk-policies.yaml` is keyed by policy tier, not an `id` array, so the entry model does not even apply.

**Recommendation:** Enumerate the writable set explicitly in the spec body and restrict it to registries whose schema is an id-keyed array: `gates.yaml`, `review.yaml`, `validate.yaml`, `diagnostics.yaml`, `boundaries.yaml`. State that `risk-policies.yaml` and `sensitive-paths.yaml` are **never** extension-writable and that targeting them yields `UNKNOWN_GOVERNANCE_TARGET`. Specify that the check is exact string equality against that frozen set, performed on the declared `target` value *before* any `join()` — not a `basename()` or `endsWith()` match, which `x/../../gates.yaml` would satisfy.

### SEC-4 — blocker — input-validation — the escaping contract has no algorithm and no symmetric reader

- `blocker_id`: `security-reviewer:input-validation:268105f2`
- `section_anchor`: `behaviors-7`

The spec itself argues (defect 6, Migration Step 1) that every other guard is conditional on escaping — then specifies it as "emitted as a quoted, escaped scalar" with no algorithm. That admits an implementation like the existing array path (`serializeYamlValue:266`: `` `"${v}"` ``) which double-quotes without escaping the embedded `"` or `\`, reintroducing structure injection on the first quote character. Worse, the round trip is broken in this codebase: `lib/profiles/yaml.mjs`'s `unquote()` (`:244`) strips the outer quotes but performs **no unescape** and does not handle `''` doubling — so a correctly double-quote-escaped scalar is read back with literal backslash sequences, and a single-quoted `'it''s'` reads back as `it''s`. Acceptance Criterion 7 tests only `\n`, `"`, `:` and would pass an implementation that mangles `\`, `#`, and leading `!`/`&`/`*`/`%`/`-`/`?`.

**Recommendation:** Specify the algorithm in the spec, not the implementation. Recommended, given the zero-dependency constraint and the parser's limits: **reject rather than escape.** Constrain extension-supplied scalars to a printable safe charset (`/^[\x20-\x7E]*$/` minus `"`, `'`, `\`, and a leading YAML indicator character), refuse anything else with a new `GOVERNANCE_UNSAFE_SCALAR`, and emit single-quoted. This keeps write and read symmetric under the existing parser and needs no escaping/unescaping pair. Also apply the consuming layer's own charset to `id` at write time — `validate-config.mjs:158` enforces `/^[a-z0-9][a-z0-9._-]*$/` on read, so anything else installs and is then silently dropped. Extend Acceptance Criterion 7 to cover `\`, `#`, `%`, `&`, `*`, `!`, and a leading `-`.

### SEC-5 — warning — input-validation — the error contract is not type-consistent

(a) `source` is both outside any registry allowlist *and* installer-owned, so Behaviors 5 and 6 both fire and the resulting code is implementation-dependent — no test can be deterministic. (b) Behavior 6 and Invariant 4 quantify over "**any** installer-owned field," but the code is named `GOVERNANCE_SOURCE_FORGED`, which is only correct for one member of that set.

**Recommendation:** State an explicit precedence — the installer-owned-field check runs first and always wins — and rename the code to `GOVERNANCE_INSTALLER_FIELD_SUPPLIED`, with the message naming the offending field. Define the installer-owned set as a frozen constant in the spec (`source`, plus any marker the composition model adds) rather than by prose reference to another spec.

### SEC-6 — warning — authorization — silent apply of third-party executable configuration

Nothing in the spec surfaces what a governance install will write before it writes it. The install path is non-interactive, and its output today is a `mergesApplied` string list produced *after* the write. For a third-party manifest whose entries become executed configuration, silent apply is the wrong default, and the constitution lists changes to what third parties may write as requiring human approval — a point the spec's own Constitution Reference acknowledges without turning into a behavior.

**Recommendation:** Add a behavior: `adev extension install` prints each governance entry (target registry, id, full field set) and, absent `--yes`, requires confirmation before any write; add `--dry-run` that runs the full validation chain and prints the would-be diff with exit 0 and zero writes.

### SEC-7 — warning — authorization — `source` is a forgeable, hand-editable removal key

Behavior 9 removes entries "carrying its `source`," but `source` is an ordinary data field in a **project-owned, hand-editable** file. Three consequences: a project-authored entry that happens to carry `source: extension:foo` is deleted; an extension-installed entry the project has since adopted and modified is deleted without warning; and an extension can stamp entries as belonging to a *different* extension unless SEC-5's rejection is enforced first. Separately, Acceptance Criterion 9 ("byte-identical to pre-install state") is not generally achievable once Behavior 3 requires comment- and whitespace-preserving round trips — restoring exact bytes after an append-then-remove requires the removal to be the textual inverse of the append, which the spec does not state.

**Recommendation:** Have uninstall compute the removal set from the install record (the extension registration written at `install.mjs:139-166`), using `source` only as a cross-check, and refuse to remove an entry whose current field set differs from what was installed — report it as retained-because-modified. Restate Criterion 9 as "byte-identical when the entry has not been modified since install," which is testable.

### SEC-8 — suggestion — rate-limiting — the governance contribution is unbounded

`validateGovernanceEntry` caps only `id` at 128 chars; every other string field, every array, and the entry count itself are unbounded. An extension declaring 10^5 gate entries is accepted, and `runGateDoctor --execute` then spawns each with a `DEFAULT_TIMEOUT_MS` per-command budget and no aggregate ceiling.

**Recommendation:** Specify per-registry caps in the spec: max entries per extension per registry (e.g. 32), max scalar length (e.g. 1024), max array length (e.g. 64), refused with a `GOVERNANCE_LIMIT_EXCEEDED` code.

### SEC-9 — suggestion — input-validation — `target` has an implicit default and the containment check is unordered

`install.mjs:91` defaults an absent `target` to `'review.yaml'` — an extension that omits `target` entirely writes into the reviewer registry by accident of a default. The spec's MODIFIED entry constrains `target` to the known set but does not remove the implicit default. Also, the `resolve()` + `startsWith()` pattern the spec adopts from `installSamples` does not resolve symlinks; it is sufficient here only because SEC-3's exact-match allowlist runs first.

**Recommendation:** Make `target` required — absent `target` refuses with `UNKNOWN_GOVERNANCE_TARGET` naming the omission. Keep the containment assert as defense-in-depth and state in the spec that it is ordered *after* the allowlist.

### Not flagged (handled elsewhere, correctly)

Traversal in `installSamples` / `installSkillExtensions`; extension `name` charset (validated kebab-case at `manifest-schema.mjs:97`, so `source: extension:<name>` cannot inject); `validate.yaml` argv-only enforcement and output redaction; the doctor's reentrancy guard and `stdio: "ignore"`.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK — 3 blockers, 2 warnings

### CON-1 — blocker — duplicate-ownership

- `blocker_id`: `consistency-analyzer:duplicate-ownership:f1a38fe5`
- `section_anchor`: `changes-catalog`

**This Spec:** Changes Catalog / MODIFIED (lines 133-136) claims `content-install.mjs` — "the five functions above" (which includes `inferRootKey` and `serializeGovernanceYaml`) — and `tests/lib/extensions/example-validation-check-install.test.mjs:206`.

**Conflicts With:** `explicit-governance-registries.spec.md` Changes Catalog / MODIFIED (lines 122-124) claims the identical three items verbatim: `content-install.mjs::inferRootKey`, `content-install.mjs::serializeGovernanceYaml`, and the same test file at line 206 with the same fix description. The parent's own "split" narrative (lines 81-93) says this work "is now `extension-governance-merge-hardening.spec.md`," and its Migration Path Step 3 correctly treats the dependency's implementation as external ("a gate, not work owned here") — but its Changes Catalog was never pruned to match. The parent now contradicts itself internally and contradicts this spec.

**Recommendation:** The split was not clean. Remove the parent's Changes Catalog MODIFIED entries for `inferRootKey`, `serializeGovernanceYaml`, and the test-file line-206 fix (or mark them "owned by `extension-governance-merge-hardening.spec.md`; listed here for cross-reference only").

### CON-2 — blocker — contract

- `blocker_id`: `consistency-analyzer:contract:520c0f2c`
- `section_anchor`: `target-state`

**This Spec:** Target State / Structure (line 104) lists `uninstallExtension` in the same table as the four functions being modified. Changes Catalog ADDED (line 127) says "Governance reversal in extension uninstall," and Behavior 9 / Migration Step 4 / an Acceptance Criterion all assume install/uninstall round-tripping exists as a mechanism to extend.

**Conflicts With:** Ground truth in this repo — no `uninstallExtension` function exists anywhere under `lib/extensions/`, and `adev extension` (`cli/index.mjs:1284-1293`) has exactly two subcommands, `install` and `list`. Current State's own Structure table (lines 34-39) lists only `install.mjs` and `content-install.mjs`'s four merge functions — so the spec's own sections disagree about whether uninstall pre-exists.

**Recommendation:** Either add the new `adev extension uninstall` CLI verb and `uninstallExtension` function to Changes Catalog ADDED explicitly (naming the CLI surface, not just "governance reversal"), or narrow Step 4 / Behavior 9 / the corresponding AC out of this spec's scope pending a spec that defines extension uninstall in general.

### CON-3 — blocker — contract

- `blocker_id`: `consistency-analyzer:contract:4a60dc78`
- `section_anchor`: `migration-path`

**This Spec:** Target State / Structure (line 103) requires `serializeGovernanceYaml` to preserve "sibling keys and comments"; Acceptance Criteria (line 241) assert comments intact.

**Conflicts With:** `content-install.mjs:16` imports `parseYaml` from `lib/profiles/yaml.mjs`, the project's only YAML module, which exports no serializer — its doc comment (`lib/profiles/yaml.mjs:8`) treats `#` comments as consumed input, not preserved structure, and `parseBlock` never retains them. A parse-then-reserialize pipeline built on this module cannot round-trip comments by construction. The Changes Catalog names neither a comment-preserving writer nor an alternative technique, and adding a YAML library would need an ADR under Non-Negotiable Principle 1.

**Recommendation:** Name the mechanism explicitly — either a text-splice approach (locate the target root key's block by raw-line offsets and replace only that span) or a new comment-preserving YAML module — and add it to the Changes Catalog; or drop "comments intact" if only sibling *keys* are achievable.

### CON-4 — warning — domain-model — "five registries" never enumerated

Behaviors 2 and 8, Error Cases, and the Improvements section all say "five known registry files" without enumerating them. `.context-index/governance/` holds **seven**; ADR-0010's role table names **six** conceptual surfaces; `explicit-governance-registries.spec.md`'s Current State table lists exactly five (`validate`, `review`, `diagnostics`, `gates`, `boundaries`). The "five" this spec means is presumably the parent's five, but that mapping is never stated here, so `UNKNOWN_GOVERNANCE_TARGET`'s behavior against `risk-policies.yaml` and `sensitive-paths.yaml` is unspecified by inference rather than by design.

**Recommendation:** Enumerate the five explicitly, matching the parent's Current State table, and state that `risk-policies.yaml` / `sensitive-paths.yaml` are refused via `UNKNOWN_GOVERNANCE_TARGET`.

### CON-5 — warning — contract — Invariant 1 is uncheckable against an unstated allowlist

Changes Catalog ADDED says only "Per-registry field allowlist in `validateGovernanceEntry`" with no schema. The only real consumer, `extensions/example-validation-check/adev-extension.yaml`, declares a `validate.yaml`-targeted entry with `id, kind, profile, command, severity, after` — and `tests/lib/extensions/example-validation-check-install.test.mjs` (both the positive-install test and `install-argv-form-preserved`) asserts `command`, `kind`, `profile` survive install verbatim. Invariant 1 ("All existing tests pass at every step") therefore implicitly requires the unstated `validate.yaml` allowlist to include at least those fields, but this spec never says so.

**Recommendation:** Add the concrete per-registry allowlists (at minimum `validate.yaml`'s) to the Changes Catalog or an appendix.

### No drift found beyond the above

Error-code naming (`PATH_TRAVERSAL`, `UNKNOWN_GOVERNANCE_TARGET`, etc.) follows the existing `GOVERNANCE_SCHEMA` / `SKILL_COLLISION` style already used in `content-install.mjs`, and the `source:` provenance field name matches what `explicit-governance-registries.spec.md` expects to key its drift pass on.

---

## Summary

**Total findings:** 22 (12 blockers, 7 warnings, 3 suggestions)

**Verdict:** BLOCK — `computeVerdict` with the default `blocker_threshold: 1`.

### Convergence signal for the orchestrator

All three reviewers independently converged on the same three structural gaps, which is the useful signal here — this is not three reviewers finding three unrelated things:

| Gap | Reviewers |
|---|---|
| Registry set / root-key table never enumerated | SA-3, SEC-3, CON-4 |
| Per-registry field allowlist contents undefined; collides with the reference extension's `command:` and the passing SEC2-11 test | SA-4, CON-5 |
| Comment-preserving serialization names no mechanism; repo has `parseYaml` only | SA-1, CON-3 |
| Uninstall entry point does not exist and is not added by the Changes Catalog | SA-2, CON-2, SEC-7 |
| Changes Catalog items co-claimed by the parent spec | SA-5, CON-1 |

Two findings are new substance rather than gaps, and both concern whether the remedy matches the threat:

- **SEC-1** — append-only closes the *collision* half of the `command:` injection path but not the *append* half. A newly appended `gates.yaml` entry still reaches `spawnSync("sh", ["-c", command])`. The spec's Improvements section claims this path is "closed by construction"; it is not.
- **SEC-2** — the existing `catch { start fresh }` parse-failure fallback destroys the registry silently and bypasses collision detection entirely. It is untouched by the spec, and it also supplies the reachable trigger that Behavior 8 (`MERGE_WOULD_TRUNCATE`) currently lacks (SA-7).

### Scope assessment (the question the split was meant to answer)

Two reviewers examined whether the retained scope is one contract, and both concluded it is — with one exception. The write-integrity contract genuinely entails Behaviors 1-8. Behavior 9 (uninstall reversal) does not: it requires a lifecycle mechanism that does not exist, is co-claimed by the parent spec, and is the one item both SA and CON flagged as belonging elsewhere. Removing Behavior 9, Migration Step 4, the `uninstallExtension` row and Acceptance Criterion 9 from this spec would resolve SA-2, CON-2 and SEC-7 at once and leave the remaining contract intact.

The claimed dependency direction is correct in this spec's *text* — no behavior here needs `materialized_at`, `enabled`, or the materialize verb. The problem is ownership, not direction: the parent's Changes Catalog was not pruned when the split happened.

### Action required

Run `/adev:specify --revise --spec .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md` to address the 12 blockers recorded in `extension-governance-merge-hardening.blockers.md`, then re-run `/adev:review-specs`. Planning is gated until the verdict is PASS or PASS_WITH_NOTES.

Note that CON-1 / SA-5 require an edit to a **different** spec (`explicit-governance-registries.spec.md`, Changes Catalog MODIFIED lines 122-124 and ADDED line 110). The revise loop for this spec cannot close that blocker by editing this spec alone.

### Transition gate

`.context-index/governance/gates.yaml` declares no `transitions` section, so no `spec-to-plan` `approver_role` applies. Informational only.

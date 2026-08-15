---
spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
verdict: BLOCK
date: 2026-08-15
rigor-tier: full
tier-source: explicit --tier full
last-reviewed-revision: 2
file-sha: cdeac7e4d3f21e39e497130ded90460d02176ee419a23b40bb237a610ccb3b28
reviewers-dispatched: 3
blockers: 11
warnings: 7
suggestions: 1
---

# Architecture Review: extension-governance-merge-hardening

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md` (revision 2)
> **Charter:** none (cross-cutting spec; affects `domain-extensions`, `validation`, `unified-gates`)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` → `review_mode: full` would resolve the same)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry: `templates/domains/software/reviewers.yaml` (resolved domain `software`, source level `default`); `.context-index/governance/review.yaml` holds `reviewers: []`, so no project overlay applied. No load warnings.

Heuristics injected: 3 (module `domain-extensions`).

## Revision-2 closure verification

Rev 1 drew 12 blockers, all of one class: behavior specified against mechanisms that do not exist. The closures were checked against the mechanism, not the claim.

| Rev-1 blocker | Claimed closure | Verified? |
|---|---|---|
| `bc1f397a` / `f1a38fe5` — co-claimed Changes Catalog items | Parent pruned; `source:` declared here | **Yes.** `explicit-governance-registries.spec.md` no longer names `inferRootKey`, `serializeGovernanceYaml`, the test fixup, or the uninstall verb. Parent line 105 defers `source:` declaration to this spec. Dependency is one-way. |
| `4613f443` / `520c0f2c` — uninstall reversal | Dropped entirely | **Partially.** Behavior 9, Step 4, the table row and AC 9 are gone, and no `uninstallExtension` exists in `lib/`. But the Module Impact Map still says "uninstall gains governance reversal" (CON-3 / SA-8). |
| `d010f2a7` — append-injection "closed by construction" | `command` absent from every allowlist | **For `command`, yes.** But the accompanying Invariant 6 ("an extension can never contribute an executable field") is false: `runner` is on the `diagnostics.yaml` allowlist and is `import()`-ed and invoked (SA-1 / SEC-2). |
| `268105f2` — escaping with no algorithm | Switched to rejection, `GOVERNANCE_SCALAR_UNSAFE` | **Direction correct, coverage incomplete.** The rejection set omits the flow indicators `{`/`[` and the scalar-type coercions, so Invariant 2 is false against the repo's own parser (SEC-1 / SA-2). |
| `d2eb2a69` / `4a60dc78` — comment preservation | In-place line splice | **Not established.** The splice is specified only tightly enough to work on `validate.yaml`; it is underspecified or wrong for `boundaries.yaml`, `review.yaml` and `gates.yaml` (SA-4 / SEC-4). |
| `e36744fa` — registry table never enumerated | Five-row writable table | **Yes.** All five root keys match the files on disk; `validators` → `checks` is corrected; seven files exist and exactly two are excluded. |
| `7a4914e2` — allowlist contents undefined | Per-registry allowlists enumerated | **Enumerated, but three rows are wrong** (SA-3, SA-5, CON-4, CON-5, CON-6). |
| `c1a46dad` — unenumerated writable set | Same table | **Yes.** |
| `62c5590b` — `catch { start fresh }` | `GOVERNANCE_PARSE_REFUSED` | **Yes.** Correctly replaces the destructive fallback at `content-install.mjs:187-189`. |

Net: 5 of 9 closure classes hold. Four were closed by assertion rather than mechanism, which is the same defect class rev 1 was blocked for — now relocated into the newly-added normative tables.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — `blocker` — internal-contradiction

- **blocker_id:** `structural-architect:internal-contradiction:bc5f4de7`
- **section_anchor:** `invariants-6`
- **Location:** Invariant 6 / Improvements ("The write is inert") / Changes Catalog per-registry allowlist

Invariant 6 states "an extension can never contribute an executable field," and Improvements claims it "cannot contribute an executable field at all." The `diagnostics.yaml` allowlist includes `runner`, and Behavior 8 refuses `runner` only *outside* `diagnostics.yaml`. `runner` is a module path that `lib/diagnostics/index.mjs` resolves and imports for execution (`:78-136`, dispatch at `:230`), including `project:` paths under `.context-index/diagnostics/`. The spec even routes extensions there ("an extension needing to run something ships a `diagnostics.yaml` runner"). The invariant is asserted, not delivered.

**Recommendation:** State the actual property — extensions cannot contribute a *shell* body; module execution via `runner` is permitted and bounded by the diagnostics containment guard — and reword Invariant 6 and the Improvements bullet to match Behavior 8.

### SA-2 — `blocker` — ambiguous-behavior

- **blocker_id:** `structural-architect:ambiguous-behavior:fb8572c9`
- **section_anchor:** `behaviors-7`
- **Location:** Behavior 7 / "Scalar rejection, not escaping" / Invariant 2

The rejection set (newline, CR, `"`, `'`, `#`, leading `-`/`?`/`:`) is presented as exhaustive and Invariant 2 rests on it, but `lib/profiles/yaml.mjs::parseInlineValue` (`:181-182`) converts any value that starts with `[` or `{` into a flow sequence or flow map. A `{`-leading value yields a mapping whose **keys are extension-supplied** (`parseFlowMap`, `:185-199`) — precisely "extension input becomes YAML structure." `&`, `*`, `!`, `|`, `>` and bare `true`/`false`/integer coercion (`:177-179`) are likewise unaddressed.

**Recommendation:** Derive the rejection set from the parser's own scalar/non-scalar boundary rather than enumerating characters, and add an acceptance criterion for a `{`/`[`-leading value.

### SA-3 — `blocker` — missing-mechanism

- **blocker_id:** `structural-architect:missing-mechanism:b8779d75`
- **section_anchor:** `changes-catalog-added`
- **Location:** Changes Catalog → per-registry field allowlist, `gates.yaml` row

The row is justified by "an extension can declare a gate's metadata but never its executable body." No such entity exists. `lib/domains/merge-gates.mjs::validateGate` (`:29-32`) treats `command` as **required** and skips any gate lacking it with `INVALID_GATE`; `:34-40` further requires argv-list form. Every extension-contributed gate is therefore silently discarded by the only consumer. The allowlist also omits `kind` and `group`, both in `gates.yaml`'s own documented schema (`:8`, `:15`), while adding `description`, which is not. This is the rev-1 class recurring: a permitted write against a mechanism that does not exist.

**Recommendation:** Either move `gates.yaml` into the non-writable set alongside `risk-policies.yaml`/`sensitive-paths.yaml`, or specify what a command-less gate means to `merge-gates` and `doctor` before allowlisting the file.

### SA-4 — `blocker` — underspecified-mechanism

- **blocker_id:** `structural-architect:underspecified-mechanism:1c91d3a7`
- **section_anchor:** `migration-path-step-2`
- **Location:** Migration Step 2 ("locates the target key's block by line range, replaces exactly those lines")

Two of the five writable registries hold inline empty flow collections followed by indented commented examples: `boundaries.yaml:6` (`boundaries: []`, comments at `:7-21` indented under it) and `review.yaml:27` (`reviewers: []`). Under an indentation-scoped block, "replaces exactly those lines" destroys those comment blocks, contradicting Behavior 3 and the AC. Under a key-line-only block, the spec never says how `[]` becomes block form, and the result (`boundaries: []` followed by `  - id:`) does not parse as intended. Separately, `gates.yaml`'s block ends adjacent to a blank line plus the col-0 `# Lifecycle transition requirements` header (`:68-69`) immediately before `transitions: {}` — insertion point unspecified. Note also that the AC's "20 comment lines in `validate.yaml`" counts 19 header comments **plus the interior comment at `:73`**, so "replaces" cannot mean re-emitting the block; only pure insertion satisfies it. The single AC chosen (`validate.yaml`) is the one file where the naive reading happens to work.

**Recommendation:** Specify block start, block end, insertion point, and the empty-flow-collection → block-form transition explicitly, and add acceptance criteria against `boundaries.yaml` and `gates.yaml`, not only `validate.yaml`.

### SA-5 — `warning`

Changes Catalog → allowlist, `review.yaml` row. `patterns`, `keywords`, `min_score` are granted as top-level fields, but `review-config.mjs::shouldDispatch` (`:164-171`) reads them only under `dispatch.triggered`, and `validateReviewer` (`:384-391`) drops top-level ones from the validated reviewer. Since `dispatch` must then be a nested object — which the flat scalar model cannot express — an extension reviewer can only ever be `dispatch: always`. The row also omits `package`, though the loader requires `prompt` XOR `package` (`:348-363`, ADR-0003 §Scope). Restate what an extension reviewer can actually be.

### SA-6 — `warning`

Behaviors 5 and 6 / Error Cases. `source` appears in no allowlist, so a supplied `source` satisfies both `GOVERNANCE_FIELD_NOT_ALLOWED` and `GOVERNANCE_SOURCE_FORGED` with no precedence stated. Two codes, one input.

### SA-7 — `warning`

Behavior 10 / Error Cases (`MERGE_WOULD_TRUNCATE`). Under in-place splice no code path can drop a root key, so the triggering condition cannot arise; there is no acceptance criterion for it either. Either name the residual path that can truncate or remove the behavior and the code.

### SA-8 — `warning`

Module Impact Map, `domain-extensions` row: "uninstall gains governance reversal" contradicts Out of Scope, which drops uninstall reversal at revision 2. The same table and MODIFIED say "five functions" where Target State lists four. Revision residue in normative tables.

### SA-9 — `warning`

ADR compliance. `content-install.mjs:150-153` documents the fill-gap loop as "merge-by-id semantics per ADR-0003," and ADR-0003 §Consequences still asserts field-by-field overlay merge for `review.yaml`. Removing the loop implicitly narrows that. Add one sentence stating that ADR-0003's overlay governs bundled-default composition, not third-party install, so the REMOVED item does not read as superseding an accepted ADR.

### Clean

The writable-registry → root-key table matches all five files on disk (`checks`, `reviewers`, `gates`, `diagnostics`, `boundaries`), correcting the `validators` defect. The `validate.yaml` allowlist covers every field present in the live registry. The `diagnostics.yaml` allowlist matches `validateEntry`'s required set exactly (`lib/diagnostics/index.mjs:258-269`). The parent-spec split is clean and the dependency is one-way as claimed.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

Rev 2 genuinely closes the path-traversal, fill-gap, root-key, destructive-serialization and parse-fallback defects. Two of its own invariants are false.

### SEC-1 — `blocker` — input-validation

- **blocker_id:** `security-reviewer:input-validation:3bc49689`
- **section_anchor:** `invariants-2`

Invariant 2 ("No extension input ever becomes YAML structure. Supplied values are data, never keys.") is **false**. The rejection set (newline, CR, `"`, `'`, `#`, leading `-`/`?`/`:`) omits the flow indicators. `parseInlineValue` (`lib/profiles/yaml.mjs:180-181`) turns any value that *starts and ends* with `{}`/`[]` into a map or sequence — before `unquote` is ever reached. Empirically confirmed against the repo's parser: a `description` of `{command: rm -rf ~, x: y}` written unquoted reparses as an object with a key literally named **`command`** inside a `gates.yaml` entry — one nesting level from the field the entire allowlist exists to exclude. The same call coerces `123` → number, `true`/`false` → boolean, `null`/`~` → null, and an empty/whitespace-only scalar → `{}` (via the `rest === undefined` branch at `:108-111`). None of these are in the rejection set. Type coercion on `id` also defeats the Behavior-4 collision check (`byId.has()` compares string `"123"` against parsed number `123`), so an entry can be appended twice.

**Recommendation:** Extend the rejection set to refuse any scalar whose trimmed form (a) is empty, (b) starts with `{` or `[`, or (c) equals `true`/`false`/`null`/`~` or matches `/^-?\d+$/`. Then stop relying on an enumerated denylist: after the splice, re-read the written file with `parseYaml` and assert the target key's array deep-equals the intended entry objects; on any mismatch, restore the original bytes and refuse with `GOVERNANCE_SCALAR_UNSAFE`. That read-back is the only mechanism that keeps Invariant 2 true if `lib/profiles/yaml.mjs` ever changes. Add an acceptance criterion for the `{...}` case specifically.

### SEC-2 — `blocker` — code-execution

- **blocker_id:** `security-reviewer:code-execution:95678ca2`
- **section_anchor:** `invariants-6`

Invariant 6 ("An extension can never contribute an executable field") is **false as written**: `runner` is on the `diagnostics.yaml` allowlist, and `runner` *is* an executable field — `lib/diagnostics/index.mjs:514` does `await import(pathToFileURL(entry.runner_path))` and calls `run()`. The spec's justification — it "executes as a module rather than a shell string" — is not a security property; an imported ESM module has the same privileges as `sh -c`, arguably broader. What actually contains it is elsewhere and unstated: `resolveRunnerContained` (`:88-139`) rejects raw `..`, requires a `plugin:`/`project:` prefix, and realpath-confines to `<pluginRoot>/lib/diagnostics/` or `<projectRoot>/.context-index/diagnostics/` — and no `provides.*` handler writes into either root (governance→`governance/`, samples→`samples/`, skill_extensions→`skill-extensions/_<ext>/`, domain-profile→`domains/<name>/`, skills/hooks→`<pluginRoot>/skills|hooks/`). So it is not exploitable today, but the invariant asserts a property the spec's own changes do not deliver, depends on a module the spec does not touch, and would silently become RCE the day any handler can place a file under `.context-index/diagnostics/`.

**Recommendation:** Restate Invariant 6 as the checkable property: *"`command` is outside every allowlist; `runner` is confined to `diagnostics.yaml` and is executable only via `lib/diagnostics`' prefix+realpath containment, which no `provides.*` handler can write into."* Add an acceptance criterion pinning that dependency — assert no install handler resolves a write under `<projectRoot>/.context-index/diagnostics/` — so a future handler breaks a test rather than the invariant quietly. This is the same failure mode as rev 1's "closed by construction": a claim whose mechanism lives outside the change.

### SEC-3 — `warning` — input-validation

*Error-code non-determinism, and `source` is unallowlistable.* A supplied `source` violates Behavior 5 (not in any allowlist row) *and* Behavior 6 (`GOVERNANCE_SOURCE_FORGED`); `command: "a\nb"` in `gates.yaml` violates Behaviors 5, 7 and 8. No precedence is given, so a test asserting "`command` is refused" can pass on the scalar rule while the allowlist is broken. Worse, `source` appears in **no** allowlist row, yet the installer stamps it — if the allowlist runs post-stamp, every install fails.

**Recommendation:** State the fixed order (installer-owned-field → allowlist → scalar → path/target), specify that validation runs on the *pre-stamp* entry with `source` reserved rather than allowed, and make the acceptance criteria assert exact codes.

### SEC-4 — `warning` — input-validation

*Splice target location is unspecified.* "Locates the target key's block by line range" does not say the match must be anchored at column 0, outside comments, and unique. The precedent in this subsystem does it wrong: `rewriteManifestWithStamps` uses `raw.indexOf('installed_extensions:')`, which matches inside a comment or a value. Behavior is undefined when the key is absent, duplicated, or the file does not exist (today `mergeGovernanceEntries` auto-creates).

**Recommendation:** Specify `/^<rootKey>:[ \t]*$/m` at indent 0, refuse `MERGE_WOULD_TRUNCATE` on zero or multiple matches, and state explicitly whether a missing registry is created or refused with `UNKNOWN_GOVERNANCE_TARGET`.

### SEC-5 — `warning` — input-validation

*Stamp and array elements outside the stated rule.* Behavior 7 says "any supplied scalar"; the stamped `source: extension:<name>` is not supplied, and array elements (`triggers`, `patterns`, `keywords`, `exclude`) are elements, not scalars. `<name>` is safe *today* only because `manifest-schema.mjs` enforces kebab-case upstream — but `mergeGovernanceEntries` is exported and its signature carries no name, so a direct caller stamps unvalidated text.

**Recommendation:** Apply the scalar rules to every string reachable in an entry including array elements, and re-validate `<name>` against `NAME_PATTERN` at the merge boundary rather than trusting the caller.

### SEC-6 — `suggestion` — code-execution

"The write is inert" is true for governance but reads as an install-wide claim. `provides.hooks` copies an arbitrary extension file into `<pluginRoot>/hooks/` and registers it (`register.mjs:181-191`); `provides.skills` copies a `SKILL.md` into `<pluginRoot>/skills/`. An extension already has execution on the install path via sibling keys. Scope the sentence to the governance contribution and note the sibling surfaces as out-of-scope-but-known.

### Not flagged (correctly handled)

Path containment, the `command` exclusion from `gates.yaml`, `risk-policies.yaml`/`sensitive-paths.yaml` being non-writable, collision-skip replacing fill-gap, `GOVERNANCE_PARSE_REFUSED`, and the rejection-over-escaping decision — that direction is right; only its coverage set is incomplete (SEC-1).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

The parent-split is clean. Grepping `explicit-governance-registries.spec.md` for `inferRootKey` / `serializeGovernanceYaml` / the test-fixup / `uninstall` returns nothing — the four double-claimed items are gone. The dependency is genuinely one-way: the parent's `source:` value-extension and `materialized_at` reservation are both explicitly anticipated by this spec's Invariant 4 ("any marker owned by the composition model" is installer-immutable). That composition holds. New blockers appeared elsewhere.

### CON-1 — `blocker` — contract

- **blocker_id:** `consistency-analyzer:contract:6c4af44c`
- **section_anchor:** `behavioral-contract`
- **This Spec:** Behavior 5 says a field outside the registry's allowlist → `GOVERNANCE_FIELD_NOT_ALLOWED`. Behavior 6 says an installer-owned field (`source`, `materialized_at`) → `GOVERNANCE_SOURCE_FORGED`.
- **Conflicts With:** Itself — `source` is simultaneously "outside every allowlist" (no allowlist table lists `source`) and "installer-owned." Both behaviors fire on the identical input with no stated precedence, so the contract is untestable as written.
- **Recommendation:** State that installer-owned-field detection runs before, and takes precedence over, the generic allowlist check (or exclude installer-owned fields from the allowlist check entirely).

### CON-2 — `blocker` — contract

- **blocker_id:** `consistency-analyzer:contract:dfca01fb`
- **section_anchor:** `error-cases`
- **This Spec:** `MERGE_WOULD_TRUNCATE` is declared in the Changes Catalog, Behavior 10, and the Error Cases table, but has no Migration Path step and no Acceptance Criteria bullet.
- **Conflicts With:** Migration Step 2's own splice design ("locates the target key's block by line range, replaces exactly those lines, and writes every other byte back unchanged") — by construction this mechanism cannot touch a sibling root key, so no legitimate input reaches this code. Same defect class rev 1 was rejected for.
- **Recommendation:** Either give this code a concrete reachable trigger (e.g. splice-boundary-detection failure on a malformed but parseable file) and add the missing AC, or drop the code as belt-and-suspenders defensive code rather than a specified behavior.

### CON-3 — `blocker` — contract

- **blocker_id:** `consistency-analyzer:contract:77ee6ba0`
- **section_anchor:** `module-impact-map`
- **This Spec:** Out of Scope explicitly drops uninstall reversal ("dropped from this spec at revision 2 on review advice… Tracked separately on the board").
- **Conflicts With:** Module Impact Map, same document: `| domain-extensions | High | All five functions; uninstall gains governance reversal |`.
- **Recommendation:** Strip "uninstall gains governance reversal" from the Module Impact Map row — leftover from the pre-split scope.

### CON-4 — `blocker` — contract

- **blocker_id:** `consistency-analyzer:contract:e2721703`
- **section_anchor:** `changes-catalog-per-registry-field-allowlist`
- **This Spec:** `review.yaml` allowlist = `id, name, dispatch, profile, context_pack, severity_cap, prompt, patterns, keywords, min_score`, declared exhaustive.
- **Conflicts With:** `.context-index/adrs/0003-configurable-review-registry.md` ("either `prompt` (subagent mode) or `package` (external-skill wrap mode…)"). `package` is an ADR-0003-documented reviewer field with no substitute in this allowlist.
- **Recommendation:** Add `package` to the `review.yaml` allowlist, or state explicitly that package-mode reviewers are out of scope for extension contribution.

### CON-5 — `blocker` — contract

- **blocker_id:** `consistency-analyzer:contract:f549846c`
- **section_anchor:** `changes-catalog-per-registry-field-allowlist`
- **This Spec:** All five per-registry allowlists declared exhaustive.
- **Conflicts With:** `explicit-governance-registries.spec.md` ADDED — `enabled` + `disabled_reason` fields on entries in `review.yaml`, `diagnostics.yaml`, `gates.yaml`, `validate.yaml`. Unlike `source`/`materialized_at`, these are ordinary author-set fields (not installer-stamped), so they do not fall under Invariant 4's "installer-owned" carve-out — yet no allowlist includes them.
- **Recommendation:** Either add `enabled`/`disabled_reason` to the four affected allowlists now, or add explicit forward-compatibility language (as already done for `source`) stating these are reserved pending the parent spec and will need an allowlist revision when it lands.

### CON-6 — `warning` — domain-model

- **This Spec:** `gates.yaml` allowlist = `id, name, description, tier, scope, severity, required, triggers`.
- **Conflicts With:** `gates.yaml`'s own on-disk schema header, which documents `kind` (deterministic|probabilistic) and `group` (e2e tier, smoke|full) as entry fields but not `description`.
- **Recommendation:** Either allow `kind`/`group` (or state why extensions are barred from them) and justify `description`'s inclusion despite its absence from the schema header.

No naming or terminology drift found; error-code style (`SCREAMING_SNAKE_CASE`) and ID conventions match `check-id-enum.spec.md` and sibling specs.

---

## Summary

**Total findings:** 19 (11 blockers, 7 warnings, 1 suggestion)

**Convergence across reviewers** — five findings were reached independently by two or three reviewers, which is the strongest signal in this review:

| Issue | Reviewers |
|---|---|
| Invariant 6 false — `runner` is an executable field on the `diagnostics.yaml` allowlist | SA-1, SEC-2 |
| Invariant 2 false — rejection set omits flow indicators and type coercions | SA-2, SEC-1 |
| `gates.yaml` allowlist omits `kind`/`group`, adds `description`, and produces gates `merge-gates` discards | SA-3 (blocker), CON-6 (warning) |
| Splice mechanism underspecified beyond `validate.yaml` | SA-4 (blocker), SEC-4 (warning) |
| Behavior 5 / Behavior 6 error-code precedence undefined for `source` | CON-1 (blocker), SA-6, SEC-3 |
| `MERGE_WOULD_TRUNCATE` unreachable under the splice, no AC | CON-2 (blocker), SA-7 |
| Module Impact Map retains uninstall reversal | CON-3 (blocker), SA-8 |
| `review.yaml` allowlist omits `package` (ADR-0003) | CON-4 (blocker), SA-5 |

**What rev 2 got right:** the parent-spec split is clean and the dependency is genuinely one-way; the root-key table is correct against all five files on disk; the parse-refusal replaces a genuinely destructive fallback; the `command` exclusion closes the shell-injection path for both collision and append; uninstall reversal was correctly dropped rather than specified against a non-existent verb; and rejection-over-escaping is the right call given `lib/profiles/yaml.mjs::unquote` performs no unescape.

**What blocks it:** rev 2 closed twelve blockers and introduced eleven, and the new ones are the same class the old ones were. Two invariants (2 and 6) are asserted rather than delivered by the Changes Catalog; the two enumerated tables — the new normative surface — contain three rows that do not match the schemas their consumers enforce; and the splice, which is the mechanism the comment-preservation guarantee rests on, is specified only tightly enough to work on the single file the acceptance criterion names.

**Action required:** Revise the spec (`/adev:specify --revise`), then re-review. Blockers are keyed by canonical `blocker_id` in `extension-governance-merge-hardening.blockers.md`.

**Transition gate note:** `.context-index/governance/gates.yaml` declares `transitions: {}` — no `spec-to-plan` `approver_role` is configured. Informational only.

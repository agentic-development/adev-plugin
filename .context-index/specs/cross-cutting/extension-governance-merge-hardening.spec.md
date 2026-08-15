---
mode: cross-cutting
affects: [domain-extensions, validation, unified-gates]
kind: refactor
status: review-pending
risk_level: high
revision: 2
created: 2026-08-15
updated: 2026-08-15
tracker-ref: adev-plugin-xg1f.1
---

# Live Spec: Extension Governance Merge Hardening

<!-- Split out of explicit-governance-registries.spec.md at revision 4 (2026-08-15).
     That spec's BLOCK→revise loop halted on REGRESSED; the extension-merge strand
     was one of two independent contracts trapped inside it. Frontmatter precedes
     the H1 deliberately: `adev specify revise` cannot parse a spec whose
     frontmatter is not the first non-blank content. -->

## Contract

**An extension's governance contribution writes exactly what it declared, only where it is
permitted to write, and never mutates an entry it did not create.**

Every behavior below is a consequence of that one sentence. This is a security contract over
untrusted input — an extension manifest is third-party content — and it is independent of how the
governance registries compose, which is `explicit-governance-registries.spec.md`'s concern.

## Current State

### Structure

| File | Role | Lines |
|---|---|---|
| `lib/extensions/install.mjs` | Reads `provides.governance[]`, picks `target`, calls the merge | `:91` |
| `lib/extensions/content-install.mjs` | `mergeGovernanceEntries`, `validateGovernanceEntry`, `inferRootKey`, `serializeGovernanceYaml` | `:101-256` |
| `extensions/example-validation-check/` | The reference extension; the only consumer of this path | — |
| `tests/lib/extensions/example-validation-check-install.test.mjs` | Encodes one of the defects as expected behavior | `:206` |

### Problems

Seven defects, all in the same function cluster, all reachable from a manifest field. Two carry board
issues (`adev-plugin-xg1f.1`, `adev-plugin-xg1f.2`); three were found in successive reviews of the
parent spec.

1. **Path traversal — reproduced.** `install.mjs:91` takes `target` from the manifest;
   `mergeGovernanceEntries` does `join(govDir, targetFile)` then `writeFileSync` with no containment
   check. Verified 2026-08-14: `target: '../../ESCAPED.yaml'` wrote outside
   `.context-index/governance/` and returned without error. Two sibling functions in the same file
   already do the check this one omits — `installSamples` (`:307-318`) and `installSkillExtensions`
   (`:383-384`) both `resolve()` and verify `startsWith(resolvedDir + '/')`.

2. **No field allowlist.** `validateGovernanceEntry` (`:101-119`) validates only `id` — type,
   non-empty, ≤128 chars. Any other field passes through verbatim, so an extension can declare
   provenance or state fields that the governance model treats as authoritative.

3. **Fill-gap merging injects executable fields.** The collision path fills absent keys rather than
   rejecting (`:206-210`): `if (!(key in projectEntry)) projectEntry[key] = value`. `gates.yaml`
   entries carry `command:`, which reaches `spawnSync` (`lib/gates/doctor.mjs:965`, the same set
   Check 1 executes). An extension colliding on a gate id whose project entry has no `command` —
   the commented `lint`/`typecheck` scaffolds, or any gate seeded without one — injects a shell
   command into a **project-owned** entry. A per-registry field allowlist does not help: `command`
   is a legitimate `gates.yaml` field.

4. **Destructive serialization.** `serializeGovernanceYaml` (`:242-256`) emits one root key and its
   entries. Sibling keys and comments are dropped. Combined with defect 5, installing the reference
   extension against a real `validate.yaml` replaced 7 checks and 20 lines of comments with three
   lines — verified 2026-08-14.

5. **Root-key mismatch.** `inferRootKey('validate.yaml')` returns `'validators'` (`:235`), but the
   schema key is `checks:` — what `validate-config.mjs:110` reads, and what the project file and
   `templates/domains/software/validate.yaml` both use. `boundaries.yaml` and `diagnostics.yaml`
   work only because the fallthrough returns the filename stem, which happens to be correct.

6. **No escaping contract.** Nothing specifies how a scalar is serialized. A newline inside any
   extension-supplied string writes YAML at column 0, so a crafted `description` or `id` can emit
   arbitrary keys into the file — defeating the field allowlist, provenance stamping and every other
   guard in one move. This defect makes the others' fixes conditional on it.

7. **A parse failure destroys the registry.** `content-install.mjs:187-189` catches a YAML parse
   error and starts from an empty entry set, so an unparseable file is overwritten with only the
   extension's entries — silently, and with collision detection bypassed because nothing remains to
   collide with.

*(An eighth defect — no uninstall reversal for governance entries — is real but out of scope here;
see Out of Scope.)*

### Why this is an oversight rather than a design choice

The extension governance path is the *right* model — it writes into the project's own file at install
time, project-wins on collision, with no run-time overlay. It has simply never been exercised: neither
shipped extension (`data-engineering`, `process-automation`) uses `provides.governance`; both go
through `installDomainProfile`. The only consumer is the reference example that documents the
mechanism. Meanwhile `tests/lib/extensions/example-validation-check-install.test.mjs:206` encodes
defect 5 as expected behavior (`const entries = validate.validators || validate.checks || []`),
which is why it survived.

## Target State

### Structure

| Function | After |
|---|---|
| `mergeGovernanceEntries` | Resolve + containment assert before any write; append-only against existing entries; collisions skipped, not merged |
| `validateGovernanceEntry` | Per-registry field allowlist; rejects installer-owned fields |
| `inferRootKey` | Explicit registry → root-key table; unknown target refused |
| `serializeGovernanceYaml` | Splices the target key's array in place; every other byte of the file preserved |

### Improvements

- **The write is bounded.** An extension can write into one of five known registry files, under one
  known root key, and nowhere else.
- **The write is additive.** An existing entry is never mutated.
- **The write is inert.** An extension cannot contribute an executable field at all — `command` is
  absent from the `gates.yaml` allowlist, so neither collision nor append can introduce one.
- **The write is attributable.** Every entry carries an installer-stamped `source`, so uninstall and
  audit can distinguish extension entries from project-authored ones.
- **The write is refusable.** Anything that cannot be written safely is rejected at validation, not sanitized. There is no escaping layer to get wrong.

## Changes Catalog

### ADDED

- Path containment assert in `mergeGovernanceEntries`, matching the `resolve()` +
  `startsWith(resolvedDir + '/')` pattern already used at `content-install.mjs:307-318` and `:383-384`.
- **Explicit writable-registry → root-key table**, replacing stem inference. Exhaustive, and it is
  the writable set — a `target` outside it is refused:

  | `target` | Root key |
  |---|---|
  | `validate.yaml` | `checks` |
  | `review.yaml` | `reviewers` |
  | `gates.yaml` | `gates` |
  | `diagnostics.yaml` | `diagnostics` |
  | `boundaries.yaml` | `boundaries` |

  `risk-policies.yaml` (`policies`) and `sensitive-paths.yaml` (`sensitive_paths`) are the project's
  own guard boundary — the files that decide which paths are sensitive and which risk levels demand
  review. They are **explicitly non-writable** by extensions. Seven registry files exist on disk;
  exactly five are writable.
- **Per-registry field allowlist** in `validateGovernanceEntry`. Exhaustive per target; anything else
  is refused:

  | Target | Allowed fields |
  |---|---|
  | `validate.yaml` | `id`, `name`, `kind`, `severity`, `profile`, `context_pack`, `prompt`, `after`, `description` |
  | `review.yaml` | `id`, `name`, `dispatch`, `profile`, `context_pack`, `severity_cap`, `prompt`, `patterns`, `keywords`, `min_score` |
  | `gates.yaml` | `id`, `name`, `description`, `tier`, `scope`, `severity`, `required`, `triggers` |
  | `diagnostics.yaml` | `id`, `runner`, `severity`, `tier`, `scope` |
  | `boundaries.yaml` | `id`, `severity`, `pattern`, `exclude`, `description` |

  **`command` is deliberately absent from the `gates.yaml` row.** It is the field that reaches
  `spawnSync("sh", ["-c", command])` (`lib/gates/doctor.mjs:965`). Excluding it means an extension
  can declare a gate's metadata but never its executable body, so the injection path is closed for
  appended entries as well as colliding ones. An extension needing to run something ships a
  `diagnostics.yaml` runner, which executes as a module rather than a shell string. The same
  reasoning excludes `runner` from anything but `diagnostics.yaml`, and `prompt` paths remain subject
  to the existing `plugin:`/relative resolution guard.
- `source` provenance field, stamped by the installer from install context.
- **Scalar rejection, not escaping.** `lib/profiles/yaml.mjs::unquote` (`:244-252`) strips surrounding
  quotes and performs **no unescape**, so no backslash scheme round-trips through the repo's own
  parser. Rather than add an escaping layer the parser cannot reverse — or a YAML dependency, which
  the constitution requires an ADR for — any supplied scalar containing a newline, carriage return,
  `"`, `'`, `#`, or a leading `-`/`?`/`:` is **refused** with `GOVERNANCE_SCALAR_UNSAFE`. Governance
  config has no legitimate multi-line or structural scalar; rejecting is both safe and simpler than
  sanitizing.
- Error codes: `PATH_TRAVERSAL`, `UNKNOWN_GOVERNANCE_TARGET`, `GOVERNANCE_FIELD_NOT_ALLOWED`,
  `GOVERNANCE_SOURCE_FORGED`, `GOVERNANCE_SCALAR_UNSAFE`, `GOVERNANCE_PARSE_REFUSED`,
  `MERGE_WOULD_TRUNCATE`.

### MODIFIED

- `lib/extensions/content-install.mjs` — the five functions above.
- `lib/extensions/install.mjs` — `target` constrained to the known registry set before dispatch.
- `tests/lib/extensions/example-validation-check-install.test.mjs:206` — assert the `checks`
  contract rather than accommodating `validators || checks`.

### REMOVED

- The collision fill-gap loop (`content-install.mjs:206-210`).

## Migration Path

### Step 1: Scalar rejection and path containment

Add scalar rejection and the path-containment assert. Sequenced first because every later guard is
only as strong as these two — an unsafe scalar or an unbounded path defeats the allowlist, provenance
stamping and collision handling alike.

- **Risk:** Low. No shipped extension uses this path.
- **Verify:** `target: '../../x.yaml'` is refused with `PATH_TRAVERSAL` and writes nothing — the test
  reproduces the current escape and asserts it now fails. A supplied string containing `\n`, `"` or
  `#` is refused with `GOVERNANCE_SCALAR_UNSAFE` and nothing is written.

### Step 2: Root-key table and in-place splice

Replace stem inference with the explicit table. Replace whole-file reserialization with an in-place
splice of the target key's array.

**Comment preservation is achieved by not reserializing, not by a comment-aware writer.** The repo
has `lib/profiles/yaml.mjs::parseYaml` and no serializer; that parser consumes `#` comments and never
retains them, so any round trip through it loses them. Adding a YAML library would need an ADR under
the zero-dependency principle. The splice reads the file as text, locates the target key's block by
line range, replaces exactly those lines, and writes every other byte back unchanged — comments,
sibling keys and formatting included, because they are never parsed in the first place.

- **Risk:** Low.
- **Verify:** Installing the reference extension against a `validate.yaml` holding 7 checks yields 8
  entries under `checks:`, with all 20 comment lines byte-identical and any `transitions:` block in
  `gates.yaml` untouched.

### Step 3: Allowlist, provenance, collision handling, and parse refusal

Add the per-registry field allowlist and scalar rejection, stamp `source`, reject supplied provenance
fields, delete the fill-gap loop so collisions are skipped, and **replace the `catch { start fresh }`
fallback** at `content-install.mjs:187-189`.

That fallback is its own defect: an unparseable registry today causes the merge to treat the file as
empty and overwrite it with only the extension's entries — silently destroying the registry and
bypassing collision detection entirely, since there is nothing left to collide with. It must refuse
with `GOVERNANCE_PARSE_REFUSED` and write nothing.

- **Risk:** Low behaviourally (no consumer today), high in consequence if skipped — this is the
  arbitrary-execution path.
- **Verify:** An extension cannot introduce a `command` onto a `gates.yaml` entry, whether by
  collision or by appending a new one. A colliding entry leaves the existing entry byte-identical and
  is reported skipped. An unparseable registry refuses and is left untouched.

## Invariants

1. All existing tests pass at every step.
2. **No extension input ever becomes YAML structure.** Supplied values are data, never keys.
3. **An existing entry is never mutated by an install.** Additive or skipped, never merged.
4. Installer-owned fields (`source`, and any marker owned by the composition model) are stamped by
   the installer and rejected when supplied.
5. Writes land inside `.context-index/governance/`, in one of the five writable registries, or do not
   happen.
6. **An extension can never contribute an executable field.** `command` is outside every allowlist;
   `runner` is confined to `diagnostics.yaml`.
7. Unsafe input is refused, never sanitized. There is no escaping layer whose correctness the
   security properties depend on.

## Behavioral Contract

### Behaviors

1. **When** an extension's `target` resolves outside `.context-index/governance/` **then** the install refuses with `PATH_TRAVERSAL` and writes nothing.
2. **When** an extension's `target` is not one of the five known registry files **then** the install refuses with `UNKNOWN_GOVERNANCE_TARGET`.
3. **When** an extension declaring `provides.governance` is installed **then** its entries are appended under the target registry's own root key by an in-place line splice, every other byte of the file — sibling keys, comments, formatting — is preserved unchanged, and each appended entry carries an installer-stamped `source: extension:<name>`.
4. **When** an extension's entry id collides with an existing entry **then** the colliding entry is recorded as skipped and the existing entry is left byte-identical — no key is introduced onto it, absent or otherwise.
5. **When** an extension entry carries a field outside its registry's allowlist **then** the install refuses with `GOVERNANCE_FIELD_NOT_ALLOWED`, naming the field and registry.
6. **When** an extension entry supplies an installer-owned field **then** the install refuses with `GOVERNANCE_SOURCE_FORGED`.
7. **When** any supplied scalar contains a newline, carriage return, `"`, `'`, `#`, or a leading `-`/`?`/`:` **then** the install is refused with `GOVERNANCE_SCALAR_UNSAFE`, naming the field. Unsafe scalars are rejected, never escaped — `lib/profiles/yaml.mjs::unquote` (`:244-252`) performs no unescape, so no escape scheme round-trips through the repo's own parser.
8. **When** an extension entry declares a field that executes — `command` in any registry, or `runner` outside `diagnostics.yaml` — **then** the install is refused with `GOVERNANCE_FIELD_NOT_ALLOWED`. This holds for appended entries as well as colliding ones, so no install path can introduce an executable body.
9. **When** the target registry cannot be parsed **then** the install refuses with `GOVERNANCE_PARSE_REFUSED` and writes nothing. It never treats an unparseable file as empty.
10. **When** a merge would drop an existing root key **then** the install refuses with `MERGE_WOULD_TRUNCATE`.

### Error Cases

| Condition | Expected behavior | Code |
|---|---|---|
| `target` escapes the governance directory | Refuse; write nothing | `PATH_TRAVERSAL` |
| `target` not a known registry | Refuse; name the target | `UNKNOWN_GOVERNANCE_TARGET` |
| Field outside registry allowlist | Refuse; name field and registry | `GOVERNANCE_FIELD_NOT_ALLOWED` |
| Installer-owned field supplied | Refuse | `GOVERNANCE_SOURCE_FORGED` |
| Merge would drop an existing root key | Refuse; name the key | `MERGE_WOULD_TRUNCATE` |
| Supplied scalar contains a newline, quote, `#`, or leading indicator | Refuse; name the field | `GOVERNANCE_SCALAR_UNSAFE` |
| Entry declares `command`, or `runner` outside `diagnostics.yaml` | Refuse; name the field | `GOVERNANCE_FIELD_NOT_ALLOWED` |
| Target registry does not parse | Refuse; write nothing; leave the file untouched | `GOVERNANCE_PARSE_REFUSED` |

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| domain-extensions | High | All five functions; uninstall gains governance reversal |
| validation | Low | `validate.yaml` stops being destroyed by a validate-targeting extension |
| unified-gates | Low | `gates.yaml` `transitions:` survives an extension install |

## Integration Points

1. `explicit-governance-registries.spec.md` **depends on this spec.** It populates `transitions:` in
   `gates.yaml`, which the current merge deletes, and its drift pass keys on `source`, which this
   spec stamps. This spec does not depend on that one — it is implementable against the registries
   exactly as they are today.
2. `adev-plugin-xg1f.1` and `adev-plugin-xg1f.2` track defects 1-3 on the board.

## System Constitution Reference

- **Minimize external dependencies** — escaping and containment use `node:path` and string handling only.
- **Hook protocol compliance** — unaffected; this path runs at install time, not in a hook.
- **Architecture Boundaries / Requires Human Approval** — this spec changes what a third party can
  write into governance config. Step 3 is the security-critical step and should not be split across
  releases from Step 1.

## Acceptance Criteria

- [ ] `target: '../../x.yaml'` is refused with `PATH_TRAVERSAL` and writes nothing — the test reproduces the confirmed 2026-08-14 escape and asserts it now fails.
- [ ] A `target` outside the five known registries is refused with `UNKNOWN_GOVERNANCE_TARGET`.
- [ ] Installing the reference extension against a 7-check `validate.yaml` yields 8 entries under `checks:` with comments intact.
- [ ] The reference extension's own manifest passes the new validation, or is updated in the same change if it does not.
- [ ] Installing any extension targeting `gates.yaml` leaves a populated `transitions:` block byte-identical.
- [ ] An extension cannot introduce a `command` onto an existing `gates.yaml` entry — the arbitrary-execution path, asserted directly.
- [ ] A colliding entry is reported skipped and the existing entry is byte-identical afterwards.
- [ ] A supplied scalar containing `\n`, `"` or `#` is refused with `GOVERNANCE_SCALAR_UNSAFE` and nothing is written.
- [ ] An extension supplying an installer-owned field is refused.
- [ ] An extension declaring `command` in `gates.yaml` is refused whether the id collides or not — asserted for both paths.
- [ ] A `target` of `risk-policies.yaml` or `sensitive-paths.yaml` is refused; the writable set is exactly the five tabled registries.
- [ ] An unparseable target registry refuses with `GOVERNANCE_PARSE_REFUSED` and is left byte-identical.
- [ ] Comment lines in a spliced registry are byte-identical after install — asserted against the 20 comment lines in `validate.yaml`.
- [ ] `tests/lib/extensions/example-validation-check-install.test.mjs` asserts the `checks` contract rather than `validators || checks`.
- [ ] All quality gates pass; no constitutional violations.

## Out of Scope

- **How registries compose** — bundled vs domain vs project, materialization, the fail-closed guard.
  That is `explicit-governance-registries.spec.md`.
- **Making Checks 8 and 9 deterministic**, populating `boundaries.yaml`/`transitions`, the gate
  doctor's merged-set question, and the hygiene drift pass — same.
- **The check-ID namespace and enum** — `check-id-enum.spec.md`, blocked on ADR-0010.
- **Uninstall reversal of governance entries.** Real defect, dropped from this spec at revision 2 on
  review advice: no extension uninstall path exists to add reversal *to* — `adev extension` exposes
  only `install` and `list`, and no `uninstallExtension` exists anywhere in `lib/`. Specifying
  reversal here would specify behavior against a mechanism that does not exist, which is the defect
  class that stalled the parent spec twice. The `source` field this spec stamps is the prerequisite
  that makes reversal implementable later. Tracked separately on the board.

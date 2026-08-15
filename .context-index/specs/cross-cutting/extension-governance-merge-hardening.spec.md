---
mode: cross-cutting
affects: [domain-extensions, validation, unified-gates]
kind: refactor
status: review-pending
risk_level: high
revision: 4
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

  Seven registry files exist on disk; exactly **five** are extension-writable. The two excluded:

  - **`risk-policies.yaml`** (`policies`) and **`sensitive-paths.yaml`** (`sensitive_paths`) — the
    project's own guard boundary, deciding which paths are sensitive and which risk levels demand
    review. Never writable by a third party.

### Executable contributions — permitted, and bounded three ways

Two registries accept an entry that executes: `gates.yaml` (`command`, *required* by
`lib/domains/merge-gates.mjs:29-33`) and `validate.yaml` (`kind: quality-gate` + `command`). The
shipped reference extension uses the second. Revision 3 tried to close this by excluding `gates.yaml`
from the writable set; that was wrong twice over — it left `validate.yaml`'s identical sink open, and
the diagnostics-runner alternative it offered in exchange does not exist (nothing under
`lib/extensions/` writes into `.context-index/diagnostics/`).

Revision 4 keeps the capability and bounds it. **All three bounds apply to every executable
contribution, in whichever registry it appears** — there is one rule, not a per-registry exception:

1. **Containment to the extension's own directory.** Every argv element that names a path must
   resolve inside the extension's installed directory — `resolvedPath`, the first argument to
   `installExtension` — verified with `resolve()` + `startsWith(resolvedPath + sep)` + `realpathSync`,
   the pattern `installSamples` already uses at `content-install.mjs:307-318`. `argv[0]` may instead
   name an interpreter from a fixed allowlist (`bash`, `sh`, `node`, `python3`); every other element
   is either a contained path or a non-path literal. The reference extension's
   `[bash, extensions/example-validation-check/bin/check.sh]` satisfies this unchanged.
2. **argv array only, never a shell string.** `merge-gates.mjs:34-38` already enforces this for
   gates; it becomes uniform. No contributed command is ever passed to `sh -c`, so shell
   metacharacters in a contributed value are inert.
3. **Explicit install-time consent.** When a manifest declares any executable contribution, the
   install refuses unless consent is granted for that install. Interactive installs prompt, listing
   each command verbatim and the extension it came from; non-interactive installs require
   `--allow-exec`. Consent is per-install, never remembered across installs, and the grant is
   recorded on the entry as `exec_consented_at` so an audit can distinguish a consented executable
   entry from one that predates the rule. The prompt has a home already: `lib/cli/domain-extension-picker.mjs`
   prompts during extension install today and threads an `options` object into `installExtension`.

Containment answers "what can it run", argv-only answers "how is it invoked", consent answers "did a
human agree". No one of the three is sufficient alone: containment without consent still runs code the
operator never saw, and consent without containment grants a blanket permission over any path.
- **Per-registry field allowlist** in `validateGovernanceEntry`. Exhaustive per target; anything else
  is refused:

  | Target | Allowed fields |
  |---|---|
  | `validate.yaml` | `id`, `name`, `kind`, `severity`, `profile`, `context_pack`, `prompt`, `after`, `description`, `command`, `fail_fast`, `enabled`, `disabled_reason` |
  | `review.yaml` | `id`, `name`, `dispatch`, `profile`, `context_pack`, `severity_cap`, `prompt`, `package`, `enabled`, `disabled_reason` |
  | `gates.yaml` | `id`, `command`, `description`, `severity`, `tier`, `enabled`, `disabled_reason` |
  | `diagnostics.yaml` | `id`, `runner`, `severity`, `tier`, `scope`, `enabled`, `disabled_reason` |
  | `boundaries.yaml` | `id`, `severity`, `pattern`, `exclude`, `description`, `enabled`, `disabled_reason` |

  **`kind` is constrained, not free.** In `validate.yaml` it must be one of the four values
  `validate-config.mjs` accepts (`quality-gate`, `subagent-review`, `deterministic-check`,
  `observational`), and `kind: quality-gate` additionally *requires* `command`, which triggers the
  executable-contribution rules above.

  **The `gates.yaml` row is exactly what `merge-gates.mjs` projects** (`:42-46`): `id`, `command`,
  `description`, `severity`, `tier`. Fields outside that set are silently dropped by the merge today,
  so allowlisting them would let an extension author believe it had configured something that never
  takes effect. `command` is required there, per `:29-33`.

  **`review.yaml`'s `dispatch` and `package` are object-valued**, and `isValidGovernanceValue`
  (`content-install.mjs:139-147`) currently accepts only strings, numbers, booleans and string arrays
  — so both are rejected today. This spec extends that validator to accept a **one-level** object
  whose own values are strings, numbers or booleans, and no deeper. `package` is validated against its
  ADR-0003 shape (`skill`, `adapter`, `args`), and its `skill`/`adapter` paths are subject to the same
  containment rule as `command`. Nested-object emission is the splice's responsibility (below).
  Fields no consumer reads at the entry position — `patterns`, `keywords`, `min_score` — are omitted
  rather than allowlisted.

  Each row is derived from the schema its consumer enforces, not from convention: `validate.yaml`
  from `lib/governance/validate-config.mjs`, `review.yaml` from `lib/governance/review-config.mjs`
  (including `package`, the two-stage reviewer form documented by ADR-0003), `diagnostics.yaml` from
  the registry schema in `.context-index/governance/diagnostics.yaml`'s header, `boundaries.yaml`
  from the rule shape in `boundaries.yaml`'s own template. `enabled` / `disabled_reason` appear in
  every row because `explicit-governance-registries.spec.md` adds them as ordinary author-set fields;
  omitting them would make these allowlists reject valid entries once that spec lands.

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
  `GOVERNANCE_SOURCE_FORGED`, `GOVERNANCE_SCALAR_UNSAFE`, `GOVERNANCE_PARSE_REFUSED`.
  (`MERGE_WOULD_TRUNCATE` was dropped at revision 3: the in-place splice never rewrites keys it did
  not target, so truncation has no reachable trigger and the code would have been dead.)

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

**The splice handles three on-disk forms, not one.** Specifying it against `validate.yaml`'s
block-sequence layout alone would destroy or fail on the others actually present:

| Form | Example on disk | Splice behavior |
|---|---|---|
| Block sequence under a key | `checks:` then `  - id: …` | Append new items after the last item of the block, before the next top-level key |
| Empty inline list | `boundaries: []` in `boundaries.yaml`, `reviewers: []` in `review.yaml` | Rewrite the single `key: []` line as `key:` followed by the new items |
| Key with only indented comments beneath | commented rule scaffolds in `boundaries.yaml` | Insert after the key line, above the comment block, leaving the comments byte-identical |

**Nested emission.** `review.yaml`'s `dispatch` and `package` are one-level objects, so the splice
emits them as an indented block map beneath their key, with every leaf value subject to the same
rejection rules as a top-level scalar. Depth is capped at one level, matching the extended validator.

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
2. **No extension input ever becomes YAML structure.** Supplied values are data, never keys. This
   requires rejecting flow indicators, not only line breaks: `lib/profiles/yaml.mjs` parses
   `{ key: value }` as a flow map (`:6-7`, `:193`), so a scalar of `{command: rm -rf /}` reparses as a
   map carrying an extension-supplied `command` key. It also coerces `/^-?\d+$/` to Number (`:179`),
   so a numeric `id` is not a string and would not match a string-keyed collision check.
3. **An existing entry is never mutated by an install.** Additive or skipped, never merged.
4. Installer-owned fields (`source`, and any marker owned by the composition model) are stamped by
   the installer and rejected when supplied.
5. Writes land inside `.context-index/governance/`, in one of the five writable registries, or do not
   happen.
6. **Every executable contribution is contained, argv-invoked, and consented.** Extensions may
   contribute executables; this invariant does not claim otherwise. What bounds them is the
   conjunction of the three rules — containment to the extension's own installed directory,
   argv-array invocation with no `sh -c`, and per-install human consent. A `diagnostics.yaml`
   `runner` is additionally bounded by the guard already shipped in `lib/diagnostics/index.mjs`
   (`..` rejection before resolution, prefix-scoped allowlist roots, realpath check). **That guard is
   a dependency of this invariant**, not an assumption — if it regresses, this invariant weakens with
   it, and an acceptance criterion pins it.
7. Unsafe input is refused, never sanitized. There is no escaping layer whose correctness the
   security properties depend on.

## Behavioral Contract

### Behaviors

1. **When** an extension's `target` resolves outside `.context-index/governance/` **then** the install refuses with `PATH_TRAVERSAL` and writes nothing.
2. **When** an extension's `target` is not one of the five known registry files **then** the install refuses with `UNKNOWN_GOVERNANCE_TARGET`.
3. **When** an extension declaring `provides.governance` is installed **then** its entries are appended under the target registry's own root key by an in-place line splice, every other byte of the file — sibling keys, comments, formatting — is preserved unchanged, and each appended entry carries an installer-stamped `source: extension:<name>`.
4. **When** an extension's entry id collides with an existing entry **then** the colliding entry is recorded as skipped and the existing entry is left byte-identical — no key is introduced onto it, absent or otherwise.
5. **When** an extension entry carries a field outside its registry's allowlist **then** the install refuses with `GOVERNANCE_FIELD_NOT_ALLOWED`, naming the field and registry.
6. **When** an extension entry supplies an installer-owned field (`source`, or a marker owned by the composition model) **then** the install refuses with `GOVERNANCE_SOURCE_FORGED`. **Precedence:** installer-owned fields are checked before the allowlist, so a supplied `source` always reports `GOVERNANCE_SOURCE_FORGED` and never `GOVERNANCE_FIELD_NOT_ALLOWED`. Exactly one code is emitted per rejected entry.
7. **When** any supplied value contains a newline, carriage return, `"`, `'`, `#`, `{`, `}`, `[`, `]`, `,`, or a leading `-`/`?`/`:`/`&`/`*`/`!`/`|`/`>`/`%`/`@`/backtick **then** the install is refused with `GOVERNANCE_SCALAR_UNSAFE`, naming the field. The flow indicators are load-bearing, not decorative: `lib/profiles/yaml.mjs` parses `{ … }` as a flow map, so omitting `{` lets a value reparse into a map with attacker-chosen keys. **This applies to every emitted value, not only top-level scalars** — array elements and one-level object values are checked identically, because `parseFlowSeq`/`parseFlowMap` reparse them the same way. Unsafe values are rejected, never escaped — `unquote` (`:244-252`) performs no unescape, so no escape scheme round-trips through the repo's own parser.
8. **When** a supplied `id` is not a string after parse **then** the install is refused. `parseYaml` coerces bare integers to Number (`:179`), and a non-string id would bypass the string-keyed collision check in Behavior 4.
9. **When** an extension entry declares `command` (in `gates.yaml`, or in `validate.yaml` with `kind: quality-gate`) **then** every argv element naming a path must resolve inside the extension's own installed directory, `argv[0]` may instead be an allowlisted interpreter, and the value must be an array — a string `command` is refused with `GOVERNANCE_COMMAND_NOT_ARGV`, and an escaping path with `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`.
10. **When** a manifest declares any executable contribution **then** the install refuses without explicit consent for that install — an interactive prompt listing each command verbatim, or `--allow-exec` non-interactively — and records `exec_consented_at` on each executable entry. Consent is per-install and never remembered.
11. **When** an extension declares `runner` outside `diagnostics.yaml` **then** the install is refused with `GOVERNANCE_FIELD_NOT_ALLOWED`.
12. **When** the target registry cannot be parsed **then** the install refuses with `GOVERNANCE_PARSE_REFUSED` and writes nothing. It never treats an unparseable file as empty.


### Error Cases

| Condition | Expected behavior | Code |
|---|---|---|
| `target` escapes the governance directory | Refuse; write nothing | `PATH_TRAVERSAL` |
| `target` not a known registry | Refuse; name the target | `UNKNOWN_GOVERNANCE_TARGET` |
| Field outside registry allowlist | Refuse; name field and registry | `GOVERNANCE_FIELD_NOT_ALLOWED` |
| Installer-owned field supplied | Refuse | `GOVERNANCE_SOURCE_FORGED` |
| Supplied scalar contains a newline, quote, `#`, or leading indicator | Refuse; name the field | `GOVERNANCE_SCALAR_UNSAFE` |
| `command` is a string rather than an argv array | Refuse; name the entry | `GOVERNANCE_COMMAND_NOT_ARGV` |
| An argv path resolves outside the extension's own directory | Refuse; name the element and the resolved path | `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` |
| Executable contribution without install-time consent | Refuse; list what would execute | `GOVERNANCE_EXEC_NOT_CONSENTED` |
| `runner` declared outside `diagnostics.yaml` | Refuse; name the field | `GOVERNANCE_FIELD_NOT_ALLOWED` |
| `kind` outside the four values `validate-config.mjs` accepts | Refuse; name the value | `GOVERNANCE_FIELD_NOT_ALLOWED` |
| Target registry does not parse | Refuse; write nothing; leave the file untouched | `GOVERNANCE_PARSE_REFUSED` |

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| domain-extensions | High | Four of the five functions (`mergeGovernanceEntries`, `validateGovernanceEntry`, `inferRootKey`, `serializeGovernanceYaml`); uninstall is out of scope — see `adev-plugin-xg1f.3` |
| validation | Low | `validate.yaml` stops being destroyed by a validate-targeting extension |
| unified-gates | Low | `gates.yaml` becomes non-writable by extensions entirely, so nothing in it — `transitions:` included — can be touched by an install |

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
- [ ] A `target` of `risk-policies.yaml` or `sensitive-paths.yaml` is refused; the writable set is exactly the five tabled registries.
- [ ] The shipped reference extension installs successfully unchanged, including its `command`, once consent is granted — the capability is preserved, not merely described.
- [ ] A `command` whose path resolves outside the extension's own directory is refused with `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`, asserted for both `gates.yaml` and `validate.yaml`.
- [ ] A string-valued `command` is refused with `GOVERNANCE_COMMAND_NOT_ARGV`.
- [ ] An executable contribution without consent is refused; with `--allow-exec` it installs and each executable entry carries `exec_consented_at`.
- [ ] `kind` outside the four values `validate-config.mjs` accepts is refused.
- [ ] A `review.yaml` entry with object-valued `dispatch` and `package` round-trips through install and `loadReviewConfig`; a two-level nested object is refused.
- [ ] An unsafe value inside an array element or a nested object value is refused, not only a top-level scalar.
- [ ] The `lib/diagnostics/index.mjs` containment guard is asserted by a test owned here, so Invariant 6's dependency cannot regress silently.
- [ ] A scalar of `{command: x}` is refused with `GOVERNANCE_SCALAR_UNSAFE` — the flow-map reparse path, asserted directly.
- [ ] A numeric `id` is refused rather than silently bypassing the collision check.
- [ ] A supplied `source` reports `GOVERNANCE_SOURCE_FORGED`, never `GOVERNANCE_FIELD_NOT_ALLOWED`.
- [ ] Each allowlist accepts every field its consumer's schema reads, asserted by round-tripping a maximal valid entry per registry through install and then through that registry's loader.
- [ ] The splice preserves `boundaries: []` and `reviewers: []` inline-empty forms and any indented comment block, asserted per form.
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

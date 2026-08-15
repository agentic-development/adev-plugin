---
mode: cross-cutting
affects: [domain-extensions, validation, unified-gates]
kind: refactor
status: review-passed
risk_level: high
revision: 5
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
| `lib/extensions/content-install.mjs` | `mergeGovernanceEntries`, `validateGovernanceEntry`, `isValidGovernanceValue`, `inferRootKey`, `serializeGovernanceYaml` | `:101-269` |
| `extensions/example-validation-check/` | The reference extension; the only consumer of this path | — |
| `tests/lib/extensions/example-validation-check-install.test.mjs` | Encodes one of the defects as expected behavior | `:208` |

### Problems

Seven defects, all in the same function cluster, all reachable from a manifest field. Two carry board
issues (`adev-plugin-xg1f.1`, `adev-plugin-xg1f.2`); three were found in successive reviews of the
parent spec.

1. **Path traversal — reproduced.** `install.mjs:91` takes `target` from the manifest;
   `mergeGovernanceEntries` does `join(govDir, targetFile)` then `writeFileSync` with no containment
   check. Verified 2026-08-14: `target: '../../ESCAPED.yaml'` wrote outside
   `.context-index/governance/` and returned without error. Two sibling functions in the same file
   already do the check this one omits — `installSamples` (`:307-318`) and `installSkillExtensions`
   (`:383-384`) both `resolve()` and verify `startsWith(resolvedDir + '/')`. **Neither uses
   `realpathSync`** — the sibling pattern is containment against a lexically resolved path only, so
   this spec adds the symlink step rather than inheriting it.

2. **No field allowlist.** `validateGovernanceEntry` (`:101-133`) validates `id` — type, non-empty,
   ≤128 chars — and then checks every other field's *value* shape at `:121-132` via
   `isValidGovernanceValue`. What it never checks is the field *name*: any key passes through
   verbatim, so an extension can declare provenance or state fields that the governance model treats
   as authoritative.

3. **Fill-gap merging injects executable fields.** The collision path fills absent keys rather than
   rejecting (`:206-210`): `if (!(key in projectEntry)) projectEntry[key] = value`. `gates.yaml`
   entries carry `command:`, which reaches `spawnSync` (`spawnGate` at `lib/gates/doctor.mjs:755-768`,
   invoked from `:1004` — the same set Check 1 executes). An extension colliding on a gate id whose
   project entry has no `command` —
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
mechanism. Meanwhile `tests/lib/extensions/example-validation-check-install.test.mjs:208` encodes
defect 5 as expected behavior (`const entries = validate.validators || validate.checks || []`;
`:206-207` is the comment above it), which is why it survived.

## Target State

### Structure

| Function | After |
|---|---|
| `mergeGovernanceEntries` | Resolve + containment assert before any write; append-only against existing entries; collisions skipped, not merged |
| `validateGovernanceEntry` | Per-registry field allowlist; rejects installer-owned fields |
| `inferRootKey` | Explicit registry → root-key table; unknown target refused |
| `serializeGovernanceYaml` | Splices the target key's array in place; every other byte of the file preserved |
| `isValidGovernanceValue` | Extended to one-level objects, with every leaf checked identically to a top-level scalar |

### Improvements

- **The write is bounded.** An extension can write into one of five known registry files, under one
  known root key, and nowhere else.
- **The write is additive.** An existing entry is never mutated.
- **The write is bounded when it executes.** An extension may contribute an executable field, and
  every such contribution is contained to an installer-copied payload directory, invoked as an argv
  array with no shell, and consented to at install time.
- **The write is attributable.** Every entry carries an installer-stamped `source`, so uninstall and
  audit can distinguish extension entries from project-authored ones.
- **The write is refusable.** Anything that cannot be written safely is rejected at validation, not sanitized. There is no escaping layer to get wrong.

## Changes Catalog

### ADDED

- Path containment assert in `mergeGovernanceEntries`, matching the `resolve()` +
  `startsWith(resolvedDir + '/')` pattern already used by `installSamples` and
  `installSkillExtensions` in `content-install.mjs`.
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
`lib/domains/merge-gates.mjs:29-32`) and `validate.yaml` (`kind: quality-gate` + `command`). The
shipped reference extension uses the second. Revision 3 tried to close this by excluding `gates.yaml`
from the writable set; that was wrong twice over — it left `validate.yaml`'s identical sink open, and
the alternative it offered in exchange does not exist (nothing under `lib/extensions/` writes into
`.context-index/diagnostics/`).

Revision 4 kept the capability and bounded it; revision 5 makes each bound implementable against named
code. **All three bounds apply to every `command`-bearing contribution, in whichever registry it
appears** — there is one rule, not a per-registry exception. (`diagnostics.yaml`'s `runner` is the one
executable field the three bounds do *not* govern; see Invariant 6 and the `runner` rule below.)

1. **Containment to an installer-owned payload directory** (Decision A). `resolvedPath` — the first
   argument to `installExtension` — is **not** a durable base: for npm and git sources it is an OS
   temp dir (`resolve-source.mjs:127`, `:171`) that `installExtension` deletes in its own `finally`
   (`lib/extensions/install.mjs`, `rmSync(options._tmpDir, …)`), and both executors resolve a
   relative argv element against the **project
   root**, not the extension (`spawnGate` at `doctor.mjs:755-768` spawns with `cwd: projectRoot` at
   `:757`, invoked from `:1004`; `quality-gate.mjs:45-51` calls
   `execFile(executable, args, { cwd: ctx.cwd, shell: false })`).
   A rule checked against one base and resolved against another is not a containment property.

   Therefore the installer **copies** the declared executable payload into a project-owned directory
   `.context-index/extensions/<extension-name>/` and **rewrites** every contributed path element to
   point at its copy there. One payload directory, two emission forms, because the two consumers
   accept different ones:

   - **`command` argv elements are rewritten to an absolute path** under that directory. That is what
     makes the executor's `cwd` irrelevant and the install-time check the run-time guarantee, since
     `spawnGate` at `doctor.mjs:755-768` spawns with `cwd: projectRoot` (`:757`, invoked from
     `:1004`) and `quality-gate.mjs:45-51` uses a caller-supplied `cwd`.
   - **`package.skill` / `package.adapter` are rewritten to the `.context-index/`-relative form**
     `extensions/<extension-name>/<path-inside-extension>` — *not* absolute. `resolveReviewerPath`
     rejects an absolute path outright (`review-config.mjs:459-465`, `ABS_PATH_REJECTED`) and resolves
     a relative one against `<repoRoot>/.context-index/` (`:476-484`), so the relative form names
     exactly the same file in the same payload directory, reached the only way that loader accepts.

   Specifically:

   - Containment is asserted against the *extension source* at plan time and against the *payload
     directory* at apply time, with `realpathSync` applied to **both the base and the candidate**
     (on macOS `/var` → `/private/var` defeats a raw `startsWith`). Note that the `installSamples`
     pattern in `content-install.mjs` is `resolve()` + `startsWith` with **no**
     `realpathSync`, so this spec adds the step rather than inheriting it.
   - A `realpathSync` failure — ENOENT, broken symlink, permission — is a **refusal**, never a
     fallback: `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` for an argv candidate,
     `GOVERNANCE_PAYLOAD_MISSING` for a derived payload member that does not exist.
   - The payload set is **derived, not declared**: exactly the argv elements classified as paths,
     plus `package.skill` and `package.adapter`. There is **no** manifest-declared executable-payload
     key — an author-supplied payload list would be a second mechanism to validate for no capability
     an argv element does not already express. Every derived member must exist inside the extension
     source and survive containment, or the install refuses with `GOVERNANCE_PAYLOAD_MISSING`.
   - Copied files are written mode `0o555` (read + execute, no write).
   - `argv[0]` may instead name an interpreter from a fixed allowlist (`bash`, `sh`, `node`,
     `python3`); every other element is either a contained path or a non-path literal.

   **Consequence, stated plainly:** the shipped reference extension does *not* install unchanged.
   `extensions/example-validation-check/adev-extension.yaml` declares
   `command: [bash, extensions/example-validation-check/bin/check.sh]`, a project-root-relative path
   naming a file that exists only in this repo. It becomes `command: [bash, bin/check.sh]`
   (extension-source-relative), which the installer rewrites at install time to
   `<projectRoot>/.context-index/extensions/example-validation-check/bin/check.sh`.

2. **argv array only, never a shell string** — made true, not merely restated. `merge-gates.mjs:34-40`
   enforces argv form, but `lib/gates/doctor.mjs` never goes through `mergeGates`: `loadGates`
   (`:1147`) reads `gates.yaml` directly and `spawnGate` (`:755-768`) runs
   `spawnSync("sh", ["-c", command])` at `:767`.
   So `doctor.mjs` gains an **argv-direct branch**: an array-valued `command` is executed as
   `spawnSync(argv[0], argv.slice(1), { shell: false, cwd: projectRoot })` and never passes through
   `normaliseCommand`. String commands — the shipped `gates.yaml` `command: "npm test"` — keep the
   existing `sh -c` path. Because extensions may contribute only argv arrays, no extension-sourced
   command reaches a shell. `normaliseCommand` / `NEEDS_QUOTING` (`doctor.mjs:254-268`, `:219`) remain
   the defence in depth behind that branch and are a **pinned dependency** of Invariant 6, asserted by
   an acceptance test exactly as `lib/diagnostics/index.mjs`'s guard is.
3. **Explicit install-time consent**, with a named mechanism. `--allow-exec` is parsed in
   `cmdExtension` (`cli/index.mjs`) alongside the source positional, and threaded — together with a
   TTY determination — into `installExtension` as options `{ allowExec, interactive, promptFn }`,
   which reach the merge. When a manifest declares any executable contribution the install refuses
   unless consent is granted for that install: an interactive install (`interactive === true`, i.e.
   `process.stdin.isTTY && process.stdout.isTTY`, computed by the caller and defaulting to `false`)
   prompts, listing each command verbatim and the extension it came from; otherwise `--allow-exec` is
   required. The path **fails closed** — absent both, the install refuses with
   `GOVERNANCE_EXEC_NOT_CONSENTED`. Consent is per-install, never remembered across installs and never
   persisted, and the grant is recorded on the entry as `exec_consented_at` so an audit can
   distinguish a consented executable entry from one that predates the rule. There is **no** prior art
   for this prompt in the repo: `lib/cli/domain-extension-picker.mjs::dispatchInstall` is an init-time
   flow for bundled catalog entries and is **not** on the `adev extension install <source>` path, so
   nothing may be wired into it.

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

  **The allowlist is the *contribution* boundary, not any one loader's schema.** `gates.yaml` has two
  consumers with divergent contracts: `merge-gates.mjs:41-47` projects `id`, `command`,
  `description`, `severity`, `tier` (the last three conditionally) and drops the rest, while
  `doctor.mjs` reads `gate?.kind` off the raw file (`:844`). `command` is *required* by `merge-gates.mjs:29-32` — a gates entry without one is
  discarded — so a row omitting it would describe an entry its own consumer throws away.

  **Installer-owned fields are supply-forbidden for every registry.** `source`, `__source` and
  `exec_consented_at` are stamped by the installer and refused when supplied, in any target, ahead of
  the allowlist check (Behavior 6's precedence). `__source` is named explicitly because
  `review-config.mjs:315-328` and `:390` read it as live provenance straight off `raw`; without
  naming it, a supplied `__source` would fall through to the wrong code.

  **Decision B — `review.yaml`'s object-valued fields.** `isValidGovernanceValue`
  (`content-install.mjs:139-147`) currently accepts only strings, numbers, booleans and string arrays,
  so an object-valued field is rejected today. This spec extends that validator to accept a
  **one-level** object whose own values are strings, numbers or booleans, and no deeper — and rather
  than raise that cap, removes from extension-contributable scope the two fields that cannot fit under
  it:

  - `dispatch` is **string-only**, and must be `always` or `never`. `dispatch: triggered` is
    **refused** in both string and object form with `GOVERNANCE_FIELD_VALUE_INVALID`. Its only
    non-degenerate object form is two levels with array leaves (`review-config.mjs:167` reads
    `d.triggered ?? d`, then `:169-171` read `patterns` / `keywords` / `min_score`), which would mean
    a nested-array emitter and would hand an untrusted extension control over which files and keywords
    summon a reviewer. A bare string `dispatch: "triggered"` with no trigger object makes
    `shouldDispatch` compute `triggered = null` at `:167`, so it is a silent-misconfiguration trap
    even where it is not a capability grant. A project author can still configure `triggered` by hand.
  - `package` is a **one-level** object with exactly `{skill, adapter}`, both strings, both subject to
    the **same containment** as `command` — realpath on both base and candidate, must resolve inside
    the extension source — but a **different emission**. They are resolved by `resolveReviewerPath`
    (`review-config.mjs:408` / `:411`), which rejects an absolute path with `ABS_PATH_REJECTED`
    (`:459-465`) and resolves a relative one against `<repoRoot>/.context-index/` (`:476-484`), so
    they are emitted `.context-index/`-relative as `extensions/<extension-name>/…` rather than
    absolute. `package.args` is **refused**: `review-config.mjs:418` is
    `validated.args = pkg.args ?? {}` — unvalidated, arbitrary depth, and passed to the reviewer.

  With `triggered` and `args` out, the one-level cap is internally consistent. `patterns`, `keywords`
  and `min_score` stay omitted: they are only meaningful inside `triggered`, notwithstanding that
  `review.yaml`'s own schema header documents them at the entry position. Nested-object emission is
  the splice's responsibility (below).

  **`runner` is `plugin:`-prefixed only, and only in `diagnostics.yaml`.** `runner` outside
  `diagnostics.yaml` is refused with `GOVERNANCE_FIELD_NOT_ALLOWED`; inside it, a value not beginning
  `plugin:` is refused with `GOVERNANCE_FIELD_VALUE_INVALID`. `project:` is refused too — it names
  project-owned files the extension does not ship. `prompt` paths remain subject to the existing
  `plugin:`/relative resolution guard.

  Each row is derived from the schema its consumer enforces, not from convention: `validate.yaml`
  from `lib/governance/validate-config.mjs`, `review.yaml` from `lib/governance/review-config.mjs`
  (including `package`, the two-stage reviewer form documented by ADR-0003), `diagnostics.yaml` from
  the registry schema in `.context-index/governance/diagnostics.yaml`'s header, `boundaries.yaml`
  from the rule shape in `boundaries.yaml`'s own template. `enabled` / `disabled_reason` appear in
  every row because `explicit-governance-registries.spec.md` adds them as ordinary author-set fields;
  omitting them would make these allowlists reject valid entries once that spec lands. They appear in
  the `boundaries.yaml` row too, even though that spec's registry list (`:101`) names only four
  registries: both are ordinary author-set toggles with no capability attached, and uniformity across
  all five rows is the cheaper invariant than a row that rejects a hand-authored `enabled: false`.
- **Installer-owned field set** — `source` (stamped from install context), `__source` (live
  provenance read by `review-config.mjs:315-328`, `:390`) and `exec_consented_at` (stamped when
  consent is granted). All three are installer-written and supply-forbidden.
- **Per-install caps**, refused with `GOVERNANCE_LIMIT_EXCEEDED`: a scalar ≤ 512 characters, an argv
  ≤ 32 elements, ≤ 32 entries per target, ≤ 32 payload files.
- **Scalar rejection, not escaping.** `lib/profiles/yaml.mjs::unquote` (`:244-252`) strips surrounding
  quotes and performs **no unescape**, so no backslash scheme round-trips through the repo's own
  parser. Rather than add an escaping layer the parser cannot reverse — or a YAML dependency, which
  the constitution requires an ADR for — any supplied scalar containing a newline, carriage return,
  `"`, `'`, `#`, or a leading `-`/`?`/`:` is **refused** with `GOVERNANCE_SCALAR_UNSAFE` (Behavior 7
  states the complete character set, which also covers the flow indicators). Governance config has no
  legitimate multi-line or structural scalar; rejecting is both safe and simpler than sanitizing.
- Error codes: the complete set is **twelve**, and no other code is introduced anywhere in this spec —
  `PATH_TRAVERSAL`, `UNKNOWN_GOVERNANCE_TARGET`, `GOVERNANCE_FIELD_NOT_ALLOWED`,
  `GOVERNANCE_FIELD_VALUE_INVALID`, `GOVERNANCE_SOURCE_FORGED`, `GOVERNANCE_SCALAR_UNSAFE`,
  `GOVERNANCE_PARSE_REFUSED`, `GOVERNANCE_COMMAND_NOT_ARGV`, `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`,
  `GOVERNANCE_EXEC_NOT_CONSENTED`, `GOVERNANCE_LIMIT_EXCEEDED`, `GOVERNANCE_PAYLOAD_MISSING`.
  (`MERGE_WOULD_TRUNCATE` was dropped at revision 3: the in-place splice never rewrites keys it did
  not target, so truncation has no reachable trigger and the code would have been dead.)

### MODIFIED

**New modules** (`lib/extensions/`), so each guard is independently testable:

- `lib/extensions/governance-values.mjs` — scalar safety, argv token classification, one-level value
  validation, caps.
- `lib/extensions/governance-registry.mjs` — writable-registry → root-key table, per-registry field
  allowlists, field-value constraints, installer-owned field set.
- `lib/extensions/exec-payload.mjs` — containment assert (realpath on both base and candidate),
  payload copy plan/apply, argv rewrite.
- `lib/extensions/exec-consent.mjs` — executable-contribution collection, TTY-gated prompt,
  `--allow-exec` resolution.
- `lib/extensions/governance-splice.mjs` — in-place line-range splice, one-level nested emission.

**Existing files:**

- `lib/extensions/content-install.mjs` — the four Target State rows (`mergeGovernanceEntries`,
  `validateGovernanceEntry`, `inferRootKey`, `serializeGovernanceYaml`) plus `isValidGovernanceValue`;
  `mergeGovernanceEntries` gains an options argument carrying `extensionRoot`, `extensionName` and the
  consent grant, since Behaviors 9 and 10 cannot be evaluated from `(projectRoot, targetFile, entries)`
  alone. `inferRootKey`, `serializeGovernanceYaml` and the fill-gap loop are deleted.
- `lib/extensions/install.mjs` — two-phase ordering (validate every block of every target and obtain
  consent before any write, including before the domain-profile write), options
  `{ allowExec, interactive, promptFn }`, payload apply, and `target` constrained to the known
  registry set before dispatch.
- `cli/index.mjs` — `cmdExtension` parses `--allow-exec`, determines TTY interactivity, and threads
  both into `installExtension`.
- `lib/gates/doctor.mjs` — argv-direct execution branch for an array-valued `command`, so no
  extension-contributed command reaches `sh -c`.
- `extensions/example-validation-check/adev-extension.yaml` — `command: [bash, bin/check.sh]`,
  extension-source-relative, per Decision A.
- `tests/lib/extensions/example-validation-check-install.test.mjs:208` — assert the `checks`
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

**The splice handles seven on-disk forms, not one.** Specifying it against `validate.yaml`'s
block-sequence layout alone would destroy or fail on the others actually present. Five forms splice;
two refuse. The authoritative behavior is `lib/extensions/governance-splice.mjs`:

| # | Form | Example on disk | Splice behavior |
|---|---|---|---|
| 1 | Block sequence under a key | `checks:` then `  - id: …` | Append new items after the last **content** line of the block, so a trailing comment/blank run stays where it is; the block ends at the next unindented non-comment line |
| 2 | Empty inline list | `boundaries: []` in `boundaries.yaml`, `reviewers: []` in `review.yaml` | Rewrite the single `key: []` line as `key:` followed by the new items, carrying any trailing `#` comment over with its original spacing |
| 3 | Key with only indented comments beneath | commented rule scaffolds in `boundaries.yaml` | Insert directly after the key line, above the comment block, leaving the comments byte-identical |
| 4 | Key absent | a `gates.yaml` with no `boundaries:` key | Append `key:` plus the items at the end of the file, before any trailing blank run |
| 5 | File absent (`rawText === null`) | no `.context-index/governance/review.yaml` at all | Generate a two-line provenance header naming the root key and the extension, then proceed as form 4. Signalled by exactly `null`; an existing-but-blank file takes form 4 so it never gains a fabricated "created by adev" header |
| 6 | Root key duplicated at top level | `checks:` appearing twice | **Refuse** with `GOVERNANCE_PARSE_REFUSED`. An ambiguous splice target cannot be resolved safely, and guessing which block owns the entries would silently orphan the other |
| 7 | Root key present but not a sequence | `checks:` over a block map or scalar; also a sequence written at column 0 | **Refuse** with `GOVERNANCE_PARSE_REFUSED`. A non-array root key yields zero existing entries and degrades collision detection to append-everything; a zero-indent sequence is simultaneously a block boundary, so splicing beside it would drop both those items and every following sibling key |

Mixed CRLF/LF and lone-CR line endings are also refused with `GOVERNANCE_PARSE_REFUSED` rather than
normalised — normalising would rewrite bytes outside the splice, which is exactly what this module
exists to avoid. A uniform CRLF file stays CRLF.

**Nested emission.** `review.yaml`'s `package` is a one-level object (`{skill, adapter}`), so the
splice emits it as an indented block map beneath its key, with every leaf value subject to the same
rejection rules as a top-level scalar. Depth is capped at one level, matching the extended validator;
`dispatch` is string-only per Decision B and needs no nested emission.

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
- **Verify:** An extension cannot introduce a `command` onto an entry it did not create; a
  contributed `command` on a new entry is permitted, contained, argv-only and consented. A colliding
  entry leaves the existing entry byte-identical and is reported skipped. An unparseable registry
  refuses and is left untouched.

## Invariants

1. All existing tests pass at every step.
2. **No extension input ever becomes YAML structure.** Supplied values are data, never keys. This
   requires rejecting flow indicators, not only line breaks: `lib/profiles/yaml.mjs` dispatches a
   `{ … }` scalar to `parseFlowMap` at `:180` (parser body `:185-199`), so a scalar of
   `{command: rm -rf /}` reparses as a map carrying an extension-supplied `command` key. It also
   coerces `/^-?\d+$/` to Number (`:179`), so a numeric `id` is not a string and would not match a
   string-keyed collision check.
3. **An existing entry is never mutated by an install.** Additive or skipped, never merged.
4. Installer-owned fields (`source`, `__source`, `exec_consented_at`) are stamped by the installer and
   rejected when supplied.
5. Writes land inside `.context-index/governance/`, in one of the five writable registries, or do not
   happen. The one other directory an install may create is the payload directory
   `.context-index/extensions/<extension-name>/`, written only from files copied out of the
   extension source.
6. **Every `command`-bearing contribution is contained, argv-invoked, and consented.** Extensions may
   contribute executables; this invariant does not claim otherwise. What bounds a `command` is the
   conjunction of the three rules — containment to the installer-owned payload directory with argv
   paths rewritten absolute, argv-array invocation with no `sh -c`, and per-install human consent.

   A `diagnostics.yaml` `runner` is bounded by the guard already shipped in `lib/diagnostics/index.mjs`
   (`..` rejection before resolution, prefix-scoped allowlist roots, realpath check) **instead of**
   bound 1, not in addition to it: `resolveRunnerContained` (`:88-139`) accepts only `plugin:`- and
   `project:`-prefixed specs and rejects a path inside the extension's own directory by construction,
   so bound 1 is unsatisfiable for `runner`. A contributed `runner` must be `plugin:`-prefixed and is
   refused at install time otherwise.

   This invariant has **two declared dependencies**, not assumptions — if either regresses, the
   invariant weakens with it, and an acceptance criterion pins each:
   - `resolveRunnerContained` in `lib/diagnostics/index.mjs` (the `runner` bound itself).
   - `normaliseCommand` / `NEEDS_QUOTING` in `lib/gates/doctor.mjs` (`:254-268`, `:219`) — the
     shell-quoting that keeps the surviving `sh -c` path safe behind the argv-direct branch.
7. Unsafe input is refused, never sanitized. There is no escaping layer whose correctness the
   security properties depend on.
8. **An executable payload cannot be installed into a project whose own absolute path is unsafe as a
   governance scalar.** This is a consequence of invariants 6 and 7 rather than a separate rule, and
   it is user-visible, so it is recorded here rather than discovered as a bug report. A `command`
   argv element is emitted **absolute** (invariant 6), which embeds `projectRoot` in the value; every
   emitted path is re-checked with `assertSafeScalar` at plan time (invariant 7). A `projectRoot`
   containing `"`, `'`, `#`, `,`, `{`, `}`, `[`, `]`, a newline, or a colon followed by whitespace
   therefore refuses with `GOVERNANCE_SCALAR_UNSAFE` before a byte is written. Spaces and ordinary
   punctuation are unaffected. Sanitizing is not the remedy — an unquoted `#` truncates the emitted
   value in `lib/profiles/yaml.mjs` and a stray quote or brace reparses the line as different
   structure, and that parser has no unescape to reverse either. The remedy is to relocate the
   checkout. Non-executable slots are unaffected, because no project path is emitted for them.

## Behavioral Contract

### Behaviors

1. **When** an extension's `target` resolves outside `.context-index/governance/` **then** the install refuses with `PATH_TRAVERSAL` and writes nothing.
2. **When** an extension's `target` is not one of the five known registry files **then** the install refuses with `UNKNOWN_GOVERNANCE_TARGET`.
3. **When** an extension declaring `provides.governance` is installed **then** its entries are appended under the target registry's own root key by an in-place line splice, every other byte of the file — sibling keys, comments, formatting — is preserved unchanged, and each appended entry carries an installer-stamped `source: extension:<name>`.
4. **When** an extension's entry id collides with an existing entry **then** the colliding entry is recorded as skipped and the existing entry is left byte-identical — no key is introduced onto it, absent or otherwise.
5. **When** an extension entry carries a field outside its registry's allowlist **then** the install refuses with `GOVERNANCE_FIELD_NOT_ALLOWED`, naming the field and registry; **and when** it carries an allowlisted field whose *value* is outside that field's constrained set — `kind` outside the four values `validate-config.mjs` accepts, `dispatch` other than `always`/`never`, a `runner` not `plugin:`-prefixed, a `package` key outside `{skill, adapter}`, a non-string `id`, or an object nested more than one level — **then** the install refuses with `GOVERNANCE_FIELD_VALUE_INVALID`, naming the field and the value. Field names are checked before field values, so exactly one code is emitted per rejected entry.
6. **When** an extension entry supplies an installer-owned field (`source`, `__source`, or `exec_consented_at`) **then** the install refuses with `GOVERNANCE_SOURCE_FORGED`. **Precedence:** installer-owned fields are checked before the allowlist, so a supplied `source` always reports `GOVERNANCE_SOURCE_FORGED` and never `GOVERNANCE_FIELD_NOT_ALLOWED`. Exactly one code is emitted per rejected entry.
7. **When** any supplied value contains a newline, carriage return, `"`, `'`, `#`, `{`, `}`, `[`, `]`, `,`, or a leading `-`/`?`/`:`/`&`/`*`/`!`/`|`/`>`/`%`/`@`/backtick **then** the install is refused with `GOVERNANCE_SCALAR_UNSAFE`, naming the field. The flow indicators are load-bearing, not decorative: `lib/profiles/yaml.mjs` parses `{ … }` as a flow map, so omitting `{` lets a value reparse into a map with attacker-chosen keys. **This applies to every emitted value, not only top-level scalars** — array elements and one-level object values are checked identically, because `parseFlowSeq`/`parseFlowMap` reparse them the same way. Unsafe values are rejected, never escaped — `unquote` (`:244-252`) performs no unescape, so no escape scheme round-trips through the repo's own parser.
8. **When** a supplied `id` is not a string after parse **then** the install is refused with `GOVERNANCE_FIELD_VALUE_INVALID`. `parseYaml` coerces bare integers to Number (`:179`), and a non-string id would bypass the string-keyed collision check in Behavior 4.
9. **When** an extension entry declares `command` (in `gates.yaml`, or in `validate.yaml` with `kind: quality-gate`) — or a `review.yaml` `package.skill` / `package.adapter` — **then** the value must be an array for `command`, every element naming a path must resolve inside the extension's *source* directory and exist, `argv[0]` may instead be an allowlisted interpreter (`bash`, `sh`, `node`, `python3`), and each such file is copied to `.context-index/extensions/<extension-name>/` at mode `0o555`. The copied file's element is then rewritten to point at that copy, in the form its consumer accepts: a `command` argv element becomes an **absolute** path under the payload directory, while `package.skill` / `package.adapter` become the **`.context-index/`-relative** form `extensions/<extension-name>/…`, because `resolveReviewerPath` rejects absolute paths (`review-config.mjs:459-465`) and resolves relative ones against `<repoRoot>/.context-index/` (`:476-484`). A string `command` is refused with `GOVERNANCE_COMMAND_NOT_ARGV`; an escaping path, or a `realpathSync` failure on the candidate, with `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`; a derived payload member that does not exist with `GOVERNANCE_PAYLOAD_MISSING`.
10. **When** a manifest declares any executable contribution **then** the install refuses with `GOVERNANCE_EXEC_NOT_CONSENTED` without explicit consent for that install — an interactive prompt listing each command verbatim, or `--allow-exec` non-interactively — and records `exec_consented_at` on each executable entry. Consent is per-install, never remembered, and the path fails closed when interactivity cannot be determined.
11. **When** an extension declares `runner` outside `diagnostics.yaml` **then** the install is refused with `GOVERNANCE_FIELD_NOT_ALLOWED`; **when** it declares a `runner` inside `diagnostics.yaml` that is not `plugin:`-prefixed **then** the install is refused with `GOVERNANCE_FIELD_VALUE_INVALID`.
12. **When** the target registry cannot be parsed **then** the install refuses with `GOVERNANCE_PARSE_REFUSED` and writes nothing. It never treats an unparseable file as empty.
13. **When** an install declares governance contributions across more than one target **then** every governance block of every target is validated and consent for the union of executable contributions is obtained **before any byte is written** — including before the domain-profile write, which lands first today. A refusal on any block leaves every target, and the domain profile, byte-identical. "Writes nothing" is a per-install guarantee, not a per-target one.
14. **When** a contribution exceeds a cap — a scalar over 512 characters, an argv over 32 elements, over 32 entries for one target, or over 32 payload files — **then** the install refuses with `GOVERNANCE_LIMIT_EXCEEDED`, naming the cap.


### Error Cases

| Condition | Expected behavior | Code |
|---|---|---|
| `target` escapes the governance directory | Refuse; write nothing | `PATH_TRAVERSAL` |
| `target` not a known registry | Refuse; name the target | `UNKNOWN_GOVERNANCE_TARGET` |
| Field outside registry allowlist | Refuse; name field and registry | `GOVERNANCE_FIELD_NOT_ALLOWED` |
| Allowlisted field with a value outside its constrained set | Refuse; name field and value | `GOVERNANCE_FIELD_VALUE_INVALID` |
| `dispatch: triggered`, in string or object form | Refuse; name the value | `GOVERNANCE_FIELD_VALUE_INVALID` |
| `package` carrying `args`, or any key outside `{skill, adapter}` | Refuse; name the key | `GOVERNANCE_FIELD_VALUE_INVALID` |
| Object nested more than one level | Refuse; name the field | `GOVERNANCE_FIELD_VALUE_INVALID` |
| Non-string `id` after parse | Refuse; name the entry | `GOVERNANCE_FIELD_VALUE_INVALID` |
| Installer-owned field supplied (`source`, `__source`, `exec_consented_at`) | Refuse | `GOVERNANCE_SOURCE_FORGED` |
| Supplied scalar contains a newline, quote, `#`, or leading indicator | Refuse; name the field | `GOVERNANCE_SCALAR_UNSAFE` |
| `command` is a string rather than an argv array | Refuse; name the entry | `GOVERNANCE_COMMAND_NOT_ARGV` |
| An argv path resolves outside the extension's own directory | Refuse; name the element and the resolved path | `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` |
| Executable contribution without install-time consent | Refuse; list what would execute | `GOVERNANCE_EXEC_NOT_CONSENTED` |
| A derived payload member does not exist, or `realpathSync` fails on it | Refuse; name the member | `GOVERNANCE_PAYLOAD_MISSING` |
| `runner` declared outside `diagnostics.yaml` | Refuse; name the field | `GOVERNANCE_FIELD_NOT_ALLOWED` |
| `runner` inside `diagnostics.yaml` not `plugin:`-prefixed | Refuse; name the value | `GOVERNANCE_FIELD_VALUE_INVALID` |
| `kind` outside the four values `validate-config.mjs` accepts | Refuse; name the value | `GOVERNANCE_FIELD_VALUE_INVALID` |
| Target registry does not parse | Refuse; write nothing; leave the file untouched | `GOVERNANCE_PARSE_REFUSED` |
| Scalar > 512 chars, argv > 32 elements, > 32 entries per target, or > 32 payload files | Refuse; name the cap | `GOVERNANCE_LIMIT_EXCEEDED` |

## Module Impact Map

| Module | Impact | Changes Required |
|---|---|---|
| domain-extensions | High | All five functions (`mergeGovernanceEntries`, `validateGovernanceEntry`, `isValidGovernanceValue`, `inferRootKey`, `serializeGovernanceYaml`), plus five new modules under `lib/extensions/` and two-phase ordering in `install.mjs`; uninstall is out of scope — see `adev-plugin-xg1f.3` |
| validation | Low | `validate.yaml` stops being destroyed by a validate-targeting extension |
| unified-gates | Medium | `gates.yaml` **is** extension-writable, `command` included, bounded three ways — installer-copied payload with argv rewritten absolute, argv-array invocation, install-time consent. `transitions:` is never touched because the splice rewrites only the target key's line range and leaves every other byte of the file unchanged |
| `lib/gates/doctor.mjs` | Medium | Gains an argv-direct execution branch: an array-valued `command` runs as `spawnSync(argv[0], argv.slice(1), { shell: false, cwd: projectRoot })`, never through `normaliseCommand`. String commands keep the `sh -c` path, and `normaliseCommand`/`NEEDS_QUOTING` become a pinned dependency of Invariant 6 |
| `cli/index.mjs` | Low | `cmdExtension` parses `--allow-exec`, determines TTY interactivity, and threads `{ allowExec, interactive, promptFn }` into `installExtension` |

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
- [ ] The reference extension's own manifest is updated in the same change to `command: [bash, bin/check.sh]` and passes the new validation.
- [ ] Installing any extension targeting `gates.yaml` leaves a populated `transitions:` block byte-identical.
- [ ] An extension cannot introduce a `command` onto an existing `gates.yaml` entry — the arbitrary-execution path, asserted directly.
- [ ] A colliding entry is reported skipped and the existing entry is byte-identical afterwards.
- [ ] A supplied scalar containing `\n`, `"` or `#` is refused with `GOVERNANCE_SCALAR_UNSAFE` and nothing is written.
- [ ] An extension supplying an installer-owned field is refused.
- [ ] A `target` of `risk-policies.yaml` or `sensitive-paths.yaml` is refused; the writable set is exactly the five tabled registries.
- [ ] The shipped reference extension installs successfully with its `command` rewritten to the installed payload path, once consent is granted — the capability is preserved, not merely described. Asserted end-to-end in a temp project that is **not** this repo: the installed check loads via `loadValidateConfig` and executes.
- [ ] A `command` whose path resolves outside the extension's own directory is refused with `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`, asserted for both `gates.yaml` and `validate.yaml`.
- [ ] A string-valued `command` is refused with `GOVERNANCE_COMMAND_NOT_ARGV`.
- [ ] An executable contribution without consent is refused; with `--allow-exec` it installs and each executable entry carries `exec_consented_at`.
- [ ] `kind` outside the four values `validate-config.mjs` accepts is refused with `GOVERNANCE_FIELD_VALUE_INVALID`.
- [ ] A `review.yaml` entry with an object-valued `package: {skill, adapter}` round-trips through install and `loadReviewConfig`; `package.args`, `dispatch: triggered` and any two-level nested object are refused.
- [ ] A contributed `package.skill` is emitted as a `.context-index/`-relative path (`extensions/<name>/…`), not an absolute one, and `loadReviewConfig` resolves it — an absolute emission would be rejected by `resolveReviewerPath` with `ABS_PATH_REJECTED`. A contributed `command` argv element is emitted absolute, and the two forms are asserted to name the same file in the same payload directory.
- [ ] An unsafe value inside an array element or a nested object value is refused, not only a top-level scalar.
- [ ] The `lib/diagnostics/index.mjs` containment guard is asserted by a test owned here, so Invariant 6's first declared dependency cannot regress silently.
- [ ] `normaliseCommand` / `NEEDS_QUOTING` (`lib/gates/doctor.mjs`) are asserted by a test owned here — Invariant 6's second declared dependency — and an array-valued `command` is proven to execute through the argv-direct branch with `shell: false`, never through `normaliseCommand`, while the shipped string-form gate keeps working.
- [ ] A scalar of `{command: x}` is refused with `GOVERNANCE_SCALAR_UNSAFE` — the flow-map reparse path, asserted directly.
- [ ] A numeric `id` is refused rather than silently bypassing the collision check.
- [ ] A supplied `source` reports `GOVERNANCE_SOURCE_FORGED`, never `GOVERNANCE_FIELD_NOT_ALLOWED`.
- [ ] Each allowlist accepts every field an extension **may contribute** to that registry — not every field the loader reads — asserted by round-tripping a maximal contributable entry per registry through install and then through that registry's loader. (`gates.yaml` has two consumers with divergent contracts: `merge-gates.mjs:41-47` projects at most five fields, `doctor.mjs:844` reads `gate?.kind` off the raw file, so "the loader" is not well defined for it.)
- [ ] Behavior 3 asserted directly: an installed entry is appended under the registry's own root key, carries `source: extension:<name>`, and every other byte of the file is unchanged.
- [ ] Behavior 5's value half asserted: an allowlisted field with a value outside its constrained set is refused with `GOVERNANCE_FIELD_VALUE_INVALID`, and a disallowed field *name* still reports `GOVERNANCE_FIELD_NOT_ALLOWED`.
- [ ] Behavior 11 asserted for both halves: `runner` outside `diagnostics.yaml` is refused with `GOVERNANCE_FIELD_NOT_ALLOWED`; a `project:`-prefixed `runner` inside it is refused with `GOVERNANCE_FIELD_VALUE_INVALID`.
- [ ] Behavior 13 asserted: an install whose first governance target is valid and whose second is refused leaves the first registry **and** the domain profile byte-identical — the guarantee is per-install, not per-target.
- [ ] Behavior 14 asserted: each of the four caps refuses with `GOVERNANCE_LIMIT_EXCEEDED` and writes nothing.
- [ ] A non-interactive install declaring an executable contribution without `--allow-exec` exits non-zero and writes nothing — the fail-closed path.
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
- **A manifest-declared, multi-file executable payload list.** Decision A derives the payload set from
  argv path elements and `package.skill`/`package.adapter`. A declared payload key is a separate
  mechanism with its own containment tests and belongs to a future spec; the shipped reference
  extension needs a single-file script.

## Revision 5 — Decisions of Record

Revision 4 passed review as **PASS_WITH_NOTES by operator override**: three reviewers returned BLOCK
with 18 blockers that were *not* waived. Revision 5 reconciles the document against those blockers.

Two of them (SEC-2/SA-3/CON-6 and SA-6/CON-5) required a decision to be *made*, not merely written
down. Because `/adev:build` was running in **AUTO mode** under that operator override, both were
resolved by the **planning agent**, not by a human, under the standing instruction to choose the
option granting an untrusted extension the **least** capability:

- **Decision A** — an extension's executable payload is copied into the project-owned directory
  `.context-index/extensions/<extension-name>/` and its argv path elements are rewritten to absolute
  paths under it. Recorded above under "Executable contributions", bound 1.
- **Decision B** — `dispatch: triggered` and `package.args` are **not** extension-contributable; the
  one-level object cap is kept rather than raised. Recorded above in the allowlist section.

Both decisions, their full rationale traced clause by clause to verified code facts, and the derived
decisions that follow from them (the `doctor.mjs` argv-direct branch, `runner` bounded by
substitution, per-install atomicity, the caps, and the installer-owned field set) live in
`.context-index/specs/cross-cutting/extension-governance-merge-hardening.plan.md`, section **Design
Decisions of Record**. A human auditing the override should read that section: it names who decided
what and why, and it is the source of truth this revision was written from.

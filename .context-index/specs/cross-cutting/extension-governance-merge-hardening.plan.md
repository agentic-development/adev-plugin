# Implementation Plan: Extension Governance Merge Hardening

> **Methodology:** adev
> **Charter:** (cross-cutting — no parent charter)
> **Spec:** `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md` (revision 4)
> **Review:** PASS_WITH_NOTES (2026-08-15) — **operator override**; three reviewers returned BLOCK with 18 blockers that were *not* waived
> **Platform:** Node.js, JavaScript (ESM `.mjs`), npm, `node:test`

**Goal:** Make an extension's governance contribution write exactly what it declared, only where it is permitted to write, and never mutate an entry it did not create — including a durable, bounded, consented path for the executable contributions the operator chose to keep.

**Architecture:** The current merge (`lib/extensions/content-install.mjs:163-256`) validates one field, joins an unchecked `target`, reserializes the whole file from a partial parse, and fills gaps into project-owned entries. This plan replaces that single function with a **two-phase pipeline**: a pure *plan* phase (resolve target → root key, allowlist fields, check scalars, classify and contain argv, collect the union of executable contributions, obtain consent) that writes nothing, followed by an *apply* phase (copy the executable payload into a project-owned directory, splice new entries into the target file by line range) that only runs once every block of every target has passed. New primitives live in four small modules under `lib/extensions/`; `content-install.mjs` becomes their composition point. `lib/gates/doctor.mjs` gains an argv-direct execution branch so no extension-contributed command can ever reach `sh -c`.

---

## Review Notes Carried Forward

The review verdict is an operator override. Its 18 blockers stand and are treated here as open design questions. All five deduplicated defects from the review Summary are resolved below; every task cites the blocker IDs it closes.

| # | Review defect | Resolved by |
|---|---|---|
| 1 | Rev-3 design still in the document (SA-1, SEC-5, CON-1, CON-2, CON-3, CON-7) | Task 1 |
| 2 | Bound 1 has no durable base, no run-time counterpart (SA-3, SEC-2, SEC-3, CON-6) | **Decision A**; Tasks 4, 8, 10 |
| 3 | Bound 2 rests on a false premise (SA-2, SEC-1) | Task 9 |
| 4 | Bound 3 has no mechanism and no plumbing (SA-4, SA-5, SEC-4) | Task 5, Task 8 |
| 5 | `review.yaml` allowlist row is wrong (SA-6, CON-5) | **Decision B**; Task 3 |
| + | Three undeclared error codes (CON-4); false `installSamples` claim (CON-6b) | Task 1 |
| + | Per-target not per-install atomicity (SA-9, SEC-8, CON-13) | Task 7, Task 8 |
| + | `source`/`exec_consented_at` unallowlisted, invisible to gate consumers (SEC-9) | Task 3, Task 7 |
| + | `__source` unnamed as installer-owned (CON-12) | Task 3 |
| + | `runner` bound is substitution, not addition (SA-8, SEC-7) | Task 3, Task 11 |
| + | Argv token rules vs. Behavior 7's leading-`-` rule (SEC-6) | Task 2 |
| + | Unhandled splice forms, no caps (SEC-10) | Task 2, Task 6 |
| + | Behaviors without ACs / AC without Behavior (CON-11) | Task 1 |
| + | Citation drift (CON-14) | Task 1 |

---

## Design Decisions of Record

The review states two decisions must be *made*, not merely written down. `/adev:build` ran in AUTO mode, so both were resolved here by the planning agent under the standing instruction to choose the option granting an untrusted extension the **least** capability. Both are auditable, and both are written back into the spec by Task 1.

### Decision A — Where an extension's executable payload lives after install

**Chosen:** the installer **copies** the declared executable payload into a project-owned directory `.context-index/extensions/<extension-name>/`, and **rewrites** every contributed argv path element to an absolute path under that directory. Containment is asserted against the *extension source* at plan time and against the *payload directory* at apply time, with `realpathSync` applied to **both the base and the candidate**.

**Rationale (each clause traces to a verified code fact):**

- `resolvedPath` is not durable. `resolve-source.mjs:127` (npm) and `:171` (git) hand back an OS temp dir, and `install.mjs:178-183` deletes it in a `finally`. Any rule keyed on `resolvedPath` names a directory that does not exist when the gate runs. (SA-3, SEC-2)
- Both executors resolve relative argv against the **project root**, not the extension: `doctor.mjs:965` spawns with `cwd: projectRoot`, and `quality-gate.mjs:45-51` calls `execFile(executable, args, { cwd: ctx.cwd, shell: false })` with a caller-supplied cwd. An install-time check against one base and a run-time resolution against another is not a containment property at all. Rewriting to an **absolute** path makes `cwd` irrelevant, so the install-time check *is* the run-time guarantee. (SEC-2)
- Copying only what was named is strictly less capability than any alternative: the extension can execute nothing it did not ship and nothing the installer did not vet, and it can never name a project-owned file. Requiring absolute paths rooted at the installed dir (SEC-2 option b) leaves the temp-dir problem unsolved; copying the whole extension tree would place unvetted bytes in the project for no capability gain.
- The payload set is closed and **derived, not declared**: exactly the argv elements classified as paths, plus `package.skill` / `package.adapter`. There is no `provides.exec_payload` manifest key — an author-supplied payload list would be a second mechanism to validate for no capability an argv element does not already express, and specifying a manifest key with no implementing task is the "mechanism does not exist" defect class the review flagged at SA-4. A multi-file payload is out of scope for this spec; a single-file script is what the shipped reference extension needs, and a future spec can add a declared payload list with its own containment tests. Every derived member must exist inside the extension source and survive containment, or the install refuses with `GOVERNANCE_PAYLOAD_MISSING`. Copied files are written mode `0o555` (read + execute, no write).
- `realpathSync` failure (ENOENT, broken symlink, permission) is a **refusal**, never a fallback. The spec's claim that `installSamples` uses `realpathSync` is false — `content-install.mjs:307-318` is `resolve()` + `startsWith` only (CON-6b) — so this plan adds the step rather than inheriting it, and realpaths the base too (macOS `/var`→`/private/var` defeats a raw `startsWith`).

**Consequence, stated plainly:** the shipped reference extension **does not install unchanged**. `extensions/example-validation-check/adev-extension.yaml` declares `command: [bash, extensions/example-validation-check/bin/check.sh]` — a project-root-relative path that names `<projectRoot>/extensions/...`, a file that exists only in this repo. It becomes `command: [bash, bin/check.sh]` (extension-source-relative), which the installer rewrites at install time to `<projectRoot>/.context-index/extensions/example-validation-check/bin/check.sh`. Spec AC L400 is amended by Task 1 from "installs successfully unchanged, including its `command`" to "installs successfully with its `command` rewritten to the installed payload path", and Task 10 asserts it end-to-end **in a temp project that is not this repo** (SEC-3).

### Decision B — Are `dispatch: triggered` and `package.args` extension-contributable?

**Chosen: no, to both.** The one-level object cap is kept, and the two fields that could not fit under it are removed from extension-contributable scope rather than the cap being raised.

**Rationale:**

- `dispatch`'s only non-degenerate object form is two levels with array leaves — `review-config.mjs:167` reads `d.triggered ?? d`, then `:169-171` read `patterns` / `keywords` / `min_score`. Raising the cap to two levels for this one field means writing a nested-array emitter, extending scalar checking through two more levels, and giving an untrusted extension control over *which files and keywords* summon a reviewer. Refusing it costs an extension nothing it can accomplish another way (a project author can still configure `triggered` by hand) and removes an entire emitter from the attack surface.
- `dispatch` is therefore allowlisted as a **string only**, and only `always` or `never`. `triggered` is refused in both string and object form with `GOVERNANCE_FIELD_VALUE_INVALID`: a bare string `dispatch: "triggered"` with no trigger object makes `shouldDispatch` compute `triggered = null` at `review-config.mjs:167`, so it is a silent-misconfiguration trap even where it is not a capability grant.
- `package` is contributable as a **one-level** object with exactly `skill` and `adapter`, both strings, both subject to the same payload containment and rewrite as `command` (they are resolved by `resolveReviewerPath`, `review-config.mjs:409` / `:412`). `args` is refused: `review-config.mjs:418` is `validated.args = pkg.args ?? {}` — completely unvalidated, arbitrary depth, and passed to the reviewer.
- With `triggered` and `args` out, the one-level cap is internally consistent for the first time. `patterns` / `keywords` / `min_score` stay omitted (they are only meaningful inside `triggered`), which also settles CON-9's objection that the review.yaml schema header documents them at the entry position.

**Consequence:** spec AC L405 is rewritten by Task 1 to "a `review.yaml` entry with an object-valued `package: {skill, adapter}` round-trips through install and `loadReviewConfig`; `package.args`, `dispatch: triggered` and any two-level nested object are refused." AC L411 is scoped to the fields an extension **may** contribute per registry, not every field the loader reads — the previous wording was unsatisfiable for `gates.yaml` too, which has two consumers with divergent contracts (`merge-gates.mjs:41-47` projects five fields; `doctor.mjs:805` reads `gate?.kind`, which that projection drops). (SA-7, CON-8)

### Derived decisions (same conservative rule)

- **Bound 2 is made true rather than restated.** `doctor.mjs` gains an argv-direct branch: an **array**-valued `command` is executed as `spawnSync(argv[0], argv.slice(1), { shell: false, cwd: projectRoot })` and never passes through `normaliseCommand`. String commands (the shipped `gates.yaml:28` `command: "npm test"`) keep the existing `sh -c` path. Because extensions may contribute only argv arrays, no extension-sourced command reaches a shell. `normaliseCommand` / `NEEDS_QUOTING` (`doctor.mjs:254-268`, `:219`) are additionally **pinned by an acceptance test** as a declared dependency, mirroring the diagnostics-guard pin, so defence in depth survives if the branch regresses. (SA-2, SEC-1)
- **`runner` is bounded by substitution, not addition.** `resolveRunnerContained` (`lib/diagnostics/index.mjs:88-138`) accepts only `plugin:` and `project:` prefixes and rejects everything else by construction, so bound 1 is *unsatisfiable* for `runner` — the two rules are mutually exclusive, exactly as SA-8/SEC-7 observe. A contributed `runner` must be `plugin:`-prefixed (a bundled runner) and is refused otherwise at install time, not at dispatch. `project:` is refused too: it names project-owned files the extension does not ship.
- **Atomicity is per-install, not per-target.** Phase 1 validates every governance block of every target and obtains consent for the union before Phase 2 writes a single byte — including before the domain-profile write, which currently lands first at `install.mjs:75-86`. (SA-9, SEC-8, CON-13)
- **Caps are added.** Scalar ≤ 512 chars, argv ≤ 32 elements, entries ≤ 32 per target, payload ≤ 32 files — `GOVERNANCE_LIMIT_EXCEEDED`. (SEC-10)
- **Installer-owned field set is `source`, `__source`, `exec_consented_at`.** `review-config.mjs:315-328` and `:390` read `__source` as live provenance off `raw`, so an unnamed `__source` would fall through to the wrong error code. (SEC-9, CON-12)

### Error codes (final set — 12)

`PATH_TRAVERSAL`, `UNKNOWN_GOVERNANCE_TARGET`, `GOVERNANCE_FIELD_NOT_ALLOWED`, `GOVERNANCE_FIELD_VALUE_INVALID`, `GOVERNANCE_SOURCE_FORGED`, `GOVERNANCE_SCALAR_UNSAFE`, `GOVERNANCE_PARSE_REFUSED`, `GOVERNANCE_COMMAND_NOT_ARGV`, `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`, `GOVERNANCE_EXEC_NOT_CONSENTED`, `GOVERNANCE_LIMIT_EXCEEDED`, `GOVERNANCE_PAYLOAD_MISSING`.

Three were undeclared in the spec's ADDED list (CON-4); three are new to this plan (`GOVERNANCE_FIELD_VALUE_INVALID` closes CON-11, `GOVERNANCE_LIMIT_EXCEEDED` closes SEC-10, `GOVERNANCE_PAYLOAD_MISSING` follows from Decision A). Task 1 writes all twelve into the spec.

---

## Scope Check

This is one subsystem — the extension → governance write path — and every task below is a precondition of the next guard's soundness. The spec's own constitution reference states Step 3 "should not be split across releases from Step 1". It ships as one plan, one branch, one PR.

---

## File Structure

**Create:**

- `lib/extensions/governance-values.mjs` — scalar safety, argv token classification, one-level value validation, caps
- `lib/extensions/governance-registry.mjs` — writable-registry → root-key table, per-registry field allowlists, field-value constraints, installer-owned field set
- `lib/extensions/exec-payload.mjs` — containment assert (realpath both sides), payload copy plan/apply, argv rewrite
- `lib/extensions/exec-consent.mjs` — executable-contribution collection, TTY-gated prompt, `--allow-exec` resolution
- `lib/extensions/governance-splice.mjs` — in-place line-range splice for the seven on-disk forms, one-level nested emission
- `tests/lib/extensions/governance-values.test.mjs`
- `tests/lib/extensions/governance-registry.test.mjs`
- `tests/lib/extensions/exec-payload.test.mjs`
- `tests/lib/extensions/exec-consent.test.mjs`
- `tests/lib/extensions/governance-splice.test.mjs`
- `tests/lib/extensions/governance-merge-hardening.test.mjs` — the behavioral suite for the merge contract
- `tests/lib/extensions/invariant-dependencies.test.mjs` — pins `resolveRunnerContained` and `normaliseCommand`/`NEEDS_QUOTING`
- `tests/gates/doctor-argv-execution.test.mjs`
- `tests/specs/extension-governance-merge-hardening-consistency.test.mjs` — spec self-consistency lint

**Modify:**

- `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md` — revision 5: remove the rev-3 design, record Decisions A and B, declare all twelve error codes, correct the citations
- `lib/extensions/content-install.mjs:101-269` — replace `validateGovernanceEntry`, `mergeGovernanceEntries`, `isValidGovernanceValue`; delete `inferRootKey`, `serializeGovernanceYaml`, `serializeYamlValue`, and the fill-gap loop at `:205-209`
- `lib/extensions/install.mjs:37,73-98,178-183` — two-phase ordering, options `{ allowExec, interactive, promptFn }`, payload apply, target constraint before dispatch
- `cli/index.mjs:1207-1295` — parse `--allow-exec`, detect TTY, thread both into `installExtension`
- `lib/gates/doctor.mjs:955-975` — argv-direct execution branch for array-valued `command`
- `extensions/example-validation-check/adev-extension.yaml:13` — `command: [bash, bin/check.sh]`
- `tests/lib/extensions/example-validation-check-install.test.mjs:206-212` — assert the `checks` contract, drop `validators || checks`
- `tests/lib/extensions/content-install.test.mjs` — update governance-merge expectations to the new contract
- `tests/lib/extensions/install.test.mjs` — two-phase and consent expectations
- `tests/cli-extension.test.mjs` — `--allow-exec` flag surface
- `docs/extensions.md`, `docs/governance.md` — writable registries, payload directory, consent flag
- `docs/cli-reference.md` — `adev extension install --allow-exec`

**Reference (read, do not modify):**

- `lib/governance/validate-config.mjs:19-24,111,188-293,420-443` — the four `kind` values, the `checks` root key, the field projection, the argv-only quality-gate rules
- `lib/governance/review-config.mjs:21,163-188,334-420` — dispatch/package shapes, `__source` provenance
- `lib/domains/merge-gates.mjs:29-47` — required `command`, argv-only enforcement, five-field projection
- `lib/diagnostics/index.mjs:88-138` — `resolveRunnerContained`, the guard Invariant 6 depends on
- `lib/profiles/yaml.mjs:30-34,173-183,244-253` — parse-side coercions and the absence of any unescape
- `lib/extensions/content-install.mjs:285-340` — `installSamples`, the containment pattern (note: **no** `realpathSync`)
- `.context-index/governance/*.yaml` — the seven on-disk registries; five writable

---

## Context Packets

The spec has no `source-manifest.files[]` in frontmatter, so packets are derived from the Current State / Module Impact tables and from the reviewers' verified citations. Read the named line ranges, not whole files, except where "full" is stated.

### Task 1 Context
- Spec: `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md` (full)
- Review: `.context-index/specs/cross-cutting/extension-governance-merge-hardening.review.md` (full — the 18 blockers are the edit list)
- Blockers: `.context-index/specs/cross-cutting/extension-governance-merge-hardening.blockers.md` (full)
- This plan: the **Design Decisions of Record** section is the source of truth for the revision
- Sibling spec: `.context-index/specs/cross-cutting/explicit-governance-registries.spec.md` (`:4-5` depends-on, `:101` registry list, `:105` `source`) — for CON-9

### Task 2 Context
- Spec: Behaviors 7, 8 (L340-341); Invariant 2 (L309-313); Error Cases rows for `GOVERNANCE_SCALAR_UNSAFE`
- Review: SEC-6 (argv token rules), SEC-10 (caps, `parseInlineValue` coercions)
- Source: `lib/profiles/yaml.mjs:30-34,173-183,180-199,244-253` (full read — the parser is the threat model)
- Source (signatures only): `lib/extensions/content-install.mjs:139-147` (`isValidGovernanceValue` today)
- Sample: `lib/extensions/content-install.mjs:285-340` for the module's error-code + `throw` style

### Task 3 Context
- Spec: Changes Catalog ADDED — registry table (L129-143), allowlist table (L177-221); Behaviors 5, 6, 11
- Review: SA-6, SA-7, SEC-9, CON-8, CON-9, CON-11, CON-12
- Source: `lib/governance/validate-config.mjs:19-25,188-293` (the four kinds + projected fields)
- Source: `lib/governance/review-config.mjs:21,163-188,334-420` (dispatch, package, `__source`)
- Source: `lib/domains/merge-gates.mjs:29-47` (required `command`, five-field projection)
- Source: `.context-index/governance/diagnostics.yaml` header, `.context-index/governance/boundaries.yaml` (full — both are small; they define the remaining two rows)

### Task 4 Context
- Spec: bound 1 (L156-162); Behavior 9 (L342); Invariant 5 (L317-318)
- Review: SA-3, SEC-2, SEC-3, CON-6 — **read all four in full**; they are the reason this module exists
- Plan: **Decision A** above
- Source: `lib/extensions/content-install.mjs:285-340` (`installSamples` — the pattern being extended, minus its missing realpath)
- Source: `lib/extensions/resolve-source.mjs:122-146,159-177` (why `resolvedPath` is not durable)
- Source (signatures only): `lib/extensions/install.mjs:37,178-183`

### Task 5 Context
- Spec: bound 3 (L166-176); Behavior 10 (L343); Error Cases row `GOVERNANCE_EXEC_NOT_CONSENTED`
- Review: SA-4, SA-5, SEC-4 — the mechanism is greenfield; zero prior art in the repo
- Source: `cli/index.mjs:1207-1295` (`cmdExtension` — positional-only argv parsing today)
- Source: `lib/cli/domain-extension-picker.mjs:250,269-299` (`dispatchInstall` — **not** on this path; do not wire into it)
- Source: `cli/index.mjs` — an existing flag-parsing verb for style (any `cmd*` that reads `process.argv.slice(3)`)

### Task 6 Context
- Spec: Migration Step 2 (L259-287) — the three-form table; nested emission (L273-275)
- Review: SEC-10 (the four omitted forms), SA-1 (comment preservation rationale)
- Source: `lib/profiles/yaml.mjs` (full — the splice must not use it for writing, and must agree with it on reading)
- Source: `lib/extensions/content-install.mjs:242-269` (the serializer being deleted; its unquoted-string defect at `:262` is the reason)
- Fixtures: `.context-index/governance/validate.yaml` (block sequence + 20 comment lines), `boundaries.yaml` (`boundaries: []`), `review.yaml` (`reviewers: []`), `gates.yaml` (`transitions: {}` at `:70`)

### Task 7 Context
- Spec: Behaviors 3, 4, 6, 12; Invariants 3, 4, 7; Migration Step 3 (L289-304)
- Review: SEC-8, SEC-9, CON-12, CON-13
- Source: `lib/extensions/content-install.mjs:88-269` (full — this is the rewrite target)
- Modules from Tasks 2, 3, 4, 6 (their exported signatures)
- Test: `tests/lib/extensions/content-install.test.mjs` (signatures only — `grep "^import\|^describe\|  test("`)

### Task 8 Context
- Spec: Invariant 5; Behavior 1, 2, 10; Module Impact Map
- Review: SA-5 (signature change), SA-9, SEC-8 (two-phase ordering)
- Source: `lib/extensions/install.mjs` (full)
- Source: `cli/index.mjs:1207-1295`
- Test: `tests/lib/extensions/install.test.mjs` (signatures only)

### Task 9 Context
- Spec: bound 2 (L163-165); Invariant 6
- Review: SA-2, SEC-1 — **read in full**; SEC-1 contains the verified exploit
- Source: `lib/gates/doctor.mjs:219,254-268,737-787,955-975,1108-1133` (full read of each range)
- Source: `lib/domains/merge-gates.mjs:29-47`
- Source: `lib/governance/quality-gate.mjs:39-55` (the already-safe `shell: false` executor, for symmetry)
- Fixture: `.context-index/governance/gates.yaml:24-34` (the shipped string-form gate that must keep working)

### Task 10 Context
- Spec: AC L393, L400, L401, L415
- Review: SEC-3 (why the reference extension fails today), CON-6
- Plan: **Decision A** (the rewrite contract the manifest must satisfy)
- Source: `extensions/example-validation-check/adev-extension.yaml` (full), `extensions/example-validation-check/bin/check.sh` (full)
- Test: `tests/lib/extensions/example-validation-check-install.test.mjs:200-215,290-345` (full read of both ranges)
- Source: `lib/governance/validate-config.mjs:100-115,420-443` (what the installed check must satisfy to load and execute)

### Task 11 Context
- Spec: Invariant 6 (L319-326); AC L407
- Review: SA-8, SEC-7, SEC-1 (the second pinned dependency)
- Source: `lib/diagnostics/index.mjs:88-148,340-390` (full)
- Source: `lib/gates/doctor.mjs:219,254-268`

### Task 12 Context
- Docs: `docs/extensions.md`, `docs/governance.md`, `docs/cli-reference.md` (full — small files)
- Test: `tests/docs/extensions-links.test.mjs` (signatures only — the assertion style to follow)
- Plan: File Structure and Design Decisions sections above

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: First-run PASS: Data Engineering Extension (confidence: medium)
- **Pattern:** When restructuring bundled content into installable extensions, preserve domain config files by copying into `extensions/<name>/domain/` before removing the `templates/domains/<name>/` source; integration tests must exercise `installExtension` end-to-end and call `loadDomainConfig` to confirm resolution returns the domain-specific reviewer (not the software default).
- **Evidence:** 1 observation

### Heuristic: First-run PASS: Process Automation Extension (confidence: medium)
- **Pattern:** A second domain-extension package validated cleanly using the same structural pattern: `extensions/<name>/{adev-extension.yaml, domain/, README.md}`, install via local path, verify `loadDomainConfig` returns the domain-specific reviewer.
- **Evidence:** 1 observation

> **Applied to this plan:** both heuristics say the same thing — extension work is only proven by an end-to-end `installExtension` call followed by a *loader* call. Tasks 8 and 10 are written that way, and Task 10 additionally installs into a temp project that is not this repo (SEC-3).

---

## Parallelization

- **Group A (sequential):** Task 1 → (nothing depends on it at the code level, but it fixes the contract the rest implement, so it lands first)
- **Group B (independent):** Task 2 → Task 3 (Task 3 imports Task 2's value checks)
- **Group C (independent):** Task 4 (no file overlap with A or B)
- **Group D (independent):** Task 6 (no file overlap with A, B, or C)
- **Group E (sequential, depends on C):** Task 5
- **Group F (sequential, depends on B, C, D, E):** Task 7 → Task 8 → Task 10
- **Group G (depends on B for Task 11 only):** Task 9 → Task 11. Task 9 is fully independent; Task 11 imports `validateEntryFields` from Task 3, so it must not start until Group B has landed.
- **Group H (last):** Task 12

Groups B, C, D and G can run concurrently. Group E joins after C. Group F is the integration spine and is strictly sequential.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Reconcile spec to revision 5 (decisions of record) | medium | unit | — | 1 create, 1 modify |
| 2 | Scalar safety, argv classification, caps | medium | unit | — | 2 create, 0 modify |
| 3 | Writable-registry table and per-registry allowlists | medium | unit | Task 2 | 2 create, 0 modify |
| 4 | Executable payload containment, copy, and argv rewrite | large | unit | — | 2 create, 0 modify |
| 5 | Install-time consent (`--allow-exec` + TTY prompt) | medium | unit | Task 4 | 2 create, 1 modify |
| 6 | In-place registry splice (seven on-disk forms) | large | unit | — | 2 create, 0 modify |
| 7 | Two-phase governance merge in `content-install.mjs` | large | unit | Tasks 2,3,4,6 | 1 create, 2 modify |
| 8 | Wire two-phase install, consent, and payload into `installExtension` | large | integration | Tasks 5,7 | 0 create, 4 modify |
| 9 | Argv-direct gate execution in `doctor.mjs` | medium | unit | — | 1 create, 1 modify |
| 10 | Reference extension end-to-end in a foreign temp project | medium | integration | Task 8 | 0 create, 2 modify |
| 11 | Pin Invariant 6's two declared dependencies | small | unit | Tasks 3, 9 | 1 create, 0 modify |
| 12 | Documentation for the new contribution contract | small | unit | Task 8 | 0 create, 3 modify |

---

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 10 | fallback |
| integration | 2 | detected (medium confidence) |

⚠ Low confidence assignments:
- Task 8: strategy=integration (detected, medium confidence) — it drives `installExtension` end to end against a temp project; verify before proceeding.
- Task 10: strategy=integration (detected, medium confidence) — same, plus it executes the installed quality gate.

**Granularity:** `per-behavior` (source: fallback — no `test_policy.granularity` in `manifest.yaml`, no `granularity` key in `templates/domains/software/test-config.yaml`). Each task's `**Tests:**` names the suite that owns the behaviors it implements; tasks sharing a behavior extend the same suite rather than creating a new one.

---

## Test Infrastructure Requirements

> These requirements must be satisfied before integration tests can run.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| Local filesystem temp dirs (`mkdtempSync`) | Task 8, Task 10 | integration |
| POSIX `bash` on `PATH` | Task 10 | integration |

### Credentials / Environment Variables

None. This spec's integration surface is entirely local: no network, no registry, no credentials. Tests use local-path extension sources (`resolveExtensionSource` on a directory), which take the no-temp-dir branch and therefore never touch npm or git.

### Pre-Provisioned State

- [ ] A writable temp directory (the repo's `tests/helpers.mjs::createTempDir()` already provides this)
- [ ] `bash` available for the reference extension's `bin/check.sh` (Task 10 skips its execute assertion on Windows only; it must **not** skip on POSIX)

### CI Configuration

These tests run inside the default suite — `npm test` — because they need no external infrastructure. No separate script, no exclusion.

### Unresolved Requirements

None.

---

## Tasks

Branch for every task: `feat/domain-extensions/governance-merge-hardening` (created once, at Task 1). Every commit carries the `Spec:` and `Plan-task:` trailers required by the constitution.

`specialists: []` in `.context-index/manifest.yaml`, so every task is tagged `[specialist: none]`.

### Task 1: Reconcile spec to revision 5 — decisions of record [specialist: none]

**Charter capability:** n/a (cross-cutting spec; no parent charter)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/specs/extension-governance-merge-hardening-consistency.test.mjs`
- Modify: `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md`

**Tests:** create `tests/specs/extension-governance-merge-hardening-consistency.test.mjs` — a deterministic lint over the spec text. The spec is the contract every later task implements; a contradiction in it is a defect with a reproducible test, exactly like a code defect.

**Context to load:** see Task 1 Context above.

**Closes:** SA-1, SEC-5, CON-1, CON-2, CON-3, CON-7 (defect 1); CON-4; CON-6b; CON-9; CON-10; CON-11; CON-14.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SPEC = '.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md';
const text = readFileSync(SPEC, 'utf8');

test('no rev-3 exclusion prose survives', () => {
  for (const stale of [
    'cannot contribute an executable field at all',
    'deliberately absent from the `gates.yaml` row',
    'becomes non-writable by extensions entirely',
    'ships a `diagnostics.yaml` runner',
  ]) {
    assert.equal(text.includes(stale), false, `stale rev-3 claim still present: ${stale}`);
  }
});

test('every error code used is declared in the ADDED list', () => {
  const declared = new Set(/### ADDED[\s\S]*?- Error codes:([\s\S]*?)\n\n/.exec(text)[1]
    .match(/GOVERNANCE_[A-Z_]+|PATH_TRAVERSAL|UNKNOWN_GOVERNANCE_TARGET/g));
  const used = new Set(text.match(/GOVERNANCE_[A-Z_]+|PATH_TRAVERSAL|UNKNOWN_GOVERNANCE_TARGET/g));
  for (const code of used) assert.ok(declared.has(code), `undeclared error code: ${code}`);
  assert.equal(declared.size, 12);
});

test('MODIFIED names every file the implementation touches', () => {
  for (const f of [
    'lib/extensions/content-install.mjs',
    'lib/extensions/install.mjs',
    'lib/gates/doctor.mjs',
    'cli/index.mjs',
    'extensions/example-validation-check/adev-extension.yaml',
  ]) {
    assert.ok(text.includes(f), `MODIFIED omits ${f}`);
  }
});

test('decisions A and B are recorded with rationale', () => {
  assert.match(text, /\.context-index\/extensions\/<extension-name>\//);
  assert.match(text, /`dispatch: triggered`[^.]*refused|refused[^.]*`dispatch: triggered`/);
  assert.match(text, /`package\.args`[^.]*refused|refused[^.]*`package\.args`/);
});

test('revision is 5', () => {
  assert.match(text, /^revision: 5$/m);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/extension-governance-merge-hardening-consistency.test.mjs`
Expected: FAIL — five assertions fail against revision 4.

- [ ] **Implement**

Edit the spec to revision 5. The edit list, in file order:

1. **Frontmatter** — `revision: 5`, `updated: <today>`.
2. **L110-119 Improvements** — delete "The write is inert…" (L115-116). Replace with: *"**The write is bounded when it executes.** An extension may contribute an executable field, and every such contribution is contained to an installer-copied payload directory, invoked as an argv array with no shell, and consented to at install time."*
3. **L144-176 Executable contributions** — restate bound 1 per **Decision A** (payload copied to `.context-index/extensions/<name>/`, argv rewritten to absolute, realpath both sides, `realpathSync` failure is a refusal, payload set derived from argv and `package.skill`/`package.adapter` with **no** manifest-declared payload key, `GOVERNANCE_PAYLOAD_MISSING`). Restate bound 2 per the derived decision (`doctor.mjs` argv-direct branch, `normaliseCommand`/`NEEDS_QUOTING` declared as a pinned dependency). Restate bound 3 per Task 5's named mechanism (`cmdExtension` flag, `installExtension` options, TTY-gated prompt, fail-closed). Delete the false claim that the picker "has a home already". Correct the `installSamples` citation: it is `resolve()` + `startsWith` with **no** `realpathSync`.
4. **L177-221 Allowlists** — apply **Decision B** to the `review.yaml` row: `dispatch` string-only (`always` | `never`); `package` one-level `{skill, adapter}`; no `args`. Add `source`, `__source`, `exec_consented_at` to every row as **installer-owned, supply-forbidden**. Constrain `runner` to `plugin:`-prefixed values only. Delete L215-221 (the `command`-absent rationale) entirely; keep only the true clause that `prompt` paths remain subject to the existing `plugin:`/relative resolution guard.
5. **L230-231 Error codes** — declare all twelve.
6. **L302 Step 3 Verify** — replace "whether by collision or by appending a new one" with "onto an entry it did not create; a contributed `command` on a new entry is permitted, contained, argv-only and consented".
7. **L306-328 Invariants** — Invariant 6: state the three bounds apply to `command`-bearing contributions, and that `runner` is bounded by the diagnostics guard **instead of** bound 1. Add `normaliseCommand`/`NEEDS_QUOTING` as a second declared dependency alongside `lib/diagnostics/index.mjs`.
8. **Behaviors** — widen Behavior 5 to cover disallowed field *values* and introduce `GOVERNANCE_FIELD_VALUE_INVALID`; name `GOVERNANCE_EXEC_NOT_CONSENTED` in Behavior 10; add Behavior 13 (per-install atomicity: all blocks validated and consent obtained before any write) and Behavior 14 (caps → `GOVERNANCE_LIMIT_EXCEEDED`).
9. **L364-370 Module Impact Map** — rewrite the unified-gates row: `gates.yaml` **is** extension-writable including `command`, bounded three ways; `transitions:` is never touched because the splice only rewrites the target key's line range. Add rows for `lib/gates/doctor.mjs` and `cli/index.mjs`.
10. **L235-240 MODIFIED** — add `lib/gates/doctor.mjs`, `cli/index.mjs`, the five new `lib/extensions/*.mjs` modules, and `extensions/example-validation-check/adev-extension.yaml`. Replace "the five functions above" with the four Target State rows plus `isValidGovernanceValue`.
11. **L388-416 Acceptance Criteria** — amend AC L400 and L405 per Decisions A and B; scope AC L411 to contributable fields per registry; add ACs for Behaviors 3, 5, 11, 13, 14.
12. **L86-87 / Out of Scope** — unchanged.
13. **Citations (CON-14)** — `validateGovernanceEntry` is `:101-133` (it also validates every field value at `:121-132`); the `validators || checks` assignment is `example-validation-check-install.test.mjs:208`; flow-map dispatch is `yaml.mjs:180` with the parser body at `:185-199`.

Append a short **Revision 5 — Decisions of Record** note citing this plan file, so a human auditing the override can see who decided what and why.

- [ ] **Verify test passes**

Run: `node --test tests/specs/extension-governance-merge-hardening-consistency.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (create here): `feat/domain-extensions/governance-merge-hardening`

```bash
git add .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md \
        tests/specs/extension-governance-merge-hardening-consistency.test.mjs
git commit -m "docs(domain-extensions): reconcile governance merge spec to revision 5

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 1"
```

---

### Task 2: Scalar safety, argv classification, and caps [specialist: none]

**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/governance-values.mjs`
- Create: `tests/lib/extensions/governance-values.test.mjs`

**Tests:** create `tests/lib/extensions/governance-values.test.mjs` — owns spec Behaviors 7 and 8 and the caps behavior.

**Context to load:** see Task 2 Context above.

**Closes:** SEC-6 (both clauses), SEC-10 (caps), and the Behavior 7/8 half of Invariant 2.

Exports:

- `assertSafeScalar(value, fieldPath)` — refuses `\n`, `\r`, `"`, `'`, `#`, `{`, `}`, `[`, `]`, `,` anywhere, and a leading `-`, `?`, `:`, `&`, `*`, `!`, `|`, `>`, `%`, `@`, or backtick. Code `GOVERNANCE_SCALAR_UNSAFE`, message names `fieldPath`.
- `assertStringId(entry)` — `id` must be a string **after parse**. `yaml.mjs:178` coerces `/^-?\d+$/` to Number and `:175-177` coerce `null`/`~`/`true`/`false`, so a numeric or boolean id must be refused before it reaches the string-keyed collision map. Code `GOVERNANCE_FIELD_VALUE_INVALID`.
- `isArgvPathElement(token)` — **positive** definition (SEC-6a): the token contains `/`, **or** starts with `.`, **or** is of the form `<flag>=<value>` where `<value>` contains `/`. Everything else is a literal.
- `assertSafeArgvToken(token)` — argv elements get their **own** rule, not Behavior 7's. A leading `-` is *permitted* (SEC-6b: `[npm, test, --, --silent]` must survive). A token must match `^(--?[A-Za-z0-9][A-Za-z0-9._-]*(=[A-Za-z0-9._\/-]+)?|--|[A-Za-z0-9._\/-]+)$` — no whitespace, no `;`, `$`, `(`, `)`, `\`, `<`, `>`, backtick, quote or `#` at any position. Code `GOVERNANCE_SCALAR_UNSAFE`.
- `assertValidValue(value, fieldPath)` — string / number / boolean / array-of-checked-strings / **one-level** object whose own values are checked strings, numbers or booleans. Two levels refuse with `GOVERNANCE_FIELD_VALUE_INVALID`. Array elements and object values are checked **identically** to top-level scalars (Behavior 7's "every emitted value" clause).
- `assertWithinCaps({ scalarChars: 512, argvElements: 32, entriesPerTarget: 32, payloadFiles: 32 })` — code `GOVERNANCE_LIMIT_EXCEEDED`.

Follow the module's existing error style: `const err = new Error(msg); err.code = '…'; throw err;` (as at `content-install.mjs:309-313`).

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeScalar, assertSafeArgvToken, isArgvPathElement, assertValidValue, assertStringId }
  from '../../../lib/extensions/governance-values.mjs';

const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('flow indicators are refused — the reparse path', () => {
  throwsCode(() => assertSafeScalar('{command: rm -rf /}', 'description'), 'GOVERNANCE_SCALAR_UNSAFE');
  for (const bad of ['a\nb', 'a\rb', 'a"b', "a'b", 'a#b', '[x]', 'a,b'])
    throwsCode(() => assertSafeScalar(bad, 'f'), 'GOVERNANCE_SCALAR_UNSAFE');
  for (const bad of ['-x', '?x', ':x', '&x', '*x', '!x', '|x', '>x', '%x', '@x', '`x'])
    throwsCode(() => assertSafeScalar(bad, 'f'), 'GOVERNANCE_SCALAR_UNSAFE');
});

test('argv tokens keep CLI flags but refuse metacharacters', () => {
  for (const ok of ['npm', 'test', '--', '--silent', '-q', 'bin/check.sh', './x.sh', '--config=a/b'])
    assert.doesNotThrow(() => assertSafeArgvToken(ok));
  for (const bad of ['x$(id)', 'a;b', 'a b', 'a`b`', 'a|b', 'a>b', 'a\\b'])
    throwsCode(() => assertSafeArgvToken(bad), 'GOVERNANCE_SCALAR_UNSAFE');
});

test('path elements are identified positively', () => {
  assert.equal(isArgvPathElement('bin/check.sh'), true);
  assert.equal(isArgvPathElement('./check.sh'), true);
  assert.equal(isArgvPathElement('--config=../../etc/shadow'), true);
  assert.equal(isArgvPathElement('--silent'), false);
  assert.equal(isArgvPathElement('npm'), false);
});

test('nesting is capped at one level and every leaf is checked', () => {
  assert.doesNotThrow(() => assertValidValue({ skill: 'a/b.md' }, 'package'));
  throwsCode(() => assertValidValue({ triggered: { patterns: ['x'] } }, 'dispatch'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue(['ok', 'bad#value'], 'after'), 'GOVERNANCE_SCALAR_UNSAFE');
  throwsCode(() => assertValidValue({ k: 'bad\nvalue' }, 'package'), 'GOVERNANCE_SCALAR_UNSAFE');
});

test('a non-string id is refused', () => {
  throwsCode(() => assertStringId({ id: 42 }), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertStringId({ id: true }), 'GOVERNANCE_FIELD_VALUE_INVALID');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/governance-values.test.mjs`
Expected: FAIL — `Cannot find module '.../governance-values.mjs'`

- [ ] **Implement** — create `lib/extensions/governance-values.mjs` with the exports above.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/governance-values.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/extensions/governance-values.mjs tests/lib/extensions/governance-values.test.mjs
git commit -m "feat(domain-extensions): add governance value safety primitives

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 2"
```

---

### Task 3: Writable-registry table and per-registry allowlists [specialist: none]

**Depends on:** Task 2
**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/governance-registry.mjs`
- Create: `tests/lib/extensions/governance-registry.test.mjs`

**Tests:** create `tests/lib/extensions/governance-registry.test.mjs` — owns spec Behaviors 2, 5, 6 and 11.

**Context to load:** see Task 3 Context above.

**Closes:** SA-6, SA-7, SA-8, SEC-7, SEC-9, CON-8, CON-9, CON-11, CON-12; implements **Decision B**.

Exports:

- `WRITABLE_REGISTRIES` — `Map` of the exactly five writable targets to their root key: `validate.yaml`→`checks`, `review.yaml`→`reviewers`, `gates.yaml`→`gates`, `diagnostics.yaml`→`diagnostics`, `boundaries.yaml`→`boundaries`. Note `validate.yaml`→**`checks`**, not `validators`: `validate-config.mjs:111` reads `project.checks`, and the current `inferRootKey` (`content-install.mjs:235`) is simply wrong.
- `resolveRootKey(target)` — refuses anything outside the map with `UNKNOWN_GOVERNANCE_TARGET`, including `risk-policies.yaml` and `sensitive-paths.yaml` (the project's own guard boundary) and any of the seven files not tabled.
- `FIELD_ALLOWLIST` — per target, exhaustive:
  - `validate.yaml`: `id`, `name`, `kind`, `severity`, `profile`, `context_pack`, `prompt`, `after`, `description`, `command`, `fail_fast`, `enabled`, `disabled_reason`
  - `review.yaml`: `id`, `name`, `dispatch`, `profile`, `context_pack`, `severity_cap`, `prompt`, `package`, `enabled`, `disabled_reason`
  - `gates.yaml`: `id`, `command`, `description`, `severity`, `tier`, `enabled`, `disabled_reason`
  - `diagnostics.yaml`: `id`, `runner`, `severity`, `tier`, `scope`, `enabled`, `disabled_reason`
  - `boundaries.yaml`: `id`, `severity`, `pattern`, `exclude`, `description`, `enabled`, `disabled_reason`
- `INSTALLER_OWNED = new Set(['source', '__source', 'exec_consented_at'])` — checked **before** the allowlist so a supplied one always reports `GOVERNANCE_SOURCE_FORGED` and never `GOVERNANCE_FIELD_NOT_ALLOWED` (Behavior 6 precedence). `__source` is included because `review-config.mjs:315-328` and `:390` read it as live provenance.
- `FIELD_VALUE_CONSTRAINTS` — `kind` ∈ the four values at `validate-config.mjs:19-24`; `severity` ∈ `error|warning|info`; `dispatch` ∈ `always|never` (**`triggered` refused** — Decision B); `runner` must start with `plugin:`; `package` keys ⊆ `{skill, adapter}` (**no `args`** — Decision B). Violations → `GOVERNANCE_FIELD_VALUE_INVALID`.
- `assertRunnerScope(field, target)` — `runner` outside `diagnostics.yaml` → `GOVERNANCE_FIELD_NOT_ALLOWED` (Behavior 11).
- `requiresCommand(target, entry)` — `true` for `gates.yaml` (required by `merge-gates.mjs:29-32`) and for `validate.yaml` when `kind === 'quality-gate'` (`validate-config.mjs:429-443`).
- `validateEntryFields(target, entry)` — composes the above with Task 2's value checks.

Two facts to encode as comments so a later reader does not "fix" them back:

- `gates.yaml` has **two** consumers with different contracts. `merge-gates.mjs:41-47` projects `id`, `command`, `description`, `severity`, `tier` and drops everything else; `doctor.mjs:805` reads `gate?.kind` off the raw file. The allowlist is the *contribution* boundary, not either loader's schema — `enabled`/`disabled_reason` are allowlisted because `explicit-governance-registries.spec.md` adds them, even though neither loader reads them today (CON-8).
- `source` and `exec_consented_at` are **file-level** provenance. `merge-gates.mjs:41-47` strips them from the merged gate set, so gate consumers never see them. That is intended: they exist for uninstall and audit, which read the file (SEC-9).
- `boundaries.yaml` gets `enabled`/`disabled_reason` even though `explicit-governance-registries.spec.md:101` names only four registries (CON-9). Rationale: the two fields are ordinary author-set toggles with no capability attached, and allowlisting them costs nothing; omitting them would make this allowlist reject a valid hand-authored boundary rule the moment a project author adds `enabled: false` to one. Uniformity across all five rows is the cheaper invariant.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRootKey, validateEntryFields, WRITABLE_REGISTRIES }
  from '../../../lib/extensions/governance-registry.mjs';

const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('exactly five writable registries, validate.yaml maps to checks', () => {
  assert.equal(WRITABLE_REGISTRIES.size, 5);
  assert.equal(resolveRootKey('validate.yaml'), 'checks');
  assert.equal(resolveRootKey('review.yaml'), 'reviewers');
  for (const closed of ['risk-policies.yaml', 'sensitive-paths.yaml', 'anything.yaml'])
    throwsCode(() => resolveRootKey(closed), 'UNKNOWN_GOVERNANCE_TARGET');
});

test('fields outside the registry allowlist are refused', () => {
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], runner: 'plugin:a' }),
    'GOVERNANCE_FIELD_NOT_ALLOWED');
  throwsCode(() => validateEntryFields('boundaries.yaml', { id: 'b', command: ['x'] }),
    'GOVERNANCE_FIELD_NOT_ALLOWED');
});

test('installer-owned fields win the precedence race', () => {
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], source: 'forged' }),
    'GOVERNANCE_SOURCE_FORGED');
  throwsCode(() => validateEntryFields('review.yaml', { id: 'r', __source: 'project' }),
    'GOVERNANCE_SOURCE_FORGED');
  throwsCode(() => validateEntryFields('gates.yaml', { id: 'g', command: ['x'], exec_consented_at: 'now' }),
    'GOVERNANCE_SOURCE_FORGED');
});

test('Decision B — dispatch:triggered and package.args are refused', () => {
  assert.doesNotThrow(() => validateEntryFields('review.yaml', { id: 'r', dispatch: 'always' }));
  throwsCode(() => validateEntryFields('review.yaml', { id: 'r', dispatch: 'triggered' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => validateEntryFields('review.yaml', { id: 'r', package: { skill: 'a.md', args: { x: 1 } } }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  assert.doesNotThrow(() => validateEntryFields('review.yaml',
    { id: 'r', package: { skill: 'a.md', adapter: 'b.md' } }));
});

test('field values are constrained, not only field names', () => {
  throwsCode(() => validateEntryFields('validate.yaml', { id: 'c', kind: 'made-up' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => validateEntryFields('diagnostics.yaml', { id: 'd', runner: 'project:x.mjs' }),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => validateEntryFields('validate.yaml', { id: 'c', runner: 'plugin:x.mjs' }),
    'GOVERNANCE_FIELD_NOT_ALLOWED');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/governance-registry.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement** — create `lib/extensions/governance-registry.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/governance-registry.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/extensions/governance-registry.mjs tests/lib/extensions/governance-registry.test.mjs
git commit -m "feat(domain-extensions): add writable-registry table and field allowlists

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 3"
```

---

### Task 4: Executable payload containment, copy, and argv rewrite [specialist: none]

**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/exec-payload.mjs`
- Create: `tests/lib/extensions/exec-payload.test.mjs`

**Tests:** create `tests/lib/extensions/exec-payload.test.mjs` — owns spec Behavior 9's containment half and **Decision A**.

**Context to load:** see Task 4 Context above. Read SA-3, SEC-2, SEC-3 and CON-6 in full first — this module exists because bound 1 as written is unimplementable.

**Closes:** SA-3, SEC-2, CON-6 (defect 2).

Exports:

- `payloadDir(projectRoot, extensionName)` → `<projectRoot>/.context-index/extensions/<extensionName>`. The name is validated against the same kebab pattern used for domain names.
- `assertContained(baseDir, candidate)` — `realpathSync(baseDir)` **and** `realpathSync(candidate)`, then `real === realBase || real.startsWith(realBase + sep)`. Realpathing the base is required: on macOS `/var` is a symlink to `/private/var`, which defeats a raw `startsWith` (SEC-2). A `realpathSync` throw is a **refusal** — `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` for argv candidates, `GOVERNANCE_PAYLOAD_MISSING` for declared payload members — never a silent pass.
- `planExecPayload({ extensionRoot, extensionName, projectRoot, contributions })` — the payload set is derived entirely from `contributions`; there is no manifest-declared payload list (see Decision A). For each contribution:
  - `command` must be an **array** (`GOVERNANCE_COMMAND_NOT_ARGV` for a string, matching `merge-gates.mjs:33-40` and `validate-config.mjs:437-442`), non-empty, ≤ 32 elements.
  - `argv[0]` is either an allowlisted interpreter (`bash`, `sh`, `node`, `python3`) **or** a contained path.
  - Every other element: `isArgvPathElement` → must resolve inside `extensionRoot` and exist; otherwise `assertSafeArgvToken`.
  - `package.skill` / `package.adapter` are treated as path elements under the same rule.
  - Returns `{ copies: [{ from, toRelative }], rewrites: [{ entryId, field, index, absolute }] }` — **no writes**.
- `applyExecPayload(plan, projectRoot, extensionName)` — creates the payload dir, copies each file, `chmodSync(dest, 0o555)`, then re-asserts containment of every destination against the realpath'd payload dir before returning the rewritten argv.
- `INTERPRETER_ALLOWLIST` — the four names, exported so the spec and the docs can cite one source.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import { planExecPayload, applyExecPayload, payloadDir } from '../../../lib/extensions/exec-payload.mjs';

const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);

function fixture() {
  const ext = createTempDir();
  const proj = createTempDir();
  mkdirSync(join(ext, 'bin'), { recursive: true });
  writeFileSync(join(ext, 'bin', 'check.sh'), '#!/usr/bin/env bash\nexit 0\n');
  return { ext, proj };
}

test('a contained argv path is copied and rewritten to an absolute payload path', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh'] }],
  });
  const argv = applyExecPayload(plan, proj, 'demo');
  const expected = join(payloadDir(proj, 'demo'), 'bin/check.sh');
  assert.equal(argv[0].value[1], expected);
  assert.equal(statSync(expected).mode & 0o777, 0o555);
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('an escaping argv path is refused', () => {
  const { ext, proj } = fixture();
  throwsCode(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', '../../etc/passwd'] }],
  }), 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('a nonexistent contained path is refused, not silently accepted', () => {
  const { ext, proj } = fixture();
  throwsCode(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/missing.sh'] }],
  }), 'GOVERNANCE_PAYLOAD_MISSING');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('a string command is refused', () => {
  const { ext, proj } = fixture();
  throwsCode(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: 'bash bin/check.sh' }],
  }), 'GOVERNANCE_COMMAND_NOT_ARGV');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('interpreters are allowlisted at argv[0] only', () => {
  const { ext, proj } = fixture();
  throwsCode(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['curl', 'bin/check.sh'] }],
  }), 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION');
  cleanupTempDir(ext); cleanupTempDir(proj);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/exec-payload.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement** — create `lib/extensions/exec-payload.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/exec-payload.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/extensions/exec-payload.mjs tests/lib/extensions/exec-payload.test.mjs
git commit -m "feat(domain-extensions): contain and relocate extension executable payloads

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 4"
```

---

### Task 5: Install-time consent — `--allow-exec` and TTY prompt [specialist: none]

**Depends on:** Task 4
**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/exec-consent.mjs`
- Create: `tests/lib/extensions/exec-consent.test.mjs`
- Modify: `cli/index.mjs:1207-1295` (`cmdExtension`)

**Tests:** create `tests/lib/extensions/exec-consent.test.mjs` — owns spec Behavior 10. Flag-surface coverage extends `tests/cli-extension.test.mjs` in Task 8.

**Context to load:** see Task 5 Context above.

**Closes:** SA-4, SEC-4 (defect 4, mechanism half). Note the mechanism is **entirely greenfield**: `--allow-exec`, `allowExec` and `exec_consented_at` have zero implementation hits in the repo today.

Exports:

- `collectExecutableContributions(governanceBlocks)` — walks every block of every target and returns the **union** of `{ target, entryId, field, value }` for every `command` (in `gates.yaml`, or in `validate.yaml` with `kind: quality-gate`) and every `package.skill` / `package.adapter`. The union is per **install**, not per target (SEC-8).
- `resolveExecConsent({ contributions, allowExec, interactive, promptFn })`:
  - no contributions → `{ granted: true, at: null }` (nothing to consent to)
  - `allowExec === true` → `{ granted: true, at: new Date().toISOString() }`
  - `interactive === true` → call `promptFn(renderConsentPrompt(...))`; a non-affirmative answer refuses
  - otherwise → throw `GOVERNANCE_EXEC_NOT_CONSENTED`, message listing each command **verbatim** and the extension it came from
  - **fails closed**: `interactive` is `Boolean(process.stdin.isTTY && process.stdout.isTTY)`, computed by the caller and defaulting to `false`
  - consent is **per-install** and never persisted — nothing is written to `manifest.yaml` or anywhere else
- `renderConsentPrompt({ extensionName, contributions })` — the verbatim listing.

`cmdExtension` change (`cli/index.mjs:1208-1228`): today it reads only `process.argv[3]` (subcommand) and `process.argv[4]` (source) with no flag parsing at all. Add a small flag scan over `process.argv.slice(4)` that extracts `--allow-exec` and keeps the first non-flag token as the source, then pass `{ allowExec, interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) }` into `installExtension` alongside the existing `pluginRoot` / `sourceUri` / `_tmpDir`. Do **not** route through `lib/cli/domain-extension-picker.mjs`: `dispatchInstall` (`:283-299`) threads only `{pluginRoot, sourceUri}` and its sole caller is the init-time bundled-catalog picker at `:250` — it is not on this path (SA-4).

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectExecutableContributions, resolveExecConsent }
  from '../../../lib/extensions/exec-consent.mjs';

const blocks = [
  { target: 'validate.yaml', entries: [{ id: 'c1', kind: 'quality-gate', command: ['bash', 'bin/a.sh'] }] },
  { target: 'gates.yaml', entries: [{ id: 'g1', command: ['node', 'bin/b.mjs'] }] },
  { target: 'boundaries.yaml', entries: [{ id: 'b1', pattern: 'src/**' }] },
];

test('the union spans every target, not one', () => {
  const c = collectExecutableContributions(blocks);
  assert.equal(c.length, 2);
  assert.deepEqual(c.map(x => x.entryId).sort(), ['c1', 'g1']);
});

test('non-interactive without the flag refuses and names each command', () => {
  assert.throws(
    () => resolveExecConsent({
      contributions: collectExecutableContributions(blocks),
      allowExec: false, interactive: false,
    }),
    e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED' && /bash bin\/a\.sh/.test(e.message)
  );
});

test('--allow-exec grants and stamps a timestamp', () => {
  const r = resolveExecConsent({
    contributions: collectExecutableContributions(blocks), allowExec: true, interactive: false,
  });
  assert.equal(r.granted, true);
  assert.match(r.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('an interactive refusal is a refusal', () => {
  assert.throws(() => resolveExecConsent({
    contributions: collectExecutableContributions(blocks),
    allowExec: false, interactive: true, promptFn: () => 'n',
  }), e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED');
});

test('no executable contributions means no prompt and no timestamp', () => {
  let prompted = false;
  const r = resolveExecConsent({
    contributions: [], allowExec: false, interactive: true,
    promptFn: () => { prompted = true; return 'y'; },
  });
  assert.equal(prompted, false);
  assert.equal(r.granted, true);
  assert.equal(r.at, null);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/exec-consent.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement** — create `lib/extensions/exec-consent.mjs`; add flag parsing to `cmdExtension`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/exec-consent.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/extensions/exec-consent.mjs tests/lib/extensions/exec-consent.test.mjs cli/index.mjs
git commit -m "feat(domain-extensions): require install-time consent for executable contributions

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 5"
```

---

### Task 6: In-place registry splice — seven on-disk forms [specialist: none]

**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/governance-splice.mjs`
- Create: `tests/lib/extensions/governance-splice.test.mjs`

**Tests:** create `tests/lib/extensions/governance-splice.test.mjs` — owns the splice half of spec Behavior 3 and Behavior 12.

**Context to load:** see Task 6 Context above.

**Closes:** SEC-10; implements Migration Step 2 with the four forms the spec's three-row table omits.

Exports:

- `spliceRegistryEntries(rawText, rootKey, newEntries)` → `{ text, insertedAt }`. It reads the file as **text**, locates the target key's block by line range, replaces exactly those lines, and writes every other byte back unchanged. Comment preservation is achieved by **not reserializing**: `lib/profiles/yaml.mjs` has a parser and no serializer, and `parseYaml` consumes `#` comments without retaining them, so any round trip through it loses them. Adding a YAML library would need an ADR under the zero-dependency principle.
- `emitEntry(entry, indent)` — block-sequence emission. One-level objects become an indented block map beneath their key (`package:` then `  skill: …`). Every leaf is re-checked with Task 2's `assertSafeScalar` **at emission time**, so a value that slipped past validation still cannot become structure (Invariant 2). Strings are emitted bare — the current `serializeYamlValue` (`content-install.mjs:261-269`) does the same, which is precisely why unsafe scalars must be refused rather than escaped.

The seven forms:

| # | Form | Splice behavior |
|---|---|---|
| 1 | Block sequence under the key (`checks:` then `  - id: …`) | Append after the last item of the block, before the next top-level key |
| 2 | Empty inline list (`boundaries: []`, `reviewers: []`) | Rewrite the single `key: []` line as `key:` followed by the new items |
| 3 | Key with only indented comments beneath | Insert after the key line, **above** the comment block, leaving the comments byte-identical |
| 4 | Key absent from an otherwise valid file | Append `key:` + items at end of file, preserving the trailing newline convention |
| 5 | File absent | Create with a generated header comment naming the extension, then form 4 |
| 6 | Key duplicated at top level | **Refuse** — `GOVERNANCE_PARSE_REFUSED`; an ambiguous target is not spliceable |
| 7 | Key present but not an array (scalar or map) | **Refuse** — `GOVERNANCE_PARSE_REFUSED`. Today `content-install.mjs:184` requires `Array.isArray`, so a map at that key silently yields an empty `existingEntries` and collision detection degrades to append-everything — the same silent-degradation class as defect 7 (SEC-10) |

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spliceRegistryEntries } from '../../../lib/extensions/governance-splice.mjs';

const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('form 1 — appends to a block sequence and preserves comments and siblings', () => {
  const src = [
    '# leading comment', 'checks:', '  - id: a', '    severity: error',
    '', '# a sibling comment', 'other_key: value', '',
  ].join('\n');
  const { text } = spliceRegistryEntries(src, 'checks', [{ id: 'b', severity: 'warning' }]);
  assert.ok(text.includes('# leading comment'));
  assert.ok(text.includes('# a sibling comment'));
  assert.ok(text.includes('other_key: value'));
  assert.ok(text.indexOf('- id: b') > text.indexOf('- id: a'));
  assert.ok(text.indexOf('- id: b') < text.indexOf('other_key: value'));
});

test('form 2 — rewrites an inline empty list', () => {
  const { text } = spliceRegistryEntries('reviewers: []\n', 'reviewers', [{ id: 'r' }]);
  assert.equal(text.includes('reviewers: []'), false);
  assert.match(text, /^reviewers:\n  - id: r\n/);
});

test('form 3 — inserts above an indented comment block, byte-identical', () => {
  const src = 'boundaries:\n  # - id: example\n  #   pattern: "src/**"\n';
  const { text } = spliceRegistryEntries(src, 'boundaries', [{ id: 'b', pattern: 'lib/**' }]);
  assert.ok(text.includes('  # - id: example'));
  assert.ok(text.includes('  #   pattern: "src/**"'));
  assert.ok(text.indexOf('- id: b') < text.indexOf('# - id: example'));
});

test('form 6 — a duplicated root key refuses', () => {
  throwsCode(() => spliceRegistryEntries('gates:\n  - id: a\ngates:\n  - id: b\n', 'gates', [{ id: 'c' }]),
    'GOVERNANCE_PARSE_REFUSED');
});

test('form 7 — a non-array root key refuses instead of degrading', () => {
  throwsCode(() => spliceRegistryEntries('gates: {}\n', 'gates', [{ id: 'c' }]), 'GOVERNANCE_PARSE_REFUSED');
  throwsCode(() => spliceRegistryEntries('gates: scalar\n', 'gates', [{ id: 'c' }]), 'GOVERNANCE_PARSE_REFUSED');
});

test('a one-level object emits as an indented block map', () => {
  const { text } = spliceRegistryEntries('reviewers: []\n', 'reviewers',
    [{ id: 'r', package: { skill: 'a.md', adapter: 'b.md' } }]);
  assert.match(text, /  - id: r\n    package:\n      skill: a\.md\n      adapter: b\.md\n/);
});

test('an unrelated sibling block is byte-identical', () => {
  const src = 'gates:\n  - id: a\n    command: ["npm", "test"]\ntransitions: {}\n';
  const { text } = spliceRegistryEntries(src, 'gates', [{ id: 'b', command: ['node', 'x.mjs'] }]);
  assert.ok(text.endsWith('transitions: {}\n'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/governance-splice.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement** — create `lib/extensions/governance-splice.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/governance-splice.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/extensions/governance-splice.mjs tests/lib/extensions/governance-splice.test.mjs
git commit -m "feat(domain-extensions): splice registry entries in place, preserving every other byte

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 6"
```

---

### Task 7: Two-phase governance merge in `content-install.mjs` [specialist: none]

**Depends on:** Task 2, Task 3, Task 4, Task 6
**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lib/extensions/governance-merge-hardening.test.mjs`
- Modify: `lib/extensions/content-install.mjs:88-269`
- Modify: `tests/lib/extensions/content-install.test.mjs`

**Tests:** create `tests/lib/extensions/governance-merge-hardening.test.mjs` — owns spec Behaviors 1, 3, 4, 6, 12, 13 and 14. `tests/lib/extensions/content-install.test.mjs` is **extended**, not replaced: its existing `installSamples` / `installSkillExtensions` / `installDomainProfile` coverage is untouched; only the governance-merge expectations change.

**Context to load:** see Task 7 Context above.

**Closes:** defects 1, 2, 3, 4, 5, 6, 7 from the spec's Problems list; SEC-8, SEC-9, CON-12, CON-13.

Changes to `lib/extensions/content-install.mjs`:

- **Split `mergeGovernanceEntries` into two exports.**
  - `planGovernanceMerge(projectRoot, target, entries, options)` → a plan object. Writes **nothing**. It resolves the root key via `resolveRootKey` (`UNKNOWN_GOVERNANCE_TARGET`), asserts the resolved target path is contained in `<projectRoot>/.context-index/governance/` (`PATH_TRAVERSAL` — today `:172` is a bare `join(govDir, targetFile)` with no check, while two siblings at `:307-318` and `:383-384` already do it), reads and parses the existing file, and validates every entry: installer-owned fields first (`GOVERNANCE_SOURCE_FORGED`), then the allowlist, then field values, then scalars, then argv, then caps.
  - `applyGovernanceMerge(plan)` → performs the splice and the write.
- **Keep `mergeGovernanceEntries(projectRoot, target, entries, options)` as a thin wrapper** (`plan` then `apply`) so existing callers and tests that only exercise a single target keep working. The new `options` parameter carries `{ extensionName, extensionRoot, execConsent, payloadRewrites }` — the signature change SA-5 says is missing.
- **Delete the fill-gap loop** (`:205-209`). A colliding id is recorded as `skipped: <id>` and the existing entry is left byte-identical — no key is introduced onto it, absent or otherwise (Behavior 4).
- **Replace `catch { /* start fresh */ }`** (`:187-189`) with a refusal: `GOVERNANCE_PARSE_REFUSED`, write nothing, leave the file byte-identical. The current fallback silently destroys an unparseable registry *and* bypasses collision detection, because nothing remains to collide with (defect 7).
- **Delete `inferRootKey` (`:232-237`), `serializeGovernanceYaml` (`:242-256`) and `serializeYamlValue` (`:261-269`).** The first returns `validators` for `validate.yaml` while `validate-config.mjs:111` reads `checks`; the second drops sibling keys and comments; the third emits strings completely unquoted.
- **Replace `isValidGovernanceValue` (`:139-147`)** with Task 2's `assertValidValue` (adds the one-level object form; keeps string / number / boolean / string-array).
- **Stamp provenance** on every appended entry: `source: extension:<name>`, and `exec_consented_at: <plan.execConsent.at>` on every entry that carries an executable contribution.
- **Apply the argv rewrites** from Task 4 before emission, so what lands in the file is the absolute payload path.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import { mergeGovernanceEntries, planGovernanceMerge } from '../../../lib/extensions/content-install.mjs';

const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);
const govPath = (root, f) => join(root, '.context-index', 'governance', f);
function project(files = {}) {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index', 'governance'), { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(govPath(root, name), body);
  return root;
}
const opts = { extensionName: 'demo', execConsent: { granted: true, at: null } };

test('Behavior 1 — a traversing target writes nothing', () => {
  const root = project();
  throwsCode(() => mergeGovernanceEntries(root, '../../ESCAPED.yaml', [{ id: 'x' }], opts), 'PATH_TRAVERSAL');
  cleanupTempDir(root);
});

test('Behavior 3 — entries land under the real root key, stamped, comments intact', () => {
  const src = '# c1\n# c2\nchecks:\n  - id: existing\n    kind: observational\n# tail\n';
  const root = project({ 'validate.yaml': src });
  mergeGovernanceEntries(root, 'validate.yaml', [{ id: 'new', kind: 'observational' }], opts);
  const out = readFileSync(govPath(root, 'validate.yaml'), 'utf8');
  assert.ok(out.includes('checks:'));
  assert.equal(out.includes('validators:'), false);
  assert.ok(out.includes('# c1') && out.includes('# c2') && out.includes('# tail'));
  assert.ok(out.includes('source: extension:demo'));
  cleanupTempDir(root);
});

test('Behavior 4 — a collision is skipped and the existing entry is byte-identical', () => {
  const src = 'gates:\n  - id: g1\n    tier: 1\n';
  const root = project({ 'gates.yaml': src });
  const r = mergeGovernanceEntries(root, 'gates.yaml',
    [{ id: 'g1', command: ['node', 'x.mjs'], severity: 'error' }], opts);
  const out = readFileSync(govPath(root, 'gates.yaml'), 'utf8');
  assert.equal(out, src);
  assert.ok(r.mergesApplied.some(m => /skipped: g1/.test(m)));
  cleanupTempDir(root);
});

test('the arbitrary-execution path — no command reaches an existing gate entry', () => {
  const src = 'gates:\n  - id: lint\n    tier: 1\n';
  const root = project({ 'gates.yaml': src });
  mergeGovernanceEntries(root, 'gates.yaml', [{ id: 'lint', command: ['sh', 'evil.sh'] }], opts);
  assert.equal(readFileSync(govPath(root, 'gates.yaml'), 'utf8'), src);
  cleanupTempDir(root);
});

test('Behavior 12 — an unparseable registry refuses and is left byte-identical', () => {
  const src = 'checks:\n  - id: a\n   bad indent: [\n';
  const root = project({ 'validate.yaml': src });
  throwsCode(() => mergeGovernanceEntries(root, 'validate.yaml', [{ id: 'n' }], opts), 'GOVERNANCE_PARSE_REFUSED');
  assert.equal(readFileSync(govPath(root, 'validate.yaml'), 'utf8'), src);
  cleanupTempDir(root);
});

test('Behavior 13 — plan writes nothing even when it succeeds', () => {
  const src = 'boundaries: []\n';
  const root = project({ 'boundaries.yaml': src });
  planGovernanceMerge(root, 'boundaries.yaml', [{ id: 'b', pattern: 'lib/**' }], opts);
  assert.equal(readFileSync(govPath(root, 'boundaries.yaml'), 'utf8'), src);
  cleanupTempDir(root);
});

test('Behavior 14 — caps are enforced', () => {
  const root = project({ 'boundaries.yaml': 'boundaries: []\n' });
  const many = Array.from({ length: 33 }, (_, i) => ({ id: `b${i}`, pattern: 'lib/**' }));
  throwsCode(() => mergeGovernanceEntries(root, 'boundaries.yaml', many, opts), 'GOVERNANCE_LIMIT_EXCEEDED');
  cleanupTempDir(root);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/governance-merge-hardening.test.mjs`
Expected: FAIL — `planGovernanceMerge` is not exported; the traversal test **passes the write** (it reproduces the confirmed 2026-08-14 escape); the root-key test finds `validators:`.

- [ ] **Implement** — rewrite `lib/extensions/content-install.mjs:88-269`; update the governance-merge expectations in `tests/lib/extensions/content-install.test.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/governance-merge-hardening.test.mjs tests/lib/extensions/content-install.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/extensions/content-install.mjs \
        tests/lib/extensions/governance-merge-hardening.test.mjs \
        tests/lib/extensions/content-install.test.mjs
git commit -m "fix(domain-extensions): make the governance merge contained, additive and refusing

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 7"
```

---

### Task 8: Wire two-phase install, consent, and payload into `installExtension` [specialist: none]

**Depends on:** Task 5, Task 7
**Charter capability:** n/a
**Strategy:** integration (source: detected, confidence: medium)
**Files:**
- Modify: `lib/extensions/install.mjs:37,73-98,178-183`
- Modify: `cli/index.mjs:1222-1228`
- Modify: `tests/lib/extensions/install.test.mjs`
- Modify: `tests/cli-extension.test.mjs`

**Tests:** extend `tests/lib/extensions/install.test.mjs` — it already owns install-level behavior; Behaviors 2, 10 and 13 are added there rather than in a new suite (per-behavior granularity). `tests/cli-extension.test.mjs` is extended for the `--allow-exec` surface.

**Context to load:** see Task 8 Context above.

**Closes:** SA-5 (signature change), SA-9, SEC-8, CON-13 (per-install atomicity), and the plumbing half of defect 4.

Changes to `installExtension(resolvedPath, projectRoot, options)`:

1. **New options:** `allowExec`, `interactive`, `promptFn` (injectable for tests). Documented in the JSDoc at `:27-36`.
2. **Reorder into two phases.** Today `:75-86` writes the domain profile, then `:89-98` loops targets with no pre-validation and no rollback, so a manifest with a valid first target and a refused second leaves the first registry mutated (SA-9). New order:
   - **Phase 1 (no writes):** for every `provides.governance` block, call `planGovernanceMerge`. Collect the union of executable contributions across **all** blocks, call `planExecPayload`, then `resolveExecConsent`. Any refusal in this phase aborts before a single byte is written — including before the domain profile.
   - **Phase 2 (writes):** `applyExecPayload`, then `installDomainProfile`, then `applyGovernanceMerge` per block, then samples, skill conflicts, skill extensions, registration, manifest stamp.
3. **Constrain `target` before dispatch** (`:91`): today `govEntry.target || 'review.yaml'` is passed straight through. It is now resolved through `resolveRootKey`, so an unknown target refuses with `UNKNOWN_GOVERNANCE_TARGET` in Phase 1.
4. **Report the payload dir** in `filesWritten` so `adev extension list` and any future uninstall can see it.
5. The `finally` block at `:178-183` is unchanged — the temp dir is still deleted, which is exactly why the payload had to be copied out of it (Decision A).

- [ ] **Write failing test** (added to `tests/lib/extensions/install.test.mjs`)

```javascript
test('an executable contribution without consent refuses and writes nothing', async () => {
  const { extDir, projectRoot } = fixtureWithExecutableGovernance();
  const before = snapshotDir(projectRoot);
  await assert.rejects(
    installExtension(extDir, projectRoot, { allowExec: false, interactive: false }),
    e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED'
  );
  assert.deepEqual(snapshotDir(projectRoot), before);
});

test('--allow-exec installs and stamps exec_consented_at', async () => {
  const { extDir, projectRoot } = fixtureWithExecutableGovernance();
  await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });
  const out = readFileSync(join(projectRoot, '.context-index/governance/validate.yaml'), 'utf8');
  assert.match(out, /exec_consented_at: \d{4}-\d{2}-\d{2}T/);
  assert.match(out, /source: extension:/);
});

test('per-install atomicity — a refused second target leaves the first untouched', async () => {
  const { extDir, projectRoot } = fixtureWithTwoTargetsSecondInvalid();
  const before = snapshotDir(projectRoot);
  await assert.rejects(installExtension(extDir, projectRoot, { allowExec: true }));
  assert.deepEqual(snapshotDir(projectRoot), before,
    'no registry, and no domain profile, may be written when any block refuses');
});

test('an unknown target refuses before any write', async () => {
  const { extDir, projectRoot } = fixtureTargeting('risk-policies.yaml');
  await assert.rejects(installExtension(extDir, projectRoot, { allowExec: true }),
    e => e.code === 'UNKNOWN_GOVERNANCE_TARGET');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/install.test.mjs`
Expected: FAIL — no consent parameter exists; the atomicity test finds a written domain profile.

- [ ] **Implement** — apply the two-phase reorder in `install.mjs`; thread the options from `cmdExtension`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/install.test.mjs tests/cli-extension.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/extensions/install.mjs cli/index.mjs \
        tests/lib/extensions/install.test.mjs tests/cli-extension.test.mjs
git commit -m "feat(domain-extensions): validate and consent the whole install before any write

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 8"
```

---

### Task 9: Argv-direct gate execution in `doctor.mjs` [specialist: none]

**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/gates/doctor-argv-execution.test.mjs`
- Modify: `lib/gates/doctor.mjs:955-975`

**Tests:** create `tests/gates/doctor-argv-execution.test.mjs` — owns bound 2.

**Context to load:** see Task 9 Context above. **Read SEC-1 in full** — it contains the verified exploit and the reason the current design is unsafe in principle even though it happens to be safe in practice.

**Closes:** SA-2, SEC-1 (defect 3).

The problem, verified: `loadGates` (`doctor.mjs:1108-1133`) reads `.context-index/governance/gates.yaml` directly and **never** calls `lib/domains/merge-gates.mjs` — the module is mentioned only in a doc comment at `:224`. So `merge-gates.mjs:33-40`'s argv-only enforcement is not in this path at all. `normaliseCommand` (`:254-268`) then joins an argv array back into one shell string and `:965` runs `spawnSync("sh", ["-c", command], { cwd: projectRoot })`. The spec's claim that "no contributed command is ever passed to `sh -c`" is false as written.

**Calibration for the implementer:** this is defence in depth on an already-safe path, not a live hole. `normaliseCommand` single-quotes every metacharacter-bearing token (`NEEDS_QUOTING`, `:219`), so the reviewer's `$(id -u > /tmp/PWNED_ADEV)` exploit does **not** fire against `doctor.mjs` as shipped. What is wrong is that the spec's stated property ("no contributed command is ever passed to `sh -c`") is false, and the safety therefore rests on a quoting function nothing pins. This task makes the stated property true and Task 11 pins the quoting behind it.

The fix, in order of strength:

1. **Argv-direct branch.** At `:955-975`, when `gate.command` is an **array**, execute `spawnSync(argv[0], argv.slice(1), { shell: false, cwd: projectRoot, env, timeout, stdio: 'ignore' })` and never call `normaliseCommand`. A **string** `command` keeps the existing `sh -c` path — the shipped `gates.yaml:28` (`command: "npm test"`) must keep working, and project authors own that file.
2. **Keep the quoting as defence in depth.** `normaliseCommand` / `NEEDS_QUOTING` (`:219`) stay exactly as they are and are pinned by Task 11, so a regression in branch 1 does not silently reopen the sink.
3. Leave the `--execute` gating (`:749`) and the reentrancy guard (`:777-787`) untouched.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
// helper: write a gates.yaml into a temp project and run the doctor with --execute

test('an argv-array command never reaches a shell — substitution stays literal', async () => {
  const { projectRoot, marker } = gatesFixture({
    id: 'argv-gate',
    command: ['node', '-e', `require('fs').writeFileSync(process.argv[1],'ok')`, '$(touch ' + '/tmp/PWNED_ADEV' + ')'],
  });
  await runGateDoctor({ projectRoot, execute: true });
  assert.equal(existsSync('/tmp/PWNED_ADEV'), false,
    'command substitution must not execute — the argv path must not go through sh -c');
});

test('a string command keeps the existing sh -c path', async () => {
  const { projectRoot } = gatesFixture({ id: 'string-gate', command: 'exit 0' });
  const report = await runGateDoctor({ projectRoot, execute: true });
  assert.equal(report.findings.filter(f => f.code === 'gate-execution-failed').length, 0);
});

test('the shipped gates.yaml string form still runs', async () => {
  const { projectRoot } = gatesFixture({ id: 'q', command: 'true' });
  const report = await runGateDoctor({ projectRoot, execute: true });
  assert.ok(report);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/gates/doctor-argv-execution.test.mjs`
Expected: FAIL on the first test — with `normaliseCommand` in the path, the array is joined and quoted; the assertion documents the property, and the branch does not exist yet.

- [ ] **Implement** — add the argv-direct branch at `doctor.mjs:955-975`.

- [ ] **Verify test passes**

Run: `node --test tests/gates/doctor-argv-execution.test.mjs tests/gates/shipped-defaults.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/gates/doctor.mjs tests/gates/doctor-argv-execution.test.mjs
git commit -m "fix(unified-gates): execute argv-array gate commands without a shell

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 9"
```

---

### Task 10: Reference extension end-to-end in a foreign temp project [specialist: none]

**Depends on:** Task 8
**Charter capability:** n/a
**Strategy:** integration (source: detected, confidence: medium)
**Files:**
- Modify: `extensions/example-validation-check/adev-extension.yaml:13`
- Modify: `tests/lib/extensions/example-validation-check-install.test.mjs:206-212`

**Tests:** extend `tests/lib/extensions/example-validation-check-install.test.mjs` — it already owns the reference extension's behavior.

**Context to load:** see Task 10 Context above.

**Closes:** SEC-3, CON-6a; spec ACs L393, L400, L401, L415.

Two changes:

1. **The manifest.** `command: [bash, extensions/example-validation-check/bin/check.sh]` → `command: [bash, bin/check.sh]`. The current value is project-root-relative and names a file that exists only in this repo; under Decision A the installer resolves it against the extension source and rewrites it to `<projectRoot>/.context-index/extensions/example-validation-check/bin/check.sh`.
2. **The test.** `:208` reads `const entries = validate.validators || validate.checks || [];` — the `||` papers over the root-key mismatch that is defect 5 (the loader reads `checks` at `validate-config.mjs:111`; the installer wrote `validators`). Replace it with `const entries = validate.checks;` plus an explicit assertion that `validate.validators` is `undefined`.

The end-to-end assertions run against a temp project created by `createTempDir()` — deliberately **not** this repo, because installing into this repo is what made the broken path look correct (SEC-3):

- installs with `{ allowExec: true }` and refuses with `{ allowExec: false, interactive: false }`
- the installed `validate.yaml` has 8 entries under `checks:` when seeded with 7, with all 20 comment lines byte-identical
- the payload exists at `.context-index/extensions/example-validation-check/bin/check.sh`, mode `0o555`
- the entry's `command[1]` is that absolute path
- `loadValidateConfig(tempProject)` returns the check, and running it via `runQualityGate` **exits 0**

- [ ] **Write failing test**

```javascript
test('the reference extension installs into a foreign project and its gate executes', async () => {
  const projectRoot = createTempDir();
  seedGovernance(projectRoot, { 'validate.yaml': SEVEN_CHECKS_WITH_20_COMMENTS });
  const extDir = join(REPO_ROOT, 'extensions', 'example-validation-check');

  await assert.rejects(installExtension(extDir, projectRoot, { allowExec: false, interactive: false }),
    e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED');

  await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });

  const raw = readFileSync(join(projectRoot, '.context-index/governance/validate.yaml'), 'utf8');
  assert.equal(raw.split('\n').filter(l => l.trim().startsWith('#')).length, 20);

  const validate = parseYaml(raw);
  assert.equal(validate.validators, undefined, 'root key must be checks, never validators');
  assert.equal(validate.checks.length, 8);

  const installed = validate.checks.find(c => c.id === 'example-validation-check.passing');
  const payload = join(projectRoot, '.context-index/extensions/example-validation-check/bin/check.sh');
  assert.equal(installed.command[1], payload);
  assert.equal(statSync(payload).mode & 0o777, 0o555);

  const cfg = loadValidateConfig(projectRoot);
  const check = cfg.checks.find(c => c.id === 'example-validation-check.passing');
  assert.ok(check, 'the installed check must load through the real loader');
  const result = await runQualityGate(check, { cwd: projectRoot });
  assert.equal(result.exitCode, 0);
  cleanupTempDir(projectRoot);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/example-validation-check-install.test.mjs`
Expected: FAIL — the manifest's path does not resolve inside the extension, and the installed check does not execute in a foreign project.

- [ ] **Implement** — edit the manifest and the assertion.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/example-validation-check-install.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add extensions/example-validation-check/adev-extension.yaml \
        tests/lib/extensions/example-validation-check-install.test.mjs
git commit -m "fix(domain-extensions): make the reference extension installable outside this repo

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 10"
```

---

### Task 11: Pin Invariant 6's two declared dependencies [specialist: none]

**Depends on:** Task 3 (it imports `validateEntryFields`), Task 9
**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lib/extensions/invariant-dependencies.test.mjs`

**Tests:** create `tests/lib/extensions/invariant-dependencies.test.mjs` — owns spec AC L407 and the new `normaliseCommand` pin.

**Context to load:** see Task 11 Context above.

**Closes:** SA-8, SEC-7 (the `runner` bound is substitution, not addition), and SEC-1's "declare the quoting as a dependency exactly as the spec already does for `lib/diagnostics/index.mjs`".

Invariant 6 names two guards it depends on. A dependency that is not asserted by a test owned here can regress silently in another module's PR, which is exactly what the spec says must not happen.

- **`resolveRunnerContained`** (`lib/diagnostics/index.mjs:88-138`): rejects `..` on the raw input before resolution; accepts only `plugin:` and `project:` prefixes; realpaths the candidate at `:121`; rejects a path under both roots (`:131-137`, the confused-deputy case) and under neither.
- **`normaliseCommand` / `NEEDS_QUOTING`** (`lib/gates/doctor.mjs:254-268`, `:219`): every metacharacter-bearing token is single-quoted with POSIX `'\''` escaping; a non-string element drops the whole command.

The test also asserts the substitution relationship the reviewers asked for: a `runner` naming a path inside the extension's own directory is **refused at install** (bound 1 is unsatisfiable for `runner` by construction, so it is not applied to it), and only a `plugin:`-prefixed runner is contributable.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRunnerContained } from '../../../lib/diagnostics/index.mjs';
import { normaliseCommand } from '../../../lib/gates/doctor.mjs';
import { validateEntryFields } from '../../../lib/extensions/governance-registry.mjs';

test('Invariant 6 dependency — the diagnostics guard still contains runners', () => {
  const roots = diagnosticsRoots();
  for (const bad of ['../escape.mjs', 'plugin:../escape.mjs', '/abs/path.mjs', 'bare/path.mjs', ''])
    assert.throws(() => resolveRunnerContained(bad, roots));
  assert.ok(resolveRunnerContained('plugin:tier1/known-runner.mjs', roots));
});

test('Invariant 6 dependency — gate command quoting still neutralises metacharacters', () => {
  const out = normaliseCommand(['node', 'x$(id -u > /tmp/PWNED_ADEV)']);
  assert.match(out, /'x\$\(id -u > \/tmp\/PWNED_ADEV\)'/);
  assert.equal(normaliseCommand(['node', 42]), '');
});

test('runner is bounded by substitution — only plugin: is contributable', () => {
  assert.doesNotThrow(() => validateEntryFields('diagnostics.yaml', { id: 'd', runner: 'plugin:tier1/x.mjs' }));
  for (const bad of ['project:x.mjs', 'bin/x.mjs', '/abs/x.mjs'])
    assert.throws(() => validateEntryFields('diagnostics.yaml', { id: 'd', runner: bad }),
      e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/extensions/invariant-dependencies.test.mjs`
Expected: FAIL — the `runner` substitution assertion fails, because `validateEntryFields` does not yet constrain `runner` to `plugin:`-prefixed values. (`normaliseCommand` is **already** exported at `lib/gates/doctor.mjs:254`, so those two assertions pass immediately; that is fine — this task's job is to *pin* them, and a pin that starts green is still a pin.)

- [ ] **Implement** — add the `runner` prefix constraint to `governance-registry.mjs`'s `FIELD_VALUE_CONSTRAINTS` if Task 3 did not already land it; write the remaining assertions. No change to `lib/gates/doctor.mjs` is required.

- [ ] **Verify test passes**

Run: `node --test tests/lib/extensions/invariant-dependencies.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/lib/extensions/invariant-dependencies.test.mjs
git commit -m "test(domain-extensions): pin the two guards Invariant 6 depends on

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 11"
```

---

### Task 12: Documentation for the new contribution contract [specialist: none]

**Depends on:** Task 8
**Charter capability:** n/a
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `docs/extensions.md`
- Modify: `docs/governance.md`
- Modify: `docs/cli-reference.md`
- Modify: `tests/docs/extensions-links.test.mjs`

**Tests:** extend `tests/docs/extensions-links.test.mjs` — the docs suite already owns this surface.

**Context to load:** see Task 12 Context above.

Content to add:

- **`docs/extensions.md`** — the five writable registries and their root keys; the per-registry field allowlists; that `risk-policies.yaml` and `sensitive-paths.yaml` are never writable; the payload directory `.context-index/extensions/<name>/` and the argv rewrite (and that the payload set is derived from argv, not declared in the manifest); the interpreter allowlist; that `dispatch: triggered` and `package.args` are not contributable and why.
- **`docs/governance.md`** — that extension entries carry `source: extension:<name>` and, when executable, `exec_consented_at`; that `merge-gates.mjs` projects five fields so provenance is a file-level property invisible to gate consumers; that a collision is skipped, never merged.
- **`docs/cli-reference.md`** — `adev extension install <source> [--allow-exec]`, with the note that consent is per-install and never remembered, and that a non-interactive install without the flag exits non-zero and writes nothing.

- [ ] **Write failing test**

```javascript
test('extension docs describe the governance contribution contract', () => {
  const ext = readFileSync('docs/extensions.md', 'utf8');
  for (const needle of ['.context-index/extensions/', '--allow-exec', 'interpreter allowlist',
                        'risk-policies.yaml', 'sensitive-paths.yaml'])
    assert.ok(ext.includes(needle), `docs/extensions.md must document ${needle}`);
  const cli = readFileSync('docs/cli-reference.md', 'utf8');
  assert.match(cli, /adev extension install[^\n]*--allow-exec/);
  const gov = readFileSync('docs/governance.md', 'utf8');
  assert.ok(gov.includes('source: extension:'));
  assert.ok(gov.includes('exec_consented_at'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/docs/extensions-links.test.mjs`
Expected: FAIL — none of the strings are present.

- [ ] **Implement** — write the three doc sections.

- [ ] **Verify test passes**

Run: `node --test tests/docs/extensions-links.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add docs/extensions.md docs/governance.md docs/cli-reference.md tests/docs/extensions-links.test.mjs
git commit -m "docs(domain-extensions): document the bounded governance contribution contract

Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
Plan-task: 12"
```

---

## Acceptance Criteria Coverage

Every criterion in the spec (as amended by Task 1) maps to at least one task.

| Spec AC | Task |
|---|---|
| `PATH_TRAVERSAL` on `../../x.yaml`, writes nothing | 7 |
| Unknown target → `UNKNOWN_GOVERNANCE_TARGET` | 3, 8 |
| 7-check `validate.yaml` → 8 entries under `checks:`, comments intact | 6, 7, 10 |
| Reference manifest passes the new validation (or is updated in the same change) | 10 |
| `transitions:` byte-identical after a `gates.yaml` install | 6, 7 |
| No `command` onto an **existing** `gates.yaml` entry | 7 |
| Collision skipped, existing entry byte-identical | 7 |
| `\n` / `"` / `#` scalar → `GOVERNANCE_SCALAR_UNSAFE`, nothing written | 2, 7 |
| Installer-owned field supplied → refused | 3, 7 |
| `risk-policies.yaml` / `sensitive-paths.yaml` refused; writable set is exactly five | 3 |
| Reference extension installs with its `command` **rewritten** (amended AC) | 4, 8, 10 |
| Escaping `command` path → `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`, both registries | 4 |
| String `command` → `GOVERNANCE_COMMAND_NOT_ARGV` | 4 |
| No consent → refused; `--allow-exec` → installs with `exec_consented_at` | 5, 8, 10 |
| `kind` outside the four values → refused | 3 |
| `package: {skill, adapter}` round-trips; `args`, `dispatch: triggered`, two levels refused (amended AC) | 3, 6, 10 |
| Unsafe value inside an array element or nested object → refused | 2 |
| `lib/diagnostics/index.mjs` guard pinned by a test owned here | 11 |
| `{command: x}` scalar → `GOVERNANCE_SCALAR_UNSAFE` (flow-map reparse) | 2 |
| Numeric `id` refused | 2 |
| Supplied `source` → `GOVERNANCE_SOURCE_FORGED`, never `GOVERNANCE_FIELD_NOT_ALLOWED` | 3 |
| Each allowlist accepts every **contributable** field, round-tripped through its loader (amended AC) | 3, 10 |
| `boundaries: []` / `reviewers: []` and indented comment blocks preserved, per form | 6 |
| Unparseable registry → `GOVERNANCE_PARSE_REFUSED`, byte-identical | 6, 7 |
| 20 comment lines byte-identical after a `validate.yaml` splice | 6, 10 |
| Test asserts the `checks` contract, not `validators \|\| checks` | 10 |
| *(new)* argv-array gate commands never reach `sh -c`; quoting pinned | 9, 11 |
| *(new)* per-install atomicity — any refusal leaves the project untouched | 8 |
| *(new)* caps → `GOVERNANCE_LIMIT_EXCEEDED` | 2, 7 |
| All quality gates pass; no constitutional violations | all |

---

## Constitution Check

| Principle | Status |
|---|---|
| Minimize external dependencies | **Pass.** Containment, splicing and consent use `node:fs`, `node:path`, `node:child_process` and string handling only. No YAML library — that is the whole reason the splice is a line-range text operation rather than a round trip. |
| Skills are primarily markdown | **Pass.** No skill files change. |
| Pure ESM | **Pass.** All new files are `.mjs` with named exports. |
| Hook protocol compliance | **Pass.** This path runs at install time; no hook contract changes. |
| Version parity | **Pass.** No manifest version is bumped — release-please owns that (ADR-0008). |

**Architecture Boundaries — Requires Human Approval.** The constitution flags *"Adding external dependencies"* and *"Modifying the CLI installation path structure"*. Two items are adjacent and are called out here rather than assumed:

1. **`cli/index.mjs` gains a flag.** `adev extension install <source> --allow-exec` adds a flag to an existing verb; it does not change the CLI *installation path structure* (`~/.claude/...`), which is what the boundary names. Treated as autonomous. Task 5 is the only place it happens.
2. **A new project-owned directory, `.context-index/extensions/<name>/`.** This is new on-disk state inside the project. It is the direct consequence of Decision A and there is no alternative that satisfies both install-time containment and run-time resolution. Flagged here for the human reviewing this override, not gated — no task is marked `[REQUIRES HUMAN APPROVAL]`, because the spec's own Changes Catalog already commits to bounded executable contribution and this is the minimum mechanism that delivers it.

No `governance/boundaries.yaml` rule matches any planned path (the file contains only commented scaffolds).

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gate definitions come from `.context-index/governance/gates.yaml` (post-0.26.0), which supersedes the constitution's Quality Gates block.

- `quality-gates` — `npm test` (tier 1, severity error, required)
- All acceptance criteria from the spec satisfied (see the coverage table above)
- No constitutional violations (see the Constitution Check above)

Probabilistic gates in `gates.yaml` carry no command and are skipped by the deterministic run; `transitions: {}` is empty, so no `spec-to-plan` approver role is configured (informational — surfaced by the review's transition-gate note).

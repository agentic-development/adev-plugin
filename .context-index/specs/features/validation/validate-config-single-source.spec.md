---
charter: validation
status: validated
kind: behavioral
mode: refactor
revision: 2
charter-revision: 1
created: 2026-05-15
updated: 2026-05-15
depends-on:
  - .context-index/specs/features/validation/configurable-checks.spec.md
  - .context-index/specs/features/domain-profiles/charter.md
coordinated-with:
  - .context-index/specs/features/domain-profiles/charter.md
supersedes-behaviors:
  - configurable-checks.spec.md#behavior-1
  - configurable-checks.spec.md#behavior-2
  - configurable-checks.spec.md#behavior-5
  - configurable-checks.spec.md#ac-zero-config
source-manifest:
  sha: "0a6fe1e"
  files:
    - cli/index.mjs
    - lib/domains/constants.mjs
    - lib/domains/domain-config.mjs
    - lib/governance/validate-config.mjs
    - lib/migrate-state-artifacts.mjs
    - skills/hygiene/SKILL.md
    - skills/init/SKILL.md
    - skills/validate/SKILL.md
    - skills/validate/checks/validate.check-1.5-source-manifest.md
    - skills/validate/checks/validate.check-10-platform-drift.md
    - skills/validate/checks/validate.check-11-visual-verification.md
    - skills/validate/checks/validate.check-12-heuristic-extraction.md
    - skills/validate/checks/validate.check-2-spec-compliance.md
    - skills/validate/checks/validate.check-3-charter-consistency.md
    - skills/validate/checks/validate.check-4-constitution.md
    - skills/validate/checks/validate.check-5-adrs.md
    - skills/validate/checks/validate.check-6-cross-cutting.md
    - skills/validate/checks/validate.check-7-specialist-review.md
    - skills/validate/checks/validate.check-8-boundaries.md
    - skills/validate/checks/validate.check-9-transition-gates.md
    - templates/domains/software/validate.yaml
    - tests/domains/bundled-profiles.test.mjs
    - tests/domains/validate-domain-config.test.mjs
    - tests/evals/configurable-governance/setup-fixture.sh
    - tests/governance/validate-config-single-source.test.mjs
    - tests/governance/validate-config.test.mjs
  computed-at: "2026-05-16T01:42:03.195Z"
drift_detected: true
drift_source: skills/validate/SKILL.md
drift_at: 2026-05-17T20:34:52.868Z
---

> **Revision 2 (2026-05-15):** Addresses blockers SEC-1 (id sanitization) and CON-4 (loadValidateConfig signature) plus warnings SA-1, SA-2, SA-3, SA-6, SA-7, CON-1, CON-3, SEC-2, SEC-3, SEC-4, SEC-5 from the rev-1 review. Reclassified from `kind: refactor` to `kind: behavioral` to accurately reflect that this spec introduces a required artifact rather than purely refactoring storage; the migration tool (Step 8) mitigates the one-time break for upgrading projects.

# Refactoring Spec: Single-Source Validate Configuration

Replace the bundled-defaults-plus-overlay model with a single project-owned `governance/validate.yaml`, scaffolded at init time from a domain-shipped starter. Externalize per-check prompts from `skills/validate/SKILL.md` prose into stand-alone `skills/validate/checks/<id>.md` files. Validation behavior becomes structurally consistent with the other `governance/*.yaml` files (`gates.yaml`, `boundaries.yaml`): one file per concern, owned by the project, no runtime overlay.

This spec is paired with `check-set-restructure.spec.md` (separately scoped). The two specs are independent: this one changes *how* the registry is stored and loaded, that one changes *which* checks are in the registry. Either ordering works at planning time; the conventional ordering is this spec first so the restructure's edits land on the simpler single-file model.

## Current State

### Structure

| File | Role | Notes |
|------|------|-------|
| `templates/validate/defaults.yaml` | Plugin-bundled registry (12 entries) loaded first | Each entry has `internal: true` flag; prompts inlined in `skills/validate/SKILL.md` lines 155-637 |
| `.context-index/governance/validate.yaml` | Optional project overlay loaded second; merges by `id` field-by-field over defaults | Most projects do not have this file (zero-config path) |
| `lib/governance/validate-config.mjs` | Loader: reads defaults, optionally overlays project file, validates, topologically sorts | Implements two-source merge |
| `skills/validate/SKILL.md` | Skill prose; for `internal: true` entries, the per-check prompt body lives here (~500 lines of per-check prose, lines 155-637) | Also contains preflight, dispatch loop, fail-fast logic, report assembly — those are *orchestration*, not per-check content |
| `templates/domains/<domain>/` | Domain overlay directory for charters, specs, reviewers, gates | Does not currently carry a `validate.yaml` — validation is the one governance concern that domains cannot customize per-domain today |
| `lib/domains/domain-config.mjs` | `loadDomainConfig(domain, configType, ...)` API for domain-aware loaders | `configType` does not yet recognize `'validate'` |

### Problems

1. **Two-file mental model for one concern.** A reader of validation behavior has to read `templates/validate/defaults.yaml` *and* `governance/validate.yaml` (if present) *and* know the merge semantics to predict what runs. The other governance concerns (`gates.yaml`, `boundaries.yaml`) have a single project-owned file; validation is the inconsistent one.

2. **Check prompts split between two formats.** `templates/validate/defaults.yaml` marks `internal: true` for subagent-review entries — meaning their prompts are *not* in the registry but in `skills/validate/SKILL.md` prose. `configurable-checks.spec.md`'s Task Map already flagged this as future-work ("Move per-check prompt text from SKILL.md into `skills/validate/prompts/<id>.md`") but the move did not happen in v1; the `internal: true` workaround shipped instead.

3. **Plugin upgrades that improve a default prompt do not auto-flow to projects that have overlaid the same `id`.** Today's merge semantics override field-by-field — if a project overlay sets `prompt:` for an `id`, future plugin improvements to that prompt are invisible until the project diffs and manually re-merges. The model promised central improvement but delivers central improvement only for unmodified entries. The complexity is paid; the benefit is partial.

4. **Greenfield projects rely on bundled defaults, hiding the inventory.** A user who never edits `governance/validate.yaml` cannot answer "what is my validate doing?" without reading plugin sources. The check inventory lives outside their repo.

5. **Domains cannot ship per-domain validate behavior today.** A data-engineering project gets the same `validate.yaml` defaults as a software project. There is no `loadDomainConfig(domain, 'validate', ...)` entry point because the loader does not consult domain overlays.

### Dependencies

Migration constraints — code or artifacts that consume the current behaviour:

- **`lib/governance/validate-config.mjs`** is the loader; its public API (`loadValidateConfig(repoRoot, options)`) must remain callable with the same return shape after the refactor.
- **`skills/validate/SKILL.md`** lines 122-150 already call `loadValidateConfig()` and iterate the resulting registry — the call site is registry-shape-stable.
- **`skills/validate/SKILL.md`** lines 155-637 contain inlined check prose flagged `internal: true`. These move out of SKILL.md.
- **`configurable-checks.spec.md` (status: validated)** Behaviors 1, 2, 5 describe the merge model and bundled IDs. This spec supersedes those Behaviors (annotated forward).
- **`configurable-checks.spec.md` AC #1** ("Zero-config behavior: `/adev:validate` with no `governance/validate.yaml` produces a report identical to pre-change for at least one fixture spec") becomes obsolete — the post-refactor "zero-config" state is "no config; clear error message pointing at `/adev:init`."
- **`check-set-restructure.spec.md`** depends on this spec; its registry edits land on `governance/validate.yaml` rather than `templates/validate/defaults.yaml` after this one ships.
- **`/adev:init`** must scaffold `governance/validate.yaml` from the resolved domain's starter. Today init does not write this file.
- **`templates/domains/software/`** must gain a `validate.yaml` (the current `templates/validate/defaults.yaml` becomes the software-domain starter).
- **`/adev:hygiene`** gains an audit pass that reports drift between `governance/validate.yaml` and the current domain starter — restores most of the "central improvement visibility" that the old overlay model purported to provide.

## Target State

### Structure

| File | Role | Notes |
|------|------|-------|
| `.context-index/governance/validate.yaml` | **Single source of truth** for the validate check registry in a project | Scaffolded at init time; project-owned thereafter |
| `templates/domains/<domain>/validate.yaml` | Domain-shipped starter consumed by `/adev:init` | `software`, `data-engineering`, `process-automation` each ship one (software's is the current `defaults.yaml`) |
| `skills/validate/checks/<id>.md` | Per-check subagent prompt files (one per check) | Resolved via `plugin:validate/checks/<id>.md` URI in the registry's `prompt:` field |
| `lib/governance/validate-config.mjs` | Reads `governance/validate.yaml` directly; no overlay, no merge, no bundled fallback | Public API unchanged in shape; missing-file branch throws clearly |
| `skills/validate/SKILL.md` | Contains only orchestration: preflight, dispatch loop, fail-fast logic, severity rules, report assembly | Per-check prose removed; reduces ~500 lines |
| `skills/hygiene/SKILL.md` | Gains audit pass: Validate Config Drift | Compares `governance/validate.yaml` to current domain starter; reports divergence as INFO |
| `lib/domains/domain-config.mjs` | `loadDomainConfig(domain, 'validate', ...)` resolves `domains/<domain>/validate.yaml` | Extends existing API; backward-compatible for callers that don't pass `'validate'` |

### Improvements

1. **One config file, one mental model.** A reader opens `governance/validate.yaml` and sees the entire check inventory. No second file to consult.
2. **Pattern consistency with the rest of `governance/`.** `gates.yaml`, `boundaries.yaml`, and `validate.yaml` become peers — same shape, same load semantics, same `/adev:init` scaffolding pattern.
3. **Check prompts are first-class artifacts.** `skills/validate/checks/<id>.md` files are diffable, reviewable, and overridable per-check via `governance/validate-prompts/<id>.md` (using `configurable-checks.spec.md` Behavior 22's existing `plugin:` vs project-relative resolution).
4. **Domains can customize validation.** A data-engineering project can ship a starter with `validate.check-data-quality` instead of a UI-focused Check 11. The mechanism is the same `loadDomainConfig()` already used for charter templates, reviewers, and gates.
5. **Plugin upgrades surface as visible drift, not invisible auto-merge.** When a plugin version improves a check prompt, `/adev:hygiene` reports the divergence. Users opt in to the improvement by adopting the new prompt; the change is auditable and reversible. This is the same trade-off `unified-gates` already makes for `governance/gates.yaml`.
6. **Greenfield workflow is `init` + `validate`.** Zero-config means "I haven't run init"; running init is the explicit setup step. No magical fallback obscures what the project actually has.

## Changes Catalog

### ADDED

- `skills/validate/checks/<id>.md` — one file per check (12 files initially, mirroring current registry IDs). Each contains the subagent prompt body currently inlined in `skills/validate/SKILL.md` lines 155-637.
- `templates/domains/software/validate.yaml` — software-domain starter; content is the current `templates/validate/defaults.yaml` plus updated `prompt:` fields pointing at the new `plugin:validate/checks/<id>.md` URIs. **This is the only domain starter shipped by this spec.** Data-engineering and process-automation starters are deliberately deferred to follow-up specs that commit to meaningfully-different check sets per domain (avoids the "three identical files" maintenance trap flagged in rev-1 SA-7). Projects in those domains use `software` as a fallback per Behavior 4 until their domain ships a tailored starter.
- `/adev:init` step that scaffolds `.context-index/governance/validate.yaml` from `loadDomainConfig(domain, 'validate', ...)` if the file does not yet exist.
- `/adev:hygiene` Audit Pass: **Validate Config Drift** — compares `governance/validate.yaml` against the current domain starter, reports divergence as INFO with a per-key diff.
- `lib/domains/domain-config.mjs` recognizes `configType: 'validate'` and resolves it against `domains/<domain>/validate.yaml`.
- Validate preflight check: refuse to run when `governance/validate.yaml` is missing, with the actionable message: `"No governance/validate.yaml found. Run /adev:init to scaffold the validate configuration for your domain."`

### MODIFIED

- `lib/governance/validate-config.mjs` — `loadValidateConfig(repoRoot)` now:
  - Reads `.context-index/governance/validate.yaml` directly; no bundled-defaults file is read.
  - Throws `MISSING_VALIDATE_CONFIG` when the file is absent, with the message above.
  - Resolves `prompt:` URIs:
    - `plugin:validate/checks/<id>.md` → `skills/validate/checks/<id>.md` in the plugin tree (per `configurable-checks.spec.md` Behavior 22's `plugin:` scheme).
    - Project-relative paths (e.g., `governance/validate-prompts/<id>.md`) → resolved from `.context-index/` with traversal guard (existing Behavior 22 logic, no change).
    - Absolute paths rejected (existing Behavior 22, no change).
  - Drops the overlay merge loop; the public API return shape is unchanged.
- `skills/validate/SKILL.md` — per-check prose sections (lines 155-637) removed. SKILL.md retains:
  - Preflight (lifecycle event emission, infrastructure verification, workspace-aware mode handling)
  - Registry load via `loadValidateConfig(repoRoot)` (call site unchanged)
  - Dispatch loop iterating the registry
  - Fail-fast / severity rules
  - Report assembly with the registry-emission section per `configurable-checks.spec.md` Behavior 26
- `templates/validate/defaults.yaml`'s 12 entries lose the `internal: true` flag and gain `prompt: plugin:validate/checks/<id>.md` for subagent-review kinds before the file itself is removed in REMOVED below. (Two-step: rewrite then move to `templates/domains/software/validate.yaml`.)
- `configurable-checks.spec.md` — header annotation:
  ```
  > **Partial supersession**: Behaviors 1, 2, 5 (registry loading & merge, canonical IDs from defaults)
  > and Acceptance Criterion #1 (zero-config behavior) are superseded by
  > `validate-config-single-source.spec.md`. The configurable-checks `kind` taxonomy,
  > profile-driven dispatch, `kind: deterministic-check` restriction, quality-gate argv form
  > and shell-rejection, prompt URI resolution, ordering via `after:`, severity semantics,
  > and report emission (Behaviors 6-23, 25, 26) remain in force.
  ```
  No textual edits to the affected Behaviors themselves; the annotation is sufficient to mark them obsolete while preserving historical legibility.

### REMOVED

- `templates/validate/defaults.yaml` — the bundled-defaults file is deleted. Its content moves to `templates/domains/software/validate.yaml`.
- The overlay merge logic in `lib/governance/validate-config.mjs` (the loop that overlays `governance/validate.yaml` on bundled defaults by `id` field-by-field).
- The `internal: true` flag on registry entries — no longer needed since all check prompts have explicit `prompt:` fields.
- Per-check prose sections (Check 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13) from `skills/validate/SKILL.md`. Replaced by `skills/validate/checks/<id>.md` files; the SKILL.md dispatch loop reads `prompt:` from the registry entry.

### RENAMED

- None at the file level. Conceptually, the bundled-defaults file is "renamed" to the software-domain starter, but it's a move-and-restructure (new path, content slightly modified for the `prompt:` URIs), so it's recorded in ADDED + REMOVED rather than RENAMED.

## Migration Path

Each step leaves the system green (`npm test` passes; validate runs end-to-end on a representative fixture).

### Step 1: Externalize per-check prompts to `skills/validate/checks/<id>.md`

- **What:** Create `skills/validate/checks/<id>.md` for each current registry entry. Copy the per-check prose body from `skills/validate/SKILL.md` lines 155-637 into the corresponding file. Update `templates/validate/defaults.yaml` entries: drop `internal: true`, add `prompt: plugin:validate/checks/<id>.md`. `lib/governance/validate-config.mjs` gains `plugin:validate/checks/...` resolution (mirroring the existing `plugin:review-specs/...` resolution).
- **Why first:** Prompt extraction is the largest behavior-preserving move. It must land before the single-source switch so subsequent steps work on already-externalized prompts.
- **Risk:** Medium — per-check prose moves across files. Subtle losses in copy-paste are possible.
- **Verification:** Run validate on a representative spec pre- and post-step. Per-check sections in the validate report are byte-identical (modulo timestamps).

### Step 2: Add `validate` to `loadDomainConfig`'s `configType` enumeration

- **What:** Update `lib/domains/domain-config.mjs` to recognize `configType: 'validate'` and resolve it to `templates/domains/<domain>/validate.yaml`. Returns `null` when the domain ships no starter, per existing API convention.
- **Why second:** Infrastructure that subsequent steps depend on. Pure addition; no caller invokes the new path yet.
- **Risk:** Low — additive change to an enumeration; existing call sites unaffected.
- **Verification:** New tests for `loadDomainConfig(domain, 'validate', ...)` return the correct path for `software`, `data-engineering`, `process-automation`, and `null` for an unknown domain.

### Step 3: Add the software domain starter

- **What:** Create `templates/domains/software/validate.yaml` with the content of (the now-externalized-prompt) `templates/validate/defaults.yaml`. **Only the software starter ships in this spec.** Data-engineering and process-automation starters are deliberately deferred to follow-up specs that commit to meaningfully-different check sets per domain — shipping three identical starters today would invite pattern erosion and a false signal that domain customization is real (per rev-1 SA-7). Projects in non-software domains use the `software` fallback per Behavior 4 until their domain ships a tailored starter.
- **Why third:** Materializes the single migration target before the loader switch.
- **Risk:** Low — file copy with minor edits.
- **Verification:** Loading `loadDomainConfig('software', 'validate', ...)` returns a registry structurally equivalent to today's `templates/validate/defaults.yaml`. Loading `loadDomainConfig('data-engineering', 'validate', ...)` returns `null` (no starter shipped); init falls back to software per Behavior 4.

### Step 4: Update `/adev:init` to scaffold `governance/validate.yaml`

- **What:** Add an `/adev:init` step (after domain resolution) that:
  1. Calls `loadDomainConfig(resolvedDomain, 'validate', repoRoot, pluginRoot)`.
  2. If the domain ships a starter AND `.context-index/governance/validate.yaml` does not yet exist, copies the starter to the project path.
  3. If `loadDomainConfig` returns `null` for the resolved domain, falls back to the `software` starter and emits a one-line advisory: `"No validate.yaml starter for domain '<domain>'; scaffolded from 'software' as fallback."`
  4. If `.context-index/governance/validate.yaml` already exists, the step is a no-op (idempotent).
- **Why fourth:** Init must be capable of materializing the config before the loader stops falling back to bundled defaults.
- **Risk:** Low — additive to init; idempotent.
- **Verification:** Run init in a fresh fixture project; `governance/validate.yaml` exists and matches the resolved domain's starter. Re-run init; file unchanged. Existing init tests still pass.

### Step 5: Switch loader to single-source

- **What:** Modify `lib/governance/validate-config.mjs`:
  - Remove the bundled-defaults read (the `templates/validate/defaults.yaml` load + parse path).
  - Remove the overlay merge loop.
  - Read `.context-index/governance/validate.yaml` directly.
  - On missing file: throw `MISSING_VALIDATE_CONFIG` with the actionable message.
  - On malformed YAML: existing line-cited parse error path is preserved (per `configurable-checks.spec.md` Error Cases table).
- **Why fifth:** Destinations (Step 3) and scaffolding (Step 4) are in place; the loader switch is safe.
- **Risk:** Medium — projects that have not run init since this spec landed will hit the new error. The migration tool (Step 8) addresses existing projects.
- **Verification:** Fixture with `governance/validate.yaml` present: validate runs identically pre/post. Fixture without the file: validate exits with `MISSING_VALIDATE_CONFIG` and the actionable message.

### Step 6: Delete `templates/validate/defaults.yaml`

- **What:** Remove the file. Verify no remaining references in lib, skills, hooks, or templates.
- **Why sixth:** Cleanup after the loader switch. Final removal also signals to any external consumer that the bundled-defaults path is gone.
- **Risk:** Low — at this point the loader no longer reads it; deletion is safe.
- **Verification:** `npm test` passes. `grep -r 'templates/validate/defaults' .` returns no results.

### Step 7: Add hygiene Validate Config Drift audit pass

- **What:** New audit pass in `skills/hygiene/SKILL.md`:
  - Resolves the project's domain.
  - Calls `loadDomainConfig(domain, 'validate', ...)` to get the current starter.
  - Diffs `.context-index/governance/validate.yaml` against the starter (by `id`, field-by-field).
  - Reports each divergence as **INFO** with a per-key diff: starter value vs project value. Severity is INFO (not WARN) because divergence is the expected outcome of project customization; the audit's purpose is visibility, not nagging.
- **Why seventh:** Restores the "central improvement visibility" the old overlay model purported to provide. Plugin upgrades surface drift; users opt in.
- **Risk:** Low — additive audit pass.
- **Verification:** Fixture where `governance/validate.yaml` differs from the starter: hygiene reports the diff as INFO. Fixture where they match: hygiene reports PASS.

### Step 8: Migration tool for existing projects

- **What:** Add a one-shot migration tool (CLI flag or skill action) for **existing adev-using projects upgrading past this version**. The tool:
  1. Detects whether `.context-index/governance/validate.yaml` is **absent**, **present and valid**, or **present and malformed**.
  2. **Absent:** resolves the project's domain and writes the starter (mirroring `/adev:init` Step 4). Idempotent on re-run.
  3. **Present and valid:** no-op; reports "already migrated."
  4. **Present and malformed:** refuses to overwrite. Reports the parse error and the file path; directs the user to inspect and fix manually. Exits with `MIGRATION_BLOCKED_BY_CORRUPT_CONFIG` (per rev-1 SEC-5). The tool never silently overwrites a malformed-but-customized file.
  5. The "partial overlay" case (existing file with only deltas) is ruled out by Invariant verification (see Invariants); if discovered during migration, the tool falls through to step 4 (refuses, reports) until a follow-up extends the tool to compose merged registries.
- **Why eighth:** Without this, users updating the plugin and running `/adev:validate` will hit `MISSING_VALIDATE_CONFIG`. The migration tool gives them a one-line fix while refusing to clobber accidental customizations.
- **Risk:** Low — idempotent; refuses-rather-than-overwrites on the corrupt-file edge case.
- **Verification:** Three fixtures, one per branch: absent → tool writes from correct starter; valid → tool no-ops; malformed → tool refuses, reports, exits non-zero with `MIGRATION_BLOCKED_BY_CORRUPT_CONFIG`. Re-running on a successfully-migrated project is a no-op.

### Step 9: Annotate `configurable-checks.spec.md` (with round-trip)

- **What:** Two-part lifecycle hygiene update:
  1. Add the partial-supersession prose annotation at the top of `configurable-checks.spec.md` (already landed at rev 2 of this spec).
  2. Add a `superseded-by-behaviors:` frontmatter field on `configurable-checks.spec.md` pointing back to this spec's behaviors — the **round-trip** the rev-1 reviewer flagged as missing (SA-3, CON-1). After this step, both sides of the supersession edge are machine-readable.
- **Why ninth:** Lifecycle hygiene — the validated predecessor spec must point forward to its successor without losing the parts that remain in force, and the relationship must be discoverable by tooling, not just prose.
- **Risk:** None — frontmatter additions; the predecessor spec retains `status: validated`.
- **Verification:** `configurable-checks.spec.md`'s frontmatter contains `superseded-by-behaviors:` pointing at this spec; this spec's frontmatter contains `supersedes-behaviors:` pointing at the predecessor. The round-trip is symmetric. A future hygiene audit pass can enforce the round-trip; that audit is out of scope for this spec (filed as a follow-up).

### Step 10: Update validation charter Skills section

- **What:** Update `.context-index/specs/features/validation/charter.md`'s Skills section to reflect the new "registry in `governance/validate.yaml`, prompts in `skills/validate/checks/`" model. Independent of `check-set-restructure.spec.md`'s charter-update step (the two updates can be combined into a single edit when both specs are at the same migration stage).
- **Why tenth:** Don't leave the parent charter contradicting reality.
- **Risk:** None.
- **Verification:** Charter Skills section accurately describes current state.

### Step 11: Amend ADR-0003

- **What:** Annotate `.context-index/adrs/0003-configurable-review-registry.md` with a note that the "Zero behavior change for existing projects" guarantee (bundled defaults flow-through) has been narrowed for the validate registry — specifically that plugin-supplied prompt improvements now reach projects via opt-in adoption (drift surfaced by `/adev:hygiene`) rather than auto-merge. The ADR remains accepted; the note explicitly references this spec as the narrowing event and `unified-gates` as the precedent for the same trade-off.
- **Why eleventh:** Per constitution's "Updating specs/ADRs when code changes affect their assumptions" rule. Without this amendment, future readers of ADR-0003 would see an obsolete guarantee. Addresses rev-1 SA-6.
- **Risk:** None — documentation only.
- **Verification:** ADR-0003 includes a "Revised <date>" note pointing at this spec and explaining the narrowed guarantee.

## Invariants

- [ ] All existing tests continue to pass at every migration step. Each step's commit is independently green.
- [ ] Projects with an existing `governance/validate.yaml` see identical validate behavior pre/post — the overlay model already produced a merged config equivalent to what the new model reads directly.
- [ ] Validate verdict semantics unchanged (per `configurable-checks.spec.md` Postconditions).
- [ ] `kind: deterministic-check` restriction preserved — projects cannot register new deterministic-check entries (Behavior 8 of `configurable-checks.spec.md` remains in force).
- [ ] Public API of `loadValidateConfig(repoRoot, opts?)` returns a registry of the same shape — callers need no signature changes. The optional `opts` parameter (`pluginRoot`, `domainSeverityDefaults`) from rev 3 of `configurable-checks.spec.md` is preserved.
- [ ] **Registry `id` validation enforced at parse time.** Every entry's `id` matches `^[a-z0-9][a-z0-9._-]*$` before any `plugin:` URI construction. Non-conforming values fail load with `INVALID_CHECK_ID`. This invariant is independent of (and complementary to) the prompt-URI traversal guard.
- [ ] **`loadDomainConfig` `domain` argument is validated at call time** against `^[a-z0-9][a-z0-9-]*$`. The guard is implementation-enforced, not caller-discipline-enforced.
- [ ] **No project today has a partial overlay.** Verified by `grep`/audit before migration tool ships: zero projects in the migration cohort have a `governance/validate.yaml` that only partially overrides bundled defaults. If verification fails, an additional Step 8a is required to compose the merged registry from `(bundled defaults ∪ project overlay)` before writing.
- [ ] Check dispatch ordering preserved — the topological sort by `after:` (Behavior 16 of `configurable-checks.spec.md`) operates identically on the new single-file input.
- [ ] Prompt URI resolution rules unchanged from Behavior 22 of `configurable-checks.spec.md` (`plugin:<skill>/<file>`, relative paths from `.context-index/`, absolute paths rejected, cross-plugin deferred).
- [ ] Severity, profile, env, and redaction handling all unchanged from `configurable-checks.spec.md` Behaviors 11-15, 19-21, 25a-25b.

## Behavioral Contract

### Behaviors

0. **When** `loadValidateConfig` parses a registry entry **then** it validates the entry's `id` field against the pattern `^[a-z0-9][a-z0-9._-]*$` **before** any `plugin:` URI construction. Non-conforming `id` values (containing `..`, path separators, control characters, or starting with non-alphanumeric) fail load with `INVALID_CHECK_ID` and the offending value (truncated to 64 chars if longer, with non-allowlist characters stripped from the displayed value to prevent log injection). This guard is independent of — and complementary to — the existing traversal guard on resolved final paths (per `configurable-checks.spec.md` Behavior 22). Addresses rev-1 SEC-1.

1. **When** `/adev:validate` runs and `.context-index/governance/validate.yaml` is missing **then** the skill exits with the message `"No governance/validate.yaml found. Run /adev:init to scaffold the validate configuration for your domain."` and error code `MISSING_VALIDATE_CONFIG`. No check is dispatched; no report is written.

2. **When** `loadValidateConfig(repoRoot, opts?)` is called **then** it reads `.context-index/governance/validate.yaml` directly. No bundled-defaults file is read. No overlay merge is performed. The function continues to accept the optional `opts` parameter from rev 3 of `configurable-checks.spec.md` (`pluginRoot`, `domainSeverityDefaults`); both keys are preserved unchanged. Addresses rev-1 CON-4.

3. **When** `/adev:init` runs and `loadDomainConfig(domain, 'validate', repoRoot, pluginRoot)` returns a starter path **then** `/adev:init` copies that starter to `.context-index/governance/validate.yaml` if the file does not yet exist. If the file already exists, `/adev:init` does not modify it.

4. **When** `/adev:init` runs and `loadDomainConfig(domain, 'validate', ...)` returns `null` for the resolved domain **then** `/adev:init` falls back to the `software` domain's starter and prints `"No validate.yaml starter for domain '<domain>'; scaffolded from 'software' as fallback."`

5. **When** a check entry's `prompt` field is `plugin:validate/checks/<id>.md` **then** the loader resolves it to `skills/validate/checks/<id>.md` in the plugin tree, per `configurable-checks.spec.md` Behavior 22's `plugin:<skill>/<file>` scheme.

6. **When** a check entry's `prompt` field is a project-relative path (e.g., `governance/validate-prompts/<id>.md`) **then** the loader resolves it from `.context-index/` with the existing traversal guard (`..` rejected; `fs.realpath` used for symlink escape).

7. **When** `loadDomainConfig` is called with `configType: 'validate'` **then** it resolves to `templates/domains/<domain>/validate.yaml` if that file exists in the bundled plugin or in an installed extension. Returns `null` otherwise, consistent with the existing API.

7a. **When** `loadDomainConfig` is invoked with a `domain` argument **then** it validates the value against the domain-profiles charter's allowed pattern (`^[a-z0-9][a-z0-9-]*$`) **before** any path construction. Non-conforming values throw with the offending value redacted to allowlist-conforming chars only. This makes the path-safety guarantee implementation-enforced rather than caller-discipline-enforced. Addresses rev-1 SEC-2.

8. **When** `/adev:hygiene` runs the Validate Config Drift audit pass **then** it compares the project's `governance/validate.yaml` against the resolved domain's starter (via `loadDomainConfig`) and emits an INFO finding for each divergent registry entry. For most fields the diff includes the starter value vs project value; for `prompt:` and `context_pack:` fields specifically, the diff emits **only the field name and value type** (e.g., `prompt: <project-relative-path> vs <plugin-URI>`) — not the full string values — to prevent leakage of project-specific labels or internal codenames in hygiene output that may be shared. Addresses rev-1 SEC-4.

9. **When** `skills/validate/SKILL.md` runs its check dispatch loop **then** it iterates the registry returned by `loadValidateConfig`, resolves each entry's `prompt:` field to a file body, and dispatches per the check's `kind` (`subagent-review`, `quality-gate`, `deterministic-check`, `observational`). No per-check prose is read from `skills/validate/SKILL.md`.

10. **When** the plugin is upgraded and a check prompt is improved in `skills/validate/checks/<id>.md` **then** projects whose `governance/validate.yaml` references the unmodified `plugin:validate/checks/<id>.md` URI **may** auto-pick up the improvement on next validate run; projects that have overridden the URI with a project-relative `prompt:` path remain unaffected by design (intentional opt-out). This is a deliberate narrowing of `ADR-0003`'s "Zero behavior change for existing projects" guarantee — the trade-off mirrors the one already accepted for `unified-gates` (Step 11 amends ADR-0003 to record this narrowing). Addresses rev-1 CON-3 and pairs with Migration Path Step 11.

### Error Cases

| Condition | Expected Behavior | Code |
|-----------|-------------------|------|
| Registry entry's `id` field fails the `^[a-z0-9][a-z0-9._-]*$` allowlist pattern | Load fails before any URI construction; the offending value is displayed with non-allowlist chars stripped and truncated to 64 chars (per Behavior 0) | INVALID_CHECK_ID |
| `loadDomainConfig` invoked with a non-conforming `domain` argument | Throws before any path construction; offending value redacted to allowlist chars (per Behavior 7a) | INVALID_DOMAIN_ARG |
| `.context-index/governance/validate.yaml` missing | Exit with actionable message pointing at `/adev:init` | MISSING_VALIDATE_CONFIG |
| `governance/validate.yaml` malformed YAML | Load fails with line-cited parse error (existing behavior preserved) | INVALID_VALIDATE_CONFIG |
| `governance/validate.yaml` exists but is corrupt (parse fails) at migration-tool time | Migration tool reports the malformation and exits without overwriting; directs user to inspect manually | MIGRATION_BLOCKED_BY_CORRUPT_CONFIG |
| Check entry's `prompt:` URI references a non-existent file | Load fails with the referenced URI **truncated to 128 characters and with non-allowlist characters stripped** to prevent log injection from accidentally-sensitive `id` or `prompt` values | PROMPT_NOT_FOUND |
| Check entry's `prompt:` URI is an absolute path | Load fails (existing Behavior 22) | PROMPT_ABSOLUTE_PATH |
| Check entry's `prompt:` URI is a cross-plugin reference (`plugin:<other>:...`) | Load fails (existing Behavior 22, cross-plugin deferred) | PROMPT_CROSS_PLUGIN |
| Domain starter missing for the resolved domain at init time | Falls back to `software` starter with one-line advisory | DOMAIN_STARTER_FALLBACK (advisory) |
| `loadDomainConfig` itself fails (corrupt extension, etc.) | Init aborts with the underlying error | DOMAIN_CONFIG_LOAD_FAILED |
| Project's `governance/validate.yaml` references a check `id` whose `prompt` is `plugin:validate/checks/<unknown>.md` | Load fails with `PROMPT_NOT_FOUND` (file does not exist in plugin) | PROMPT_NOT_FOUND |

## System Constitution Reference

- **Principle 1 (Minimize external dependencies):** No new dependencies. Reuses the existing YAML parser, profile loader, and `lib/domains/domain-config.mjs` infrastructure.
- **Principle 2 (Skills are primarily markdown):** SKILL.md prose shrinks; check prompts become standalone `.md` files. Net effect: more markdown, in better-factored locations. The constitution's "Skills are primarily markdown" intent is strengthened — check authoring is now markdown-only.
- **Architecture Boundary (Editing skill markdown is autonomous):** Per constitution's Autonomous list, the SKILL.md edits and the new `skills/validate/checks/<id>.md` files are within the agent's authority. No new skills added to the lifecycle order; no hook protocol changes; no CLI changes beyond extending `/adev:init` with one scaffolding step.
- **Architecture Boundary (Updating specs/ADRs when code changes affect their assumptions):** This spec explicitly supersedes Behaviors 1, 2, 5 and AC #1 of `configurable-checks.spec.md`. The Migration Path's Step 9 performs the required annotation.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Externalize check prompts | Create `skills/validate/checks/<id>.md` × 12; copy bodies from `skills/validate/SKILL.md`; update registry entries | medium |
| Add `plugin:validate/checks/...` URI resolution | Mirror the `plugin:review-specs/...` resolution path in `lib/governance/validate-config.mjs` | small |
| Extend `loadDomainConfig` with `configType: 'validate'` | New case in `lib/domains/domain-config.mjs` | small |
| Author software domain starter | `templates/domains/software/validate.yaml` from current defaults (with externalized prompt URIs) | small |
| **Enforce `id` allowlist at parse time** | Validate every registry entry's `id` against `^[a-z0-9][a-z0-9._-]*$` before any URI construction; fail with `INVALID_CHECK_ID` (rev-2 SEC-1 fix) | small |
| **Validate `loadDomainConfig` `domain` argument** | Reject non-conforming domain values with `INVALID_DOMAIN_ARG` at call time (rev-2 SEC-2 fix) | small |
| **Truncate-and-strip `PROMPT_NOT_FOUND` URI in diagnostics** | Bound URI emission to ≤128 chars; strip non-allowlist chars (rev-2 SEC-3 fix) | small |
| **Hygiene drift diff: emit value types for sensitive fields** | For `prompt:` and `context_pack:` fields, emit field names + types only, not full values (rev-2 SEC-4 fix) | small |
| **Migration tool refuses corrupt-file overwrite** | Tool exits with `MIGRATION_BLOCKED_BY_CORRUPT_FILE` when an existing `governance/validate.yaml` fails to parse (rev-2 SEC-5 fix) | small |
| **Round-trip `superseded-by-behaviors:` on configurable-checks** | Add frontmatter field on `configurable-checks.spec.md` pointing at this spec's Behaviors (rev-2 SA-3/CON-1 fix) | small |
| **Amend ADR-0003** | Note that the "Zero behavior change" guarantee is narrowed for validate registry; reference unified-gates precedent (rev-2 SA-6 fix) | small |
| Update `/adev:init` to scaffold `governance/validate.yaml` | New step after domain resolution; idempotent | small |
| Refactor `loadValidateConfig` to single-source | Remove bundled-defaults read; remove overlay merge; add missing-file branch | medium |
| Add hygiene Validate Config Drift audit pass | New audit pass in `skills/hygiene/SKILL.md`; per-key diff with INFO severity | medium |
| Delete `templates/validate/defaults.yaml` | After verifying no consumers | small |
| Strip per-check prose from `skills/validate/SKILL.md` | Remove lines ~155-637; preserve orchestration sections | medium |
| Migration tool for existing projects | CLI flag or skill action that runs the init-style scaffold for projects upgrading past this version | small |
| Annotate `configurable-checks.spec.md` | Add partial-supersession header note | small |
| Update validation charter Skills section | Reflect new single-source model and externalized prompts | small |
| Tests | `loadValidateConfig` missing-file; init scaffold; init idempotency; prompt URI resolution including `plugin:validate/checks/`; hygiene drift pass; domain fallback; parity test (existing `governance/validate.yaml` produces identical merged config vs old overlay output) | large |

## Acceptance Criteria

- [ ] `templates/validate/defaults.yaml` is removed.
- [ ] `skills/validate/checks/<id>.md` exists for every registry entry; the dispatch loop reads `prompt:` from the registry and resolves it via the URI rules from `configurable-checks.spec.md` Behavior 22.
- [ ] `loadValidateConfig(repoRoot, opts?)` reads `.context-index/governance/validate.yaml` directly with no overlay, no bundled-defaults fallback. The public return shape is unchanged. The optional `opts` parameter (`pluginRoot`, `domainSeverityDefaults`) from rev 3 of `configurable-checks.spec.md` is preserved. (rev-2 CON-4 fix)
- [ ] **Registry `id` allowlist enforced at parse time.** A fixture `governance/validate.yaml` containing an entry with `id: ../../bad` or `id: with spaces` fails load with `INVALID_CHECK_ID` and the offending value is stripped/truncated in the diagnostic. (rev-2 SEC-1 fix)
- [ ] **`loadDomainConfig` `domain` argument validated at call time.** Calling `loadDomainConfig('../etc', 'validate', ...)` throws with `INVALID_DOMAIN_ARG` before any path construction. (rev-2 SEC-2 fix)
- [ ] **`PROMPT_NOT_FOUND` diagnostic emits truncated, allowlist-stripped URI** of ≤128 characters. A fixture with a long or specially-crafted `prompt:` field produces a sanitized error message. (rev-2 SEC-3 fix)
- [ ] **Hygiene Validate Config Drift diff emits field types for `prompt:` and `context_pack:` fields**, not full values. A fixture where the project overrides `prompt:` to a path containing a sensitive label produces a diff that shows `<plugin-URI>` vs `<project-relative-path>`, not the full strings. (rev-2 SEC-4 fix)
- [ ] **Migration tool refuses to overwrite a malformed `governance/validate.yaml`.** A fixture with corrupt YAML existing causes the tool to exit with `MIGRATION_BLOCKED_BY_CORRUPT_FILE` and leave the file unchanged. (rev-2 SEC-5 fix)
- [ ] When `.context-index/governance/validate.yaml` is missing, validate exits with `MISSING_VALIDATE_CONFIG` and the actionable message pointing at `/adev:init`.
- [ ] `loadDomainConfig` recognizes `configType: 'validate'` and resolves to `templates/domains/<domain>/validate.yaml`. **Only `software` ships a starter in this spec**; `data-engineering` and `process-automation` return `null` and fall back to `software` per Behavior 4 (rev-2 SA-7 fix).
- [ ] `/adev:init` scaffolds `.context-index/governance/validate.yaml` from the resolved domain's starter when the file does not exist; falls back to `software` starter with a one-line advisory when the domain ships no starter; is a no-op when the file already exists.
- [ ] `/adev:hygiene` Validate Config Drift audit pass reports INFO findings for each registry entry whose value differs between `governance/validate.yaml` and the current domain starter.
- [ ] Parity test: a project that today has `governance/validate.yaml` overriding bundled defaults produces a byte-identical merged registry under the new loader (the overlay output equals what the new loader reads, modulo the no-overlay invariant).
- [ ] **Supersession round-trip:** `configurable-checks.spec.md` carries a `superseded-by-behaviors:` frontmatter field pointing at this spec's Behaviors 1, 2, 5; this spec's `supersedes-behaviors:` field points back. The round-trip is symmetric and machine-readable. (rev-2 SA-3 / CON-1 fix)
- [ ] **ADR-0003 amended** with a note documenting that the "Zero behavior change" guarantee has been narrowed for validate registry, referencing this spec and the `unified-gates` precedent. (rev-2 SA-6 fix)
- [ ] `configurable-checks.spec.md` has the partial-supersession annotation linking forward to this spec. The annotated Behaviors (1, 2, 5) and AC #1 are explicitly marked obsolete; other Behaviors remain in force.
- [ ] Migration tool processes a fixture pre-migration project: writes `governance/validate.yaml` from the correct domain starter; idempotent on re-run.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
- [ ] Validation charter Skills section updated to reflect the post-refactor model.

---
charter: reviewer-domain-fit
status: implemented
mode: refactor
kind: refactor
milestone:
created: 2026-08-18
revision: 2
charter-revision: 2
updated: 2026-08-18
tracker-ref: adev-plugin-j7pq.5
source-manifest:
  sha: "45e2c66"
  files:
    - lib/cli/domain.mjs
    - lib/domains/constants.mjs
    - providers/codex/skills/specify/SKILL.md
    - providers/opencode/skills/specify/SKILL.md
    - skills/specify/SKILL.md
    - templates/domains/software/specify-guidance.md
    - templates/spec-template.behavioral.md
    - templates/spec-template.refactor.md
    - tests/cli/domain.test.mjs
    - tests/domains/bundled-profiles.test.mjs
    - tests/lib/domains/constants.test.mjs
    - tests/skills/specify-domain-guidance.test.mjs
    - tests/templates/spec-template-error-code-header.test.mjs
  computed-at: "2026-08-18T23:00:11.641Z"
---

<!-- partial_schema: implement@1 -->

# Refactoring Spec: Domain Authoring Guidance

<!-- Refactoring spec within the reviewer-domain-fit charter.
     Extends the Live Spec format with current-state/target-state analysis and migration path.
     Parent Charter: .context-index/specs/features/reviewer-domain-fit/charter.md
     Scope: Phase 2 ("panel and prompts") of the reviewer-domain-fit initiative, narrowed to
     authoring guidance and templates only. Reviewer panel membership, prompt files, and
     review.yaml changes are covered by the sibling `reviewer-panel-retarget` spec, authored
     in parallel — this spec makes no changes there. -->

## Current State

<!-- Describe the code as it exists today. Be specific about files, patterns, and problems. -->

### Structure

| File | Role | Lines | Notes |
|------|------|-------|-------|
| `skills/specify/SKILL.md` | Step 4 interactive authoring prompts | 360-361, 382 | Hardcodes BEH-1/BEH-2 examples about dragging cards between Kanban columns and reindexing `position` (360-361); hardcodes `→ Any additional error cases? I have: lacks permission → 403, column not found → 404, conflict → 409` (382) |
| `templates/spec-template.behavioral.md` | Written spec template (`kind: behavioral`) | 79 | Error Cases table header is `\| Condition \| Expected Behavior \| HTTP Status / Error Code \|` |
| `templates/spec-template.refactor.md` | Written spec template (`kind: refactor`) | 145 | Same header, byte-identical |
| `lib/domains/constants.mjs` | Domain config type registry | 11-32 | `DOMAIN_CONFIG_TYPES` (8 entries) / `DOMAIN_CONFIG_FILENAMES` — no entry for authoring guidance |
| `lib/cli/domain.mjs` | `adev domain` CLI surface | 189-372 | Exposes `resolve`, `load-gates`, `load-reviewers`, `load-test-config`, `load-verification` — no verb reaches `loadDomainConfig` for a markdown-type authoring-guidance file |
| `lib/domains/domain-config.mjs` | `loadDomainConfig()` | 37-115 | Precedence engine (custom → bundled → one-level `extends`) this spec reuses unchanged |
| `providers/codex/skills/specify/SKILL.md`, `providers/opencode/skills/specify/SKILL.md` | Provider mirrors of `skills/specify/SKILL.md` | 360-361, 382 | Carry the identical hardcoded text, mechanically produced by `scripts/sync-provider-skills.mjs` — never hand-edited |
| `tests/lib/domains/constants.test.mjs` | Constants unit test | 18 | Asserts `DOMAIN_CONFIG_TYPES.size === 8` |

### Problems

1. Authoring guidance shown during every `/adev:specify` interview is web-application-shaped (HTTP status codes, drag-and-drop Kanban UI) regardless of what the target project actually is. For a zero-dependency Node CLI/library like this repo, none of it applies, and it is misleading precedent for authors filling in the Error Cases and Behaviors sections.
2. The problem is not confined to the interview prompt: the WRITTEN artifact itself bakes in HTTP semantics. Both `templates/spec-template.behavioral.md` and `templates/spec-template.refactor.md` — the files `resolveTemplate('spec', kind, domain)` actually writes into every new spec — carry an Error Cases column headed `HTTP Status / Error Code`. Fixing only the skill prose leaves this column in place for every future spec, in every domain.
3. There is no domain-config seam for authoring guidance. `DOMAIN_CONFIG_TYPES`'s 8 entries cover reviewers, gates, verification, gate-config, test-config, validate, and the two template overlays (`spec-template`, `charter-template`) — none of them represent "what should `/adev:specify` suggest while authoring this spec's Behaviors/Error Cases sections". A domain author who wants to replace the hardcoded prose has nowhere to put an override: skill extensions may only APPEND instructions, never replace them (per the charter's Current State finding), so the web-shaped guidance sits in the one place — skill body text — that cannot vary by domain.
4. The hardcoded prose is duplicated verbatim across the plugin skill and both provider mirrors (`providers/codex/`, `providers/opencode/`). A fix applied only to `skills/specify/SKILL.md` leaves the mirrors stale until the next mechanical sync; the fix must be paired with that regeneration step, not left to happen incidentally.

### Dependencies

- `resolveTemplate()` (`lib/template-resolution.mjs`) reads the SAME two template files this spec edits (`templates/spec-template.behavioral.md`, `templates/spec-template.refactor.md`) to write every new spec. This spec changes only the Error Cases header text inside those files; it does not touch `resolveTemplate`'s discovery logic, its `extensions/<domain>/domain/` → `templates/` search order, or the `template-resolution.spec.md` contract.
- `lib/domains/domain-config.mjs::loadDomainConfig` is reused completely unmodified — only the set of valid `configType` values it accepts grows by one.
- `scripts/sync-provider-skills.mjs` is the sole channel that produces `providers/*/skills/specify/SKILL.md`; this spec's migration path depends on it being re-run after the skill edit, not on any manual provider edit.
- `tests/lib/domains/constants.test.mjs` pins the current 8-entry `DOMAIN_CONFIG_TYPES` cardinality; this spec's change to that set must land together with the test update, in the same commit, per the charter's evidence that silent breaks are unacceptable.

## Target State

<!-- Describe what the code should look like after refactoring. -->

### Structure

| File | Role | Notes |
|------|------|-------|
| `lib/domains/constants.mjs` | Domain config type registry | Adds `'specify-guidance'` → `'specify-guidance.md'` to `DOMAIN_CONFIG_TYPES` / `DOMAIN_CONFIG_FILENAMES`. NOT added to `STRUCTURED_CONFIG_TYPES` — it is markdown prose, loaded as a raw string exactly like `spec-template` / `charter-template` are today |
| `lib/cli/domain.mjs` | `adev domain` CLI surface | Adds `load-guidance` subcommand: `adev domain load-guidance --module <slug> [--charter <path>]` → stdout `{ domain, guidance, warnings }`, `guidance` is the raw markdown string or `null` |
| `templates/domains/software/specify-guidance.md` | Bundled default guidance | New file: CLI/library-appropriate authoring examples (exit codes / thrown error codes, CLI verb-and-flag behavior examples) |
| `skills/specify/SKILL.md` | Step 4 prompts | Calls `adev domain load-guidance`; renders the returned guidance as the source of illustrative examples, or an explicit empty-state message when `guidance` is `null` |
| `providers/codex/skills/specify/SKILL.md`, `providers/opencode/skills/specify/SKILL.md` | Provider mirrors | Regenerated via `node scripts/sync-provider-skills.mjs`; never hand-edited |
| `templates/spec-template.behavioral.md`, `templates/spec-template.refactor.md` | Written spec templates | Error Cases column header renamed `HTTP Status / Error Code` → `Error Code` |
| `tests/lib/domains/constants.test.mjs` | Constants unit test | Updated to assert the new 9-entry set and the `specify-guidance` mapping |

### Improvements

1. Authoring guidance becomes domain-owned data instead of skill-hardcoded prose: any domain (e.g. `web-service`, or a project-installed custom domain) can ship its own `specify-guidance.md` without touching `skills/specify/SKILL.md`.
2. The written artifact is domain-neutral by default: the Error Cases header no longer presumes HTTP status codes exist, for any domain, closing the gap that fixing skill prose alone would have left open.
3. `specify-guidance` slots into the identical resolution precedence (project-installed → bundled → one-level `extends`) already used by `reviewers`/`gates`, so the mental model for "how do I override domain config X" stays uniform across the whole `DOMAIN_CONFIG_TYPES` set — no new precedence rule to learn.
4. Silence is replaced with an explicit statement: a project whose resolved domain ships no guidance sees a stated fallback message, never unexplained generic prompts with no acknowledgment that something was expected but absent.

## Changes Catalog

<!-- OpenSpec-style enumeration of what this refactor changes, classified by
     the kind of change. Additive to Migration Path: the catalog answers
     "what's different" at a glance; the path answers "how do we get there safely". -->

### ADDED

- `specify-guidance` domain config type in `DOMAIN_CONFIG_TYPES` / `DOMAIN_CONFIG_FILENAMES` (`lib/domains/constants.mjs`) — lets any domain ship authoring guidance through the existing `loadDomainConfig` precedence
- `adev domain load-guidance --module <slug> [--charter <path>]` CLI subcommand (`lib/cli/domain.mjs`) — the only legal seam by which a markdown-only SKILL.md can reach `loadDomainConfig` for this new type
- `templates/domains/software/specify-guidance.md` — bundled default authoring guidance, CLI/library-shaped
- Explicit empty-state message in `skills/specify/SKILL.md` Step 4 for when the resolved domain ships no guidance

### MODIFIED

- `skills/specify/SKILL.md` Step 4 — the hardcoded Behaviors example (360-361) and hardcoded Error Cases prompt (382) are replaced by the loaded-guidance flow
- `providers/codex/skills/specify/SKILL.md`, `providers/opencode/skills/specify/SKILL.md` — regenerated mirrors of the above
- `templates/spec-template.behavioral.md:79`, `templates/spec-template.refactor.md:145` — Error Cases header text
- `tests/lib/domains/constants.test.mjs` — set-size assertion (8 → 9) and new mapping assertions

### REMOVED

- Hardcoded `"lacks permission → 403, column not found → 404, conflict → 409"` prompt text from `skills/specify/SKILL.md` and its two provider mirrors
- Hardcoded BEH-1/BEH-2 Kanban drag-and-drop example text from `skills/specify/SKILL.md` and its two provider mirrors

## Migration Path

<!-- Step-by-step plan for getting from current to target state.
     Each step must leave the system in a working state (all tests pass).
     This is the critical section: a bad migration path causes regressions. -->

### Step 1: Extend the domain-config type registry

- **What:** Add `'specify-guidance'` to `DOMAIN_CONFIG_TYPES` in `lib/domains/constants.mjs` and `['specify-guidance', 'specify-guidance.md']` to `DOMAIN_CONFIG_FILENAMES`. Do NOT add it to `STRUCTURED_CONFIG_TYPES` — it is markdown prose, loaded as a raw string exactly like `spec-template` / `charter-template` are today.
- **Why first:** Every downstream step (CLI verb, bundled file, skill wiring) depends on the type existing in the closed set; `loadDomainConfig` returns `null` immediately (Behavior 6, `lib/domains/domain-config.mjs:63-65`) for any `configType` not in `DOMAIN_CONFIG_TYPES`.
- **Risk:** Low — additive to a `Set`/`Map`; no existing entry's filename or structured/unstructured classification changes.
- **Verification:** `tests/lib/domains/constants.test.mjs` (updated in Step 7) passes with the new 9-entry set.

### Step 2: Add the `load-guidance` CLI subcommand

- **What:** Add a `runLoadGuidance({ projectRoot, manifest, values })` function to `lib/cli/domain.mjs`, modeled on the existing `runLoadTestConfig` shape — resolve the active domain via `resolveActiveDomain`, call `loadDomainConfig(domain.resolved_domain, 'specify-guidance', absRoot, PLUGIN_ROOT)`, and print `{ domain, guidance, warnings: [] }` to stdout, where `guidance` is the raw string or `null`. Wire it into the `run()` dispatch table alongside `resolve` / `load-gates` / `load-reviewers` / `load-test-config` / `load-verification`, and document it in `help()`.
- **Why next:** The skill has no other sanctioned way to reach `loadDomainConfig` — SKILL.md files cannot contain inline Node (per this repo's `cli-driver-surface` anti-pattern), so a CLI verb is the only legal seam.
- **Risk:** Low — new subcommand; no existing subcommand's flags or stdout shape changes. `load-gates` / `load-reviewers` / `load-test-config` / `load-verification` are untouched.
- **Verification:** A new CLI test asserts `adev domain load-guidance --module <slug>` returns `{ domain, guidance: null, warnings: [] }` when no domain ships the file, and returns the bundled string as `guidance` once Step 3 ships it.

### Step 3: Ship the bundled default

- **What:** Author `templates/domains/software/specify-guidance.md` with CLI/library-appropriate authoring examples — error cases framed as thrown error codes / process exit codes (not HTTP status codes), and 1-2 BEH-style behavior examples about CLI verb/flag semantics (not drag-and-drop UI).
- **Why next:** Without a bundled default, every project (including this one) would immediately hit the Step 4 empty-state path — correct, but untested against real content until this file exists.
- **Risk:** Low — new file, resolved only through the new `specify-guidance` type; no existing bundled domain file is touched.
- **Verification:** `adev domain load-guidance --module <any-software-domain-module>` returns this file's content as `guidance`.

### Step 4: Wire the skill to load guidance and render the explicit empty state

- **What:** In `skills/specify/SKILL.md` Step 4, replace the hardcoded Behaviors example (360-361) and the hardcoded Error Cases prompt (382) with: call `adev domain load-guidance --module <charter-module> [--charter <charter-path>]`; if `guidance` is non-null, render its content as the source of illustrative examples for both the Behaviors and Error Cases prompts; if `guidance` is `null`, print an explicit message — *"No domain-specific authoring guidance available for this project; falling back to generic prompts."* — and fall back to domain-neutral generic prompts (no HTTP codes, no drag-and-drop) rather than silence.
- **Why next:** This is the actual behavior change the charter's Phase 2 acceptance criterion targets; Steps 1-3 only build the plumbing it depends on.
- **Risk:** Medium — this is the user-facing prompt text every future spec-authoring session sees; a mis-wired empty-state check (e.g. treating `""` and `null` differently, or checking truthiness against a JSON string wrapper instead of the parsed field) could silently reintroduce the old hardcoded text or silently show nothing. Mitigated by BEH-1/BEH-2 and the acceptance criteria below.
- **Verification:** A run of `/adev:specify` against a scratch project with no `specify-guidance.md` anywhere shows the explicit empty-state line, never silence; a run against this repo (bundled `software` default present) shows the new CLI-shaped examples, never the old HTTP/drag-and-drop text.

### Step 5: Regenerate provider mirrors

- **What:** Run `node scripts/sync-provider-skills.mjs` after Step 4's edit lands, so `providers/codex/skills/specify/SKILL.md` and `providers/opencode/skills/specify/SKILL.md` pick up the same change mechanically.
- **Why next:** The mirrors are never hand-edited (per `scripts/sync-provider-skills.mjs`'s own docstring: "The main skills/ directory is the source of truth"); running this immediately after Step 4 prevents the mirrors drifting out of sync with the fixed skill for however long the branch stays open.
- **Risk:** Low — mechanical regeneration; the script's `PROVIDER_EXCLUDES` list is empty for both `opencode` and `codex` on the `specify` skill today.
- **Verification:** `grep -rn "column not found → 404\|drags a card" providers/*/skills/specify/SKILL.md` returns no matches; `tests/sync/provider-skill-parity.test.mjs` passes. (A bare `drag` or `40[0-9]` substring match is deliberately NOT used here — both mirrors legitimately retain unrelated pre-existing text using those substrings: `"add drag-and-drop reordering"` as a sample module hint, `"task-boards — Task management with drag-and-drop boards"`, and `"Existing spec: drag-and-drop-reordering.md"`, none of which this migration touches. The check must target the specific removed phrasing, not the word.)

### Step 6: Update the two spec-template Error Cases headers

- **What:** Change `| Condition | Expected Behavior | HTTP Status / Error Code |` to `| Condition | Expected Behavior | Error Code |` in both `templates/spec-template.behavioral.md:79` and `templates/spec-template.refactor.md:145`.
- **Why next:** Independent of Steps 1-5 (different discovery path — `resolveTemplate`, not `loadDomainConfig`), but must land in the same change per the charter's explicit criterion: "Removing examples from the skill alone does not satisfy this phase."
- **Risk:** Low — header-only text change; the column's semantic contents (spec authors filling in whatever their domain's error-code shape is) are unaffected, and no code parses this header string.
- **Verification:** `grep -rn "HTTP Status" templates/spec-template.*.md` returns no matches.

### Step 7: Update the constants test

- **What:** Bump `tests/lib/domains/constants.test.mjs`'s `DOMAIN_CONFIG_TYPES.size` assertion from 8 to 9, and add assertions that `DOMAIN_CONFIG_TYPES.has('specify-guidance')` is true and `DOMAIN_CONFIG_FILENAMES.get('specify-guidance') === 'specify-guidance.md'`.
- **Why last:** This test is the single place that pins the set's cardinality; updating it in the same change as Step 1 (rather than as an afterthought) keeps the "explicit migration step, not a surprise break" property the charter's evidence requires.
- **Risk:** Low — only the assertion this change directly affects is touched; every other existing assertion in the file is untouched.
- **Verification:** `npm test` passes with the updated assertions; no remaining reference to the old 8-entry expectation exists anywhere in the test suite.

## Invariants

<!-- Properties that must remain true throughout the entire migration.
     Every migration step must preserve these. They are your safety net. -->

- [x] All existing tests continue to pass at every step, with the single explicit exception of `tests/lib/domains/constants.test.mjs`, which is updated in the SAME change as Step 1/7 — never left failing between steps
- [x] Public API contracts do not change: existing `adev domain resolve|load-gates|load-reviewers|load-test-config|load-verification` subcommands keep their current flags and stdout shapes byte-for-byte
- [x] No data loss or corruption during migration — this is a pure-addition change to `DOMAIN_CONFIG_TYPES` / `DOMAIN_CONFIG_FILENAMES`; no existing entry's filename, structured/unstructured classification, or resolution precedence changes
- [x] `resolveTemplate()`'s discovery path (`extensions/<domain>/domain/` → `templates/`, kind-suffixed filenames) is untouched; `template-resolution.spec.md`'s existing Behaviors 3, 4, and 8 are unaffected by this spec
- [x] Specs already authored before this change are not retroactively rewritten — the Error Cases header change affects the TEMPLATE, not any already-written spec's already-filled-in table
- [x] Provider mirrors are only ever produced by `scripts/sync-provider-skills.mjs`; no manual edit is made to `providers/*/skills/specify/SKILL.md`
- [x] No reviewer panel membership, prompt file, or `review.yaml` change is introduced — that is the sibling `reviewer-panel-retarget` spec's exclusive scope

## Behavioral Contract

<!-- Same as a standard Live Spec: define the target behavior. -->

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `/adev:specify` reaches Step 4 for a project whose resolved domain ships `specify-guidance.md` at any resolution level (project-installed `.context-index/domains/<name>/`, bundled `templates/domains/<name>/`, or a one-level `extends` parent) **then** `adev domain load-guidance --module <slug>` returns that file's content as `guidance`, and the skill renders it as the source of illustrative Behaviors/Error Cases examples instead of any hardcoded text.
- **BEH-2** — **When** the resolved domain ships no `specify-guidance.md` at any resolution level **then** `adev domain load-guidance` returns `guidance: null`, and the skill prints the explicit empty-state message and falls back to domain-neutral generic prompts containing no HTTP status codes and no drag-and-drop language.
- **BEH-3** — **When** a custom (non-bundled-name) domain declares `extends: <bundled-domain>` in its `domain.yaml` AND ships its own `.context-index/domains/<custom-name>/specify-guidance.md` **then** `loadDomainConfig` returns the custom domain's own file directly, without ever reading the bundled parent's `specify-guidance.md` — the same precedence `loadDomainConfig` already applies to `reviewers.yaml` / `gates.yaml`. (This is distinct from attempting to override the bundled `software` domain's OWN directory: `.context-index/domains/software/` existing at all is unconditionally rejected with `BUNDLED_OVERRIDE_BLOCKED` — see the Error Cases table — so "wins over the bundled default" only ever applies to a differently-named custom domain, never to `software` itself.)
- **BEH-4** — **When** a custom domain declares `extends: <bundled-domain>` in its `domain.yaml` and ships no `specify-guidance.md` of its own **then** `loadDomainConfig` falls through to the bundled parent's `specify-guidance.md`, one level deep, exactly as it already does for `reviewers` / `gates`.
- **BEH-5** — **When** a new spec is written via `resolveTemplate('spec', 'behavioral'|'refactor', domain)` **then** its Error Cases table header reads `Error Code`, never `HTTP Status / Error Code`, regardless of which domain the spec belongs to.
- **BEH-6** — **When** `scripts/sync-provider-skills.mjs` runs after `skills/specify/SKILL.md` is edited **then** `providers/codex/skills/specify/SKILL.md` and `providers/opencode/skills/specify/SKILL.md` carry the same Step 4 content, byte-for-byte apart from the provider-specific description suffix.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--module` omitted from `adev domain load-guidance` | CLI prints usage plus "missing --module" to stderr, exits 1 | (argument error, no code) |
| Resolved domain name fails `DOMAIN_NAME_PATTERN` | `loadDomainConfig` throws before any file read; CLI prints the message to stderr, exits 1 | `INVALID_DOMAIN_ARG` |
| `.context-index/domains/software/specify-guidance.md` exists (project shadowing the bundled `software` domain without `extends`) | `loadDomainConfig` throws before returning any content; CLI exits 1 | `BUNDLED_OVERRIDE_BLOCKED` |
| A resolved `specify-guidance.md` exceeds `MAX_DOMAIN_CONFIG_SIZE` (512 KB) | CLI prints the message to stderr, exits 1; no partial content is returned | `DOMAIN_CONFIG_TOO_LARGE` |
| No `specify-guidance.md` exists at any resolution level (custom, bundled, or one-level `extends` parent) | `loadDomainConfig` returns `null`; CLI exits 0 with `guidance: null`; skill prints the explicit empty-state message | (not an error — a documented empty state, BEH-2) |

## System Constitution Reference

- **Principle 1 — Minimize external dependencies.** No new runtime dependency is introduced; the new CLI subcommand and bundled markdown file use only the Node built-ins and internal modules `lib/cli/domain.mjs` already imports.
- **Principle 2 — Skills are primarily markdown.** The fix routes through a new CLI verb (`adev domain load-guidance`) rather than inline Node inside `skills/specify/SKILL.md`, keeping the skill markdown-only per this repo's `cli-driver-surface` anti-pattern.
- **Principle 3 — Pure ESM.** The new function in `lib/cli/domain.mjs` is `.mjs`, ESM, consistent with the rest of the file; no CommonJS is introduced.

## Acceptance Criteria

- [x] `skills/specify/SKILL.md` contains no HTTP status codes and no drag-and-drop examples — `grep -n "column not found → 404\|drags a card" skills/specify/SKILL.md` returns no matches. (Scoped to the specific removed phrasing, not a bare `drag`/`40[0-9]` substring: three pre-existing, unrelated lines legitimately retain the word "drag" — a sample module hint, a charter-example capability name, and an unrelated spec filename in Duplicate Detection prose — and none of them are touched by this migration.)
- [x] `providers/codex/skills/specify/SKILL.md` and `providers/opencode/skills/specify/SKILL.md` likewise contain no HTTP status codes and no drag-and-drop examples (same scoped check as above), produced only via `node scripts/sync-provider-skills.mjs` regeneration — never hand-edited
- [x] `templates/spec-template.behavioral.md` and `templates/spec-template.refactor.md` carry no `HTTP Status` column; their Error Cases column header reads `Error Code`. Removing examples from the skill alone does not satisfy this criterion — both templates must be verified independently
- [x] `specify-guidance` is present in `DOMAIN_CONFIG_TYPES` and `DOMAIN_CONFIG_FILENAMES` (mapped to `specify-guidance.md`), and absent from `STRUCTURED_CONFIG_TYPES`
- [x] `adev domain load-guidance --module <slug> [--charter <path>]` exists, resolves the domain via the same precedence as `resolve` / `load-reviewers`, and returns `{ domain, guidance, warnings }` on stdout with exit 0
- [x] `templates/domains/software/specify-guidance.md` exists and its content is domain-appropriate (no HTTP status codes, no UI drag-and-drop language)
- [x] When a resolved domain ships `specify-guidance.md` (bundled, project-installed, or via one-level `extends`), `/adev:specify` Step 4 renders that content as its Behaviors/Error Cases examples (BEH-1, BEH-3, BEH-4)
- [x] When no domain ships `specify-guidance.md`, `/adev:specify` renders an explicit empty-state message (not silence) and falls back to domain-neutral generic prompts (BEH-2)
- [x] `tests/lib/domains/constants.test.mjs` asserts the updated 9-entry `DOMAIN_CONFIG_TYPES` set and the new `specify-guidance` → `specify-guidance.md` mapping
- [x] All existing tests continue to pass at every migration step except the deliberately-updated constants test, which is updated in the same change
- [x] `resolveTemplate()`'s discovery path and `template-resolution.spec.md`'s existing Behaviors 3, 4, and 8 are unaffected — verified by the existing template-resolution tests passing unmodified
- [x] No reviewer panel membership, prompt file, or `review.yaml` change is introduced by this spec (scope boundary with the sibling `reviewer-panel-retarget` spec)
- [x] `npm test` passes
- [x] No constitutional violations

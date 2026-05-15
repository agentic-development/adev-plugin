# Spec Taxonomy Audit — Mode Discriminator and Template Matrix

**Date:** 2026-05-14
**Scope:** All 178 `.spec.md` files under `.context-index/specs/`, plus the bundled `software` profile and the `data-engineering` / `process-automation` extensions.
**Status:** Findings + scope recommendation. Drives epic-73 *Spec and charter taxonomy: modes and kinds*.
**Companion artifact:** `.context-index/research/charter-format-audit.md` — same lens applied at the charter layer. The two taxonomies are co-designed under one ADR (Option B: unified framework primitive).

## Problem

The spec library uses a **single template** (`.live-spec-template.md`) for what are actually **six distinct kinds of intent**. Authors compensate by stretching the behavioral-contract shape (preconditions / behaviors / postconditions / error cases) over deliverables that don't fit it, producing:

- **Charter junk drawers** — heterogeneous specs grouped only by proximity (e.g., `domain-extensions/` holds 1 behavioral spec, 2 artifact-shaped specs, and 1 action).
- **Fragmentation** — single capabilities split across many specs (`test-strategies` 19, `agent-reliable-state-artifacts` 9, `heuristics` 11) because each phase or sub-component gets its own "spec" even when the work is one effort.
- **Post-hoc status labelling** — 0 specs in `draft`, ~150 in `validated`. Status is stamped after the fact rather than used as a prospective gate.
- **Refactor mode underdeployed** — only 3 of ~15 candidates use `mode: refactor` despite containing current-state/target-state language.
- **Skill-naming collapsed with feature-naming** — `adev-vision-skill.spec.md` lives next to `bundled-domain-profiles.spec.md` in the same folder, with the same template, despite specifying very different things.

## The six modes

| Mode | What it specs | Section shape that fits |
|---|---|---|
| `behavioral` (default) | Runtime behavior of a feature | preconditions / behaviors / postconditions / error cases |
| `refactor` | Migration from current to target state | current state / target state / migration steps / invariants |
| `action` | One-shot operational task (cleanup, backfill, migration tool) | trigger / procedure / idempotency / rollback / completion check |
| `skill` | `/adev:*` CLI surface | invocation modes / arguments / output contract / failure modes |
| `integration` | Wiring two skills or modules together | participants / interaction contract / state machine / error propagation |
| `artifact` | Static deliverable: package, template, fixture, schema | structural shape / required files / consumers (no pre/post — artifacts don't *do* anything, they *are* something) |

Today only `behavioral` (default) and `refactor` have templates. The other four are forced into the behavioral shape.

## Worked example: `domain-extensions/`

This charter is the cleanest stress test. Four specs, three intents:

| Spec | Actually is | Today's status | Correct `mode:` |
|---|---|---|---|
| `git-subdirectory-fragment.spec.md` | True behavioral feature (enhances `resolveGit()` to parse `repo#path`) | implemented | `behavioral` |
| `data-engineering-extension.spec.md` | Describes a static content package's shape | validated | `artifact` |
| `process-automation-extension.spec.md` | Same as above | validated | `artifact` |
| `bundled-templates-cleanup.spec.md` | One-shot file removal + constant update | implemented | `action` |

The charter itself reads, on closer inspection, as a **refactor effort** ("extract bundled domain profiles into installable extension packages, then delete the originals"). If `mode: refactor` had existed culturally when the work started, the four specs would likely have been one refactor spec plus one behavioral spec for `git-subdirectory-fragment`.

## Application to downstream projects (e.g., data-engineering)

The taxonomy generalizes cleanly:

| Mode | DE-project example |
|---|---|
| `behavioral` | "When orders arrive in raw layer, `fact_orders` reflects them within 5 min with valid FKs" |
| `artifact` | "`fact_orders` table exists with these 14 columns, this PK, this partition key" — or "this dbt model file" |
| `refactor` | "Migrate orchestration Airflow → Dagster" or "evolve `dim_customer` schema v1 → v2" |
| `action` | "Backfill 90 days of orders from S3 archive" or "drop `_staging_v1` after 30-day quarantine" |
| `integration` | "Kafka `orders` → Snowflake `raw.orders` via Airbyte" |
| `skill` | Rare in DE projects — applies only when the project builds custom `/adev:*` skills |

What adev currently ships for a DE project is *only* the behavioral template with DE-flavored sections appended (data quality expectations, output schema, freshness SLA). The other five modes don't exist as DE-specific templates, so DE authors hit the same one-template-for-six-intents problem this audit identified in adev-plugin's own repo.

**Implication:** domain extensions should provide a **matrix** of `spec-template.<mode>.md` files (kind × domain), not just one template.

## Concrete inventory issues (informs Layer 2)

| Charter | Spec count | Issue |
|---|---|---|
| `test-strategies/` | 19 | Single TDD-profiles system over-decomposed; merge into ~3 specs (strategy-types-and-detection, manifest-schema-extension, lifecycle-integration) |
| `agent-reliable-state-artifacts/` | 9 | Reads like a task breakdown of one migration; split into 4 (json-issue-board, lifecycle-event-log, state-artifact-migration with `mode: action`, lifecycle-skill-api-updates) |
| `heuristics/` | 11 | Fragmented by lifecycle phase; consolidate into 3 (store-and-api, extraction-lifecycle, injection-lifecycle) |
| `domain-extensions/` | 4 | Retag with correct modes (above table) |
| `strategic-planning/` | 8 | Skill-naming (vision, roadmap) mixed with domain-model extensions; some already superseded but not pruned |
| `cli/`, `hooks/`, `maintenance/`, `user-docs/` (+10 more) | 0 specs each | Charters without specs — not necessarily wrong, but flags coverage gaps |
| `CONSISTENCY-REVIEW.md` | (n/a) | Stale (2026-03-31), covers only 15 of the now-178 specs; supersede or delete |

## Recommended three-layer scope

### Layer 1 — Framework primitive (v1 epic, this work)

- ADR landing the six-mode taxonomy as a constitutional decision (templates are part of the plugin's public API).
- Add four new templates: `spec-template.action.md`, `spec-template.skill.md`, `spec-template.integration.md`, `spec-template.artifact.md`.
- Update `.live-spec-template.md` frontmatter to require `mode:` (default `behavioral`).
- Update `.refactoring-spec-template.md` to use `mode: refactor` consistently.
- Teach `/adev:specify` to ask for mode up-front and route to the matching template.
- Light updates to `/adev:plan`, `/adev:review-specs`, `/adev:hygiene` where mode-awareness is genuinely useful (don't force this).
- **Smoke validation:** author one spec in each new mode before declaring v1 done.

### Layer 2 — Adev-plugin self-cleanup (follow-up)

- Backfill `mode:` on the 178 existing specs (most are `behavioral`).
- Split junk-drawer charters per the inventory table above.
- Move action-mode specs (`bundled-templates-cleanup`, `one-shot-migration-tool`) out of feature charters — into `.context-index/actions/` or an `operations` charter.
- Mark superseded strategic-planning specs correctly.
- Supersede `CONSISTENCY-REVIEW.md`.

### Layer 3 — Domain extension matrix (follow-up)

- Extend `data-engineering` with per-mode spec templates (artifact for schemas, action for backfills, refactor for schema evolution, integration for source-to-sink wiring).
- Extend `process-automation` similarly.
- Update bundled `software` profile to ship all six mode templates as the baseline.
- Document the (kind × domain) matrix pattern for future extension authors.

## Acceptance for v1 (Layer 1)

- [ ] ADR landed defining the six modes and their templates.
- [ ] Four new templates exist and are conventionally consistent with the live-spec template.
- [ ] `/adev:specify` prompts for mode and routes correctly.
- [ ] At least one spec authored in each new mode (smoke validation).
- [ ] Constitution updated if needed.

## Out of scope for v1

- Backfilling existing 178 specs (Layer 2).
- Restructuring junk-drawer charters (Layer 2).
- Domain extension template matrix beyond software default (Layer 3).
- Migrating in-flight charters to the new mode discriminator (handled per-charter as opportunities arise).

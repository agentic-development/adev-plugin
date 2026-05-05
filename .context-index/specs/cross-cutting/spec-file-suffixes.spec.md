---
mode: refactor
status: implemented
risk_level: medium
revision: 2
created: 2026-05-04
updated: 2026-05-04
affects: [maintenance, setup, implementation, validation, planning, design, assessment, strategic-planning]
---

# Cross-Cutting Refactoring Spec: Standardize Spec File Suffixes

## Problem

The `.context-index/specs/` directory mixes live specs, validation reports, research artifacts, test findings, and consistency reviews — all using `.md` with no distinguishing suffix. This forces every scanning skill (hygiene, status, codehealth, reconcile) to maintain a growing negative exclusion list (`charter.md`, `*.plan.md`, `*.review.md`, `*-validation.md`, `*.validate.md`, `*-research.md`, `*-summary.md`, `*-findings.md`, `CONSISTENCY-REVIEW.md`). The list has already required 3 emergency patches in a single session when miscounts surfaced.

## Current State

| Artifact type | Current convention | Count | Suffix consistent? |
|---------------|-------------------|-------|-------------------|
| Live specs | `<name>.md` | 132 | No suffix — the "default" |
| Plans | `<name>.plan.md` | 58 | Yes |
| Reviews | `<name>.review.md` | 106 | Yes |
| Validation reports | `<name>-validation.md` OR `<name>.validate.md` | 42 | No — two conventions |
| Charters | `charter.md` | 32 | Yes (fixed name) |
| Research artifacts | `<name>-research.md` | 1 | Inconsistent with dot-suffix pattern |
| Other non-spec | `*-summary.md`, `*-findings.md`, `CONSISTENCY-REVIEW.md` | 3 | Ad-hoc |

**Core issue:** Live specs have no suffix, making positive matching impossible. Every tool must enumerate what specs are NOT instead of what they ARE.

## Target State

| Artifact type | New convention | Glob pattern |
|---------------|---------------|-------------|
| Live specs | `<name>.spec.md` | `*.spec.md` |
| Plans | `<name>.plan.md` | `*.plan.md` (unchanged) |
| Reviews | `<name>.review.md` | `*.review.md` (unchanged) |
| Validation reports | `<name>.validate.md` | `*.validate.md` (normalized) |
| Charters | `charter.md` | `charter.md` (unchanged) |

Non-spec artifacts (research, summaries, findings, consistency reviews) keep their current names — they are rare one-off files, not a recurring naming problem.

**Out of scope:** `product.md` (project-level identity doc, not a live spec), `charter.md` (fixed name per convention), root-level files like `CONSISTENCY-REVIEW.md` (one-off artifacts). These files are not live specs and do not get the `.spec.md` suffix.

**Filtering simplification:** Scanning for specs becomes `*.spec.md` instead of "all `.md` files except these 9 exclusion patterns."

## Migration Path

### Step 1: Rename live specs (132 files)

For each live spec file `<name>.md` under `specs/features/` and `specs/cross-cutting/`:
- Rename to `<name>.spec.md`
- Risk: Low — file renames only, no content changes
- Verify: All files renamed, no orphaned references

### Step 2: Normalize validation reports (42 files)

- Rename `<name>-validation.md` to `<name>.validate.md` (39 files)
- Keep existing `<name>.validate.md` files as-is (3 files, already correct)
- Risk: Low — validation reports are output artifacts, rarely referenced by path
- Convention rationale: `.validate.md` matches the short-type pattern of `.plan.md`, `.review.md`, `.spec.md`

### Step 3: Update cross-references in specs, plans, and reviews

- Plans reference specs in frontmatter and body text
- Reviews reference specs in frontmatter (`last-reviewed-revision`, spec path)
- Specs reference other specs in `charter:` and dependency fields
- Risk: Medium — must catch all path references

### Step 4: Update SKILL.md files (skills/ and providers/)

All skills that scan or reference spec files need updated glob patterns:
- `skills/hygiene/SKILL.md` — spec scanning exclusion lists become `*.spec.md` inclusion
- `skills/status/SKILL.md` — same
- `skills/specify/SKILL.md` — output file naming
- `skills/plan/SKILL.md` — spec path references
- `skills/implement/SKILL.md` — spec path references
- `skills/validate/SKILL.md` — validation report naming
- `skills/review-specs/SKILL.md` — spec scanning
- `skills/reconcile/SKILL.md` — spec scanning
- `skills/build/SKILL.md` — spec references
- `skills/debug/SKILL.md` — spec references
- `skills/retro/SKILL.md` — validation report glob patterns
- Provider copies (codex/, opencode/) — mirror ALL changes from above skills
- Risk: Medium — many files but mechanical changes

### Step 5: Update templates

- `templates/live-spec-template.md` — rename or document new convention
- `templates/refactoring-spec-template.md` — same
- `templates/manifest-template.yaml` — update any spec path examples
- Risk: Low

### Step 6: Update source code

- `lib/source-manifest.mjs` — `.endsWith(".md")` filter (line ~145) must change to `.endsWith(".spec.md")` or equivalent
- `lib/spec-drift.mjs` — spec path patterns
- `lib/meta-tools.mjs` — spec path patterns
- `lib/reality-check.mjs` — spec path patterns
- `hooks/sync-trigger.sh` — spec path detection
- Issue board `tasks.md` — Spec-Ref column paths
- Risk: Medium — must grep exhaustively

### Step 7: Update git trailer convention

- Constitution `Commit Trailers` section — example paths use `.spec.md`
- CLAUDE.md — synced from constitution
- Risk: Low — documentation only

## Invariants

1. All existing tests continue to pass at every step
2. No spec content changes — only renames and reference updates
3. Git history preserved via `git mv` (not delete + create)
4. Every path reference updated — no broken links after migration
5. Filtering logic in skills uses positive matching (`*.spec.md`) not negative exclusion lists

## Behavioral Contract

1. **When** a skill scans for live specs **then** it uses the glob `*.spec.md` instead of a negative exclusion list.
2. **When** `/adev:specify` creates a new spec **then** the file is named `<slug>.spec.md`.
3. **When** `/adev:validate` creates a validation report **then** the file is named `<slug>.validate.md`.
4. **When** a commit trailer references a spec **then** the path uses `.spec.md` suffix.
5. **When** a plan or review references its parent spec **then** the path uses `.spec.md` suffix.

## Acceptance Criteria

- [ ] All 132 live specs renamed to `.spec.md` (features/ and cross-cutting/)
- [ ] All 39 `*-validation.md` reports renamed to `.validate.md`
- [ ] All SKILL.md spec scanning uses `*.spec.md` glob (positive match)
- [ ] All provider skill copies (codex/, opencode/) updated to match
- [ ] All cross-references in plans, reviews, and issue board updated
- [ ] Templates updated with new naming convention
- [ ] Source code spec path patterns updated (source-manifest, spec-drift, meta-tools, reality-check)
- [ ] Constitution and CLAUDE.md commit trailer examples updated
- [ ] `npm test` passes (1669 tests)
- [ ] No broken spec path references (verified by grep)
- [ ] `git status` shows only renames, not new+deleted files (git mv verification)

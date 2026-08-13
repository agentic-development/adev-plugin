# Implementation Plan: Test Helper Inventory

> **Methodology:** adev
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Spec:** .context-index/specs/features/test-strategies/test-helper-inventory.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-13)
> **Platform:** Node.js (CLI/plugin, no framework), JavaScript ESM, node:test, npm

**Goal:** Give every contextless write-test and implement subagent a deterministic,
language-agnostic list of the shared test helpers, fixtures, setup modules, and golden TEST
samples that already exist in the project — so shared fixtures accumulate instead of being
re-derived (issue-556).

**Architecture:** One pure-logic module (`lib/test-strategies/helper-inventory.mjs`) holds the
language registry, the pruning tree walk, regex symbol extraction, sample classification,
deterministic ordering, budget-capped rendering, and normalized-name duplicate detection. A thin
driver (`lib/cli/test-helpers.mjs`, registered in `cli/index.mjs`'s `VERB_REGISTRY`) exposes it
as `adev test-helpers inventory` and `adev test-helpers check`. `skills/write-test/SKILL.md` and
`skills/implement/SKILL.md` name the verb — no inline Node, no `javascript` fence — following
the Heuristics-injection idiom already in `implement` Step 2a. The module reuses `matchGlob()`
from `lib/test-strategies/manifest.mjs`; zero new dependencies.

---

## File Structure

**Create:**
- `lib/test-strategies/helper-inventory.mjs` — registry, walk, extraction, samples, render, duplicate check
- `lib/cli/test-helpers.mjs` — `run`/`help` driver for `inventory` and `check` (no `LIFECYCLE_STEP`)
- `tests/lib/test-strategies/helper-inventory.test.mjs` — unit tests for the lib module
- `tests/cli/test-helpers.test.mjs` — subprocess tests for the CLI verb
- `tests/skills/test-helper-inventory-injection.test.mjs` — injection + docs coverage assertions

**Modify:**
- `cli/index.mjs` — register `test-helpers` in `VERB_REGISTRY`
- `skills/write-test/SKILL.md` — Step 3a inventory step; Step 4 dispatch bullet; advisory `check` before Handoff Block
- `skills/implement/SKILL.md` — Step 2a item; Step 2c prompt-section list
- `docs/cli-reference.md` — summary-table row + `### test-helpers` section
- `templates/sample-template.md` — `Sample kind` field
- `skills/sample/SKILL.md` — `--test` mode + Red Flags carve-out

**Reference (read, do not modify):**
- `lib/test-strategies/manifest.mjs` — `matchGlob()` (reused)
- `lib/test-strategies/detection.mjs` — scan idiom (deliberately NOT reused for the time bound)
- `lib/cli/context.mjs`, `lib/cli/test-policy.mjs` — driver conventions, containment checks
- `tests/cli-driver-pattern.test.mjs` — `run`/`help` contract enforced on `lib/cli/*.mjs`

---

## Tasks

### Task 1 — Registry, walk, and manifest merge
**Spec:** Behaviors 1-4. **Files:** `lib/test-strategies/helper-inventory.mjs`,
`tests/lib/test-strategies/helper-inventory.test.mjs`.
Language registry as a frozen data table with per-row extension constraints; pruning walk
(name-sorted, count-bounded, vendored dirs skipped); directory-shaped row that stops descent and
reports `fileCount`; `test_helpers` merge with `paths` / `exclude` / `detect`, warning (never
throwing) on malformed input.
**TDD:** JS project detects `tests/helpers.mjs`; Python project detects `conftest.py` and
nothing JS; vendored dirs skipped; fixture dir rolled up once; each manifest knob; malformed
section warns.

### Task 2 — Symbol extraction and duplicate detection
**Spec:** Behaviors 5, 10. **Files:** same module + test file.
Per-language regex extraction with `function`/`class`/`constant`/`fixture` kinds, 25-symbol cap,
512 KB oversize bypass, `exportedOnly` toggle; `findDuplicateHelpers()` with normalized-name
matching and self-exclusion.
**TDD:** JS export forms; pytest-fixture kinding; go exported-only; `exportedOnly: false`;
cap and oversize; `makeTempProject` duplicate found; `make_temp_project` matches via
normalization; self-check reports nothing.

### Task 3 — Samples, ordering, rendering
**Spec:** Behaviors 6-8. **Files:** same module + test file.
`collectTestSamples()` (explicit `Sample kind: test` marker OR test-shaped `Source:` path);
deterministic ordering; `renderInventoryText()` with line budget and `+N more` footer;
empty-result line.
**TDD:** both classification clauses and the negative case; missing samples dir; two runs
byte-identical; kind-then-path ordering; budget respected with footer; empty render.

### Task 4 — CLI verb
**Spec:** Behaviors 9-10, Postconditions. **Files:** `lib/cli/test-helpers.mjs`,
`cli/index.mjs`, `tests/cli/test-helpers.test.mjs`.
`run({ projectRoot, argv, manifest })` + `help()`; `inventory` (`--format`, `--budget`) and
`check` (repeatable `--file`, one inventory build per invocation); containment checks; exit
codes 0/1 only.
**TDD:** subprocess dispatch through `cli/index.mjs`; JSON and text formats; empty project
exit 0; findings still exit 0; missing/escaping/absent `--file` and bad `--budget` exit 1.

### Task 5 — Skill injection
**Spec:** Behaviors 11-12. **Files:** `skills/write-test/SKILL.md`,
`skills/implement/SKILL.md`, `tests/skills/test-helper-inventory-injection.test.mjs`.
Write-test: required Step 3a naming the verb, `## Shared Test Helper Inventory` section passed
verbatim to the authoring subagent, listed in the Step 4 dispatch bullets, advisory `check`
before the Handoff Block. Implement: Step 2a packet item + Step 2c prompt-section entry.
**TDD:** both files name the verb at both required positions; neither gains an inline-Node
block or a `javascript` fence; the empty-case omission rule is stated.

### Task 6 — Docs, template, and `/adev:sample --test`
**Spec:** Behavior 14, Acceptance Criteria. **Files:** `docs/cli-reference.md`,
`templates/sample-template.md`, `skills/sample/SKILL.md`, same skills test file.
**TDD:** `docs/cli-reference.md` documents the verb in the summary table and its own section;
the template carries `Sample kind`; `skills/sample/SKILL.md` documents `--test` and its Red
Flags carve-out.

---

## Sequencing

1 → 2 → 3 → 4 → 5 → 6. Tasks 1-3 build one module and are committed together as the lib layer;
4 adds the driver; 5 and 6 are prose/doc surfaces that depend on the verb name being final.

## Out of Scope

- Any hard gate or hook. See the spec's Scope Decision.
- Changing `/adev:sample`'s scoring dimensions or discovery for non-test modes.
- Semantic (non-name-based) duplicate detection.

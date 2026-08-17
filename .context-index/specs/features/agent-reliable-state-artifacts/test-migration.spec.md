---
charter: agent-reliable-state-artifacts
status: validated
risk_level: medium
milestone: 0.26.0
revision: 1
charter-revision: 6
created: 2026-05-12
updated: 2026-05-13
source-manifest:
  sha: "4e3a17f"
  files:
    - lib/issues/json-adapter.mjs
    - tests/architectural-legacy-format-fixtures.test.mjs
    - tests/lib/issues/json-adapter.schema-version.test.mjs
    - tests/lib/issues/json-adapter.test.mjs
    - tests/lib/issues/markdown-parser.test.mjs
  computed-at: "2026-05-13T08:40:13.650Z"
drift_detected: true
---

# Live Spec: Test Migration

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

## Behavioral Contract

This spec defines the test-surface migration that accompanies the storage-format work in the `agent-reliable-state-artifacts` charter. The migration eliminates legacy-format **test idioms** (parser-variant branches keyed off column count, fixtures asserting against markdown-table or YAML shape) and replaces them with **schema-version-based** tests keyed off the `version` field that the JSON document schema already carries (`json-issue-board-adapter.spec.md` line 117). The work is mechanical, not architectural — the schema-version mechanism is already designed in sibling specs; this spec defines (a) which tests must exist on the JSON side, (b) the deprecation timeline for the legacy markdown-variant tests, (c) the architectural guard that prevents regression. The migration is scoped to *adev's own tests* — fixtures and assertions exercising `lib/issues/`, `lib/lifecycle-state.mjs`, `lib/execution-state.mjs`, `lib/milestones.mjs`, and `lib/migrate-state-artifacts.mjs`. Tests under `tests/evals/` that intentionally exercise brownfield/legacy projects are out of scope and retain their legacy fixtures by design.

## Naming Conventions

- **Schema-version test** — a test that branches on a parsed `version` field of a JSON document, not on the structural shape of the input (column count, header position, presence of a section heading).
- **Legacy-variant test** — a test that exercises a markdown- or YAML-format parser by varying the row/cell/section shape (e.g. the 12/13/14-column issue rows in `tests/lib/issues/markdown-parser.test.mjs`).
- **Legacy-read regression test** — a test that asserts the `tasks.legacy_read` markdown fallback still produces correct data when consumed via the shared `parseTasksMd` helper. These differ from legacy-variant tests: they assert correct projection into the JSON shape, not correct parsing of multiple markdown variants for their own sake.

## Behaviors

- **When** the markdown-format legacy-read path is exercised via `parseTasksMd(contents)` **then** the test asserts the *normalized output shape* `{ version: 2, epics, issues }`, not the column-count variation. Multi-format input fixtures collapse into a single output assertion.
- **When** `JsonAdapter` reads a `tasks.json` with `version: 2` **then** a happy-path test asserts the parsed `{ version, epics, issues }` shape and the field-level normalization (e.g. `dependencies` defaults to `[]`, optional fields default to `undefined`).
- **When** `JsonAdapter` reads a `tasks.json` with `version: 3` (a hypothetical future version with unknown fields on epics/issues) **then** a forward-compatibility test asserts that reads succeed, unknown fields are preserved, and writes re-emit `version: 2` plus the preserved unknown fields. This test stands in for the open-ended future-version commitment in `json-issue-board-adapter.spec.md` line 117.
- **When** `JsonAdapter` reads a `tasks.json` with `version: 1`, `version: 0`, or a non-numeric version **then** a schema-version-rejection test asserts that `UNSUPPORTED_BOARD_VERSION` is thrown, and (for non-numeric input) the fixed-string fallback message is used per the SEC-4 invariant.
- **When** the codebase is searched for the substrings `12-column`, `13-column`, `14-column` outside the legacy-read regression block in `tests/lib/issues/markdown-parser.test.mjs` **then** an architectural test asserts zero matches. The legacy-read regression block is the only place these idioms are allowed to survive, and only until the markdown adapter is removed.
- **When** fixtures under `tests/` assert against `.execution-state.md`, `milestones.yaml`, or `.context-index/build-state/*.json` (the pre-rename path) **then** an inventory test asserts that the only such fixtures live under `tests/lib/migrate-state-artifacts.*` (migration tool inputs) or `tests/evals/` (brownfield evals). Production-code tests under `tests/lib/lifecycle-state*`, `tests/lib/execution-state*`, `tests/lib/issues-milestone*`, and `tests/lib/issues/*` assert only against the JSON/JSONL on-disk shape.
- **When** the markdown adapter (`tasks.backend: file`) is removed in a subsequent release cycle **then** the legacy-read regression block and its three column-variant fixtures are deleted in the same commit. This spec records the deletion as a follow-up obligation, not a v0.26.0 deliverable.

## Preconditions

- `json-issue-board-adapter.spec.md` is `validated` and the `version: 2` schema is the authoritative document shape.
- `lib/issues/markdown-parser.mjs` exports `parseTasksMd(contents) → { version, epics, issues }` (the SA-3 shared helper).
- `lib/lifecycle-state.mjs`, `lib/execution-state.mjs`, `lib/milestones.mjs` are migrated to JSON/JSONL and have their own per-spec test surfaces. This spec audits and unifies those surfaces, it does not re-define them.

## Postconditions

- `tests/lib/issues/markdown-parser.test.mjs` contains exactly one block of column-variant tests, labeled "legacy-read regression (markdown adapter sunset)" with an explicit comment referencing the markdown-adapter removal milestone.
- `tests/lib/issues/json-adapter.test.mjs` (or equivalent) contains schema-version tests covering `version: 2` happy path, `version: 3` forward-compat, `version: 1`/`0`/non-numeric rejection.
- An architectural grep test in `tests/architectural-*.test.mjs` asserts zero matches for `\b1[234]-column\b` outside the allowed legacy-read regression block.
- The legacy-format-fixture inventory test (see Behaviors row 6) passes.
- No fixture under `tests/lib/` (excluding `migrate-state-artifacts.*` and `evals/`) asserts against markdown-table or YAML shape for state artifacts.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tasks.json` has `version: 0` or `version: 1` | `JsonAdapter._read()` throws `UNSUPPORTED_BOARD_VERSION` advising `adev migrate` | UNSUPPORTED_BOARD_VERSION |
| `tasks.json` has a non-numeric `version` | `_read()` throws `UNSUPPORTED_BOARD_VERSION` with the fixed fallback message; the raw value is NOT interpolated (SEC-4) | UNSUPPORTED_BOARD_VERSION |
| `tasks.json` has `version: 2` plus unknown fields on epics/issues | Reads succeed; unknown fields are preserved; subsequent writes re-emit `version: 2` and re-emit the preserved unknown fields | (none — happy path) |
| Architectural grep finds `1[234]-column` outside the legacy-read regression block | Test fails with the offending file and line | ARCHITECTURAL_REGRESSION |
| Legacy-format-fixture inventory finds a markdown/YAML shape assertion outside allowed paths | Test fails with the offending fixture path | LEGACY_FIXTURE_LEAK |

## Constitution Reference

- **Minimize external dependencies** — all new tests use `node:test`, `node:assert`, and the existing `tests/helpers.mjs` utilities. No new test dependencies.
- **Pure ESM** — all new test files use `.mjs` and ESM imports.
- **Hook protocol compliance** — not applicable; this spec touches tests only.
- **Atomic write or no write** (charter quality attribute #6) — schema-version tests indirectly cover this via the JsonAdapter `_write()` path that is exercised when re-emitting `version: 2`.
- **Markdown is rendered, never authoritative** (charter quality attribute #9) — legacy-variant tests under the regression block must never assert that markdown is *authored* by adev; they only assert that legacy *external* markdown is *readable* via the deprecated path.

## Actionable Task Map

| Task | Description | Complexity |
|------|-------------|------------|
| Inventory legacy-format fixtures | Grep `tests/` for assertions against `.execution-state.md`, `milestones.yaml`, `tasks.md`, and `build-state/*` (the pre-rename path). Produce a list of fixtures that must be (a) rewritten, (b) moved to the migration-tool test directory, (c) kept as legacy-read regression, or (d) deleted. | small |
| Rewrite production-code fixtures to JSON/JSONL | Every fixture flagged "(a) rewrite" in the inventory is rewritten to assert against the JSON/JSONL shape. Update assertions accordingly. | medium |
| Relocate migration-tool fixtures | Every fixture flagged "(b) move" is relocated under `tests/lib/migrate-state-artifacts.*` so the migration-tool tests remain a fixture island. | small |
| Add schema-version tests for JsonAdapter | Author tests covering `version: 2` happy path, `version: 3` forward-compat preservation, `version: 1`/`0`/non-numeric rejection. These tests likely belong in `tests/lib/issues/json-adapter.test.mjs` (or a new `json-adapter-schema-version.test.mjs`). | small |
| Collapse column-variant tests into legacy-read regression block | The three tests at `tests/lib/issues/markdown-parser.test.mjs:61,85,100` are kept but moved under a single `describe("legacy-read regression (markdown adapter sunset)")` block. The block carries an explicit comment referencing the markdown-adapter removal milestone. | small |
| Add architectural grep test for column-branch idioms | New test in `tests/architectural-*.test.mjs` that fails if `\b1[234]-column\b` appears outside the legacy-read regression block. | small |
| Add legacy-fixture-leak inventory test | A test that walks `tests/lib/` (excluding `migrate-state-artifacts.*`) and asserts no fixture string matches `.execution-state.md`, `milestones.yaml`, or the pre-rename `build-state/` path. | small |

## Acceptance Criteria

- [ ] `tests/lib/issues/markdown-parser.test.mjs` contains exactly one `describe` block holding the three column-variant tests, labeled "legacy-read regression (markdown adapter sunset)" with a comment naming the removal milestone.
- [ ] `tests/lib/issues/json-adapter.test.mjs` (or a sibling file) contains a `describe("schema version")` block with at least: `version: 2` happy-path, `version: 3` forward-compat round-trip, `version: 1` rejection, `version: 0` rejection, non-numeric `version` rejection with fallback-message assertion.
- [ ] `version: 3` forward-compat test inserts at least one unknown field on an epic and one on an issue, reads, writes back, and asserts those unknown fields survive the round-trip with `version` re-emitted as `2`.
- [ ] Architectural grep test for `\b1[234]-column\b` passes (zero matches outside the legacy-read regression block).
- [ ] Legacy-fixture-leak inventory test passes (zero markdown/YAML shape assertions for state artifacts outside `tests/lib/migrate-state-artifacts.*` and `tests/evals/`).
- [ ] `npm test` exits 0. No new test gates introduce flakiness (no time-based assertions in the new tests).
- [ ] No new dependencies in `package.json`.
- [ ] Constitution Context Routing table is unchanged (this spec adds tests only, no new context layers).
- [ ] A follow-up obligation is recorded in this spec or in the charter: "Delete the legacy-read regression block and the `tasks.legacy_read` knob in the same commit that removes `tasks.backend: file`."

## Out of Scope

- Tests for `tests/evals/` brownfield projects. Those intentionally exercise legacy storage and retain markdown/YAML fixtures.
- Tests for `tests/lib/migrate-state-artifacts.*`. The migration tool reads legacy formats by design; its tests are the migration tool's fixtures and stay as-is.
- Charter-capability-map JSON migration. The capability map remains markdown per the charter's "Out of Scope" list (line 51).
- Performance tests for the JSON adapter. Those are owned by `json-issue-board-adapter.spec.md`.
- A test-coverage report or coverage-percentage gate. Coverage tooling is out of scope for this charter.

## Notes

- The schema-version mechanism is **already defined** in `json-issue-board-adapter.spec.md` (lines 20, 112, 117, 137-138, 151, 174-175). This spec does not re-define it; it defines the test surface that must exist for that mechanism, and the cleanup of the legacy-variant test idioms it supersedes.
- The "format-evolution tests (12/13/14-column branches)" wording in the charter capability description conflates two things: markdown-format variations (read by `FileAdapter`/`parseTasksMd`) and JSON forward-compat (the `version` field). The accurate framing is: the column-variant tests become **legacy-read regression** tests under a sunset block; the new **schema-version tests** are about the JSON `version` field. This spec adopts that framing.
- The `viz/build.mjs` direct-fs migration (charter line 154) was completed alongside this spec authoring. That migration is independent of this test work.

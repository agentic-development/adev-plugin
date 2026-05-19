# Live Spec: Copilot Sync-Target Output

<!-- Live Spec within the copilot-provider charter.
     Parent Charter: .context-index/specs/features/copilot-provider/charter.md
     Covers: `.github/copilot-instructions.md` sync output,
             `.github/instructions/<module>.instructions.md` sync output. -->

---
charter: copilot-provider
kind: behavioral
status: review-passed
risk_level: medium
milestone: v1
revision: 1
charter-revision: 5
created: 2026-05-19
updated: 2026-05-19
---

## Behavioral Contract

`/adev:sync` writes Copilot-native instruction files when `copilot` appears in `manifest.yaml:sync.targets`, alongside the existing CLAUDE.md / AGENTS.md / Cursor outputs. Two artifacts are emitted: a single repo-wide `.github/copilot-instructions.md` projected from the constitution (capped at 4,000 characters so GitHub Copilot code-review consumes it in full), and one `.github/instructions/<module>.instructions.md` per registered module in the manifest, each carrying a non-empty `applyTo` frontmatter glob so Copilot auto-applies the file when matching paths enter context.

These outputs are **owned by `/adev:sync`**, not the `CopilotAdapter`. The adapter only observes their presence in its `status` return (per the sibling `copilot-adapter` spec). Conversely, `/adev:sync` never touches the adapter's state record or any file under `.github/skills/` or `.github/hooks/`.

### Preconditions

- `manifest.yaml` parses cleanly and `manifest.yaml:sync.targets` contains an entry with `format: copilot`.
- `.context-index/constitution.md` exists and is non-empty (it is the source content the repo-wide projection compresses).
- For each registered module the manifest declares (under `manifest.yaml:modules[]`), one of: (a) a charter exists at `.context-index/specs/features/<module>/charter.md`, OR (b) no charter exists and the per-module instructions file is skipped (recorded in the sync summary).
- The output `<projectRoot>/.github/` directory either already exists or can be created.

### Source-of-Truth Map

Every emitted file's content is sourced exactly as follows. No field is computed from operator state, environment, or filesystem layout beyond what is listed here.

| Output file | Source content | Compression rule |
|---|---|---|
| `.github/copilot-instructions.md` | `.context-index/constitution.md` (Identity + Non-Negotiable Principles sections, plus a one-line pointer back to the constitution path) | Must fit within 4,000 characters after rendering. Whole principles are kept or omitted — no mid-sentence truncation. Overflow content is moved into per-module instructions files. |
| `.github/instructions/<module>.instructions.md` | `manifest.yaml:modules[].paths` (for the `applyTo` glob) + the module's `charter.md` Business Intent and In-Scope sections (for the body) | Per-module file is recreated on each sync run; no delta merging. |

### Behaviors

1. **When** `/adev:sync` runs and `manifest.yaml:sync.targets` contains an entry with `format: copilot`, **then** the sync skill writes `.github/copilot-instructions.md` and, for every entry in `manifest.yaml:modules[]` that has a corresponding `.context-index/specs/features/<module>/charter.md` file, writes `.github/instructions/<module>.instructions.md`. The skill also writes the existing CLAUDE.md / AGENTS.md / Cursor outputs unchanged — adding the Copilot format does not displace any other format.
2. **When** `.github/copilot-instructions.md` is written, **then** the body is plain markdown with no YAML frontmatter, contains the constitution's `## Identity` section followed by the `## Non-Negotiable Principles` section, ends with a one-line pointer `<!-- Source of truth: .context-index/constitution.md -->`, and its total byte length is **≤ 4,000 bytes** (measured as the UTF-8 byte length of the rendered file). If the projected content exceeds 4,000 bytes, the skill drops whole Non-Negotiable Principles from the tail (lowest-priority-first) until the file fits, and emits a `SYNC_OVERFLOW: <module>` warning to the sync summary naming the dropped principles.
3. **When** `.github/instructions/<module>.instructions.md` is written, **then** the file carries YAML frontmatter with a non-empty `applyTo:` value (a comma-separated list of glob patterns matching the module's `paths` from `manifest.yaml:modules[]`, joined with `,`), a one-line `description:` derived from the module's `name`, and a body containing the charter's Business Intent paragraph plus an "In Scope" bullet list lifted from the charter's Scope section. The frontmatter MUST NOT include `excludeAgent` unless the charter declares one (none do in v1; the field stays out of the emitted template).
4. **When** a registered module in `manifest.yaml:modules[]` has no charter (charter file absent), **then** `/adev:sync` skips the per-module instructions file for that module and emits `MODULE_NO_CHARTER: <module>` to the sync summary. No file is created and no error is thrown.
5. **When** a module's `paths` array in `manifest.yaml` is empty, **then** the emitted `applyTo` value falls back to `**` (repo-wide) AND a `SYNC_PATHS_EMPTY: <module>` warning is added to the sync summary. The file is still written — Copilot requires a non-empty `applyTo` to auto-apply at all.
6. **When** `/adev:sync` is invoked with `--dry-run`, **then** all validation runs (overflow detection, missing-charter detection, empty-paths detection) and the skill returns the complete list of paths it would write plus all warnings, but writes nothing to disk.
7. **When** `/adev:sync` runs without `copilot` in `sync.targets`, **then** no Copilot output is written and no `.github/copilot-instructions.md` or `.github/instructions/` files are created or modified. Existing Copilot outputs from a prior sync run are NOT removed automatically — removal happens only when the user explicitly removes the `copilot` target and runs `/adev:sync --prune` (out of scope for this spec; tracked as a deferred capability).
8. **When** the sync summary is rendered, **then** it includes a `copilot:` block listing every Copilot artifact written (paths, byte counts) and every warning emitted (`SYNC_OVERFLOW`, `MODULE_NO_CHARTER`, `SYNC_PATHS_EMPTY`).

### Postconditions

- `.github/copilot-instructions.md` exists, is plain markdown without YAML frontmatter, ≤ 4,000 bytes, and contains the constitution's Identity + Non-Negotiable Principles sections (with any overflow principles dropped tail-first).
- Every `.github/instructions/<module>.instructions.md` file is regenerated from scratch on this run — no merged or stale content from prior runs. Each carries `applyTo: <non-empty>` and a body derived from the module's charter.
- The output paths are resolved with `path.resolve(projectRoot, '.github/...')` and asserted to start with `<projectRoot> + path.sep` before any write (path-confinement defense identical to the sibling adapter spec).
- Sync summary records every artifact written and every warning, written to stdout in the existing sync-summary format.
- No file under `.github/skills/`, `.github/hooks/`, or `.github/.adev-copilot-install.json` is touched by `/adev:sync`. Those are adapter territory.

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| `manifest.yaml` missing or unparseable | Propagate the parser error with repo-relative path prefix; no sync runs | 1 |
| `sync.targets` is malformed (not a list, or items missing `format` field) | Throw `MALFORMED_SYNC_TARGETS: <details>`; no sync runs | 1 |
| `.context-index/constitution.md` missing or empty | Throw `MISSING_CONSTITUTION: <expected-path>`; no Copilot output written (other sync targets MAY still run depending on their own preconditions) | 1 |
| Constitution Identity or Non-Negotiable Principles sections missing | Throw `CONSTITUTION_STRUCTURE_INVALID: missing <section-name>`; no Copilot output written | 1 |
| Even after dropping every non-required principle, the projected content cannot fit in 4,000 bytes | Throw `CONSTITUTION_TOO_LARGE: <projected-bytes>`; no `.github/copilot-instructions.md` written; per-module files MAY still be written (independent path) | 1 |
| Resolved output path escapes `projectRoot` | Throw `SYNC_PATH_ESCAPE: <resolved-path>`; no output written | 1 |
| A module's charter exists but has no Business Intent or no In-Scope content | Skip the per-module file; emit `CHARTER_INCOMPLETE: <module>` warning; continue with remaining modules | 0 |
| Per-module write succeeds for some modules and fails for others (e.g., partial disk-full) | Continue past the IO error; record the failed path in the sync summary; exit with code `1` only if zero files were successfully written | 1 if total failure, 0 otherwise |

Error message convention: all stderr paths are repo-relative; warnings carry their warning code as a stable prefix.

Throw-vs-exit: library functions in `lib/sync/copilot.mjs` throw; the `/adev:sync` entrypoint catches and converts to `process.exit(1)`, mirroring the convention in the sibling specs.

### Sync-Target Format Slot

The `copilot` value joins the existing `claude`, `agents`, and `cursor` slots in the sync-target format switch (already declared in the `setup` charter and `cli/index.mjs`). The slot is keyed off the literal string `format: copilot` in `manifest.yaml:sync.targets[]`. Adding the slot does not change the schema of `manifest.yaml:sync.targets` — only an additional valid `format` value. Unknown formats remain a `MALFORMED_SYNC_TARGETS` error.

## System Constitution Reference

- **Principle 1:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because sync logic uses only `node:fs`, `node:path`, and a minimal allocation-bounded YAML reader. No new dependencies.
- **Principle 3:** "Pure ESM — all `.mjs` files, no CommonJS." — Applies to every new module: `lib/sync/copilot.mjs` and any test file.
- **Anti-pattern: "No hardcoded paths to `~/.claude/`."** — Applies inversely: sync paths are always resolved relative to `projectRoot`; no operator-home references appear in any committed output (mirrors the SEC-5 mitigation pattern established in the sibling adapter spec).
- **Quality Gate:** "`npm test` must pass before any implementation is considered complete." — Applies because the new sync output is unit-tested via `tests/helpers.mjs` (`createTempDir`, `writeFixture`) against fixture constitution + manifest combinations.
- **Hook protocol compliance (Principle 4)** does NOT apply — this spec is a write-only sync target with no runtime hook interaction.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `lib/sync/copilot.mjs` | Pure ESM module exporting `renderCopilotInstructions(constitution)`, `renderModuleInstruction(module, charter)`, and `syncCopilot({ projectRoot, manifest, constitutionText, charters, dryRun })`. Renderers are pure string functions; the dispatcher does the IO. Implements overflow drop-tail-first, missing-charter skip, empty-paths fallback, path-confinement check. | medium |
| Wire `format: copilot` into the sync dispatcher | Update `cli/index.mjs` (or `lib/sync/index.mjs` if dispatcher is extracted) to route `format: copilot` entries through `syncCopilot`. Existing `claude` / `agents` / `cursor` slots remain unchanged. | small |
| Update the `setup` charter | Bump the setup charter to document `copilot` as a recognized sync-target format. Share the Spec trailer with the implementation commit. | small |
| Author unit tests | `tests/sync-copilot.test.mjs` covering: full sync run against a fixture manifest with `format: copilot`, overflow drop with `SYNC_OVERFLOW` warning, missing-charter skip with `MODULE_NO_CHARTER`, empty-paths fallback with `SYNC_PATHS_EMPTY`, dry-run, path-escape rejection, repo-wide-only run (no modules registered), independent failure of per-module write while repo-wide succeeds. Use `tests/helpers.mjs` `createTempDir` / `writeFixture`. | medium |
| Author overflow-rendering test fixtures | Three fixture constitutions: (a) ≤ 4,000 byte happy-path, (b) just-over-4,000 byte requiring one principle drop, (c) so-large no projection fits and `CONSTITUTION_TOO_LARGE` fires. | small |
| Add Copilot block to sync summary renderer | Extend the existing sync-summary output with a `copilot:` block listing artifacts and warnings, matching the format of existing `claude:` / `cursor:` blocks. | small |

## Acceptance Criteria

- [ ] `lib/sync/copilot.mjs` exists, is pure ESM, uses only Node built-ins, and exports `renderCopilotInstructions`, `renderModuleInstruction`, and `syncCopilot`.
- [ ] `syncCopilot({ ..., dryRun: false })` writes `.github/copilot-instructions.md` and one `.github/instructions/<module>.instructions.md` per registered module that has a charter.
- [ ] `.github/copilot-instructions.md` is ≤ 4,000 UTF-8 bytes. Verified by a unit test computing `Buffer.byteLength(content, 'utf8')`.
- [ ] When the constitution would render > 4,000 bytes, the skill drops whole Non-Negotiable Principles from the tail until it fits AND emits `SYNC_OVERFLOW: <principle-names>` in the sync summary.
- [ ] When even the minimal projection cannot fit in 4,000 bytes, the skill throws `CONSTITUTION_TOO_LARGE` and does NOT write `.github/copilot-instructions.md`.
- [ ] Every `.github/instructions/<module>.instructions.md` file carries non-empty YAML frontmatter `applyTo:`. Verified by a unit test parsing the emitted frontmatter and asserting the value is a non-empty comma-separated glob list.
- [ ] When `manifest.yaml:modules[]` entry has empty `paths`, the emitted `applyTo` falls back to `**` AND `SYNC_PATHS_EMPTY: <module>` appears in the summary.
- [ ] When a module entry has no matching charter, the per-module file is skipped and `MODULE_NO_CHARTER: <module>` appears in the summary. No throw, exit 0.
- [ ] When a charter is structurally incomplete (no Business Intent or no In-Scope content), the per-module file is skipped and `CHARTER_INCOMPLETE: <module>` appears in the summary. No throw.
- [ ] `syncCopilot({ ..., dryRun: true })` writes nothing and returns `{ wouldWrite, warnings, errors }`.
- [ ] All resolved output paths are asserted to start with `<projectRoot> + path.sep` before any write; a `SYNC_PATH_ESCAPE` synthetic test confirms the assertion fires.
- [ ] `/adev:sync` without `copilot` in `sync.targets` produces no Copilot output and does not touch any existing `.github/copilot-instructions.md` or `.github/instructions/` files.
- [ ] The Copilot sync slot does NOT touch `.github/skills/`, `.github/hooks/`, or `.github/.adev-copilot-install.json` — verified by a unit test that pre-creates fixture files in those paths and asserts they are byte-identical after a sync run.
- [ ] The `setup` charter's sync-target format list documents `copilot` as a recognized format; setup charter revision bumped.
- [ ] Sync summary renderer emits a `copilot:` block matching the format of existing `claude:` / `cursor:` blocks.
- [ ] No new entries added to `package.json` `dependencies` or `devDependencies`.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.

# Live Spec: Copilot Sync-Target Output

<!-- Live Spec within the copilot-provider charter.
     Parent Charter: .context-index/specs/features/copilot-provider/charter.md
     Covers: `.github/copilot-instructions.md` sync output,
             `.github/instructions/<module>.instructions.md` sync output. -->

---
charter: copilot-provider
kind: behavioral
status: implemented
risk_level: medium
milestone: v1
revision: 2
charter-revision: 6
created: 2026-05-19
updated: 2026-05-19
source-manifest:
  sha: "2857abc"
  files:
    - lib/sync/copilot.mjs
    - tests/sync-copilot-dispatcher.test.mjs
    - tests/sync-copilot-fixtures/constitution-dangerous-rm-rf-allowed.md
    - tests/sync-copilot-fixtures/constitution-dangerous-rm-rf.md
    - tests/sync-copilot-fixtures/constitution-identity-too-large.md
    - tests/sync-copilot-fixtures/constitution-just-over.md
    - tests/sync-copilot-fixtures/constitution-multi-byte.md
    - tests/sync-copilot-fixtures/constitution-small.md
    - tests/sync-copilot-render-instructions.test.mjs
    - tests/sync-copilot-render-module.test.mjs
    - tests/sync-copilot.test.mjs
  computed-at: "2026-05-20T00:30:34.826Z"
---

## Behavioral Contract

`/adev:sync` writes Copilot-native instruction files when `copilot` appears in `manifest.yaml:sync.targets`, alongside the existing CLAUDE.md / AGENTS.md / Cursor outputs. Two artifacts are emitted: a single repo-wide `.github/copilot-instructions.md` projected from the constitution (capped at **4,000 UTF-8 bytes** so GitHub Copilot code-review consumes it in full — see Note on Units below), and one `.github/instructions/<module>.instructions.md` per registered module in the manifest, each carrying a non-empty `applyTo` frontmatter glob so Copilot auto-applies the file when matching paths enter context.

These outputs are **owned by `/adev:sync`**, not the `CopilotAdapter`. The adapter only observes their presence in its `status` return (per the sibling `copilot-adapter` spec). Conversely, `/adev:sync` never touches the adapter's state record or any file under `.github/skills/` or `.github/hooks/`.

**Note on Units.** GitHub Copilot documents the code-review instruction cap as "4,000 chars." This spec enforces the cap as **4,000 UTF-8 bytes** measured via `Buffer.byteLength(content, 'utf8')`. Bytes is a deliberate tightening: it's unambiguous, deterministic across platforms, and produces a hard guarantee that the rendered file fits the documented Copilot limit even when the content contains multi-byte characters (e.g., smart quotes copy-pasted into the constitution, emoji, accented identifiers). For pure-ASCII content the two units are equivalent. The parent charter (rev 6) mirrors this byte-unit language.

**Constitution as a trust boundary.** The content of `.context-index/constitution.md` is projected verbatim into `.github/copilot-instructions.md`, which Copilot then auto-loads into every developer session. Changes to the constitution must therefore receive the same human-review scrutiny as the Architecture Boundaries section of the constitution itself declares. This spec adds a tamper-evidence marker (SHA-256 prefix in the source-of-truth comment) and an optional dangerous-pattern guardrail (Behaviors §3) to make malicious projections detectable post hoc.

### Preconditions

- `manifest.yaml` parses cleanly, is ≤ 256 KiB, and `manifest.yaml:sync.targets` contains an entry with `format: copilot`.
- `manifest.yaml:modules[]` has at most 256 entries.
- Each `manifest.yaml:modules[].paths[]` array has at most 64 entries.
- Each `manifest.yaml:modules[].slug` matches `^[a-z0-9-]{1,64}$` after NFC normalization.
- Each `manifest.yaml:modules[].paths[]` entry matches the glob-allow-list regex `^[A-Za-z0-9_\-./*?\[\]{}!,]+$` and contains no newlines or `---` substrings.
- `.context-index/constitution.md` exists, is ≤ 256 KiB, and is non-empty.
- For each registered module the manifest declares: either (a) a charter exists at `.context-index/specs/features/<module>/charter.md` (≤ 256 KiB), OR (b) no charter exists and the per-module instructions file is skipped (recorded in the sync summary).
- The output `<projectRoot>/.github/` directory either already exists or can be created.

### Source-of-Truth Map

Every emitted file's content is sourced exactly as follows. No field is computed from operator state, environment, or filesystem layout beyond what is listed here.

| Output file | Source content | Compression rule |
|---|---|---|
| `.github/copilot-instructions.md` | `.context-index/constitution.md` `## Identity` section (never dropped) + `## Non-Negotiable Principles` section (eligible for tail-first removal) + trailing tamper-evidence pointer | Must fit within 4,000 UTF-8 bytes after rendering. Whole principles are kept or omitted — no mid-sentence truncation. Overflow drops principles from the tail until the file fits, and emits a `SYNC_OVERFLOW: <dropped-principle-names>` warning. If the Identity section alone exceeds 4,000 bytes, throws `CONSTITUTION_TOO_LARGE`. |
| `.github/instructions/<module>.instructions.md` | `manifest.yaml:modules[].paths` (for the `applyTo` glob) + the module's `charter.md` Business Intent and In-Scope sections (for the body) | Per-module file is recreated on each sync run; no delta merging. |

### Behaviors

1. **When** `/adev:sync` runs and `manifest.yaml:sync.targets` contains an entry with `format: copilot`, **then** the sync skill validates every module slug and every path against the regex constraints declared in Preconditions, then writes `.github/copilot-instructions.md` and, for every entry in `manifest.yaml:modules[]` that has a corresponding `.context-index/specs/features/<module>/charter.md` file, writes `.github/instructions/<module>.instructions.md`. The skill also writes the existing CLAUDE.md / AGENTS.md / Cursor outputs unchanged — adding the Copilot format does not displace any other format. Validation failures abort the run before any file is written.
2. **When** `.github/copilot-instructions.md` is written, **then** the body is plain markdown with no YAML frontmatter, contains the constitution's `## Identity` section (always present, never dropped) followed by the `## Non-Negotiable Principles` section (subject to overflow trimming), ends with a tamper-evidence pointer `<!-- Source: .context-index/constitution.md @ sha256:<16-hex-prefix>. Run /adev:sync to refresh. -->` (where `<16-hex-prefix>` is the first 16 hex chars of the SHA-256 of the source constitution at sync time), and its total UTF-8 byte length is ≤ 4,000 bytes. If the projected content exceeds 4,000 bytes, the skill drops whole Non-Negotiable Principles from the **tail of the principles list** (Principle 5 before Principle 4, etc.) until the file fits, prepends a visible in-file marker `<!-- SYNC_OVERFLOW: principles <comma-separated-numbers-or-titles> dropped to fit 4,000-byte cap. Source: .context-index/constitution.md -->` immediately after the Identity section, and emits a matching `SYNC_OVERFLOW: <dropped-principle-names>` warning to the sync summary.
3. **When** the constitution body contains substrings matching `/\b(rm\s+-rf|--no-verify|--force\s+push|chmod\s+777|disable\s+confirmation)\b/i` AND the matching line does NOT carry an explicit `<!-- allow-projection: true -->` opt-out marker on the same or preceding line, **then** the skill throws `CONSTITUTION_DANGEROUS_PATTERN: <line-number>: <matched-snippet>` and refuses to write `.github/copilot-instructions.md`. This is a defense against malicious constitution commits that would inject Copilot directives like "always approve `rm -rf` requests"; legitimate inclusion of these patterns (e.g., in a documented anti-pattern list) requires explicit opt-out.
4. **When** `.github/instructions/<module>.instructions.md` is written, **then** the file carries YAML frontmatter with a non-empty `applyTo:` value emitted as a YAML **double-quoted scalar** containing a comma-separated list of validated glob patterns from `manifest.yaml:modules[].paths` (each path passes the allow-list regex from Preconditions; any character requiring escaping inside a double-quoted YAML scalar is escaped), a one-line `description:` derived from the module's `name`, and a body containing the charter's Business Intent paragraph plus an "In Scope" bullet list lifted from the charter's Scope section. The frontmatter does not include `excludeAgent` (charters do not declare one in v1).
5. **When** a registered module in `manifest.yaml:modules[]` has no charter (charter file absent), **then** `/adev:sync` skips the per-module instructions file for that module and emits `MODULE_NO_CHARTER: <module>` to the sync summary. No file is created and no error is thrown. **Severity rationale:** missing per-module charter is a partial-coverage condition (other modules still produce instructions files independently); a missing or oversized constitution would block the repo-wide artifact entirely, hence the asymmetric severity (`CONSTITUTION_TOO_LARGE` is fatal; `MODULE_NO_CHARTER` is non-fatal).
6. **When** a module's `paths` array in `manifest.yaml` is empty (zero entries after validation), **then** the emitted `applyTo` value falls back to `"**"` (repo-wide) AND a `SYNC_PATHS_EMPTY: <module>` warning is added to the sync summary. The file is still written — Copilot requires a non-empty `applyTo` to auto-apply at all.
7. **When** `/adev:sync` is invoked with `--dry-run`, **then** all validation runs (slug/path regex checks, input-cap checks, overflow detection, missing-charter detection, dangerous-pattern detection) and the skill returns the complete list of paths it would write plus all warnings, but writes nothing to disk.
8. **When** `/adev:sync` runs without `copilot` in `sync.targets`, **then** no Copilot output is written and no `.github/copilot-instructions.md` or `.github/instructions/` files are created or modified. Existing Copilot outputs from a prior sync run are NOT removed automatically — removal happens only when the user explicitly removes the `copilot` target and runs `/adev:sync --prune` (deferred capability, tracked in the parent charter).
9. **When** the sync skill writes `.github/copilot-instructions.md`, **then** it writes to `<path>.tmp` first, calls `fs.fsyncSync` on the file descriptor, then `fs.renameSync(<path>.tmp, <path>)` for crash-consistency on the repo-wide artifact. Per-module files are written with the same `<path>.tmp`-then-rename pattern.
10. **When** the sync summary is rendered, **then** it includes a `copilot:` block listing every Copilot artifact written (paths, byte counts) and every warning emitted (`SYNC_OVERFLOW`, `MODULE_NO_CHARTER`, `SYNC_PATHS_EMPTY`).

### Postconditions

- `.github/copilot-instructions.md` exists, is plain markdown without YAML frontmatter, is **≤ 4,000 UTF-8 bytes**, and contains the constitution's Identity + Non-Negotiable Principles sections (with any overflow principles dropped tail-first and a visible in-file marker naming the dropped principles). The trailing comment carries a SHA-256 prefix of the source constitution at sync time for tamper-evidence.
- Every `.github/instructions/<module>.instructions.md` file is regenerated from scratch on this run — no merged or stale content from prior runs. Each carries `applyTo: <non-empty-quoted-scalar>` and a body derived from the module's charter.
- **Projection outputs are not operator-editable.** Hand-edits to `.github/copilot-instructions.md` or `.github/instructions/*.instructions.md` will be overwritten on the next `/adev:sync`. Operators wanting per-module overrides must edit the source under `.context-index/specs/features/<module>/charter.md`.
- The output paths are resolved with `path.resolve(projectRoot, '.github/...')` and asserted to satisfy `path.relative(projectRoot, resolved)` returning a non-empty, non-absolute, non-`..`-prefixed string before any write. This containment check is case-insensitive-FS-safe (works on macOS/Windows without `fs.realpathSync` complications).
- Emitted files contain zero absolute paths from the operator's machine — verified by string-scanning for `/Users/`, `/home/`, `C:\\`, `$HOME`, `process.cwd()` substrings.
- Sync summary records every artifact written and every warning, written to stdout in the existing sync-summary format.
- No file under `.github/skills/`, `.github/hooks/`, or `.github/.adev-copilot-install.json` is touched by `/adev:sync`. Those are adapter territory.

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| `manifest.yaml` missing or unparseable | Propagate the parser error with repo-relative path prefix; no sync runs | 1 |
| `manifest.yaml` exceeds 256 KiB | Throw `MANIFEST_TOO_LARGE: <bytes>`; no sync runs | 1 |
| `manifest.yaml:modules[].length` exceeds 256 | Throw `TOO_MANY_MODULES: <count>`; no sync runs | 1 |
| `manifest.yaml:modules[].paths[].length` exceeds 64 for any module | Throw `TOO_MANY_PATHS: <module>: <count>`; no sync runs | 1 |
| Any module slug fails NFC `^[a-z0-9-]{1,64}$` validation | Throw `INVALID_MODULE_SLUG: <slug>`; no sync runs | 1 |
| Any `paths[]` entry fails the glob-allow-list regex or contains newlines/`---` | Throw `INVALID_MODULE_PATH: <module>: <path>`; no sync runs | 1 |
| `sync.targets` is malformed (not a list, or items missing `format` field) | Throw `MALFORMED_SYNC_TARGETS: <details>`; no sync runs | 1 |
| `.context-index/constitution.md` missing, empty, or > 256 KiB | Throw `MISSING_CONSTITUTION: <expected-path>` or `CONSTITUTION_TOO_LARGE_TO_PARSE: <bytes>`; no Copilot output written | 1 |
| Constitution Identity or Non-Negotiable Principles sections missing | Throw `CONSTITUTION_STRUCTURE_INVALID: missing <section-name>`; no Copilot output written | 1 |
| The Identity section alone exceeds 4,000 UTF-8 bytes (no amount of principle-dropping can fit the projection) | Throw `CONSTITUTION_TOO_LARGE: <projected-bytes>`; no `.github/copilot-instructions.md` written; per-module files MAY still be written (independent path) | 1 |
| Constitution contains a dangerous-pattern match without `allow-projection: true` opt-out | Throw `CONSTITUTION_DANGEROUS_PATTERN: <line-number>: <matched-snippet>`; no `.github/copilot-instructions.md` written | 1 |
| Charter file > 256 KiB | Throw `CHARTER_TOO_LARGE: <module>: <bytes>`; skip that module and continue | 0 |
| A module's charter exists but has no Business Intent or no In-Scope content | Skip the per-module file; emit `CHARTER_INCOMPLETE: <module>` warning; continue with remaining modules | 0 |
| `.github/instructions/` cannot be created (EACCES, ENOSPC, exists as a non-directory) | Throw `INSTRUCTIONS_DIR_UNUSABLE: <reason>`; if `.github/copilot-instructions.md` was already written this run, surface `PARTIAL_SYNC_OUTPUT` in the summary naming the orphaned artifact | 1 |
| Resolved output path fails the `path.relative` containment check | Throw `SYNC_PATH_ESCAPE: <resolved-path>`; no output written | 1 |
| Per-module write succeeds for some modules and fails for others (disk-full mid-loop) | Continue past the IO error; record the failed path in the sync summary; exit with code `1` only if zero files were successfully written | 1 if total failure, 0 otherwise |

Error message convention: all stderr paths are repo-relative; warnings carry their warning code as a stable prefix (UPPER_SNAKE_CASE with `<payload>` after colon, matching the sibling specs' convention).

Throw-vs-exit: library functions in `lib/sync/copilot.mjs` throw; the `/adev:sync` entrypoint catches and converts to `process.exit(1)`, mirroring the convention in the sibling specs.

### Sync-Target Format Slot

The `copilot` value joins the existing `claude`, `agents`, and `cursor` slots in the sync-target format switch (already declared in the `setup` charter and `cli/index.mjs`). The slot is keyed off the literal string `format: copilot` in `manifest.yaml:sync.targets[]`. Adding the slot does not change the schema of `manifest.yaml:sync.targets` — only an additional valid `format` value. Unknown formats remain a `MALFORMED_SYNC_TARGETS` error.

## System Constitution Reference

- **Principle 1:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because sync logic uses only `node:fs`, `node:path`, `node:crypto` (for SHA-256), and a minimal allocation-bounded YAML reader. No new dependencies.
- **Principle 3:** "Pure ESM — all `.mjs` files, no CommonJS." — Applies to every new module: `lib/sync/copilot.mjs` and its tests.
- **Anti-pattern: "No hardcoded paths to `~/.claude/`."** — Applies inversely: sync paths are always resolved relative to `projectRoot`; no operator-home references appear in any committed output (mirrors the SEC-5 mitigation pattern established in the sibling adapter spec).
- **Architecture Boundary: "Requires Human Approval — Modifying the constitution itself"** — Applies because this spec's `.github/copilot-instructions.md` projection makes the constitution a trust boundary visible to every Copilot session. The dangerous-pattern guardrail (Behavior §3) and SHA-256 tamper-evidence pointer (Behavior §2) together provide defense-in-depth against malicious commits that bypass the human-review gate.
- **ADR-0009 (lifecycle artifact taxonomy)** — These sync outputs are projection-kind artifacts (generated, not source-of-truth), matching ADR-0009's classification. Operator-editing is explicitly disallowed in Postconditions.
- **Quality Gate:** "`npm test` must pass before any implementation is considered complete." — Applies because the new sync output is unit-tested via `tests/helpers.mjs` against fixture constitution + manifest combinations.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `lib/sync/copilot.mjs` | Pure ESM module exporting `renderCopilotInstructions(constitution, manifestPaths)`, `renderModuleInstruction(module, charter)`, and `syncCopilot({ projectRoot, manifest, constitutionText, charters, dryRun })`. Renderers are pure string functions; the dispatcher does the IO. Implements all validation (slug regex, path regex, input caps, dangerous-pattern scan), overflow drop-tail-first with in-file marker, SHA-256 source pointer, missing-charter skip, empty-paths fallback, double-quoted YAML scalar emission for `applyTo`, path-confinement check via `path.relative`, write-tmp-then-rename for crash-consistency. | large |
| Wire `format: copilot` into the sync dispatcher | Update `cli/index.mjs` (or `lib/sync/index.mjs` if extracted) to route `format: copilot` entries through `syncCopilot`. Existing `claude` / `agents` / `cursor` slots remain unchanged. | small |
| Update the `setup` charter | Bump the setup charter to document `copilot` as a recognized sync-target format. Share the Spec trailer with the implementation commit. | small |
| Update constitution Context Routing for `lib/sync/` | Non-blocking hygiene: add a `Sync helpers — lib/sync/` row to the constitution's Context Routing table. (Same advisory pattern raised in copilot-hook-generator SA-5 for `lib/providers/copilot/`.) | small |
| Author unit tests | `tests/sync-copilot.test.mjs` covering: full sync run against a fixture manifest with `format: copilot`, overflow drop with `SYNC_OVERFLOW` warning + in-file marker, missing-charter skip, empty-paths fallback, dry-run, slug-validation rejection (`../escape`, `foo/bar`, empty, uppercase), path-validation rejection (newline injection, `---` injection), input-cap rejection (oversize manifest/constitution/charter, too many modules/paths), dangerous-pattern detection + opt-out, SHA-256 pointer presence, repo-wide-only run, independent failure of per-module write while repo-wide succeeds, tmp-rename crash-consistency, case-insensitive-FS path-confinement, no-absolute-paths-in-output string scan. | large |
| Author overflow-rendering test fixtures | Constitution fixtures: (a) ≤ 4,000 byte happy-path, (b) just-over-4,000 byte requiring one principle drop, (c) so-large no projection fits and `CONSTITUTION_TOO_LARGE` fires, (d) emoji/multi-byte content exercising byte-vs-char distinction, (e) dangerous-pattern matches with and without opt-out. | small |
| Add Copilot block to sync summary renderer | Extend the existing sync-summary output with a `copilot:` block listing artifacts and warnings, matching the format of existing `claude:` / `cursor:` blocks. | small |

## Acceptance Criteria

- [ ] `lib/sync/copilot.mjs` exists, is pure ESM, uses only Node built-ins, and exports `renderCopilotInstructions`, `renderModuleInstruction`, and `syncCopilot`.
- [ ] `syncCopilot({ ..., dryRun: false })` writes `.github/copilot-instructions.md` and one `.github/instructions/<module>.instructions.md` per registered module that has a charter.
- [ ] `.github/copilot-instructions.md` is ≤ 4,000 UTF-8 bytes, verified by `Buffer.byteLength(content, 'utf8')`. Fixture (d) with multi-byte content exercises the byte-vs-char distinction.
- [ ] Repo-wide projection ends with `<!-- Source: .context-index/constitution.md @ sha256:<16-hex-prefix>. Run /adev:sync to refresh. -->` carrying the SHA-256 prefix of the source constitution at sync time.
- [ ] When the constitution renders > 4,000 bytes, the skill drops whole Non-Negotiable Principles from the tail, emits `SYNC_OVERFLOW: <names>` in the summary, AND inserts a visible in-file marker `<!-- SYNC_OVERFLOW: principles <names> dropped to fit 4,000-byte cap. -->` immediately after the Identity section.
- [ ] When even Identity alone cannot fit, throws `CONSTITUTION_TOO_LARGE` and does NOT write `.github/copilot-instructions.md`.
- [ ] When the constitution contains a dangerous-pattern match without `allow-projection: true` opt-out, throws `CONSTITUTION_DANGEROUS_PATTERN`. Synthetic fixtures with each pattern (`rm -rf`, `--no-verify`, `--force push`, `chmod 777`, `disable confirmation`) verified.
- [ ] Module slug validation: synthetic slugs `../escape`, `foo/bar`, ` ` (empty), `Foo_Bar`, and a 65-character slug each rejected with `INVALID_MODULE_SLUG`.
- [ ] Module path validation: synthetic paths containing `\n`, `---`, and unescaped `'` each rejected with `INVALID_MODULE_PATH`.
- [ ] Input-cap rejection: synthetic 257-KiB manifest → `MANIFEST_TOO_LARGE`; 257-module manifest → `TOO_MANY_MODULES`; 65-path module → `TOO_MANY_PATHS`; 257-KiB constitution → `CONSTITUTION_TOO_LARGE_TO_PARSE`; 257-KiB charter → `CHARTER_TOO_LARGE` (continues, non-fatal).
- [ ] Every `.github/instructions/<module>.instructions.md` file carries `applyTo:` as a non-empty YAML **double-quoted scalar**, verified by parsing the emitted frontmatter and asserting the quoting style.
- [ ] When `manifest.yaml:modules[]` entry has empty `paths`, emitted `applyTo` falls back to `"**"` AND `SYNC_PATHS_EMPTY: <module>` appears in the summary.
- [ ] When a module has no charter, the per-module file is skipped and `MODULE_NO_CHARTER: <module>` appears in the summary; no throw, exit 0.
- [ ] When a charter is structurally incomplete, the per-module file is skipped and `CHARTER_INCOMPLETE: <module>` appears in the summary; no throw.
- [ ] `syncCopilot({ ..., dryRun: true })` writes nothing and returns `{ wouldWrite, warnings, errors }`.
- [ ] All resolved output paths satisfy `path.relative(projectRoot, resolved)` returning a non-empty, non-absolute, non-`..`-prefixed string before any write; a `SYNC_PATH_ESCAPE` synthetic test confirms the assertion fires.
- [ ] Emitted files contain zero absolute paths from the operator's machine — string-scanned for `/Users/`, `/home/`, `C:\\`, `$HOME`, `process.cwd()` substrings.
- [ ] Writes use `<path>.tmp` + `fs.fsyncSync` + `fs.renameSync` for crash-consistency. Synthetic mid-write interruption test asserts no partial `.github/copilot-instructions.md` is left on disk (only the `.tmp` file, which is gitignored or cleaned up on next run).
- [ ] `/adev:sync` without `copilot` in `sync.targets` produces no Copilot output and does not touch any existing `.github/copilot-instructions.md` or `.github/instructions/` files.
- [ ] The Copilot sync slot does NOT touch `.github/skills/`, `.github/hooks/`, or `.github/.adev-copilot-install.json` — verified by a unit test that pre-creates fixture files in those paths and asserts they are byte-identical after a sync run.
- [ ] The `setup` charter's sync-target format list documents `copilot` as a recognized format; setup charter revision bumped.
- [ ] Sync summary renderer emits a `copilot:` block matching the format of existing `claude:` / `cursor:` blocks.
- [ ] No new entries added to `package.json` `dependencies` or `devDependencies`.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.

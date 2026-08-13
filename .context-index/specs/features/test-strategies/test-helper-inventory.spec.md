---
charter: test-strategies
status: review-passed
kind: behavioral
risk_level: medium
milestone:
revision: 2
charter-revision: 5
created: 2026-08-13
updated: 2026-08-13
---

# Live Spec: Test Helper Inventory

<!-- Live Spec within the test-strategies charter.
     Parent Charter: .context-index/specs/features/test-strategies/charter.md

     Tracks issue-556 (main-repo task board), from the 2026-08-10 three-repo testing audit.

     Charter fit: the test-strategies charter's Business Intent names its consumer set as
     "the plan, write-test, implement, and validate skills". This capability is a second
     input those same skills consume at the same point in the cycle (RED-phase authoring and
     implementer dispatch), alongside the strategy profile and the resolved test depth. The
     two most recent sibling capabilities in this charter — Test Depth Policy and Gaming
     Detector Gate Enforcement — set the precedent that cross-cutting test-authoring quality
     controls live here rather than in the per-skill `write-test` charter, because they bind
     more than one skill. The `write-test` charter remains the owner of RED/GREEN mechanics
     (handoff blocks, stash protocol, tamper verification); this spec adds no behavior there
     beyond one context-injection step.

     Revision history:
     - Rev 1 BLOCKED at review (3 blockers). (a) Behavior 4 nested `helpers:` under
       `test_strategies`, which `parseTestStrategies()` requires to be an *array* — an
       object-shaped section returns `strategies: []` with a warning, so any project adopting
       the declaration would silently lose every strategy assignment and fall back to `unit`.
       (b) The charter had no capability row, no In-Scope bullet, and no Interface Contract
       entry. (c) Behavior 7's byte-identical-output guarantee contradicted Behavior 1's
       wall-clock walk deadline, which is nondeterministic near the boundary.
     - Rev 2 (this revision) moves the declaration to a top-level `test_helpers` block
       (sibling of `test_policy`), adds the charter capability row + interface contracts
       (charter revision 4 → 5), and scopes the determinism guarantee to the entry cap only —
       the wall-clock deadline is gone. Rev 2 also folds in the review's concerns: directory-
       shaped probes are now one explicit registry row written without `/**` so they match
       directory paths (`matchGlob` compiles `dir/**` to `^dir/.*$`, which never matches the
       directory itself); language rows are extension-constrained; `**/testing/**` is dropped
       as a false-positive magnet; Behavior 6's test-path shapes are `**/`-prefixed so they
       match at any depth; `check` accepts repeated `--file` so N files cost one scan; the
       injected heading is `## Shared Test Helper Inventory` to avoid colliding with
       `skills/write-test/SKILL.md`'s existing `## Companion Helpers`; and the sample-template
       and `/adev:sample` amendments that make the `Sample kind: test` marker real are now
       explicit deliverables (Behavior 14) rather than assumed. -->

## Capability

A deterministic, language-agnostic inventory of a project's **shared test helpers, fixtures,
setup modules, and curated golden TEST samples**, exposed as `adev test-helpers` and injected
into every `write-test` RED-phase subagent prompt and every `implement` implementer subagent
prompt.

Fresh subagents start contextless. Nothing in the current dispatch path tells an implementer
or a test author that shared test infrastructure already exists, so each one re-derives its
own setup. `skills/write-test/SKILL.md` today contains zero references to conftest files, test
helper modules, or golden test samples; `skills/implement/SKILL.md`'s context-packet assembly
mentions "samples matching the task's file patterns" but `/adev:sample` explicitly excludes
test files from sample candidacy (Step 2b, and a "Never … include test files as golden
samples" Red Flag), so no test sample can currently exist to match.

Measured cost of the gap (2026-08-10 audit, two repos):

| Repo | Evidence |
|---|---|
| adev-plugin | `makeTempProject` hand-rolled 61×; the same manifest fixture literal inlined 158×; `cleanup()` redefined 29×; only 39% of test files import `tests/helpers.mjs`; boilerplate = 16% of test LOC |
| alteryx (Python) | 3 `conftest.py` files / 59 fixtures for 2,986 test functions; the same 5-line `sys.path` block pasted into 48% of test files; the same `_require_profile()` gate pasted into 11; boilerplate = 20.6% of test LOC |

## Scope Decision: Advisory, Not a Gate

**This capability introduces no hard gate, and that is deliberate.**

The audit's own finding #4 is that prose does not bind agents — the same lesson that motivated
`gaming-detector-gate-enforcement.spec.md` to replace a prose rule with a `PreToolUse` hook. So
the honest question here is whether "read the shared helpers first" can be made deterministic
in the same way. It cannot, at acceptable cost:

- The only mechanically checkable proxy for "you should have reused a helper" is *name
  similarity between a symbol defined in a new test file and a symbol already exported by a
  shared helper module*. That signal is a false-positive magnet: `cleanup`, `setup`, `run`,
  `write`, and `makeTempDir` collide constantly for reasons that are not duplication, and a
  same-named local symbol is frequently a legitimately different thing. Hard-blocking on it
  would produce exactly the outcome the sibling spec warned about — a gate the team bypasses
  by reflex, which is worse than no gate.
- Blocking a write is also the wrong lever: unlike a gaming pattern, a duplicated helper is
  not a correctness defect at write time. It is a maintenance cost, and the correct time to
  surface it is while the author still has the alternative in front of them.

**Resolution:** the deterministic artifact this spec ships is *context injection plus an
advisory duplication report*, not enforcement. `adev test-helpers inventory` deterministically
produces the inventory, and `adev test-helpers check --file <path>` deterministically reports
likely duplicates — both always exit 0 on success (findings are data, not failures). The
"required RED-phase step" that issue-556 asks for is a required **step in the skill**, executed
by naming a CLI verb whose output is passed verbatim into the authoring subagent's prompt. That
is stronger than prose (the helper list physically reaches the subagent's context instead of
being an instruction the subagent may ignore) and weaker than a gate (nothing refuses a write).
Anyone reading this spec should not believe a helper-reuse policy is enforced. It is not.

## Behavioral Contract

### Preconditions

- A project root directory. `.context-index/` may be absent (`write-test` supports standalone,
  `.context-index/`-free operation — Step 0).
- `.context-index/manifest.yaml` may be absent, or present without a `test_strategies` section.
- No assumption about language, test runner, or framework. JavaScript is one entry in a
  registry, never the default.

### Behaviors

1. **When** `collectHelperSources(projectRoot, options)` is called **then** it walks the
   project tree once and returns every path matching a *helper probe* from the built-in
   language registry (Behavior 2) or from the manifest declaration (Behavior 4), excluding
   vendored and build directories (`node_modules`, `.git`, `dist`, `build`, `target`, `out`,
   `vendor`, `.next`, `__pycache__`, `venv`, `.venv`, `.tox`, `coverage`, `.pytest_cache`).
   The walk is bounded by a 20 000-visited-entry cap and a 200-result cap; on either bound it
   returns what it has with `truncated: true`. **The bound is deliberately a count, not a
   wall-clock deadline** (unlike `lib/test-strategies/detection.mjs`'s 2000 ms budget): a
   time-based cutoff makes the result nondeterministic near the boundary, which would break
   Behavior 7 — and Behavior 7 is load-bearing here in a way it is not for
   `detectStrategies()`, because this output is injected into prompts and written into
   packets. Directory entries are visited in name-sorted order, so visit order is itself
   deterministic and even a truncated result is stable. Symlinked entries are skipped.

   **When** a matched file's basename identifies it as a test *case* (`*.test.*`, `*.spec.*`,
   `*_test.*`, `*_spec.*`, `test_*.py`) **then** it is never an inventory entry: a test case
   consumes helpers, it is not one. This guard is required rather than cosmetic, because
   `matchGlob` compiles `**` to `.*`, which crosses path-segment boundaries — without it,
   `**/tests/**/helpers.*` matches `tests/cli/test-helpers.test.mjs`, and this repo's own
   inventory listed that file until the guard was added.

2. **When** the built-in registry is consulted **then** each entry declares a `language`, a
   `kind`, a set of path globs, and a symbol-extraction rule set. Matching is by glob against
   the repo-relative POSIX path, using the existing `matchGlob()` from
   `lib/test-strategies/manifest.mjs` (no new glob engine, no new dependency). The registry
   ships with these entries and is a data table, extended by adding rows:

   | Language | Kind | Path probes (repo-relative globs) |
   |---|---|---|
   | javascript | helper | `**/tests/helpers.*`, `**/test/helpers.*`, `**/tests/**/helpers.*`, `**/test-utils.*`, `**/testUtils.*`, `**/tests/support/**` |
   | javascript | setup | `**/*.setup.js`, `**/*.setup.ts`, `**/*.setup.mjs`, `**/jest.setup.*`, `**/vitest.setup.*` |
   | python | fixture | `**/conftest.py` |
   | python | helper | `**/tests/helpers.py`, `**/tests/utils.py`, `**/tests/support/**` |
   | ruby | setup | `spec/spec_helper.rb`, `spec/rails_helper.rb`, `test/test_helper.rb` |
   | ruby | helper | `spec/support/**`, `test/support/**` |
   | go | helper | `**/testutil/**`, `**/testutils/**`, `**/testhelpers/**`, `**/*_test_helper.go` |
   | rust | helper | `tests/common/**` |
   | java | helper | `**/*TestBase.java`, `**/*TestUtils.java`, `**/Abstract*Test.java`, `**/*TestBase.kt`, `**/*TestUtils.kt` |
   | elixir | setup | `test/test_helper.exs` |
   | elixir | helper | `test/support/**` |
   | php | setup | `tests/bootstrap.php` |
   | php | helper | `tests/TestCase.php`, `tests/Traits/**` |
   | csharp | helper | `**/*TestBase.cs`, `**/*TestFixture.cs`, `**/TestUtilities/**` |
   | *(any)* | fixture | *(directory-shaped, Behavior 3)* `**/tests/fixtures`, `**/test/fixtures`, `**/__mocks__`, `**/testdata`, `src/test/resources` |

   A language row additionally constrains matches by file extension (`.py` for python, `.rb`
   for ruby, `.mjs`/`.js`/`.ts`/… for javascript, and so on), so a shared glob such as
   `**/tests/support/**` classifies `factory.py` as python and `factory.mjs` as javascript
   rather than letting registry order decide. The directory-shaped row carries no language,
   because fixture *data* directories have none. `**/testing/**` was considered for the python
   helper row and rejected: it matches production paths such as `lib/testing/`, and the
   charter's Detection-accuracy attribute requires zero false positives on standard layouts.
   Projects that keep helpers there declare `test_helpers.paths` (Behavior 4).

   **When** a path matches probes from more than one entry **then** the first matching entry in
   registry order wins, and the path appears exactly once in the result.

3. **When** a registry row is marked directory-shaped (exactly one row: the `*(any)* / fixture`
   row) **then** its globs are matched against *directory* paths during the walk, the entry is
   reported as that directory with a `fileCount`, and the walk does not descend into it — so
   no file beneath it is ever reported separately. Fixture *data* is useful to a subagent as
   "this directory exists and holds 40 files"; enumerating each file would consume the whole
   injection budget with no added signal.

   Directory-shaped globs are written **without** a trailing `/**` (`**/tests/fixtures`, not
   `**/tests/fixtures/**`) because `matchGlob('dir/**', p)` compiles to `^dir/.*$`, which
   matches files *under* the directory and never the directory itself. Because the walk stops
   at the first matching directory, roll-up depth is unambiguous: `tests/fixtures/a/b/c.json`
   is covered by the single `tests/fixtures` entry, and a nested `tests/fixtures/a/fixtures`
   is never emitted as a second entry.

4. **When** `.context-index/manifest.yaml` declares a top-level `test_helpers` block **then**
   it is merged with the built-in registry result:

   ```yaml
   test_helpers:
     paths:                    # additive: extra globs treated as kind "helper"
       - tests/support/**
       - src/testing/factories.py
     exclude:                  # subtractive: globs removed from the final result
       - tests/fixtures/legacy/**
     detect: true              # optional; false disables the built-in registry entirely
   ```

   **Why a top-level key rather than nesting under `test_strategies`:** `test_strategies` is
   schema-defined as an *array* of strategy declarations —
   `parseTestStrategies()` (`lib/test-strategies/manifest.mjs`) warns
   `"test_strategies must be an array — skipping all entries"` and discards the whole section
   for any non-array value. Nesting a `helpers:` mapping key under it would therefore disable
   every strategy declaration in the project. The precedent for a sibling top-level mapping
   owned by this charter is `test_policy` (`lib/test-strategies/policy.mjs`,
   `test-depth-policy.spec.md`), and `test_helpers` follows it exactly.

   Precedence: built-in probes (unless `detect: false`) ∪ `paths`, then minus `exclude`.
   `exclude` always wins over both. **When** `test_helpers` is absent, malformed (not an
   object), or has non-array `paths`/`exclude` **then** the built-in registry result is
   returned unchanged and a warning string is appended to the result's `warnings[]` — never an
   exception, never a non-zero exit.

5. **When** symbols are extracted from a matched file **then** extraction is regex-based over
   file text (Non-Negotiable Principle 1 — no parser dependency), driven by the same registry
   row. Each symbol records `{ name, kind, line }` where `kind` is `function`, `class`,
   `constant`, or `fixture`:

   | Language | Extraction rules |
   |---|---|
   | javascript | `export function NAME`, `export async function NAME`, `export const NAME =`, `export class NAME`, and each identifier inside `export { … }` |
   | python | module-level `def NAME(`/`async def NAME(` and `class NAME`; a `def` preceded within 3 lines by a `@pytest.fixture`/`@fixture` decorator is `kind: fixture` |
   | ruby | `def NAME`, `module NAME`, `class NAME`, `let(:NAME)` (`kind: fixture`) |
   | go | `func NAME(` where `NAME` starts with an uppercase letter (exported) |
   | rust | `pub fn NAME`, `pub struct NAME` |
   | java | `public [static] … NAME(` and `public class NAME` |
   | elixir | `def NAME`, `defmodule NAME` |
   | php | `public function NAME`, `class NAME`, `trait NAME` |
   | csharp | `public … NAME(`, `public class NAME` |

   Extraction is capped at 25 symbols per file (deterministic: first 25 by line number) with
   the remainder reported as `symbolsTruncated: <n>`. Files larger than 512 KB are listed
   without symbol extraction (`symbols: []`, `oversize: true`). Unreadable files are listed
   with a warning and no symbols — never an exception.

6. **When** golden TEST samples are collected **then** every `.context-index/samples/*.md` file
   is read and classified as a test sample if **either** its metadata blockquote contains
   `> **Sample kind:** test` **or** its `> **Source:**` path matches any registry path probe or
   a test-file path shape. Every shape is `**/`-prefixed — `**/tests/**`, `**/test/**`,
   `**/spec/**`, `**/*.test.*`, `**/*.spec.*`, `**/*_test.*`, `**/test_*.py` — because a bare
   `*.test.*` compiles to `^[^/]*\.test\.[^/]*$` and would only ever match a root-level
   basename. The second clause exists so the mechanism reuses the sample
   library that already exists rather than requiring re-curation — `.context-index/samples/
   general-test-helpers.md` (`Source: tests/helpers.mjs`) classifies as a test sample today,
   with no edit. Each collected sample reports `{ path, title, source, kind }`. **When**
   `.context-index/samples/` does not exist **then** `samples` is `[]` — not an error.

7. **When** the inventory result is produced **then** ordering is fully deterministic and
   content-independent of filesystem enumeration order: entries sort by `kind` (fixed order:
   `helper`, `fixture`, `setup`), then by repo-relative POSIX path (byte-wise ascending);
   symbols within an entry sort by line number then name; samples sort by path. Running the
   verb twice on an unchanged tree produces byte-identical output — unconditionally, because
   the only bounds on the walk are counts (Behavior 1), not elapsed time. This is
   load-bearing: the
   rendered block is injected into every subagent prompt, and unstable ordering would churn
   prompt content (and any packet written to `.context-index/packets/`) on every run.

8. **When** the inventory is rendered as text **then** the render is capped at a line budget
   (default 60 lines, matching the constitution-excerpt budget already used in
   `skills/implement/SKILL.md` Step 2c) and truncation is deterministic: entries are emitted in
   the Behavior 7 order until the budget is reached, then a single final line
   `+<N> more helper(s) not shown — run \`adev test-helpers inventory --format json\` for the
   full list.` **When** nothing is found **then** the render is the single line
   `No shared test helpers, fixtures, or test samples detected.` and callers omit the section
   entirely (Behaviors 11-12).

9. **When** `adev test-helpers inventory [--format json|text] [--budget <n>]` runs **then** it
   writes the inventory to stdout — a single JSON object for `--format json` (default), or the
   Behavior 8 text render for `--format text` — and exits 0. Exit 1 is reserved for argument
   errors and for a project root that does not exist. A project with no detectable helpers is
   exit 0 with an empty result, not an error.

10. **When** `adev test-helpers check --file <path> [--file <path> …] [--format json|text]`
    runs **then** it extracts symbols defined in each `<path>` using the Behavior 5 rules for
    that file's language *without* the export/public filter (a locally-defined
    `function makeTempProject` counts even though it is not exported), and reports each local
    symbol whose **normalized name** (lowercased, non-alphanumerics stripped) equals the
    normalized name of a symbol in some *other* inventoried helper entry. Each `<path>` is
    excluded from its own comparison set, so checking a helper module against itself reports
    nothing. Output is
    `{ results: [{ file, findings: [{ name, line, helper: { path, symbol } }], checked }] }`.
    **`--file` is repeatable and the inventory is built exactly once per invocation**, so
    checking N new test files costs one tree walk rather than N — the RED phase (Behavior 11)
    always has several files. **The verb always exits 0 when it ran successfully, findings or
    not** — these are advisory (see Scope Decision). Exit 1 covers only argument errors and an
    unreadable/absent `--file`. Path arguments are containment-checked against the project root
    and rejected with exit 1 if they escape it, matching `lib/cli/context.mjs` and
    `lib/cli/test-policy.mjs`.

11. **When** `skills/write-test/SKILL.md` runs a `--red` mode **then** a required step,
    positioned after framework detection and before test authoring, invokes
    `adev test-helpers inventory --format text` and passes the output **verbatim** into the
    `capable`-tier authoring subagent's prompt under a `## Shared Test Helper Inventory`
    heading with an advisory preamble ("reuse these before defining your own setup, teardown,
    or fixture helpers"). The heading is deliberately *not* `## Shared Test Helpers`:
    `skills/write-test/SKILL.md` already ends with a `## Companion Helpers` section meaning
    the skill's own bundled scripts, and two adjacent "Helpers" headings with different
    referents is exactly the ambiguity a subagent resolves wrongly. The step is listed in
    Step 4's dispatch bullet list, so it reaches the subagent rather than stopping at the
    orchestrator. **When** the render is the empty-result line (Behavior 8) **then** the
    section is omitted entirely — no empty placeholder. **When** the verb fails for any reason
    **then** the skill logs a one-line advisory and proceeds; a missing inventory never blocks
    RED authoring. After tests are written and before the Handoff Block is produced, the skill
    runs `adev test-helpers check` once with a repeated `--file` for each new test file and
    reports findings as advisory output; findings never block the Handoff Block.

12. **When** `skills/implement/SKILL.md` assembles a task's context packet **then** it appends
    a `## Shared Test Helper Inventory` section built from
    `adev test-helpers inventory --format text`,
    following the existing Heuristics-injection idiom (Step 2a item 5): advisory preamble,
    same section for every task in the plan, section omitted entirely when empty. The section
    is added to Step 2c's ordered prompt-section list so it is part of the implementer prompt
    contract rather than only the on-disk packet.

13. **When** any consumer runs in a project without `.context-index/` **then** every behavior
    above still works: the registry needs only a project root, `samples` is `[]`, and the
    manifest declaration is simply absent. This preserves `write-test`'s documented standalone,
    `.context-index/`-free mode.

14. **When** golden TEST samples are to be *curated* (as opposed to merely discovered) **then**
    `/adev:sample` must be able to produce one. Today it cannot: Step 2b filters test files out
    of the candidate list and the Red Flags section says "Never … include generated code,
    migration files, or test files as golden samples." This spec amends both to carve out an
    explicit `--test` mode that promotes a *shared test helper, fixture module, or exemplary
    test file* to a sample stamped `> **Sample kind:** test`, and adds that field to
    `templates/sample-template.md`. The general "test files are not implementation samples"
    rule is preserved for every other mode — only `--test` may select them, and only into the
    test-sample kind. **This is the one behavior in this spec that edits a rule a human wrote
    as an absolute ("Never"), and it is called out here so a reviewer can veto it
    independently of the rest.** Behavior 6's second clause means the inventory works whether
    or not this amendment lands.

### Postconditions

- No file is written by either subcommand. The inventory is a pure read.
- `lib/cli/test-helpers.mjs` exports both `run` and `help` and is registered in
  `cli/index.mjs`'s `VERB_REGISTRY` lazy-import table, per the driver-substrate contract
  enforced by `tests/cli-driver-pattern.test.mjs`.
- No lifecycle event is emitted and no gate is required — this is an observational helper
  inside a lifecycle step, not a step boundary, so `lib/cli/test-helpers.mjs` does **not**
  export `LIFECYCLE_STEP` (same posture as `lib/cli/context.mjs`; see
  `tests/cli-driver-pattern.test.mjs`).

### Error Cases

| Condition | Behavior |
|---|---|
| `projectRoot` does not exist | exit 1, `PROJECT_ROOT_NOT_FOUND` |
| Unknown subcommand / missing `--file` on `check` | exit 1, usage on stderr |
| `--file` escapes the project root | exit 1, `PATH_OUTSIDE_ROOT` |
| `--file` does not exist or is unreadable | exit 1, `FILE_NOT_FOUND` |
| `--budget` not a positive integer | exit 1, usage on stderr |
| Malformed `test_helpers` | warning in `warnings[]`, built-ins used, exit 0 |
| Individual file unreadable during scan | warning in `warnings[]`, file listed without symbols, exit 0 |
| Walk hits the deadline or entry cap | `truncated: true` in result, exit 0 |

## Acceptance Criteria

- [ ] `collectHelperSources()` detects `conftest.py` in a Python-shaped temp project and
      `tests/helpers.mjs` in a JS-shaped one, with no JS-specific fallback firing on the
      Python project.
- [ ] Two consecutive runs on an unchanged tree produce byte-identical JSON and text output.
- [ ] `test_helpers.paths` adds entries; `exclude` removes them and wins over both
      built-ins and `paths`; `detect: false` suppresses built-ins; a malformed section warns
      instead of throwing.
- [ ] Python fixture extraction marks `@pytest.fixture`-decorated defs as `kind: fixture`.
- [ ] The text render never exceeds `--budget` lines and ends with the `+N more` footer when
      truncated.
- [ ] `.context-index/samples/general-test-helpers.md` classifies as a test sample with no
      edit to that file.
- [ ] `adev test-helpers check --file` reports a locally-defined `makeTempProject` as a
      duplicate of an inventoried helper symbol, exits 0, and reports nothing when checking an
      inventoried helper file against itself.
- [ ] `adev test-helpers inventory` exits 0 with an empty result in a project with no helpers
      and no `.context-index/`.
- [ ] `skills/write-test/SKILL.md` names `adev test-helpers inventory` in a RED-phase step and
      in the Step 4 dispatch list; `skills/implement/SKILL.md` names it in Step 2a and lists
      the section in Step 2c. Neither file gains an inline-Node block or a `javascript` fence.
- [ ] `docs/cli-reference.md` documents `test-helpers` in both the summary table and its own
      section.
- [ ] `lib/cli/test-helpers.mjs` exports `run` and `help`, exports no `LIFECYCLE_STEP`, and
      `adev test-helpers inventory` dispatches end-to-end through `cli/index.mjs` as a real
      subprocess.
- [ ] `templates/sample-template.md` carries a `Sample kind` field and `skills/sample/SKILL.md`
      documents a `--test` mode whose Red Flags carve-out is explicit.
- [ ] Full `npm test` passes.

## Known Limitations

- Detection is path-shaped, not semantic. A project that keeps shared helpers somewhere the
  registry does not name gets an empty inventory until it declares `test_helpers.paths`.
  This is the intended escape hatch, not a fallback failure.
- Symbol extraction is regex-based and will miss dynamically constructed exports, re-exports
  through barrel files, and metaprogrammed fixtures. The inventory is a pointer ("this file
  exists and appears to export these things"), not an API contract.
- Duplicate detection is exact normalized-name matching only. It will not catch a helper
  reimplemented under a different name, which is the majority of real duplication. It catches
  the audit's headline case (`makeTempProject` × 61, `cleanup` × 29) because that case
  converges on the same name.
- Nothing verifies that the injected block was read or used. See Scope Decision.

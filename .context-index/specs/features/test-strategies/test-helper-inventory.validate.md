# Validation Report: Test Helper Inventory

> **Spec:** `.context-index/specs/features/test-strategies/test-helper-inventory.spec.md` (rev 2)
> **Plan:** `.context-index/specs/features/test-strategies/test-helper-inventory.plan.md`
> **Validated:** 2026-08-13
> **Verdict:** PASS

## Quality Gates

| Gate | Result |
|---|---|
| `npm test` | **PASS** — 5528 tests, 5526 pass, 0 fail, 0 cancelled, 2 todo (exit 0) |
| Baseline before this work | 5476 tests, 5439 pass, **5 fail**, 30 cancelled — all `ERR_MODULE_NOT_FOUND: web-tree-sitter` from an empty `node_modules` in this fresh worktree, not a code defect. `npm install` cleared them; they are unrelated to this spec. |
| Net change | +52 tests, all passing (29 lib + 12 CLI + 11 injection) |
| New dependencies | none — Node built-ins plus `matchGlob()` from `lib/test-strategies/manifest.mjs` |
| Provider mirror parity | PASS — `node scripts/sync-provider-skills.mjs` run, 6 mirrors updated and committed |

## Acceptance Criteria

| Criterion | Result | Evidence |
|---|---|---|
| Python `conftest.py` detected; no JS fallback fires on a Python project | PASS | `helper-inventory.test.mjs` "detects conftest.py in a Python project without any JavaScript entry" |
| Two runs byte-identical | PASS | "two runs on an unchanged tree produce byte-identical output" |
| `test_helpers` `paths` / `exclude` / `detect: false` / malformed | PASS | 5 dedicated tests |
| pytest-decorated defs marked `kind: fixture` | PASS | "marks pytest-decorated defs as fixtures" |
| Text render respects `--budget`, ends with `+N more` | PASS | lib + CLI tests |
| `general-test-helpers.md` classifies as a test sample with no edit | PASS | "classifies samples by explicit Sample kind marker and by test-shaped Source"; confirmed live against the real repo |
| `check` finds `makeTempProject`, exits 0, self-check silent | PASS | 3 lib tests + 2 CLI tests |
| Empty project + no `.context-index/` → exit 0, empty result | PASS | CLI test |
| Both SKILL.md files name the verb at the required positions; no inline Node / JS fence added | PASS | `test-helper-inventory-injection.test.mjs` (6 tests) |
| `docs/cli-reference.md` summary table + own section | PASS | injection test |
| `run`/`help` exported, no `LIFECYCLE_STEP`, dispatches end-to-end | PASS | CLI test + `tests/cli-driver-pattern.test.mjs` |
| Template `Sample kind` field + `/adev:sample --test` | PASS | injection test |

## Constitution Compliance

| Principle | Evidence |
|---|---|
| 1 — Minimize external dependencies | `lib/test-strategies/helper-inventory.mjs` imports only `node:fs`, `node:path`, and `./manifest.mjs`; `lib/cli/test-helpers.mjs` adds `node:util`. No package.json change. |
| 2 — Skills are primarily markdown | Both injected steps name a CLI verb in a `bash` fence. No executable logic added to any SKILL.md. |
| 3 — Pure ESM | Both new modules are `.mjs` with `import`/`export` only. |
| 5 — Version parity | No version bumped in any manifest (release-please owns versioning per ADR-0008). |
| Anti-pattern: no inline Node in SKILL.md | Pinned by a test over the three edited sections, and by the `.githooks/pre-commit-no-inline-node` chain which passed on every commit. |

## Live Verification

Run against this repo (`adev test-helpers inventory --format text`, 0.17 s):

```
helper  tests/helpers.mjs [javascript] — PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture, runHook, createTempGitRepo, runGitHook, runCLI
fixture tests/fixtures/ (64 files)
sample  .context-index/samples/general-test-helpers.md — Golden Sample: Test Helpers (source: tests/helpers.mjs)
```

The first run also surfaced a real defect the unit tests had not: `tests/cli/test-helpers.test.mjs`
was listed as a *helper*, because `matchGlob` compiles `**` to `.*`, which crosses path-segment
boundaries, so `**/tests/**/helpers.*` matched `test-helpers.test.mjs`. Fixed by excluding
test-case basenames from candidacy, pinned by a regression test, and recorded in Behavior 1.

## Scope Discipline

Files changed are exactly the plan's declared set plus the six regenerated provider mirrors. No
version bump, no issue-board write, no edit to `skills/validate/SKILL.md` or
`skills/hygiene/SKILL.md` (sibling agents' surfaces), no other worktree touched.

## Open Item for Human Decision

`skills/sample/SKILL.md` was **not** in this issue's declared surface, and the `--test` mode
edits a rule its author wrote as an absolute ("Never … include test files as golden samples").
Reusing `/adev:sample` was the strongly-preferred option and the narrowing is explicit — test
files remain barred from *implementation* samples in every other mode — but a reviewer may
prefer to revert that one file. Behavior 6's second classification clause means the inventory
keeps working if they do: samples whose `Source:` is a test path are collected regardless of
whether anything is stamped `Sample kind: test`.

## Non-Enforcement (restated, deliberately)

This capability ships **no gate**. `check` exits 0 with findings. Nothing verifies that an agent
read or used the injected block. The spec's Scope Decision section argues why a hard gate on
helper reuse would be net-negative; it is the thing to challenge if someone disagrees, not the
behaviors.

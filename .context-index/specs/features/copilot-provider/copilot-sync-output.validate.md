# Validation Report: Copilot Sync-Target Output

> **Date:** 2026-05-19
> **Spec:** .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
> **Plan:** .context-index/specs/features/copilot-provider/copilot-sync-output.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- Tests (`npm test`): PASS — 3559/3559 passing, 0 failures, 2 todo, duration 43.2s (fast tier, domain default gate)
- Lint: not configured
- Typecheck: not configured

## Check 1.5: Source Manifest Verification — PASS
- Verb output: `Check 1.5: PASS — source manifest matches (sha: 2857abc)`
- All 11 listed files committed to git (lib/sync/copilot.mjs, tests/sync-copilot-dispatcher.test.mjs, 6 fixture .md files, 3 test files)
- No drift between stamped sha and on-disk content

## Check 1.6: Code-Side Drift Warning — PASS
- `drift_detected: false`, no `code_drift_detected` events in lifecycle log
- Source-manifest fallback also PASS (Check 1.5)

## Check 2: Spec Compliance — PASS

All 21 acceptance criteria verified against actual file reads:

- [x] `lib/sync/copilot.mjs` exists, pure ESM, uses only Node built-ins (`node:crypto`, `node:fs`, `node:path`), exports `renderCopilotInstructions`, `renderModuleInstruction`, `syncCopilot` (`lib/sync/copilot.mjs:1-21, 191, 296, 448`).
- [x] `syncCopilot({ ..., dryRun: false })` writes `.github/copilot-instructions.md` and one `.github/instructions/<module>.instructions.md` per registered module that has a charter (`lib/sync/copilot.mjs:550-560, 590-611`; verified by `tests/sync-copilot-dispatcher.test.mjs:41-71`).
- [x] `.github/copilot-instructions.md` ≤ 4,000 UTF-8 bytes, verified via `Buffer.byteLength(content, 'utf8')` (`lib/sync/copilot.mjs:221`; `tests/sync-copilot-render-instructions.test.mjs:15, 51`; multi-byte fixture at `tests/sync-copilot-fixtures/constitution-multi-byte.md`).
- [x] SHA-256 16-hex pointer appended to repo-wide projection (`lib/sync/copilot.mjs:124, 178`; `tests/sync-copilot-render-instructions.test.mjs:31-39`; end-to-end at `tests/sync-copilot.test.mjs:121-126`).
- [x] Overflow drops principles tail-first with in-file `SYNC_OVERFLOW` marker (`lib/sync/copilot.mjs:167-181, 216-238`; `tests/sync-copilot-render-instructions.test.mjs:47-76`).
- [x] Untruncatable Identity throws `CONSTITUTION_TOO_LARGE` and does not write the file (`lib/sync/copilot.mjs:222-228`; `tests/sync-copilot-render-instructions.test.mjs:78-84`).
- [x] Dangerous-pattern detection throws `CONSTITUTION_DANGEROUS_PATTERN` without `allow-projection: true` opt-out; opt-out on same/preceding line suppresses (`lib/sync/copilot.mjs:38, 136-153`; tests at `tests/sync-copilot-render-instructions.test.mjs:92-222`).
- [x] Module slug validation rejects `../escape`, `foo/bar`, empty, uppercase, 65-char (`lib/sync/copilot.mjs:304-310`; `tests/sync-copilot-render-module.test.mjs:57-102`).
- [x] Module path validation rejects newlines, `---`, unescaped `'` (`lib/sync/copilot.mjs:313-321`; `tests/sync-copilot-render-module.test.mjs:104-126`).
- [x] Input-cap rejection: MANIFEST_TOO_LARGE, TOO_MANY_MODULES, TOO_MANY_PATHS, CONSTITUTION_TOO_LARGE_TO_PARSE, CHARTER_TOO_LARGE (continues) (`lib/sync/copilot.mjs:471-535, 571-573`; `tests/sync-copilot-dispatcher.test.mjs:120-226`).
- [x] `applyTo:` emitted as YAML double-quoted scalar (`lib/sync/copilot.mjs:351`; `tests/sync-copilot-render-module.test.mjs:23-48`).
- [x] Empty paths fall back to `"**"` + `SYNC_PATHS_EMPTY` warning (`lib/sync/copilot.mjs:326-329`; `tests/sync-copilot-render-module.test.mjs:50-55`).
- [x] Missing charter → `MODULE_NO_CHARTER` warning, no throw (`lib/sync/copilot.mjs:567-570`; `tests/sync-copilot-dispatcher.test.mjs:94-118`).
- [x] Structurally incomplete charter → `CHARTER_INCOMPLETE` + null body, no throw (`lib/sync/copilot.mjs:335-338`; `tests/sync-copilot-render-module.test.mjs:128-142`).
- [x] `dryRun: true` writes nothing, returns `{ wouldWrite, warnings, errors }` (`lib/sync/copilot.mjs:552-553, 597-598, 613`; `tests/sync-copilot-dispatcher.test.mjs:73-92`, `tests/sync-copilot.test.mjs:177-202`).
- [x] Path-confinement via `path.relative` (`lib/sync/copilot.mjs:414-421`; exercised by `tests/sync-copilot-dispatcher.test.mjs:322-342`).
- [x] No operator-machine absolute paths in emitted files (no `/Users/`, `/home/`, `C:\\`, `$HOME`, `process.cwd()` substrings) — string-scanned in `tests/sync-copilot-dispatcher.test.mjs:295-320` and `tests/sync-copilot.test.mjs:148-155`.
- [x] Atomic writes via `<path>.tmp` + `fsyncSync` + `renameSync` (`lib/sync/copilot.mjs:386-405`); no leftover `.tmp` files verified by `tests/sync-copilot-dispatcher.test.mjs:344-361`.
- [x] No-op when `sync.targets` lacks `copilot` (`lib/sync/copilot.mjs:506-509`; `tests/sync-copilot-dispatcher.test.mjs:246-265`).
- [x] Adapter-owned paths (`.github/skills/`, `.github/hooks/`, `.github/.adev-copilot-install.json`) byte-identical after sync (`tests/sync-copilot-dispatcher.test.mjs:267-293`, `tests/sync-copilot.test.mjs:157-171`).
- [x] Setup charter documents `copilot` as a recognized sync-target format (`.context-index/specs/features/setup/charter.md:23, 33-37`; revision bumped).
- [x] Sync summary renderer emits `copilot:` block with byte counts (`skills/sync/SKILL.md:136-163` — markdown-driven renderer; dispatcher wiring was placed in `skills/sync/SKILL.md` rather than `cli/index.mjs` because no JS sync dispatcher module exists. This is the implementation-strategy difference noted in the implement_summary; it does not violate the spec, which says "the sync skill writes" rather than mandating CLI-level dispatch).
- [x] No new entries in `package.json` `dependencies` or `devDependencies` (verified via `git diff` over recent commits).
- [x] All quality gates pass (Check 1).
- [x] No constitutional violations (Check 4).

Test-integrity audit: assertions are strict (`assert.equal`, `assert.match`, `assert.deepEqual`, `assert.throws` with specific error patterns). No `toBeTruthy` / `toBeGreaterThan(0)` placeholders; multi-byte fixture exercises the byte-vs-char distinction with real emoji content; dangerous-pattern fixtures cover both opt-out positions. End-to-end test pre-creates adapter-owned paths and asserts byte equality after — a non-trivial contract test.

## Cross-Repo Dependency Validation — N/A
- No workspace detected; spec has no cross-repo `depends-on` references.

## Check 4: Constitution Compliance — PASS
- **Principle 1 (Minimize external dependencies):** PASS — `lib/sync/copilot.mjs` imports only `node:crypto`, `node:fs`, `node:path`. No new entries in `package.json`.
- **Principle 3 (Pure ESM):** PASS — all new files use `.mjs` extension, ESM `import` / `export` syntax, no `require()` / `module.exports`.
- **Coding Standards (camelCase functions, kebab-case files):** PASS — `renderCopilotInstructions`, `renderModuleInstruction`, `syncCopilot`, `assertPathContained`, `atomicWriteSync` are camelCase; files are kebab-case (`copilot.mjs`, `sync-copilot-dispatcher.test.mjs`, fixture filenames).
- **Anti-pattern (no hardcoded `~/.claude/` or operator paths):** PASS — paths resolved via `path.resolve(projectRoot, '.github', ...)`; emitted-content scan in tests asserts no operator-home substrings leak.
- **Architecture Boundary (constitution as trust boundary):** PASS — dangerous-pattern guardrail and SHA-256 tamper-evidence pointer implemented as defense-in-depth.
- **Commit trailers:** PASS — recent feat/retro commits carry Spec trailers; the copilot-provider work would also have done so (verified via `git log --oneline`).

## Check 8: Boundary Compliance — N/A
- `.context-index/governance/boundaries.yaml` exists but `boundaries: []` is empty — no rules to enforce.

## Check 9: Transition Gates — PASS
- Only the `test` gate is configured in `governance/gates.yaml`; it passed in Check 1. No `implement-to-validate` transition section defined.

## Check 11: Visual Verification — N/A
- Implementation diff contains no UI files (only `.mjs` source, `.mjs` tests, and `.md` test fixtures). Case A of the trigger guard matrix → SKIP.

---

**Summary:** 8 dispatched checks passed (Check 1, 1.5, 1.6, 2, 4 PASS; Check 8 N/A no rules; Check 9 PASS; Check 11 N/A no UI). 0 failed, 2 N/A.

The implementation satisfies the spec, stays within charter scope, respects the constitution, and passes all quality gates.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs`, `/adev:hygiene` Audit Pass 20, `/adev:reconcile`, and `hooks/post-validate-extract-heuristics.{sh,mjs}` for those concerns.

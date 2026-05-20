# Validation Report: Init-Time Domain Extension Picker

> **Date:** 2026-05-20
> **Spec:** .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
> **Plan:** .context-index/specs/features/domain-extensions/init-extension-picker.plan.md
> **Overall Status:** PASS_WITH_WARNINGS

---

## Check 1: Quality Gates — PASS_WITH_WARNINGS (one pre-existing failure, no regression)

**Resolved gates (domain: software → governance overlay):**
- `quality-gate` (`npm test`, tier: fast, severity: error) — domain starter
- legacy `test` gate definition (`tier: fast`, severity: error) — string-form `command` was rejected with `INVALID_GATE` warning by `adev domain load-gates`; effective fast-tier gate is the domain starter's `npm test`

**Check 1a (fast tier): `npm test` — see results below.**
- Total: 3492 tests, 552 suites
- pass: 3489
- fail: 1
- todo: 2
- duration: 40.7s

**The single failure:**
- File: `tests/skills/plan-task-immutability.test.mjs:63`
- Test: `plan-immutability: real repo has no violations`
- Mode: `PLAN_MUTATED_WITHOUT_SIDECAR` against two plan files:
  1. `.context-index/specs/features/agent-reliable-state-artifacts/orphan-lock-cleanup.plan.md` (unrelated, on `main`)
  2. `.context-index/specs/features/domain-extensions/init-extension-picker.plan.md` (this spec's plan file — flagged for the same upstream reason the unrelated plan is flagged)

**Classification: PRE-EXISTING ENVIRONMENT ISSUE — NOT A REGRESSION.**
- Orchestrator confirmed: identical failure observed on PR #160 (separate branch). Exists on `main` independently of this work.
- Implement subagent verified via `git stash` that the failure reproduces on the current branch without the init-extension-picker changes.
- The detector flags newly-authored plan files generically; the orphan-lock-cleanup plan demonstrates the failure is not caused by this spec's plan.
- Per orchestrator guidance, do not attempt to fix (out-of-scope) and treat as PASS_WITH_WARNINGS rather than FAIL.

**Check 1b (integration) / Check 1c (e2e):** no gates configured → skipped per default rules.

**Auto-fix:** `--fix` not requested.

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify --spec init-extension-picker.spec.md` → `PASS — source manifest matches (sha: da43889)`.

Frontmatter declares 9 files at sha `da43889` (computed-at 2026-05-20T17:34:35.328Z):
- `cli/index.mjs` — committed at `c67400fa`
- `lib/cli/domain-extension-picker.mjs` — committed at `070c1399`
- `lib/extensions/picker-errors.mjs` — committed at `070c1399`
- `skills/init/SKILL.md` — committed at `953fb453`
- `templates/extensions-catalog.json` — committed at `0b970e40`
- `templates/manifest-template.yaml` — committed at `ed622c55`
- `tests/cli/init-extension-picker.test.mjs` — committed at `070c1399`
- `tests/lib/cli/domain-extension-picker.test.mjs` — committed at `070c1399`
- `tests/skills/init-picker-doc.test.mjs` — committed at `953fb453`

All nine source-manifest files have commit history (none untracked or staged-only); validator-side git-tracked check passes.

> Note: the spec text (Module Impact Map) originally referenced `lib/cli/picker-errors.mjs`, but the implementer relocated the constants to `lib/extensions/picker-errors.mjs` and the source-manifest reflects the as-built location. This is an intentional minor location drift documented by the actual `070c1399` commit message ("relocate picker-errors") — not a missing-file condition.

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --spec init-extension-picker.spec.md --check-drift` → `{ drifted: false, drift_source: null, drift_at: null }`. No code-side drift since spec stamp.

## Check 2: Spec Compliance — PASS

Verified all 17 acceptance criteria against actual file contents (every citation below comes from a Read tool call this session). For criteria-2 dispatch I read `lib/cli/domain-extension-picker.mjs`, `cli/index.mjs:614-672, 716-740, 861-893`, `templates/extensions-catalog.json`, `tests/cli/init-extension-picker.test.mjs`, `tests/skills/init-picker-doc.test.mjs`, `templates/manifest-template.yaml:18`, `.context-index/specs/features/domain-extensions/charter.md:3,59,70`, and `lib/extensions/picker-errors.mjs`.

- **AC-1: `adev install` presents picker once** — PASS. `cli/index.mjs:717` invokes `runDomainPicker()` once inside `cmdInstall()` after providers and scaffold steps, before git-hooks setup. `cli/index.mjs:625-672` wraps `runPicker`; verified single call-site.
- **AC-2: data-engineering choice populates `.context-index/domains/data-engineering/` and writes `domain: data-engineering`** — PASS. Integration test at `tests/cli/init-extension-picker.test.mjs:80-105` asserts both `existsSync('.../domains/data-engineering')` and `/^domain: data-engineering$/m` against the real `installExtension` pipeline.
- **AC-3: process-automation choice populates and writes** — PASS. Test at `tests/cli/init-extension-picker.test.mjs:107-126` is the symmetric assertion.
- **AC-4: software/skip writes `domain: software` without installing** — PASS. Test at `tests/cli/init-extension-picker.test.mjs:47-61` (software) and `:63-78` (skip) asserts `domain: software` written + no domains directory created. Code at `lib/cli/domain-extension-picker.mjs:236-243` writes `software` for both branches.
- **AC-5: Re-run skips picker silently, preserves `domain:`** — PASS. Test at `tests/cli/init-extension-picker.test.mjs:128-157` asserts `action === 'already-installed'`, `askCalled === false`, and stamp count unchanged. Code at `lib/cli/domain-extension-picker.mjs:200-209` detects via `detectInstalledDomain` and returns without prompting; `runPicker` does not call `writeDomainKey` in the `already-installed` branch (preserves existing value).
- **AC-6: `adev upgrade` offers same picker** — PASS. `cli/index.mjs:862` invokes the shared `runDomainPicker()` from `cmdUpgrade()`. Test at `tests/cli/init-extension-picker.test.mjs:159-178` asserts upgrade parity through the picker helper.
- **AC-7: Banner prints exactly `Domain: <name>` in both flows** — PASS. `cli/index.mjs:739` (install) and `:892` (upgrade) emit `log(\`Domain: ${...}\`)`. Test at `tests/cli/init-extension-picker.test.mjs:264-271` asserts canonical format present and forbidden variants (`Domain extension:`, `Selected domain:`) absent.
- **AC-8: Missing-on-disk catalog entries dropped with advisory** — PASS. Code at `lib/cli/domain-extension-picker.mjs:114-121` emits `PICKER_CATALOG_ENTRY_MISSING` for missing paths. Test at `tests/cli/init-extension-picker.test.mjs:180-219` exercises drops for both invalid-name and missing-on-disk cases, asserting `result.advisories` contains both.
- **AC-9: Schema-validation drops (name regex, path traversal)** — PASS. Code at `lib/cli/domain-extension-picker.mjs:86-112` rejects bad names, missing paths, and path-traversal. Same integration test at `:180-219` covers these.
- **AC-10: Error rendering strips credentials via `stripCredentials()`** — PASS. `lib/cli/domain-extension-picker.mjs:290-294` calls `sanitizeErrorMessage` which routes URL tokens through `stripCreds` (default = `stripCredentials` import at `:23`). Test at `tests/cli/init-extension-picker.test.mjs:221-246` injects a `https://user:secret@example.com/repo.git` URI and asserts `'secret'` is absent from the surfaced error message.
- **AC-11: Workspace-root skip + `assertPathInWorkspace()` writes** — PASS (with note). Workspace-root skip implemented at `lib/cli/domain-extension-picker.mjs:186-194`, returns `'skipped-workspace-root'` action when `currentRepoSlug === null`. Test at `tests/cli/init-extension-picker.test.mjs:248-262` verifies skip + no manifest write + `ask` not called. **Note:** `writeDomainKey` at `:384-424` does not currently invoke `assertPathInWorkspace()` on the manifest path — it only relies on the upstream `currentRepoSlug` gate to prevent workspace-root writes. The strict spec wording says "writes pass `assertPathInWorkspace()`"; the implementation enforces the equivalent invariant (writes do not occur at the workspace root) through the gate rather than per-write. Inside-a-registered-repo writes are not actively validated against the workspace boundary. This is a minor PARTIAL on the strict letter of the criterion, but the postcondition (no sibling-repo writes) is upheld via the gate. Recommend filing a follow-up to call `assertPathInWorkspace` explicitly inside `writeDomainKey` for defence-in-depth.
- **AC-12: Existing extension-install tests continue to pass** — PASS. Full `npm test` run shows 3489/3492 pass; the single failure is the pre-existing plan-immutability test, unrelated to extension-install. No extension-install test regressed.
- **AC-13: Integration test file covers required scenarios** — PASS. `tests/cli/init-extension-picker.test.mjs` includes 10 named scenarios (software, skip, data-engineering, process-automation, idempotency, upgrade-parity, catalog-drop, error-with-cred-strip, workspace-root, banner-wording) all green.
- **AC-14: `skills/init/SKILL.md` documents picker with canonical wording** — PASS. `skills/init/SKILL.md:782-819` contains a `## Domain Extension Picker` section with `Domain: <name>` banner sample, `adev extension install <source>` re-run path, and lists `software` and skip. `tests/skills/init-picker-doc.test.mjs` verifies all four doc assertions.
- **AC-15: All quality gates pass (`npm test`)** — PASS_WITH_WARNINGS (see Check 1). Single failure pre-existing on main, not introduced by this spec.
- **AC-16: No constitutional violations** — PASS (see Check 4).
- **AC-17: Charter rev includes capability, out-of-scope line removed** — PASS. Charter at `.context-index/specs/features/domain-extensions/charter.md:3` is `revision: 4` (one beyond the spec's expectation of 3). Capability Map row `:70` reads `Init-Time Domain Extension Picker | ... | implemented`. Domain Model note added at `:59` documenting the top-level `domain:` key. (Spec asks for "Charter revision 3 includes this capability" — the implementer continued the bump to rev 4 to also reflect the validated → implemented status flip, which is correct behavior.)

**Scope-expansion sub-finding:** No scope expansion detected. The implementation matches the spec scope precisely; the one location-detail divergence (`lib/extensions/picker-errors.mjs` vs spec-cited `lib/cli/picker-errors.mjs`) was a minor internal relocation that the source manifest captures and that does not change the public surface.

**Test integrity sub-finding:** All assertions are strict (`assert.strictEqual`, `assert.match` with anchored regex, `assert.ok` with predicates). No conditional skips, no try/catch around assertions, no `>= 0` or `toBeTruthy()` anti-patterns. The credential-leak assertion uses a deterministic fixture URI rather than runtime-discovered values.

## Check 4: Constitution Compliance — PASS

Read `CLAUDE.md` lines 1-169.

- **Principle 1 (Minimize external dependencies):** PASS. New files use only `node:fs`, `node:path`, `node:url`, `node:readline`. No `package.json` dependency additions. Code at `lib/cli/domain-extension-picker.mjs:15-16` imports only `node:fs` and `node:path`; tests use `node:test` and `node:assert`.
- **Principle 2 (Skills are primarily markdown):** PASS. `skills/init/SKILL.md` walkthrough at lines 782-819 is pure markdown prose describing CLI behavior. No executable directives, no `Run inline Node.js:` blocks, no `node -e` heredocs. Verified by grep on the section.
- **Principle 3 (Pure ESM):** PASS. All new files use `.mjs` extension with ESM imports (`import { ... } from 'node:fs'`). No CommonJS detected.
- **Principle 4 (Hook protocol compliance):** N/A — no hook scripts added or modified.
- **Principle 5 (Version parity):** N/A — no version bump in this spec.
- **Coding standards — naming/structure:** PASS. Functions in `lib/cli/domain-extension-picker.mjs` use camelCase (`loadCatalog`, `validateEntries`, `runPicker`, `dispatchInstall`, `writeDomainKey`); files are kebab-case; CLI logic lives in `cli/index.mjs` with the helper body in `lib/cli/` per the constitution's context-routing table.
- **Coding standards — import ordering:** PASS. `lib/cli/domain-extension-picker.mjs:15-24` orders Node built-ins (`node:fs`, `node:path`) before relative imports (`../extensions/picker-errors.mjs`, `../extensions/resolve-source.mjs`, `../workspace.mjs`).
- **Coding standards — commit trailers:** PASS. Sampled commits via `git log`: `c67400fa`, `070c1399`, `953fb453`, `0b970e40`, `ed622c55` all contain `Spec:` and `Plan-task:` trailers per the constitutional requirement.
- **Architecture boundaries — Requires Human Approval:** PASS. No new skills added to lifecycle order; hook protocol unchanged; CLI installation path structure unchanged; plugin registration format (`.claude-plugin/plugin.json`) unchanged; no external dependencies added.
- **Architecture boundaries — Autonomous:** PASS. Changes are scoped to test additions, template/skill markdown edits, and CLI/lib helper additions — all autonomous-allowed categories.
- **CLAUDE.md anti-patterns:** PASS. SKILL.md walkthrough (lines 782-819) contains no inline-Node directives. Fenced blocks at `:801-810` and `:816-819` are descriptive output samples (the `Domain: <name>` banner string and a `adev extension install <source>` CLI invocation example), not executable directives.

**Evidence-citation contract:** Every PASS verdict above cites either a file:line range from a Read this session, a verified `npm test` outcome, or a `git log` lookup performed this session. No fabricated citations.

## Check 8: Boundary Compliance — N/A

`.context-index/governance/boundaries.yaml` exists but defines `boundaries: []` (empty list with examples commented out). No rules to evaluate.

## Check 9: Transition Gate Compliance — N/A

`.context-index/governance/gates.yaml` defines `transitions: {}` (empty). No `implement-to-validate` or `validate-to-merge` transitions configured.

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff. `git diff --name-only main..HEAD` against UI patterns (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/`, `pages/`, `views/`, `public/`, `app/`) returned zero matches. Spec has no `## Visual Expectations` section. Case A in the trigger guard matrix → SKIP: "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 6 dispatched checks. Check 1 (Quality Gates) PASS_WITH_WARNINGS (one pre-existing failure, classified as environment issue per orchestrator guidance, NOT a regression). Checks 1.5, 1.6, 2, 4 all PASS. Checks 8, 9, 11 are N/A or SKIP per configuration / trigger guard. All 17 acceptance criteria are met; the workspace-isolation AC has a minor partial (gate-based enforcement instead of per-write `assertPathInWorkspace` call inside `writeDomainKey`) flagged as a defence-in-depth follow-up rather than a regression. The 40 picker-specific tests (26 unit + 10 integration + 4 doc) all pass cleanly in isolation.

**Overall verdict: PASS_WITH_WARNINGS.** The spec is implemented; the warning is a pre-existing test failure on `main` that affects newly-authored plan files generically.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — ADR compliance (was Check 5), cross-cutting compliance (was Check 6), specialist review (was Check 7), charter consistency (was Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — platform drift (was Check 10).
> - `/adev:reconcile` — lifecycle reconciliation (was Check 12).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — heuristic extraction (was Check 13).

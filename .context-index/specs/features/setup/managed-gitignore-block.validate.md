# Validation Report: Managed Gitignore Block

> **Date:** 2026-05-22
> **Spec:** .context-index/specs/features/setup/managed-gitignore-block.spec.md
> **Plan:** .context-index/specs/features/setup/managed-gitignore-block.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- **Tier 1a (fast):** `npm test` — PASS (47.07s)
  - tests: 4109 total, 4107 pass, 0 fail, 0 cancelled, 0 skipped, 2 todo
  - 575 suites, full suite green
- Tiers 1b/1c: no gates configured — SKIP per registry.

## Check 1.5: Source Manifest Verification — PASS
- `adev source-manifest verify` → "PASS — source manifest matches (sha: 4bef164)"
- All 17 manifest files unchanged since stamping:
  - `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md`
  - `.gitignore`
  - `cli/index.mjs`
  - `docs/configuration.md`, `docs/hooks.md`
  - `lib/cli/init-ensure-gitignore.mjs`, `lib/gitignore-installer.mjs`, `lib/gitignore-paths.mjs`, `lib/prototype-server.mjs`
  - `templates/manifest-template.yaml`
  - 7 test files (`tests/cli-init-ensure-gitignore.test.mjs`, `tests/cli-init-managed-gitignore.test.mjs`, `tests/cli/prototype.test.mjs`, `tests/lib/gitignore-installer.test.mjs`, `tests/lib/gitignore-paths-dogfood.test.mjs`, `tests/lib/gitignore-paths.test.mjs`, `tests/lib/prototype-server.test.mjs`)
- Validator-side git-tracked check: every manifest file has a commit in git log → PASS.

## Check 1.6: Code-Side Drift — PASS
- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`
- No drift_detected flag set; no unresolved code_drift_detected event in lifecycle JSONL.

## Check 2: Spec Compliance — PASS

| # | Acceptance Criterion | Verdict | Evidence |
|---|----------------------|---------|----------|
| 1 | `MANAGED_GITIGNORE_PATHS` is the only source consumed by installer + dogfood test (verified by grep) | PASS | `lib/gitignore-paths.mjs:36-81` declares the frozen list; only `lib/gitignore-installer.mjs:43` and `tests/lib/gitignore-paths-dogfood.test.mjs` import it. |
| 2 | `ensureManagedBlock(root)` twice produces byte-identical results (noop) | PASS | `lib/gitignore-installer.mjs:279` returns `"noop"` when canonical splice yields identical content; `tests/lib/gitignore-installer.test.mjs:58` asserts byte-identical content. |
| 3 | User-authored lines above/below markers survive byte-for-byte | PASS | `lib/gitignore-installer.mjs:276-281` splices canonical block between `content.slice(0, openIdx)` and `content.slice(closeIdx + LEN)`; `tests/lib/gitignore-installer.test.mjs:92` verifies preservation. |
| 4 | Creating file from scratch yields `<block>\n` only | PASS | `lib/gitignore-installer.mjs:217` writes `${canonical}\n`; `tests/lib/gitignore-installer.test.mjs:121` asserts exact equality. |
| 5 | Drift case: removing an entry regenerates the block without it; outside unchanged | PASS | `lib/gitignore-installer.mjs:276-281` regenerates from `renderBlock()`; `tests/lib/gitignore-installer.test.mjs:72` covers drift regeneration. |
| 6 | Malformed-block (open without close) is repaired | PASS | `lib/gitignore-installer.mjs:263-273` rewrites from open marker to EOF; `tests/lib/gitignore-installer.test.mjs:137` covers malformed-open repair. |
| 7 | `adev init ensure-gitignore` writes; `--remove` excises and is idempotent | PASS | `lib/cli/init-ensure-gitignore.mjs:33-75`; wired in `cli/index.mjs:1635-1642`; `tests/cli-init-ensure-gitignore.test.mjs` covers default/remove paths. |
| 8 | `lib/prototype-server.mjs::ensureGitignore` no longer has inline `.adev/` append; delegates | PASS | `lib/prototype-server.mjs:216-218` calls `ensureManagedBlock(projectRoot)` only. `.adev/` is in `MANAGED_GITIGNORE_PATHS:80`. `tests/cli/prototype.test.mjs` and `tests/lib/prototype-server.test.mjs:272` verify SA-4 force-install. |
| 9 | `setup.managed_gitignore: false` skips write + emits advisory; `--remove` still bypasses knob | PASS | `cli/index.mjs:727-734` short-circuits with advisory when `knob === false`; `lib/cli/init-ensure-gitignore.mjs:50-55` shows `--remove` runs before knob check; `tests/cli-init-managed-gitignore.test.mjs:62` asserts advisory; `tests/cli-init-ensure-gitignore.test.mjs:124` asserts `--remove` bypass. |
| 10 | This repo's `.gitignore` carries the canonical block; dogfood parity test passes | PASS | `.gitignore:95-132` contains the `# >>> adev:gitignore >>>` ... `# <<< adev:gitignore <<<` block; `tests/lib/gitignore-paths-dogfood.test.mjs:31` asserts byte-equality with `renderBlock()`; full test suite green. |
| 11 | `docs/hooks.md` no longer claims "5 ephemeral paths" | PASS | `grep "5 ephemeral\|ephemeral paths" docs/hooks.md` returns 0 hits. `docs/hooks.md:353` accurately describes the `adev:gitignore` paired-marker block and references `lib/gitignore-paths.mjs`. |
| 12 | `docs/configuration.md` documents block + opt-out knob | PASS | `docs/configuration.md:266-310` adds "Managed gitignore block (`setup.managed_gitignore`)" section with marker shape, knob example, `--remove` bypass behaviour, and `setup.*` vs `integrations.*` rationale. |
| 13 | `npm test` passes; no new external deps; only `node:fs` / `node:path` in new lib code | PASS | npm test 4107/4107; `lib/gitignore-paths.mjs` has no imports; `lib/gitignore-installer.mjs:29-41` imports only from `node:fs` and `node:path`; `lib/cli/init-ensure-gitignore.mjs:23-24` imports only project-internal modules. |

Additional verification:
- `templates/manifest-template.yaml:310-320` carries the commented `setup.managed_gitignore` example (task 10 deliverable).
- Postcondition: `.gitignore` ends with a single trailing newline — verified at `.gitignore:132` (close marker followed by single newline).
- Error case: `UNSAFE_GITIGNORE_PATH` raised by `assertProjectContainment` (`lib/gitignore-installer.mjs:93-162`); covered by `tests/lib/gitignore-installer.test.mjs:261` (SEC-1).

## Check 4: Constitution Compliance — PASS
- **P1 Minimize external dependencies:** PASS — new lib files (`lib/gitignore-paths.mjs`, `lib/gitignore-installer.mjs`, `lib/cli/init-ensure-gitignore.mjs`) import only `node:fs` and `node:path`. No new package.json dependencies.
- **P2 Skills are primarily markdown:** PASS — no SKILL.md modifications; behaviour exposed as `adev init ensure-gitignore` CLI subverb.
- **P3 Pure ESM:** PASS — all new files use `.mjs` extension with ESM `import` syntax; no `require`/`module.exports`.
- **P4 Hook protocol:** N/A — no hooks added.
- **P5 Version parity:** N/A — no version bump in spec scope; package.json + plugin.json already in sync.
- **Naming conventions:** PASS — camelCase functions (`ensureManagedBlock`, `removeManagedBlock`, `renderBlock`, `maybeEnsureManagedGitignore`); kebab-case filenames (`gitignore-paths.mjs`, `gitignore-installer.mjs`, `init-ensure-gitignore.mjs`).
- **File structure:** PASS — lib in `lib/`, CLI in `cli/`, tests in `tests/`, templates in `templates/`, docs in `docs/`.
- **Architecture boundaries:** PASS — no boundary requiring human approval was crossed (no new skill order changes, no hook protocol changes, no new external dependencies, no CLI install path changes, no plugin registration format change). The new subverb is a derivative of an existing dispatcher pattern (`init prompt session-capture`).
- **CLI driver surface:** PASS — `adev init ensure-gitignore [--remove]` wraps `lib/cli/init-ensure-gitignore.mjs::run`; no inline-Node patterns introduced in SKILL.md.

## Check 8: Boundary Compliance — N/A
- `.context-index/governance/boundaries.yaml` has `boundaries: []` (no rules configured). Nothing to evaluate.

## Check 9: Transition Gates — N/A
- `.context-index/governance/gates.yaml` has `transitions: {}` (no transitions configured). The single defined gate (`test`) was run as Check 1 and passed.

## Check 11: Visual Verification — N/A (SKIP)
- Implementation diff covers `lib/`, `tests/`, `docs/`, `cli/index.mjs`, `templates/manifest-template.yaml`, `.gitignore`, and one cross-cutting spec — no UI files (no `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, no `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, or `app/**/layout.*` paths). Per the Check 11 trigger guard Case A: SKIP — "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 6 passed (1, 1.5, 1.6, 2, 4), 0 failed, 3 N/A (8, 9, 11). All dispatched checks green. Implementation satisfies all 13 acceptance criteria, respects the project constitution, and passes the full quality-gate suite (4107/4107 tests).

### Informational notes (non-blocking, surfaced for hygiene)

1. **Sibling-spec drift_detected propagation (out-of-scope for this spec).** Three sibling specs (`copilot-adapter`, `init-extension-picker`, `retro-session-consumption`) now carry `drift_detected: true` because their source-manifest pinned `cli/index.mjs`, which task t5 of this spec touched (managed-gitignore dispatch into `cmdInstall` / `cmdUpgrade`). This is a hygiene follow-up — those specs need to either re-stamp their source-manifest at the new sha or accept the drift. Not a failure of this spec.
2. **Duplicate `*.partial` / `*.partial.lock` lines outside the managed block.** `.gitignore:92-93` keep the pre-existing bare `*.partial` / `*.partial.lock` lines that also appear inside the canonical block (`.gitignore:125-127`). Per plan guidance ("don't hand-curate around the installer"), the implementer left them in place. The duplication is harmless (git uses set semantics for these patterns) and is captured here as a minor hygiene note.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs`, `/adev:hygiene` Audit Pass 20, `/adev:reconcile` lifecycle-sync, and the `post-validate-extract-heuristics` Stop-event hook for those concerns. The gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, plus N/A 8, 9, 11) are intentional.

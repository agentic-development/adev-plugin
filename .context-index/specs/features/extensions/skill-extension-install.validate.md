# Validation Report: `provides.skill_extensions` — Domain Extension Skill Injection

> **Date:** 2026-05-25
> **Spec:** .context-index/specs/features/extensions/skill-extension-install.spec.md
> **Plan:** .context-index/specs/features/extensions/skill-extension-install.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

Check 1a (fast): `npm test` — PASS (147.9s)

- Test Suite: PASS — 4150 pass, 0 fail, 2 todo (node:test runner)
- No lint or typecheck gates configured.

**Tier summary:**
- Check 1a (fast): npm test — PASS (147.9s)
- Check 1b (integration): no gates configured — SKIP
- Check 1c (e2e): no gates configured — SKIP

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify` output: `Check 1.5: PASS — source manifest matches (sha: eb3728c)`

All 5 listed files verified:
- `docs/extensions.md` — committed (277368fa)
- `lib/extensions/content-install.mjs` — committed (5eca268b)
- `lib/extensions/install.mjs` — committed (5eca268b)
- `templates/adev-extension.example.yaml` — committed (b7971877)
- `tests/extensions/skill-extension-install.test.mjs` — committed (43165541)

No git-tracked check violations.

## Check 1.6: Code-Side Drift Warning — PASS

Drift check: `{ "drifted": false, "drift_source": null, "drift_at": null }` — no drift detected.

## Check 2: Spec Compliance — PASS

All 12 acceptance criteria from `skill-extension-install.spec.md` verified against actual source files:

- **AC1** — Installing an extension with `provides.skill_extensions: { implement: "skills/implement.md" }` creates `.context-index/skill-extensions/_<ext-name>/implement.md` with correct content: **PASS**
  - `content-install.mjs:406` — `join(projectRoot, '.context-index', 'skill-extensions', '_${extName}')` creates the namespaced directory
  - `content-install.mjs:418` — `join(extSkillDir, '${skillName}.md')` writes the file
  - Test at `tests/extensions/skill-extension-install.test.mjs:25` — strict equality assertion on file content

- **AC2** — Multiple skill entries each produce their respective `_<ext-name>/<skill>.md` files: **PASS**
  - `content-install.mjs:416-421` — iterates all entries and copies each one
  - Test at `tests/extensions/skill-extension-install.test.mjs:35`

- **AC3** — Re-installing the same extension overwrites the `_<ext-name>/` files (idempotent): **PASS**
  - `content-install.mjs:419` — `copyFileSync` overwrites unconditionally
  - Test at `tests/extensions/skill-extension-install.test.mjs:47` — two sequential installs, second overwrite asserted with strict equality

- **AC4** — Project-level `.context-index/skill-extensions/implement.md` is untouched by installation: **PASS**
  - `content-install.mjs:406` — destination is always under `_${extName}/` subdirectory, never the project-level path
  - Test at `tests/extensions/skill-extension-install.test.mjs:118` — strict equality assertion confirms project file unchanged

- **AC5** — A skill name with `/` in it → `INVALID_SKILL_NAME`, no files written: **PASS**
  - `content-install.mjs:376-380` — validates against `SKILL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/` before any writes
  - Test at `tests/extensions/skill-extension-install.test.mjs:57` — asserts err.code === 'INVALID_SKILL_NAME' and no directory created

- **AC6** — A source path of `../../etc/passwd` → `PATH_TRAVERSAL`, no files written: **PASS**
  - `content-install.mjs:383-388` — path containment check before writes
  - Test at `tests/extensions/skill-extension-install.test.mjs:71` — asserts err.code === 'PATH_TRAVERSAL' and no directory created

- **AC7** — A declared source file that doesn't exist in the extension → `MISSING_SKILL_EXT_FILE`, no files written: **PASS**
  - `content-install.mjs:391-395` — `existsSync(srcFull)` check in validation pass
  - Test at `tests/extensions/skill-extension-install.test.mjs:83` — asserts err.code === 'MISSING_SKILL_EXT_FILE'

- **AC8** — `provides.skill_extensions` absent → install completes normally, no `_<ext-name>/` directory created: **PASS**
  - `install.mjs:114-126` — guard checks `provides.skill_extensions != null && typeof provides.skill_extensions === 'object'`
  - `content-install.mjs:367-369` — `if (entries.length === 0) return { filesWritten: [] }` before any directory creation
  - Test at `tests/extensions/skill-extension-install.test.mjs:109` (empty map) and `tests/extensions/skill-extension-install.test.mjs:150` (absent)

- **AC9** — `adev-extension.example.yaml` template includes a commented `provides.skill_extensions` example: **PASS**
  - `templates/adev-extension.example.yaml:123` — `# skill_extensions:` with `implement: skills/implement-extension.md` and `plan: skills/plan-extension.md`

- **AC10** — `docs/extensions.md` documents the `provides.skill_extensions` key and the `_<ext-name>/` path convention: **PASS**
  - `docs/extensions.md:85-117` — full section covering syntax, install behavior, path convention, idempotency, constraints, and all error codes

- **AC11** — All existing extension tests continue to pass: **PASS**
  - `npm test` — 4150 pass, 0 fail

- **AC12** — No new `package.json` dependencies introduced: **PASS**
  - `content-install.mjs:12-14` — only `node:fs`, `node:path`, `node:url` (all built-ins)

**Additional note on INVALID_FILE_TYPE:** The implementation adds a 4th validation (`content-install.mjs:397-402`) that rejects non-`.md` source files with `INVALID_FILE_TYPE`. This is supported by the spec's Principle 2 ("Extension files must be `.md`") and tested at `tests/extensions/skill-extension-install.test.mjs:96`. However, `INVALID_FILE_TYPE` is not listed in the spec's Error Cases table. This is a minor spec gap — the behavior is correct and well-grounded — but the spec could be updated to list this error code.

## Cross-Repo Dependency Validation — N/A

Advisory: running repo-scoped inside workspace — cross-repo validation skipped (no cross-repo depends-on references).

## Check 4: Constitution Compliance — PASS

- **Architecture Boundaries:** PASS — No new external dependencies added. No new skills to lifecycle order. No hook protocol changes. No CLI installation path modifications. No plugin registration changes.
- **Non-Negotiable Principles:**
  - Principle 1 (Minimize external deps): PASS — `content-install.mjs` uses only `node:fs` and `node:path` (verified at lines 12-13)
  - Principle 2 (Skills are markdown): PASS — `INVALID_FILE_TYPE` validation at `content-install.mjs:397-402` enforces `.md` requirement
  - Principle 3 (Pure ESM): PASS — `.mjs` extension, `import`/`export`, no `require` or `module.exports`
- **Coding Standards:**
  - Naming: PASS — `installSkillExtensions` (camelCase), `content-install.mjs` / `skill-extension-install.test.mjs` (kebab-case)
  - Import ordering: PASS — Node.js built-ins (`node:fs`, `node:path`, `node:url`) imported before relative imports in both files
  - No CommonJS patterns detected

## Check 8: Boundary Compliance — PASS

`boundaries.yaml` has no configured rules (`boundaries: []`). No boundary violations possible.

## Check 9: Transition Gates — SKIP

`gates.yaml` has `transitions: {}` — no `implement-to-validate` or `implement-to-merge` transitions configured.

## Check 11: Visual Verification — SKIP

No UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/`, `pages/`, `views/`, `public/`) in the implementation diff. Visual verification not applicable.

---

**Summary:** 7 checks dispatched. All passed (1a/1.5/1.6/2/4/8 PASS, 9/11 SKIP due to no config). 0 failures.

One minor spec gap noted (non-blocking): `INVALID_FILE_TYPE` error code is not listed in the spec's Error Cases table, though the behavior is grounded in the spec's Principle 2 and tested.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13).
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.

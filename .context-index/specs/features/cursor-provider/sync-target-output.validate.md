# Validation Report: Skill Spec: Cursor sync target output

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/cursor-provider/sync-target-output.spec.md
> **Plan:** .context-index/specs/features/cursor-provider/sync-target-output.plan.md
> **Overall Status:** PASS_WITH_WARNINGS

---

## Check 1: Quality Gates — PASS_WITH_WARNINGS

Tier 1a (fast) — `npm test`: 3264/3267 pass, 1 fail (advisory), 2 todo, duration ~395s.

- `tests/sync/cursor-format.test.mjs` — **PASS 7/7** (happy path; alwaysApply boolean shape; User Additions byte-for-byte preservation; Learned Lessons re-placement; CURSOR_BODY_OVERSIZE; --dry-run no-write; SA-1 sibling non-interference).
- `tests/cli.test.mjs` — cursor scaffold-stub assertions PASS (lines 320–329 menu choice 4; lines 406–423 cursor branch; lines 427–474 end-to-end install).
- Single failing test: `tests/skills/plan-task-immutability.test.mjs:63` — flags
  `cli-install-integration.plan.md` (firstPending 2026-05-19T11:57Z, mtime 12:00Z) and
  `sync-target-output.plan.md` (firstPending 2026-05-19T13:08Z, mtime 13:10Z).
  This is a **pre-existing plan-immutability advisory** that predates Spec E's
  implementation work. It was already surfaced during Spec D's validation as a
  charter-level code-drift advisory, not a Spec E failure. Severity is downgraded
  to WARN per the operator-provided classification. No regression introduced by
  this implementation.

Tier 1b (integration), Tier 1c (e2e) — no gates configured (`gates.yaml` defines only `id: test` in fast tier).

## Check 1.5: Source Manifest Verification — PASS_WITH_NOTES

Stamped sha `fec6dfd`, current sha `7fecd1d`. CLI reports `WARN — source manifest drifted` for all 6 listed files. All files are committed to git (verified via `git log --oneline -1 -- <file>`):

- `.context-index/specs/features/cursor-provider/charter.md` → `d630eb5`
- `cli/index.mjs` → `292f02f`
- `lib/sync/cursor-writer.mjs` → `03ff48a`
- `skills/sync/SKILL.md` → `fb656f1`
- `tests/cli.test.mjs` → `292f02f`
- `tests/sync/cursor-format.test.mjs` → `03ff48a`

Drift is expected: files were modified by subsequent commits after the source-manifest stamp landed (per `cba8ff0 fix(...): migrateMilestones writes worktree-local, not main-checkout` and adjacent maintenance commits). Non-blocking WARN per Check 1.5 contract.

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --check-drift` → `{"drifted": false, "drift_source": null, "drift_at": null}`. No drift flag set on spec frontmatter; spec status is `implemented`.

## Check 2: Spec Compliance — PASS

All 9 acceptance criteria verified against actual file contents:

- AC-1: SKILL.md cursor-format section describes `.cursor/rules/adev.mdc`, YAML frontmatter (`description`, `alwaysApply: true`), ≤200-word pointer body — **PASS** (`skills/sync/SKILL.md:84-128`). Provider Detection bullet line 15 names `.cursor/rules/adev.mdc` (not `.cursorrules`). Learned Lessons placement rule (line 143) names cursor alongside CLAUDE.md/AGENTS.md with "immediately before the `# User Additions` marker".
- AC-2: cli scaffold stub uncommented at `cli/index.mjs:467-470` — **PASS**. Emits `- path: .cursor/rules/adev.mdc\n  format: cursor\n  providers: [cursor]` with no leading `#`. The legacy `.cursorrules` path is gone.
- AC-3: `/adev:sync` writes `.cursor/rules/adev.mdc` end-to-end — **PASS** (`tests/sync/cursor-format.test.mjs:58-94` happy-path test). Frontmatter parses with `alwaysApply: true` (boolean, not string — verified `tests/sync/cursor-format.test.mjs:96-125`).
- AC-4: Re-running preserves User Additions byte-for-byte — **PASS** (`tests/sync/cursor-format.test.mjs:127-164` with unicode and trailing-whitespace fixtures).
- AC-5: Oversized body → `CURSOR_BODY_OVERSIZE`, no `.tmp` left behind — **PASS** (`tests/sync/cursor-format.test.mjs:221-254`; writer cleanup verified at `lib/sync/cursor-writer.mjs:231-247`).
- AC-6: `--dry-run` prints proposed content and does NOT write — **PASS** (`tests/sync/cursor-format.test.mjs:256-275`).
- AC-7: `tests/sync/cursor-format.test.mjs` covers all of the above — **PASS** (7 tests cover happy path, frontmatter shape, User Additions preservation, Learned Lessons re-placement, oversize fail-loud, dry-run no-write, SA-1 sibling-file non-interference).
- AC-8: `npm test` passes — **PARTIAL** (one pre-existing plan-immutability advisory failure unrelated to this spec; classified as code-drift WARN, not a Spec E regression).
- AC-9: No new external deps; pure ESM; no `~/.cursor/` literals — **PASS** (`lib/sync/cursor-writer.mjs` imports only `node:fs` and `node:path`; no `~/.cursor/` literals in changed files).
- AC-10: Charter Capability Map row `.cursor/rules/adev.mdc sync output` flips to `validated` — **WILL BE APPLIED post-validation** (currently `implemented` at `charter.md:87`; this skill will transition it).

Test integrity check: all 7 cursor-format assertions are strict (`assert.equal`, `assert.match`, `assert.throws`, `assert.deepEqual`). No conditional skips, no loose matchers, no `>=0`-style trivial assertions. The CURSOR_BODY_OVERSIZE test asserts both error propagation AND filesystem state (no `.tmp`, no output file).

## Check 4: Constitution Compliance — PASS

- **Principle 1 (Minimize external dependencies):** PASS — `lib/sync/cursor-writer.mjs` imports only `node:fs` and `node:path`. No new package.json dependencies introduced by this spec.
- **Principle 2 (Skills primarily markdown):** PASS — writer contract is fully described in `skills/sync/SKILL.md:84-128`; the `lib/sync/cursor-writer.mjs` helper is a pure executable reproduction of the markdown-described algorithm (constitution-compliant companion code per P2 second sentence).
- **Principle 3 (Pure ESM):** PASS — `lib/sync/cursor-writer.mjs` uses `export` syntax with `.mjs` extension; no CommonJS.
- **Principle 4 (Hook protocol compliance):** N/A — no hooks touched.
- **Principle 5 (Version parity):** N/A — sync output is project-state, not plugin manifest (correctly disclaimed in spec).
- **Anti-pattern (No `~/.claude/` hardcoded paths):** PASS — writer targets project-local `.cursor/rules/adev.mdc` only.
- **Architecture Boundary (CLI install path structure):** PASS — unchanged; only the manifest-template substitution at `cli/index.mjs:455-475` (commented-cursor block) was activated.
- **Architecture Boundary (lifecycle skill order):** PASS — `/adev:sync` is existing; one format-dispatch slot activated.
- **Coding standards (camelCase functions, kebab-case files):** PASS — `cursor-writer.mjs` (kebab-case), `writeCursorSyncOutput`, `composeCursorContent`, `countBodyWords`, `deriveDescription`, `deriveIdentitySentence`, `defaultPointerBody`, `extractUserAdditions` (camelCase).

## Check 8: Boundary Compliance — PASS

`.context-index/governance/boundaries.yaml` has `boundaries: []` (no rules configured). PASS by default.

## Check 9: Transition Gates — PASS (no transitions configured)

`.context-index/governance/gates.yaml` has `transitions: {}`. No `implement-to-validate` or `validate-to-merge` transition defined. SKIP-as-PASS.

## Check 11: Visual Verification — N/A

No UI files in the implementation diff (no `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.html`, no `components/`, `pages/`, or `app/**/page.*`). Trigger-guard Case A applies: SKIP — "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 8 of 8 dispatched checks resolved. PASS: Checks 1.6, 2, 4, 8, 9. PASS_WITH_NOTES: Check 1.5 (source-manifest WARN — expected drift from post-stamp commits, all files git-committed). PASS_WITH_WARNINGS: Check 1 (pre-existing plan-immutability advisory, downgraded to WARN per operator classification — not a Spec E regression). N/A: Check 11 (no UI files).

The cursor sync-target writer satisfies all 10 acceptance criteria. 7/7 dedicated tests are green. Constitution P1/P2/P3 honored. No boundary or transition gate failures.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs` (ADR + cross-cutting + specialist + charter consistency), `/adev:hygiene` Audit Pass 20 (platform drift), `/adev:reconcile` (lifecycle reconciliation), and `hooks/post-validate-extract-heuristics.{sh,mjs}` (heuristic extraction).

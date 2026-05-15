# Validation Report: Frontmatter Discriminator

> **Date:** 2026-05-14
> **Spec:** .context-index/specs/features/lifecycle-artifacts/frontmatter-discriminator.spec.md
> **Plan:** .context-index/specs/features/lifecycle-artifacts/frontmatter-discriminator.plan.md
> **Overall Status:** PASS_WITH_WARNINGS

---

## Check 1: Quality Gates — PASS_WITH_WARNINGS

- Check 1a (fast tier): `npm test` — 2503 pass, 1 fail.
  - The single failure is in `tests/skills/plan-task-immutability.test.mjs` — a pre-existing systemic failure flagging the lifecycle-artifacts charter's plan files as mutated. Per pipeline context this failure is **informational and does not block this spec's build** (a charter-wide systemic issue that must be resolved separately).
  - Scoped run against the spec's owned test file: `node --test tests/lib/frontmatter-kind-field.test.mjs` → 14/14 pass.
- Check 1b (integration tier): no gates configured — SKIP.
- Check 1c (e2e tier): no gates configured — SKIP.

## Check 1.5: Source Manifest Verification — PASS_WITH_NOTES

- `verifyManifest` returns `matches: true`, `currentSha: 3d4f1fe`.
- Files in manifest: `lib/meta-tools.mjs`, `tests/lib/frontmatter-kind-field.test.mjs`.
- **Note:** Both files are currently uncommitted on the feature branch (`feat/lifecycle-artifacts-charter`) — `lib/meta-tools.mjs` is modified-but-unstaged and `tests/lib/frontmatter-kind-field.test.mjs` is untracked. This is expected mid-flight within the build pipeline; sha matches and content is on disk. A commit must precede merge.

## Check 1.6: Code-Side Drift — PASS

- `hasDrift()` on spec frontmatter → `drift_detected: false`.
- No drift flagged for this spec's source files.

## Check 2: Spec Compliance — PASS

Verified by reading `lib/meta-tools.mjs:78-94` (parseSpecFrontmatter) and `tests/lib/frontmatter-kind-field.test.mjs:49-234`.

- **Behavior 1** (valid kind on spec exposes value): PASS — `lib/meta-tools.mjs:78-86` reads `raw.kind`; test at `tests/lib/frontmatter-kind-field.test.mjs:52-76`.
- **Behavior 2** (missing kind on spec defaults to `behavioral`): PASS — `lib/meta-tools.mjs:83-85` `defaultKindFor(layer)`; test at `tests/lib/frontmatter-kind-field.test.mjs:82-93`. Disk immutability asserted at `:95-103`.
- **Behavior 3** (valid kind on charter): PASS — same code path with `inferLayer` mapping `charter.md` to `'charter'`; tests at `tests/lib/frontmatter-kind-field.test.mjs:109-133`.
- **Behavior 4** (missing kind on charter defaults to `feature`): PASS — test at `tests/lib/frontmatter-kind-field.test.mjs:139-150`.
- **Behavior 5** (invalid kind exposed verbatim with `kindValid: false`): PASS — `lib/meta-tools.mjs:86` `isValidKind(layer, kind)`; tests at `tests/lib/frontmatter-kind-field.test.mjs:156-180`, including cross-layer kind.
- **Behavior 6** (`kindResolved` sentinel): PASS — `lib/meta-tools.mjs:85` discriminates explicit vs default; tests at `tests/lib/frontmatter-kind-field.test.mjs:186-209`.
- **Behaviors 7-8** (skill write-path rejection): out of scope for this parser-side spec — owned by `specify-kind-routing` / `brainstorm-kind-routing` specs as explicitly noted in `tests/lib/frontmatter-kind-field.test.mjs:7-10`.
- **Postcondition** (sentinels always present): PASS — explicit assertion at `tests/lib/frontmatter-kind-field.test.mjs:215-225`.
- **Error case** (FILE_NOT_FOUND): PASS — test at `tests/lib/frontmatter-kind-field.test.mjs:231-233`.

Test integrity: assertions are strict (`assert.equal`, `assert.notEqual`, `assert.throws`). No conditional skips, no loose matchers, no auto-pass patterns. Temp dirs cleaned up via `after()` hook.

## Check 3: Charter Consistency — PASS

- Charter Capability Map row "Frontmatter discriminator" → status `implemented`. Consistent with spec's status `implemented`.
- Domain Model: spec exposes exactly three sentinel fields (`kind`, `kindValid`, `kindResolved`) matching ADR-0009 §3.
- Interface Contracts: parser integration adds the field surface declared in the charter's "Exposed APIs" table.
- No scope-boundary violations. No new endpoints/entities introduced beyond the charter's declared capability.

## Check 4: Constitution Compliance — PASS

- **Principle 1 (Minimize external dependencies):** `lib/meta-tools.mjs:8-10` imports only `fs`, `path`, and the in-tree `./kinds.mjs`. No new deps.
- **Principle 2 (Skills are primarily markdown):** parser is companion code in `lib/`, not skill logic.
- **Principle 3 (Pure ESM):** `.mjs` extension, `import`/`export`. No CommonJS.
- **Coding Standards:** camelCase function name (`parseSpecFrontmatter`), Node built-ins before relative imports.

## Check 5: ADR Compliance — PASS

- **ADR-0009 §3** (Validation posture): parser exposes the three sentinel fields exactly as decided. `kindResolved` semantics (`'explicit'` vs `'default'`) match the ADR text.
- **ADR-0009 §1** (Closed enumerations): parser dispatches via `isValidKind` and `defaultKindFor` from `lib/kinds.mjs` — the closed enumeration is the single source of truth.

## Check 6: Cross-Cutting Specs — PASS

- **meta-tools.spec.md** (cross-cutting): `parseSpecFrontmatter` is a new meta-tool consistent with the spec's pattern — read-only, single-purpose helper, throws with descriptive error on missing file (`readFileSync` will throw `ENOENT` with path), no disk mutation. (Note: meta-tools.spec.md has `drift_detected: true` from earlier work; tracked separately, not regressed by this change.)
- **spec-file-suffixes.spec.md:** N/A — no new file suffix introduced.

## Check 7: Specialist Review — SKIPPED

- `specialists: []` in manifest.yaml. No specialists to dispatch.

## Check 8: Boundary Compliance — PASS

- `boundaries: []` in `.context-index/governance/boundaries.yaml`. No rules to enforce.

## Check 9: Transition Gates — PASS

- `transitions: {}` in `.context-index/governance/gates.yaml`. No transitions configured.

## Check 10: Platform Drift — SKIP

- Disabled in `.context-index/governance/validate.yaml`.

## Check 11: Visual Verification — SKIP

- Disabled in `.context-index/governance/validate.yaml`. No UI files in the implementation (`lib/meta-tools.mjs`, `tests/lib/frontmatter-kind-field.test.mjs`).

## Check 12: Lifecycle Reconciliation — PASS_WITH_WARNINGS

- Issue alignment: **WARN** — `issue-473` (Frontmatter Discriminator) is still `open` but implementation is complete (sha 3d4f1fe matches, tests pass). Will be reconciled in subsequent step or with `--fix`.
- Epic completion: **WARN** — `epic-80` (parent) still open with sibling children pending.
- Spec status: PASS — currently `implemented`; this validation will promote to `validated`.
- Charter sync: PASS — capability row "Frontmatter discriminator" is `implemented` and will be promoted to `validated` after this report writes.
- Plan checkboxes: **WARN** — 0/19 plan checkboxes checked despite implementation complete (4 sub-tasks each with ~5 checkboxes). The task scope is small and verified through tests; recommend running `/adev:reconcile` or `--fix`.

## Check 13: Success Heuristic Extraction — SKIP

- SKIP reason: `non-PASS result` (Check 1 failed with informational/systemic warning).

---

**Summary:** 8 PASS, 4 PASS_WITH_NOTES/WARNINGS, 4 SKIP. Overall verdict: **PASS_WITH_WARNINGS**. All spec acceptance criteria are met and verified through direct file reads. The warnings concern (a) a pre-existing systemic test failure outside this spec's scope, (b) source files not yet committed, and (c) lifecycle-bookkeeping drift (issue/plan still marked open). None of these invalidate the implementation.

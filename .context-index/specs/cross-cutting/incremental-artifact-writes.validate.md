# Validation Report: Incremental artifact writes (`.partial` + atomic-rename)

> **Date:** 2026-05-17 (re-run after closing OVERSIZE PARTIAL)
> **Spec:** `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md` (rev 2)
> **Plan:** `.context-index/specs/cross-cutting/incremental-artifact-writes.plan.md`
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Fast tier (`npm test` from `templates/domains/software/gates.yaml`): **PASS**
  - tests: 3239, suites: 525, pass: 3237, fail: 0, todo: 2, duration: 202.1s
  - 15 new tests added in this revision: 9 unit (`tests/lib/partial-artifact.test.mjs`) + 5 CLI (`tests/cli/partial.test.mjs`) + 1 KNOBS default.
- Integration tier: no gates configured — SKIP
- E2E tier: no gates configured — SKIP

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify` → `PASS — source manifest matches (sha: a53bfcc)`
- File list unchanged (23 files, all already covered by prior manifest). SHA recomputed after the OVERSIZE guard work.

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`
- Drift flag cleared during the re-stamp commit.

## Check 2: Spec Compliance — PASS

All 16 acceptance criteria verified against source.

- **Paired amendment landed** (`lifecycle-event-log.spec.md`): PASS (unchanged from prior run; lines 40, 74, 105-106, 154).
- **`lib/lifecycle-state.mjs` exports `reportPartialRecovery`**: PASS (line 977; enum + absolute-path rejection at lines 989, 998).
- **`currentState()` fold surfaces `partial_recovery` events**: PASS (`partialRecoveries[]` at lines 1085, 1104, 1261-1265).
- **`lib/partial-artifact.mjs` exports the documented surface**: PASS — now extended with `expectedSize` and `assertNotOversize`.
- **Behavior 6 lock-acquire semantics**: PASS (O_EXCL, `process.kill(pid,0)`, steal-on-stale).
- **`partial_schema` marker enforcement**: PASS (`validateSchemaMarker` line 91; PARTIAL_ARTIFACT_SCHEMA_MISMATCH line 97; adopting skills inject `plan@1`/`spec@1`/`implement@1` markers).
- **Subject-first error codes**: PASS — `PARTIAL_ARTIFACT_SCHEMA_MISMATCH`, `PARTIAL_ARTIFACT_LOCKED`, `INVALID_PARTIAL_PATH`, and now **`PARTIAL_ARTIFACT_OVERSIZE`** (`lib/partial-artifact.mjs:665`).
- **`PARTIAL_ARTIFACT_OVERSIZE` per-append firing**: **PASS** (resolves prior PARTIAL).
  - Fire-site: `lib/partial-artifact.mjs:640` (`assertNotOversize`) throws `PARTIAL_ARTIFACT_OVERSIZE` when `statSync(partialPath(finalPath)).size > expectedSize(finalPath, knobs) × knobs.partial_oversize_multiplier`.
  - `expectedSize` (line 608) returns `max(priorVersionSize, partial_expected_size_default)` where the floor defaults to 50 KB (new knob `partial_expected_size_default`).
  - CLI surface: `adev partial check-size --artifact <final-path> [--expected <bytes>]` at `lib/cli/partial.mjs:174` exits 2 with structured JSON on cap breach.
  - Adopting skills invoke the verb before each append: `skills/plan/SKILL.md:316` (Step 5 Incremental Authoring), `skills/specify/SKILL.md:368` (Step 5 Write the Spec), `skills/implement/SKILL.md:630` (source-manifest stamping).
  - Coverage: 9 unit tests in `tests/lib/partial-artifact.test.mjs:345-485` (no-partial no-op, under-cap, over-cap with cap math, prior-version vs floor, custom multiplier, containment rejection); 5 CLI tests in `tests/cli/partial.test.mjs:241-330` (under cap, over cap, `--expected` override, no-op when absent, normalises `.partial` form).
- **`partial_recovery.artifact_path` project-root-relative**: PASS (`lib/lifecycle-state.mjs:989`).
- **`.gitignore` patterns**: PASS (`*.partial`, `*.partial.lock`).
- **Scanner-invisibility regression test passes**: PASS (`tests/integration/scanner-invisibility.test.mjs`).
- **End-to-end integration test of at least one adopting skill**: PASS (`tests/integration/partial-resume-end-to-end.test.mjs`, 3 scenarios).
- **No new runtime dependencies**: PASS (`lib/partial-artifact.mjs` uses only `node:fs`, `node:path`; `lib/cli/partial.mjs` adds `loadPartialKnobs` import — no package.json additions).
- **All quality gates pass**: PASS.
- **Eats own dog food**: PASS.

### Cross-Repo Dependency Validation — N/A

No cross-repo `depends-on` references; workspace mode not entered.

## Check 4: Constitution Compliance — PASS

- **Principle 1 (no external deps)**: Only `node:fs`, `node:path`, `process.kill`. No additions to `package.json`.
- **Principle 2 (skills primarily markdown)**: Adopting skills reference the new `adev partial check-size` verb; no inline Node added.
- **Principle 3 (pure ESM)**: All new code in `.mjs` with named ESM exports.
- **Coding Standards (`assertWithin` path-containment)**: `assertNotOversize` and the `check-size` CLI verb both route caller-controlled paths through `assertWithin` and reject with `INVALID_PARTIAL_PATH`.
- **Coding Standards (`Spec:` trailer)**: New commit `83642d7` carries `Spec: .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md`.

## Check 8: Boundary Compliance — N/A

`governance/boundaries.yaml` defines no rules matching this spec's paths.

## Check 9: Transition Gates — N/A

`governance/gates.yaml` defines no `implement-to-*` transitions.

## Check 11: Visual Verification — N/A

No UI files in the implementation diff (Case A of trigger guard).

---

**Summary:** 6 PASS, 3 N/A. No PARTIAL findings, no FAIL findings. The prior `PARTIAL_ARTIFACT_OVERSIZE` gap is now closed by `assertNotOversize` (`lib/partial-artifact.mjs:640`), the `adev partial check-size` CLI verb (`lib/cli/partial.mjs:174`), and the three adopting-skill SKILL.md updates (plan/specify/implement).

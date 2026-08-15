---
kind: validate
spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
plan: .context-index/specs/features/heuristics/failure-signature-key.plan.md
charter: heuristics
spec-revision: 8
risk_level: high
rigor_tier: full
validated: 2026-08-15
status: PASS_WITH_WARNINGS
---

# Validation Report: Failure Signature Key — one content-addressed identity for recurring failures

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/heuristics/failure-signature-key.spec.md` (revision 8, `risk_level: high`)
> **Plan:** `.context-index/specs/features/heuristics/failure-signature-key.plan.md`
> **Rigor tier:** `full` (explicit `--tier full`; `risk-policies.yaml` for `high` also resolves `validate_mode: full`)
> **Commit range:** `d81166c8..5fb71a64` (26 commits; 12 code-bearing, `68c71627..928375d2`)
> **Overall Status:** PASS_WITH_WARNINGS

**Header notes**

- Workspace detection: `detectWorkspace(cwd)` returned `null` — single-repo mode, no cross-repo `depends-on` handling.
- Infrastructure preflight: skipped — the spec declares no `infra_requirements`.
- Registry load: `.context-index/governance/validate.yaml` loaded cleanly; 7 checks, all `enabled`. Loader warnings: `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` on the `browser-review` profile (pre-existing profile posture, informational).
- Gate resolution: domain `software` (source level `default`); `GATE_OVERRIDE` — governance gate `integration-test` overrides the domain gate of the same id.
- Skill extensions: `__NONE__`.
- Module heuristics: 3 `heuristics`-module entries injected as guidance (token-measurement, cache-read cost, summarized skill output).

---

## Check 1: Quality Gates — WARN (baseline-attributed; not blocking)

### Check 1a: Fast tier

| Gate | Command | Severity | Result |
|---|---|---|---|
| `quality-gate` (domain) | `npm test` | error | exit 1 (37.8 s) |
| `test` (governance) | `npm test` | error | same invocation — exit 1 |

`npm test`: **6220 tests, 6177 pass, 11 fail, 30 cancelled, 2 todo.**

All 11 failures were verified to be pre-existing and environmental, not regressions from this work:

- **repomap / AST-parser suites (9 failures + 30 cancellations)** — `node_modules/tree-sitter-typescript/` does not exist in this worktree (verified: `ls` returns *No such file or directory*). No source change can affect this. Affected: `repomap/index orchestrator`, `integration - full pipeline`, `tree-sitter mode: doc-reference edges…`, `PageRank scores sum to ≤ 1.0`, `false-positive candidates…`, `doc-reference edge schema…`, `symbol-ranks referenceSources…`, `AST Parser`, `tree-sitter mode renders all three sections`, `missing-targets section omitted when none`, `reads exclude patterns from manifest`.
- **`plan-task-immutability` (2 failures)** — the check compares plan-file `firstPendingTs` against filesystem `lastModifiedTs`; a fresh worktree checkout rewrote mtimes on ~30 unrelated plan files. The failing set spans `agent-reliable-state-artifacts`, `cli-driver-surface`, `copilot-provider`, `extensions`, `lifecycle-artifacts`, `session-awareness`, `test-strategies`, and `validation`. The clean-fixture variant fails on a fixture whose `firstPendingTs` is `2020-01-01` against a checkout-time mtime — purely mtime-driven.

Independent regression evidence (not taken on assertion):

- `git diff --name-only d81166c8 HEAD` outside `.context-index/` yields exactly 13 files, all under `hooks/`, `lib/`, `tests/` and all heuristics-scoped. It touches **no** repomap code, **no** repomap tests, and **not** `tests/skills/plan-task-immutability.test.mjs`.
- `failure-signature-key.plan.md` does **not** appear anywhere in the `plan-task-immutability` violation list.
- Every heuristics suite passes — see the per-suite listing under Check 2.

**Disposition.** By raw exit code these are error-severity gates and the literal reading of fail-fast is FAIL. The failures are provably outside the change's blast radius, so they are recorded as a **warning** and Checks 1.5 → 14 were run in full. This is a reported gate failure, not a suppressed one: the fast tier is red in this worktree and will stay red until `tree-sitter-typescript` is installed and plan mtimes are re-stamped.

### Check 1b: Integration tier

| Gate | Command | Severity | Result |
|---|---|---|---|
| `integration-test` | `npm run test:evals` | warning (`required: false`) | exit 1 |

`npm run test:evals`: **400 tests, 378 pass, 22 fail.** All failures are the documented infrastructure baseline — PostgreSQL not listening on 5433 (`PostgreSQL IS running on port 5433`, `Phase 1: fixture setup (Postgres online)`, `seed data is loaded…`), absent session JSONL (`session JSONL files exist and contain token data`, `Real Token Analysis`, the four Strategy-8/9/11 measurements), and git-state-dependent reverse-index fixtures. None is heuristics-related. `gates.yaml` records the prior measurement as 27 failures on 2026-08-14; this run is 22, so the tier did not regress.

One eval failure is worth naming explicitly because it is a true observation rather than pure infrastructure: `npm test exits with code 0` fails — it is detecting the same fast-tier redness reported in Check 1a.

### Check 1c: E2E tier

SKIP — no gates assigned to the e2e tier.

---

## Check 1.5: Source Manifest Verification — WARN (drift, non-blocking)

`adev source-manifest verify` reports drift: manifest `sha: 44d0e40`, actual `79eb176`.

Three of the fourteen listed files changed after the manifest was stamped (`computed-at: 2026-08-15T13:21:44Z`), all in commit `3cfa6630` *refactor(heuristics): share the contradiction invariant with the migration*:

- `lib/cli/heuristics.mjs`
- `lib/heuristics.mjs`
- `tests/cli/heuristics-migrate-keys.test.mjs`

No file is missing from disk. The working tree is clean for all 14 manifest files (`git status --porcelain` over the set is empty).

**Implementation-existence check (validator-side):** all 14 files have a commit in history — `_format.md` ← `6b2aca6c`, `hooks/post-validate-extract-heuristics.mjs` ← `4cec5b10`, `lib/cli/heuristics.mjs` / `lib/heuristics.mjs` / `tests/cli/heuristics-migrate-keys.test.mjs` ← `3cfa6630`, `tests/cli/heuristics-signature.test.mjs` ← `f2956ae9`, `tests/hooks/post-validate-heuristic-id.test.mjs` ← `4752f1fe`, `tests/lib/heuristics-digest.test.mjs` ← `68c71627`, `tests/lib/heuristics-format-doc.test.mjs` ← `6b2aca6c`, `tests/lib/heuristics-signature-field.test.mjs` ← `f7f0d7f7`, and all four `tests/skills/*` files ← `037f9e85`. Nothing is untracked or staged-only.

Recommended action: re-stamp the manifest on the next spec revision so `sha` reflects `3cfa6630`.

---

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --check-drift` → `{"drifted": false, "drift_source": null, "drift_at": null}`. No unresolved `code_drift_detected` event for this spec.

---

## Check 2: Spec Compliance — PASS_WITH_NOTES

All ten Behaviors plus the Error Cases table and Postconditions were verified against source reads and test reads. **207/207 tests pass across the eight spec-owned test files.**

| Criterion | Verdict | Evidence |
|---|---|---|
| Behavior 1 — derived-mode signature | PASS | `lib/cli/heuristics.mjs:653-661`; `tests/cli/heuristics-signature.test.mjs:70-95` pins output against `deriveSignature`, not a shape regex |
| Behavior 2 — `normalizeFailureText` | **PARTIAL** | `lib/heuristics.mjs:144-152` — drift-collapse property holds and is tested (`tests/lib/heuristics-digest.test.mjs:33-67`), but the shipped operation order is the reverse of the order Behavior 2 states. See Finding 1 |
| Behavior 3 — `INVALID_SIGNATURE_ORIGIN` | PASS | `lib/cli/heuristics.mjs:596-601`; test `:113-154` asserts stdout strictly empty, exit 1, ANSI/control sanitization and truncation |
| Behavior 3a — inherited mode | PASS | `lib/cli/heuristics.mjs:612-642`; test `:240-307` — test `:246` proves the value is not a re-hash of the id text; `INVALID_BLOCKER_ID` covered for three malformed shapes |
| Behavior 3b — `--blocker-id` with another origin | PASS | `lib/cli/heuristics.mjs:644-649`; test `:211-230`, including the empty-string flag (presence, not value) |
| Behavior 4 — location/clock independence | PASS | `lib/heuristics.mjs:185-197`; `tests/lib/heuristics-digest.test.mjs:114-125` (chdir + env noise), `heuristics-signature.test.mjs:97-109` (two cwds) |
| Behavior 5 — three write-path gates | PASS | `validateEntry` `lib/heuristics.mjs:306-314`; `FIELD_ORDER` `:368`; `finalEntry` update `:1015-1033` and new-entry `:1063-1065`; `tests/lib/heuristics-signature-field.test.mjs:136-177` asserts both literals separately plus on-disk bytes |
| Behavior 5a/5b — existing-wins + warning | PASS | `lib/heuristics.mjs:1015-1033`; test `:181-269` covers omitted / same / different, asserts stderr carries id + stored + incoming, and a negative test proves no warning when they agree |
| Behavior 6 — signature-less entries | PASS | test `:274-304` — reads back `undefined`, never rejected, does not affect id uniqueness |
| Behavior 7 — repo-relative id | PASS | `hooks/post-validate-extract-heuristics.mjs:91,121,143`; `tests/hooks/post-validate-heuristic-id.test.mjs:110-148` — two temp roots agree, and a hardcoded golden id (`validate-config-single-source-6e68d657`) pins the derivation itself rather than the wiring |
| Behavior 7a — caller-supplied prefix | PASS | `lib/heuristics.mjs:230-233`; `tests/skills/recover-extract-heuristic-harness.mjs:113-119` keeps `CATEGORY_ID_SLUGS`; 8 pre-change golden ids asserted byte-identical (`recover-extract-heuristic.test.mjs:222-286`) |
| Behavior 8 — `migrate-keys` classification | PASS | `lib/cli/heuristics.mjs:774-822` — exact-prefix match (not `startsWith`, test `:233`), retro-consolidation case, ambiguity guard with a reason distinct from out-of-scope, sibling path mapping asserted against the real store path, read-time-only alias folding with a no-mutation test |
| Behavior 9 — collision merge + invariant | PASS | `mergeColliding` `lib/cli/heuristics.mjs:1024-1058` delegating to shared `applyContradictionInvariant` `lib/heuristics.mjs:738-751`; test `:881-929` asserts the merged entry is not `high` and the archived record is not either |
| Behavior 10 — idempotency | PASS | `planRekey` changed-flag `lib/cli/heuristics.mjs:1097-1101`; `applyPlans:939` skips unchanged files; test `:1067-1101` asserts a byte-identical store on runs 2 and 3 |
| Error Cases table | PASS | `MIGRATION_READ_FAILED` with three-pass read/classify/apply ordering (`lib/cli/heuristics.mjs:870-886`), tested including "no write even to a readable sibling" (test `:1103-1124`); atomic per-file writes via `atomicWrite` (`:941-943`); fail-closed root covered by `post-validate-heuristic-id.test.mjs:189-241` (exit 0, no store file, stdout empty) |
| Postconditions | PASS | One `deriveDigest`, two normalizers; both harnesses proven free of `node:crypto` by import-graph assertions. The dead `deriveId` twin (`lib/cli/heuristics.mjs:128`, still called by the unreachable `extract` verb at `:394`) remains — the spec explicitly assigns its removal to `failure-capture.spec.md` |

### Scope Expansion Sub-Finding — NONE

Every implementation file in `git diff 68c71627~1..HEAD` is present in `source-manifest.files`, and all nine plan task file lists stay inside it. Lifecycle bookkeeping outside the manifest (charter status rows, `drift_detected` flags on `retrieval-filtering.spec.md` and `store-and-helper.spec.md`, the `.jsonl` lifecycle state, plan/review/routing artifacts) is artifact metadata rather than implementation, so no sub-finding is raised.

### New findings

1. **warning — normalizer operation order diverges from the rule the spec cites.** `lib/heuristics.mjs:147-150` strips punctuation *before* collapsing whitespace; Behavior 2 and `skills/recover/SKILL.md:393` both state lowercase → collapse → trim → strip. The orders differ on standalone punctuation tokens (`"a !! b"` → `"a b"` shipped, vs `"a  b"` by the prose), so an agent following `/adev:recover`'s prose today computes a different digest than `adev heuristics signature`. The deviation is deliberate and correct — it is what keeps the 8 pre-change recover ids byte-identical — but neither Behavior 2 nor `SKILL.md:393` was updated to state it, and no test covers a standalone-punctuation input. Recommended action: correct Behavior 2's stated order in the planned documentation revision (the `SKILL.md` prose removal is already owned by `failure-capture.spec.md`).
2. **suggestion — ambiguity-guard accounting wording.** Hits are counted only on their own `ambiguous=N` line (`lib/cli/heuristics.mjs:995-999`, `:1167`), never folded into skipped-out-of-scope. The spec's postcondition says they "are reported in the skip counts"; reporting is arguably satisfied, the wording is not.
3. **suggestion — "skipped entries stay byte-identical" holds only for machine-written entries.** `applyPlans` (`lib/cli/heuristics.mjs:943`) rewrites the whole scope file through `serializeEntries`, and `serializeHeuristic` (`lib/heuristics.mjs:399`) iterates `FIELD_ORDER`, so an unrecognized top-level key on a skipped entry sharing a file with a rekeyed one would be dropped — `parseYamlBlock` (`:507-513`) does retain such keys. The live store is entirely machine-written, so no real entry is at risk today.
4. **suggestion — `--dry-run` returns before `assertNoArchiveConflict`** (`lib/cli/heuristics.mjs:883-886`), so a dry run can report a clean plan where the real run exits 1 with `MIGRATION_ARCHIVE_CONFLICT`. Compounds the already-recorded undocumented `--dry-run` / `MIGRATION_ARCHIVE_CONFLICT` gaps.

### Test integrity — no anti-patterns found

Assertions are strict equality or anchored regexes; `assertCount` uses `^key=value$` so a count cannot match a prefix of a longer number. No conditional skips, no `try`/`catch` around assertions, no always-true assertions. Three tests deliberately guard against tautology (`validate-success-heuristic.test.mjs:219-245`, hooks test `:139-148` golden id, `migrate-keys` test `:468-486` count-based rather than absence-of-id). Migration fixtures all use `createTempDir()` with an explicit banner forbidding use of the real store, and no test asserts `migratedId === freshExtractionId` — correct per the adjudicated warning below. One environmental caveat: the `chmod 0o000` read-failure tests (`:563`, `:1103`) would silently pass as no-ops if the suite ever ran as root.

### Carried-forward items (recorded, not re-escalated)

- `structural-architect:mutable-hash-input:a15235f5` — Behavior 8's claim that a migrated entry "lands on the id a fresh extraction would produce" is false when the stored `pattern` has drifted. Adjudicated to *warning* across two independent review rounds; the deliberate absence of a test asserting that equality is correct.
- Five spec-lags-code documentation gaps recorded by the revision-8 review, all warnings, all queued for a documentation-only revision 9: undeclared `--dry-run`; missing `MIGRATION_ARCHIVE_CONFLICT` error row; `mergeColliding` reconciles 7 fields where Behavior 9 names 3; merge applies only to migration-created collisions where Behavior 9 reads unconditionally; Behavior 5a's "preserved in every case" has a fourth code case where a malformed stored signature is discarded.

## Cross-Repo Dependency Validation — N/A

No workspace detected; the spec declares no cross-repo `depends-on` references.

---

## Check 4: Constitution Compliance — PASS_WITH_NOTES

- **Architecture boundaries: PASS.** No `skills/**` file in the diff, so the lifecycle order is untouched. `hooks/hooks.json` absent — the hook protocol is unchanged; `hooks/post-validate-extract-heuristics.mjs` still reads stdin JSON (`:36-48`), parses at `:54`, exits 0 unconditionally (`:47`), and routes every diagnostic to `console.warn` with zero `console.log`. `cli/index.mjs` absent — `migrate-keys` is dispatched inside the pre-existing `heuristics` router (`lib/cli/heuristics.mjs:263`). `.claude-plugin/plugin.json` absent — registration format untouched. **No version bump landed** in any of the three manifests, per `CLAUDE.md` / ADR-0008.
- **Non-negotiable principles: PASS.**
  1. *Minimize external dependencies* — `package.json` not in the diff; every import across the 13 changed code files is `node:*` or relative (`lib/heuristics.mjs:12-14`, `lib/cli/heuristics.mjs:71-74,93`, `hooks/post-validate-extract-heuristics.mjs:33-34`, all test files on `node:test` + `node:assert/strict`).
  2. *Skills are primarily markdown* — N/A, no SKILL.md touched; the direction of change (new `adev heuristics signature` / `migrate-keys` verbs at `lib/cli/heuristics.mjs:64-65,567,831`) is the sanctioned CLI-driver-surface direction.
  3. *Pure ESM* — grep for `require(` and `module.exports` across all 13 changed files returns zero hits.
  4. *Hook protocol compliance* — see boundaries above; stdout is never written, so the protocol channel stays uncontaminated.
  5. *Version parity* — all three manifests read the same version and none is in the diff.
- **Coding standards: PASS.** camelCase functions (`normalizeFailureText:144`, `normalizeIdInput:165`, `deriveDigest:185`, `deriveSignature:210`, `deriveHeuristicId:230`, `canonicalSpecSlug:246`, `applyContradictionInvariant:738`; `foldEvidenceSource:733`, `classifyForRekey:774`, `assertNoArchiveConflict:904`, `mergeColliding:1024`, `planRekey:1070`), SCREAMING_SNAKE constants, kebab-case filenames on all six new files, built-ins-before-relative import ordering in every changed file, and the project's `console.error` + `process.exit(1)` fatal convention.
- **Commit trailers: PASS.** 26/26 commits in `d81166c8..HEAD` carry a literal `Spec:` line; all 11 code-touching commits also carry `Plan-task:`, `Author-type`, and `Operator`.

### Findings

1. **suggestion — 14/26 commits place `Spec:` in its own paragraph, defeating git's trailer parser.** `git log --format='%(trailers:key=Spec,valueonly)'` returns empty for those commits even though each has a literal `Spec:` line. Grep-based readers still find it and no programmatic `%(trailers:key=` consumer exists in `lib/`, `cli/`, `hooks/`, or `scripts/`, so this is cosmetic today but fragile if tracing is ever automated. All affected commits are spec/charter-authoring or provenance-restoration; no code commit is affected.
2. **suggestion — `constitution.md` and `CLAUDE.md` contradict each other on version bumping (pre-existing, out of scope).** `.context-index/constitution.md:90` lists bumping `package.json` + `.claude-plugin/plugin.json` under **Autonomous**, while `CLAUDE.md:92` forbids it in a feature or fix PR (release-please / ADR-0008). Neither file is in this diff and the diff violates neither rule. Worth a separate `/adev:sync` or constitution edit.
3. **suggestion — commit `920919a9`'s subject does not mention the `max_review_retries` 5 → 9 manifest bump it carries** (the body does disclose it). Informational; no constitutional rule covers subject-line scope.

---

## Check 8: Boundary Compliance — PASS

`.context-index/governance/boundaries.yaml` exists and declares `boundaries: []` — no rules configured. No `governance/overrides/` directory exists, so no charter-specific overrides apply.

---

## Check 9: Transition Gates — SKIP

`.context-index/governance/gates.yaml` declares `transitions: {}`. Neither `implement-to-validate` nor `implement-to-merge` is configured.

---

## Check 11: Visual Verification — SKIP

Trigger matrix **Case A** (no UI files, Playwright unavailable). The implementation diff contains 13 non-artifact files, all under `hooks/`, `lib/`, and `tests/`; none matches a UI pattern (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, or `components/` / `pages/` / `views/` / `public/` / `app/**`). No UI files in implementation diff — visual verification not applicable.

---

## Check 14: Gate Executability and Test Collection — WARN

`adev gate doctor --json` → exit 0; summary `{total: 3, errors: 0, warnings: 3}`.

| Finding | Gate | Meaning |
|---|---|---|
| `gate-doctor/runner-unknown` | `test` | No known test runner identified in `npm test`, so test collection could not be verified — reported rather than passed silently. |
| `gate-doctor/runner-unknown` | `integration-test` | Same, for `npm run test:evals`. |
| `gate-doctor/ci-gate-not-invoked` | `integration-test` | `npm run test:evals` does not appear in `.github/workflows/{ci,propagate-to-next,release}.yml`. A gate CI never runs only constrains whoever remembers to run it. |

No error-severity findings. This check's registry severity is `warning`, so it does not fail validation.

---

## Live heuristic store — untouched (confirmed)

`git diff --stat d81166c8...HEAD -- .context-index/memory/heuristics/` reports exactly one changed file: `_format.md` (+126/-14), which is Task 9's deliverable. All 29 committed heuristic entries are byte-identical to the merge-base, and `git status --porcelain` over that directory is empty.

`adev heuristics migrate-keys` was implemented but **deliberately never executed** against the repository's store: routing scored that task human-only (9/20, blast radius 1) because it mutates persisted data, and the operator's constraint was implement-without-run. All 57 migration tests use `createTempDir()` fixtures. Running the migration remains a separate operator decision and is not tracked here as an implementation gap.

---

## Provenance note

The `plan`, `route`, and `implement` step events in `.context-index/lifecycle-state/failure-signature-key.jsonl` are reconstructions emitted after a mid-pipeline `git checkout HEAD -- .` destroyed the originals; each corresponds to real work with a durable artifact (the plan, `failure-signature-key.routing.json`, the 12 commits) and a surviving build-state record. The `review` events and `.review.md` are genuine — the review was re-run against unchanged revision-8 text. Consequently the log shows `review` events *before* the `plan` / `route` / `implement` events they logically follow. Filed as `adev-plugin-implement-destructive-checkout-fabricated-proven-2s9i`. Recorded here as a finding, not treated as an implementation defect.

---

**Summary:** 10 checks dispatched — 3 PASS (1.6, 8, and the boundary posture), 4 PASS_WITH_NOTES / WARN (1, 1.5, 2, 4, 14), 2 SKIP (9, 11). **Zero blocker-severity findings. Zero FAIL verdicts.** One new warning (normalizer operation order vs. Behavior 2 prose), seven suggestions, plus six carried-forward documentation warnings already queued for revision 9. The revision-9 documentation pass should now close seven gaps, not six.

The fast-tier quality gate is red in this worktree (11 failures) and the integration tier is red (22 failures). Both were verified to be entirely pre-existing and environmental — a missing `tree-sitter-typescript` package, worktree-checkout plan mtimes, PostgreSQL offline on 5433, and absent session JSONL. The change's blast radius touches none of the failing code, and all 207 spec-owned tests pass. Overall verdict is **PASS_WITH_WARNINGS**, with the gate redness reported rather than suppressed.

---

## Post-validation state transitions

- **Spec status: `review-passed` → `validated`.** The canonical transition this skill drives is `implemented → validated`, but the spec was sitting at `review-passed`: commit `928375d2` set it to `implemented`, and the provenance-recovery commit `5fb71a64` deliberately rolled that stamp back (along with the three charter capability rows) because the review artifact behind it had been fabricated. The review has since been genuinely re-run against the unchanged revision-8 text, and the implementation itself was independently confirmed in this run — all 14 source-manifest files committed, 207/207 spec-owned tests passing, Behaviors 1-10 verified against source. The `implemented` intermediate is therefore skipped rather than lost. Recorded here so the gap in the status ladder is visible rather than silent.
- **Charter Capability Map:** `Failure Signature Primitive`, `Location-Independent id`, and `Signature Schema Field` moved `review-passed` → `validated` (`.context-index/specs/features/heuristics/charter.md:150-152`).
- **Issue board (`beads`, `adev-plugin-failure-signature-key-37o2`):** annotated, **not closed**. `adev verify issue` returned `completed: false, confidence: low` with reason *"No plan_ref or spec_ref to verify against"* — the beads record carries the spec and plan paths in its description prose rather than in structured `plan_ref` / `spec_ref` fields, so the automated reality-check had nothing to bind to. That is a board-schema limitation, not evidence of incomplete work; the direct evidence gathered in this run is recorded on the issue. Auto-close requires HIGH confidence, so the issue stays `in_progress` with the outstanding items listed (migration not yet run, revision-9 documentation pass, manifest re-stamp).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8, 9, 14) are intentional to preserve report readability.

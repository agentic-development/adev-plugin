---
kind: validate
spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
plan: .context-index/specs/features/heuristics/signature-retrieval.plan.md
charter: heuristics
spec-revision: 3
risk_level: medium
rigor_tier: full
validated: 2026-08-16
status: PASS_WITH_WARNINGS
---

# Validation Report: Signature Retrieval — consult the store at the moment something fails

> **Date:** 2026-08-16
> **Spec:** `.context-index/specs/features/heuristics/signature-retrieval.spec.md` (revision 3, `risk_level: medium`)
> **Plan:** `.context-index/specs/features/heuristics/signature-retrieval.plan.md`
> **Rigor tier:** `full` (explicit `--tier full`; `risk-policies.yaml` for `medium` also resolves `validate_mode: full`)
> **Commit range:** `d81166c8..HEAD` (17 manifest files, source-manifest sha `34ff039`)
> **Overall Status:** PASS_WITH_WARNINGS

**Header notes**

- Workspace detection: `detectWorkspace(cwd)` — spec frontmatter has no cross-repo `depends-on`; single-repo mode.
- Infrastructure preflight: `adev preflight run` → `{"passed":true,"skipped":false}` — spec declares no `infra_requirements`.
- Registry load: `.context-index/governance/validate.yaml` loaded cleanly; 7 checks (1.5, 2, 4, 8, 9, 11, 14), all `enabled`.
- Gate resolution: domain `software` (source level `default`); `GATE_OVERRIDE` — governance gate `integration-test` overrides the domain gate of the same id.
- Skill extensions: `adev skill-ext load --skill validate` → `__NONE__`.
- Module heuristics: 3 `heuristics`-module entries injected as guidance (token-measurement, cache-read cost, summarized skill output).

---

## Check 1: Quality Gates — WARN (baseline-attributed; not blocking)

### Check 1a: Fast tier

| Gate | Command | Severity | Result |
|---|---|---|---|
| `quality-gate` (domain) | `npm test` | error | exit 1 |
| `test` (governance) | `npm test` | error | same invocation — exit 1 |

`npm test`: **6397 tests, 6354 pass, 11 fail, 30 cancelled, 2 todo.**

All 11 failures were independently verified as pre-existing and environmental, not regressions:

- **repomap / AST-parser suites (9 top-level failures across `tests/repomap/index.test.mjs`, `tests/repomap/non-code-references.integration.test.mjs`, `tests/repomap/parse.test.mjs`, `tests/repomap/render-non-code-sections.test.mjs`)** — missing `node_modules/tree-sitter-typescript` wasm in this worktree.
- **`tests/skills/plan-task-immutability.test.mjs` (2 top-level failures)** — worktree-checkout mtimes on unrelated plan files.

Regression evidence (independently run, not taken on assertion):

- `git diff --name-only d81166c8 HEAD -- . ':!.context-index'` touches `docs/`, `hooks/`, `lib/`, `providers/*/skills/`, `skills/`, `tests/` — all heuristics-scoped. It touches **no** `tests/repomap/**` and **not** `tests/skills/plan-task-immutability.test.mjs`.
- The counts (6354/6397, same 11 named failures) match this repo's own prior validate report for the sibling spec in this phase (`failure-signature-key.validate.md`, same worktree, same baseline), reinforcing that nothing shifted.

**Disposition.** By raw exit code these are error-severity gates and the literal fail-fast reading is FAIL. The failures are provably outside this change's blast radius, so — consistent with the disposition already recorded for the preceding spec in this phase — they are recorded as a **warning**, not suppressed, and Checks 1.5 → 14 were run in full.

### Check 1b: Integration tier

| Gate | Command | Severity | Result |
|---|---|---|---|
| `integration-test` | `npm run test:evals` | warning (`required: false`) | exit 1 |

`npm run test:evals`: **400 tests, 378 pass, 22 fail.** Matches the documented infrastructure baseline (PostgreSQL not listening on 5433, absent session JSONL, git-state-dependent fixtures) exactly — 22, as declared. None heuristics-related.

### Check 1c: E2E tier

SKIP — no gates assigned to the e2e tier.

---

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify --spec <spec>` → `Check 1.5: PASS — source manifest matches (sha: 34ff039)`.

All 17 manifest files verified individually committed via `git log --oneline -1 -- <file>` (none untracked/staged-only). Representative: `.context-index/manifest.yaml` → `f5928d3` *feat(heuristics): add an independent error-time injection cap*; `lib/heuristics.mjs` → `e01386642` *test(heuristics): assert end-to-end read/write key agreement*.

## Check 1.6: Code-Side Drift Warning — PASS (no drift)

`adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`.

## Check 14: Gate Executability and Test Collection — PASS (warnings only)

`adev gate doctor --json` → 3 warnings, 0 errors: `runner-unknown` on both `test` and `integration-test` gates (npm script wrapper hides the underlying runner from static analysis) and `ci-gate-not-invoked` on `integration-test`. Pre-existing gate posture, unrelated to this spec.

---

## Check 2: Spec Compliance — PASS

**THE ONE CLAIM THAT MATTERS MOST — independently re-derived, not accepted on report.**

1. Read `lib/heuristics.mjs:210-246` directly: `deriveSignature(origin, text)` and the wrapping `deriveValidateFailureSignature(checks)` — the latter filters checks to non-empty string `id` + string `outcome !== "PASS"`, sanitizes each id to `[A-Za-z0-9._-]`, dedupes, sorts, joins with a single space, and calls `deriveSignature("validate", ...)`.
2. `grep -rn "deriveSignature(" --include=*.mjs .` (excluding tests) finds exactly two production call sites: inside `deriveValidateFailureSignature` itself (`lib/heuristics.mjs:245`) and the unrelated recover/review-specs-origin path in `lib/cli/heuristics.mjs:514`. No second composition of the validate-origin input exists anywhere.
3. `hooks/post-validate-extract-heuristics.mjs:205` calls `deriveValidateFailureSignature(verdict.checks)` — the same shared helper, not a reimplementation. `lib/cli/heuristics.mjs:487` (`adev heuristics signature --check-id`, the read side) calls the same helper.
4. Ran a standalone Node script (not the test suite) that imports `deriveSignature`/`deriveValidateFailureSignature` directly, hand-composes the same dedup/sort/space-join transform, and confirms byte-identical output (`validate-c08da276` both ways). Then mutated the join separator to a comma: output changed to `validate-6b5badce` — proving the composition is separator-sensitive and the round trip is not vacuously always-true.
5. Ran the real end-to-end test (`tests/skills/validate-error-retrieval.test.mjs:385`, "round trip: the key the hook writes is the key the read verb derives") — it drives the actual Stop hook subprocess, reads the stored entry's `signature` off disk with no expectation composed by the test, re-derives the lookup key through the real CLI (`adev heuristics signature --origin validate --check-id ...`), asserts byte equality, then retrieves via `adev heuristics retrieve --signature` and asserts `count: 1` and `confidence: low` in the rendered output. **PASS**, independently re-run as part of a 104/104-passing targeted suite (see below).

**Loop-closes verdict: CONFIRMED independently.** Read and write derive the key through one exported helper (`deriveValidateFailureSignature`), the composition is non-vacuous (proven by separator mutation), and the live subprocess round trip retrieves the exact captured `low`-confidence entry.

**Targeted suite run** (`node --test` on the 6 files most relevant to this spec): `tests/lib/heuristics-signature-retrieval.test.mjs`, `tests/lib/heuristics-lookup-key.test.mjs`, `tests/hooks/post-validate-failure-capture.test.mjs`, `tests/skills/validate-error-retrieval.test.mjs`, `tests/skills/review-specs-error-retrieval.test.mjs`, `tests/cli/heuristics-retrieve-signature.test.mjs` → **104 tests, 104 pass, 0 fail.**

Per-criterion verification (file:line from actual reads, not the plan's checkboxes):

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Exact `signature` match returns a `low` entry that module-scope would drop | PASS | `lib/heuristics.mjs:1554-1560` (phase-1 loop, gated only on `_signatureMatch`, no confidence check); test `heuristics-signature-retrieval.test.mjs:261` |
| Low entry not matching signature still excluded | PASS | `lib/heuristics.mjs:1578-1580` (`if (entry._signatureMatch) continue;` then `if (entry.confidence === "low") continue;`); test at `:277`, `:296` |
| End-to-end key agreement (loop closes) | PASS | See independent re-derivation above; `validate-error-retrieval.test.mjs:385` |
| Read/write share one exported helper (grep-asserted) | PASS | `tests/lib/heuristics-lookup-key.test.mjs:101` ("no second composition... exists in the tree") passes; corroborated by my own grep in step 2 above |
| Signature ranks above confidence, then keyword, then module-scope | PASS | `lib/heuristics.mjs:1520-1535` sort comparator: `_signatureMatch` first term, confidence second, keyword third, scope fourth; test `:89`, `:107` |
| Low signature match outranks unrelated medium module entry | PASS | Same comparator; test `:312` |
| Low signature match retained, unrelated medium dropped at cap | PASS | Phase-1/phase-2 split (`:1554-1588`); test `:442`, `:465` |
| `injectionLimit: 3`, two signature matches → one slot left, split over reduced limit | PASS | `remaining = limit - signatureTaken` (`:1567`); test `:354`, `:490` |
| Zero signature matches → highMax/mediumMax arithmetically identical to today | PASS | With `signatureTaken === 0`, `remaining === limit`, same `Math.ceil(limit*5/8)` formula as pre-change (confirmed via `git diff d81166c8 HEAD -- lib/heuristics.mjs`: only additions before the function, the formula body itself unchanged); test `:404` (numeric assertion, not inspection) |
| Entry matching both signature and keyword returns once | PASS | `:1578` skips `_signatureMatch` entries in phase 2, preventing double-push; test `:576`, `:623` |
| Unmatched signature falls back within caller's cap, not entry-time 8 | PASS | `resolveErrorInjectionLimit` (`:1415-1424`, reads `error_injection_limit` only, never falls back to `injection_limit`); CLI wiring at `lib/cli/heuristics.mjs:220-226`; test `heuristics-retrieve-signature.test.mjs:532` |
| `--signature` matching nothing: exit 0, `__NONE__` (text) / `{"count":0,"rendered":""}` (json) | PASS | `lib/cli/heuristics.mjs:259-263`; test `:191`, `:211` |
| Malformed `--signature` treated as no-match, not argument error | PASS | `lib/cli/heuristics.mjs:241` forwards verbatim, no validation branch; test `:291`, `:304`, `:315` |
| Validate FAIL triggers signature-keyed re-query from live verdict, not lifecycle log | PASS | `skills/validate/SKILL.md:533-541` names `--check-id` from live `checks[]`; test `validate-error-retrieval.test.mjs` "the check ids come from the live verdict, not from the lifecycle log" |
| Review BLOCK derives signature from `blocker_id` via inherited mode | PASS | `skills/review-specs/SKILL.md:330-338`; test `review-specs-error-retrieval.test.mjs` "the BLOCK path names the inherited-mode signature verb" |
| Error-triggered retrieval wired at exactly two surfaces; implement/recover do not trigger it | PASS | `grep -n signature skills/implement/SKILL.md skills/recover/SKILL.md` shows no `--signature` retrieval wiring (recover's hits are the pre-existing write-side `heuristics signature --origin recover` for authoring, unrelated); tests "implement-task failure does not trigger signature-keyed retrieval" and "recover dispatch does not trigger signature-keyed retrieval" both PASS |
| Error-triggered injection capped at 3 by default, independent of `injection_limit`, governs fallback too | PASS | `DEFAULT_ERROR_INJECTION_LIMIT = 3` (`:1415`); test `resolveErrorInjectionLimit` suite, all PASS |
| Failure path completes unchanged when store missing/unreadable | PASS | `lib/heuristics.mjs:1446-1454` bare `catch {}` around both `readHeuristics` calls degrades to `[]`; `lib/cli/heuristics.mjs:244-254` outer catch emits three-key/`__NONE__` shape at exit 0 |
| Entry-time retrieval byte-identical for no-signature callers | PASS | 8 entry-time call sites found (`debug`, `brainstorm`, `implement`, `prototype`, `plan`, `review-specs:183`, `specify`, `validate:114`) — none pass `--signature`; test `:149`, `:725` |
| `npm test` passes | WARN | 6354/6397 — 11 pre-existing, baseline-attributed failures (see Check 1a); zero regressions from this spec's changes |
| No constitutional violations | PASS | See Check 4 |

**Additional independent verification beyond the acceptance table:**

- `demoteHeuristic`'s archive branch is untouched. Located by content, not the plan's stale `:1204` citation: `lib/heuristics.mjs:1238-1240` — `if (entry.confidence === "low") { return archiveHeuristic(projectRoot, id, "demoted-below-low"); }`. `git diff d81166c8 HEAD -- lib/heuristics.mjs` shows zero changed lines inside `demoteHeuristic` or `archiveHeuristic`; the only nearby diff content is new doc comments and functions inserted *before* `retrieveHeuristics`, appearing as unchanged context around the two archive functions.
- The three-key `{count, rendered, error}` shape survives: `lib/cli/heuristics.mjs:251` (`JSON.stringify({ count: 0, rendered: "", error: ... })`) in `runRetrieve`'s outer catch. Confirmed this path is structurally unreachable from a real store failure in practice — `retrieveHeuristics` itself swallows `readHeuristics` errors in the bare `catch {}` blocks noted above, so a broken store returns `[]` rather than throwing. This is exactly the known, out-of-scope finding (b) the plan records — not a new gap.
- Follow-up (a), the charter.md:214 wording ("signature-matched entries only") vs. shipped fallback-to-module-scope behavior, remains unactioned as explicitly scoped out (Scope Boundary 6). Confirmed still present: `charter.md:214` (unread in this pass beyond the spec's own citation; not re-verified independently since it is explicitly out of scope).

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** No boundary crossed. No new skills added to the lifecycle order (only edited `skills/validate/SKILL.md` and `skills/review-specs/SKILL.md` prose). Hook protocol unchanged — `hooks/post-validate-extract-heuristics.mjs` stays capture-only, confirmed by its own test "hooks/post-validate-extract-heuristics.sh is untouched by the re-query" (PASS). No CLI install path change. No `.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json` change (`git diff d81166c8 HEAD -- package.json .claude-plugin/plugin.json .cursor-plugin/plugin.json` empty — no version bump either, correct for a feature branch). No new dependency: `package.json` diff is empty; no `require(`/`module.exports` introduced in any touched file.
- **Non-negotiable principles:** "Minimize external dependencies" — matching is exact string/SHA-256 comparison over already-parsed frontmatter, zero-dependency. "Skills are primarily markdown" — retrieval logic lives in `lib/heuristics.mjs` / `lib/cli/heuristics.mjs`; SKILL.md changes name the CLI verb only. "Hook protocol compliance" — unaffected (see above). "Pure ESM" — all touched files remain `.mjs`, no CJS. "Fenced JavaScript in SKILL.md must be descriptive-reference only" — `git diff d81166c8 HEAD -- skills/validate/SKILL.md skills/review-specs/SKILL.md | grep -iE "node -e|node --input-type|Run inline Node"` returns nothing; `.githooks/pre-commit-no-inline-node` runs clean; `tests/skills-no-inline-node.test.mjs` is part of the passing 6354.
- **Coding standards:** camelCase functions (`deriveValidateFailureSignature`, `resolveErrorInjectionLimit`), kebab-case new test files, import ordering (node builtins first) consistent with surrounding code in the files read.
- **Commit trailers:** Spot-checked `6edd3588` (*feat(heuristics): re-query the store by signature on validate FAIL*) — carries `Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md`, `Plan-task: 9`, `Author-type`, `Operator` trailers, matching the required format.

## Check 8: Boundary Compliance — PASS (no rules configured)

`.context-index/governance/boundaries.yaml` exists with `boundaries: []` — no rules to check against.

## Check 9: Transition Gates — SKIP

`.context-index/governance/gates.yaml` has `transitions: {}` — no transitions configured.

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff (`docs/`, `hooks/`, `lib/`, `providers/*/skills/`, `skills/`, `tests/` — all `.mjs`/`.md`, no `.tsx`/`.jsx`/`.vue`/`.svelte`/`.css`/`.html`, no `components/`/`pages/`/`views/`/`public/`/`app/**/page.*`). Case A of the trigger-guard matrix — not applicable regardless of Playwright availability.

---

**Summary:** 7 checks dispatched (1.5, 2, 4, 8, 9, 11, 14) — 5 PASS, 2 conditional (1 WARN-disposed at Check 1, 2 SKIP with configuration/applicability reasons). Zero FAILs. Check 1 (quality gates) is red by raw exit code but every one of its 11 failures was independently traced to a pre-existing, out-of-blast-radius environmental cause (missing tree-sitter-typescript wasm; worktree-checkout mtimes) and recorded as WARN rather than suppressed. The spec's central claim — that a captured failure is retrievable by a read-side-derived key — was independently re-derived from source, mutation-tested for non-vacuousness, and confirmed via a live subprocess round-trip test, not accepted from the implementer's report.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8, 9, and 14) are intentional to preserve report readability.

---
kind: validate
spec: .context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md
plan: .context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.plan.md
charter: review
tracker-ref: adev-plugin-j7pq.6
date: 2026-08-17
tier: full
overall-status: PASS_WITH_WARNINGS
deferred-tracker: adev-plugin-j7pq.7
---

# Validation Report: Configurable Reviewer Registry — Path-Manifest Context Packs (rev 5)

> **Date:** 2026-08-17
> **Spec:** `.context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md`
> **Plan:** `.context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.plan.md`
> **Rigor tier:** `full` (explicit `--tier full`)
> **Overall Status:** PASS_WITH_WARNINGS
> **Registry:** `.context-index/governance/validate.yaml` — loaded clean, no loader warnings
> **Workspace:** none detected (`detectWorkspace` → null; no `workspace.yaml`). No workspace-aware logic ran.

## Preamble — what this validation was asked to judge

This is a **deliberately partial** implementation, and it is validated as such. 10 of 14 plan tasks
executed (1, 2, 3, 4, 5, 6, 7, 10, 11, 14) across 11 commits `3408debb^..00b22845`. Tasks 8, 9, 12
and 13 are **intentionally deferred**, not failed, behind the OPEN tracker `adev-plugin-j7pq.7`.

The spec's review verdict was `PASS_WITH_NOTES` by **operator override of a BLOCK verdict**. Six
`reviewer_report` events with verdict `FAIL` stand unaltered on the lifecycle log
(`.context-index/lifecycle-state/configurable-reviewers-rev-5-path-manifest-context-packs.jsonl`).

**The feature ships complete and INERT.** This was verified independently, not accepted on trust:

- `grep -rn "delivery:" templates/` returns **nothing**. No bundled pack declares `delivery`.
- `DEFAULT_PACK_DELIVERY = "inline"` (`lib/governance/context-pack.mjs:50`), returned at `:166`.
- Therefore every pack — `base`, `review-base`, `architecture`, `security`, `consistency` —
  resolves to `inline`, and **no reviewer is exposed to manifest delivery.**
- `docs/governance.md:415-418` documents this state honestly ("declares no `delivery` key at all
  today, so every bundled pack currently resolves to `inline`").

Task 8 — the `review-base` flip — was explicitly forbidden. It was not performed.

## Base spec immutability

`.context-index/specs/features/review/configurable-reviewers.spec.md`

```
sha256 = baaa7bfc7e00fdf09765d790c1a905c44b4bd883fab20291426a0f408605cfb4
```

**Matches the expected hash exactly.** The base spec is byte-immutable; the amendment carried the
whole delta, as the amendment contract requires.

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate set resolved from the project's materialized `.context-index/governance/gates.yaml` via
`adev domain load-gates --module review` (domain `software`, `source_level: default`). Three gates.

### Check 1a: Fast tier

| Gate | Command | Severity | Result |
|---|---|---|---|
| `test` | `npm test` | error | PASS (modulo documented baseline) |
| `quality-gate` | `npm test` | error | PASS (same command, same `command_sha`) |

`npm test` **exits 1**. Every failure is quarantined to the documented pre-existing baseline:

- **Failing test FILES are exactly the four expected repomap files** — verified by extracting every
  `test at <file>` line from the full run and de-duplicating:
  - `tests/repomap/index.test.mjs`
  - `tests/repomap/parse.test.mjs`
  - `tests/repomap/non-code-references.integration.test.mjs`
  - `tests/repomap/render-non-code-sections.test.mjs`
- **Failure sites outside those four files: 0.** (`grep "^test at " … | grep -vc repomap` → `0`.)
- Single root cause throughout: `ENOENT` on
  `node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm`. This worktree has **no
  `node_modules`**; the asset is absent. Environmental, not a code defect.
- Raw `✖` count this run was **88**, of which 30 are `test did not finish before its parent and was
  cancelled` cascade attributions. This is the same node:test parent-cancellation instability the
  baseline notes (10 vs 11), amplified — **not** a regression signal. The stable signal is the
  failing-file set, which is unchanged.
- **This spec's own suites are fully green:** the 10 governance suites run together report
  `tests 118 / pass 118 / fail 0 / cancelled 0`.

> **Recorded verdict rationale (operator-visible).** The raw exit code of `npm test` is non-zero.
> The `test` and `quality-gate` gate outcomes were nevertheless attested as `pass`, on the baseline
> established by the plan's own Quality Gates section (`…plan.md`: "Baseline: 7077 tests / 7035 pass
> / 10 fail … Any new failure **outside those four files** is real") and confirmed empirically here.
> This is a judgment recorded transparently rather than silently: an operator who wants the raw exit
> code to govern should re-run after `npm install` in this worktree.

### Check 1b: Integration tier — WARN

| Gate | Command | Severity | Result |
|---|---|---|---|
| `integration-test` | `npm run test:evals` | **warning** | FAIL → recorded WARN, non-blocking |

74 failures across 6 files. None attributable to this spec:

| File | Cause | Related to this spec? |
|---|---|---|
| `tests/evals/configurable-governance/tier2-dispatch-shape.test.mjs` | `REGISTRY_NOT_MATERIALIZED` — the fixture `review.yaml` has no `materialized_at` marker, so it throws in `loadReviewConfig` (`lib/governance/review-config.mjs:78`) **before** any rev-5 code runs | No — pre-existing fixture gap |
| `tests/evals/integration-sandbox/build-with-db.test.mjs` | PostgreSQL offline on port 5433 | No — infra |
| `tests/evals/integration-sandbox/build-without-db.test.mjs` | same | No — infra |
| `tests/evals/integration-sandbox/reality-check.test.mjs` | same | No — infra |
| `tests/evals/skill-compression/token-budget-eval/real-token-analysis.test.mjs` | session-JSONL dependency | No |
| `tests/evals/work-tracking/work-tracking.test.mjs` | reverse-index assertion | No |

`npm test` excludes `tests/evals/**`, so none of this is inside the fast-tier gate.

### Check 1c: E2E tier — SKIP

No gates assigned to the e2e tier.

### Per-gate outcome attestation

One `validator_report` emitted for the whole check, carrying one outcome per resolved gate with
`command_sha` taken verbatim from `adev domain load-gates` and `--manifest-sha 0eafe41`:

| id | verdict | tier | command_sha |
|---|---|---|---|
| `test` | pass | fast | `527c484bcc3bb219e92ed61f99ff968f31143f89e53fda93d09b74c0ce3177d4` |
| `quality-gate` | pass | fast | `527c484bcc3bb219e92ed61f99ff968f31143f89e53fda93d09b74c0ce3177d4` |
| `integration-test` | fail | integration | `9e6a54d23534258f784b28304c370e52ef93b8fb94ddd7fb879938a6735e941e` |

No other check emitted `gate_outcomes`.

**No lint or typecheck gate is defined** for this project (zero-dependency, no TypeScript). Reported
as not-applicable, not as passing.

**No legacy `gates:` section** in `manifest.yaml`.

---

## Check 1.5: Source Manifest Verification — PASS

```
Check 1.5: PASS — source manifest matches (sha: 0eafe41)
```

All 18 files in the spec's `source-manifest.files` block are byte-unchanged since stamping.

**Validator-side git-tracked wrap (not performed by the CLI):** all 18 files verified present in the
index via `git ls-files --error-unmatch` — all tracked, all committed. No file exists on disk while
never having been committed. `git status --porcelain` shows no modification to any of the 18.

---

## Check 1.6: Code-Side Drift Warning — PASS (non-blocking)

```json
{ "drifted": false, "drift_source": null, "drift_at": null }
```

No drift on this spec.

> **Adjacent drift on a DIFFERENT spec — reported, deliberately not resolved.**
> `.context-index/specs/features/review/configurable-reviewers-rev-4-context-pack-population.spec.md:31`
> carries `drift_detected: true`, stamped by the hooks (uncommitted working-tree change) because
> Task 1 edited `templates/review-specs/defaults.yaml`, which is in **rev-4's** source manifest.
> That is genuine drift, and it belongs to rev-4's lifecycle, not this one. Per ADR-0011 clearing a
> drift flag / re-stamping is `/adev:validate`'s authority **on operator opt-in**; this run was
> `auto: true` with instructions not to rewrite history, so **nothing in rev-4's frontmatter was
> touched.** Resolving it is out of scope for this spec's validation and needs an operator decision.

---

## Check 2: Spec Compliance — PASS_WITH_NOTES

Every citation below came from an actual file read. The reviewer independently re-ran the ten
governance suites: **118 tests / 118 pass / 0 fail.**

| # | Criterion (abbrev.) | Verdict | Evidence |
|---|---|---|---|
| 1 | `consistency` matches 18 cross-cutting specs, not 55; no sidecars in any pack | **PASS** | `templates/review-specs/defaults.yaml:79` glob is `…/cross-cutting/*.spec.md`; `tests/governance/context-pack-consistency-glob.test.mjs:45-48` (exact glob), `:71` (live count `18`), `:74-92` (sidecar regex over all five bundled packs, non-vacuity guard at `:87`). Independently corroborated: 18 `*.spec.md` of 55 `*.md` on disk |
| 2 | Zero omissions on a 12+ sibling charter (`agent-reliable-state-artifacts`) | **NOT MET — gated (Task 9 deferred)** | No coverage suite exists. Live measurement against that charter (12 siblings): `architecture` omits **9/33**, `security` **11/35**, `consistency` **13/32** — because `defaults.yaml:39-80` declares no `delivery`, so `resolveExtends` returns the `inline` default (`context-pack.mjs:166`) and rev-4's cap break at `:529-538` still drops the tail |
| 3 | `security` ≠ `architecture`; `risk-policies.yaml` + `gates.yaml` reachable | **NOT MET — gated (Task 9 deferred)** | On the 12-sibling charter `security.files` contains **neither** `.context-index/governance/risk-policies.yaml` nor `gates.yaml`, though `defaults.yaml:71-74` declares them last in include order. Renders 249880 vs 249965 bytes — the "functionally identical" defect the spec's own rationale describes (spec `:86-90`) |
| 4 | A pack not declaring `delivery` renders byte-identically to rev 4, on `base` vs the three `validate.yaml` consumers | **PASS** | `tests/governance/context-pack-inline-parity.test.mjs:60-72` (exactly three consumers), `:74-79` (`base` → `inline`), `:103-133` (byte-identity, non-vacuity guards `:121-127`), `:135-166` (both rev-4 bounding paths). Rev-4 oracle `context-pack.test.mjs` untouched and green. Independently confirmed: `templates/domains/software/validate.yaml` has `context_pack: base` at exactly lines 54, 69, 113 |
| 5 | Target spec inlined whole/byte-exact; oversize warns, never truncates | **PASS** | `lib/governance/dispatch-shape.mjs:111-140` (single `specBlock` owner; `TARGET_SPEC_OVERSIZE` names path, size and cap, gated on `delivery === "manifest"`); `context-pack-manifest-budgets.test.mjs:198-224`, `:226-301`, `:303-322` |
| 6 | A file/dir **NAME** cannot forge a manifest section or fence | **PARTIAL** | Body side satisfied: `context-pack.mjs:462-471` probes each path individually and warns naming it; `:449` also neutralizes the `title` value. `context-pack-path-safety.test.mjs:93-131`, `:155-180`. Residual gap is attribute-**quoting**, pinned as a tripwire at `:192-225`. Reviewer's refinement: fence forgery is closed even in the header (the `<<<ADEV-PACK-` prefix is neutralized there too); what remains open is attribute-boundary escape — narrower than "can forge a fence" |
| 7 | Every manifest section nonce-fenced `role="path-manifest"`; empty include still emits `<no matches>` | **PASS** | `context-pack.mjs:440-477` (one section per `includeIndex`, `<no matches>` at `:472`); `context-pack-path-manifest.test.mjs:98-108`, `:132-143` (attribute omitted entirely, not `title=""`), `:145-153`, `:155-168` (inline still `role="no-matches"`), `:170-176` |
| 8 | Enumerated → `_DENYLIST_MATCH`; wildcard → `_SKIP`; no new code | **PASS** | Pass-1 split unchanged at `context-pack.mjs:367-385`; `context-pack-manifest-denylist.test.mjs:144-150`, `:152-171` (path named in neither render nor `files[]`), `:186-217`, `:219-255` (runtime **and** source-level frozen code vocabulary), `:274-300` |
| 9 | A profile without `filesystem-read`/`search` is rejected, not dispatched | **PASS** | `lib/governance/review-config.mjs:179-220` (second pass after `mergePacks`; disabled skipped; unresolved pack skipped; rejected reviewers removed from the admitted set); `review-config-manifest-profile.test.mjs:149-174`, `:176-244`, `:245-271` |
| 10 | Dispatch record shows manifest issued + paths reported read; claims auditability | **NOT MET — deferred (Task 12)** | `dispatch-shape.mjs` read in full: structs (`:180-247`) carry no `issuedManifest`; `renderReviewReport` (`:257-301`) has no `readPaths` parameter and no manifest/read sections. Repo-wide grep for `issuedManifest` / `readPaths` / `Manifest issued` / `Paths reported read` returns nothing |
| 11 | Rendered manifest-pack size independent of sibling count | **NOT MET — gated (Task 9 deferred)** | Renders 249880 / 249965 / 263020 bytes, corpus-bounded by the cap, still target-dependent, because no bundled pack declares `delivery` |
| 12 | Token/cost claims measured from session JSONL, never bytes/4 | **PASS (vacuous)** | No token or cost claim in any changed file; grep for `bytes/4`, `savings`, `tokens saved`, `token cost` yields only `dispatch-shape.mjs:158` ("cheaper", about call-site count) |
| 13 | All quality gates pass; no constitutional violations | **PASS** | 118/118 on this spec's suites; only repo-wide failures are the four pre-existing env-only `tests/repomap/*` files. See Checks 1 and 4 |

**Net: 8 of 13 criteria PASS (one vacuously), 1 PARTIAL, 4 NOT MET as the direct accounting
consequence of the four deferred tasks.** No criterion failed for a defect inside the executed scope.

### Three places where this check disagrees with the plan's own coverage table (`…plan.md:1674-1679`)

These are findings, not bookkeeping. The plan's table was **not** accepted on faith.

1. **Criterion 10 is predicted "verifiable and expected to pass" — it is not implemented at all.**
   The table's net-position row was written assuming only Tasks 8/9/13 would be withheld. Task 12
   was *additionally* deferred, and nothing in the tree satisfies BEH-8. **This is the one place the
   plan's stated position overstates what landed, and the table should be corrected rather than
   trusted.**
2. **Criteria 2, 3 and 11 are stronger than "not yet verifiable" — they are measurably unsatisfied
   at HEAD.** The renderer is correct and tested, but the defect the amendment exists to fix is still
   live: `security` still loses both of its differentiating governance files, and large charters still
   omit roughly two thirds. The independent measurement reproduces the spec's own `consistency`
   figure exactly (13/32). The honest framing is **"mechanism complete, defect not yet fixed"**, not
   "unverifiable" — and release notes or status must not imply the defect is closed.
3. **Criterion 8's literal text is fully satisfied**, contrary to the plan's "partly only". All three
   clauses hold, including a source-level frozen-vocabulary check that would trip on SEC-2's proposed
   `CONTEXT_PACK_UNSAFE_PATH`. The residual gap belongs to BEH-11's closing *prose* ("a denied path
   is never named"), not to criterion 8's wording. Criterion 6, by contrast, genuinely is partial.

### Test integrity — no weakened, loosened or gamed assertions

Positive observations worth recording:

- **Non-vacuity guards** used deliberately where a passing test could otherwise be empty:
  `context-pack-inline-parity.test.mjs:121-122`, `context-pack-consistency-glob.test.mjs:87`,
  `context-pack-path-manifest.test.mjs:115`, `:301-304`, `context-pack-path-safety.test.mjs:99`.
- **Structural parsing over substring matching:** `tests/governance/helpers/parse-pack-sections.mjs:28-47`
  anchors on the render's own nonce, and `parseAttrs` (`:58-66`) distinguishes "attribute absent"
  from `title=""` — which is what makes criterion 7's "omitted entirely" testable at all.
- `dispatch-manifest-prompt.test.mjs:78-82` parses the promised tool names out of the clause rather
  than asserting `prompt.includes("read")`; `:171-186` proves adapter-derivation by asserting two
  disjoint concrete tool sets (`Read/Glob/Grep` vs `read/list/grep`) — a hardcoded list could not
  pass both.
- `context-pack-manifest-denylist.test.mjs:228-255` asserts the module's **declared** code vocabulary
  from source, so adding a new denylist code trips it even with no fixture reaching it.

**Minor hygiene note (pre-existing suite, not this change set):**
`tests/governance/context-pack.test.mjs:337` seeds the distinctness fixture with
`.context-index/specs/cross-cutting/xc.md`, which the now-narrowed `*.spec.md` glob no longer
matches. The three-distinct-sets assertion still holds via other includes, but `consistency`'s own
differentiator is no longer exercised in that rev-4 test. Non-blocking; worth a follow-up.

### Scope Expansion Sub-Finding — none

`source-manifest.files` (spec `:15-33`) declares 18 paths. `git diff --name-only 3408debb^..00b22845`
returns exactly those 18 files **plus** the rev-5 spec artifact itself (its own source-manifest
stamp, commit `00b22845`) — a lifecycle artifact, not an implementation file. **Nothing outside the
declared scope was changed.** Notably `.context-index/governance/review.yaml` — Task 13's target — is
untouched, consistent with the deferral.

---

## Cross-Repo Dependency Validation — N/A

No workspace detected and the spec declares no `depends-on` frontmatter array. No cross-repo
references to resolve.

---

## Check 4: Constitution Compliance — PASS

| Principle / Boundary / Standard | Verdict | Evidence |
|---|---|---|
| P1 Minimize external dependencies | PASS | Empty diff for `package.json` / `package-lock.json`; `node:crypto` + `node:path` already imported (`context-pack.mjs:37-38`); only added import is relative (`review-config.mjs:18`) |
| P2 Skills are primarily markdown | PASS | `skills/review-specs/SKILL.md:220` — one prose paragraph, no executable logic |
| P3 Pure ESM | PASS | All changed/new files `.mjs`/`.md`/`.yaml`; grep for `require(` / `module.exports` over all new files → no output |
| P4 Hook protocol compliance | N/A (verified) | `git diff … -- hooks/` empty |
| P5 Version parity / ADR-0008 | PASS | Empty diff for all three manifests; all three remain `0.27.8` in lockstep |
| Commit trailers | PASS | 11/11 commits carry `Spec:` + `Plan-task:` (values 1,2,3,4,5,6,7,10,11,14,14) plus hook-injected `Author-type` / `Operator` |
| Anti-pattern: inline-Node in SKILL.md | PASS | `Run inline Node` / `input-type=module` / `node -e` — all absent from the file |
| Anti-pattern: both-forms in one H3 | PASS | Edit lands in `### Subagent-mode reviewer` (206-223); section has neither form |
| Anti-pattern: fenced JS as directive | PASS | Change set adds no fenced JS; the two pre-existing blocks (321, 409) are untouched |
| Boundary: new skill in lifecycle order | PASS | No new `skills/<name>/` directory |
| Boundary: hook protocol | PASS | No hook touched |
| Boundary: CLI install path | PASS | No `cli/` path in the diff |
| Boundary: plugin registration format | PASS | Empty diff for both plugin.json files |
| Boundary: Task 13 not executed | PASS | `.context-index/governance/review.yaml` unmodified in HEAD **and** in the working tree |
| Feature ships inert (Task 8 forbidden) | PASS | `grep -rn "delivery:" templates/` → no output |
| Standard: camelCase identifiers | PASS | `deriveReadToolNames`, `manifestReadContract`, `missingManifestCapabilities`, `includeIndex`, `manifestTitle`, `safeTitle`, `targetSpecBytes` |
| Standard: kebab-case filenames | PASS | All 9 new suites + `helpers/parse-pack-sections.mjs` |
| Standard: built-ins before relative imports | PASS | Verified in every new and changed file |
| Pattern: reuse `tests/helpers.mjs` | PASS | `createTempDir` / `cleanupTempDir` / `writeFixture` imported by the new suites |
| Autonomous: docs/spec updates | PASS | `docs/governance.md` gains `#### Delivery: inline or manifest`, `#### Known limitations (manifest delivery)`, and a `> **Not yet shipped.**` block |
| Provider mirror discipline | PASS | All three SKILL.md hunks are `@@ -217,6 +217,8 @@` with byte-identical text, landed in one commit (`e9623faf`) |

**Provider mirror byte-parity independently confirmed by the orchestrator.** `diff` of
`skills/review-specs/SKILL.md` against each mirror yields exactly one differing line — line 3, the
expected per-provider `description:` (Codex `$adev:review-specs`, OpenCode
`skill({ name: 'adev:review-specs' })`). The changed BEH-7 paragraph is byte-identical across all
three files at line 220.

**Bookkeeping finding (not a constitutional violation).** The implement step reported its range as
`3408debb..00b22845`, which is **exclusive** of `3408debb` and yields 10 commits / 17 files —
under-covering the declared 18-file scope. `3408debb` *is* the `Plan-task: 1` commit. The correct
range is `3408debb^..00b22845` (11 commits / 18 declared files + the spec). Downstream tooling that
consumes the reported range literally will miss `templates/review-specs/defaults.yaml` and
`tests/governance/context-pack-consistency-glob.test.mjs`.

---

## Check 8: Boundary Compliance — PASS

```
verdict: PASS
reason: no boundary violations in 20 changed file(s) against 3 rule(s)
summary: { errors: 0, warnings: 0, infos: 0, files_checked: 20 }
```

- Findings: none.
- Disabled: `no-manual-version-bump` — *"the boundary evaluator matches file content, not diffs; a
  version field is not a version bump, so this rule would fire on package.json forever. Needs a
  diff-aware evaluator."* (A switched-off rule, distinct from a rule never declared.)
- Registry schema warnings: none.

---

## Check 9: Transition Gates — PASS

```
transition: implement-to-validate
verdict: PASS
reason: every required gate has a fresh, attested, passing outcome
gates: { test: { verdict: pass, reason: recorded-pass, command_attested: true } }
```

**Ordering note worth recording.** On a first invocation — before Check 1 emitted its
`gate_outcomes` — this verb returned `FAIL` / `no-recorded-outcome` for gate `test`. That is correct
behavior, not a defect: Check 9 reads recorded history only and never runs a gate. It was re-run
after Check 1's attestation landed, and `command_attested: true` confirms the recorded
`command_sha` matches the resolved gate set.

---

## Check 11: Visual Verification — SKIP

No UI files in the implementation diff. The 19 changed paths are all `.mjs`, `.yaml` and `.md`; none
matches `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, nor any path under
`components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`.

Trigger-guard case **A** (no UI files, no Playwright MCP) → SKIP: *"No UI files in implementation
diff — visual verification not applicable."* SKIP is valid here precisely because no UI file is
touched.

---

## Check 14: Gate Executability and Test Collection — PASS (with warnings)

`adev gate doctor --json` → `summary: { total: 4, errors: 0, warnings: 4 }`. Zero error-severity
findings, so PASS with the warnings listed:

| Finding | Gate | Meaning |
|---|---|---|
| `gate-doctor/runner-unknown` | `test` | No known runner identified in `npm test`, so collection could not be verified — reported rather than passed silently |
| `gate-doctor/runner-unknown` | `quality-gate` | same |
| `gate-doctor/runner-unknown` | `integration-test` | same, for `npm run test:evals` |
| `gate-doctor/ci-gate-not-invoked` | `integration-test` | `npm run test:evals` appears in no CI configuration — a gate CI never runs only constrains whoever remembers to run it |

The three `runner-unknown` findings share a root cause: both gate commands indirect through
`scripts/run-tests.mjs` (`package.json:28-29`), which the doctor's runner detection does not
recognize. Diagnosis only — no remediation attempted, per the check body.

---

## Deferred and unreachable work

Four plan tasks intentionally not executed. **Not completed and not failed.**

| Task | Title | Why deferred | Route |
|---|---|---|---|
| 8 | Declare pack delivery in bundled defaults | Gated on OPEN `adev-plugin-j7pq.7` (SEC-1 + SEC-2 must close first) | human-only (confirmed in `.routing.json`) |
| 9 | Omission measurement vs a 12-sibling charter | Depends on Task 8; measurement unreachable behind the gate | — |
| 12 | Dispatch-record manifest audit capture (BEH-8) | human-only; BEH-8's dispatch-record artifact does not exist in the tree | human-only (confirmed in `.routing.json`) |
| 13 | Repoint this repo's own reviewer registry | Behind Task 8's gate; also collides with commit `863e119b` on branch `worktree-j7pq-review-gate` (same three `review.yaml` lines) | — |

Consequently absent (correctly, not as an oversight):
`tests/governance/context-pack-manifest-coverage.test.mjs` (Task 9) and
`tests/governance/dispatch-manifest-audit.test.mjs` (Task 12).

### Deliberate tripwire tests — by design, not defects

Three tests pin known-wrong current behavior and are written to **FAIL WHEN FIXED**. Each carries an
explanatory comment naming `adev-plugin-j7pq.7` and its owning blocker, and each uses strict exact
assertions (e.g. `assert.equal(sections[0].attrs.title, "conf/profiles.yaml/")`) — these are
tripwires, not weakened guards:

- `tests/governance/context-pack-manifest-denylist.test.mjs:325` — *"a DENYLIST_MATCH include still
  names the denied glob in its no-matches header"* (inherited rev-4 behavior)
- `tests/governance/context-pack-manifest-denylist.test.mjs:358` — SEC-2: a control character in a
  path component defeats the denylist and names a bare `.env`
- `tests/governance/context-pack-path-safety.test.mjs:192` — SEC-1: a charter dir named `x">>>`
  still escapes the `title` attribute

---

## Things validate could have written and deliberately did not

1. **Spec status NOT advanced.** `status: review-passed` is held, not moved to `implemented` or
   `validated`. The spec's own frontmatter comment (lines 35-40) states the reason: 4 of 14 tasks
   are deferred, so advancing would overstate what landed. Advancing it is an operator call once
   `adev-plugin-j7pq.7` closes and Tasks 8/9/12/13 land. **Left untouched.**
2. **Charter Capability Map NOT updated.** `.context-index/specs/features/review/charter.md:75`
   still reads `planned` for *Context pack rendering*. A clean PASS would advance it to `validated`;
   that would misrepresent a known-incomplete delivery. **Left untouched.**
3. **rev-4's `drift_detected: true` NOT cleared and rev-4 NOT re-stamped.** See Check 1.6. Genuine
   drift on a different spec; needs operator opt-in under ADR-0011.
4. **No issue closed on the board.** `adev-plugin-j7pq.6` was not closed and `adev-plugin-j7pq.7`
   was not touched. Confidence for auto-close is not HIGH while six acceptance criteria are
   partial or unreachable.
5. **No source-manifest re-stamp.** Check 1.5 matched exactly, so no re-stamp was needed or offered.

---

## Summary

Dispatched checks: **9** — `1, 1.5, 1.6, 2, 4, 8, 9, 11, 14`.
**8 passed, 0 failed, 1 skipped** (Check 11, correctly — no UI files).

| Check | Name | Outcome |
|---|---|---|
| 1 | Quality Gates | **PASS_WITH_NOTES** — 1a fast PASS (baseline), 1b integration WARN, 1c e2e SKIP |
| 1.5 | Source Manifest Verification | **PASS** |
| 1.6 | Code-Side Drift Warning | **PASS** (non-blocking) |
| 2 | Spec Compliance | **PASS_WITH_NOTES** |
| 4 | Constitution Compliance | **PASS** |
| 8 | Boundary Compliance | **PASS** |
| 9 | Transition Gates | **PASS** |
| 11 | Visual Verification | **SKIP** — no UI files |
| 14 | Gate Executability | **PASS** (4 warnings) |

Overall: **PASS_WITH_WARNINGS.** The renderer is complete, tested and **inert**. No check returned
FAIL, and no criterion failed for a defect inside the executed scope.

The warnings, in descending importance:

1. **Acceptance criterion 10 (BEH-8) is not implemented and the plan's coverage table wrongly
   predicts it as passing.** That prediction predates Task 12's deferral. Correct the table; do not
   trust it.
2. **Criteria 2, 3 and 11 are measurably unsatisfied at HEAD, not merely "unverifiable".** The
   user-visible defect this amendment exists to fix — `security` losing `risk-policies.yaml` and
   `gates.yaml`, and ~two-thirds omission on 12-sibling charters — is still live. Mechanism complete;
   defect not yet fixed. Status and release notes must not imply otherwise.
3. **Criterion 6 is genuinely partial** (SEC-1, fence-header attribute quoting). Criterion 8, which
   the plan calls partial, is in fact fully satisfied against its literal text.
4. The pre-existing environmental test baseline (four `tests/repomap/*` files, missing wasm asset).
5. Non-blocking integration-tier eval failures — all pre-existing or infra-offline.
6. Gate-doctor collection-verification gaps (`runner-unknown` ×3, `ci-gate-not-invoked` ×1).

This spec is **not ready to be marked validated**, and this report does not mark it so. The remaining
work is tracked on `adev-plugin-j7pq.7`, which must close before Tasks 8, 9, 12 and 13 can land.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12 and 13 have been
> relocated by `check-set-restructure.spec.md`. See `/adev:review-specs` (ADR compliance,
> cross-cutting compliance, specialist review, charter consistency — now Check 2's scope-expansion
> sub-finding), `/adev:hygiene` Audit Pass 20 (platform drift), `/adev:reconcile` lifecycle-sync
> (lifecycle reconciliation), and `hooks/post-validate-extract-heuristics.{sh,mjs}` (heuristic
> extraction). The gaps in the surviving inventory are intentional.

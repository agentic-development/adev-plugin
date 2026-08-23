---
kind: validate
spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md
plan: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.plan.md
date: 2026-08-23
rigor_tier: full
verdict: PASS_WITH_NOTES
---

# Validation Report: Hermetic Fixture Project and Planted Ground-Truth Catalog

> **Date:** 2026-08-23
> **Spec:** `.context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md` (revision 15)
> **Plan:** `.context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.plan.md`
> **Rigor tier:** full (`risk_level: medium` → `policies.medium.validate_mode: full`)
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate set resolved from the project's materialized `governance/gates.yaml` via
`adev domain load-gates` (domain `software`, source level `project`). Three
gates, no loader warnings.

### Check 1a: Fast tier — PASS

| Gate | Command | Verdict | Duration |
|---|---|---|---|
| `test` | `npm test` | PASS | 42s |
| `quality-gate` | `npm test` | PASS | (same argv, same `command_sha`) |

`npm test` → 7708 tests, 7706 pass, 0 fail, 2 todo.

Both fast gates carry the identical `command_sha`
(`527c484bcc3bb219e92ed61f99ff968f31143f89e53fda93d09b74c0ce3177d4`) because
they declare the same argv. The run was executed once and attested for both
rather than executing the same command twice.

### Check 1b: Integration tier — WARN

| Gate | Command | Verdict | Duration |
|---|---|---|---|
| `integration-test` | `npm run test:evals` | FAIL (severity `warning`) | 21s |

394 tests, 382 pass, 12 fail. The gate declares `severity: warning`, so this
does not fail Check 1 and does not stop Checks 2–11.

**The twelve failures are pre-existing and unrelated to this spec — verified,
not assumed.** They live in three files:

- `tests/evals/configurable-governance/tier2-dispatch-shape.test.mjs`
- `tests/evals/integration-sandbox/build-with-db.test.mjs`
- `tests/evals/integration-sandbox/reality-check.test.mjs`

None appears in `git diff --name-only 1f4ad473..HEAD`. The failures are
PostgreSQL-on-port-5433 being offline plus the sandbox reality-check that
asserts the suite refuses to skip when infrastructure is down. **That refusal is
correct behaviour** — an integration suite that silently skips on missing infra
is the failure mode those tests exist to prevent, so they are doing their job.

### Check 1c: E2E tier — SKIP

No gates assigned to the e2e tier.

### Per-gate outcome attestation

One `validator_report` emitted for the whole check, carrying one outcome per
gate in the resolved set, with `command_sha` taken verbatim from
`adev domain load-gates` and `--manifest-sha bd58e48` from the spec's
`source-manifest` block.

| Gate | Verdict | Tier |
|---|---|---|
| `test` | pass | fast |
| `quality-gate` | pass | fast |
| `integration-test` | fail | integration |

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify` → `PASS — source manifest matches (sha: bd58e48)`.

Validator-side git-tracked check: all 38 files in the manifest have at least one
commit (`git log --oneline -1 -- <file>` non-empty for every entry). Nothing was
stamped that had not been committed.

## Check 1.6: Code-Side Drift — PASS

`adev verify spec --check-drift` → `{"drifted": false, "drift_source": null,
"drift_at": null}`. Non-blocking check; no drift flag set.

## Check 2: Spec Compliance — PASS

50 of 52 criteria verified by reading actual files. Not reached: #51 (the
full-suite gate, which is Check 1's job) and the repo-wide half of #52.

**Strongest area — the ten Seed Content classes (#8–#19).** A per-class disarm
check asserts the dirty side is genuinely dirty *and* the clean twin genuinely
clean. No pair has both sides dirty. Three inversions found and fixed during
implementation stayed fixed:

- `charter-scope-escape` — the charter no longer charts the capability the
  escaping spec covers
- `missing-issue-binding` — no Feature work item for the dirty spec, one for
  the clean one
- `stale-spec-frontmatter` — every Traceability-named source now declares an
  in-file date, so the clean twin is no longer staler than the plant

**Thirteen `CATALOG_*` rules (#21–#25).** Accepting proof plus a per-code
`checked[code] > 0` counter that fails any rule which iterated an empty
collection; rejecting proof via 28 fixtures each asserted to produce exactly one
code, with a conforming-baseline test and a serializer round-trip test so
"exactly one difference" is real.

**Two PARTIALs recorded:**

| Criterion | Status | Disposition |
|---|---|---|
| #44 — the equality is proven able to go red | **Resolved during validation** | The probe was writing a root-level `*.log`, which both `--ignored` modes enumerate identically, so the flag choice was unfalsified. Moved into `.context-index/packets/` (commit `16a7ef14`). Measured: `traditional` lists 18 entries including the probe, `matching` collapses to one unchanged directory entry — the probe is now invisible under the wrong flag, which is what makes the choice testable. |
| #39 — path-valued manifest keys, escape before existence | **Accepted deviation** | The walk omits the prescribed `resolveContained` lexical pre-check. Property 1 bans every symlink under the fixture, so the lexical and realpathed checks decide identically; the reasoning and the condition for reinstating it are recorded in-code. |

**Test-integrity findings:** none material. Every negative assertion checked is
fronted by an explicit non-vacuity anchor. No loose matchers where exact values
were expected, no try/catch around assertions, no conditional skips, no
assertions that cannot fail.

**Scope creep:** none. The diff touches only paths within `source-manifest.files`
plus the spec, charter and lifecycle log.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries: PASS** — `git diff --stat` over `package.json`,
  `package-lock.json`, the three plugin manifests, `skills/`, `hooks/` and
  `cli/` returns empty. No skill entered the lifecycle order, no hook protocol
  change, no CLI install-path change, no plugin registration change, no
  dependency added.
- **Non-negotiable principles: PASS** — no new dependency; no skill changed;
  pure ESM throughout this repo's own source. The three `require` /
  `module.exports` occurrences in our source are string literals (planted
  falsification content, an anchor-table entry, and an assertion that the clean
  slice is CJS-free), not code. The fixture's deliberate CommonJS is scoring
  material under the *fictional* project's constitution and is correctly not
  flagged.
- **Coding standards: PASS** — camelCase functions, SCREAMING_SNAKE frozen
  constants, kebab-case filenames, `node:*` imports before relative ones in
  every new file.
- **Commit trailers: PASS with one gap** — 12 of 13 commits carry `Spec:`, and
  tasks 1–9 also carry `Plan-task:`. `aea1d624` (`chore(governance)`) carries
  none. The constitution binds the trailer to commits implementing spec-tracked
  work, so it does not strictly apply — but the commit edits a governance file
  shaping the whole lifecycle and the trailer would have been cheap.

**Advisory:** `boundaries.yaml` gained one exclude for
`tests/lib/evals/skill-regression-hermeticity.test.mjs`. The exclusion is
genuinely self-referential — the guard must quote `require(` / `module.exports`
as data to prove the ESM rule matches them — and it follows the existing
`tests/fixtures/governance/**` precedent with an inline rationale. It is narrow
(one file, not a glob). Each such exclude is nonetheless a small hole in a
non-negotiable principle's automated enforcement and is worth a human eyeball.

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → `verdict: PASS`, reason: *no boundary
violations in 78 changed file(s) against 3 rule(s)*. Zero findings.

**Disabled rules:** `no-manual-version-bump` — *"the boundary evaluator matches
file content, not diffs; a version field is not a version bump, so this rule
would fire on package.json forever. Needs a diff-aware evaluator."*

Registry schema warnings: none.

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --json` → `verdict:
PASS`, reason: *every required gate has a fresh, attested, passing outcome*.

| Gate | Verdict | Reason | Attested |
|---|---|---|---|
| `test` | pass | recorded-pass | true |

**This check FAILed on first run** with `no-recorded-outcome` for gate `test`,
and that was the system working as designed. Check 1 is the only sanctioned
writer of `gate_outcomes`; until its attestation landed, the comparator had no
recorded history to read. It passed on re-run once the attestation was emitted.
A validation run that skipped the attestation step would have left this
transition permanently blocked.

## Check 11: Visual Verification — N/A

No UI files in the implementation diff (no `*.tsx`, `*.jsx`, `*.vue`,
`*.svelte`, `*.css`, `*.scss`, `*.html`, nothing under `components/`, `pages/`,
`views/`, `public/`, or `app/**/page.*`). Case A of the trigger guard: SKIP,
*"No UI files in implementation diff — visual verification not applicable."*

---

**Summary:** 7 passed, 0 failed, 1 N/A. One check (1) carries notes: a
warning-severity integration gate failed on pre-existing, infrastructure-offline
tests in files this change does not touch.

---

## Open items carried out of validation

These are recorded on the issue board, not blocking this verdict.

| Issue | Priority | Summary |
|---|---|---|
| `issue-dzxjoa` | 1 | **The fixture is an answer key.** Every planted defect carries an in-file comment naming its exact catalog class slug, so a skill under test reads the answer. Detection would measure reading comprehension rather than analysis. Non-trivial to fix: KC-03's anchor is a literal inside one of those labelling comments. **Decide before any rubric cites a PV id.** |
| `issue-xx86la` | 3 | The spec's Required Files table omits `project/tests/rates.test.mjs` (tree and source manifest carry 34); the `CATALOG_UNSAFE_SCALAR` rule text says "any value" where the implementation scopes the flow-indicator branch to structural fields, because three planted anchors legitimately carry a colon-space. |
| `issue-5ygipy` | 3 | No criterion bans fenced shell commands in the fixture's agent files. The spec closes every door where *lib code* executes fixture content, but not the door where an *agent* reads fixture instruction text and obeys it. |
| `issue-y16xfs` | 2 | Task-id convention unpinned across the route sidecar, `plan_task` events, and the batching parser. |
| `issue-xvk96f` | 2 | `implement_mode: quick` is inert behind `quickGrantPredicate` — measured on this plan, zero of nine tasks qualified. |
| `issue-g15ur1` | 3 | `/adev:plan` does not document the Parallelization grammar its own parser requires. |

## Known flake risk

Property 11 compares repository state across roughly 2.5 seconds at every root
`git worktree list` prints (8 here). A concurrent session writing into *its own*
worktree during that window turns the assertion red spuriously. CI is
single-worktree and unaffected. The failure message names the offending root and
the appeared/vanished lines, so the diagnosis is immediate rather than
mysterious.

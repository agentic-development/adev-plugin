---
kind: validate
spec: .context-index/specs/features/heuristics/failure-capture.spec.md
plan: .context-index/specs/features/heuristics/failure-capture.plan.md
date: 2026-08-15
status: PASS_WITH_NOTES
tier: full
risk_level: high
spec_revision: 3
---

# Validation Report: Failure Capture — learn from what went wrong, not only from what went right

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/heuristics/failure-capture.spec.md` (revision 3, status `implemented`)
> **Plan:** `.context-index/specs/features/heuristics/failure-capture.plan.md`
> **Rigor tier:** `full` (explicit `--tier full`; `risk_level: high` → `validate_mode: full` agrees)
> **Domain:** `software` (resolved at default level)
> **Overall Status:** PASS_WITH_NOTES

Registry loaded from `.context-index/governance/validate.yaml` (7 entries). Gate set merged from the
software domain starter and `governance/gates.yaml`; one merge warning recorded
(`GATE_OVERRIDE: Governance gate 'integration-test' overrides domain gate.`).

No workspace detected (`detectWorkspace` → null) — all checks ran in single-repo mode.
Spec declares no `infra_requirements`, so the infrastructure preflight did not apply.

---

## Check 1: Quality Gates — PASS_WITH_NOTES (baseline-equal)

### Check 1a: Fast Tier

| Gate | Command | Result |
|---|---|---|
| `test` (severity `error`) | `npm test` | exit 1 — **11 failures, all pre-existing** (97.9s) |

`npm test`: **6314 tests, 6271 pass, 11 fail, 30 cancelled, 2 todo, 0 skipped.** This is a byte-match
for the baseline the implementer measured, and the failures are confined to five files, none of which
this spec touches:

| File | Cause |
|---|---|
| `tests/repomap/index.test.mjs` | tree-sitter grammar absent |
| `tests/repomap/non-code-references.integration.test.mjs` | tree-sitter grammar absent |
| `tests/repomap/parse.test.mjs` | tree-sitter grammar absent |
| `tests/repomap/render-non-code-sections.test.mjs` | tree-sitter grammar absent |
| `tests/skills/plan-task-immutability.test.mjs` (2) | worktree-checkout mtimes |

The repomap cause was confirmed directly rather than assumed: `ls node_modules | grep tree-sitter`
returns **nothing at all** — no tree-sitter package of any kind is installed in this worktree. That is an
environment/dependency gap orthogonal to every file in the diff.

Filtering the failure list for `heuristic|recover|signature|failure-capture|post-validate` returns
**0 matches**. No failure is attributable to this change, so the gate is recorded as baseline-equal
rather than as a regression, per the standing instruction to judge against the merge-base baseline
(`d81166c8`) rather than a clean-suite assumption.

> **Consequence for the acceptance criteria:** the criterion "`npm test` passes" is **not literally
> satisfiable in this environment** and is recorded PARTIAL in Check 2. Every other criterion that
> depends on a green suite is satisfied at the per-suite level — the heuristics, hook, CLI and recover
> suites are all green.

### Check 1b: Integration Tier

| Gate | Command | Result |
|---|---|---|
| `integration-test` (`required: false` → severity `warning`) | `npm run test:evals` | exit 1 — **WARN** |

400 tests, 378 pass, 22 fail. Failures land in `tests/evals/integration-sandbox/*` (PostgreSQL offline),
`tests/evals/skill-compression/token-budget-eval/real-token-analysis.test.mjs` (absent session JSONL),
and `tests/evals/work-tracking/work-tracking.test.mjs` (git-state fixtures) — 22 failures, matching the
declared baseline exactly. Filtering for heuristics-related names returns **0 matches**. Warning
severity, so it does not block.

The gate was **executed, not skipped**. Infrastructure being offline is reported as a failure rather
than silently waived.

### Check 1c: E2E Tier

SKIP — no gates assigned to the e2e tier.

## Check 1.5: Source Manifest Verification — PASS

```
Check 1.5: PASS — source manifest matches (sha: 4a9ac56)
```

All 15 listed files hash-match their stamped state. The validator-side git-tracked wrapper confirms
every listed file has been committed (spot-verified across the six load-bearing ones — hook, CLI,
recover skill, fixture, failure-capture tests, PASS harness — each resolving to a commit in the
`0f929139..63092a6f` range). `git status --porcelain` shows no manifest file uncommitted; the only
dirty paths are lifecycle-state JSONL and session records.

## Check 1.6: Code-Side Drift Warning — PASS

```json
{ "drifted": false, "drift_source": null, "drift_at": null }
```

No drift flag set, and `adev source-manifest verify` (the non-Claude-Code fallback) agrees.

## Check 2: Spec Compliance — PASS (1 criterion PARTIAL, environment-blocked)

All citations below come from files read in this validation run.

| # | Acceptance Criterion | Verdict |
|---|---|---|
| 1 | FAIL verdict produces entry with `signature`, `id`, `pattern`, `anti-pattern` | PASS |
| 2 | PASS verdict keeps an entry, outcome-derived prefix | PASS |
| 3 | PASS and FAIL entries distinguishable by title | PASS |
| 4 | Same failure twice → same `id`, one entry updated | PASS |
| 5 | Matching `signature` under a different `id` → separate entry | PASS |
| 6 | **No** test asserts hook-path automatic promotion | PASS |
| 7 | FAIL path reads only `checks[].id` / `checks[].outcome`; adversarial probe | PASS |
| 8 | Captured heuristic names failing checks, copies no other field | PASS |
| 9 | No non-PASS `checks[]` entry → writes nothing, exits 0 | PASS |
| 10 | Every hook error path exits 0, verdict unchanged | PASS |
| 11 | `skills/recover/SKILL.md` has no derivation-rule text, names the verb for both | PASS |
| 12 | `--digest-only` emits bare 8-hex, rejected with `--blocker-id` | PASS |
| 13 | Recover ids byte-identical, asserted against a pre-change fixture | PASS |
| 14 | `extract`, `--check-first-run`, orphaned check file gone | PASS |
| 15 | `tests/cli/heuristics.test.mjs` no longer exercises the removed verb | PASS |
| 16 | PASS harness uses the outcome-derived prefix | PASS |
| 17 | Exactly two prefix copies remain and agree | PASS |
| 18 | No reference to the removed verb in `docs/` or `lib/` | PASS |
| 19 | `npm test` passes | **PARTIAL** — env-blocked, see Check 1a |
| 20 | No constitutional violations | PASS |

### Criteria 1, 2, 3, 8 — capture on both paths, outcome-derived prefix

`hooks/post-validate-extract-heuristics.mjs:94-95` replaces the old single-outcome gate with
`if (outcome !== 'PASS' && outcome !== 'FAIL') return;`. The FAIL branch (`:173-207`) sets `pattern`,
`antiPattern` and `confidence = 'low'`; `:209-218` assembles the entry and attaches `antiPattern` /
`signature` only when defined. `prefixFor` at `:242-244` returns `'Validate FAIL: '` or
`'First-run PASS: '`, so titles are distinguishable by construction.

Tests: `tests/hooks/post-validate-failure-capture.test.mjs:278` (entry carries all four fields),
`:318` (titles distinguishable), `:210` (`prefixFor('PASS')` byte-identical to the previous hardcoded
form — a genuine regression guard, not a tautology), `:218` (120-char cap semantics unchanged).

### Criterion 4 — recurrence updates rather than duplicates

`id` is `deriveHeuristicId(specSlug, repoRelSpecPath, pattern)` at `:210` — spec-scoped and
location-independent. `tests/…failure-capture.test.mjs:340` asserts entry count and evidence length
rather than merely that a write succeeded, which is the assertion shape the criterion demands.

### Criterion 5 — `signature` is provably not the dedup key

`:353` and `:378-380` write two specs whose failing check sets are identical: two distinct ids, two
entries, **one shared signature** (`new Set(signatures).size === 1`). This directly falsifies the
earlier revision's claim that `signature` drives reconciliation, which is what Behaviors 4/4a were
written to correct.

### Criterion 6 — the absent test is correct

Verified by grep (see Claim 2 below). No test asserts hook-path promotion, and none should.

### Criteria 7 and 8 — the security boundary

Verified independently by enumeration rather than by reading the implementer's summary. See Claim 1.

### Criteria 11, 12, 13 — recover migration

`skills/recover/SKILL.md` replaces `#### ID Derivation Rule` with `#### Key Derivation (via the shared
verb)`. The hashing rule, the normalization rule and the SHA-256 prose are deleted; both values are now
obtained from `adev heuristics signature` (`--origin recover` for the signature, `--digest-only` for the
id's digest). A fail-closed degradation rule was added, matching the spec's System Constitution
Reference. The surviving regex `/^[_a-z0-9][_a-z0-9-]{0,63}$/` is a *validation constraint*, not a
derivation rule, so its presence does not violate the criterion.

`--digest-only` was exercised live against the worktree CLI (not the installed plugin cache):

```
$ node cli/index.mjs heuristics signature --origin recover --text "Error: cache miss on third-party API" --digest-only
3afbd8be                                                                    (exit 0)
$ node cli/index.mjs heuristics signature --origin recover --text "Error: cache miss on third-party API"
recover-3afbd8be                                                            (exit 0)
$ node cli/index.mjs heuristics signature --origin review-specs --blocker-id SEC-1 --digest-only
CONFLICTING_SIGNATURE_INPUT: --digest-only derives its digest from --text
and cannot be used with --blocker-id                                        (exit 1)
```

`3afbd8be` is exactly the digest in the pre-change fixture's first case (`missing-context-3afbd8be`,
`tests/fixtures/recover-heuristic-ids.pre-change.json:14`). Behavior 6's byte-identity is therefore
confirmed **live against the shipped verb**, independent of the test suite that also asserts it.

### Criteria 14, 15, 18 — dead-path retirement

`node cli/index.mjs heuristics extract --validate x` → `usage: adev heuristics
<retrieve|signature|migrate-keys|write>`, exit 1. `skills/validate/checks/validate.check-12-heuristic-extraction.md`
is absent. `docs/cli-reference.md` rewrote both the verb table row and the Purpose/Signature block.
`lib/diagnostics/tier2/validated-without-report.mjs` renumbered its call-site list three → two and
records where the third went.

Every surviving repo match for `heuristics extract` / `--check-first-run` is either a **negative
assertion** in `tests/cli/heuristics.test.mjs` (`:611` verb gone, `:620` help no longer advertises it,
`:718` rejected by every surviving subcommand, `:785` a repo-wide grep guard, `:853` the superseded
cross-spec criterion), or narrative prose in spec/charter/review/research artifacts. Nothing in `docs/`
or `lib/` references the removed verb.

### Criteria 16, 17 — the two prefix copies

`hooks/post-validate-extract-heuristics.mjs:242-244` and
`tests/skills/validate-success-heuristic-harness.mjs:114-116`. Both bodies are semantically identical;
they differ only in quote style (single vs. double), which is each file's prevailing convention. The
harness carries an explicit comment stating the mirroring is deliberate and must not be collapsed into a
shared helper, since the criterion is that exactly two copies exist and agree. The PASS-path suite
imports `runCheck12` from this harness, so the prefix criterion is now genuinely exercised rather than
asserted against a stale copy.

## Cross-Repo Dependency Validation — N/A

No workspace detected and no cross-repo `depends-on` references.

## Check 4: Constitution Compliance — PASS (with one scope-expansion sub-finding)

- **Architecture boundaries: PASS.** The hook protocol is untouched — stdin JSON parsing, the consumed
  `tool_result.verdict_metadata` field, stdout as protocol channel, warnings on stderr, and
  unconditional `process.exit(0)` are all unchanged. Widening the trigger changes a value comparison on
  already-consumed data, which the constitution places under Autonomous rather than under "Changing the
  hook protocol". No new skills, no CLI install-path change, no plugin-registration change.
- **Minimize external dependencies: PASS.** `git diff d81166c8..HEAD -- package.json
  .claude-plugin/plugin.json .cursor-plugin/plugin.json` is **empty** — no dependency added and, equally
  important, no version bumped in a feature branch (release-please owns that per ADR-0008).
- **Pure ESM: PASS.** No `require(` or `module.exports` in any changed source file.
- **Skills are primarily markdown: PASS.** `skills/recover/SKILL.md` names CLI verbs; no executable
  logic was added. `hooks/pre-commit-no-inline-node.sh` exits 0.
- **Coding standards: PASS.** camelCase functions, kebab-case files, Node built-ins first in import
  order, hook errors routed to `console.warn` with exit 0.
- **Commit trailers: PASS.** All 11 implementation commits in `d9400424..63092a6f` carry a
  `Spec: .context-index/specs/features/heuristics/failure-capture.spec.md` trailer (11 of 11).
- **Provider mirrors: PASS.** `providers/codex/skills/recover/SKILL.md` and
  `providers/opencode/skills/recover/SKILL.md` each received the identical 18+/8- change applied to the
  canonical skill.

### Scope-expansion sub-finding — `adev heuristics write --signature`

`lib/cli/heuristics.mjs` gained a `--signature <sig>` option on the `write` subcommand
(`:969` parse, `:1045-1046` conditional assignment, `:1125-1131` usage text). **The spec never names
this flag.** It is spec-*implied*: Behavior 5 requires `/adev:recover` to obtain a signature from the
verb, and a skill that cannot persist what it derives has derived it for nothing — so the write path
needs the flag for Behavior 5 to be observable. The plan recorded it as decision **D10** and flagged it
for this sub-finding rather than letting it land silently.

**Assessment: justified, correctly sized, correctly disclosed.** The flag is additive and optional
(`:1045` sets `entry.signature` only for a non-empty value, so every existing caller is unaffected), it
is validated against `SIGNATURE_PATTERN`, and a malformed value degrades to stderr + exit 0 rather than
throwing. Recorded as a scope expansion, not as a violation.

## Check 8: Boundary Compliance — PASS

`.context-index/governance/boundaries.yaml` declares `boundaries: []` — the file exists but configures
no rules, so there is nothing to evaluate against the changed files.

## Check 9: Transition Gates — SKIP

`governance/gates.yaml` declares `transitions: {}`. No `implement-to-validate` or `implement-to-merge`
transition is configured.

## Check 11: Visual Verification — SKIP

Case A of the trigger matrix: no UI files in the implementation diff (no `.tsx/.jsx/.vue/.svelte/.css/
.scss/.html`, nothing under `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`,
`app/**/layout.*`) and no Playwright MCP server available. SKIP is the correct outcome — this is not a
suppressed BLOCK.

## Check 14: Gate Executability and Test Collection — PASS

Both declared gates are argv lists (not shell strings) and both executed to completion under
`execFile`-style invocation. No gate is declared-but-uncollected: the eval tier that
`governance/gates.yaml` exists to keep honest did run, and reported its 22 failures rather than being
skipped.

---

## Independent verification of the four load-bearing claims

These were re-derived from primary sources rather than accepted from the implement summary.

### Claim 1 — Security boundary: **CONFIRMED**

Enumerating every property access in `hooks/post-validate-extract-heuristics.mjs` yields exactly ten,
and no more:

```
data.tool_name      data.tool_result
verdict.overall     verdict.spec_path    verdict.charter
verdict.spec_title  verdict.report_path  verdict.checks
c.id                c.outcome
```

That is the five top-level verdict fields the PASS path already consumed, plus `checks[].id` and
`checks[].outcome` — precisely the Behavior 1a read set, with no prose field of any kind.

Leak vectors were checked individually and all are absent: no bracket-notation/dynamic property access,
no `JSON.stringify`, no `Object.keys/values/entries/assign`, no object spread of `verdict`/`data`/`c`.
**No `spawn`, `exec`, `execFile`, `execSync`, or `child_process` import was added** — the only imports
are `node:path`, `node:fs` (`realpathSync`, `statSync`), and the dynamic `lib/heuristics.mjs` import.
`process.env` is read twice, both for path resolution (`CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_ROOT`),
never for capture material. Check ids are additionally re-sanitized to `[A-Za-z0-9._-]` at `:181` as
defence in depth.

The adversarial probe is **non-vacuous**, which was the specific thing worth checking. At
`tests/hooks/post-validate-failure-capture.test.mjs:409-412` the canary asserts
`raw.length > 0` ("the FAIL entry must actually be written") **before** asserting the secret is absent,
and then positively asserts the check id *is* present. A hook that silently wrote nothing would fail
this test rather than pass it vacuously. The probe injects sentinels at three distinct levels —
prose fields on `checks[]` entries (`detail`, `message`, `evidence`, `remediation`), sibling keys on
`verdict_metadata` itself (`summary`, `notes`), and subprocess-style channels on `tool_result`
(`stdout`, `stderr`, `output`) — and `:415-445` separately asserts that the derived `pattern` and
`antiPattern` contain the failing check ids and none of the three sentinels.

### Claim 2 — No promotion test exists: **CONFIRMED**

Grepping `tests/hooks/` and the PASS-path suites for `autoPromote|auto-promote|promot` returns three
hits, none of which is an assertion:

- `tests/hooks/post-validate-heuristic-id.test.mjs:11-12` — a header comment describing the *historical*
  absolute-path regression that `failure-signature-key.spec.md` fixed.
- `tests/skills/validate-success-heuristic.test.mjs:101-103` — a comment explaining that promotion
  **cannot** fire (one evidence entry; ≥3 distinct paths required), followed by
  `assert.equal(h.confidence, "medium")`.

That last assertion asserts the *absence* of promotion, which is what Behavior 4a predicts. No test
asserts hook-path promotion. The criterion is satisfied by construction, and its absence is correct
rather than a coverage gap.

### Claim 3 — Fixture provenance: **CONFIRMED**

- The fixture was added in `0f929139` at **2026-08-15 13:27:57 -0300**.
- The **only** commit touching `skills/recover/SKILL.md` in the whole range `d81166c8..HEAD` is
  `9729fa1c` at **14:26:59 -0300** — 59 minutes later.
- `git rev-parse 0f929139^:skills/recover/SKILL.md` → `f71209a4c22478ddc5f60b5754e799c1d7dd26ca`, which
  is byte-for-byte the value the fixture records at
  `tests/fixtures/recover-heuristic-ids.pre-change.json:5`. (The blob is unchanged at `0f929139`
  itself, as expected — that commit adds only the fixture.)

So the fixture provably captures the pre-edit derivation, and the byte-identity bar is **non-vacuous**.
It is further reinforced live: `--digest-only` on the shipped verb returns `3afbd8be`, matching the
fixture's `missing-context-3afbd8be`. The suite asserts the correspondence three independent ways per
case — verb id, shipped normalizer, and harness `deriveId` — across all 9 cases (6 categories plus
edge cases), with the fixture explicitly marked as the authority when a mismatch occurs.

### Claim 4 — Cross-spec containment: **CONFIRMED**

`git diff --numstat d81166c8..HEAD -- .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md`
returns exactly `1 1`. The single changed line is the Acceptance Criteria bullet at line 89. The clause
`` `adev heuristics extract` works `` is wrapped in `~~strikethrough~~` and annotated
"(superseded by …failure-capture.spec.md Behavior 7 — the verb was retired as unreachable)", with the
trailing clause updated from "covers all behaviors" to "covers the surviving subcommands". The
criterion is **marked superseded, not deleted** — the charter's history stays legible. Nothing else in
that spec was touched.

---

## Notes and observations (non-blocking)

1. **Latent: FAIL capture is not loss-free under adversarial spec titles.** Confirmed independently.
   `lib/heuristics.mjs:85` caps `pattern` at 500 chars. The FAIL pattern interpolates the **uncapped**
   `specTitle` (only `title` is capped, at `:150`) plus up to five joined check ids, so a pathologically
   long title can push `pattern` past the cap, `validateEntry` throws, and the shared catch at `:227-229`
   drops the capture with a warning. Non-blocking by design (the verdict is never affected), and the
   **PASS path at `:170-171` has the identical property**, so this is pre-existing rather than
   introduced. Scope was correctly not widened. Worth tracking separately if failure capture is ever
   promoted to loss-free.
2. **Stale line pointer in the spec.** The Behavioral Contract says the hook returned early at line 72;
   at the merge-base it was line **73** (`git show d81166c8:hooks/… | grep -n "overall !== 'PASS'"`).
   Cosmetic, already known.
3. **Pre-existing divergence between the hook and the PASS harness's default pattern text.** The hook
   ends with a period (`…without revision.`); the harness at `:191` does not. Both forms are identical
   at the merge-base, so this predates the change and is out of scope — but since `id` digests the
   pattern, the two surfaces would derive different ids for the same spec. The harness is a test double
   that never feeds the live store, so nothing is currently wrong; noting it because the spec's framing
   ("mirror each other by construction") applies to the prefix only, not to the pattern body.
4. **`prefixFor` quote style.** The harness comment asks for a body "byte-identical to the hook's"; the
   bodies differ in quote style only (each file follows its own convention). Semantically identical —
   flagged only so the comment is not read as a stronger guarantee than it makes.
5. **Registry-fallback warnings.** `validate.check-1-quality-gates` and `validate.check-1.6-code-drift`
   emitted `UNKNOWN_VALIDATOR_DEFAULTED` on their `validator_report` events. This is the documented
   fallback for the two checks with no registry entry; both are non-blocker checks, so the
   warning-severity default is correct.
6. **Gate merge warning.** `GATE_OVERRIDE: Governance gate 'integration-test' overrides domain gate.`
   Expected — governance wins on `id` conflict.

---

**Summary:** 9 checks dispatched — **7 passed** (1.5, 1.6, 2, 4, 8, 14, plus Check 1 as baseline-equal),
**2 skipped** (9 — no transitions configured; 11 — no UI files). **0 blocker-severity failures.**
1 acceptance criterion (`npm test` passes) is PARTIAL for pre-existing environmental reasons unrelated
to this change. 1 scope expansion disclosed and assessed (`write --signature`, plan D10).

All four load-bearing claims were independently verified and **all four hold**.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12,
> and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check
>   6), specialist review (formerly Check 7), charter consistency (formerly Check 3, now covered by
>   Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — lifecycle reconciliation (formerly Check 12).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — heuristic extraction (formerly Check 13), now a
>   non-blocking Stop-event hook. **This spec is the change that widened that hook to capture on FAIL.**

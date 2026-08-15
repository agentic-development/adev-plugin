---
kind: review
spec: .context-index/specs/features/heuristics/failure-capture.spec.md
charter: .context-index/specs/features/heuristics/charter.md
date: 2026-08-15
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: 466649ac0a94576b89985007bc06f375b5afb53fff6fb80a7b86130fc12044f9
---

# Architecture Review: failure-capture

> **Date:** 2026-08-15
> **Spec:** .context-index/specs/features/heuristics/failure-capture.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md (approved, revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` maps to `review_mode: full` independently)
> **Verdict:** BLOCK — 7 blockers, 5 warnings, 2 suggestions

<!-- First review of revision 1. This spec's precondition, failure-signature-key.spec.md, is
     VALIDATED and shipped on this branch, so every claim the spec makes about the codebase was
     checked against real code rather than intent. Three of the four verified "known facts" in the
     spec hold; the load-bearing failures are in what the spec assumes the shipped verb and
     writeHeuristic can do, not in what it says about the dead path. -->

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

Registry: `templates/domains/software/reviewers.yaml` (resolved domain `software`, source level `default`);
`.context-index/governance/review.yaml` declares `reviewers: []`, so no overrides applied. Context pack
`base` has no includes. No load warnings.

Heuristics injected: 3 module-scoped entries at `summary` tier (`heuristics` module).

## Verification against shipped code

The spec's asserted facts were checked directly. All of these hold:

- `hooks/post-validate-extract-heuristics.mjs:73` is `if (verdict.overall !== 'PASS') return;`, with no prior-report check.
- `adev heuristics extract` and `--check-first-run` are invoked by no skill and no hook (`lib/cli/heuristics.mjs:61,231,246,287,345,355`).
- `skills/validate/checks/validate.check-12-heuristic-extraction.md` exists and its check ID is absent from the active check set.
- `"First-run PASS: "` is hardcoded in `hooks/post-validate-extract-heuristics.mjs:127,134` and `lib/cli/heuristics.mjs:155,215,216,385`.
- `skills/recover/SKILL.md:387-397` still carries the prose ID Derivation Rule.
- Both dangling references exist: `docs/cli-reference.md:525` and `lib/diagnostics/tier2/validated-without-report.mjs:32-34`.

These do **not** hold, and are the basis of SA-2 / SA-4 / CON-1 / CON-2:

- `writeHeuristic` reconciles on `id` only (`lib/heuristics.mjs:952`), never on `signature`. Behavior 4's causal claim is false against shipped code.
- `adev heuristics signature` emits only `<origin>-<digest>` (`lib/cli/heuristics.mjs:505-660`). There is no bare-digest mode and no id-composing mode, so it cannot supply `/adev:recover`'s `<category-slug>-<digest>` id.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

### SA-1 — blocker — Behaviors 1, 2

- **blocker_id:** `structural-architect:missing-contract-input:9df6d845`
- **section_anchor:** `behaviors-1`
- **Finding:** The spec never defines the *input text* for the FAIL-path derivation. Behavior 1 says the signature is "derived from the failure text via the shared primitive with origin `validate`", but the hook's declared input contract (`hooks/post-validate-extract-heuristics.mjs:6-30`) exposes only `overall`, `spec_path`, `charter`, `checks[]`, `elapsed_ms`, `report_path`, and its SEC-1 scoping explicitly forbids reading subprocess stdout/stderr. "Failure text" has no referent in that payload. The same gap applies to Behavior 2's `pattern` and `anti-pattern`. This is the central new contract of the spec and it is unspecified — and it is the same contract the sibling `signature-retrieval.spec.md` Behavior 6 must reproduce on the read side for an exact signature match ever to occur.
- **Recommendation:** Name the exact verdict-metadata fields, and their composition order, that constitute the hashed failure text; state the same input for the derived `pattern`/`anti-pattern`; confirm compatibility with the SEC-1 input-scoping boundary.

### SA-2 — blocker — Behavior 4, Postconditions

- **blocker_id:** `structural-architect:false-codebase-claim:e0f815c6`
- **section_anchor:** `behaviors-4`
- **Finding:** Behavior 4 asserts that an identical `signature` causes `writeHeuristic` to append evidence to the existing entry. It does not: `lib/heuristics.mjs:952` reconciles solely on `existingEntries.findIndex((e) => e.id === entry.id)`, and `signature` is existing-wins metadata that never participates in lookup. Reconciliation depends entirely on `id`, and the spec never states how the FAIL-path `id` is derived. Since `deriveHeuristicId(prefix, repoRelSpecPath, pattern)` hashes the `pattern`, a FAIL pattern that varies run to run (for example, embedding failing check names) forks a new entry on every recurrence — the exact defect Phase 3 exists to remove.
- **Recommendation:** State the FAIL-path `id` prefix and hash inputs explicitly, require the pattern text to be a deterministic function of the verdict, and correct Behavior 4 so recurrence-dedup is attributed to `id`, with `signature` carrying cross-scope identity only.

### SA-3 — blocker — Behavior 4, Acceptance Criteria

- **blocker_id:** `structural-architect:unsatisfiable-acceptance:d4ec3950`
- **section_anchor:** `behaviors-4`
- **Finding:** Behavior 4 claims recurrence lets `autoPromote` "observe two distinct evidence paths", and the acceptance criteria require both "appends evidence to one entry … asserting entry count and evidence length" and "two distinct evidence paths … promote it from `low` to `medium`". On the hook path the evidence path is `report_path`, a deterministic function of `spec_path` (`hooks/post-validate-extract-heuristics.mjs:136-138`), so a recurring failure of the same spec always yields the *same* path. `autoPromote` counts `new Set(evidence.map(e => e.path)).size` (`lib/heuristics.mjs:894`), so promotion is unreachable; and `mergeEvidence` dedups on `path + date` (`lib/heuristics.mjs:868-878`), so a same-day recapture leaves evidence length at 1 and the first assertion fails too.
- **Recommendation:** Either specify an evidence path that varies per occurrence, or drop the promotion claim and state that failure entries remain at `low` until a distinct-path source reinforces them — the charter's Retrieval Reachability attribute already assumes exactly that and delegates first-recurrence reachability to signature retrieval.

### SA-4 — blocker — Behaviors 5 and 6, Acceptance Criteria

- **blocker_id:** `structural-architect:unsatisfiable-contract:ffabead9`
- **section_anchor:** `behaviors-5`
- **Finding:** Behavior 5 removes the ID Derivation Rule from `skills/recover/SKILL.md:387-397` and replaces it with `adev heuristics signature`; Behavior 6 and the acceptance criteria require recover-produced **ids** to stay byte-identical. The shipped verb cannot deliver that: its origin set is closed to `recover|validate|review-specs|implement` (`lib/cli/heuristics.mjs:519-523`) and it emits only `<origin>-<digest>`. Recover ids are `<category-slug>-<digest>` (for example `missing-context-a1b2c3d4`). `failure-signature-key.spec.md` Behavior 7a states the shared code recover reuses is "the digest function, not the prefix" — but no CLI surface exposes a bare digest, and skills may not call `lib/` directly (constitution anti-pattern on executable JavaScript in SKILL.md). Removing the prose rule as written therefore changes recover ids, which also breaks the migration discriminator in `failure-signature-key.spec.md` Behavior 8, which is prefix-based on the six category slugs. The Constitution Reference bullet compounds this by describing degradation as "writing an entry without a signature", which does not describe a missing *id* — `validateEntry` rejects an entry with no id.
- **Recommendation:** Decide and state which key Behavior 5 replaces. If it is the `id`, specify the CLI surface that yields it (a digest-only mode, or an id-composing verb) as an API addition owned by this spec. If it is only the `signature`, say that the category-slug id composition stays in skill prose and narrow the "rule text is removed" claim accordingly.

### SA-5 — warning — Behavior 3 vs Behavior 7, Actionable Task Map

Behavior 3 requires the outcome-derived prefix to be "used by both the hook and any remaining CLI caller", and the task map says "in both copies". Every `First-run PASS` copy in `lib/cli/heuristics.mjs` (`deriveTitle` :139-160, `defaultPattern` :213-216, and :385) lives inside the `extract` flow that Behavior 7 deletes; `runWrite`, `runRetrieve`, and `runSignature` have none. After retirement exactly one copy exists, so the "shared derivation across two callers" framing is contradicted by this same spec. State that the prefix derivation lives in the hook and drop the second-caller requirement, or name the surviving caller.

### SA-6 — warning — Behavior 7, Acceptance Criteria

The dangling-reference enumeration is scoped to "the two references" (`docs/cli-reference.md`, `lib/diagnostics/tier2/validated-without-report.mjs`) and the acceptance criterion sweeps only `docs/` and `lib/`. `tests/cli/heuristics.test.mjs` is a suite *for* `extract` (roughly a dozen invocations, including `--check-first-run`), and `.context-index/specs/features/cli/charter.md:60` still lists `heuristics extract`. Neither is named in the task map's Tests row, so the "`npm test` passes" criterion would fail on landing. Name test-suite retirement as an explicit task and widen the no-dangling-reference criterion to `tests/` and the cross-charter reference.

### SA-7 — suggestion — Behaviors 1-3, Postconditions

A spec that fails and later passes produces two co-resident entries with opposite lessons (different `pattern`, therefore different `id`), with no contradiction linkage. The charter has `contradicted-by[]` and `addContradiction` for exactly this. Consider stating whether a subsequent PASS on the same spec contradicts the FAIL entry or leaves it alone, so behavior on the common case is defined rather than emergent.

**No ADR conflict found.** Retiring `skills/validate/checks/validate.check-12-heuristic-extraction.md` leaves the ID in `REMOVED_CHECK_IDS` and ADR-0019's alias table untouched, and the `>= 12` check-file assertion in `tests/governance/validate-config-single-source.test.mjs:239` still holds.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

### SEC-1 — blocker — data-exposure — Behavior 1

- **blocker_id:** `security-reviewer:data-exposure:ffaf2f81`
- **section_anchor:** `behaviors`
- **Finding:** Behavior 1 says the FAIL path derives `title`, `pattern`, `anti-pattern`, and `signature` "from the failure text", but the spec never names which `verdict_metadata` field supplies that text. The live hook's docstring states a hard input-scoping guarantee for the PASS path (consumes ONLY structured verdict-metadata fields; does not read or re-emit quality-gate subprocess stdout/stderr, which flow through the redaction pipeline). The FAIL path is new, and the Preconditions section promises only `overall` and `spec_path` — it does not extend that field-level scoping guarantee to whatever field carries failure text. An implementer following this spec has no instruction confining the source to the already-redacted `checks[]` entries and could plausibly read a broader or raw field, reintroducing the subprocess-leak class the PASS path was hardened against — except that the captured text now lands in a git-tracked file that `/adev:sync` later copies into CLAUDE.md, AGENTS.md, `.cursorrules`, and copilot-instructions.
- **Recommendation:** Add an explicit behavior or precondition naming the exact `verdict_metadata` field(s) the FAIL path may read (for example: failure text is drawn only from `checks[]` entries with a non-PASS outcome, which have already passed through the quality-gate redaction pipeline; the hook never reads `tool_result` subprocess channels directly), mirroring the guarantee already documented for the PASS path.

### SEC-2 — warning — data-exposure

Once SEC-1's field is pinned down, the FAIL path still embeds less-structured, externally-influenced text into `pattern`/`anti-pattern` — a departure from the PASS path, where both are fixed templates rather than copies of external content. The charter's Retrieval Reachability attribute exempts exact-`signature` matches from the `low`-confidence exclusion, so a single FAIL-derived entry is re-injected into agent context on the very next occurrence of the same failure, and reaches the synced agent files if promoted. The existing `_format.md` advisory ("distill generalizations, not copy literal values") targets secrets and PII, not arbitrary or adversarial content shaped as instructions. Add a line to Behavior 2 requiring the FAIL-path extractor to distill rather than quote verbatim, and to strip control characters and markdown directive-like sequences before write.

### SEC-3 — warning — rate-limiting

`mergeEvidence` dedups only on the `(path, date)` tuple. A PASS report path is effectively terminal (one evidence add), but a repeatedly-failing spec produces one new evidence entry per calendar day it fails, indefinitely — with no cap analogous to `FIELD_LENGTH_CAPS`. Widening capture to FAIL makes this growth path far more reachable than under PASS-only capture. Either cap `evidence[]` length in `writeHeuristic` with oldest-first eviction, or record in this spec that unbounded evidence growth on repeat-FAIL entries is accepted and left to `/adev:retro` consolidation, so the tradeoff is a stated decision rather than a gap.

No authentication, authorization, secrets, or injection-surface findings. This remains a local hook writing into an already-contained, already-validated markdown store; `SAFE_SLUG_PATTERN`, `FIELD_LENGTH_CAPS`, and the shipped path-containment checks are unchanged and unaffected by the widening.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

### CON-1 — blocker — domain-model — Behavior 4

- **blocker_id:** `consistency-analyzer:domain-model:2f539e05`
- **section_anchor:** `behaviors`
- **This spec:** Behavior 4 — "the derived `signature` is identical to the first occurrence, so `writeHeuristic` appends evidence to the existing entry rather than creating a second one" — attributes dedup-on-recurrence to `signature` matching.
- **Conflicts with:** `writeHeuristic` dedups exclusively on `entry.id` (`lib/heuristics.mjs:952`) and never inspects `signature`. The charter's Invariants (line 120) and `failure-signature-key.spec.md` Behavior 5b both state that `signature` "does not participate in `id` uniqueness" and that two heuristics may legitimately share a signature while remaining distinct entries.
- **Recommendation:** Rewrite Behavior 4 to state the true mechanism: on a recurring FAIL the extractor must derive the same `id` (via `deriveHeuristicId`, keyed on spec path plus pattern per `failure-signature-key.spec.md` Behavior 7) for the existing-id match to fire; `signature` rides along for cross-scope matching at retrieval time. As written, an implementer could reasonably key `id` on the failure digest instead of spec-plus-pattern, silently breaking dedup.

### CON-2 — blocker — contract — Behavior 5

- **blocker_id:** `consistency-analyzer:contract:8863f48f`
- **section_anchor:** `behaviors`
- **This spec:** Behavior 5 — `/adev:recover` Step 7 "obtains the key by invoking `adev heuristics signature` rather than restating the ID Derivation Rule in prose. The rule text is removed from `skills/recover/SKILL.md`."
- **Conflicts with:** `adev heuristics signature` has exactly one output shape, `<origin>-<digest>`, and its origin enum supplies only the origin slug as prefix. Recover's `id` must carry one of six diagnosis-category slugs. `failure-signature-key.spec.md` Behavior 7a is explicit that the caller supplies the `id` prefix and that "the shared code these callers reuse is the digest function, not the prefix". A literal implementation would emit `recover-<digest>`, violating this spec's own Behavior 6 and Postcondition ("existing heuristics remain addressable under their original ids") and breaking the prefix-based migration discriminator in `failure-signature-key.spec.md` Behavior 8.
- **Recommendation:** Split Behavior 5 into two clauses: (a) recover invokes `adev heuristics signature --origin recover --text <root-cause>` to obtain the new `signature` field; (b) recover continues to compose `id` itself as `<category-slug>-<digest>` using the shared digest primitive rather than the signature verb's prefixed output. Only the digest-computation prose is removed from SKILL.md; category-prefix composition remains caller logic, or moves into a distinct CLI mode if one is added.

### CON-3 — warning — pattern

Behavior 5's replacement leaves `skills/recover/SKILL.md`'s inline-Node block (roughly lines 416-438, importing `writeHeuristic`) untouched. The constitution forbids inline-Node step directives and forbids a SKILL.md H3 section containing both an inline-Node block and an `adev <verb>` invocation. After Behavior 5 lands, the same skill step would contain both an `adev heuristics signature` call and an inline-Node `writeHeuristic` call. Either declare this a pre-existing violation explicitly out of scope, or extend the task map to migrate the write path to a CLI verb in the same change.

### CON-4 — suggestion — pattern

The task map cites `skills/recover/SKILL.md:387-397`; the `#### ID Derivation Rule` section actually spans 387-398, with `#### projectRoot Resolution` starting at 399. Correct the range, or state explicitly whether the worked example is retained.

**No findings** on the hook-gate widening (Behavior 1, Task 1), the title-prefix consolidation facts (Behavior 3), the retirement behaviors and both dangling references (Behavior 7), or the four constitution citations — all verified accurate.

## Known defects carried from the build context (reported, not blocking)

These were supplied as already queued for separate repair and were not raised as blockers:

- The charter's Consumed/Exposed API rows and `FailureSignature.digest` lag the shipped verb's shape.
- The charter's `EvidenceRef.source` enum does not match the live store's four spellings (`validation`, `learn`, `validate`, `recover`).
- `failure-signature-key.spec.md` lags its own implementation in five documented places; a documentation-only revision is planned.

---

## Summary

**Total findings:** 14 (7 blockers, 5 warnings, 2 suggestions)

**Verdict:** BLOCK. `verdict_rules.blocker_threshold` is 1.

**Action required:** Run `/adev:specify --revise` against
`.context-index/specs/features/heuristics/failure-capture.spec.md` using
`failure-capture.blockers.md`, then re-review. The blockers cluster into three
independent decisions, and resolving each one requires a matching sweep across
Behaviors, the Actionable Task Map, and Acceptance Criteria:

1. **What is the FAIL-path input?** (SA-1, SEC-1) Name the exact `verdict_metadata` fields
   that compose the hashed failure text and the derived `pattern`/`anti-pattern`, and restate
   the hook's SEC-1 input-scoping guarantee for the new path.
2. **What key dedups a recurring failure?** (SA-2, SA-3, CON-1) It is `id`, not `signature`.
   Specify the FAIL-path `id` prefix and hash inputs, require a deterministic pattern, and
   either make the evidence path vary per occurrence or withdraw the promotion claim and its
   acceptance criterion.
3. **Which key does `/adev:recover` stop deriving in prose?** (SA-4, CON-2) The shipped verb
   yields `<origin>-<digest>` only. Either add the CLI surface that yields recover's
   `<category-slug>-<digest>` id, or narrow Behavior 5 to the `signature` alone and keep the
   id composition in skill prose.

Warnings SA-5 and SA-6 should be swept in the same revision: SA-5 is an internal contradiction
between Behavior 3 and Behavior 7, and SA-6 names work (`tests/cli/heuristics.test.mjs`, the
`cli` charter reference) that the "`npm test` passes" criterion cannot survive without.

**Approver role:** `.context-index/governance/gates.yaml` declares `transitions: {}` — no
`spec-to-plan` approver role is configured. `risk-policies.yaml` sets
`require_hitl_approval: true` for `risk_level: high`, which applies at the plan gate, not here.

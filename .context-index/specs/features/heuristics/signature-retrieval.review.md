---
spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
charter: .context-index/specs/features/heuristics/charter.md
date: 2026-08-15
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: db1309f058c06b24859454ff43099065c649c09f3d02e06610c34f79242b9438
---

# Architecture Review: signature-retrieval

> **Date:** 2026-08-15
> **Spec:** .context-index/specs/features/heuristics/signature-retrieval.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md (approved, revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: medium` resolves identically)
> **Spec revision at review:** 1 (first review)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

Domain resolution: `software` (source level: default). Registry warnings: none.
Module heuristics injected: 3 (`heuristics` module, tier `summary`).
Governance: `risk-policies.yaml` present; `medium` does not skip review. `gates.yaml` `spec-to-plan` approver role — see footer.
Cross-repo `depends-on` refs: none. Workspace: not detected.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

- **SA-1** — `blocker` — `blocker_id: structural-architect:false-code-citation:50e43d50` — section `behavioral-contract`
  The spec cites `lib/heuristics.mjs:1176` three times (Behavioral Contract, Behavior 2, Task Map row
  "Exempt exact matches from the `low` floor") as the site of the `low`-confidence exclusion. That is
  false. The exclusion `if (entry.confidence === "low") continue;` is at **`lib/heuristics.mjs:1442`**,
  inside `retrieveHeuristics`' budget-cap loop. Line 1176 sits in the `demoteHeuristic` doc block; the
  nearest matching predicate there is `demoteHeuristic`'s `entry.confidence === "low"` branch at line
  1204, which **archives** the entry. A Task Map row reading "Scoped change at `lib/heuristics.mjs:1176`;
  must not leak to other paths" therefore aims an implementer at the demotion/archive path — the one
  place where touching the `low` branch is destructive rather than exempting.
  *Recommendation:* replace all three citations with `lib/heuristics.mjs:1442` and name the enclosing
  function rather than a bare line number.

- **SA-2** — `blocker` — `blocker_id: structural-architect:unspecified-signature-derivation:550fc24d` — section `behaviors-6`
  Behavior 6 names four failure points but specifies the signature *derivation input* for none of them.
  The loop only closes if the read side recomposes a byte-identical input to the write side. On the one
  path that exists today the write input is exact and non-obvious:
  `hooks/post-validate-extract-heuristics.mjs:201` computes `deriveSignature('validate', uniqueFailed.join(' '))`
  where `uniqueFailed` is the sorted, de-duplicated list of failing `checks[].id` — not prose, not the
  report, not the spec title. Nothing in the spec states this, so "re-queried by that signature" has no
  determinate meaning and the acceptance criterion cannot be evaluated: an implementation that hashes
  failure prose satisfies every word of Behavior 6 and matches zero entries. The other three points are
  worse — review-specs BLOCK signatures are *inherited* from `blocker_id` (a different verb mode),
  "implement task failure" has no defined failure text, and "recover dispatch" fires before
  `/adev:recover` Step 7 has produced the root-cause diagnosis its signature derives from.
  *Recommendation:* add a table to Behavior 6 with one row per failure point giving origin slug, exact
  derivation input, and source field; state the input must be byte-identical to the capture-side input.

- **SA-3** — `blocker` — `blocker_id: structural-architect:contradictory-ranking-contract:681976e9` — section `behaviors-1`
  Behavior 1 asserts a total order "signature > keyword > plain module-scope". The live comparator
  (`lib/heuristics.mjs:1420-1433`) makes **confidence the primary key** and keyword match strictly
  subordinate, so today a `high`-confidence non-keyword entry outranks a `medium` keyword match.
  Behavior 1's second clause therefore mandates a change to the *keyword* ordering — the no-signature
  path. That contradicts Postcondition 3 ("Entry-time retrieval behavior is unchanged for callers that
  pass no `signature`"), the acceptance criterion demanding byte-identical current behavior, and
  Behavior 2's own "confidence … still governs every non-signature retrieval path". Live, not
  theoretical: `skills/debug/SKILL.md:70` passes `--keyword` with no signature.
  *Recommendation:* scope Behavior 1 to the signature axis only; drop or restate the
  "keyword above module-scope" clause. **See the note below on SA-3 vs CON-2 — the two reviewers
  propose opposite placements and the revision must choose explicitly.**

- **SA-4** — `blocker` — `blocker_id: structural-architect:contradictory-fallback:776c5d09` — section `behaviors-4`
  What an error-triggered retrieval with a non-matching signature injects is answered three
  incompatible ways. Behavior 4: fall back to module scope "rather than returning empty". Behavior 7:
  "signature-matched entries only". Behavior 8: when it returns nothing, nothing is injected. The
  charter's Context Budget attribute sides with 7. Under Behavior 4 the common case — a failure with no
  recorded history — performs a *second* module-scoped injection of entries the entry-time query already
  injected minutes earlier, inside an already-running task. That is exactly the cost the charter's own
  rationale (cache reads ≈71% of session cost, compounding every subsequent turn) exists to avoid, and
  it is the modal case because failure heuristics are new to the store.
  *Recommendation:* split the contract by caller — Behavior 4's fallback applies to entry-time
  `retrieveHeuristics` only; the error-triggered path returns signature-matched entries only.

- **SA-5** — `blocker` — `blocker_id: structural-architect:unbudgeted-exemption:4e641159` — section `behaviors-2`
  Behavior 2 exempts `low`-confidence signature matches from the exclusion but never places them in the
  budget accounting. The cap is `highMax = ceil(limit*5/8)`, `mediumMax = limit - highMax`
  (`lib/heuristics.mjs:1436-1437`); only `high` and `medium` are ever pushed, there is no bucket for
  `low`, and the two sub-caps already exhaust `limit`. Additive is the only reading consistent with
  "returned even if its confidence is `low`" when high/medium fill the budget, and additive breaks the
  charter's Context Budget invariant ("max five `high` plus three `medium` per task context packet").
  The Error Cases row "highest-confidence first retained" is degenerate here: automatic promotion is
  structurally unreachable on the hook path (`autoPromote` counts distinct evidence paths, and the
  hook's `report_path` is deterministic from `spec_path`), so every failure heuristic stays `low`
  indefinitely, the whole signature-matched set ties, and the drop order is undefined.
  *Recommendation:* specify the bucket explicitly and give a deterministic tiebreak for the all-`low` case.

- **SA-6** — `blocker` — `blocker_id: structural-architect:false-cli-contract:4d6c3f0d` — section `behaviors-5`
  Behavior 5 claims the verb "renders the matched entries in the existing text and JSON formats, and
  prints the sentinel `__NONE__` when nothing matches at all". False for the default invocation:
  `--format` defaults to `json` (`lib/cli/heuristics.mjs:146`) and the empty result under json is
  `{"count":0,"rendered":""}` (line 214); `__NONE__` is emitted only under `--format text` (line 212).
  The acceptance criterion is unsatisfiable without changing the JSON envelope that all eight existing
  call sites consume. The Error Cases row "Store missing or unreadable | `__NONE__`" carries the same
  error. Additionally `--module` remains required (`lib/cli/heuristics.mjs:163-167`, `process.exit(1)`),
  and the spec never says whether `--signature` may be passed alone.
  *Recommendation:* qualify both the behavior and the criterion with `--format text` and state the json
  empty shape separately; state the `--module` relationship.

- **SA-7** — `warning` — Preconditions bullet 3.
  `.context-index/lifecycle-state/*.jsonl` carries `validator_report` events with a `validator` field
  and a `verdict`, but no `checks[]` array. Since the capture-side signature input is the sorted-unique
  `checks[].id` list, the jsonl branch cannot reconstruct it. The event is observable there; the key is
  not derivable from it. As written the precondition licenses an implementation that cannot close the loop.

- **SA-8** — `warning` — Behavior 6 vs charter Out of Scope ("Signatures keyed on validator check IDs").
  The charter excludes check-ID-keyed signatures because `check-id-enum.spec.md` measures 46 distinct
  `validator` spellings and is blocked on ADR-0010. The shipped capture path already contradicts this by
  hashing the sorted check-ID list; Behavior 6 requires the retrieval side to key on the same input,
  pulling this spec into the excluded territory and inheriting the enum-instability risk — any rename of
  a check ID silently forks the signature and severs the loop. The spec does not acknowledge the tension.

- **SA-9** — `warning` — Behavior 7 / Task Map row "Independent injection cap".
  The "separate config key" is unnamed with no location or resolution order, and the contrast is drawn
  against a key that does not exist: no read of `heuristics.injection_limit` exists in `lib/`, `hooks/`,
  `cli/`, or `manifest.yaml`; the default 8 is hardcoded at `lib/heuristics.mjs:1352`. The charter lists
  it as a Consumed API.

- **SA-10** — `warning` — Behavior 6 / System Constitution Reference bullet 3.
  The four failure points are structurally different delivery surfaces (a Stop hook with an
  `additionalContext` stdout channel vs three skill-markdown surfaces), and the constitution reference
  hedges with "Applies **if** … delivered via a hook". Data-flow ownership is left undecided.

- **SA-11** — `warning` — Error Cases row "Injection cap reached".
  "The drop is reported in the rendered output" changes the verb's output shape without specifying it.
  Under `--format json` the envelope is `{count, rendered}`, consumed by all eight call sites; a drop
  report is either a new envelope field or contamination of `rendered`. Neither is specified.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK

- **SEC-2** — `blocker` — `blocker_id: security-reviewer:rate-limiting:06168089` — section `behaviors-4`
  Behavior 4 and Behavior 7 contradict each other and the contradiction breaches a charter invariant.
  If Behavior 4's fallback lives in `retrieveHeuristics` — which the Task Map's "Fallback to module
  scope" row implies — then every error-triggered call at the four failure points returns module-scope
  entries on a no-match, which is what Behavior 7 forbids and what `charter.md:214` caps
  ("signature-matched entries only … default 3. Rationale is measured — cache reads are roughly 71% of
  session cost"). Behavior 8 is then unreachable through the Behavior 4 path. The failure mode is the
  common case: at a failure point the *first* occurrence has no stored signature, so the fallback fires
  on most invocations and turns the tightly-capped second injection into a second full module-scope one.
  *Recommendation:* express strict signature-only mode as a distinct option on the verb (e.g.
  `--signature-only`) so the cap is enforced in the verb and cannot be bypassed by a call site; add an
  acceptance criterion that an error-triggered call with an unmatched signature injects zero entries.

- **SEC-3** — `blocker` — `blocker_id: security-reviewer:data-exposure:fb9cc805` — section `behaviors-6`
  The spec never states how the read-side signature is derived at the four failure points — precisely
  the seam where the capture-side prose exclusion can be reversed. The shipped capture path derives the
  validate FAIL signature from identifiers only, with the sanitizer `c.id.replace(/[^A-Za-z0-9._-]/g, '')`
  and the standing comment "Write nothing rather than reaching into prose for material"
  (`hooks/post-validate-extract-heuristics.mjs:174-201`) — a deliberate prior security decision (SEC-1a,
  failure-capture review). With the read side unspecified, the natural implementation at an
  implement-task failure or recover dispatch is to hash the available failure text: a stack trace, an
  error message, a diff. That text carries absolute filesystem paths, and any secret appearing in an
  error string becomes an input to a key written to a git-tracked store and rendered into context. It
  also violates the charter invariant that derivation "depends only on failure content — never on
  timestamp, file path, run id, or observer identity" (`charter.md:119`, `:215`). Independently, a read
  key derived from prose can never equal a capture key derived from identifiers, so signature-keyed
  retrieval would match nothing and the loop would stay open with no failing test to reveal it.
  *Recommendation:* bind the read side to the capture side — the retrieval signature MUST come from
  `adev heuristics signature` over the same identifiers-only input the corresponding extractor uses;
  state explicitly that no free-text failure material is an input; add an acceptance criterion that a
  signature captured by the validate hook is byte-identical to the one the validate failure point
  retrieves with.

- **SEC-1** — `warning` — Behavior 6 / Behavior 2 (prompt-injection surface).
  Behavior 6 injects store prose into an already-running agent task at a failure point, and Behavior 2
  guarantees that never-human-reviewed `low`-confidence auto-captures reach that injection. The spec
  sets no framing, delimiting, or provenance requirement for the second injection, although every
  entry-time call site already prepends fixed advisory framing (e.g. `skills/validate/SKILL.md:120`).
  The content is influenceable without a malicious contributor: the shipped FAIL branch interpolates
  `verdict.spec_title` verbatim into both `pattern` and `antiPattern`
  (`hooks/post-validate-extract-heuristics.mjs:191-193`) with only a 500-char cap and no
  instruction-content sanitization, and `renderHeuristic` emits it verbatim
  (`lib/heuristics.mjs:1489-1507`). (OWASP LLM01, indirect via a git-tracked data store.)

- **SEC-4** — `warning` — Error Cases row "Store missing or unreadable" / Behavior 9.
  In `--format json` the degraded path emits raw exception text on stdout —
  `JSON.stringify({ count: 0, rendered: "", error: err.message })` (`lib/cli/heuristics.mjs:203`) —
  never `__NONE__`. Node fs errors carry absolute filesystem paths, so extending this verb to four new
  failure-point call sites propagates a path-bearing error string into a mid-task context packet.
  Behavior 9's "logs a warning" has the same gap: if delivered via the validate Stop hook, stdout is the
  hook's JSON channel (constitution principle 4), and a warning written there corrupts the protocol.

- **SEC-5** — `warning` — Behavior 8 (re-entrancy).
  Behavior 8 asserts error-triggered retrieval "never retries," but the spec defines no re-entrancy or
  idempotency guard. The validate failure point is a Stop-event hook, so the same signature re-fires on
  every subsequent FAIL within a task, each firing adding an injection that persists as a cache read on
  all following turns. Recommend at-most-once injection per (task, signature) pair with suppression
  state held outside the agent's context, and a `stop_hook_active` no-op.

- **SEC-6** — `suggestion` — Error Cases row "`--signature` value is malformed".
  Treating a malformed flag value as no-match-and-fall-back diverges from every other flag on the verb
  (`--module`, `--tier`, `--format`, `--injection-limit` all `process.exit(1)`,
  `lib/cli/heuristics.mjs:163-187`). The matching mechanism itself is bounded to exact string comparison,
  so this is not a blocker; the residual risk is fail-open. Split the row: a malformed *flag value* is
  caller error (validate against the existing `SIGNATURE_PATTERN`, exit 1); a malformed *stored* signature
  keeps the exit-0 skip-and-continue the third row already specifies.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

- **CON-1** — `blocker` — `blocker_id: consistency-analyzer:contract:6987d58f` — section `behavioral-contract`
  All three `lib/heuristics.mjs:1176` citations are wrong; the exclusion is at `:1442` inside
  `retrieveHeuristics`. Line 1176 is in `demoteHeuristic`'s doc comment — a different function that
  archives an already-low entry on demotion, not the retrieval budget cap. Single find-and-replace, but
  load-bearing: an implementer following the spec verbatim edits the wrong function.

- **CON-2** — `blocker` — `blocker_id: consistency-analyzer:pattern:3d5281af` — section `behaviors`
  Behavior 1's ranking chain never names confidence. `retrieval-filtering.spec.md` Behavior 2 and
  `keyword-tags-and-tiered-retrieval.spec.md` Behavior 9 both establish confidence as the primary sort
  key with scope/keyword as tiebreakers *within* a confidence band, matching the live comparator at
  `lib/heuristics.mjs:1418`. Behavior 2's "confidence still governs ordering within the signature-matched
  set" reads as signature being a tier *above* confidence, which would let a `low`-confidence signature
  match outrank a `high`-confidence non-match — never stated as intended, never reconciled with the
  sibling pattern. *Recommendation:* state explicitly where signature slots relative to confidence in the
  full comparator.

- **CON-3** — `blocker` — `blocker_id: consistency-analyzer:contract:ea6a0ee7` — section `behaviors`
  If error-triggered retrieval (Behaviors 6-8) invokes the same signature-bearing `retrieveHeuristics`
  path Behavior 4 governs, Behavior 4's fallback means a no-match returns module-scoped entries rather
  than nothing — so Behavior 7's "signature-matched only" cap does not hold and Behavior 8's
  empty-result precondition is largely unreachable. The spec never states that error-triggered retrieval
  opts out of Behavior 4's fallback.

- **CON-4** — `blocker` — `blocker_id: consistency-analyzer:contract:19a7d13a` — section `behaviors`
  Behavior 5's "The verb exits 0 regardless" is false of the shipped verb, which already exits 1 when
  `--module` is missing and for a malformed `--tier`, `--format`, or `--injection-limit`
  (`lib/cli/heuristics.mjs:163-187`). The Error Cases table enumerates only signature-specific conditions
  and never reconciles with these pre-existing exit-1 paths that the same verb keeps.
  *Recommendation:* scope the exit-0 claim to signature-related failure modes only.

- **CON-5** — `blocker` — `blocker_id: consistency-analyzer:contract:052f8ad1` — section `behaviors`
  Behavior 5's claim that `__NONE__` prints "in the existing text and JSON formats" is false: the shipped
  verb (`lib/cli/heuristics.mjs:211-215`) emits `__NONE__` only under `--format text`; `--format json`
  (the default) prints `{"count":0,"rendered":""}` and no `__NONE__` string appears in JSON output at all.

- **CON-6** — `warning` — Acceptance Criteria coverage.
  There is a criterion for Behavior 9 (store missing/unreadable) but none for Behavior 8 (store readable,
  signature simply has no match at a failure point → nothing injected, failure path unchanged). The Task
  Map "Tests" row lists only "non-blocking degradation," which reads as covering Behavior 9.

- **CON-7** — `warning` — Preconditions bullet 3.
  `.context-index/lifecycle-state/*.jsonl` `validator_report` events carry only `validator` and `verdict`,
  no `checks[]` array, so the jsonl alternative alone cannot recompose a byte-identical signature input;
  only the emitting skill's own in-memory failure path can.

---

## Cross-reviewer notes

**Convergence.** Three independent reviewers landed on the same three defects, which raises confidence
that they are real rather than stylistic:

| Defect | Raised by |
|---|---|
| `lib/heuristics.mjs:1176` is the wrong line (actual: `:1442`) | SA-1, CON-1, and a SEC note |
| Behavior 4's module-scope fallback contradicts Behavior 7 / Behavior 8 / charter Context Budget | SA-4, SEC-2, CON-3 |
| Read-side signature derivation is unspecified at all four failure points | SA-2, SEC-3 |
| Behavior 5's `__NONE__` / exit-0 CLI claims are false of the shipped verb | SA-6, CON-4, CON-5 |
| jsonl lifecycle events cannot reconstruct the capture-side signature input | SA-7, CON-7 |

**Open design question the revision must decide (SA-3 vs CON-2).** The two reviewers agree Behavior 1's
ranking is underspecified but recommend *opposite* placements. SA-3 reads the charter's "ranked above
keyword matching" plus the `low`-confidence exemption as requiring signature match to become the new
**primary** sort key ahead of confidence — otherwise the exempted `low` entry the spec exists to surface
sorts below every `high`/`medium` entry and is dropped by the budget cap anyway. CON-2 reads the sibling
specs (`retrieval-filtering`, `keyword-tags-and-tiered-retrieval`) as establishing confidence as the
permanent primary key, with signature joining keyword as a subordinate axis. Revision 2 must state one
comparator explicitly, in Behaviors, Task Map, and Acceptance Criteria together — a fix applied to only
one section will fail the next review. Note that CON-2's reading is only coherent if SA-5's budget-bucket
question is answered such that an exempted `low` entry can still be reached.

**Known defects deliberately not blocked** (reported in the pipeline brief, confirmed present, and
excluded from the blocker set by instruction): charter Consumed/Exposed API rows and
`FailureSignature.digest` lagging the verb's shape; charter `EvidenceRef.source` enum vs the live store's
four spellings; `failure-signature-key.spec.md` lagging its implementation in five places; the latent
500-char `pattern` cap.

**Spec vs shipped sibling code.** Two spec claims verified TRUE against shipped code: the eight retrieval
call sites firing once at skill entry keyed on module slug, and `skills/debug/SKILL.md:70` being the only
one passing `--keyword`. Claims verified FALSE: the `:1176` line pointer (SA-1/CON-1); the `__NONE__`
JSON-format and unconditional exit-0 CLI contract (SA-6/CON-4/CON-5). Claims unverifiable because the
spec is silent where the shipped code is specific: the read-side signature derivation input (SA-2/SEC-3).
No claim in the spec depends on failure heuristics reaching `medium` or `high` — but SA-5 shows the
unreachability of promotion makes the spec's stated drop order ("highest-confidence first retained")
degenerate, since the whole signature-matched set will tie at `low`.

---

## Summary

**Total findings:** 24 (13 blockers, 10 warnings, 1 suggestion)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 6 | 5 | 0 |
| security-reviewer | BLOCK | 2 | 3 | 1 |
| consistency-analyzer | BLOCK | 5 | 2 | 0 |

**Action required:** the spec is blocked. Run `/adev:specify --revise --spec
.context-index/specs/features/heuristics/signature-retrieval.spec.md` to produce revision 2 addressing
the 13 blockers listed in `signature-retrieval.blockers.md`, then re-review. Sweep **Behaviors, the
Actionable Task Map, and Acceptance Criteria together** — the blockers in this set touch all three
sections and a fix landed in only one will re-block.

Governance footer: `.context-index/governance/gates.yaml` defines the `spec-to-plan` transition;
consult its `approver_role` before advancing this spec to `/adev:plan` (informational, non-blocking).

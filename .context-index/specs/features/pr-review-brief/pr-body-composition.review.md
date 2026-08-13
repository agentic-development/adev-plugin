---
spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
charter: .context-index/specs/features/pr-review-brief/charter.md
verdict: BLOCK
last-reviewed-revision: 6
file-sha: 999e8cec6c5e66c7a9a14913c577744cdce830f4052b27ce7003767297fcaed6
reviewed: 2026-08-13
rigor-tier: full
---

# Architecture Review: pr-body-composition

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/pr-review-brief/pr-body-composition.spec.md` (revision 6)
> **Charter:** `.context-index/specs/features/pr-review-brief/charter.md` (revision 5)
> **Rigor tier:** `full` (risk_level `medium` → `policies.medium.review_mode: full`; no `--tier` override, no routing signal)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry: domain `software` (source level `default`); `.context-index/governance/review.yaml` declares `reviewers: []`, so the three bundled defaults apply unmodified. No load warnings. No cross-repo `depends-on` references. Context pack `base` (`include: []`). Skill extensions: `__NONE__`. Module heuristics for `pr-review-brief`: 3 retrieved and injected. Gate: `adev gate require --skill review-specs` exit 0.

**Dispatch note.** The structural-architect dispatch was executed twice — the first run's report was returned on the asynchronous channel after the aggregator had already re-dispatched to avoid a stall. Both runs were independent, saw the same context pack, and are merged below as one reviewer section; where they disagreed (question (d), and the severity of the ranking defect) the disagreement is recorded rather than smoothed, and adjudicated by the aggregator against source.

## Empirical basis

Claims in this report that bear on `lib/` or on revision 5 were re-verified by the aggregator, not taken on a reviewer's word:

- `lib/plan-routing-sidecar.mjs`: `readRoutingSidecar` does `existsSync(:285)` → `readFileSync(:291)` with no `statSync`, no file-type check, no size ceiling. Entry sort is `String(a.task_id).localeCompare(...)` at `:182` and `:231`.
- `lib/lifecycle-state.mjs`: `currentState(projectRoot, specPath)` exported at `:1401`; `resolveLogPath(:126-145)` resolves the caller-supplied spec path to `<root>/.context-index/lifecycle-state/<slug>.jsonl`; `effectiveRevision(:1321-1325)` folds any event lacking an integer `revision:` into bucket 1, documented at `:1302-1306`.
- `lib/cli/` holds 28 `<verb>.mjs` modules; `lib/cli/pr.mjs` does not exist and is the pattern-correct new-file location.
- Revision 5 is commit `2a767c28`; revision 6 is `9ffe6751`. Diffed directly: `rationale` occurs **13 times in revision 5 and 0 times in revision 6**; the marker literal `adev:pr-brief` occurs **0 times in revision 6**; revision 5 stated the tier order `human-only`, then `assisted-agent`, then `auto-agent` at `rev5:144` and `rev5:202`, and revision 6 states it nowhere.

## What the rewrite genuinely achieved

Recorded first, because it is the larger part of the result and because three of the four defect classes the rewrite targeted are closed by construction:

- **The three-round `readRoutingSidecar()` enumeration defect is closed.** Invariant 4's universal quantification, T1, and the acceptance criterion requiring injection of "a raw filesystem error the accessor does not wrap" line up with what the module actually does. All three reviewers agree; the aggregator re-verified the raw-errno path. This is strictly stronger than any enumeration, because it cannot be refuted by a change to the consumed module.
- **The encoder / containment / diagnostics conflation (revision-5 SA-1, SEC-1) is fixed structurally**, not by widening a task row: § Actionable Task Map carves out "Path containment" as its own row, the "Output encoder" row says "Value transformation only", and Invariant 6 states containment is "a precondition of access, not a property of rendering."
- **The one-fact-in-five-places class is genuinely eliminated within this file.** § Behaviors no longer restates encoding triggers (closing revision-5 SEC-8/CON-4), T3 explicitly retires the refuted "ascending" characterisation (closing SA-4), and § Error Cases now contains only the three exit-code-changing conditions.
- **§ Test Obligations is binding, not rhetorical** — see answer (c).

## Structural Architect (structural-architect)

**Verdict:** BLOCK — 4 blockers, 6 warnings, 2 suggestions
*(merged from two independent runs; findings unique to one run are marked)*

### SA-1 — blocker

- **blocker_id:** `structural-architect:unspecified-render-contract:76cc50b1`
- **section_anchor:** `visual-expectations`
- **Location:** § Visual Expectations; § Behaviors bullets 2/4/6; § Actionable Task Map "Slot renderers"
- **NEW** — introduced by the revision-6 rewrite.
- **Finding:** § Visual Expectations asserts *"The rendered markdown is the user-visible surface, so its shape is contractual"* and then specifies no shape beyond "a heading plus a table." No section of revision 6 names a single rendered column. Verified by diff against revision 5: the Task Map row *"carry `rationale` through the output encoder"* (`rev5:144`) and § Behaviors *"with each entry's `rationale` passed through the output encoder"* (`rev5:202`) are both gone, and the string `rationale` occurs **zero** times in revision 6 against 13 in revision 5. `rationale` is a charter In-Scope promise — *"with each task's `rationale` carried through verbatim"* — and it is the single attacker-influenceable rendered value in the module. The charter's Exposed API declares *"PR brief markdown format | artifact contract"* that `cicd` delivery and the PR template depend on; a format contract that names no field is not one. This is not a resolution of revision-5 SA-6 (`files[]`/`novelty` declared but unrendered): that contradiction was resolved by declaring nothing, which moves it from spec-internal to spec↔charter.
- **Recommendation:** State the rendered column set per owned section as a property-level contract — which charter Domain Model attributes each section renders, and which are computed but deliberately not rendered — and add a § Test Obligations row pinning the field-set-to-column mapping. Reinstating `rationale` specifically also restores the reason Invariant 5 exists.

### SA-2 — blocker

- **blocker_id:** `structural-architect:underspecified-ordering:c1d2fd0b`
- **section_anchor:** `invariants`
- **Location:** Invariant 3; Invariant 7; § Behaviors bullets 4–5; § Actionable Task Map "Ranking"
- **PERSISTENT** — revision-5 SA-3 (`dc9f3142`), and materially worse in revision 6.
- **Finding:** The attention map's primary sort — the section's entire semantic content — is now stated nowhere. Invariant 3 fixes `UNKNOWN` only *"above every task known to be low-risk"*, and "known to be low-risk" is undefined (`auto-agent` plainly; `assisted-agent` arguably). The tier order itself is never enumerated: § Task Map says *"Order by agent tier"*, § Behaviors says *"ordered by agent tier and descending blast radius"*. Revision 5 stated it explicitly twice; revision 6 removed it without replacement, and the charter's In Scope (*"ordering tasks by `selected_agent` (`human-only` first)"*) consequently has no implementer. Invariant 7 supplies **totality**, not **order** — every permutation of tiers satisfies it, so three conforming implementations give the attention map three different meanings. § Test Obligations does not cover it either: T3 pins only the accessor's incoming entry order and the tie-break layered on top. This is the clearest instance of the property technique being misapplied: bucket rank is a semantic decision **this spec owns**, not another module's internal, and it is exactly the category the rewrite's own thesis says belongs in prose.
- **Recommendation:** State the rank as an ordered key list in § Invariants, fixing `UNKNOWN`'s slot against all three tiers and stating whether an entry with an unrecognized `selected_agent` (which *does* carry a blast radius) joins that bucket or forms its own. Leave only the terminal tie-break to T3.
- **Run disagreement:** run A rated this `blocker`; run B rated the same defect `warning` (its SA-3), on the ground that Invariant 7 at least forces determinism. Adjudicated as `blocker`: determinism without a defined order satisfies the letter of Invariant 7 while defeating the charter capability the section exists to deliver.

### SA-3 — blocker

- **blocker_id:** `structural-architect:narrowed-consumed-contract:51ebd258`
- **section_anchor:** `behaviors`
- **Location:** § Inputs (Verification row); § Behaviors, verification bullets; § Test Obligations T6
- **NEW** — introduced by the revision-6 rewrite.
- **Finding:** Revision 5 declared four consumed verification fields: `steps.validate.status`, `byRevision[N].verdict`, `byRevision[N].reports[]` (one row per validator, id and verdict), and `byRevision[N].blockers[]` (count, listed when non-empty). Revision 6 carries only the verdict — T6 pins *"the projection field path carrying a validate **verdict**"*, § Behaviors says *"the verification section reports **it**"*. Per-validator reports and blocker count vanish with no invariant, no test obligation, and no deferral. This contradicts three places in the approved charter: § Capability Map's must-have row (*"Report `/adev:validate` verdict, **gates, and check results**"*), § Domain Model's `Verification Summary { verdict, gates[], check_results[] }`, and § Consumed APIs (*"Verdict, per-validator reports, and blockers"*). It is scope loss against an approved charter rather than prose compression, and it defeats the charter's stated reviewer purpose — a bare PASS/FAIL does not let a reviewer *"safely decline to re-verify what was already verified"*, because it does not say what was verified.
- **Recommendation:** Either restore per-validator reports and blocker count as rendered content (one behavior plus one T-row), or record the narrowing in the charter's § Deferred Capabilities with the reviewer-cost argument stated. Silence is the one option that leaves the two documents disagreeing.

### SA-4 — blocker

- **blocker_id:** `structural-architect:dropped-charter-invariant:fd55c579`
- **section_anchor:** `invariants`
- **Location:** § Invariants (the nine); § Behaviors bullets 2–3; § Acceptance Criteria
- **NEW** — introduced by the revision-6 rewrite.
- **Finding:** The charter's Domain Model invariant *"Every commit in the `base..head` range appears in exactly one Traceability Row, or in an explicit untraced bucket. No commit is silently dropped"* has no counterpart among the nine, and revision 5's acceptance criterion stating it with a summing test was deleted. Invariant 2 (*"No silent absence"*) is about **sections** rendering gap lines, not about a partition over commits. § Behaviors describes both buckets but never asserts they are exhaustive **or** disjoint — a commit carrying two `Spec:` trailers lands in two rows under a literal reading, and a merge commit or a commit whose `Spec:` value fails Invariant 6's containment can be dropped entirely with nothing failing. Completeness of the traceability partition is the property that makes the section trustworthy at all, and revision 6 neither states nor tests it. Two further rules vanished in the same class and are folded here: the charter invariant *"never interleaved with author-written text"* has no revision-6 counterpart, and revision 5's thrice-stated prohibition *"never falls back to another revision"* on the verification read is gone — Invariant 4 requires `UNKNOWN` plus a named cause but does not forbid silently substituting a verdict recorded at a different revision, which is the failure mode the stale-revision rule exists to prevent.
- **Recommendation:** Restore the partition as an invariant ("every commit in the resolved range lands in exactly one bucket"), with a criterion asserting the bucket counts sum to `git rev-list --count base..head`, and state the multi-`Spec:`-trailer case. Add the no-fallback-to-another-revision prohibition to Invariant 4 or to the verification decision paragraph.

### SA-5 — warning

- **Location:** § Section ownership ¶3; § Acceptance Criteria ("total-size ceiling"); cross-spec against `pr-body-advisories.spec.md` § Resource Bounds
- **PERSISTENT** — revision-5 SEC-7, partly addressed.
- **Finding:** *(This is the cross-spec item the requester asked about.)* Enforcement **ownership** is now stated consistently on both sides and there is no gap and no double-ownership: composition assembles and enforces, advisories reports its contribution and bounds only its own per-value and per-collection quantities. Three residual holes remain. (i) The ceiling has **no value and no obligation in this spec** — the number lives only in advisories' T5 (*"the numeric value of each of the four resource bounds"*), so the enforcing component carries no obligation pinning what it enforces, and the two specs scope the quantity differently: advisories calls it *"the total bytes the **two sections** contribute"*, composition calls it *"the **total rendered size of the brief**"* (five slots plus markers). Two different quantities under one name. (ii) No **truncation-selection rule**: *"a renderer over-contributing is truncated"* covers one oversized slot, not five in-bound slots that jointly exceed the total. Slot 1 is the section advisories argues a reviewer needs earliest; cutting it rather than slot 4 is materially different and currently unconstrained. (iii) Composition's own three sections carry **no per-section budget**, so an unbounded untraced-commit bucket can starve the sibling's slots under a total-only ceiling.
- **Recommendation:** Move the total's numeric obligation into this spec's § Test Obligations, restate advisories as three self-owned bounds plus one reported contribution, give assembly a per-section budget so overflow in one slot cannot evict another, and state the truncation order across the five slots with risk-bearing sections last to be dropped.

### SA-6 — warning

- **Location:** Invariant 6; § Inputs, verification decision paragraph
- **NEW** *(run A only, as its SA-3 blocker; adjudicated down — see answer (d))*
- **Finding:** Invariant 6 is universally quantified over *"a path derived from a trailer"*, but § Inputs mandates the verification read through `currentState(projectRoot, specPath)`, and `lib/lifecycle-state.mjs:126-145` resolves that caller-supplied path to `.context-index/lifecycle-state/<slug>.jsonl` — outside the declared root, guarded by that module's own `INVALID_SPEC_PATH` check against a *different* root. Under a transitive reading of "derived", the invariant forbids a required input; under a direct reading it holds, because the trailer-derived path itself (the `.spec.md` file) *is* confirmed inside `.context-index/specs/` before the call. The defect is that the spec does not say which reading governs, and the acceptance criterion *"Invariant 6 is tested by instrumenting the filesystem call"* resolves differently under each — an instrumented-fs-call assertion fails on a conforming implementation under the transitive reading.
- **Recommendation:** Scope Invariant 6 explicitly to the paths this verb opens itself (spec frontmatter, routing sidecars) and state the projection read as containment delegated to `lib/lifecycle-state.mjs`; or widen the root to `.context-index/` and name which subtree each reader may touch.

### SA-7 — warning

- **Location:** Invariant 5; § Acceptance Criteria (*"Invariant 5 is tested once per prohibited outcome: … shell interpretation"*)
- **PERSISTENT** — residual of the revision-5 SA-1/SEC-1 class.
- **Finding:** The encoder/containment and encoder/diagnostics splits are genuinely done, but Invariant 5 still lists *"be interpreted by a shell"* among the outcomes its single interpolation-boundary function prevents, and the acceptance criterion tests it there. No render-time encoder can make a value shell-safe; the actual control is the Task Map's separate "Trailer reader" row (*"values consumed as data, never reaching a shell"*), which runs strictly before rendering. Same shape as the refuted defect at smaller blast radius: the criterion mandates a test that can only be vacuous, and the invariant attributes a safety property to a mechanism that cannot deliver it.
- **Recommendation:** Move the shell-safety outcome out of Invariant 5 and attach it to the trailer reader as its own property, with the criterion asserting no trailer value reaches a child-process argument vector.

### SA-8 — warning

- **Location:** Invariant 1; § Section ownership ¶2; § Test Obligations T7
- **NEW** *(run A)*
- **Finding:** Revision 6 no longer names the marker literals — verified, `adev:pr-brief` occurs zero times in the file, where revision 5 named them in § Visual Expectations. This spec is the **emitter**; `review-packet-template.spec.md` reserves the pair and `cicd` delivery replaces between them, so byte-equality between emitted and reserved markers is a hard interlock. T7 pins the H2-heading half of the interlock and nothing pins the marker-literal half. Invariant 1 counts pairs without defining what it counts.
- **Recommendation:** Add a T-row pinning the emitted marker literals against the sibling artifact's reserved pair, in the same style as T7.

### SA-9 — warning

- **Location:** § Inputs (*"its file set is the union of paths those commits touch"*); § Actionable Task Map ("Task universe builder")
- **PERSISTENT** — revision-5 SA-6 / CON-2, unaddressed.
- **Finding:** The per-task file set is still derived and still rendered nowhere: no invariant, behavior, visual expectation, or acceptance criterion consumes it. The § Inputs justification that follows it (*"it is the set difference between this universe and the sidecar's entries that makes `UNKNOWN` computable at all"*) needs only the `(spec_path, task_id)` pairs, not the paths. The charter's `Attention Entry.files[]` remains an unfulfilled rendering promise. `scores.novelty` was resolved the other way — dropped cleanly from this spec — but the charter still declares it in § Domain Model and § Consumed APIs, so the same mismatch now exists as silence rather than as a contradiction.
- **Recommendation:** Name the rendered column for the file set, or state that it is internal bookkeeping only and drop it from § Inputs and the Task Map. Reconcile `novelty` in the charter rather than leaving the two documents silently divergent.

### SA-10 — warning

- **Location:** § Inputs, third decision paragraph; § Test Obligations
- **PERSISTENT** — revision-5 SA-7, unaddressed for the third round.
- **Finding:** The spec states the plan-stem derivation is *"explicit rather than incidental"* and that the two stems coinciding *"is not something the implementation may rely on"* — then adds no T-row and no criterion exercising it. This is the one place where revision 6 does not apply its own thesis: a claim about another module's keying asserted in prose with no test behind it is precisely the failure mode the rewrite exists to eliminate.
- **Recommendation:** Add a T-row using a fixture whose plan stem differs from its spec stem, asserting the sidecar is found.

### SA-11 — suggestion

- **Location:** § Test Obligations, rows T1 and T4
- **Finding:** Two rows sit outside the category the delegation argument justifies. T1 (*"**Every** failure mode `lib/plan-routing-sidecar.mjs` can raise"*) is not discharge­able — a test samples, it cannot enumerate a module's raw-errno surface; the binding force actually comes from Invariant 4 plus the acceptance criterion requiring an unanticipated injected failure. T4 (*"the exact character set and transformation order **the encoder** applies"*) delegates a decision **this spec owns**; a test that records what the implementation happens to do is a change-detector, not a contract, and cannot fail a first implementation whatever it does. The stated rationale (*"the property is stable, the mechanism is not"*) is an argument for not pinning it in a test either.
- **Recommendation:** Restate T1 as "a representative wrapped code and at least one raw fs errno, each degrading per Invariant 4". For T4, either fix one neutralization mechanism in § Invariants or drop the row and let the per-prohibited-outcome criteria carry it.

### SA-12 — suggestion

- **Location:** § Inputs, verification paragraph; T6
- **PERSISTENT** — revision-5 SA-8, unaddressed for the third round.
- **Finding:** `effectiveRevision()` (`lib/lifecycle-state.mjs:1321-1325`, documented at `:1302-1306`) folds any event lacking an integer `revision:` into `byRevision[1]`. Verified in source. For a spec at revision 1, a legacy-folded verdict of unknown provenance is indistinguishable from a verdict genuinely recorded against revision 1, so the spec's *"a verdict about different text"* guarantee fails silently in exactly that case — the false reassurance the charter's verification capability exists to prevent. T6 covers the no-verdict-at-current-revision case, not this one.
- **Recommendation:** Extend T6 to the bucket-1 ambiguity, or declare it explicitly out of contract.

**Not flagged (verified sound):** § Section ownership matches `pr-body-advisories.spec.md` § Section Placement on slot list, order, and owners, and both agree renderers emit no marker. ADR-0012 compliance is correct on both counts — plan-stem peer naming per § Permitted peers, and `.md` human-primary versus accessor-read machine state. File naming complies with `spec-file-suffixes.spec.md`. Constitution mapping is accurate: no new dependency, pure ESM, no inline Node in SKILL.md, and the `cli-driver-surface` boundary respected (the spec contributes a verb and does not redefine dispatch; `lib/cli/pr.mjs` is the pattern-correct location among 28 existing `lib/cli/<verb>.mjs` modules). Dependency direction is clean, with no inbound dependency on `cicd`, consistent with the charter's note that the dependency runs inbound. § Error Cases correctly contains only the three exit-code-changing conditions. Invariant 4 and T3 are both genuine improvements over what they replaced.

*One run additionally noted that `--head` appears in § Preconditions while the charter's Exposed API is `adev pr body [--base <ref>]`. Recorded here rather than as a finding: `--head` defaulting to `HEAD` is required for the determinism criterion to be stated over a resolved pair at all, and widening a documented CLI surface is inside the constitution's Autonomous boundary. Worth a one-line charter amendment at the next charter revision.*

---

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK — 2 blockers, 3 warnings, 1 suggestion

### SEC-1 — blocker — input-validation

- **blocker_id:** `security-reviewer:input-validation:a56da225`
- **section_anchor:** `invariants`
- **Location:** Invariant 6; § Test Obligations T5
- **PERSISTENT** — revision-5 SEC-5, partly regressed.
- **Finding:** Invariant 6 requires containment *"after canonicalizing both the path and the root"* but never names the operation, and the two candidate mechanisms differ in security outcome. Under lexical `path.resolve` — what revision 5 actually specified — a symlink committed at `.context-index/specs/features/x/evil.spec.md` pointing at `/dev/zero`, `/proc/self/fd/0`, or a FIFO passes containment and is then opened. Git stores symlinks, so this is reachable from the stated threat model (attacker-influenceable filenames under `.context-index/`). Revision 6 additionally **dropped the file-type gate**: the sibling `pr-body-advisories.spec.md` § Resource Bounds requires *"the plan read is additionally refused unless the target is a regular file, since a symlink to a character device is not large and no size ceiling would catch it"*, and composition — which performs the only trailer-derived read — states no equivalent. T5 does not close it: *"a path outside the artifact root never reaches a filesystem call"* is trivially satisfied by a symlink whose **lexical** path is inside. CWE-59, CWE-22, CWE-367.
- **Recommendation:** Name the mechanism in Invariant 6 — resolve the candidate with `realpath`, not lexical normalization, compare against the realpath'd root with a trailing-separator prefix test, then gate on regular-file before reading, mirroring the sibling's requirement. Resolve the self-reference the invariant currently creates (realpath is itself a filesystem call on a trailer-derived path) by scoping the ban to **content** reads and naming metadata resolution as the permitted gate operation. Add a T-row pinning that a symlink inside the root pointing outside it is refused.

### SEC-2 — blocker — rate-limiting (availability)

- **blocker_id:** `security-reviewer:rate-limiting:1ddfa123`
- **section_anchor:** `invariants`
- **Location:** Invariant 4; § Postconditions
- **PERSISTENT** — revision-5 SEC-2/SEC-7 lineage, reframed. The *enumeration* half is closed; the *achievability* half is not.
- **Finding:** Revision 6 correctly closes the enumeration defect — Invariant 4's *"including … errors the underlying module does not wrap"* covers the raw `EISDIR` from `readFileSync` at `lib/plan-routing-sidecar.mjs:291`, verified. But its universal quantification is not achievable against that module as written, and no bound anywhere in this spec makes it so. `readRoutingSidecar()` does `existsSync` → whole-file `readFileSync(path, 'utf8')` with no `statSync`, no file-type check, and no size ceiling; composition specifies no pre-read bound on the sidecar or on the referenced spec file. An oversized or device-backed sidecar therefore produces a failure that is not a catchable throw — an allocation abort, or an indefinite block on a FIFO — and neither is *"a failure to obtain an input"* that any `catch` can convert to `UNKNOWN`. The sibling bounds plan-file size **before** reading; composition bounds only **rendered** bytes, never **input** bytes. This contradicts the postcondition *"Exit code is 0 whenever `HEAD` and the base ref resolve"* and the charter's Availability row (*"must not fail CI"*). CWE-770, CWE-400, CWE-1284.
- **Recommendation:** Add an invariant that no input file is read until it is confirmed a regular file under a stated byte ceiling — applied to the sidecar path (obtainable via `sidecarPathFor()`; a stat is not the hand-written parser § Inputs forbids) and to the referenced spec file — with over-ceiling rendering as an Invariant-4 named degradation. Then narrow Invariant 4 to "any *thrown* failure", so it stops asserting coverage of aborts and hangs no design can catch. The narrowing is not a retreat to enumeration: it replaces an unachievable universal with an achievable one plus an explicit pre-read gate.

### SEC-3 — warning — input-validation

- **Location:** Invariant 5; § Acceptance Criteria (per-prohibited-outcome list)
- **PERSISTENT** — revision-5 SEC-6, unaddressed for the third round, and arguably regressed.
- **Finding:** Invariant 5's prohibited-outcome list (table structure, line break, link/image, HTML comment delimiter, shell) is **closed**, and the criterion tests *"once per prohibited outcome"*. Neither includes C0 control characters (`\x1b`, `\x07`) or Unicode bidirectional overrides (U+202A–202E, U+2066–2069). A reviewer's terminal is a named output sink in this module's threat model, and trailer values carry no charset or length bound at any layer — `validateEntry` bounds only `rationale`, at 400 characters. An implementation passing every criterion still pipes ANSI escapes and Trojan Source reorderings (CVE-2021-42574) into stdout and into a public PR body. Closing the outcome list without adding these codepoint classes is what makes this a regression rather than a standstill. CWE-117, CWE-838, CWE-451.
- **Recommendation:** Add two prohibited outcomes to Invariant 5 — any C0 control character, and any bidi-override or isolate codepoint — with a criterion case each, and have T4 pin the allowed codepoint class as an **allowlist** (printable plus tab) rather than a denylist.

### SEC-4 — warning — input-validation

- **Location:** § Inputs (Task universe row, *"Accessed via `git log`, `git diff-tree`"*); § Actionable Task Map ("Trailer reader")
- **PERSISTENT** — revision-5 SEC-4, regressed.
- **Finding:** Revision 5 at least specified `git log --format`; revision 6 reduces this to *"`git log`, `git diff-tree`"* with no record or field delimiter, and no invariant states that a commit cannot forge a record boundary. A `%B`-plus-regex implementation lets an attacker-authored commit **body** containing a literal `Spec:` or `Plan-task:` line be attributed to an adjacent commit, or split the stream so the traceability section degrades wholesale — suppressing the untraced-commit signal, which is the charter's stated trust-boundary control. Nothing in § Invariants, § Test Obligations, or § Acceptance Criteria makes either wrong. This is a **property**, not a value, so by the rewrite's own thesis it belongs in prose. CWE-93.
- **Recommendation:** Add an invariant: trailer values are read only through git's own trailer parser, and record and field boundaries are NUL-delimited so that no value can create one. Add a T-row pinning that a commit whose *body* contains a `Spec:` line yields no traceability association.

### SEC-5 — warning — rate-limiting

- **Location:** § Section ownership ¶3 (cross-slot ceiling)
- **NEW** — the per-section half of the ceiling.
- **Finding:** The cross-spec ownership statement is sound (see SA-5), so the oversized-body vector is genuinely relocated rather than lost. But composition's own three slots have **no** per-value or per-collection bound — commit count, untraced-SHA list, per-task file set, and `Spec:`/`Plan-task:` value length are all unbounded, while advisories explicitly scopes *"the unit of every bound is the individual rendered value"* to **its** slots. With a single global ceiling and no stated truncation order, one oversized `Spec:` trailer value rendered inside slot 2 truncates slots 4 and 5 — the attention map and verification sections, precisely the risk signals. Invariant 2 is then nominally satisfied ("naming which section was truncated") while the attacker chooses what survives. CWE-770.
- **Recommendation:** As SA-5(iii): per-section byte budgets plus a per-value length cap enforced in the Invariant-5 encoder (the 400-character precedent `validateEntry` sets for `rationale` is a reasonable anchor), with truncation rendered as a named degradation and risk-bearing sections last to be dropped.

### SEC-6 — suggestion — data-exposure

- **Location:** § Inputs (Verification row); § Behaviors, verification bullets
- **PERSISTENT** — revision-5 SEC-9, unaddressed.
- **Finding:** The verification section is titled *"what the lifecycle already checked"* and exists so a reviewer can decline to re-verify. Its row key is the `Spec:` trailer — an unauthenticated author assertion — while its verdict comes from the lifecycle projection. An author can attach a trailer naming a spec their change did not touch and have a genuine PASS rendered beside their commits, laundering a real measurement onto unmeasured code. This is the charter's central promise (*"the enforced separation between what the author claims and what the lifecycle measured"*) and no invariant states it.
- **Recommendation:** Render the association's provenance in the row — mark it author-asserted, and where computable flag rows whose commit paths are disjoint from the paths the validate projection recorded for that spec revision. At minimum, one contract sentence stating the spec↔commit association is author-asserted, so the section is not read as an independent attestation.

**Not flagged:** no authentication or authorization findings — a local read-only CLI verb whose postconditions forbid network and forge calls. No secrets-handling findings. The marker/authorship boundary is covered (Invariant 1 plus Invariant 5's comment-delimiter clause address the `cicd` replace-from-marker risk). Read-only and no-forge are covered by Invariants 8–9 plus three criteria. Base-ref configuration trust is correctly owned and correctly reasoned in the sibling's § Configuration — the head-side bypass is closed there. The routing-parser and `.validate.md` prohibitions are sound; `skills/validate/SKILL.md` does forbid re-parsing the report.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES — 0 blockers, 3 warnings, 1 suggestion

### CON-1 — warning — domain-model

- **PERSISTENT** — revision-5 CON-2, unaddressed.
- **This Spec:** § Actionable Task Map: *"Task universe builder | The `(spec_path, task_id)` set and each task's file set."*
- **Conflicts With:** `charter.md` § Domain Model, Attention Entry `files[]` (line 55) — a declared key attribute of the rendered entity. No Invariant, Behavior, Visual Expectation, or Acceptance Criterion in this spec renders it.
- **Recommendation:** State the rendered column, or note the file set is internal bookkeeping feeding the `UNKNOWN` set difference, so the charter's entity table is not read as a rendering promise. *(Same defect as SA-9.)*

### CON-2 — warning — domain-model

- **PERSISTENT (changed form)** — revision-5 CON-3.
- **This Spec:** silent — `novelty` does not appear anywhere in revision 6.
- **Conflicts With:** `charter.md` § Domain Model (Attention Entry `novelty`) and § Consumed APIs (`scores.novelty`), both unchanged at charter revision 5.
- **Recommendation:** The internal self-contradiction is gone, which is progress, but the charter promise is now silently unaddressed rather than misstated. Either add an invariant or test obligation covering `novelty`, or have the charter drop it — as it already did for `Author-type`/`Operator` in its own revision 3 — instead of leaving a silent gap between two documents.

### CON-3 — warning — domain-model

- **NEW** — surfaced by diffing revision 5.
- **This Spec:** § Inputs (Verification row) and T6 cover only a verdict at a revision, plus staleness.
- **Conflicts With:** `charter.md` § Domain Model, `Verification Summary { gates[], check_results[] }`; § Consumed APIs, `state.steps.validate` — *"Verdict, per-validator reports, and blockers"*; § Capability Map, must-have *"Report `/adev:validate` verdict, gates, and check results"*.
- **Recommendation:** Add an invariant or Test Obligation row for per-validator detail, or amend the charter's Capability Map and Domain Model to narrow "Verification summary" to verdict-plus-staleness, matching what this spec now commits to. *(Same defect as SA-3, which the aggregator rates blocking.)*

### CON-4 — suggestion — naming

- **PERSISTENT** — revision-5 CON-5, plus one addition.
- **This Spec:** T7: *"…per `review-packet-template.spec.md` AC-6."*
- **Conflicts With:** that sibling (revision 2, validated) still has an unnumbered checkbox list — no `AC-6` anchor exists. Additionally T7's framing (*"no output **line** begins with…"*) is narrower than the sibling's (*"no output **path** … emits any of the four packet headings"*). The narrower framing is the semantically correct one for markdown, so this is drift rather than defect.
- **Recommendation:** Quote the referenced bullet's text instead of an index, and align the phrasing so a reader does not have to work out which contract governs.

**Verified consistent:** § Section ownership matches `pr-body-advisories.spec.md` § Section Placement exactly on slot numbers, order, and owners. The total-rendered-size bound is stated on exactly one side (composition's marker assembly) and the sibling correctly defers to it with no gap and no double-ownership — the *ownership* statement is clean; the *value and truncation rule* are the residual gap (SA-5). Frontmatter (`revision: 6`, `charter-revision: 5`, `status: review-pending`, `risk_level: medium`) is internally coherent and matches the approved charter revision. File suffix complies with `spec-file-suffixes.spec.md`. Every § Inputs claim checkable against `lib/plan-routing-sidecar.mjs` and `lib/lifecycle-state.mjs` held: the sidecar carries no file list, plan-stem keying is enforced rather than conventional, and the `.validate.md` re-parse prohibition is genuine.

---

## Cross-finding notes

These govern how revision 7 should be written; they are not additional findings.

1. **SA-1, SA-3/CON-3, and SA-4 are one defect class with three instances:** normative content that revision 5 carried was deleted rather than converted, and in each case the deleted content is still promised by the **approved charter** (`rationale` and the rendered field set; per-validator reports and blockers; the commit partition). The rewrite's compression rule — "properties here, values in tests" — has no third bucket for *"a rendering commitment this spec owns"*, so those sentences fell out of both. One editing pass fixes all three: walk the charter's § Domain Model, § In Scope, and § Capability Map, and for every attribute confirm revision 7 either renders it (as a property) or defers it (in the charter).
2. **SA-2 is the same class, applied to a decision rather than a field.** Do not fix it with another "sorts above" clause — three such clauses are what produced the original ambiguity. State one ordered key list.
3. **SEC-1 and SEC-2 share a single missing mechanism:** a pre-read gate that resolves the candidate path canonically, refuses non-regular files, and refuses over-ceiling sizes. That one gate closes the symlink escape and the resource bound together, and the sibling already specifies exactly it for its own plan reads — so the fix is to hoist a stated requirement, not to invent one.
4. **SEC-2's recommendation narrows Invariant 4 and this is not a regression to enumeration.** "Any *thrown* failure" plus an explicit pre-read gate is achievable; "any failure for any reason" is not. Keep T1 and the unanticipated-failure criterion exactly as they are.
5. **SEC-3, SEC-4, SA-9, SA-10, SEC-6 and CON-4 are all in their third round unaddressed.** They are warnings, not blockers, but a defect surviving three reviews is evidence the review is not the mechanism that will close it. Consider converting each into either a T-row or an explicit § Deferred Capabilities entry in revision 7, so the next round has something to check rather than the same silence.

## Revision-5 blocker disposition

| Revision-5 blocker | Status | Evidence |
|---|---|---|
| `structural-architect:non-encoding-rule-in-encoder:34de5558` | **addressed** | Task Map splits "Path containment" into its own row; "Output encoder" reads *"Value transformation only — containment (Invariant 6) and diagnostics (Invariant 9) are separate concerns and do not belong in it."* Invariant 6 states containment is a precondition of access. Fixed by splitting ownership, per revision-5 cross-finding note 3, not by widening a row. |
| `security-reviewer:input-validation:e9353df4` | **addressed** | Same edit. |
| `structural-architect:incomplete-throw-set:6f4d7ed7` | **addressed** | Enumeration deleted from every section; Invariant 4 universal; criterion requires injecting *"a raw filesystem error the accessor does not wrap"*; T1 delegates the set to a test against the real module. Re-verified against `lib/plan-routing-sidecar.mjs:285,291`. |
| `security-reviewer:rate-limiting:70d813a6` | **partially addressed** | The enumeration half is closed. The availability half is not: no input-side bound exists, so Invariant 4's universal is unachievable. New id `1ddfa123` (SEC-2) — the defect has changed shape, so the id is not reused. |
| `consistency-analyzer:incomplete-throw-enumeration:f8a71d9d` | **addressed** | No section contradicts another; § Error Cases defers explicitly to Invariant 4. |
| `structural-architect:underspecified-ordering:dc9f3142` | **not addressed — worse** | Determinism half closed by Invariant 7. Rank half regressed: revision 5 at least stated the tier order twice; revision 6 states it nowhere. New id `c1d2fd0b` (SA-2). |

**Revision-5 warnings and suggestions:** SA-4 (`localeCompare` vs "ascending") — **addressed**, T3 names the refutation. SA-5 (`INVALID_ROUTING_ENTRY` triggers) — **addressed by removal**, T1 delegates the set. SA-6 (`files[]` / `novelty`) — **half**: `novelty` dropped cleanly, `files[]` persists (SA-9 / CON-1). SA-7 (stem derivation untested) — **unaddressed**, third round (SA-10). SA-8 (`byRevision[1]` fold) — **unaddressed**, third round (SA-12). SEC-3 (encoder mechanism) — **addressed by delegation** to T4, though T4 is itself weak (SA-11). SEC-4 (record delimiter) — **regressed** (SEC-4). SEC-5 (realpath + regular file) — **partly regressed** (SEC-1). SEC-6 (C0/bidi) — **unaddressed**, third round, arguably regressed (SEC-3). SEC-7 (bounds) — **partly addressed**: total ceiling added and cross-spec consistent on ownership; value, truncation rule, per-section and input-side bounds still open (SA-5, SEC-2, SEC-5). SEC-8 / CON-4 (stale Behaviors trigger list) — **addressed**, the sentence is gone. SEC-9 (asserted vs measured) — **unaddressed** (SEC-6). CON-2 (`files[]`) — **unaddressed** (CON-1). CON-3 (`novelty`) — **changed form** (CON-2). CON-5 (`AC-6` index) — **unaddressed** (CON-4).

**New vs persistent:** of six blockers, **three are NEW and introduced by the revision-6 rewrite itself** (SA-1, SA-3, SA-4 — all deletions of charter-promised content), **two are PERSISTENT** (SA-2, the ordering defect now in its second round and materially worse; SEC-2, the availability half of a defect in its third round), and **one is PERSISTENT-partly-regressed** (SEC-1). Notably, none of the three previously-blocking *enumeration* defects recurs — the rewrite's thesis worked on the problem it was aimed at. The new blockers are the cost of the same edit.

---

## Answers to the four questions posed with this spec

**(a) Is the property-based framing sufficient, or has it become vague?** Sufficient where the fact belongs to **another module**; insufficient where the spec compressed away a decision **it owns**. Invariant 4 plus T1 is strictly stronger than the three enumerations it replaced, because it cannot be refuted by a change to the consumed module — that is real progress, not rhetoric. Invariants 1, 2, 5, 6, 7, 8, 9 each name a falsifiable condition with a matching criterion saying *how* it fails (byte-diff, call instrumentation, one case per prohibited outcome). But two invariants assert less than they appear to: Invariant 3's *"above every task known to be low-risk"* cannot fail a review because "low-risk" is undefined and the tier order is stated nowhere (SA-2), and Invariant 7's totality clause is satisfied by every implementation that sorts deterministically, in any order. So the requester's own stated failure mode — an invariant that cannot fail a review — did occur, in two of nine. **The discriminator is ownership, not abstraction level**, and the rewrite applied the technique uniformly instead of only where the fact was foreign. That single distinction, applied to revision 7, resolves SA-1, SA-2, SA-3 and SA-4 together.

**(b) Are the nine invariants exhaustive of what the enumerations covered?** No — and the losses are not in what the enumerations covered but in what surrounded them. Confirmed by diffing `2a767c28` against `9ffe6751` (235 → 166 lines), six normative items vanished with no invariant, obligation, or criterion covering them: the tier order `human-only → assisted-agent → auto-agent` (`rev5:144`, `rev5:202`); `rationale` being rendered at all (13 occurrences → 0); commit-partition completeness and its sum-to-total test, which is also a charter invariant; the *"never falls back to another revision"* prohibition, stated three times in revision 5; per-validator `reports[]` and `blockers[]` as required verification output; and the marker literal strings. Two more were weakened rather than dropped — the degradation annotation no longer requires naming the offending path, and the git record-delimiter specification became just *"`git log`"*. Everything the six **blockers** covered is genuinely carried forward. The losses concentrate where revision-5 **warnings** pointed, because in a rewrite of this kind "fixed it" and "deleted it" are indistinguishable in the diff — which is the structural hazard of rewriting rather than patching, and the reason this round produced three new blockers.

**(c) Is § Test Obligations a legitimate delegation or an evasion?** Legitimate, and the spec **does** make it binding. *"Everything listed here must be pinned before this spec is validated"* is backed by a first-class acceptance criterion — *"Each row of § Test Obligations has a test pinning it against the real module"* — sitting in the same checklist, and therefore the same gate, as every other criterion. That is structural enforcement, not assertion, and all three reviewers independently reached the same conclusion. Two qualifications. First, the delegation is correctly scoped for five of seven rows, which concern facts this spec cannot own; T1 promises a coverage a test cannot discharge (SA-11) and T4 delegates a mechanism this spec **does** own, so a test there records rather than constrains. Second, and more important: a T-row can only pin a value an implementation already chose. T4 pins *"the exact character set the encoder applies"* — but if the implementer picks a set omitting `\x1b`, T4 still passes, because the requirement that `\x1b` be in the set is stated nowhere (SEC-3). **Delegation works for facts owned elsewhere; it cannot carry a requirement the spec never stated.** The section is not an evasion; it is being asked to do one job it cannot do.

**(d) Can any sentence be falsified by reading `lib/`?** On the aggregator's adjudication: **no sentence is cleanly falsified, but the claim is weaker than it sounds.** Two of the three reviewers who attempted it could not falsify one, and every checkable assertion held under direct verification — `lib/plan-routing-sidecar.mjs` is the sole parser (`sidecarPathFor:92` throws `INVALID_PLAN_PATH` on any path not ending `.plan.md`, so plan-stem keying is enforced rather than conventional); the sidecar carries no file list (`normalizeEntry:157-169` emits only `task_id`, `selected_agent`, four scores, and `rationale`); `currentState(projectRoot, specPath)` exists at `:1401` with the stated arity and revision-keyed projection; `skills/validate/SKILL.md` does forbid re-parsing `.validate.md`; `lib/cli/pr.mjs` is the pattern-correct location among 28 sibling verb modules; and trailer-derived spec, plan, and sidecar paths do all live under `.context-index/specs/`. The one claimed falsification — that Invariant 6's root is contradicted because `currentState()` resolves into `.context-index/lifecycle-state/` (`lib/lifecycle-state.mjs:126-145`, verified) — turns on whether *"a path derived from a trailer"* reads transitively. Under the direct reading the invariant holds, because the trailer-derived path itself is confirmed inside the root before the call. So it is an **ambiguity, not a falsification**, and it is recorded as SA-6. Two caveats keep this from being a clean win. First, Invariant 4's *"any failure, for any reason"* is not falsified by any single line of `lib/`, but it **is** unachievable against a module that reads unbounded input with no pre-read gate (SEC-2) — a universal that no implementation can satisfy is a weaker sentence than one that is merely wrong. Second, revision 6 achieves unfalsifiability substantially by making **fewer checkable claims about `lib/` than revision 5 did**; that is the trade the rewrite intends, and it is a good trade, but "no sentence can be falsified" is a property that a spec saying nothing would also have. The claim is best stated as what it actually earned: *no sentence in this spec transcribes another module's internals, so no change to that module can make this spec wrong.*

**Cross-spec note (as requested):** both sides state the total-rendered-size ownership, and they agree. `pr-body-composition.spec.md` § Section ownership ¶3 — *"Assembly also owns the total rendered size of the brief, because it is the only component that sees every slot"* — and `pr-body-advisories.spec.md` § Resource Bounds — *"The total-bytes bound is cross-slot, so it cannot be owned by either slot renderer … enforced by the marker assembly in `pr-body-composition.spec.md`"* — are consistent, with no gap and no double-ownership. The residual defects are on the enforcing side only: the ceiling's numeric obligation lives in the sibling's T5 rather than here, the two specs name two different quantities (two sections' bytes versus the whole brief), there is no truncation-selection rule across five slots, and composition's own three sections have no per-section budget. Recorded as SA-5 and SEC-5 (warnings), not blockers, because the ownership question the requester raised is genuinely settled.

---

## Summary

**Total findings:** 22 (6 blockers, 12 warnings, 4 suggestions)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 4 | 6 | 2 |
| security-reviewer | BLOCK | 2 | 3 | 1 |
| consistency-analyzer | PASS_WITH_NOTES | 0 | 3 | 1 |

**Action required:** Revise to revision 7. Blocker entries with canonical `blocker_id` and `section_anchor` are in `pr-body-composition.blockers.md`. **Three edits close all six blockers:**

1. **Restore the rendering and completeness commitments the compression deleted** — the rendered column set including `rationale`, per-validator reports and blocker count (or defer them in the charter), and the commit-partition invariant with its summing criterion. Clears SA-1, SA-3, SA-4.
2. **State the attention map's rank as one ordered key list** covering all three tiers, `UNKNOWN`'s slot, unrecognized `selected_agent`, and the cross-spec merge. Clears SA-2.
3. **Add the pre-read gate**: canonical path resolution, regular-file check, and a stated byte ceiling before any input read; then narrow Invariant 4 from "any failure" to "any thrown failure". Clears SEC-1 and SEC-2.

Two further edits are strongly advised while revising, because both are in their third unaddressed round and both are one-line fixes: add C0 controls and bidi overrides to Invariant 5's prohibited-outcome list (SEC-3), and state the git record delimiter as a property (SEC-4).

**Governance:** `.context-index/governance/gates.yaml` declares `transitions: {}`, so no `approver_role` applies to the `spec-to-plan` transition and no additional approver is required beyond this gate.

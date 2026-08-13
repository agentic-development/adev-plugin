---
date: 2026-08-13
spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
charter: .context-index/specs/features/pr-review-brief/charter.md
verdict: BLOCK
tier: full
last-reviewed-revision: 5
file-sha: b5a1d78e1a9ce200f7409a91e3158b3ffd385b8245a9d1e06f5fb2103b0a2643
---

# Architecture Review: pr-body-composition

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/pr-review-brief/pr-body-composition.spec.md` (revision 5)
> **Charter:** `.context-index/specs/features/pr-review-brief/charter.md` (revision 5, approved)
> **Rigor tier:** `full` (risk_level `medium` → `risk-policies.yaml` `policies.medium.review_mode: full`; no `--tier` override, no routing signal)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry: domain `software` (source level `default`); `.context-index/governance/review.yaml` declares `reviewers: []`, so the three bundled defaults apply unmodified. No load warnings. No cross-repo `depends-on` references. Context pack `base` (`include: []`). Skill extensions: `__NONE__`. Module heuristics for `pr-review-brief`: 3 retrieved and injected. All six `blocker_id` values validated against `lib/blocker-id.mjs::parseBlockerId` — no `LEGACY_REVIEWER_OUTPUT`, `INVALID_BLOCKER_ID`, or `MISSING_SECTION_ANCHOR` advisories.

## Empirical basis

Revision 5 asserts a set of facts about `lib/plan-routing-sidecar.mjs` that it says were established by calling the module. The aggregator re-derived them independently by executing the module against fixtures before dispatching reviewers. Results:

| Revision-5 assertion | Result |
|---|---|
| `readRoutingSidecar()` returns a bare array, no `version` property | **VERIFIED** — `Array.isArray() === true`, `r.version === undefined` |
| Complete throw set is `ROUTING_SIDECAR_MISSING`, `INVALID_PLAN_PATH`, `INVALID_SIDECAR_JSON`, `INVALID_ROUTING_ENTRY` | **REFUTED** — `readFileSync` at `:291` propagates raw fs errno. Probed `EISDIR` (directory at the sidecar path). `EACCES` and TOCTOU `ENOENT` between `existsSync` (`:285`) and the read reach the same gap |
| `INVALID_ROUTING_ENTRY` raised by missing `task_id`, missing `scores`, non-numeric score | **VERIFIED but incomplete** — also raised by missing/empty/non-string `selected_agent`, missing/non-string `rationale`, `rationale.length > 400`, a score outside `[0,1]`, and **any** of the four dimensions missing, including `spec_completeness`/`pattern_coverage` which this spec never consumes |
| Not raised by an invalid `selected_agent` value | **VERIFIED with caveat** — the *enum* is unvalidated (`"ROGUE"` passes through), but a **missing/empty/non-string** `selected_agent` does throw `INVALID_ROUTING_ENTRY` |
| The accessor does not validate the `selected_agent` enum; tolerates unknown extra fields | **VERIFIED** — extra fields survive into the returned entry (the read path does not normalize) |
| Entries come back sorted by `task_id` ascending | **VERIFIED as ordered, REFUTED as "ascending"** — the sort is `String.localeCompare` (`:231`), ICU collation. Probed `["t10","t2","T3"]` returns in exactly that order; codepoint-ascending would place `T3` first |
| `sidecarPathFor()` throws `INVALID_PLAN_PATH` on a path not ending `.plan.md` | **VERIFIED** |

The two refutations are load-bearing: the first is the substance of SA-2 / SEC-2 / CON-1, the second of SA-4.

## Output Encoding Contract ordering assessment

Requested explicitly by the invocation. Two results:

- **Rule 3's insertion point is correct.** Placing link/image neutralization before table-cell safety is coherent — no rule between 1 and 4 consumes `[`, `]`, `(`, `)`, or a leading `!`, and rule 3's output introduces no character that rule 4's leading-block-character test would have neutralized in a way that changes rendering.
- **Two of the six are not ordered members of the pipeline at all.** Rule 2 (path containment) and rule 6 (stderr diagnostics) are not transformations of an interpolated value; the Task Map nonetheless commands one function to apply all six "in the stated order." This is SA-1 / SEC-1 and is the round's most consequential structural finding.
- **The rule 4 → rule 5 precondition was probed and is not exploitable, but is unfalsifiable.** Rule 4 rewrites a leading `-`; rule 5 then matches the literal `-->`. Under an HTML-entity mechanism rule 5's match fails. The security reviewer worked the raw-output consequence through and found no functional delimiter is reconstituted, so the single-marker-pair invariant holds — but three neutralization mechanisms consistent with all six rules produce three different behaviors and no acceptance criterion discriminates. Recorded as SEC-3 (warning), not a blocker.

---

## Structural Architect (structural-architect)

**Verdict:** BLOCK — 3 blockers, 4 warnings, 1 suggestion

### SA-1 — blocker

- **blocker_id:** `structural-architect:non-encoding-rule-in-encoder:34de5558`
- **section_anchor:** `actionable-task-map`
- **Location:** § Actionable Task Map, "Output encoder" row; § Output Encoding Contract closing sentence
- **Finding:** The row reads *"The single interpolation-boundary function implementing all six rules of the Output Encoding Contract, applied in the stated order: line collapse, path containment, link/image neutralization, table-cell safety, marker neutralization, stderr diagnostics."* Two of the six are not transformations of an interpolated value. Rule 2 is a filesystem access-control gate whose own text places it *"before any `fs.stat` or `fs.readFile`"* — at input-read time, strictly before any value exists to interpolate. Rule 6 is a stream-routing rule. The contract's closing sentence, *"Encoding is applied once, at the interpolation boundary, by a single function,"* is therefore false for rules 2 and 6, and the ordering rationale (*"every rule after it reasons about 'the start of the value'"*) does not hold for either. An implementer who builds the function the Task Map describes has no call site at which containment can still prevent a read, so `Spec: ../../.env` is opened before the encoder ever runs. The revision-4 rule-count fix was applied by widening the encoder task rather than by separating concerns.
- **Recommendation:** Split the Task Map row: an interpolation-boundary encoder carrying rules 1, 3, 4, 5 in that order, and separate ownership for path containment as a pre-read gate and diagnostics as an output-routing rule. Restate the contract's closing sentence to scope "one function, at the boundary" to the value-transforming rules only.

### SA-2 — blocker

- **blocker_id:** `structural-architect:incomplete-throw-set:6f4d7ed7`
- **section_anchor:** `error-cases`
- **Location:** § Error Cases (`readRoutingSidecar()` row); § Acceptance Criteria; § Input Contracts → Routing entries, "Degradation"
- **Normative section, stated explicitly:** § Error Cases and § Acceptance Criteria are treated as normative here, not the Degradation prose. Error Cases is the table an implementer keys behavior off; the AC is the test contract — *"Each of the four throw codes — `ROUTING_SIDECAR_MISSING`, `INVALID_PLAN_PATH`, `INVALID_SIDECAR_JSON`, `INVALID_ROUTING_ENTRY` — degrades to `UNKNOWN` … a test covers all four."* Degradation's catch-all (*"Every `readRoutingSidecar()` throw is treated identically to an absent sidecar"*) is the correct intent, but it is immediately narrowed by *"The complete throw set, enumerated by probing the module rather than reading its documentation."* Prose that a table and a test contract both contradict loses.
- **Finding:** The "complete throw set" claim is false. `readRoutingSidecar()` does `existsSync(sidecarPath)` then `readFileSync(sidecarPath)` (`lib/plan-routing-sidecar.mjs:285,291`); any fs error from the second call propagates raw with a Node errno outside the four named. Verified: a directory named `<stem>.routing.json` yields `code === "EISDIR"`. `EACCES` under a CI runner and `ENOENT` via the TOCTOU window reach the same gap with no adversary required. An implementer following the four-code enumeration writes a code-by-code catch, the raw errno escapes, and the verb exits non-zero — contradicting the Behavioral Contract (*"never blocks"*) and the postcondition *"Exit code is 0 whenever `HEAD` and the base ref resolve."* This is the same defect the revision-4 round tried to close by widening to "any throw"; revision 5 re-enumerated instead.
- **Recommendation:** Make the catch-all normative in all three places: the Error Cases condition becomes "`readRoutingSidecar()` throws anything," the annotation renders whatever `err.code` is present (naming "unknown code" when absent), and the AC asserts the catch-all with the four named codes as examples *plus* one raw-errno case. Delete the phrase "The complete throw set" or downgrade the table to "codes the module raises by name."

### SA-3 — blocker

- **blocker_id:** `structural-architect:underspecified-ordering:dc9f3142`
- **section_anchor:** `behaviors`
- **Location:** § Behaviors bullet 5; § Acceptance Criteria; § Input Contracts → "Incoming sort is a tie-break"
- **Finding:** The `UNKNOWN` bucket has no total order. Three gaps compound. (a) Rank is given only as *"it renders with route `UNKNOWN` and sorts above all `auto-agent` rows"* — its position relative to `human-only` and `assisted-agent` is never fixed, so three different implementations satisfy the criterion. (b) Intra-bucket order is undefined: `UNKNOWN` tasks by construction have no routing entry, therefore no `scores.blast_radius` secondary key, and they never pass through the accessor, so the declared tie-break — *"the accessor's `task_id` order breaks ties between entries with equal tier and equal blast radius"* — has no purchase on them. (c) The attention map merges entries from several sidecars, but the accessor's sort is per-file; cross-spec ties have no stated order, and `spec_path` is never named as a sort key even though task identity is the pair `(spec_path, task_id)`. The spec sets its own standard here — *"This is what makes the determinism criterion hold for such entries rather than depending on an unspecified sort"* — and both the `UNKNOWN` bucket and the cross-spec merge fail it, against the criterion *"Running the verb twice on an unchanged `(base, head)` pair produces byte-identical output."*
- **Recommendation:** State the full comparator as an ordered key list covering every row the section can render: bucket rank (fix `UNKNOWN`'s slot explicitly against all three tiers), then descending `blast_radius` with a defined value or exclusion for rows that have none, then `spec_path`, then `task_id`. Add an acceptance criterion exercising two specs contributing equal-tier rows. Also state whether an entry with an unrecognized `selected_agent` (which *does* carry a blast radius) joins the `UNKNOWN` bucket or forms its own.

### SA-4 — warning

- **Location:** § Input Contracts → "Incoming sort is a tie-break"; § Acceptance Criteria
- **Finding:** The spec characterizes the accessor's order as `task_id` *ascending*, and the criterion states *"Two entries with equal `selected_agent` and equal `scores.blast_radius` render in ascending `task_id` order; a test asserts the sort is stable over the accessor's incoming order."* The two halves conflict. `lib/plan-routing-sidecar.mjs:231` sorts with `String(a.task_id).localeCompare(String(b.task_id))` — ICU collation, not codepoint ascending. Probed input `["t10","t2","T3"]` is returned in exactly that order; codepoint-ascending would put `T3` first. A test written against "ascending" fails; one written against "the accessor's incoming order" passes but pins locale-sensitive collation, which is also the only thing standing behind byte-identical determinism across CI runners with differing `LANG`.
- **Recommendation:** Drop "ascending" and describe the tie-break as "the accessor's returned order, which is `localeCompare` collation on `task_id`," or specify an explicit codepoint sort this module applies itself.

### SA-5 — warning

- **Location:** § Input Contracts → Routing entries, throw-code table, `INVALID_ROUTING_ENTRY` row
- **Finding:** The row's trigger list — *"An entry is missing `task_id`, is missing `scores`, or has a non-numeric score"* — is materially incomplete for a table introduced as *"enumerated by probing the module."* `validateEntry` runs on every entry at read time and also throws for missing/empty/non-string `selected_agent`; any of the four score dimensions missing, non-finite, or outside `[0,1]` — including `spec_completeness` and `pattern_coverage`, which this spec never consumes; missing/non-string `rationale`; and `rationale.length > 400`. The last matters most: `rationale` is the field this spec labels "Attacker-influenceable," and one committed oversized rationale takes down the whole sidecar read for that spec. The criterion pins the case narrowly (*"with `INVALID_ROUTING_ENTRY` driven by an entry missing `scores`"*), steering the test away from the reachable trigger.
- **Recommendation:** Complete the trigger list, or replace the "Raised when" cell with a pointer to the accessor's own validation, since this spec does not own it.

### SA-6 — warning

- **Location:** § Actionable Task Map ("Task universe builder"); § Input Contracts → "Task universe and file sets", `scores.novelty` row
- **Finding:** Two declared inputs have no rendering consumer. The Task Map spends a `medium` task on *"each task's file set from `git diff-tree --name-only` over its commits"* and § Input Contracts defines the file set formally, but no Behavior, Visual Expectation, or acceptance criterion renders a file list. Likewise `scores.novelty` is declared consumed but used by no ranking key, row, or criterion — the defect revision 4 raised as CON-3.
- **Recommendation:** Name the rendered column for each, or drop the file-set derivation and `scores.novelty` from Input Contracts and the Task Map. If the file set exists only to prove the `UNKNOWN` set difference, say so — the set difference needs only the `(spec_path, task_id)` pairs, not the paths.

### SA-7 — warning

- **Location:** § Acceptance Criteria (derivation coverage for the plan-stem rule)
- **Finding:** The `<spec-stem>` shorthand is gone from every section — verified, the string appears nowhere in the spec — but revision 4's recommendation to pin the derivation with a test was not taken. No criterion exercises the `.spec.md` → `.plan.md` replacement. The nearest, *"Routing entries are read via `lib/plan-routing-sidecar.mjs`; a test asserts this module defines no `routing.json` parser and no `entries[]` traversal of its own,"* tests only the absence of a local parser. The spec names the condition under which a regression ships silently: *"The two stems coincide in this repo today."*
- **Recommendation:** Add a criterion using a fixture whose plan stem differs from its spec stem, asserting the sidecar is found.

### SA-8 — suggestion

- **Location:** § Input Contracts → Verification, stale-revision rule
- **Finding:** Unaddressed and unmentioned in revision 5 (revision 4's SA-5). `effectiveRevision()` (`lib/lifecycle-state.mjs:1321-1325`) returns 1 for any event lacking an integer `revision:`, documented at `:1302-1306` as legacy-fold-as-rev-1. `byRevision[1]` therefore cannot be distinguished from a verdict genuinely recorded against revision 1. The stale-revision rule and its criterion assume the key means "validation ran against revision N," which is not true for bucket 1. The § Referenced spec frontmatter degradation covers an undeterminable *spec* revision — a different failure.
- **Recommendation:** State how a legacy-folded bucket 1 is distinguished, or declare it explicitly out of contract.

**Not flagged (verified sound):** § Section ownership and marker assembly are unambiguous and agree with `pr-body-advisories.spec.md` § Section Placement. § Referenced spec frontmatter correctly declares the fourth input. The consumed-shape correction is accurate against the module's return value. Dependency direction and the `cli-driver-surface` boundary are respected.

---

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK — 2 blockers, 6 warnings, 1 suggestion

### SEC-1 — blocker — input-validation

- **blocker_id:** `security-reviewer:input-validation:e9353df4`
- **section_anchor:** `actionable-task-map`
- **Location:** § Actionable Task Map, "Output encoder" row; § Output Encoding Contract rules 2 and 6
- **Finding:** § Actionable Task Map assigns path containment (rule 2) to the single interpolation-boundary encoder applied at render time, while rule 2 itself requires containment before any `fs.stat` or `fs.readFile` during input gathering. Two normative sections specify mutually exclusive placements for the only CWE-22 control in the spec. Rules 2 and 6 are not value transformations at all, so "applied in the stated order" is incoherent for two of six members — a design defect, not a wording nit. An implementer obeying the Task Map literally opens `.context-index/specs/../../.env`, then containment fires on the string as it is interpolated into the diagnostic. The criterion *"A `Spec:` trailer of `../../.env` is never opened; a test asserts no `fs` call receives a path outside `.context-index/specs/`"* pins the behavior but not where the check lives; a render-time check still renders the row as missing, and whether the fs assertion fires depends on what the test mocks. This propagates: `pr-body-advisories.spec.md` § Reading Order resolves plan paths "under the containment rule in `pr-body-composition.spec.md`" before reading plan files whose contents *are* rendered into the public PR body.
- **Recommendation:** Split rules 2 and 6 out of the encoder. State containment as a precondition on the input-gathering path resolver, called before any fs syscall; state rule 6 as a writer-selection rule; scope "the single interpolation-boundary function, applied in the stated order" to the four actual value transformations. Add a criterion asserting containment is evaluated in the path resolver, not at interpolation. CWE-22, CWE-696.

### SEC-2 — blocker — rate-limiting (availability)

- **blocker_id:** `security-reviewer:rate-limiting:70d813a6` *(reused — the revision-4 defect persists in materially identical form)*
- **section_anchor:** `input-contracts`
- **Location:** § Input Contracts → Routing entries "Degradation"; § Error Cases, `readRoutingSidecar()` row; the acceptance criterion quoted below
- **Finding:** Revision 5 added the catch-all sentence and then re-narrows it in two normative places. § Error Cases and the acceptance criteria are treated as normative here — they are the testable surface `/adev:plan` decomposes and `/adev:validate` checks. The Error Cases row conditions on *"`readRoutingSidecar()` throws any of `ROUTING_SIDECAR_MISSING`, `INVALID_PLAN_PATH`, `INVALID_SIDECAR_JSON`, `INVALID_ROUTING_ENTRY`"*, and the criterion reads *"Each of the four throw codes … degrades to `UNKNOWN` with the code named in the annotation and exit 0; a test covers all four."* An implementer writes a four-arm `switch (err.code)` and re-throws the default. The claim that these are *"The complete throw set, enumerated by probing the module rather than reading its documentation"* is false: `readRoutingSidecar` does `existsSync()` then `readFileSync()` and any fs errno propagates raw. The attacker-triggerable instance needs no race: a commit author lands a **directory** named `<plan-stem>.routing.json`; `existsSync` passes, `readFileSync` throws `EISDIR`, no arm matches, the verb exits non-zero. `EACCES` on a CI runner and TOCTOU `ENOENT` reach the same gap with no adversary. This contradicts the postcondition *"Exit code is 0 whenever `HEAD` and the base ref resolve, regardless of which optional inputs were missing"* and the Behavioral Contract's "never blocks."
- **Recommendation:** Delete the "complete throw set" claim and the four-code condition in § Error Cases; replace both with an unconditional catch around the call site rendering `err.code ?? err.name` verbatim through the encoder. Keep the four-code table strictly as non-normative, explicitly labelled non-exhaustive. Rewrite the criterion to require a case with a code outside the four — an `EISDIR` fixture is the cheapest. CWE-755 / CWE-1284.

### SEC-3 — warning — input-validation

- **Location:** § Output Encoding Contract, rules 3–5
- **Finding:** Rule order is declared part of the contract, but no rule states its **neutralization mechanism** (backslash escape, HTML numeric entity, deletion, or zero-width insertion). Rule 5's precondition is a literal-substring match (*"Any occurrence of `<!--` or `-->`"*), and rule 4 — which runs before it — rewrites a leading `-`. For a value beginning with `-->`, an entity mechanism yields `&#45;->` and rule 5 then matches nothing; a deletion mechanism yields `->`. The raw-output consequence was worked through and does **not** break the single-marker-pair invariant: entity references decode to text content after HTML-comment structure is fixed, and `cicd`'s boundary replace operates on raw body text, so no functional delimiter is reconstituted. The defect is that the contract is unfalsifiable as written — three mechanisms consistent with all six rules produce three different rule-5 behaviors on the same input, and the criterion *"a test asserts stdout contains exactly one occurrence of each marker literal"* passes under all of them.
- **Recommendation:** Fix one mechanism per rule in the spec text (a single escape function returning HTML numeric entities is the least order-sensitive, since entities cannot be re-consumed by a later rule's match). Then either state that rule 5 matches against the pre-rule-4 value, or move marker neutralization before table-cell safety. Add a criterion pinning a `rationale` of exactly `--> x` to a named byte sequence. CWE-116, CWE-696.

### SEC-4 — warning — input-validation

- **Location:** § Actionable Task Map, "Trailer reader" row
- **Finding:** The trailer reader is specified only as *"via `git log --format`"* with no record or field delimiter named. A commit message body is fully attacker-controlled and may contain newlines and lines mimicking whatever textual record boundary a newline-oriented format string implies; a crafted body can emit what parses as an additional commit record, forging a commit→`Spec:` association that appears in traceability as a spec the commit never referenced, and pulling that spec's verification row into the brief. This is the mechanism-level version of the trust boundary the charter's Business Intent exists to protect — a trailer being an author claim is fine and visible; a forged *record boundary* is not visible to anyone.
- **Recommendation:** Specify NUL-delimited output explicitly in the Task Map row and § Input Contracts (`git log -z --format='%H%x00%(trailers:key=Spec,valueonly,separator=%x00)'` or equivalent), parse on `\x00` only, never split on `\n`. Add a criterion with a fixture commit whose body contains a line matching the chosen format's shape, asserting the traceability commit count equals `git rev-list --count base..head`. CWE-93.

### SEC-5 — warning — data-exposure

- **Location:** § Output Encoding Contract, rule 2
- **Finding:** Containment is specified as `path.resolve` against *"the canonicalized `.context-index/specs/` root"* — the *root* is canonicalized, the *candidate* is not. `path.resolve` is purely lexical and does not resolve symlinks, so a symlink committed under `.context-index/specs/` resolves to a path inside the root, passes containment, and is then followed by `fs.readFile`. Composition's own exposure is narrow (it extracts only `revision:`), but `pr-body-advisories.spec.md` delegates plan-path containment to this same rule and renders parsed group ids, members, and annotations into a public PR body. The sibling already requires a regular-file check for plans while composition's frontmatter reader requires none — two readers governed by one containment rule with different hardening.
- **Recommendation:** Require `fs.realpathSync` on the candidate and a second containment check on the resolved result, plus an `lstatSync().isFile()` gate before any read, in rule 2 itself so both specs inherit it. Treat a realpath failure as "does not exist on disk," the already-defined error case. Add a criterion with a symlink fixture under `.context-index/specs/` pointing outside it. CWE-59, CWE-22.

### SEC-6 — warning — input-validation *(revision-4 SEC-3, unaddressed)*

- **Location:** § Output Encoding Contract, rule 1
- **Finding:** Rule 1 still handles only `\n`, `\r`, `\r\n`. No rule addresses other C0 controls (`\x1b`, `\x07`, `\v`, `\f`) or Unicode bidirectional overrides (U+202E, U+2066–U+2069). Output is plausibly read through a terminal (`gh pr view`, local piping), where ANSI escapes in a `rationale` hide or spoof adjacent text; bidi overrides (Trojan Source, CVE-2021-42574) reorder displayed text in both a terminal and GitHub's renderer, so an attention row can display a tier or blast-radius figure other than the one emitted. The wider surface is **trailer values, not `rationale`** — `validateEntry` caps `rationale` at 400 characters at read time, but `Spec:` and `Plan-task:` trailer values pass through the same encoder with no length or charset bound at all.
- **Recommendation:** Extend rule 1 to strip or entity-encode every C0 control other than the already-collapsed `\n`/`\r`, plus U+202A–U+202E and U+2066–U+2069. Add a criterion with `\x1b[2K` and U+202E fixtures asserting neither reaches stdout. CWE-117, CWE-838.

### SEC-7 — warning — rate-limiting *(revision-4 SEC-4, unaddressed; escalated from suggestion)*

- **Location:** § Postconditions; § Actionable Task Map
- **Finding:** Composition specifies no bound on commit count, distinct-task count, per-task file-set size, untraced-bucket SHA listing, or total rendered bytes. `pr-body-advisories.spec.md` bounds itself explicitly — 50 groups, 100 members, 200 characters per value, 64 KiB across both its sections — and states why: an oversized brief fails forge delivery entirely, breaking the charter's "never blocks" guarantee for a transport reason. That cap covers only advisories' two slots. Composition owns marker assembly and therefore the *total* body, and bounds nothing, so its three sections can push the assembled brief past the forge body limit the sibling's cap exists to respect. Escalated because revision 5's sibling added bounds without a counterpart on the side that assembles the whole.
- **Recommendation:** State a per-section row ceiling with a `+N more` line and a total-body ceiling enforced at marker assembly, covering all five slots. Failing that, record the CI job timeout and the forge limit as accepted, documented tradeoffs in § Postconditions. CWE-770.

### SEC-8 — warning — input-validation

- **Location:** § Behaviors, encoding bullet
- **Finding:** Revision 5 inserted rule 3 but did not update the Behaviors condition, which still reads *"**When** any interpolated value contains `|`, a leading block character, `<!--`, `-->`, or shell metacharacters."* It names no link/image character (`[`, `]`, `(`, `)`, `!`), so the normative trigger list omits precisely the class revision 5 was revised to close; an implementer treating Behaviors as the condition gates encoding on the old set and `![](https://attacker.example/p.gif)` passes through. The same sentence still names "shell metacharacters," for which no rule exists — revision-4 CON-2, unaddressed. One stale sentence, both halves.
- **Recommendation:** Restate the bullet unconditionally — every interpolated value passes the encoder regardless of content — and delete "shell metacharacters," whose real constraint is the Task Map's non-interpolation rule.

### SEC-9 — suggestion — data-exposure

- **Location:** § Input Contracts → Verification
- **Finding:** The verification row is keyed by the `Spec:` trailer, an author-supplied value, while its verdict comes from the lifecycle projection. The brief never labels which half is asserted and which is measured, so a reviewer acting on the charter's stated purpose ("safely decline to re-verify what was already verified") reads adjacency as causation.
- **Recommendation:** Render the spec association with an explicit "as asserted by commit trailer" qualifier in the verification section header.

**Not flagged:** no authentication or authorization findings — a local read-only CLI verb whose postconditions forbid network and forge calls. No secrets-handling findings.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK — 1 blocker, 3 warnings, 1 suggestion

### CON-1 — blocker — contract

- **blocker_id:** `consistency-analyzer:incomplete-throw-enumeration:f8a71d9d`
- **section_anchor:** `input-contracts`
- **This Spec:** § Input Contracts → Routing entries → Degradation: *"Every `readRoutingSidecar()` throw is treated identically to an absent sidecar… The complete throw set, enumerated by probing the module rather than reading its documentation:"* followed by exactly four codes.
- **Conflicts With:** (a) itself — "every… throw" (open set) contradicts "the complete throw set" (closed, four items) one sentence later; (b) § Error Cases, whose *condition* is literally *"throws any of `ROUTING_SIDECAR_MISSING`, `INVALID_PLAN_PATH`, `INVALID_SIDECAR_JSON`, `INVALID_ROUTING_ENTRY`"* — a closed four-way switch; (c) § Acceptance Criteria: *"Each of the four throw codes … a test covers all four"* — pins the same closed set as the acceptance surface. Ground truth: `readFileSync` inside `readRoutingSidecar()` can raise raw fs errors (`EACCES`, `EISDIR`, TOCTOU `ENOENT`) carrying none of the four codes.
- **Failure scenario:** an implementer follows § Error Cases and § Acceptance Criteria literally and writes a four-way `switch (err.code)`; a sidecar becomes momentarily unreadable and the raw error escapes uncaught — crashing `adev pr body` in CI, contradicting the Behavioral Contract's "never blocks… rather than to a non-zero exit" and the postcondition "Exit code is 0 whenever `HEAD` and the base ref resolve."
- **Recommendation:** Pick one side and make all three sections agree. Preferred: keep "every throw" as the contract, drop the "complete throw set" framing, rewrite the Error Cases condition to "any throw from `readRoutingSidecar()`, annotated with whatever `err.code` (or `undefined`) was thrown," and loosen the criterion to the four named codes plus one uncoded/raw-error case.

### CON-2 — warning — domain-model

- **This Spec:** § Actionable Task Map, "Task universe builder": *"Build the `(spec_path, task_id)` set from `Plan-task:` trailers and each task's file set from `git diff-tree --name-only` over its commits, per Input Contracts."*
- **Conflicts With:** `charter.md` § Domain Model, Attention Entry: `task_id`, `files[]`, `selected_agent`, `blast_radius`, `novelty`, `rationale` — `files[]` is a declared key attribute of the rendered entity. Nothing in this spec's Attention map ranking row, § Behaviors, § Visual Expectations, or any acceptance criterion renders or consumes the computed file set.
- **Recommendation:** Either state that `files[]` is rendered per attention-map row (and add a behavior and criterion for it), or note that `files[]` is computed for internal bookkeeping only, so the charter's entity table is not read as a rendering promise.

### CON-3 — warning — domain-model *(revision-4 CON-3, unaddressed)*

- **This Spec:** § Input Contracts → Routing entries: *"`scores.novelty` | Nested under `scores`, normalized `0..1`."* — still listed as consumed.
- **Conflicts With:** § Actionable Task Map "Attention map ranking," § Behaviors bullet 3, and every ranking-related acceptance criterion — none sorts, renders, or otherwise uses `novelty`.
- **Recommendation:** State how `novelty` is rendered or used, or drop it from the consumed-field table.

### CON-4 — warning — pattern *(revision-4 CON-2 recurrence + new gap)*

- **This Spec:** § Behaviors: *"When any interpolated value contains `|`, a leading block character, `<!--`, `-->`, or shell metacharacters then it is encoded per the Output Encoding Contract…"*
- **Conflicts With:** § Output Encoding Contract's six rules define no shell-metacharacter rule (revision-4 CON-2, unaddressed) — and separately, the same condition omits the `[`, `]`, `(`, `)`, leading-`!` characters rule 3 introduced this revision, so the enumerated trigger set matches neither the old five-rule contract nor the new six-rule one.
- **Recommendation:** Drop "shell metacharacters" and add the link/image characters, or restate the bullet unconditionally. Same underlying sentence as SEC-8.

### CON-5 — suggestion — naming

- **This Spec:** § Acceptance Criteria: *"…mirroring `review-packet-template.spec.md` AC-6 from the side that can violate it."*
- **Conflicts With:** `review-packet-template.spec.md`'s acceptance list is unnumbered checkboxes; "AC-6" is accurate today but index-fragile the moment that sibling's list is reordered or grows.
- **Recommendation:** Quote the referenced bullet's text instead of citing it by index.

**Verified consistent:** § Section ownership matches `pr-body-advisories.spec.md` § Section Placement exactly on slot list, order, and owners. The Output Encoding Contract's rule *count* (six) and *sequence* are correctly propagated into the Task Map's "Output encoder" row — which is why revision-4 blocker `structural-architect:incomplete-task-map:6231f1c4` is marked addressed. This verifies count and order only; the row's *membership* is contested by SA-1 and SEC-1, which hold that two of the six do not belong in an interpolation-boundary function at all. `<spec-stem>.routing.json` appears nowhere in the spec. File naming complies with `.context-index/specs/cross-cutting/spec-file-suffixes.spec.md`.

---

## Cross-finding notes

These govern how revision 6 should be written; they are not additional findings.

1. **SA-1 and SEC-1 are the same defect** — the Task Map's "Output encoder" row folding rules 2 and 6 into an interpolation-boundary function. Two reviewers found it independently, so it carries two distinct `blocker_id`s and two sidecar entries. One edit clears both.
2. **SA-2, SEC-2, and CON-1 are the same defect** — the four-code enumeration narrowing the catch-all. All three reviewers independently designated § Error Cases and § Acceptance Criteria as the normative sections that lose, and all three prescribe the same fix. This is the **third** revision in which an enumeration of `readRoutingSidecar()` throws has been incomplete; revision 5 added the catch-all sentence revision 4 asked for but left the two narrowing sections untouched. The fix is to stop enumerating: an unconditional catch, the four codes demoted to non-normative examples, and one acceptance case driven by a code outside the four.
3. **SA-1's fix must not be applied by widening a task row again.** Revision 5 closed revision 4's rule-count blocker by listing all six rules inside one function, which is what created SA-1/SEC-1. The correction is to split ownership, not to renumber.
4. **SEC-8 and CON-4 are one stale sentence** — § Behaviors' encoding condition, which names a rule that does not exist and omits one that now does. Patch it once.
5. **SA-3's fix should state the comparator as an ordered key list**, not as another "sorts above" clause; three "sorts above" statements are what produced the ambiguity.

## Revision-4 blocker disposition

| Revision-4 blocker | Status | Evidence |
|---|---|---|
| `structural-architect:incorrect-consumed-contract:3dfb3f0f` | **addressed** | § Routing entries states the accessor returns a bare array; no `version` row remains in the consumed-shape table; the version check moved into the `INVALID_SIDECAR_JSON` row; a new criterion asserts `Array.isArray()` and that no code path reads a `version` property. Cross-finding note 4 of revision 4 respected — the schema-mismatch criterion was not weakened. Independently re-verified by executing the module. |
| `structural-architect:incomplete-task-map:6231f1c4` | **addressed** | The count is corrected to six and line collapse is named first, in order. The fix introduced a *new* and distinct defect (SA-1/SEC-1) but the original omission is closed. |
| `structural-architect:adr-conflict:33a8b719` | **addressed** | § Behaviors bullet 4 now reads `<plan-stem>.routing.json`; the `<spec-stem>` shorthand appears nowhere in the spec. The recommendation's second half — a criterion pinning the derivation — was not taken; recorded as SA-7 (warning), not a recurrence. |
| `consistency-analyzer:contract:1a299478` | **addressed** | Same edit as above; matches ADR-0012 § "Permitted peers" and `charter.md` § Consumed APIs. |
| `security-reviewer:input-validation:2d90002f` | **addressed** | Rule 3 added and correctly inserted *before* table-cell safety per revision 4's cross-finding note 3; the Task Map row updated; a criterion added for `![](…)`. Residual gap is only the stale Behaviors trigger list (SEC-8/CON-4), not the rule itself. |
| `security-reviewer:rate-limiting:70d813a6` | **partially addressed — still blocking** | The catch-all sentence was added to § Degradation, but § Error Cases still conditions on the four codes, the criterion still requires exactly four, and the spec now asserts these are "the complete throw set" — a claim the module refutes. Materially identical defect; **id reused** as SEC-2. |

**Revision-4 warnings and suggestions:** SA-4 (`ROUTING_SIDECAR_MISSING` unnamed) — addressed. SA-5 (legacy `byRevision[1]` fold) — unaddressed, re-raised as SA-8. SEC-3 (C0/ANSI) — unaddressed, re-raised as SEC-6 and extended with bidi overrides. SEC-4 (input-size bound) — unaddressed, re-raised as SEC-7 and escalated to warning. CON-2 (shell metacharacters) — unaddressed, re-raised as CON-4/SEC-8. CON-3 (`novelty` unused) — unaddressed, re-raised as CON-3.

**New vs persistent:** four of the six blockers are NEW (SA-1, SA-2, SA-3, SEC-1); two are the same underlying defect as a persistent revision-4 blocker (SEC-2 reuses `70d813a6`; CON-1 and SA-2 are that defect found independently by two other reviewers). Unlike revision 4, none of this round's blockers was *introduced* by the revision-5 edit except SA-1/SEC-1, which is the direct byproduct of how revision 4's rule-count blocker was closed.

---

## Summary

**Total findings:** 22 (6 blockers, 13 warnings, 3 suggestions — SA-1/SEC-1 are one defect, and SA-2/SEC-2/CON-1 are one defect, so 6 blocker ids cover 3 distinct defects; SEC-8/CON-4 are one warning-level defect)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 3 | 4 | 1 |
| security-reviewer | BLOCK | 2 | 6 | 1 |
| consistency-analyzer | BLOCK | 1 | 3 | 1 |

**Action required:** Revise the spec to revision 6 addressing the six blockers. Blocker entries with canonical `blocker_id` and `section_anchor` are in `pr-body-composition.blockers.md`. **Three distinct edits close all six:**

1. Split rules 2 and 6 out of the "Output encoder" Task Map row and out of the contract's "one function at the interpolation boundary" claim — containment becomes a pre-read gate on the path resolver, diagnostics a writer-selection rule, and the ordered encoder carries rules 1, 3, 4, 5 (clears SA-1, SEC-1).
2. Stop enumerating `readRoutingSidecar()` throw codes. Make the catch-all normative in § Error Cases and the acceptance criteria; demote the four-code table to labelled non-exhaustive examples; add one acceptance case driven by a code outside the four (clears SA-2, SEC-2, CON-1).
3. Replace the three "sorts above" clauses with a single ordered comparator key list that covers the `UNKNOWN` bucket's slot, its intra-bucket order, the cross-spec merge, and unrecognized-`selected_agent` rows (clears SA-3).

Two further edits are strongly advised while revising, because both are one-sentence fixes to defects now in their second round: patch § Behaviors' encoding condition (SEC-8/CON-4) and correct "ascending" to the accessor's actual `localeCompare` order (SA-4).

**Governance:** `.context-index/governance/gates.yaml` declares no `approver_role` on a `spec-to-plan` transition, so no additional approver is required beyond this gate.

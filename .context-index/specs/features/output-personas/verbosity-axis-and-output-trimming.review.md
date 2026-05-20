---
spec: .context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md
charter: .context-index/specs/features/output-personas/charter.md
date: 2026-05-18
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: 7f8fd3e4fd1982a0a4ac3a7747ab9e76be71cc6a7c184312679eecfc5f16ddf8
post-review-edit: |
  After PASS_WITH_NOTES verdict (rev 1), the spec author edited the spec in-place to
  address the 9 warning-level findings (CA-1, CA-2, CA-3, CA-5, SA-1, SEC-1, SEC-2,
  SEC-3, SEC-4) without re-running /adev:review-specs. Spec revision bumped to 2,
  file-sha re-stamped against the edited content. The 15 suggestion-level findings
  remain open as quality-of-life refinements; they can be addressed during /adev:plan
  or /adev:implement.
  Specific changes:
    - CA-1: charter bumped to revision 3; spec frontmatter charter-revision: 3
    - CA-3: bullet-count metric disambiguated — per-dimension (19-22) and fixture-weighted
            (58-62) are now stated as two independent acceptance criteria
    - CA-5: risk_level bumped from low to medium
    - SA-1: resolvePersona return shape made additive — keeps { name, source }, adds
            { verbosity, verbositySource }; existing callers preserved
    - SEC-1: loadVerbosityOverlay path-traversal defense-in-depth added (Behavior 5)
    - SEC-2: parseUserConfig validation contract made explicit (acceptance criterion)
    - SEC-3: no-content-echo invariant added to post-ship validation contract +
             new Task #11 for the test
    - SEC-4: "fatal if normal.md missing" replaced with degrade-and-continue (Error Cases)
---

# Architecture Review: verbosity-axis-and-output-trimming

> **Date:** 2026-05-18
> **Spec:** `.context-index/specs/features/output-personas/verbosity-axis-and-output-trimming.spec.md`
> **Charter:** `.context-index/specs/features/output-personas/charter.md`
> **Verdict:** **PASS_WITH_NOTES**

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

### SA-1 — warning — module-boundary / contract-change
**Location:** `verbosity-axis-and-output-trimming.spec.md:68` (Postconditions); `:110` (Module Impact, companion spec amendment row)

The companion spec `persona-resolution-and-injection.spec.md` is marked `validated` and the new spec says its resolution mechanism is "frozen," yet this spec silently changes the signature of `resolvePersona()` from the charter-published `{ name, source }` (`charter.md:92`, `lib/persona.mjs:47-49`) to `{ persona, verbosity, sources: { persona, verbosity } }`. That is a breaking shape change of a charter-level Exposed API and renames `name` to `persona` in the same move. The Module Impact row only mentions a one-sentence amendment at line 70 of the companion spec — it does not acknowledge that the companion spec's Acceptance Criteria and the Charter's Interface Contracts table also need to be revised. Either keep the existing `{ name, source }` keys and extend additively (e.g. add `verbosity` and `verbositySource` alongside) or explicitly bump the companion spec's revision and amend `charter.md:92` in the Module Impact table. Also flag: callers of `resolvePersona()` in `hooks/session-start.sh` and `tests/persona.test.mjs` will silently break under the proposed shape.

### SA-2 — warning — scope / capability decomposition
**Location:** Whole spec; Behaviors 6, 9, 11; Acceptance "Calibration invariant", "Anti-redundancy presence invariant"

This spec bundles four distinct capabilities into one: (a) verbosity axis + overlays, (b) Architect template trim to 58–62 bullets, (c) universal anti-redundancy rule, (d) Next-Actions-always-present invariant. The charter capability row at `charter.md:76` also bundles all four. (b) is a one-time calibration of an existing template that is technically independent of the verbosity machinery — it would apply even if the verbosity axis were rejected. (d) is a cross-cutting invariant about *all* persona templates and overlays, which is a different architectural shape (an invariant constraint on the template family, not a feature). Recommend either splitting (b) and (d) into their own one-line capability rows in the charter, or explicitly noting in this spec that it ships four nominally separable changes under one milestone for atomicity.

### SA-3 — warning — separation of concerns / axis orthogonality
**Location:** `verbosity-axis-and-output-trimming.spec.md:46` (per-persona verbosity defaults); `:54` (Architect normal calibration); Behaviors 7-8

The two-axis framing is structurally sound *in principle* but the defaults entangle the axes in three places. (1) Per-persona verbosity default `product → terse` means the persona name implicitly carries a verbosity bias — the axes are orthogonal in resolution but not in defaults. Defensible, but should be stated as a deliberate design choice. (2) The 58–62 bullet calibration is hard-bound to `persona=architect, verbosity=normal` — if a future revision retunes Architect, the verbosity-normal overlay also needs retuning. (3) Behaviors 7-8 describe what verbosity overlays do "under any persona," but actual overlay content will depend on what the persona directive contains (terse overlay says "skip Architectural-Read" which is Architect-specific). Recommend: acknowledge the axes are "resolution-orthogonal, content-coupled," or require overlay content to reference dimensions by name (e.g. "skip dimensions marked optional under terse") rather than by Architect-specific section names.

### SA-4 — suggestion — gate placement / invariant scope
**Location:** `verbosity-axis-and-output-trimming.spec.md:60` (Behavior 9 — Next-Actions invariant); Postcondition `:70`

The Next-Actions invariant is encoded at the leaf level (substring match over 9 fixture combinations). A structurally cleaner home is the charter's Invariants section (`charter.md:57-62`) alongside "Persona affects only output presentation," because the rule is an architectural constraint on the entire persona system, not a property of any single template. Recommend adding it as a charter invariant in the same revision that adds the capability row; the spec's acceptance criterion then references the charter invariant rather than re-stating it. This also future-proofs against a 4th persona being added.

### SA-5 — suggestion — spec-vs-fixture level
**Location:** `:54` (Behavior 6: 58-62 bullet range); Acceptance "Calibration invariant"

Asserting a numeric bullet-count range (58–62) directly in the spec is unusual — specs typically state observable behavior, and "bullet count of a template file" is a fixture-level property. The range is empirically grounded but the spec should make clear it is a *calibration target derived from research*, not a permanent invariant. Recommend: state qualitative invariant in spec ("Architect normal overlay is materially trimmed from the validated baseline of 69 bullets without dropping Next Actions") and put the numeric 58–62 in a test fixture's expected metadata or a `calibration.json` companion artifact.

### SA-6 — suggestion — scalability / matrix shape
**Location:** `:107` (Module Impact: 9 golden directive-text fixtures); `:130` (Task 6); Acceptance 9-combo matrix

The 9-combo (3×3) fixture matrix scales as O(personas × verbosity). Two structural concerns: (1) golden fixtures need regeneration whenever *either* a persona template *or* a verbosity overlay changes — a single edit to `terse.md` invalidates 3 fixtures, not 1. (2) The fixture is the *concatenation result*, coupling the test surface to the injection-order detail from Behavior 4. Recommend asserting the *composition* (both directive contents appear, with separator) rather than the exact concatenated text. That way adding a 4th persona is O(persona) not O(persona × verbosity).

### SA-7 — suggestion — out-of-scope completeness
**Location:** `:113-119` (Out of Scope)

Two natural extensions are not listed and could be re-litigated later: (a) **per-skill verbosity override** (analogous to per-skill persona override, already deferred at `charter.md:83`); (b) **per-turn verbosity** (GPT-5 precedent treats verbosity as a per-call parameter). Recommend adding both as explicit deferrals to mirror the charter's existing per-skill-persona deferral.

### SA-8 — suggestion — post-ship validation contract
**Location:** `:163-166` (Post-ship validation contract — 30 session minimum)

The 30-session minimum is not justified in the spec and is not derived in the research artifact (which used 75 sessions). The test for A/D ratio drop from 1.85x to <1.4x is a comparison of two means with unknown variance; statistical power at n=30 depends on per-turn variance which is currently unknown. Recommend tying the minimum to a turn-count threshold (e.g. ≥1000 assistant turns on the new templates) or citing where 30 was derived.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

### SEC-1 — warning — input-validation
**Location:** `verbosity-axis-and-output-trimming.spec.md:48-52` (Behaviors 3 and 5)

The spec defines a closed enumeration `{terse, normal, deep}` (Behavior 3) and describes `loadVerbosityOverlay(name)` reading `templates/verbosity/<name>.md` (Behavior 5), but never explicitly states that `loadVerbosityOverlay` itself validates `name` against the enumeration or rejects path separators (`/`, `\`, `..`) before constructing the file path. The companion spec mandates this rejection for persona (`persona-resolution-and-injection.spec.md:48`). Without an explicit defense-in-depth contract on `loadVerbosityOverlay`, a future caller bypassing `resolvePersona`'s enumeration check (a unit test, direct lib call, or refactor) could pass attacker-influenced `name` (e.g. `../personas/architect`) into `path.join(templatesDir, "${name}.md")`, enabling path traversal limited only by the `.md` suffix. **Mitigation:** add an error case + acceptance criterion requiring `loadVerbosityOverlay` to reject names containing `/`, `\`, or `..` and reject names outside `{terse, normal, deep}` before path construction.

### SEC-2 — warning — input-validation
**Location:** `:78` (Error Cases, INVALID_VERBOSITY_VALUE row); `:145` (Acceptance "parseUserConfig parses a `verbosity=` line")

The spec extends `parseUserConfig` to recognize the `verbosity` key but does not require parse-time validation. The error-case row covers "set to invalid value (e.g. `loud`)" by warning and falling back, suggesting validation lives in `resolvePersona`, but the spec does not state where the enumeration check happens nor that values containing shell-meta or path-traversal characters are rejected before any downstream use. **Mitigation:** add an acceptance criterion: "`resolvePersona` validates the parsed `verbosity` value against the closed enumeration `{terse, normal, deep}` before passing it to `loadVerbosityOverlay`; values containing `/`, `\`, or `..` are rejected with the same PATH_TRAVERSAL warning class as persona."

### SEC-3 — warning — data-exposure
**Location:** `:133` (Task #9); `:163-166` (Post-ship validation contract)

Task #9 extends `scripts/persona-jsonl-analysis.mjs` to bucket by `persona × verbosity`. The current script carries an explicit invariant ("This script never echoes user/assistant content to stdout. Statistics only."). The spec does not reaffirm or carry this invariant forward as an acceptance criterion for the extended script, leaving room for a future contributor to print sample turn text (e.g. for debugging persona × verbosity detection) and accidentally exfiltrate transcript content that may contain credentials, secrets, or PII captured in past conversations. **Mitigation:** add an acceptance criterion: "The extended `persona-jsonl-analysis.mjs` preserves the no-content-echo invariant: stdout contains aggregate statistics only, never user or assistant message text."

### SEC-4 — warning — input-validation / hook-protocol
**Location:** `:79` (Error Cases, MISSING_VERBOSITY_OVERLAY row)

The `MISSING_VERBOSITY_OVERLAY` case is described as "warning if fallback succeeds, fatal if `normal.md` missing." Since `loadVerbosityOverlay` is invoked inside the session-start hook injection path (Behavior 4), a "fatal" outcome inside the hook conflicts with the constitution's "Hook protocol compliance" principle (exit 0 = allow, exit 2 = block). The spec does not specify whether "fatal" means hook exits 0 with no overlay, exits 2 (blocks session), or throws (likely interpreted as crash). The existing session-start hook wraps the persona block in `2>/dev/null || true` and exits 0 on any failure. **Mitigation:** replace "fatal if `normal.md` missing" with "warning emitted to stderr, no overlay injected, persona directive used alone (degraded but functional). The session-start hook never exits non-zero due to a missing overlay template."

### SEC-5 — suggestion — input-validation
**Location:** `:148` (Acceptance: `--verbosity <name>` flag parseable from slash-command argument text)

The `--verbosity` flag mirrors `--persona` but the spec does not specify the same parsing-safety contract the companion spec mandates for `--persona` (`persona-resolution-and-injection.spec.md:78`). Without explicit inheritance, a future implementer could parse `--verbosity` more permissively. **Mitigation:** add acceptance criterion: "`--verbosity <name>` parses with the same safety rules as `--persona`: empty values, multi-token values, and values containing path separators are rejected with a warning."

### SEC-6 — suggestion — data-exposure
**Location:** `:64` (Behavior 11); `:154` (Acceptance "Anti-redundancy presence invariant")

The anti-redundancy rule requires templates to contain literal disk-artifact path patterns. The directive text is injected verbatim into every session. While the patterns are template literals (not interpolated), the spec does not explicitly state that the directive must not instruct the model to *enumerate* or *check existence* of these paths in the user's project. **Mitigation:** add a note alongside Behavior 11: "The anti-redundancy rule instructs summarization of artifacts the assistant has already written in the current turn; it does not instruct the assistant to probe the filesystem for the existence of artifact paths."

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### CA-1 — warning — terminology / charter drift
**Location:** `.context-index/specs/features/output-personas/charter.md:4`

Charter capability map was amended (row added at line 76 for the new verbosity capability) but the charter's frontmatter still says `revision: 2` and `updated: 2026-04-21`. A capability-map edit is a substantive change; spec frontmatter at `verbosity-axis-and-output-trimming.spec.md:8` already declares `charter-revision: 2` and `charter-extension: true`, but the charter itself was not bumped. Drift between the spec's `charter-revision` and the charter's actual `revision` will mislead `/adev:hygiene`. **Recommend:** bump charter to `revision: 3`, set `updated: 2026-05-18`, and update spec frontmatter to `charter-revision: 3`. Capture as a follow-on task (currently task #8 amends only the companion spec, not the charter).

### CA-2 — warning — domain-model / bullet-count ambiguity
**Location:** `verbosity-axis-and-output-trimming.spec.md:31, :54`

Bullet-count claims conflict between sections. Behavioral Contract preamble (`:31`) cites "1.85x mean output tokens, 1.41x section headers" empirics. Behavior 6 (`:54`) and Acceptance Criteria (`:142`) state current Architect bullet count is 69, target 58-62. The research artifact at `.context-index/research/persona-output-depth-and-verbosity.md:21` states Architect has "24 bullets across 8 dimensions" while the fixture totals table at line 127 reports "69 total bullets" across 5 fixtures. Verified by `node scripts/persona-fixture-score.mjs`: per-dimension bullets = 24 (template literal count), fixture totals = 69 (sum of bullets-per-activated-dimension across 5 prompt classes). The spec collapses both numbers under "bullet count" without disambiguating. The 58-62 target only makes sense against the fixture-weighted total. **Recommend:** disambiguate by writing "total bullets summed across the 5 fixture prompt classes used by `scripts/persona-fixture-score.mjs`" wherever the 58-62 / 69 numbers appear, or rephrase the per-dimension distribution check (3+3+≤3+2+≤3+3+2+3 = 19-22 per-dimension sum) separately from the fixture-weighted total.

### CA-3 — warning — contract / acceptance criterion unimplementable as written
**Location:** `verbosity-axis-and-output-trimming.spec.md:142`

The per-dimension Architect distribution in Acceptance Criteria (`Verbosity=3, Code References=3, Review Verdicts≤3, Test Results=2, Plan Output≤3, Spec/ADR Citations=3, Error/Debug Output=2, Next Actions=3`) sums to a per-dimension total of 19-22 — but the same line says this must be "in range 58-62 across the 8 output-rule dimensions." **19-22 ≠ 58-62.** The 58-62 number is the fixture-weighted total from `persona-fixture-score.mjs`. The acceptance test as written cannot succeed because the two numbers describe different counts. **Recommend:** the assertion should either (a) check per-dimension counts match the listed distribution, OR (b) re-run `persona-fixture-score.mjs` against the edited template and assert the "Total bullets" row lands 58-62 — but not both under one "total bullet count" label.

### CA-4 — suggestion — terminology
**Location:** `:23, :40, :50`

"Verbosity overlay" is the spec's new term; it is consistent within the spec but does not appear in the charter (which calls it just a "verbosity axis"), in the companion spec, or in the research artifact (which uses "verbosity dial," "verbosity setting," and "overlay" interchangeably). **Recommend:** add one sentence to charter row at `charter.md:76` introducing "verbosity overlay" as the canonical term.

### CA-5 — suggestion — risk-level policy
**Location:** `:5`

`risk_level: low` is plausible but the change does alter the default chat output of every adev session. `.context-index/governance/risk-policies.yaml` maps `low` to `require_review: false` — i.e. low risk allows skipping review entirely. Given the change touches a session-start injection contract and has session-wide blast radius, `medium` is more defensible. **Recommend:** bump to `medium`.

### CA-6 — suggestion — contract
**Location:** `:107, :131`

Spec references "9 golden directive-text fixtures" (`:107, :130, :152`). The Anti-redundancy presence invariant at `:154` says "each of the 6 templates affected (3 personas + 3 verbosity overlays)" must contain the anti-redundancy paragraph — but the 9-combo matrix is rendered output, not template files. **Recommend:** clarify that the 6-file invariant is asserted on source templates while the 9-combo invariant is asserted on rendered output.

### CA-7 — suggestion — pattern
**Location:** `:106`

Module Impact lists "`hooks/session-start.sh` (or the equivalent injection point)". Verified the file exists. The hedge is unnecessary and weakens the contract — the file path is stable, used by the companion spec's source-manifest. **Recommend:** drop the hedge.

### CA-8 — suggestion — contract
**Location:** `:110`

Task #8 says "Amend `persona-resolution-and-injection.spec.md` line 70 …" — but the companion spec is `status: validated`. Amending a validated spec needs to be flagged as a deliberate revision bump, not a silent edit. **Recommend:** clarify that the companion spec amendment requires bumping its `revision` (currently 2) and re-validating, OR scope the amendment to be tracked as an acceptance criterion addition.

### CA-9 — suggestion — pattern
**Location:** `:147`

Acceptance criterion specifies `personaDirective + "\n\n" + verbosityOverlay` as a single block, matching Behavior 4 at `:50`. The companion spec at line 66 says "After session start, the conversation context contains exactly one persona directive block" — this becomes "one persona directive block + one verbosity overlay block" after this spec ships, contradicting the literal "exactly one" wording. Task #8's amendment list does not call out updating that postcondition. **Recommend:** add the postcondition update to Task #8's scope.

### CA-10 — suggestion — terminology
**Location:** `:64, :72, :156`

The anti-redundancy exclusion for Next Actions is consistently encoded across Behavior 11, Postcondition, Acceptance, and Behavior 7 (terse overlay). However, Behavior 8 (deep overlay) and the Error Cases table do not mention the exclusion. **Recommend:** add one sentence to Behavior 8 noting the Next Actions invariant still holds under deep.

---

## Summary

**Total findings:** 24 (0 blockers, 9 warnings, 15 suggestions)

**Verdict:** PASS_WITH_NOTES

**Action required:** Spec advances to `review-passed`. Before invoking `/adev:plan`, the spec author should address — or explicitly defer with rationale — the 9 warning-level findings. In particular **CA-3 is unimplementable as written** (acceptance criterion conflates per-dimension sum and fixture-weighted total) and **SA-1 is a breaking contract change** (`resolvePersona()` return shape) — both should be resolved in the spec text before planning to avoid carrying the defect into task decomposition. The 15 suggestions are quality-of-life refinements that can land during planning or implementation.

**Governance footer:** No `governance/gates.yaml::spec-to-plan::approver_role` configured for this charter; no additional approver gate beyond this review.

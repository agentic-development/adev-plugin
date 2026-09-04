---
spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md
charter: agent-reliable-state-artifacts
verdict: BLOCK
reviewed: 2026-08-17
rigor-tier: full
risk-level: high
last-reviewed-revision: 5
file-sha: 66ea2eb02e57741ebe8b78c5f88dfcab3b864a15f2c10318c6bdcff3ea6919f2
blockers: 8
warnings: 7
suggestions: 2
blockers-sidecar: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.blockers.md
---

# Architecture Review: lifecycle-event-log-rev-5-review-gate-integrity

> **Date:** 2026-08-17
> **Spec:** `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.spec.md` (revision 5)
> **Charter:** `.context-index/specs/features/agent-reliable-state-artifacts/charter.md`
> **Rigor tier:** full (risk_level `high` → `review_mode: full`)
> **Verdict:** BLOCK

## Registry Warnings

| Code | Message |
|------|---------|
| BROADEN_TOOL | Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'. |
| BROADEN_TOOL | Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'. |
| BROADEN_NETWORK | Profile 'browser-review': network broadened 'deny' → 'read-only'. |
| CONTEXT_PACK_OVERRIDE | Context pack 'review-base' overrides bundled default. |

Registry errors: none. Governance note: `gates.yaml` declares no `spec-to-plan` `approver_role`.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

No reviewers are disabled in `.context-index/governance/review.yaml`.

## Structural Architect (structural-architect)

**Verdict:** FAIL

Verified-correct claims (no findings raised): `lib/cli/gate.mjs:144` is the sole enforcement caller and passes no sha; `--type reviewer` has no `--revision` flag; `effectiveRevision()` defaults to 1; `GateError` is `{requiredStep, currentStatus, mode}` with `code: "GATE_BLOCKED"` mapped to exit 2; `parseFrontmatter` is scalar-only; `target-revision: 5` = base `revision: 4` + 1; no `CANONICAL_EVENTS` variant added, so the ADR-0009 human-approval line holds. Every skill emits `--status started` before a terminal, so BEH-7 breaks no documented caller.

### SA-1 — blocker — module-boundary-violation

- **blocker_id:** `structural-architect:module-boundary-violation:f301e48b`
- **section_anchor:** `behaviors-3c`
- **Location:** Behavioral Delta — BEH-3c scope note; BEH-9

The disclosed widening is mis-targeted and the larger widening is undisclosed. BEH-3c names `measurement-integrity.spec.md` as a co-owner of `lib/cli/report.mjs` that "must be updated in the same change" — that spec is `status: superseded`, DISSOLVED 2026-08-13, carries no `source-manifest:` block, and its own disposition table states it "drove no implementation" and was dissolved *precisely* because it made competing ownership claims. The obligation is undischargeable. Its table also reassigns `lib/cli/gate.mjs` to `driver-substrate.spec.md`. Meanwhile BEH-9 — the named mandatory enforcement point — widens into `lib/cli/gate.mjs`, which IS claimed by two live specs' `source-manifest.files`: `explicit-governance-registries.spec.md` (validated, rev 5) and `driver-substrate.spec.md` (validated). That widening is disclosed nowhere. The real report.mjs co-owner set is also wrong: `check-id-enum.spec.md` claims it too. No acceptance criterion binds any co-owner update, so the one stated obligation is unverifiable at plan or validate time.

**Recommendation:** Replace the scope note with the actual owner set derived from `source-manifest.files` (`explicit-governance-registries.spec.md`, `check-id-enum.spec.md` for report.mjs; `explicit-governance-registries.spec.md`, `driver-substrate.spec.md` for gate.mjs), drop `measurement-integrity.spec.md`, state per owner what the update is (an amendment vs. a source-manifest restamp — ADR-0011 keeps drift advisory, so say which), and add one AC asserting each named co-owner artifact was updated.

### SA-2 — blocker — unsatisfiable-contract

- **blocker_id:** `structural-architect:unsatisfiable-contract:dcd4df76`
- **section_anchor:** `behaviors-1c`
- **Location:** Behavioral Delta — BEH-1b / BEH-1c

BEH-1c declares `lib/frontmatter.mjs::parseFrontmatter` "the sole helper used to LOCATE indent-0 key lines for removal and duplicate detection." It cannot do either. It returns a last-wins map (`fields[m[1]] = m[2].trim()`, frontmatter.mjs:129) that structurally cannot express a duplicate, returns no per-key line indices for the removal step, and does not export `FIELD_RE`. Only `lines/openIdx/closeIdx` come back. The digest input is the single load-bearing contract of this amendment, and its sole named mechanism is unimplementable as written. The two escapes are both closed: widening `lib/frontmatter.mjs`'s public API is an undeclared change to a module with four other consumers (`specify-amend`, `specify-revise`, `amendment-graph`, `cli/test-policy`) and is in no scope note; re-deriving the indent-0 regex locally is the fourth frontmatter parser BEH-1b explicitly forbids.

**Recommendation:** Declare the `lib/frontmatter.mjs` API widening explicitly — name the new export (e.g. one returning indent-0 key line indices plus a duplicate signal) as a deliverable of this amendment, add it to the scope note alongside report.mjs/gate.mjs, and add an AC that the emitter and the gate caller reach that new export rather than a local regex.

### SA-3 — warning

- **Location:** BEH-3a vs BEH-3c

BEH-3a rejects a revision-keyed window "because no emitter stamps one: `adev report --type reviewer` exposes no `--revision` flag" — while BEH-3c, in the same delta, adds that flag and makes `reportReviewer` stamp the field. The normative rule stays unambiguous, but its stated justification is false the moment the amendment lands, which will mislead the next reviser.

**Recommendation:** Rewrite BEH-3a's justification on the durable ground (revision is author-declared and a rewrite that does not bump it is invisible — the same argument the Rationale already makes against `revision:`), not on the temporary absence of an emitter.

### SA-4 — warning

- **Location:** BEH-3c

Two sources for one field with no precedence. `reportReviewer` stamps the spec's current `revision:` frontmatter value, AND `--revision <n>` lets the CLI writer "supply it explicitly." When they disagree, which wins is undefined. This value drives `byRevision` bucketing, so the AC "two reports at different revisions land in different `byRevision` buckets" is not testable as written.

**Recommendation:** State the precedence (explicit flag overrides the read value, or the reverse) and whether a disagreement warns; add it to the AC.

### SA-5 — warning

- **Location:** BEH-3d vs BEH-5

BEH-3d's empty-window sentinel is not conditioned on whether the pre-revision reports carried `spec_sha`. A spec whose only reviews predate this amendment — unstampable, and exactly BEH-5's grandfathering target — that is then revised via `adev specify revise` projects `"unreviewed-since-revision"` and BLOCKS under strict, contradicting BEH-5's "keeps the existing review history of every spec in the corpus valid; enforcement begins with reviews recorded after this amendment ships." Corpus blast radius is currently 1 of 189 logs, so the fix is cheap, but the doctrinal conflict is unresolved on the page.

**Recommendation:** Condition BEH-3d on the pre-revision window having contained at least one `spec_sha`-bearing report; otherwise fall to BEH-5's `SPEC_SHA_UNVERIFIABLE`. Or amend BEH-5 to state that the grandfather does not survive a post-review `spec_revised`, and say which sentence governs.

### SA-6 — warning

- **Location:** BEH-7 / BEH-8, Error Cases Delta (ORPHAN_STEP_TERMINAL)

Mismatched predicates. BEH-7 keys on "records no `started` event for the named `--step`" (a history question); BEH-8 exempts "a step that *is* open" (a current-status question). The projection retains only last-wins `steps.<step>.status` — no started-history — and the error contract requires naming "the statuses actually present." Which predicate governs a second `completed` on an already-closed step is undefined.

**Recommendation:** Pick one predicate and use it in both behaviors and the error row; if it is the history one, say which projection field carries started-history (it does not exist today).

### SA-7 — suggestion

- **Location:** BEH-9

`driver-substrate.spec.md` Postcondition 1 and its AC require gate.mjs's `run()` first executable statement to be `requireGate(...)`; gate.mjs:136-148 cites that postcondition verbatim as the reason state load and mode resolution are inlined into the call. BEH-9 adds a spec read plus a digest computation without saying where they sit relative to it.

**Recommendation:** State that the read and digest are inlined into the `requireGate(...)` call expression (preserving the pattern), or list `driver-substrate.spec.md` in the scope note as needing an update.

## Security Reviewer (security-reviewer)

**Verdict:** FAIL

### SEC-1 — blocker — input-validation

- **blocker_id:** `security-reviewer:input-validation:35f8284f`
- **section_anchor:** `behavioral-delta-beh-1b`

BEH-1b — declared "the sole definition of the digest input" — defines the attested region as removal over "the spec's RAW BYTES" and never scopes removal to the frontmatter block. Read literally, ANY indent-0 line in the file whose key is `status`/`updated`/`drift_detected`/`source-manifest`, together with its indented continuation lines, is stripped before hashing. A spec author can therefore plant in the BODY a column-0 line `source-manifest:` followed by indented lines and obtain an unattested, freely-mutable region that survives review and never changes `spec_sha` — defeating the CWE-345 binding this amendment exists to create. BEH-1c implies frontmatter scope (via parseFrontmatter) but does not state it, so the two clauses read differently; AC "BEH-1's digest input is defined exactly once" is therefore false, and this is exactly the CWE-436 interpretation conflict BEH-1b itself warns against.

**Recommendation:** Amend BEH-1b to state that removal applies ONLY to lines with index in (openIdx, closeIdx) of the leading frontmatter block as returned by parseFrontmatter, and that every byte at or before openIdx and at or after closeIdx is retained verbatim. Add an AC: "A body line at column 0 reading `status: x` followed by indented lines IS attested — mutating it changes spec_sha."

### SEC-2 — blocker — authorization

- **blocker_id:** `security-reviewer:authorization:6465b690`
- **section_anchor:** `behavioral-delta-beh-1c`

BEH-1c claims to "fail closed on ambiguity", but its only effect is to OMIT `spec_sha`. At gate time an absent `steps.<step>.specSha` is routed by BEH-5 to `SPEC_SHA_UNVERIFIABLE`, which is explicitly "never blocking". The disposition is therefore fail-OPEN, and the trigger is fully author-controlled: adding a duplicate indent-0 frontmatter key (or an ambiguous closing delimiter) to a spec before review silently disables its own attestation, after which the spec can be rewritten arbitrarily and still open the gate — defect 1 of the Rationale, unmitigated, via a one-line edit. The spec already recognised this hazard shape in BEH-3d ("MUST NOT absorb ... the BEH-5 soft path") and simply did not apply the same reasoning to BEH-1c. A hand-edit emits no `spec_revised`, so BEH-3d does not catch it.

**Recommendation:** Give the uncanonical case its own blocking sentinel, parallel to BEH-3d: project `steps.<step>.specSha = "uncanonical"` when the review-time region could not be built, and have BEH-4 treat it as a mismatch under strict mode (advisory warn under advisory). Reserve BEH-5's soft path strictly for pre-amendment reports that carry no field at all. Add an AC asserting a duplicate indent-0 key at review time BLOCKS the strict gate rather than passing it.

### SEC-3 — blocker — input-validation

- **blocker_id:** `security-reviewer:input-validation:d5f1a403`
- **section_anchor:** `behavioral-delta-beh-1c`

BEH-1c names `lib/frontmatter.mjs::parseFrontmatter` as "the sole helper used to LOCATE indent-0 key lines for removal and duplicate detection". Verified against source: it can do neither. (a) Duplicate detection is impossible — `fields` is a plain object built with `fields[m[1]] = ...`, so a repeated key silently collapses last-wins and leaves no trace. (b) It returns no per-key line indices, only `lines`/`openIdx`/`closeIdx`; locating the key lines requires re-implementing `FIELD_RE`, which is module-private and NOT exported — i.e. authoring the fourth frontmatter parser BEH-1b forbids, with the aliasing risk that reintroduces. (c) An unclosed/absent closing delimiter and a file with no frontmatter both return the identical `{frontmatterText: null, openIdx: -1, closeIdx: -1}`, so the `SPEC_SHA_UNCANONICAL` trigger cannot be distinguished from the legitimate no-frontmatter case; the fail-closed path cannot be implemented as written and does not cover every ambiguity it claims.

**Recommendation:** Either (i) specify the export `lib/frontmatter.mjs` must grow — e.g. `locateIndentZeroKeys(text) -> [{key, lineIndex}]` plus an explicit `duplicateKeys` array and a `malformed: "unclosed-fence" | "absent"` discriminator — and name that export as the sole locator, or (ii) drop the parseFrontmatter claim and state the removal scan's own anchoring regex normatively in BEH-1b. Add ACs covering: duplicate key detected, unclosed fence distinguished from no-frontmatter, and a file with no frontmatter hashing whole-file successfully.

### SEC-4 — warning — input-validation

BEH-9 instructs the CLI arm to "compute the BEH-1 BODY digest", but BEH-1/BEH-1b define a region that includes all non-denylisted frontmatter, and an AC requires that mutating `risk_level` alone change `spec_sha`. An implementer following BEH-9 literally would hash only the body, producing a digest that never matches the emitter's and silently disabling enforcement on the one mandatory enforcement path.

**Recommendation:** Replace "body digest" in BEH-9 with "canonical attested region digest" and require both call sites to obtain it from the same named export (already an AC, but the wording must not license a second interpretation).

### SEC-5 — warning — input-validation

The removal rule is byte-anchored but line-ending-blind. `FIELD_RE` (`/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/`, no `m` flag) does not match a CRLF-terminated line, so on a CRLF checkout the denylisted keys are NOT removed and every routine lifecycle write of `updated:`/`source-manifest:` mutates `spec_sha`, hard-blocking the strict gate for specs that were never substantively edited — a self-inflicted denial of the plan step, and the exact regression the SA-1/SEC-1 lifecycle-frontmatter AC is meant to guard.

**Recommendation:** State normatively whether the region is computed over raw bytes or over newline-normalized text, and add an AC covering a CRLF-terminated spec.

### SEC-6 — warning — authentication

The Rationale bounds authenticity only for BEH-7 step events ("Neither event carries actor or session provenance"). No equivalent bound is stated for `spec_sha`, yet the log is an unsigned plaintext JSONL under `.context-index/lifecycle-state/` writable by exactly the same actor that can rewrite the spec. A matching `spec_sha` is evidence of consistency, not attestation — an adversary who edits the spec can edit the recorded digest in the same commit.

**Recommendation:** Add one sentence to BEH-1/BEH-4 mirroring the BEH-7 bound: `spec_sha` provides integrity against accidental and unnoticed drift, NOT authenticity; downstream consumers MUST NOT treat a matching digest as an attested review. Note the remaining control is code review of the log diff.

### SEC-7 — suggestion — data-exposure

`SPEC_SHA_UNCANONICAL`, `SPEC_SHA_UNAVAILABLE` and `SPEC_SHA_UNVERIFIABLE` are all specified as "one-time" warnings. If one-time means once per process, a batch run (`/adev:build` over a milestone) surfaces the first suppressed-attestation spec and silently swallows every subsequent one — the diagnostics for a security-relevant degradation are the ones being deduplicated.

**Recommendation:** Specify the dedupe key as (warning-code, spec-path) rather than warning-code alone.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

### CON-1 — blocker — domain-model

- **blocker_id:** `consistency-analyzer:domain-model:06d01175`
- **section_anchor:** `BEH-3c`

**This spec:** BEH-3c states the widening into lib/cli/report.mjs "is co-owned by explicit-governance-registries.spec.md and measurement-integrity.spec.md; that widening is deliberate and those specs must be updated in the same change."

**Conflicts with:** `.context-index/specs/cross-cutting/measurement-integrity.spec.md` frontmatter: `status: superseded`, `superseded-by: "dissolved 2026-08-13"`. Its Disposition table shows the report.mjs/check-ID concern it once carried was promoted to `.context-index/specs/cross-cutting/check-id-enum.spec.md` ("Promoted out of measurement-integrity.spec.md when that spec was dissolved"), which is itself `status: draft`, blocked-by the ADR-0010 boundary decision, and addresses a different concern (`--validator` ID vocabulary, not the `--type reviewer --revision` flag this amendment adds).

**Recommendation:** Drop measurement-integrity.spec.md as a named co-owner — it is dissolved and has no live contract to update "in the same change." If a second cross-cutting owner genuinely needs coordination for the report.mjs widening, name check-id-enum.spec.md (and note its draft/blocked status, which would itself gate this amendment's implementation), or state that explicit-governance-registries.spec.md is the sole co-owner.

### CON-2 — blocker — domain-model

- **blocker_id:** `consistency-analyzer:domain-model:ffe10938`
- **section_anchor:** `BEH-3a`

**This spec:** BEH-3a's closing sentence: "This amendment is itself at `revision: 2` and would have blocked itself."

**Conflicts with:** This spec's own frontmatter: `revision: 5`. The self-referential claim is stale — left over from an earlier BLOCK→revise round and never updated as the amendment progressed to revision 5.

**Recommendation:** Update the self-citation to the current revision (5), or rephrase to avoid citing a specific revision number that drifts on every future `--revise` cycle.

### CON-3 — blocker — contract

- **blocker_id:** `consistency-analyzer:contract:9c103dd8`
- **section_anchor:** `acceptance-criteria`

**This spec:** Acceptance Criteria: "`reviewer_report` events written after this amendment carry a 64-char lowercase-hex `spec_sha`; the digest matches `lib/source-manifest.mjs`'s per-file hash for the same bytes."

**Conflicts with:** BEH-1/BEH-1b in the same spec define `spec_sha`'s input as the "canonical attested region" — raw file bytes with the four denylisted-key lines (`status`, `updated`, `drift_detected`, `source-manifest`) and their continuation lines REMOVED. `lib/source-manifest.mjs` (verified at line 83, `createHash("sha256").update(content)`) hashes the unmodified whole-file content. These are not "the same bytes" for any spec carrying a denylisted key in its frontmatter — and every spec in this corpus, including this amendment's own target file, carries both `status:` and `updated:`. As worded, the AC is unsatisfiable for any real spec; it can only be read charitably as "same hash primitive," which BEH-1b states explicitly but the AC does not.

**Recommendation:** Reword the AC to match BEH-1b's actual claim: assert the shared primitive/helper (`createHash("sha256").update(buf)`) matches `lib/source-manifest.mjs`'s implementation, not that the resulting digests are equal for the same file.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the header above, computed from post-cap findings across all reviewers. All three reviewers carry `severity_cap: blocker`, so no finding was demoted. `verdict_rules.blocker_threshold: 1`.

## Verdict Rationale — The Widening Question

The step context asked whether BEH-3c's deliberate widening into `lib/cli/report.mjs` is adequately handled, not merely disclosed. Both the Structural Architect and the Consistency Analyzer answered independently and converged: **disclosed but not adequately handled**. The scope note names `measurement-integrity.spec.md` — a spec dissolved on 2026-08-13 with no live contract — as a party that "must be updated in the same change," making the stated obligation undischargeable. It omits `check-id-enum.spec.md`, which claims the same file. And the *larger* undisclosed widening is BEH-9's mandatory enforcement point in `lib/cli/gate.mjs`, claimed by two validated specs' source manifests. No acceptance criterion binds any co-owner update, so nothing verifies the obligation at plan or validate time.

Separately, the parsed-value → line-anchored-removal rewrite that revision 5 introduced to close the previous round's root cause did not fully land: the Security Reviewer and the Structural Architect independently found that the named locator (`parseFrontmatter`) cannot perform the two jobs BEH-1c assigns it, and the Security Reviewer found the removal rule unscoped to the frontmatter block and the "fail closed" path fail-open at the gate.

## Heuristics — prior occurrences of this blocker

The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules. (The heuristics store held no signature-scoped entry for any of the eight validated `blocker_id`s; the module-level set below is what retrieval returned.)

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

---

## Summary

**Total findings:** 17 (8 blockers, 7 warnings, 2 suggestions)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|----------|---------|----------|----------|-------------|
| structural-architect | FAIL | 2 | 4 | 1 |
| security-reviewer | FAIL | 3 | 3 | 1 |
| consistency-analyzer | FAIL | 3 | 0 | 0 |

**Action required:** The spec is blocked. Address the eight blockers recorded in `lifecycle-event-log-rev-5-review-gate-integrity.blockers.md` via `/adev:specify --revise`, then re-run `/adev:review-specs` to produce revision 6. Planning cannot begin until the consolidated verdict is PASS or PASS_WITH_NOTES.

Blocker sidecar: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log-rev-5-review-gate-integrity.blockers.md` (8 entries, 0 `BLOCKER_ID_COLLISION` advisories, 0 `LEGACY_REVIEWER_OUTPUT` / `INVALID_BLOCKER_ID` / `MISSING_SECTION_ANCHOR` advisories).

Governance footer: `gates.yaml` defines no `approver_role` for the `spec-to-plan` transition — no additional human approver is named by policy. `risk-policies.yaml` sets `require_hitl_approval: true` for `risk_level: high`.

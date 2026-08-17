---
spec: .context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md
charter: .context-index/specs/features/review/charter.md
verdict: BLOCK
rigor-tier: full
date: 2026-08-17
last-reviewed-revision: 2
file-sha: 11ed45daaed627534ef465967a393364a806f7828a6786d41f1c31bbafd21e8a
reviewers-dispatched: 3
total-findings: 24
blockers: 5
warnings: 15
suggestions: 4
---

# Architecture Review: configurable-reviewers-rev-5-path-manifest-context-packs

> **Date:** 2026-08-17
> **Spec:** `.context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md`
> **Charter:** `.context-index/specs/features/review/charter.md`
> **Revision reviewed:** 2 (re-review; revision 1 was BLOCK)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: medium` — no HITL approval gate owed)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

No reviewers are disabled in the project registry.

### Registry warnings (from `adev governance reviewers`)

| Code | Message |
|---|---|
| `BROADEN_TOOL` | Profile `browser-review`: `allow_add` broadens posture by adding mcp_server `playwright`. |
| `BROADEN_TOOL` | Profile `browser-review`: `allow_add` broadens posture by adding category `web-fetch`. |
| `BROADEN_NETWORK` | Profile `browser-review`: network broadened `deny` → `read-only`. |

### Dispatch warnings

`CONTEXT_PACK_FENCE_COLLISION` on all three dispatches — the target spec contains
literal pack fence tokens (it specifies the fence format) and they were neutralized.
Expected for this spec, not a defect.

### Method caveat — this review ran inside the defect it reviews

This project's materialized `.context-index/governance/review.yaml` pins all three
reviewers to `context_pack: base`. Every reviewer's pack therefore rendered **9198
bytes** (`constitution.md` + `platform-context.yaml`) — no charter, no sibling specs,
no ADRs, no `risk-policies.yaml`, no `gates.yaml`. The pack-assignment fix lives on
branch `worktree-j7pq-review-gate` (commit `863e119b`), not on this branch.

Compensated exactly as revision 1's run did: each reviewer was directed to read the
required context directly under its `read-only` grants (base spec, rev-4 spec, ADRs,
`lib/governance/context-pack.mjs`, `lib/governance/dispatch-shape.mjs`,
`templates/review-specs/defaults.yaml`, `templates/governance/profiles.yaml`,
`templates/domains/software/validate.yaml`). All three confirmed the reads.

**Base spec integrity:** `configurable-reviewers.spec.md` hashed
`baaa7bfc7e00fdf09765d790c1a905c44b4bd883fab20291426a0f408605cfb4` before and after
the run — byte-immutable, as required.

---

## Prior-blocker resolution (revision 1 → revision 2)

Revision 1 was BLOCKed with 6 blockers. Consolidated assessment across all three
reviewers, with orchestrator verification of the load-bearing claims:

| # | Prior blocker | Status | Basis |
|---|---|---|---|
| 1 | **SA-1** shared-consumer blast radius (unconditional delivery change on shared `renderPack` would reverse 22o) | **RESOLVED** | BEH-9's per-pack `delivery` field defaulting to `inline` is the right mechanism. Verified in `lib/governance/context-pack.mjs:117-124`: `resolveExtends` walks child→root and takes the nearest declaration, so `review-base: manifest` reaches `architecture`/`security`/`consistency` while `base: inline` stays isolated. No live behavior (BEH-9..BEH-14) alters emission when `delivery: inline`, so inline consumers are genuinely byte-unchanged. The 22m "unreachable, not retired" framing is accurate for the target-spec branch. |
| 2 | **SA-2 / CON-2** contradictory truncation contract | **PARTIAL** | The *target-spec* branch is now fully consistent — BEH-12, the Postconditions Delta, the `TARGET_SPEC_OVERSIZE` row and the AC all agree (exempt from both caps, warning only, no truncation, no marker), and 22l/22m keep their rev-4 meanings. The wrong-marker half is genuinely fixed. **But the identical defect pattern reappeared one level down:** BEH-12 declares the caps bind the manifest text while BEH-10 and the 22m row guarantee nothing is ever omitted for budget reasons — a cap with its only enforcement mechanism withdrawn (new SA-2). And the 22k rationale row still asserts the *inverse* of BEH-12 (new CON-1). |
| 3 | **SA-3** undefined manifest output form | **PARTIAL** | Reusing 22g's nonce-fenced section does remove the *body* forgery surface and makes the previously unfalsifiable forgery AC testable; 22j's provenance rule is now consistent rather than self-contradictory; the `title` fallback is reachable (`normalizeInclude` at `context-pack.mjs:434-444` does yield `title: null`). **But** the claim of "no new grouping syntax / 22g's existing section mechanism" is overstated: `role="path-manifest"` and `title=` are both *additions* to the emitted vocabulary (existing roles: `no-matches`, `truncation-notice`, `target-spec`), and `title=` lands in the fence-header attrs — outside the neutralizer BEH-14 names. |
| 4 | **SEC-1** manifest path injection | **PARTIAL** | Retargeting the AC from file-body forgery to file/directory **NAME** forgery is correct, and `CONTEXT_PACK_FENCE_COLLISION` is reused at its existing severity. **But** BEH-14 scopes neutralization to "any path string emitted into a manifest **section**" — the body — while BEH-10 newly puts an author-controlled, path-derived string in the fence **header**. Verified: `fenceBlock` (`context-pack.mjs:426-432`) neutralizes only `body`; `attrs` is interpolated raw at every call site. Separately, control characters in a path defeat both the one-path-per-line format and the denylist's `(^|/)` anchoring (new SEC-2). The channel is half-closed. |
| 5 | **CON-1** denylist severity split | **RESOLVED** | Verified by grep: both invented codes are gone from the amendment. BEH-11's three codes match `lib/governance/context-pack.mjs` exactly on code string, severity and trigger — `CONTEXT_PACK_DENYLIST` (L244, fail load, denied literal pattern), `CONTEXT_PACK_DENYLIST_SKIP` (L281, warning, wildcard match), `CONTEXT_PACK_DENYLIST_MATCH` (L287, hard error, enumerated match). The enumerated-include hard failure — the symlink-evasion case — is preserved. The denylist guard also sits in Pass 1 (plan construction), which is delivery-independent, so a manifest inherits it. |
| 6 | **BEH-8** reproducibility → auditability (non-blocking) | **RESOLVED** | Swept by two reviewers: no Postcondition and no AC still claims reproducibility or replay-equivalence, and the AC explicitly requires the auditability wording. Rev-4 22n's reproducibility claim is scoped to `renderPack` output and is unaffected. Residual concerns are warning/suggestion level (BEH-8 names no concrete store; the reviewer self-report has no output channel and should not be treated as coverage evidence). |

**Net: 3 of 6 fully resolved, 3 partial.** No prior blocker regressed. Revision 2 is a
substantive, good-faith rewrite — every fix moved in the right direction and the
mechanism choices (per-pack `delivery`, reusing 22g's section form, reusing 22p-bis's
codes verbatim) are the correct ones. The remaining blockers are the *second-order*
consequences those fixes introduced, plus one rationale row that was not updated
alongside the behavior it summarizes.

### Behavior ID hygiene

Live set verified as exactly **BEH-1, BEH-5, BEH-8, BEH-9, BEH-10, BEH-11, BEH-12,
BEH-13, BEH-14**. Tombstone comment lists BEH-2, BEH-3, BEH-4, BEH-6. No ID is reused
for a different condition, no gap was closed by renumbering, and BEH-9..BEH-14
correctly allocate above the retired maximum of 8.

**One real gap, found independently by two reviewers and verified by the orchestrator
against `git show 2843d516`:** revision 1 declared BEH-1 through BEH-8. **BEH-7 is
neither live nor tombstoned.** Its condition ("when a reviewer is dispatched with a
path manifest then the prompt states that manifest paths are … read on demand, and
names the read tools") is carried essentially unchanged by revision 2's **BEH-13** —
an in-place rewrite that was renumbered. Per
`.context-index/specs/cross-cutting/spec-behavior-ids.spec.md` (BEH-3: an in-place
rewrite keeps its ID; BEH-4: a retired ID is appended to the tombstone comment; and
the invariant "it never renumbers untouched behaviors"), this is a defect. Revision
1's `.review.md` cites BEH-7 five times; those citations now dangle with no
forwarding pointer. One-line fix: either rename BEH-13 → BEH-7, or append `BEH-7` to
the tombstone comment with a `→ BEH-13` note. Filed as SA-8 / CON-4 (warning).

---

## Structural Architect (structural-architect)

**Verdict:** FAIL — 2 blockers, 6 warnings, 1 suggestion

### SA-1 — blocker — ownership of target-spec inlining is unassigned

- `blocker_id`: `structural-architect:ownership-ambiguity:0111fab5`
- `section_anchor`: `behavioral-delta-beh-10`
- **Location:** BEH-10, BEH-12, Postconditions Delta, Error Cases Delta (`TARGET_SPEC_OVERSIZE`)

Revision 1's SA-4 warning is unimplemented and has now become load-bearing for two
claimed blocker fixes. BEH-10 ("the target spec named by `targetSpecPath` is the only
file whose body is inlined") and BEH-12 (exempt from both caps, `TARGET_SPEC_OVERSIZE`)
attribute the inlining to the **pack render**. In the code that responsibility sits in
`buildReviewerDispatches`: `lib/governance/dispatch-shape.mjs:98-103` builds
`specBlock` from `ctx.targetSpecContent` with `role="target-spec"` (rev-4 22i), and
`templates/review-specs/defaults.yaml:54` gives `review-base`
`exclude: ["<target-spec>"]` **specifically so the target spec is never shipped twice**.

Neither reading works:

- If `renderPack` now inlines it, the target spec appears **twice** in every prompt
  (once in the pack, once in the untouched `specBlock`), and 22d's `exclude` must be
  overridden — neither is declared in "Behaviors narrowed".
- If `specBlock` keeps ownership, BEH-12's cap exemption is **vacuous** (`specBlock`
  was never inside `renderPack`'s budget) and `TARGET_SPEC_OVERSIZE` compares the
  target spec against a cap that never applied to it.

The Postconditions Delta picks the first reading ("rendered size of a manifest pack is
a function of the target spec plus the manifest text"), which contradicts what
`renderPack`'s `rendered` actually returns.

**Recommendation:** Name the owning component explicitly, state that the target spec
appears exactly once in the assembled prompt, and say what happens to `review-base`'s
`exclude: ["<target-spec>"]` under `delivery: manifest`. If `specBlock` retains
ownership, restate BEH-12 as a dispatch-assembly guarantee and re-anchor
`TARGET_SPEC_OVERSIZE` to a cap that actually binds.

### SA-2 — blocker — manifest-text caps declared with no enforcement path

- `blocker_id`: `structural-architect:contradictory-contract:e4134970`
- `section_anchor`: `behavioral-delta-beh-12`
- **Location:** BEH-12 vs BEH-10 final sentence, and the 22m row of "Behaviors narrowed"

The truncation contract for the *manifest* text is contradictory in the same way
revision 1's target-spec contract was. BEH-12: "The caps bound the manifest text only"
(plural — both `max_file_bytes` and `max_total_bytes`). BEH-10: "No file is omitted for
budget reasons, so no `role='truncation-notice'` section is emitted for a manifest
pack", and the narrowed table calls 22m "Unreachable … nothing is omitted for budget
reasons". Both cannot hold: if a cap binds, some enforcement must occur, and no
behavior defines it (drop paths? truncate the section? error?).

This is not a theoretical boundary. `max_file_bytes` defaults to 16384 and a manifest
section is one section per include; a project include such as
`.context-index/specs/**/*.spec.md` resolves to ~810 paths — well over 16 KB of path
text in a single section. The narrowed table's 22l row ("Applies only where a file body
is inlined") explicitly denies 22l's marker to manifest sections, so the 16 KB cap is
declared to apply with its only enforcement mechanism withdrawn.

**Recommendation:** Either exempt manifest sections from `max_file_bytes` outright and
scope BEH-12's caps to `max_total_bytes` alone, or define a manifest-specific overflow
behavior (its own marker kind and error code) and drop the "22m unreachable" claim. Do
not leave a cap declared with no enforcement path.

### SA-3 — warning — `renderPack`'s `files[]` return contract undefined under manifest delivery

**Location:** BEH-10; "Behaviors narrowed" table (22p absent)

The second half of revision 1's SA-4 recommendation, also unimplemented. Today
`context-pack.mjs:372` pushes to `files` only for emitted file sections. Under manifest
delivery all three reviewer packs would return the same one-element (or empty) array,
silently breaking rev-4's live AC "`structural-architect`, `security-reviewer`, and
`consistency-analyzer` produce three distinct `files` arrays for the same target spec"
and its test. 22p is the one rev-4 behavior the narrowed table does not mention, so the
effect is undeclared.

**Recommendation:** Define whether `files[]` carries inlined files, manifest paths, or
both (or add a sibling `manifestPaths[]`), add 22p to the narrowed table, and re-scope
the rev-4 AC to whichever field now distinguishes the packs.

### SA-4 — warning — new `title=` attribute is outside the neutralized channel; `role` vocabulary overlaps

**Location:** BEH-10 fence shape; BEH-14; final AC on name-based forgery

Reusing 22g's section mechanism does close the forgery surface for path *bodies*
(`fenceBlock` at `context-pack.mjs:426` neutralizes every body unconditionally), but
BEH-10 introduces a `title=` attribute new to the emitted vocabulary (today only
`path=` and `role=` are emitted) sitting in the attrs line, which `fenceBlock` does not
neutralize. Author-controlled YAML titles and glob strings therefore reach the fence
header unescaped.

Separately, `role` now has two candidate values for one case: `context-pack.mjs:301`
emits `path="<title|glob>" role="no-matches"` for an empty include, while BEH-10 says
the empty case still emits its section and the AC says every manifest section carries
`role="path-manifest"`. Which role an empty manifest include carries is unstated.

**Recommendation:** Extend BEH-14's scope from "any path string" to "any
author-controlled string emitted into a manifest section, including the attrs line",
and state the role attribute for an empty manifest include.

### SA-5 — warning — `PROFILE_CANNOT_CONSUME_MANIFEST` has no governing behavior

**Location:** Preconditions Delta; Error Cases Delta; Task Map

The error code has an error-case row and a Task Map entry but no behavior clause — the
normative surface for this spec is the Behavioral Delta, and the check appears nowhere
in it. Revision 1's SA-5 open questions also remain unanswered: whether "reject the
reviewer at load" fails the whole config load (base Behavior 11a semantics) or drops
that one reviewer (which silently yields the thin review this amendment exists to
prevent, and interacts with the base "All reviewers disabled" case). It also creates
the one coupling the spec declares out of scope — pack contract reaching into profile
capabilities — without saying which component owns it (`renderPack` sees no profiles;
`buildReviewerDispatches` sees both).

**Recommendation:** Promote it to a numbered behavior, locate it in
`buildReviewerDispatches` after `resolveProfile`, make the trigger purely declarative
(pack resolves to `delivery: manifest`, independent of match results), and state
fail-load vs drop-reviewer.

### SA-6 — warning — BEH-8 names no concrete store, and the reported-reads set has no channel

**Location:** BEH-8; penultimate AC

The auditability reframing itself is complete and consistent (no reproducibility claim
survives), but BEH-8 still names no concrete store — the other half of revision 1's
CON-7. "Dispatch record" is used by base Behavior 33 only as the sink for full redacted
adapter text, while ADR-0018 states that canonical reviewer state is the append-only
`reviewer_report` event in `.context-index/lifecycle-state/<slug>.jsonl` and that
`.review.md` is a presentation artifact. Recording review provenance in a non-canonical
sink sits against ADR-0018's stated authority. BEH-8 also has no reviewer-side output
contract for "paths the reviewer reported reading": BEH-13 updates the prompt only to
explain the manifest, and the reviewer's output schema is the findings list, so the AC
has no channel to be satisfied through.

**Recommendation:** Name the store (preferably a new field on the `reviewer_report`
event, per ADR-0018) and add the reviewer-output field to BEH-13's prompt contract.

### SA-7 — warning — the blast-radius premise miscounts its own consumer set

**Location:** "Scope: reviewer-dispatched packs only", 22o row, AC #4

**Orchestrator-verified.** `templates/domains/software/validate.yaml` contains
**three** `context_pack: base` references, not five —
`validate.check-2-spec-compliance` (L54), `validate.check-4-constitution` (L69),
`validate.check-11-visual-verification` (L113) — and only one of the three is a
constitution-compliance check. The count is inherited uncorrected from rev-4's 22o. The
mechanism is unaffected: defaulting to inline does genuinely leave the inline path
byte-unchanged. But **AC #4 ("verified on `base` against all five `validate.yaml` check
consumers") is unsatisfiable as written**, and the same wrong count appears three
times.

**Recommendation:** Correct the count to the three named check ids (or say "every
`validate.yaml` consumer of `base`") in the scope section, the 22o table row, and AC
#4, and drop "constitution-compliance" as the collective label.

### SA-8 — warning — BEH-7 was renumbered rather than tombstoned

**Location:** `<!-- retired-behavior-ids: … -->`; BEH-13

See **Behavior ID hygiene** above. Orchestrator-verified against `git show 2843d516`.
Ordering of the live behaviors is topically grouped (glob → delivery → manifest →
denylist → budget → ordering → prompt → escaping → record) and is defensible; only the
numbering gap is a real defect.

### SA-9 — suggestion — the `resolveExtends` analogy is inexact on validation

**Location:** BEH-9

"Inherited through `resolveExtends` exactly as `max_file_bytes` / `max_total_bytes`
are" is inexact on validation. `resolveExtends` (`context-pack.mjs:117-124`) walks the
child→root chain and takes the nearest declaration — which matches BEH-9's intent — but
it screens declarations through `isPositiveInt` and silently *skips* an invalid value,
continuing up the chain to a default. BEH-9 requires the opposite for `delivery`
(`INVALID_PACK_DELIVERY`, "never a silent fallback"). It is also unstated whether an
invalid `delivery` on a non-nearest ancestor errors at all, and whether validation runs
at `mergePacks` (bricking the whole registry) or at `resolveExtends` (failing one
chain) — the same load-vs-render blast-radius question 22p-bis settled for the denylist.

---

## Security Reviewer (security-reviewer)

**Verdict:** FAIL — 2 blockers, 1 warning, 1 suggestion

### SEC-1 — blocker — BEH-14 closes only the body half of the channel it claims to close

- `blocker_id`: `security-reviewer:input-validation:f37df0ec`
- `section_anchor`: `behaviors-14`
- **Category:** input-validation

BEH-14 scopes neutralization to "any path string emitted into a manifest section" —
the section **body**. But BEH-10 newly mandates a fence **header** carrying
`role="path-manifest" title="<include title>"`, with `title` falling back to the
include's **glob string**, which under `review-base` is the `<charter-dir>` expansion
of `targetSpecPath`.

**Orchestrator-verified** in `lib/governance/context-pack.mjs`: the header is built as
`` `<<<ADEV-PACK-${nonce} ${attrs}>>>` `` and `fenceBlock` neutralizes only `body` —
`attrs` is interpolated raw at every call site (`path="${unit.rel}"`,
`path="${title ?? effectiveGlob}"`, and in `dispatch-shape.mjs`
`role="target-spec" path="${ctx.targetSpecPath}"`).

A `"`, a `>>>`, or a CR/LF in a directory name, a target-spec filename, or a
project-authored pack `title:` therefore escapes the attribute and emits
attacker-chosen lines **inside a fence the 22j preamble declares repository-sourced** —
the strongest position in the prompt. The spec's Postcondition ("Every path emitted in
a manifest section has passed fence-token neutralization") and its forgery AC ("A file
or directory NAME containing … cannot forge a manifest section or fence") both read as
satisfied by a body-only implementation, so this gap ships silently. Under
`delivery: manifest` the manifest is the sole non-target-spec content channel, so a
half-escaped channel is the whole channel.

**Recommendation:** Extend BEH-14 to cover fence-header attribute **values**, and state
the contract structurally: attribute values are emitted only after passing a strict
allowlist (`[A-Za-z0-9._/-]`, plus space), with any other byte percent-encoded (`%22`,
`%0A`) or the attribute omitted and an `INVALID_PACK_ATTRIBUTE` warning raised.
Escaping must live **inside** `fenceBlock` (take `attrs` as a `Record<string,string>`
and build the header there) so no call site can forget it — the same argument 22h's
comment already makes for bodies. Add an AC asserting that a charter **directory** named
`x">>>` and a pack `title:` containing CRLF both fail to introduce a header, an
attribute, or a line outside the intended one. (OWASP ASVS V5.3: output encoding at the
sink, not at the source.)

### SEC-2 — blocker — control characters in a path defeat both the line format and the denylist anchoring

- `blocker_id`: `security-reviewer:data-exposure:c6aabd22`
- `section_anchor`: `behaviors-11`
- **Category:** data-exposure

BEH-11's closing claim — "a denied path is never named in the manifest either" — is
**not entailed** by the spec's own rules once paths become line-oriented content.
BEH-10's manifest format is one `<rel>` per line. POSIX (and git) permit LF inside a
path component, and `neutralizeFenceTokens` rewrites only the two literal fence
prefixes, so it passes LF through untouched. The denylist regexes in
`context-pack.mjs` anchor on start-of-string or `/` (`/(^|\/)\.env($|[^/])/`,
`/(^|\/)id_[^/]*/`, `/(^|\/)secrets(\/|$)/`), so a file named `a.spec.md\n.env` matched
by `<charter-dir>/*.spec.md` is **not** denied, is admitted to the safe set, and renders
as **two** manifest lines — the second being the bare path `.env`.

BEH-13 then instructs the reviewer that manifest lines are "repository files the
reviewer is expected to read on demand", and the reviewer's `read-only` profile grants
unscoped `filesystem-read`. One hostile filename converts the manifest into a read
directive for a denylisted secret, and BEH-8 then persists the outcome into the dispatch
record. Rev 4 was not exposed to this: a body-inlining pack never treated a path as a
line of instruction-bearing content.

**Recommendation:** Add to BEH-14: a path containing any byte in `0x00`–`0x1F`
(explicitly LF/CR), a leading/trailing space, or a NUL is never emitted — it is dropped
with a `CONTEXT_PACK_UNSAFE_PATH` warning naming the offending path in escaped form,
exactly as the traversal guard drops `..`. Additionally require the denylist to be
evaluated **per path segment** (split on `/`, test each component) rather than against
the whole relative path, so no in-name delimiter can move a segment out of anchor
range. Add an AC: a file whose name embeds `\n.env` neither appears in a manifest nor
causes `.env` to appear on any manifest line.

### SEC-3 — warning — BEH-13 converts a bounded payload into an unbounded reviewer-discretionary read loop

**Category:** rate-limiting · **Section:** BEH-13

Under BEH-12 the caps now bound only the manifest text, so nothing bounds what the
reviewer pulls in response to it. On the 12-sibling charter the amendment measures, the
manifest names ~70 files; a reviewer that dutifully reads all of them re-creates the
very context overflow rev 4 bounded — except now the overflow is non-deterministic (it
depends on the model's read choices) and invisible to the renderer, so no
`role="truncation-notice"` and no `TARGET_SPEC_OVERSIZE` analogue fires. This is a
self-inflicted resource-exhaustion vector, and a charter with many large siblings
amplifies it.

**Recommendation:** Have BEH-13 state a read budget explicitly rather than leaving it
to model discretion: either name a per-reviewer read ceiling sourced from the profile's
existing `limits` block (ADR-0004) and require the prompt to state it, or rank the
manifest — emit sections in priority order and instruct the reviewer to read the first
N and Grep the remainder. Add an AC asserting the reviewer prompt names a bound, so
"read on demand" is not unbounded by omission.

### SEC-4 — suggestion — label the reported-reads set as unverified self-report

**Category:** data-exposure · **Section:** BEH-8

The reframing to auditability is complete and honest. The residual risk is downstream
misreading: a dispatch-record field named for "paths the reviewer reported reading"
invites a future consumer (hygiene, retro, a coverage gate) to treat a model
self-report as coverage evidence.

**Recommendation:** Have BEH-8 require the record to label the field as unverified
self-report (e.g. `reported_reads` with an explicit `verified: false` note in the
schema), and state that no gate may derive a verdict from it. Cheap now, expensive to
retrofit once a consumer depends on it.

### Security observations (not findings)

- **The unbounded target spec is not a new risk.** `dispatch-shape.mjs` already fences
  `ctx.targetSpecContent` with no cap at all — the caps never applied to the target spec
  in rev 4 either. BEH-12 documents and warns on a pre-existing unbounded input rather
  than removing a bound. SEC-3 is the live version of that concern.
- **Denylist reachability holds structurally.** The guard sits in Pass 1 (plan
  construction), which is delivery-independent, so a manifest emitted from the `safe`
  set inherits it. Worth *stating* in the spec that the manifest is emitted from the
  post-denylist / post-exclude / post-`realpath` set, so an implementer cannot build it
  from `matched`.
- **The AC set does not cover the project-override path.** This repo's own `review.yaml`
  pins all three reviewers to `context_pack: base`, which BEH-9 keeps at
  `delivery: inline`. Every AC in this amendment can pass while this repo's reviewers
  still receive the base pack only — the exact defect that starved this run's packs.

---

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL — 1 blocker, 8 warnings, 2 suggestions

### CON-1 — blocker — the 22k narrowing row asserts the inverse of BEH-12

- `blocker_id`: `consistency-analyzer:contract:0e9ae87e`
- `section_anchor`: `behaviors-narrowed-in-the-base-spec-and-rev-4`
- **Category:** contract

Two mutually exclusive statements about what the byte caps bound under
`delivery: manifest`:

- "Behaviors narrowed" table, **22k row**: "Under `delivery: manifest` the caps bound
  **the inlined portion only** (BEH-12)."
- **BEH-12**: "the target spec is inlined … **exempt from both `max_file_bytes` and
  `max_total_bytes`** … The caps bound **the manifest text only**."

Under manifest delivery the target spec **is** the only inlined portion, so the 22k row
says the caps bound exactly the thing BEH-12 exempts. The 22k row is verbatim leftover
from retired revision-1 BEH-6 ("they bound the inlined portion only (i.e. the target
spec plus the manifest text)"), which BEH-12 reversed; the table was not updated with
the behavior.

**Conflicts with:** internally, "Behaviors narrowed" (22k) vs BEH-12; and against
`configurable-reviewers-rev-4-context-pack-population.spec.md` 22k, whose two budgets
have exactly one referent each (file body / cumulative sections).

**Recommendation:** Reword the 22k row to match BEH-12: "Under `delivery: manifest` the
target spec is exempt from both caps; the caps bound the manifest text only." BEH-12 is
the normative statement and should not be restated in the rationale table in inverted
form.

### CON-2 — warning — no-omission guarantee leaves both caps without a referent

BEH-12 "The caps bound the manifest text only" vs BEH-10 "No file is omitted for budget
reasons", the Postconditions Delta "no matched non-denied file is unreachable", and the
22m row "nothing is omitted for budget reasons". If nothing may ever be dropped, then
`max_total_bytes` bounds nothing under manifest delivery — it has no enforcement action
left. `max_file_bytes` has no referent at all: the only inlined body is the exempt
target spec, so the 22l row's "so 22l never fires for it" understates the case (22l
never fires at all). Rev-4 22k/22l/22m define each cap by the action it takes on
overflow.

**Recommendation:** Either declare both caps inapplicable under `delivery: manifest`
(cleanest — manifest size is bounded by construction: one path per matched file), or
define the concrete overflow action and reconcile it with BEH-10's no-omission guarantee
and the 22m unreachability claim.

### CON-3 — warning — "five `base` consumers" is wrong and is baked into an AC

Independently confirms SA-7 and orchestrator verification. `validate.yaml` declares
`context_pack: base` on exactly **three** checks (L54, L69, L113). There is no implicit
defaulting to cover the gap: the file's own comment at L88 states the deterministic
checks carry "no `profile` and no `context_pack`". Only one of the three is a
constitution-compliance check; check-11 is visual verification under `browser-review`.
The "five" is stale from rev-4 22o, but rev 5 promotes it into a **countable acceptance
criterion**, so AC #4 cannot be satisfied as literally written.

**Recommendation:** Change "five" to "three" and name the three check ids in AC #4, or
state the count as "every `validate.yaml` check that declares `context_pack: base`".
Drop "constitution-compliance" as the collective characterization.

### CON-4 — warning — BEH-7 is neither live nor tombstoned

Independently confirms SA-8; orchestrator-verified against `git show 2843d516`.
Conflicts with `.context-index/specs/cross-cutting/spec-behavior-ids.spec.md` BEH-4 (a
retired ID is appended to `retired-behavior-ids`), BEH-3 (an in-place rewrite keeps its
ID), and the invariant "It never renumbers untouched behaviors." Revision 1's review
file cites BEH-7 five times; those citations now resolve to nothing — the exact
pathology that cross-cutting spec exists to prevent. Everything else is compliant.

**Recommendation:** Either restore the ID (rename BEH-13 → BEH-7, since the governed
condition is the same) or append `BEH-7` to the tombstone comment.

### CON-5 — warning — `PROFILE_CANNOT_CONSUME_MANIFEST` is governed by no live behavior

Independently confirms SA-5. The code appears in the Error Cases Delta, the Task Map row
"Profile capability check", a Preconditions Delta bullet, and an AC — but no live
behavior governs it. It is the only Task Map row citing no behavior ID. The phase is
left ambiguous ("Reject the reviewer at load" — which load?). The phase is feasible:
`loadReviewConfig` already merges `context_packs`
(`lib/governance/review-config.mjs:176`) and the base spec already runs a load-time
posture check (Behavior 11a) and fails load on unknown pack names (Behavior 20), so the
check belongs there — but that has to be stated.

**Recommendation:** Mint BEH-15 (above the retired maximum) stating the condition, the
phase (`loadReviewConfig`, alongside base Behavior 11a), and the resolution step that
makes `delivery` visible at load.

### CON-6 — warning — the named mechanism does not reach the attribute BEH-10 introduces

Independently confirms SEC-1 and SA-4. `fenceBlock` (L426-432) neutralizes only `body`;
`attrs` is interpolated raw. `neutralizeFenceTokens` is never applied to an attribute
anywhere today (`path="${unit.rel}"` L351 is also raw). So an implementer reusing the
named mechanism satisfies BEH-14 for the section body but not for the `title` attribute
BEH-10 introduces — and AC #6 (a directory **NAME** containing `<<<ADEV-PACK-…>>>`
cannot forge a manifest section or fence) then fails on the attribute channel.

**Recommendation:** State in BEH-14 that neutralization covers fence **attributes** as
well as bodies, and name the change to `fenceBlock` (sanitize `attrs`) rather than
implying the existing call is sufficient.

### CON-7 — warning — empty-include role collides with the existing `no-matches` emission

BEH-10: an include matching nothing "still emits its section with body `<no matches>`,
preserving 22g's guarantee"; AC #7: "**Every** manifest section is nonce-fenced with
`role="path-manifest"`". But `context-pack.mjs:298-303` already emits the empty-include
section as `path="${title ?? effectiveGlob}" role="no-matches"` — a different role, with
the title in the `path` attribute rather than a `title` attribute. Under a manifest pack
both descriptions apply to the same section and the spec does not say which wins, so
"no new grouping syntax / 22g's existing section mechanism" is **overstated**:
`role="path-manifest"` and `title=` are both additions to the emitted vocabulary
(existing roles: `no-matches`, `truncation-notice`, `target-spec`).

**Recommendation:** Say explicitly which role an empty include carries under
`delivery: manifest` (recommend keeping `role="no-matches"` so the existing code path
and its tests are untouched, and narrowing AC #7 to non-empty includes), and acknowledge
`title=` as a new attribute key rather than an existing one.

### CON-8 — warning — BEH-8's reported-reads clause has no reporting channel on either side

Independently confirms SA-6. The reviewer output contract is findings-only — base spec
Behaviors 36-37 and the three bundled prompts' Output Format sections — and
`buildReviewerDispatches` returns no dispatch-record field. BEH-8 is the amendment's
only auditability guarantee, so it cannot rest on an unspecified self-report.

**Recommendation:** Either extend BEH-13 to require the prompt to emit a `paths_read:`
block in the reviewer's output (and add it to the bundled prompts' Output Format), or
reduce BEH-8 to "manifest as issued" only and drop the read-set clause.

### CON-9 — warning — BEH-13 has no AC and no dispatch-stage enumeration

Rev-4 22i set the in-charter precedent for exactly this class of prompt-composition
change: "This applies to every dispatch stage, without exception: `subagent`, `runner`,
and `adapter`. … Fencing only the subagent branch would leave Defect 3 open on the
entire package path." `lib/governance/dispatch-shape.mjs` gives `runner` a non-empty
`contextPack: packRender.rendered` (L170) and `adapter` `""` (L183), so the runner also
receives a manifest and needs the framing. Separately, rev-4 22q is test-enforced
(`tests/governance/reviewer-prompt-inputs.test.mjs`) against each bundled prompt's
`## Input — You will receive:` list, which still promises delivered *content*; no Task
Map row or AC updates those lists or that test. (Both points were raised as CON-4/CON-5
on revision 1 and are unchanged.)

**Recommendation:** Add the 22i-style stage enumeration to BEH-13 (`subagent` +
`runner`; adapter exempt, consistent with its empty pack), add an AC for it, and add the
prompt files and `reviewer-prompt-inputs.test.mjs` to the Task Map.

### CON-10 — suggestion — new error codes break the module's `CONTEXT_PACK_*` naming convention

`INVALID_PACK_DELIVERY` and `TARGET_SPEC_OVERSIZE` are both raised from the
pack-rendering module, which names every code it emits `CONTEXT_PACK_*`
(`CONTEXT_PACK_CYCLE`, `_NO_TARGET`, `_TRAVERSAL`, `_DENYLIST`, `_DENYLIST_SKIP`,
`_DENYLIST_MATCH`, `_ESCAPE`, `_READ`, `_OVERRIDE`, `_FENCE_COLLISION`; sole exception
`UNKNOWN_CONTEXT_PACK`). Codes are matched by exact string in tests and by the
aggregator.

**Recommendation:** Rename to `CONTEXT_PACK_INVALID_DELIVERY` and
`CONTEXT_PACK_TARGET_SPEC_OVERSIZE`. Also note BEH-9 calls an unrecognised `delivery`
"a load error" while `resolveExtends`/`renderPack` return errors at render time; say
which.

### CON-11 — suggestion — BEH-11 corrects rev-4 22p-bis rather than retaining it verbatim

Rev-4 22p-bis's behavior text defines **two** cases (bundled-wildcard skip vs enumerated
hard error), and its Error Cases row conflates the two codes for the single enumerated
case: "Hard error, unchanged `CONTEXT_PACK_DENYLIST` / `CONTEXT_PACK_DENYLIST_MATCH`".
BEH-11's three-way mapping is what `lib/governance/context-pack.mjs` actually implements
(`isDenied(glob)` → `CONTEXT_PACK_DENYLIST` L242-247; wildcard match → `_SKIP` warning
L279-284; enumerated match → `_MATCH` error L286-290). BEH-11 therefore **corrects** rev
4 rather than retaining it verbatim.

**Recommendation:** Say so: "22p-bis's split, disambiguated to the three codes the
implementation already emits (rev 4's Error Cases row conflated `CONTEXT_PACK_DENYLIST`
with `CONTEXT_PACK_DENYLIST_MATCH`)." This is a strict improvement; claiming verbatim
retention hides it from test authors.

### Verified clean — no finding

- **BEH-11 denylist codes/severities/triggers:** all three match
  `lib/governance/context-pack.mjs` exactly. Grep confirms **no** revision-1 invented
  code survives anywhere in the amendment. Denylist pattern list matches
  `DENYLIST_PATTERNS`.
- **BEH-9 inheritance:** `resolveExtends` (L114-124) takes the nearest declaration, so
  `review-base: manifest` propagates to the three reviewer packs and `base: inline`
  stays isolated. The mechanical claim holds.
- **BEH-10 title fallback:** `normalizeInclude` (L434-444) does yield `title: null`, so
  the fallback is reachable.
- **`CONTEXT_PACK_FENCE_COLLISION`** is pre-existing and is a *warning* (L364-369);
  BEH-14 uses it at the same severity and semantics.
- **BEH-1 arithmetic:** 55 `.md` / 18 `.spec.md` in `.context-index/specs/cross-cutting/`
  — confirmed.
- **BEH-8 reproducibility sweep:** no Postcondition or AC claims reproducibility or
  replay-equivalence. Rev-4 22n's reproducibility claim is scoped to `renderPack` output
  and is unaffected.
- **Denylist-in-profile scope-out:** `templates/governance/profiles.yaml` confirms
  `read-only` grants `filesystem-read` + `search` with no path scoping, and all three
  `reviewer-*` profiles extend it. Not reopened.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the
> header, computed from post-cap findings across all reviewers via
> `computeVerdict(findings, verdictRules)` with `blocker_threshold: 1`. All three
> reviewers carry `severity_cap: blocker`, so no finding was demoted.

## Summary

**Total findings:** 24 (5 blockers, 15 warnings, 4 suggestions)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | FAIL | 2 | 6 | 1 |
| security-reviewer | FAIL | 2 | 1 | 1 |
| consistency-analyzer | FAIL | 1 | 8 | 2 |

**Blockers, in the order they should be addressed** (the first three are one cluster —
fixing the attrs channel resolves SEC-1, SA-4 and CON-6 together):

1. **SEC-1** — extend BEH-14 to fence-header attribute values; move escaping inside
   `fenceBlock`.
2. **SEC-2** — reject control characters in emitted paths; evaluate the denylist per
   path segment.
3. **SA-1** — assign ownership of target-spec inlining (`renderPack` vs
   `buildReviewerDispatches`) and reconcile with `review-base`'s
   `exclude: ["<target-spec>"]`.
4. **SA-2** — resolve the manifest-text cap contradiction: exempt manifest sections, or
   define the overflow action.
5. **CON-1** — reword the 22k narrowing row to match BEH-12 (one line).

**Cross-reviewer convergence is the strongest signal in this review.** Three
independent reviewers, each reading the implementation directly, landed on the same
`fenceBlock` attrs gap (SEC-1 / SA-4 / CON-6); two landed independently on the
five-vs-three `validate.yaml` count (SA-7 / CON-3), the missing BEH-7 tombstone (SA-8 /
CON-4), the ungoverned `PROFILE_CANNOT_CONSUME_MANIFEST` (SA-5 / CON-5), and BEH-8's
absent reporting channel (SA-6 / CON-8). All were verified by the orchestrator against
source before being recorded.

**Action required:** Run `/adev:specify --revise` against the `.blockers.md` sidecar to
produce revision 3, then re-review. Three of the five blockers (SEC-1, SA-2, CON-1) are
narrow, well-localized edits; SEC-2 and SA-1 require a design decision.

**Not reopened, and correctly scoped out by the spec:** moving the denylist into the
profile's filesystem read policy. All three reviewers independently verified
`templates/governance/profiles.yaml` and confirmed the spec's reasoning — `read-only`
grants unscoped `filesystem-read` + `search`, so reviewer read-scoping belongs to the
profile contract, not the pack contract.

**Transition gate:** `risk_level: medium` → `full` tier. No `spec-to-plan`
`approver_role` is owed for this risk level; no HITL approval gate applies.

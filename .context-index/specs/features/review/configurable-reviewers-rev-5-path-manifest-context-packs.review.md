---
spec: .context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md
charter: .context-index/specs/features/review/charter.md
verdict: BLOCK
rigor-tier: full
reviewed: 2026-08-17
last-reviewed-revision: 1
file-sha: 327b4d93ac47a5a4c073496ed66d0901312798705e9f7ee8c4da7e17396f8f24
---

# Architecture Review: configurable-reviewers-rev-5-path-manifest-context-packs.spec

> **Date:** 2026-08-17
> **Spec:** .context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md
> **Charter:** .context-index/specs/features/review/charter.md
> **Rigor tier:** full (explicit `--tier full`; `risk_level: medium` → `review_mode: full`, `require_hitl_approval: false`)
> **Verdict:** BLOCK

## Registry Notes

Reviewer set from `adev governance reviewers` (project's materialized
`.context-index/governance/review.yaml`) — three reviewers, all `dispatch: always`,
all `severity_cap: blocker` (no demotions applied).

Loader warnings surfaced (unrelated to this spec, profile-level):

| Code | Message |
|---|---|
| `BROADEN_TOOL` | Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'. |
| `BROADEN_TOOL` | Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'. |
| `BROADEN_NETWORK` | Profile 'browser-review': network broadened 'deny' → 'read-only'. |

Render warnings from `buildReviewerDispatches` (one per reviewer, same cause):

| Code | Message |
|---|---|
| `CONTEXT_PACK_FENCE_COLLISION` | Target spec contains a literal pack fence token — neutralized. |

That collision is expected and benign: the spec's own prose quotes the
`<<<ADEV-PACK-<nonce> …>>>` fence form, and rev-4 behavior 22h neutralized it.
It is recorded here because the spec's Acceptance Criteria assert exactly this
property, and this run exercised it live.

**Thin-pack caveat (material to how this review was conducted).** On this branch
`.context-index/governance/review.yaml` pins all three reviewers to
`context_pack: base`, which delivers only `constitution.md` +
`platform-context.yaml` (9160 bytes rendered, identical for all three). No parent
charter, no sibling specs, no ADRs, no `risk-policies.yaml` / `gates.yaml`, no
cross-cutting specs reached any reviewer through its pack — i.e. this review ran
inside the exact defect the spec under review exists to fix. Each reviewer was
therefore directed to read the base spec, the rev-4 amendment, the charter, the
ADRs, the governance files and the relevant `lib/` and `templates/` sources
directly via its `filesystem-read` + `search` grants. All three did. This is
itself first-hand evidence for the spec's premise, and it is also the mechanism
BEH-3/BEH-7 propose to make the default.

No `spec-to-plan` transition is declared in `gates.yaml` (the block is
commented out), so no `approver_role` applies to this gate.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** FAIL

### SA-1 — blocker

- **blocker_id:** `structural-architect:shared-consumer-blast-radius:3495680b`
- **section_anchor:** `behavioral-delta-beh-3`
- **Location:** Behavioral Delta / BEH-2, BEH-3; `retired-behavior-ids: (none)`

BEH-2/BEH-3 are stated on `renderPack` unconditionally ("When a pack is
rendered"), but `lib/governance/context-pack.mjs` is shared with
configurable-checks, and rev-4 Behavior 22o made `base` deliberately
target-agnostic and deliberately widened it to constitution + platform-context
for five checks in `templates/domains/software/validate.yaml` ("those checks are
constitution-compliance checks and were equally starved"). Under BEH-2 a pack
rendered with no `targetSpecPath` has nothing to inline, so `base` degenerates to
two path strings — reversing 22o's stated intended direction.
`retired-behavior-ids: (none)` therefore under-declares: 22o's postcondition and
22m (see SA-7) cannot both survive. Not hypothetical: this repo's materialized
`review.yaml` pins all three reviewers to `context_pack: base`, so under BEH-3 the
live review path would deliver zero inlined context beyond the target spec.

**Recommendation:** Scope the delivery-model change explicitly (e.g. reviewer-
dispatched packs only, or a per-pack `delivery: inline|manifest` declaration
resolved through `resolveExtends`), state the blast radius on the check-consumer
family as 22o did, and list the base-spec/rev-4 behaviors this amendment retires
or narrows.

### SA-2 — blocker

- **blocker_id:** `structural-architect:contradictory-contract:e3daf2a8`
- **section_anchor:** `error-cases-delta`
- **Location:** Error Cases Delta row `TARGET_SPEC_OVERSIZE` vs BEH-2, BEH-6, AC #4

BEH-2 says the target spec "is inlined in full, never subject to
`max_file_bytes`" and "must be byte-exact"; AC #4 restates that. BEH-6 says the
caps bound "the inlined portion only (i.e. the target spec plus the manifest
text)", and the error row says that when the target spec exceeds
`max_total_bytes` it is "truncate[d] per 22l". These cannot all hold: an
implementer cannot produce a byte-exact artifact that is also truncated. The row
also invokes the wrong mechanism — 22l is the per-file cap path
(`max_file_bytes`) that BEH-2 explicitly exempts, while the trigger named is
`max_total_bytes`.

**Recommendation:** Pick one semantic and make the other consistent: either the
target spec is exempt from both caps and `TARGET_SPEC_OVERSIZE` is a pure warning
with no truncation, or it is truncatable and BEH-2/AC #4 drop "in full /
byte-exact". Name the cap that actually gates it.

### SA-3 — blocker

- **blocker_id:** `structural-architect:undefined-output-contract:05edd24d`
- **section_anchor:** `behavioral-delta-beh-3`
- **Location:** BEH-3 (manifest shape), AC #5, BEH-7

The manifest is the amendment's primary new output, but its shape is undefined:
(a) it is not stated whether manifest text sits inside a nonce fence — and rev-4's
22j preamble (emitted verbatim by `dispatch-shape.mjs:110`) tells the reviewer
that anything not inside a nonce fence is untrusted data, never instructions,
which directly contradicts BEH-7's instruction to act on the paths; (b) no
group-header syntax is specified, so AC #5 ("cannot forge a manifest group") is
unfalsifiable — there is nothing to forge against; (c) grouping is "under its
include's `title`", but `normalizeInclude` yields `title: null` for string-form
includes and today `title` is only ever emitted in the `role="no-matches"`
attrs, and no fallback (glob? omit group?) is given.

**Recommendation:** Specify the manifest's rendered form concretely — fence +
`role` attribute, group-header form, and the `title`-absent fallback — so BEH-7's
instruction and 22j's provenance rule agree and AC #5 is testable.

### SA-4 — warning

- **blocker_id:** `structural-architect:ownership-ambiguity:177e2d83`
- **section_anchor:** `behavioral-delta-beh-2`

BEH-2 assigns target-spec inlining to `renderPack` ("when a pack is rendered"),
but that responsibility currently lives in `buildReviewerDispatches`
(`specBlock`, rev-4 22i), and `review-base` deliberately excludes
`<target-spec>` from sibling globs so it is not shipped twice. As written, BEH-2
either duplicates the target spec in every prompt or silently relocates ownership
across the module boundary. The semantics of `renderPack`'s returned `files[]`
are also left undefined (inlined set vs manifest set), yet rev-4 AC ("three
distinct `files` arrays per reviewer") depends on it.

**Recommendation:** State which component owns the inlined target spec, that it
appears exactly once in the assembled prompt, and what `files[]` / a new manifest
field now mean to callers (including `dispatch-shape.mjs` and BEH-8's record).

### SA-5 — warning

- **blocker_id:** `structural-architect:malformed-precondition:6552e5b5`
- **section_anchor:** `preconditions-delta`

The precondition / `PROFILE_CANNOT_CONSUME_MANIFEST` pair mixes phases: the
trigger is "while its pack yields manifest entries", which is render-time
knowledge (needs `targetSpecPath` + glob expansion), yet the remedy is rejection
"at load", where base Behavior 11a's read-only check runs. It is also unclear
whether "reject the reviewer" means fail the whole config load (base 11a's
semantics for every other profile defect) or drop that one reviewer — the latter
silently produces a thinner review, the exact failure this amendment exists to
prevent, and interacts with the base error case "All reviewers disabled".

**Recommendation:** Make it a load-time check on the profile's granted categories
independent of match results (any manifest-capable pack ⇒ requires
`filesystem-read` + `search`), and say explicitly whether it fails load or drops
the reviewer. Note the check is non-redundant with 11a (11a constrains
write/shell, never requires read grants) — worth stating.

### SA-6 — warning

- **blocker_id:** `structural-architect:overstated-guarantee:674d5bf7`
- **section_anchor:** `behavioral-delta-beh-8`

BEH-8 claims "the record is what preserves reproducibility". It does not: the
dispatched prompt stays deterministic (BEH-5), but the effective context becomes
a per-run function of reviewer behavior; a record makes that auditable after the
fact, it does not restore it. The behavior also names no source of truth for "the
set of manifest paths the reviewer actually read" — harness tool-call log vs
reviewer self-report — and those have opposite trust properties (self-report comes
from the same agent whose thinness is being audited). No record schema or owning
module is named, though a dispatch record is referenced by base Behavior 33 and
execution-profiles 22a.

**Recommendation:** Reword the claim as auditability, not reproducibility, and
name the read-set's source and record field. If self-report is the only available
source, say so and note it is unverified.

### SA-7 — warning

- **blocker_id:** `structural-architect:marker-contract-drift:7f72518c`
- **section_anchor:** `postconditions-delta`

"`role="truncation-notice"` sections still appear if and only if the inlined
portion is itself truncated, preserving 22l/22m's marker contract verbatim"
misstates the existing contract. In rev-4/implementation, per-file truncation
(22l) emits an inline `…[adev: truncated …]` string inside the file's own fence
and never a `role="truncation-notice"` section; the role section exists only for
22m's omitted-file aggregate. Since BEH-3 omits nothing, the 22m section becomes
unreachable for manifest packs — a de facto retirement not declared in
`retired-behavior-ids`.

**Recommendation:** Separate the two markers explicitly and declare 22m's status
(retired, or retained only for the inlined-portion overflow case) with its own
condition.

### SA-8 — warning

- **blocker_id:** `structural-architect:coverage-gap:e8b5684d`
- **section_anchor:** `actionable-task-map`

Rev-4 Behavior 22q is a live MUST: every item a bundled prompt's `## Input — You
will receive:` section names must be present in the resolved pack, and rev-4's
reconciliation direction was "trim the prompt to what the pack can deliver".
Under a manifest the reviewer receives a path, not the charter/ADRs the prompt
says it will receive, yet no task or acceptance criterion reconciles the three
bundled prompts' `## Input` wording (or the structural prompt's ADR-compliance
scope, which presumes ADR bodies) with manifest delivery. BEH-7 covers framing
generically but is not mapped to 22q.

**Recommendation:** Add a task and a criterion that restate 22q for manifest
delivery ("named as a manifest path" satisfies it) and update the bundled prompts
accordingly.

### SA-9 — warning

- **blocker_id:** `structural-architect:incomplete-remediation:5aec33dd`
- **section_anchor:** `actionable-task-map`

BEH-1's task touches only `templates/review-specs/defaults.yaml`.
`templates/domains/software/reviewers.yaml` is the materialize source, and an
already-materialized `.context-index/governance/review.yaml` is write-once and
stamped — this repo's copy still pins `context_pack: base`, so neither BEH-1 nor
rev-4's 22p packs reach it (which is why this review itself received a base-only
pack). No task or criterion covers re-materialization/migration, so the measured
defect could remain observable after the amendment is fully implemented.

**Recommendation:** Either add a migration/re-materialization task and criterion,
or state explicitly that stale materialized registries are out of scope and owned
elsewhere.

### SA-10 — suggestion

- **blocker_id:** `structural-architect:missing-dependency-declaration:fffe6ff8`
- **section_anchor:** `amendment-frontmatter`

Frontmatter `amends` / `target-revision: 5` is coherent with rev-4's convention
(`target-revision: 4` against base `revision: 3`), and `BEH-N` does not collide
with base `1–39` or rev-4 `22a–22r`. Two gaps: no `depends-on` (rev-4 lists the
ADRs and cross-cutting spec it builds on) even though this amendment is
unintelligible without rev-4 — the very thinness it fixes; and the two new rules
(`PROFILE_CANNOT_CONSUME_MANIFEST`, `TARGET_SPEC_OVERSIZE`) exist only as table
rows with no behavior ID for tests to cite.

**Recommendation:** Add `depends-on` (rev-4 amendment, ADR-0004) and promote the
two error rules to numbered behaviors.

### Assessed sound (no finding)

BEH-1's necessity and its independence claim hold — the glob genuinely
over-matches 55 → 18, the one bare non-sidecar file
(`lifecycle-gate-validation.md`) is a validation report, not a spec, and the
simulated `OMITTED 13/32` result plus AC #2's zero-omission requirement mean BEH-1
alone cannot satisfy the contract. The denylist-premise correction is accurate
against `templates/governance/profiles.yaml` (`read-only` grants
`filesystem-read` + `search` with no path scoping). BEH-5's determinism rule
matches 22n and the existing byte-order sort.

## Security Reviewer (security-reviewer)

**Verdict:** FAIL

### SEC-1 — blocker

- **blocker_id:** `security-reviewer:manifest-path-injection:6f2a3dee`
- **section_anchor:** `behaviors-3`
- **Category:** input-validation

BEH-3 replaces inlined file bodies with a plain path listing but never states
that manifest entries are nonce-fenced or that path/filename text is passed
through `neutralizeFenceTokens`, unlike every other pack section (22g: "every
rendered section is delimited by fences"; 22h neutralizes literal fence tokens in
bodies; even today's `attrs: path="${...}"` for no-matches sections is
unescaped). Under BEH-3 paths become the sole channel for non-target-spec
content, and the target-spec author — the one actor this nonce scheme exists to
distrust — controls the inputs that populate that channel: `<charter-dir>`
expands from the directory the author commits the target spec into, and any
sibling file the author co-commits in the same PR is picked up verbatim by the
`*.spec.md` / `*.md` globs. A crafted directory or filename (e.g. containing a
literal `<<<ADEV-PACK-…>>>` or `=== Title ===` sequence) is emitted unescaped
into the manifest text, forging a delimiter or fake section with no mitigation.
The amendment's own Acceptance Criterion ("A file body containing `=== foo ===` …
cannot forge a manifest group or a fence") tests file body forgery — moot under
BEH-3 since bodies are never inlined — and leaves the actual new attack surface
(paths) untested.

**Recommendation:** Add a behavior requiring (a) each manifest group/section to
be wrapped in the same per-run nonce fence as every other pack section, and (b)
every path string inserted into the manifest to pass through
`neutralizeFenceTokens` (or equivalent) before emission, exactly as file bodies
do today. Replace the body-forgery acceptance criterion with one asserting that a
file or directory name containing `=== foo ===` or `<<<ADEV-PACK-…>>>` cannot
forge a manifest group or fence when only its path (not body) is rendered. This
is OWASP LLM01 territory: any untrusted string concatenated into a
system-authored prompt needs the same escaping discipline regardless of whether
it is "content" or "metadata".

### SEC-2 — warning

- **blocker_id:** (not emitted — non-blocker finding)
- **section_anchor:** `behaviors-4`
- **Category:** secrets

Confirmed accurate: `read-only` (and all `reviewer-*` profiles) grant
`filesystem-read` / `search` with no path scoping, and rev-4's 22m explicitly
relies on that for Glob/Grep recovery — so the scoping-out decision's premise
holds, and moving from inlined bytes to named paths does not newly expose secret
content (denylisted paths are omitted from the manifest under BEH-4 either way).
However, the Error Cases Delta row ("a resolved manifest entry matches the
denylist → omit + warn, `CONTEXT_PACK_DENIED_PATH`") flattens rev-4 Behavior
22p-bis, under which an enumerated (non-wildcard) include resolving to a
denylisted path — e.g. via a symlink pointed at a secret — is a hard load failure
(`CONTEXT_PACK_DENYLIST_MATCH`), while only wildcard sweeps get the soft
warn-and-skip. BEH-4 as written would silently downgrade the
symlink-evasion-via-enumerated-include case from "review aborts, forces human
attention" to "one warning, review proceeds".

**Recommendation:** Explicitly reconcile BEH-4 with 22p-bis: state whether the
enumerated/wildcard hard-fail split is preserved under the manifest model, and if
so add the corresponding row back to the Error Cases Delta (enumerated match →
hard error, unchanged) rather than letting the flattened table read as the
complete contract.

### SEC-3 — warning

- **blocker_id:** (not emitted — non-blocker finding)
- **section_anchor:** `behaviors-8`
- **Category:** data-exposure

BEH-8's dispatch-record scope is "the set of manifest paths the reviewer actually
read" — by construction this can never include a denylisted or non-manifest path
the reviewer discovers on its own via Glob/Grep (a capability every reviewer
profile already has). That is precisely the containment-escape scenario an
auditor most needs visibility into, and it is invisible under the stated scope.
Separately, BEH-8 claims the record "preserves reproducibility", but recording a
bare path (not a content hash or snapshot) does not reproduce what the reviewer
saw if the file is edited between the review and a later audit — repository files
are mutable, unlike the byte-exact inlined pack this replaces.

**Recommendation:** Broaden BEH-8 to capture every file-read tool invocation
during the reviewer run (not just manifest-path hits), flagging any read outside
the issued manifest as a distinct auditable event. If full tool-call capture is
out of scope, at minimum record a content hash (or mtime / git blob sha) alongside
each manifest path actually read, so "reproducibility" is verifiable rather than
assumed.

### Assessed sound (no finding)

`PROFILE_CANNOT_CONSUME_MANIFEST` is a genuine fail-safe for custom or
misconfigured reviewer profiles, not theatre — bundled profiles already satisfy
it, but it correctly rejects a hypothetical restrictive custom profile rather
than silently dispatching with unreadable paths. Titles used for manifest
grouping are operator-authored YAML config, not content-derived, so not
forgeable. BEH-6 budget re-scoping has no security implication; manifest text is
small.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

### CON-1 — blocker

- **blocker_id:** `consistency-analyzer:contract:7e24783f`
- **section_anchor:** `error-cases-delta`
- **Category:** contract

**This spec:** BEH-4 and its Error Cases Delta state "An include glob matches a
denylisted path → Fail load … `CONTEXT_PACK_DENIED_GLOB`" and "A resolved
manifest entry matches the denylist → Omit the path … emit one warning …
`CONTEXT_PACK_DENIED_PATH` (warning)."

**Conflicts with:** `configurable-reviewers-rev-4-context-pack-population.spec.md`
Behavior 22p-bis establishes a three-way split, implemented verbatim in
`lib/governance/context-pack.mjs` (`CONTEXT_PACK_DENYLIST` for a glob whose
literal pattern is denied; `CONTEXT_PACK_DENYLIST_SKIP` — warning — only when the
match came through a wildcard include; `CONTEXT_PACK_DENYLIST_MATCH` — hard error
— when the match came through an enumerated include, because "naming a secret
file directly is an authoring mistake that must fail loudly"). Rev-5's two new
codes appear nowhere else in the repo (verified by grep: only this spec file) and
collapse the enumerated-path case from a hard error to a warning, silently
reversing 22p-bis's stated security rationale without acknowledging the change.

**Recommendation:** Either (a) rename to reuse the existing three codes and
preserve the wildcard/enumerated split for manifest entries too (an enumerated
include still fails hard; a wildcard match still skip-warns), or (b) if the split
is intentionally being collapsed now that bodies are never inlined, say so
explicitly and justify why an author naming a secret path directly should now only
warn.

### CON-2 — blocker

- **blocker_id:** `consistency-analyzer:contract:a2e26104`
- **section_anchor:** `postconditions-delta`
- **Category:** contract

**This spec:** BEH-2 ("inlined in full, never subject to `max_file_bytes` … must
be byte-exact"), the Error Cases Delta `TARGET_SPEC_OVERSIZE` row ("Truncate per
22l and emit the existing per-file marker"), and the Postconditions Delta
("`role="truncation-notice"` sections still appear if and only if the inlined
portion is itself truncated, preserving 22l/22m's marker contract verbatim").

**Conflicts with:** Internally inconsistent within this same amendment, and
against rev-4's own vocabulary at Behaviors 22l/22m: 22l's marker is appended
inside the file's own fence (no `role` attribute); `role="truncation-notice"` is
defined only by 22m, exclusively for the separate aggregate omitted-files notice.
Rev-5 asserts the target spec is unconditionally "byte-exact" and "never
truncated", then describes an oversize path that truncates it via 22l's mechanism
but labels the resulting marker with 22m's `role` attribute — a case 22m never
covered (nothing is omitted; one file is truncated).

**Recommendation:** State explicitly in BEH-2 that byte-exactness holds except
when the target spec alone exceeds `max_total_bytes`, and specify which literal
marker form applies (22l's inline marker, with no `role` attribute — or a new,
named third marker kind if the intent is genuinely different from both 22l and
22m).

### CON-3 — warning

- **blocker_id:** (not emitted — non-blocker finding)
- **section_anchor:** `behaviors-3`
- **Category:** pattern

BEH-3 states "No file is omitted for budget reasons, so `renderPack` emits no
`role="truncation-notice"` section for manifest entries", while the amendment's
HTML comment reads `<!-- retired-behavior-ids: (none) -->`. Rev-4's Behavior 22m
defines the omitted-file aggregate-notice mechanism this sentence describes as
no-longer-firing for ordinary includes. If 22m's core purpose (listing omitted
files) can never trigger anymore outside the target-spec-oversize edge case (see
CON-2), it is effectively dead for the case it was designed for, yet nothing in
the amendment states whether 22m is retired, redefined, or left as inert legacy
behavior.

**Recommendation:** Either add `22m` to `retired-behavior-ids` (if its
omission-listing role is fully superseded) or state explicitly that 22m survives
only for the target-spec-oversize edge case and no longer for manifest-entry
omission.

### CON-4 — warning

- **blocker_id:** (not emitted — non-blocker finding)
- **section_anchor:** `acceptance-criteria`
- **Category:** pattern

The Acceptance Criteria checklist has one item per behavior/error case for BEH-1
through BEH-6 and BEH-8, plus the Error Cases, but no item verifies BEH-7
(reviewer prompt states manifest paths must be read and names read tools). Rev-4's
own 22q was enforced by a dedicated test,
`tests/governance/reviewer-prompt-inputs.test.mjs`; rev-5's Actionable Task Map
names only "Prompt/preamble update (BEH-7)" and never mentions updating that test
or the three bundled prompts' `## Input — You will receive:` sections that 22q
established — sections which currently promise reviewers they will "receive"
categories (sibling specs, ADRs, cross-cutting specs) that BEH-3 no longer
delivers as content, only as manifest paths.

**Recommendation:** Add an Acceptance Criterion for BEH-7 (e.g. "each bundled
prompt's Input section is rephrased to state paths are manifested, not delivered,
and `reviewer-prompt-inputs.test.mjs` is updated to assert against manifest
entries rather than inlined content"), and add the prompt-file and test updates to
the Actionable Task Map.

### CON-5 — warning

- **blocker_id:** (not emitted — non-blocker finding)
- **section_anchor:** `behaviors-7`
- **Category:** pattern

BEH-7 says "When a reviewer is dispatched with a path manifest then the prompt
states that manifest paths are repository files the reviewer is expected to read
on demand…". Rev-4 Behavior 22i, addressing the structurally identical problem (a
prompt-composition change that must reach every dispatch stage), explicitly
states: "This applies to every dispatch stage, without exception: `subagent`,
`runner`, and `adapter`. … Fencing only the subagent branch would leave Defect 3
open on the entire package path." BEH-7 carries no equivalent callout, even though
`lib/governance/dispatch-shape.mjs` shows the `runner` stage also receives a
non-empty `contextPack` (only `adapter` gets `contextPack: ""`), so a
package-mode runner would also receive a path manifest needing the same "read this
on demand" framing.

**Recommendation:** Add the same explicit multi-stage statement to BEH-7 that 22i
used, naming `subagent` and `runner` (adapter exempt, consistent with its empty
context pack).

### CON-6 — suggestion

- **blocker_id:** (not emitted — non-blocker finding)
- **section_anchor:** `amendment-frontmatter`
- **Category:** pattern

Rev-5's frontmatter contains no `source-manifest` and no `depends-on`. Both the
base spec and rev-4 carry `source-manifest: { files: [...], computed-at }` (rev-4
also carries a `sha`) and `depends-on` listing the relevant ADRs / cross-cutting
specs. Without `source-manifest`, this amendment's own touched files
(`lib/governance/context-pack.mjs`, `lib/governance/dispatch-shape.mjs`,
`templates/review-specs/defaults.yaml`, `skills/review-specs/SKILL.md`, the three
prompt files) are absent from drift detection (`hasDrift`).

**Recommendation:** Add `source-manifest` naming the files this amendment's
Actionable Task Map touches, and `depends-on` referencing at minimum
`execution-profiles.spec.md` (the `PROFILE_CANNOT_CONSUME_MANIFEST` rule depends
on its profile-capability contract).

### CON-7 — suggestion

- **blocker_id:** (not emitted — non-blocker finding)
- **section_anchor:** `behaviors-8`
- **Category:** contract

BEH-8 says "the dispatch record captures the manifest as issued and the set of
manifest paths the reviewer actually read", but no file in the repository defines
"the dispatch record" as a concrete, schema-owning artifact — it is referenced
only in prose across `execution-profiles.spec.md` (§36, as an audited redaction
channel), `configurable-checks.spec.md`, `configurable-reviewers.spec.md`,
`lib/governance/review-config.mjs`, and `skills/review-specs/SKILL.md`, none of
which define its full field set or where it is persisted;
`buildReviewerDispatches`'s returned struct has no such field today.

**Recommendation:** Not a blocker to review, but the amendment (or its plan)
should name where the dispatch record concretely lives (a new field on the
existing dispatch struct? a separate write?) rather than treating it as an
already-defined mechanism being merely extended.

### Verified factual claims

The Consistency Analyzer confirmed the spec's cross-cutting inventory by direct
directory listing (55 `.md`, 18 `.spec.md`, 37 sidecars in the stated
`.review.md` / `.plan.md` / `.validate.md` / `.blockers.md` breakdown plus one
bare `lifecycle-gate-validation.md`), and confirmed the `OMITTED 49/69` figure
agrees between the measurement table and the glob-narrowing simulation.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in
> the header above, computed from post-cap findings across all reviewers — PASS
> (zero warnings/blockers), PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK
> (>= `verdict_rules.blocker_threshold` blockers, default 1). See
> `configurable-reviewers.spec.md` behaviors 37-38.

## Summary

**Total findings:** 20 (6 blockers, 11 warnings, 3 suggestions)

All three specialists returned FAIL. The blockers cluster into three independent
defects, each raised by more than one reviewer where their scopes overlap:

1. **Unscoped delivery-model change (SA-1).** BEH-2/BEH-3 are written as
   unconditional `renderPack` behavior, but `renderPack` is shared with
   configurable-checks and rev-4's 22o deliberately widened the target-agnostic
   `base` pack for five constitution-compliance checks. A manifest-only `base`
   with no `targetSpecPath` inlines nothing, reversing 22o. Undeclared retirements
   compound this (`retired-behavior-ids: (none)`).
2. **Target spec both byte-exact and truncatable (SA-2, CON-2).** BEH-2 + AC #4
   guarantee byte-exactness; the `TARGET_SPEC_OVERSIZE` row truncates via 22l;
   the Postconditions Delta labels the result with 22m's
   `role="truncation-notice"`, which 22m never covered. Three statements, no
   consistent reading, and the wrong cap named.
3. **Manifest output shape undefined, and its new injection surface untested
   (SA-3, SEC-1).** The manifest is the amendment's primary new output but has no
   specified rendered form: no statement of whether it is nonce-fenced (which
   collides with 22j's provenance rule that unfenced text is never actionable), no
   group-header syntax, no `title: null` fallback, and no requirement that path
   strings pass through `neutralizeFenceTokens`. The acceptance criterion that
   would have caught this tests *file body* forgery, which is moot once bodies are
   never inlined.
4. **Denylist severity silently flattened (CON-1, SEC-2).** BEH-4's two new error
   codes exist nowhere else in the repo and collapse rev-4's 22p-bis three-way
   split, downgrading an enumerated include resolving to a secret (the
   symlink-evasion case) from hard load failure to a warning.

On the four points this review was specifically asked to scrutinize:

- **BEH-1 alone is genuinely insufficient** — confirmed independently by the
  Structural Architect and the Consistency Analyzer against AC #2's zero-omission
  requirement. The glob narrowing is correct and necessary but not sufficient; the
  `55 → 18` and `OMITTED 49/69 → 13/32` figures were verified, not merely
  restated.
- **The denylist scoping-out decision is sound on its premise.** `read-only`
  really does grant `filesystem-read` + `search` with no path scoping, all three
  reviewer profiles extend it, and rev-4's 22m really does depend on that. Moving
  from bodies to paths exposes no secret content that was previously contained.
  What BEH-4 does *not* preserve is 22p-bis's severity split — that is the
  finding, not the scoping decision itself.
- **BEH-8 is insufficient as written** to preserve reproducibility, and both
  SA-6 and SEC-3 say so for different reasons: it names no source of truth for the
  read set (self-report vs harness log have opposite trust properties), it cannot
  see reads *outside* the manifest — which is the case an auditor most needs — and
  a bare path without a content hash does not reproduce what the reviewer saw.
  The spec's own wording ("the record is what preserves reproducibility") should
  be downgraded to auditability.
- **Preserving 22k/22l/22m/22n verbatim is NOT consistent with BEH-6** as
  currently written. This is blocker #2 above, plus SA-7/CON-3 on 22m becoming
  unreachable for manifest packs without being declared retired.

**Method note:** this review ran with `context_pack: base` for all three
reviewers (9160 bytes: constitution + platform-context only). Every reviewer
reached the base spec, the rev-4 amendment, the ADRs, the governance files and the
implementing `lib/` sources by reading them directly under its own
`filesystem-read` / `search` grants — the exact mechanism BEH-3/BEH-7 propose to
make the default, and first-hand evidence that the mechanism works when a reviewer
is told to use it. It is also why BEH-7's completeness (CON-5, SA-8) is not a
cosmetic concern: this run only worked because the dispatch prompt explicitly
enumerated what to read.

**Action required:** Run `/adev:specify --revise` against
`.context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md`
to produce revision 2 addressing the six blockers in
`configurable-reviewers-rev-5-path-manifest-context-packs.blockers.md`, then
re-run `/adev:review-specs`. Planning is gated until the consolidated verdict is
PASS or PASS_WITH_NOTES.

> **Gate note:** `gates.yaml` declares no `spec-to-plan` transition (the block is
> commented out), so no `approver_role` applies. `risk_level: medium` →
> `require_hitl_approval: false`, so no human approval gate is owed on this
> review.

> **Base-spec immutability:** `configurable-reviewers.spec.md` was hashed before
> and after this run — `baaa7bfc7e00fdf09765d790c1a905c44b4bd883fab20291426a0f408605cfb4`
> both times. Unmodified.

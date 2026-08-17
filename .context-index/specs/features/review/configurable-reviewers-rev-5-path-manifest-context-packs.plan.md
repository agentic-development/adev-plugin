<!-- partial_schema: plan@1 -->

# Implementation Plan: Configurable Reviewer Registry — Path-Manifest Context Packs (rev 5 amendment)

> **Methodology:** adev
> **Charter:** .context-index/specs/features/review/charter.md
> **Spec:** .context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md
> **Amends:** .context-index/specs/features/review/configurable-reviewers.spec.md (base, targeting rev 5)
> **Review:** PASS_WITH_NOTES (2026-08-17, spec revision 2) — **operator override, see below**
> **Platform:** Node.js (ESM, `.mjs`), zero external dependencies, `node:test`
> **Tracker:** adev-plugin-j7pq.6 · **Deferred blockers:** adev-plugin-j7pq.7
> **Test granularity:** `per-behavior` (source: manifest — `.context-index/manifest.yaml:174-176`)

**Goal:** Give reviewer-dispatched context packs a second delivery model — `delivery: manifest`,
which names every matched file as a repo-relative path instead of inlining its body — so a review of
a large charter stops silently losing two thirds of its context to the byte cap, while every existing
`delivery: inline` consumer stays byte-unchanged.

**Architecture:** All pack semantics stay inside `lib/governance/context-pack.mjs`, which remains the
single owner of the render contract (it is shared with configurable-checks). `resolveExtends` grows a
third resolved field, `delivery`, resolved with exactly the precedence already used for
`max_file_bytes` / `max_total_bytes` — nearest declaration wins walking child → root — so an
`extends` chain can never be silently bypassed. `renderPack` branches once on that field: under
`inline` it is the rev-4 code path untouched; under `manifest` pass 1 groups matched files per
include and pass 2 emits one nonce-fenced `role="path-manifest"` section per include instead of one
section per file. The target spec is **not** touched by either branch — see the ownership finding
below. `lib/governance/dispatch-shape.mjs` gains the `TARGET_SPEC_OVERSIZE` warning and the BEH-7
prompt clause, both keyed off the resolved delivery it now reads back from `renderPack`. Pack
composition stays declarative YAML in `templates/review-specs/defaults.yaml`. No new dependency:
paths are assembled with the already-imported `node:path` and the existing `crypto.randomBytes`
nonce, so Principle #1 holds with no ADR required.

---

## Review Disposition — Read This First

The review verdict on the spec is `PASS_WITH_NOTES`, but that is an **operator override, not a clean
pass**. The full-tier review returned `BLOCK` twice. Round 2 left five blockers; one was fixed
(CON-1, the inverted 22k row) and **four were deferred to `adev-plugin-j7pq.7`**. The three
`reviewer_report` FAIL events stand on the lifecycle log unaltered.

The spec is therefore approved to proceed but is **known incomplete in four specific places**. This
plan does not pretend otherwise and does not silently implement a guess for any of them. Each
deferred blocker is named at the task that touches it, and the one task that would expose reviewers
to the unresolved gaps — Task 8, the `review-base` flip to `delivery: manifest` — is **explicitly
gated on `adev-plugin-j7pq.7`**.

| Deferred blocker | What is unresolved | Where this plan handles it |
|---|---|---|
| **SEC-1** (`security-reviewer:input-validation:f37df0ec`) | `fenceBlock` neutralizes only `body`; `attrs` is interpolated unescaped at **every** call site (`context-pack.mjs:301`, `:351`; `dispatch-shape.mjs:100`). The `title=` attribute BEH-10 newly mandates is therefore not neutralized. BEH-14 as written covers bodies only. | **Task 5** applies `neutralizeFenceTokens` to the title value (BEH-14's literal scope) and stops there. It does **not** introduce the attribute allowlist or the `attrs`-as-`Record` refactor — that is j7pq.7's. A `// KNOWN GAP (adev-plugin-j7pq.7)` comment at the emission site is a required deliverable. Task 5 must **not** claim the forgery acceptance criterion is fully satisfied. |
| **SEC-2** (`security-reviewer:data-exposure:c6aabd22`) | LF is legal in a POSIX path component, passes `neutralizeFenceTokens` untouched, and the denylist regexes anchor on `(^\|/)` — so a file named `a.spec.md\n.env` renders a bare `.env` line. BEH-11's "a denied path is never named" is **not entailed**. | **Task 6** asserts 22p-bis parity only, and records the gap. It does **not** implement the per-segment denylist or the control-character drop. **Task 8** is gated on this closing. |
| **SA-1** (`structural-architect:ownership-ambiguity:0111fab5`) | Ownership of target-spec inlining is unassigned; BEH-10/BEH-12 attribute it to the pack render. | **Resolved by reading the code — see the next section.** `renderPack` never inlines the target spec. This plan implements the `specBlock`-retains-ownership reading (SA-1's own second recommendation) in **Task 7**. j7pq.7 owns re-anchoring the spec *text*. |
| **SA-2** (`structural-architect:contradictory-contract:e4134970`) | Manifest caps are declared with no enforcement path: BEH-12 says the caps bound the manifest text, BEH-10 says nothing is ever omitted. `max_file_bytes` at 16 KB is reachable — a `specs/**/*.spec.md` include resolves to ~810 paths in one section. | **Task 4** implements BEH-10's normative "no file is omitted for budget reasons" and enforces **nothing** on manifest sections, with a test that locks in a >16 KB section emitting whole. It records that `max_file_bytes` consequently has no referent for a manifest section, pending j7pq.7. |

Retired behavior IDs — **no task is planned against these**: BEH-2, BEH-3, BEH-4, BEH-6, BEH-13.

---

## Code-Resolution Finding: `renderPack` Never Inlines the Target Spec

This was read out of the code before any task against BEH-10 or BEH-12 was written, because SA-1
raised the possibility that those two behaviors specify something `renderPack` never does. **They do
not describe `renderPack`, and both are implementable once ownership is re-anchored.** Three
independent confirmations:

1. **`renderPack` has no target-spec special case.** `targetSpecPath` reaches it only as an argument
   to `expandTargetTokens` (`lib/governance/context-pack.mjs:209` for the include glob, `:222` for
   each exclude pattern). Nothing in pass 1's matching or pass 2's emission loop treats the target
   spec differently from any other matched file.
2. **The bundled config actively excludes it.** `review-base`'s sibling-specs include carries
   `exclude: ["<target-spec>"]` (`templates/review-specs/defaults.yaml:54`), so
   `<charter-dir>/*.spec.md` removes the target spec from the matched set at
   `context-pack.mjs:292-294`.
3. **A different component owns it.** `buildReviewerDispatches` builds `specBlock` separately at
   `lib/governance/dispatch-shape.mjs:98-103` from `ctx.targetSpecContent`, fenced
   `role="target-spec"` with the *same* nonce `renderPack` returned, and appends it to the prompt at
   `:122` (subagent), `:154` (runner) and `:160` (adapter). It never passes through `renderPack`'s
   `totalBytes` accounting.

**Consequences the tasks below encode:**

- **BEH-10 is implementable as written**, read as a statement about the *assembled prompt* rather
  than about `renderPack`'s return value. "The target spec is the only file whose body is inlined"
  is satisfied by `renderPack` emitting **zero** inline bodies under `delivery: manifest` while
  `specBlock` continues to supply the target spec. No target-spec inlining is added to `renderPack`
  — doing so would ship the spec twice in every prompt. `exclude: ["<target-spec>"]` stays and
  remains correct.
- **BEH-12 is already true and is therefore a guarantee to lock in, not new behavior to build.**
  `specBlock` was never inside `renderPack`'s budget, so "exempt from both caps, never truncated"
  needs a regression test, not an exemption mechanism. What *is* a real code change is
  `TARGET_SPEC_OVERSIZE`: it must be emitted from `buildReviewerDispatches` — the only site that
  knows the target spec's byte length — and compared against the pack's resolved `max_total_bytes`,
  which requires `renderPack` to return its resolved `budgets`. That is Task 7.

**Related warning carried forward (SA-3).** `renderPack`'s `files[]` contract is undefined under
manifest delivery: `context-pack.mjs:372` pushes to `files` only for emitted *file* sections, so all
three reviewer packs would return an empty array and rev-4's live 22p acceptance criterion — that the
three reviewers produce three *distinct* `files` arrays — would break silently. Task 4 populates
`files[]` with every manifested path.

---

## Planning-Time Findings Not In The Spec

Two facts the implementer needs that the spec's source manifest does not carry.

**1. This repo's own reviewer registry would make the amendment inert.**
`.context-index/governance/review.yaml` pins `context_pack: base` on all three reviewers (lines 34,
42, 50). Per `skills/review-specs/SKILL.md:170-178`, the set that actually dispatches is the
**project's own file** — neither the bundled defaults nor the domain overlay contributes at run
time. Because BEH-9 deliberately keeps `base` at `delivery: inline`, this repo's reviews would get
no manifest delivery at all and the amendment would be inert exactly where its omission rates were
measured. `templates/domains/software/reviewers.yaml` already points at
`architecture` / `security` / `consistency`; the project file does not. **Task 13** repoints it. The
`materialized_at` marker (`review.yaml:62`) is write-once for *re-materialization* only — the file's
own header says "edit them directly to customize" — so a hand edit is in-contract.

**2. There is no dispatch-record writer in the tree.**
BEH-8 is written against "the dispatch record", but no such artifact exists. The phrase appears only
as prose and as truncation-marker text: `skills/review-specs/SKILL.md:236` and `:239`,
`lib/governance/review-config.mjs:273` and `:285`, `lib/governance/quality-gate.mjs:108`. No file is
written and no path is defined anywhere. BEH-8 therefore cannot be satisfied by "add two fields to
the dispatch record". **Task 12** scopes it conservatively and explicitly forbids inventing a new
lifecycle artifact.

**3. A stale count in the bundled defaults.** `templates/review-specs/defaults.yaml:34-35` says
`base` is shared with "five checks in `templates/domains/software/validate.yaml`". Grep says
**three**, at lines 54, 69 and 113. Task 1 corrects the comment. Every acceptance criterion and test
in this plan says three.

**4. `CONTEXT_PACK_NO_TARGET` does not fire for a token-free manifest pack.** The spec's Preconditions
Delta (`:141`) and Error Cases Delta row 2 (`:159`) both require that a pack declaring
`delivery: manifest` rendered with no `targetSpecPath` fails load with the existing
`CONTEXT_PACK_NO_TARGET`. Today that code is raised **only** from
`lib/governance/context-pack.mjs:210-216` (include glob) and `:223-230` (exclude pattern), and only
when the pattern carries a `<charter-dir>` / `<target-spec>` token. A project-authored manifest pack
whose includes carry no token — say `docs/*.md` — therefore renders today with no target, no error,
and nothing inlined: exactly the misconfiguration the spec says must fail. The bundled packs satisfy
the row only incidentally, because `review-base` always carries `<charter-dir>`. **Task 4 adds the
delivery-level check** so the guarantee does not depend on that accident.

---

## File Structure

**Create** (all new suites; `per-behavior` granularity, one suite per behavior statement):
- `tests/governance/context-pack-consistency-glob.test.mjs` — BEH-1
- `tests/governance/context-pack-delivery-field.test.mjs` — BEH-9
- `tests/governance/context-pack-inline-parity.test.mjs` — BEH-9 postcondition (byte-identity for `delivery: inline`)
- `tests/governance/context-pack-path-manifest.test.mjs` — BEH-10 + BEH-5 (the spec's own Actionable Task Map pairs them in one task)
- `tests/governance/context-pack-path-safety.test.mjs` — BEH-14
- `tests/governance/context-pack-manifest-denylist.test.mjs` — BEH-11
- `tests/governance/context-pack-manifest-budgets.test.mjs` — BEH-12
- `tests/governance/context-pack-manifest-coverage.test.mjs` — acceptance-level measurement against a 12-sibling charter
- `tests/governance/dispatch-manifest-prompt.test.mjs` — BEH-7
- `tests/governance/dispatch-manifest-audit.test.mjs` — BEH-8
- `tests/governance/review-config-manifest-profile.test.mjs` — `PROFILE_CANNOT_CONSUME_MANIFEST`

**Modify:**
- `lib/governance/context-pack.mjs` — `resolveExtends:89-138` returns `delivery`; `INVALID_PACK_DELIVERY` validation; `renderPack:183-388` gains the manifest branch (per-include grouping in pass 1, one `role="path-manifest"` section per include in pass 2), populates `files[]` from manifested paths, and returns `budgets` + `delivery`.
- `lib/governance/dispatch-shape.mjs:76-118` — reads back `delivery`/`budgets`; emits `TARGET_SPEC_OVERSIZE`; extends the preamble with the BEH-7 read contract; exposes the issued manifest on each dispatch struct.
- `lib/governance/review-config.mjs:144-198` — second-pass `PROFILE_CANNOT_CONSUME_MANIFEST` check after `mergePacks`.
- `templates/review-specs/defaults.yaml` — `consistency` glob `*.md` → `*.spec.md` (line 78); `base: delivery: inline`; `review-base: delivery: manifest`; stale "five checks" comment (line 34) → three.
- `.context-index/governance/review.yaml:34,42,50` — repoint the three reviewers off `base`.
- `skills/review-specs/SKILL.md` — BEH-7 prompt clause reference; BEH-8 reviewer read-reporting instruction.
- `providers/codex/skills/review-specs/SKILL.md`, `providers/opencode/skills/review-specs/SKILL.md` — mirror sync (these are the only two providers that mirror `review-specs`, confirmed by `find providers -path "*review-specs/SKILL.md"`).
- `docs/governance.md:320-380` — document `delivery`, its two values, the default, and the path-manifest section shape.
- `tests/governance/context-pack.test.mjs` — only if an existing rev-4 assertion needs the new `renderPack` return shape; **no behavioral rewrite** (its rev-4 assertions are the inline-parity oracle).

**Reference (read, do not modify):**
- `.context-index/specs/features/review/configurable-reviewers-rev-4-context-pack-population.spec.md` — 22g/22h/22i/22j/22k/22l/22m/22n/22o/22p/22p-bis, all preserved
- `.context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.blockers.md` — the four deferred blockers, verbatim
- `templates/governance/profiles.yaml:8-14,31-42` — `read-only` grants unscoped `filesystem-read` + `search` to all three reviewer profiles
- `templates/domains/software/validate.yaml:54,69,113` — the three `context_pack: base` consumers
- `.context-index/specs/features/agent-reliable-state-artifacts/` — the 12-sibling charter every omission measurement uses

---

## Context Packets

Common to every task: the spec (behavior under test), `charter.md` (capability *Context pack
rendering*), the constitution's Non-Negotiable Principles, and the `.blockers.md` entry for any
deferred blocker the task touches.

### Task 1 Context
- Spec: BEH-1; acceptance criterion 1
- Source: `templates/review-specs/defaults.yaml:75-79` (full), `lib/governance/context-pack.mjs:530-577` (`expandGlob` — signatures only)
- Measurement: `.context-index/specs/cross-cutting/` — 18 `*.spec.md` of 55 `*.md`

### Task 2 Context
- Spec: BEH-9 first half; Error Cases row `INVALID_PACK_DELIVERY`
- Source: `lib/governance/context-pack.mjs:89-149` (`resolveExtends` + `defaultBudgets` + `isPositiveInt`, full — the budget precedence is the pattern to copy)
- Test shape: `tests/governance/context-pack.test.mjs:41-71` (`resolveExtends` describe block, signatures only)

### Task 3 Context
- Spec: BEH-9 "renders byte-identically to today"; Postconditions Delta; acceptance criterion 4
- Source: `templates/domains/software/validate.yaml:54,69,113`; `templates/review-specs/defaults.yaml:33-46`
- Reference: rev-4 spec 22o

### Task 4 Context
- Spec: BEH-10, BEH-5; rev-4 22g (nonce sections), 22n (ordering), 22p (`files[]`)
- Source: `lib/governance/context-pack.mjs:199-388` (full — pass 1, pass 2, `sectionCost`, `fenceBlock`), `normalizeInclude:434-444`
- Deferred: `.blockers.md` → SA-2 (`structural-architect:contradictory-contract:e4134970`), SA-3 note inside SA-1's entry

### Task 5 Context
- Spec: BEH-14; Error Cases row `CONTEXT_PACK_FENCE_COLLISION`; acceptance criterion 6
- Source: `lib/governance/context-pack.mjs:37-40,411-432` (`FENCE_PREFIX_RE`, `neutralizeFenceTokens`, `fenceBlock` — full), call sites `:301,:351`, `dispatch-shape.mjs:100`
- Deferred: `.blockers.md` → SEC-1 (`security-reviewer:input-validation:f37df0ec`)

### Task 6 Context
- Spec: BEH-11; acceptance criterion 8; rev-4 22p-bis
- Source: `lib/governance/context-pack.mjs:46-53` (`DENYLIST_PATTERNS`), `:242-291` (the three-way split, full)
- Deferred: `.blockers.md` → SEC-2 (`security-reviewer:data-exposure:c6aabd22`)

### Task 7 Context
- Spec: BEH-12; Error Cases row `TARGET_SPEC_OVERSIZE`; acceptance criterion 5
- Source: `lib/governance/dispatch-shape.mjs:61-122` (full), `lib/governance/context-pack.mjs:344-388`
- Deferred: `.blockers.md` → SA-1 (`structural-architect:ownership-ambiguity:0111fab5`)
- Plan: the Code-Resolution Finding above is normative for this task

### Task 8 Context
- Spec: BEH-9 second half; the "Behaviors narrowed" table (all six rows)
- Source: `templates/review-specs/defaults.yaml` (full)
- Deferred: **SEC-1 and SEC-2 both gate this task**

### Task 9 Context
- Spec: acceptance criteria 2, 3, 11; the "Measured behaviour (base a632d18f)" table
- Source: `.context-index/specs/features/agent-reliable-state-artifacts/` (12 siblings — path list only), `.context-index/specs/features/heuristics/` (14 siblings), `.context-index/governance/risk-policies.yaml` + `gates.yaml` (existence only)

### Task 10 Context
- Spec: BEH-7
- Source: `lib/governance/dispatch-shape.mjs:110-118` (preamble + `contextBlock`, full), `lib/profiles/index.mjs::resolveProfile` (signature only), `templates/governance/profiles.yaml:8-14`
- Mirrors: `providers/codex/skills/review-specs/SKILL.md`, `providers/opencode/skills/review-specs/SKILL.md`

### Task 11 Context
- Spec: Error Cases row `PROFILE_CANNOT_CONSUME_MANIFEST`; Preconditions Delta third bullet
- Source: `lib/governance/review-config.mjs:144-198` (full — note the ordering problem), `:660-680` (`checkReadOnlyCompatible`), `templates/governance/profiles.yaml:8-42`

### Task 12 Context
- Spec: BEH-8
- Source: `lib/governance/dispatch-shape.mjs:120-195` (dispatch structs), `:201-245` (`renderReviewReport`), `skills/review-specs/SKILL.md:230-245,263-294`
- Planning finding 2 above is normative for this task's scope boundary

### Task 13 Context
- Source: `.context-index/governance/review.yaml:28-62` (full), `templates/domains/software/reviewers.yaml` (full), `skills/review-specs/SKILL.md:156-180`
- Planning finding 1 above is normative

### Task 14 Context
- Source: `docs/governance.md:290-410` (the context-pack + check-kind sections)
- Spec: BEH-9, BEH-10 (the documented surface)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (`message.usage` fields: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5× vs real measurements.
- **Evidence:** 1 observation

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1× pricing dominate due to volume.
- **Evidence:** 1 observation

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete.
- **Anti-pattern:** Assume shorter output means lower quality artifacts. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observation

**Direct bearing on this plan:** the first heuristic is codified as acceptance criterion 12. **No task
in this plan makes a token or cost claim.** If one is added later it must be measured from session
JSONL `message.usage`, never estimated as bytes/4.

---

## Parallelization

- **Group A (sequential, the delivery spine):** Task 2 → Task 4 → Task 5 → Task 6 → Task 7 → Task 10 → Task 12 → Task 8. All touch `lib/governance/context-pack.mjs` and/or `lib/governance/dispatch-shape.mjs`. **Task 8 is last in the spine, not mid-chain** — it is the gated flip, and everything before it is exercised against fixture packs.
- **Group B (independent):** Task 1 — `templates/review-specs/defaults.yaml` only, and only the `consistency` glob + a comment. Overlaps Task 8's file but not its lines; if run concurrently, Task 8 rebases.
- **Group C (independent):** Task 3 — new test file only, reads production code it does not modify.
- **Group D (independent):** Task 11 — `lib/governance/review-config.mjs`, no overlap with Group A's files.
- **Group E (independent):** Task 14 — `docs/governance.md` only.
- **Group F (sequential, strictly after Task 8):** Task 9 → Task 13. Both are acceptance-level measurements against the **bundled** packs, so both genuinely need the Task 8 flip landed.

Readiness, stated so it agrees with each task's declared `Depends on`:

| Group | Ready once | Note |
|---|---|---|
| B (Task 1) | immediately | — |
| A (Task 2) | immediately | head of the spine |
| C (Task 3) | Task 2 lands | test-only |
| A (Task 4) | Task 2 lands | — |
| A (Task 5) | Task 4 lands | — |
| A (Task 6) | Task 5 lands | **in the spine, not parallel.** Task 6 may modify `lib/governance/context-pack.mjs` if its assertion 2 fails, so it must not run concurrently with Tasks 5 and 7. |
| A (Task 7) | Task 6 lands | — |
| A (Task 10) | Task 7 lands | fixture manifest pack, not the bundled flip |
| A (Task 12) | Task 10 lands | fixture manifest pack |
| D (Task 11) | Task 2 lands | fixture profile + fixture manifest pack |
| E (Task 14) | Task 4 lands | prose; Task 8's declarations are already decided by then |
| A (Task 8) | Tasks 4, 5, 6, 7, 10, 12 land **and `adev-plugin-j7pq.7` closes** | the gate |
| F (Task 9) | Task 8 lands | see Task 9's RED note |
| F (Task 13) | Task 9 lands | — |

**Tasks 10, 11, 12 and 14 are deliberately NOT gated on Task 8.** Each is reachable against a fixture
pack that declares `delivery: manifest` in a temp-dir config, so none of them waits on
`adev-plugin-j7pq.7`. Task 11's own test note is explicit that the shipped configuration *cannot*
exercise its code path anyway. Only Tasks 9 and 13 — which measure the bundled packs and this repo's
own registry — genuinely require the flip.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Narrow the consistency include glob (BEH-1) | small | unit | — | 1 create, 1 modify |
| 2 | `delivery` field: enum, default, inheritance (BEH-9) | small | unit | — | 1 create, 1 modify |
| 3 | Inline-delivery byte-parity guard (BEH-9 postcondition) | small | unit | Task 2 | 1 create, 0 modify |
| 4 | Manifest section rendering + ordering (BEH-10, BEH-5) | medium | unit | Task 2 | 1 create, 1 modify |
| 5 | Path fence-token neutralization (BEH-14) | small | unit | Task 4 | 1 create, 1 modify |
| 6 | Denylist parity for manifest entries (BEH-11) | small | unit | Task 4, Task 5 | 1 create, 0-1 modify |
| 7 | Target-spec ownership + `TARGET_SPEC_OVERSIZE` (BEH-12) | medium | unit | Task 2, Task 6 | 1 create, 2 modify |
| 8 | Declare pack delivery in bundled defaults (BEH-9) | small | unit | Tasks 4, 5, 6, 7, 10, 12 **+ adev-plugin-j7pq.7** | 0 create, 1 modify |
| 9 | Omission measurement vs a 12-sibling charter (AC 2, 3, 11) | medium | unit | Task 8 | 1 create, 0 modify |
| 10 | Reviewer prompt states the read contract (BEH-7) | small | unit | Task 7 | 1 create, 4 modify |
| 11 | `PROFILE_CANNOT_CONSUME_MANIFEST` | small | unit | Task 2 | 1 create, 1 modify |
| 12 | Dispatch-record manifest audit capture (BEH-8) | medium | unit | Task 10 | 1 create, 4 modify |
| 13 | Repoint this repo's own reviewer registry | small | unit | Task 8, Task 9 | 0 create, 1 modify |
| 14 | Document `delivery` and the path-manifest shape | small | unit | Task 2, Task 4 | 0 create, 1 modify |

**Task 8 is the only task with an external dependency.** It waits on `adev-plugin-j7pq.7`; nothing
else does. Tasks 10, 11, 12 and 14 were deliberately retargeted at fixture packs so the gate does not
transitively block four live deliverables — see the readiness table above.

All fourteen tasks resolve to strategy `unit` (source: fallback — the spec declares no
`test_strategy` and `.context-index/manifest.yaml` declares no `test_strategies` globs). The Strategy
Summary section is therefore omitted, and so is Test Infrastructure Requirements: no task needs an
external system, and the spec declares no `infra_requirements`.

Every task is `[specialist: none]` — `.context-index/manifest.yaml:117` declares `specialists: []`,
so no `trigger_patterns` or `trigger_keywords` exist to match.

---

## Tasks

Branch for all tasks: `feat/review/path-manifest-context-packs`.
Every commit carries both trailers required by the constitution:

```
Spec: .context-index/specs/features/review/configurable-reviewers-rev-5-path-manifest-context-packs.spec.md
Plan-task: <task number>
```

Quality gate command for a single suite: `node --test tests/governance/<file>.test.mjs`.
Full gate: `npm test`.

> **Baseline before you start.** `npm test` in this worktree is 7077 tests / 7035 pass / **10 fail**,
> all ten in `tests/repomap/{index,parse,non-code-references.integration,render-non-code-sections}.test.mjs`
> with `ENOENT` on the tree-sitter wasm asset. That is **not** a regression and is not this plan's to
> fix. Any new failure **outside those four files** is real.

> **Do not bump versions.** `package.json`, `.claude-plugin/plugin.json` and
> `.cursor-plugin/plugin.json` are owned by release-please (ADR-0008). No task in this plan touches
> them.

---

### Task 1: Narrow the consistency include glob (BEH-1) [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-1
**Files:**
- Create: `tests/governance/context-pack-consistency-glob.test.mjs`
- Modify: `templates/review-specs/defaults.yaml:78` (the glob), `:34-35` (the stale comment)

**Tests:** `tests/governance/context-pack-consistency-glob.test.mjs` — create (BEH-1 is not covered by
any existing suite).

**Context to load:** see Task 1 Context above.

- [ ] **Write failing test**

Three assertions, all against the bundled `templates/review-specs/defaults.yaml` as parsed by
`loadReviewConfig` (do not hand-write a fixture pack — the point is that the *shipped* file is
correct):

```javascript
// 1. The resolved include glob is spec-only.
const { includes } = resolveExtends("consistency", contextPacks);
const crossCutting = includes.find((i) => String(i.glob ?? i).includes("cross-cutting"));
assert.equal(normalizeGlob(crossCutting), ".context-index/specs/cross-cutting/*.spec.md");

// 2. Rendered against this repo, the pack names 18 cross-cutting specs, not 55 files.
//    Count only the cross-cutting entries — the pack also carries charter/constitution/siblings.
assert.equal(crossCuttingMatches.length, 18);

// 3. No lifecycle sidecar reaches any pack, for ANY of the five bundled packs.
for (const pack of ["base", "review-base", "architecture", "security", "consistency"]) {
  for (const f of renderPack(pack, contextPacks, ctx).files) {
    assert.doesNotMatch(f, /\.(review|plan|validate|blockers)\.md$/);
  }
}
```

Assertion 2 is a live count against the repo, so pin it with a comment naming the 37 excluded
sidecars (13 `.review.md`, 11 `.plan.md`, 9 `.validate.md`, 3 `.blockers.md`, 1 bare
`lifecycle-gate-validation.md`) so a future contributor who adds a cross-cutting spec understands
which number to update and which to never update.

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-consistency-glob.test.mjs`
Expected: FAIL — assertion 1 gets `.context-index/specs/cross-cutting/*.md`; assertion 2 gets 55.

- [ ] **Implement**

`templates/review-specs/defaults.yaml:78` — `*.md` → `*.spec.md`.
`templates/review-specs/defaults.yaml:34-35` — "five checks" → "three checks (lines 54, 69 and 113)".

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-consistency-glob.test.mjs` → PASS
Then: `node --test tests/governance/context-pack.test.mjs` — the rev-4 suite has bundled-pack
assertions at `:324+`; confirm none of them asserted the old `*.md` glob.

- [ ] **Commit**

```bash
git add templates/review-specs/defaults.yaml tests/governance/context-pack-consistency-glob.test.mjs
git commit -m "fix(review): narrow consistency pack glob to *.spec.md"
```

---

### Task 2: `delivery` field — closed enum, default `inline`, inherited (BEH-9) [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-9
**Files:**
- Create: `tests/governance/context-pack-delivery-field.test.mjs`
- Modify: `lib/governance/context-pack.mjs:89-149` (`resolveExtends`)

**Tests:** `tests/governance/context-pack-delivery-field.test.mjs` — create.

**Context to load:** see Task 2 Context above.

- [ ] **Write failing test**

```javascript
// Default: a pack that declares nothing gets "inline".
assert.equal(resolveExtends("plain", packs).delivery, "inline");

// Inheritance mirrors max_file_bytes exactly: nearest declaration walking child -> root wins.
// parent declares manifest, child declares nothing  -> child is manifest
assert.equal(resolveExtends("childOfManifest", packs).delivery, "manifest");
// parent declares manifest, child declares inline    -> child is inline (child is nearer)
assert.equal(resolveExtends("childOverridesInline", packs).delivery, "inline");
// grandparent manifest, parent silent, child silent  -> child is manifest
assert.equal(resolveExtends("grandchild", packs).delivery, "manifest");

// Closed enum: anything else is a load error naming the pack AND the value. Never a fallback.
const bad = resolveExtends("badDelivery", packs);
assert.equal(bad.errors[0].code, "INVALID_PACK_DELIVERY");
assert.match(bad.errors[0].message, /badDelivery/);
assert.match(bad.errors[0].message, /sideband/);   // the offending value must be named
assert.equal(bad.delivery, undefined);             // no silent fallback on the error path

// renderPack surfaces the load error and renders nothing, like every other resolveExtends error.
const r = renderPack("badDelivery", packs, ctx);
assert.equal(r.rendered, "");
assert.ok(r.errors.some((e) => e.code === "INVALID_PACK_DELIVERY"));
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-delivery-field.test.mjs`
Expected: FAIL — `resolveExtends(...).delivery` is `undefined`; no `INVALID_PACK_DELIVERY` code exists.

- [ ] **Implement**

In `resolveExtends`, alongside the existing budget resolution loop over `chain` (child → root at that
point, before the `chain.reverse()`):

- Resolve `delivery` with the **same** precedence as `max_file_bytes`: first declaration found walking
  `chain` wins; `?? "inline"` as the final fallback. Reuse the loop that is already there rather than
  adding a second pass, and extend the existing comment ("`chain` is child → root here, so the FIRST
  declaration found is the nearest") to cover the new field.
- Validate **every** link's declared value, not just the winning one: a typo in an ancestor that the
  child happens to override is still an authoring error and must fail loud. Push
  `{ code: "INVALID_PACK_DELIVERY", message: ... }` naming the pack and the offending value, and
  return early exactly as `CONTEXT_PACK_CYCLE` / `UNKNOWN_CONTEXT_PACK` do (`:100`, `:107`).
- Add `delivery` to the returned object and to the JSDoc `@returns` at `:87`.
- `renderPack` already bails on `resolved.errors.length` (`:194-196`), so the render-side assertion
  needs no new code.

Constitution check: pure ESM, Node built-ins only, no new dependency. This is a `lib/` change inside
one module's boundary — autonomous per CLAUDE.md.

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-delivery-field.test.mjs` → PASS
Then: `node --test tests/governance/context-pack.test.mjs` → PASS (the `resolveExtends` describe block
at `:41-71` must be unaffected; a growing return object is additive).

- [ ] **Commit**

```bash
git add lib/governance/context-pack.mjs tests/governance/context-pack-delivery-field.test.mjs
git commit -m "feat(review): add per-pack delivery field defaulting to inline"
```

---

### Task 3: Inline-delivery byte-parity guard (BEH-9 postcondition) [specialist: none]

**Charter capability:** Bundled defaults preservation
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-9 (Postconditions Delta; acceptance criterion 4)
**Depends on:** Task 2
**Files:**
- Create: `tests/governance/context-pack-inline-parity.test.mjs`

**Tests:** `tests/governance/context-pack-inline-parity.test.mjs` — create.

This task is expected to require **no production change**. It is the guard that Tasks 4, 5, 6, 7 and 8
cannot regress the three `base` consumers. If it needs a production change to pass, something in
Task 2 defaulted wrongly — fix that, not this test.

**Context to load:** see Task 3 Context above.

- [ ] **Write failing test**

```javascript
// There are exactly THREE `context_pack: base` consumers in the software validate overlay.
// Lines 54, 69 and 113. Assert the count structurally so a fourth consumer trips this test.
const consumers = checksReferencing("base", "templates/domains/software/validate.yaml");
assert.equal(consumers.length, 3);

// `base` resolves to inline whether or not it says so.
assert.equal(resolveExtends("base", bundledPacks).delivery, "inline");

// Byte-identity: declaring `delivery: inline` explicitly changes nothing.
// Nonces differ per render call, so normalize the nonce before comparing.
const a = renderPack("base", packsWithoutDelivery, ctx);
const b = renderPack("base", packsWithExplicitInline, ctx);
assert.equal(denonce(a.rendered, a.nonce), denonce(b.rendered, b.nonce));
assert.deepEqual(a.files, b.files);
```

`denonce` is a local helper that replaces the render's own nonce with a fixed token — do not compare
raw strings, and do not stub `crypto.randomBytes`.

Also assert `base` carries **no** `<charter-dir>` or `<target-spec>` token, so it stays renderable
with no `targetSpecPath` (rev-4 22o, restated in this spec's Preconditions Delta). Render it once with
`targetSpecPath: undefined` and assert zero `CONTEXT_PACK_NO_TARGET` errors.

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-inline-parity.test.mjs`
Expected: FAIL on the `resolveExtends(...).delivery` assertion only if Task 2 has not landed;
otherwise this suite should pass on first run. **That is an acceptable RED-skip for a pure regression
guard** — record in the commit body that the suite was written to fail against pre-Task-2 `HEAD` and
verified to do so.

- [ ] **Implement**

No production change expected.

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-inline-parity.test.mjs` → PASS

- [ ] **Commit**

```bash
git add tests/governance/context-pack-inline-parity.test.mjs
git commit -m "test(review): guard byte-identical inline delivery for the three base consumers"
```

---

### Task 4: Manifest section rendering + deterministic ordering (BEH-10, BEH-5) [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behaviors:** BEH-10, BEH-5 (paired by the spec's own Actionable Task Map row "Manifest section rendering")
**Depends on:** Task 2
**Files:**
- Create: `tests/governance/context-pack-path-manifest.test.mjs`
- Modify: `lib/governance/context-pack.mjs:199-388` (both passes of `renderPack`)

**Tests:** `tests/governance/context-pack-path-manifest.test.mjs` — create.

**Context to load:** see Task 4 Context above.

**Design constraints — resolve these before writing code, do not improvise:**

1. **Pass 1 must group per include.** Today `plan` is a *flat* array (`:202`) that loses the
   include boundary. BEH-10 requires **one section per include**, so the manifest branch needs
   include-scoped grouping. Prefer carrying an `includeIndex` (and the resolved `title` /
   `effectiveGlob`) on each `plan` entry over building a second parallel structure — the inline branch
   then ignores the extra field and stays byte-identical.
2. **`title` fallback chain, exactly as specified:** the include's declared `title` → the include's
   glob string when `normalizeInclude` yields `title: null` → the attribute **omitted entirely** when
   neither is available. "Omitted entirely" means the header is `role="path-manifest"` with no
   `title=` at all, not `title=""`.
3. **The no-match section changes role under manifest delivery.** Today an empty include emits
   `path="<title-or-glob>" role="no-matches"` (`:299-302`). BEH-10 says an include matching nothing
   "still emits its section with body `<no matches>`, preserving 22g's guarantee" — and every manifest
   section carries `role="path-manifest"`. So under manifest delivery the empty section is
   `role="path-manifest" title="…"` with body `<no matches>`. Under inline delivery it stays
   `role="no-matches"`, byte-unchanged. **Assert both.**
4. **No `role="truncation-notice"` for a manifest pack.** BEH-10 is explicit. Skip the `omitted`
   accumulation entirely on the manifest branch — do not accumulate and then decline to emit.
5. **`files[]` must be populated (rev-4 22p / SA-3).** `:372` pushes to `files` only for emitted file
   sections. Under manifest delivery, push **every manifested path**, so the three reviewer packs
   still return three *distinct* arrays. This is a live rev-4 acceptance criterion; breaking it is a
   regression, not a narrowing (the "Behaviors narrowed" table does not mention 22p).
6. **Ordering is 22n verbatim:** includes in declaration order; files within an include sorted by
   repo-root-relative path in **byte order**. The existing `safe.sort` at `:309` already does the
   byte-order half — reuse it, never `localeCompare`.
7. **A manifest pack with no `targetSpecPath` fails load with `CONTEXT_PACK_NO_TARGET`.** Planning
   finding 4 above: that code fires today only from `:210-216` / `:223-230`, and only when an include
   pattern carries a `<charter-dir>` / `<target-spec>` token. Add a delivery-level check at the top of
   `renderPack`, immediately after `resolveExtends` succeeds: if the resolved delivery is `manifest`
   and `ctx.targetSpecPath` is absent, push `CONTEXT_PACK_NO_TARGET` naming the pack and return the
   empty render, exactly as the `resolved.errors.length` bail at `:194-196` does. **Reuse the existing
   code — the spec's Error Cases Delta row 2 says so explicitly ("reusing the existing code").** Do
   not add a new code, and do not make the guarantee depend on `review-base` happening to carry a
   token.
8. **Budgets: enforce nothing on manifest sections.** BEH-10's "no file is omitted for budget reasons"
   is normative, so the `totalBytes + cost > maxTotalBytes` break at `:353` must not apply to manifest
   sections. **KNOWN GAP (adev-plugin-j7pq.7 / SA-2):** this leaves `max_file_bytes` with no referent
   for a manifest section, and `max_total_bytes` bounding nothing under manifest delivery. Put a
   `// KNOWN GAP (adev-plugin-j7pq.7): manifest caps are declared with no enforcement path — see SA-2`
   comment at the branch and do **not** invent an overflow marker, a new error code, or a drop rule.

- [ ] **Write failing test**

```javascript
// One section per include, in declaration order, role="path-manifest".
const r = renderPack("manifestPack", packs, { repoRoot, targetSpecPath });
const sections = parseSections(r.rendered, r.nonce);
assert.equal(sections.length, packIncludeCount);
assert.deepEqual(sections.map((s) => s.attrs.role), Array(packIncludeCount).fill("path-manifest"));

// Body is one repo-relative path per line, byte-sorted within the include.
const paths = sections[1].body.split("\n");
assert.deepEqual(paths, [...paths].sort());
for (const p of paths) assert.ok(!p.startsWith("/"), "paths are repo-root-relative");

// Zero inlined bodies: no matched file's CONTENT appears anywhere in the render.
assert.ok(!r.rendered.includes(uniqueSentinelFromAMatchedFile));

// title fallback chain.
assert.equal(sections[0].attrs.title, "Parent Charter");          // declared title
assert.equal(sections[2].attrs.title, "docs/*.md");               // falls back to the glob
assert.equal("title" in sections[3].attrs, false);                // omitted entirely, not title=""

// An include matching nothing still emits a section.
assert.equal(emptySection.attrs.role, "path-manifest");
assert.equal(emptySection.body, "<no matches>");
// ...and under delivery: inline the same include still emits role="no-matches" (unchanged).
assert.equal(inlineEmptySection.attrs.role, "no-matches");

// No truncation notice, ever, for a manifest pack.
assert.ok(!sections.some((s) => s.attrs.role === "truncation-notice"));

// files[] carries every manifested path (rev-4 22p / SA-3).
assert.deepEqual(r.files.sort(), allManifestedPaths.sort());

// A manifest pack rendered with NO targetSpecPath fails load, reusing the existing code.
// Use a pack whose includes carry NO <charter-dir>/<target-spec> token, so the failure comes
// from the delivery-level check and not incidentally from token expansion.
const noTarget = renderPack("tokenFreeManifest", packs, { repoRoot });   // no targetSpecPath
assert.equal(noTarget.errors[0].code, "CONTEXT_PACK_NO_TARGET");
assert.match(noTarget.errors[0].message, /tokenFreeManifest/);
assert.equal(noTarget.rendered, "");
// The same pack under delivery: inline still renders fine target-agnostically (rev-4 22o).
assert.equal(renderPack("tokenFreeInline", packs, { repoRoot }).errors.length, 0);

// SA-2 gap locked in as current behavior: a >16 KB section emits WHOLE.
const big = renderPack("hugeManifest", packs, ctx);   // include resolving to ~810 paths
const bigSection = parseSections(big.rendered, big.nonce)[0];
assert.ok(Buffer.byteLength(bigSection.body) > 16384);
assert.equal(bigSection.body.includes("…[adev:"), false);   // no marker of any kind
```

`parseSections` is a local helper that splits on the render's own nonce and parses the header
attributes. Write it once here; Tasks 5, 6, 7, 9 and 10 reuse it — export it from a small local
`tests/governance/helpers/parse-pack-sections.mjs` if more than two suites need it, otherwise keep it
local.

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-path-manifest.test.mjs`
Expected: FAIL — `delivery: manifest` currently renders the rev-4 inline output, so the section count,
roles and body shape are all wrong.

- [ ] **Implement**

Per the eight design constraints above, in `lib/governance/context-pack.mjs`. Keep the inline branch
byte-identical — Task 3's parity suite is the oracle.

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-path-manifest.test.mjs` → PASS
Then: `node --test tests/governance/context-pack.test.mjs tests/governance/context-pack-inline-parity.test.mjs` → PASS

- [ ] **Commit**

```bash
git add lib/governance/context-pack.mjs tests/governance/context-pack-path-manifest.test.mjs
git commit -m "feat(review): render path-manifest sections for delivery: manifest packs"
```

---

### Task 5: Path fence-token neutralization (BEH-14) [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-14
**Depends on:** Task 4
**Files:**
- Create: `tests/governance/context-pack-path-safety.test.mjs`
- Modify: `lib/governance/context-pack.mjs` (manifest emission site from Task 4)

**Tests:** `tests/governance/context-pack-path-safety.test.mjs` — create.

**Context to load:** see Task 5 Context above.

> **DEFERRED BLOCKER — SEC-1 (`security-reviewer:input-validation:f37df0ec`), owned by
> `adev-plugin-j7pq.7`.** `fenceBlock` (`:426-432`) neutralizes only `body`. `attrs` is interpolated
> **unescaped** at every call site — `:301`, `:351`, and `dispatch-shape.mjs:100`. The `title=`
> attribute Task 4 emits is therefore **not** neutralized: a `"`, a `>>>`, or a CR/LF in a charter
> directory name or a project-authored pack title escapes the attribute and emits attacker-chosen
> lines inside a fence the 22j preamble declares repository-sourced.
>
> **This task does the in-scope half and nothing more.** BEH-14's literal scope is "any path string
> emitted into a manifest section", so: route the body path lines through the neutralizer, and pass
> the `title` value through `neutralizeFenceTokens` too. Do **not** implement SEC-1's recommended fix
> (strict allowlist on attribute values, `attrs` taken as a `Record<string,string>` so the escaping
> lives inside `fenceBlock`) — that is a contract change j7pq.7 owns, and guessing at it here would
> have to be re-done.
>
> Required deliverable: a `// KNOWN GAP (adev-plugin-j7pq.7): fence-header attribute values are not
> neutralized — see SEC-1` comment at the header-construction site.
>
> Acceptance criterion 6 ("a file or directory NAME containing `=== foo ===` or `<<<ADEV-PACK-…>>>`
> cannot forge a manifest section or fence") is **only partly satisfied** by this task: satisfied for
> the section body, not for the header. Do not mark it done. `/adev:validate` will see the gap; say so
> in the commit body rather than letting it look like an oversight.

- [ ] **Write failing test**

```javascript
// A file NAME carrying a literal fence prefix cannot forge a fence in the body.
// Fixture: a file literally named `<<<ADEV-PACK-x>>>.spec.md` inside the temp repo.
const r = renderPack("manifestPack", packs, ctx);
const sections = parseSections(r.rendered, r.nonce);
assert.equal(sections.length, expectedSectionCount);          // no extra section forged
assert.ok(sections[0].body.includes("<‹<ADEV-PACK-"));   // neutralized form present
assert.ok(!sections[0].body.includes("<<<ADEV-PACK-"));       // raw form absent

// The warning names the offending path.
const w = r.warnings.find((x) => x.code === "CONTEXT_PACK_FENCE_COLLISION");
assert.ok(w);
assert.match(w.message, /ADEV-PACK/);

// The legacy `=== rel ===` delimiter in a filename is inert (rev-4 replaced it with nonce fences).
assert.ok(!forgedByLegacyDelimiter(r.rendered));

// Clean paths emit no warning.
assert.equal(renderPack("cleanPack", packs, ctx).warnings.filter(isCollision).length, 0);

// KNOWN GAP, asserted as CURRENT behavior so j7pq.7 has a failing-on-fix marker:
// a charter directory named `x">>>` still escapes the title attribute today.
// Assert the gap explicitly with a comment naming adev-plugin-j7pq.7, so the day j7pq.7
// lands, this assertion flips and forces the author here to be updated deliberately.
```

That last assertion is deliberate: it documents the gap in executable form instead of in a comment
that rots. Name `adev-plugin-j7pq.7` in the test title.

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-path-safety.test.mjs`
Expected: FAIL — Task 4 emits manifest bodies through `fenceBlock`, which neutralizes, but
`fenceBlock`'s `collided` flag is only *inspected* for file sections (`:364-369`), so no
`CONTEXT_PACK_FENCE_COLLISION` warning is raised for a path collision.

- [ ] **Implement**

- Surface `fenceBlock`'s `collided` return for manifest sections, and raise
  `CONTEXT_PACK_FENCE_COLLISION` naming the specific offending **path** (not just the section) — the
  spec says "a warning naming the path".
- Pass the resolved `title` through `neutralizeFenceTokens` before interpolation.
- Add the `// KNOWN GAP (adev-plugin-j7pq.7)` comment.
- No new error code, no new dependency.

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-path-safety.test.mjs` → PASS
Then: `node --test tests/governance/context-pack-path-manifest.test.mjs tests/governance/context-pack-inline-parity.test.mjs` → PASS

- [ ] **Commit**

```bash
git add lib/governance/context-pack.mjs tests/governance/context-pack-path-safety.test.mjs
git commit -m "fix(review): neutralize fence tokens in manifest path lines

Body-side only. Fence-header attribute values remain unneutralized —
deferred to adev-plugin-j7pq.7 (SEC-1). Acceptance criterion 6 is
partly, not fully, satisfied."
```

---

### Task 6: Denylist parity for manifest entries (BEH-11) [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-11
**Depends on:** Task 4, Task 5 (Task 6 sits *in* the Group A spine, not beside it — see below)
**Files:**
- Create: `tests/governance/context-pack-manifest-denylist.test.mjs`
- Modify (**conditional** — only if assertion 2 fails): `lib/governance/context-pack.mjs`

**Tests:** `tests/governance/context-pack-manifest-denylist.test.mjs` — create.

**Context to load:** see Task 6 Context above.

This is expected to be a **test-only** task. The denylist filter runs in pass 1 (`:242-291`), before
Task 4's grouping, so if Task 4 did not bypass it the three codes already behave identically under
manifest delivery. **If the assertions pass with no production change, the task is complete** — say so
in the commit body rather than manufacturing a change.

**Sequencing note:** because assertion 2 below *may* require correcting Task 4's `files[]` source
inside `lib/governance/context-pack.mjs`, this task runs **inside the Group A spine** (after Task 5,
before Task 7) rather than concurrently with it. Two tasks editing that file at once is the one
collision the parallelization plan must avoid.

> **DEFERRED BLOCKER — SEC-2 (`security-reviewer:data-exposure:c6aabd22`), owned by
> `adev-plugin-j7pq.7`.** LF is legal in a POSIX path component, passes `neutralizeFenceTokens`
> untouched, and the denylist regexes anchor on `(^|/)` — so a file named `a.spec.md\n.env` matched by
> `<charter-dir>/*.spec.md` is not denied, is admitted to the safe set, and renders as **two** manifest
> lines, the second a bare `.env`. BEH-11's closing claim "a denied path is never named in the
> manifest either" is **not entailed**.
>
> Do **not** implement SEC-2's recommended fix here (per-segment denylist evaluation; dropping any
> path containing a byte in `0x00-0x1F`, a leading/trailing space, or NUL, with a new
> `CONTEXT_PACK_UNSAFE_PATH` warning). It introduces a new error code, which BEH-11 explicitly forbids
> this amendment from doing ("reusing its existing error codes and adding none"), so it cannot be
> reconciled without the spec change j7pq.7 owns.
>
> **This is why Task 8 is gated.** Until j7pq.7 lands, no reviewer pack may declare
> `delivery: manifest`.

- [ ] **Write failing test**

Three assertions mirroring 22p-bis exactly, each under `delivery: manifest`, plus a fourth that no
new code appeared:

```javascript
// (1) A glob whose LITERAL pattern is denied fails load.
assert.equal(renderPack("deniedGlob", packs, ctx).errors[0].code, "CONTEXT_PACK_DENYLIST");

// (2) A WILDCARD include that incidentally sweeps up a denied file: skip + warn, render continues.
const wild = renderPack("wildcardOverGovernance", packs, ctx);   // dir containing profiles.yaml
assert.equal(wild.errors.length, 0);
assert.ok(wild.warnings.some((w) => w.code === "CONTEXT_PACK_DENYLIST_SKIP"));
assert.ok(wild.rendered.length > 0);                                    // render continued
assert.ok(!wild.rendered.includes("profiles.yaml"));                    // path never NAMED
assert.ok(!wild.files.includes(".../profiles.yaml"));

// (3) An ENUMERATED include naming a denied file is a HARD ERROR (the symlink-evasion case).
assert.equal(renderPack("enumeratedDenied", packs, ctx).errors[0].code, "CONTEXT_PACK_DENYLIST_MATCH");

// (4) No new denylist code exists. Assert the exact set, so adding one trips this test.
assert.deepEqual(allDenylistCodesEmitted(packs, ctx).sort(), [
  "CONTEXT_PACK_DENYLIST", "CONTEXT_PACK_DENYLIST_MATCH", "CONTEXT_PACK_DENYLIST_SKIP",
]);

// (5) SEC-2 gap, asserted as current behavior with adev-plugin-j7pq.7 named in the test title.
//     Fixture: a file whose name embeds "\n.env". Today a bare `.env` line IS produced.
//     Assert today's behavior so the fix in j7pq.7 forces a deliberate update here.
```

Assertion 2's "path never NAMED" is the one that distinguishes manifest delivery from rev-4: under
inline delivery, skipping meant the *body* never shipped; under manifest delivery it must mean the
*path* never ships either.

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-manifest-denylist.test.mjs`
Expected: assertions 1, 3, 4 likely PASS immediately (pass-1 filtering is delivery-agnostic).
Assertion 2's "path never NAMED" is the real RED candidate — if Task 4's `files[]` population
(constraint 5) pushed from the pre-filter set rather than the post-filter `safe` set, a denied path
leaks into `files[]`. **That is a genuine bug to find here.** If every assertion passes on first run,
record that in the commit body.

- [ ] **Implement**

Only if assertion 2 fails: correct Task 4's `files[]` / manifest-body source to the post-denylist
`safe` set. No new codes.

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-manifest-denylist.test.mjs` → PASS
Then: `node --test tests/governance/context-pack.test.mjs` → PASS (the rev-4 22p-bis assertions must
be untouched — BEH-11 says "retained verbatim").
And, **if this task modified `lib/governance/context-pack.mjs`**:
`node --test tests/governance/context-pack-inline-parity.test.mjs tests/governance/context-pack-path-manifest.test.mjs` → PASS.
Every task that touches that file re-runs the parity guard; this one is no exception.

- [ ] **Commit**

```bash
git add tests/governance/context-pack-manifest-denylist.test.mjs lib/governance/context-pack.mjs
git commit -m "test(review): assert 22p-bis denylist parity for manifest entries

No new denylist code. BEH-11's 'a denied path is never named' is not
entailed for control-character paths — deferred to adev-plugin-j7pq.7
(SEC-2), asserted as current behavior."
```

---

### Task 7: Target-spec ownership + `TARGET_SPEC_OVERSIZE` (BEH-12) [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-12
**Depends on:** Task 2, Task 6 (which follows Task 4 → Task 5 in the spine)
**Files:**
- Create: `tests/governance/context-pack-manifest-budgets.test.mjs`
- Modify: `lib/governance/context-pack.mjs` (return `budgets` + `delivery` from `renderPack`), `lib/governance/dispatch-shape.mjs:76-109`

**Tests:** `tests/governance/context-pack-manifest-budgets.test.mjs` — create.

**Context to load:** see Task 7 Context above. **The Code-Resolution Finding at the top of this plan
is normative for this task.**

> **DEFERRED BLOCKER — SA-1 (`structural-architect:ownership-ambiguity:0111fab5`), owned by
> `adev-plugin-j7pq.7` for the *spec text*.** The *code* question is resolved: `renderPack` never
> inlines the target spec. This task implements SA-1's second recommendation — `specBlock` retains
> ownership, so BEH-12 is restated as a **dispatch-assembly guarantee** and `TARGET_SPEC_OVERSIZE` is
> re-anchored to a cap that actually binds. j7pq.7 owns amending BEH-12's and the Postconditions
> Delta's wording to match; this task must not amend the spec itself.
>
> **Do not add target-spec inlining to `renderPack`.** It would ship the spec twice in every prompt
> (once in the pack, once in the untouched `specBlock`) and would require overriding
> `defaults.yaml:54`'s `exclude: ["<target-spec>"]`, neither of which the "Behaviors narrowed" table
> declares.

- [ ] **Write failing test**

```javascript
// The target spec appears EXACTLY ONCE in the assembled prompt, and byte-exact.
const { dispatches } = buildReviewerDispatches(reviewer, ctx);
const prompt = dispatches[0].prompt;
assert.equal(occurrences(prompt, uniqueSentinelInTargetSpec), 1);
assert.ok(prompt.includes(ctx.targetSpecContent));            // byte-exact, untruncated

// It is NOT in the pack render at all — the pack is the manifest only.
assert.ok(!dispatches[0].contextPack.includes(uniqueSentinelInTargetSpec));

// It is exempt from both caps: renderPack's own accounting never saw it.
// A target spec far larger than max_total_bytes still emits whole.
const huge = buildReviewerDispatches(reviewerWithHugeTarget, ctx);
assert.ok(huge.dispatches[0].prompt.includes(hugeTargetContent));  // whole
assert.ok(!huge.dispatches[0].prompt.includes("…[adev: truncated"));  // no 22l marker
assert.ok(!huge.dispatches[0].prompt.includes("truncation-notice")); // no 22m aggregate

// TARGET_SPEC_OVERSIZE is a WARNING naming the path AND both sizes.
const w = huge.warnings.find((x) => x.code === "TARGET_SPEC_OVERSIZE");
assert.ok(w);
assert.match(w.message, /specs\/.*\.spec\.md/);
assert.match(w.message, new RegExp(String(Buffer.byteLength(hugeTargetContent))));
assert.match(w.message, new RegExp(String(resolvedMaxTotalBytes)));
assert.equal(huge.errors.length, 0);                          // warning, never an error

// Under delivery: inline the warning is NOT emitted (rev-4 behavior unchanged).
assert.equal(inlineDispatch.warnings.filter(isOversize).length, 0);

// renderPack exposes what dispatch-shape needs.
const r = renderPack("review-base-like", packs, ctx);
assert.equal(r.delivery, "manifest");
assert.equal(typeof r.budgets.maxTotalBytes, "number");

// review-base's exclude: ["<target-spec>"] still removes the target spec from the manifest.
assert.ok(!r.files.includes(relativeTargetSpecPath));
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-manifest-budgets.test.mjs`
Expected: FAIL — `renderPack` returns no `budgets` / `delivery`; `TARGET_SPEC_OVERSIZE` does not exist.
The "appears exactly once" and "emits whole" assertions should PASS immediately — that is the
Code-Resolution Finding being confirmed by test rather than by reading, and it is worth having.

- [ ] **Implement**

- `lib/governance/context-pack.mjs`: add `budgets` and `delivery` to `renderPack`'s return object and
  to its JSDoc `@returns` at `:181`. Return them on the early-error path too (`:195`) so callers never
  read `undefined.maxTotalBytes`.
- `lib/governance/dispatch-shape.mjs`, at the shared `specBlock` construction site (`:98-109`, one
  site serving all three stages): when `packRender.delivery === "manifest"` and
  `Buffer.byteLength(ctx.targetSpecContent, "utf8") > packRender.budgets.maxTotalBytes`, push
  `{ code: "TARGET_SPEC_OVERSIZE", message: ... }` to `warnings`, naming the path, the actual size and
  the cap. **No truncation, no marker** — emit `specBlock` exactly as today.
- Add a comment at the site recording that `specBlock` owns target-spec inlining, that this is why
  BEH-12's exemption needs no mechanism, and that `defaults.yaml:54`'s exclude prevents the
  double-ship.

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-manifest-budgets.test.mjs` → PASS
Then: `node --test tests/governance/context-pack.test.mjs tests/governance/context-pack-inline-parity.test.mjs tests/evals/configurable-governance/tier2-dispatch-shape.test.mjs` → PASS

- [ ] **Commit**

```bash
git add lib/governance/context-pack.mjs lib/governance/dispatch-shape.mjs tests/governance/context-pack-manifest-budgets.test.mjs
git commit -m "feat(review): warn TARGET_SPEC_OVERSIZE without truncating the target spec

specBlock in dispatch-shape.mjs retains ownership of target-spec
inlining; renderPack never inlined it. BEH-12 is implemented as a
dispatch-assembly guarantee per SA-1's second recommendation. Spec-text
re-anchoring is deferred to adev-plugin-j7pq.7."
```

---

### Task 8: Declare pack delivery in the bundled defaults (BEH-9) [specialist: none] [GATED ON adev-plugin-j7pq.7]

**Charter capability:** Bundled defaults preservation
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-9 (second half — the bundled declarations)
**Depends on:** Tasks 4, 5, 6, 7, 10, 12 — **and on `adev-plugin-j7pq.7`** (the only external dependency in this plan)
**Files:**
- Modify: `templates/review-specs/defaults.yaml` (`base`, `review-base`)

**Tests:** `tests/governance/context-pack-delivery-field.test.mjs` — **extend** (same behavior BEH-9;
`per-behavior` granularity puts the bundled-declaration assertions in the suite Task 2 created).

**Context to load:** see Task 8 Context above.

> **GATE — do not land this task until `adev-plugin-j7pq.7` closes SEC-1 and SEC-2.**
>
> This is the only task in the plan that actually exposes a reviewer to manifest delivery. Everything
> before it builds and tests the renderer against **fixture** packs, with no bundled pack opting in —
> including Tasks 10, 11 and 12, which were deliberately retargeted at fixture packs so this gate does
> not transitively block BEH-7, BEH-8 and the profile check. Flipping `review-base`
> while both gaps are open would ship, into the strongest position in the reviewer prompt:
> - an unneutralized `title=` attribute a directory name can escape (SEC-1), and
> - a manifest line that a hostile filename can turn into a bare `.env` read directive (SEC-2),
>   which BEH-7 then instructs the reviewer to act on and BEH-8 persists.
>
> Both were deferred by operator override, not fixed. The plan's ordering is the mitigation: the
> renderer is complete, tested, and inert until the gaps close. `/adev:implement` must treat this task
> as blocked on `adev-plugin-j7pq.7` rather than as ready.

- [ ] **Write failing test** (extend the Task 2 suite)

```javascript
// base stays inline — explicitly, so the three validate.yaml consumers are covered by
// a declaration and not by a default that a future edit could change.
assert.equal(resolveExtends("base", bundledPacks).delivery, "inline");

// review-base declares manifest, and all three reviewer packs INHERIT it.
assert.equal(resolveExtends("review-base", bundledPacks).delivery, "manifest");
for (const p of ["architecture", "security", "consistency"]) {
  assert.equal(resolveExtends(p, bundledPacks).delivery, "manifest");
}
// None of the three re-declares it — inheritance is doing the work (BEH-9's wording).
for (const p of ["architecture", "security", "consistency"]) {
  assert.equal(bundledPacks[p].delivery, undefined);
}
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-delivery-field.test.mjs`
Expected: FAIL — `review-base` resolves to `inline` (the default) because nothing declares `manifest`.

- [ ] **Implement**

`templates/review-specs/defaults.yaml`:
- `base:` gains `delivery: inline`, with a comment tying it to the three
  `templates/domains/software/validate.yaml` consumers (lines 54, 69, 113) and to rev-4 22o. Say
  **three**. The count was wrong once already.
- `review-base:` gains `delivery: manifest`, with a comment noting `architecture` / `security` /
  `consistency` inherit it and must not re-declare it.
- Do **not** add `delivery` to `architecture`, `security` or `consistency`.

- [ ] **Verify test passes**

Run: `npm test` — the full suite, not one file. This is the flip; the parity guard (Task 3), the
rev-4 suite, and the eval-tier dispatch-shape suite all need to be green together.
Expected: 10 pre-existing `tests/repomap/*` failures only.

- [ ] **Commit**

```bash
git add templates/review-specs/defaults.yaml tests/governance/context-pack-delivery-field.test.mjs
git commit -m "feat(review): declare review-base as delivery: manifest, base as inline"
```

---

### Task 9: Omission measurement against a 12-sibling charter (AC 2, 3, 11) [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** acceptance-level — criteria 2, 3 and 11
**Depends on:** Task 8
**Files:**
- Create: `tests/governance/context-pack-manifest-coverage.test.mjs`

**Tests:** `tests/governance/context-pack-manifest-coverage.test.mjs` — create.

**Context to load:** see Task 9 Context above.

> **This task measures `agent-reliable-state-artifacts` (12 sibling `*.spec.md`), not `review`
> (2 siblings).** Acceptance criterion 2 pins this: "Verified against `agent-reliable-state-artifacts`,
> not against `review` — a `review`-only measurement passes today and proves nothing." The `review`
> charter renders complete under rev-4 already, so a `review`-only test is a false all-clear. **Every
> test name in this suite must state which charter it measures.** Sibling counts verified at plan time:
> `agent-reliable-state-artifacts` = 12, `heuristics` = 14, `review` = 2.

- [ ] **Write failing test**

```javascript
const TARGET = ".context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md";

// AC 2 — zero omissions on a 12-sibling charter, for all three reviewer packs.
for (const pack of ["architecture", "security", "consistency"]) {
  const r = renderPack(pack, bundledPacks, { repoRoot, targetSpecPath: TARGET });
  const sections = parseSections(r.rendered, r.nonce);
  assert.ok(!sections.some((s) => s.attrs.role === "truncation-notice"),
    `${pack} against agent-reliable-state-artifacts (12 siblings): no truncation notice`);
  // Every non-denied matched file is either named in the manifest or is the excluded target spec.
  assert.deepEqual(missingFrom(r.files, matchedSetFor(pack, TARGET)), []);
}

// AC 3 — security and architecture are MATERIALLY different, and security's differentiators land.
const arch = renderPack("architecture", bundledPacks, ctxFor(TARGET));
const sec  = renderPack("security",     bundledPacks, ctxFor(TARGET));
assert.notEqual(denonce(arch.rendered, arch.nonce), denonce(sec.rendered, sec.nonce));
assert.ok(sec.files.includes(".context-index/governance/risk-policies.yaml"));
assert.ok(sec.files.includes(".context-index/governance/gates.yaml"));
assert.ok(!arch.files.includes(".context-index/governance/risk-policies.yaml"));

// AC 11 — rendered size no longer varies with the target charter's sibling count.
// review = 2 siblings, agent-reliable-state-artifacts = 12, heuristics = 14.
// Size still varies (more siblings = more path lines) but must remain LINEAR IN PATH TEXT,
// never capped: assert every one of the three renders omits nothing.
for (const t of [REVIEW_TARGET, ARSA_TARGET, HEURISTICS_TARGET]) {
  const r = renderPack("consistency", bundledPacks, ctxFor(t));
  assert.equal(omittedCount(r), 0, `consistency against ${charterOf(t)}: nothing omitted`);
}

// AC 1 corollary — no lifecycle sidecar in any of the three packs (Task 1's glob, now live).
for (const pack of ["architecture", "security", "consistency"]) {
  for (const f of renderPack(pack, bundledPacks, ctxFor(TARGET)).files) {
    assert.doesNotMatch(f, /\.(review|plan|validate|blockers)\.md$/);
  }
}
```

Note on AC 11's wording: the spec says "rendered manifest-pack size is independent of the target
charter's sibling count". Read literally that is false — one more sibling is one more path line. The
*measurable* invariant, and the one that matters, is that **nothing is ever omitted regardless of
sibling count**, which is what removes the target-dependence the spec measured. Assert that. Record
this reading in the commit body; if a reviewer disagrees, it is a spec-wording question for
`adev-plugin-j7pq.7`, not a code change.

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-manifest-coverage.test.mjs` against `HEAD` **before**
Task 8 lands. Expected: FAIL — `consistency` against `agent-reliable-state-artifacts` omits 13 of 32
(the post-Task-1, pre-Task-8 figure the spec measured), and `architecture` / `security` omit far more.

**This RED must be captured before Task 8 flips the bundled packs — after the flip it is
unobservable.** Two acceptable ways, pick one and record which in the commit body:

1. **Preferred:** take the measurement as Task 8's pre-flip baseline. Write this suite first, run it
   against pre-Task-8 `HEAD`, paste the omission counts into Task 8's commit body, then land Task 8 and
   land this suite green.
2. Write and run the suite on a scratch branch at pre-Task-8 `HEAD`, record the observed counts
   verbatim in this task's commit body, then rebase onto post-Task-8 `HEAD`.

Either way the commit body must carry the actual observed pre-flip numbers, not the spec's — if they
disagree with the spec's `OMITTED 13/32`, that disagreement is itself a finding worth reporting.

- [ ] **Implement**

No production change. This suite is the acceptance oracle for Tasks 1, 4 and 8 together. If it fails
after Task 8, the defect is in one of those tasks.

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-manifest-coverage.test.mjs` → PASS

- [ ] **Commit**

```bash
git add tests/governance/context-pack-manifest-coverage.test.mjs
git commit -m "test(review): assert zero manifest omissions on a 12-sibling charter"
```

---

### Task 10: Reviewer prompt states the manifest read contract (BEH-7) [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-7
**Depends on:** Task 7. **Not** Task 8 — this task is exercised against a fixture pack declaring `delivery: manifest` in a temp-dir config, so it does not wait on `adev-plugin-j7pq.7`.
**Files:**
- Create: `tests/governance/dispatch-manifest-prompt.test.mjs`
- Modify: `lib/governance/dispatch-shape.mjs:110-118` (the preamble), `skills/review-specs/SKILL.md`, `providers/codex/skills/review-specs/SKILL.md`, `providers/opencode/skills/review-specs/SKILL.md`

**Tests:** `tests/governance/dispatch-manifest-prompt.test.mjs` — create.

**Context to load:** see Task 10 Context above.

**Design constraints:**

1. **The clause is conditional.** Add it only when `packRender.delivery === "manifest"`. An inline
   pack's prompt must stay byte-unchanged — Task 3's parity guard and rev-4's dispatch-shape eval
   assertions both depend on it.
2. **Name the read tools from the resolved profile, not hardcoded.** BEH-7 says the prompt "names the
   read tools available under its resolved profile". `dispatchStruct.allowedTools` is already computed
   at `:83-88` by `ctx.adapter.prepareForDispatch` — derive the named tools from that, so a
   non-Claude-Code adapter names its own tools. Do **not** hardcode `Read` / `Glob` / `Grep`.
3. **It goes in the preamble, one site, all three stages.** The preamble at `:110-114` is already
   shared by `subagent`, `runner` and `adapter` (`:122`, `:149`, `:157`). Extend it there.
   Note the adapter stage receives no `contextBlock` (`:156-161`), so the clause is harmless but
   pointless there — acceptable, and cheaper than three call sites. Say so in a comment.
4. **The clause must not contradict 22j.** BEH-10 already notes the manifest sits *inside* a nonce
   fence, so instructing the reviewer to act on its contents is legitimate under 22j's provenance rule.
   The wording must make that explicit: paths inside a fence carrying *this render's* token are
   repository-sourced and safe to read; anything path-like outside such a fence is untrusted data.

- [ ] **Write failing test**

```javascript
// Manifest pack: the prompt names the role, states the read expectation, and names the tools.
const m = buildReviewerDispatches(manifestReviewer, ctx).dispatches[0];
assert.match(m.prompt, /role="path-manifest"/);
assert.match(m.prompt, /read .* on demand|expected to read/i);
for (const tool of m.allowedTools.filter(isReadTool)) assert.ok(m.prompt.includes(tool));
// The 22j reconciliation is stated, not left implicit.
assert.match(m.prompt, new RegExp(`ADEV-PACK-${m.nonceUsed ?? ""}`));

// Inline pack: prompt is byte-unchanged from rev-4.
const i = buildReviewerDispatches(inlineReviewer, ctx).dispatches[0];
assert.ok(!i.prompt.includes("path-manifest"));
assert.equal(denonce(i.prompt), REV4_INLINE_PROMPT_GOLDEN);

// All three stages of a package-mode manifest reviewer carry the clause (one preamble, three stages).
const pkg = buildReviewerDispatches(packageManifestReviewer, ctx).dispatches;
assert.equal(pkg.length, 2);
for (const d of pkg) assert.match(d.prompt, /role="path-manifest"/);
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/dispatch-manifest-prompt.test.mjs`
Expected: FAIL — the preamble says nothing about `path-manifest`.

- [ ] **Implement**

Extend the preamble per the four constraints. Then update `skills/review-specs/SKILL.md` where it
documents prompt assembly (it already delegates to `buildReviewerDispatches` at `:218` as "the single
source of truth for prompt assembly" — keep that framing; add only a short note that a
manifest-delivery pack's preamble carries the read contract, and do **not** duplicate the prompt text
into the skill).

**Provider mirror sync is mandatory.** `find providers -path "*review-specs/SKILL.md"` returns exactly
two: `providers/codex/` and `providers/opencode/`. Apply the same edit to both. Verify with a diff that
the three files' `review-specs` bodies agree on the changed section.

- [ ] **Verify test passes**

Run: `node --test tests/governance/dispatch-manifest-prompt.test.mjs` → PASS
Then: `npm test` — includes whatever mirror-parity check the repo runs over `providers/**`.

- [ ] **Commit**

```bash
git add lib/governance/dispatch-shape.mjs skills/review-specs/SKILL.md providers/codex/skills/review-specs/SKILL.md providers/opencode/skills/review-specs/SKILL.md tests/governance/dispatch-manifest-prompt.test.mjs
git commit -m "feat(review): tell manifest-pack reviewers to read path-manifest paths on demand"
```

---

### Task 11: `PROFILE_CANNOT_CONSUME_MANIFEST` [specialist: none]

**Charter capability:** Execution profile consumption
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** Error Cases Delta — `PROFILE_CANNOT_CONSUME_MANIFEST`; Preconditions Delta third bullet
**Depends on:** Task 2. **Not** Task 8 — the shipped configuration cannot exercise this path at all (see the test note below), so the check is verified entirely against fixture profiles and a fixture manifest pack.
**Files:**
- Create: `tests/governance/review-config-manifest-profile.test.mjs`
- Modify: `lib/governance/review-config.mjs:144-198`

**Tests:** `tests/governance/review-config-manifest-profile.test.mjs` — create.

**Context to load:** see Task 11 Context above.

**Structural constraint the implementer needs.** The existing `checkReadOnlyCompatible` call sits at
`:166`, **inside** the reviewer loop, which finishes at `:173` — before `mergePacks` runs at `:176`.
The pack's resolved `delivery` is therefore not known at `:166`. Two options; take the first:

1. **Second pass after `packsResult` (preferred).** After `:177`, walk `reviewers` again, resolve each
   one's `context_pack` through `resolveExtends(pack, packsResult.packs)`, and push
   `PROFILE_CANNOT_CONSUME_MANIFEST` for any whose resolved delivery is `manifest` while its profile
   posture lacks `filesystem-read` or `search`. Smaller blast radius; no existing error-emission order
   changes.
2. Hoisting `mergePacks` above the reviewer loop — rejected: it reorders which errors surface first
   and risks breaking `tests/governance/review-config.test.mjs`'s ordering assumptions.

Skip `enabled: false` reviewers, matching `:155-158`'s reasoning — a disabled reviewer never
dispatches, so it must not fail the load.

- [ ] **Write failing test**

```javascript
// A custom profile WITHOUT filesystem-read is rejected at LOAD, not at dispatch.
const cfg = loadReviewConfig(repoRoot, { /* reviewer on a no-read profile, pack: manifest */ });
const e = cfg.errors.find((x) => x.code === "PROFILE_CANNOT_CONSUME_MANIFEST");
assert.ok(e);
assert.match(e.message, /reviewer-id/);       // names the reviewer
assert.match(e.message, /profile-name/);      // names the profile
assert.match(e.message, /filesystem-read/);   // names the missing capability

// Same profile with an INLINE pack loads fine — the check is delivery-conditional.
assert.equal(inlineCfg.errors.filter(isCannotConsume).length, 0);

// Missing `search` alone also trips it.
assert.ok(noSearchCfg.errors.some(isCannotConsume));

// A DISABLED reviewer never trips it.
assert.equal(disabledCfg.errors.filter(isCannotConsume).length, 0);

// The bundled config is clean: all three reviewer profiles extend read-only, which grants both.
assert.equal(loadReviewConfig(repoRoot).errors.filter(isCannotConsume).length, 0);
```

The last assertion documents that this check is **unreachable with bundled configuration** —
`templates/governance/profiles.yaml:8-14` gives `read-only` both `filesystem-read` and `search`, and
`reviewer-fast` / `reviewer-capable` / `reviewer-reasoning` all extend it (`:31-42`). The test must
therefore construct a custom profile fixture; it cannot exercise this path through the shipped file.

- [ ] **Verify test fails**

Run: `node --test tests/governance/review-config-manifest-profile.test.mjs`
Expected: FAIL — the code does not exist.

- [ ] **Implement**

Option 1 above. Reject at load (`errors`, not `warnings`) — the spec's Error Cases row says "Reject the
reviewer at load; do not dispatch with paths it cannot read."

**Out of scope, explicitly:** do not move the denylist into the profile's filesystem-read policy, and
do not add path scoping to any reviewer profile. The spec scopes reviewer read-scoping out
("it belongs to the profile contract, not the pack contract"), and
`templates/governance/profiles.yaml`'s `read-only` deliberately grants unscoped `filesystem-read` +
`search` to all three reviewer profiles — 22m already depends on that.

- [ ] **Verify test passes**

Run: `node --test tests/governance/review-config-manifest-profile.test.mjs` → PASS
Then: `node --test tests/governance/review-config.test.mjs` → PASS (error ordering unchanged).

- [ ] **Commit**

```bash
git add lib/governance/review-config.mjs tests/governance/review-config-manifest-profile.test.mjs
git commit -m "feat(review): reject manifest-pack reviewers whose profile cannot read files"
```

---

### Task 12: Dispatch-record manifest audit capture (BEH-8) [specialist: none]

**Charter capability:** Context pack rendering (Auditability quality attribute)
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** BEH-8
**Depends on:** Task 10. **Not** Task 8 — fixture manifest pack, as with Task 10.
**Files:**
- Create: `tests/governance/dispatch-manifest-audit.test.mjs`
- Modify: `lib/governance/dispatch-shape.mjs` (dispatch struct + `renderReviewReport`), `skills/review-specs/SKILL.md`, both provider mirrors

**Tests:** `tests/governance/dispatch-manifest-audit.test.mjs` — create.

**Context to load:** see Task 12 Context above. **Planning finding 2 is normative for scope.**

> **Scope boundary — there is no dispatch-record writer in this repo.** "Dispatch record" appears only
> as prose and truncation-marker text: `skills/review-specs/SKILL.md:236`, `:239`;
> `lib/governance/review-config.mjs:273`, `:285`; `lib/governance/quality-gate.mjs:108`. No file is
> written; no path is defined. BEH-8 therefore cannot be satisfied by adding fields to it.
>
> **Conservative scope — the two halves land in the two places that already exist:**
> 1. *Manifest as issued* → structured data on the dispatch struct returned by
>    `buildReviewerDispatches`. Fully testable, no new artifact.
> 2. *Paths the reviewer reported reading* → the `.review.md` reviewer section via
>    `renderReviewReport`, plus a `skills/review-specs/SKILL.md` instruction that each reviewer report
>    which manifest paths it read.
>
> **Do not invent a new lifecycle artifact or path.** Creating one is a scope expansion that
> `/adev:validate` will flag, and new lifecycle artifacts are a human-approval boundary in spirit. If
> the implementer concludes a real dispatch-record file is required, **stop and escalate** rather than
> creating one.
>
> The spec claims **auditability, not reproducibility** — correct as written, and the test must not
> assert replay equivalence. Bare paths carry no content hashes.

- [ ] **Write failing test**

```javascript
// (1) The issued manifest is structured data on the dispatch struct: per include, in order.
const d = buildReviewerDispatches(manifestReviewer, ctx).dispatches[0];
assert.ok(Array.isArray(d.issuedManifest));
assert.deepEqual(d.issuedManifest.map((s) => s.title), ["Parent Charter", "Sibling Specs", "ADRs"]);
assert.deepEqual(d.issuedManifest.flatMap((s) => s.paths).sort(), d.contextPackFiles.sort());
// Ordering matches the rendered sections exactly (BEH-5).
assert.deepEqual(d.issuedManifest.flatMap((s) => s.paths),
                 parseSections(d.contextPack, nonce).flatMap((s) => s.body.split("\n")));

// (2) An inline reviewer carries no issued manifest — the field is absent, not empty.
assert.equal("issuedManifest" in inlineDispatch, false);

// (3) The review report records both halves, and labels them auditability.
const md = renderReviewReport({ ..., dispatches, findings, readPaths: { "security-reviewer": [...] } });
assert.match(md, /Manifest issued/);
assert.match(md, /Paths reported read/);
assert.match(md, /audit/i);
assert.ok(!/reproducib/i.test(md));   // must NOT claim reproducibility

// (4) A reviewer that reports reading a path NOT in its manifest is recorded, not dropped.
//     BEH-8 is explicit that the record "cannot bound reads the reviewer makes outside the manifest".
assert.match(md, /outside the manifest|not in manifest/i);

// (5) Byte-stability: renderReviewReport stays deterministic for equal inputs (rev-4 contract).
assert.equal(renderReviewReport(args), renderReviewReport(args));
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/dispatch-manifest-audit.test.mjs`
Expected: FAIL — no `issuedManifest`, and `renderReviewReport` (`:201-245`) has no `readPaths`
parameter and no manifest section.

- [ ] **Implement**

- `buildReviewerDispatches`: attach `issuedManifest` (array of `{ title, glob, paths }`, include order
  preserved) to each dispatch struct **only** when delivery is `manifest`. Source it from `renderPack`
  — do not re-parse the rendered text.
- `renderReviewReport`: accept an optional `readPaths` map keyed by reviewer id; render a
  "Manifest issued" count/list and a "Paths reported read" list per reviewer, with an explicit
  auditability caveat sentence. Keep it byte-stable and keep the existing signature backward
  compatible (a caller passing no `readPaths` must produce today's output byte-for-byte — assert that).
- `skills/review-specs/SKILL.md`: in the reviewer output contract, instruct a manifest-pack reviewer to
  list the manifest paths it actually read. Mirror to `providers/codex/` and `providers/opencode/`.

- [ ] **Verify test passes**

Run: `node --test tests/governance/dispatch-manifest-audit.test.mjs` → PASS
Then: `npm test`.

- [ ] **Commit**

```bash
git add lib/governance/dispatch-shape.mjs skills/review-specs/SKILL.md providers/codex/skills/review-specs/SKILL.md providers/opencode/skills/review-specs/SKILL.md tests/governance/dispatch-manifest-audit.test.mjs
git commit -m "feat(review): record the issued manifest and reviewer-reported reads

Auditability, not reproducibility. No new lifecycle artifact: the two
halves land on the dispatch struct and in .review.md, because no
dispatch-record writer exists in the tree."
```

---

### Task 13: Repoint this repo's own reviewer registry [specialist: none]

**Charter capability:** Configurable reviewer registry
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** none directly — this makes BEH-9/BEH-10 effective in this repo
**Depends on:** Task 8, Task 9
**Files:**
- Modify: `.context-index/governance/review.yaml:34,42,50`

**Tests:** `tests/governance/context-pack-manifest-coverage.test.mjs` — **extend** (same acceptance
surface as Task 9).

**Context to load:** see Task 13 Context above. **Planning finding 1 is normative.**

> **Why this task exists.** `.context-index/governance/review.yaml` pins `context_pack: base` on all
> three reviewers. Per `skills/review-specs/SKILL.md:170-178` the set that actually dispatches is the
> **project's own file** — "neither the bundled defaults nor the domain overlay contributes at run
> time". Because BEH-9 deliberately keeps `base` at `delivery: inline`, this repo's reviews would get
> no manifest delivery at all: the amendment would be inert in the very repo whose omission rates the
> spec measured. `templates/domains/software/reviewers.yaml` already points at
> `architecture` / `security` / `consistency`; the project file was left behind.
>
> This is the same class of finding rev-4's plan raised about `templates/domains/software/reviewers.yaml`
> ("repointing `defaults.yaml` alone would leave the live software-domain path still requesting
> `base`"). One layer down, same trap.
>
> **The `materialized_at` marker at `review.yaml:62` is not a bar to this.** It is write-once for
> *re-materialization*; the file's own header (`:8-9`) says "materialized from the software domain
> profile … **edit them directly to customize**". A hand edit is in-contract. Do not re-run
> `adev governance materialize`.

- [ ] **Write failing test** (extend the Task 9 suite)

```javascript
// The project's OWN dispatching registry resolves to manifest-delivery packs.
const cfg = loadReviewConfig(REPO_ROOT);
const byId = Object.fromEntries(cfg.reviewers.map((r) => [r.id, r]));
assert.equal(byId["structural-architect"].context_pack, "architecture");
assert.equal(byId["security-reviewer"].context_pack, "security");
assert.equal(byId["consistency-analyzer"].context_pack, "consistency");
for (const r of cfg.reviewers) {
  assert.equal(resolveExtends(r.context_pack, cfg.contextPacks).delivery, "manifest");
}
// And it matches the software domain overlay, so the two layers no longer disagree.
assert.deepEqual(packsOf(cfg.reviewers), packsOf(domainReviewers));
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/context-pack-manifest-coverage.test.mjs`
Expected: FAIL — all three resolve to `base`, delivery `inline`.

- [ ] **Implement**

`.context-index/governance/review.yaml`: `context_pack: base` → `architecture` (line 34), `security`
(line 42), `consistency` (line 50). Add a comment above the block recording why (the project file is
the dispatching set; `base` is inline by design) so the next reader does not "helpfully" revert it.

This is a governance-config change with real effect on every future review in this repo. It is **not**
on the constitution's human-approval list (that list covers lifecycle order, hook protocol, CLI
install paths, plugin registration format, and new dependencies), so it proceeds autonomously — but
call it out in the commit body and in `/adev:validate`'s scope review.

- [ ] **Verify test passes**

Run: `node --test tests/governance/context-pack-manifest-coverage.test.mjs` → PASS
Then: `npm test`.

- [ ] **Commit**

```bash
git add .context-index/governance/review.yaml tests/governance/context-pack-manifest-coverage.test.mjs
git commit -m "chore(review): repoint this repo's reviewers off the inline base pack"
```

---

### Task 14: Document `delivery` and the path-manifest section shape [specialist: none]

**Charter capability:** Context pack rendering
**Strategy:** unit (source: fallback, confidence: high)
**Behavior:** documentation of BEH-9, BEH-10
**Depends on:** Task 2, Task 4. Task 8's declarations are already decided by then, so the prose can be written before the flip lands.
**Files:**
- Modify: `docs/governance.md:320-380` (the context-pack section; `#### Size bounding` begins at `:375`)

**Tests:** none — this is prose. `/adev:validate`'s doc-drift check is the gate.

Per CLAUDE.md, "Updating internal documentation" is autonomous, and updating docs when code changes
their assumptions is **required, not optional**.

**Context to load:** see Task 14 Context above.

- [ ] **Document**

In `docs/governance.md`'s context-pack section (the YAML example at `:361-373` and the size-bounding prose at `:377-381`,
`:378`):

- Add `delivery: inline | manifest` to the documented pack schema, stating the default is `inline` and
  that it is inherited through `extends` with the same nearest-declaration precedence as
  `max_file_bytes` / `max_total_bytes`.
- Show the `role="path-manifest"` section shape: one section per include, `title` attribute with its
  fallback chain, one repo-relative path per line, `<no matches>` for an empty include.
- State which bundled packs use which: `base` is `inline` (and why — the **three** constitution-
  compliance checks in `templates/domains/software/validate.yaml`); `review-base` is `manifest` and
  `architecture` / `security` / `consistency` inherit it.
- Amend the size-bounding prose (`:377-381`): under `delivery: manifest` the target spec is exempt from both caps
  and is never truncated, and no `role="truncation-notice"` section is emitted.
- Add a short **Known limitations** note naming `adev-plugin-j7pq.7` and both open gaps: fence-header
  attribute values are not neutralized, and a path containing a control character can produce an
  unintended manifest line. Users configuring a `manifest` pack over an untrusted tree deserve to know
  this before j7pq.7 lands.

- [ ] **Verify**

Run: `npm test` (no doc test exists; this confirms nothing regressed).
Read the section back and confirm no claim contradicts the "Behaviors narrowed" table: 22k unchanged
for inline, 22l unchanged, 22m fully retained for inline and unreachable for manifest, 22n retained
verbatim, 22o preserved, 22p-bis retained verbatim.

- [ ] **Commit**

```bash
git add docs/governance.md
git commit -m "docs(review): document per-pack delivery and path-manifest sections"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are
recorded in the validation report (`.validate.md`), not in this plan.

`.context-index/governance/gates.yaml` exists, so its gate definitions govern. From the constitution's
Quality Gates section, the deterministic command gate is:

- Tests pass: `npm test`
  - **Baseline:** 7077 tests / 7035 pass / 10 fail. All ten failures are in
    `tests/repomap/{index,parse,non-code-references.integration,render-non-code-sections}.test.mjs`
    with `ENOENT` on the tree-sitter wasm asset, and are pre-existing. Any new failure **outside those
    four files** is a real regression.
- No lint or typecheck command is defined for this project (zero-dependency, no TS) — those gates are
  not applicable and should be reported as such, not as passing.

Probabilistic / no-command gates from `gates.yaml` are noted as skipped for this plan and evaluated by
`/adev:validate`.

### Acceptance criteria coverage

| # | Criterion (abbreviated) | Covered by |
|---|---|---|
| 1 | `consistency` matches 18 specs, not 55; no sidecars in any pack | Task 1, re-asserted Task 9 |
| 2 | Zero omissions on a **12+ sibling** charter (`agent-reliable-state-artifacts`, not `review`) | Task 9 |
| 3 | `security` ≠ `architecture`; `risk-policies.yaml` + `gates.yaml` reachable | Task 9 |
| 4 | A pack not declaring `delivery` renders byte-identically to rev 4, on `base` against the **three** `validate.yaml` consumers | Task 3, guarded by Tasks 4/5/6/7/8 |
| 5 | Target spec inlined whole and byte-exact; oversize warns without truncating | Task 7 |
| 6 | A file/dir **NAME** cannot forge a section or fence | Task 5 — **partly only.** Body side satisfied; fence-header `title=` remains unneutralized, deferred to `adev-plugin-j7pq.7` (SEC-1) |
| 7 | Every manifest section nonce-fenced `role="path-manifest"`; empty include still emits `<no matches>` | Task 4 |
| 8 | Enumerated → `CONTEXT_PACK_DENYLIST_MATCH`; wildcard → `CONTEXT_PACK_DENYLIST_SKIP`; no new code | Task 6 — **partly only.** Parity asserted; "a denied path is never named" not entailed for control-character paths, deferred to `adev-plugin-j7pq.7` (SEC-2) |
| 9 | A profile without `filesystem-read` / `search` is rejected, not dispatched | Task 11 |
| 10 | Dispatch record shows manifest issued + paths reported read; claims auditability | Task 12 — scoped to the dispatch struct and `.review.md`; no dispatch-record artifact exists |
| 11 | Rendered manifest-pack size independent of sibling count | Task 9 — asserted as "nothing omitted at any sibling count"; see the reading recorded in that task |
| 12 | Token/cost claims measured from session JSONL, never bytes/4 | **No task makes a token or cost claim.** Vacuously satisfied; if a claim is added later, the module heuristic applies |
| 13 | All quality gates pass; no constitutional violations | This section |

**Two acceptance criteria (6 and 8) cannot be fully satisfied by this plan.** That is a direct
consequence of the operator override that deferred SEC-1 and SEC-2 to `adev-plugin-j7pq.7`, and Task 8's
gate is the mitigation: the renderer ships complete and inert, and no reviewer pack declares
`delivery: manifest` until those blockers close. `/adev:validate` should report both as partial, not as
passing.

**Three further criteria — 2, 3 and 11 — have their verification deferred by that same gate**, because
all three are covered solely by Task 9, which measures the *bundled* packs and therefore cannot run
until Task 8 lands. Criteria 9 and 10 are **not** affected: Tasks 11 and 12 were retargeted at fixture
packs precisely so the gate would not swallow them. Net position at the moment `adev-plugin-j7pq.7` is
still open:

| Criteria | Status while j7pq.7 is open |
|---|---|
| 1, 4, 5, 7, 9, 10, 12 | verifiable and expected to pass |
| 6, 8 | **partial** — the deferred security gaps are the reason |
| 2, 3, 11 | **not yet verifiable** — blocked behind Task 8's gate |
| 13 | gates green apart from the ten pre-existing `tests/repomap/*` failures |

### Error Cases Delta coverage

Every row of the spec's Error Cases Delta table maps to a task, so no declared code ships unreachable.

| Error code | Severity | Covered by |
|---|---|---|
| `INVALID_PACK_DELIVERY` | error | Task 2 |
| `CONTEXT_PACK_NO_TARGET` | error | Task 4, design constraint 7 — reused, not re-invented. Planning finding 4 explains why a delivery-level check is needed rather than relying on `review-base` carrying a `<charter-dir>` token. |
| `TARGET_SPEC_OVERSIZE` | **warning** | Task 7 — asserted as a warning with zero errors and no truncation marker |
| `CONTEXT_PACK_FENCE_COLLISION` | **warning** | Task 5 — body side only; header `title=` deferred to `adev-plugin-j7pq.7` |
| `PROFILE_CANNOT_CONSUME_MANIFEST` | error | Task 11 — unreachable with bundled config, so verified against a fixture profile |
| `CONTEXT_PACK_DENYLIST` / `_SKIP` / `_MATCH` | error / warning / error | Task 6 — parity only; **no new code added**, asserted by an exact-set check |

### Constitution compliance

| Principle | Status |
|---|---|
| Minimize external dependencies | **Met.** Paths use the already-imported `node:path`; nonces use the existing `crypto.randomBytes`. Zero new dependencies, no ADR required. |
| Skills are primarily markdown | **Met.** Tasks 10 and 12 add prose to `skills/review-specs/SKILL.md`; all logic lives in `lib/governance/`. No executable logic, no inline-Node, no `node -e`, and no fenced-JavaScript directive enters any SKILL.md. |
| Pure ESM | **Met.** All new and modified files are `.mjs`. |
| Hook protocol compliance | **N/A.** No hook is touched. |
| Version parity | **Met by omission.** No task touches `package.json`, `.claude-plugin/plugin.json` or `.cursor-plugin/plugin.json` — release-please owns them (ADR-0008). |
| Commit trailers | **Met.** Every task's commit carries `Spec:` and `Plan-task:`. |
| TDD | **Met.** Every task writes a failing test before implementing. Tasks 3, 6 and 9 are pure regression/acceptance guards and say so explicitly rather than manufacturing a change to justify a RED. |
| Provider mirrors | **Met.** Tasks 10 and 12 sync `providers/codex/` and `providers/opencode/` — the only two mirroring `review-specs`. |
| Boundary rules (`governance/boundaries.yaml`) | No boundary pattern is crossed: all production changes stay within `lib/governance/`, `templates/`, `skills/review-specs/`, `docs/` and `.context-index/governance/`. Task 13 touches a governance config and is called out for scope review. |
| Human-approval boundaries | **None triggered.** No new skill, no lifecycle-order change, no hook-protocol change, no CLI install-path change, no plugin-registration-format change, no new dependency. |


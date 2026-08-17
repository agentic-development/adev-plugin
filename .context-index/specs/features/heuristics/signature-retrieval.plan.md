<!-- partial_schema: plan@1 -->

# Implementation Plan: Signature Retrieval — consult the store at the moment something fails

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md (revision 6, Phase 3)
> **Spec:** .context-index/specs/features/heuristics/signature-retrieval.spec.md (revision 3)
> **Review:** PASS_WITH_NOTES (2026-08-15, quick tier, 0 blockers — 13 → 3 → 0 across three rounds)
> **Platform:** Node.js, JavaScript (ESM `.mjs`), npm, `node:test`. Zero external dependencies.

**Goal:** Add an exact-match `signature` axis to `retrieveHeuristics`, exempt exact matches from the
`low`-confidence floor with an off-the-top budget allocation, expose the axis on the `heuristics
retrieve` verb, and wire error-triggered re-query at exactly two lifecycle failure surfaces so a
recurring failure surfaces its own prior lesson at the moment it recurs.

**Architecture:** This is the read half of a loop whose write half already shipped
(`failure-capture`, `failure-signature-key`). Both siblings are validated on this branch's history,
so every task below is planned against live code, not intent. The design hinges on one thing: the
read side derives its lookup key through the *same exported helper* the capture side uses. Task 1
extracts that helper from the shipped hook and is deliberately first — if the two compositions drift,
the loop silently never closes while every ranking test still passes. Everything after Task 1 is
either ranking arithmetic inside `retrieveHeuristics`'s existing single-pass sort + budget loop
(`lib/heuristics.mjs:1350-1452`), a flag on `runRetrieve` (`lib/cli/heuristics.mjs:135-216`), or a
call site at one of the two surfaces Behavior 6's table defines.

---

## Scope Boundaries (read before writing any code)

These are decided. Do not relitigate them during implementation.

1. **The exclusion line is `lib/heuristics.mjs:1442`** — `if (entry.confidence === "low") continue;`
   inside `retrieveHeuristics`'s budget loop (`:1441` is the loop header). **`:1204` is
   `demoteHeuristic`'s branch whose body is `archiveHeuristic(projectRoot, id, "demoted-below-low")`.
   Editing `:1204` would alter demotion and write archive entries.** No task in this plan touches
   `demoteHeuristic`.

2. **CARRY-FORWARD — the spec's Error Cases row is inaccurate about the unreadable-store shape.**
   The spec's row "Store missing or unreadable" states `{"count":0,"rendered":""}` (two keys). The
   **live** catch path in `lib/cli/heuristics.mjs` (the `catch` at `:198-206`, emit at **`:203`**)
   emits a **third `error` key**: `{"count":0,"rendered":"","error":"<message>"}`. The two-key shape
   is correct only for the *ordinary empty-result* path at **`:214`**. An implementer following the spec row literally would
   delete the `error` key and regress existing CLI output. **Task 7 preserves the live three-key
   shape on the unreadable-store path** and pins both shapes with separate assertions. The spec row
   is recorded here as a known spec inaccuracy; it is not a code change.

3. **Exactly two surfaces are wired** (Behavior 6's table): validate FAIL and review-specs BLOCK.
   Both are **skill-prose call surfaces** — `skills/validate/SKILL.md` and
   `skills/review-specs/SKILL.md` — each naming CLI verbs. Implement-task failure and recover
   dispatch are **out of scope** — no task wires them, and Task 11 is a negative test asserting they
   do not trigger it.

3a. **The validate-FAIL surface is a skill, not the Stop hook — and this is a decision, not an
   oversight.** `hooks/post-validate-extract-heuristics.sh` is registered under **`Stop`** in
   `hooks/hooks.json`. Every injecting hook in this repo delivers context through
   `hookSpecificOutput.additionalContext` (`hooks/sync-trigger.sh:50`, `hooks/context-preflight.sh:71`,
   `hooks/issue-reminder.mjs:217`, `hooks/session-start.sh`, `hooks/lifecycle-gate.sh`) — and every
   one of those is a `SessionStart`, `PreToolUse`, or `PostToolUse` hook. A `Stop` hook has no
   equivalent non-blocking model-context channel: its only channel that reaches the model is
   `decision: "block"` + `reason`, which this spec forbids outright (Behavior 8 — retrieval never
   blocks and never alters the verdict). A `systemMessage` is a user-visible notice, not model
   context, so injecting through it would leave Behavior 6's "injected into the agent's context"
   quietly unsatisfied while every test still passed — the same silently-passing failure mode
   Behavior 0 exists to prevent, one level up.

   Therefore: **the Stop hook stays capture-only and its stdout contract is untouched**
   (`{}`, exit 0, unchanged bytes on every path). The validate-FAIL re-query is wired in
   `skills/validate/SKILL.md`'s FAIL path, which holds the live verdict — including `checks[]` — at
   the moment it renders FAIL. This mirrors Task 10's review-specs approach and keeps both surfaces
   uniform. **No task in this plan modifies `hooks/post-validate-extract-heuristics.sh` or the hook's
   stdout payload.**

4. **Retrieval fires from the LIVE failure payload, never the lifecycle log.** A
   `.context-index/lifecycle-state/*.jsonl` record carries `validator` and `verdict` but no
   `checks[]`, so the key is underivable there. Task 11 pins this with an assertion.

4a. **One composition survives the move to skill prose.** A skill cannot run inline Node, and having
   the agent dedupe/sort/join the failing check IDs in prose would mint a *second* composition —
   exactly what Behavior 0 forbids. So Task 9 adds a repeatable `--check-id` flag to the existing
   `adev heuristics signature` verb; the verb passes the raw IDs to Task 1's single exported helper,
   which does the dedupe, sort, join, and hash. The agent supplies raw IDs and composes nothing.

5. **Failure heuristics stay at `low` permanently** (hook-path promotion is structurally
   unreachable — `failure-capture.spec.md` Behavior 4a). No task or acceptance criterion in this plan
   depends on a failure entry reaching `medium` or `high`.

6. **Explicitly out of scope, do not touch:** the Phase 3 charter amendment for the Context Budget
   wording; the documentation-only revision 9 of `failure-signature-key.spec.md`; anything already
   shipped by the two sibling specs; running `adev heuristics migrate-keys` against any real store.

   > **Editorial follow-up (record only, do NOT fix here).** The spec's recorded Phase 3 charter
   > follow-up covers only the high/medium *composition* wording at `charter.md:214`. Behaviors 4 and
   > 7 additionally widen that row's "signature-matched entries only" phrase to "signature-matched
   > where any exist, otherwise module-scope within the same cap". The charter amendment is
   > deliberately out of this spec's scope; this note exists so the amendment, when written, covers
   > both phrases.

7. **Repo constraints (CLAUDE.md, non-negotiable).** Zero new external dependencies — Node.js
   built-ins only. Pure ESM `.mjs`, no CommonJS. No inline Node in `SKILL.md`; skills name a CLI
   verb (hook `.mjs` code may import lib functions directly). Every commit carries a `Spec:` trailer.
   Quality gate is `npm test`. **Every hook path must exit 0** — retrieval must never block, retry,
   or alter a failure verdict.

---

## File Structure

**Create:**
- `tests/lib/heuristics-lookup-key.test.mjs` — Behavior 0/0a: shared derivation helper + the
  grep assertion that no second composition of `deriveSignature` inputs exists
- `tests/lib/heuristics-signature-retrieval.test.mjs` — Behaviors 1, 2, 2a, 3, 4 and the
  "Injection cap reached" error row: ranking, exemption scoping, off-the-top budget, dedup, capped
  fallback, and the zero-match arithmetic-identity assertion
- `tests/cli/heuristics-retrieve-signature.test.mjs` — Behavior 5 and Error Cases rows 1-2: both
  empty shapes, malformed `--signature`, unchanged exit-1 argument-error paths
- `tests/skills/validate-error-retrieval.test.mjs` — Behaviors 6 (validate row), 8, 9 plus the
  end-to-end key-agreement criterion
- `tests/skills/review-specs-error-retrieval.test.mjs` — Behavior 6 (review-specs row) and the
  two-surfaces-only negative assertions

**Modify:**
- `lib/heuristics.mjs:210-212` — add the shared lookup-key helper next to `deriveSignature`
- `lib/heuristics.mjs:1330-1349` — extend the `RetrieveOptions` typedef + JSDoc with `signature`
- `lib/heuristics.mjs:1350` — accept `signature` in the destructured options
- `lib/heuristics.mjs:1409-1431` — compute `_signatureMatch` per entry; add signature as the
  primary comparator term
- `lib/heuristics.mjs:1435-1449` — off-the-top allocation, `low` exemption scoped to exact matches,
  reduced-limit high/medium split
- `lib/heuristics.mjs:1453` — strip `_signatureMatch` alongside the existing internal tags
- `lib/cli/heuristics.mjs:135-216` — `--signature` on `runRetrieve`; preserve both empty shapes
- `lib/cli/heuristics.mjs:281-420` — repeatable `--check-id` on `runSignature` (derived mode,
  origin `validate`), delegating the composition to Task 1's helper
- `lib/cli/heuristics.mjs` usage/help strings — the top-level `USAGE` const at `:96-97`, the
  `runRetrieve` usage lines at `:152` and `:164`, `SIGNATURE_USAGE` at `:232-234`, the header comment
  at `:62`, and the `help()` body at `:1064-1071`
- `hooks/post-validate-extract-heuristics.mjs:178-201` — FAIL branch calls the shared helper
  (**capture only** — the hook gains no retrieval and its `.sh` wrapper is not touched; see Scope
  Boundaries §3a)
- `skills/validate/SKILL.md` (the FAIL verdict path) — signature-keyed re-query named as CLI verbs
- `skills/review-specs/SKILL.md` (~`:315`, the BLOCK / `.blockers.md` sidecar step) — signature-keyed
  re-query named as CLI verbs
- `.context-index/manifest.yaml` — document `heuristics.error_injection_limit` (default 3)
- `docs/cli-reference.md:523-532` — `--signature` in the `heuristics` verb signature and example

**Reference (read, do not modify):**
- `.context-index/specs/features/heuristics/failure-signature-key.spec.md` — Behaviors 1, 3a, 5a:
  `deriveSignature`, inherited mode, `--digest-only`
- `.context-index/specs/features/heuristics/failure-capture.spec.md` — Behavior 4a: why failure
  entries stay `low` forever
- `hooks/post-validate-extract-heuristics.mjs:178-201` — the shipped capture composition Task 1
  extracts; the read side must match it byte-for-byte in behavior
- `lib/cli/heuristics.mjs:280-380` — the `signature` verb's inherited mode, consumed by Task 10
- `tests/cli/heuristics-signature.test.mjs`, `tests/hooks/post-validate-heuristic-id.test.mjs` —
  follow these harness patterns for spawn-based hook and CLI assertions
- `tests/helpers.mjs` — `PLUGIN_ROOT`, `createTempDir()`, `cleanupTempDir()`, `writeFixture()`

---

## Context Packets

### Task 1 Context
- Spec: `signature-retrieval.spec.md` (Behaviors 0, 0a; criteria "End-to-end key agreement", "Read
  and write derive the key through the same exported helper")
- Charter: `heuristics/charter.md` (capability: Signature-Keyed Retrieval)
- Source (full read): `hooks/post-validate-extract-heuristics.mjs:150-230`
- Source (signatures only): `lib/heuristics.mjs:144-232` (`normalizeFailureText`, `deriveDigest`,
  `deriveSignature`)
- Sibling spec: `failure-signature-key.spec.md` (Behavior 1)
- Test pattern: `tests/hooks/post-validate-heuristic-id.test.mjs`
- Heuristics: 3 entries for module `heuristics` (see the Heuristics section below)

### Tasks 2-6 Context
- Spec: `signature-retrieval.spec.md` (Behaviors 1, 2, 2a, 3, 4; Error Cases "Injection cap reached",
  "An entry carries a malformed `signature`")
- Charter: `heuristics/charter.md` (capability: Signature-Keyed Retrieval; Context Budget invariant)
- Source (full read): `lib/heuristics.mjs:1330-1452` (`retrieveHeuristics` end to end)
- Source (reference only): `lib/heuristics.mjs:717` (`CONFIDENCE_RANK`), `:769` (`readHeuristics`)
- Sibling spec: `failure-capture.spec.md` (Behavior 4a — why the exemption is permanent)
- Test pattern: `tests/lib/heuristics-tags-and-tiers.test.mjs` (the closest existing retrieval suite)

### Task 7 Context
- Spec: `signature-retrieval.spec.md` (Behavior 5; Error Cases rows 1-2)
- Source (full read): `lib/cli/heuristics.mjs:135-216` (`runRetrieve`)
- **Carry-forward:** `lib/cli/heuristics.mjs:203` emits three keys; `:214` emits two. Both are
  load-bearing and must be pinned by separate assertions.
- Test pattern: `tests/cli/heuristics.test.mjs`, `tests/cli/heuristics-signature.test.mjs`

### Task 8 Context
- Spec: `signature-retrieval.spec.md` (Behavior 7, Behavior 4's "caller's own cap")
- Source (signatures only): `lib/manifest.mjs:45` — `loadManifest(projectRoot)` is **synchronous**;
  do not `await` it
- Source (full read): `lib/cli/heuristics.mjs:169-195` (the `injectionLimit` resolution in
  `runRetrieve`, as left by Task 7)
- Config: `.context-index/manifest.yaml` (`test_policy` block shows the documented-knob style)

### Task 9 Context
- Spec: `signature-retrieval.spec.md` (Behavior 6 row 1, Behaviors 8, 9; Error Cases rows 3, 5)
- Plan: Scope Boundaries §3a and §4a — why this is a skill surface, and how one composition survives
- Source (full read): `lib/cli/heuristics.mjs:281-420` (`runSignature`), `skills/validate/SKILL.md`
  (the FAIL verdict path and the existing Step 0 heuristics block at `:112-118`)
- Source (reference only): `hooks/post-validate-extract-heuristics.mjs` — capture only, not modified
  by this task
- Constitution anti-pattern: fenced JavaScript in `SKILL.md` is descriptive-reference only
- Test pattern: `tests/skills/plan-heuristic-injection.test.mjs`,
  `tests/cli/heuristics-signature.test.mjs`

### Task 10 Context
- Spec: `signature-retrieval.spec.md` (Behavior 6 row 2), `failure-signature-key.spec.md`
  (Behavior 3a — inherited mode)
- Source (full read): `skills/review-specs/SKILL.md:300-325`
- Source (signatures only): `lib/blocker-id.mjs` (`parseBlockerId`), `lib/cli/heuristics.mjs:349-377`
  (inherited-mode output form `review-specs-<locationHash>`)
- Constitution anti-pattern: fenced JavaScript in `SKILL.md` is descriptive-reference only; the step
  names `adev heuristics signature` and `adev heuristics retrieve`

### Tasks 11-13 Context
- Spec: `signature-retrieval.spec.md` (Behavior 6 exclusion paragraph; all acceptance criteria)
- Source (grep only): `skills/implement/SKILL.md`, `skills/recover/SKILL.md` — assert absence
- Docs: `docs/cli-reference.md:522-532`

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

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

> **Relevance to this plan (Heuristic 2).** Behavior 7's independent cap of 3 exists for exactly the
> reason the cache-read heuristic states: error-triggered injection lands *inside an already-running
> task*, where every injected token persists as a cache read on all subsequent turns. Do not raise
> the default, and do not let the Behavior 4 fallback escalate to the entry-time 8.

---

## Parallelization

- **Group A (sequential, `lib/heuristics.mjs`):** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6.
  Tasks 2-6 all edit the same 120-line region of `retrieveHeuristics`; they must not run concurrently.
  Task 1 is first for the reason stated in the spec's Behavior 0, not for file-dependency reasons.
- **Group B (sequential, `lib/cli/heuristics.mjs`, after Task 2):** Task 7 → Task 8. **Task 8 is not
  independent** — it edits `runRetrieve` between `:189` and `:190`, the same function Task 7 modifies,
  and its guard condition must match Task 7's forwarding condition textually. Task 8 also touches
  `lib/heuristics.mjs` (the resolver export) and `.context-index/manifest.yaml`.
- **Group D (sequential, after A and B):** Task 9 (`signature --check-id` + `skills/validate/SKILL.md`)
  → Task 12 (end-to-end agreement). Task 9 edits `runSignature` in `lib/cli/heuristics.mjs`, so it
  must not run concurrently with Task 7 or Task 8.
- **Group E (after B):** Task 10 (`skills/review-specs/SKILL.md`) — no file overlap with D.
- **Group F:** Task 13 (docs).
- **Group G (strictly last):** Task 11 (surface sweep). It must run after D, E, and F, because its
  assertion is about the final state of the call-surface set.

Group B may run in parallel with Group A only until Task 2 lands; after that, Group B's own internal
order (7 → 8) is mandatory. Groups D and E can run in parallel with each other, but neither may
overlap Group B — three of the four tasks in D and B write to `lib/cli/heuristics.mjs`.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Shared lookup-key derivation helper | medium | unit | — | 1 create, 2 modify |
| 2 | `signature` param + signature-primary ranking | small | unit | Task 1 | 1 create, 1 modify |
| 3 | Exempt exact matches from the `low` floor | medium | unit | Task 2 | 0 create, 1 modify |
| 4 | Signature-first off-the-top budget allocation | medium | unit | Task 3 | 0 create, 1 modify |
| 5 | Dedup across axes | small | unit | Task 4 | 0 create, 1 modify |
| 6 | Capped fallback to module scope | small | unit | Task 4 | 0 create, 1 modify |
| 7 | `--signature` flag on the retrieve verb | small | unit | Task 2 | 1 create, 1 modify |
| 8 | Independent error-injection cap | small | unit | Task 7 | 0 create, 3 modify |
| 9 | Error-triggered retrieval — validate FAIL | medium | unit | Tasks 1, 4, 7, 8 | 1 create, 2 modify |
| 10 | Error-triggered retrieval — review-specs BLOCK | medium | unit | Tasks 7, 8 | 1 create, 1 modify |
| 12 | End-to-end key agreement | medium | unit | Task 9 | 0 create, 1 modify |
| 13 | Docs: `--signature` on the retrieve verb | small | unit | Task 7 | 0 create, 1 modify |
| 11 | Two-surfaces-only negative guard | small | unit | Tasks 9, 10, 13 | 0 create, 1 modify |

Task 11 is numbered 11 but sequenced **last**: its surface sweep is only meaningful once every task
that could add a call site — including Task 13's documentation example — has landed. Running it
earlier proves nothing and invites a mis-scoped fix.

Every task resolves to strategy `unit` (source: fallback — the spec declares no `test_strategy` and
`manifest.yaml` has no `test_strategies` block), so the Strategy Summary section is omitted. The spec
declares no `infra_requirements:` and no task is non-unit, so the Test Infrastructure Requirements
section is omitted. `.context-index/manifest.yaml` sets `test_policy.granularity: per-behavior`, so
suite paths are shared across the tasks implementing one behavior group — each task below says
**create** or **extend** explicitly.

---

## Constitution Validation

Checked each acceptance criterion against the constitution's Architecture Boundaries.

**No boundary in the "Requires Human Approval" list is crossed.** Specifically:

- **Adding external dependencies** — none. Every change uses `node:crypto` (already imported for
  `deriveDigest`), `node:path`, `node:fs`, `node:util`'s `parseArgs`, and `node:test`.
- **Adding new skills to the lifecycle order** — none. Task 10 edits an existing step inside
  `skills/review-specs/SKILL.md`; no new skill directory is created, so the new-skill "Load Skill
  Extensions" requirement does not apply.
- **Modifying the CLI installation path structure** — untouched.
- **Changing the plugin registration format** — untouched. No version bump in any manifest
  (release-please owns versions, ADR-0008).

**Hook protocol — not touched at all.** The constitution gates "Changing the hook protocol
(stdin/stdout JSON contract)". No task in this plan changes it. An earlier draft wired the
validate-FAIL re-query into the `Stop` hook and altered its stdout payload; that approach was dropped
for the reasons in Scope Boundaries §3a (a `Stop` hook has no non-blocking model-context channel, so
the injection would silently never reach the agent). Both error-triggered surfaces are now skill
prose naming CLI verbs. `hooks/post-validate-extract-heuristics.sh` is not in any task's file list,
and Task 9 carries an explicit assertion that the wrapper still emits `{}` and mentions neither
`--signature` nor `systemMessage`. The only hook file touched anywhere is
`hooks/post-validate-extract-heuristics.mjs` in Task 1, and that is a behaviour-preserving extraction
of an existing composition on the **capture** side.

**Channel decision, recorded.** Validate FAIL and review-specs BLOCK both inject through skill prose
that names `adev heuristics retrieve --signature …` and renders the result into the agent's working
context — the same channel the eight entry-time call sites already use. No new delivery mechanism is
introduced.

**Anti-patterns honoured:**

- No inline Node in `SKILL.md`. Task 10 adds only `adev heuristics signature …` and
  `adev heuristics retrieve …` invocations to `skills/review-specs/SKILL.md`, with no fenced
  JavaScript and no `node -e`. The `.githooks/pre-commit-no-inline-node` chain will reject any
  violation at commit time.
- No CommonJS; all new files are `.mjs`.
- kebab-case filenames, camelCase identifiers, Node built-ins imported before relative imports.
- Every commit carries a `Spec:` trailer plus `Plan-task: <n>`.

`.context-index/governance/boundaries.yaml` — no cross-boundary operations flagged for the file set
above. `manifest.yaml` declares `specialists: []`, so every task is tagged `[specialist: none]`.

---

## Task Structure

### Task 1: Shared lookup-key derivation helper [specialist: none]

**Charter capability:** Signature-Keyed Retrieval
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:210-232` (add the helper directly after `deriveSignature`)
- Modify: `hooks/post-validate-extract-heuristics.mjs:178-201` (FAIL branch calls the helper)
- Test: `tests/lib/heuristics-lookup-key.test.mjs`

**Tests:** `tests/lib/heuristics-lookup-key.test.mjs` — **create** (first task covering Behaviors
0/0a).

**Context to load:**
- `hooks/post-validate-extract-heuristics.mjs:150-230` (the shipped composition, full read)
- `lib/heuristics.mjs:144-232` (`normalizeFailureText`, `deriveDigest`, `deriveSignature`)
- `.context-index/specs/features/heuristics/failure-signature-key.spec.md` (Behavior 1)

**Why this is first.** This is the hinge of the whole spec. A lookup key computed differently from
the stored key matches nothing, and the loop silently fails to close *while every test of the ranking
machinery still passes*. One helper, two callers, no second composition.

- [ ] **Write failing test**

Assert the helper reproduces the shipped composition exactly, and that only one composition exists:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";
import { deriveValidateFailureSignature, deriveSignature } from "../../lib/heuristics.mjs";

describe("deriveValidateFailureSignature", () => {
  it("dedupes, sorts, and joins failing check ids with a single space", () => {
    const checks = [
      { id: "gate-1", outcome: "FAIL" },
      { id: "adr-3", outcome: "FAIL" },
      { id: "gate-1", outcome: "FAIL" },
      { id: "spec-2", outcome: "PASS" },
    ];
    assert.equal(
      deriveValidateFailureSignature(checks),
      deriveSignature("validate", "adr-3 gate-1"),
    );
  });

  it("returns null when no check has a non-PASS outcome", () => {
    assert.equal(deriveValidateFailureSignature([{ id: "a", outcome: "PASS" }]), null);
  });

  it("returns null for a missing or non-array checks value", () => {
    assert.equal(deriveValidateFailureSignature(undefined), null);
    assert.equal(deriveValidateFailureSignature({}), null);
  });

  it("sanitizes ids to the closed charset before hashing", () => {
    const dirty = [{ id: "gate/1;rm -rf", outcome: "FAIL" }];
    assert.equal(deriveValidateFailureSignature(dirty), deriveSignature("validate", "gate1rm-rf"));
  });

  it("no second composition of deriveSignature('validate', ...) exists in the tree", () => {
    // Criterion: "asserted by grep that no second composition ... exists".
    const hook = readFileSync(
      join(PLUGIN_ROOT, "hooks", "post-validate-extract-heuristics.mjs"), "utf8");
    assert.equal(/deriveSignature\(\s*['"]validate['"]/.test(hook), false,
      "the hook must call deriveValidateFailureSignature, not compose the input itself");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-lookup-key.test.mjs`
Expected: FAIL — `deriveValidateFailureSignature is not exported` (and the grep case fails because
the hook still holds its own composition).

- [ ] **Implement**

Add to `lib/heuristics.mjs`, immediately after `deriveSignature`:

```javascript
export function deriveValidateFailureSignature(checks) {
  if (!Array.isArray(checks)) return null;
  const failed = checks
    .filter((c) => c && typeof c.id === "string" && c.id
      && typeof c.outcome === "string" && c.outcome !== "PASS")
    .map((c) => c.id.replace(/[^A-Za-z0-9._-]/g, ""))
    .filter(Boolean);
  if (failed.length === 0) return null;
  return deriveSignature("validate", [...new Set(failed)].sort().join(" "));
}
```

The body is lifted verbatim from `hooks/post-validate-extract-heuristics.mjs:178-201` — filter
predicate, sanitizer charset, dedup, sort, single-space join — so the extraction is behaviour-
preserving by construction. Document in the JSDoc that the input is the **live** `checks[]` array and
that a lifecycle-log record cannot supply it (Behavior 0a).

Then rewrite the hook's FAIL branch to consume the helper. `uniqueFailed` is still needed locally for
the `checkList` prose, so keep the local derivation of `uniqueFailed` for prose **only** and route the
signature through the helper:

```javascript
// ... uniqueFailed / checkList / pattern / antiPattern unchanged ...
try {
  signature = deriveValidateFailureSignature(verdict.checks);
} catch (err) {
  console.warn(
    `[post-validate-hook] signature derivation failed (non-blocking): ${err.message}`,
  );
}
```

Keep `signature = undefined` semantics: `if (signature !== undefined) entry.signature = signature;`
must not start writing `signature: null`, so normalize a `null` return back to `undefined` before the
assignment (or guard with `if (signature)`).

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-lookup-key.test.mjs && node --test tests/hooks/post-validate-heuristic-id.test.mjs`
Expected: PASS, and the existing hook suite is unchanged — the extraction must not alter any stored
`signature` value.

- [ ] **Commit**

Branch (if not already created): `feat/heuristics/signature-retrieval`

```bash
git add lib/heuristics.mjs hooks/post-validate-extract-heuristics.mjs tests/lib/heuristics-lookup-key.test.mjs
git commit -m "feat(heuristics): extract the shared validate-failure lookup key

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 1"
```

---

### Task 2: `signature` param and signature-primary ranking [specialist: none]

**Charter capability:** Signature-Keyed Retrieval
**Depends on:** Task 1
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:1330-1349` (typedef + JSDoc), `:1350` (options), `:1409-1431`
  (match flag + comparator), `:1453` (strip the internal tag)
- Test: `tests/lib/heuristics-signature-retrieval.test.mjs`

**Tests:** `tests/lib/heuristics-signature-retrieval.test.mjs` — **create** (first task in the
Behaviors 1-4 group).

**Context to load:**
- `lib/heuristics.mjs:1330-1452` (full read of `retrieveHeuristics`)
- Spec Behaviors 1 and 3; the "malformed `signature`" Error Cases row

- [ ] **Write failing test**

```javascript
describe("retrieveHeuristics with a signature", () => {
  it("ranks an exact signature match above a higher-confidence non-match", async () => {
    // store: {id:a, confidence:'high', signature:null}, {id:b, confidence:'medium', signature:'validate-abc'}
    const out = await retrieveHeuristics(root, "auth", { signature: "validate-abc" });
    assert.equal(out[0].id, "b", "signature outranks confidence");
  });

  it("ranks signature matches above keyword matches", async () => {
    const out = await retrieveHeuristics(root, "auth",
      { signature: "validate-abc", keywords: ["token"] });
    assert.equal(out[0].signature, "validate-abc");
  });

  it("is inert when no signature is passed — byte-identical to today", async () => {
    const before = await retrieveHeuristics(root, "auth", {});
    const after = await retrieveHeuristics(root, "auth", { signature: undefined });
    assert.deepEqual(after, before);
  });

  it("skips an entry with a malformed signature for matching but keeps it module-scoped", async () => {
    const out = await retrieveHeuristics(root, "auth", { signature: "validate-abc" });
    assert.ok(out.some((e) => e.id === "malformed-sig-entry"));
  });

  it("does not leak the internal _signatureMatch tag into results", async () => {
    const out = await retrieveHeuristics(root, "auth", { signature: "validate-abc" });
    for (const e of out) assert.equal("_signatureMatch" in e, false);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs`
Expected: FAIL — the `signature` option is ignored, so ordering is confidence-first.

- [ ] **Implement**

1. Extend the `RetrieveOptions` typedef with
   `@property {string} [signature] - Exact-match recurrence key. Ranked above confidence; inert when absent.`
2. Destructure `signature` at `:1350`.
3. Normalize once, next to the keyword normalization: treat a non-string, empty, or
   whitespace-only value as absent (`const sig = typeof signature === "string" && signature.trim() ? signature : null;`).
   A malformed value therefore degrades to "no match", never to a throw — the Error Cases row.
4. Tag every deduped entry:
   `entry._signatureMatch = sig !== null && typeof entry.signature === "string" && entry.signature === sig;`
   Exact string equality only — no normalization of the stored value, so an entry carrying a
   malformed `signature` simply fails to match while remaining in the list for keyword/module scope.
5. Add the signature term as the **first** comparison in the existing comparator, above the
   `CONFIDENCE_RANK` diff:

```javascript
const sigA = a._signatureMatch ? 1 : 0;
const sigB = b._signatureMatch ? 1 : 0;
if (sigB !== sigA) return sigB - sigA;
// ... existing confidence / keyword / scope / recency terms unchanged ...
```

   When `sig` is null every entry's flag is `false`, both terms are `0`, and the comparison falls
   through untouched — this is what preserves byte-identical results for the eight entry-time callers.
6. Strip `_signatureMatch` in the final `map` alongside `_scopePriority` and `_keywordMatch`.

Leave the budget loop alone in this task — Tasks 3 and 4 own it.

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs && node --test tests/lib/heuristics-tags-and-tiers.test.mjs`
Expected: PASS, existing retrieval suites unchanged.

- [ ] **Commit**

```bash
git add lib/heuristics.mjs tests/lib/heuristics-signature-retrieval.test.mjs
git commit -m "feat(heuristics): rank exact signature matches above confidence

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 2"
```

---

### Task 3: Exempt exact signature matches from the `low` floor [specialist: none]

**Charter capability:** Signature-Keyed Retrieval
**Depends on:** Task 2
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:1441-1449` (the budget loop; the exclusion is **`:1442`**)
- Test: `tests/lib/heuristics-signature-retrieval.test.mjs`

**Tests:** `tests/lib/heuristics-signature-retrieval.test.mjs` — **extend** (same behavior group as
Task 2).

> **STOP — line check before editing.** The only line this task touches is **`lib/heuristics.mjs:1442`**,
> `if (entry.confidence === "low") continue;`, inside `retrieveHeuristics`'s budget loop (`:1441` is
> the loop header). The visually identical `if (entry.confidence === "low")` at **`:1204`** is
> `demoteHeuristic`'s branch and its body is
> `return archiveHeuristic(projectRoot, id, "demoted-below-low")`. Editing `:1204` would alter
> demotion and write archive entries. Confirm you are inside `retrieveHeuristics` before typing.

- [ ] **Write failing test**

```javascript
it("returns a low-confidence entry on an exact signature match", async () => {
  // 'low-sig' has confidence 'low' and signature 'validate-abc'
  const out = await retrieveHeuristics(root, "auth", { signature: "validate-abc" });
  assert.ok(out.some((e) => e.id === "low-sig"), "the exemption is the whole point of the axis");
});

it("still excludes a low-confidence entry that does not match the signature", async () => {
  const out = await retrieveHeuristics(root, "auth", { signature: "validate-abc" });
  assert.equal(out.some((e) => e.id === "low-nomatch"), false, "the exemption must not leak");
});

it("still excludes every low-confidence entry when no signature is passed", async () => {
  const out = await retrieveHeuristics(root, "auth", {});
  assert.equal(out.some((e) => e.confidence === "low"), false);
});

it("a low signature match outranks an unrelated medium module entry", async () => {
  const out = await retrieveHeuristics(root, "auth", { signature: "validate-abc" });
  assert.equal(out[0].id, "low-sig");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs`
Expected: FAIL — `low-sig` is dropped by the exclusion at `:1442`.

- [ ] **Implement**

Inside the budget loop, take signature-matched entries before the confidence gate:

```javascript
for (const entry of deduped) {
  if (entry._signatureMatch) {
    result.push(entry);              // exempt from the low floor (Behavior 2)
    continue;
  }
  if (entry.confidence === "low") continue;   // :1442 — unchanged for every other path
  // ... existing high/medium bucket checks ...
}
```

The exemption is scoped to `_signatureMatch === true`, so it cannot reach a `low` entry that does not
match, cannot reach a no-signature call, and is made in the retrieval budget loop and **never** in
`demoteHeuristic`. Task 4 adds the arithmetic that bounds how many exempt entries are taken.

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/heuristics.mjs tests/lib/heuristics-signature-retrieval.test.mjs
git commit -m "feat(heuristics): exempt exact signature matches from the low floor

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 3"
```

---

### Task 4: Signature-first off-the-top budget allocation [specialist: none]

**Charter capability:** Signature-Keyed Retrieval (Context Budget invariant)
**Depends on:** Task 3
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:1435-1449` (`highMax` at `:1436`, `mediumMax` at `:1437`, bucket checks
  at `:1443` / `:1446`)
- Test: `tests/lib/heuristics-signature-retrieval.test.mjs`

**Tests:** `tests/lib/heuristics-signature-retrieval.test.mjs` — **extend**.

**Why off-the-top.** A `low` entry fits neither bucket, so an exemption that does not say how it is
budgeted leaves four defensible implementations. Any variant that draws signature matches *from* a
confidence bucket lets bucket exhaustion drop the exact match for the failure in hand while retaining
unrelated entries — the precise outcome Behavior 1 exists to prevent.

- [ ] **Write failing test**

```javascript
it("takes signature matches off the top, then splits the remainder", async () => {
  // two signature matches in the store, limit 3 → 1 slot left
  const out = await retrieveHeuristics(root, "auth",
    { signature: "validate-abc", injectionLimit: 3 });
  assert.equal(out.length, 3);
  assert.equal(out.filter((e) => e.signature === "validate-abc").length, 2);
});

it("never exceeds injectionLimit even when signature matches are plentiful", async () => {
  const out = await retrieveHeuristics(root, "auth",
    { signature: "validate-many", injectionLimit: 2 });
  assert.equal(out.length, 2);
});

it("with zero signature matches the split is arithmetically identical to today", async () => {
  // Numeric assertion, not inspection: limit 8 → highMax 5, mediumMax 3.
  const out = await retrieveHeuristics(root, "auth",
    { signature: "validate-nothing-matches", injectionLimit: 8 });
  assert.equal(out.filter((e) => e.confidence === "high").length, 5);
  assert.equal(out.filter((e) => e.confidence === "medium").length, 3);
  const baseline = await retrieveHeuristics(root, "auth", { injectionLimit: 8 });
  assert.deepEqual(out, baseline);
});

it("retains a low signature match and drops an unrelated medium when the cap binds", async () => {
  const out = await retrieveHeuristics(root, "auth",
    { signature: "validate-abc", injectionLimit: 1 });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "low-sig", "drop order must agree with ranking, not contradict it");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs`
Expected: FAIL — after Task 3 the loop pushes every match with no cap, so `out.length` exceeds
`injectionLimit`.

- [ ] **Implement**

Rewrite `:1435-1449` as a two-phase allocation. Because the array is already sorted signature-first,
one pass suffices — count what the signature phase consumed and compute the split over the remainder:

```javascript
// Phase 1 — signature matches off the top of `limit` (Behavior 2a step 1).
const result = [];
let signatureTaken = 0;
for (const entry of deduped) {
  if (!entry._signatureMatch) continue;
  if (signatureTaken >= limit) break;
  result.push(entry);
  signatureTaken++;
}

// Phase 2 — the existing formula over the REMAINDER (Behavior 2a steps 2-3).
const remaining = limit - signatureTaken;
const highMax = Math.ceil(remaining * 5 / 8);
const mediumMax = remaining - highMax;
let highCount = 0, mediumCount = 0;
for (const entry of deduped) {
  if (entry._signatureMatch) continue;             // already allocated in phase 1
  if (entry.confidence === "low") continue;        // :1442 semantics preserved
  if (entry.confidence === "high" && highCount < highMax) { highCount++; result.push(entry); }
  else if (entry.confidence === "medium" && mediumCount < mediumMax) { mediumCount++; result.push(entry); }
}
```

With zero signature matches `signatureTaken === 0`, so `remaining === limit` and `highMax` /
`mediumMax` are the same numbers as today — that is what keeps entry-time callers byte-identical, and
the third test asserts it numerically rather than by inspection. Phase 1 preserves sorted order, so
`result` still reads signature-matched first, exactly matching the rank order (the "Injection cap
reached" Error Cases row).

Note: the drops themselves are not reported in the rendered output at library level — the spec's
"drops are reported in the rendered output" clause is satisfied at the CLI boundary, where
`{count}` already conveys how many entries survived the cap. Do not add a new return shape.

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs && npm test`
Expected: PASS, with the full suite green — this is the task most likely to disturb an existing
retrieval expectation.

- [ ] **Commit**

```bash
git add lib/heuristics.mjs tests/lib/heuristics-signature-retrieval.test.mjs
git commit -m "feat(heuristics): allocate signature matches off the top of the budget

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 4"
```

---

### Task 5: Dedup across axes [specialist: none]

**Charter capability:** Signature-Keyed Retrieval
**Depends on:** Task 4
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:1435-1460` (guard the two-phase loop against double-push)
- Test: `tests/lib/heuristics-signature-retrieval.test.mjs`

**Tests:** `tests/lib/heuristics-signature-retrieval.test.mjs` — **extend**.

- [ ] **Write failing test**

```javascript
it("returns an entry matching both signature and keyword exactly once", async () => {
  const out = await retrieveHeuristics(root, "auth",
    { signature: "validate-abc", keywords: ["token"] });
  const hits = out.filter((e) => e.id === "both-axes");
  assert.equal(hits.length, 1);
});

it("returns no duplicate ids under any axis combination", async () => {
  const out = await retrieveHeuristics(root, "auth",
    { signature: "validate-abc", keywords: ["token", "session"], injectionLimit: 8 });
  assert.equal(new Set(out.map((e) => e.id)).size, out.length);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs`
Expected: FAIL if the phase-2 loop lacks the `if (entry._signatureMatch) continue;` guard; PASS-by-
construction otherwise — in which case keep the tests as regression pins and record in the commit
body that no production change was required.

- [ ] **Implement**

Two mechanisms already guarantee single occurrence and both must remain: the existing dedup-by-id
pass over `tagged` (module-scoped wins), and the phase-2 `if (entry._signatureMatch) continue;` guard
from Task 4. Add an assertion-style comment at the phase boundary naming Behavior 3 so a future
refactor that concatenates a separate signature list with the ranked list is visibly wrong. Do **not**
introduce a second `Set` — the sorted single-pass design is what keeps the axes from multiplying.

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/heuristics.mjs tests/lib/heuristics-signature-retrieval.test.mjs
git commit -m "test(heuristics): pin single-occurrence across signature and keyword axes

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 5"
```

---

### Task 6: Capped fallback to module scope [specialist: none]

**Charter capability:** Signature-Keyed Retrieval
**Depends on:** Task 4
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:1330-1349` (JSDoc: the fallback is bounded by the caller's
  `injectionLimit`, never by the entry-time default)
- Test: `tests/lib/heuristics-signature-retrieval.test.mjs`

**Tests:** `tests/lib/heuristics-signature-retrieval.test.mjs` — **extend**.

**Why this matters more than it looks.** A *first* occurrence of any failure matches no signature by
definition, so the fallback is the modal path, not an edge. An unqualified fallback would inject up
to the entry-time `injection_limit` of 8 unrelated entries **in addition to** the entry-time
injection that already happened, breaching the charter's Context Budget invariant on the most
frequent case.

- [ ] **Write failing test**

```javascript
it("falls back to module scope rather than returning empty", async () => {
  const out = await retrieveHeuristics(root, "auth", { signature: "validate-no-such-key" });
  assert.ok(out.length > 0, "a first occurrence must not blank the context");
});

it("bounds the fallback by the caller's cap, never the entry-time 8", async () => {
  const out = await retrieveHeuristics(root, "auth",
    { signature: "validate-no-such-key", injectionLimit: 3 });
  assert.ok(out.length <= 3, "an error-triggered fallback returns at most its own cap");
});

it("leaves entry-time callers passing no signature at the default 8", async () => {
  const out = await retrieveHeuristics(root, "auth", {});
  assert.ok(out.length <= 8);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs`
Expected: these should already PASS given Task 4's `remaining === limit` arithmetic. If any fails, the
phase-2 loop is not honouring `limit` — fix that, do not relax the test.

- [ ] **Implement**

No new branch: with zero signature matches the two-phase allocation degenerates to today's behavior
capped at the caller's `limit`, which *is* the specified fallback. The work here is to make the
contract explicit so a later change cannot quietly reintroduce an escalation:

- Document in the `RetrieveOptions` JSDoc that `injectionLimit` bounds the signature phase **and** the
  fallback, and that callers who want the tighter error-time budget pass their own value (Task 8).
- Add a JSDoc line stating that no code path may substitute the default `8` when `signature` is
  present but unmatched.

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/heuristics.mjs tests/lib/heuristics-signature-retrieval.test.mjs
git commit -m "feat(heuristics): bound the unmatched-signature fallback by the caller's cap

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 6"
```

---

### Task 7: `--signature` flag on the retrieve verb [specialist: none]

**Charter capability:** Signature-Keyed Retrieval
**Depends on:** Task 2
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs:135-216` (`runRetrieve`); usage/help strings at `:152` and `:164`
  (the two `runRetrieve` usage lines), the top-level `USAGE` const at `:97`, the header comment at
  `:62`, and the `help()` body at `:1070-1071`
- Test: `tests/cli/heuristics-retrieve-signature.test.mjs`

**Tests:** `tests/cli/heuristics-retrieve-signature.test.mjs` — **create** (first task covering
Behavior 5).

> ### CARRY-FORWARD — the spec's Error Cases row understates the live output shape
>
> The spec's row "Store missing or unreadable" says the empty shape is `{"count":0,"rendered":""}`.
> That is **the ordinary empty-result shape at `lib/cli/heuristics.mjs:214`**. The *unreadable-store*
> path is the `catch` at `:198-206` (the emit itself is **`:203`**), and it emits a **third `error` key**:
>
> ```json
> {"count":0,"rendered":"","error":"<err.message>"}
> ```
>
> **PRESERVE THE LIVE THREE-KEY SHAPE.** Deleting the `error` key to match the spec row literally
> would change existing CLI output — a regression, not a fix. The spec row is a known inaccuracy,
> recorded here and in Scope Boundaries §2; it is not a work item. Both shapes get their own
> assertion below so neither can be collapsed into the other by a later refactor.

**Context to load:**
- `lib/cli/heuristics.mjs:135-216` (full read of `runRetrieve`)
- Spec Behavior 5 and Error Cases rows 1-2
- `tests/cli/heuristics-signature.test.mjs` (spawn harness pattern)

- [ ] **Write failing test**

```javascript
describe("adev heuristics retrieve --signature", () => {
  it("returns the signature-matched entry in json (default) format", () => {
    const r = run(root, ["retrieve", "--module", "auth", "--signature", "validate-abc"]);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).count, 1);
  });

  it("prints __NONE__ on an empty result with --format text", () => {
    const r = run(emptyRoot, ["retrieve", "--module", "auth", "--signature", "validate-abc",
      "--format", "text"]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "__NONE__");
  });

  it("emits the TWO-key empty shape on an ordinary empty result (json default)", () => {
    const r = run(emptyRoot, ["retrieve", "--module", "auth", "--signature", "validate-abc"]);
    assert.equal(r.status, 0);
    assert.deepEqual(JSON.parse(r.stdout), { count: 0, rendered: "" });   // lib/cli/heuristics.mjs:214
  });

  it("PRESERVES the THREE-key shape on the unreadable-store path", () => {
    // Force retrieveHeuristics to throw (e.g. store path is a file where a dir is expected).
    const r = run(brokenRoot, ["retrieve", "--module", "auth", "--signature", "validate-abc"]);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ["count", "error", "rendered"]);
    assert.equal(typeof out.error, "string");   // carry-forward: do NOT drop this key
  });

  it("treats a malformed --signature as no match, not an argument error", () => {
    const r = run(root, ["retrieve", "--module", "auth", "--signature", "   "]);
    assert.equal(r.status, 0, "a failure path must never become an argument failure");
  });

  it("leaves the existing exit-1 argument-error paths unchanged", () => {
    assert.equal(run(root, ["retrieve", "--signature", "x"]).status, 1);              // missing --module
    assert.equal(run(root, ["retrieve", "--module", "a", "--format", "xml"]).status, 1);
    assert.equal(run(root, ["retrieve", "--module", "a", "--tier", "deep"]).status, 1);
    assert.equal(run(root, ["retrieve", "--module", "a", "--injection-limit", "-1"]).status, 1);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics-retrieve-signature.test.mjs`
Expected: FAIL — `parseArgs` rejects the unknown option `--signature` and exits 1.

- [ ] **Implement**

1. Add `signature: { type: "string" }` to the `parseArgs` options in `runRetrieve`.
2. After the existing validations, forward it without validating it as an argument:
   `if (typeof v.signature === "string" && v.signature.trim()) opts.signature = v.signature;`
   A malformed or whitespace-only value is simply not forwarded, so it degrades to "no match" and the
   process still exits 0. **Do not add a `--signature` validation branch that exits 1.**
3. Leave the `catch` block at `:198-206` **exactly as it is** — three keys on json (emit at `:203`),
   `__NONE__` on text. Leave the terminal emit at `:210-215` exactly as it is — two keys on json
   (`:214`).
4. Update the `runRetrieve` usage lines at `:152` and `:164`, the top-level `USAGE` const at `:97`,
   the header comment at `:62`, and the `help()` body at `:1070-1071` to include `[--signature <sig>]`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics-retrieve-signature.test.mjs && node --test tests/cli/heuristics.test.mjs`
Expected: PASS, with the pre-existing CLI suite untouched.

- [ ] **Commit**

```bash
git add lib/cli/heuristics.mjs tests/cli/heuristics-retrieve-signature.test.mjs
git commit -m "feat(heuristics): add --signature to the retrieve verb

Preserves both empty-result shapes: the two-key ordinary result and the
live three-key unreadable-store result.

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 7"
```

---

### Task 8: Independent error-injection cap [specialist: none]

**Charter capability:** Error-Triggered Retrieval
**Depends on:** Task 7
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs` (export `resolveErrorInjectionLimit(manifest)` near the retrieval
  exports)
- Modify: `lib/cli/heuristics.mjs:169-195` (apply it as the default when `--signature` is present and
  `--injection-limit` is absent)
- Modify: `.context-index/manifest.yaml` (documented, commented-out `heuristics` block)
- Test: `tests/lib/heuristics-signature-retrieval.test.mjs`,
  `tests/cli/heuristics-retrieve-signature.test.mjs`

**Tests:** `tests/lib/heuristics-signature-retrieval.test.mjs` — **extend** (Behavior 7 shares the
retrieval-budget suite); `tests/cli/heuristics-retrieve-signature.test.mjs` — **extend** for the
verb-level default.

**Contract.** `heuristics.error_injection_limit`, **default 3**, deliberately *not* the entry-time
`heuristics.injection_limit` of 8. It governs the signature phase **and** the Behavior 4 fallback.

**Where it takes effect — in the verb, not in skill prose.** A `--signature` invocation *is* by
definition an error-time retrieval (no entry-time call site passes one), so the verb applies the
error-time default itself: when `--signature` is present and `--injection-limit` is absent, the limit
resolves to `resolveErrorInjectionLimit(loadManifest(projectRoot))` instead of the library default of
8. This keeps YAML parsing out of skill prose entirely — Tasks 9 and 10 name the verb and get the
right cap for free — and it prevents the resolver from becoming a dead export.

> `loadManifest` (`lib/manifest.mjs:45`) is **synchronous**. Do not `await` it. Wrap the call in
> `try/catch` and fall back to `DEFAULT_ERROR_INJECTION_LIMIT` — a missing or malformed manifest must
> never turn a failure path into an error.

- [ ] **Write failing test**

```javascript
describe("resolveErrorInjectionLimit", () => {
  it("defaults to 3 with no manifest config", () => {
    assert.equal(resolveErrorInjectionLimit({}), 3);
  });
  it("reads heuristics.error_injection_limit when configured", () => {
    assert.equal(resolveErrorInjectionLimit({ heuristics: { error_injection_limit: 5 } }), 5);
  });
  it("ignores heuristics.injection_limit — the entry-time knob must not leak", () => {
    assert.equal(resolveErrorInjectionLimit({ heuristics: { injection_limit: 8 } }), 3);
  });
  it("falls back to 3 on a non-integer, negative, or unreadable value", () => {
    assert.equal(resolveErrorInjectionLimit({ heuristics: { error_injection_limit: "many" } }), 3);
    assert.equal(resolveErrorInjectionLimit({ heuristics: { error_injection_limit: -1 } }), 3);
    assert.equal(resolveErrorInjectionLimit(null), 3);
  });
});

// tests/cli/heuristics-retrieve-signature.test.mjs — the verb-level default
//
// FIXTURE (required — the no-signature assertion is meaningless without it): the store must hold
//   (a) 10 entries carrying signature "validate-many" — `low` is fine and realistic, and
//   (b) at least 5 `high` and 3 `medium` entries that match NO signature.
// Without (b) the "entry-time 8" assertion returns 0, because failure entries are `low` and the
// unexempted budget loop drops every one of them.
//
// Give this fixture its OWN temp root. It is much larger than Task 7's, and sharing a root would
// break Task 7's `count === 1` assertion in the same file.
it("caps a --signature retrieval at 3 by default, not the entry-time 8", () => {
  const out = JSON.parse(runCli(root,
    ["heuristics", "retrieve", "--module", "auth", "--signature", "validate-many"]).stdout);
  assert.equal(out.count, 3);
});

it("still caps a NO-signature retrieval at the entry-time 8", () => {
  const out = JSON.parse(runCli(root, ["heuristics", "retrieve", "--module", "auth"]).stdout);
  assert.equal(out.count, 8, "entry-time callers are unaffected");
});

it("lets an explicit --injection-limit override the error-time default", () => {
  const out = JSON.parse(runCli(root, ["heuristics", "retrieve", "--module", "auth",
    "--signature", "validate-many", "--injection-limit", "5"]).stdout);
  assert.equal(out.count, 5);
});

it("caps the unmatched-signature FALLBACK at 3 too", () => {
  const out = JSON.parse(runCli(root,
    ["heuristics", "retrieve", "--module", "auth", "--signature", "validate-nothing"]).stdout);
  assert.ok(out.count <= 3, "the fallback must never escalate to the entry-time 8");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs && node --test tests/cli/heuristics-retrieve-signature.test.mjs`
Expected: FAIL — `resolveErrorInjectionLimit is not exported`, and the verb still defaults a
`--signature` retrieval to 8.

- [ ] **Implement**

```javascript
export const DEFAULT_ERROR_INJECTION_LIMIT = 3;

export function resolveErrorInjectionLimit(manifest) {
  const raw = manifest?.heuristics?.error_injection_limit;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return n;
  return DEFAULT_ERROR_INJECTION_LIMIT;
}
```

It must never read `heuristics.injection_limit` — the whole point of Behavior 7 is that the
error-time budget is independent of and tighter than the entry-time one.

Then wire it into `runRetrieve`. **There is exactly one correct insertion point: between
`const absRoot = resolve(projectRoot);` (`:189`) and `const opts = {};` (`:190`).** Both neighbours
matter:

- Placing it any earlier (anywhere from `:182` to `:188`) puts `absRoot` in its temporal dead zone —
  a `ReferenceError` on the *common* path, since `injectionLimit === undefined` is true for every
  caller that omits the flag. That would break all eight entry-time call sites.
- Placing it after `:191` is silently worse: `opts.injectionLimit` has already been assigned from
  `injectionLimit` on that line, so a later reassignment does nothing and the error-time cap never
  takes effect — a no-op that no test in this task would catch.

Guard on the **parsed flag value**, not on `opts` (which does not exist yet at the insertion point):

```javascript
// A --signature retrieval is by definition error-time, so it takes the tighter default.
if (injectionLimit === undefined && typeof v.signature === "string" && v.signature.trim()) {
  try {
    injectionLimit = resolveErrorInjectionLimit(loadManifest(absRoot));   // sync — do not await
  } catch {
    injectionLimit = DEFAULT_ERROR_INJECTION_LIMIT;
  }
}
```

Add the two imports this needs, in the established order (built-ins first, then relative):
`resolveErrorInjectionLimit` and `DEFAULT_ERROR_INJECTION_LIMIT` from `../heuristics.mjs` (alongside
the existing `retrieveHeuristics` / `renderHeuristic` import), and `loadManifest` from
`../manifest.mjs`.

An explicit `--injection-limit` always wins, and a call without `--signature` is untouched — so the
eight entry-time call sites keep the library default of 8.

**The guard condition is deliberately identical to Task 7 step 2's forwarding condition.** A
whitespace-only `--signature` is not forwarded to `retrieveHeuristics`, so it is not an error-time
retrieval at all — it is an ordinary module-scope call and correctly keeps the entry-time default of
8. Keeping the two conditions textually identical is what prevents a malformed value from landing in
the gap between "capped at 3" and "forwarded as a signature".

Finally, add a commented block to `.context-index/manifest.yaml` in the style of the existing
`test_policy` block, documenting the key, its default, and why the default is not 8 (error-time
injection lands inside an already-running task, where every injected token persists as a cache read
on all subsequent turns).

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-signature-retrieval.test.mjs && node --test tests/cli/heuristics-retrieve-signature.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/heuristics.mjs lib/cli/heuristics.mjs .context-index/manifest.yaml tests/lib/heuristics-signature-retrieval.test.mjs tests/cli/heuristics-retrieve-signature.test.mjs
git commit -m "feat(heuristics): add an independent error-time injection cap

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 8"
```

---

### Task 9: Error-triggered retrieval — validate FAIL [specialist: none]

**Charter capability:** Error-Triggered Retrieval
**Depends on:** Task 1, Task 4, Task 7, Task 8
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs:281-420` (repeatable `--check-id` on `runSignature`; the function
  begins at `:281`) plus `SIGNATURE_USAGE` at `:232-234` and the `help()` body
- Modify: `skills/validate/SKILL.md` (the FAIL verdict path)
- Test: `tests/skills/validate-error-retrieval.test.mjs`

**Tests:** `tests/skills/validate-error-retrieval.test.mjs` — **create** (first task covering
Behaviors 6-row-1, 8, 9).

> ### Read Scope Boundaries §3a before starting — this is NOT a hook change
>
> An earlier draft of this plan wired the re-query into the Stop hook and emitted
> `{"systemMessage": …}`. That was wrong twice over: a `Stop` hook has no non-blocking channel that
> reaches the model (`hookSpecificOutput.additionalContext` is used only by this repo's
> `SessionStart` / `PreToolUse` / `PostToolUse` hooks, and `decision: "block"` is forbidden by
> Behavior 8), and `systemMessage` is a user-visible notice rather than model context — so the
> injection would silently never happen while the tests passed.
>
> **Do not modify `hooks/post-validate-extract-heuristics.sh`. Do not change the hook's stdout
> payload.** The Stop hook remains capture-only. The re-query lives in `skills/validate/SKILL.md`,
> which holds the live verdict — `checks[]` included — at the moment it renders FAIL.

**Constraints that are not negotiable in this task:**
- **Source the signature from the LIVE verdict payload** the skill is holding. Never from
  `.context-index/lifecycle-state/*.jsonl`, which carries `validator` and `verdict` but no `checks[]`.
- **The agent composes nothing.** It passes raw failing check IDs as repeated `--check-id` flags; the
  verb delegates dedupe/sort/join/hash to Task 1's single exported helper (Scope Boundaries §4a).
- **Never blocks.** A non-zero exit or `__NONE__` from either verb means inject nothing and continue
  to the FAIL verdict unchanged (Behaviors 8 and 9).
- Module slug is the spec's `charter:` frontmatter field — the same slug Step 0's entry-time
  retrieval already uses. Do not invent one.

- [ ] **Write failing test**

```javascript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";
import { deriveValidateFailureSignature } from "../../lib/heuristics.mjs";

const SKILL = readFileSync(join(PLUGIN_ROOT, "skills/validate/SKILL.md"), "utf8");
const CHECK_IDS = ["gate-1", "adr-3", "gate-1"];   // duplicate is deliberate

/**
 * The FAIL-path window. Several assertions must be scoped to the new step rather than the whole
 * file, because the Step 0 entry-time heuristics block (`:112-118`) already contains `__NONE__`
 * and would satisfy an unscoped assertion before any change is made.
 */
function failWindow() {
  const i = SKILL.indexOf("--check-id");
  assert.notEqual(i, -1, "the FAIL path must name the --check-id signature verb");
  // Keep the window TIGHT. skills/validate/SKILL.md's API-reference section (~:643-647) mentions
  // lib/lifecycle-state.mjs five times, and the FAIL block sits only ~1.0-1.3 KB above it. A window
  // wide enough to reach that section would make the lifecycle-log assertion fail on documentation
  // rather than on the step under test. Narrow the bound if the new step lands near the tail.
  return SKILL.slice(Math.max(0, i - 1200), i + 800);
}

// runCli(projectRoot, argv) — the project root is ALWAYS first, in every suite (see the
// test-helper convention note under Task 10). `signature` ignores it; the arity stays uniform.
describe("adev heuristics signature --check-id", () => {
  it("delegates the composition to the shared helper", () => {
    const r = runCli(root, ["heuristics", "signature", "--origin", "validate",
      "--check-id", "gate-1", "--check-id", "adr-3", "--check-id", "gate-1"]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(),
      deriveValidateFailureSignature(CHECK_IDS.map((id) => ({ id, outcome: "FAIL" }))));
  });

  it("is order-independent and duplicate-insensitive", () => {
    const a = runCli(root, ["heuristics", "signature", "--origin", "validate",
      "--check-id", "adr-3", "--check-id", "gate-1"]).stdout.trim();
    const b = runCli(root, ["heuristics", "signature", "--origin", "validate",
      "--check-id", "gate-1", "--check-id", "adr-3", "--check-id", "adr-3"]).stdout.trim();
    assert.equal(a, b);
  });

  it("rejects --check-id combined with --text or --blocker-id", () => {
    assert.equal(runCli(root, ["heuristics", "signature", "--origin", "validate",
      "--check-id", "a", "--text", "x"]).status, 1);
    assert.equal(runCli(root, ["heuristics", "signature", "--origin", "review-specs",
      "--check-id", "a", "--blocker-id", "SA-1-abcdef"]).status, 1);
  });

  it("errors when every --check-id sanitizes away", () => {
    assert.equal(runCli(root, ["heuristics", "signature", "--origin", "validate",
      "--check-id", "///"]).status, 1);
  });
});

describe("skills/validate FAIL path", () => {
  it("names the check-id signature verb on the FAIL path", () => {
    assert.match(SKILL, /adev heuristics signature --origin validate[^\n]*--check-id/);
  });

  it("names the signature-keyed retrieve verb and lets the verb supply the cap", () => {
    const m = SKILL.match(/adev heuristics retrieve[^\n]*--signature[^\n]*/);
    assert.ok(m, "the FAIL path must name the retrieve verb with --signature on one line");
    assert.equal(/--injection-limit/.test(m[0]), false,
      "the cap comes from the verb's error-time default, not from skill prose");
  });

  it("sources the check ids from the live verdict, not the lifecycle log", () => {
    assert.equal(/lifecycle-state/.test(failWindow()), false,
      "the lifecycle log carries no checks[]; the key is underivable there");
  });

  it("skips injection rather than blocking when nothing matches", () => {
    // Scoped to the FAIL window: skills/validate/SKILL.md:114-118 already contains __NONE__ in the
    // Step 0 entry-time block, so an unscoped assertion would pass before the change is made.
    assert.match(failWindow(), /__NONE__/);
  });

  it("adds no inline Node to the skill", () => {
    assert.equal(/node\s+(-e|--input-type)/.test(SKILL), false);
    assert.equal(/Run inline Node/.test(SKILL), false);
  });

  it("leaves the Stop hook wrapper untouched", () => {
    const sh = readFileSync(
      join(PLUGIN_ROOT, "hooks/post-validate-extract-heuristics.sh"), "utf8");
    assert.equal(/heuristics retrieve|--signature|systemMessage/.test(sh), false);
    assert.match(sh, /echo '\{\}'/);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/validate-error-retrieval.test.mjs`
Expected: FAIL — `parseArgs` rejects the unknown option `--check-id`, and the skill contains no
`--signature` invocation.

- [ ] **Implement**

**Part A — `--check-id` on the `signature` verb** (`lib/cli/heuristics.mjs`, `runSignature`):

1. Add `"check-id": { type: "string", multiple: true }` to the `parseArgs` options.
2. Validate the mode conflicts alongside the existing ones, using the same `signatureError` helper
   and the existing `CONFLICTING_SIGNATURE_INPUT` code: `--check-id` requires a derived-mode origin
   (reject with `review-specs`), and conflicts with both `--text` and `--blocker-id`. Keep the
   established ordering — origin is validated first, then mode conflicts, then input emptiness.
3. When `--check-id` is supplied, produce the signature by handing the raw IDs to Task 1's helper —
   **do not re-implement dedupe, sort, join, or sanitization here**:

```javascript
const sig = deriveValidateFailureSignature(
  v["check-id"].map((id) => ({ id, outcome: "FAIL" })),
);
if (sig === null) {
  signatureError("EMPTY_SIGNATURE_TEXT",
    "--check-id values must contain at least one character in [A-Za-z0-9._-] after sanitization");
}
console.log(sig);
process.exit(0);
```

4. Extend `SIGNATURE_USAGE` and the `help()` body with the `--check-id` form.

**Part B — the FAIL path in `skills/validate/SKILL.md`.** Add a step where the skill has rendered a
FAIL verdict and still holds the check results, mirroring the shape of the existing Step 0 heuristics
block (`:112-118`):

- Derive the key from the **live** verdict's failing checks, one flag per non-PASS `checks[].id`:
  `adev heuristics signature --origin validate --check-id <id> [--check-id <id> ...]`
  Pass the IDs exactly as the verdict carries them, in any order, duplicates included — the verb
  normalizes. Do **not** pre-sort, pre-dedupe, or concatenate them into `--text`.
- Re-query the store with the returned key:
  `adev heuristics retrieve --module <charter-module> --signature <sig> --tier summary --format text`
- **Omit `--injection-limit`.** Because `--signature` is present, the verb applies the error-time cap
  itself (Task 8: `heuristics.error_injection_limit`, default 3). The skill does not read
  `manifest.yaml` and must not hardcode a number.
- When the output is not `__NONE__`, inject it under a `## Heuristics — prior occurrences of this
  failure` heading with the standard framing: *"The following heuristics are lessons learned from past
  work in this module. Use them as guidance, not as hard rules."*
- Skip silently on `__NONE__`, on a non-zero exit from either verb, or when no check has a non-PASS
  outcome (Error Cases rows 3 and 5 — no synthesized key is invented). **The FAIL verdict is emitted
  unchanged either way**; this step never blocks, never retries, and never edits the verdict.
- Prose only: no fenced JavaScript with control flow, no inline Node. Both verbs are named directly.
- **Keep the `adev heuristics retrieve … --signature …` invocation on a single line — no backslash
  continuation.** Tasks 9 and 11 both assert against the matched *line*, and `skills/recover/SKILL.md`
  already wraps a heuristics invocation across lines (`:454`), so this is a live pattern that would
  silently defeat the assertions.

- [ ] **Verify test passes**

Run: `node --test tests/skills/validate-error-retrieval.test.mjs && node --test tests/cli/heuristics-signature.test.mjs && node --test tests/hooks/post-validate-heuristic-id.test.mjs && npm test`
Expected: PASS, with the hook suites untouched — this task must not change hook behavior at all.

- [ ] **Commit**

```bash
git add lib/cli/heuristics.mjs skills/validate/SKILL.md tests/skills/validate-error-retrieval.test.mjs
git commit -m "feat(heuristics): re-query the store by signature on validate FAIL

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 9"
```

---

### Task 10: Error-triggered retrieval — review-specs BLOCK [specialist: none]

**Charter capability:** Error-Triggered Retrieval
**Depends on:** Task 7, Task 8
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/review-specs/SKILL.md` (~`:315`, the BLOCK / `.blockers.md` sidecar step)
- Test: `tests/skills/review-specs-error-retrieval.test.mjs`

**Tests:** `tests/skills/review-specs-error-retrieval.test.mjs` — **create** (first task covering
Behavior 6-row-2).

**Derivation.** A review BLOCK has no `checks[]` but *does* have its own already-canonical identity,
so it uses inherited mode rather than synthesizing a key: `adev heuristics signature --origin
review-specs --blocker-id <id>` returns `review-specs-<locationHash>` by reusing the hash component of
the validated `blocker_id` (`failure-signature-key.spec.md` Behavior 3a). It hashes nothing.

- [ ] **Write failing test**

```javascript
const SKILL = readFileSync(join(PLUGIN_ROOT, "skills/review-specs/SKILL.md"), "utf8");

it("names the inherited-mode signature verb on the BLOCK path", () => {
  assert.match(SKILL, /adev heuristics signature --origin review-specs --blocker-id/);
});

it("names the signature-keyed retrieve verb and lets the verb supply the cap", () => {
  const m = SKILL.match(/adev heuristics retrieve[^\n]*--signature[^\n]*/);
  assert.ok(m, "the BLOCK path must name the retrieve verb with --signature on one line");
  assert.equal(/--injection-limit/.test(m[0]), false,
    "the cap comes from the verb's error-time default, not from skill prose");
});

it("does not synthesize a key from finding prose", () => {
  assert.equal(/--origin review-specs[^\n]*--text/.test(SKILL), false);
});

it("adds no inline Node to the skill", () => {
  assert.equal(/node\s+(-e|--input-type)/.test(SKILL), false);
  assert.equal(/Run inline Node/.test(SKILL), false);
});

it("end-to-end: an inherited signature retrieves the entry stored under it", () => {
  // runCli(projectRoot, argv) — one signature throughout this suite.
  const sig = runCli(root, ["heuristics", "signature", "--origin", "review-specs",
    "--blocker-id", BLOCKER_ID]).stdout.trim();
  seedHeuristic(root, { id: "prior-block", confidence: "low", signature: sig });
  const out = JSON.parse(runCli(root,
    ["heuristics", "retrieve", "--module", "heuristics", "--signature", sig,
     "--injection-limit", "3"]).stdout);
  assert.equal(out.count, 1);
});
```

> **Test-helper convention for Tasks 9, 10 and 12:** define `runCli(projectRoot, argv)` once, with
> the project root always first. `adev heuristics signature` ignores `projectRoot` (derivation reads
> no clock, path, or env var), but a uniform arity keeps the three suites from diverging.

- [ ] **Verify test fails**

Run: `node --test tests/skills/review-specs-error-retrieval.test.mjs`
Expected: FAIL — the skill contains no `--signature` invocation.

- [ ] **Implement**

Add a subsection to `skills/review-specs/SKILL.md` immediately after **6b-bis** (the `.blockers.md`
sidecar step), so it runs only on BLOCK and only for findings whose `blocker_id` already passed the
aggregator's validation:

- For each validated `blocker_id`, derive the key:
  `adev heuristics signature --origin review-specs --blocker-id <blocker_id>`
- Re-query the store with it:
  `adev heuristics retrieve --module <charter-module> --signature <sig> --tier summary --format text`
- **Omit `--injection-limit`.** Because `--signature` is present, the verb applies the error-time cap
  itself (Task 8: `heuristics.error_injection_limit`, default 3). The skill does not read
  `manifest.yaml` and must not hardcode a number.
- When the output is not `__NONE__`, inject it under a `## Heuristics — prior occurrences of this
  blocker` heading with the standard framing: *"The following heuristics are lessons learned from past
  work in this module. Use them as guidance, not as hard rules."*
- Skip silently on `__NONE__`, on a `LEGACY_REVIEWER_OUTPUT` / `INVALID_BLOCKER_ID` finding (no valid
  identity to inherit), or on a non-zero exit. **Never** fall back to `--origin review-specs --text
  <prose>` — that would mint a second identity for the same finding.
- Prose only: no fenced JavaScript with control flow, no inline Node. Both verbs are named directly.
- **Keep the `adev heuristics retrieve … --signature …` invocation on a single line — no backslash
  continuation.** Tasks 10 and 11 both assert against the matched *line*, and `skills/recover/SKILL.md`
  already wraps a heuristics invocation across lines (`:454`), so this is a live pattern that would
  silently defeat the assertions.

**Provider mirrors — do NOT update them.** `providers/codex/skills/review-specs/SKILL.md` and
`providers/opencode/skills/review-specs/SKILL.md` are checked in and carry the same entry-time
retrieve line as the canonical skill. No parity test enforces mirror sync, and the same is true for
`skills/validate/SKILL.md` in Task 9. Leave both mirrors untouched in this plan: mirroring is a
separate, uniform sweep, and doing it here would put the new call sites inside `providers/`, which
Task 11's surface sweep deliberately does not scan. Note the drift in the commit body so a follow-up
can sync all provider mirrors at once.

- [ ] **Verify test passes**

Run: `node --test tests/skills/review-specs-error-retrieval.test.mjs && node --test tests/skills-extension-coverage.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add skills/review-specs/SKILL.md tests/skills/review-specs-error-retrieval.test.mjs
git commit -m "feat(heuristics): re-query by inherited signature on review BLOCK

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 10"
```

---

### Task 11: Two-surfaces-only negative guard [specialist: none] — RUN LAST

**Charter capability:** Error-Triggered Retrieval
**Depends on:** Task 9, Task 10, Task 13 (run after every task that could add a call site)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/skills/review-specs-error-retrieval.test.mjs` (add the negative-scope block)
- Test: `tests/skills/review-specs-error-retrieval.test.mjs`

**Tests:** `tests/skills/review-specs-error-retrieval.test.mjs` — **extend**.

**Why a test and not a code change.** An earlier spec revision listed four surfaces while defining a
derivation input for only two. This test is the artifact that keeps the extra two out until a
follow-up states their inputs with the same precision Behavior 6's table gives the first two.

- [ ] **Write failing test**

```javascript
describe("error-triggered retrieval is wired at exactly two surfaces", () => {
  it("implement-task failure does not trigger signature-keyed retrieval", () => {
    const s = readFileSync(join(PLUGIN_ROOT, "skills/implement/SKILL.md"), "utf8");
    assert.equal(/heuristics retrieve[^\n]*--signature/.test(s), false);
  });

  it("recover dispatch does not trigger signature-keyed retrieval", () => {
    const s = readFileSync(join(PLUGIN_ROOT, "skills/recover/SKILL.md"), "utf8");
    assert.equal(/heuristics retrieve[^\n]*--signature/.test(s), false);
  });

  it("exactly two CALL SURFACES name --signature", () => {
    // Scope the sweep to executable call surfaces ONLY: hooks/**/*.{mjs,sh} and skills/*/SKILL.md.
    // Nothing else is scanned. See the exclusion note below — this set is deliberate.
    const hits = grepSurfaces(
      ["hooks/**/*.mjs", "hooks/**/*.sh", "skills/*/SKILL.md"],
      /heuristics retrieve[^\n]*--signature/,
    );
    assert.deepEqual([...new Set(hits.map((h) => h.file))].sort(), [
      "skills/review-specs/SKILL.md",
      "skills/validate/SKILL.md",
    ]);
  });
});
```

**Exclusion set — required, not incidental.** The sweep MUST scan only `hooks/**/*.{mjs,sh}` and
`skills/*/SKILL.md`. It must **not** scan `lib/`, `tests/`, `docs/`, `.context-index/`, or
`providers/`. Each of those legitimately mentions the flag and a whole-tree grep would go red on
correct work:

| Path | Why it legitimately matches |
|---|---|
| `lib/`, `tests/` | the library implements the parameter and its suites exercise it |
| `docs/cli-reference.md` | Task 13 deliberately adds a `--signature` example |
| `.context-index/` | the spec's Behavior 5 and this plan both quote the invocation |
| `providers/*/skills/` | checked-in provider mirrors, out of scope for the inline-Node policy and for this sweep |

What is being pinned is the set of **executable call surfaces**, and after Tasks 9 and 10 that set is
exactly `skills/validate/SKILL.md` and `skills/review-specs/SKILL.md`. The Stop hook is capture-only
(Scope Boundaries §3a), so `hooks/` is scanned precisely to assert it contributes **no** match.

- [ ] **Verify test fails**

Run: `node --test tests/skills/review-specs-error-retrieval.test.mjs`
Expected: FAIL if the surface set is wrong; otherwise it PASSes as a standing regression pin. Record
in the commit body when no production change was required.

- [ ] **Implement**

Test-only. Triage a failure of the third assertion by which side is wrong:

- **A path outside `hooks/` or `skills/` matched** — the sweep is mis-scoped. Narrow the glob to the
  two directories above. **Never delete documentation, spec, or provider-mirror text to make this
  assertion pass**; those files are supposed to mention the flag.
- **A third `skills/*/SKILL.md` or a `hooks/` file matched** — a genuine extra surface was wired.
  Remove that wiring rather than widening the expected set: the two-surface limit is a spec decision
  (Behavior 6), not an oversight.

- [ ] **Verify test passes**

Run: `node --test tests/skills/review-specs-error-retrieval.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add tests/skills/review-specs-error-retrieval.test.mjs
git commit -m "test(heuristics): pin error-triggered retrieval to exactly two surfaces

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 11"
```

---

### Task 12: End-to-end key agreement [specialist: none]

**Charter capability:** Error-Triggered Retrieval
**Depends on:** Task 9
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/skills/validate-error-retrieval.test.mjs` (add the round-trip block)
- Test: `tests/skills/validate-error-retrieval.test.mjs`

**Tests:** `tests/skills/validate-error-retrieval.test.mjs` — **extend**.

**This is the criterion that proves the loop closes.** Every ranking test in Tasks 2-6 passes even
when the read and write keys disagree. Only a round trip that drives the *live capture hook* and then
goes back through the *real read verb* catches drift.

- [ ] **Write failing test**

```javascript
it("captures a FAIL, then retrieves that same entry by the re-derived key", async () => {
  // 1. Drive the LIVE capture hook with a FAIL verdict — this writes the entry + its signature.
  const first = runHookWith({ projectRoot: root, outcome: "FAIL", checks: CHECKS });
  assert.equal(first.status, 0);

  // 2. Read the entry the hook actually stored — no re-derivation in the test.
  const stored = readStoredHeuristics(root).find((e) => e.signature);
  assert.ok(stored, "capture must have written a signature");

  // 3. Re-derive through the REAL read path the skill uses: the CLI verb, not a local helper call.
  const lookup = runCli(root, ["heuristics", "signature", "--origin", "validate",
    ...CHECKS.flatMap((c) => ["--check-id", c.id])]).stdout.trim();
  assert.equal(lookup, stored.signature, "read and write keys must be identical");

  // 4. And the retrieve verb returns that entry under the error-time cap.
  const out = JSON.parse(runCli(root, ["heuristics", "retrieve",
    "--module", stored.scope, "--signature", lookup, "--injection-limit", "3"]).stdout);
  assert.equal(out.count, 1, "the loop closes");
  assert.match(out.rendered, /confidence: low/,
    "and it closes on a low-confidence entry, which is where failure entries stay forever");
});

it("a second FAIL of the same checks under a DIFFERENT spec matches the same signature", () => {
  runHookWith({ projectRoot: root, outcome: "FAIL", checks: CHECKS, specPath: SPEC_A });
  runHookWith({ projectRoot: root, outcome: "FAIL", checks: CHECKS, specPath: SPEC_B });
  const stored = readStoredHeuristics(root).filter((e) => e.signature);
  assert.equal(new Set(stored.map((e) => e.signature)).size, 1,
    "signature is the CROSS-SCOPE recurrence key; id stays spec-scoped");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/validate-error-retrieval.test.mjs`
Expected: PASS if Tasks 1 and 9 are correct. Before implementing, confirm the test genuinely
exercises the loop by temporarily reverting Task 1's hook refactor to a second local composition and
observing the test go RED — then restore. Do not skip this check: a test that passes for the wrong
reason is exactly the failure mode Behavior 0 warns about.

- [ ] **Implement**

Test-only. If the assertion fails, the defect is in Task 1's extraction or Task 9's call site — fix
there, never by adjusting the expected key in the test.

- [ ] **Verify test passes**

Run: `node --test tests/skills/validate-error-retrieval.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add tests/skills/validate-error-retrieval.test.mjs
git commit -m "test(heuristics): assert end-to-end read/write key agreement

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 12"
```

---

### Task 13: Docs — `--signature` on the retrieve verb [specialist: none]

**Charter capability:** Signature-Keyed Retrieval
**Depends on:** Task 7
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `docs/cli-reference.md:522-532`
- Test: `tests/cli/heuristics-retrieve-signature.test.mjs`

**Tests:** `tests/cli/heuristics-retrieve-signature.test.mjs` — **extend** (documentation coherence
belongs with the behavior it documents).

- [ ] **Write failing test**

```javascript
it("documents --signature and --check-id in the cli reference", () => {
  const doc = readFileSync(join(PLUGIN_ROOT, "docs/cli-reference.md"), "utf8");
  assert.match(doc, /heuristics retrieve --module <slug>[^\n]*--signature/);
  assert.match(doc, /heuristics signature[^\n]*--check-id/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics-retrieve-signature.test.mjs`
Expected: FAIL — the signature line at `:525` has no `--signature`.

- [ ] **Implement**

Update the `heuristics` entry at `docs/cli-reference.md:522-532`:

- **Signature** line `:525` — add `[--signature <sig>]` to the `retrieve` form.
- **Purpose** `:523` — one clause noting that `--signature` performs an exact-match recurrence lookup
  that outranks confidence and is exempt from the `low` floor.
- **Example** `:529` — add a second line showing the error-time form, and note that a `--signature`
  call defaults to the error-time cap (`heuristics.error_injection_limit`, default 3) rather than the
  entry-time 8:
  `adev heuristics retrieve --module auth --signature validate-<digest> --tier summary --format text`
- **Signature** line `:525` — also add the `--check-id` form to the `signature` verb:
  `heuristics signature --origin validate --check-id <id> [--check-id <id> ...]`
- **Called by** `:532` — the list already covers `/adev:validate` and `/adev:review-specs`, so no
  change is required. If you add a clarifying clause, it must say that **both** error-time calls are
  made from skill prose (`/adev:validate` on FAIL, `/adev:review-specs` on BLOCK). **Do not write that
  the Stop hook makes a retrieve call** — it does not, and never does in this plan (Scope Boundaries
  §3a). The hook is capture-only.

Do **not** update `.context-index/memory/heuristics/_format.md` — the `signature` field was already
documented by `failure-signature-key`, which is out of scope here.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics-retrieve-signature.test.mjs && npm test`
Expected: PASS.

- [ ] **Commit**

```bash
git add docs/cli-reference.md tests/cli/heuristics-retrieve-signature.test.mjs
git commit -m "docs(heuristics): document --signature on the retrieve verb

Spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
Plan-task: 13"
```

---

## Acceptance Criteria Coverage

| Spec criterion | Task |
|---|---|
| Exact match returns a `low` entry module scope would drop | 3 |
| Non-matching `low` entry still excluded — exemption does not leak | 3 |
| End-to-end key agreement (capture then retrieve the same entry) | 12 |
| Read and write use one helper — grep asserts no second composition | 1 |
| Signature > keyword > module-scope ranking | 2 |
| A `low` signature match outranks an unrelated `medium` | 3 |
| `low` match retained, `medium` dropped when the cap binds | 4 |
| `injectionLimit: 3` with two matches leaves one formula-split slot | 4 |
| Zero matches → `highMax`/`mediumMax` numerically identical to today | 4 |
| Entry matching both axes appears exactly once | 5 |
| Unmatched signature falls back within the caller's cap, never 8 | 6 |
| CLI empty shapes: `__NONE__` (text) and `{"count":0,"rendered":""}` (json) | 7 |
| Live three-key `error` shape preserved on the unreadable-store path | 7 (carry-forward) |
| Malformed `--signature` is no match, not an argument error | 7 |
| Validate FAIL re-queries from the live payload, not the lifecycle log | 9 |
| Review BLOCK derives from `blocker_id` via inherited mode | 10 |
| Exactly two surfaces; implement/recover assert-negative | 11 |
| Error-time cap of 3, independent of `injection_limit`, governs fallback | 8 |
| Every failure path completes when the store is missing or unreadable | 7, 9, 10 |
| No-signature entry-time retrieval byte-identical | 2, 4 |
| `npm test` passes | all |
| No constitutional violations | Constitution Validation above |

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are
recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- No lint or typecheck command is configured for this project (constitution Quality Gates declares
  `npm test` only) — nothing to run, nothing to skip
- `.githooks/pre-commit-no-inline-node` passes on every commit touching `skills/**/SKILL.md`
  (relevant to Task 10)
- Version parity untouched — no task bumps `package.json`, `.claude-plugin/plugin.json`, or
  `.cursor-plugin/plugin.json` (release-please owns versions, ADR-0008)
- All acceptance criteria from the spec satisfied (see the coverage table above)

`.context-index/governance/gates.yaml` gate definitions take precedence over the constitution's
Quality Gates block when present; deterministic gates run with their commands and probabilistic gates
are noted as skipped.



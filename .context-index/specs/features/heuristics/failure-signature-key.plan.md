<!-- partial_schema: plan@1 -->

# Implementation Plan: Failure Signature Key — one content-addressed identity for recurring failures

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md (revision 6, Phase 3)
> **Spec:** .context-index/specs/features/heuristics/failure-signature-key.spec.md (revision 8)
> **Review:** PASS_WITH_NOTES (2026-08-15, after 8 review rounds)
> **Platform:** Node.js, JavaScript (pure ESM `.mjs`), npm, `node:test` built-in runner
> **Risk level:** high — `risk-policies.yaml` sets `test_depth: thorough`

**Goal:** Collapse the four incompatible copies of "derive a stable id by hashing something" into one shared digest function with two named normalizers, expose it as the `adev heuristics signature` CLI verb, add the `signature` field to the heuristic schema write path, make `id` derivation location-independent, and rekey the existing store once.

**Architecture:** All derivation logic lands in `lib/heuristics.mjs` — one `deriveDigest(input, normalizer)` plus two exported normalizers (`normalizeFailureText`, `normalizeIdInput`) and two composed helpers (`deriveSignature`, `deriveHeuristicId`). Every caller this spec touches (the validate Stop hook, both test harnesses, and the new CLI subcommands) imports those exports instead of holding a private `createHash` copy. The CLI surface grows two subcommands in `lib/cli/heuristics.mjs` — `signature` (two modes: derived hashes text, inherited reuses a `blocker_id` hash component via `parseBlockerId` from `lib/blocker-id.mjs`) and `migrate-keys` (a one-time, idempotent store rekey). Zero new dependencies: hashing is `node:crypto`'s `createHash`, already imported by every existing copy.

**Carry-forward review note (adjudicated `structural-architect:mutable-hash-input:a15235f5`, BLOCKER → WARNING, operator-accepted, unresolved in the spec text):** Behavior 8 claims a migrated entry "lands on the id a fresh extraction would produce." That claim is **false** whenever an entry's stored `pattern` has drifted from the pattern text today's extractor would generate. The migration contract is still satisfiable — it yields a deterministic, location-independent id either way — but the stated rationale is wrong. Tasks 7 and 8 therefore describe migration as *recomputing a deterministic location-independent id from the entry's stored `pattern`*, and **must not** assert equality between a migrated id and a fresh-extraction id anywhere in test code.

---

## File Structure

**Create:**
- `tests/lib/heuristics-digest.test.mjs` — shared digest function + normalizer separation
- `tests/lib/heuristics-signature-field.test.mjs` — `signature` through the three write-path gates
- `tests/cli/heuristics-signature.test.mjs` — `adev heuristics signature`, both modes + error cases
- `tests/cli/heuristics-migrate-keys.test.mjs` — `adev heuristics migrate-keys` classification, rekey, merge, idempotency
- `tests/hooks/post-validate-heuristic-id.test.mjs` — location-independent `id` from the validate Stop hook

**Modify:**
- `lib/heuristics.mjs:101` (`validateEntry`) — accept and validate optional `signature`
- `lib/heuristics.mjs:185-199` (`FIELD_ORDER`) — add `signature`
- `lib/heuristics.mjs:733` (`writeHeuristic` update-path `finalEntry` literal) — carry `signature`, existing-wins
- `lib/heuristics.mjs:767` (`writeHeuristic` new-entry-path `finalEntry` literal) — carry `signature`
- `lib/heuristics.mjs` (new exports) — `deriveDigest`, `normalizeFailureText`, `normalizeIdInput`, `deriveSignature`, `deriveHeuristicId`
- `lib/cli/heuristics.mjs` — `signature` and `migrate-keys` subcommands, dispatch + `USAGE` + `help()`
- `hooks/post-validate-extract-heuristics.mjs:97` — project-root resolution + containment check (fail closed when unresolvable)
- `hooks/post-validate-extract-heuristics.mjs:123-127` — repo-relative spec path in the hash input
- `tests/skills/validate-success-heuristic-harness.mjs:131-149` — call the shared helpers, drop the private copy
- `tests/skills/recover-extract-heuristic-harness.mjs:91-125` — call the shared helpers, drop the private copy; keep category-prefixed ids byte-identical
- `.context-index/memory/heuristics/_format.md:203-233` — `signature` field, two signature modes, corrected ID Namespace Convention, corrected recover category slugs
- `tests/lib/heuristics-format-doc.test.mjs` — assertions for the revised `_format.md` contract
- `tests/skills/recover-extract-heuristic.test.mjs` — byte-identity fixture for recover ids across the change
- `tests/skills/validate-success-heuristic.test.mjs` — harness now derives ids from a repo-relative path

**Reference (read, do not modify):**
- `lib/blocker-id.mjs:110-125` — `parseBlockerId`; the inherited-mode signature reuses its `locationHash`
- `skills/recover/SKILL.md:130-185` — the closed six-value diagnosis-category set that Behavior 8's discriminator keys on
- `skills/recover/SKILL.md:387-397` — the prose ID Derivation Rule this verb replaces (removal itself belongs to `failure-capture.spec.md`)
- `.context-index/specs/features/heuristics/charter.md` — capability map + `signature` invariants
- `.context-index/memory/heuristics/*.md` — live store; source of the migration fixtures (`deploy-core-spec-91c5a876`, `prototype-core-277ce212`, `validate-config-single-source-spec-fc36fed8`)

**Out of scope (owned by `failure-capture.spec.md`, do not touch):** removal of the dead `deriveId` twin at `lib/cli/heuristics.mjs:103-108`, removal of the `extract` verb, removal of the `skills/recover/SKILL.md` prose rule, and the `docs/cli-reference.md` entries for the new verbs.

---

## Context Packets

### Task 1 Context
- Spec: `failure-signature-key.spec.md` — Behaviors 2, 4, 7; the "Two keys, two rules, one digest function" table
- Charter: `charter.md` (capability: Failure Signature Primitive; invariants "Signature Stability", "`id` derivation is location-independent")
- Source files: `lib/heuristics.mjs` (full read), `tests/skills/recover-extract-heuristic-harness.mjs:91-125` (`normalizeRootCause` — the byte-compatibility reference), `lib/cli/heuristics.mjs:97-108` (existing `deriveId`, signatures only)
- Constitution: principle 1 (built-ins only), principle 3 (pure ESM)
- Heuristics: 3 entries for module `heuristics` (IDs: `eval-with-session-jsonl`, `cache-reads-dominate-cost`, `summarize-output-preserves-quality`)

### Task 2 Context
- Spec: Behaviors 5, 5a, 5b, 6; Error Cases table
- Charter: capability Signature Schema Field; invariants "`signature` is optional", "A `signature` is never rewritten once assigned"
- Source files: `lib/heuristics.mjs:101-185` (`validateEntry`, `FIELD_ORDER`, full read), `lib/heuristics.mjs:690-800` (`writeHeuristic`, full read)
- Reference: `.context-index/memory/heuristics/_format.md` (Tags Field section — the closest existing optional-field precedent)

### Task 3 Context
- Spec: Behaviors 1, 3, 4; Error Cases rows `INVALID_SIGNATURE_ORIGIN`, `EMPTY_SIGNATURE_TEXT`
- Source files: `lib/cli/heuristics.mjs` (full read — dispatch, `parseArgs` usage, exit-code contract), `cli/index.mjs:1838` (subcommand registration)
- Cross-cutting: `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md` (driver-substrate contract: `run({projectRoot, argv, manifest})` + `help()`)
- Task 1 output: `deriveSignature`, `normalizeFailureText`

### Task 4 Context
- Spec: Behaviors 3a, 3b; Error Cases rows `CONFLICTING_SIGNATURE_INPUT`, `INVALID_BLOCKER_ID`
- Source files: `lib/blocker-id.mjs` (full read — `parseBlockerId` returns `{reviewer, type, locationHash}`)
- Charter: invariant "A heuristic whose origin is a `/adev:review-specs` BLOCK carries a `signature` derived from that finding's `blocker_id`"
- Task 3 output: the `signature` subcommand skeleton

### Task 5 Context
- Spec: Behaviors 7, 7a; Error Cases row "Project root unresolvable when deriving an `id`"
- Source files: `hooks/post-validate-extract-heuristics.mjs` (full read), `tests/hooks/session-capture.test.mjs` (signatures only — hook-test harness pattern)
- Constitution: principle 4 (hook protocol — exit 0, stdout is the protocol channel, warnings go to stderr)
- Task 1 output: `deriveHeuristicId`, `normalizeIdInput`

### Task 6 Context
- Spec: Actionable Task Map row "Update test harnesses"; Postcondition "every caller that this spec touches invokes it rather than holding a private copy"
- Source files: `tests/skills/validate-success-heuristic-harness.mjs` (full read), `tests/skills/recover-extract-heuristic-harness.mjs` (full read), `tests/skills/recover-extract-heuristic.test.mjs` + `tests/skills/validate-success-heuristic.test.mjs` (signatures only)
- Task 1 output: all five new exports

### Task 7 Context
- Spec: Behavior 8 in full — discriminator, ambiguity guard, alias normalization, evidence-path mapping, legacy slug conventions, out-of-scope list
- Reference: `skills/recover/SKILL.md:130-185` (the closed six-value category set — **the authoritative source, not `_format.md`**)
- Source files: `lib/heuristics.mjs` (`parseHeuristicsFile`, `serializeHeuristic`, atomic write path), `lib/cli/heuristics.mjs` (dispatch)
- Live store: `.context-index/memory/heuristics/*.md` — real ids for fixtures; measured `evidence[].source` drift (24 `validation` / 4 `learn` / 2 `validate` / 2 `recover`)
- **Carry-forward note:** do not assert migrated-id == fresh-extraction id

### Task 8 Context
- Spec: Behaviors 9, 10; Postconditions "No entry has lost evidence, confidence, or contradiction history"
- Charter: invariant "A Heuristic with two or more `contradicted-by` entries cannot remain at `high` confidence"; "Demotion path: two contradictions archive the entry regardless of prior confidence"
- Source files: `lib/heuristics.mjs` (`autoPromote`, `mergeEvidence`, `archiveHeuristic`, `addContradiction`)
- Task 7 output: the classifier and the `migrate-keys` skeleton

### Task 9 Context
- Spec: Actionable Task Map row "Revise `_format.md`"; acceptance criteria on `_format.md`
- Source files: `.context-index/memory/heuristics/_format.md` (full read), `tests/lib/heuristics-format-doc.test.mjs` (full read)
- Reference: `skills/recover/SKILL.md:130-185` (correct category slugs), charter row 152 (`_format.md` is the public schema contract)
- Tasks 1-5 output: the shipped field, verb, and id rule the doc must describe

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates.
- **Evidence:** 1 observation

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost.
- **Evidence:** 1 observation

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts.
- **Evidence:** 1 observation

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 — both edit `lib/heuristics.mjs`.
- **Group B (sequential):** Task 3 → Task 4 — both edit the same `signature` subcommand in `lib/cli/heuristics.mjs`. Depends on Group A (Task 1).
- **Group C (independent):** Task 5 → Task 6 — `hooks/post-validate-extract-heuristics.mjs` and `tests/skills/*-harness.mjs`; no file overlap with A or B. Depends on Group A (Task 1).
- **Group D (sequential):** Task 7 → Task 8 — both edit the `migrate-keys` subcommand. Depends on Group A (Tasks 1 and 2).
- **Group E (independent):** Task 9 — `_format.md` + its doc test only. Depends on Groups A, B, and C landing (it documents the shipped shape, including the inherited signature mode that ships in Task 4).

Groups B, C, and D can run concurrently once Group A is complete. Groups B and D both touch `lib/cli/heuristics.mjs`, but in disjoint subcommand blocks — if `/adev:implement` serializes on file identity, run D after B.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Shared digest function and the two normalizers | small | unit | — | 1 create, 1 modify |
| 2 | Thread `signature` through the three write-path gates | medium | unit | Task 1 | 1 create, 1 modify |
| 3 | `adev heuristics signature` — derived mode | medium | unit | Task 1 | 1 create, 1 modify |
| 4 | `adev heuristics signature` — inherited (`--blocker-id`) mode | small | unit | Task 3 | 0 create, 2 modify |
| 5 | Location-independent `id` in the validate Stop hook | medium | unit | Task 1 | 1 create, 1 modify |
| 6 | Converge both test harnesses on the shared helpers | medium | unit | Task 1, Task 5 | 0 create, 4 modify |
| 7 | `adev heuristics migrate-keys` — classification and mapping | large | unit | Task 1, Task 2 | 1 create, 1 modify |
| 8 | `migrate-keys` — rekey, collision merge, idempotency, reporting | large | unit | Task 7 | 0 create, 2 modify |
| 9 | Revise `_format.md` to the shipped contract | medium | unit | Task 2, Task 4, Task 5 | 0 create, 2 modify |

All nine tasks resolve to `strategy: unit` (source: fallback — the spec declares no `test_strategy`, and `manifest.yaml` declares no `test_strategies` globs). The Strategy Summary and Test Infrastructure Requirements sections are therefore omitted: no task needs an external system, credential, or pre-provisioned state.

**Test granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). Tasks that implement a behavior already covered by a suite created earlier in this plan **extend** that suite rather than creating a new one; the `**Tests:**` field on each task says which.

**Specialist routing:** `manifest.yaml` declares `specialists: []`, so every task is tagged `[specialist: none]`.

**Constitution check:** no boundary in "Requires Human Approval" is crossed. No new external dependency (`node:crypto` only), no new skill in the lifecycle order, no change to the hook stdin/stdout JSON protocol (Task 5 changes the hook's hash *input*, not its protocol), no change to the CLI installation path structure or the plugin registration format. No `governance/boundaries.yaml` exists in this project, so no boundary-pattern rules apply.

---

## Tasks

### Task 1: Shared digest function and the two normalizers [specialist: none]

**Charter capability:** Failure Signature Primitive
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs` — add five exports near the top-of-file helpers, above `validateEntry`
- Test: `tests/lib/heuristics-digest.test.mjs`

**Tests:** create `tests/lib/heuristics-digest.test.mjs` — covers Behaviors 2, 4, and the derivation half of 7/7a.

**Context to load:**
- `tests/skills/recover-extract-heuristic-harness.mjs:91-99` — `normalizeRootCause`; `normalizeFailureText` must be **byte-compatible** with it or Task 6's byte-identity criterion fails
- Spec's "Two keys, two rules, one digest function" table

**Shape to implement:**

```javascript
export function normalizeFailureText(text)   // lowercase → strip /[^\p{L}\p{N}\s\-_]/gu → collapse \s+ → trim
export function normalizeIdInput(text)       // lowercase → fold \ to / → NO punctuation stripping
export function deriveDigest(input, normalizer)  // first 8 lowercase hex of sha256(normalizer(input))
export function deriveSignature(origin, text)    // `${origin}-${deriveDigest(text, normalizeFailureText)}`
export function deriveHeuristicId(prefix, repoRelativeSpecPath, pattern)
                                              // `${prefix}-${deriveDigest(path + "|" + pattern, normalizeIdInput)}`
```

`deriveSignature` and `deriveHeuristicId` are the *only* two composition sites. `deriveDigest` takes the normalizer as a parameter and never chooses one itself — that parameterisation is what keeps "exactly one implementation" true per-rule without merging the two rules.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFailureText, normalizeIdInput, deriveDigest,
  deriveSignature, deriveHeuristicId,
} from "../../lib/heuristics.mjs";

test("normalizeFailureText strips punctuation but keeps - and _", () => {
  assert.equal(normalizeFailureText("Error:  Cache   MISS, on-disk_v2!"), "error cache miss on-disk_v2");
});

test("normalizeIdInput preserves /, . and | and folds backslashes", () => {
  assert.equal(
    normalizeIdInput(".context-index\\Specs\\Foo.spec.md|Some Pattern."),
    ".context-index/specs/foo.spec.md|some pattern.",
  );
});

test("two distinct spec paths do not collide under normalizeIdInput", () => {
  const a = deriveHeuristicId("x", "specs/features/a/foo.spec.md", "P");
  const b = deriveHeuristicId("x", "specs/features/b/foo.spec.md", "P");
  assert.notEqual(a, b);
});

test("deriveSignature is stable across case, whitespace and punctuation drift", () => {
  assert.equal(
    deriveSignature("recover", "Error: cache miss"),
    deriveSignature("recover", "  ERROR   cache,  miss  "),
  );
  assert.match(deriveSignature("recover", "Error: cache miss"), /^recover-[0-9a-f]{8}$/);
});

test("deriveDigest reads no clock, path, or env — repeated calls are identical", () => {
  const first = deriveDigest("payload", normalizeFailureText);
  process.env.ADEV_TEST_NOISE = "x";
  assert.equal(deriveDigest("payload", normalizeFailureText), first);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-digest.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../../lib/heuristics.mjs' does not provide an export named 'deriveDigest'`

- [ ] **Implement**

Add the five exports to `lib/heuristics.mjs`. Reuse the already-imported `createHash` from `node:crypto` — do not add a duplicate import. Keep `normalizeFailureText`'s operation order exactly `toLowerCase()` → punctuation strip → whitespace collapse → `trim()`, matching `normalizeRootCause`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-digest.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/heuristics/failure-signature-key`

Stage `lib/heuristics.mjs` and `tests/lib/heuristics-digest.test.mjs`, then commit with message:

```
feat(heuristics): add shared digest function and the two normalizers

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 1
```

---

### Task 2: Thread `signature` through the three write-path gates [specialist: none]

**Depends on:** Task 1
**Charter capability:** Signature Schema Field
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:101` (`validateEntry`), `lib/heuristics.mjs:185-199` (`FIELD_ORDER`), `lib/heuristics.mjs:733` (update-path `finalEntry`), `lib/heuristics.mjs:767` (new-entry-path `finalEntry`)
- Test: `tests/lib/heuristics-signature-field.test.mjs`

**Tests:** create `tests/lib/heuristics-signature-field.test.mjs` — covers Behaviors 5, 5a, 5b, 6.

**Context to load:**
- Spec Behavior 5 — all three gates are required; `FIELD_ORDER` alone is insufficient because both `finalEntry` object literals discard unnamed fields
- Charter invariant: "A `signature` is never rewritten once assigned"

**The one thing that is easy to get wrong:** `signature` uses **existing-wins** semantics, the opposite of the incoming-wins rule already used for `antiPattern` and `tags` immediately above it in the update path. A signature is an identity, not a refinement. Copying the neighbouring `antiPattern` block verbatim produces the wrong behaviour and still passes a naive round-trip test.

- [ ] **Write failing test**

```javascript
test("signature round-trips on the NEW-entry path", async () => { /* write then readHeuristics */ });
test("signature round-trips on the UPDATE path", async () => { /* write twice, same id */ });
test("stored signature wins when incoming omits it", async () => { /* … */ });
test("stored signature wins when incoming carries the SAME one", async () => { /* … */ });
test("stored signature wins when incoming carries a DIFFERENT one, and warns", async () => {
  // write succeeds, stored value kept, divergence logged at warning level (stderr),
  // NOT thrown — a second failure text reaching one id is informative, not invalid.
});
test("validateEntry rejects a malformed signature", () => {
  // not a string / not matching /^[a-z0-9][a-z0-9-]*$/ / longer than 64 chars
  // → throws with code HEURISTICS_SCHEMA_ERROR
});
test("validateEntry accepts an entry with no signature", () => { /* … */ });
test("an entry written without a signature reads back with signature undefined", async () => { /* … */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-signature-field.test.mjs`
Expected: FAIL — round-trip assertions report `undefined`, because `finalEntry` drops the field before serialization

- [ ] **Implement**

1. `validateEntry`: optional `signature`; when present it must be a string matching `/^[a-z0-9][a-z0-9-]*$/` with length ≤ 64, else throw `HEURISTICS_SCHEMA_ERROR`.
2. `FIELD_ORDER`: insert `"signature"` in a deterministic position (after `"tags"`, before `"confidence"`).
3. Update path (`:733`): stored value wins — take `existing.signature` when present, otherwise `entry.signature` when present. When both are present and differ, keep the stored one and write a one-line divergence warning to stderr naming the id, the stored signature, and the incoming one.
4. New-entry path (`:767`): copy `entry.signature` when defined.

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-signature-field.test.mjs tests/lib/heuristics.test.mjs`
Expected: PASS (the existing suite must stay green — entries without `signature` are unaffected)

- [ ] **Commit**

Stage `lib/heuristics.mjs` and `tests/lib/heuristics-signature-field.test.mjs`, then commit with message:

```
feat(heuristics): carry signature through validate, write, and serialize

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 2
```

---

### Task 3: `adev heuristics signature` — derived mode [specialist: none]

**Depends on:** Task 1
**Charter capability:** Failure Signature Primitive
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs` — new `signature` subcommand, `USAGE` string, `help()`, module-header subcommand list
- Test: `tests/cli/heuristics-signature.test.mjs`

**Tests:** create `tests/cli/heuristics-signature.test.mjs` — covers Behaviors 1, 3, 4 and the `EMPTY_SIGNATURE_TEXT` error row.

**Context to load:**
- `lib/cli/heuristics.mjs` module header — the driver-substrate contract (`run({projectRoot, argv, manifest})` + `help()`, no `LIFECYCLE_STEP` export, this module is observational)
- Spec Error Cases table

**Contract:**
- `adev heuristics signature --origin <recover|validate|implement> --text <text>` → prints `<origin>-<8hex>` on stdout, exit 0
- Illegal `--origin` → `INVALID_SIGNATURE_ORIGIN` on stderr with the legal set printed, **stdout empty**, exit 1. The rejected value is stripped of control and ANSI characters and truncated before it is echoed
- `--text` missing or empty **after normalization** → `EMPTY_SIGNATURE_TEXT`, stdout empty, exit 1. Note the ordering: `"!!!"` normalizes to `""` and must be rejected

- [ ] **Write failing test**

```javascript
test("derived mode prints <origin>-<8hex> and exits 0", () => { /* spawn the CLI */ });
test("case, whitespace and punctuation drift yield an identical digest", () => { /* … */ });
test("illegal --origin exits 1 with INVALID_SIGNATURE_ORIGIN and empty stdout", () => {
  // also asserts the legal set is printed and that an origin containing
  // ANSI escapes / control chars is sanitized and truncated in the echo
});
test("--text that normalizes to empty exits 1 with EMPTY_SIGNATURE_TEXT and empty stdout", () => { /* --text "!!!" */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics-signature.test.mjs`
Expected: FAIL — `usage: adev heuristics <extract|retrieve|write>` / unknown subcommand, exit 1

- [ ] **Implement**

Add the `signature` branch to the subcommand dispatch, parsing `--origin`, `--text`, and (Task 4) `--blocker-id` via `parseArgs`. Validate origin against the closed set `recover | validate | review-specs | implement`; `review-specs` falls through to Task 4's inherited path. Call `deriveSignature` from `lib/heuristics.mjs` — do not reimplement normalization or hashing here.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics-signature.test.mjs tests/cli/heuristics.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/cli/heuristics.mjs` and `tests/cli/heuristics-signature.test.mjs`, then commit with message:

```
feat(cli): add adev heuristics signature derived mode

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 3
```

---

### Task 4: `adev heuristics signature` — inherited (`--blocker-id`) mode [specialist: none]

**Depends on:** Task 3
**Charter capability:** Failure Signature Primitive
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs` — the `signature` subcommand's mode branch; import `parseBlockerId` from `../blocker-id.mjs`
- Modify: `tests/cli/heuristics-signature.test.mjs`
- Test: `tests/cli/heuristics-signature.test.mjs`

**Tests:** extend `tests/cli/heuristics-signature.test.mjs` — Behaviors 3a and 3b share the verb's suite created in Task 3 (granularity `per-behavior`).

**Context to load:**
- `lib/blocker-id.mjs:110-125` — `parseBlockerId(id)` returns `{reviewer, type, locationHash}` and throws `INVALID_BLOCKER_ID`
- Spec Behavior 3a: inherited mode **hashes nothing**. It reuses `locationHash` verbatim as the digest

**Contract:**
- `--origin review-specs --blocker-id <id>` → `review-specs-<locationHash>`, exit 0
- `--origin review-specs` without `--blocker-id` → `CONFLICTING_SIGNATURE_INPUT`, exit 1
- `--blocker-id` with any origin other than `review-specs` → `CONFLICTING_SIGNATURE_INPUT`, exit 1
- `--text` and `--blocker-id` together → `CONFLICTING_SIGNATURE_INPUT`, exit 1
- `--blocker-id` that fails `parseBlockerId` → `INVALID_BLOCKER_ID`, exit 1

- [ ] **Write failing test**

```javascript
test("inherited mode reuses the blocker_id hash component verbatim", () => {
  // --origin review-specs --blocker-id structural-architect:mutable-hash-input:a15235f5
  // → stdout exactly "review-specs-a15235f5"
  // and NOT equal to deriveSignature("review-specs", <the finding text>)
});
test("review-specs without --blocker-id → CONFLICTING_SIGNATURE_INPUT", () => { /* … */ });
test("--blocker-id with --origin recover → CONFLICTING_SIGNATURE_INPUT", () => { /* … */ });
test("--text plus --blocker-id → CONFLICTING_SIGNATURE_INPUT", () => { /* … */ });
test("unparseable --blocker-id → INVALID_BLOCKER_ID, stdout empty", () => { /* "not-an-id" */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics-signature.test.mjs`
Expected: FAIL — `review-specs` currently falls into derived mode and rejects on missing `--text`

- [ ] **Implement**

Branch on origin before touching `--text`: `review-specs` requires `--blocker-id` and rejects `--text`; every other origin rejects `--blocker-id`. Then call `parseBlockerId` and emit `review-specs-${locationHash}`. Never call `deriveDigest` on this path.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics-signature.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/cli/heuristics.mjs` and `tests/cli/heuristics-signature.test.mjs`, then commit with message:

```
feat(cli): derive review-specs signatures from blocker_id

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 4
```

---

### Task 5: Location-independent `id` in the validate Stop hook [specialist: none]

**Depends on:** Task 1
**Charter capability:** Location-Independent `id`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `hooks/post-validate-extract-heuristics.mjs:97` (project-root resolution) and `:123-127` (hash input)
- Test: `tests/hooks/post-validate-heuristic-id.test.mjs`

**Tests:** create `tests/hooks/post-validate-heuristic-id.test.mjs` — covers Behaviors 7, 7a and the "project root unresolvable" error row.

**Context to load:**
- `hooks/post-validate-extract-heuristics.mjs` in full — note the SEC-2 failure mode: warnings go to stderr, stdout is the protocol channel, and the process always exits 0
- Constitution principle 4 (hook protocol) — this task changes the hash *input*, never the stdin/stdout JSON contract

**Contract:**
- The hash input becomes `<repo-relative-spec-path>|<pattern>` passed through `normalizeIdInput`, composed by the caller as `<spec-slug>-<digest>` via `deriveHeuristicId(specSlug, repoRelSpecPath, pattern)`.
- The prefix stays caller-supplied. The origin never determines an `id` prefix (Behavior 7a) — `/adev:recover` keeps composing `<category-slug>-<digest>`.
- **Fail closed** when the project root is unresolvable: if `CLAUDE_PROJECT_ROOT`/`cwd` is not absolute, does not exist, or does not contain the spec path (the relative path escapes with `..`), skip extraction entirely — write no entry, log one warning to stderr, exit 0. Never guess a key. Signature derivation is unaffected, since it reads no path.

- [ ] **Write failing test**

```javascript
test("same spec + pattern in two temp dirs with different absolute paths yields an identical id", async () => {
  // build two temp project roots via createTempDir(), copy the same spec into each,
  // drive the hook with the same verdict JSON on stdin, read the store from both,
  // assert entry.id is byte-identical. This is the regression that the whole spec exists for.
});
test("the derived id has no `.spec` stem in its slug", async () => { /* canonical stripped form */ });
test("unresolvable project root skips extraction: no entry written, warning on stderr, exit 0", async () => {
  // CLAUDE_PROJECT_ROOT set to a relative or non-containing path
});
test("stdout stays empty on the skip path (hook protocol channel is unpolluted)", async () => { /* … */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/hooks/post-validate-heuristic-id.test.mjs`
Expected: FAIL — the two temp roots produce different ids, because the hash input is still the absolute path

- [ ] **Implement**

Resolve the project root, validate containment of the spec path, compute the repo-relative path with `relative(projectRoot, absSpecPath)`, and call `deriveHeuristicId` from `lib/heuristics.mjs`. Delete the local `createHash` id derivation and the now-unused `normalizePath` helper if nothing else references it. Keep the existing `slugify(basename(specPath, '.md').replace(/\.spec$/i, ''))` prefix derivation — the stem is already stripped there, which is the canonical form Behavior 7 requires.

- [ ] **Verify test passes**

Run: `node --test tests/hooks/post-validate-heuristic-id.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `hooks/post-validate-extract-heuristics.mjs` and `tests/hooks/post-validate-heuristic-id.test.mjs`, then commit with message:

```
fix(hooks): derive heuristic ids from repo-relative spec paths

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 5
```

---

### Task 6: Converge both test harnesses on the shared helpers [specialist: none]

**Depends on:** Task 1, Task 5
**Charter capability:** Failure Signature Primitive (recover harness) + Location-Independent `id` (validate harness)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/skills/validate-success-heuristic-harness.mjs:131-149` — delete `normalizeAbsPath` and the private `deriveId`; call `deriveHeuristicId` with a repo-relative path
- Modify: `tests/skills/recover-extract-heuristic-harness.mjs:91-125` — delete `normalizeRootCause` and `hashPrefix`; call `normalizeFailureText` + `deriveDigest`, keeping the `CATEGORY_ID_SLUGS` prefix composition
- Modify: `tests/skills/validate-success-heuristic.test.mjs` — the harness now takes a repo-relative path
- Modify: `tests/skills/recover-extract-heuristic.test.mjs` — add the pre-change byte-identity fixture
- Test: `tests/skills/recover-extract-heuristic.test.mjs`, `tests/skills/validate-success-heuristic.test.mjs`

**Tests:** extend `tests/skills/recover-extract-heuristic.test.mjs` and `tests/skills/validate-success-heuristic.test.mjs` — these behaviors (7a byte-identity, single-implementation postcondition) already have suites; per-behavior granularity extends them rather than creating new ones.

**Context to load:**
- Both harness files in full
- Spec Behavior 7a and the postcondition "every caller that this spec touches invokes it rather than holding a private copy"

**The load-bearing constraint:** `/adev:recover` ids must be **byte-identical before and after this change**. `failure-capture.spec.md` Behavior 6 depends on it, and Behavior 8's migration deliberately never rekeys them. Capture a fixture of recover ids from the pre-change harness first, then assert the post-change harness reproduces it exactly. If `normalizeFailureText` from Task 1 is not byte-compatible with the deleted `normalizeRootCause`, this is where it surfaces — fix Task 1's normalizer, not the fixture.

- [ ] **Write failing test**

```javascript
// tests/skills/recover-extract-heuristic.test.mjs — new cases
test("recover ids are byte-identical to the pre-change fixture", () => {
  // fixture captured from the current harness before the refactor, e.g.
  // { category: "MISSING_CONTEXT", rootCause: "Error: cache miss on third-party API",
  //   id: "missing-context-<8hex>" } — assert deriveId reproduces it exactly
});
test("the recover harness holds no private createHash call", () => {
  // read the harness source; assert it imports from lib/heuristics.mjs
  // and contains no `createHash(` occurrence
});

// tests/skills/validate-success-heuristic.test.mjs — new cases
test("the validate harness derives ids from a repo-relative path", () => { /* … */ });
test("the validate harness holds no private createHash call", () => { /* … */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/recover-extract-heuristic.test.mjs tests/skills/validate-success-heuristic.test.mjs`
Expected: FAIL — the source-inspection assertions find `createHash(` in both harnesses

- [ ] **Implement**

Replace both private copies with imports from `lib/heuristics.mjs`. The recover harness keeps its `CATEGORY_ID_SLUGS` lookup and its `deriveId(category, normalizedText)` signature — only the hashing moves. The validate harness's `deriveId` signature changes from `(specSlug, absPath, pattern)` to `(specSlug, repoRelativePath, pattern)`; update its call sites in `tests/skills/validate-success-heuristic.test.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/skills/recover-extract-heuristic.test.mjs tests/skills/validate-success-heuristic.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage both harnesses and both test files, then commit with message:

```
refactor(tests): converge heuristic harnesses on the shared digest function

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 6
```

---

### Task 7: `adev heuristics migrate-keys` — classification and mapping [specialist: none]

**Depends on:** Task 1, Task 2
**Charter capability:** Location-Independent `id`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs` — new `migrate-keys` subcommand, plus an exported pure classifier (`classifyForRekey(entry)`) so the decision logic is testable without touching the filesystem
- Test: `tests/cli/heuristics-migrate-keys.test.mjs`

**Tests:** create `tests/cli/heuristics-migrate-keys.test.mjs` — covers Behavior 8.

**Context to load:**
- Spec Behavior 8 in full
- `skills/recover/SKILL.md:130-185` — **the authoritative six-value category set.** Do **not** take it from `_format.md`, which is stale until Task 9 lands and lists three wrong slugs (`spec-violation`, `context-gap`)
- The live store under `.context-index/memory/heuristics/` for real fixture ids

**Classification rules (all four, in order):**

1. **Prefix test.** If the entry's `id` prefix is one of the closed six diagnosis categories — `missing-context`, `ambiguous-spec`, `constraint-conflict`, `novel-problem`, `tool-failure`, `budget-exhaustion` — it was composed by the recover rule. **Never rekey it**, whatever evidence the entry has accumulated. Evidence provenance is explicitly the *wrong* discriminator: `/adev:retro` consolidation can merge entries so one entry may carry both `validation` and `recovery` evidence, and a provenance test would destroy a recover id.
2. **Ambiguity guard — a refinement of rule 1's *reason code*, not a later branch.** Both rules skip; the guard only changes what the summary reports. If the prefix matches a category slug **and** the entry carries `validation`-sourced evidence, the two rules are indistinguishable, so report the skip as `ambiguous` rather than `out-of-scope`. Do not implement rule 1 as an early `return` that short-circuits this check — acceptance criteria 15 and 16 require the two labels to be distinguishable, and the Task 7 tests assert both. Skipping a rekey is recoverable; destroying a recover id is not.
3. **Evidence path → spec path mapping.** The `id` hash input needs the spec path; the evidence element holds the validate *report* path. They are siblings: replace a trailing `.validate.md` with `.spec.md` on the same stem. If an in-scope entry has no evidence path ending in `.validate.md`, the mapping is undefined — leave it untouched, count it as `skipped-unrecoverable`.
4. **Alias folding is read-time only.** `evidence[].source` has drifted to four spellings in the live store (24 `validation`, 4 `learn`, 2 `validate`, 2 `recover`). Fold `validate` → `validation`, `recover` → `recovery`, `learn` → `manual` **when reading an entry to classify it**, and report any spelling not recognised. **Never write a folded value back** — doing so would break the "left untouched" guarantee for skipped entries and make Behavior 10's byte-identical second run impossible. Repairing the stored vocabulary is a separate concern.

**Proof by recomputing the legacy `id` is not available and is not required.** The pre-migration rule hashed the *absolute* spec path, which is not recoverable from a stored entry. The prefix test alone is sufficient.

- [ ] **Write failing test**

```javascript
test("a recover-prefixed id is classified out of scope", () => {
  // e.g. id "tool-failure-a1b2c3d4" → { action: "skip", reason: "out-of-scope" }
});
test("an entry with BOTH validation and recovery evidence is still out of scope when its prefix is a category", () => {
  // the /adev:retro consolidation case
});
test("a category-prefixed entry carrying validation evidence is reported ambiguous, not rekeyed", () => { /* … */ });
test("the .validate.md → .spec.md sibling mapping resolves a real store path", () => {
  // ".context-index/specs/features/validation/validate-config-single-source.validate.md"
  // → ".context-index/specs/features/validation/validate-config-single-source.spec.md"
});
test("an in-scope entry with no .validate.md evidence path is skipped-unrecoverable", () => { /* … */ });
test("source: validate is classified identically to source: validation", () => { /* alias folding */ });
test("an unrecognized source spelling is reported, not silently skipped", () => { /* … */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics-migrate-keys.test.mjs`
Expected: FAIL — `classifyForRekey` is not exported from `lib/cli/heuristics.mjs`

- [ ] **Implement**

Export a pure `classifyForRekey(entry)` returning `{ action: "rekey"|"skip", reason, specPath? }` plus the alias-folding reader. Wire the `migrate-keys` subcommand skeleton to walk every `<scope>.md` under `.context-index/memory/heuristics/` (excluding `_format.md` and `archive/`) and run the classifier. Reading a store file that fails → `MIGRATION_READ_FAILED` naming the file, no file written, exit 1.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics-migrate-keys.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/cli/heuristics.mjs` and `tests/cli/heuristics-migrate-keys.test.mjs`, then commit with message:

```
feat(cli): add migrate-keys classification for the heuristic store rekey

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 7
```

---

### Task 8: `migrate-keys` — rekey, collision merge, idempotency, reporting [specialist: none]

**Depends on:** Task 7
**Charter capability:** Location-Independent `id`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs` — the `migrate-keys` write path
- Modify: `tests/cli/heuristics-migrate-keys.test.mjs`
- Test: `tests/cli/heuristics-migrate-keys.test.mjs`

**Tests:** extend `tests/cli/heuristics-migrate-keys.test.mjs` — Behaviors 9 and 10 share the migration suite created in Task 7.

**Context to load:**
- Spec Behaviors 9 and 10, Postconditions, and the Error Cases rows for the migration
- Charter invariants: "A Heuristic with two or more `contradicted-by` entries cannot remain at `high` confidence"; "two contradictions archive the entry regardless of prior confidence"
- `lib/heuristics.mjs` — `mergeEvidence`, `autoPromote`, `archiveHeuristic`, and the temp-then-rename atomic write

**Recomputation inputs (⚠ read the carry-forward note):** the new key is `deriveHeuristicId(<spec-slug from the mapped spec path>, <repo-relative mapped spec path>, <the entry's stored `pattern`>)`. This produces a **deterministic, location-independent id from the entry's stored pattern**.

> **Task note — do not assert this.** Spec Behavior 8 states that a migrated entry "lands on the id a fresh extraction would produce." That claim is false whenever the stored `pattern` has drifted from the pattern text today's extractor would generate; the two would then differ. The contract this task must satisfy is determinism and location-independence, **not** equality with a fresh-extraction id. No test in this task may assert `migratedId === freshExtractionId`. (Adjudicated review finding `structural-architect:mutable-hash-input:a15235f5`, BLOCKER → WARNING, operator-accepted, unresolved in the spec text.)

**Preserved on rekey:** `evidence[]`, `confidence`, `contradicted-by[]`, `created`, `tags`, `pattern`, `anti-pattern`, `title`, `signature` — all unchanged. Only the key changes.

**Collision merge (Behavior 9):** when the recomputed `id` already exists in the same scope file — union `evidence[]`, union `contradicted-by[]`, keep the higher confidence, **then re-apply the charter's contradiction invariant to the merged result.** A union reaching two contradictions cannot remain at `high`, and at two contradictions the merged entry is archived. Taking the higher confidence without re-checking mints an entry the invariant forbids. Report the merge — a collision *is* the duplicate-entry bug this spec exists to fix.

**Reporting:** counts of `rekeyed`, `skipped-out-of-scope`, `skipped-unrecoverable`, and `merged`, plus the ambiguous entries and unrecognised `source` spellings from Task 7.

- [ ] **Write failing test**

```javascript
test("a fixture with a legacy validate entry and a recover entry migrates the first, leaves the second byte-identical", () => { /* … */ });
test("evidence, confidence, contradicted-by, created, tags, pattern, anti-pattern, title and signature survive the rekey", () => {
  // field-by-field diff against a pre-migration snapshot
});
test("both legacy slug conventions converge on the canonical stripped form", () => {
  // real store ids: "deploy-core-spec-91c5a876" (retains .spec stem) and
  // "prototype-core-277ce212" (already stripped)
});
test("a skipped entry is byte-identical afterward, including its original source spelling", () => { /* … */ });
test("an induced collision merges rather than overwrites, and the merge is reported", () => { /* … */ });
test("a merge whose contradicted-by union reaches two entries does not remain at high confidence", () => {
  // charter invariant re-applied after the merge; at two contradictions the entry is archived
});
test("a second run is a no-op: zero rekeyed, store byte-identical", () => { /* Behavior 10 */ });
test("an unreadable store file exits 1 with MIGRATION_READ_FAILED and writes nothing", () => { /* … */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics-migrate-keys.test.mjs`
Expected: FAIL — the migration classifies but writes nothing, so no id changes

- [ ] **Implement**

Recompute ids for `rekey`-classified entries, detect same-scope collisions, merge per Behavior 9 with the invariant re-applied, and write each scope file atomically (temp-then-rename, per the Error Cases row: an interrupted migration leaves the store in its prior state). Emit the summary counts on stdout.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics-migrate-keys.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/cli/heuristics.mjs` and `tests/cli/heuristics-migrate-keys.test.mjs`, then commit with message:

```
feat(cli): rekey the heuristic store to location-independent ids

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 8
```

---

### Task 9: Revise `_format.md` to the shipped contract [specialist: none]

**Depends on:** Task 2, Task 4, Task 5
**Charter capability:** Signature Schema Field
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/memory/heuristics/_format.md` — add a `Signature Field` section; correct the `ID Namespace Convention` section (`:203-233`)
- Modify: `tests/lib/heuristics-format-doc.test.mjs`
- Test: `tests/lib/heuristics-format-doc.test.mjs`

**Tests:** extend `tests/lib/heuristics-format-doc.test.mjs` — the doc contract already has a suite.

**Context to load:**
- `.context-index/memory/heuristics/_format.md` in full — charter row 152 makes it the **public schema contract**
- `skills/recover/SKILL.md:130-185` — the correct six category slugs
- `tests/lib/heuristics-format-doc.test.mjs` — existing assertion style

**Four edits, all required:**

1. **Add the `signature` field** alongside the existing `Tags Field` section: optional, `/^[a-z0-9][a-z0-9-]*$/`, ≤ 64 chars, absent on pre-Phase-3 and success-derived entries, never rewritten once assigned, not unique within a scope, does not participate in `id` uniqueness.
2. **Document the two signature modes** — derived (`recover`/`validate`/`implement`, hashes normalized failure text) and inherited (`review-specs` only, reuses the `blocker_id` hash component, hashes nothing).
3. **Correct the `ID Namespace Convention` section** so it matches Behavior 7: the validate-side hash input is `<repo-relative-spec-path>|<pattern>` under `normalizeIdInput` (no punctuation stripping), the slug has its `.spec` stem stripped, and the result is location-independent. The section as written is made wrong by Task 5 landing.
4. **Replace the stale recover category slugs at `:211-217`.** The file currently documents `spec-violation`, `context-gap`, `tool-failure` with the example `spec-violation-a1b2c3`; only `tool-failure` is real. The correct six are `missing-context`, `ambiguous-spec`, `constraint-conflict`, `novel-problem`, `tool-failure`, `budget-exhaustion`. This is not cosmetic: Behavior 8's entire discriminator is that prefix set, so an implementer building the migration from this file would get three wrong slugs and rekey recover entries the migration must never touch.

- [ ] **Write failing test**

```javascript
test("_format.md documents the signature field with its constraints", () => { /* … */ });
test("_format.md documents both signature modes, derived and inherited", () => { /* … */ });
test("_format.md's ID Namespace Convention describes a repo-relative hash input", () => {
  // and asserts the doc no longer claims an absolute path
});
test("_format.md's recover category slugs are exactly the six in skills/recover/SKILL.md", () => {
  // parse both files; assert set equality
});
test("_format.md contains no spec-violation or context-gap slug", () => { /* … */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/heuristics-format-doc.test.mjs`
Expected: FAIL — `spec-violation` and `context-gap` are still present; no `signature` section exists

- [ ] **Implement**

Make the four edits above. Keep the existing document structure and heading style — this file is parsed by tests and read by humans.

- [ ] **Verify test passes**

Run: `node --test tests/lib/heuristics-format-doc.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `.context-index/memory/heuristics/_format.md` and `tests/lib/heuristics-format-doc.test.mjs`, then commit with message:

```
docs(heuristics): document signature and correct the ID namespace convention

Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
Plan-task: 9
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gate definitions come from `.context-index/governance/gates.yaml` (the legacy top-level `gates:` block in `manifest.yaml` is no longer read):

- `test` — `npm test` (deterministic, blocking)
- `integration-test` — `npm run test:evals` (deterministic)
- `lint`, `typecheck`, `e2e-smoke` — commented out in `gates.yaml`; skipped, no command defined
- All acceptance criteria from `failure-signature-key.spec.md` satisfied
- No constitutional violations

**Risk-driven depth:** the spec is `risk_level: high`, so `risk-policies.yaml` sets `test_depth: thorough` and `validate_mode: full`. Tasks 5, 7, and 8 carry the highest blast radius (the live hook and a one-time store mutation) and should get the deepest test coverage — in particular the cross-worktree id equality test (Task 5), the recover byte-identity fixture (Task 6), and the second-run byte-identical assertion (Task 8).

**Post-plan sequence:** `/adev:route --plan .context-index/specs/features/heuristics/failure-signature-key.plan.md`, then `/adev:implement --plan <same>`.

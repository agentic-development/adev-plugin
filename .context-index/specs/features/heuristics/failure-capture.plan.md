# Implementation Plan: Failure Capture — learn from what went wrong, not only from what went right

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md (revision 6, Phase 3)
> **Spec:** .context-index/specs/features/heuristics/failure-capture.spec.md (revision 3)
> **Review:** PASS_WITH_NOTES (2026-08-15) — 0 blockers, 7 warnings, 2 suggestions
> **Risk level:** high → `risk-policies.yaml` sets `test_depth: thorough`; `test_policy.granularity: per-behavior`, `escalation: true`
> **Platform:** Node.js, JavaScript (ESM `.mjs`), npm, `node:test`, zero external dependencies

**Goal:** Make the validate Stop hook capture heuristics on FAIL as well as PASS, migrate `/adev:recover` Step 7 onto the shared signature primitive, and retire the unreachable `adev heuristics extract` path together with the references and tests that would otherwise dangle.

**Architecture:** The live capture path stays exactly where it is — the non-blocking Stop hook `hooks/post-validate-extract-heuristics.mjs` — and the change is a branch on `verdict.overall` at the early return (line 73), not a new surface. The FAIL branch reads identifiers only (`checks[].id`, `checks[].outcome`), composes its `id` with the same `deriveHeuristicId(specSlug, repoRelSpecPath, pattern)` call the PASS branch uses, and obtains its `signature` by importing `deriveSignature` from `lib/heuristics.mjs` — the module the hook already imports at `:107`. On the skill side, `skills/recover/SKILL.md` loses its prose ID Derivation Rule and names `adev heuristics signature` twice: once for the `recover-<digest>` signature and once with the new `--digest-only` flag for the digest half of its `<category-slug>-<digest>` id. Retirement of `adev heuristics extract` removes the last live absolute-path copy of the id rule (`lib/cli/heuristics.mjs::deriveId`), which is what makes the spec's "no second copy of the derivation rules" postcondition true.

---

## Planning Decisions (review warnings resolved here)

The review left seven warnings as planning-stage decisions. Each is resolved below and carried into the tasks; nothing is deferred to implementation.

**D1 — SA-2: the hook imports `deriveSignature`; it does not shell out.**
Task 4 imports `deriveSignature` from `lib/heuristics.mjs` alongside the `writeHeuristic` / `deriveHeuristicId` / `canonicalSpecSlug` import that already exists at `hooks/post-validate-extract-heuristics.mjs:107`. Justification: (a) the constitution's "skills name a CLI subcommand" anti-pattern binds `skills/*/SKILL.md`, not hook code — the hook is executable JavaScript and already imports the lib; (b) `deriveSignature` in `lib/heuristics.mjs` *is* the single implementation — the `adev heuristics signature` verb is a thin wrapper over it (`lib/cli/heuristics.mjs:660`), so importing it satisfies the "single implementation" contract exactly as calling the verb would; (c) spawning a subprocess inside a Stop hook adds process-start latency and a second failure mode on a path whose whole contract is "never block the lifecycle". Consequence for the spec's error table: the row "`adev heuristics signature` unavailable or errors" is realized as "signature derivation throws → entry written without a `signature`, warning logged, exit 0" (Task 4 test). The verb-unavailable variant is unreachable on the hook path, because a failed `lib/heuristics.mjs` import already returns at `:110-113` before anything is written.

**D2 — SA-4: full `--digest-only` contract (Task 1).**
- `--origin` stays **required** and is still validated first against the closed enum (`recover|validate|review-specs|implement`). The digest does not depend on the origin, but keeping the flag required preserves one argument shape for the verb and keeps the existing "origin errors are reported first" ordering. `/adev:recover` passes `--origin recover`.
- `--text` is still required and still subject to the post-normalization non-empty check (`EMPTY_SIGNATURE_TEXT`).
- **Stdout on success:** exactly the 8-character lowercase hex digest plus a trailing newline — `/^[0-9a-f]{8}\n$/`. No prefix, no origin, no other text. Stderr empty. **Exit 0.**
- **`--digest-only` with `--blocker-id`:** `CONFLICTING_SIGNATURE_INPUT` on stderr, empty stdout, **exit 1** — the blocker-id digest is inherited, not derived, so there is nothing for `--digest-only` to emit that the caller did not already supply.
- **`--digest-only` with `--origin review-specs`:** the *same* `CONFLICTING_SIGNATURE_INPUT` code, with its own detail string (`origin 'review-specs' inherits its digest from --blocker-id and cannot be used with --digest-only`), exit 1. One code, two details — a distinct code would imply a distinct remedy, and the remedy is identical: use a derived origin.
- Ordering: origin validity → `--digest-only` conflicts → `--text` presence/normalization. This keeps the existing precedence (origin errors first) and reports the conflict before the text check, so `--digest-only --blocker-id x` reports the conflict rather than a missing `--text`.

**D3 — SA-3: `lib/cli/heuristics.mjs::deriveId` is an explicit removal target.**
Task 7 names it. Deleting only the subcommand dispatch would leave a dead public export carrying the absolute-path id rule, falsifying the spec's postcondition. Task 7 asserts the module exports no id-derivation function (`deriveId`, and `specSlug` which exists only to feed it).

**D4 — SA-5: FAIL-path `evidence[].source` is pinned to `"validation"`.**
Task 4 writes `{ source: 'validation', path: reportPath, date: today }` — byte-identical in `source` to the PASS path at `hooks/post-validate-extract-heuristics.mjs:148`. This spec adds no sixth spelling to the live store's existing four, and the migration discriminator in `failure-signature-key.spec.md` keeps working. Correcting the charter's `EvidenceRef` enum is explicitly **out of scope** (owned by the charter's own revision).

**D5 — SA-1 / CON-2: the hook's early return is at line 73, not 72.**
Line 72 is the preceding comment; the guard `if (verdict.overall !== 'PASS') return;` is at line 73. Task 4 targets line 73. `autoPromote`'s distinct-path count is at `lib/heuristics.mjs:894` inside the function declared at `:893` — either pointer identifies it.

**D6 — SA-7 / CON-1: `inline-node-extraction-sweep.spec.md` line 89 is the by-name reference.**
Line 77 names `lib/cli/heuristics.mjs` and says only "paired test"; line 89 names `tests/cli/heuristics.test.mjs` literally and asserts that `adev heuristics extract` *works* — a criterion this spec permanently falsifies. Task 8 marks that criterion superseded-by `failure-capture.spec.md` in the sweep spec's prose. That spec has no `source-manifest` frontmatter, no Source Manifest section, and no `.validate.md` sibling, so there is no manifest to restamp and no validation report to reconcile.

**D7 — SA-6: the "no non-PASS check" terminal condition is a first-class error row.**
Task 4 implements and tests it: with no `checks[]` entry whose `outcome` is a string other than `PASS`, the hook writes nothing and exits 0 rather than widening its read set to find something to say.

## Design Decisions Not Raised by Review

**D8 — the FAIL `signature` hashes the failed check ids alone, not the spec.**
`signature` is the *cross-scope* recurrence key (spec, "Two keys, and which one deduplicates"), so its input must not carry the spec identity — otherwise the same failing checks in two specs would never match and the downstream batch breaker could not count recurrence. The FAIL path derives `deriveSignature('validate', <deduped, sorted, space-joined failed check ids>)`. The `id`, by contrast, stays spec-scoped (`<spec-slug>-<digest over repo-relative-spec-path|pattern>`), which is what makes recurrence on one spec update one entry.

**D9 — the outcome-derived prefix leaves PASS output byte-identical.**
`prefixFor('PASS')` returns `"First-run PASS: "` and `prefixFor('FAIL')` returns `"Validate FAIL: "`. The prefix becomes a function of `verdict.overall` rather than a literal, which is what Behavior 3 asks for, while every existing PASS assertion keeps passing. Per the spec's acceptance criterion, **exactly two copies** of the prefix derivation exist after this spec — the hook's and the test harness's — and a test pins them to agree. A shared `lib/` export is deliberately **not** introduced: it would violate the "exactly two copies" criterion and the harness exists precisely to mirror the hook independently.

**D10 — `adev heuristics write` gains `--signature` (Task 2). Spec-implied, not spec-named.**
Behavior 5 has `/adev:recover` obtain a `recover-<digest>` signature from the verb, but the write verb it uses at `skills/recover/SKILL.md:443` has no `--signature` flag (`lib/cli/heuristics.mjs:1215-1231`), so the obtained signature has nowhere to land and Behavior 5 would be a no-op. This is the same class of integration gap the spec itself closed with Behavior 5a, and it is resolved the same way: one additive, optional flag on an existing verb, forwarded to `writeHeuristic`, which already accepts and reconciles `signature` (`lib/heuristics.mjs:1005-1035`). Flagged here so `/adev:validate`'s scope-expansion sub-finding has the rationale on record.

---

## File Structure

**Create:**
- `tests/hooks/post-validate-failure-capture.test.mjs` — FAIL-path capture, outcome-derived prefix, input scoping, recurrence, error paths

**Modify:**
- `hooks/post-validate-extract-heuristics.mjs:73` — replace the `overall !== 'PASS'` early return with PASS/FAIL branching
- `hooks/post-validate-extract-heuristics.mjs:107` — add `deriveSignature` to the existing lib import
- `hooks/post-validate-extract-heuristics.mjs:124-149` — outcome-derived prefix; FAIL-path title / pattern / anti-pattern / signature / evidence
- `hooks/post-validate-extract-heuristics.mjs:7-31` — input-contract header comment: document the FAIL read set (`checks[].id`, `checks[].outcome`) and the identifiers-only rule
- `lib/cli/heuristics.mjs:518-662` — `--digest-only` on the `signature` subcommand
- `lib/cli/heuristics.mjs:1215-1300` — `--signature` on the `write` subcommand
- `lib/cli/heuristics.mjs:60-95, 128-136, 139-168, 213-260, 287-420, 1312-1330` — delete the `extract` subcommand, `--check-first-run`, `deriveId`, `specSlug`, `deriveTitle`, `defaultPattern`, `parseExtractArgs`, and their help text
- `tests/skills/validate-success-heuristic-harness.mjs:104-124` — outcome-derived prefix mirroring the hook
- `tests/skills/validate-success-heuristic.test.mjs` — prefix-agreement assertions
- `tests/cli/heuristics-signature.test.mjs` — `--digest-only` behavior and conflicts
- `tests/cli/heuristics.test.mjs` — retire the 27 `extract` references; keep `retrieve` / `write` / dispatch coverage; add removal + no-dangling-reference assertions
- `tests/skills/recover-extract-heuristic.test.mjs` — recover id byte-identity against a pre-change fixture
- `skills/recover/SKILL.md:387-397, 440-463` — remove the ID Derivation Rule; name the verb for both values
- `docs/cli-reference.md:525` — drop `heuristics extract` from the signature line
- `lib/diagnostics/tier2/validated-without-report.mjs:30-36` — remove the `lib/cli/heuristics.mjs:323` consumer citation
- `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md:89` — mark the criterion superseded-by this spec

**Delete:**
- `skills/validate/checks/validate.check-12-heuristic-extraction.md` — orphaned check file for an id in `REMOVED_CHECK_IDS`

**Reference (read, do not modify):**
- `lib/heuristics.mjs:185-262` — `deriveDigest`, `deriveSignature`, `deriveHeuristicId`, `canonicalSpecSlug`: the shared primitives
- `lib/heuristics.mjs:868-1090` — `mergeEvidence`, `autoPromote`, `writeHeuristic`: reconciliation is on `id` only
- `tests/hooks/post-validate-heuristic-id.test.mjs` — the established pattern for driving the hook with `spawnSync` + stdin JSON
- `.context-index/specs/features/heuristics/failure-signature-key.spec.md` — Behaviors 7 / 7a, the shipped dependency

## Context Packets

The spec carries no `source-manifest` frontmatter, so packets fall back to the charter Dependencies table, the sibling specs' shipped source files, and the live code the spec cites by line.

### Task 1 Context — `--digest-only`
- Spec: `failure-capture.spec.md` (Behavior 5a, `--digest-only` acceptance criterion) + this plan's **D2**
- Charter: `charter.md` (capability: Recover Migration; Exposed API row for `adev heuristics signature`)
- Source (full): `lib/cli/heuristics.mjs:505-662` — the `signature` subcommand
- Source (signatures only): `lib/heuristics.mjs` — `deriveDigest`, `deriveSignature`, `normalizeFailureText`
- Test (structure only): `tests/cli/heuristics-signature.test.mjs`
- Sibling spec: `failure-signature-key.spec.md` Behaviors 3b / 7a (flag conflicts, caller-supplied prefix)

### Task 2 Context — `--signature` on the write verb
- Spec: `failure-capture.spec.md` (Behavior 5) + this plan's **D10**
- Source (full): `lib/cli/heuristics.mjs:1215-1310` — `runWrite`
- Source (signatures only): `lib/heuristics.mjs:933-1090` — `writeHeuristic`'s existing-wins signature reconciliation; `SIGNATURE_PATTERN`
- Test (structure only): `tests/cli/heuristics.test.mjs` (`heuristics write …` blocks)

### Task 3 Context — outcome-derived title prefix (hook copy)
- Spec: `failure-capture.spec.md` (Behavior 3 and its three-copy fate table) + this plan's **D9**
- Charter: `charter.md` (capability: Validate Failure Capture)
- Source (full): `hooks/post-validate-extract-heuristics.mjs`
- Test (structure only): `tests/hooks/post-validate-heuristic-id.test.mjs` — `spawnSync` + stdin-JSON harness pattern

### Task 4 Context — FAIL-path capture
- Spec: `failure-capture.spec.md` (Behaviors 1, 1a, 2, 4, 4a, 8; Preconditions "Input scoping"; Error Cases) + this plan's **D1**, **D4**, **D7**, **D8**
- Charter: `charter.md` (capability: Validate Failure Capture; Quality Attributes → Degradation, Signature Stability)
- Source (full): `hooks/post-validate-extract-heuristics.mjs`
- Source (signatures only): `lib/heuristics.mjs` — `deriveSignature`, `deriveHeuristicId`, `canonicalSpecSlug`, `writeHeuristic`, `mergeEvidence`, `autoPromote`
- Cross-cutting: `configurable-checks.spec.md` Behavior 25a (redaction covers only `kind: quality-gate` subprocess bytes — the reason the FAIL path reads identifiers only)
- Constitution: Principle 4 (hook protocol) — Architecture Boundaries, "Autonomous" side
- Heuristics: 3 entries for module `heuristics` (see below)

### Task 5 Context — PASS-path harness prefix
- Spec: `failure-capture.spec.md` (Behavior 3, harness row of the fate table)
- Source (full): `tests/skills/validate-success-heuristic-harness.mjs`
- Test (structure only): `tests/skills/validate-success-heuristic.test.mjs`, `tests/skills/validate-extraction.test.mjs` — both import `runCheck12`
- Reference: the hook implementation produced by Task 3 (the harness mirrors it)

### Task 6 Context — recover Step 7 migration
- Spec: `failure-capture.spec.md` (Behaviors 5, 6; System Constitution Reference → fail-closed degradation)
- Charter: `charter.md` (capability: Recover Migration)
- Source (full): `skills/recover/SKILL.md:349-463` — Step 7
- Source (signatures only): `tests/skills/recover-extract-heuristic-harness.mjs` — `deriveId`, `normalizeRootCause`, `CATEGORY_ID_SLUGS`
- Constitution: "No `Run inline Node.js:` step directives — skills name a CLI subcommand"; "Skills are primarily markdown"
- Depends on the verb contracts produced by Tasks 1 and 2

### Task 7 Context — retire the dead path
- Spec: `failure-capture.spec.md` (Behavior 7, Postconditions, "Retire the dead path's tests" row) + this plan's **D3**
- Charter: `charter.md` (capability: Dead Capture-Path Retirement)
- Source (full): `lib/cli/heuristics.mjs:1-420` and `:1312-1388` (help), `tests/cli/heuristics.test.mjs`
- Reference: `skills/validate/checks/validate.check-12-heuristic-extraction.md`; `tests/governance/validate-check-set-restructure.test.mjs` (already asserts the check id is retired)

### Task 8 Context — dangling references
- Spec: `failure-capture.spec.md` (Behavior 7, "no reference remains in `docs/` or `lib/`") + this plan's **D6**
- Source (full): `lib/diagnostics/tier2/validated-without-report.mjs:22-45`, `docs/cli-reference.md:520-535`
- Reference: `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md:77, 89`

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (`message.usage` fields). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observation

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Anti-pattern:** Focus on reducing input token counts. Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume.
- **Evidence:** 1 observation

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation.
- **Anti-pattern:** Assume shorter output means lower artifact quality. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observation

## Parallelization

- **Group A (sequential):** Task 3 → Task 4 → Task 5 — the hook and the harness that mirrors it
- **Group B (sequential):** Task 1 → Task 2 → Task 6 → Task 7 → Task 8 — everything that touches `lib/cli/heuristics.mjs`, plus the skill and reference updates that depend on those verb contracts

Groups A and B share no files and can run concurrently. Within Group B the ordering is load-bearing twice: Task 6 needs the flag contracts from Tasks 1-2, and Task 8 must follow Task 7 because its no-dangling-reference scan only goes RED once the verb is gone.

One cross-group *read* exists and is deliberately made order-independent: Task 5 counts copies of the title prefix across the tree, and Task 7 deletes the third copy. Task 5 therefore asserts a provisional `<= 3` bound and Task 7 tightens the same assertion to the spec's `=== 2`. Either landing order leaves both suites green, so the groups stay concurrent.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `--digest-only` on `adev heuristics signature` | small | unit | — | 0 create, 1 modify (+1 test) |
| 2 | `--signature` on `adev heuristics write` | small | unit | Task 1 | 0 create, 1 modify (+1 test) |
| 3 | Outcome-derived title prefix in the hook | small | unit | — | 0 create, 1 modify (+1 test created) |
| 4 | FAIL-path capture in the validate Stop hook | medium | unit | Task 3 | 0 create, 1 modify (+1 test) |
| 5 | Outcome-derived prefix in the PASS-path harness | small | unit | Task 3 | 0 create, 1 modify (+1 test) |
| 6 | Migrate `/adev:recover` Step 7 onto the verb | medium | unit | Task 1, Task 2 | 0 create, 1 modify (+1 test) |
| 7 | Retire the dead capture path and its tests | medium | unit | Task 2 | 0 create, 1 modify, 1 delete (+1 test) |
| 8 | Update dangling references | small | unit | Task 7 | 0 create, 3 modify (+1 test) |

All eight tasks resolve to the `unit` strategy (source: fallback — the spec declares no `test_strategy`, `manifest.yaml` declares no `test_strategies` globs, and every touched path is plain Node code or markdown). The Strategy Summary and Test Infrastructure Requirements sections are therefore omitted: no external system, credential, or pre-provisioned state is involved, and `npm test` runs the whole suite offline.

**Test granularity:** `per-behavior` (source: `manifest.yaml` `test_policy.granularity`). Tasks implementing the same spec behavior share one suite: Tasks 3 and 4 both land in `tests/hooks/post-validate-failure-capture.test.mjs` (Task 3 creates it, Task 4 extends it), and Tasks 7 and 8 both extend `tests/cli/heuristics.test.mjs`. Depth is resolved by `/adev:implement` at test-authoring time; `risk_level: high` with `escalation: true` puts it at `thorough`.

---

### Task 1: `--digest-only` on `adev heuristics signature` [specialist: none]

**Charter capability:** Recover Migration (the primitive half — Behavior 5a exists so recover can compose `<category-slug>-<digest>` from the verb)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs:518-662` — `SIGNATURE_USAGE`, `runSignature`
- Modify: `lib/cli/heuristics.mjs:1312-1388` — `help()` text for the `signature` subcommand
- Test: `tests/cli/heuristics-signature.test.mjs` (extend)

**Tests:** `tests/cli/heuristics-signature.test.mjs` — extend the existing signature-verb suite. Behavior 5a belongs to the same behavior family the suite already covers, so per-behavior granularity keeps it here rather than opening a new file.

**Context to load:** see *Task 1 Context* above. The full flag contract is fixed by plan decision **D2** — implement it as written, do not re-derive it.

- [ ] **Write failing tests**

Cover, at `thorough` depth: bare-digest stdout shape; agreement with the composed form; both conflict cases; the preserved `--text` checks.

```javascript
import { deriveDigest, normalizeFailureText } from "../../lib/heuristics.mjs";

test("--digest-only emits the bare 8-hex digest and nothing else", () => {
  const r = runCli(["heuristics", "signature", "--origin", "recover",
                    "--text", "Error: cache miss on third-party API", "--digest-only"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^[0-9a-f]{8}\n$/);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout.trim(),
    deriveDigest("Error: cache miss on third-party API", normalizeFailureText));
});

test("--digest-only output is the digest half of the composed signature", () => {
  const composed = runCli(["heuristics", "signature", "--origin", "recover", "--text", "boom"]);
  const bare = runCli(["heuristics", "signature", "--origin", "recover", "--text", "boom", "--digest-only"]);
  assert.equal(composed.stdout.trim(), `recover-${bare.stdout.trim()}`);
});

test("--digest-only with --blocker-id exits 1 with CONFLICTING_SIGNATURE_INPUT", () => {
  const r = runCli(["heuristics", "signature", "--origin", "review-specs",
                    "--blocker-id", VALID_BLOCKER_ID, "--digest-only"]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

test("--digest-only with --origin review-specs and no --blocker-id also conflicts", () => {
  const r = runCli(["heuristics", "signature", "--origin", "review-specs", "--digest-only"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /CONFLICTING_SIGNATURE_INPUT/);
});

test("--digest-only still requires --text to survive normalization", () => {
  const r = runCli(["heuristics", "signature", "--origin", "recover", "--text", "!!!", "--digest-only"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /EMPTY_SIGNATURE_TEXT/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics-signature.test.mjs`
Expected: FAIL — `parseArgs` rejects the unknown option `--digest-only` (exit 1 with usage, not the bare digest).

- [ ] **Implement**

Add `"digest-only": { type: "boolean", default: false }` to `runSignature`'s options. Keep the origin check first. Insert the conflict checks after origin validation and before the `review-specs` inherited branch, then emit `deriveDigest(v.text, normalizeFailureText)` instead of `deriveSignature(origin, v.text)` when the flag is set. Update `SIGNATURE_USAGE` and `help()`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics-signature.test.mjs` then `npm test`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/heuristics/failure-capture`

```bash
git add lib/cli/heuristics.mjs tests/cli/heuristics-signature.test.mjs
git commit -m "feat(heuristics): add --digest-only to adev heuristics signature

Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
Plan-task: 1"
```

---

### Task 2: `--signature` on `adev heuristics write` [specialist: none]

**Depends on:** Task 1 (same file; sequential to avoid a conflicting edit)
**Charter capability:** Recover Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs:1215-1300` — `runWrite` options and entry construction
- Modify: `lib/cli/heuristics.mjs:1312-1388` — `help()` text for the `write` subcommand
- Test: `tests/cli/heuristics.test.mjs` (extend the `heuristics write …` block)

**Tests:** `tests/cli/heuristics.test.mjs` — the write-verb behavior already lives here.

**Context to load:** see *Task 2 Context* above, plus plan decision **D10** for the scope rationale.

- [ ] **Write failing tests**

```javascript
test("heuristics write --signature persists the signature field", async () => {
  const r = runCli(["heuristics", "write", "--id", "missing-context-a1b2c3d4",
    "--scope", "_global", "--title", "T", "--pattern", "P",
    "--signature", "recover-a1b2c3d4"], { cwd: root });
  assert.equal(r.status, 0);
  const stored = await readHeuristics(root, { module: "_global" });
  assert.equal(stored[0].signature, "recover-a1b2c3d4");
});

test("heuristics write without --signature writes no signature field", async () => {
  runCli(["heuristics", "write", "--id", "tool-failure-0badc0de",
    "--scope", "_global", "--title", "T", "--pattern", "P"], { cwd: root });
  const raw = readFileSync(join(root, ".context-index/memory/heuristics/_global.md"), "utf8");
  assert.ok(!/^signature:/m.test(raw), "the key is omitted, not written empty");
});

test("heuristics write with a malformed --signature degrades to stderr + exit 0", () => {
  const r = runCli(["heuristics", "write", "--id", "tool-failure-0badc0de",
    "--scope", "_global", "--title", "T", "--pattern", "P",
    "--signature", "Bad Value"], { cwd: root });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /extraction skipped/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics.test.mjs`
Expected: FAIL — unknown option `--signature`, exit 1.

- [ ] **Implement**

Add `signature: { type: "string" }` to `runWrite`'s options and set `entry.signature` only when the flag is present (leave the key absent otherwise, so `serializeHeuristic`'s omit-on-empty rule holds). Validation stays where it belongs: `validateEntry` already rejects a malformed signature and `runWrite`'s existing catch degrades to `heuristics: extraction skipped — <error>` with exit 0.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics.test.mjs` then `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/heuristics.mjs tests/cli/heuristics.test.mjs
git commit -m "feat(heuristics): accept --signature on adev heuristics write

Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
Plan-task: 2"
```

---

### Task 3: Outcome-derived title prefix in the hook [specialist: none]

**Charter capability:** Validate Failure Capture
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/hooks/post-validate-failure-capture.test.mjs`
- Modify: `hooks/post-validate-extract-heuristics.mjs:124-127` — replace the hardcoded prefix with `prefixFor(verdict.overall)`
- Test: `tests/hooks/post-validate-failure-capture.test.mjs`

**Tests:** `tests/hooks/post-validate-failure-capture.test.mjs` — create. Behaviors 1, 1a, 2, 3, 4 and the FAIL error rows all belong to the FAIL-capture behavior family and share this suite; Task 4 extends it.

**Context to load:** see *Task 3 Context* above, plus plan decision **D9**.

- [ ] **Write failing test**

```javascript
// Drive the hook exactly as tests/hooks/post-validate-heuristic-id.test.mjs does:
// spawnSync(node, [HOOK]) with the verdict payload on stdin.
test("the PASS title prefix is derived from verdict.overall, not hardcoded", () => {
  runHookWith({ projectRoot, overall: "PASS" });
  assert.match(storedTitles(projectRoot)[0], /^First-run PASS: /);
});

test("the prefix derivation is a function of the outcome", async () => {
  const src = readFileSync(HOOK, "utf8");
  assert.ok(!/`First-run PASS: \$\{/.test(src),
    "the prefix must not be interpolated inline at the title site");
  assert.match(src, /function prefixFor\s*\(/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/hooks/post-validate-failure-capture.test.mjs`
Expected: FAIL — no `prefixFor` in the hook; the title is composed from a string literal.

- [ ] **Implement**

```javascript
/**
 * Title prefix derived from the validate outcome. Behavior 3: PASS output is
 * byte-identical to the previous hardcoded form; FAIL is distinguishable.
 * Mirrored — deliberately, not shared — by
 * tests/skills/validate-success-heuristic-harness.mjs.
 */
function prefixFor(outcome) {
  return outcome === 'FAIL' ? 'Validate FAIL: ' : 'First-run PASS: ';
}
```

and compose `const title = cap(`${prefixFor(verdict.overall)}${specTitle}`, 120);`.

- [ ] **Verify test passes**

Run: `node --test tests/hooks/ tests/skills/` then `npm test`
Expected: PASS — every existing PASS assertion still holds, because the PASS prefix is unchanged.

- [ ] **Commit**

```bash
git add hooks/post-validate-extract-heuristics.mjs tests/hooks/post-validate-failure-capture.test.mjs
git commit -m "refactor(hooks): derive the heuristic title prefix from the validate outcome

Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
Plan-task: 3"
```

---

### Task 4: FAIL-path capture in the validate Stop hook [specialist: none]

**Depends on:** Task 3
**Charter capability:** Validate Failure Capture
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `hooks/post-validate-extract-heuristics.mjs:73` — PASS/FAIL branching replaces the early return
- Modify: `hooks/post-validate-extract-heuristics.mjs:107` — add `deriveSignature` to the lib import
- Modify: `hooks/post-validate-extract-heuristics.mjs:115-160` — FAIL title / pattern / anti-pattern / signature / evidence
- Modify: `hooks/post-validate-extract-heuristics.mjs:7-31` — document the FAIL read set in the input-contract header
- Test: `tests/hooks/post-validate-failure-capture.test.mjs` (extend)

**Tests:** `tests/hooks/post-validate-failure-capture.test.mjs` — extend the suite created in Task 3.

**Context to load:** see *Task 4 Context*. Plan decisions **D1** (import, do not spawn), **D4** (`evidence[].source: "validation"`), **D7** (no non-PASS check → write nothing), **D8** (signature hashes check ids only) are binding.

**Do not write** any test asserting automatic promotion on this path. Behavior 4a: `autoPromote` counts distinct evidence paths and the hook's `report_path` is a deterministic function of the spec path, so the distinct-path count can never exceed 1. Such a test would be unsatisfiable.

- [ ] **Write failing tests**

At `thorough` depth, covering Behaviors 1, 1a, 2, 4, 8 and the error rows:

```javascript
test("a FAIL verdict writes an entry with signature, id, pattern and anti-pattern", () => {
  const r = runHookWith({ projectRoot, overall: "FAIL", checks: FAILING });
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");                       // stdout is the protocol channel
  const [entry] = parseStore(projectRoot);
  assert.match(entry.id, /^[a-z0-9-]+-[0-9a-f]{8}$/);
  assert.match(entry.signature, /^validate-[0-9a-f]{8}$/);
  assert.equal(entry.confidence, "low");
  assert.equal(entry.evidence[0].source, "validation");
  assert.ok(entry.pattern && entry.antiPattern);
});

test("PASS and FAIL entries are distinguishable by title", () => {
  runHookWith({ projectRoot, specPath: SPEC_A, overall: "PASS" });
  runHookWith({ projectRoot, specPath: SPEC_B, overall: "FAIL", checks: FAILING });
  const titles = parseStore(projectRoot).map((e) => e.title);
  assert.equal(titles.filter((t) => t.startsWith("First-run PASS: ")).length, 1);
  assert.equal(titles.filter((t) => t.startsWith("Validate FAIL: ")).length, 1);
});

test("the same failure twice on one spec updates one entry rather than creating two", () => {
  runHookWith({ projectRoot, overall: "FAIL", checks: FAILING });
  runHookWith({ projectRoot, overall: "FAIL", checks: FAILING });
  assert.equal(storedIds(projectRoot).length, 1);          // one entry
  assert.equal(storedEvidence(projectRoot)[0].length, 1);  // (path,date) dedup, not two refs
});

test("a matching signature under a different id creates a separate entry", () => {
  // signature is NOT a dedup key — writeHeuristic reconciles on id alone.
  runHookWith({ projectRoot, specPath: SPEC_A, overall: "FAIL", checks: FAILING });
  runHookWith({ projectRoot, specPath: SPEC_B, overall: "FAIL", checks: FAILING });
  const ids = storedIds(projectRoot);
  assert.equal(ids.length, 2);
  assert.equal(new Set(storedSignatures(projectRoot)).size, 1);
});

test("only checks[].id and checks[].outcome are read — no prose, no subprocess channel", () => {
  const SECRET = "NOT-A-REAL-CREDENTIAL-canary-0001"; // synthetic canary, never a real token
  runHookWith({
    projectRoot, overall: "FAIL",
    checks: [{ id: "validate.check-3-spec-compliance", outcome: "FAIL",
               detail: `leaked ${SECRET}`, message: SECRET }],
    toolResultExtra: { stdout: SECRET, stderr: SECRET },
  });
  const raw = readFileSync(storePath(projectRoot), "utf8");
  assert.ok(!raw.includes(SECRET), "no field outside id/outcome may reach the store");
  assert.match(raw, /validate\.check-3-spec-compliance/);
});

test("with no non-PASS checks[] entry the hook writes nothing and exits 0", () => {
  const r = runHookWith({ projectRoot, overall: "FAIL", checks: [{ id: "x", outcome: "PASS" }] });
  assert.equal(r.exitCode, 0);
  assert.equal(existsSync(storePath(projectRoot)), false);
});

test("a throwing signature derivation still writes the entry, without a signature", () => {
  // Force the throw by pointing CLAUDE_PLUGIN_ROOT at a lib whose deriveSignature
  // throws (a temp shim that re-exports the real module and overrides one name).
  runHookWith({ projectRoot, overall: "FAIL", checks: FAILING, env: { CLAUDE_PLUGIN_ROOT: SHIM_ROOT } });
  const [entry] = parseStore(projectRoot);
  assert.equal(entry.signature, undefined);
  assert.ok(entry.id, "the entry is still keyed and still written");
});

test("an unwritable store file logs a warning, exits 0, and prints nothing on stdout", () => {
  chmodSync(join(projectRoot, ".context-index/memory/heuristics"), 0o500);
  const r = runHookWith({ projectRoot, overall: "FAIL", checks: FAILING });
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /non-blocking/);
});

test("an outcome that is neither PASS nor FAIL writes nothing and exits 0", () => {
  const r = runHookWith({ projectRoot, overall: "BLOCK", checks: FAILING });
  assert.equal(r.exitCode, 0);
  assert.equal(existsSync(storePath(projectRoot)), false);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/hooks/post-validate-failure-capture.test.mjs`
Expected: FAIL — the hook returns at line 73 on any non-PASS verdict, so no store file is created.

- [ ] **Implement**

Replace the early return with an outcome branch and add the FAIL builder. Shape:

```javascript
const outcome = verdict.overall;
if (outcome !== 'PASS' && outcome !== 'FAIL') return;
// … existing root/containment/plugin-root/import guards, unchanged …
// import now also pulls deriveSignature (D1)

// FAIL branch — identifiers only (Behavior 1a).
const failed = Array.isArray(verdict.checks)
  ? verdict.checks
      .filter((c) => c && typeof c.id === 'string' && c.id
        && typeof c.outcome === 'string' && c.outcome !== 'PASS')
      .map((c) => c.id.replace(/[^A-Za-z0-9._-]/g, ''))   // closed charset, defence in depth
      .filter(Boolean)
  : [];
if (failed.length === 0) return;                          // D7 — never widen the read set
const checkList = [...new Set(failed)].sort().slice(0, 5).join(', ');
```

with `pattern` = `Validate FAIL for <specTitle>: satisfy the checks that failed before treating the spec as done — <checkList>.`, `antiPattern` = `Don't mark <specTitle> complete while <checkList> still fail.`, `confidence: 'low'`, `evidence: [{ source: 'validation', path: reportPath, date: today }]` (D4), `id: deriveHeuristicId(specSlug, repoRelSpecPath, pattern)` (same composition as PASS, so recurrence updates), and `signature` from `deriveSignature('validate', [...new Set(failed)].sort().join(' '))` inside a try/catch that omits the field and warns on throw (D1, D8). The write, the success warning and the catch are shared with the PASS branch — one `writeHeuristic` call site, two entry builders.

- [ ] **Verify test passes**

Run: `node --test tests/hooks/post-validate-failure-capture.test.mjs` then `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add hooks/post-validate-extract-heuristics.mjs tests/hooks/post-validate-failure-capture.test.mjs
git commit -m "feat(hooks): capture heuristics on validate FAIL, identifiers only

Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
Plan-task: 4"
```

---

### Task 5: Outcome-derived prefix in the PASS-path harness [specialist: none]

**Depends on:** Task 3 (the harness mirrors the hook's derivation)
**Charter capability:** Validate Failure Capture (Behavior 3, harness row of the fate table)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/skills/validate-success-heuristic-harness.mjs:104-124` — `deriveTitle` takes the outcome and derives the prefix
- Modify: `tests/skills/validate-success-heuristic.test.mjs` — prefix-agreement assertions
- Test: `tests/skills/validate-success-heuristic.test.mjs`

**Tests:** `tests/skills/validate-success-heuristic.test.mjs` — the suite that actually exercises `runCheck12`. This is the point of the task: the PASS-path suites (`validate-success-heuristic.test.mjs`, `validate-extraction.test.mjs`) import `runCheck12` from the harness and never invoke the hook, so without this change the outcome-derived-prefix criterion would be verified by nothing.

**Context to load:** see *Task 5 Context* above.

- [ ] **Write failing test**

```javascript
test("the harness derives its prefix from the outcome, like the hook", () => {
  assert.equal(deriveTitle("PASS", "Foo"), "First-run PASS: Foo");
  assert.equal(deriveTitle("FAIL", "Foo"), "Validate FAIL: Foo");
});

test("the hook and the harness both own the prefix pair, and they agree", () => {
  // The hook and the harness each own a copy by design (spec Behavior 3).
  const hookSrc = readFileSync(join(PLUGIN_ROOT, "hooks/post-validate-extract-heuristics.mjs"), "utf8");
  const harnessSrc = readFileSync(HARNESS, "utf8");
  for (const src of [hookSrc, harnessSrc]) {
    assert.match(src, /First-run PASS: /);
    assert.match(src, /Validate FAIL: /);
  }
  // Provisional bound: three copies are still on disk here, because
  // lib/cli/heuristics.mjs:155 dies with the extract verb in Task 7. Task 7
  // tightens this same assertion to === 2, which is the spec's criterion.
  assert.ok(grepRepo("First-run PASS: ", ["hooks/", "lib/", "skills/", "tests/"]).length <= 3);
});
```

**Note for the implementer:** the copy-count bound above is deliberately provisional. It is `<= 3` here and becomes `=== 2` in Task 7, when the third copy is deleted. Tasks 5 and 7 sit in different parallel groups, so if Task 7 has already landed the `<= 3` bound still passes — the assertion is written to be order-independent, and only Task 7's version is the spec's acceptance criterion.

- [ ] **Verify test fails**

Run: `node --test tests/skills/validate-success-heuristic.test.mjs`
Expected: FAIL — `deriveTitle` takes only `specTitle` and hardcodes the prefix at `:112`, so both the outcome-derived assertions and the `Validate FAIL: ` match on the harness fail.

- [ ] **Implement**

Give `deriveTitle` an `outcome` first argument with the same `prefixFor` body as the hook (mirrored, not shared — see **D9**), keep the 120-char truncation semantics unchanged, and update `runCheck12`'s call site. Existing callers that pass only a spec title keep working by defaulting `outcome` to `'PASS'`.

- [ ] **Verify test passes**

Run: `node --test tests/skills/validate-success-heuristic.test.mjs tests/skills/validate-extraction.test.mjs` then `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/skills/validate-success-heuristic-harness.mjs tests/skills/validate-success-heuristic.test.mjs
git commit -m "test(heuristics): mirror the outcome-derived title prefix in the PASS harness

Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
Plan-task: 5"
```

---

### Task 6: Migrate `/adev:recover` Step 7 onto the verb [specialist: none]

**Depends on:** Task 1, Task 2
**Charter capability:** Recover Migration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/recover/SKILL.md:387-397` — delete the ID Derivation Rule; name the verb for both values
- Modify: `skills/recover/SKILL.md:440-463` — the concrete invocation gains `--signature`
- Test: `tests/skills/recover-extract-heuristic.test.mjs` (extend)

**Tests:** `tests/skills/recover-extract-heuristic.test.mjs` — extend; recover-extraction behavior already lives here.

**Context to load:** see *Task 6 Context* above.

**Byte-identity is the acceptance bar (Behavior 6).** Recover's ids must be unchanged for the same normalized root cause, so the test asserts against a pre-change fixture, not against a recomputation.

- [ ] **Write failing tests**

```javascript
test("recover ids are byte-identical to the pre-change fixture", () => {
  // Fixture captured before this change: category + root cause -> id.
  for (const { category, rootCause, id } of PRE_CHANGE_FIXTURE) {
    const digest = runCli(["heuristics", "signature", "--origin", "recover",
                           "--text", rootCause, "--digest-only"]).stdout.trim();
    assert.equal(`${CATEGORY_ID_SLUGS[category]}-${digest}`, id);
  }
});

test("recover's signature is recover-<digest> and shares the id's digest", () => {
  const sig = runCli(["heuristics", "signature", "--origin", "recover", "--text", RC]).stdout.trim();
  const digest = runCli(["heuristics", "signature", "--origin", "recover",
                         "--text", RC, "--digest-only"]).stdout.trim();
  assert.equal(sig, `recover-${digest}`);
});

test("skills/recover/SKILL.md contains no derivation-rule text and names the verb twice", () => {
  const src = readFileSync(RECOVER_SKILL, "utf8");
  assert.ok(!/ID Derivation Rule/.test(src));
  assert.ok(!/SHA-256/.test(src));
  assert.ok(!/collapse consecutive whitespace/i.test(src));
  assert.match(src, /adev heuristics signature --origin recover --text/);
  assert.match(src, /--digest-only/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/recover-extract-heuristic.test.mjs`
Expected: FAIL — the SKILL.md still carries the `#### ID Derivation Rule` heading and its SHA-256 normalization prose.

- [ ] **Implement**

Replace the `#### ID Derivation Rule` section with a `#### Key Derivation (via the shared verb)` section that names the verb twice and composes the id from the returned digest:

```
- `signature`: run `adev heuristics signature --origin recover --text "<root-cause>"` → `recover-<digest>`
- `id`: run `adev heuristics signature --origin recover --text "<root-cause>" --digest-only` → `<digest>`,
  then compose `<category-slug>-<digest>` where `<category-slug>` is the lowercased diagnosis
  category with underscores replaced by hyphens.
```

State the fail-closed rule the constitution reference demands: **if the verb is unavailable or exits non-zero, skip heuristic extraction entirely, log `heuristics: extraction skipped — signature verb unavailable`, and continue the recovery.** Without the verb there is neither a signature nor an id, so there is no partially-degraded entry to write. Then extend the concrete `adev heuristics write` invocation with `--signature recover-<digest>` (Task 2's flag). Keep the Category Templates, Scope Derivation, Title Derivation and Contradiction Scan sections as they are.

- [ ] **Verify test passes**

Run: `node --test tests/skills/ ` then `npm test`
Expected: PASS. Note `tests/skills-no-inline-node.test.mjs` and the `.githooks/pre-commit-no-inline-node` chain also gate this file — the new section names CLI verbs only, with no inline-Node block in the same H3 section.

- [ ] **Commit**

```bash
git add skills/recover/SKILL.md tests/skills/recover-extract-heuristic.test.mjs
git commit -m "refactor(recover): derive heuristic keys via adev heuristics signature

Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
Plan-task: 6"
```

---

### Task 7: Retire the dead capture path and its tests [specialist: none]

**Depends on:** Task 2 (same file)
**Charter capability:** Dead Capture-Path Retirement
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/heuristics.mjs` — delete the `extract` subcommand and everything reachable only from it: `deriveId` (**D3**), `specSlug`, `deriveTitle`, `defaultPattern`, `parseExtractArgs`, `readCharterField`/`resolveScope`/`resolveContained` if they lose their last caller, the `--check-first-run` flag and its first-run gate, the module header's `extract` documentation, and the `extract` lines in `help()`
- Modify: `tests/cli/heuristics.test.mjs` — retire the 27 `extract` references; keep the `retrieve`, `write` and dispatch coverage
- Delete: `skills/validate/checks/validate.check-12-heuristic-extraction.md`
- Test: `tests/cli/heuristics.test.mjs`

**Tests:** `tests/cli/heuristics.test.mjs` — retire and re-point. The file is *trimmed, not deleted*: its `retrieve` and `write` coverage is live and unrelated to the dead verb. Only the `extract`-exercising tests go.

**This task is atomic by necessity.** Deleting the verb without retiring its tests leaves `npm test` red, so no acceptance criterion depending on a green suite could hold in between. The verb, its tests, its help text and the orphaned check file land in one commit.

**Context to load:** see *Task 7 Context* above.

- [ ] **Write failing tests**

```javascript
test("adev heuristics extract is gone — unknown subcommand exits 1 with usage", () => {
  const r = runCli(["heuristics", "extract", "--spec", "x", "--report", "y"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /usage: adev heuristics <retrieve\|signature\|migrate-keys\|write>/);
});

test("--help no longer advertises extract or --check-first-run", () => {
  const r = runCli(["heuristics", "--help"]);
  assert.equal(r.status, 0);
  assert.ok(!/extract/i.test(r.stdout));
  assert.ok(!/check-first-run/.test(r.stdout));
});

test("lib/cli/heuristics.mjs exports no id-derivation function", async () => {
  const mod = await import("../../lib/cli/heuristics.mjs");
  assert.equal(mod.deriveId, undefined);
  assert.equal(mod.specSlug, undefined);
});

test("the orphaned check file is gone", () => {
  assert.equal(existsSync(join(PLUGIN_ROOT,
    "skills/validate/checks/validate.check-12-heuristic-extraction.md")), false);
});

test("exactly two copies of the title prefix remain", () => {
  // tightened from Task 5: lib/cli/heuristics.mjs:155 is deleted here
  assert.equal(grepRepo("First-run PASS: ", ["hooks/", "lib/", "skills/", "tests/"]).length, 2);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics.test.mjs`
Expected: FAIL — `extract` still dispatches and exits 0; `deriveId` is still exported; the check file still exists.

- [ ] **Implement**

Delete the `extract` dispatch branch and its exclusive helpers; update `USAGE`, the module header comment and `help()`. Remove the `extract`-exercising tests from `tests/cli/heuristics.test.mjs` (its header comment is re-pointed from "Tests for `adev heuristics extract`" to the surviving subcommands) and delete the orphaned check file. Leave `tests/governance/validate-check-set-restructure.test.mjs` alone — it already asserts the check id is retired and keeps passing. Provider mirrors under `providers/*/skills/**` are out of scope (they document the check id historically, not the CLI verb).

- [ ] **Verify test passes**

Run: `node --test tests/cli/ tests/governance/ tests/skills/` then `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add -A lib/cli/heuristics.mjs tests/cli/heuristics.test.mjs skills/validate/checks/
git commit -m "refactor(heuristics)!: remove the unreachable adev heuristics extract path

Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
Plan-task: 7"
```

---

### Task 8: Update dangling references [specialist: none]

**Depends on:** Task 7
**Charter capability:** Dead Capture-Path Retirement
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `docs/cli-reference.md:525` — drop `heuristics extract --spec <p> --report <p> […]` from the signature line (and `:54` if its one-line description still says "Extract")
- Modify: `lib/diagnostics/tier2/validated-without-report.mjs:30-36` — remove call-site 2 (`lib/cli/heuristics.mjs:323`, the `--check-first-run` first-run predicate) and renumber the remaining two
- Modify: `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md:89` — mark the `adev heuristics extract works` criterion superseded-by `failure-capture.spec.md` (**D6**)
- Modify: `tests/cli/heuristics.test.mjs` — the no-dangling-reference scan
- Test: `tests/cli/heuristics.test.mjs` (extend)

**Tests:** `tests/cli/heuristics.test.mjs` — extend; same behavior family as Task 7 (Behavior 7).

**Context to load:** see *Task 8 Context* above.

- [ ] **Write failing test**

```javascript
test("no reference to the removed verb remains in docs/ or lib/", () => {
  const hits = grepRepo(/heuristics extract|--check-first-run/, ["docs/", "lib/"]);
  assert.deepEqual(hits, [], `dangling references: ${hits.join(", ")}`);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/heuristics.test.mjs`
Expected: FAIL — two hits: `docs/cli-reference.md:525` and `lib/diagnostics/tier2/validated-without-report.mjs:33`.

- [ ] **Implement**

Rewrite the `docs/cli-reference.md` signature line to `heuristics retrieve --module <slug> […]` · `heuristics signature --origin <o> (--text <t> | --blocker-id <id>) [--digest-only]` · `heuristics write --id <id> --scope <s> --title <t> --pattern <p> [--signature <sig>] […]`, so the doc gains Tasks 1-2's flags in the same pass. In `validated-without-report.mjs`, delete the second numbered call site and renumber; the SA-13 ownership note stays, now describing two call sites. In the sweep spec, annotate the line-89 criterion — the by-name reference (**D6**) — as superseded by this spec; that spec has no source manifest and no `.validate.md`, so nothing else needs restamping.

- [ ] **Verify test passes**

Run: `node --test tests/cli/heuristics.test.mjs` then `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add docs/cli-reference.md lib/diagnostics/tier2/validated-without-report.mjs \
        .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md \
        tests/cli/heuristics.test.mjs
git commit -m "docs(heuristics): update references orphaned by the extract-verb removal

Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
Plan-task: 8"
```

---

## Acceptance Criteria Coverage

| Spec criterion | Task |
|---|---|
| FAIL verdict produces `signature`, `id`, `pattern`, `anti-pattern` | 4 |
| PASS entry keeps an outcome-derived prefix | 3, 5 |
| PASS and FAIL distinguishable by title | 3, 4 |
| Same failure twice → same `id`, one entry | 4 |
| Matching `signature`, different `id` → separate entries | 4 |
| No test asserts hook-path automatic promotion | 4 (explicit prohibition) |
| FAIL path reads only `checks[].id` / `checks[].outcome`; secret-injection test | 4 |
| Captured FAIL heuristic names which checks failed | 4 |
| No non-PASS check → write nothing, exit 0 | 4 |
| Every hook error path exits 0, verdict unchanged | 4 |
| `skills/recover/SKILL.md` has no derivation rule; names the verb for both values | 6 |
| `--digest-only` emits a bare 8-hex digest; rejected with `--blocker-id` | 1 |
| Recover ids byte-identical to a pre-change fixture | 6 |
| `extract`, `--check-first-run`, orphaned check file gone | 7 |
| `tests/cli/heuristics.test.mjs` no longer exercises the removed verb | 7 |
| Harness uses the outcome-derived prefix | 5 |
| Exactly two prefix copies remain and agree | 5 (agreement + provisional `<= 3` bound), 7 (exact `=== 2` count) |
| No reference to the removed verb in `docs/` or `lib/` | 8 |
| `npm test` passes | every task |
| No constitutional violations | every task |

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gates from `.context-index/governance/gates.yaml` (which supersedes the constitution's Quality Gates block):

- `test` — Test Suite, deterministic, fast tier, severity error: `npm test`
- All acceptance criteria from the spec satisfied (table above)
- Constitution compliance: zero new external dependencies; pure ESM `.mjs`; hook protocol unchanged (stdin JSON, stdout JSON, exit 0); no inline Node in `skills/recover/SKILL.md`; `Spec:` trailer on every commit

No lint or typecheck gate is defined for this project, so those steps are not applicable.




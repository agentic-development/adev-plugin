# Implementation Plan: PR Body Advisories

> **Methodology:** adev
> **Charter:** .context-index/specs/features/pr-review-brief/charter.md
> **Spec:** .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md (revision 5)
> **Review:** PASS (2026-08-13)
> **Platform:** Node.js (ESM, `.mjs`), npm, `node:test` — zero external dependencies

**Goal:** Fill the two advisory slots of the brief `adev pr body` already emits — a **size advisory** measuring the PR against a base-resolved threshold and naming the exception classes that legitimise going over it, and a **reading order** turning `## Parallelization` groups into a suggested reading sequence — plus the checked-in script that recomputes the parser-coverage figures backing T1 and T2.

**Architecture:** This plan **replaces two stubs in place**. `pr-body-composition.plan.md` Task 1 ships `lib/cli/pr.mjs` with a complete five-slot registry in which slot 1 (size advisory) and slot 3 (reading order) are already real renderers emitting gap lines. Every renderer has the signature `(resolvedContext) -> { body, bytes }` and emits no marker of its own. This plan swaps the two stub function bodies and adds nothing to the registry.

**What this plan must never do:** reopen marker assembly, add or reorder a slot, change the registry shape, or emit a marker. Those belong to `pr-body-composition.spec.md`. If a task here seems to need any of them, the design is wrong — stop and re-read § Section Placement.

**The cross-slot total-bytes bound is not owned here.** § Resource Bounds is explicit: neither slot renderer can observe the other's contribution, so the total is enforced by marker assembly in the sibling spec. These renderers only *report* their size through the `bytes` field the registry already carries. Three of the four bounds — plan file size, groups per plan, members per group — **are** owned here.

**No grammar is authored here, for anything.** `## Parallelization` is parsed by `lib/parallel/groups.mjs`, owned by the `worktree-parallelization` charter and already consumed by `/adev:implement --parallel`. Revision 1 of this spec wrote a second grammar and was blocked for it. One on-disk format, one parser. `## Task Summary` is deliberately not consumed on any path — it has no parser, no owner, and no charter declaration, and depending on it would reintroduce exactly that defect.

**Task count is deliberate.** § Actionable Task Map lists 9 rows, merged here into **4 tasks**. The map is a component inventory; six of its rows are small functions inside two renderers. Merging is this plan's decision and is recorded so a reader does not mistake it for an omission.

**§ Test Obligations is the acceptance surface.** The spec moved every number out of prose into that table because revisions 1–3 kept one restatement going stale while the others moved. T1–T7 are assigned to named tasks below and never folded into a generic "write tests" step. **This plan therefore states no coverage figure, no threshold value, and no bound value** — doing so would recreate the defect. Task 4 builds the script that recomputes them.

---

## File Structure

**Create:**
- `scripts/measure-parallelization-coverage.mjs` — the checked-in recomputation backing T1 and T2. A real deliverable, not a test fixture: it walks an explicitly defined plan-corpus root, calls the owned parser, and reports rung distribution plus the breakdown of parse-failure causes.
- `tests/parallelization-coverage.test.mjs` — runs that script over the live corpus and asserts its output is *internally consistent and recomputed*, never that it equals a literal.

**Modify:**
- `lib/cli/pr.mjs` — replace the slot-1 and slot-3 stub renderer bodies; add the base-ref configuration reader, size computation, rung classifier, de-duplication, and the three owned resource bounds.
- `tests/pr-body.test.mjs` — the advisory cases append to the sibling plan's test file.

**Reference (read, do not modify):**
- `.context-index/specs/features/pr-review-brief/pr-body-composition.plan.md` — Task 1, for the slot registry, the renderer signature, and the resolved-context shape (resolved `base`, resolved `head`, commit list, changed paths with per-path additions/deletions).
- `lib/parallel/groups.mjs` — `parseParallelizationSection(planContent)`. **The single owned parser.** Returns `{ groups, malformed }` and never throws.
- `.context-index/specs/features/pr-review-brief/pr-body-composition.spec.md` — Invariants 4, 5, 6, 7 and 9, all inherited here with no exception added.
- `.github/pull_request_template.md` — the packet whose problem-statement heading the size advisory points at, inline and never at the start of a line.

**Explicitly not touched:**
- `.github/workflows/`, sticky-comment delivery, and any `gh` / `glab` call — owned by the `cicd` charter.
- `.github/pull_request_template.md` — already shipped and validated.
- `lib/parallel/groups.mjs` — widening it is in § Deferred Capabilities and needs `worktree-parallelization` to accept the change.
- Marker assembly and the cross-slot total-bytes ceiling in `lib/cli/pr.mjs` — owned by the sibling spec.
- `package.json` — no dependency is added.

---

## Context Packets

**Standing constraint for every task.** `lib/parallel/groups.mjs` is consumed, never reimplemented, never widened. `## Task Summary` is never read. The five-slot registry and marker assembly in `lib/cli/pr.mjs` are read but never modified. Every invariant of `pr-body-composition.spec.md` is inherited unchanged — in particular Invariant 5 (every rendered value passes the encoder built in that plan's Task 2) and Invariant 4 (any failure to obtain an input degrades, names the cause, and leaves the exit code alone).

### Task 1 Context
- Spec: `pr-body-advisories.spec.md` — § Size Advisory, § Configuration (the whole section; the base-ref rule is a security property, not a preference), the four size-related behaviors, § Test Obligations **T6**, **T7**.
- Sibling spec: `pr-body-composition.spec.md` — Invariants 4, 5, 9; the resolved-`(base, head)` pair the determinism criterion is specified over.
- Sibling plan: `pr-body-composition.plan.md` Task 1 — the resolved-context shape carrying `base` and the per-path additions/deletions this task partitions.
- Sibling spec: `review-packet-template.spec.md` AC-6, and `review-packet-template.plan.md` Task 3 — the interlock is *no output line begins with `## ` + a packet heading*; an inline backtick-quoted `` `## What` `` in prose is explicitly permitted and is what this task must render.
- Source files: `lib/cli/pr.mjs` (the slot-1 stub and the resolved context); `lib/manifest.mjs` `loadManifest` for the manifest shape — but note the configuration read here is from **`base`**, so it is `git show <base>:.context-index/manifest.yaml`, not a working-tree load.
- **Parse that base-side YAML string with `parseYaml(source)` from `lib/profiles/yaml.mjs`** — the owned parser, used by 10+ lib modules and imported by `lib/manifest.mjs:26` itself. `loadManifest` is unusable here because it reads the working tree, but that is a reason to bypass the *loader*, not to hand-roll a YAML reader. Writing one would violate Principle 1 and the standing consume-never-reimplement constraint in the same stroke. `parseYaml` throws `YamlParseError`, which is the malformed-config case: catch it, apply defaults, and name the rejected value.
- Constitution: Principle 1 — no glob library; mirror globs are matched with a hand-rolled matcher or `node:path` primitives.
- Boundary rules: `governance/boundaries.yaml` — `boundaries: []`, none apply.
- Heuristics: 3 entries for module `pr-review-brief` (see `## Heuristics`; none bear on this code).

### Task 2 Context
- Spec: `pr-body-advisories.spec.md` — § Reading Order in full, § Fallback ladder (the rung table and the two predicates stated as a mutually exclusive pair), the de-duplication rule, the three reading-order behaviors, § Test Obligations **T3**, **T4**.
- Source files: `lib/parallel/groups.mjs` in full — it is short, and the implementer must see that it returns `{ groups, malformed }`, never throws, and scrapes members with a global `Task\s+([A-Za-z0-9.]+)` over the whole group line. Those two facts drive the entire rung classifier.
- Sibling plan: `pr-body-composition.plan.md` Task 1 — the commit list in the resolved context is the rung 2 / rung 3 chronological ordering source (`git log --reverse` over the resolved range).
- Charter: `charter.md` — capability **Reading order for multi-commit PRs**, and its explicit narrowing: plan task order is *not* promised, only the case where the owned parser succeeds.

### Task 3 Context
- Spec: `pr-body-advisories.spec.md` — § Resource Bounds in full, the bound-related behavior and error-case rows, § Test Obligations **T5**.
- Sibling spec: `pr-body-composition.spec.md` — Invariant 4's input-side gate, and the regular-file + size-ceiling guard built in that plan's Task 2. **Reuse that guard rather than writing a second one**; this task adds the two *count* bounds (groups per plan, members per group) and wires the plan-file read through the existing file gate.
- Source files: `lib/cli/pr.mjs` — the bounds helper from the sibling plan's Task 2, and the two renderers from Tasks 1 and 2 of this plan.

### Task 4 Context
- Spec: `pr-body-advisories.spec.md` — § Test Obligations **T1** and **T2**; § Deferred Capabilities (the deferral argument these figures back, and the explicit note that the argument does **not** rest on their magnitude).
- Source files: `lib/parallel/groups.mjs` (`parseParallelizationSection` — the script's only parsing dependency); `scripts/` for the in-repo script conventions.
- **The parser's return value already discriminates all three failure causes — do not re-detect any of them.** `parseParallelizationSection` returns `{ groups, malformed }`, and the `malformed` flag is the discriminator: no `## Parallelization` section at all yields `{ groups: [], malformed: false }`; a section present but with no group line matching the parser's qualifier form yields `{ groups: [], malformed: true }`; and a group that parsed but is empty appears as a group with `members.length === 0`. Re-testing `/^##\s+Parallelization/` yourself to tell the first two apart is the second-grammar reflex this task's own source-scan test forbids. This task is Group B and runs independently of Task 2, so this shape is restated here rather than assumed inherited.
- Corpus root: `.context-index/specs/**/*.plan.md`. Define this root **in one place inside the script** and have the test import it, so the corpus definition cannot drift between script and test.

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
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

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3
- Group B (independent): Task 4

Group B can run in parallel with Group A. Group A's three tasks all write `lib/cli/pr.mjs` and `tests/pr-body.test.mjs`, so they are strictly serial; Task 3 additionally needs both renderers to exist before it can bound them. Task 4 shares no file with Group A — it creates `scripts/measure-parallelization-coverage.mjs` and `tests/parallelization-coverage.test.mjs` and touches neither the module nor the main test file — so it is genuinely concurrent rather than nominally so.

**Cross-plan sequencing.** This entire plan is gated on `pr-body-composition.plan.md` **Task 1**, which creates `lib/cli/pr.mjs` and the five-slot registry. Group A is additionally easier once that plan's Task 2 lands, since it supplies the encoder and the file-bounds guard this plan reuses rather than rebuilds. In practice: **run the composition plan to completion first.** Both plans write the same module, so interleaving them buys no wall-clock and costs merge conflicts. Group B (Task 4) is the one exception — it depends on nothing in either plan and may be built at any time.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Size advisory (slot 1) + base-ref configuration | medium | unit | composition plan Task 1 | 0 create, 2 modify |
| 2 | Reading order (slot 3): parser consumption, rung ladder, de-duplication | medium | unit | Task 1 | 0 create, 2 modify |
| 3 | The three owned resource bounds and their named degradations | small | unit | Task 2 | 0 create, 2 modify |
| 4 | Coverage script recomputing T1/T2 over the plan corpus | small | unit | — | 2 create, 0 modify |

All four tasks resolve to the `unit` strategy (source: fallback — the spec declares no `test_strategy` and `manifest.yaml` declares no `test_strategies` globs), so no Strategy Summary section is emitted. The spec declares no `infra_requirements:` and no task is non-unit, so no Test Infrastructure Requirements section is emitted either: every test reads files from a temp dir or from the repo's own corpus.

`manifest.yaml` declares `specialists: []`, so every task is tagged `[specialist: none]`.

**§ Test Obligations coverage map** — all seven rows, each landed in a named task:

| Obligation | Task |
|---|---|
| T6 (threshold default; configuration resolves from `base` even when head-side differs) | Task 1 |
| T7 (no output line begins with a packet H2; the packet pointer renders inline) | Task 1 |
| T3 (parser yields duplicate members on real corpus input; de-duplication removes them without collapsing cross-group presence) | Task 2 |
| T4 (parser behaviour on plural and ranged task references; a plan containing such a group reaches rung 2 **whole**, including the mixed case) | Task 2 |
| T5 (the numeric value of each owned resource bound, and that exceeding each renders its named degradation) | Task 3 |
| T1 (current parser coverage over the plan corpus, recomputed by a checked-in script) | Task 4 |
| T2 (the measured causes of parse failure and their relative sizes) | Task 4 |

---

### Task 1: Size advisory (slot 1) + base-ref configuration [specialist: none]

**Depends on:** `pr-body-composition.plan.md` Task 1 (the slot registry and the resolved `(base, head)` pair)
**Charter capability:** Size advisory with exception classes.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/pr.mjs` (replace the slot-1 stub body; add the base-ref config reader and size computation)
- Modify: `tests/pr-body.test.mjs`

**Tests:** `tests/pr-body.test.mjs`

**Context to load:** see § Context Packets → Task 1 Context.

**Acceptance criteria covered:** the four size-related behaviors; the configuration-resolves-from-`base` criterion; the packet-pointer-never-at-start-of-line criterion; § Test Obligations **T6**, **T7**.

**Configuration is read from the base ref. This is a security property, not a preference.** The manifest sits inside the very range the advisory measures. Reading the head-side copy puts the threshold under the control of the author whose change is being sized: a PR raising it would pass every shape check and silently disable the advisory, with nothing for a reader to notice, because the below-threshold form is a legitimate normal output. Read it with `git show <base>:.context-index/manifest.yaml` — **not** `loadManifest(projectRoot)`, which reads the working tree. Absent at `base`, or present but malformed, means documented defaults apply and the advisory names the rejected value.

This makes configuration a function of `base`. That is consistent with determinism, which is specified over a fixed *resolved* `(base, head)` pair — but it means the brief must name the base it resolved and the configuration source it used, so a reader can tell which case they are in.

**Two figures, one comparison.** Report **raw** across every changed path and **net** excluding paths matching the configured mirror globs. Compare **net** against the threshold; render raw alongside so the exclusion is visible rather than silently applied. Name how many paths were excluded and by which glob.

**The verb asserts no exception class.** At or above the threshold, name and define the three classes — mechanical sweep, generated mirror, migration — and leave them for the author to claim. Only generated mirror has deterministic evidence and it is already in the net figure; the other two are author claims. A generator guessing "mechanical sweep" from diff shape would launder a heuristic into an excuse. Point the author at the review packet's problem-statement section **in prose, inline, never at the start of a line**, so it cannot collide with the packet-heading interlock.

- [ ] **Write failing test**

Append to `tests/pr-body.test.mjs`:

```javascript
// --- T6: the threshold default, and the base-side read ---
// The VALUE of the default lives here, not in prose. Assert the shipped
// default by reading it from the module's exported constant, then assert
// behaviour at, just below, and just above it.
test("T6: the documented threshold default applies when config is absent at base", ...);
test("T6: configuration resolves from BASE even when the head-side manifest differs", ...);
// The security case, stated as a test: a head-side manifest raising the
// threshold must NOT suppress escalation.
test("T6: a head-side manifest raising the threshold does not disable escalation", ...);
test("T6: malformed config at base falls back to defaults and names the rejected value", ...);
test("T6: the output names both the resolved base and the configuration source used", ...);

// --- Size computation ---
test("raw counts every changed path; net excludes configured mirror globs", ...);
test("net is the figure compared against the threshold; raw renders alongside", ...);
test("the advisory names how many paths were excluded and by which glob", ...);
test("below threshold: figures stated, no exception class named", ...);
test("at/above threshold: three exception classes render, and the verb still exits 0", ...);
test("empty range renders the section's empty-range line", ...);

// --- T7: the packet interlock, both clauses ---
import { PACKET_HEADINGS } from "./pr-review-packet.test.mjs";
test("T7: no output line BEGINS with '## ' + a packet heading", ...);
test("T7: the packet pointer renders INLINE, mid-line, never at the start of a line", ...);
```

The head-vs-base test is the one that proves the security property: build a temp repo whose `base` commit carries one threshold and whose `head` commit carries a different (higher) one, then assert the base-side value drove the decision and escalation still fired.

- [ ] **Verify test fails**

Run: `node --test tests/pr-body.test.mjs`
Expected: FAIL — slot 1 still renders its stub gap line.

- [ ] **Implement**

Replace the slot-1 stub body in `lib/cli/pr.mjs`. Keep the `(resolvedContext) -> { body, bytes }` signature exactly; report `bytes` and enforce no total. Every rendered value passes the encoder from the sibling plan's Task 2.

Export the threshold default as a named constant so the test can read it rather than restate it — that is what keeps the number in one place.

- [ ] **Verify test passes**

Run: `node --test tests/pr-body.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.
Then: `adev pr body --base main` shows a populated size advisory in slot 1.

- [ ] **Commit**

Branch (if not already created): `feat/pr-review-brief/pr-body-advisories`

```bash
git add lib/cli/pr.mjs tests/pr-body.test.mjs
git commit -m "feat(pr-review-brief): add size advisory with base-resolved configuration

Spec: .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md
Plan-task: 1"
```

---

### Task 2: Reading order (slot 3) — parser consumption, rung ladder, de-duplication [specialist: none]

**Depends on:** Task 1
**Charter capability:** Reading order for multi-commit PRs.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/pr.mjs` (replace the slot-3 stub body)
- Modify: `tests/pr-body.test.mjs`

**Tests:** `tests/pr-body.test.mjs`

**Context to load:** see § Context Packets → Task 2 Context.

**Acceptance criteria covered:** all three rungs with their ordering and annotation; ladder exhaustiveness and disjointness including the mixed case; the mixed-plan-degrades-whole criterion; the no-second-grammar and no-`## Task Summary` criteria; § Test Obligations **T3**, **T4**.

**Call `parseParallelizationSection(planContent)`. Author no grammar, no regex, no pattern of your own for that section.** An acceptance criterion asserts the module defines no such pattern, and another asserts it contains no reference to `## Task Summary`. Both are tested by scanning this module's own source.

**Rungs are assigned per plan, never per group. A plan reaches exactly one rung.**

| Rung | Condition | Ordering | Annotation |
|---|---|---|---|
| 1 | The plan was read, **and** the parser yielded at least one group, **and** **every** group has at least one member | Group order, then de-duplicated member order | none — the normal case |
| 2 | The plan was read, but the parser yielded no groups **or any** group has no members | Commit order over the range | names which case applied, the plan path, and that ordering is chronological rather than planned |
| 3 | The plan could not be read — absent, unreadable, not a regular file, or refused by a resource bound | Commit order over the range | names the path and which case applied |

**The two predicates are a mutually exclusive pair and must be implemented as one.** Rung 1 requires **every** group populated; rung 2 fires on **any** group empty. Revision 3 of the spec wrote rung 1 as "every group has at least one member" and rung 2 as "yields nothing usable", which together left the mixed case — some groups populated, at least one empty — matching neither. **That state exists in the corpus today**, so the gap was reachable rather than theoretical.

**A mixed plan degrades whole.** Rendering its populated groups at rung 1 while dropping the empty one is precisely the silent omission this ladder exists to prevent, and partial credit would make the annotation a lie about the plan as a whole.

**The read/parse split makes rungs 2 and 3 disjoint by construction.** Rung 3 is the only rung reachable without a successful read, so a plan that reads successfully but yields nothing — **including a zero-byte file** — is unambiguously rung 2. Implement the read and the parse as two separate steps with the rung decided between them; fusing them reintroduces the ambiguity.

**Members are de-duplicated per group, keeping first occurrence.** The parser scrapes task references from the whole group line, so a line naming a task twice yields it twice; telling a reviewer to read task 1, then 2, then 3, then 1 again is wrong on its face. De-duplication is **per group** — the same task legitimately appearing in two groups is the plan saying something, and is preserved. The `independent` flag renders as a per-group label and **reorders nothing**: it describes execution safety, not reading sequence.

- [ ] **Write failing test**

Append to `tests/pr-body.test.mjs`. Use temp-dir plan fixtures for the constructed cases, and the live corpus for the two obligations that are about real input:

```javascript
// --- T3: duplicates are a property of real corpus input ---
test("T3: the parser yields duplicate members on REAL corpus input", ...);       // scan the corpus
test("T3: de-duplication removes them, keeping first occurrence", ...);
test("T3: a task legitimately present in TWO groups is preserved in both", ...);

// --- T4: plural and ranged references, and the mixed case, reaching rung 2 WHOLE ---
// PLURAL and RANGED-SINGULAR behave OPPOSITELY. Do not use one fixture for both.
// The parser's member scrape is /Task\s+([A-Za-z0-9.]+)/gi — no hyphen in the class:
//   "Tasks 1-3"  -> "Tasks" never matches "Task\s" -> members: []      -> EMPTY group
//   "Task 1-3"   -> matches, captures "1" only     -> members: ["1"]   -> POPULATED, silently truncated
test("T4: PLURAL ('Tasks 1-3') yields an EMPTY group", ...);
test("T4: a plan containing an empty group reaches rung 2 as a WHOLE plan", ...);
test("T4: RANGED-SINGULAR ('Task 1-3') yields members ['1'] — a POPULATED group", ...);
test("T4: a plan whose groups are all populated is rung 1 EVEN IF a range was truncated", ...);
test("T4: the MIXED case — some groups populated, at least one empty — is rung 2", ...);
test("T4: a corpus witness for the mixed case exists and classifies as rung 2", ...);

// --- Ladder totality and disjointness ---
test("ladder is exhaustive and disjoint: every parser outcome maps to exactly ONE rung", ...);
test("a zero-byte plan file READS successfully and is therefore rung 2, not rung 3", ...);
test("an absent plan is rung 3; an unreadable one is rung 3; a non-regular file is rung 3", ...);
test("mixed plan degrades whole: NONE of its populated groups renders in normal-case form", ...);

// --- Ordering and annotation per rung ---
test("rung 1: group order, then de-duplicated member order, no annotation", ...);
test("rung 2: commit order, annotation names the case, the plan path, and 'chronological'", ...);
test("rung 3: commit order, annotation names the path and the case", ...);
test("commit order is git log --reverse over the RESOLVED range", ...);
test("the independent flag renders as a per-group label and reorders nothing", ...);
test("rungs are assigned per PLAN — a range spanning two plans yields one rung each", ...);

// --- Negative criteria: nothing is reimplemented, nothing extra is read ---
test("the module defines no '## Parallelization' grammar of its own", ...);   // source scan
test("the module contains no reference to '## Task Summary' on any path", ...); // source scan
```

**Ranged-singular truncation is real, and pinning it is the point.** `Task 1-3` produces a populated group carrying only task 1 — tasks 2 and 3 are silently dropped by the parser's scrape. That is a coverage gap in a module this charter does not own, and widening it is in § Deferred Capabilities. The test pins the **actual** behaviour (rung 1, truncated) rather than the behaviour one might wish for; a test asserting rung 2 here would be unsatisfiable without changing either the parser (forbidden) or the ladder (specified).

For the corpus-witness case, locate the witness by scanning rather than hardcoding a filename, then assert it classifies as rung 2. A hardcoded filename is a figure that rots; a scan is a recomputation. (One such plan exists in the corpus at time of writing — the scan will find it, and if a future edit removes it the test should say so rather than silently pass.)

- [ ] **Verify test fails**

Run: `node --test tests/pr-body.test.mjs`
Expected: FAIL — slot 3 still renders its stub gap line.

- [ ] **Implement**

Replace the slot-3 stub body in `lib/cli/pr.mjs`, keeping the `(resolvedContext) -> { body, bytes }` signature. Structure it as: **read** (gated by the file guard from the sibling plan's Task 2) → **classify the rung** → **render**. The rung decision happens once, per plan, between the read and the render.

Derive the plan path from the `Spec:` trailer by stem substitution: `<spec-stem>.spec.md` → `<spec-stem>.plan.md`, adjacent to the spec. (ADR-0012's plan-stem-not-spec-stem rule governs the *routing sidecar*, which is keyed to the plan file; it does not apply to finding the plan file itself. There is no lookup table to hunt for.) Pass the derived path through the containment guard before any filesystem access.

- [ ] **Verify test passes**

Run: `node --test tests/pr-body.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.
Then: `adev pr body --base main` shows a populated reading order in slot 3, with its rung named.

- [ ] **Commit**

```bash
git add lib/cli/pr.mjs tests/pr-body.test.mjs
git commit -m "feat(pr-review-brief): add reading order with three-rung fallback ladder

Spec: .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md
Plan-task: 2"
```

---

### Task 3: The three owned resource bounds [specialist: none]

**Depends on:** Task 2
**Charter capability:** Reading order for multi-commit PRs; Size advisory with exception classes (the Observability attribute of both).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/pr.mjs`
- Modify: `tests/pr-body.test.mjs`

**Tests:** `tests/pr-body.test.mjs`

**Context to load:** see § Context Packets → Task 3 Context.

**Acceptance criteria covered:** every bound renders a named degradation; the output stays within the bound; § Test Obligations **T5**.

**Three bounds are owned here; the fourth is not.** § Resource Bounds names four dimensions. This task owns:

1. **The size of a plan file before it is read** — reuse the regular-file + size-ceiling guard built in the sibling plan's Task 2 rather than writing a second one. The regular-file check is not redundant with the size ceiling: a symlink to a character device is not large, and no size ceiling would catch it.
2. **The number of groups drawn from one plan.**
3. **The number of members within one group.**

The fourth — **total bytes the two sections contribute** — is **cross-slot and is not owned here.** Neither renderer can observe the other's contribution, so it is enforced by marker assembly in `pr-body-composition.spec.md`. These renderers report their size through the `bytes` field the registry already carries. **Do not add a total-size check to either renderer.**

**The unit of every bound is the individual rendered value, not a rendered list.** Every bound renders a **named degradation**, never a silent trim: the output says what was dropped and how much. A reading order silently truncated looks identical to a short one.

- [ ] **Write failing test**

Append to `tests/pr-body.test.mjs`:

```javascript
// --- T5: the numeric value of each owned bound, and its named degradation ---
// The VALUES live here, in one place, read from exported constants.
test("T5: the plan-file size bound — its value, and that exceeding it degrades to rung 3", ...);
test("T5: the groups-per-plan bound — its value, and its named degradation", ...);
test("T5: the members-per-group bound — its value, and its named degradation", ...);
test("T5: a non-regular file (fifo/device symlink) is refused before reading — rung 3", ...);

// --- Every bound annotates rather than silently trims ---
test("exceeding the groups bound names what was dropped and how much", ...);
test("exceeding the members bound names what was dropped and how much", ...);
test("output stays within each bound after degradation", ...);
test("a bound breach never changes the exit code", ...);

// --- The cross-slot total is NOT enforced here ---
test("neither advisory renderer enforces a cross-slot total; both report bytes", ...);
```

The last case is a guard against re-implementing the sibling spec's responsibility. Assert the renderers return their `bytes` and truncate nothing on that basis.

- [ ] **Verify test fails**

Run: `node --test tests/pr-body.test.mjs`
Expected: FAIL — the count bounds do not exist; oversized fixtures render in full.

- [ ] **Implement**

Add the two count bounds and wire the plan read through the existing file guard. Export each bound as a named constant so the tests read the value rather than restate it.

- [ ] **Verify test passes**

Run: `node --test tests/pr-body.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.

**Re-run the sibling plan's whole-output assertions deliberately, do not assume they still hold.** `pr-body-composition.plan.md` Task 5 authored the byte-identical-determinism case, the `package.json`-unchanged case, and the T7 packet interlock against a brief whose slots 1 and 3 were *stubs*. This task is the first point at which both advisory slots are fully populated and bounded, so it is the first point at which those assertions are actually exercised against real content. Confirm all three still pass here rather than inheriting them.

- [ ] **Commit**

```bash
git add lib/cli/pr.mjs tests/pr-body.test.mjs
git commit -m "feat(pr-review-brief): add advisory resource bounds with named degradations

Spec: .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md
Plan-task: 3"
```

---

### Task 4: Coverage script recomputing T1/T2 over the plan corpus [specialist: none]

**Depends on:** nothing — independent of Group A and of the composition plan.
**Charter capability:** Reading order for multi-commit PRs (the evidence base for its deferral argument).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `scripts/measure-parallelization-coverage.mjs`
- Create: `tests/parallelization-coverage.test.mjs`

**Tests:** `tests/parallelization-coverage.test.mjs`

**Context to load:** see § Context Packets → Task 4 Context.

**Acceptance criteria covered:** § Test Obligations **T1**, **T2**; the criterion that T1/T2 recompute from the corpus rather than asserting a literal.

**This is a real deliverable file, not a test case.** § Test Obligations requires "a checked-in script over an explicitly defined corpus root". The reason is specific and documented: revision 1 of the spec asserted a coverage figure measured against two files, and revision 3's figures drifted by one plan **within a day of being written**. A script that recomputes cannot go stale; a number in a test can.

**The script reports, the test asserts consistency — neither asserts a literal.** The script emits, over the corpus:

- **T1 — coverage:** how many plans yield usable groups (rung 1) versus nothing usable (rung 2), using the same rung predicates Task 2 implements.
- **T2 — failure causes:** the breakdown of *why* rung 2 was reached, with relative sizes. The distinguishable causes are: no `## Parallelization` section at all; a section present but no group line matched the parser's qualifier form; and at least one group parsed but empty.

The test then asserts the output is **internally consistent and recomputed** — the buckets partition the corpus, the totals sum to the file count, the run is deterministic across two invocations, and the corpus is non-empty — never that any bucket equals a particular number.

**Do not let the deferral argument rest on the magnitude.** § Deferred Capabilities is explicit that the widening is deferred on a ground holding at any magnitude: the same widening moves plans from serial fallback into concurrent execution in `/adev:implement --parallel`, a behaviour change in another charter's module. T2 measures the causes; it does not carry the argument. Revision 2 deferred on a magnitude claim that measurement later refuted.

- [ ] **Write failing test**

Create `tests/parallelization-coverage.test.mjs`:

```javascript
// Import the corpus root from the script so the definition lives in ONE place.
import { CORPUS_ROOT, measureCoverage } from "../scripts/measure-parallelization-coverage.mjs";

test("T1: the corpus is non-empty and every plan lands in exactly one rung bucket", ...);
test("T1: rung1 + rung2 counts sum to the total plan count — the buckets partition", ...);
test("T1: coverage is RECOMPUTED, not asserted against a literal", ...);   // no magic numbers

test("T2: parse-failure causes are broken down and their counts sum to the rung-2 total", ...);
test("T2: each named cause is distinguishable — no-section, no-matching-group-line, empty-group", ...);

test("two runs over an unchanged corpus produce identical output", ...);
test("the script uses lib/parallel/groups.mjs and defines no grammar of its own", ...); // source scan
test("the script writes no file and mutates nothing", ...);
```

Assert the *absence* of magic numbers deliberately: the point of this obligation is that no figure is written down twice.

- [ ] **Verify test fails**

Run: `node --test tests/parallelization-coverage.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/measure-parallelization-coverage.mjs'`.

- [ ] **Implement**

Create `scripts/measure-parallelization-coverage.mjs`. Export `CORPUS_ROOT` and `measureCoverage()` so the test imports rather than re-derives them, and make it runnable directly (`node scripts/measure-parallelization-coverage.mjs`) for a human-readable report. Pure Node built-ins; `parseParallelizationSection` is its only parsing dependency. It reads and reports — it writes nothing.

Use the same rung predicates as Task 2. If the script and the renderer ever disagree about what rung 1 means, the measurement stops describing the shipped behaviour, so factor the predicate into one place if that proves practical.

- [ ] **Verify test passes**

Run: `node --test tests/parallelization-coverage.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.
Then run it for a human report: `node scripts/measure-parallelization-coverage.mjs`.

- [ ] **Commit**

```bash
git add scripts/measure-parallelization-coverage.mjs tests/parallelization-coverage.test.mjs
git commit -m "feat(pr-review-brief): add parallelization coverage measurement script

Spec: .context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md
Plan-task: 4"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gates are taken from `.context-index/governance/gates.yaml`, which supersedes the constitution's generic list:

- **`test` — Test Suite** (deterministic, tier `fast`, severity `error`, triggers `post-task` / `post-implement`): `npm test`

No lint or typecheck gate is active in this repo — both are commented out in `gates.yaml` with empty commands, so neither runs.

Additional non-gate checks that apply to this change set:

- `package.json` must be byte-identical after this plan — an acceptance criterion asserts it, and a test enforces it.
- No `skills/**/SKILL.md` is edited, so `.githooks/pre-commit-no-inline-node` and `tests/sync/provider-skill-parity.test.mjs` are not engaged.
- Commits carry the `Spec:` and `Plan-task:` trailers required by the constitution's Commit Trailers section.

**Acceptance-criteria coverage:** the size-advisory behaviors, the base-side configuration criterion, and the packet-pointer criterion by Task 1; the three rungs, ladder exhaustiveness, mixed-plan-degrades-whole, and both no-reimplementation criteria by Task 2; every bound's named degradation by Task 3; the T1/T2 recomputation criterion by Task 4. Byte-identical output across two runs is inherited from `pr-body-composition.spec.md` Invariant 7 and is asserted in that plan's Task 5; this plan adds no exception to it. The two remaining criteria (`npm test` passes, no constitutional violations) are verified by `/adev:validate`, not by a task.

**Ownership note for validation:** the cross-slot total-bytes bound is deliberately **not** implemented by this plan. A validation pass that finds no total-size enforcement in the advisory renderers should read § Resource Bounds and the sibling spec's § Section ownership — it belongs to marker assembly — rather than file a coverage gap.

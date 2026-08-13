# Implementation Plan: PR Body Composition

> **Methodology:** adev
> **Charter:** .context-index/specs/features/pr-review-brief/charter.md
> **Spec:** .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md (revision 7)
> **Review:** PASS (2026-08-13)
> **Platform:** Node.js (ESM, `.mjs`), npm, `node:test` — zero external dependencies

**Goal:** Ship `adev pr body` — one module (`lib/cli/pr.mjs`), one test file, one dispatch-table line — that reads a commit range plus two kinds of on-disk lifecycle artifact and prints a marker-delimited markdown brief to stdout, exit 0 unless a git ref fails to resolve.

**Architecture:** A **walking skeleton first**. Task 1 delivers a runnable verb whose marker assembly already owns the complete **five-slot registry**; slots 1 (size advisory) and 3 (reading order) ship as stub renderers emitting their gap lines. That is not scaffolding to be thrown away — Invariant 2 ("every section renders") and the empty-range behavior ("all five slots render") mean a three-slot brief is not a valid brief, so the five-slot shape is the contract from the first commit. `pr-body-advisories.spec.md` **replaces those two stubs in place** and never reopens assembly. Tasks 2–5 then fill in the safety substrate and this spec's three sections behind an already-passing end-to-end test.

The verb is read-only: `git log` / `git diff-tree` for the range, `lib/plan-routing-sidecar.mjs` for routing entries, `currentState()` from `lib/lifecycle-state.mjs` for validate outcomes. No git library, no markdown library, no forge SDK, no network (constitution Principle 1). It plugs into the existing `cli-driver-surface` substrate and changes no hook protocol, plugin registration, or trailer contract — squarely inside the constitution's Autonomous boundary.

**Task count is deliberate.** The spec's § Actionable Task Map lists 11 rows. They are merged into **5 tasks** here. The map is a component inventory, not a work breakdown: eight of its rows are single functions inside one ~500-line module, and dispatching them as separate TDD cycles would spend more on ceremony than on the code. Merging is the plan's decision and is recorded so a reader does not mistake it for an omission.

**§ Test Obligations is the real acceptance surface.** The spec deliberately moved eight facts out of prose and into tests because three consecutive revisions transcribed them wrongly. T1–T8 are therefore assigned to named tasks below, never folded into a generic "write tests" step. Each is asserted **against a real call to the real module** — a test that restates a docblock reproduces the exact defect the table exists to prevent.

---

## File Structure

**Create:**
- `lib/cli/pr.mjs` — the whole verb: arg parsing, git range resolution, trailer reading, path containment, output encoder, input bounds, routing/verification readers, ranking, the five slot renderers, and marker assembly. One module, ~500 lines.
- `tests/pr-body.test.mjs` — every invariant plus every row of § Test Obligations. Grows across all five tasks.

**Modify:**
- `cli/index.mjs:1728` — one line appended to `VERB_REGISTRY`: `["pr", () => import("../lib/cli/pr.mjs")]`.

**Reference (read, do not modify):**
- `lib/plan-routing-sidecar.mjs` — `readRoutingSidecar(planPath)` / `sidecarPathFor(planPath)`. **The owned accessor. No routing-JSON parser is written in this plan.**
- `lib/lifecycle-state.mjs` — `currentState(projectRoot, specPath)`. **The only source of validate outcomes. `.validate.md` is never opened.**
- `lib/cli/route.mjs` — the in-repo pattern for a `lib/cli/<verb>.mjs` module: `export async function run({ projectRoot, argv, manifest })`, `export function help()`, `parseArgs` from `node:util`, lib owns semantics and the CLI module is an I/O shim. Follow it.
- `tests/pr-review-packet.test.mjs` — exports `PACKET_HEADINGS` (line 14). **Import it for T7; do not restate the four heading strings.**
- `.context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` — § Section Placement and § Resource Bounds, so the stub slots are shaped for their eventual owner.

**Explicitly not touched:**
- `.github/workflows/` and any forge delivery, sticky-comment, or `gh`/`glab` call — owned by the `cicd` charter, and the charter requires this module stay buildable with no CI workflow in place.
- `.github/pull_request_template.md` — already shipped and validated by `review-packet-template.plan.md`.
- `package.json` — no dependency is added.
- `lib/parallel/groups.mjs` and the two advisory slots' real renderers — owned by `pr-body-advisories.spec.md`.

---

## Context Packets

**Standing constraint for every task — consume, never reimplement.** Two modules are owned elsewhere and this plan calls them:

- **`lib/plan-routing-sidecar.mjs`** supplies routing entries. Call `readRoutingSidecar(planPath)`. Do **not** open `*.routing.json`, do not `JSON.parse` a sidecar, do not re-derive `sidecarPathFor`. AC asserts the module contains no routing-JSON traversal of its own.
- **`lib/lifecycle-state.mjs` `currentState(projectRoot, specPath)`** supplies validate outcomes. `skills/validate/SKILL.md` forbids re-parsing `.validate.md` and ADR-0012 makes `.md` human-primary; AC asserts no `.validate.md` file is ever opened.

`lib/parallel/groups.mjs` is **not** consumed by this plan — it belongs to `pr-body-advisories`.

### Task 1 Context
- Spec: `pr-body-composition.spec.md` — § Section ownership (the five-slot table), Invariants 1, 2, 8, 9, § Preconditions, § Error Cases (all three codes), § Postconditions, and the empty-range behavior.
- Sibling spec: `pr-body-advisories.spec.md` — § Section Placement (slots 1 and 3 are its property; the stubs are placeholders for it, not for this spec).
- Charter: `charter.md` — Interface Contracts → Exposed APIs (`adev pr body [--base <ref>]`), Invariants (marker enclosure, stdout only, determinism).
- Source files: `lib/cli/route.mjs` in full (the `run({ projectRoot, argv, manifest })` / `help()` contract, `parseArgs` usage, exit-code discipline); `cli/index.mjs:1700–1730` (the `VERB_REGISTRY` array) and `cli/index.mjs:1786–1810` (how `run` is invoked and its return code handled).
- Sample: none curated for CLI verbs; `lib/cli/route.mjs` is the in-repo reference.
- Constitution: Principle 1 (no new dependency), Pure ESM, Conventions (kebab-case files, camelCase functions).
- Boundary rules: `governance/boundaries.yaml` — `boundaries: []`, no rules apply.
- Heuristics: 3 entries for module `pr-review-brief` (see `## Heuristics`; all concern token measurement and none bear on this code).

### Task 2 Context
- Spec: `pr-body-composition.spec.md` — Invariant 5 (encoder), Invariant 6 (containment, including the resolve-through-the-filesystem and re-assert-at-open requirements), Invariant 4 (the input-side gate that makes the universal achievable), § Test Obligations **T4, T5, T8**, and the § Actionable Task Map rows "Output encoder" and "Path containment".
- Note the spec's explicit separation: the encoder transforms values only; containment gates a call and lives outside it; diagnostics are a third concern. Do not merge them into one function.
- Source files: `lib/cli/pr.mjs` (from Task 1).
- Constitution: Principle 1 — the encoder is hand-written, not a markdown-escaping dependency.

### Task 3 Context
- Spec: `pr-body-composition.spec.md` — § Inputs (the "task universe comes from trailers, not the sidecar" decision), § Rendered Content → **Traceability** (including the partition invariant), the two `Spec:`-trailer behaviors, Invariant 6 (trailer-derived paths are exactly what containment gates).
- Charter: `charter.md` — capability **Provenance rollup by spec**; Domain Model → `Traceability Row` (`spec_path`, `task_ids[]`, `commit_count`, `additions`, `deletions`, `missing_spec_trailer`).
- Constitution: Commit Trailers section — the canonical `Spec:` / `Plan-task:` trailer format this reads.
- Source files: `lib/cli/pr.mjs` (Tasks 1–2; the encoder and containment guard from Task 2 are consumed here, not re-written).

### Task 4 Context
- Spec: `pr-body-composition.spec.md` — § Rendered Content → **Attention map** (the column set including `rationale`, and the three-key rank order), Invariant 3, Invariant 4, Invariant 7, § Test Obligations **T1, T2, T3**.
- Charter: `charter.md` — capability **Attention map from routing scores**; Domain Model → `Attention Entry`; Consumed APIs → the note that the sidecar is keyed to the **plan** stem, not the spec stem (ADR-0012).
- Source files: `lib/plan-routing-sidecar.mjs` — read `readRoutingSidecar` (line 283), `sidecarPathFor` (line 91), and `parseSidecarJson` (line 200) to learn the real error codes and return shape. **Read them to know what to call, then assert against a live call — the docblock is the thing three revisions transcribed wrongly.**
- ADR: `.context-index/adrs/` — ADR-0012 (permitted peers; plan-stem keying), decision + rationale only.

### Task 5 Context
- Spec: `pr-body-composition.spec.md` — § Rendered Content → **Verification** (one row per referenced spec, no merged verdict, explicit staleness naming both revisions), § Test Obligations **T6, T7**, Invariant 7, and every negative acceptance criterion (no routing parser, no `.validate.md`, no HTTP client).
- Charter: `charter.md` — capability **Verification summary**; Domain Model → `Verification Summary` (`verdict`, `gates[]`, `check_results[]`).
- Source files: `lib/lifecycle-state.mjs` — `currentState` (line 1401), `ensureByRevision` (line 1327), and the `validator_report` case (line 1460). The per-revision bucket is `{ revision, verdict, blockers[], reports[], completed_at }`; **T6 must pin the field path by calling `currentState()`, not by copying that shape from this plan.**
- Test file: `tests/pr-review-packet.test.mjs` — import the exported `PACKET_HEADINGS` constant for T7.
- Sibling spec: `review-packet-template.spec.md` AC-6, and `review-packet-template.plan.md` Task 3 — which pins the interlock as *no output line begins with `## ` + a packet heading*, explicitly permitting an inline backtick-quoted `` `## What` `` in prose. Task 5 satisfies the generated side of that interlock.

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

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5

There is one group and it is fully serial. Every task writes `lib/cli/pr.mjs` and `tests/pr-body.test.mjs`, so nothing here is parallelizable and claiming otherwise would hand `/adev:implement --parallel` a set of guaranteed conflicts. Task 2 additionally gates Tasks 3–5 semantically: the encoder must exist before any task interpolates a value into the brief, or Invariant 5 gets retrofitted onto renderers that already shipped without it.

**Cross-plan sequencing.** `pr-body-advisories.plan.md` begins after Task 1 of this plan lands, since it needs the slot registry and the assembly contract to exist. Its tasks replace the slot-1 and slot-3 stubs in place and are independent of this plan's Tasks 3–5, which touch slots 2, 4, and 5 only. In practice run this plan to completion first: both plans write `lib/cli/pr.mjs`, so interleaving them buys nothing and costs merge conflicts.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Walking skeleton: verb, git range, five-slot assembly | large | unit | — | 2 create, 1 modify |
| 2 | Safety substrate: encoder, containment, input bounds | medium | unit | Task 1 | 0 create, 2 modify |
| 3 | Trailers, task universe, traceability (slot 4) | medium | unit | Task 2 | 0 create, 2 modify |
| 4 | Routing consumption, ranking, attention map (slot 2) | medium | unit | Task 2, Task 3 | 0 create, 2 modify |
| 5 | Verification (slot 5), determinism and interlock sweep | medium | unit | Task 4 | 0 create, 2 modify |

All five tasks resolve to the `unit` strategy (source: fallback — the spec declares no `test_strategy` and `manifest.yaml` declares no `test_strategies` globs), so no Strategy Summary section is emitted. The spec declares no `infra_requirements:` and no task is non-unit, so no Test Infrastructure Requirements section is emitted either: every test in this plan builds a throwaway git repo in a temp dir and reads files from it.

`manifest.yaml` declares `specialists: []`, so every task is tagged `[specialist: none]`.

**§ Test Obligations coverage map** — all eight rows, each landed in a named task:

| Obligation | Task |
|---|---|
| T4 (encoder character set and transformation order) | Task 2 |
| T5 (no out-of-root path reaches a filesystem call) | Task 2 |
| T8 (the numeric input bounds, and degradation on exceeding each) | Task 2 |
| T1 (every failure mode the routing sidecar can raise) | Task 4 |
| T2 (the accessor's actual return shape, from a real call) | Task 4 |
| T3 (the accessor's actual entry ordering, plus this brief's tie-break) | Task 4 |
| T6 (projection field path for a validate verdict at a revision) | Task 5 |
| T7 (no output line begins with a review-packet H2) | Task 5 |

---

### Task 1: Walking skeleton — verb, git range, five-slot assembly [specialist: none]

**Charter capability:** Markdown generation to stdout; Authorship boundary (the marker).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/pr.mjs`
- Create: `tests/pr-body.test.mjs`
- Modify: `cli/index.mjs:1728` (one line in `VERB_REGISTRY`)

**Tests:** `tests/pr-body.test.mjs`

**Context to load:** see § Context Packets → Task 1 Context.

**Acceptance criteria covered:** Invariants 1, 2, 8, 9; all three § Error Cases rows; § Postconditions; the empty-range behavior.

**The five-slot registry is the deliverable, not the three sections.** Assembly declares all five slots in the spec's fixed order and requests each in turn:

| # | Section | Owner | Task 1 state |
|---|---------|-------|--------------|
| 1 | Size advisory | `pr-body-advisories` | **stub** — gap line |
| 2 | Attention map | this spec | stub → Task 4 |
| 3 | Reading order | `pr-body-advisories` | **stub** — gap line |
| 4 | Traceability | this spec | stub → Task 3 |
| 5 | Verification | this spec | stub → Task 5 |

Slots 1 and 3 are stubs **this plan never fills**. `pr-body-advisories.plan.md` swaps their renderer functions in place. Give every slot the same renderer signature so that swap is a one-line registry change and assembly is never reopened: a renderer takes the resolved context and returns `{ body, bytes }` — body text with **no marker of its own**, plus its own contributed size. Assembly emits the opening marker, concatenates the five bodies, and emits the closing marker.

**Assembly owns the total-size ceiling** (§ Section ownership, and `pr-body-advisories.spec.md` § Resource Bounds defers to it). It is the only component that sees every slot; no renderer can observe another's contribution. Renderers *report* `bytes`; assembly sums them, enforces the ceiling, and renders the overflow as a named degradation naming which section was truncated. Do not put a total-size check inside any renderer, in this task or a later one.

A stub renderer is a real renderer returning its gap line, not a `TODO` and not an empty string. Invariant 2 makes the gap line the correct output for "no data", so a stub is indistinguishable from a populated slot with nothing to report — which is exactly right, and is why the skeleton is shippable rather than provisional.

- [ ] **Write failing test**

Create `tests/pr-body.test.mjs`. Invoke the verb in-process via `run({ projectRoot, argv, manifest })`, capturing stdout.

**Two fixture shapes are required, not one.** Build both as temp-dir helpers:

- **`seededRepo()`** — `mkdtempSync` + `git init` + commits carrying `Spec:` / `Plan-task:` trailers, **plus a populated `.context-index/`** (a spec file, a `.plan.md`, a `.routing.json`, a lifecycle JSONL). Without the seeded `.context-index/`, the Invariant 8 read-only snapshot compares an empty directory against an empty directory and passes vacuously — the invariant would never actually be asserted.
- **`bareRepo()`** — `git init` and commits, with **no `.context-index/` and no `manifest.yaml`**. § Preconditions makes both optional and requires their absence to yield a brief of gap lines at exit 0. This is a distinct case from an empty range: a range can be empty in a fully populated repo.

```javascript
// Invariant 1 — exactly one marker pair, in order.
test("emits exactly one marker pair", ...);          // count both literals === 1, open before close
// Invariant 2 + empty range — all five slots render.
test("empty range renders all five slots with gap lines", ...);  // assert 5 section headings present
test("slots appear in the spec's fixed order", ...);             // indexOf ordering across all five
// § Preconditions — .context-index/ and manifest.yaml are optional.
test("bareRepo(): absent .context-index and manifest yield all gap lines, exit 0", ...);
// Invariant 9 — stdout carries the brief and nothing else.
test("diagnostics go to stderr, not stdout", ...);
// Invariant 8 — read-only. MUST run against seededRepo(), or it asserts nothing.
test("seededRepo(): creates, modifies, and deletes no file under .context-index", ...);  // snapshot tree before/after
// Error cases — the only three non-zero exits. run() RETURNS the code (see Implement).
test("NOT_A_GIT_REPO names the working directory, emits no partial brief", ...);
test("INVALID_BASE_REF names the unresolvable ref", ...);
test("NO_MERGE_BASE suggests an explicit --base", ...);
// Slot registry shape — the contract pr-body-advisories depends on.
test("every slot renderer returns { body, bytes } and emits no marker", ...);
// Assembly owns the ceiling, not the renderers.
test("a renderer over-contributing is truncated by assembly, naming the section", ...);
```

The over-contribution case needs a renderer stub that returns an oversized body; expose the registry so a test can substitute one. That seam is what makes the ceiling testable at all, and `pr-body-advisories` Task 3 reuses it.

- [ ] **Verify test fails**

Run: `node --test tests/pr-body.test.mjs`
Expected: FAIL — `Cannot find module '../lib/cli/pr.mjs'` on every case.

- [ ] **Implement**

Create `lib/cli/pr.mjs` following `lib/cli/route.mjs` for module shape: `export async function run({ projectRoot, argv, manifest })`, `export function help()`, `parseArgs` from `node:util`. Sub-verb `body`; flags `--base` and `--head`.

**Diverge from `route.mjs` on one point: `run()` RETURNS its exit code, it never calls `process.exit`.** `route.mjs` exits inline, and an implementer copying that kills the test process on the first `NOT_A_GIT_REPO` case — making all three error-case tests above unwritable. The dispatcher already supports the return form: `cli/index.mjs:1804-1808` does `const ret = await mod.run(...)`, then `if (typeof ret === "number" && Number.isInteger(ret)) returnCode = ret;`, then `process.exit(returnCode)`. So return `0` on success and a non-zero integer for the three error cases (diagnostic to stderr, no partial brief), and the exit codes stay assertable in-process.

Range resolution: `--head` defaults to `HEAD`; `--base` omitted defaults to the merge base with the default branch. Both must resolve via `git rev-parse` — determinism is specified over the *resolved* pair, so resolve once up front and pass the resolved pair everywhere. The three error cases are the only paths that return non-zero; every other failure is Invariant 4 and returns 0.

**Name the resolved-context shape explicitly** and pass it to every renderer, so both slot owners draw from one documented structure and `pr-body-advisories` extends it rather than reshaping it. At minimum it carries: resolved `base` and `head`, the commit list over the range, and changed paths with per-path additions/deletions. The advisories spec's size computation and its base-side configuration read both depend on `base` being resolved here — that resolution is the one input it cannot derive for itself.

Shell out with `execFileSync` and an argument array, never a shell string — trailer values and refs reach git as arguments, never as shell input (Invariant 5's shell clause).

Then register the verb — append to `VERB_REGISTRY` in `cli/index.mjs` beside the existing entries:

```
["pr",              () => import("../lib/cli/pr.mjs")],
```

- [ ] **Verify test passes**

Run: `node --test tests/pr-body.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.
Then run it for real against this repo: `adev pr body --base main` prints a five-slot brief of gap lines, exit 0. **The verb works end to end at the end of Task 1.** If it does not, stop — the remaining tasks assume a runnable verb.

- [ ] **Commit**

Branch (if not already created): `feat/pr-review-brief/pr-body`

```bash
git add lib/cli/pr.mjs tests/pr-body.test.mjs cli/index.mjs
git commit -m "feat(pr-review-brief): add adev pr body walking skeleton

Spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
Plan-task: 1"
```

---

### Task 2: Safety substrate — encoder, containment, input bounds [specialist: none]

**Depends on:** Task 1
**Charter capability:** Markdown generation to stdout (the integrity of what is generated).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/pr.mjs`
- Modify: `tests/pr-body.test.mjs`

**Tests:** `tests/pr-body.test.mjs`

**Context to load:** see § Context Packets → Task 2 Context.

**Acceptance criteria covered:** Invariant 5 (all six prohibited outcomes), Invariant 6, the input-side gate of Invariant 4; § Test Obligations **T4**, **T5**, **T8**.

**This lands before any section interpolates a value.** Tasks 3–5 all render attacker-influenceable strings — `rationale` most of all, which § Rendered Content calls out as subject to Invariant 5 without exception. Building the encoder after those renderers means retrofitting it onto shipped code and hoping every call site got it.

**Three separate concerns, three separate functions.** The spec is explicit: the encoder transforms values, containment gates a filesystem call, diagnostics are a third thing. Do not fuse them.

1. **Encoder** — one function at the interpolation boundary. Every rendered value passes through it. It must make it impossible for a value to break table structure, introduce a line break, form a markdown link or image, form an HTML comment delimiter, or be interpreted by a shell.
2. **Containment guard** — no filesystem call with a trailer-derived path until that path is confirmed inside `.context-index/specs/`. Resolve **both** candidate and root through the filesystem's own link resolution (`realpathSync`), not string normalization, so a committed symlink pointing outside the root is caught. Re-assert at open time, not only before it. This governs trailer-derived paths only — paths `currentState()` resolves internally under `.context-index/lifecycle-state/` are that module's concern.
3. **Input bounds** — refuse a file unless it is a regular file (`statSync().isFile()`) within a size ceiling. Refusal is itself an Invariant 4 degradation, not a throw. This gate is what makes Invariant 4's universal achievable: "any failure degrades" is unsatisfiable against an unbounded read.

- [ ] **Write failing test**

Append to `tests/pr-body.test.mjs`:

```javascript
// --- T4: the encoder's exact character set and transformation order ---
// One case per prohibited outcome named in the spec's acceptance criteria.
// Assert the ORDER too: a value that becomes dangerous only after another
// rule runs is the drift this obligation exists to catch.
test("T4: pipe cannot break table structure", ...);
test("T4: newline and CR cannot inject a line break", ...);
test("T4: bracket-paren cannot form a markdown link", ...);
test("T4: bang-bracket cannot form an image", ...);
test("T4: '<!--' and '-->' cannot form an HTML comment delimiter", ...);
test("T4: shell metacharacters are never interpreted", ...);
test("T4: transformation order is stable under composed inputs", ...);
// Marker forgery — a rationale containing the closing literal must not
// produce a second marker. Invariant 1 holds whatever any input contains.
test("a rationale containing '<!-- /adev:pr-brief -->' still yields one marker pair", ...);

// --- T5: containment, asserted by INSTRUMENTING THE CALL, not by output ---
// Output inspection cannot prove a call did not happen.
test("T5: a trailer-derived path outside .context-index/specs/ never reaches a filesystem call", ...);
test("T5: a COMMITTED SYMLINK pointing outside the root is refused", ...);   // required case
test("T5: containment is re-asserted at open time", ...);
test("T5: a refused path degrades to UNKNOWN with a named cause, exit 0", ...);

// --- T8: the numeric input bounds, and that exceeding each degrades ---
// The VALUES are tuning and belong here, not in prose; the requirement that
// a bound EXISTS is the spec's.
test("T8: file size ceiling — exceeding it degrades, does not throw", ...);
test("T8: non-regular file (fifo/device) is refused before reading", ...);
```

Instrument the filesystem call by injecting the `fs` functions the module uses (or by monkey-patching a module-local indirection exposed for the test) and recording every path passed. Assert the out-of-root path appears in **no** recorded call. Create the symlink case as a real symlink inside the temp repo.

- [ ] **Verify test fails**

Run: `node --test tests/pr-body.test.mjs`
Expected: FAIL — the encoder and containment guard are not exported; the bounds do not exist.

- [ ] **Implement**

Add the three functions to `lib/cli/pr.mjs` and route every value and every trailer-derived path through them. Keep the encoder a pure string→string function with no filesystem or stderr knowledge; keep the guard a predicate that gates a call and returns a degradation reason rather than throwing.

Export all three so the tests can instrument them directly rather than inferring behavior from rendered output.

- [ ] **Verify test passes**

Run: `node --test tests/pr-body.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.

- [ ] **Commit**

```bash
git add lib/cli/pr.mjs tests/pr-body.test.mjs
git commit -m "feat(pr-review-brief): add output encoder, path containment, and input bounds

Spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
Plan-task: 2"
```

---

### Task 3: Trailers, task universe, traceability (slot 4) [specialist: none]

**Depends on:** Task 2
**Charter capability:** Provenance rollup by spec.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/pr.mjs`
- Modify: `tests/pr-body.test.mjs`

**Tests:** `tests/pr-body.test.mjs`

**Context to load:** see § Context Packets → Task 3 Context.

**Acceptance criteria covered:** the partition invariant ("every commit in exactly one row or the untraced bucket"); both `Spec:`-trailer behaviors; the traceability column set.

**The task universe comes from trailers, not the routing sidecar.** A task is the pair `(spec_path, task_id)` drawn from `Plan-task:` and `Spec:` **on the same commit**; its file set is the union of paths those commits touch. The sidecar carries no file list, so the universe cannot be derived from it — and it is the set difference between this universe and the sidecar's entries that makes `UNKNOWN` computable in Task 4 at all. Build the universe here; Task 4 consumes it.

Read trailers with `git log` and file sets with `git diff-tree`, both via `execFileSync` with argument arrays. Trailer values are consumed as data and must never reach a shell. Every `Spec:` value is a trailer-derived path and therefore passes the Task 2 containment guard before any filesystem access.

**The partition invariant is this spec's to enforce.** A rendering that drops a commit is indistinguishable from one that never saw it, so the test asserts arithmetic, not appearance: the per-row commit counts plus the untraced bucket must sum to the range's commit count.

- [ ] **Write failing test**

Append to `tests/pr-body.test.mjs`:

```javascript
test("one traceability row per Spec: trailer, aggregating count, task coverage, diff stat", ...);
test("commits with no Spec: trailer collect into a labelled untraced bucket", ...);
test("the section is annotated as a gap when the untraced bucket is non-empty", ...);
// The partition invariant — asserted as arithmetic over the whole range.
test("row commit counts plus the untraced bucket sum to the range commit count", ...);
test("a commit carrying two Spec: trailers still appears exactly once in total", ...);
// The universe is trailer-derived, not sidecar-derived.
test("task universe pairs (spec_path, task_id) from the SAME commit", ...);
test("a task's file set is the union of paths its commits touch", ...);
// Values reach the output encoded (Task 2's encoder is used, not bypassed).
test("a spec path containing a pipe cannot break the traceability table", ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/pr-body.test.mjs`
Expected: FAIL — slot 4 still renders its stub gap line.

- [ ] **Implement**

Add the trailer reader, the task-universe builder, and the slot-4 renderer to `lib/cli/pr.mjs`. Replace the slot-4 stub in the registry; do not change the registry's shape or assembly. The renderer returns `{ body, bytes }` and emits no marker.

- [ ] **Verify test passes**

Run: `node --test tests/pr-body.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.
Then: `adev pr body --base main` against this repo shows real traceability rows.

- [ ] **Commit**

```bash
git add lib/cli/pr.mjs tests/pr-body.test.mjs
git commit -m "feat(pr-review-brief): add trailer reader, task universe, and traceability section

Spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
Plan-task: 3"
```

---

### Task 4: Routing consumption, ranking, attention map (slot 2) [specialist: none]

**Depends on:** Task 2 (encoder), Task 3 (task universe)
**Charter capability:** Attention map from routing scores.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/pr.mjs`
- Modify: `tests/pr-body.test.mjs`

**Tests:** `tests/pr-body.test.mjs`

**Context to load:** see § Context Packets → Task 4 Context.

**Acceptance criteria covered:** Invariant 3, Invariant 4 (the consumption side), the attention-map column set including `rationale`, the full four-tier rank order; § Test Obligations **T1**, **T2**, **T3**.

**Call `readRoutingSidecar(planPath)`. Write no parser.** An acceptance criterion asserts this module contains no `routing.json` traversal of its own, and the test for it is in Task 5's sweep. The sidecar is keyed to the **plan** stem, not the spec stem (ADR-0012): derive the plan path from the `Spec:` trailer explicitly. The two stems coinciding in this repo today is not something the implementation may rely on.

**T1/T2/T3 must assert against live calls, never against the docblock.** This is the specific failure the spec's § Test Obligations exists to prevent — three consecutive revisions transcribed this module's error set, return shape, and comparator into prose and were refuted each time. `readRoutingSidecar`'s docblock currently claims entries come back "sorted by task_id ascending"; that claim is precisely the one that was refuted. Call the function, observe what it does, and pin *that*.

**Rank order, primary key first** — this spec's own decision, stated concretely because no test can pin a requirement the spec never made:

1. `selected_agent`: **`UNKNOWN` → `human-only` → `assisted-agent` → `auto-agent`**. `UNKNOWN` leads because absence of data is never absence of risk.
2. Descending blast radius.
3. A tie-break that makes the order **total** — down to a key that cannot tie.

Columns: task id, spec, route, blast radius, and **rationale**. Rationale is a charter In-Scope promise and the only reviewer-facing explanation of why a task was routed as it was; it is also the only attacker-influenceable value the section renders, so it passes the Task 2 encoder without exception.

- [ ] **Write failing test**

Append to `tests/pr-body.test.mjs`:

```javascript
// --- T1: EVERY failure mode lib/plan-routing-sidecar.mjs can raise ---
// Including raw filesystem errors it does NOT wrap. Enumerate by provoking
// the real module, not by reading its source comments.
test("T1: ROUTING_SIDECAR_MISSING degrades to UNKNOWN, names the cause, exit 0", ...);
test("T1: INVALID_SIDECAR_JSON (malformed, wrong version, entries not an array) degrades", ...);
test("T1: an UNWRAPPED filesystem error (EACCES / EISDIR) degrades — Invariant 4 is universal", ...);

// --- T2: the accessor's ACTUAL return shape, from a real call ---
test("T2: readRoutingSidecar's return shape is asserted against a live call, not its docblock", ...);

// --- T3: the accessor's ACTUAL ordering, plus the brief's total tie-break ---
test("T3: entry ordering is observed from a live call, not assumed ascending", ...);
test("T3: the brief's ordering is total — equal agent AND equal blast radius still order deterministically", ...);

// --- Invariant 3 + the full four-tier rank ---
test("a task with no routing entry renders UNKNOWN", ...);
test("a task whose selected_agent is outside the known tiers renders UNKNOWN", ...);
test("UNKNOWN sorts above every task known to be low-risk", ...);
test("full ordering across all four tiers: UNKNOWN, human-only, assisted-agent, auto-agent", ...);
test("within a tier, blast radius descends", ...);

// --- Columns, including rationale, encoded ---
test("the attention map renders task id, spec, route, blast radius, and rationale", ...);
test("a rationale value reaches the output, encoded", ...);
// The sidecar is keyed to the PLAN stem (ADR-0012).
test("the sidecar path derives from the plan stem, not the spec stem", ...);
```

- [ ] **Verify test fails**

Run: `node --test tests/pr-body.test.mjs`
Expected: FAIL — slot 2 still renders its stub gap line.

- [ ] **Implement**

Add the routing reader, the ranking comparator, and the slot-2 renderer to `lib/cli/pr.mjs`; replace the slot-2 stub. Wrap every call to the accessor so that *any* thrown error — wrapped or not, anticipated or not — becomes an `UNKNOWN` row with a named cause and an unchanged exit code. Catch broadly and deliberately: the spec states Invariant 4 universally precisely because three attempts to enumerate the failure set were wrong.

- [ ] **Verify test passes**

Run: `node --test tests/pr-body.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.

- [ ] **Commit**

```bash
git add lib/cli/pr.mjs tests/pr-body.test.mjs
git commit -m "feat(pr-review-brief): add routing consumption, ranking, and attention map

Spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
Plan-task: 4"
```

---

### Task 5: Verification (slot 5), determinism and interlock sweep [specialist: none]

**Depends on:** Task 4
**Charter capability:** Verification summary.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/pr.mjs`
- Modify: `tests/pr-body.test.mjs`

**Tests:** `tests/pr-body.test.mjs`

**Context to load:** see § Context Packets → Task 5 Context.

**Acceptance criteria covered:** the verification column set and per-spec row rule; the no-fallback-across-revisions rule; Invariant 7; every negative acceptance criterion; § Test Obligations **T6**, **T7**.

**Read the projection, never the report.** `currentState(projectRoot, specPath)` is the only source. `skills/validate/SKILL.md` explicitly forbids re-parsing `.validate.md`, and ADR-0012 makes `.md` a human-primary narrative while machine-primary state is read through an accessor.

**One row per referenced spec. Never a merged verdict.** Any merge rule for PASS+FAIL discards exactly what a reviewer needs. Each row carries the verdict, the per-validator outcomes, and the blocker count when non-zero.

**No fallback across revisions.** The verdict consumed is the one recorded against the referenced spec's *current* revision (read from the spec file's YAML frontmatter). When none exists at that revision, the row says so and **names both revisions**. It never renders a verdict recorded at an earlier revision — that is a verdict about different text.

- [ ] **Write failing test**

Append to `tests/pr-body.test.mjs`:

```javascript
// --- T6: the projection field path carrying a validate verdict at a revision ---
// Discover it by CALLING currentState() against a seeded lifecycle log.
// Projection shape belongs to lib/lifecycle-state.mjs, not to this module.
test("T6: the verdict field path is pinned against a live currentState() call", ...);
test("T6: behaviour when no verdict exists at the spec's current revision", ...);

// --- Rendering rules ---
test("a two-spec range produces two verification rows, no merged verdict", ...);
test("rows render per-validator outcomes and the blocker count when non-zero", ...);
test("a verdict at an earlier revision renders as STALE, naming both revisions", ...);
test("a spec with no verdict at its current revision never renders one from another revision", ...);

// --- T7: the review-packet interlock ---
// Import the constant; do not restate the four heading strings.
import { PACKET_HEADINGS } from "./pr-review-packet.test.mjs";
test("T7: no output line BEGINS with '## ' + a packet heading", ...);
// Heading-line semantics only: an inline backtick-quoted `## What` in advisory
// prose is designed behaviour (pr-body-advisories) and must NOT be flagged.
// Cover every output path: nominal, empty range, and each degraded path.

// --- Invariant 7: determinism ---
test("two runs on an unchanged resolved (base, head) pair are byte-identical", ...);
test("a case where the primary sort keys tie still orders deterministically", ...);

// --- Negative criteria: the module does not reimplement what it consumes ---
test("the module contains no routing.json traversal of its own", ...);   // source scan
test("no .validate.md file is ever opened", ...);                        // instrument the fs call
test("no HTTP client is imported and no gh/glab is executed on any path", ...);
test("package.json is unchanged — no dependency added", ...);
```

`PACKET_HEADINGS` is already exported from `tests/pr-review-packet.test.mjs:14`. Importing it keeps one contractual list in one place; restating the strings creates the second copy that goes stale.

- [ ] **Verify test fails**

Run: `node --test tests/pr-body.test.mjs`
Expected: FAIL — slot 5 still renders its stub gap line; the sweep tests fail or pass vacuously.

- [ ] **Implement**

Add the verification reader and the slot-5 renderer to `lib/cli/pr.mjs`; replace the slot-5 stub. Read the referenced spec's current revision from its YAML frontmatter (via the Task 2 containment guard and bounds), then select the projection bucket for that revision.

If any sweep test fails, the fix is in `lib/cli/pr.mjs` — never in the test and never in `.github/pull_request_template.md`, whose four headings are contractual.

- [ ] **Verify test passes**

Run: `node --test tests/pr-body.test.mjs` — expected PASS.
Then: `npm test` — expected PASS.
Then: `adev pr body --base main` prints a complete brief — slots 2, 4, 5 populated, slots 1 and 3 still on their stub gap lines awaiting `pr-body-advisories`. That is the correct, shippable state at the end of this plan.

- [ ] **Commit**

```bash
git add lib/cli/pr.mjs tests/pr-body.test.mjs
git commit -m "feat(pr-review-brief): add verification section and determinism sweep

Spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gates are taken from `.context-index/governance/gates.yaml`, which supersedes the constitution's generic list:

- **`test` — Test Suite** (deterministic, tier `fast`, severity `error`, triggers `post-task` / `post-implement`): `npm test`

No lint or typecheck gate is active in this repo — both are commented out in `gates.yaml` with empty commands, so neither runs.

Additional non-gate checks that apply to this change set:

- `package.json` and `.claude-plugin/plugin.json` must stay in version parity if either is bumped. No dependency is added by this plan.
- No `skills/**/SKILL.md` is edited, so `.githooks/pre-commit-no-inline-node` and `tests/sync/provider-skill-parity.test.mjs` are not engaged. Skill prose naming `adev pr body` is deferred to a later documentation pass, not planned here.
- Commits carry the `Spec:` and `Plan-task:` trailers required by the constitution's Commit Trailers section.

**Acceptance-criteria coverage:** Invariants 1/2/8/9 and all three error cases by Task 1; Invariants 5 and 6 and the Invariant 4 input gate by Task 2; the traceability partition by Task 3; Invariants 3 and 4 and the rank order by Task 4; Invariant 7, the verification rules, and the negative criteria by Task 5. § Test Obligations T1–T8 are mapped in the § Task Summary coverage table — all eight are assigned. The two remaining criteria (`npm test` passes, no constitutional violations) are verified by `/adev:validate`, not by a task.

**Not covered here, by design:** slots 1 and 3 render stub gap lines at the end of this plan. They are filled by `pr-body-advisories.plan.md`. A validation pass that finds those sections unpopulated should read this note, not file a coverage gap.

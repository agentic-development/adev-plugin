# Implementation Plan: Skill Output Rules Wiring

> **Methodology:** adev
> **Charter:** .context-index/specs/features/output-personas/charter.md
> **Spec:** .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-21) — 0 blockers, 8 warnings, 3 suggestions, spec revision 16
> **Platform:** Node.js (ESM, `.mjs`), npm, `node:test`

**Goal:** Give nineteen named chat sections across `skills/{status,route,sample,learn}/SKILL.md` a declared `**Terse form:**` rendering, guarded by a fence-aware test written first, so the already-resolved verbosity axis finally has something to select.

**Architecture:** This is a markdown migration plus one test file. No `lib/`, `hooks/`, or `templates/` change — which is what keeps every sibling spec's `templates/` source manifest accurate and keeps the Rejected ADR-0011 (restamping authority) disengaged. All five live behaviors bind at the SKILL.md layer, where a section declares *what it offers*; the session overlay (`skills/using-adev/SKILL.md:137`) still decides how much of that offer to show. No task in this plan authors a rule of the form "X renders even when the overlay would trim it" — that shape is what withdrew BEH-12 (rev 10) and BEH-14 (rev 16) and it belongs in `issue-uvarlt` at the overlay layer, not here. Task 1 is written before any wiring so the guard is observed failing; tasks 3-6 turn it green file by file.

---

## Review Notes Folded In

The review returned PASS_WITH_NOTES and asked three warnings to be resolved during planning. Each is answered here so no task has to re-litigate it.

### SA-1 — sibling source manifests: advisory sha drift, not a violation

The spec's *conclusion* holds (no restamping is required) but its stated reason is wrong. It claims no sibling spec's `source-manifest.files[]` is disturbed because `templates/` is untouched. In fact the four SKILL.md files this plan edits are themselves listed in the `source-manifest.files[]` of other specs. A scan of `.context-index/specs/**/*.spec.md` frontmatter on 2026-08-21 found **15 specs** carrying at least one of the four paths (the reviewer's figure of seven was an undercount):

| Spec | Lists |
|---|---|
| `cross-cutting/universal-skill-extensions.spec.md` | status, route, sample, learn |
| `cross-cutting/graduated-rigor-tiers.spec.md` | route |
| `cross-cutting/single-front-door.spec.md` | route |
| `cross-cutting/review-block-auto-retry.spec.md` | status |
| `cross-cutting/spec-amendment-artifacts.spec.md` | status |
| `features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md` | status |
| `features/multi-repo-workspace/workspace-status.spec.md` | status |
| `features/spec-lifecycle/plan-test-mapping.spec.md` | status |
| `features/spec-lifecycle/status-query-skill.spec.md` | status |
| `features/spec-lifecycle/tracker-reference-field.spec.md` | status |
| `features/strategic-planning/adev-status-milestone-ext.spec.md` | status |
| `features/task-management/adev-issues-skill.spec.md` | status |
| `features/test-strategies/test-depth-policy.spec.md` | status |
| `features/test-strategies/test-helper-inventory.spec.md` | sample |
| `features/work/work-triage-and-routing.spec.md` | status, route |

**Consequence, and the rule for every task below:** editing the four SKILL.md files makes those fifteen manifests' recorded `sha` values advisory-stale. That is **expected drift, not a defect and not this plan's to repair.** ADR-0011, which would have granted restamping authority, is **Rejected**. No task in this plan may open, restamp, or otherwise touch another spec's frontmatter. If `/adev:hygiene` or `/adev:validate` later reports drift on any of the fifteen, the correct response is to recognise it as this increment's known and accepted side effect — recorded here so it is not mistaken for a violation.

### SA-3 — the section extent rule (fixed here, binding on tasks 1 and 3-6)

Both `MISSING_TERSE_FORM` and `MARKER_OUT_OF_SCOPE` need to know where a governed section ends. The spec left it undefined. This plan fixes it:

> **Section extent.** A section begins on its heading line and runs to the line immediately before the next heading of **equal or shallower depth** (depth = leading `#` count), or to end-of-file if none follows. Heading detection is **fence-aware**: a line matching `^#{1,6}\s` that falls inside a ` ``` ` or `~~~` fenced block, or inside the leading YAML frontmatter, is not a heading. Sections are keyed by **(file, start line)** and never by heading text.

Three consequences the tasks depend on:

1. `status`'s two headings with identical text — `` ### Mode: `--milestone <name>` `` at **L126** and **L378** — are two distinct sections, each needing its own marker. Keying by text would conflate them.
2. A governed section's extent may contain deeper non-governed subsections. `` ### Mode: `--all` (default) `` (L162) runs to L248 and swallows `#### Charters by Status` … `#### Recent Sessions`. Those deeper headings belong to their parent for marker attribution — a marker anywhere in L162-L248 satisfies `--all`.
3. **No two governed sections nest** anywhere in this scope (verified 2026-08-21 across all four files), so attribution is unambiguous and needs no innermost-wins tie-break.

> **Terse-form block extent.** The `**Terse form:**` marker MUST be the **last block of its governed section**. Its block therefore runs from the marker line to the end of the enclosing section's extent. This makes the block boundary decidable without a second grammar and is what lets task 1 count tables inside a terse form (BEH-3) and scan it for absolute paths (BEH-2).

The scan is the test's own definition — task 1 encodes it, task 2 documents it in prose that must match.

### SA-4 — `skills/status/SKILL.md:12` "omit file paths" vs BEH-3

Today L12 reads:

> **Persona adaptation:** All output formats below are defaults for the Developer persona. If a different persona is active, adapt the chat output to its output rules (e.g., Product persona: show counts and status summaries only, **omit file paths and technical detail**).

A product-persona user resolves to `terse` by default (`lib/persona.mjs:12`), and BEH-3's no-artifact branch requires `status` (read-only, writes nothing) to substitute further tables with a count plus **the narrower invocation of the same skill** — `--spec <path>`, `--charter <name>`, `--issue <id>`, `--epic <id>`, `--file <path>`. An agent reading "omit file paths" at the exact default combination can delete the very thing BEH-3 requires, making the behavior unsatisfiable where it matters most.

**Resolution (task 2):** the replacement footnote **deletes the persona-specific parenthetical outright** rather than trying to reconcile it. Three reasons it is the right removal, not a loss:

- The clause is a *persona* instruction living in a *skill* file. `templates/personas/product.md` already owns what the product persona omits; duplicating a paraphrase of it in `status` is how the two drifted apart.
- BEH-7 rewrites all four footnotes anyway — they must name `templates/verbosity/terse.md`, `normal.md` and `deep.md` by literal filename and state a decidable rule, which none does today.
- With the clause gone, the narrowing invocation is simply **part of the terse form's declared content** — something the section *offers*. The footnote makes **no claim about what survives the overlay**. Writing "the narrowing invocation must not be trimmed" would be the exact BEH-12/BEH-14 layer defect this spec withdrew twice; task 2 must not write it.

### Decision-gate sections — voluntary in-layer constraint (adopted)

Three governed sections are decision gates whose body is the evidence the user needs for a question the same section then asks: `sample` `#### Present Results` ("Select files to extract…"), `sample` `## --refresh Mode` ("Proceed with recommended actions? (y/n)"), and `learn` `## Step 4: Present for Confirmation` ("Save this? (yes / edit / cancel)"). Durable protection for them lives in `issue-uvarlt` at the overlay layer and is out of scope here.

This plan **adopts the reviewer's narrower in-layer recommendation voluntarily**, as an **authoring constraint on tasks 5 and 6** rather than as a sentence written into any SKILL.md:

> When authoring a terse form for a section whose next step asks the user to act, the terse form's declared content must still carry the material that decision needs.

Stated this way it is layer-correct — it constrains *what the section offers*, which is the skill layer's business, and asserts nothing about what the overlay renders. Tasks 5 and 6 name the specific material per section. Task 8 records whether it held, since that is direct evidence for `issue-uvarlt`.

---

## File Structure

**Create:**
- `tests/skills/terse-form-markers.test.mjs` — fence-aware scanner + all marker assertions (task 1)

**Modify:**
- `skills/status/SKILL.md:12` — replace the persona footnote (task 2); `:40,:93,:126,:162,:249,:279,:302,:324,:378,:397` — append a terse form to each `### Mode:` section (task 3)
- `skills/route/SKILL.md:211` — replace the inline persona footnote (task 2); `:209,:262` — append terse forms (task 4)
- `skills/sample/SKILL.md:125` — replace the inline persona footnote (task 2); `:123,:169,:194,:217` — append terse forms (task 5)
- `skills/learn/SKILL.md:197` — replace the inline persona footnote (task 2); `:94,:179,:191` — append terse forms (task 6)
- `providers/codex/skills/{status,route,sample,learn}/SKILL.md` — regenerated, never hand-edited (task 7)
- `providers/opencode/skills/{status,route,sample,learn}/SKILL.md` — regenerated, never hand-edited (task 7)
- `.context-index/specs/features/output-personas/charter.md` — the "Skill output rules wiring" capability row + a lessons subsection (task 8)

**Reference (read, do not modify):**
- `templates/verbosity/terse.md`, `normal.md`, `deep.md` — the three overlay filenames the footnotes must name literally (BEH-7). **Read only. Editing any of these breaks the postcondition and disturbs sibling manifests.**
- `templates/personas/product.md` — already owns "what product omits"; confirms the SA-4 deletion loses nothing
- `lib/persona.mjs:12` — the product → `terse` default that makes SA-4 the *default* combination
- `skills/using-adev/SKILL.md:137` — the session-overlay precedence line that bounds what may be authored here
- `.context-index/adrs/0020-output-discipline-is-content-rules-not-length-budgets.md` — content rules, never length budgets (BEH-8)
- `tests/sync/provider-skill-parity.test.mjs` — the existing byte-parity guard; task 1 must not re-implement it
- `scripts/sync-provider-skills.mjs` — the only sanctioned way to produce the mirrors
- `tests/skills/skill-size-cap.test.mjs` — the 65,536-byte Copilot frontmatter cap

**Files that MUST NOT change** (postcondition; asserted by task 1's file-set check): anything under `lib/`, `hooks/`, `templates/`, `cli/`, and any other spec's `.spec.md` frontmatter.

### Headroom check (pre-verified, not a task)

The size cap is 65,536 bytes per SKILL.md. Current sizes: `status` 23,279 · `route` 17,848 · `sample` 11,944 · `learn` 8,285. Nineteen terse forms cannot plausibly consume the ~42 KB of remaining headroom on the largest file, so `tests/skills/skill-size-cap.test.mjs` is not at risk. Recorded because that cap was previously exhausted by gradual accumulation and each agent blamed something else.

---

## Context Packets

The spec has **no `source-manifest` in its frontmatter** (it is a new spec), so packets fall back to the charter, the governing ADR, and the layer-precedence sources rather than to manifest-guided file selection.

### Task 1 Context
- Spec: `skill-output-rules-wiring.spec.md` — "The governed sections" table, "Error Cases" table, acceptance criteria 1-8
- Plan: this file — **"SA-3 — the section extent rule"** is the normative input; the test encodes it
- Source files (full read): `skills/status/SKILL.md`, `skills/route/SKILL.md`, `skills/sample/SKILL.md`, `skills/learn/SKILL.md`
- Test helpers: `tests/helpers.mjs` (exports `PLUGIN_ROOT`; the test needs nothing else from it)
- Pattern reference (signatures only): `tests/sync/provider-skill-parity.test.mjs` — shows how mirror-related tests are framed and **what this test must not duplicate**
- Charter: `output-personas/charter.md` (capability: Skill output rules wiring)
- Boundary rules: `.context-index/governance/boundaries.yaml` — all rules are `severity: warning`; none matches a `node:test` file authored normally

### Task 2 Context
- Spec: `skill-output-rules-wiring.spec.md` — BEH-7 (footnote contract), BEH-1 (marker convention), "Layer precedence"
- Plan: this file — **SA-4 resolution** and the **terse-form block extent** rule are both normative
- Source files (full read): the four `SKILL.md` footnote lines `status:12`, `route:211`, `sample:125`, `learn:197`
- Reference (read only): `templates/verbosity/terse.md`, `normal.md`, `deep.md` — for their literal filenames, and to confirm the footnote's rule does not contradict them
- Reference: `templates/personas/product.md` — evidence the deleted "omit file paths" clause is already owned upstream
- ADR: `adrs/0020-…md` (decision + rationale only) — content rules, not length budgets

### Task 3 Context
- Spec: BEH-1, BEH-2, BEH-3 (**both branches, with the no-artifact branch applying throughout — `status` is read-only**), BEH-8
- Source file (full read): `skills/status/SKILL.md` — the 10 `### Mode:` sections at L40, L93, L126, L162, L249, L279, L302, L324, L378, L397
- Prior task output: task 2's canonical footnote and marker convention (hard predecessor)
- Reference: `skills/status/SKILL.md:14-24` — the argument list, the source of the narrowing invocations BEH-3 requires

### Task 4 Context
- Spec: BEH-1 (**composed views** — `## Dry-Run Mode` renders Step 5's table inside itself), BEH-2, BEH-3, BEH-8
- Source file (full read): `skills/route/SKILL.md` L209-L241 and L262-L273
- Prior task output: task 2

### Task 5 Context
- Spec: BEH-1 (**composed views** — `## --refresh Mode` runs `--score` logic first), BEH-2, BEH-3, BEH-8
- Plan: this file — **decision-gate authoring constraint** (applies to `#### Present Results` and `## --refresh Mode`)
- Source file (full read): `skills/sample/SKILL.md` L123-L140, L169-L183, L194-L216, L217-L240
- Prior task output: task 2

### Task 6 Context
- Spec: BEH-1, BEH-2, BEH-3, BEH-8
- Plan: this file — **decision-gate authoring constraint** (applies to `## Step 4: Present for Confirmation`)
- Source file (full read): `skills/learn/SKILL.md` L94-L115, L179-L190, L191-L209
- Prior task output: task 2

### Task 7 Context
- Spec: postcondition 3, `MIRROR_DRIFT` error case
- Script: `scripts/sync-provider-skills.mjs` (invocation only — do not read or modify the transform)
- Test: `tests/sync/provider-skill-parity.test.mjs` (the assertion that must pass)

### Task 8 Context
- Charter: `output-personas/charter.md` — the Capability Map row reading "Connect the verbosity axis to the 17 `SKILL.md` mandated-output sections…"
- Spec: "This is an increment, and says so"; "Out of Scope" (the widening spec's open questions)
- Plan: this file — the decision-gate constraint and the SA-4 resolution are two of the things the retrospective must report on
- Reference: the diffs produced by tasks 2-6

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

> **Relevance to this plan:** the third heuristic is the direct precedent for BEH-2 — a section that has written an artifact should name its repo-relative path rather than reproduce its content. Tasks 3-6 should read it as supporting evidence, not as a new obligation.

---

## Parallelization

- **Group A (sequential, blocks everything):** Task 1 → Task 2. Task 1 must be observed RED before task 2 lands; task 2 touches all four files and is a hard predecessor of 3-6.
- **Group B (independent):** Task 3 — `skills/status/SKILL.md` only
- **Group C (independent):** Task 4 — `skills/route/SKILL.md` only
- **Group D (independent):** Task 5 — `skills/sample/SKILL.md` only
- **Group E (independent):** Task 6 — `skills/learn/SKILL.md` only
- **Group F (sequential, after B-E):** Task 7 → Task 8

Groups B, C, D and E touch disjoint files and can run concurrently once Group A completes. They cannot start earlier: every one of them consumes task 2's canonical footnote text and marker grammar, and task 2 rewrites a line in each of their files.

Task 7 must follow all of B-E — regenerating mirrors before the last SKILL.md edit lands just reintroduces `MIRROR_DRIFT`.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Author the fence-aware marker test (RED first) | small | unit | — | 1 create, 0 modify |
| 2 | Canonical footnote + `**Terse form:**` convention | small | unit | Task 1 | 0 create, 4 modify |
| 3 | Wire `status` — 10 `### Mode:` sections | medium | unit | Task 2 | 0 create, 1 modify |
| 4 | Wire `route` — 2 sections | small | unit | Task 2 | 0 create, 1 modify |
| 5 | Wire `sample` — 4 sections | small | unit | Task 2 | 0 create, 1 modify |
| 6 | Wire `learn` — 3 sections | small | unit | Task 2 | 0 create, 1 modify |
| 7 | Regenerate provider mirrors | small | unit | Tasks 3, 4, 5, 6 | 0 create, 8 modify |
| 8 | Correct the charter row + record what the increment taught | small | unit | Task 7 | 0 create, 2 modify |

**Granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). All five live behaviors (BEH-1, BEH-2, BEH-3, BEH-7, BEH-8) are asserted by a single data-driven suite, `tests/skills/terse-form-markers.test.mjs`. Task 1 **creates** it; every later task **extends** it only where a file-specific case is genuinely needed — the scan is data-driven over all four files, so tasks 3-6 normally add no new case and simply turn existing cases green.

**Strategy:** every task resolves to `unit` (source: fallback — the spec declares no `test_strategy`, no `test_strategies` glob in `manifest.yaml` matches `skills/**/SKILL.md` or `tests/skills/**`). Per the skill's contract the Strategy Summary section is omitted. The spec declares no `infra_requirements:` and no task is non-unit, so no Test Infrastructure Requirements section is emitted either.

**Specialist routing:** `manifest.yaml` declares `specialists: []`, so every task is tagged `[specialist: none]`.

---

## Task Structure

### Task 1: Author the fence-aware marker test (RED first) [specialist: none]

**Charter capability:** Skill output rules wiring
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/skills/terse-form-markers.test.mjs`
- Test: `tests/skills/terse-form-markers.test.mjs`

**Tests:** `tests/skills/terse-form-markers.test.mjs` — **create** (first task producing this suite under `per-behavior` granularity).

**Context to load:**
- The **SA-3 section extent rule** above — normative, encode it exactly
- `tests/helpers.mjs` (`PLUGIN_ROOT`)
- `tests/sync/provider-skill-parity.test.mjs` — read to confirm what NOT to duplicate

**Design notes (binding):**

- The scanner is the executable definition of the extent rule. Task 2 documents the same grammar in prose; if they ever disagree, the test is right.
- **Derive, never hardcode.** The expected set is `{ the 9 literal headings }` ∪ `{ every fence-aware ^### Mode:  heading in status }`. Do **not** assert a count of 19. An eleventh `### Mode:` section must fail only for lacking a marker, never for existing. A test that asserts `sections.length === 19` is a specification-gaming failure of this task.
- **Key sections by `(file, startLine)`.** `status` L126 and L378 carry identical heading text; a text-keyed map silently drops one.
- Run every scan over the canonical `skills/` file **and both provider mirrors** (`providers/codex/`, `providers/opencode/`). That is this suite's `MIRROR_DRIFT` contribution — marker-level, not byte-level. Byte parity stays owned by `tests/sync/provider-skill-parity.test.mjs`; do not re-run the sync script here.
- Fence tracking must handle both ` ``` ` and `~~~`, and must skip the leading YAML frontmatter.

- [ ] **Write failing test**

Author the suite with these cases, all data-driven off the scanner:

```javascript
// tests/skills/terse-form-markers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// scanSections(text) -> [{ file, startLine, endLine, depth, heading, body }]
//   fence-aware; extent = heading line .. line before next heading of
//   equal-or-shallower depth, else EOF. Keyed by (file, startLine).
// governedSections(file, sections) -> the 9 literal headings + every
//   /^### Mode: / heading in status. Derived, never a hardcoded count.

test("MISSING_TERSE_FORM: every governed section carries a **Terse form:** marker", () => {});
test("MARKER_OUT_OF_SCOPE: no **Terse form:** marker outside a governed extent", () => {});
test("the marker is the last block of its governed section", () => {});
test("BEH-2: no terse-form block emits an absolute filesystem path", () => {});
test("BEH-3: each terse-form block contains at most one markdown table", () => {});
test("BEH-7: each file's persona/verbosity footnote names terse.md, normal.md and deep.md literally, and interpolates no resolved value into a path", () => {});
test("BEH-8: no terse-form block uses a sentence/paragraph count as its only constraint", () => {});
test("status L126 and L378 are two distinct governed sections", () => {});
test("provider mirrors carry the same markers as the canonical skills/ files", () => {});
```

Concrete assertion shapes:
- **BEH-2** — reject `/(^|[\s(`"'])\/[A-Za-z0-9._\-\/]+/` and `/[A-Za-z]:\\/` inside a terse-form block, allowing repo-relative forms. Fence-aware within the block.
- **BEH-3** — count lines matching `/^\s*\|.*\|\s*$/` that open a table inside the block; at most one table.
- **BEH-7** — assert the footnote contains the three literal filenames and matches no interpolation pattern (`templates/verbosity/<`, `${`, `{{`, `$VERBOSITY`).
- **BEH-8** — flag a block whose only constraint bullet matches `/\b\d+\s*(sentence|paragraph|line|word)s?\b/`; a block that also carries a content or structure constraint passes.

- [ ] **Verify test fails**

Run: `node --test tests/skills/terse-form-markers.test.mjs`
Expected: **FAIL** — `MISSING_TERSE_FORM` reports all 19 governed sections (10 `status` + 2 `route` + 4 `sample` + 3 `learn`) plus their mirror copies, and the BEH-7 case fails on all four footnotes.

> **This RED observation is an acceptance criterion, not a formality.** Record the failing output. A passing test authored after the wiring is not evidence. Before declaring the suite trustworthy at the end of task 6, delete one marker, re-run, and confirm the suite goes red for exactly that section — then restore it.

- [ ] **Implement**

Nothing to implement in this task: the suite is the deliverable and it is expected to stay red until task 6. Do **not** add a marker to any SKILL.md here — that is tasks 3-6, and doing it early destroys the RED baseline the acceptance criterion depends on.

- [ ] **Verify test passes**

Run: `node --test tests/skills/terse-form-markers.test.mjs`
Expected: still **FAIL** (by design). The gate for *this* task is that the failure names every governed section and no others — i.e. the scanner is correct even though the wiring is absent. Confirm `MARKER_OUT_OF_SCOPE` reports zero (no markers exist yet) and that the reported section list matches the spec's table exactly: `status` 10 at L40/93/126/162/249/279/302/324/378/397, `route` 2 at L209/262, `sample` 4 at L123/169/194/217, `learn` 3 at L94/179/191.

- [ ] **Commit**

Branch (if not already created): `feat/output-personas/terse-form-markers`

```bash
git add tests/skills/terse-form-markers.test.mjs
git commit -m "test(output-personas): add fence-aware terse-form marker guard (red)

Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
Plan-task: 1"
```

---

### Task 2: Canonical footnote + `**Terse form:**` convention [specialist: none]

**Charter capability:** Skill output rules wiring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/status/SKILL.md:12`
- Modify: `skills/route/SKILL.md:211`
- Modify: `skills/sample/SKILL.md:125`
- Modify: `skills/learn/SKILL.md:197`
- Test: `tests/skills/terse-form-markers.test.mjs`

**Tests:** `tests/skills/terse-form-markers.test.mjs` — **extend** (the BEH-7 case authored in task 1 covers this task; add a case only if a footnote placement this task chooses is not already reachable by the scan).

**Context to load:**
- The **SA-4 resolution** above — normative
- Spec BEH-7 and "Layer precedence"
- `templates/verbosity/terse.md`, `normal.md`, `deep.md` — **read only**, for their literal filenames
- `templates/personas/product.md` — confirms the deleted clause is owned upstream
- `.context-index/adrs/0020-…md` (decision + rationale only)

**What this task decides once, for tasks 3-6 to consume:**

1. **The canonical footnote.** One wording, used in all four files, adjusted only for where it sits (`status`'s is file-scoped at L12; the other three are section-local). It MUST:
   - name `templates/verbosity/terse.md`, `templates/verbosity/normal.md` and `templates/verbosity/deep.md` by **literal filename**;
   - state a **decidable** rule — when the resolved verbosity is `terse` and the section carries a `**Terse form:**` marker, that block is the section's declared rendering;
   - **never** instruct interpolating a resolved value into a path (no `templates/verbosity/<verbosity>.md`);
   - **delete** `status:12`'s `omit file paths and technical detail` parenthetical and the equivalent parentheticals in `route:211` and `sample:125` — see SA-4;
   - **not** claim anything about what survives the session overlay. Any sentence of the form "X still renders even at terse" is the withdrawn BEH-12/BEH-14 defect and belongs in `issue-uvarlt`.

2. **The marker convention**, documented in prose that matches task 1's scanner exactly:
   - the literal marker is `**Terse form:**`;
   - it is the **last block of its governed section**;
   - its block runs from the marker to the end of that section;
   - a section is delimited by the SA-3 extent rule (next heading of equal-or-shallower depth, fence-aware).

3. **The BEH-3 substitution recipe**, so tasks 3-6 apply it uniformly: at most one table of the section's own; every further table becomes a count plus either the **repo-relative path** of the artifact holding the data, or — when no artifact holds it — the **narrower invocation of the same skill** that renders detail for one item; and when neither exists, the count alone with nothing named.

- [ ] **Write failing test**

Already authored in task 1 (the BEH-7 case). No new test file. If the footnote placement chosen here is outside every scanned region, add one case pinning where the scanner looks for it — do not move the footnote to suit the test.

- [ ] **Verify test fails**

Run: `node --test tests/skills/terse-form-markers.test.mjs --test-name-pattern "BEH-7"`
Expected: **FAIL** on all four files — no current footnote names any overlay filename.

- [ ] **Implement**

Rewrite the four footnotes to the canonical wording. Add the convention prose where a reader of any of the four files will find it (a short block beside the footnote, not a new top-level section — the size cap has headroom but four copies of a long convention block is waste; keep the full statement in `status`, and a one-line pointer in the other three).

Touch **only** the footnote lines and the convention block. Adding terse forms is tasks 3-6.

- [ ] **Verify test passes**

Run: `node --test tests/skills/terse-form-markers.test.mjs --test-name-pattern "BEH-7"`
Expected: **PASS**. Every other case still fails — no markers exist yet.

- [ ] **Commit**

```bash
git add skills/status/SKILL.md skills/route/SKILL.md skills/sample/SKILL.md skills/learn/SKILL.md
git commit -m "docs(output-personas): canonical verbosity footnote and terse-form convention

Resolves the status:12 'omit file paths' contradiction with BEH-3 by
deleting the persona-specific parenthetical rather than reconciling it;
templates/personas/product.md already owns that instruction.

Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
Plan-task: 2"
```

---

### Task 3: Wire `status` — 10 `### Mode:` sections [specialist: none]

**Charter capability:** Skill output rules wiring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/status/SKILL.md` — append a terse form to each of L40, L93, L126, L162, L249, L279, L302, L324, L378, L397
- Test: `tests/skills/terse-form-markers.test.mjs`

**Tests:** `tests/skills/terse-form-markers.test.mjs` — **extend** (task 1's data-driven cases already cover this file; add a case only if `status` needs one the scan cannot express).

**Context to load:**
- Spec BEH-1, BEH-2, BEH-3 (**no-artifact branch throughout**), BEH-8
- `skills/status/SKILL.md` full read; `:14-24` for the narrowing invocations
- Task 2's canonical footnote and BEH-3 substitution recipe

**The ten sections and what each terse form must carry:**

| L | Section | BEH-3 treatment |
|---|---|---|
| 40 | `` ### Mode: `--spec <path>` `` | Already single-item; one table at most, no substitution needed |
| 93 | `` ### Mode: `--charter <name>` `` | Keep the capability table; further per-spec detail → count + `/adev:status --spec <path>` |
| 126 | `` ### Mode: `--milestone <name>` `` (first) | Keep one table; further detail → count + `/adev:status --epic <id>` |
| 162 | `` ### Mode: `--all` (default) `` | **The hard one — see below** |
| 249 | `` ### Mode: `--issue <id>` `` | Single-item; one table at most |
| 279 | `` ### Mode: `--epic <id>` `` | Keep the epic summary; child issues → count + `/adev:status --issue <id>` |
| 302 | `` ### Mode: `--file <path>` `` | Single-item; one table at most |
| 324 | `` ### Mode: `--backlog` `` | Keep one table; further detail → count + `/adev:status --spec <path>` |
| 378 | `` ### Mode: `--milestone <name>` `` (second) | Distinct section — needs **its own** marker, not a reference to L126's |
| 397 | `### Mode: Workspace Aggregation (workspace root)` | Keep one table; per-repo detail → count + the per-repo invocation named in the section |

**`--all` (L162) in detail.** Its extent runs L162-L248 and its default output has seven reportable groupings (Charters by Status, Specs by Status, Capability Progress, Drifted Specs, Specs Needing Re-Review, Milestone Progress, Stale Claims, Recent Sessions). Its terse form emits **one** table of its own — the counts roll-up — and substitutes for the rest. `status` is **read-only and writes no artifact**, so BEH-3's no-artifact branch applies to every substitution: a count plus the narrower invocation. Drifted specs → count + `/adev:status --spec <path>`. Specs needing re-review → count + `/adev:status --spec <path>`. Milestone progress → count + `/adev:status --milestone <name>`. Stale claims → count + `/adev:status --issue <id>`. Recent sessions have **no narrower invocation** in this skill, so per BEH-3 they emit the count alone and name nothing — do not invent an invocation to fill the slot.

**Constraints that fail the guard if violated:**
- **BEH-2** — every path named is repo-relative. `status` writes no artifact, so no path is named as an artifact location; the `<path>` inside `/adev:status --spec <path>` is a **command argument placeholder**, not a cited file path, and is required by BEH-3. Do not "resolve" it to a real absolute path in an example.
- **BEH-8** — no terse form may rest on "at most N lines" as its only constraint. Per ADR 0020 these are content rules. At most one soft per-response default is allowed, framed as a default.
- **BEH-1** — no `status` section composes another's output, so the composed-view clause does not apply here.

- [ ] **Write failing test** — covered by task 1. No new test.

- [ ] **Verify test fails**

Run: `node --test tests/skills/terse-form-markers.test.mjs --test-name-pattern "MISSING_TERSE_FORM"`
Expected: **FAIL**, naming all ten `status` sections (plus `route`/`sample`/`learn`, still unwired).

- [ ] **Implement**

Append a `**Terse form:**` block as the last block of each of the ten sections. Note L162's extent ends at L248 — the marker goes after `#### Recent Sessions`'s output-format fence and before `### Mode: --issue <id>`, not inside a `####` subsection.

- [ ] **Verify test passes**

Run: `node --test tests/skills/terse-form-markers.test.mjs`
Expected: `MISSING_TERSE_FORM` no longer names any `status` section (mirrors still fail — task 7); `MARKER_OUT_OF_SCOPE`, the last-block case, BEH-2, BEH-3 and BEH-8 all **PASS** for `status`.

- [ ] **Commit**

```bash
git add skills/status/SKILL.md
git commit -m "docs(output-personas): add terse forms to the ten status Mode sections

Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
Plan-task: 3"
```

---

### Task 4: Wire `route` — 2 sections [specialist: none]

**Charter capability:** Skill output rules wiring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/route/SKILL.md` — L209 `## Step 5: Report to User`, L262 `## Dry-Run Mode`
- Test: `tests/skills/terse-form-markers.test.mjs`

**Tests:** `tests/skills/terse-form-markers.test.mjs` — **extend** (task 1's cases cover it).

**Context to load:**
- Spec BEH-1 (**composed views**), BEH-2, BEH-3, BEH-8
- `skills/route/SKILL.md` L209-L241, L262-L273
- Task 2's output

**Per-section requirements:**

- **`## Step 5: Report to User` (L209-L241).** Renders a per-task routing table, a route-distribution line, the sidecar path, and — conditionally — a human-only guidance block. It **does** write an artifact: `<plan-stem>.routing.json`. So BEH-3's artifact branch applies: keep **one** table, and substitute the human-only detail block with a count plus the sidecar's **repo-relative** path. The route distribution line is a count, not a table, and stays.
  - BEH-2 bites hardest here: the sidecar path must be written repo-relative (`<plan-stem>.routing.json` relative to the repo), never absolute. This is the section most likely to render an absolute path today because the plan path arrives as an argument.
- **`## Dry-Run Mode` (L262-L273).** A **composed view** — it renders Step 5's summary table inside itself. Per BEH-1 the **outer** section's terse form governs the composed view; Step 5's terse form applies only when Step 5 renders on its own. **This terse form must state that locally**, in its own block, so the rule sits where it is needed rather than being inferred from the spec. It must also preserve the section's own distinguishing fact — that no sidecar was written and none was disturbed — because that is the whole point of dry-run and a terse form that drops it makes the two modes indistinguishable.

- [ ] **Write failing test** — covered by task 1.
- [ ] **Verify test fails**

Run: `node --test tests/skills/terse-form-markers.test.mjs --test-name-pattern "MISSING_TERSE_FORM"`
Expected: **FAIL**, naming `route` L209 and L262.

- [ ] **Implement**

Append the two blocks as last-block-of-section. `## Step 5`'s extent ends at L241 (before `## Integration with /adev:implement`); `## Dry-Run Mode`'s ends at L273 (before `## Red Flags`).

- [ ] **Verify test passes**

Run: `node --test tests/skills/terse-form-markers.test.mjs`
Expected: `route` clean on every case; BEH-2 in particular passes, confirming the sidecar path is repo-relative.

- [ ] **Commit**

```bash
git add skills/route/SKILL.md
git commit -m "docs(output-personas): add terse forms to route Step 5 and Dry-Run Mode

Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
Plan-task: 4"
```

---

### Task 5: Wire `sample` — 4 sections [specialist: none]

**Charter capability:** Skill output rules wiring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/sample/SKILL.md` — L123 `#### Present Results`, L169 `### Step 5: Register`, L194 `## --score Mode`, L217 `## --refresh Mode`
- Test: `tests/skills/terse-form-markers.test.mjs`

**Tests:** `tests/skills/terse-form-markers.test.mjs` — **extend** (task 1's cases cover it).

**Context to load:**
- Spec BEH-1 (**composed views**), BEH-2, BEH-3, BEH-8
- The **decision-gate authoring constraint** in this plan — applies to L123 and L217
- `skills/sample/SKILL.md` L123-L140, L169-L183, L194-L216, L217-L240

**Per-section requirements:**

- **`#### Present Results` (L123-L140) — DECISION GATE.** Renders a nine-column candidate table and then asks *"Select files to extract as golden samples (e.g., "1, 3" or "all")."* Its terse form keeps **one** table (BEH-3) — necessarily this one, since it is the only table — but must narrow it to the columns the choice actually needs: rank, file (repo-relative), pattern, total score. The five per-dimension score columns are the detail that goes. **Per the adopted decision-gate constraint, the terse form must still declare the rank/file/score rows and the selection prompt** — a terse form that emits "10 candidates found" and then asks the user to select by number has deleted the evidence for the question it is asking. Note the extent: L123 is `####`, and the next equal-or-shallower heading is `### Step 4: Extract` at L141, so the section ends at L140.
- **`### Step 5: Register` (L169-L183).** Prints what was created and where. It **has** written an artifact (`.context-index/samples/<name>.md`), so BEH-3's artifact branch applies and BEH-2 is directly engaged: the terse form names the sample's **repo-relative** path and does not reproduce its content. No table here; the constraint is content, not table count.
- **`## --score Mode` (L194-L216).** One audit table. Keep it, narrowed to the sample, delta, and status columns; degraded entries are the actionable subset. If the terse form wants a second grouping it must instead emit a count plus the repo-relative sample path.
- **`## --refresh Mode` (L217-L240) — COMPOSED VIEW *and* DECISION GATE.** It runs `--score` logic first, then adds staleness/drift columns, then asks *"Proceed with recommended actions? (y/n)"*. Two rules land together:
  - **BEH-1 composed view:** the **outer** (`--refresh`) terse form governs; `--score`'s terse form applies only when `--score` runs on its own. **State this locally in this block.**
  - **Decision-gate constraint:** the per-sample recommended actions are the evidence for the y/n question. The terse form must declare that the action column and its rows are part of what it offers — collapsing to "3 samples need attention. Proceed? (y/n)" asks the user to approve actions the section never named.

**Layer discipline reminder for both gates:** state what the section *offers*. Do **not** write "this renders even at terse" or "the overlay must not trim this" — that authorship belongs to `issue-uvarlt` in `templates/verbosity/terse.md` and would repeat the withdrawn BEH-14.

- [ ] **Write failing test** — covered by task 1.
- [ ] **Verify test fails**

Run: `node --test tests/skills/terse-form-markers.test.mjs --test-name-pattern "MISSING_TERSE_FORM"`
Expected: **FAIL**, naming `sample` L123, L169, L194, L217.

- [ ] **Implement**

Append the four blocks as last-block-of-section, respecting the extents above.

- [ ] **Verify test passes**

Run: `node --test tests/skills/terse-form-markers.test.mjs`
Expected: `sample` clean on every case. Check BEH-2 specifically for Step 5 Register — `.context-index/samples/...` is already repo-relative and must stay that way.

- [ ] **Commit**

```bash
git add skills/sample/SKILL.md
git commit -m "docs(output-personas): add terse forms to the four sample sections

Present Results and --refresh Mode are decision gates; their terse forms
declare the evidence their own next step asks the user to act on.

Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
Plan-task: 5"
```

---

### Task 6: Wire `learn` — 3 sections [specialist: none]

**Charter capability:** Skill output rules wiring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/learn/SKILL.md` — L94 `## Step 4: Present for Confirmation`, L179 `## Step 6: Confirm`, L191 `` ## List Mode (`--list`) ``
- Test: `tests/skills/terse-form-markers.test.mjs`

**Tests:** `tests/skills/terse-form-markers.test.mjs` — **extend** (task 1's cases cover it).

**Context to load:**
- Spec BEH-1, BEH-2, BEH-3, BEH-8
- The **decision-gate authoring constraint** — applies to L94
- `skills/learn/SKILL.md` L94-L115, L179-L190, L191-L209

**Per-section requirements:**

- **`## Step 4: Present for Confirmation` (L94-L115) — DECISION GATE.** Shows the proposed heuristic (scope, id, title, pattern, anti-pattern, confidence) and asks *"Save this? (yes / edit / cancel)"*. Nothing has been written yet, so **no artifact exists** — BEH-3's no-artifact branch applies and there is no path to name. Per the decision-gate constraint the terse form must still declare the **pattern and anti-pattern** text: those two lines *are* the proposal, and "Proposed heuristic in scope `hooks`. Save this?" asks the user to approve text they were never shown. Scope, id and confidence may compress; the two rule lines are the evidence.
- **`## Step 6: Confirm` (L179-L190).** Post-write. An artifact now exists, so BEH-3's artifact branch and BEH-2 both apply: name the heuristic store's **repo-relative** path rather than reproducing the record. Keep the two follow-on invocations (`--promote`, `--archive`) — they are the section's actionable content, not decoration.
- **`` ## List Mode (`--list`) `` (L191-L209).** One table. Keep it, narrowed to id, title and confidence; the totals line is a count and stays. Per BEH-3 any further grouping becomes a count plus `/adev:learn --list --module <scope>`, which is this skill's genuine narrowing invocation.

- [ ] **Write failing test** — covered by task 1.
- [ ] **Verify test fails**

Run: `node --test tests/skills/terse-form-markers.test.mjs --test-name-pattern "MISSING_TERSE_FORM"`
Expected: **FAIL**, naming `learn` L94, L179, L191 — and by now nothing else in `skills/`.

- [ ] **Implement**

Append the three blocks as last-block-of-section. `## List Mode`'s extent ends at L209, before `## Promote/Demote/Archive Modes` at L210.

- [ ] **Verify test passes**

Run: `node --test tests/skills/terse-form-markers.test.mjs`
Expected: every canonical-file case **PASSES**. Only the provider-mirror case still fails — that is task 7.

- [ ] **Falsification check (required before moving on)**

The whole suite is now green on `skills/`. Prove it can still go red: delete one `**Terse form:**` marker, re-run, confirm `MISSING_TERSE_FORM` names exactly that section, then restore it. Then move a marker so it is no longer the last block of its section, re-run, confirm the last-block case fails, then restore. A guard that has only ever been observed green is not evidence.

- [ ] **Commit**

```bash
git add skills/learn/SKILL.md
git commit -m "docs(output-personas): add terse forms to the three learn sections

Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
Plan-task: 6"
```

---

### Task 7: Regenerate provider mirrors [specialist: none]

**Charter capability:** Skill output rules wiring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 3, 4, 5, 6
**Files:**
- Modify: `providers/codex/skills/{status,route,sample,learn}/SKILL.md` (generated)
- Modify: `providers/opencode/skills/{status,route,sample,learn}/SKILL.md` (generated)
- Test: `tests/sync/provider-skill-parity.test.mjs`, `tests/skills/terse-form-markers.test.mjs`

**Tests:** `tests/sync/provider-skill-parity.test.mjs` — **existing suite, no change**. The marker-level mirror case in `tests/skills/terse-form-markers.test.mjs` also turns green here.

**Context to load:**
- Spec postcondition 3 and the `MIRROR_DRIFT` error case
- `scripts/sync-provider-skills.mjs` — invocation only

**Rules:**
- **Never hand-edit a mirror.** They are generated: canonical content plus a provider-specific description suffix. A hand edit passes the marker case and then dies at the next byte-parity run.
- Only `codex` and `opencode` carry `skills/` mirrors; `claude-code`, `copilot` and `cursor` have none. Do not create them.
- This task must come last among the wiring tasks. Running it after task 3 but before task 6 just reintroduces drift.

- [ ] **Write failing test** — none authored. Both guards already exist.

- [ ] **Verify test fails**

Run: `node --test tests/sync/provider-skill-parity.test.mjs`
Expected: **FAIL** — the dry-run reports 8 mirrors updated (4 skills × 2 providers).

- [ ] **Implement**

```bash
node scripts/sync-provider-skills.mjs
```

- [ ] **Verify test passes**

Run: `node --test tests/sync/provider-skill-parity.test.mjs tests/skills/terse-form-markers.test.mjs`
Expected: **PASS** on both. Parity reports `0 updated, 0 created`; the marker suite is green end to end, canonical and mirrors.

- [ ] **Commit**

```bash
git add providers/codex/skills providers/opencode/skills
git commit -m "chore(output-personas): regenerate provider skill mirrors

Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
Plan-task: 7"
```

---

### Task 8: Correct the charter row + record what the increment taught [specialist: none]

**Charter capability:** Skill output rules wiring
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7
**Files:**
- Modify: `.context-index/specs/features/output-personas/charter.md` — the "Skill output rules wiring" Capability Map row, plus a new lessons subsection; bump `revision: 5` → `6` and `updated`
- Modify: `tests/skills/terse-form-markers.test.mjs` — add the charter-row case
- Test: `tests/skills/terse-form-markers.test.mjs`

**Tests:** `tests/skills/terse-form-markers.test.mjs` — **extend** with a charter-row case. (`tests/specs/test-strategies-charter-revision-3.test.mjs` is the precedent for asserting a charter row; this increment keeps its single suite rather than adding a second file.)

**Context to load:**
- `charter.md` — the row currently reading *"Connect the verbosity axis to the 17 `SKILL.md` mandated-output sections that carry a persona-adaptation footnote."*
- Spec "This is an increment, and says so" and "Out of Scope"
- This plan — the SA-4 resolution and the decision-gate constraint are two of the things the retrospective must report on
- The diffs from tasks 2-6

**Part A — correct the row.** The row names a broader connection *and* a different count than what shipped. Rewrite it to describe the four-skill, nineteen-section increment, with widening to the remaining fifteen skills named as a follow-on rather than implied as delivered. Set its Status to `implemented` (validation is `/adev:validate`'s to award). Two numbers matter and must not be conflated: **17** was the old count of persona-footnote-carrying sections across all skills; **19** is the count of sections wired here across four. The new row should not carry 17 at all.

**Part B — record what the increment taught.** Append a short subsection to the charter (not a new file). This is the direct input to the widening spec's durability question, so answer these specifically rather than in general terms:

1. **Which terse forms read well and which fought the format.** Name them. The single-item `status` modes (`--spec`, `--issue`, `--file`) and `--all` are opposite ends of the difficulty range; the answer tells the widening spec whether difficulty tracks table count.
2. **Whether the marker convention survived contact.** Did "last block of its section" hold everywhere, or did a section want its terse form mid-body? Did the fence-aware extent rule need amending during tasks 3-6? If task 1's scanner was edited after task 2, say why — that is the strongest available signal that the SA-3 rule was under-specified.
3. **Whether BEH-3's substitution recipe was decidable in practice.** Specifically: how often did the "no narrower invocation exists, emit the count alone" branch fire? It fired at least once by design (`status` `--all`'s Recent Sessions). If it fired often, the recipe is thinner than it looks.
4. **Whether the decision-gate authoring constraint held** — the voluntary one this plan adopted for `sample` `#### Present Results`, `sample` `## --refresh Mode` and `learn` `## Step 4`. Was "declare the material the next step needs" sufficient at the skill layer, or did each of the three want an overlay-level guarantee? This is direct evidence for `issue-uvarlt`, which owns that guarantee, and it is the question most likely to change the widening spec's shape.
5. **Whether the SA-4 deletion cost anything.** Removing `status:12`'s "omit file paths and technical detail" moved that instruction wholly to `templates/personas/product.md`. Note whether any section then wanted it back — if so, the widening spec inherits a real tension rather than a resolved one.

**Explicitly out of scope for this task:** do not draft the widening spec, do not add a durability rule to `/adev:implement`, and do not touch any of the fifteen sibling specs whose source manifests this increment made advisory-stale (SA-1). Recording the drift is this plan's job; repairing it is nobody's, because ADR-0011 is Rejected.

- [ ] **Write failing test**

Add to `tests/skills/terse-form-markers.test.mjs`:

```javascript
test("charter capability row describes the four-skill increment, not a 17-section connection", () => {
  // read charter.md, locate the "Skill output rules wiring" row,
  // assert it does not contain "17" and does name the four-skill increment
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/terse-form-markers.test.mjs --test-name-pattern "charter capability row"`
Expected: **FAIL** — the row still reads "17 `SKILL.md` mandated-output sections".

- [ ] **Implement**

Rewrite the row, append the lessons subsection, bump `revision` to 6 and `updated` to the current date.

- [ ] **Verify test passes**

Run: `npm test`
Expected: **PASS** — full suite, including the marker guard, byte parity, and the size cap.

- [ ] **Commit**

```bash
git add .context-index/specs/features/output-personas/charter.md tests/skills/terse-form-markers.test.mjs
git commit -m "docs(output-personas): correct the capability row and record increment lessons

Spec: .context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md
Plan-task: 8"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gates resolve from `.context-index/governance/gates.yaml` (post-0.26.0; the legacy `manifest.yaml` `gates:` block is not read):

| Gate | Tier | Command | Severity |
|---|---|---|---|
| `test` / `quality-gate` | fast | `npm test` | error |
| `integration-test` | integration | `npm run test:evals` | warning (`required: false` pending issue-590/591/592) |

Additionally, these must hold before the spec can be called done:

- Every acceptance criterion in the spec is satisfied
- **The task-1 test was observed FAILING before the wiring landed** — this is acceptance criterion 1, and the falsification check at the end of task 6 is its evidence
- `tests/sync/provider-skill-parity.test.mjs` reports `0 updated, 0 created`
- `tests/skills/skill-size-cap.test.mjs` passes (headroom pre-verified; the largest of the four is `status` at 23,279 of 65,536 bytes)
- The modified-file set is **exactly**: four `skills/*/SKILL.md`, eight `providers/{codex,opencode}/skills/*/SKILL.md`, one new test file, one charter. Nothing under `lib/`, `hooks/`, `templates/`, `cli/`, and no other spec's frontmatter.
- No constitutional violation: no inline-Node directive added to any SKILL.md (`.githooks/pre-commit-no-inline-node` and `tests/skills-no-inline-node.test.mjs` both guard this), no executable logic in skill markdown, no new dependency.

**Known accepted side effect, not a gate failure:** the fifteen sibling specs listed under SA-1 carry one or more of the four SKILL.md paths in their `source-manifest.files[]`. Editing those files makes their recorded `sha` advisory-stale. `/adev:hygiene` and `/adev:validate` may report it; ADR-0011 is Rejected, restamping is unauthorised, and no task here may repair it.

# Implementation Plan: Review Packet Template

> **Methodology:** adev
> **Charter:** .context-index/specs/features/pr-review-brief/charter.md
> **Spec:** .context-index/specs/features/pr-review-brief/review-packet-template.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-12)
> **Platform:** Node.js (ESM, `.mjs`), npm, `node:test` — zero external dependencies

**Goal:** Ship `.github/pull_request_template.md` — the author-written half of the PR reviewer contract — plus the structural test that pins its four H2 headings and its empty `<!-- adev:pr-brief -->` marker slot, and point the two agent-facing `gh pr create` prose lines at it.

**Architecture:** This is an artifact spec, not a code spec: the deliverable is one static Markdown file that GitHub consumes verbatim, with no template engine, no interpolation, and no build step (constitution Principle 1). The only executable work is a `node:test` file that reads the template as text and asserts its shape, and two one-line prose edits inside the constitution's Autonomous boundary ("Updating templates", "Editing skill markdown content"). Nothing here touches the hook protocol, the plugin registration format, `package.json`, or the provenance trailer contract.

**Review note carried forward (CON-1).** The review flagged that AC-6's phrase *"no output path of `adev pr body` emits any of the four packet headings"* is ambiguous between "renders the text as a heading" and "contains the literal substring anywhere". The sibling spec `pr-body-advisories.spec.md` deliberately has the size-advisory renderer point at the packet's problem-statement section by name, quoted inline in prose — so a substring implementation of the interlock would fail the sibling's designed behavior. **This plan pins the interlock as: no output line of `adev pr body` begins with `## ` followed by one of the four packet heading strings.** An inline, backtick-quoted reference embedded in prose is explicitly permitted. See Task 3.

**Scope boundary (AC-6 is blocked, by design).** AC-6 exercises `adev pr body`, a verb that does not exist: it is defined by `pr-body-composition.spec.md`, which is currently review-BLOCK with its build halted. Task 3 is therefore sequenced as **blocked**, not omitted — it carries the pinned assertion so that whoever unblocks the composition spec inherits the settled wording rather than re-litigating it. Tasks 1 and 2 are fully independent of that verb and deliver the artifact in its correct degraded state: a human who opens a PR by hand gets the packet and an empty marker pair.

---

## File Structure

**Create:**
- `.github/pull_request_template.md` — the review packet: four author-written H2 sections, each followed by an HTML-comment prompt, then an empty `<!-- adev:pr-brief -->` / `<!-- /adev:pr-brief -->` marker pair. First non-workflow file under `.github/`.
- `tests/pr-review-packet.test.mjs` — structural assertions over the template (headings, order, literal text, comment prompts, marker pair, trailing-marker rule) and over the two consumer SKILL.md prose lines.

**Modify:**
- `skills/validate/SKILL.md:566` — extend the `gh pr create --base <target-branch>` prose so it names the template.
- `skills/implement/SKILL.md:649` — same edit to the post-implementation PR prose.

**Reference (read, do not modify):**
- `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md` — Structural Shape carries the template body verbatim; copy it, do not paraphrase.
- `.context-index/specs/features/pr-review-brief/charter.md` — Domain Model, `Review Packet` entity (`what`, `risk_areas`, `verified_line_by_line`, `cannot_explain`).
- `.context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` — the inline `## What` pointer that Task 3's interlock must NOT flag.
- `tests/constitution.test.mjs` — follow this file's shape for a read-a-file-and-assert-its-text test (imports, `__dirname` resolution, `assert.match`).
- `.context-index/constitution.md` — Anti-Patterns section, for the "no step directive, no inline Node" assertion in Task 2.

**Regenerated, not hand-edited (Task 2):**
- `providers/codex/skills/validate/SKILL.md`, `providers/codex/skills/implement/SKILL.md`, `providers/opencode/skills/validate/SKILL.md`, `providers/opencode/skills/implement/SKILL.md` — mirrors produced by `node scripts/sync-provider-skills.mjs` and enforced by `tests/sync/provider-skill-parity.test.mjs`. They carry the same two target lines at the same line numbers, so editing the canonical files without re-running the sync fails `npm test`.

**Explicitly not touched:** `package.json` (AC-8 — no new dependency, no build step), `templates/` (no bundled copy; see the spec's Deferred Capabilities), `.github/workflows/` (owned by the `cicd` charter).

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md` — Structural Shape (the fenced template body is the literal deliverable), Required Files, AC-1 through AC-5, AC-8, AC-9.
- Charter: `.context-index/specs/features/pr-review-brief/charter.md` (capability: **Review packet field set**; Domain Model → `Review Packet` entity attributes).
- Source files: none — `.github/` contains only `workflows/`, and the spec has no `source-manifest` yet.
- Sample: none curated for static-artifact tests; use `tests/constitution.test.mjs` as the in-repo pattern for text-shape assertions.
- Constitution: `.context-index/constitution.md` — Principle 1 (minimize dependencies), Conventions (kebab-case, and the documented `pull_request_template.md` exception).
- Boundary rules: `.context-index/governance/boundaries.yaml` — absent in this repo; no boundary constraints apply.
- Heuristics: 3 entries for module `pr-review-brief` (see `## Heuristics`; none bear on this artifact).

### Task 2 Context
- Spec: `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md` — Consumers (the `skills/validate/SKILL.md:566` / `skills/implement/SKILL.md:649` bullet), System Constitution Reference (the anti-pattern bullet), AC-7.
- Source files: `skills/validate/SKILL.md` lines 559–570 (the merge_policy `pr` output block) and `skills/implement/SKILL.md` lines 645–652 (the post-implementation PR block) — read in full around those ranges; the surrounding fenced blocks are agent-facing output templates, not executable steps.
- Constitution: `.context-index/constitution.md` — Anti-Patterns (no executable logic in SKILL.md; no inline-Node; no both-forms within an H3 section).
- Related test: `tests/constitution.test.mjs` and the `.githooks/pre-commit-no-inline-node` chain — the edit must survive both.
- Boundary rules: not applicable.

### Task 3 Context (blocked)
- Spec: `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md` — Consumers → `adev pr body` bullet, AC-6.
- Sibling spec: `.context-index/specs/features/pr-review-brief/pr-body-composition.spec.md` — the `adev pr body` contract (currently review-BLOCK).
- Sibling spec: `.context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` — "Size Advisory: Computation and Exception Classes", the inline `` `## What` `` pointer that the interlock must tolerate.
- Review: `.context-index/specs/features/pr-review-brief/review-packet-template.review.md` — CON-1, the finding this task settles.
- Source files: `lib/cli/pr*.mjs` and the `pr` entry in `cli/index.mjs` — **none exist yet**; that absence is the blocker.

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

- Group A (sequential): Task 1 → Task 2 → Task 3 (all three write `tests/pr-review-packet.test.mjs`; Task 2 additionally asserts against the file Task 1 creates).

There is no second group. Every task in this plan touches the single test file, so nothing here is parallelizable. Task 3 is additionally gated on an external precondition (`adev pr body` existing) and will not be dispatched by `/adev:implement` until that clears.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Review packet template + structural test | small | unit | — | 2 create, 0 modify |
| 2 | Point `gh pr create` prose at the template | medium | unit | Task 1 | 0 create, 8 modify (4 script-generated) |
| 3 | `adev pr body` interlock test **[BLOCKED]** | small | unit | Task 1, `pr-body-composition.spec.md` clearing review | 0 create, 1 modify |

All three tasks resolve to the `unit` strategy (source: fallback — the spec declares no `test_strategy` and `manifest.yaml` declares no `test_strategies` globs), so no Strategy Summary section is emitted. The spec declares no `infra_requirements:` and no task is non-unit, so no Test Infrastructure Requirements section is emitted either: every assertion in this plan reads a file from the working tree.

---

### Task 1: Review packet template + structural test [specialist: none]

**Charter capability:** Review packet field set — the author-written contract including the "what I cannot explain" field.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `.github/pull_request_template.md`
- Create: `tests/pr-review-packet.test.mjs`

**Tests:** `tests/pr-review-packet.test.mjs`

**Context to load:**
- `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md` (Structural Shape — the fenced block is the deliverable verbatim; AC-1 through AC-5)
- `tests/constitution.test.mjs` (follow this pattern: `node:test` + `node:assert/strict`, `fileURLToPath`-derived `__dirname`, `readFileSync`, one `test()` per asserted property)

**Acceptance criteria covered:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-9.

- [ ] **Write failing test**

Create `tests/pr-review-packet.test.mjs`. The four heading strings are contractual — declare them once as an ordered constant and assert against that, so a rename fails loudly in one place:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TEMPLATE_PATH = resolve(REPO_ROOT, ".github", "pull_request_template.md");

// Contractual: these four strings are the charter's Review Packet attributes
// (what, risk_areas, verified_line_by_line, cannot_explain). A rename here is a
// spec change, not an edit. Exported for reuse by the interlock test (Task 3).
export const PACKET_HEADINGS = [
  "## What",
  "## Risk areas and trust boundaries touched",
  "## Verified line by line",
  "## What I cannot explain",
];

const OPEN_MARKER = "<!-- adev:pr-brief -->";
const CLOSE_MARKER = "<!-- /adev:pr-brief -->";

const template = () => readFileSync(TEMPLATE_PATH, "utf8");

test("template contains the four packet headings in the specified order", () => {
  const lines = template().split("\n");
  const h2s = lines.filter((l) => l.startsWith("## ")).map((l) => l.trimEnd());
  assert.deepEqual(h2s, PACKET_HEADINGS);
});

test("template has no frontmatter", () => {
  assert.ok(!template().startsWith("---"), "GitHub renders the file verbatim; frontmatter would be visible");
});

test("template contains exactly one marker pair with nothing between", () => {
  const body = template();
  assert.equal(body.split(OPEN_MARKER).length - 1, 1, "exactly one opening marker");
  assert.equal(body.split(CLOSE_MARKER).length - 1, 1, "exactly one closing marker");
  const between = body.slice(body.indexOf(OPEN_MARKER) + OPEN_MARKER.length, body.indexOf(CLOSE_MARKER));
  assert.equal(between.trim(), "", "the generated slot ships empty");
});

test("the closing marker is the last non-blank line", () => {
  const lines = template().split("\n").filter((l) => l.trim() !== "");
  assert.equal(lines.at(-1).trim(), CLOSE_MARKER);
});

test("the 'What I cannot explain' section is present by literal heading match", () => {
  // Asserted separately from the ordered check so deleting this section fails
  // with a message naming it, rather than degrading into a generic order diff.
  assert.ok(template().includes("## What I cannot explain"));
});

test("every H2 heading is followed by an HTML-comment prompt", () => {
  const lines = template().split("\n");
  for (const [i, line] of lines.entries()) {
    if (!line.startsWith("## ")) continue;
    const next = lines.slice(i + 1).find((l) => l.trim() !== "");
    assert.ok(
      next && next.trimStart().startsWith("<!--"),
      `heading "${line.trim()}" ships bare — every section needs its instructional prompt`,
    );
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/pr-review-packet.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '.../.github/pull_request_template.md'` on every case.

- [ ] **Implement**

Create `.github/pull_request_template.md` with **exactly** the body given in the spec's Structural Shape fenced block — the four H2s, each followed by its HTML-comment prompt, then the empty marker pair as the final two non-blank lines. Copy the comment prose verbatim; it is the instructional scaffolding the spec relies on, not filler. Do not add a title, a checklist, a "type of change" table, or any other conventional PR-template furniture: the spec fixes the file at two regions and no more.

Add no dependency and no build step — `package.json` must be byte-identical after this task (AC-8). The snake_case filename is the documented naming exception (AC-9), already recorded in the spec's Structural Shape; do not "fix" it to kebab-case.

- [ ] **Verify test passes**

Run: `node --test tests/pr-review-packet.test.mjs`
Expected: PASS (6 tests).
Then: `npm test` — expected PASS, and in particular the new file must not trip `tests/skills-extension-coverage.test.mjs` or the inline-Node git hook (it is not a SKILL.md).

- [ ] **Commit**

Branch (if not already created): `feat/pr-review-brief/review-packet-template`

```bash
git add .github/pull_request_template.md tests/pr-review-packet.test.mjs
git commit -m "feat(pr-review-brief): add PR review packet template

Spec: .context-index/specs/features/pr-review-brief/review-packet-template.spec.md
Plan-task: 1"
```

---

### Task 2: Point `gh pr create` prose at the template [specialist: none]

**Depends on:** Task 1 (the template must exist before the prose can name it, and before the test can assert the path resolves)
**Charter capability:** Review packet field set — delivery of the author-written contract to agent-opened PRs.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/validate/SKILL.md:566` (canonical)
- Modify: `skills/implement/SKILL.md:649` (canonical)
- Modify: `providers/codex/skills/validate/SKILL.md:566` (script-generated mirror)
- Modify: `providers/codex/skills/implement/SKILL.md:649` (script-generated mirror)
- Modify: `providers/opencode/skills/validate/SKILL.md:566` (script-generated mirror)
- Modify: `providers/opencode/skills/implement/SKILL.md:649` (script-generated mirror)
- Modify: `tests/pr-review-packet.test.mjs` (append the AC-7 cases)
- Modify: `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md` (one-sentence amendment to the Consumers bullet — see below)

**Tests:** `tests/pr-review-packet.test.mjs`

**Context to load:**
- `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md` (Consumers → the SKILL.md bullet; System Constitution Reference → the anti-pattern bullet; AC-7)
- `.context-index/constitution.md` (Anti-Patterns: no executable logic in SKILL.md, no inline-Node, no both-forms in one H3 section)
- `tests/sync/provider-skill-parity.test.mjs` and `scripts/sync-provider-skills.mjs` (the mirror obligation — read before editing, not after the gate goes red)

**Provider mirrors are part of this task.** `skills/**/SKILL.md` is mirrored into `providers/codex/skills/**` and `providers/opencode/skills/**` by `scripts/sync-provider-skills.mjs`, and `tests/sync/provider-skill-parity.test.mjs` runs that script in `--dry-run` and fails on any drift. Both target lines exist verbatim in all four mirrors at the same line numbers. Editing only the canonical pair turns `npm test` — the repo's single active gate — red. The mirrors are regenerated, never hand-edited: run the sync script and stage its output. If the parity test fails, the fix is to re-run the sync, **never** to revert the canonical edit (that would silently undo AC-7).

**Acceptance criteria covered:** AC-7.

**Pinned interpretation — read before editing.** The spec describes this edit twice and the two descriptions differ. Line 84 says the prose "must name the template explicitly"; line 91 says the edits "extend an existing `gh pr create` suggestion with a flag". Those are the same deliverable only if the flag is the one that names the template, so that is the reading this plan takes: **append `--body-file .github/pull_request_template.md`**. The reasoning is mechanical rather than stylistic — `gh pr create` pre-fills from the template only in an interactive terminal, and an agent runs it non-interactively, so a bare `gh pr create` (the current text) gives an agent-opened PR no packet at all. `--body-file` is what makes the template actually arrive. Do not substitute `--body`, and do not add `--fill`: both replace the template body rather than seeding it.

Filling the four sections remains the human author's job (spec, Consumers: "no agent may fill them on the author's behalf"). An unfilled template on an agent-opened PR is the intended visible state, not a defect — the HTML comments are legible as unanswered.

- [ ] **Write failing test**

Append to `tests/pr-review-packet.test.mjs`:

```javascript
const SKILL_CONSUMERS = ["skills/validate/SKILL.md", "skills/implement/SKILL.md"];

for (const rel of SKILL_CONSUMERS) {
  test(`${rel} names the PR template in its gh pr create prose`, () => {
    const body = readFileSync(resolve(REPO_ROOT, rel), "utf8");
    const prLines = body.split("\n").filter((l) => l.includes("gh pr create"));
    assert.ok(prLines.length > 0, "expected at least one gh pr create suggestion");
    for (const line of prLines) {
      assert.match(
        line,
        /--body-file \.github\/pull_request_template\.md/,
        `gh pr create prose in ${rel} must name the template, else agent-opened PRs carry no packet`,
      );
    }
  });

  test(`${rel} adds no step directive or inline Node alongside the edit`, () => {
    const body = readFileSync(resolve(REPO_ROOT, rel), "utf8");
    for (const line of body.split("\n").filter((l) => l.includes("pull_request_template.md"))) {
      assert.ok(!/node\s+(--input-type=module\s+)?-e/.test(line), "no inline Node on the edited line");
      assert.ok(!/^Run inline Node/.test(line.trim()), "no step directive on the edited line");
    }
  });
}
```

- [ ] **Verify test fails**

Run: `node --test tests/pr-review-packet.test.mjs`
Expected: FAIL — `gh pr create prose in skills/validate/SKILL.md must name the template...` (and the same for `skills/implement/SKILL.md`). The two inline-Node cases pass vacuously before the edit; that is expected and they become meaningful after it.

- [ ] **Implement**

`skills/validate/SKILL.md:566` — inside the merge_policy `pr` output block:

```
Ready for PR. Run: gh pr create --base <target-branch> --body-file .github/pull_request_template.md
```

`skills/implement/SKILL.md:649` — inside the post-implementation PR block:

```
When validation passes, open a PR: gh pr create --base <target-branch> --body-file .github/pull_request_template.md
```

Both edits stay inside the existing fenced agent-output blocks. Add no new H3 section, no bullet step, no `adev <verb>` invocation adjacent to an inline-Node block, and no control flow — the change is one flag on one existing line in each file.

Then regenerate the provider mirrors:

```bash
node scripts/sync-provider-skills.mjs
```

Expected: the four `providers/{codex,opencode}/skills/{validate,implement}/SKILL.md` files pick up the same line. Do not hand-edit them.

Finally, amend the spec's Consumers bullet. It currently reads that `gh pr create` populates the body from the template "only when neither `--body` nor `--fill` is passed" — accurate of the pre-edit state, but `--body-file` is a `--body` form, so once this task ships the sentence no longer describes the shipped mechanism. Replace it with one sentence stating that agent-opened PRs pass `--body-file .github/pull_request_template.md` because the interactive pre-fill path is unavailable non-interactively. Keeping specs current when code changes their assumptions is required by the constitution's Autonomous boundary, and leaving it stale would surface as a `/adev:validate` spec-compliance finding. Bump the spec's frontmatter `revision: 1` → `2` and set `updated:` to the edit date, so `/adev:hygiene` reads the amendment as a deliberate revision rather than as drift against the recorded review.

- [ ] **Verify test passes**

Run: `node --test tests/pr-review-packet.test.mjs`
Expected: PASS (10 tests).
Then: `node --test tests/sync/provider-skill-parity.test.mjs` — expected PASS (the dry-run sync reports no drift).
Then: `npm test` — expected PASS. The `.githooks/pre-commit-no-inline-node` chain also runs on commit; it must not fire, since neither edit introduces an inline-Node pattern or a both-forms H3 section, and provider mirrors are out of that hook's scope.

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md skills/implement/SKILL.md \
        providers/codex/skills/validate/SKILL.md providers/codex/skills/implement/SKILL.md \
        providers/opencode/skills/validate/SKILL.md providers/opencode/skills/implement/SKILL.md \
        tests/pr-review-packet.test.mjs \
        .context-index/specs/features/pr-review-brief/review-packet-template.spec.md
git commit -m "feat(pr-review-brief): name PR template in gh pr create prose

Spec: .context-index/specs/features/pr-review-brief/review-packet-template.spec.md
Plan-task: 2"
```

---

### Task 3: `adev pr body` interlock test [specialist: none] **[BLOCKED — do not dispatch]**

**Depends on:** Task 1, and on an external precondition outside this spec's control.
**Blocked by:** `adev pr body` does not exist. The verb is defined by `.context-index/specs/features/pr-review-brief/pr-body-composition.spec.md`, which is currently **review-BLOCK** with its build halted (`pr-body-composition.blockers.md`). This task becomes dispatchable when that spec clears review and the verb ships.
**Charter capability:** Review packet field set — the authorship boundary between generated and author-written content.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/pr-review-packet.test.mjs` (append the interlock case)

**Tests:** `tests/pr-review-packet.test.mjs`

**Context to load:**
- `.context-index/specs/features/pr-review-brief/review-packet-template.spec.md` (Consumers → `adev pr body`; AC-6)
- `.context-index/specs/features/pr-review-brief/review-packet-template.review.md` (CON-1 — the finding this task settles)
- `.context-index/specs/features/pr-review-brief/pr-body-advisories.spec.md` ("Size Advisory: Computation and Exception Classes" — the inline pointer the interlock must tolerate)
- `.context-index/specs/features/pr-review-brief/pr-body-composition.spec.md` (the verb's output-path enumeration, once it clears review)

**Acceptance criteria covered:** AC-6 — and only AC-6. Until this task runs, AC-6 is **deferred by design, not uncovered**. A validation pass that finds AC-6 unchecked should read this task, not file a coverage gap.

**Pinned assertion (settles review finding CON-1).** The interlock is: **no output line of `adev pr body` begins with `## ` followed by one of the four packet heading strings.** It is a per-line, start-of-line heading check — not a substring search over the whole output. The distinction is load-bearing: `pr-body-advisories.spec.md` requires the size-advisory renderer to point the author at the packet's problem-statement section by name, quoted inline in prose (`` `## What` ``). That inline reference is designed behavior and must pass. A substring implementation would fail it, manufacturing a contradiction between two sibling specs that were revised together specifically to avoid one.

Reuse the exported `PACKET_HEADINGS` constant from Task 1 rather than restating the four strings — one contractual list, one place to change it.

- [ ] **Write failing test**

Append to `tests/pr-review-packet.test.mjs`:

```javascript
test("adev pr body emits no packet heading as a heading line", () => {
  // Interlock, per AC-6 and review finding CON-1. Heading-line semantics only:
  // an inline `## What` quoted in advisory prose is permitted by design
  // (pr-body-advisories.spec.md), a line *beginning* with "## What" is not.
  for (const output of prBodyOutputPaths()) {   // enumerate every output path of the verb
    for (const line of output.split("\n")) {
      for (const heading of PACKET_HEADINGS) {
        assert.ok(
          !line.startsWith(heading),
          `generated output emitted "${heading}" as a heading — packet and brief must never interleave`,
        );
      }
    }
  }
});
```

`prBodyOutputPaths()` is a placeholder for whatever fixture surface `pr-body-composition.spec.md` settles on. Cover, at minimum: the nominal path, the degraded paths the charter's Observability attribute requires (missing routing sidecar, absent validate report, untraced commits), and the size-advisory path — that last one is the case CON-1 is about, so it must be present rather than assumed.

- [ ] **Verify test fails**

Run: `node --test tests/pr-review-packet.test.mjs`
Expected: FAIL — the verb or its fixture surface does not resolve. **If this task is reached while `adev pr body` still does not exist, stop and re-block it; do not stub the verb to make the test green.** A stubbed interlock asserts nothing about the real generator.

- [ ] **Implement**

No implementation in this spec. The interlock constrains the *other* side of the boundary: if it fails, the fix belongs in `adev pr body`'s renderer, never in `.github/pull_request_template.md`. The template's four headings are contractual and are not adjusted to accommodate a generator.

- [ ] **Verify test passes**

Run: `node --test tests/pr-review-packet.test.mjs`
Expected: PASS across every enumerated output path, including the size-advisory path carrying its inline `` `## What` `` reference.

- [ ] **Commit**

```bash
git add tests/pr-review-packet.test.mjs
git commit -m "test(pr-review-brief): interlock adev pr body against packet headings

Spec: .context-index/specs/features/pr-review-brief/review-packet-template.spec.md
Plan-task: 3"
```

---

## Quality Gates

After all dispatchable tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gates are taken from `.context-index/governance/gates.yaml`, which supersedes the constitution's generic list:

- **`test` — Test Suite** (deterministic, tier `fast`, severity `error`, triggers `post-task` / `post-implement`): `npm test`

No lint or typecheck gate is active in this repo — both are commented out in `gates.yaml` with empty commands, so neither is run.

Additional non-gate checks that apply to this change set:

- `.githooks/pre-commit-no-inline-node` runs on every commit touching `skills/**/SKILL.md` (Task 2). Exit 2 means a policy violation; do not bypass with `--no-verify`.
- `tests/sync/provider-skill-parity.test.mjs` runs inside `npm test` and fails on any drift between `skills/**/SKILL.md` and its `providers/{codex,opencode}/skills/**` mirrors. Task 2 must run `node scripts/sync-provider-skills.mjs` and stage the result.
- `package.json` must be unchanged across the whole plan (AC-8).

**Acceptance-criteria coverage:** AC-1 through AC-5 and AC-8/AC-9 by Task 1; AC-7 by Task 2; AC-6 by Task 3, deferred until `adev pr body` exists. AC-10 (`npm test`) and AC-11 (no constitutional violations beyond the documented naming exception) are verified by `/adev:validate`, not by a task.

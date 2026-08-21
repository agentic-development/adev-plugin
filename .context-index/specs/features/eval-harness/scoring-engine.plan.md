<!-- partial_schema: plan@1 -->

# Implementation Plan: Rubric scoring engine and adev eval score verb

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md (revision 9)
> **Review:** PASS (2026-08-20) — round 9, 0 findings above suggestion
> **Platform:** Node.js, JavaScript (ESM `.mjs`), npm, `node:test` — no framework, zero external dependencies

**Goal:** Close the last two behaviours of the scoring-engine spec — make `--rubric default` resolve the plugin's shipped rubric from an unforgeable, module-derived plugin root (BEH-11), and make `skills/eval/SKILL.md` actually pass that keyword (BEH-12) — then prove the pair with a regression test whose four properties are each chosen because the weaker version of that property passed against the broken code.

**Architecture:** BEH-11 adds one branch to `cmdScore` in `lib/cli/eval.mjs`: the literal token `default` is a *keyword naming a known location*, not a path, so it skips project-root containment and is loaded with `getPluginRoot()`'s return value as its containment boundary instead — `loadRubric(<shipped path>, { projectRoot: pluginRoot })`, reusing the shipped loader's own containment sequence rather than adding a second one. `getPluginRoot()` (`lib/profiles/index.mjs`) derives that root from `__dirname` two levels up; nothing in the branch reads `process.env`. Every other `--rubric` value falls through to the unchanged BEH-9 path. BEH-12 is a prose change in `skills/eval/SKILL.md` propagated to both provider mirrors by `scripts/sync-provider-skills.mjs`, plus the matching correction to `docs/cli-reference.md`, which `CLAUDE.md` names as the authority an agent reads for verb signatures.

---

## This is a re-plan. Ten of twelve behaviours are already shipped.

Spec revision 5 was planned as 11 tasks, implemented across 12 commits (`07b5ab04..ca32e1f3`), and then **failed `/adev:validate` on a reproduced integration defect**: `adev eval score --rubric <path>` refused the shipped default rubric in every real install, because the plugin root and the project root are different directories everywhere except this repository. Spec revisions 6-9 fixed the spec. This plan covers **only** the work revision 9 added.

**Already shipped — do not re-plan, do not re-implement, do not re-test:**

| Behaviour | Shipped as |
|---|---|
| BEH-1 result shape with separately addressable halves | `lib/evals/score.mjs` |
| BEH-2 denominator exclusion | `lib/evals/score.mjs` |
| BEH-3 insufficient-evidence guard incl. the threshold-independent clause | `lib/evals/score.mjs` |
| BEH-4 not-scored handling | `lib/evals/score.mjs` |
| BEH-5 empty-evidence rejection | `lib/evals/score.mjs` |
| BEH-6 verdict-set id mismatch | `lib/evals/score.mjs` |
| BEH-7 `buildJudgeContext` isolation | `lib/evals/score.mjs` |
| BEH-8 `adev eval score` output shape | `lib/cli/eval.mjs` |
| BEH-9 path containment on `--rubric`/`--input` | `lib/cli/eval.mjs` |
| BEH-10 threshold type/range validation | `lib/evals/score.mjs` |

Plus `lib/evals/score-schema.mjs`, 18 files under `tests/lib/evals/` and `tests/cli/`, 9 fixtures under `tests/fixtures/evals/`, and the `skills/eval/SKILL.md` Layer 3 rewrite with both provider mirrors. `npm test` is green at 7270 pass / 0 fail. **A task below that touches `lib/evals/score.mjs` arithmetic is out of scope and should be rejected in review.**

**Not yet built — the six tasks in this plan:** BEH-11, BEH-12, the docs correction, the re-anchored prose-derived test, the end-to-end regression test, and two housekeeping items `/adev:validate` flagged.

---

## The regression test is the point of this round

The spec mandates four properties for the end-to-end test (Task 5). Each exists because the weaker version of it **already passed against the broken code**. Weakening any one of them reintroduces the defect class, so they are restated here verbatim as acceptance conditions on that task, not as guidance:

1. **Run through the real `dispatch()` → verb-module wiring, not a stubbed internal helper** — otherwise the test proves nothing about how the plugin root is actually obtained. A test that imports `cmdScore` and hands it a `pluginRoot` argument asserts the argument, not the derivation.
2. **Plugin root OUTSIDE the project root** — in this repository `<ADEV_ROOT>` and the project root are the *same directory*, which is precisely why the original defect passed 7270 tests and five review rounds. A same-root test is green against broken code.
3. **Assert on the argument `skills/eval/SKILL.md`'s documented flow actually passes** — otherwise a test that calls `--rubric default` directly stays green while the real caller still sends a resolved path. The test must *derive* the argument from the skill prose and feed that derived value to the CLI.
4. **Set `CLAUDE_PLUGIN_ROOT` to a decoy and assert the SHIPPED rubric still loads**, passed through a spawned process's `env:` rather than by mutating `process.env` in-process (20 of the repository's 21 env-reading test files already do this). The decoy must carry a *different, distinguishable* rubric so "the shipped one loaded" is asserted positively rather than inferred from the absence of an error.

---

## File Structure

**Create:**

- `tests/cli/eval-default-rubric-keyword.test.mjs` — BEH-11 in-process suite: the keyword branch resolves the shipped rubric, non-`default` values keep the BEH-9 project-root branch, and `SCORE_DEFAULT_RUBRIC_MISSING` fires when the shipped file is absent
- `tests/skills/eval-rubric-keyword-emission.test.mjs` — BEH-12: `skills/eval/SKILL.md` and both provider mirrors emit the literal `default`, plus the no-live-emitter sweep over `skills/**`, `providers/**`, `docs/**`
- `tests/cli/eval-default-rubric-e2e.test.mjs` — the four-property end-to-end regression test

**Modify:**

- `lib/cli/eval.mjs:202-241` — the `default` keyword branch in `cmdScore`, plus the `help()` text that currently states both flags are project-root contained
- `lib/evals/score-schema.mjs:60-88` — add `SCORE_DEFAULT_RUBRIC_MISSING` to `SCORE_ERROR_CODES`; correct the two stale comments that claim the table "enumerates nine"
- `skills/eval/SKILL.md:112-120,164,288` — the Rubric resolution list, the `adev eval score` invocation line, and the config-block comment
- `providers/codex/skills/eval/SKILL.md` — regenerated by `scripts/sync-provider-skills.mjs`, never hand-edited
- `providers/opencode/skills/eval/SKILL.md` — likewise
- `docs/cli-reference.md:821-852` — the `--rubric` signature prose and both example lines
- `tests/skills/eval-default-rubric.test.mjs:44-56` — re-anchor `documentedRubricPath()` to the prose BEH-12 rewrites
- `tests/lib/evals/score-schema-contract.test.mjs:10-20` — extend the code-vocabulary assertion to the two codes appended beyond the original nine
- `.context-index/specs/features/eval-harness/scoring-engine.spec.md` (frontmatter `source-manifest` only) — add the 11 files the stamp omits

**Reference (read, do not modify):**

- `lib/profiles/index.mjs:28-30` — `getPluginRoot()`, the `__dirname`-derived root BEH-11 requires
- `lib/evals/rubric.mjs:827-880` — `loadRubric(path, { projectRoot })`; the keyword branch reuses this containment sequence rather than adding a second one
- `cli/index.mjs:1974,2006-2081` — `VERB_REGISTRY` and `dispatch()`; `projectRoot` is `process.cwd()`, which is what lets the e2e test separate the two roots
- `tests/helpers.mjs:156-171` — `runCLI()`; the existing spawn-with-`env:` precedent
- `tests/cli-hooks-path-symlink-containment.test.mjs` — the repo's containment-test idiom
- `scripts/sync-provider-skills.mjs` + `tests/sync/provider-skill-parity.test.mjs` — the mirror transform and its quality gate

---

## Context Packets

### Task 1 Context — `--rubric default` keyword resolution
- Spec: `scoring-engine.spec.md` — BEH-11, BEH-9, and the `SCORE_DEFAULT_RUBRIC_MISSING` row of the Error Cases table
- Charter: `eval-harness/charter.md` (capability: Scoring engine and `adev eval score`)
- Source (full read): `lib/cli/eval.mjs`, `lib/evals/score-schema.mjs`
- Source (signatures only): `lib/profiles/index.mjs` (`getPluginRoot`), `lib/evals/rubric.mjs` (`loadRubric`), `lib/path-safety.mjs`
- Test structure: `tests/cli/eval-score.test.mjs` (existing BEH-8/BEH-9 suite — the sibling this one sits beside)
- Constitution: "Minimize external dependencies", "Pure ESM", "No hardcoded paths to `~/.claude/` — use the plugin root resolution from `cli/index.mjs`"
- Boundary rules: `governance/boundaries.yaml` — content-matched rules only (CommonJS, inline-Node, `~/.claude/` literals); this task adds none of them

### Task 2 Context — pass the keyword from the skill
- Spec: `scoring-engine.spec.md` — BEH-12 in full, including its closing sentence on why the mirrors need no separate clause
- Source (full read): `skills/eval/SKILL.md` sections "Rubric resolution" and "Step 3 — Aggregate for trend tracking"
- Source (read, do not edit): `providers/codex/skills/eval/SKILL.md`, `providers/opencode/skills/eval/SKILL.md`
- Tooling: `scripts/sync-provider-skills.mjs`, `tests/sync/provider-skill-parity.test.mjs` (the gate that makes hand-editing a mirror fail)
- Constitution: "No executable logic inside SKILL.md files"; "Fenced JavaScript in SKILL.md must be descriptive-reference only"

### Task 3 Context — correct the documented invocation
- Spec: `scoring-engine.spec.md` — the "Correct the documented invocation" task row and the no-live-emitter acceptance criterion, which names the exact sweep scope
- Source (full read): `docs/cli-reference.md` § `eval` (lines 812-856)
- Reference: `CLAUDE.md` Context Routing table — the line that makes `docs/cli-reference.md` the authority an agent reads instead of the source
- Heuristic: `universal-claim-needs-a-predicate` (below) — this task is the predicate half of that criterion

### Task 4 Context — re-anchor the prose-derived rubric test
- Source (full read): `tests/skills/eval-default-rubric.test.mjs`, especially its header comment stating *why* it derives the path from prose
- Source (read): `skills/eval/SKILL.md` post-Task-2 prose
- Spec: `scoring-engine.spec.md` — the "Re-anchor the prose-derived rubric test" task row

### Task 5 Context — end-to-end regression test
- Spec: `scoring-engine.spec.md` — BEH-11, BEH-12, and the four regression-test acceptance criteria; **read the Task Map's "End-to-end regression test" row verbatim**
- Source (full read): `cli/index.mjs` `dispatch()` (lines 2006-2081) and `VERB_REGISTRY` (line 1974)
- Source (full read): `lib/cli/eval.mjs` after Task 1
- Test structure: `tests/helpers.mjs` (`runCLI`, `createTempDir`, `cleanupTempDir`), `tests/cli-hooks-path-symlink-containment.test.mjs`
- Fixtures: `tests/fixtures/evals/verdicts/*.json`, `skills/eval/default-rubric.yaml`
- Runner: `scripts/run-tests.mjs` — confirms `tests/cli/**` is inside the default `npm test` partition (only `tests/evals/**` and nested-project suites are excluded)

### Task 6 Context — housekeeping
- Source (full read): `lib/evals/score-schema.mjs` comment block at lines 60-88
- Spec: `scoring-engine.spec.md` frontmatter `source-manifest`, and the "Every error code the implementation can raise appears in the Error Cases table" criterion
- Tooling: `adev source-manifest compute --files <p1>,<p2>,…` and `adev source-manifest verify --spec <path>`
- Prior validate report: `.context-index/specs/features/eval-harness/scoring-engine.validate.md`

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over. Scope it to live surfaces (`skills/`, `providers/`, `docs/`) and exclude directories that archive review and validate artifacts, since those necessarily quote the pattern being forbidden. Match on the meaningful component rather than an exact string, so equivalent forms (absolute vs repo-relative) are both caught.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion — "no occurrence anywhere in the repository". An unbounded universal followed by a bounded list of examples cannot be discharged, and reads as coverage while providing none. The failure is self-demonstrating: a criterion forbidding a pattern must quote that pattern to describe itself, so a literal grep fails on the criterion's own document.
- **Evidence:** 1 observation
- **Applies to:** Task 3 — this heuristic *is* the shape of the no-live-emitter sweep. Its scope (`skills/**`, `providers/**`, `docs/**`, excluding `.context-index/`) and its match-on-path-component rule are both taken directly from it.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (`message.usage` fields).
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions.
- **Evidence:** 1 observation
- **Applies to:** none of the six tasks. Recorded for module completeness; the Run-cost record capability is a later spec.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context.
- **Anti-pattern:** Focus on reducing input token counts.
- **Evidence:** 1 observation
- **Applies to:** Task 5 indirectly — the e2e test copies a plugin tree into a temp directory; keep the copy to `cli/`, `lib/`, `package.json`, and `skills/eval/default-rubric.yaml` rather than the whole repo, and never echo the copied tree into output.

---

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 → Task 3. Task 2 changes the prose Task 3's sweep asserts is clean; Task 3's sweep fails while `docs/cli-reference.md` still carries the two live emitters. Task 1 must land first because Task 2's prose instructs an invocation that does not yet work.
- **Group B (after Task 2):** Task 4 — re-anchors a test against Task 2's new prose. No file overlap with Task 3.
- **Group C (after Tasks 1 and 2):** Task 5 — reads Task 2's prose and exercises Task 1's branch. Creates one new file, modifies none.
- **Group D (last):** Task 6 — its source-manifest stamp must cover every file the other five tasks touched, so it cannot run before them.

Groups B and C may run in parallel with each other once Task 2 is committed. Group D is strictly last.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `--rubric default` keyword resolution (BEH-11) | medium | unit | — | 1 create, 3 modify |
| 2 | Pass the keyword from the skill (BEH-12) | small | unit | Task 1 | 1 create, 3 modify |
| 3 | Correct the documented invocation + no-live-emitter sweep | small | unit | Task 2 | 0 create, 2 modify |
| 4 | Re-anchor the prose-derived rubric test | small | unit | Task 2 | 0 create, 1 modify |
| 5 | End-to-end regression test (four properties) | large | unit | Task 1, Task 2 | 1 create, 0 modify |
| 6 | Housekeeping: source-manifest completion + stale comments | small | unit | Tasks 1-5 | 0 create, 2 modify |

All six tasks resolve to `strategy: unit` (source: fallback — the spec declares no `test_strategy`, `manifest.yaml` declares no `test_strategies` globs, and detection returns `unit` for `lib/**`, `tests/**`, `cli/**`, `skills/**`, and `docs/**` paths). Per the Strategy Summary rule that section is omitted. The spec declares no `infra_requirements:` and no task carries a non-unit strategy, so the Test Infrastructure Requirements section is omitted as well. Task 5 spawns a child `node` process and writes into `os.tmpdir()`, which is process-local and hermetic — it needs no external system, no credential, and no network, so it is a unit test that happens to fork.

**Test granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). One suite per spec behaviour. BEH-11 and BEH-12 are each new, so Tasks 1 and 2 each *create* a suite. Task 3 *extends* Task 2's BEH-12 suite rather than creating a third, because the no-live-emitter sweep is a BEH-12 assertion. Task 5 creates a suite that is not per-behaviour and says so: it asserts the BEH-11 × BEH-12 *integration*, a joint property neither single-behaviour suite can express in-process. Tasks 4 and 6 modify existing suites only.

**Specialist routing:** `manifest.yaml` declares `specialists: []`, so every task is `[specialist: none]`. No routing tags are available to assign.

**Constitution boundary check:** no task creates a service, touches auth, changes the hook protocol (stdin/stdout JSON contract), alters the CLI installation path structure, changes the plugin registration format, or adds a dependency. Task 1 adds a *branch* to an already-registered verb, not a registry entry. Task 2 edits skill markdown (explicitly autonomous). Tasks 3 and 6 update documentation and a spec's source manifest (explicitly autonomous, and required rather than optional). No task requires human approval. `governance/boundaries.yaml` rules are content-matched (CommonJS, inline-Node, `~/.claude/` literals, version fields): Task 2 is the only task touching a `skills/**/SKILL.md`, and it adds no inline-Node and no hardcoded `~/.claude/` path. **No task bumps `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json`** — release-please owns those (ADR-0008).

---

### Task 1: `--rubric default` keyword resolution (BEH-11) [specialist: none]

**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/cli/eval-default-rubric-keyword.test.mjs`
- Modify: `lib/cli/eval.mjs:202-241` (the `cmdScore` body) and `lib/cli/eval.mjs:262-271` (`help()`)
- Modify: `lib/evals/score-schema.mjs:60-88` — append `SCORE_DEFAULT_RUBRIC_MISSING` to `SCORE_ERROR_CODES`
- Modify: `tests/lib/evals/score-schema-contract.test.mjs:10-20`
- Test: `tests/cli/eval-default-rubric-keyword.test.mjs`

**Tests:** create `tests/cli/eval-default-rubric-keyword.test.mjs` — the BEH-11 suite. BEH-11 is a new behaviour, so under `per-behavior` granularity it gets its own suite rather than extending `tests/cli/eval-score.test.mjs` (which owns BEH-8 and BEH-9).

**Context to load:** the Task 1 Context Packet above.

- [ ] **Write failing test**

Four cases, all driving the exported `run({ projectRoot, argv })` from `lib/cli/eval.mjs` with `process.exit` and `console.log` captured (the existing `tests/cli/eval-score.test.mjs` already establishes that idiom — reuse it, do not invent a second one):

```javascript
// 1. the keyword resolves the shipped rubric from a project root that is NOT
//    the plugin root, and scores successfully
// 2. a project root outside the plugin root does not make the keyword unsafe:
//    no UNSAFE_SCORE_PATH is raised for --rubric default
// 3. a non-`default` --rubric value is still contained against the project
//    root: `../../etc/passwd` still exits non-zero with UNSAFE_SCORE_PATH
// 4. the branch reads no environment variable: assert the module source of
//    lib/cli/eval.mjs contains no `process.env` reference at all
```

Case 4 is a source-level assertion on purpose. It is cheap, it cannot be satisfied by accident, and it states the prohibition BEH-11 makes ("never from a caller-settable environment variable") as a property of the file rather than of one code path a later refactor might add a second branch beside. The behavioural half of the same prohibition is Task 5's property 4.

Also extend `tests/lib/evals/score-schema-contract.test.mjs` in the same commit so the code vocabulary stays the single source of truth: add `SCORE_DEFAULT_RUBRIC_MISSING` and `SCORE_INPUT_PARSE_ERROR` to the list the "every error code named in the spec's Error Cases table is declared" test iterates. Both are in the revision-9 table; the test still checks only the original nine.

- [ ] **Verify test fails**

Run: `node --test tests/cli/eval-default-rubric-keyword.test.mjs tests/lib/evals/score-schema-contract.test.mjs`
Expected: FAIL — case 1 exits non-zero with `UNSAFE_SCORE_PATH: path "default" escapes the project root.` (today `default` is treated as a relative path and contained against the project root); the schema-contract addition fails with `missing code SCORE_DEFAULT_RUBRIC_MISSING`.

- [ ] **Implement**

In `lib/evals/score-schema.mjs`, append the code to `SCORE_ERROR_CODES` with a one-line comment tying it to BEH-11.

In `lib/cli/eval.mjs`, import `getPluginRoot` from `../profiles/index.mjs` and branch in `cmdScore` **before** `containPath(absRoot, rubricArg)` is reached:

```javascript
// Descriptive reference — the shape the implementation takes, not an
// instruction to run this snippet:
//
//   const isDefaultKeyword = rubricArg === "default";
//   if (isDefaultKeyword) {
//     const pluginRoot = lenientRealpath(resolve(getPluginRoot()));
//     const shipped = join(pluginRoot, "skills", "eval", "default-rubric.yaml");
//     if (!existsSync(shipped)) throw codedError("SCORE_DEFAULT_RUBRIC_MISSING", ...);
//     rubric = loadRubric(shipped, { projectRoot: pluginRoot });
//   } else {
//     containPath(absRoot, rubricArg);
//     rubric = loadRubric(rubricArg, { projectRoot: absRoot });
//   }
```

Constraints an implementer must not "simplify" away:

- **The plugin root comes from `getPluginRoot()` and nowhere else.** No `process.env.CLAUDE_PLUGIN_ROOT`, no `opts.pluginRoot` parameter threaded in from the caller, no `--plugin-root` flag. The keyword's entire safety argument is that its location is unforgeable: it is the one branch permitted to skip project-root containment, so a caller-settable root would make it a weaker posture than the containment it skips.
- **`--input` containment is unchanged.** The keyword affects `--rubric` only. `containPath(absRoot, inputArg)` still runs, and still runs before any file is opened.
- **The exact literal `default` only.** Not `Default`, not `default.yaml`, not a `default:` prefix. Anything else is a path and takes the BEH-9 branch.
- **`loadRubric` does the reading.** Do not add a second containment sequence or a second `readFileSync` — pass `{ projectRoot: pluginRoot }` and let the shipped loader apply its own resolve, realpath, and re-check, exactly as the BEH-9 branch does with `absRoot`.

Then correct `help()`: it currently states that "`--rubric` and `--input` are both containment-checked against the project root", which becomes false for the keyword. Add the keyword to the usage line and one sentence naming its plugin-root boundary.

- [ ] **Verify test passes**

Run: `node --test tests/cli/eval-default-rubric-keyword.test.mjs tests/lib/evals/score-schema-contract.test.mjs tests/cli/eval-score.test.mjs`
Expected: PASS, including the pre-existing BEH-8/BEH-9 suite unchanged.

- [ ] **Commit**

Branch (if not already created): `feat/eval-harness/default-rubric-keyword`

Stage `lib/cli/eval.mjs`, `lib/evals/score-schema.mjs`, `tests/cli/eval-default-rubric-keyword.test.mjs`, and `tests/lib/evals/score-schema-contract.test.mjs`, then commit with:

```text
feat(eval-harness): resolve --rubric default against the module-derived plugin root

Spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
Plan-task: 1
```

---

### Task 2: Pass the keyword from the skill (BEH-12) [specialist: none]

**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/skills/eval-rubric-keyword-emission.test.mjs`
- Modify: `skills/eval/SKILL.md:112-120` (Rubric resolution), `:164` (the `adev eval score` invocation), `:288` (config-block comment)
- Modify: `providers/codex/skills/eval/SKILL.md` — **regenerated, never hand-edited**
- Modify: `providers/opencode/skills/eval/SKILL.md` — **regenerated, never hand-edited**
- Test: `tests/skills/eval-rubric-keyword-emission.test.mjs`

**Tests:** create `tests/skills/eval-rubric-keyword-emission.test.mjs` — the BEH-12 suite. Task 3 extends this same file rather than creating a third.

**Context to load:** the Task 2 Context Packet above.

- [ ] **Write failing test**

```javascript
// For skills/eval/SKILL.md AND each providers/*/skills/eval/SKILL.md:
//   a. the Step 3 `adev eval score` invocation line passes `--rubric default`
//      (the literal token), not `<resolved rubric path>` and not an
//      <ADEV_ROOT>-prefixed path
//   b. the Rubric resolution section states that the shipped-default case
//      passes the literal `default` and does NOT pre-resolve it
//   c. no `--rubric` argument anywhere in the file is a path ending in
//      default-rubric.yaml
```

Case (c) is the per-file form of Task 3's repo-wide sweep; keeping it here as well means a mirror regression is attributed to this suite rather than only to the sweep.

- [ ] **Verify test fails**

Run: `node --test tests/skills/eval-rubric-keyword-emission.test.mjs`
Expected: FAIL — case (a) fails on all three files: line 164 reads `adev eval score --rubric <resolved rubric path> --input <verdict file path>`.

- [ ] **Implement**

Edit `skills/eval/SKILL.md` only:

1. **Rubric resolution section (lines ~112-120).** Keep the three-step resolution order. Change what step 3 and the shipped-rubric sentence *instruct*: when the shipped default is selected (no `--rubric`, or `rubric: default` in config), pass the literal token `default` to `adev eval score --rubric` and let the verb resolve it against the plugin root. State plainly that the skill must **not** expand it to an `<ADEV_ROOT>`-relative path, and say why in one clause — a resolved path takes the verb's project-root branch and is refused in every real install. Keep the sentence naming `<ADEV_ROOT>/skills/eval/default-rubric.yaml` as *what the keyword resolves to*; it is Task 4's anchor, and it is a description of the keyword's target rather than a `--rubric` value.
2. **Step 3 invocation (line ~164).** Replace `--rubric <resolved rubric path>` with `--rubric default` for the shipped case, and note in one line that a user-supplied `--rubric <path>` is passed through unchanged.
3. **Config block comment (line ~288).** Keep `rubric: default`; keep the comment describing what it resolves to.
4. **Mirrors.** Run `node scripts/sync-provider-skills.mjs`, then commit what it wrote. Do not hand-edit either provider file — `tests/sync/provider-skill-parity.test.mjs` runs the real sync script as a quality gate, which is exactly why BEH-12 needs no separate clause for the mirrors.

Do not add any inline-Node block, any `node -e`, or any fenced JavaScript carrying control flow — `hooks/pre-commit-no-inline-node.sh` rejects the commit, and the constitution's anti-pattern list forbids it independently.

- [ ] **Verify test passes**

Run: `node --test tests/skills/eval-rubric-keyword-emission.test.mjs tests/sync/provider-skill-parity.test.mjs tests/skills-extension-coverage.test.mjs`
Expected: PASS — including parity, which proves the mirrors were regenerated rather than edited.

- [ ] **Commit**

Run `node scripts/sync-provider-skills.mjs`, stage `skills/eval/SKILL.md`, both `providers/*/skills/eval/SKILL.md` mirrors, and `tests/skills/eval-rubric-keyword-emission.test.mjs`, then commit with:

```text
fix(eval-harness): pass the literal default keyword from the eval skill

Spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
Plan-task: 2
```

---

### Task 3: Correct the documented invocation + no-live-emitter sweep [specialist: none]

**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `docs/cli-reference.md:821-852` — the `--rubric` signature bullet, the containment paragraph, and both example lines
- Modify: `tests/skills/eval-rubric-keyword-emission.test.mjs` — add the repo-wide sweep
- Test: `tests/skills/eval-rubric-keyword-emission.test.mjs`

**Tests:** extend `tests/skills/eval-rubric-keyword-emission.test.mjs` (created by Task 2). The sweep is a BEH-12 assertion, so under `per-behavior` granularity it belongs in the BEH-12 suite rather than in a new file.

**Context to load:** the Task 3 Context Packet above.

- [ ] **Write failing test**

Add the no-live-emitter sweep the spec's acceptance criterion specifies, with its scope taken verbatim from that criterion:

```javascript
// Walk skills/**, providers/** and docs/** — EXCLUDING .context-index/,
// which archives review and validate artifacts that necessarily quote the
// forbidden pattern. For every occurrence of a `--rubric <value>` argument,
// fail if the value's PATH COMPONENT ends in `default-rubric.yaml`. Match
// both repo-relative (`skills/eval/default-rubric.yaml`) and absolute
// plugin-cache (`/…/agentic-development/adev/<v>/skills/eval/default-rubric.yaml`)
// forms. Expected result: zero matches.
//
// Assert on the match LIST, not just the count, so a failure names the file
// and line rather than only a number.
```

Two properties this sweep must have, both from the `universal-claim-needs-a-predicate` heuristic:

- **It is scoped, not unbounded.** "No occurrence anywhere in the repository" cannot be discharged — the acceptance criterion itself quotes the forbidden pattern to describe itself, so `.context-index/` must be excluded or the criterion's own document fails the check it states.
- **It matches on the path component, not an exact string.** A future absolute plugin-cache path must be caught by the same predicate as the repo-relative one.

- [ ] **Verify test fails**

Run: `node --test tests/skills/eval-rubric-keyword-emission.test.mjs`
Expected: FAIL — **exactly two matches, both in `docs/cli-reference.md`** (lines 851 and 852). This count is the pre-state recorded by the previous `/adev:validate`; a run that reports a different number before the fix means something else drifted and should be investigated rather than absorbed.

- [ ] **Implement**

In `docs/cli-reference.md` § `eval`, make three coordinated edits. Fixing the examples while leaving the prose leaves the page self-contradictory, which is why the spec's task row names both:

1. **Signature bullet (line ~823).** `--rubric <path>` becomes `--rubric <path|default>`: a rubric YAML file containment-checked against the project root, **or** the literal keyword `default`, which resolves the plugin's shipped `skills/eval/default-rubric.yaml`.
2. **Containment paragraph (lines ~829-836).** It currently opens "Both `--rubric` and `--input` are contained against the project root". Qualify it: that holds for every `--rubric` *path* value, and is unchanged; the `default` keyword is not a path and is contained against the **plugin root** instead, derived from the verb module's own location on disk and never from an environment variable. Name `SCORE_DEFAULT_RUBRIC_MISSING` as the error when the shipped file is absent.
3. **Examples (lines ~851-852).** Both become `--rubric default`.

- [ ] **Verify test passes**

Run: `node --test tests/skills/eval-rubric-keyword-emission.test.mjs`
Expected: PASS — the sweep returns zero matches.

Then confirm the docs suite still passes: `node --test tests/docs/` and `node --test tests/repomap/doc-references.test.mjs`.

- [ ] **Commit**

Stage `docs/cli-reference.md` and `tests/skills/eval-rubric-keyword-emission.test.mjs`, then commit with:

```text
docs(eval-harness): document --rubric default and drop the refused example

Spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
Plan-task: 3
```

---

### Task 4: Re-anchor the prose-derived rubric test [specialist: none]

**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `tests/skills/eval-default-rubric.test.mjs:44-56` (`documentedRubricPath()` and the constants it feeds)
- Test: `tests/skills/eval-default-rubric.test.mjs`

**Tests:** extend `tests/skills/eval-default-rubric.test.mjs`. It is a pre-existing suite guarding the rubric *contract* (the file exists, parses, stays flat, carries every documented key); this task keeps that guard pointed at the right file after Task 2 rewrites the prose it reads.

**Context to load:** the Task 4 Context Packet above.

- [ ] **Write failing test**

This suite's own header states why it derives the rubric path from `SKILL.md` rather than hardcoding it: *"a test that only asserts `skills/eval/default-rubric.yaml` exists would still pass if the skill later pointed somewhere else, which is the exact drift being fixed."* Task 2 rewrites that prose, so the test either breaks or silently stops testing what it was written to guard. Re-anchor it, and add the assertion that makes the new silent-pass mode impossible:

```javascript
// 1. documentedRubricPath() anchors on the sentence that DEFINES what the
//    `default` keyword resolves to, not on any incidental path mention
// 2. a new assertion: SKILL.md must actually contain that defining sentence.
//    Without it the regex falls back to "" and every downstream assertion
//    degrades to a vacuous pass on a `__missing__` path — the same silent
//    stop-testing mode the header warns about, one level up
// 3. the derived path still resolves to a real, parseable, key-complete file
```

Assertion 2 is the load-bearing addition. The current `assert.notEqual(RUBRIC_REL, "")` catches an *empty* match; it does not catch a match that landed on a different sentence than intended.

- [ ] **Verify test fails**

Run: `node --test tests/skills/eval-default-rubric.test.mjs`
Expected: FAIL on assertion 2 before the anchor is updated. To confirm the guard is real rather than incidentally green, also falsify it: temporarily remove the keyword-definition sentence from `skills/eval/SKILL.md`, re-run, confirm RED, then restore. A passing test is not evidence until it has been watched to fail.

- [ ] **Implement**

Update `documentedRubricPath()` so its regex is anchored to the keyword-definition sentence Task 2 leaves in place (the one naming what `default` resolves to), rather than to the first `skills/eval/*.yaml` substring anywhere in the file. Keep the optional `<ADEV_ROOT>/` prefix handling and the plugin-root-relative return value — `PLUGIN_ROOT` from `tests/helpers.mjs` stays the join base. Add assertion 2. Change nothing else: the flatness, key-completeness, verdict-vocabulary, and no-numeric-scale assertions are all still correct and still passing.

**Division of labour with Task 2's suite, so the two do not drift into duplicates:** `eval-rubric-keyword-emission.test.mjs` owns *what the skill emits* (the literal `default` reaches `--rubric`). `eval-default-rubric.test.mjs` owns *what the documented default resolves to* (a real, conforming, flat rubric file exists there). Neither should grow assertions belonging to the other.

- [ ] **Verify test passes**

Run: `node --test tests/skills/eval-default-rubric.test.mjs`
Expected: PASS.

- [ ] **Commit**

Stage `tests/skills/eval-default-rubric.test.mjs`, then commit with:

```text
test(eval-harness): re-anchor the prose-derived default-rubric guard

Spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
Plan-task: 4
```

---

### Task 5: End-to-end regression test (four properties) [specialist: none]

**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Create: `tests/cli/eval-default-rubric-e2e.test.mjs`
- Test: `tests/cli/eval-default-rubric-e2e.test.mjs`

**Tests:** create `tests/cli/eval-default-rubric-e2e.test.mjs`. Deliberately **not** per-behaviour: it asserts the BEH-11 × BEH-12 integration — a joint property neither single-behaviour suite can express, because each of them can pass in full while the pair stays broken. That is not a hypothetical: it is the exact state `/adev:validate` reproduced after spec revision 5 shipped 11 green tasks.

`tests/cli/**` is inside the default `npm test` partition (`scripts/run-tests.mjs` excludes only `tests/evals/**` and nested-project suites), so this test runs on the ordinary quality gate. Do not place it under `tests/evals/` or `tests/integration/`.

**Context to load:** the Task 5 Context Packet above.

- [ ] **Write failing test**

The four properties below are acceptance conditions on this task, not suggestions. **A review that finds any one of them weakened must reject the task.** Each is here because the weaker version already passed against the broken code.

**Property 1 — through the real `dispatch()` → verb-module wiring.** Spawn a child process running the CLI entrypoint (`node <pluginCopy>/cli/index.mjs eval score …`), exactly as `runCLI()` in `tests/helpers.mjs` already does. `dispatch()` sets `projectRoot = process.cwd()` and resolves the verb through `VERB_REGISTRY`, so a spawn with a chosen `cwd` exercises the real derivation. **Forbidden:** importing `cmdScore` (or any internal helper) and passing it a `pluginRoot` argument. That asserts the argument, not how the root is obtained.

**Property 2 — plugin root OUTSIDE the project root.** Build two sibling temp directories under `os.tmpdir()`:

```text
<tmp>/plugin-root/     copy of cli/, lib/, package.json, skills/eval/default-rubric.yaml
<tmp>/project-root/    a bare project: the verdict-set JSON, nothing else
```

Spawn with `cwd: <tmp>/project-root` and the entrypoint under `<tmp>/plugin-root`. Neither contains the other. **This is the single property the repository's own layout cannot supply** — here `<ADEV_ROOT>` and the project root are the same directory, which is why the defect survived 7270 tests and five review rounds. Copy only the four paths listed; a whole-repo copy is slow and pulls in `.context-index/`, which changes what the verb sees.

**Property 3 — assert on the argument the skill's documented flow actually passes.** Read `skills/eval/SKILL.md`, extract the `--rubric` argument from its Step 3 `adev eval score` invocation line, and **feed that extracted value to the spawned CLI**. Do not hardcode `"default"` in the spawn arguments. Assert separately that the extracted value equals `default`, so a failure distinguishes "the skill emits the wrong thing" from "the verb mishandles the right thing". A test that calls `--rubric default` directly stays green while the real caller still sends a resolved path — that is precisely the failure mode this property exists to close.

**Property 4 — decoy `CLAUDE_PLUGIN_ROOT`, asserted positively.** Create a third temp directory `<tmp>/decoy-root/skills/eval/default-rubric.yaml` holding a **valid but distinguishable** rubric — same schema, different `rubric_id` and a different criterion id set. Pass `CLAUDE_PLUGIN_ROOT: <tmp>/decoy-root` through the spawn's `env:` option. Assert the output carries the **shipped** rubric's ids and not the decoy's. Passing the decoy through `env:` rather than mutating `process.env` in-process follows the repository's dominant idiom (20 of its 21 env-reading test files) and keeps the assertion honest: an in-process mutation could be defeated by module-load ordering rather than by the code being correct.

Asserting the decoy's *content* is absent — rather than merely asserting exit code 0 — is what makes this positive evidence. An exit-0 assertion alone passes if the env var is read and happens to point at a readable rubric.

Run the composed invocation and assert: exit code 0, the verdict table lists the shipped rubric's ids, and the aggregate line is present.

- [ ] **Verify test fails**

Run: `node --test tests/cli/eval-default-rubric-e2e.test.mjs`

Expected before Tasks 1-2: FAIL — the spawned CLI exits 1 with `UNSAFE_SCORE_PATH: path "default" escapes the project root.`

**Falsification is mandatory for this task, not optional.** After Tasks 1-2 have landed and the test is green, reintroduce each defect one at a time and confirm the test goes RED for each:

| Reintroduced defect | Property that must catch it |
|---|---|
| Revert `lib/cli/eval.mjs` to treat `default` as a path | 1, 2 |
| Change `getPluginRoot()` use to `process.env.CLAUDE_PLUGIN_ROOT ?? getPluginRoot()` | 4 |
| Revert `skills/eval/SKILL.md` line 164 to `--rubric <resolved rubric path>` | 3 |

Record the three RED confirmations in the commit body. A green test that has never been watched to fail is not evidence — and this suite exists because a whole plan's worth of green tests were not evidence.

- [ ] **Implement**

No production code. Task 1 and Task 2 supply everything this test exercises; if it cannot be made green without editing `lib/` or `skills/`, that is a defect in Task 1 or Task 2 and belongs there, not here.

Use `createTempDir()` / `cleanupTempDir()` from `tests/helpers.mjs`, `cpSync` for the plugin-root copy, and `spawnSync(process.execPath, [...], { cwd, env, encoding: "utf8", timeout: 30_000 })`. Clean up all three temp directories in a `finally`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/eval-default-rubric-e2e.test.mjs`
Expected: PASS, with the three falsification runs above recorded.

Then the full gate: `npm test`.

- [ ] **Commit**

Stage `tests/cli/eval-default-rubric-e2e.test.mjs`, then commit with (filling in the falsification results):

```text
test(eval-harness): prove --rubric default from a plugin root outside the project

Falsified: path-treatment revert -> RED; env-var read -> RED; skill prose revert -> RED.

Spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
Plan-task: 5
```

---

### Task 6: Housekeeping — source-manifest completion and stale comments [specialist: none]

**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 1-5
**Files:**
- Modify: `lib/evals/score-schema.mjs:60-88` — the two stale comment blocks
- Modify: `.context-index/specs/features/eval-harness/scoring-engine.spec.md` — frontmatter `source-manifest` only
- Test: `tests/lib/evals/score-schema-contract.test.mjs` (already extended in Task 1) plus `adev source-manifest verify`

**Tests:** no new suite. The comment correction is documentation inside a module whose contract is already asserted by `score-schema-contract.test.mjs`; the manifest completion is verified by a CLI verb, not by a unit test.

**Context to load:** the Task 6 Context Packet above.

- [ ] **Write failing test**

**Intentional TDD-structure deviation, noted for a reviewer scanning tasks mechanically:** this step runs a CLI verb rather than authoring a red unit test. The defect being fixed is a stamped manifest that is *incomplete*, not code that is wrong — there is no behaviour to assert. The red-then-green discipline is preserved by the pre-state / post-state file count below, which is falsifiable in the same way a test is.

The verification step here is a command, not a new assertion:

```bash
adev source-manifest verify --spec .context-index/specs/features/eval-harness/scoring-engine.spec.md
```

Expected before the fix: it reports PASS over an **incomplete** file list — which is the defect. The stamped manifest omits 11 files the implementation actually produced, so drift in any of them is invisible to `/adev:validate` and `/adev:hygiene`. Record the current file count (17) as the pre-state.

- [ ] **Implement**

**a. Complete the source manifest.** Add the 11 omitted paths to the spec's frontmatter `source-manifest.files[]`, keeping the list alphabetically sorted as it already is:

```text
providers/codex/skills/eval/SKILL.md
providers/opencode/skills/eval/SKILL.md
tests/fixtures/evals/rubrics/no-quality-dimensions.yaml
tests/fixtures/evals/rubrics/no-required-elements.yaml
tests/fixtures/evals/rubrics/threshold-100.yaml
tests/fixtures/evals/rubrics/threshold-50.yaml
tests/fixtures/evals/rubrics/threshold-non-numeric.yaml
tests/fixtures/evals/rubrics/threshold-out-of-range.yaml
tests/fixtures/evals/verdicts/complete.json
tests/fixtures/evals/verdicts/elements-only.json
tests/fixtures/evals/verdicts/unsafe-input.json
```

Plus the files Tasks 1-5 created: `tests/cli/eval-default-rubric-keyword.test.mjs`, `tests/cli/eval-default-rubric-e2e.test.mjs`, `tests/skills/eval-rubric-keyword-emission.test.mjs`, and `tests/skills/eval-default-rubric.test.mjs`. Recompute `sha` and `computed-at` with `adev source-manifest compute --files <comma-separated list>` and stamp the result. Do **not** hand-write the SHA.

This is why Task 6 runs last: its stamp must cover every file the other five tasks touched.

**b. Correct the two stale comments in `lib/evals/score-schema.mjs`.** Both were written against spec revision 5 and became false at revision 6:

- The `SCORE_INVALID_VERDICT_CONTEXT` comment says the code "is not in the spec's Error Cases table, which enumerates nine", then instructs a reader to "add a one-line row for it to the spec rather than dropping the check". **That row now exists.** The comment is not merely stale — it directs a future maintainer to perform a change that has already been made, so acting on it produces a duplicate row. Replace both sentences with a one-line statement of what the code covers and a pointer to its table row.
- The `SCORE_INPUT_PARSE_ERROR` comment likewise says "The spec's Error Cases table does not enumerate this case". It does, at revision 6. Replace with the same shape. Keep the sentence distinguishing it from `SCORE_INPUT_NOT_FOUND` — that one is still true and still useful.

Do not touch the code, only the comments. `SCORE_ERROR_CODES` membership is settled by Task 1.

- [ ] **Verify test passes**

Run: `adev source-manifest verify --spec .context-index/specs/features/eval-harness/scoring-engine.spec.md`
Expected: PASS over the complete list (17 + 11 + 4 = 32 files), with no missing-file FAIL.

Run: `npm test`
Expected: PASS — full suite, 7270+ tests, 0 failures.

- [ ] **Commit**

Stage `lib/evals/score-schema.mjs` and the spec file, then commit with:

```text
chore(eval-harness): complete the source manifest and retire two stale comments

Spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
Plan-task: 6
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (`node scripts/run-tests.mjs`) — the project's single gate; there is no separate lint or typecheck command in the constitution's Quality Gates block
- Provider mirrors in sync: `tests/sync/provider-skill-parity.test.mjs` (inside `npm test`) — a hand-edited mirror fails here
- No inline Node added to any SKILL.md: `.githooks/pre-commit` → `hooks/pre-commit-no-inline-node.sh` (exit 2 = policy violation)
- Source manifest complete and stamped: `adev source-manifest verify --spec .context-index/specs/features/eval-harness/scoring-engine.spec.md`
- No live emitter of a path to the shipped rubric: the Task 3 sweep over `skills/**`, `providers/**`, `docs/**` (excluding `.context-index/`) returns zero matches
- All acceptance criteria from spec revision 9 satisfied — including the ten already discharged by commits `07b5ab04..ca32e1f3`
- Zero new external dependencies (constitution Principle 1); no version bump in `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json` (ADR-0008 — release-please owns those)

`.context-index/governance/gates.yaml` exists; where its definitions differ from the constitution's Quality Gates block, `gates.yaml` wins. Probabilistic gates with no command are noted as skipped by `/adev:validate` rather than run here.

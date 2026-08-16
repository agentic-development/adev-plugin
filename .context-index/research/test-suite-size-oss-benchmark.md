---
topic: "Test suite size, granularity, and composition — internal triage and OSS benchmark"
date: "2026-08-14"
relates-to: "adev-plugin-test-suite-per-behavior-granularity-usiy"
sources:
  - internal
  - "github:eslint/eslint"
  - "github:prettier/prettier"
  - "github:rollup/rollup"
  - "github:npm/cli"
  - "github:vitest-dev/vitest"
  - "github:yargs/yargs"
  - "github:tj/commander.js"
  - "github:chalk/chalk"
status: complete
---

## Summary

adev-plugin's test suite is **not oversized by volume** — its test:source LOC ratio of 1.86 sits
below eslint (3.61), commander (3.13), npm/cli (2.66), yargs (2.42) and prettier (2.07), measured
identically against shallow clones of each. It **is a clear outlier by file count**: 2.61 test
files per source file, against a peer norm near 0.9 for mature Node CLIs (eslint 0.95, npm/cli
0.89, yargs 0.87).

Separately, a case-level triage of all 5,888 `it()`/`test()` bodies found that **706 cases (12%)
assert on the text of a repo artifact rather than on behavior** — they read a `.md`/`.yaml` off
disk and check for a substring.

The actionable conclusion inverts the original framing: the target is **fewer test files at
constant coverage** (499 → ~200-250), not fewer tests. Per-behavior test granularity — the
starting hypothesis — turned out not to be the lever at all.

## Findings

### Internal

**Baseline (2026-08-14, commit 709b56b3).** 468 `*.test.mjs` files, 5,888 cases, 99,052 LOC.
Counting all git-tracked code under `tests/`: 499 files, 106,755 LOC, 6,057 cases. Source is
57,407 LOC across 191 tracked files under `lib/` + `cli/` + `hooks/` + `scripts/`, exposing 626
exported symbols (530 functions), 36 CLI verbs, 30 skills, 15 hooks. `skills/` + `templates/` add
19,700 LOC of markdown that is also deliverable.

**Finding 1 — per-behavior granularity does not reduce file count here.**
`adev test-policy show` resolves `granularity: per-behavior` from `granularity_source: "fallback"`
— no `test_policy` block exists in `manifest.yaml`. `docs/test-strategies.md:220` tells adopters
that `per-behavior` yields "fewer test files." Measured on this corpus it yields *more*: 245 specs
declare 1,923 behaviors, and the 119 spec+plan pairs average 10.9 behaviors per spec against 5.2
test-bearing tasks per plan. A literal one-suite-per-behavior mapping exceeds the 305 distinct
suite paths currently declared across 156 plans.

The consolidation the doc promises already happened informally: 813 test-declaring tasks resolved
to 305 distinct suite paths, a 62% collapse done by authors by hand. Strict `per-task` would have
produced 813 files.

**Finding 2 — case-level composition.** Every `it()`/`test()` body across all 468 files was
extracted by brace matching and classified by what it exercises. Whole-file heuristics were tried
first and rejected: they credit an entire file as "prose" when only some of its cases are, which
overstated the reduction opportunity by roughly 2x.

| Class | Cases | % | Files touched |
|---|---|---|---|
| `BEHAVIOR_UNIT` — calls a function imported from repo source | 3,001 | 51.0% | 239 |
| `OTHER` — calls a locally-defined helper; mixed | 1,551 | 26.3% | 211 |
| `BEHAVIOR_SUBPROCESS` — spawns the CLI or a hook | 630 | 10.7% | 87 |
| `PROSE_CONTAINMENT` — reads a repo file, asserts a substring | 484 | 8.2% | 85 |
| `ARTIFACT_STRUCTURAL` — reads a repo file, asserts shape | 170 | 2.9% | 78 |
| `MIXED_ARTIFACT` | 52 | 0.9% | 39 |

**706 cases (12%) assert on artifact text rather than behavior.** 54 files consist *entirely* of
such cases (436 cases, 5,489 LOC); a further 270 artifact cases (4,087 LOC) are scattered across
72 files that also hold real behavior coverage.

Worst instances, verified by reading them:
- `tests/skills/research.test.mjs` — 48 cases, each `readFileSync(prompt).includes("…")` for one
  token (`"1,500"`, `"attribution"`, `"Before Finalizing"`). One behavior sharded 48 ways.
- `tests/docs/workflow-guides.test.mjs` — 40 cases, each re-reading `docs/design-phase.md` to
  assert it mentions one skill name.
- `tests/skills/plan-infra-requirements.test.mjs` — 10 cases, each re-reading `skills/plan/SKILL.md`
  for one string.

These fail on rewording and pass on broken behavior. They are the "change-detector prose test"
class named in the three-repo testing audit (2026-08-10), measured here at 12% of cases against
that audit's 27%-of-suite estimate — the earlier figure counted files, not cases.

**Finding 3 — boilerplate concentration.** Median case body is 9 LOC; the mean is 17.6, dragged by
**185 cases whose bodies exceed 40 LOC and hold 23,620 LOC — 24% of the suite in 3% of the cases**:

```
2,308 loc /  15 cases   tests/lib/cli-issues-migrate.test.mjs
1,316 loc /   4 cases   tests/lib/heuristics.test.mjs
1,252 loc /   3 cases   tests/lib/lifecycle-state.test.mjs
1,002 loc /   1 case    tests/milestones.test.mjs
```

**124 files hand-roll `mkdtempSync`/`rmSync` setup while only 177 of 468 (38%) import
`tests/helpers.mjs`** — matching the ~39% helper adoption the three-repo audit found. The suite
makes 2,297 setup/teardown calls in total.

**Finding 4 — accreted per-task structure.** `adev test-debt scan` (Audit Pass 23) returns WARN
with 77 findings over 77 distinct files of 648 scanned: 33 `APPEND_CHAIN` (worst:
`lib/issues/json-adapter.mjs` covered by 25 suites, `lib/lifecycle-state.mjs` by 22), 25
`PROSE_ASSERTION`, 19 `PLAN_TASK_STRUCTURED`, 0 `REV_NUMBERED`, 0 `DEAD_TEST_REFERENCE`.

Five filename-stem clusters span 20 files where one subject was split one-concern-per-file:
`json-adapter.{atomic,concurrent,parity,perf,schema-version}`,
`migrate-state-artifacts.{collision,constitution,containment,idempotency,redaction}`,
`render-markdown.{atomic,escape,roundtrip}`, `lifecycle-state.render`, `specify-amend.integration`.
104 source modules are covered by more than one suite. 60 case titles are duplicated across files
(84 redundant instances — only 1.4%, not worth a pass).

**Finding 5 — behavior provenance is largely absent.** Of 499 historical test-file additions
(`git log --diff-filter=A`), only 104 carry a `Spec:` trailer, across 37 distinct specs, and none
carries a behavior link. **79% of the suite has no recorded link to a spec.** A behavior-anchored
regroup of the existing suite is therefore not mechanically derivable. Highest-provenance example:
`features/test-strategies/test-depth-policy.spec.md` — 20 behaviors, 42 plan tasks, 17 test files.

### GitHub

Eight comparable OSS projects were shallow-cloned (`--depth 1 --filter=blob:none --sparse`) and
measured with the identical script. **Only git-tracked files are counted** — this matters: an
early pass counted 928,183 LOC of "fixtures" in adev-plugin, which turned out to be
`tests/evals/adev-pipeline-eval` and siblings, vendored eval projects carrying their own `.git`
and `.venv` (169 MB, 1 tracked file). Fixture/snapshot/sample directories are separated from test
code in both columns.

| project | src LOC | test LOC | **T:S** | fixture LOC | T+F:S | src files | test files | **tF/srcF** | cases | LOC/case | cases/KLOC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| eslint | 99,205 | 358,503 | 3.61 | 65,301 | 4.27 | 389 | 368 | 0.95 | 2,821 | 127.1 | 28.4 |
| commander | 4,208 | 13,175 | 3.13 | 256 | 3.19 | 7 | 114 | 16.29 | 1,118 | 11.8 | 265.7 |
| npm/cli | 18,493 | 49,232 | 2.66 | 7,413 | 3.06 | 138 | 123 | 0.89 | 2,245 | 21.9 | 121.4 |
| yargs | 6,361 | 15,377 | 2.42 | 472 | 2.49 | 23 | 20 | 0.87 | 825 | 18.6 | 129.7 |
| prettier | 48,644 | 100,810 | 2.07 | 489,589 | 12.14 | 529 | 5,086 | 9.61 | 270 | 373.4 | 5.6 |
| **adev-plugin** | **57,407** | **106,755** | **1.86** | 20,782 | 2.22 | **191** | **499** | **2.61** | 6,057 | 17.6 | 105.5 |
| vitest | 84,021 | 80,142 | 0.95 | 35,855 | 1.38 | 467 | 739 | 1.58 | 3,856 | 20.8 | 45.9 |
| chalk | 798 | 516 | 0.65 | 0 | 0.65 | 5 | 8 | 1.60 | 58 | 8.9 | 72.7 |
| rollup | 35,543 | 7,990 | 0.22 | 268,520 | 7.78 | 284 | 38 | 0.13 | 174 | 45.9 | 4.9 |

**On volume, adev-plugin is mid-pack and arguably conservative.** T:S of 1.86 is below five of the
eight. LOC/case (17.6) sits beside vitest (20.8), npm/cli (21.9) and yargs (18.6). Cases per source
KLOC (105.5) is close to the two nearest structural analogs, npm/cli (121.4) and yargs (129.7).
Counting `skills/` + `templates/` as source drops T:S to **1.38**.

**On file count, adev-plugin is a genuine outlier.** 2.61 test files per source file against ~0.9
for the mature CLIs. The two projects above it are not models for this shape: commander is 16.29
because it is 7 source files with per-feature tests; prettier is 9.61 because of its fixture-runner
architecture.

Three caveats against reading the table naively:

1. **eslint's 127 LOC/case and prettier's 373 are measurement artifacts, not laxity.** eslint rule
   tests use `RuleTester` with `valid`/`invalid` arrays, so one `it()` carries dozens of
   assertions; 2,821 wildly undercounts. Prettier drives 5,086 fixture files from 270 `it()`s.
   Both are more densely tested than their case counts suggest.
2. **rollup and prettier hold most test mass in fixture corpora** (268k and 490k LOC). Their
   test-code ratios of 0.22 and 2.07 understate coverage; with fixtures they are 7.78 and 12.14 —
   the most heavily tested projects measured.
3. **These are 10+ year old projects.** adev-plugin accumulated comparable mass far faster, which
   is itself the signal: the volume is peer-normal, the *rate* and the *file fragmentation* are not.

### Web

No web sources consulted. All external figures were measured directly from cloned source rather
than quoted, specifically to avoid citing remembered or stale numbers.

## Code Examples

The two measurement scripts. Both are self-contained (Node built-ins only) and reproduce every
number above.

```javascript
// Case-level triage — classify every it()/test() body by what it exercises.
// Extracts case bodies by brace matching rather than regex, so nested braces
// and string literals inside a case body do not truncate it.
// Source: authored for this study, 2026-08-14.
function extractCases(text) {
  const out = [];
  const re = /(?:^|\s)(?:await\s+)?(?:it|test)\s*\(\s*(["'`])([\s\S]*?)\1\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const openBrace = text.indexOf('{', re.lastIndex);
    if (openBrace === -1) continue;
    let depth = 0, j = openBrace, inStr = null, prev = '';
    for (; j < text.length; j++) {
      const ch = text[j];
      if (inStr) { if (ch === inStr && prev !== '\\') inStr = null; }
      else if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { j++; break; } }
      prev = ch;
    }
    out.push({ title: m[2], body: text.slice(openBrace, j) });
  }
  return out;
}

// Classification, per case body:
//   spawns CLI/hook            -> BEHAVIOR_SUBPROCESS
//   calls a name imported from lib|cli|hooks|scripts -> BEHAVIOR_UNIT
//   reads a file && containment >= assertions        -> PROSE_CONTAINMENT
//   reads a file && some containment                 -> MIXED_ARTIFACT
//   reads a file                                     -> ARTIFACT_STRUCTURAL
//   else                                             -> OTHER
```

```javascript
// Cross-project comparison — git-tracked files only.
// Counting untracked files is what produced the bogus 928k-LOC fixture figure
// on the first pass: tests/evals/* holds vendored projects with their own .git.
// Source: authored for this study, 2026-08-14.
import { execFileSync } from 'node:child_process';

function tracked(root) {
  return execFileSync('git', ['-C', root, 'ls-files'], { maxBuffer: 1 << 28, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((p) => existsSync(join(root, p)));
}

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx']);
const FIXTURE_DIR = /(^|\/)(__snapshots__|fixtures?|__fixtures__|snapshots|samples|corpus)(\/|$)/;
// tap-style `t.test(` must be included or npm/cli reports 0 cases:
const CASE_RE = /(?:^|[\s;{(])(?:await\s+)?(?:t\.)?(?:it|test)(?:\.\w+)?\s*\(\s*["'`]/gm;
```

Clone invocation used for each comparand:

```bash
git clone --depth 1 --filter=blob:none --sparse <url> <dir>
git -C <dir> sparse-checkout set <src-dirs> <test-dirs>
```

## Recommendations

1. **Target file count, not case count** — 499 test files → ~200-250, matching the ~0.9 test-files-
   per-source-file peer norm. This is merging, not deleting: cases move between files, coverage is
   unchanged. It directly reverses the per-task file explosion the three-repo audit predicted.

2. **Replace the 706 artifact-assertion cases with schema-driven contract tables** — one
   declarative row per artifact, one parameterized suite per artifact class (SKILL.md, prompts,
   docs, templates, providers). Collapses 54 pure-artifact files to roughly 6.
   **Constraint: the replacement must land before the deletions.** This project's deliverable *is*
   markdown, and these cases are the only thing checking that a SKILL.md declares its required
   sections. Verify by running both suites against deliberately broken artifacts and diffing the
   failures, then delete. Deleting first trades weak signal for none.

3. **Extract the 185 fat cases (>40 LOC bodies, 23,620 LOC) into shared fixtures** and migrate the
   124 files hand-rolling `mkdtempSync`/`rmSync` onto `tests/helpers.mjs`. This is the single
   largest LOC pool and touches no assertions. Helper adoption is the root cause the audit already
   identified: fresh subagents do not discover existing helpers.

4. **Declare `test_policy.granularity: per-behavior` explicitly in `manifest.yaml`.** It resolves
   today from `granularity_source: "fallback"`; an undeclared default can change under the project
   on a framework upgrade. This is a two-line change with no behavioral effect today.

5. **Correct `docs/test-strategies.md:220`**, which tells adopters `per-behavior` yields "fewer
   test files." Measured on the only corpus available it yields more. The doc should state what the
   rule actually buys: suite membership derivable from the spec rather than from task authorship.

6. **Do not pursue a behavior-anchored regroup of the surviving suite.** 79% of test files have no
   `Spec:` trailer and none has a behavior link, so the mapping cannot be derived; it would require
   a per-file re-anchoring pass whose cost is not justified by the benefit.

7. **Treat spec-corpus size as the upstream question.** 1,923 behaviors across 245 specs for 57k
   LOC of source is 33.5 behaviors per source KLOC. If the suite still feels oversized after the
   above, the cause is the spec corpus, not the tests — the tests are a faithful rendering of it.
   Reducing that changes what the project promises, which is a different decision.

## References

### Internal Files
- `.context-index/manifest.yaml` — no `test_policy` block; `tasks.backend: beads`
- `docs/test-strategies.md:130-231` — granularity/depth policy and the upgrade note at :220
- `lib/test-strategies/policy.mjs` — `resolveGranularity()`, built-in fallback `per-behavior`
- `lib/test-strategies/suite-path.mjs` — `resolveSuitePath()`, per-task/per-behavior/per-spec
- `lib/cli/test-policy.mjs` — `adev test-policy show|resolve|set`
- `lib/gates/doctor.mjs`, `adev test-debt scan` — Audit Pass 23 detectors
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`, `runHook()`; 38% adoption
- `tests/skills/research.test.mjs`, `tests/docs/workflow-guides.test.mjs` — worst prose instances
- `tests/lib/cli-issues-migrate.test.mjs` — fattest case bodies (2,308 LOC / 15 cases)
- `.context-index/specs/features/test-strategies/test-depth-policy.spec.md` — 20 behaviors, 17 test files
- `.context-index/specs/features/maintenance/hygiene-test-debt.spec.md` — Audit Pass 23 spec

### GitHub Sources
Measured at clone time, 2026-08-14. All `--depth 1`, default branch.
- `eslint/eslint` — Node CLI + plugin architecture; closest structural analog
- `npm/cli` — large Node CLI; nearest peer on cases/KLOC
- `yargs/yargs` — CLI argument library; nearest peer on LOC/case
- `prettier/prettier` — fixture-runner architecture; cautionary comparand
- `rollup/rollup` — fixture-corpus architecture; cautionary comparand
- `vitest-dev/vitest` — monorepo test framework
- `tj/commander.js` — small CLI library, high tF/srcF
- `chalk/chalk` — minimal library floor

### Prior Internal Research
- Three-repo testing-process audit (2026-08-10) — predicted the file explosion, change-detector
  prose tests, and ~39% helper adoption this study measured independently.

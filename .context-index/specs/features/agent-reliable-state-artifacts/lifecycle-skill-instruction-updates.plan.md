<!-- DO NOT EDIT statuses inline — see lifecycle log lifecycle-skill-instruction-updates.jsonl -->
# Implementation Plan: Lifecycle Skill Instruction Updates

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
> **Review:** PASS (2026-05-12, round 2)
> **Platform:** JavaScript (ESM, `.mjs`), Node.js, `node:test`

**Goal:** Rewrite every lifecycle skill's `SKILL.md` so instructions call the new JSON/JSONL APIs (`lib/lifecycle-state.mjs`, `lib/issues/json-adapter.mjs`, `lib/execution-state.mjs`, `lib/milestones.mjs`) instead of describing the old markdown/YAML formats. Promote `loadManifest` to a public helper. Add `requireGate` calls at the top of every gate-relevant skill. Enforce the audit-target grep gates in CI.

**Architecture:** This is a markdown-edit-heavy spec with one small JS extraction (`lib/manifest.mjs::loadManifest`) and one new architectural test (`tests/skills/no-stale-format-refs.test.mjs`). Skill edits are mechanical applications of the API-reference patterns documented in the spec. The architectural test is the durable enforcement surface; the SKILL.md rewrites are the one-time content migration.

---

## File Structure

**Create:**
- `lib/manifest.mjs` — Public `loadManifest(projectRoot)` lifted from the three private `loadManifestForStorage` copies. Preserves path-containment semantics.
- `tests/lib/manifest.test.mjs` — Unit tests for `loadManifest`: happy path, missing manifest throws `INVALID_PROJECT_ROOT`, traversal payload rejected.
- `tests/skills/no-stale-format-refs.test.mjs` — Architectural test enforcing the audit-target patterns against `skills/**/*.md` (excluding `*-prompt.md` and Skills Out of Scope list).
- `tests/skills/api-reference-appendix.test.mjs` — Architectural test asserting every updated SKILL.md carries the "API reference" appendix with valid API names that exist on `lib/lifecycle-state.mjs` / `lib/issues/json-adapter.mjs`.

**Modify (skills — primary surface):**
- `skills/issues/SKILL.md`
- `skills/plan/SKILL.md` + all `skills/plan/*-mode.md` files: `feature-mode.md`, `epic-mode.md`, `release-mode.md`, `milestone-mode.md`, `mode-router.md`
- `skills/implement/SKILL.md`
- `skills/work/SKILL.md`
- `skills/specify/SKILL.md`
- `skills/validate/SKILL.md`
- `skills/reconcile/SKILL.md`
- `skills/debug/SKILL.md`
- `skills/status/SKILL.md`
- `skills/hygiene/SKILL.md`
- `skills/research/SKILL.md`
- `skills/sync/SKILL.md`
- `skills/build/SKILL.md` + all `skills/build/*-mode.md` files: `resume-mode.md`, `charter-mode.md`, `milestone-mode.md`, `workspace-mode.md`
- `skills/review-specs/SKILL.md`

**Modify (lib — for `loadManifest` lift):**
- `lib/migrate-state-artifacts.mjs:<existing private helper>` — Replace private copy with `import { loadManifest } from './manifest.mjs'`.
- `lib/milestones.mjs:<existing private helper>` — Same.
- `lib/issues/render-markdown.mjs:<existing private helper>` — Same.

**Reference (read, do not modify):**
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` § Canonical Enums and Field Extensions — single source for severity-resolution restatement, planTasks shape, status enum.
- `.context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md` — for `getIssueManager(manifest)` and `IssueManagerInterface` semantics.
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` — boundary for plan-task channel ownership (this plan does NOT duplicate `reportPlanTask` adoption work).
- `.context-index/samples/general-library-module-graph.md` — pattern reference for `lib/manifest.mjs` shape.

---

## Context Packets

### Task 1 Context (`lib/manifest.mjs` lift)
- Spec: § `lib/manifest.mjs` Public Helper
- Existing private copies: `lib/migrate-state-artifacts.mjs`, `lib/milestones.mjs`, `lib/issues/render-markdown.mjs` (read each `loadManifestForStorage` function signature + body)
- Foundation: `lifecycle-event-log.spec.md` § Path Safety (`INVALID_PROJECT_ROOT` contract)
- Sample: `.context-index/samples/general-library-module-graph.md`

### Task 2 Context (`tests/skills/no-stale-format-refs.test.mjs`)
- Spec: § Removed Prose (Audit Targets) — 8 patterns enumerated
- Spec: § Skills Out of Scope — exclusion list
- Filesystem: glob over `skills/**/*.md`

### Task 3 Context (`tests/skills/api-reference-appendix.test.mjs`)
- Spec: § Inline Code-Sample Format + Task Map row "Inline API-reference appendix"
- `lib/lifecycle-state.mjs` exports list (already canonical per `lifecycle-event-log.spec.md` Interface Contracts)
- `lib/issues/json-adapter.mjs` exports list

### Tasks 4–12 Context (per-skill rewrites)
Each task loads:
- Spec § Severity Stamping Adoption + § Gate Adoption + § Issue Board Adoption + § Execution-State Adoption + § Milestones Adoption (whichever apply to the skill)
- The target SKILL.md (full read for current prose)
- `lifecycle-event-log.spec.md` § Canonical Enums (severity ownership cross-reference)
- `json-issue-board-adapter.spec.md` (manager interface)
- `plan-task-events.spec.md` (boundary — DO NOT duplicate plan-task work in this plan)

---

## Parallelization

- Group A (sequential prerequisite): Task 1 (lib/manifest.mjs lift) → all subsequent tasks that reference `loadManifest`.
- Group B (sequential): Task 2 (`no-stale-format-refs.test.mjs`) → Tasks 4–12 (skill rewrites; the test is RED until enough skills are rewritten and goes GREEN when all are done).
- Group C (independent): Task 3 (`api-reference-appendix.test.mjs`) — can run any time after Tasks 4–12.
- Group D (independent batches within rewrites): Tasks 4–6 (issues / plan / implement), 7–9 (work / specify / validate), 10–12 (rest) — can run in parallel batches if no file overlap.

Tasks 1, 2, 3 form the test/scaffold layer. Tasks 4–12 are the content-edit layer. Total: 12 tasks.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Promote `lib/manifest.mjs::loadManifest`; update three call sites | medium | unit | — | 1 create, 4 modify |
| 2 | `tests/skills/no-stale-format-refs.test.mjs` — audit-target grep gate | medium | unit | — | 1 create |
| 3 | `tests/skills/api-reference-appendix.test.mjs` — API-reference appendix gate | small | unit | — | 1 create |
| 4 | Rewrite `/adev:issues` SKILL.md | medium | unit | Tasks 1, 2 | 1 modify |
| 5 | Rewrite `/adev:plan` + all `skills/plan/*.md` mode files | medium | unit | Tasks 1, 2 | 6 modify |
| 6 | Rewrite `/adev:implement` SKILL.md | medium | unit | Tasks 1, 2 | 1 modify |
| 7 | Rewrite `/adev:work` SKILL.md | medium | unit | Tasks 1, 2 | 1 modify |
| 8 | Rewrite `/adev:specify` SKILL.md (reportStep only; charter map mutation kept) | small | unit | Tasks 1, 2 | 1 modify |
| 9 | Rewrite `/adev:validate` SKILL.md | medium | unit | Tasks 1, 2 | 1 modify |
| 10 | Rewrite `/adev:reconcile`, `/adev:debug`, `/adev:status`, `/adev:hygiene` SKILL.md | medium | unit | Tasks 1, 2 | 4 modify |
| 11 | Rewrite `/adev:research`, `/adev:sync`, `/adev:review-specs` SKILL.md | small | unit | Tasks 1, 2 | 3 modify |
| 12 | Rewrite `/adev:build` + all `skills/build/*.md` mode files | medium | unit | Tasks 1, 2 | 5 modify |

---

## Strategy Summary

All tasks resolve to `unit` (source: fallback). No `infra_requirements:` in the spec — no external systems, no integration tests beyond library unit tests.

---

## Tasks

### Task 1: Promote `loadManifest` to public `lib/manifest.mjs` and update call sites [specialist: none]

**Charter capability:** Lifecycle skill instruction updates (prerequisite library lift)
**Strategy:** unit (source: fallback)
**Files:**
- Create: `lib/manifest.mjs`, `tests/lib/manifest.test.mjs`
- Modify: `lib/migrate-state-artifacts.mjs`, `lib/milestones.mjs`, `lib/issues/render-markdown.mjs` (each loses its private `loadManifestForStorage` body in favor of an import)
- Test: `tests/lib/manifest.test.mjs`

**Tests:** `tests/lib/manifest.test.mjs`.

**Context to load:**
- The three existing private copies (read each `loadManifestForStorage` signature + body to ensure semantics are preserved)
- `lifecycle-event-log.spec.md` § Path Safety (for `INVALID_PROJECT_ROOT` symmetry)

- [x] **Write failing test**

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { loadManifest } from '../../lib/manifest.mjs';

test('loadManifest: happy path', () => {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'),
                'project:\n  name: t\ntasks:\n  backend: file\n');
  const m = loadManifest(root);
  assert.equal(m.project.name, 't');
  assert.equal(m.tasks.backend, 'file');
  cleanupTempDir(root);
});

test('loadManifest: missing manifest throws INVALID_PROJECT_ROOT', () => {
  const root = createTempDir();
  assert.throws(() => loadManifest(root), /INVALID_PROJECT_ROOT/);
  cleanupTempDir(root);
});

test('loadManifest: traversal payload rejected', () => {
  assert.throws(() => loadManifest('/etc/..'), /INVALID_PROJECT_ROOT|ENOENT/);
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/manifest.test.mjs`
Expected: FAIL — `lib/manifest.mjs` does not yet exist.

- [x] **Implement**

Create `lib/manifest.mjs`:

```js
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse } from 'yaml';  // already a transitive dep; verify before adding

export function loadManifest(projectRoot) {
  const resolved = resolve(projectRoot);
  const manifestPath = join(resolved, '.context-index', 'manifest.yaml');
  if (!existsSync(manifestPath)) {
    throw new Error(`INVALID_PROJECT_ROOT: ${resolved} does not contain .context-index/manifest.yaml`);
  }
  return parse(readFileSync(manifestPath, 'utf8'));
}
```

(If `yaml` isn't already a dep, use a minimal hand-parser matching the existing `loadManifestForStorage` style — preserve dep behavior.)

Then update the three call sites:
- `lib/migrate-state-artifacts.mjs`: delete `loadManifestForStorage` body, replace with `import { loadManifest as loadManifestForStorage } from './manifest.mjs';` (preserve internal alias to avoid a renaming churn) OR rename callers to `loadManifest`.
- `lib/milestones.mjs`: same.
- `lib/issues/render-markdown.mjs`: same.

- [x] **Verify test passes**

Run: `node --test tests/lib/manifest.test.mjs` and `npm test`
Expected: PASS on the new tests; existing tests for `migrate`, `milestones`, `render-markdown` continue to pass (the lift preserves behavior).

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/lib-manifest-public`

```bash
git add lib/manifest.mjs tests/lib/manifest.test.mjs lib/migrate-state-artifacts.mjs lib/milestones.mjs lib/issues/render-markdown.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): public lib/manifest.mjs::loadManifest

Lifts the private loadManifestForStorage triplicated across three modules to
a shared public export. Three call sites updated to import from lib/manifest.mjs.
Path-containment semantics preserved on lift.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 1
EOF
)"
```

---

### Task 2: `tests/skills/no-stale-format-refs.test.mjs` — audit-target grep gate [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Create: `tests/skills/no-stale-format-refs.test.mjs`

**Tests:** itself.

**Context to load:**
- Spec § Removed Prose (Audit Targets) — the 8 patterns
- Spec § Skills Out of Scope — exclusion list
- Spec § Inline Code-Sample Format — `<ADEV_ROOT>` placeholder rule

- [x] **Write failing test**

```js
import { readFileSync } from 'node:fs';
import { glob } from 'glob';
import test from 'node:test';
import assert from 'node:assert/strict';

const EXCLUDED_SKILLS = ['init', 'repomap', 'assess', 'retro', 'codehealth', 'document',
                         'eval', 'learn', 'sample', 'prototype', 'deploy', 'recover',
                         'route'];

const STALE_PATTERNS = [
  { name: 'tasks.md parsing outside render/issues', regex: /\btasks\.md\b/ },
  { name: 'build-state directory', regex: /\.context-index\/build-state\b/ },
  { name: '.execution-state.md YAML parsing', regex: /\.execution-state\.md\b/ },
  { name: 'issue-board markdown table columns', regex: /\|\s*id\s*\|\s*title\s*\|\s*status\s*\|/i },
  { name: '.review.md grep instructions', regex: /grep[^\n]*\.review\.md/ },
  { name: 'last-reviewed-revision field manipulation', regex: /last-reviewed-revision\s*:/ },
  { name: 'file-sha field manipulation', regex: /file-sha\s*:/ },
  { name: 'git hash-object invocations', regex: /git\s+hash-object/ },
  { name: 'non-<ADEV_ROOT> plugin-root prefix', regex: /~\/\.claude\/|\/Users\/[^\/]+\/\.claude\// },
];

const ALLOW_FILE_PATTERNS = {
  // /adev:issues legacy-read prose may reference tasks.md
  'skills/issues/SKILL.md': ['tasks.md parsing outside render/issues'],
  // /adev:status --render may reference tasks.md as a write target
  'skills/status/SKILL.md': ['tasks.md parsing outside render/issues'],
  // /adev:review-specs writes last-reviewed-revision/file-sha to .review.md — but the
  // ACTUAL writing is owned by the skill's own logic; the SKILL.md may still mention it
  // descriptively, so allow on review-specs SKILL.md only.
  'skills/review-specs/SKILL.md': ['last-reviewed-revision field manipulation', 'file-sha field manipulation'],
};

test('no-stale-format-refs: skill files do not reference legacy formats', async () => {
  const files = await glob('skills/**/*.md', { ignore: ['skills/**/SKILL-INTERNAL*', 'skills/**/*-prompt.md'] });
  const violations = [];
  for (const f of files) {
    const skill = f.split('/')[1];
    if (EXCLUDED_SKILLS.includes(skill)) continue;
    const content = readFileSync(f, 'utf8');
    for (const p of STALE_PATTERNS) {
      if (ALLOW_FILE_PATTERNS[f]?.includes(p.name)) continue;
      if (p.regex.test(content)) {
        violations.push(`${f}: ${p.name}`);
      }
    }
  }
  assert.equal(violations.length, 0, `Stale format references found:\n${violations.join('\n')}`);
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: FAIL with many violations across the to-be-rewritten skill files.

- [x] **Implement**

The test IS the implementation. No source-code change beyond the test file. The test stays RED until Tasks 4–12 rewrite the skill files.

- [x] **Verify test passes**

Run after Tasks 4–12 land: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: PASS.

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/no-stale-format-refs-test`

```bash
git add tests/skills/no-stale-format-refs.test.mjs
git commit -m "$(cat <<'EOF'
test(agent-reliable-state-artifacts): no-stale-format-refs architectural gate

Enforces audit-target grep gates from the spec across skills/**/*.md. Starts
RED; goes GREEN as Tasks 4–12 rewrite each lifecycle skill.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 2
EOF
)"
```

---

### Task 3: `tests/skills/api-reference-appendix.test.mjs` — API reference appendix gate [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Create: `tests/skills/api-reference-appendix.test.mjs`

**Tests:** itself.

**Context to load:**
- Spec § Inline Code-Sample Format
- `lib/lifecycle-state.mjs` exports
- `lib/issues/json-adapter.mjs` exports

- [x] **Write failing test**

```js
import { readFileSync } from 'node:fs';
import { glob } from 'glob';
import test from 'node:test';
import assert from 'node:assert/strict';

const IN_SCOPE_SKILLS = ['issues', 'plan', 'implement', 'work', 'specify',
                          'validate', 'reconcile', 'debug', 'status',
                          'hygiene', 'research', 'sync', 'build', 'review-specs'];

test('api-reference-appendix: in-scope skills carry the appendix', () => {
  for (const skill of IN_SCOPE_SKILLS) {
    const path = `skills/${skill}/SKILL.md`;
    const content = readFileSync(path, 'utf8');
    assert.ok(/## API reference/i.test(content),
              `${path} missing "API reference" appendix heading`);
    // Spot-check a few canonical exports
    if (skill === 'plan' || skill === 'implement' || skill === 'build') {
      assert.ok(/currentState|requireGate|reportStep/.test(content),
                `${path} appendix missing lifecycle-state API references`);
    }
    if (skill === 'issues' || skill === 'status' || skill === 'hygiene') {
      assert.ok(/getIssueManager|IssueManagerInterface/.test(content),
                `${path} appendix missing issue manager references`);
    }
  }
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/api-reference-appendix.test.mjs`
Expected: FAIL — appendix headings absent in most in-scope skills.

- [x] **Implement**

Test only; the appendix is added per-skill by Tasks 4–12. Goes GREEN when those land.

- [x] **Verify test passes**

Run after Tasks 4–12: `node --test tests/skills/api-reference-appendix.test.mjs`
Expected: PASS.

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/api-reference-appendix-test`

```bash
git add tests/skills/api-reference-appendix.test.mjs
git commit -m "$(cat <<'EOF'
test(agent-reliable-state-artifacts): API reference appendix gate

Asserts every in-scope skill SKILL.md carries an "API reference" appendix
with the relevant canonical APIs. Drift defense for skill prose.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 3
EOF
)"
```

---

### Task 4: Rewrite `/adev:issues` SKILL.md [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/issues/SKILL.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`, `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Current `skills/issues/SKILL.md` (full read)
- Spec § Issue Board Adoption
- `json-issue-board-adapter.spec.md` (manager interface + storage format)
- `markdown-rendering-layer.spec.md` (`renderTasksMd` for board rendering)

- [x] **Write failing test**

Tests already exist (Tasks 2 + 3); they assert this skill's compliance.

- [x] **Verify test fails**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs tests/skills/api-reference-appendix.test.mjs`
Expected: FAIL on `skills/issues/SKILL.md`.

- [x] **Implement**

Rewrite `skills/issues/SKILL.md` per Spec § Issue Board Adoption:
1. Replace prose describing `| id | title | status | ... |` markdown-table columns with prose describing `getIssueManager(manifest).{create,update,close,list,get,listEpics,createEpic,updateEpic,addDependency,walkTree}` invocations.
2. The legacy-read prose (under the `--read-only` / deprecation block) may retain a `tasks.md` reference — this is allow-listed by the audit test.
3. The "render the board to markdown" view becomes a call to `renderTasksMd(board)` from `markdown-rendering-layer.spec.md`. Remove any hand-written table-row prose.
4. Append the canonical "API reference" appendix at the bottom:

```markdown
## API reference

- `getIssueManager(manifest)` — Returns the active issue adapter (JSON / file / beads).
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.
- `renderTasksMd(board)` — Renders the board to markdown (read-only consumer view).
```

- [x] **Verify test passes**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs tests/skills/api-reference-appendix.test.mjs`
Expected: PASS for `skills/issues/SKILL.md` rows.

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/issues-skill-rewrite`

```bash
git add skills/issues/SKILL.md
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): rewrite /adev:issues for JSON adapter

Replaces markdown-table column instructions with getIssueManager flow.
Adds API reference appendix. Legacy-read prose preserved (allow-listed).

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 4
EOF
)"
```

---

### Task 5: Rewrite `/adev:plan` + all `skills/plan/*.md` mode files [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/plan/SKILL.md`, `skills/plan/feature-mode.md`, `skills/plan/epic-mode.md`, `skills/plan/release-mode.md`, `skills/plan/milestone-mode.md`, `skills/plan/mode-router.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`, `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Spec § Gate Adoption (`/adev:plan` gate target)
- Spec § Severity Stamping Adoption (`reportStep`)
- **Boundary:** `plan-task-events.spec.md` — DO NOT add `reportPlanTask` prose; that's owned by that sibling spec's plan.

- [x] **Write failing test**

Tests from Tasks 2/3.

- [x] **Verify test fails**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: FAIL on plan skill files.

- [x] **Implement**

For each plan file (SKILL.md + 5 mode files):
1. Add as the FIRST action: `requireGate(state, "review", { mode })` per the spec's gate snippet. `mode` is resolved via `resolveGateMode(loadManifest(projectRoot))`.
2. Replace any `.review.md` frontmatter grep prose with the `currentState(projectRoot, specPath)` read.
3. Add `reportStep` calls at skill entry (`{ step: "plan", status: "started" }`) and exit (`{ step: "plan", status: "completed" }`).
4. Remove `last-reviewed-revision:` / `file-sha:` / `git hash-object` references. (Step 6b in `skills/review-specs/SKILL.md` retains the legitimate write; this is the consumer-side cleanup.)
5. Append the API reference appendix:

```markdown
## API reference

- `requireGate(state, "review", { mode })` — Hard-block on prior step incomplete (mode: strict).
- `currentState(projectRoot, specPath)` — Reads the lifecycle log; returns `{ status, currentStep, steps, planTasks, ... }`.
- `resolveGateMode(loadManifest(projectRoot))` — Resolves `manifest.lifecycle.gate_mode` (strict | advisory).
- `reportStep(projectRoot, specPath, { step, status, verdict? })` — Marks step entry / exit.
```

- [x] **Verify test passes**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs tests/skills/api-reference-appendix.test.mjs`
Expected: PASS for all six files.

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/plan-skill-rewrite`

```bash
git add skills/plan/SKILL.md skills/plan/feature-mode.md skills/plan/epic-mode.md skills/plan/release-mode.md skills/plan/milestone-mode.md skills/plan/mode-router.md
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): rewrite /adev:plan + all mode files

Removes .review.md grep prose; adds requireGate(state,"review") as the first
action; adds reportStep at entry/exit; appends API reference appendix.
Plan-task emission remains owned by plan-task-events.spec.md.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 5
EOF
)"
```

---

### Task 6: Rewrite `/adev:implement` SKILL.md [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/implement/SKILL.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`, `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Spec § Gate Adoption (gate on "plan")
- Spec § Severity Stamping Adoption (`reportStep`, `reportIntervention`)
- **Boundary:** `plan-task-events.spec.md` — DO NOT duplicate plan-task transition prose

- [x] **Write failing test**

Tests from Tasks 2/3.

- [x] **Verify test fails**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: FAIL.

- [x] **Implement**

Rewrite `skills/implement/SKILL.md`:
1. Add as the FIRST action: `requireGate(state, "plan", { mode })`.
2. Remove plan-checkbox mutation prose (this is also addressed by `plan-task-events.spec.md`; ensure no duplication).
3. Add `reportStep` calls at entry/exit and `reportIntervention` for debug-related transitions.
4. Cross-reference (do not restate) `plan-task-events.spec.md` for `reportPlanTask` usage.
5. Append API reference appendix.

- [x] **Verify test passes**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs tests/skills/api-reference-appendix.test.mjs`
Expected: PASS.

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/implement-skill-rewrite`

```bash
git add skills/implement/SKILL.md
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): rewrite /adev:implement for lifecycle APIs

Adds requireGate(state,"plan") as first action. reportStep at entry/exit;
reportIntervention for debug. Plan-task transitions cross-referenced to
plan-task-events.spec.md (no duplication).

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 6
EOF
)"
```

---

### Task 7: Rewrite `/adev:work` SKILL.md [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/work/SKILL.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`, `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Spec § Issue Board Adoption
- Spec § Execution-State Adoption
- `execution-state-migration.spec.md` (already validated — for `lib/execution-state.mjs` API)

- [x] **Write failing test**

Tests from Tasks 2/3.

- [x] **Verify test fails**

- [x] **Implement**

Rewrite `skills/work/SKILL.md`:
1. Replace `tasks.md` parsing prose with `getIssueManager(manifest).list({ status: "open" })` flow.
2. Replace `.execution-state.md` references with `lib/execution-state.mjs` API (`readExecutionState`, `writeExecutionState`).
3. Cross-reference `plan-task-events.spec.md` for the "redirect plan-task work to `/adev:implement`" guard.
4. Append API reference appendix.

- [x] **Verify test passes**

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/work-skill-rewrite`

```bash
git commit -m "feat(agent-reliable-state-artifacts): rewrite /adev:work for JSON adapter + lib/execution-state

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 7"
```

---

### Task 8: Rewrite `/adev:specify` SKILL.md (lightweight) [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/specify/SKILL.md`

**Tests:** `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Spec § Severity Stamping Adoption (only `reportStep`)
- Charter Out-of-Scope (capability map mutation stays markdown)

- [x] **Implement**

Edit `skills/specify/SKILL.md`:
1. Add `reportStep` at entry/exit only. No board / severity / gate adoption (per the trimmed task row in the spec rev 2).
2. Reinforce that Step 5.6 Issue creation uses `spec_ref` only — never `planRef` + `planTask`.
3. Append API reference appendix.

- [x] **Verify test passes**

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/specify-skill-reportstep`

```bash
git commit -m "feat(agent-reliable-state-artifacts): /adev:specify emits reportStep at entry/exit

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 8"
```

---

### Task 9: Rewrite `/adev:validate` SKILL.md [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/validate/SKILL.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`, `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Spec § Gate Adoption (gate on "implement")
- Spec § Severity Stamping Adoption (`reportValidator`)

- [x] **Implement**

Rewrite `skills/validate/SKILL.md`:
1. Add `requireGate(state, "implement", { mode })` as the first action.
2. Replace prior-validation-file parse prose with `currentState(spec).steps.validate` read.
3. Add `reportValidator(projectRoot, specPath, { step: "validate", validator, verdict, error, score, duration_ms })` for each validator.
4. Append API reference appendix.

- [x] **Verify test passes**

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/validate-skill-rewrite`

```bash
git commit -m "feat(agent-reliable-state-artifacts): rewrite /adev:validate for lifecycle gates + reportValidator

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 9"
```

---

### Task 10: Rewrite `/adev:reconcile`, `/adev:debug`, `/adev:status`, `/adev:hygiene` SKILL.md [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/reconcile/SKILL.md`, `skills/debug/SKILL.md`, `skills/status/SKILL.md`, `skills/hygiene/SKILL.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`, `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Spec § Issue Board Adoption (status, hygiene)
- Spec § Severity Stamping Adoption (`reportIntervention` for debug)
- `issue-board-granularity-cleanup.spec.md` § Skill Instruction Reinforcement (reconcile gets `collapse-per-task-issues` operation reference)

- [x] **Implement**

For each:
- `reconcile`: add the `collapse-per-task-issues` operation reference; replace direct-file repair prose with manager calls.
- `debug`: replace debug-log append prose with `reportIntervention({ kind: "debug", note })`; replace `.review.md` reads with `currentState`.
- `status`: replace `tasks.md` parsing with `getIssueManager(manifest).list`; replace per-spec build-state JSON reads with `listLifecycleStates`. (The `--render` block remains an allow-listed reference to `tasks.md`.)
- `hygiene`: same as `status` for tasks/lifecycle reads.

Append API reference appendix to each.

- [x] **Verify test passes**

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/reconcile-debug-status-hygiene-rewrite`

```bash
git commit -m "feat(agent-reliable-state-artifacts): rewrite reconcile/debug/status/hygiene skills

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 10"
```

---

### Task 11: Rewrite `/adev:research`, `/adev:sync`, `/adev:review-specs` SKILL.md [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/research/SKILL.md`, `skills/sync/SKILL.md`, `skills/review-specs/SKILL.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`, `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Spec § Issue Board Adoption (research)
- Spec § Severity Stamping Adoption (`reportReviewer` for review-specs)
- Spec § Gate Adoption (review-specs gates on "specify")
- Constitution Context Routing update (sync's `Build state` → `Lifecycle state` referent)

- [x] **Implement**

- `research`: replace Issue creation prose with `getIssueManager`.
- `sync`: update references for the `Build state` → `Lifecycle state` row.
- `review-specs`: add the `reportReviewer({ step: "review", reviewer, verdict, notes })` flow per dispatched reviewer; add gate on "specify". The `last-reviewed-revision:` and `file-sha:` writes remain here (allow-listed) since this skill OWNS those fields.

Append API reference appendix to each.

- [x] **Verify test passes**

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/research-sync-review-specs-rewrite`

```bash
git commit -m "feat(agent-reliable-state-artifacts): rewrite research/sync/review-specs skills

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 11"
```

---

### Task 12: Rewrite `/adev:build` + all `skills/build/*.md` mode files [specialist: none]

**Charter capability:** Lifecycle skill instruction updates
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/build/SKILL.md`, `skills/build/resume-mode.md`, `skills/build/charter-mode.md`, `skills/build/milestone-mode.md`, `skills/build/workspace-mode.md`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`, `tests/skills/api-reference-appendix.test.mjs`.

**Depends on:** Tasks 1, 2, 3.

**Context to load:**
- Spec § Gate Adoption (build orchestrator gates between every chained sub-skill)
- Spec § Execution-State Adoption (resume-mode uses `currentState` for next-step discovery)

- [x] **Implement**

For SKILL.md and each mode file:
1. Add `requireGate` between every chained sub-skill invocation (use the prior step's name).
2. In `resume-mode.md`: replace `.execution-state.json` direct-read with `currentState(spec)` → discover next step.
3. Append API reference appendix.

- [x] **Verify test passes**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs tests/skills/api-reference-appendix.test.mjs`
Expected: PASS across the full skill set (this is the LAST rewrite task; all gates go GREEN here).

- [x] **Commit**

Branch: `feat/agent-reliable-state-artifacts/build-skill-rewrite`

```bash
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): rewrite /adev:build + all mode files

Adds requireGate between chained sub-skill invocations. resume-mode discovers
next step via currentState instead of reading .execution-state.json directly.
Completes the skill-instruction rewrite — no-stale-format-refs test goes GREEN.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
Plan-task: 12
EOF
)"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.validate.md`, not in this plan.

- Tests pass: `npm test`
- `tests/lib/manifest.test.mjs` green
- `tests/skills/no-stale-format-refs.test.mjs` green (the test that started RED in Task 2 goes GREEN here)
- `tests/skills/api-reference-appendix.test.mjs` green
- All acceptance criteria from spec satisfied (11 ACs covered across the task table)
- `lib/manifest.mjs` exists with public `loadManifest` export; three former private call sites import from it
- No constitutional violations introduced

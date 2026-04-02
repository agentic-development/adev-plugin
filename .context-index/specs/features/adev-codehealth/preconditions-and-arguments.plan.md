# Implementation Plan: adev-codehealth

> **Methodology:** adev
> **Charter:** .context-index/specs/features/adev-codehealth/charter.md
> **Spec:** .context-index/specs/features/adev-codehealth/preconditions-and-arguments.md (primary), detection-passes.md, report-generation.md, hygiene-integration.md
> **Review:** PASS_WITH_NOTES (2026-04-02)
> **Platform:** JavaScript ESM, Node.js, node:test, npm

**Goal:** Create the `/adev-codehealth` skill that proactively scans source code for dead exports, orphan files, unused dependencies, stale code, and duplicate logic using repomap artifacts, producing severity-tiered markdown reports.

**Architecture:** This is a markdown-first skill — the primary deliverable is `skills/adev-codehealth/SKILL.md` containing structured instructions for Claude. The skill reads `symbol-ranks.json` and `dependency-graph.json` from `/adev-repomap`, supplements with `git log` and `package.json`, and writes reports to `.context-index/reports/`. Hygiene integration adds Pass 13 to the existing `/adev-hygiene` SKILL.md. Per ADR-0001, duplicate logic detection requires tree-sitter at runtime and degrades gracefully when absent.

---

## File Structure

**Create:**
- `skills/adev-codehealth/SKILL.md` — Skill instructions covering preconditions, 5 detection passes, report generation
- `tests/skills/adev-codehealth.test.mjs` — Integration tests validating skill argument schema, pass registry, and report template

**Modify:**
- `skills/adev-hygiene/SKILL.md` — Add Pass 13: Code Health, add `code-health` to `--check` options
- `.context-index/manifest.yaml` — Add `skills/adev-codehealth/` to maintenance module paths

**Reference (read, do not modify):**
- `skills/adev-hygiene/SKILL.md` — Follow existing pass structure pattern
- `.context-index/hygiene/symbol-ranks.json` — Schema reference for dead export detection
- `.context-index/hygiene/dependency-graph.json` — Schema reference for orphan/dead export detection
- `.context-index/adrs/0001-web-tree-sitter-dependency.md` — Tree-sitter optional, graceful degradation

## Context Packets

### Task 1 Context
- Spec: `preconditions-and-arguments.md` (all behaviors)
- Charter: `charter.md` (capabilities: precondition validation, module scoping, pass scoping)
- Constitution: `constitution.md` (principle 2: skills are primarily markdown)
- Pattern: `skills/adev-hygiene/SKILL.md` (argument and prerequisite structure)

### Task 2 Context
- Spec: `detection-passes.md` (behaviors 1-20)
- Charter: `charter.md` (capabilities: dead exports, orphan files, unused deps, stale code, duplicate logic, severity classification)
- ADR: `adrs/0001-web-tree-sitter-dependency.md` (tree-sitter optional)
- Pattern: `skills/adev-hygiene/SKILL.md` (audit pass structure)
- Data: `.context-index/hygiene/symbol-ranks.json`, `dependency-graph.json` (schema reference)

### Task 3 Context
- Spec: `report-generation.md` (all behaviors)
- Charter: `charter.md` (capability: report generation)
- Pattern: `skills/adev-hygiene/SKILL.md` (drift report output format)

### Task 4 Context
- Spec: All 4 specs (integration test coverage)
- Charter: `charter.md` (all capabilities)
- Constitution: `constitution.md` (quality gates: npm test)
- Pattern: `tests/` (existing test structure)

### Task 5 Context
- Spec: `hygiene-integration.md` (all behaviors)
- Charter: `charter.md` (capability: hygiene integration)
- Pattern: `skills/adev-hygiene/SKILL.md` (existing 12-pass structure, --check argument)

### Task 6 Context
- Charter: `charter.md` (all capabilities)
- Constitution: `constitution.md` (version parity, file structure conventions)
- Manifest: `.context-index/manifest.yaml` (maintenance module)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (SKILL.md built incrementally)
- Group B (after Group A): Task 4 (tests the completed SKILL.md)
- Group C (after Group A): Task 5 (modifies hygiene SKILL.md)
- Group D (after B+C): Task 6 (manifest + final wiring)

Groups B and C can run in parallel after Group A completes.

---

### Task 1: SKILL.md — Preconditions and Arguments [specialist: none]

**Charter capability:** Precondition validation, Module scoping, Pass scoping
**Files:**
- Create: `skills/adev-codehealth/SKILL.md`

**Tests:** `tests/skills/adev-codehealth.test.mjs` — argument schema validation (Task 4)

- [ ] **Write failing test**

```javascript
// tests/skills/adev-codehealth.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

describe('adev-codehealth SKILL.md', () => {
  const skillPath = join(PLUGIN_ROOT, 'skills/adev-codehealth/SKILL.md');

  it('should exist', () => {
    readFileSync(skillPath, 'utf8');
  });

  it('should have valid frontmatter with name and description', () => {
    const content = readFileSync(skillPath, 'utf8');
    assert.match(content, /^---\nname: adev-codehealth/);
    assert.match(content, /description:/);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: FAIL — file not found

- [ ] **Implement**

Create `skills/adev-codehealth/SKILL.md` with:

1. **Frontmatter:**
   ```yaml
   ---
   name: adev-codehealth
   description: "Proactively scan source code for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces severity-tiered reports from repomap artifacts. Use when the user says 'check code health', 'find dead code', 'unused exports', 'stale files', or wants to identify cleanup opportunities before refactoring."
   ---
   ```

2. **Announce section:** "I'm using the adev-codehealth skill to scan for code health issues."

3. **Arguments table:**
   - No arguments: full scan (all passes against all source_roots)
   - `--module <slug>`: restrict to a manifest module's paths
   - `--pass <name>`: comma-separated pass filter (valid: `dead-exports`, `orphan-files`, `unused-deps`, `stale-code`, `duplicate-logic`)

4. **Prerequisites section:**
   - Check `.context-index/manifest.yaml` exists with `hygiene.source_roots`
   - Check `.context-index/hygiene/symbol-ranks.json` exists
   - Check `.context-index/hygiene/dependency-graph.json` exists
   - If missing: emit MISSING_REPOMAP error with actionable message
   - Validate `--module` against `manifest.yaml` `modules[].slug`
   - Validate `--pass` against valid pass name allowlist

5. **File scope resolution section:**
   - Load `hygiene.source_roots` from manifest
   - If `--module`: intersect with module's `paths`
   - Subtract `hygiene.coverage_exclude` glob patterns
   - Result is the file list for all passes

- [ ] **Verify test passes**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/adev-codehealth/SKILL.md tests/skills/adev-codehealth.test.mjs
git commit -m "feat(adev-codehealth): add SKILL.md with preconditions and arguments"
```

---

### Task 2: SKILL.md — Detection Passes [specialist: none]

**Charter capability:** Dead export detection, Orphan file detection, Unused dependency detection, Stale code detection, Duplicate logic detection, Severity classification
**Depends on:** Task 1
**Files:**
- Modify: `skills/adev-codehealth/SKILL.md`

**Tests:** `tests/skills/adev-codehealth.test.mjs` — pass content validation (Task 4)

- [ ] **Write failing test**

```javascript
it('should define all 5 detection passes', () => {
  const content = readFileSync(skillPath, 'utf8');
  const passes = ['Dead Export Detection', 'Orphan File Detection',
    'Unused Dependency Detection', 'Stale Code Detection', 'Duplicate Logic Detection'];
  for (const pass of passes) {
    assert.ok(content.includes(pass), `Missing pass: ${pass}`);
  }
});

it('should reference ADR-0001 for duplicate logic degradation', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.ok(content.includes('ADR-0001') || content.includes('tree-sitter'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: FAIL — passes not yet defined

- [ ] **Implement**

Add 5 detection pass sections to SKILL.md, each following the hygiene pass pattern:

**Pass 1: Dead Export Detection (`dead-exports`)**
- Goal: Find exported symbols with zero imports
- Steps: Read `dependency-graph.json` nodes and edges. For each node's `exports[]`, check if any edge has `to` matching the file and the symbol in `edge.symbols[]`. If not, emit finding.
- Severity rules: high (only export in file), medium (coexists with referenced exports), low (re-export target)

**Pass 2: Orphan File Detection (`orphan-files`)**
- Goal: Find source files with no incoming imports
- Steps: Read `dependency-graph.json`. Collect all files appearing as `edge.to`. Files in scope not in that set are orphans. Exclude entry points: `**/index.*`, `**/cli.*`, `**/main.*`, hook scripts from `hooks/hooks.json`, test files.
- Severity: high (no edges at all), medium (has outgoing edges only)

**Pass 3: Unused Dependency Detection (`unused-deps`)**
- Goal: Compare package.json deps against actual imports
- Steps: Read `package.json` dependencies and devDependencies. Grep all source files for `import ... from '<pkg>'`, `import('<pkg>')`, `require('<pkg>')`. Flag unmatched packages.
- Severity: high (dependencies), medium (devDependencies)

**Pass 4: Stale Code Detection (`stale-code`)**
- Goal: Flag files not modified in staleness_threshold_days relative to module activity
- Steps: Run `git log --format=%H --diff-filter=ACMR -- <file>` for each file. Compare last commit date to threshold (default 30 days from `hygiene.staleness_threshold_days`). Skip if all files in module are uniformly old.
- Severity: high (stale + unreferenced), low (stale but referenced)

**Pass 5: Duplicate Logic Detection (`duplicate-logic`)**
- Goal: Find structurally similar function bodies
- Prerequisite: tree-sitter available at runtime. If not, skip with note per ADR-0001.
- Steps: Parse source files with tree-sitter, extract function ASTs, compare structural similarity. Emit findings for near-duplicates.
- Severity: high (exact duplicates), medium (structural similarity)

**Severity reference table** after all passes summarizing all rules.

**Execution order:** `dead-exports` → `orphan-files` → `unused-deps` → `stale-code` → `duplicate-logic`

**Scope clarification:** Dependency-graph-scoped passes (1, 2, 5) analyze only files in `dependency-graph.json` nodes. File-system-scoped passes (3, 4) scan all files in resolved `source_roots`.

- [ ] **Verify test passes**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/adev-codehealth/SKILL.md tests/skills/adev-codehealth.test.mjs
git commit -m "feat(adev-codehealth): add 5 detection passes with severity rules"
```

---

### Task 3: SKILL.md — Report Generation [specialist: none]

**Charter capability:** Report generation
**Depends on:** Task 2
**Files:**
- Modify: `skills/adev-codehealth/SKILL.md`

**Tests:** `tests/skills/adev-codehealth.test.mjs` — report format validation (Task 4)

- [ ] **Write failing test**

```javascript
it('should define report output format with frontmatter schema', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.ok(content.includes('codehealth-'));
  assert.ok(content.includes('.context-index/reports/'));
  assert.ok(content.includes('total_findings'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: FAIL — report section not yet defined

- [ ] **Implement**

Add report generation section to SKILL.md:

1. **Report path:** `.context-index/reports/codehealth-<YYYY-MM-DD>.md`
2. **Create directory** if `.context-index/reports/` doesn't exist
3. **YAML frontmatter:**
   ```yaml
   ---
   date: <ISO 8601>
   module_filter: <--module value or "all">
   pass_filter: <--pass value or "all">
   total_findings: <count>
   summary:
     high: <count>
     medium: <count>
     low: <count>
   ---
   ```
4. **Summary table:** Pass | High | Medium | Low | Total — one row per pass + totals
5. **Per-pass sections:** `## <Pass Name>` with findings table (Severity | File | Line | Symbol | Description), sorted by severity desc → file path asc → line number asc. Optional fields show `—`.
6. **Zero findings:** "No issues found." per pass, "No code health issues found." at top
7. **Skipped passes:** "Skipped — <reason>."
8. **Idempotency:** Overwrite existing same-date report
9. **Conversation summary:** Print severity counts, top 3 highest-severity findings (severity desc, file path asc), and report file path

- [ ] **Verify test passes**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/adev-codehealth/SKILL.md tests/skills/adev-codehealth.test.mjs
git commit -m "feat(adev-codehealth): add report generation with frontmatter and summary"
```

---

### Task 4: Integration Tests [specialist: none]

**Charter capability:** All capabilities (validation)
**Depends on:** Task 3
**Files:**
- Modify: `tests/skills/adev-codehealth.test.mjs`

**Tests:** `tests/skills/adev-codehealth.test.mjs`

- [ ] **Write failing test**

```javascript
describe('SKILL.md completeness', () => {
  it('should document all valid pass names', () => {
    const content = readFileSync(skillPath, 'utf8');
    const passNames = ['dead-exports', 'orphan-files', 'unused-deps', 'stale-code', 'duplicate-logic'];
    for (const name of passNames) {
      assert.ok(content.includes(name), `Missing pass name: ${name}`);
    }
  });

  it('should document all error codes', () => {
    const content = readFileSync(skillPath, 'utf8');
    const allCodes = [
      'MISSING_REPOMAP', 'INVALID_MANIFEST', 'UNKNOWN_MODULE', 'UNKNOWN_PASS',
      'FORMAT_ERROR', 'MISSING_PACKAGE_JSON', 'GIT_UNAVAILABLE', 'TREESITTER_UNAVAILABLE',
      'WRITE_ERROR', 'MALFORMED_FINDING'
    ];
    for (const code of allCodes) {
      assert.ok(content.includes(code), `Missing error code: ${code}`);
    }
  });

  it('should document severity levels', () => {
    const content = readFileSync(skillPath, 'utf8');
    assert.ok(content.includes('high'));
    assert.ok(content.includes('medium'));
    assert.ok(content.includes('low'));
  });

  it('should reference repomap artifact paths', () => {
    const content = readFileSync(skillPath, 'utf8');
    assert.ok(content.includes('symbol-ranks.json'));
    assert.ok(content.includes('dependency-graph.json'));
  });

  it('should document coverage_exclude filtering', () => {
    const content = readFileSync(skillPath, 'utf8');
    assert.ok(content.includes('coverage_exclude'));
  });

  it('should document tree-sitter degradation for duplicate-logic', () => {
    const content = readFileSync(skillPath, 'utf8');
    assert.ok(content.includes('tree-sitter') || content.includes('ADR-0001'));
    assert.ok(content.includes('skip') || content.includes('Skip'));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: Some may fail if content is incomplete

- [ ] **Implement**

Review SKILL.md for completeness against all acceptance criteria. Fill any gaps identified by failing tests. Ensure all error codes, pass names, severity levels, artifact paths, and degradation notes are present.

- [ ] **Verify test passes**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: PASS (all tests)

- [ ] **Commit**

```bash
git add tests/skills/adev-codehealth.test.mjs skills/adev-codehealth/SKILL.md
git commit -m "test(adev-codehealth): add integration tests for skill completeness"
```

---

### Task 5: Hygiene Integration — Pass 13 [specialist: none]

**Charter capability:** Hygiene integration
**Depends on:** Task 3
**Files:**
- Modify: `skills/adev-hygiene/SKILL.md`

**Tests:** `tests/skills/adev-codehealth.test.mjs` — hygiene integration validation

- [ ] **Write failing test**

```javascript
describe('hygiene integration', () => {
  const hygienePath = join(PLUGIN_ROOT, 'skills/adev-hygiene/SKILL.md');

  it('should include Pass 13: Code Health in hygiene SKILL.md', () => {
    const content = readFileSync(hygienePath, 'utf8');
    assert.ok(content.includes('Code Health') || content.includes('code-health'));
  });

  it('should include code-health in --check options', () => {
    const content = readFileSync(hygienePath, 'utf8');
    assert.ok(content.includes('code-health'));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: FAIL — hygiene SKILL.md not yet modified

- [ ] **Implement**

Modify `skills/adev-hygiene/SKILL.md`:

1. Update pass count text from "twelve" to "thirteen" (description line and process section)
2. Add `code-health` to the `--check` argument's valid values list
3. Add Pass 13 section after Pass 12:

```markdown
## Audit Pass 13: Code Health

**Goal:** Detect dead exports, orphan files, unused dependencies, stale code, and duplicate logic in source code.

**Prerequisite:** Check if `.context-index/hygiene/symbol-ranks.json` and `.context-index/hygiene/dependency-graph.json` exist. If not, output SKIP: "Repomap artifacts not found — run `/adev-repomap` first."

**Steps:**
1. Invoke `/adev-codehealth` with no filters (full scan).
2. Read the generated report at `.context-index/reports/codehealth-<date>.md`.
3. Extract finding counts by severity.

**Status mapping:**
- Zero findings → PASS
- All findings low severity → WARN
- Any medium or high severity → FAIL
- Repomap artifacts missing → SKIP
- Skill error → FAIL

**Output:**
Add a Code Health row to the hygiene summary table. Include action item: "Review full report at `.context-index/reports/codehealth-<date>.md`."
```

4. Update the summary table template to include a Code Health row

- [ ] **Verify test passes**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/adev-hygiene/SKILL.md tests/skills/adev-codehealth.test.mjs
git commit -m "feat(adev-hygiene): add Pass 13 Code Health dispatching adev-codehealth"
```

---

### Task 6: Manifest Registration and Wiring [specialist: none]

**Charter capability:** All (project integration)
**Depends on:** Task 4, Task 5
**Files:**
- Modify: `.context-index/manifest.yaml`

**Tests:** `tests/skills/adev-codehealth.test.mjs` — manifest validation

- [ ] **Write failing test**

```javascript
describe('manifest registration', () => {
  it('should include adev-codehealth in maintenance module', () => {
    const manifest = readFileSync(join(PLUGIN_ROOT, '.context-index/manifest.yaml'), 'utf8');
    assert.ok(manifest.includes('skills/adev-codehealth/'));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: FAIL — manifest not yet updated

- [ ] **Implement**

Bump version in both `package.json` and `.claude-plugin/plugin.json` (must stay in sync per constitution principle 5). Increment the minor version for this feature addition.

Add `skills/adev-codehealth/` to the maintenance module in `.context-index/manifest.yaml`:

```yaml
  - slug: maintenance
    name: Maintenance
    paths:
      - skills/adev-hygiene/
      - skills/adev-repomap/
      - skills/adev-sample/
      - skills/adev-codehealth/
      - skills/adev-retro/
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/adev-codehealth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/manifest.yaml package.json .claude-plugin/plugin.json tests/skills/adev-codehealth.test.mjs
git commit -m "feat(adev-codehealth): register in maintenance module, bump version"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from all 4 specs satisfied:
  - Preconditions: MISSING_REPOMAP, INVALID_MANIFEST, UNKNOWN_MODULE, UNKNOWN_PASS errors defined
  - Detection: All 5 passes documented with severity rules, tree-sitter degradation
  - Report: frontmatter schema, summary table, per-pass sections, idempotency
  - Hygiene: Pass 13 added, --check code-health, PASS/WARN/FAIL/SKIP thresholds
- [ ] No constitutional violations (no external deps, markdown-first skill, pure ESM)

<!-- partial_schema: plan@1 -->

# Implementation Plan: CursorAdapter with Skill Name Sanitization

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cursor-provider/charter.md
> **Spec:** .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-17)
> **Platform:** Node.js >= 18, JavaScript (ESM, `.mjs`), npm, node:test

**Goal:** Add `providers/cursor/adapter.mjs` as the fourth peer provider adapter, mirroring `OpenCodeAdapter`'s install/uninstall/detect surface while diverging on two points required by Cursor's docs: (a) use `fs.cpSync` instead of shelling to `cp -r`, and (b) publish skill directories as sanitized copies (`skills/<name>/` → `~/.cursor/skills/adev-<name>/`) rather than symlinks, because the source and target dirnames diverge.

**Architecture:** The adapter sits behind the existing provider-adapter contract — no change to the hook protocol, the CLI install path structure, or the plugin registration format. Spec A (`.cursor-plugin/plugin.json`) and Spec C (`providers/cursor/hooks.json`) are already on the branch, so this spec only adds the adapter that copies the existing plugin tree into `~/.cursor/plugins/local/adev/` and republishes skills with YAML-frontmatter-only `name:` sanitization. The Constitution Reference in the spec pins sanitization scope to the SKILL.md frontmatter (the block between leading `---` lines); the SKILL.md body is preserved verbatim — colons in code examples or prose stay intact. The adapter slots into `cli/index.mjs` provider dispatch following the same pattern as `OpenCodeAdapter`; full `--provider cursor` CLI plumbing is deferred to Spec D.

---

## File Structure

**Create:**
- `providers/cursor/adapter.mjs` — Fourth peer provider adapter, exporting `CursorAdapter`
- `tests/provider/cursor-adapter.test.mjs` — Adapter test suite (install, uninstall, idempotency, sanitization, manifest+hooks presence, conflict detection)

**Modify:**
- `cli/index.mjs` — Register `CursorAdapter` in the provider dispatch map alongside `ClaudeCodeAdapter`, `OpenCodeAdapter`, `CodexAdapter`. Scope of change is limited: make the adapter loadable. Full `adev install cursor` plumbing is deferred to Spec D per Task Map row 6.

**Reference (read, do not modify):**
- `providers/opencode/adapter.mjs` — Mirror this adapter's shape (`install`, `uninstall`, `detect`, `detectConflicts`, `disableConflictingPlugin`, `getAgentFile`). Note the deliberate divergences: use `fs.cpSync` (not `execSync` of `cp -r`), use copies (not `symlinkSync`).
- `providers/claude-code/adapter.mjs` — Cross-reference for shape consistency.
- `tests/provider/claude-code-adapter.test.mjs` — Mirror this test file's setup/teardown shape (`mkdtempSync` for `homeDir`, env override, cleanup).
- `.cursor-plugin/plugin.json` (already on branch via Spec A) — Verify presence in cache after install.
- `providers/cursor/hooks.json` (already on branch via Spec C) — Verify presence in cache after install.
- `skills/*/SKILL.md` (in source tree) — Sources of sanitization. Source tree is never modified by the adapter.

---

## Context Packets

### Task 1 Context (Adapter Skeleton)
- Spec: `.context-index/specs/features/cursor-provider/cursor-adapter.spec.md` (Behavioral Contract bullet 1, Postconditions bullet 1, Actionable Task Map row 1)
- Charter: `.context-index/specs/features/cursor-provider/charter.md` (capability: `CursorAdapter install/uninstall/status`)
- Source files:
  - `providers/opencode/adapter.mjs` — full read (mirror the export shape, constants block, `ensureDir`/`readJson`/`writeJson` helpers)
  - `providers/claude-code/adapter.mjs` — full read (cross-reference adapter contract)
- Sample: `.context-index/samples/general-test-helpers.md`
- Constitution: Principle 1 (Node built-ins only), Principle 3 (ESM `.mjs`), Anti-pattern (no `~/.claude/` hardcoded paths)

### Task 2 Context (install — copy plugin tree)
- Spec: `.context-index/specs/features/cursor-provider/cursor-adapter.spec.md` (Behavioral Contract bullets 1-2, 5; Acceptance Criteria lines 1-2, 4, 10; Error Cases row "Existing cache dir")
- Source files:
  - `providers/opencode/adapter.mjs` lines 67-110 (install body — see how the `execSync("cp -r ...")` block is structured; the cursor adapter MUST use `fs.cpSync` with a `filter` function instead)
- Constitution: Principle 1 (`fs.cpSync` over shelling to `cp -r` — explicitly called out in the spec's Constitution Reference)
- Boundary rules: `governance/boundaries.yaml` (verify `providers/cursor/` not flagged as protected boundary)

### Task 3 Context (publishSkillsFromCache with sanitization)
- Spec: `.context-index/specs/features/cursor-provider/cursor-adapter.spec.md` (Behavioral Contract bullet 3, Rationale paragraph, Postconditions bullets 2-3, Acceptance Criteria lines 3 and 8, Error Cases rows "Skill source SKILL.md has no name:", "Skill source name: is already in adev-<x> form", "Skill publish fails on a single skill")
- Charter: `.context-index/specs/features/cursor-provider/charter.md` (capability: `Skill name sanitization`)
- Source files:
  - `providers/opencode/adapter.mjs` lines ~111-160 (skill linking loop — note the use of `symlinkSync`; cursor adapter MUST diverge to copies because the source dirname `skills/<name>/` and target dirname `~/.cursor/skills/adev-<name>/` differ)
  - `skills/init/SKILL.md` — sample input with frontmatter `name: adev:init` (verify the sanitized output dirname is `adev-init` and frontmatter `name:` line is `name: adev-init`)
- Constitution: Principle 2 (sanitization scope is strictly the YAML frontmatter block between leading `---` lines; the body is preserved verbatim — colons in code examples stay)
- ADR: none directly; sanitization is purely behavioral

### Task 4 Context (uninstall — remove plugin + published skills)
- Spec: `.context-index/specs/features/cursor-provider/cursor-adapter.spec.md` (Behavioral Contract bullet 6, Postconditions bullet 4, Acceptance Criterion line 5, Error Case row "~/.cursor/ does not exist on uninstall")
- Source files:
  - `providers/opencode/adapter.mjs` `uninstall` method — mirror the no-throw idempotent semantic

### Task 5 Context (detect / detectConflicts / disableConflictingPlugin)
- Spec: `.context-index/specs/features/cursor-provider/cursor-adapter.spec.md` (Behavioral Contract bullets 7-8, Acceptance Criteria lines 6-7)
- Source files:
  - `providers/opencode/adapter.mjs` `detect`, `detectConflicts`, `disableConflictingPlugin` methods — Superpowers guard

### Task 6 Context (Register CursorAdapter in CLI dispatch)
- Spec: `.context-index/specs/features/cursor-provider/cursor-adapter.spec.md` (Actionable Task Map row 6 — "Spec B just makes the adapter loadable")
- Source files:
  - `cli/index.mjs` provider dispatch (current import map for `ClaudeCodeAdapter`/`OpenCodeAdapter`/`CodexAdapter`)
- Out of scope for this task: `adev install cursor` CLI verb plumbing (deferred to Spec D)

### Task 7 Context (Tests)
- Spec: `.context-index/specs/features/cursor-provider/cursor-adapter.spec.md` (Acceptance Criterion line 9 — explicit test coverage list)
- Source files:
  - `tests/provider/claude-code-adapter.test.mjs` — full read (mirror the `mkdtempSync` + env-override setup/teardown pattern)
  - `tests/provider/codex-adapter.test.mjs` — full read (additional cross-reference for adapter test conventions)

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

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (shared file: `providers/cursor/adapter.mjs` — each task appends to the same file).
- Group B (depends on Group A complete): Task 6 (modifies `cli/index.mjs`; logically depends on the adapter export existing).
- Group C (depends on Tasks 1-5): Task 7 (test file authoring; depends on the adapter export shape).

Group A is the critical path. Tasks 6 and 7 can be authored in parallel after Group A lands but Task 7 is the validation gate for Acceptance Criterion line 11 (`npm test passes`).

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Adapter skeleton: constants and exported shape | small | unit | — | 1 create |
| 2 | install() — copy plugin tree with fs.cpSync | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | publishSkillsFromCache() with frontmatter-only sanitization | large | unit | Task 2 | 0 create, 1 modify |
| 4 | uninstall() — remove plugin + sanitized skills | small | unit | Task 3 | 0 create, 1 modify |
| 5 | detect() / detectConflicts() / disableConflictingPlugin() | small | unit | Task 4 | 0 create, 1 modify |
| 6 | Register CursorAdapter in CLI dispatch | small | unit | Task 5 | 0 create, 1 modify |
| 7 | Test suite — install, uninstall, idempotency, sanitization, conflicts | medium | unit | Task 5 | 1 create |

---

## Task Structure

### Task 1: Adapter skeleton — constants and exported shape [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Mechanical scaffold mirroring `OpenCodeAdapter` with explicit constants and method signatures in the plan; single new file, no boundary crossings.

**Charter capability:** `CursorAdapter install/uninstall/status`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `providers/cursor/adapter.mjs`
- Test: `tests/provider/cursor-adapter.test.mjs` (placeholder — full test authoring is Task 7; this task adds a minimal smoke test that the module loads and exports the expected shape)

**Tests:** `tests/provider/cursor-adapter.test.mjs`

**Context to load:**
- `providers/opencode/adapter.mjs` (mirror the constants and exported shape; note divergences listed in Task 2/3)
- `providers/claude-code/adapter.mjs` (cross-reference)
- Constitution Principle 1 (no shell), Principle 3 (ESM), Anti-pattern (no `~/.claude/` paths)

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CursorAdapter } from "../../providers/cursor/adapter.mjs";

describe("CursorAdapter (shape)", () => {
  it("exports the expected adapter contract", () => {
    assert.equal(CursorAdapter.name, "cursor");
    assert.equal(typeof CursorAdapter.install, "function");
    assert.equal(typeof CursorAdapter.uninstall, "function");
    assert.equal(typeof CursorAdapter.detect, "function");
    assert.equal(typeof CursorAdapter.detectConflicts, "function");
    assert.equal(typeof CursorAdapter.disableConflictingPlugin, "function");
    assert.equal(typeof CursorAdapter.getAgentFile, "function");
    assert.ok(CursorAdapter.pluginRoot, "pluginRoot should be set");
    assert.ok(CursorAdapter.version, "version should be set");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: FAIL — `Cannot find module '.../providers/cursor/adapter.mjs'`

- [ ] **Implement**

```javascript
// providers/cursor/adapter.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, cpSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = join(__dirname, "../..");
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8")
).version;

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function getCursorHome() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    throw new Error("HOME or USERPROFILE must be set to resolve Cursor plugin path");
  }
  return join(home, ".cursor");
}

function getCursorSkillsDir() {
  return join(getCursorHome(), "skills");
}

function getPluginCacheDir() {
  return join(getCursorHome(), "plugins", "local", "adev");
}

/**
 * Cursor provider adapter.
 * Installs plugin to ~/.cursor/plugins/local/adev/ and publishes sanitized
 * skill directories to ~/.cursor/skills/adev-<name>/.
 */
export const CursorAdapter = {
  name: "cursor",
  pluginRoot: PLUGIN_ROOT,
  version: PLUGIN_VERSION,

  getAgentFile() {
    return "AGENTS.md";
  },

  detect() {
    return process.env.CURSOR === "true" || existsSync(getCursorHome());
  },

  async install(_opts = {}) {
    throw new Error("not implemented yet"); // Task 2
  },

  async uninstall(_opts = {}) {
    throw new Error("not implemented yet"); // Task 4
  },

  detectConflicts() {
    return []; // Task 5
  },

  disableConflictingPlugin(_name) {
    return false; // Task 5
  },
};
```

- [ ] **Verify test passes**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/cursor-provider/cursor-adapter`

```bash
git add providers/cursor/adapter.mjs tests/provider/cursor-adapter.test.mjs
git commit -m "feat(cursor-provider): scaffold CursorAdapter shape

Spec: .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
Plan-task: 1"
```

---

### Task 2: install() — copy plugin tree with fs.cpSync [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Spec pins behavior (idempotency, exclusion filter, `fs.cpSync`) with explicit error cases; pattern adapts `OpenCodeAdapter.install` with one deliberate divergence (built-in over shell).

**Charter capability:** `CursorAdapter install/uninstall/status`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `providers/cursor/adapter.mjs` (replace the `install()` stub)
- Test: `tests/provider/cursor-adapter.test.mjs` (append install tests)

**Tests:** `tests/provider/cursor-adapter.test.mjs`

**Context to load:**
- `providers/opencode/adapter.mjs` `install` body — see the `execSync("cp -r ...")` pattern; **do NOT replicate it**. Spec Constitution Reference and Acceptance Criterion line 10 both require `fs.cpSync` instead.
- Spec error case: "Existing cache dir at `~/.cursor/plugins/local/adev/`" — return `{ installed: false, path: cacheDir }`.

- [ ] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { CursorAdapter } from "../../providers/cursor/adapter.mjs";

describe("CursorAdapter.install", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cursor-home-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("copies the plugin tree into ~/.cursor/plugins/local/adev/ with Spec A and Spec C artifacts present", async () => {
    const result = await CursorAdapter.install({ scope: "user" });
    const cacheDir = join(homeDir, ".cursor", "plugins", "local", "adev");

    assert.equal(result.installed, true);
    assert.equal(result.path, cacheDir);
    assert.ok(existsSync(join(cacheDir, ".cursor-plugin", "plugin.json")), "Spec A manifest must be present");
    assert.ok(existsSync(join(cacheDir, "providers", "cursor", "hooks.json")), "Spec C hooks must be present");
    assert.ok(!existsSync(join(cacheDir, ".git")), ".git must be excluded");
    assert.ok(!existsSync(join(cacheDir, "node_modules")), "node_modules must be excluded");
  });

  it("is idempotent: second install returns {installed: false}", async () => {
    await CursorAdapter.install({ scope: "user" });
    const result = await CursorAdapter.install({ scope: "user" });
    assert.equal(result.installed, false);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: FAIL — `not implemented yet`

- [ ] **Implement**

```javascript
// Replace the install() stub in providers/cursor/adapter.mjs:
async install(opts = {}) {
  const cacheDir = getPluginCacheDir();

  if (existsSync(cacheDir)) {
    return { installed: false, path: cacheDir };
  }

  ensureDir(cacheDir);

  // Constitution Reference Principle 1: use fs.cpSync over shelling to cp -r.
  // The OpenCode adapter still uses execSync for historical reasons; the
  // new CursorAdapter does not need that legacy.
  cpSync(PLUGIN_ROOT, cacheDir, {
    recursive: true,
    filter: (src) => {
      const basename = src.split("/").pop();
      return basename !== ".git"
          && basename !== "node_modules"
          && basename !== ".DS_Store";
    },
  });

  // Publish sanitized skill directories (Task 3 fills in publishSkillsFromCache).
  const skillReport = await publishSkillsFromCache(cacheDir);

  return { installed: true, path: cacheDir, skills: skillReport };
},
```

Also add a stub for `publishSkillsFromCache` (real body lands in Task 3):

```javascript
async function publishSkillsFromCache(_cacheDir) {
  return { published: [], failed: [] }; // Task 3
}
```

- [ ] **Verify test passes**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: PASS (both install + idempotency tests)

- [ ] **Commit**

```bash
git add providers/cursor/adapter.mjs tests/provider/cursor-adapter.test.mjs
git commit -m "feat(cursor-provider): implement CursorAdapter.install with fs.cpSync

Spec: .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
Plan-task: 2"
```

---

### Task 3: publishSkillsFromCache() with frontmatter-only sanitization [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=3
**Rationale:** Spec defines sanitization scope precisely with all error cases enumerated; novelty present (custom YAML frontmatter parser, copy-not-symlink divergence) but the plan supplies the full sanitize helper and publish logic inline.

**Charter capability:** `Skill name sanitization`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `providers/cursor/adapter.mjs` (implement `publishSkillsFromCache` + helpers)
- Test: `tests/provider/cursor-adapter.test.mjs` (append sanitization tests)

**Tests:** `tests/provider/cursor-adapter.test.mjs`

**Context to load:**
- Spec Constitution Reference Principle 2 — sanitization scope is strictly the YAML frontmatter block delimited by leading `---` lines. The body is preserved verbatim; colons in code examples or prose stay.
- Spec Behavioral Contract bullet 3 (sanitize `name: adev:<x>` → `name: adev-<x>`).
- Spec Rationale paragraph (intentional copy, not symlink).
- Spec error cases:
  - "Skill source SKILL.md has no `name:` frontmatter" → skip silently.
  - "Skill source `name:` is already in `adev-<x>` form" → pass through.
  - "Skill publish fails on a single skill" → catch and continue; record in install report.
- Sample input: `skills/init/SKILL.md` has frontmatter `name: adev:init` → expected output dirname `adev-init`, frontmatter line `name: adev-init`.

- [ ] **Write failing test**

```javascript
import { readFileSync, writeFileSync } from "fs";

describe("CursorAdapter.install — skill sanitization", () => {
  // (homeDir setup as in Task 2)

  it("publishes ~/.cursor/skills/adev-<name>/ with frontmatter colon sanitized to hyphen", async () => {
    await CursorAdapter.install({ scope: "user" });

    const skillsDir = join(homeDir, ".cursor", "skills");
    const publishedInit = join(skillsDir, "adev-init", "SKILL.md");

    assert.ok(existsSync(publishedInit), "adev-init/SKILL.md must exist");

    const body = readFileSync(publishedInit, "utf8");
    assert.match(body, /^name: adev-init$/m, "frontmatter name must be sanitized");
    assert.doesNotMatch(body, /^name: adev:init$/m, "no colon-form name in published file");
  });

  it("preserves colons in SKILL.md body (frontmatter-only sanitization scope)", async () => {
    // Inject a fixture skill with a colon in the body BEFORE install
    // by overriding PLUGIN_ROOT or by staging a sibling test that uses a
    // temp plugin root. The exact mechanism depends on test helpers.
    //
    // After install, read the published SKILL.md and assert the body line
    // containing the colon is unchanged.
    //
    // Acceptance Criterion line 8 enforces this contract.
    // Implementation detail: see tests/helpers.mjs for createTempDir patterns.
  });

  it("skips skills with no name: frontmatter silently", async () => {
    // Stage a skill with SKILL.md but no `name:` line; assert no
    // ~/.cursor/skills/<x>/ dir is created for it and no error thrown.
  });

  it("passes through already-sanitized name: adev-<x> form unchanged (idempotent)", async () => {
    // Stage SKILL.md with `name: adev-foo` (no colon); assert published
    // file still has `name: adev-foo`.
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: FAIL — `adev-init/SKILL.md` does not exist (current stub returns empty `published`).

- [ ] **Implement**

```javascript
// Helper: parse the frontmatter block (between leading --- lines) and
// rewrite name: adev:<x> → name: adev-<x>. Body is preserved verbatim.
function sanitizeSkillName(content) {
  // Locate frontmatter: must begin with `---\n` (or `---\r\n`).
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { content, sanitizedName: null };
  }

  // Find the closing `---` line.
  const lines = content.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") { endIdx = i; break; }
  }
  if (endIdx === -1) return { content, sanitizedName: null };

  let sanitizedName = null;
  let mutated = false;

  for (let i = 1; i < endIdx; i++) {
    const m = lines[i].match(/^name:\s*(\S+)\s*$/);
    if (!m) continue;
    const raw = m[1];
    if (raw.startsWith("adev:")) {
      const sanitized = "adev-" + raw.slice("adev:".length);
      lines[i] = `name: ${sanitized}`;
      sanitizedName = sanitized;
      mutated = true;
    } else if (raw.startsWith("adev-")) {
      // Already sanitized (idempotent pass-through).
      sanitizedName = raw;
    }
    break; // Only the first `name:` in frontmatter is the skill name.
  }

  // Reassemble. Preserve the original line ending style by re-joining with
  // \n — Node's writeFileSync handles platform line endings consistently
  // for our test surface.
  return {
    content: mutated ? lines.join("\n") : content,
    sanitizedName,
  };
}

async function publishSkillsFromCache(cacheDir) {
  const sourceSkillsDir = join(cacheDir, "skills");
  if (!existsSync(sourceSkillsDir)) return { published: [], failed: [] };

  const targetSkillsDir = getCursorSkillsDir();
  ensureDir(targetSkillsDir);

  const published = [];
  const failed = [];

  const entries = readdirSync(sourceSkillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceDir = join(sourceSkillsDir, entry.name);
    const skillMdPath = join(sourceDir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    try {
      const raw = readFileSync(skillMdPath, "utf8");
      const { content: sanitizedMd, sanitizedName } = sanitizeSkillName(raw);
      if (!sanitizedName) continue; // No name: frontmatter — skip silently.

      const targetDir = join(targetSkillsDir, sanitizedName);
      ensureDir(targetDir);

      // Copy all sibling files verbatim first.
      cpSync(sourceDir, targetDir, { recursive: true });
      // Then overwrite SKILL.md with the sanitized content.
      writeFileSync(join(targetDir, "SKILL.md"), sanitizedMd);

      published.push(sanitizedName);
    } catch (err) {
      failed.push({ skill: entry.name, error: err.message });
    }
  }

  return { published, failed };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: PASS (all sanitization tests)

- [ ] **Commit**

```bash
git add providers/cursor/adapter.mjs tests/provider/cursor-adapter.test.mjs
git commit -m "feat(cursor-provider): publish sanitized skills to ~/.cursor/skills/

Sanitization scope is the SKILL.md YAML frontmatter only; body colons
are preserved verbatim per Constitution Principle 2.

Spec: .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
Plan-task: 3"
```

---

### Task 4: uninstall() — remove plugin + sanitized skills [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Idempotent removal with no-op fallback is explicit in spec; pattern mirrors OpenCodeAdapter uninstall directly; single file touched.

**Charter capability:** `CursorAdapter install/uninstall/status`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `providers/cursor/adapter.mjs` (replace the `uninstall()` stub)
- Test: `tests/provider/cursor-adapter.test.mjs` (append uninstall tests)

**Tests:** `tests/provider/cursor-adapter.test.mjs`

**Context to load:**
- Spec Behavioral Contract bullet 6, Postconditions bullet 4, Error Case "~/.cursor/ does not exist on uninstall".

- [ ] **Write failing test**

```javascript
describe("CursorAdapter.uninstall", () => {
  it("removes the plugin cache dir and all ~/.cursor/skills/adev-*/ dirs", async () => {
    await CursorAdapter.install({ scope: "user" });
    await CursorAdapter.uninstall({ scope: "user" });

    const cacheDir = join(homeDir, ".cursor", "plugins", "local", "adev");
    assert.equal(existsSync(cacheDir), false);

    const skillsDir = join(homeDir, ".cursor", "skills");
    if (existsSync(skillsDir)) {
      const remaining = readdirSync(skillsDir).filter((n) => n.startsWith("adev-"));
      assert.deepEqual(remaining, []);
    }
  });

  it("is idempotent: uninstall when ~/.cursor/ does not exist is a no-op", async () => {
    // Do not call install first. Just uninstall.
    await assert.doesNotReject(() => CursorAdapter.uninstall({ scope: "user" }));
  });

  it("install after uninstall produces the same state as a first install", async () => {
    await CursorAdapter.install({ scope: "user" });
    await CursorAdapter.uninstall({ scope: "user" });
    const result = await CursorAdapter.install({ scope: "user" });
    assert.equal(result.installed, true);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: FAIL — `not implemented yet`

- [ ] **Implement**

```javascript
async uninstall(_opts = {}) {
  const cursorHome = (() => {
    try { return getCursorHome(); } catch { return null; }
  })();
  if (!cursorHome || !existsSync(cursorHome)) return { uninstalled: true };

  // Remove plugin cache dir.
  const cacheDir = getPluginCacheDir();
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }

  // Remove ~/.cursor/skills/adev-*/ directories.
  const skillsDir = getCursorSkillsDir();
  if (existsSync(skillsDir)) {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("adev-")) continue;
      rmSync(join(skillsDir, entry.name), { recursive: true, force: true });
    }
  }

  return { uninstalled: true };
},
```

- [ ] **Verify test passes**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: PASS (all uninstall tests, including idempotency and post-uninstall reinstall)

- [ ] **Commit**

```bash
git add providers/cursor/adapter.mjs tests/provider/cursor-adapter.test.mjs
git commit -m "feat(cursor-provider): implement CursorAdapter.uninstall

Spec: .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
Plan-task: 4"
```

---

### Task 5: detect() / detectConflicts() / disableConflictingPlugin() [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Spec's Superpowers guard mirrors OpenCodeAdapter one-to-one; behavior fully described with env+dir detection rules and config.json plugin map shape.

**Charter capability:** `CursorAdapter install/uninstall/status`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `providers/cursor/adapter.mjs` (implement detection methods)
- Test: `tests/provider/cursor-adapter.test.mjs` (append detection tests)

**Tests:** `tests/provider/cursor-adapter.test.mjs`

**Context to load:**
- Spec Behavioral Contract bullets 7-8, Acceptance Criteria lines 6-7.
- `providers/opencode/adapter.mjs` `detect`, `detectConflicts`, `disableConflictingPlugin` — Superpowers guard pattern.

- [ ] **Write failing test**

```javascript
describe("CursorAdapter.detect", () => {
  it("returns true when CURSOR=true env is set", () => {
    process.env.CURSOR = "true";
    assert.equal(CursorAdapter.detect(), true);
  });

  it("returns true when ~/.cursor/ exists", () => {
    delete process.env.CURSOR;
    mkdirSync(join(homeDir, ".cursor"), { recursive: true });
    assert.equal(CursorAdapter.detect(), true);
  });

  it("returns false when neither env nor dir is present", () => {
    delete process.env.CURSOR;
    // homeDir is fresh per beforeEach, so ~/.cursor/ does not exist.
    assert.equal(CursorAdapter.detect(), false);
  });
});

describe("CursorAdapter.detectConflicts", () => {
  it("returns Superpowers conflict when present in ~/.cursor/config.json:plugins", () => {
    const cursorDir = join(homeDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "config.json"),
      JSON.stringify({ plugins: { superpowers: { enabled: true } } })
    );
    const conflicts = CursorAdapter.detectConflicts();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].name, "superpowers");
  });

  it("returns [] when no config.json exists", () => {
    assert.deepEqual(CursorAdapter.detectConflicts(), []);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: FAIL — `detectConflicts` stub returns `[]` regardless of config.

- [ ] **Implement**

```javascript
detectConflicts() {
  let cursorHome;
  try { cursorHome = getCursorHome(); } catch { return []; }
  const configPath = join(cursorHome, "config.json");
  const config = readJson(configPath);
  if (!config || !config.plugins) return [];

  const conflicts = [];
  // v1 Superpowers guard — matches the OpenCode adapter's guard.
  if (config.plugins.superpowers) {
    conflicts.push({
      name: "superpowers",
      reason: "Superpowers plugin conflicts with adev hook handlers; disable before installing adev.",
    });
  }
  return conflicts;
},

disableConflictingPlugin(name) {
  let cursorHome;
  try { cursorHome = getCursorHome(); } catch { return false; }
  const configPath = join(cursorHome, "config.json");
  const config = readJson(configPath);
  if (!config || !config.plugins || !config.plugins[name]) return false;
  delete config.plugins[name];
  writeJson(configPath, config);
  return true;
},
```

(`detect()` is already implemented in Task 1; this task only confirms it works against the test fixtures above.)

- [ ] **Verify test passes**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: PASS (all detect + detectConflicts tests)

- [ ] **Commit**

```bash
git add providers/cursor/adapter.mjs tests/provider/cursor-adapter.test.mjs
git commit -m "feat(cursor-provider): add detect/detectConflicts with Superpowers guard

Spec: .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
Plan-task: 5"
```

---

### Task 6: Register CursorAdapter in CLI dispatch [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=4 pattern=5 blast=4 novelty=5
**Rationale:** Mechanical import-and-register following existing OpenCode/Codex dispatch pattern in `cli/index.mjs`; loadability-only scope is well-bounded with Spec D explicitly deferred.

**Charter capability:** `CursorAdapter install/uninstall/status` (loadability)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Modify: `cli/index.mjs` (add CursorAdapter to the provider dispatch map; Spec D will add `--provider cursor` verb wiring)
- Test: `tests/provider/cursor-adapter.test.mjs` (add a smoke test asserting the adapter loads via the same import surface the CLI uses)

**Tests:** `tests/provider/cursor-adapter.test.mjs`

**Context to load:**
- `cli/index.mjs` current provider imports/dispatch map.
- Spec Actionable Task Map row 6 — "Spec B just makes the adapter loadable"; full `--provider cursor` plumbing is deferred to Spec D.

- [ ] **Write failing test**

```javascript
describe("CursorAdapter (CLI dispatch loadability)", () => {
  it("is importable via the same path the CLI uses", async () => {
    const mod = await import("../../providers/cursor/adapter.mjs");
    assert.ok(mod.CursorAdapter);
    assert.equal(mod.CursorAdapter.name, "cursor");
  });
});
```

(This test passes as soon as Tasks 1-5 land. The Task 6 modification is to `cli/index.mjs` — add the import and dispatch entry. If `cli/index.mjs` has a provider-registry exported map, add a CLI-level test that the registry contains "cursor". If the registry is internal/non-exported, this task adds only the import/dispatch line and uses the smoke test above for coverage.)

- [ ] **Verify test fails or passes**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: PASS for the smoke test once Task 1 is done. The CLI dispatch edit is a structural change; verify manually by importing `cli/index.mjs` and confirming no parse errors.

- [ ] **Implement**

Edit `cli/index.mjs`:
1. Add the import alongside the existing provider imports:
   ```javascript
   import { CursorAdapter } from "../providers/cursor/adapter.mjs";
   ```
   (Relative path may differ — match the existing OpenCode/Codex import path style.)
2. Add `CursorAdapter` to the provider dispatch map (whatever structure the file uses — typically an object keyed by provider name).
3. Do **not** wire `adev install cursor` as a runnable verb — that is Spec D's scope.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — no regressions across the existing test suite.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/provider/cursor-adapter.test.mjs
git commit -m "feat(cursor-provider): register CursorAdapter in CLI dispatch

Makes the adapter loadable; full --provider cursor plumbing is deferred
to Spec D per the cursor-adapter spec Task Map row 6.

Spec: .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
Plan-task: 6"
```

---

### Task 7: Test suite — install, uninstall, idempotency, sanitization, manifest+hooks, conflicts [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Explicit AC-to-assertion coverage map in the plan; test patterns mirror `claude-code-adapter.test.mjs` and `codex-adapter.test.mjs`; gap-fill task with bounded scope.

**Charter capability:** Both — completes Acceptance Criterion line 9.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5 (test authoring can run in parallel with Task 6)
**Files:**
- Modify (consolidate): `tests/provider/cursor-adapter.test.mjs` — review the test file built up across Tasks 1-6, fill any coverage gaps, and ensure every Acceptance Criterion has at least one assertion.

**Tests:** `tests/provider/cursor-adapter.test.mjs`

**Context to load:**
- Spec Acceptance Criteria — every line that says "covers X" must have an explicit assertion in this file.
- `tests/provider/claude-code-adapter.test.mjs` and `tests/provider/codex-adapter.test.mjs` — mirror the suite structure (describe groups per method, beforeEach/afterEach env+homeDir setup).

**Acceptance Criterion coverage map (verify all 11 lines):**

| AC line | Test assertion location |
|---|---|
| 1 (adapter shape) | Task 1 shape test |
| 2 (install creates cache with Spec A + Spec C artifacts) | Task 2 install test |
| 3 (skill frontmatter sanitized) | Task 3 sanitization test |
| 4 (idempotent install) | Task 2 idempotency test |
| 5 (uninstall + reinstall round-trip) | Task 4 uninstall + reinstall test |
| 6 (detect env or dir) | Task 5 detect tests |
| 7 (Superpowers conflict) | Task 5 detectConflicts test |
| 8 (body colons preserved) | Task 3 body-preservation test |
| 9 (test file exists with full coverage) | Task 7 self-check |
| 10 (no `~/.claude/` paths; `fs.cpSync` used) | Task 7 source-grep assertion (see below) |
| 11 (`npm test` passes) | Task 7 full run |

- [ ] **Write failing test (consolidated assertions)**

Add a structural assertion that the adapter source uses `fs.cpSync` and does not reference `~/.claude/`:

```javascript
describe("CursorAdapter (source constraints)", () => {
  it("uses fs.cpSync (not execSync of cp -r) and avoids ~/.claude/ paths", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../../providers/cursor/adapter.mjs"),
      "utf8"
    );
    assert.match(src, /\bcpSync\b/, "must use fs.cpSync");
    assert.doesNotMatch(src, /execSync\s*\(\s*["'`]cp\s+-r/, "must not shell to cp -r");
    assert.doesNotMatch(src, /~\/\.claude\//, "must not hardcode ~/.claude/ paths");
    assert.doesNotMatch(src, /\.claude["'`]/, "must not reference .claude config dir");
  });
});
```

- [ ] **Verify test fails or passes**

Run: `node --test tests/provider/cursor-adapter.test.mjs`
Expected: PASS for `fs.cpSync` (already used since Task 2), PASS for `~/.claude/` absence. If any AC line lacks coverage, add the missing assertion before continuing.

- [ ] **Implement (gap-fill any missing AC assertions)**

Review the consolidated test file. For any AC line without explicit coverage, add a focused test.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — full project test suite is green. Acceptance Criterion line 11 satisfied.

- [ ] **Commit**

```bash
git add tests/provider/cursor-adapter.test.mjs
git commit -m "test(cursor-provider): consolidate cursor-adapter coverage to all 11 ACs

Spec: .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
Plan-task: 7"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied (see AC coverage map in Task 7)
- Version parity preserved: `package.json:version === .claude-plugin/plugin.json:version === .cursor-plugin/plugin.json:version` (Spec A territory; cursor-adapter does not touch any of these)
- Source manifest re-stamped by `/adev:validate` to reflect new files

Gate definitions live in `.context-index/governance/gates.yaml`. The deterministic gates relevant here are:
- `npm test` (Node `node:test` runner — no external deps required)
- No new external dependencies (Constitution Principle 1; verified at PR review)
- Pure ESM (Constitution Principle 3; structural)


<!-- partial_schema: plan@1 -->

# Implementation Plan: CLI install integration (Cursor provider)

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cursor-provider/charter.md
> **Spec:** .context-index/specs/features/cursor-provider/cli-install-integration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-18)
> **Platform:** Node.js >= 18, JavaScript (ESM, `.mjs`), npm, node:test

**Goal:** Wire the already-loadable `CursorAdapter` (Spec B) into the `adev install` CLI dispatch — add a `cursor` branch to `installProviders()`, surface Cursor as a standalone option in the interactive provider menu, update the lockstep JSDoc + cli-charter `install` description (rev 3 → rev 4), and cover the new flag-driven and menu-driven paths with tests.

**Architecture:** Pure dispatch wiring. The `CursorAdapter` (Spec B), the `.cursor-plugin/plugin.json` manifest (Spec A), and `providers/cursor/hooks.json` (Spec C) already exist on this branch and are exercised by their own test suites. This spec adds: (a) one `else if` branch in `installProviders()` mirroring the `claude-code` branch shape — `provider.install({ scope: "user" })`, `provider.detectConflicts()` with an interactive disable loop — using the existing `ask` / `success` / `warn` / `heading` helpers; (b) one new menu entry plus an "all providers" entry that returns the four-element list; (c) a JSDoc comment update; (d) a cli-charter description revision (rev 3 → rev 4); (e) new tests in `tests/cli.test.mjs`. The implementation lives in `cli/index.mjs` only — path resolution flows through `CursorAdapter`'s helpers per the Constitution anti-pattern (no `~/.cursor/` literals in `cli/index.mjs`).

**Implementation-name note.** The spec names the provider-flag parser `parseProviderArgs` and the menu `selectProvidersInteractive`. The current `cli/index.mjs` calls these `parseProviderFlags` (line 56) and `selectProviders` (line 74) respectively. The two are the same functions; this plan uses the actual implementation names. No rename is performed under this spec.

**Review notes addressed.**

- **CON-1 (charter `--target` vs spec `--provider`).** Out of plan scope. The cursor-provider charter's Exposed APIs row at `cursor-provider/charter.md:111` names `adev install --target cursor`, but the actual implementation flag is `--provider <name>`. The spec reconciles the vocabulary in-prose (Invocation Modes, line 33). Tracked here as a follow-up; no edit is made under this plan to keep the spec's scope intact. See "Charter follow-up" in the Quality Gates section.
- **CON-2 (capability-row starting state).** Stale in spec prose, but the underlying transition is automated by `/adev:validate` regardless of source state. The plan does not rewrite the spec — the acceptance criterion "Charter Capability Map rows for `CLI install integration` and `CLI charter revision` transition to `validated` after `/adev:validate` passes" is what the plan enforces. The "from `—`" phrasing is treated as descriptive context, not a literal precondition.

---

## File Structure

**Create:**
- _(none)_ — every file in scope already exists.

**Modify:**
- `cli/index.mjs:74-104` — `selectProviders()` menu: add standalone Cursor entry; renumber; "all providers" returns the four-element list `["claude-code", "opencode", "codex", "cursor"]`.
- `cli/index.mjs:526-529` — `installProviders()` JSDoc header comment: append `, Cursor` so it reads `* Install providers (Claude Code, OpenCode, Codex, Cursor).`
- `cli/index.mjs:530-611` — `installProviders()` body: add an `else if (providerName === "cursor")` branch that calls `provider.install({ scope: "user" })`, prints `Plugin v… installed`/`already installed`, and runs the conflict-detection prompt loop.
- `tests/cli.test.mjs` — add a new `describe("installProviders — cursor branch")` suite covering: `--provider cursor` flag path, registry resolution, adapter `install` call against a temp HOME, idempotency on a second run, and the conflict-detect prompt path.
- `.context-index/specs/features/cli/charter.md:3` — frontmatter `revision: 3` → `revision: 4`; `updated:` → `2026-05-18` (spec landing date).
- `.context-index/specs/features/cli/charter.md:46` — rewrite the `install` command description: `Register plugin with provider (Claude Code, OpenCode, Codex), …` → `Register plugin with provider (Claude Code, OpenCode, Codex, Cursor), …`.

**Reference (read, do not modify):**
- `providers/cursor/adapter.mjs` — already on this branch via Spec B. Source of truth for `CursorAdapter.install`, `detectConflicts`, `disableConflictingPlugin`, and the `getCursorHome()` / `getCursorSkillsDir()` path helpers. Read to confirm the install signature and return shape.
- `cli/index.mjs:535-559` — the `claude-code` branch in `installProviders()`. Mirror its shape for Cursor: `install` → `success` / `already installed` → conflict prompt loop using `ask` / `disableConflictingPlugin`.
- `cli/index.mjs:55-72` — `parseProviderFlags()`. Validator already accepts `cursor` via `getProviderNames()` (Spec B registered the adapter). No changes here — this plan relies on that existing behavior.
- `lib/provider/registry.mjs` — `getProvider("cursor")` already returns `CursorAdapter` from Spec B's Task 6.
- `tests/provider/cursor-adapter.test.mjs` — already covers the adapter unit behavior. The new `tests/cli.test.mjs` cases focus on the CLI dispatcher's correct integration, not adapter internals.

---

## Context Packets

### Task 1 Context (Add `cursor` branch to `installProviders()`)
- Spec: `.context-index/specs/features/cursor-provider/cli-install-integration.spec.md` (Output Contract bullets 1–4, Acceptance Criterion line 1, Failure Modes rows 1–3 + 5)
- Charter: `.context-index/specs/features/cursor-provider/charter.md` (capability: `CLI install integration`)
- Source files:
  - `cli/index.mjs:530-611` — full read; mirror the `claude-code` branch shape (lines 535–559).
  - `providers/cursor/adapter.mjs` — read `install`, `detectConflicts`, `disableConflictingPlugin` signatures and return shapes. `install` accepts `{ scope }` and returns `{ installed: boolean, path: string }`. `detectConflicts` returns an array of `{ name, reason, key? }`.
  - `providers/claude-code/adapter.mjs` `detectConflicts` return shape — to confirm whether `disableConflictingPlugin` takes a `name` or a `key` so the conflict loop matches.
- Constitution: Principle 1 (no new deps), Principle 3 (ESM), Anti-pattern (no hardcoded `~/.cursor/` literals in `cli/index.mjs` — paths come from `CursorAdapter`).
- Sample: none required — the existing claude-code branch is the pattern.

### Task 2 Context (Extend `selectProviders()` menu with Cursor)
- Spec: `.context-index/specs/features/cursor-provider/cli-install-integration.spec.md` (Invocation Modes line 30, Output Contract line 52, Acceptance Criterion line 2)
- Source files:
  - `cli/index.mjs:74-104` — full read; current menu structure (6 entries across three legacy providers).
- Constitution: none — pure prose menu update.
- Note: The current menu shape uses `console.log` with hardcoded numeric labels and a `switch` over the typed answer. Renumbering MAY change prior numeric mappings; the spec accepts this trade-off (Task Map row 2: "Renumber entries as needed; keep prior numeric mappings stable for users who pasted defaults from docs"). Concrete renumbering choice below.

### Task 3 Context (Update `installProviders()` JSDoc comment)
- Spec: `.context-index/specs/features/cursor-provider/cli-install-integration.spec.md` (Output Contract line 54, Acceptance Criterion line 3)
- Source files:
  - `cli/index.mjs:526-529` — current JSDoc block: `* Install providers (Claude Code, OpenCode, Codex).`
- One-line edit; no test required (JSDoc is informational).

### Task 4 Context (Bump cli charter to rev 4)
- Spec: `.context-index/specs/features/cursor-provider/cli-install-integration.spec.md` (Output Contract line 54, Acceptance Criterion line 4)
- Parent charter (cursor-provider): `.context-index/specs/features/cursor-provider/charter.md` (capability: `CLI charter revision`)
- Sibling charter (cli): `.context-index/specs/features/cli/charter.md` lines 1–11 (frontmatter, current `revision: 3`) and line 46 (`install` command description).
- Constitution: Principle 5 (version parity) does NOT apply here — the cli charter `revision` is a charter-level counter, separate from package.json / `.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json` parity.

### Task 5 Context (Tests for `--provider cursor` end-to-end)
- Spec: `.context-index/specs/features/cursor-provider/cli-install-integration.spec.md` (Acceptance Criterion line 5, Failure Modes rows 1–3 + 5)
- Source files:
  - `tests/cli.test.mjs` — full read; mirror existing test patterns. Note the file has no current top-level `installProviders` describe — coverage is currently via `enablePlugin`/`detectConflicts`/`disableConflictingPlugin` for the claude-code adapter (lines 112–243).
  - `tests/provider/cursor-adapter.test.mjs` — read setup/teardown (`mkdtempSync` for `homeDir`, env override, cleanup) and reuse the same pattern.
  - `tests/helpers.mjs` — `createTempDir`, `cleanupTempDir`, `writeFixture`, `runHook`.
- Cross-cutting: none.

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

- Group A (sequential): Task 1 → Task 5 (Task 5 asserts the branch added in Task 1).
- Group B (independent of Group A): Task 2 — `selectProviders()` menu lives in a sibling function in the same file; conflicts with Task 1 only on `cli/index.mjs` chunk boundaries. Sequence with Group A to keep diffs clean.
- Group C (independent): Task 3 — JSDoc comment edit. Same file, different line range. Sequence with Group A.
- Group D (independent of all above): Task 4 — cli charter edit. Different file; can run in parallel.

Recommended ordering: Task 1 → Task 2 → Task 3 → Task 4 → Task 5. Tasks 4 may also be authored in parallel by a separate operator since it touches a different file.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Add `cursor` branch to `installProviders()` | small | unit | — | 0 create, 1 modify |
| 2 | Extend `selectProviders()` menu with Cursor entry + four-element "all" | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Update `installProviders()` JSDoc comment | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Bump cli charter to rev 4 (frontmatter + install description) | small | unit | — | 0 create, 1 modify |
| 5 | Tests — `--provider cursor` end-to-end in `tests/cli.test.mjs` | medium | unit | Task 1, Task 2 | 0 create, 1 modify |

---

## Task Structure

### Task 1: Add `cursor` branch to `installProviders()` [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Single-file dispatch addition with explicit Output Contract bullets, exact code shape, and an in-repo mirror branch — pure pattern application with no architectural decisions required.

**Charter capability:** `CLI install integration`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `cli/index.mjs:530-611` — append a fourth `else if` branch covering `cursor`.
- Test: `tests/cli.test.mjs` — branch coverage added in Task 5.

**Tests:** `tests/cli.test.mjs` (the assertion for this task lives in Task 5; the branch itself is exercised manually by running `node cli/index.mjs install --provider cursor` against a temp HOME until Task 5 lands).

**Context to load:**
- `cli/index.mjs:530-611` (`installProviders` body)
- `cli/index.mjs:535-559` (`claude-code` branch — mirror shape)
- `providers/cursor/adapter.mjs` (`install`, `detectConflicts`, `disableConflictingPlugin` signatures)
- Spec Output Contract bullets 1–4
- Constitution anti-pattern: no `~/.cursor/` literals in `cli/index.mjs` — all path access goes through `CursorAdapter` helpers.

- [ ] **Write failing test**

A minimal smoke test that proves the branch exists. Full coverage lands in Task 5; this RED-step test is the structural assertion.

```javascript
// tests/cli.test.mjs (append to file)
import { readFileSync } from "fs";
import { join } from "path";

describe("installProviders — cursor branch structure", () => {
  it("contains an explicit `cursor` provider branch with install({ scope: 'user' })", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../cli/index.mjs"),
      "utf8"
    );
    // The cursor branch must call provider.install({ scope: "user" }) per spec Output Contract bullet 3.
    assert.match(
      src,
      /else if\s*\(\s*providerName\s*===\s*["']cursor["']\s*\)/,
      "installProviders must contain a `cursor` branch"
    );
    assert.match(
      src,
      /provider\.install\(\s*\{\s*scope:\s*["']user["']\s*\}\s*\)/,
      "cursor branch must call provider.install({ scope: 'user' })"
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli.test.mjs`
Expected: FAIL — assertion fails because no `cursor` branch exists yet in `installProviders`.

- [ ] **Implement**

In `cli/index.mjs`, add a new `else if` branch at the end of the `installProviders` `for` loop, after the `codex` branch (currently ends near line 609). The branch mirrors the `claude-code` shape (install → success message → conflict prompt loop), adapted for Cursor's `install({ scope: "user" })` signature from Spec B.

```javascript
    } else if (providerName === "cursor") {
      const { installed, path: pluginPath } = await provider.install({ scope: "user" });
      if (installed) {
        success(`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}`);
      } else {
        success(`Plugin v${PLUGIN_VERSION} already installed`);
      }

      const conflicts = provider.detectConflicts();
      if (conflicts.length === 0) {
        success("No conflicting plugins detected");
      } else {
        for (const conflict of conflicts) {
          warn(`${conflict.name} — ${conflict.reason}`);
          const disable = await ask(`Disable ${conflict.name} for THIS project? (yes/no)`);
          if (disable === "yes" || disable === "y") {
            // Match the claude-code branch arg shape: pass conflict.key when
            // present (claude-code provides one); fall back to conflict.name
            // when the adapter does not (cursor's Superpowers guard returns
            // { name, reason } without a key per providers/cursor/adapter.mjs).
            provider.disableConflictingPlugin(conflict.key ?? conflict.name);
            success(`${conflict.name} disabled for this project`);
          }
        }
      }
    }
```

Notes:
- The "scope: user" decision matches Spec B's adapter contract — `CursorAdapter.install` ignores the `opts` parameter today but accepts `{ scope }` defensively. Passing the explicit object documents intent and protects against a future adapter change.
- No `~/.cursor/` string literals are introduced (Constitution Reference, spec line 75).
- `disableConflictingPlugin` is called only when the user types `yes`/`y`, matching the claude-code branch exactly.

- [ ] **Verify test passes**

Run: `node --test tests/cli.test.mjs --test-name-pattern "cursor branch structure"`
Expected: PASS.

- [ ] **Commit**

Branch (if not already created): `feat/cursor-provider/cli-install-integration`

```bash
git add cli/index.mjs tests/cli.test.mjs
git commit -m "$(cat <<'EOF'
feat(cursor-provider): add cursor branch to installProviders dispatch

Mirrors the claude-code branch shape (install → success message →
conflict prompt loop) and routes through CursorAdapter for all path
resolution per the Constitution anti-pattern on ~/.cursor/ literals.

Spec: .context-index/specs/features/cursor-provider/cli-install-integration.spec.md
Plan-task: 1
EOF
)"
```

---

### Task 2: Extend `selectProviders()` menu with standalone Cursor entry [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Mechanical menu extension and ask-injector addition with exact renumbering specified and full implementation code provided in the plan; single-file change with no boundary crossings.

**Charter capability:** `CLI install integration`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `cli/index.mjs:74-104` — extend the numeric menu and the answer-handling `switch`.
- Test: `tests/cli.test.mjs` — append menu-shape assertion (extracts and runs `selectProviders` against a mocked `ask`).

**Tests:** `tests/cli.test.mjs`

**Context to load:**
- `cli/index.mjs:74-104` (current `selectProviders` body)
- Spec Output Contract (line 52): "all providers" entry returns `["claude-code", "opencode", "codex", "cursor"]`.

- [ ] **Write failing test**

`selectProviders` is not currently exported. Add an export and a test that drives the menu by stubbing `ask`.

```javascript
// tests/cli.test.mjs (append)
import { selectProviders } from "../cli/index.mjs"; // see implementation step below — add export
// ...
describe("selectProviders — menu shape", () => {
  let originalAsk;
  beforeEach(() => {
    // The CLI's ask() lives in lib/cli-helpers (or similar). To stub it without
    // monkey-patching internals, we drive the menu by setting process.stdin.
    // Simplest: feed answers through a child_process spawn of the CLI binary,
    // OR refactor selectProviders to accept an optional ask injector. Prefer
    // the injector approach for testability — it adds a single optional arg
    // with default-equality to the imported helper.
  });

  it("returns standalone cursor for the cursor menu entry", async () => {
    const fakeAsk = async () => "4"; // numeric choice for Cursor — confirm after renumber
    const result = await selectProviders({ ask: fakeAsk });
    assert.deepEqual(result, ["cursor"]);
  });

  it("returns the four-element list for the 'all providers' choice", async () => {
    // The 'all providers' choice is whatever number the renumbered menu uses;
    // pick the entry whose label says "All four providers".
    const fakeAsk = async () => "7"; // confirm after renumber — see implementation
    const result = await selectProviders({ ask: fakeAsk });
    assert.deepEqual(result, ["claude-code", "opencode", "codex", "cursor"]);
  });

  it("preserves the default (claude-code only) on empty input", async () => {
    const fakeAsk = async () => "";
    const result = await selectProviders({ ask: fakeAsk });
    assert.deepEqual(result, ["claude-code"]);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli.test.mjs`
Expected: FAIL — `selectProviders` is not exported AND the new menu choices do not exist.

- [ ] **Implement**

1. Export `selectProviders`. Add `export` to the function signature in `cli/index.mjs:74`. The function MUST accept an optional `{ ask: askFn = ask }` injector so tests can drive the menu without spawning a subprocess. This is an additive, backward-compatible change.

2. Extend the menu. Concrete renumbering (Spec Task Map row 2 explicitly allows this; the prior six entries keep their meanings, new Cursor entries are appended):

```javascript
export async function selectProviders({ ask: askFn = ask } = {}) {
  const explicitProviders = parseProviderFlags();
  if (explicitProviders.length > 0) {
    return explicitProviders;
  }

  console.log("  Which AI coding assistant(s) do you want to use?\n");
  console.log("    [1] Claude Code only (default)");
  console.log("    [2] OpenCode only");
  console.log("    [3] OpenAI Codex only");
  console.log("    [4] Cursor only");
  console.log("    [5] Claude Code and OpenCode");
  console.log("    [6] Claude Code and OpenAI Codex");
  console.log("    [7] All four providers (Claude Code, OpenCode, Codex, Cursor)\n");

  const answer = await askFn("Enter choice (1-7) [1]: ");

  switch (answer) {
    case "2":
      return ["opencode"];
    case "3":
      return ["codex"];
    case "4":
      return ["cursor"];
    case "5":
      return ["claude-code", "opencode"];
    case "6":
      return ["claude-code", "codex"];
    case "7":
      return ["claude-code", "opencode", "codex", "cursor"];
    default:
      return ["claude-code"];
  }
}
```

Notes on renumbering:
- Entries 1–3 keep their meanings. Entry 6 ("All three providers") drops; the spirit migrates to entry 7 ("All four providers").
- Prior numeric entry 4 ("Claude Code and OpenCode") moves to 5; prior entry 5 ("Claude Code and OpenAI Codex") moves to 6. This is a user-visible change for anyone who memorized "4" or "5" — the spec accepts the trade-off (Task Map row 2: "Renumber entries as needed").
- The prompt label `Enter choice (1-6)` becomes `Enter choice (1-7)` to match the new range.

- [ ] **Verify test passes**

Run: `node --test tests/cli.test.mjs --test-name-pattern "selectProviders"`
Expected: PASS for all three menu-shape tests.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli.test.mjs
git commit -m "$(cat <<'EOF'
feat(cursor-provider): add Cursor to interactive provider menu

selectProviders gains a standalone Cursor entry (option 4) and an
all-four-providers entry (option 7). Existing single-provider options
1-3 keep their numbers; combined entries renumber from 4-6 to 5-6 per
spec Task Map row 2.

The function now accepts an optional { ask } injector for testability —
default behavior is unchanged.

Spec: .context-index/specs/features/cursor-provider/cli-install-integration.spec.md
Plan-task: 2
EOF
)"
```

---

### Task 3: Update `installProviders()` JSDoc comment [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** One-line documentation edit with the exact target string specified by the spec — fully mechanical with zero risk.

**Charter capability:** `CLI install integration`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `cli/index.mjs:526-529` — single-line JSDoc rewrite.
- Test: covered by Task 5's source-grep assertion.

**Tests:** `tests/cli.test.mjs` (covered by Task 5 source-grep).

**Context to load:**
- `cli/index.mjs:526-529` — current JSDoc block.
- Spec Acceptance Criterion line 3.

- [ ] **Write failing test**

```javascript
// tests/cli.test.mjs (append)
describe("installProviders — JSDoc names all four providers", () => {
  it("the JSDoc header lists Claude Code, OpenCode, Codex, and Cursor", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../cli/index.mjs"),
      "utf8"
    );
    assert.match(
      src,
      /\*\s*Install providers \(Claude Code, OpenCode, Codex, Cursor\)/,
      "installProviders JSDoc must name all four providers"
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli.test.mjs --test-name-pattern "JSDoc"`
Expected: FAIL — current JSDoc reads `(Claude Code, OpenCode, Codex)`.

- [ ] **Implement**

Edit `cli/index.mjs:527`:

```javascript
/**
 * Install providers (Claude Code, OpenCode, Codex, Cursor).
 * @param {string[]} providerNames
 */
async function installProviders(providerNames) {
```

- [ ] **Verify test passes**

Run: `node --test tests/cli.test.mjs --test-name-pattern "JSDoc"`
Expected: PASS.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli.test.mjs
git commit -m "$(cat <<'EOF'
docs(cursor-provider): name Cursor in installProviders JSDoc

Spec: .context-index/specs/features/cursor-provider/cli-install-integration.spec.md
Plan-task: 3
EOF
)"
```

---

### Task 4: Bump cli charter to rev 4 (frontmatter + install description) [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Frontmatter bump plus a single description rewrite with exact target strings — purely mechanical doc edit, separate file from Task 1-3 so it can also run in parallel.

**Charter capability:** `CLI charter revision`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** —
**Files:**
- Modify: `.context-index/specs/features/cli/charter.md:3` — frontmatter `revision: 3` → `revision: 4`, `updated:` → `2026-05-18`.
- Modify: `.context-index/specs/features/cli/charter.md:46` — `install` command description: replace `(Claude Code, OpenCode, Codex)` with `(Claude Code, OpenCode, Codex, Cursor)`.
- Test: covered by Task 5 source-grep assertion against the charter file.

**Tests:** `tests/cli.test.mjs` (covered by Task 5 source-grep).

**Context to load:**
- `.context-index/specs/features/cli/charter.md` lines 1–11 (frontmatter) and line 46 (`install` description).
- Spec Acceptance Criterion line 4.

- [ ] **Write failing test**

```javascript
// tests/cli.test.mjs (append)
describe("cli charter — rev 4 with Cursor", () => {
  it("frontmatter is on revision 4 and dated 2026-05-18", () => {
    const md = readFileSync(
      join(import.meta.dirname, "../.context-index/specs/features/cli/charter.md"),
      "utf8"
    );
    assert.match(md, /^revision:\s*4\b/m, "cli charter must be on revision: 4");
    assert.match(md, /^updated:\s*2026-05-18\b/m, "cli charter updated: must be set to spec landing date");
  });

  it("install command description names Cursor", () => {
    const md = readFileSync(
      join(import.meta.dirname, "../.context-index/specs/features/cli/charter.md"),
      "utf8"
    );
    assert.match(
      md,
      /\*\*`install`\*\* — Register plugin with provider \(Claude Code, OpenCode, Codex, Cursor\)/,
      "cli charter install description must name all four providers"
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli.test.mjs --test-name-pattern "cli charter"`
Expected: FAIL — current frontmatter is `revision: 3` and install description omits Cursor.

- [ ] **Implement**

In `.context-index/specs/features/cli/charter.md`:

1. Frontmatter (lines 3, 5):
   - `revision: 3` → `revision: 4`
   - `updated: <existing date>` → `updated: 2026-05-18`

2. Line 46 (`install` description), replace:
   ```
   - **`install`** — Register plugin with provider (Claude Code, OpenCode, Codex), scaffold minimal `.context-index/`, set up git hooks, stamp version. Exits early if adev is already installed, suggesting `upgrade` instead.
   ```
   with:
   ```
   - **`install`** — Register plugin with provider (Claude Code, OpenCode, Codex, Cursor), scaffold minimal `.context-index/`, set up git hooks, stamp version. Exits early if adev is already installed, suggesting `upgrade` instead.
   ```

- [ ] **Verify test passes**

Run: `node --test tests/cli.test.mjs --test-name-pattern "cli charter"`
Expected: PASS.

- [ ] **Commit**

```bash
git add .context-index/specs/features/cli/charter.md tests/cli.test.mjs
git commit -m "$(cat <<'EOF'
docs(cli): bump charter to rev 4 — name Cursor in install verb description

Adds Cursor to the install command's provider list per the cursor-provider
charter's "CLI charter revision" capability.

Spec: .context-index/specs/features/cursor-provider/cli-install-integration.spec.md
Plan-task: 4
EOF
)"
```

---

### Task 5: Tests — `--provider cursor` end-to-end in `tests/cli.test.mjs` [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=4
**Rationale:** Comprehensive test suite with full code provided, reuses the temp-HOME pattern from cursor-adapter.test.mjs; touches two files (cli/index.mjs export+ask-injector refactor and tests/cli.test.mjs) but stays within unit-test boundaries.

**Charter capability:** `CLI install integration`
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Modify: `tests/cli.test.mjs` — add a `describe("installProviders — cursor end-to-end")` suite.
- Reference (no edits): `tests/provider/cursor-adapter.test.mjs` (setup pattern), `providers/cursor/adapter.mjs` (adapter under test).

**Tests:** `tests/cli.test.mjs`

**Context to load:**
- Spec Acceptance Criterion line 5: "covers `--provider cursor` end-to-end: registry lookup, adapter `install` call against a temp HOME, idempotency on a second run, and the conflict-detect prompt path".
- Spec Failure Modes rows 1, 2, 3, 5 (idempotency, conflict-decline, no-`~/.cursor/` install, repeat `--provider cursor`).
- `tests/provider/cursor-adapter.test.mjs` — the temp-HOME setup pattern (`mkdtempSync` + env override + cleanup).
- `cli/index.mjs:530-611` — `installProviders` body to exercise.

To exercise `installProviders` directly in a unit test, it MUST be exported from `cli/index.mjs`. If it is not already exported, this task adds the export alongside the `selectProviders` export added in Task 2. The function signature stays unchanged; tests pass the array `["cursor"]` directly.

- [ ] **Write failing test**

```javascript
// tests/cli.test.mjs (append)
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { installProviders } from "../cli/index.mjs"; // add export in implementation step

describe("installProviders — cursor end-to-end", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cli-cursor-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
    // Silence ask() prompts during conflict-detect by pre-creating no
    // ~/.cursor/config.json — detectConflicts returns [] and no prompt fires.
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("resolves cursor via getProvider and copies the plugin tree to ~/.cursor/plugins/local/adev/", async () => {
    await installProviders(["cursor"]);
    const cacheDir = join(homeDir, ".cursor", "plugins", "local", "adev");
    assert.ok(existsSync(cacheDir), "plugin must be installed to ~/.cursor/plugins/local/adev/");
    assert.ok(existsSync(join(cacheDir, ".cursor-plugin", "plugin.json")), "Spec A manifest must be present");
    assert.ok(existsSync(join(cacheDir, "providers", "cursor", "hooks.json")), "Spec C hooks must be present");
  });

  it("is idempotent on a second --provider cursor pass", async () => {
    await installProviders(["cursor"]);
    // Second pass should not throw and should report "already installed".
    // The CLI prints success/warn to stdout; we assert no throw and that
    // the cache dir contents are unchanged.
    await assert.doesNotReject(() => installProviders(["cursor"]));
  });

  it("handles --provider cursor --provider cursor as a single CLI invocation (idempotency)", async () => {
    // Spec Failure Modes row 5: repeated --provider cursor passes; second is
    // idempotent. installProviders iterates the array, so passing ["cursor", "cursor"]
    // mirrors the parseProviderFlags output for that CLI invocation.
    await assert.doesNotReject(() => installProviders(["cursor", "cursor"]));
  });

  it("prompts to disable Superpowers when ~/.cursor/config.json names it as a plugin", async () => {
    // Stage a config.json that triggers CursorAdapter.detectConflicts.
    const cursorDir = join(homeDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "config.json"),
      JSON.stringify({ plugins: { superpowers: { enabled: true } } })
    );

    // ask() needs to be stubbed for this test. The CLI's ask helper reads from
    // stdin; the implementation step refactors installProviders to accept an
    // optional { ask } injector matching selectProviders. Default keeps the
    // production ask helper; tests pass a fake.
    const answers = ["no"]; // decline the disable prompt → conflict left in place
    const fakeAsk = async () => answers.shift() ?? "";

    await assert.doesNotReject(() =>
      installProviders(["cursor"], { ask: fakeAsk })
    );
    // The Superpowers plugin entry must still be present in config.json
    // because the user declined.
    const cfg = JSON.parse(
      readFileSync(join(cursorDir, "config.json"), "utf8")
    );
    assert.ok(cfg.plugins.superpowers, "Superpowers must remain when user declines disable");
  });

  it("removes Superpowers from config.json when the user accepts the disable prompt", async () => {
    const cursorDir = join(homeDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "config.json"),
      JSON.stringify({ plugins: { superpowers: { enabled: true } } })
    );

    const answers = ["yes"];
    const fakeAsk = async () => answers.shift() ?? "";

    await installProviders(["cursor"], { ask: fakeAsk });
    const cfg = JSON.parse(
      readFileSync(join(cursorDir, "config.json"), "utf8")
    );
    assert.ok(!cfg.plugins?.superpowers, "Superpowers must be removed after user accepts disable");
  });

  it("rejects --provider unknown via parseProviderFlags (existing contract unchanged)", () => {
    // This contract is owned by parseProviderFlags, not installProviders.
    // Asserting at the parseProviderFlags layer keeps the test scope honest;
    // see existing test coverage in this file for the unknown-provider path
    // OR add a dedicated subprocess assertion here.
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli.test.mjs --test-name-pattern "cursor end-to-end"`
Expected: FAIL — `installProviders` is not exported AND/OR does not accept an `{ ask }` injector.

- [ ] **Implement**

1. **Export `installProviders` from `cli/index.mjs`.** Add `export` to the function signature on line 530. Existing internal callers (`cmdInstall`, `cmdInit`) keep their direct calls — exporting a function does not change its identity for in-module callers.

2. **Add an optional `{ ask }` injector to `installProviders`.** Refactor the function signature from:
   ```javascript
   async function installProviders(providerNames) { … }
   ```
   to:
   ```javascript
   export async function installProviders(providerNames, { ask: askFn = ask } = {}) { … }
   ```
   Inside the function, replace every call to `ask(…)` with `askFn(…)`. This is a four-call substitution in the existing claude-code branch (line 543, line 553) plus the two new calls in the cursor branch (added in Task 1). Default keeps production behavior identical.

3. **Update the cursor branch from Task 1** to use `askFn` (or rename the parameter so the cursor branch picks it up automatically — recommended: use `askFn` everywhere for consistency).

4. **Verify the cursor adapter contract still matches.** `CursorAdapter.detectConflicts` returns `Array<{ name, reason }>` per `providers/cursor/adapter.mjs` (no `key` field). The Task 1 implementation already uses `conflict.key ?? conflict.name` so this is a no-op compatibility shim.

- [ ] **Verify test passes**

Run: `node --test tests/cli.test.mjs`
Expected: PASS for all cursor end-to-end tests.

Run: `npm test`
Expected: PASS — no regressions across the existing test suite.

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli.test.mjs
git commit -m "$(cat <<'EOF'
test(cursor-provider): cover --provider cursor end-to-end in cli.test.mjs

- Exports installProviders with an optional { ask } injector for testability
- Asserts registry resolution, plugin tree copy, idempotency on a second
  pass, and the Superpowers conflict-disable prompt loop (accept + decline)
- Mirrors the temp-HOME setup pattern from tests/provider/cursor-adapter.test.mjs

Spec: .context-index/specs/features/cursor-provider/cli-install-integration.spec.md
Plan-task: 5
EOF
)"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - AC 1 — `cursor` branch in `installProviders` calls `CursorAdapter.install({ scope: "user" })` → covered by Task 1 + Task 5
  - AC 2 — `selectProviders` menu has standalone Cursor entry; "all providers" returns 4-element list → covered by Task 2
  - AC 3 — JSDoc names all four providers → covered by Task 3 + Task 5 source-grep
  - AC 4 — cli charter on revision: 4 with `updated:` set; install description names Cursor → covered by Task 4
  - AC 5 — `tests/cli.test.mjs` covers `--provider cursor` end-to-end → Task 5
  - AC 6 — `npm test` passes → final validation step
  - AC 7 — no new external dependencies; ESM only; no hardcoded `~/.cursor/` literals in `cli/index.mjs` → enforced by Constitution Principles 1+3 + Task 1 source-grep
  - AC 8 — Capability Map rows `CLI install integration` + `CLI charter revision` flip to `validated` → automated by `/adev:validate`

Gate definitions live in `.context-index/governance/gates.yaml`. The deterministic gates relevant here:
- `npm test` (Node `node:test` runner — no external deps required)
- No new external dependencies (Constitution Principle 1; verified at PR review)
- Pure ESM (Constitution Principle 3; structural)
- Version parity unchanged by this spec (the spec touches no manifest version fields)

### Charter follow-up (CON-1)

The cursor-provider charter's Exposed APIs row at `cursor-provider/charter.md:111` documents the CLI surface as `adev install --target cursor`, but the actual implementation flag — and the one used throughout this plan, the spec, and the existing tests — is `--provider <name>`. The spec reconciles this in-prose (Invocation Modes, line 33). A one-line charter edit (`--target` → `--provider`) is recommended during `/adev:validate` or as a separate hygiene pass; it is outside this plan's scope to keep the spec boundaries intact.

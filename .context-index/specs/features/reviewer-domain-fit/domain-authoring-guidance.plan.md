<!-- partial_schema: plan@1 -->

# Implementation Plan: Domain Authoring Guidance

> **Methodology:** adev
> **Charter:** .context-index/specs/features/reviewer-domain-fit/charter.md
> **Spec:** .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
> **Review:** PASS (2026-08-18)
> **Platform:** none (CLI/plugin) — JavaScript (ESM), Node.js, npm, node:test

**Goal:** Move `/adev:specify`'s hardcoded web-app-shaped authoring examples (HTTP status codes, drag-and-drop) into a new domain-owned `specify-guidance` config type, resolved through the same `loadDomainConfig` precedence already used for `reviewers.yaml`/`gates.yaml`, and remove the `HTTP Status / Error Code` column baked into the two written spec templates.

**Architecture:** Adds `specify-guidance` to the closed `DOMAIN_CONFIG_TYPES`/`DOMAIN_CONFIG_FILENAMES` sets (`lib/domains/constants.mjs`) as an unstructured (markdown) type, exactly like `spec-template`/`charter-template`. A new `adev domain load-guidance` CLI subcommand (mirroring the existing `load-test-config` shell in `lib/cli/domain.mjs`) is the only legal seam `skills/specify/SKILL.md` has to reach `loadDomainConfig` for this type, per this repo's `cli-driver-surface` anti-pattern (no inline Node in SKILL.md). `templates/domains/software/specify-guidance.md` ships the bundled CLI/library-shaped default. Step 4 of `skills/specify/SKILL.md` is rewired to call the new verb and render either the loaded guidance or an explicit empty-state message — never silence. The two written spec templates' Error Cases header changes independently of this resolution path (`resolveTemplate`, not `loadDomainConfig`). Scope is strictly Phase 2 "panel and prompts" (authoring guidance only) — no reviewer panel, prompt file, or `review.yaml` change is included; that is the sibling `reviewer-panel-retarget` spec's territory.

---

## File Structure

**Create:**
- `templates/domains/software/specify-guidance.md` — bundled default authoring guidance: CLI/library-shaped Behaviors examples and Error Cases framed as thrown/exit error codes (no HTTP status codes, no drag-and-drop UI)
- `tests/skills/specify-domain-guidance.test.mjs` — asserts `skills/specify/SKILL.md` contains no hardcoded HTTP-status/drag-and-drop phrasing, calls `adev domain load-guidance`, and states the explicit empty-state fallback message
- `tests/templates/spec-template-error-code-header.test.mjs` — asserts both written spec templates carry an `Error Code` column header and no `HTTP Status` column

**Modify:**
- `lib/domains/constants.mjs:11-32` — add `'specify-guidance'` to `DOMAIN_CONFIG_TYPES` and `['specify-guidance', 'specify-guidance.md']` to `DOMAIN_CONFIG_FILENAMES`; NOT added to `STRUCTURED_CONFIG_TYPES`
- `lib/cli/domain.mjs` — add `runLoadGuidance()` + `load-guidance` dispatch entry + `help()` text, modeled on `runLoadTestConfig` (lines 322-343)
- `skills/specify/SKILL.md:379-383` — replace the hardcoded Error Cases prompt; `skills/specify/SKILL.md:360-361` — replace the hardcoded BEH-1/BEH-2 Kanban example; both replaced by the loaded-guidance flow calling `adev domain load-guidance --module <charter-module> [--charter <charter-path>]` (reusing the same `--module`/`--charter` values already resolved for `adev domain resolve` at Step 2, line ~154)
- `providers/codex/skills/specify/SKILL.md`, `providers/opencode/skills/specify/SKILL.md` — regenerated via `node scripts/sync-provider-skills.mjs`; never hand-edited
- `templates/spec-template.behavioral.md:79` — Error Cases header `| Condition | Expected Behavior | HTTP Status / Error Code |` → `| Condition | Expected Behavior | Error Code |`
- `templates/spec-template.refactor.md:145` — same header change
- `tests/lib/domains/constants.test.mjs:17-24` — bump `DOMAIN_CONFIG_TYPES.size` assertion 8 → 9; add `'specify-guidance'` to the iterated set; assert `DOMAIN_CONFIG_FILENAMES.get('specify-guidance') === 'specify-guidance.md'`
- `tests/cli/domain.test.mjs` — extend with a `load-guidance` describe block (project override, bundled fallback, extends fallthrough, missing-anywhere → `guidance: null`)

**Reference (read, do not modify):**
- `lib/domains/domain-config.mjs` — `loadDomainConfig()` precedence engine, reused completely unmodified
- `lib/domains/resolve.mjs` — `resolveDomain()`, reused unmodified by the new CLI verb
- `tests/lib/domains/domain-config.test.mjs` — existing generic precedence/extends test corpus that already proves the markdown-type resolution mechanism this spec reuses
- `tests/sync/provider-skill-parity.test.mjs` — existing generic mirror-drift guard; re-running `scripts/sync-provider-skills.mjs` is what keeps this suite passing after Task 4's skill edit

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 1 & 7; Acceptance Criteria: `specify-guidance` in `DOMAIN_CONFIG_TYPES`/`DOMAIN_CONFIG_FILENAMES`, absent from `STRUCTURED_CONFIG_TYPES`)
- Charter: `.context-index/specs/features/reviewer-domain-fit/charter.md` (capability: "Domain-owned authoring guidance: a `specify-guidance.md` companion per domain")
- Source files: `lib/domains/constants.mjs` (full), `tests/lib/domains/constants.test.mjs` (full — this IS the test file being extended)
- Invariant: existing 8-entry assertions and `STRUCTURED_CONFIG_TYPES` size-6 assertion must still pass verbatim except the two updated numbers

### Task 2 Context
- Spec: `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 2; Behavioral Contract BEH-3, BEH-4; Error Cases table)
- Source files: `lib/cli/domain.mjs` (full — follow `runLoadTestConfig` lines 322-343 as the exact shape to copy), `lib/domains/domain-config.mjs` (reference, unmodified)
- Test pattern: `tests/cli/domain.test.mjs` (full — reuse `makeTempProject`/`writeCharter` helpers already defined there)
- Sample: no dedicated golden sample; `runLoadTestConfig` in the same file IS the reference implementation

### Task 3 Context
- Spec: `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 3; Acceptance Criteria: bundled file domain-appropriate content)
- Reference: `templates/domains/software/spec-template.md`, `templates/domains/software/reviewers.yaml` (style/tone reference for bundled `software` domain files)
- Depends on Task 2's CLI verb existing to verify resolution

### Task 4 Context
- Spec: `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 4; Behavioral Contract BEH-1, BEH-2; Acceptance Criteria: no HTTP status/drag-and-drop phrasing)
- Charter: `.context-index/specs/features/reviewer-domain-fit/charter.md` (Current State: "The authoring end matches it" — the exact hardcoded lines being replaced)
- Source files: `skills/specify/SKILL.md` (full — Step 2 lines ~151-160 show the established `adev domain resolve` call pattern to mirror; Step 4 lines 348-396 are the edit target)
- Boundary rule: `.context-index/governance/boundaries.yaml` `no-inline-node-in-skills` (warning severity) — the replacement must not introduce inline Node
- Constitution: Anti-Pattern "No `Run inline Node.js:` ... invocations inside `skills/*/SKILL.md`" and "Fenced JavaScript in SKILL.md must be descriptive-reference only"

### Task 5 Context
- Spec: `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 5; Behavioral Contract BEH-6; Acceptance Criteria: provider mirrors regenerated, never hand-edited)
- Script: `scripts/sync-provider-skills.mjs` (reference, unmodified — run only, not edited)
- Test: `tests/sync/provider-skill-parity.test.mjs` (full — this is the existing generic drift guard that fails as soon as Task 4 lands and passes again once this task's `node scripts/sync-provider-skills.mjs` run completes)

### Task 6 Context
- Spec: `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 6; Behavioral Contract BEH-5; Acceptance Criteria: no `HTTP Status` column in either template)
- Source files: `templates/spec-template.behavioral.md` (line 79), `templates/spec-template.refactor.md` (line 145)
- Invariant: "Specs already authored before this change are not retroactively rewritten — the Error Cases header change affects the TEMPLATE, not any already-written spec's already-filled-in table"
- Independent of Tasks 1-5 (different discovery path — `resolveTemplate`, not `loadDomainConfig`)

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

None of the three heuristics above bear directly on this plan's file surface (`lib/domains/`, `lib/cli/domain.mjs`, `skills/specify/`, `templates/`); included per protocol, not applied to task design.

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (each depends on the prior: registry entry → CLI verb → bundled default → skill wiring → mirror regen)
- Group B (independent): Task 6 (different discovery path — `resolveTemplate`, no shared files with Group A)

Group B can run in parallel with Group A.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Extend domain-config type registry | small | unit | — | 0 create, 2 modify |
| 2 | Add `load-guidance` CLI subcommand | medium | unit | Task 1 | 0 create, 2 modify |
| 3 | Ship bundled default guidance | small | unit | Task 2 | 1 create, 1 modify |
| 4 | Wire skill to load guidance + empty state | medium | unit | Task 3 | 1 create, 1 modify |
| 5 | Regenerate provider mirrors | small | unit | Task 4 | 0 create, 2 modify |
| 6 | Update spec-template Error Cases headers | small | unit | — | 1 create, 2 modify |

## Task Structure

### Task 1: Extend domain-config type registry [specialist: none]

**Charter capability:** Domain-owned authoring guidance: a `specify-guidance.md` companion per domain
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/domains/constants.mjs:11-32`
- Modify: `tests/lib/domains/constants.test.mjs:17-24`
- Test: `tests/lib/domains/constants.test.mjs`

**Tests:** `tests/lib/domains/constants.test.mjs` — extend the existing "exports all 8 overlay types" test to a 9-entry set and its filename-mapping test with the new `specify-guidance` → `specify-guidance.md` pair.

**Context to load:**
- `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 1 & 7)

- [ ] **Write failing test**

Extend `tests/lib/domains/constants.test.mjs`:

```javascript
it('exports all 9 overlay types', () => {
  assert.equal(DOMAIN_CONFIG_TYPES.size, 9);
  for (const t of ['charter-template', 'spec-template', 'reviewers', 'gates', 'verification', 'gate-config', 'test-config', 'validate', 'specify-guidance']) {
    assert.ok(DOMAIN_CONFIG_TYPES.has(t), `missing overlay type: ${t}`);
  }
  assert.ok(!DOMAIN_CONFIG_TYPES.has('charter-overlay'), 'charter-overlay should not be in DOMAIN_CONFIG_TYPES');
  assert.ok(!DOMAIN_CONFIG_TYPES.has('spec-overlay'), 'spec-overlay should not be in DOMAIN_CONFIG_TYPES');
});
```

Also add, in the second test:

```javascript
assert.equal(DOMAIN_CONFIG_FILENAMES.get('specify-guidance'), 'specify-guidance.md');
assert.ok(!STRUCTURED_CONFIG_TYPES.has('specify-guidance'), 'specify-guidance must NOT be structured');
```

Replace the literal `8` in the existing `assert.equal(DOMAIN_CONFIG_TYPES.size, 8)` line with `9` (this IS the failing assertion — do not leave a duplicate stale-8 test alongside it).

- [ ] **Verify test fails**

Run: `node --test tests/lib/domains/constants.test.mjs`
Expected: FAIL — `DOMAIN_CONFIG_TYPES.size` is `8`, not `9`; `DOMAIN_CONFIG_FILENAMES.get('specify-guidance')` is `undefined`.

- [ ] **Implement**

```javascript
// lib/domains/constants.mjs
export const DOMAIN_CONFIG_TYPES = new Set([
  'charter-template',
  'spec-template',
  'reviewers',
  'gates',
  'verification',
  'gate-config',
  'test-config',
  'validate',
  'specify-guidance',
]);

export const DOMAIN_CONFIG_FILENAMES = new Map([
  ['charter-template', 'charter-template.md'],
  ['spec-template', 'spec-template.md'],
  ['reviewers', 'reviewers.yaml'],
  ['gates', 'gates.yaml'],
  ['verification', 'verification.yaml'],
  ['gate-config', 'gate-config.yaml'],
  ['test-config', 'test-config.yaml'],
  ['validate', 'validate.yaml'],
  ['specify-guidance', 'specify-guidance.md'],
]);

// STRUCTURED_CONFIG_TYPES is unchanged — specify-guidance is NOT added here.
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/domains/constants.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/reviewer-domain-fit/domain-authoring-guidance`

```bash
git add lib/domains/constants.mjs tests/lib/domains/constants.test.mjs
git commit -m "feat(domains): add specify-guidance domain-config type

Spec: .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
Plan-task: 1"
```

---

### Task 2: Add `load-guidance` CLI subcommand [specialist: none]

**Depends on:** Task 1
**Charter capability:** Domain-owned authoring guidance: a `specify-guidance.md` companion per domain
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/domain.mjs` (add `runLoadGuidance`, dispatch entry, `help()` text)
- Modify: `tests/cli/domain.test.mjs` (new `load-guidance` describe block)
- Test: `tests/cli/domain.test.mjs`

**Tests:** `tests/cli/domain.test.mjs` — extend with a `load-guidance` describe block covering: (a) a project-installed custom domain with its own `specify-guidance.md` resolves that content (proves the custom-path read works — this test does NOT yet prove precedence "over bundled", since the bundled `software` default doesn't exist until Task 3; the actual precedence-over-bundled and one-level-`extends`-fallthrough proofs are added in Task 3, once there is real bundled content to contend with or fall through to), (b) `guidance: null` + exit 0 when no domain ships the file at any level (pinned to a non-bundled domain name — `data-engineering` — that never acquires a `specify-guidance.md` at any point in this plan, so the assertion stays true after every later task), (c) missing `--module` → usage + exit 1.

**Context to load:**
- `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 2, Behavioral Contract BEH-3/BEH-4, Error Cases table)
- `lib/cli/domain.mjs:322-343` (`runLoadTestConfig` — the shape to copy)
- Note: BEH-3 (custom wins over bundled) and BEH-4 (extends fallthrough to bundled parent) both require the REAL bundled `templates/domains/software/specify-guidance.md` to exist to be meaningfully tested — that file ships in Task 3. This task lays the CLI-verb plumbing and proves the custom-domain read path in isolation; Task 3 completes BEH-3/BEH-4 coverage against real bundled content.

- [ ] **Write failing test**

Add to `tests/cli/domain.test.mjs` (reusing the file's existing `makeTempProject`/`spawnSync`-against-`CLI` pattern):

```javascript
test("load-guidance: returns guidance:null when no specify-guidance.md exists anywhere", () => {
  const dir = makeTempProject();
  // Resolve to a NON-bundled domain ("data-engineering", following the exact
  // fixture pattern already used at tests/cli/domain.test.mjs:547-549), not
  // the default 'software' domain. 'software' is where Task 3 ships the
  // bundled specify-guidance.md default, so asserting null against 'software'
  // here would pass now but silently flip to FAIL the moment Task 3 lands —
  // this must stay null across every task in this plan, so it is pinned to
  // a domain that never gets a specify-guidance.md at any resolution level.
  writeCharter(dir, "m", { domain: "data-engineering" });
  const result = spawnSync(process.execPath, [
    CLI, "domain", "load-guidance", "--module", "m",
    "--charter", ".context-index/specs/features/m/charter.md",
  ], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.guidance, null);
});

test("load-guidance: project-installed custom domain resolves its own file", () => {
  const dir = makeTempProject();
  writeCharter(dir, "m", { domain: "custom-x" });
  mkdirSync(join(dir, ".context-index", "domains", "custom-x"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "domains", "custom-x", "specify-guidance.md"),
    "# Custom Guidance\n",
  );
  const result = spawnSync(process.execPath, [
    CLI, "domain", "load-guidance", "--module", "m",
    "--charter", ".context-index/specs/features/m/charter.md",
  ], { cwd: dir, encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.guidance, "# Custom Guidance\n");
});


test("load-guidance: missing --module exits 1 with usage", () => {
  const dir = makeTempProject();
  const result = spawnSync(process.execPath, [CLI, "domain", "load-guidance"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing --module/);
});
```

(Extend/adapt the `extends`-fallthrough case using the same domain.yaml + `extends: <bundled>` fixture pattern the file's `writeCharter`/temp-project helpers already establish for other subcommands.)

- [ ] **Verify test fails**

Run: `node --test tests/cli/domain.test.mjs`
Expected: FAIL — `unknown subcommand: load-guidance`

- [ ] **Implement**

```javascript
// lib/cli/domain.mjs
if (sub === "load-guidance") {
  await runLoadGuidance({ projectRoot, manifest, values: v });
  return;
}

async function runLoadGuidance({ projectRoot, manifest, values }) {
  const resolved = resolveActiveDomain({ projectRoot, manifest, values });
  if (!resolved) process.exit(1);
  const { absRoot, domain } = resolved;

  let guidance;
  try {
    guidance = loadDomainConfig(
      domain.resolved_domain,
      "specify-guidance",
      absRoot,
      PLUGIN_ROOT,
    );
  } catch (err) {
    console.error(err.message ?? String(err));
    process.exit(1);
  }

  console.log(JSON.stringify({ domain, guidance, warnings: [] }));
  process.exit(0);
}
```

Add the dispatch branch alongside the existing `load-gates`/`load-reviewers`/`load-test-config`/`load-verification` checks in `run()`, and document the subcommand in `help()` following the existing entries' format.

- [ ] **Verify test passes**

Run: `node --test tests/cli/domain.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/domain.mjs tests/cli/domain.test.mjs
git commit -m "feat(cli): add adev domain load-guidance subcommand

Spec: .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
Plan-task: 2"
```

---

### Task 3: Ship bundled default guidance [specialist: none]

**Depends on:** Task 2
**Charter capability:** Domain-owned authoring guidance: a `specify-guidance.md` companion per domain
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `templates/domains/software/specify-guidance.md`
- Modify: `tests/cli/domain.test.mjs` (one new assertion using the real bundled `software` domain)
- Test: `tests/cli/domain.test.mjs`

**Tests:** `tests/cli/domain.test.mjs` — extend with: (a) an assertion that `adev domain load-guidance --module <any-software-domain-module>` (against a temp project with no domain override — resolves to the default `software` domain) returns this bundled file's content verbatim as `guidance`; (b) BEH-3 completion — a custom domain shipping its own `specify-guidance.md` still wins over the now-real bundled default; (c) BEH-4 completion — a custom domain with `extends: software` and no `specify-guidance.md` of its own falls through to the bundled default.

**Context to load:**
- `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 3, Behavioral Contract BEH-3/BEH-4)
- `templates/domains/software/spec-template.md` (style/tone reference)

- [ ] **Write failing test**

```javascript
test("load-guidance: bundled software domain returns specify-guidance.md content", () => {
  const dir = makeTempProject();
  const result = spawnSync(process.execPath, [CLI, "domain", "load-guidance", "--module", "m"], {
    cwd: dir,
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.guidance.includes("Error Code")); // domain-neutral, no HTTP status codes
  assert.ok(!/[45]\d\d\b/.test(parsed.guidance.replace(/exit\s*\d+/gi, ""))); // no bare HTTP-status-shaped numbers
});

test("load-guidance: custom domain's own file wins over the now-real bundled default (BEH-3)", () => {
  const dir = makeTempProject();
  writeCharter(dir, "m", { domain: "custom-x" });
  mkdirSync(join(dir, ".context-index", "domains", "custom-x"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "domains", "custom-x", "specify-guidance.md"),
    "# Custom Guidance\n",
  );
  const result = spawnSync(process.execPath, [
    CLI, "domain", "load-guidance", "--module", "m",
    "--charter", ".context-index/specs/features/m/charter.md",
  ], { cwd: dir, encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);
  // Must be the CUSTOM content, never the bundled software default that also
  // now exists on disk — proves precedence, not merely presence.
  assert.equal(parsed.guidance, "# Custom Guidance\n");
});

test("load-guidance: one-level extends fallthrough to bundled parent (BEH-4)", () => {
  const dir = makeTempProject();
  writeCharter(dir, "m", { domain: "custom-y" });
  mkdirSync(join(dir, ".context-index", "domains", "custom-y"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "domains", "custom-y", "domain.yaml"),
    "extends: software\n",
  );
  // custom-y ships no specify-guidance.md of its own, so this must fall
  // through to the real templates/domains/software/specify-guidance.md.
  const result = spawnSync(process.execPath, [
    CLI, "domain", "load-guidance", "--module", "m",
    "--charter", ".context-index/specs/features/m/charter.md",
  ], { cwd: dir, encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.guidance.includes("Error Code"), "expected bundled software guidance via extends fallthrough");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/domain.test.mjs`
Expected: FAIL — bundled `templates/domains/software/specify-guidance.md` does not exist yet, so all three new assertions above see `guidance: null` (the first and third fail outright on `.includes` against `null`; the second passes trivially since it only checks the custom content, but is written here as a unit so run alongside the others).

- [ ] **Implement**

Author `templates/domains/software/specify-guidance.md` with CLI/library-appropriate authoring examples: 1-2 BEH-style examples about CLI verb/flag semantics (e.g., a flag validation behavior, an idempotent re-run behavior), and an Error Cases guidance block framed as thrown error codes / process exit codes (e.g., `INVALID_ARG` on a malformed flag, exit code 1 vs 2 semantics) — no HTTP status codes, no drag-and-drop UI language.

- [ ] **Verify test passes**

Run: `node --test tests/cli/domain.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/domains/software/specify-guidance.md tests/cli/domain.test.mjs
git commit -m "feat(domains): ship bundled software specify-guidance default

Spec: .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
Plan-task: 3"
```

---

### Task 4: Wire skill to load guidance and render the explicit empty state [specialist: none]

**Depends on:** Task 3
**Charter capability:** `/adev:specify` sheds hardcoded guidance
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/specify/SKILL.md:348-396` (Step 4: Interactive Spec Authoring)
- Create: `tests/skills/specify-domain-guidance.test.mjs`
- Test: `tests/skills/specify-domain-guidance.test.mjs`

**Tests:** `tests/skills/specify-domain-guidance.test.mjs` — grep-based content assertions on `skills/specify/SKILL.md` (modeled on `tests/skills/specify-kind-routing.test.mjs`'s pattern): (a) no `column not found → 404` / `drags a card` phrasing, (b) the skill invokes `adev domain load-guidance`, (c) the skill states an explicit empty-state fallback message.

**Context to load:**
- `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 4, Behavioral Contract BEH-1/BEH-2)
- `skills/specify/SKILL.md:151-160` (established `adev domain resolve` call pattern to mirror for `--module`/`--charter`)
- `.context-index/governance/boundaries.yaml` (`no-inline-node-in-skills` rule — the replacement must stay CLI-verb-driven)
- Scope note: `skills/specify/SKILL.md`'s Extract-mode Step 4 example (around line 611, `Missing auth token | Returns 401 | 401`) independently contains an HTTP status code but illustrates extracting a spec from EXISTING web-shaped code, not hardcoded default guidance — it is untouched by this task. The spec's "no HTTP status codes" acceptance criterion is scoped to the two specific removed phrases (`column not found → 404`, `drags a card`), not a literal zero-HTTP-codes-anywhere guarantee for the whole file.

- [ ] **Write failing test**

```javascript
// tests/skills/specify-domain-guidance.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");

describe("specify Step 4 — domain-owned authoring guidance", () => {
  const content = readFileSync(SKILL, "utf8");

  it("contains no hardcoded HTTP-status / drag-and-drop examples", () => {
    assert.ok(!content.includes("column not found → 404"));
    assert.ok(!content.includes("drags a card"));
  });

  it("calls adev domain load-guidance", () => {
    assert.match(content, /adev domain load-guidance/);
  });

  it("states an explicit empty-state fallback message", () => {
    assert.match(content, /No domain-specific authoring guidance available/i);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/specify-domain-guidance.test.mjs`
Expected: FAIL — `skills/specify/SKILL.md` still contains `column not found → 404` and `drags a card`; no `adev domain load-guidance` call exists.

- [ ] **Implement**

In `skills/specify/SKILL.md` Step 4, replace the hardcoded Behaviors example (lines 360-361) and the hardcoded Error Cases prompt (line 382) with a guidance-loading block placed before the Behavioral Contract subsection:

```markdown
**Domain-Aware Authoring Guidance:** Load illustrative examples for the Behaviors and Error Cases prompts below:

\`\`\`bash
adev domain load-guidance --module <charter-module> [--charter <charter-path>]
\`\`\`

Reuse the same `--module`/`--charter` values resolved for `adev domain resolve` earlier in this skill. Stdout is a JSON object whose `guidance` field is either a markdown string or `null`.

- If `guidance` is non-null, render its content as the source of illustrative examples for both the Behaviors and Error Cases prompts below, in place of any hardcoded example.
- If `guidance` is `null`, print: *"No domain-specific authoring guidance available for this project; falling back to generic prompts."* and use domain-neutral generic prompts (no HTTP status codes, no drag-and-drop language) for both prompts.
```

Remove the hardcoded `- **BEH-1** — ... drags a card ...` / `- **BEH-2** — ... drags a card ...` example block and the hardcoded `→ Any additional error cases? I have: lacks permission → 403, column not found → 404, conflict → 409` line, replacing each with a pointer to the loaded-guidance content ("draw the illustrative Behaviors example from the loaded guidance above, or ask generically if none was loaded" / same for Error Cases).

- [ ] **Verify test passes**

Run: `node --test tests/skills/specify-domain-guidance.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/specify/SKILL.md tests/skills/specify-domain-guidance.test.mjs
git commit -m "feat(specify): load domain-owned authoring guidance in Step 4

Spec: .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
Plan-task: 4"
```

---

### Task 5: Regenerate provider mirrors [specialist: none]

**Depends on:** Task 4
**Charter capability:** Domain-owned authoring guidance: a `specify-guidance.md` companion per domain (mirror parity — `providers/codex/` and `providers/opencode/` must carry the same Step 4 guidance-loading content as the canonical skill, byte-for-byte apart from the provider-specific description suffix, per BEH-6)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `providers/codex/skills/specify/SKILL.md` (mechanically regenerated, never hand-edited)
- Modify: `providers/opencode/skills/specify/SKILL.md` (mechanically regenerated, never hand-edited)
- Test: `tests/sync/provider-skill-parity.test.mjs` (pre-existing; no new assertions needed)

**Tests:** `tests/sync/provider-skill-parity.test.mjs` — this existing suite runs `scripts/sync-provider-skills.mjs --dry-run` and fails on any reported drift. It starts passing (mirrors match the now-stale primary skill) and flips to FAILING the moment Task 4 lands, which is this task's natural "write failing test" step — no new test code is required.

**Context to load:**
- `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 5, Behavioral Contract BEH-6)

- [ ] **Write failing test**

No new test file. Confirm the existing suite is currently failing as a direct consequence of Task 4:

Run: `node --test tests/sync/provider-skill-parity.test.mjs`
Expected: FAIL — drift detected (`updated` count > 0) between `skills/specify/SKILL.md` and its two provider mirrors.

- [ ] **Verify test fails**

(Same command as above — this IS the fail-verification step for this task; the failure was produced by Task 4's edit, not authored here.)

- [ ] **Implement**

```bash
node scripts/sync-provider-skills.mjs
```

- [ ] **Verify test passes**

Run: `node --test tests/sync/provider-skill-parity.test.mjs`
Expected: PASS

Additionally verify the scoped grep from the spec's own Step 5 Verification returns no matches:

Run: `grep -rn "column not found → 404\|drags a card" providers/*/skills/specify/SKILL.md`
Expected: no output (exit 1 from grep, meaning zero matches)

- [ ] **Commit**

```bash
git add providers/codex/skills/specify/SKILL.md providers/opencode/skills/specify/SKILL.md
git commit -m "chore(providers): regenerate specify skill mirrors

Spec: .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
Plan-task: 5"
```

---

### Task 6: Update spec-template Error Cases headers [specialist: none]

**Charter capability:** The written artifact is domain-neutral by default (Error Cases header no longer presumes HTTP status codes)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/spec-template.behavioral.md:79`
- Modify: `templates/spec-template.refactor.md:145`
- Create: `tests/templates/spec-template-error-code-header.test.mjs`
- Test: `tests/templates/spec-template-error-code-header.test.mjs`

**Tests:** `tests/templates/spec-template-error-code-header.test.mjs` — asserts both templates carry `| Condition | Expected Behavior | Error Code |` and neither contains the substring `HTTP Status`.

**Context to load:**
- `.context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md` (Migration Path Step 6, Behavioral Contract BEH-5)

- [ ] **Write failing test**

```javascript
// tests/templates/spec-template-error-code-header.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = [
  join(__dirname, "..", "..", "templates", "spec-template.behavioral.md"),
  join(__dirname, "..", "..", "templates", "spec-template.refactor.md"),
];

describe("spec templates — domain-neutral Error Cases header", () => {
  for (const path of TEMPLATES) {
    it(`${path} carries an Error Code column and no HTTP Status column`, () => {
      const content = readFileSync(path, "utf8");
      assert.ok(content.includes("| Condition | Expected Behavior | Error Code |"));
      assert.ok(!content.includes("HTTP Status"));
    });
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/templates/spec-template-error-code-header.test.mjs`
Expected: FAIL — both templates still carry `HTTP Status / Error Code`.

- [ ] **Implement**

In `templates/spec-template.behavioral.md:79` and `templates/spec-template.refactor.md:145`, change:

```
| Condition | Expected Behavior | HTTP Status / Error Code |
```

to:

```
| Condition | Expected Behavior | Error Code |
```

- [ ] **Verify test passes**

Run: `node --test tests/templates/spec-template-error-code-header.test.mjs`
Expected: PASS

Additionally confirm the spec's own Step 6 Verification: `grep -rn "HTTP Status" templates/spec-template.*.md` returns no matches.

- [ ] **Commit**

```bash
git add templates/spec-template.behavioral.md templates/spec-template.refactor.md tests/templates/spec-template-error-code-header.test.mjs
git commit -m "fix(templates): rename Error Cases column from HTTP Status to Error Code

Spec: .context-index/specs/features/reviewer-domain-fit/domain-authoring-guidance.spec.md
Plan-task: 6"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- No constitutional violations (no new dependencies; skill stays markdown-only via the new CLI verb; pure ESM in `lib/cli/domain.mjs`)

`governance/gates.yaml` exists in this repo; per its own note, `/adev:validate` reads the MATERIALIZED `.context-index/governance/gates.yaml`, not a per-plan recomputation. No project-specific override of the constitution's `npm test` gate applies to this plan's file surface.

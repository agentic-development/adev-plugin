# Implementation Plan: Subagent Cost Routing

> **Methodology:** adev
> **Charter:** cross-cutting (no parent charter)
> **Spec:** `.context-index/specs/cross-cutting/subagent-cost-routing.md`
> **Review:** `.context-index/specs/cross-cutting/subagent-cost-routing.review.md` (PASS_WITH_NOTES)
> **Plan revision:** 1
> **Created:** 2026-04-26

## Summary

Extends the existing model-routing system with:
- **Role-based static routing** — `manifest.yaml.model_routing.subagent_overrides` assigns tiers by role
- **Score-based dynamic routing** — `/adev:route` derives and annotates `**Model Tier:**`; `/adev:implement` reads it for per-task model selection
- **Session model tracking** — `session-capture.sh` writes `usage.model` to JSONL with validation
- **Retro cost breakdown** — `/adev:retro` aggregates per-model cost from JSONL

## Notes from Review (PASS_WITH_NOTES)

Two non-blocking suggestions carried forward — no action required before implementation:
- **SA-S4:** "Dispatched By" column in Role-to-Tier Defaults table — deferred to post-implementation revision of the spec
- **SEC-5:** `<hash>` derivation in `~/.claude/projects/<hash>/` confirmation — low priority; `session-file-reader.mjs` already handles this

## Dependency Order

```
Task 1 (schema doc)            — establishes usage.model contract
Task 2 (manifest template)     — independent
Task 3 (route SKILL.md)        — independent
Task 4 (implement Load Ctx)    — independent; Task 5 depends on it
Task 5 (implement Dispatch)    — depends on Task 4
Task 6 (failing tests)  → Task 7 (session-capture impl)
Task 8 (retro SKILL.md)        — independent
```

Tasks 1–5, 8 are markdown/template edits with no code gates. Tasks 6–7 follow strict RED-GREEN order. Recommended execution: 1 → 2 → 3 → 4 → 5 → 8 → 6 → 7.

---

## Task 1: Update `token-cost-logging.md` — Document `usage.model` Field

[specialist: none]

**Capability trace:** Behavior 7 / Integration Point 4 — establishes schema contract for `usage.model` that Tasks 6 and 7 implement

**Files to touch:**
- `.context-index/specs/features/session-awareness/token-cost-logging.md`

**TDD note:** Schema/doc task — no RED phase. Verify by re-reading the schema after edit and confirming `model` is present and consistent with the subagent-cost-routing spec §Behaviors 7/7a.

**What to do:**

1. In the `## Extended Schema Definition` section, inside the Entry Schema JSON block under `usage`, add after `"cost_usd"`:
   ```json
   "model": "string (optional; present when model string from session data validates; omitted when validation fails or session data unavailable)"
   ```

2. In the `### Field Constraints for usage` table, add a new row after `cost_usd`:
   | `usage.model` | string | no | Present when model string matches `^[a-zA-Z0-9._:/-]{1,128}$`. Omitted (not null) when validation fails or session data unavailable. |

3. Update the example entries to show one entry with `"model": "claude-sonnet-4-6"` included in the `usage` object.

4. Bump `revision` frontmatter to `3` and `updated` to `2026-04-26`.

**Acceptance criteria:**
- [x] `usage.model` appears in the Entry Schema JSON block
- [x] Field Constraints table has a row for `usage.model` with correct type (`string`), cardinality (`no`), and omit-not-null semantics
- [x] At least one example entry shows `"model": "claude-sonnet-4-6"` in the `usage` object
- [x] `revision` bumped to `3`

---

## Task 2: Update `templates/manifest-template.yaml` — Add `model_routing` Section

[specialist: none]

**Capability trace:** Behavior 2 / Integration Point 1 — scaffolding support for new projects

**Files to touch:**
- `templates/manifest-template.yaml`

**TDD note:** Template task — no RED phase. Verify by reading the template after edit.

**What to do:**

After the `# Quality Gates` section (before `# Completion Policy` or at the end of the file if there is no natural insertion point), add:

```yaml
# ============================================================================
# Model Routing
# ============================================================================

# Uncomment and configure to enable cost-optimizing model tier routing.
# Requires the model-routing spec to be implemented (model_tiers in platform-context.yaml).
#
# model_routing:
#   # default: tier to use for any role without an explicit subagent_overrides entry.
#   # Options: fast | capable | reasoning. Omit to fall back to spec role-table defaults.
#   default: capable
#
#   # auto_agent_fast_threshold: minimum score (1-5) on BOTH novelty AND pattern_coverage
#   # dimensions for an auto-agent task to qualify for the fast tier. Default: 4.
#   # Recommended minimum: 3. Values 1-2 are not recommended (logged advisory).
#   auto_agent_fast_threshold: 4
#
#   # subagent_overrides: per-role tier assignments that override the spec role-table defaults.
#   # subagent_overrides:
#   #   explore: fast
#   #   validate-runner: fast
#   #   manifest-stamper: fast
#   #   issue-creator: fast
#   #   hygiene-scanner: fast
#   #   test-author: capable
#   #   code-reviewer: capable
#   #   single-task-impl: capable
#   #   arch-reviewer: reasoning
#   #   build-orchestrator: reasoning
#   #   recovery-diagnoser: reasoning
```

**Acceptance criteria:**
- [x] `model_routing` section present in template, fully commented-out by default
- [x] All three keys present: `default`, `auto_agent_fast_threshold`, `subagent_overrides`
- [x] Inline comments explain each key and reference valid values
- [x] Template remains valid YAML when uncommented

---

## Task 3: Extend `/adev:route` SKILL.md — Derive and Annotate `**Model Tier:**`

[specialist: none]

**Capability trace:** Behaviors 1, 3, 4 / Integration Point 2 — route reads manifest, derives tier from score rules, annotates in plan files

**Files to touch:**
- `skills/route/SKILL.md`

**TDD note:** Markdown task — no RED phase. Verify by reading the updated skill and confirming: (a) Step 2 contains model tier derivation with the 4-rule decision table and role-override logic, (b) Step 4 annotation block includes `**Model Tier:**` between `**Scores:**` and `**Rationale:**`.

**What to do:**

**In Step 2 (Derive Routing Score) — add subsection at the end:**

```markdown
### Derive Model Tier

After computing the routing score, derive the model tier for this task's implementer dispatch:

1. Read `model_routing` from `.context-index/manifest.yaml`. If absent, log a one-time stderr
   advisory and continue with defaults: `default: capable`, `auto_agent_fast_threshold: 4`,
   no overrides.
   Advisory: `adev: model_routing not configured in manifest.yaml — using default tier (capable).
   Configure model_routing to enable cost routing.`

2. Determine the route classification (already computed above): `human-only`, `assisted-agent`, or
   `auto-agent`.

3. Validate score dimensions: confirm `novelty` and `pattern_coverage` are integers in 1–5.
   If either is non-integer, absent, or out-of-range, emit a stderr advisory and set tier to
   `capable` (skip decision table).
   Advisory: `adev: routing score dimension invalid — defaulting to capable tier`

4. Read `T = model_routing.auto_agent_fast_threshold` (default 4 if absent).
   - If T is non-numeric or null: emit stderr advisory, use T=4.
   - If T < 1 or T > 5: emit stderr advisory, use T=4.
   - If T is 1 or 2: emit stderr advisory recommending T≥3; apply value as given.

5. Apply the exhaustive decision table (first matching row wins):

   | Condition | Model Tier |
   |-----------|-----------|
   | Route is `human-only` (total score < 10) | `reasoning` |
   | Route is `assisted-agent` (total score 10–15) | `capable` |
   | Route is `auto-agent` AND novelty ≥ T AND pattern_coverage ≥ T | `fast` |
   | Route is `auto-agent` AND (novelty < T OR pattern_coverage < T) | `capable` |

6. Apply role overrides (for the `single-task-impl` role, which this annotation targets):
   If `model_routing.subagent_overrides.single-task-impl` is set to a valid tier name
   (`fast`, `capable`, `reasoning`), use that tier instead of the table result.
   - Unknown role in overrides: log advisory, skip override.
   - Invalid tier value in override: log advisory, treat as `capable`.

7. Fallback chain if no table row matched (should not happen with exhaustive table, but as safety
   net): `model_routing.default` → `capable`.
```

**In Step 4 (Write Routing Annotation) — update the annotation block format:**

Change the annotation template from:
```markdown
**Routing:** auto-agent | assisted-agent | human-only (score: N/20)
**Scores:** spec=N pattern=N blast=N novelty=N
**Rationale:** <one sentence>
```

To:
```markdown
**Routing:** auto-agent | assisted-agent | human-only (score: N/20)
**Scores:** spec=N pattern=N blast=N novelty=N
**Model Tier:** fast|capable|reasoning
**Rationale:** <one sentence>
```

**Acceptance criteria:**
- [x] Step 2 includes model tier derivation with the 4-row exhaustive decision table
- [x] `auto_agent_fast_threshold` validation documented (non-numeric → default 4, T=1/2 advisory)
- [x] Score dimension validation documented (non-integer/out-of-range → `capable` + advisory)
- [x] Fallback chain documented: `model_routing.default` → `capable`
- [x] `subagent_overrides` lookup documented for `single-task-impl` role
- [x] Step 4 annotation block includes `**Model Tier:**` between `**Scores:**` and `**Rationale:**`
- [x] Advisory text for absent `model_routing` section documented

---

## Task 4: Extend `/adev:implement` SKILL.md — Load Context Step

[specialist: none]

**Capability trace:** Behavior 4 / Integration Point 1 — implement reads `model_routing` from manifest at startup alongside `model_tiers`

**Files to touch:**
- `skills/implement/SKILL.md`

**TDD note:** Markdown task — no RED phase. Verify by reading the updated Step 1 and confirming `model_routing` is loaded with all three fields and fallback behavior documented.

**What to do:**

In Step 1 (Load Context), after the instruction to read `model_tiers` from `platform-context.yaml`, add:

```markdown
Read `model_routing` from `.context-index/manifest.yaml`:
- `model_routing.default` — fallback tier for roles without an explicit override
- `model_routing.auto_agent_fast_threshold` — threshold for auto-agent fast-tier qualification (default: 4)
- `model_routing.subagent_overrides` — map of role names to tier names

If `model_routing` is absent from manifest, all dispatches use `capable` (pre-spec behavior, fully
backward-compatible). Do not log an advisory here — absence is the expected state for projects that
have not opted in.
```

**Acceptance criteria:**
- [x] Step 1 loads `model_routing` from manifest
- [x] All three fields documented: `default`, `auto_agent_fast_threshold`, `subagent_overrides`
- [x] Absent `model_routing` → `capable` fallback, no advisory (backward-compatible)

---

## Task 5: Extend `/adev:implement` SKILL.md — Model Tier Dispatch

[specialist: none]

**Capability trace:** Behaviors 5, 6 / Integration Points 3, 4 — implement reads `**Model Tier:**` from annotation for implementer dispatch; role overrides apply to reviewer subagents

**Files to touch:**
- `skills/implement/SKILL.md`

**TDD note:** Markdown task — no RED phase. Verify by reading the updated Step 8 (or context packet assembly step) and Step 10 (subagent dispatch step).

**What to do:**

**In the step that reads the routing annotation (context packet assembly or pre-dispatch):**

After reading `**Routing:**` and `**Scores:**`, add:

```markdown
Read `**Model Tier:**` from the routing annotation (if present). Resolve the tier to a concrete
model ID via `platform-context.yaml.model_tiers` per the model-routing spec.

Tier resolution for the implementer subagent:
1. If annotation has `**Model Tier:**`, use that tier.
2. If `model_routing.subagent_overrides.single-task-impl` is set, use the override.
3. If annotation is absent or lacks `**Model Tier:**` (e.g., pre-spec annotation), fall back to
   `model_routing.default` if set, otherwise `capable`.

Unknown `**Model Tier:**` value in annotation → treat as `capable`, log stderr advisory.
```

**In the step that dispatches subagents (implementer + reviewers):**

Update reviewer subagent dispatch to include role-based tier selection:

```markdown
For each reviewer subagent role (spec-reviewer, code-reviewer):
1. Check `model_routing.subagent_overrides.<role>` for a per-role override.
2. If no override, use `capable` (role-table default for all reviewer roles).
3. Resolve to model ID via `platform-context.yaml.model_tiers`.
```

**Acceptance criteria:**
- [x] Implementer dispatch reads `**Model Tier:**` from annotation
- [x] Fallback chain documented: annotation → `subagent_overrides.single-task-impl` → `model_routing.default` → `capable`
- [x] Reviewer dispatches apply role-based overrides from `model_routing.subagent_overrides`
- [x] Unknown annotation tier value → `capable` + advisory
- [x] All tier → model ID resolution routes through `platform-context.yaml.model_tiers`

---

## Task 6: Write Failing Tests — `session-capture.sh` Model Field (RED Phase)

[specialist: none]

**Capability trace:** Behavior 7, Behavior 7a — JSONL `usage.model` field and validation contract

**Files to touch:**
- `tests/hooks/session-capture.test.mjs` (extend existing file)

**TDD cycle:**
1. Add tests to `tests/hooks/session-capture.test.mjs` (this task)
2. Run `npm test -- --test-name-pattern "usage.model" tests/hooks/session-capture.test.mjs` or full `npm test`
3. Confirm new tests FAIL (RED) before proceeding to Task 7
4. Task 7 implements; all tests must pass (GREEN)

**Context packets:**
- `hooks/session-capture.sh` lines 146–166 — current `entry.usage` build (model not wired in)
- `lib/session-file-reader.mjs` return contract: `{ model: string, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } | null`
- Spec §Behavior 7 (write `usage.model`), §Behavior 7a (validation pattern, omit on fail, one-time advisory)
- Existing test helpers: `runHook`, `writeFixture`, `createTempDir` from `tests/helpers.mjs`

**Note on mocking:** `session-capture.sh` invokes `lib/session-file-reader.mjs` directly. To control the session reader response in tests without touching the real `~/.claude/` directory, write a fixture that either (a) provides a synthetic session file in the temp directory at the path the reader expects, or (b) uses an env var override if the hook supports one. Check `hooks/session-capture.sh` for how `projectDir` is derived — tests may need to set `CLAUDE_PROJECT_DIR` or similar, or use the `runHook` env option to point the hook at fixture data. If no clean seam exists, note this in the test file and write tests against the hook's observable output.

**Tests to add:**

```javascript
describe("usage.model field", () => {
  // Test 1: usage.model is written when session data returns a valid model string
  it("writes usage.model to JSONL entry when session data contains a valid model string", () => {
    // Set up a fixture session file that session-file-reader will parse
    // containing model: 'claude-sonnet-4-6' in its usage data
    // Run hook
    // Assert entry.usage.model === 'claude-sonnet-4-6'
  });

  // Test 2: usage.model is omitted (not null) when model string fails validation
  it("omits usage.model (not null) when model string fails the validation pattern", () => {
    // Fixture: model string contains invalid chars (e.g., spaces or '!')
    // Run hook
    // Assert entry.usage does NOT have a 'model' key
    // Assert entry.usage.cost_usd is still present (usage otherwise intact)
  });

  // Test 3: usage.model is omitted when model string is empty
  it("omits usage.model when model string is empty", () => {
    // Fixture: model: ''
    // Assert entry.usage.model is undefined (key absent)
  });

  // Test 4: model_validation_warning_emitted — advisory fires once then is suppressed
  it("emits stderr advisory exactly once when model validation fails", () => {
    // Run hook twice with invalid model string
    // First run: stderr should contain advisory text
    // Second run: cursor model_validation_warning_emitted=true, no advisory
  });

  // Test 5: model_validation_warning_emitted is cleared on cursor reset (new session_id)
  it("clears model_validation_warning_emitted when cursor resets for a new session_id", () => {
    // Run with session_id=A, invalid model → warning emitted, flag set
    // Run with session_id=B (new session) → cursor reset → warning emitted again
  });
});
```

**Acceptance criteria:**
- [x] 5 new tests added to `tests/hooks/session-capture.test.mjs`
- [x] All 5 fail before Task 7 implementation (confirmed RED) — 4 fail, 1 vacuously passes (empty model)
- [x] Tests cover: valid model written, invalid omitted, empty omitted, advisory dedup, cursor reset clears flag
- [x] Tests use `runHook` helper; no new test dependencies

---

## Task 7: Implement `session-capture.sh` — `usage.model` and Validation (GREEN Phase)

[specialist: none]

**Capability trace:** Behavior 7, Behavior 7a, Behavior 9 (cursor `model_validation_warning_emitted`)

**Files to touch:**
- `hooks/session-capture.sh` — inline Node.js section that builds `entry.usage` (current lines ~146–175)
- `lib/token-cursor.mjs` — add `model_validation_warning_emitted` to cursor schema if it has an explicit schema/initializer

**TDD cycle:** Run `npm test` after each change. All 5 tests from Task 6 must pass. All pre-existing `session-capture.test.mjs` tests must continue to pass.

**Context packets:**
- `hooks/session-capture.sh` lines 146–175 — current usage build + cursor write
- `lib/token-cursor.mjs` — cursor read/write API
- Spec §Behavior 7a — validation pattern `^[a-zA-Z0-9._:/-]{1,128}$`, one-time advisory text, `model_validation_warning_emitted` flag
- Golden sample: `hooks/session-capture.sh` pattern mirrors `format_warning_emitted` in the same cursor

**What to implement:**

1. **After receiving `usage` from `resolveSessionUsage`, validate the model string:**

```javascript
const MODEL_VALIDATION_PATTERN = /^[a-zA-Z0-9._:/\-]{1,128}$/;
let validatedModel;  // undefined by default (will be omitted from entry.usage)

if (usage && usage.model) {
  if (MODEL_VALIDATION_PATTERN.test(usage.model)) {
    validatedModel = usage.model;
  } else if (!cursor.model_validation_warning_emitted) {
    process.stderr.write(
      'adev: session model ID failed validation — omitted from usage.model\n'
    );
    cursor = { ...cursor, model_validation_warning_emitted: true };
    // persist updated cursor (use existing cursor write path)
  }
}
```

2. **In the `entry.usage` block, add `model` conditionally (omit when undefined):**

```javascript
entry.usage = {
  input_tokens: delta.inputTokens,
  output_tokens: delta.outputTokens,
  cache_read_tokens: delta.cacheReadTokens,
  cache_creation_tokens: delta.cacheCreationTokens,
  cost_usd: costUsd,
  ...(validatedModel !== undefined && { model: validatedModel }),
};
```

3. **On cursor reset** (new session_id, Behavior 4 path): The new cursor object is freshly initialized and will not have `model_validation_warning_emitted`, which naturally evaluates as falsy. No explicit clearing code needed — the flag is absent on a fresh cursor.

4. **In `lib/token-cursor.mjs`** (if it has an explicit cursor schema or `createCursor()` factory): confirm `model_validation_warning_emitted` is not required/defaulted. If the cursor library throws on unknown keys, add `model_validation_warning_emitted: false` to the schema as an optional boolean.

**Acceptance criteria:**
- [x] All 5 tests from Task 6 pass (GREEN)
- [x] All pre-existing `session-capture.test.mjs` tests continue to pass
- [x] `npm test` passes with no regressions (1469/1469 for session-capture; 1 unrelated flaky test in session-start.test.mjs depends on project execution state)
- [x] `entry.usage.model` is a valid model ID string when session data contains a passing model string
- [x] `entry.usage.model` key is **absent** (not null) when validation fails or model is empty
- [x] Model validation uses `^[a-zA-Z0-9._:/-]{1,128}$`
- [x] Stderr advisory fires on first validation failure per cursor lifecycle; suppressed on subsequent failures
- [x] Cursor reset (new `session_id`) clears `model_validation_warning_emitted` flag

---

## Task 8: Extend `/adev:retro` SKILL.md — Per-Model Cost Breakdown

[specialist: none]

**Capability trace:** Behaviors 9, 10 / Integration Point 5 — retro reads JSONL and reports per-model cost

**Files to touch:**
- `skills/retro/SKILL.md`

**TDD note:** Markdown task — no RED phase. Verify by reading the updated skill and confirming: (a) a new step reads `.context-index/.session-tracking.jsonl`, (b) groups by `usage.model`, (c) omits section when no `usage.model` entries exist.

**What to do:**

In the data gathering phase (wherever the skill currently reads cost or session data), add a new step:

```markdown
### Step N: Per-Model Token Cost Breakdown

Read `.context-index/.session-tracking.jsonl` for the retro period:

1. Parse each line as JSON. Skip malformed lines silently (do not fail the retro).
2. Collect entries where `usage` is present and `usage.model` is a non-null, non-empty string.
3. If no such entries exist, add a note to the retro report and skip the rest of this step:
   > "Model breakdown unavailable — no `usage.model` fields in session tracking. Enable
   > token-cost-logging to track per-model usage."

4. Group entries by `usage.model`:
   - **Message count:** count of entries per model
   - **Total cost:** sum of `usage.cost_usd` values; exclude null values from sum;
     count null-cost entries separately as "cost unknown"
   - **Total tokens:** sum of `usage.input_tokens + usage.output_tokens` per model

5. Sort groups by total cost descending, then by message count descending as tie-breaker.
6. Compute per-model percentage of grand total cost and grand total messages.

7. Include the following table in the retro report:

   ```
   ## Token Usage by Model

   | Model | Messages | Input+Output Tokens | Cost (USD) | % of Cost |
   |-------|----------|---------------------|------------|-----------|
   | claude-opus-4-6 | 12 | 45,200 | $0.8420 | 62% |
   | claude-sonnet-4-6 | 48 | 112,000 | $0.4230 | 31% |
   | claude-haiku-4-5-20251001 | 120 | 280,000 | $0.0890 | 7% |
   | **Total** | 180 | 437,200 | $1.3540 | 100% |
   ```

   Add a footer note if any entries had null `cost_usd`:
   > "N entries had unknown cost (model not in price table) — excluded from cost totals."

   Add a footer note if the retro period contains sessions with mixed-model deltas:
   > "Cost attribution uses last-entry-wins per delta window (see subagent-cost-routing spec).
   > Sessions with high model-switching frequency may show slight misattribution."
```

**Acceptance criteria:**
- [x] New retro step reads `.context-index/.session-tracking.jsonl`
- [x] Groups by `usage.model`; sums cost and tokens; computes percentages
- [x] Sorted by total cost descending
- [x] Null `cost_usd` entries excluded from sum, counted as "cost unknown" footnote
- [x] Section omitted with advisory note when zero `usage.model` entries exist
- [x] Mixed-model session advisory included in footer
- [x] Report format matches spec §Behavior 9 table example

---

## Quality Gate

```bash
npm test
```

Run after Task 7 to verify no regressions. All tasks must produce a passing `npm test` at completion.

## Epic and Issue Tracking

Epic and task issues will be created via `/adev:issues` after plan acceptance. One epic for this spec, one issue per task above (8 issues total).

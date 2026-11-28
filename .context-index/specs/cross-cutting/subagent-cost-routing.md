# Live Spec: Subagent Cost Routing

<!-- Cross-cutting spec for cost-optimization model routing.
     Extends model-routing.md (which defines tier semantics) with:
     role-based static routing, score-based dynamic routing,
     manifest configuration, session model tracking, and retro cost reporting.
     Applies to: /adev:route, /adev:implement, session-capture hook, /adev:retro. -->

---
mode: cross-cutting
status: validated
risk_level: medium
revision: 5
created: 2026-04-26
updated: 2026-04-26
affects:
  - route
  - implementation
  - session-awareness
  - retro
depends-on:
  - .context-index/specs/cross-cutting/model-routing.md
  - .context-index/specs/features/session-awareness/token-cost-logging.md
source-manifest:
  sha: "ac15298"
  files:
    - .context-index/specs/features/session-awareness/token-cost-logging.md
    - hooks/session-capture.sh
    - skills/implement/SKILL.md
    - skills/retro/SKILL.md
    - skills/route/SKILL.md
    - templates/manifest-template.yaml
    - tests/hooks/session-capture.test.mjs
  computed-at: "2026-04-26T23:14:04.424Z"
---

## Context and Motivation

The model-routing spec (`model-routing.md`) defines a provider-agnostic tier system
(`fast`, `capable`, `reasoning`) and resolves them to model IDs via `platform-context.yaml`.
It specifies that skills declare tier names in SKILL.md — but does not define *which* tier to
assign to which subagent role or task type.

The result: every subagent in every skill defaults to `capable` (Sonnet), even for mechanical
work (file search, test execution, issue creation) that runs fine on `fast` (Haiku). From a
14-day sprint with 45 sessions, 97.4% of model messages used Opus, 2.5% Haiku, 0% Sonnet —
with estimated 40-60% cost reduction available through intelligent routing.

This spec defines the routing strategy: *when to use which tier* and *how to configure and
observe it*. It does NOT redefine tier semantics or model ID resolution — those are in
`model-routing.md`.

## Behavioral Contract

### Preconditions

- The model-routing spec is implemented: skills read `model_tiers` from `platform-context.yaml`
  and use tier names (not hardcoded model IDs) when dispatching subagents.
- `platform-context.yaml` has a `model_tiers` section (or skill uses hardcoded defaults per
  model-routing fallback behavior).

### Behaviors

#### Role-Based Static Routing (manifest config)

1. **When** a skill dispatches a subagent with a known role **then** it looks up the role in
   `manifest.yaml` under `model_routing.subagent_overrides` (if the section exists) and uses
   the configured tier. If the role is not listed, it falls back to `model_routing.default`
   (if set), then to the role's entry in the Role-to-Tier Defaults table below.

2. **When** `manifest.yaml` has no `model_routing` section **then** all subagent dispatches
   use the tier currently declared in the skill's SKILL.md (backward-compatible, no change in
   behavior). The feature is fully opt-in.

3. **When** `model_routing.subagent_overrides` references a role name not in the
   Role-to-Tier Defaults table **then** the skill logs a one-time advisory
   (`adev: unknown role '<name>' in model_routing.subagent_overrides`) and falls back
   in order: `model_routing.default` (if set and valid) → the role's entry in the
   Role-to-Tier Defaults table (if the role name matches) → `capable`.

#### Score-Based Dynamic Routing (/adev:route → /adev:implement)

4. **When** `/adev:route` scores a task **then** it also emits a `**Model Tier:**` field
   (`fast`, `capable`, or `reasoning`) in the routing annotation block, derived using
   the following exhaustive rules (evaluated top-to-bottom, first match wins):

   | Condition | Model Tier |
   |-----------|-----------|
   | Route is `human-only` (total score < 10) | `reasoning` |
   | Route is `assisted-agent` (total score 10–15) | `capable` |
   | Route is `auto-agent` AND novelty ≥ T AND pattern_coverage ≥ T | `fast` |
   | Route is `auto-agent` AND (novelty < T OR pattern_coverage < T) | `capable` |

   Where **T** is `model_routing.auto_agent_fast_threshold` from `manifest.yaml` (default: **4**
   when the field is absent). The rules are exhaustive: every combination of route type and
   score falls into exactly one row.

   **Threshold semantics (using the /adev:route scoring scale 1–5):**
   - T=5: Only exact golden sample match + pure pattern application qualifies for `fast`. Most conservative.
   - T=4 (default): Minor adaptation on established pattern + similar-family golden sample. Balances cost and quality.
   - T=3: Composition of 2-3 known patterns qualifies. Aggressive cost reduction; acceptable when golden samples are high quality.
   - T=2 or T=1: Not recommended — tasks at these levels require design decisions and should stay at `capable` or `reasoning`.

   The threshold applies to both dimensions equally. Asymmetric thresholds (different T for
   novelty vs. pattern_coverage) are not supported in v1 — use the more conservative single
   value if the dimensions have different risk profiles for your project.

   **Score validation:** Before applying the threshold comparison, both `novelty` and
   `pattern_coverage` values from the annotation must be validated as integers in the range 1–5.
   If either value is non-integer, absent, or outside 1–5, treat the task tier as `capable`
   and log a stderr advisory. This prevents silent misrouting from malformed annotation blocks.

   Rationale for default T=4: At novelty=4 the task is a "minor variation on established
   pattern" and at pattern_coverage=4 "a similar golden sample exists in the same pattern
   family." Both conditions together mean the agent has a close reference to follow with
   minimal adaptation — mechanical enough for the `fast` tier. At score=3 in either dimension,
   the agent must compose patterns or discover them from the codebase without a curated sample,
   which benefits from the `capable` tier's stronger reasoning.

5. **When** `/adev:implement` dispatches an implementer subagent for a task **then** it reads
   `**Model Tier:**` from the task's routing annotation (written by `/adev:route`) and resolves
   the tier to a model ID via `platform-context.yaml.model_tiers`. If the task has no routing
   annotation, or the annotation is present but lacks a `**Model Tier:**` field (e.g., the
   annotation was written by an older version of `/adev:route` before this spec), it defaults
   to `capable` (preserving current behavior).

6. **When** `/adev:implement` dispatches its fixed-role subagents (spec reviewer, code quality
   reviewer) **then** it uses the role tier from `manifest.yaml.model_routing.subagent_overrides`
   if configured, otherwise uses `capable` for both (unchanged from current behavior). The
   implementer subagent is the only one whose tier varies per-task via score-based routing.

#### Session Model Tracking

7. **When** the session-capture hook enriches a JSONL entry with usage data **then** it includes
   a `model` string field in the `usage` object, sourced from the resolved Claude Code session
   file. The `model` field contains the model ID string as returned by the API
   (e.g., `"claude-sonnet-4-6"`).

   **Multi-model delta note:** When a delta window contains assistant entries with different
   model IDs (e.g., a session using Opus then Haiku within a single hook-fire window),
   `session-file-reader.mjs` returns the model ID from the **last** assistant entry in that
   window (last-entry-wins). All tokens in the delta are attributed to that model in the JSONL
   entry and retro aggregation. This is a v1 simplification. `/adev:retro` cost breakdowns
   for sessions with mixed-model deltas may slightly misattribute token costs across models.

7a. **When** the `model` string is extracted from the session file **then** it is validated
    in `session-capture.sh` (the single enforcement point — `session-file-reader.mjs` returns
    the raw string, the hook validates before writing) before being written to the JSONL entry.
    Valid values match the pattern `^[a-zA-Z0-9._:/-]{1,128}$`. If the value fails validation
    for any reason — unexpected characters, empty string, or exceeds 128 characters — the
    `model` field is **omitted** from the `usage` object and a one-time stderr advisory is
    emitted: `"adev: session model ID failed validation — omitted from usage.model"`.
    Subsequent calls suppress the advisory after the first occurrence (deduplicated via a
    `model_validation_warning_emitted` boolean in the cursor file, following the same pattern
    as `format_warning_emitted` in `token-cost-logging.md`).

8. **When** session data is unavailable or does not contain a model field **then** the `model`
   field is omitted from the `usage` object. The entry remains valid. No error is emitted.

#### Retro Per-Model Cost Breakdown

9. **When** `/adev:retro` analyzes the session tracking log **then** it reads `.context-index/.session-tracking.jsonl`,
   groups entries by `usage.model` (ignoring entries without `usage.model`), and reports
   (sorted descending by total `cost_usd`, then descending by message count as tie-breaker):
   - Message count per model
   - Sum of `usage.cost_usd` per model (null costs excluded from sum, counted separately as "cost unknown")
   - Percentage of total tracked messages per model
   - Percentage of total tracked cost per model

   **Mixed-model sessions:** Cost attribution follows last-entry-wins semantics per delta window
   (see Behavior 7). Breakdowns are estimates; sessions with high model-switching frequency
   may show slight misattribution.

10. **When** zero JSONL entries have a `usage.model` field **then** `/adev:retro` omits the
    per-model section entirely and adds a note: "Model breakdown unavailable — no `usage.model`
    fields in session tracking. Enable token-cost-logging to track per-model usage."

### Postconditions

- Subagent model selection is auditable: routing annotations in plan files carry `**Model Tier:**`,
  JSONL entries carry `usage.model`.
- Changing the cost vs. quality trade-off for a project requires editing only `manifest.yaml`
  (role overrides) or `platform-context.yaml` (tier-to-model-ID mapping).
- No SKILL.md contains a hardcoded model ID (invariant from model-routing spec, maintained).
- Default behavior (no `model_routing` in manifest, no routing annotations) is unchanged from
  the pre-spec state — all capable, all the time.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `model_routing.subagent_overrides` lists unknown role | Log one-time stderr advisory, use `model_routing.default` or role default | Warning (non-blocking) |
| `model_routing.subagent_overrides` value is not one of `{fast, capable, reasoning}` | Log stderr advisory, treat as `capable` | Warning (non-blocking) |
| `model_routing.default` value is not one of `{fast, capable, reasoning}` | Fall back to `capable` hardcoded default, log stderr advisory | Warning (non-blocking) |
| Task routing annotation has unknown `**Model Tier:**` value | Treat as `capable`, log stderr advisory | Warning (non-blocking) |
| `model_routing.default` tier not in `model_tiers` | Fall back to `capable` hardcoded default, log stderr advisory | Warning (non-blocking) |
| `auto_agent_fast_threshold` outside range 1–5 | Log stderr advisory, use default (4) | Warning (non-blocking) |
| `auto_agent_fast_threshold` is non-numeric or null | Log stderr advisory, use default (4) | Warning (non-blocking) |
| `auto_agent_fast_threshold` is 1 or 2 | Log stderr advisory recommending T ≥ 3; apply value as given | Warning (non-blocking) |
| Score dimension in routing annotation is non-integer or outside 1–5 | Treat task as `capable`, log stderr advisory | Warning (non-blocking) |
| `model` field absent from JSONL entry | Skip entry in per-model aggregation | Non-blocking |
| `model` string from session file fails validation (`^[a-zA-Z0-9._:/-]{1,128}$`) or is empty | Omit `model` from `usage` object, emit one-time stderr advisory (Behavior 7a) | Warning (non-blocking) |
| `usage.cost_usd` is null or absent | Excluded from cost sum, counted as "cost unknown" (both treated equivalently) | Non-blocking |

## Role-to-Tier Defaults

Default tier assignments when `manifest.yaml` has no override for a role. These represent
the recommended baseline — projects can lower or raise any role's tier via `model_routing`.

| Role | Default Tier | Rationale |
|------|-------------|-----------|
| `explore` | `fast` | File search, grep, codebase navigation — mechanical, no reasoning |
| `validate-runner` | `fast` | Executing tests, parsing output, checking lint — mechanical |
| `manifest-stamper` | `fast` | Frontmatter YAML updates, source manifest stamping — template-filling |
| `issue-creator` | `fast` | Creating issues from plan data — template-filling |
| `hygiene-scanner` | `fast` | Staleness checks, coverage scans — pattern matching |
| `test-author` | `capable` | RED phase TDD — requires spec reasoning |
| `code-reviewer` | `capable` | 2-stage review in implement — bounded reasoning |
| `single-task-impl` | `capable` | Standard implementation — code generation. This is the static fallback; see Behavior 5 for how `/adev:implement` overrides this tier per-task via the routing annotation. |
| `spec-extractor` | `capable` | Extracting spec from code — requires behavioral reasoning |
| `plan-decomposer` | `capable` | Decomposing spec into tasks — bounded reasoning |
| `arch-reviewer` | `reasoning` | Architecture review — cross-cutting decisions, highest stakes. Note: `/adev:review-specs` already governs reviewer tier via execution-profiles (`reviewer-reasoning` profile). The `model_routing.subagent_overrides` entry here applies only to skills that dispatch an arch-reviewer outside of the review-specs pipeline. |
| `build-orchestrator` | `reasoning` | Build orchestration — complex multi-skill coordination |
| `recovery-diagnoser` | `reasoning` | Root cause diagnosis — novel problem, unknown state |

## Manifest Configuration Format

```yaml
# manifest.yaml — model_routing section
model_routing:
  default: capable          # Tier for any role without an explicit override.
                            # Omit to fall back to role defaults from the spec.
  auto_agent_fast_threshold: 4   # Both novelty AND pattern_coverage must be ≥ this value
                                 # for an auto-agent task to qualify for the fast tier.
                                 # Range: 1-5. Default: 4. See score-based routing behavior
                                 # for semantics at each threshold level.
  subagent_overrides:
    # Downgrade mechanical roles to fast tier:
    explore: fast
    validate-runner: fast
    manifest-stamper: fast
    issue-creator: fast
    hygiene-scanner: fast
    # Keep reasoning-intensive roles at capable (same as default, shown for clarity):
    test-author: capable
    code-reviewer: capable
    # Upgrade complex roles to reasoning tier:
    arch-reviewer: reasoning
    build-orchestrator: reasoning
    recovery-diagnoser: reasoning
```

**Relationship to `platform-context.yaml.model_tiers`:**
- `platform-context.yaml.model_tiers`: maps tier names → model IDs (provider configuration)
- `manifest.yaml.model_routing`: maps role names → tier names (routing configuration)
- Skills read both: first resolve role → tier (via model_routing), then tier → model ID (via model_tiers)

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `/adev:route` SKILL.md | Medium | Add `**Model Tier:**` derivation step (Step 2) and include `**Model Tier:**` field in annotation output (Step 4). Update target: `skills/route/SKILL.md` annotation block. |
| `/adev:implement` SKILL.md | Medium | Step 1 reads `model_routing` from manifest; Step 2a reads `**Model Tier:**` from routing annotation; implementer subagent dispatch uses resolved model |
| `/adev:implement` SKILL.md | Low | Steps 2d/2g (reviewer dispatches) read role tier from manifest overrides |
| `session-capture.sh` | Low | Add `entry.usage.model` from session-file-reader return value (code change required — not currently wired). Validate per Behavior 7a before assignment. |
| `/adev:retro` SKILL.md | Low | Step 1 reads `.session-tracking.jsonl`; new section computes per-model aggregation |

## Integration Points

1. **`manifest.yaml` → all skills:** Each skill's Load Context step reads `model_routing`
   from manifest alongside `model_tiers` from platform-context. Role-override lookup happens
   at skill startup, not per-dispatch.

2. **`/adev:route` → plan files:** The routing annotation block gains a `**Model Tier:**` field
   alongside the existing `**Routing:**` and `**Scores:**` fields.

   Example annotation after this spec:
   ```markdown
   **Routing:** auto-agent (score: 18/20)
   **Scores:** spec=5 pattern=5 blast=4 novelty=4
   **Model Tier:** fast
   **Rationale:** Mechanical task — direct golden sample match, high novelty score.
   ```

   The field is written as `**Model Tier:**` (Title Case, matching existing annotation fields
   `**Routing:**`, `**Scores:**`, `**Rationale:**`). The target update location is
   `skills/route/SKILL.md` Step 2 (derivation) and Step 4 (annotation output block).

3. **Plan files → `/adev:implement`:** Step 2a (context packet assembly) reads `**Model Tier:**`
   from the routing annotation. The implementer subagent is dispatched with the resolved model
   ID. Other subagents (reviewers, visual verifier) use their role's configured tier.

4. **Session files → JSONL:** `lib/session-file-reader.mjs` already extracts `model` from
   Claude Code session data (output defined in `token-cost-logging.md`). The session-capture
   hook must include it in the `usage` object after validation per Behavior 7a (see Module
   Impact Map — `session-capture.sh` row for required code change). The session-tracking file
   path (`.context-index/.session-tracking.jsonl`), append semantics, and base `usage` object
   schema are defined in the `token-cost-logging` spec
   (`.context-index/specs/features/session-awareness/token-cost-logging.md`). This spec only
   adds the `model` field to the `usage` object; it does not redefine the file contract.

5. **JSONL → `/adev:retro`:** The retro skill reads the per-entry `usage.model` field and
   aggregates into the cost report. Entries without `usage` are skipped.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extend `/adev:route` annotation format | Add `**Model Tier:**` derivation (4 rules in Step 2) and include `**Model Tier:**` field in annotation block (Step 4) in `skills/route/SKILL.md` | Small |
| Extend `/adev:implement` Load Context | Read `model_routing` from manifest; document role defaults | Small |
| Extend `/adev:implement` dispatch | Implementer subagent reads `**Model Tier:**` from annotation; reviewer subagents use role overrides | Small |
| Extend `session-capture.sh` | Add `entry.usage.model` from session-file-reader return, with Behavior 7a validation | Small |
| Extend `/adev:retro` | New Step 1.x: read JSONL model fields; new section in retro report | Small |
| Add compliance tests | Test `**Model Tier:**` appears in `/adev:route` output; test JSONL `usage.model` field; test error-case advisory behaviors | Small |
| Update `token-cost-logging.md` schema | Add `usage.model` field to Extended Schema Definition Field Constraints table and example entries | Small |
| Update `templates/manifest-template.yaml` | Add commented-out `model_routing` section with `default`, `auto_agent_fast_threshold`, and `subagent_overrides` fields, inline-documented | Small |

## Acceptance Criteria

- [ ] `/adev:route` routing annotation blocks include `**Model Tier:** fast|capable|reasoning`
- [ ] `model_routing.auto_agent_fast_threshold` from manifest overrides the default threshold of 4
- [ ] When `auto_agent_fast_threshold` is absent, default of 4 applies
- [ ] `/adev:implement` reads `**Model Tier:**` from routing annotation and uses it for implementer dispatch
- [ ] When `model_routing` is absent from manifest, behavior is identical to pre-spec state (all `capable`)
- [ ] `manifest.yaml` with `model_routing.subagent_overrides` causes roles to dispatch at configured tiers
- [ ] `.session-tracking.jsonl` entries include `usage.model` string field when session data available
- [ ] Entries without `usage.model` remain valid and backward-compatible
- [ ] `/adev:retro` produces per-model cost breakdown when JSONL entries have `usage.model`
- [ ] `/adev:retro` omits per-model section (with advisory note) when no `usage.model` fields present
- [ ] No SKILL.md hardcodes a model ID (regression: existing invariant from model-routing spec)
- [ ] Invalid tier string in `model_routing.subagent_overrides` falls back to `capable` with a logged advisory
- [ ] `auto_agent_fast_threshold` outside 1–5 applies default 4 with a logged advisory
- [ ] Unknown role in `model_routing.subagent_overrides` falls back to `model_routing.default` (if set) then role-table default then `capable`
- [ ] `model` string failing validation (`^[a-zA-Z0-9._:/-]{1,128}$`) is omitted from `usage.model` with a one-time stderr advisory
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies because manifest config is a
  read of a local YAML file (already read in Step 1 of all skills). No new dependencies.
- **Principle:** "Skills are primarily markdown" — Applies because tier resolution in SKILL.md
  is instruction text for Claude, not compiled code. The manifest config is read inline.
- **Principle:** "Hook protocol compliance" — Applies to session-capture.sh: it exits 0
  regardless of model field availability; the `model` field is enrichment, not gating.

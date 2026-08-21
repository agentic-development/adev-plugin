---
status: approved
revision: 6
updated: 2026-08-21
---

# Feature Charter: Output Personas

## Business Intent

Output Personas is a presentation layer that adapts plugin outputs to the user's role and expertise level. It resolves a persona (`product`, `developer`, `architect`) from a layered config hierarchy and injects a directive at session start that shapes how all skills present their results — without changing internal processing, reviews, validations, or TDD cycles. Each persona controls output verbosity, technical depth, code references, and actionable next steps.

## Scope and Boundaries

### In Scope

- Three built-in personas: `product`, `developer`, `architect`
- Persona directive templates in `templates/personas/<name>.md`
- Verbosity overlay templates in `templates/verbosity/<name>.md`, one per value of the closed enum `{terse, normal, deep}`
- `user-config` file format (flat key-value, bash-parseable) shared between global (resolved via CLI plugin root) and local (`.context-index/user-config`, gitignored) paths
- Config resolution hierarchy, applied independently to **each of the two axes**: per-invocation flag → local project → global user → fallback. Persona falls back to `developer`; verbosity falls back to the active persona's default (`product` → `terse`, `developer` → `normal`, `architect` → `normal`)
- Session-start hook modification to resolve and inject persona directive
- Persona-specific next-action guidance in outputs
- `/adev:init` offers optional local persona override for the current project and writes to `.context-index/user-config` (gitignored)
- Global `user-config` at `<PLUGIN_ROOT>/user-config` as the cross-project default layer. **Not implemented as an installer prompt** — `cli/index.mjs` contains no persona handling, and the file must be created by hand. The original scope line claimed the installer prompts for a persona; that prompt was never built, and two docs passages describing it as real were corrected on 2026-08-20 (`issue-wqpgxl`). Retained here as the config layer it actually is, not as an installer behavior.

### Out of Scope

- Custom user-defined personas (future extension, not v1)
- Changing internal skill processing, review logic, or validation gates
- Per-skill persona overrides in the config (v1 uses one persona for all skills)
- Model tier override via `user-config` (natural fit but separate charter)
- UI/visual theming

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Hooks | internal module | Modifies `session-start.sh` to resolve persona and inject directive |
| Setup | internal module | Modifies `/adev:init` to collect persona preference |
| CLI | internal module | Uses plugin root resolution to locate global and template directories |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Persona | Named output profile defining presentation rules | `name` (string), `description` (string), `output_rules` (structured directive) |
| UserConfig | Per-location flat key-value config file with user preferences, bash-parseable without external deps | `persona` (string), `verbosity` (string, optional — absent means the per-persona default applies), `path` (global or local) |
| Verbosity | Output-depth axis, orthogonal to Persona. A closed enumeration `{terse, normal, deep}` with a template per value and a per-persona default | `name` (string), `source` (flag/local/global/default), `output_depth_rules` (structured overlay) |
| PersonaDirective | Resolved markdown block injected at session start, followed by a blank line and the VerbosityOverlay | `persona_name`, `dimensions` (**note:** one dimension is named "Verbosity" — that is the persona's *pitch* for how much to say, and is NOT the Verbosity axis entity above; the two share a word, not a referent) |
| VerbosityOverlay | Resolved markdown block appended after the PersonaDirective, defining output depth | `verbosity_name`, `output_depth_rules` |

### Relationships

- A UserConfig references a Persona by name
- A PersonaDirective is produced by resolving the config hierarchy and reading the matching Persona template

### Invariants

- The resolved persona must match a template file in `templates/personas/` — unknown names produce a warning and fall back to `developer`
- Local `user-config` always takes precedence over global when both exist
- Per-invocation `--persona` argument (parsed from skill invocation text) always takes precedence over any config file
- Persona affects only output presentation — never gates, reviews, or internal processing

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Persona resolution | Resolve persona from hierarchy: flag → local → global → fallback | must-have | | validated |
| User config file format | Define and parse `user-config` schema for both global and local paths | must-have | | validated |
| Persona directive templates | Three markdown templates (`product.md`, `developer.md`, `architect.md`) defining output rules per dimension | must-have | | validated |
| Session-start injection | Modify session-start hook to resolve persona and inject directive into conversation | must-have | | validated |
| Init persona prompt | Ask persona preference during `/adev:init` and write to the **local** `.context-index/user-config` (not global — the row previously said global, which never matched the implementation). Extended 2026-08-20 to also ask verbosity, giving that axis its first interactive adoption surface. | must-have | | validated |
| Gitignore management | Ensure `.context-index/user-config` is added to `.gitignore` during init | must-have | | validated |
| Unknown persona fallback | Warn on unrecognized persona name and fall back to `developer` | must-have | | validated |
| Per-invocation flag | Support `--persona <name>` argument in skill invocation text (e.g., `/adev:build --persona product`), parsed from slash-command arguments | must-have | | validated |
| Verbosity axis + output trim + anti-redundancy + Next-Actions invariant | Add `verbosity: terse\|normal\|deep` as a second axis orthogonal to persona; calibrate Architect `normal` template trim to 58–62 bullets; add universal anti-redundancy rule excluding Next Actions; codify Next-Actions-always-present invariant. Grounded by issue-515 + .context-index/research/persona-output-depth-and-verbosity.md. | should-have | v2 | validated |
| Skill output rules wiring | Wires the verbosity axis into 19 mandated-output sections across four skills (`status`, `route`, `sample`, `learn`): each governed section now carries a `**Terse form:**` marker and a terse rendering, consulted by the skill instead of ignored. Output rules are content and structure constraints, never length budgets, per ADR 0020. The remaining fifteen skills are widened by a follow-on spec, informed by the lessons below. | must-have | v2 | validated |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Custom user-defined personas | Start with three built-in personas; extend once usage patterns emerge |  | — |
| Per-skill persona overrides | v1 uses a single persona for all skills; per-skill granularity adds complexity without proven need |  | — |
| Model tier override in user-config | Natural fit for `user-config` but separate concern; deserves its own charter |  | User config file format |

## What the skill-output-rules-wiring increment taught

The skill-output-rules-wiring increment (`.context-index/specs/features/output-personas/skill-output-rules-wiring.spec.md`) wired 19 mandated-output sections across `status`, `route`, `sample`, and `learn`. This is the direct input to the follow-on widening spec's durability question.

1. **Difficulty tracked substitution count, not table count.** The single-item `status` modes (`--spec`, `--issue`, `--file`) were plain prose and gave no trouble. `status --all` was the hardest item in the increment — one roll-up table plus five substitutions across seven-to-eight groupings — and `status --backlog` (also five substitutions) had to be reshaped from a dense semicolon-chained sentence into bullets to match `--all`'s shape. The two composed views (`route` `## Dry-Run Mode`, `sample` `## --refresh Mode`) each needed a locally-stated precedence rule for which section's terse form governs. `## --score Mode` was easy despite describing the section's full-form audit table in prose — that description is not itself a table, and the terse-form text carries no `|` rows. In fact, exactly one terse form in the whole increment contains a literal markdown table: `status --all`'s roll-up. `--backlog`'s terse form has none — it is bullets only, precisely because it was reshaped out of table shape during task 3's review cycle. So the difficulty signal is substitution count, not table count: the two hardest items share five substitutions each, not a table each.

2. **The "last block of its section" marker convention held for all nineteen sections; the fence-aware extent rule needed no amendment during tasks 3-6.** It correctly handled every fenced pseudo-heading in `sample` (three) and `learn` (one) without change. Task 1's scanner *was* edited twice, but neither edit was an extent-rule defect: after task 2, a duplicate-heading case that had pinned absolute line numbers (`126`/`378`) was rewritten to derive the duplicate pair from duplicate heading text instead, because task 2's convention block shifted `status` down by four lines — a task-1 authoring defect, not an under-specified rule. During task 3, `UNIX_ABS_PATH_RE`'s character class omitted `:`, which made the `/adev:status` exemption unreachable dead code and the BEH-3-required `/adev:status --spec <path>` invocation unwritable until the class was repaired and the repair falsified with POSIX and Windows absolute-path probes. A third, still-open finding surfaced in task 6: the "marker is last block" guard is heading-triggered only, so a marker placed mid-body with trailing prose after it in a heading-free section (all three `learn` sections, and most of the nineteen) would pass undetected. Recorded here as a known limitation for follow-up, not fixed by this increment.

3. **BEH-3's "no narrower invocation exists, emit the count alone" branch fired exactly once** — `status --all`'s Recent Sessions — matching the one case it was predicted to cover, so that branch is not where the recipe is thin. The recipe's real gap is a different, recurring distinction: "skips" versus "substitutes." Tasks 3, 4, 5, and 6 each lost a review cycle to a section that silently dropped or ambiguously "skipped" an element the full form rendered (a follow-on line in `route`'s Dry-Run Mode, a `Confidence:` line in `learn` Step 4, recoverable fields in `sample`'s Step 5, per-file listings in `status`). BEH-3 says what to do once a pointer is known to exist, but never obliges the author to first enumerate every element the full form renders and account for each as rendered, substituted, or explicitly skipped. That missing enumeration obligation is the most transferable finding for the widening spec.

4. **The voluntary decision-gate authoring constraint — adopted for `sample` `#### Present Results`, `sample` `## --refresh Mode`, and `learn` `## Step 4` — was fully dischargeable by declaring the decision material as the terse form's own content; no author needed, or wrote, a sentence promising the material "renders even at terse."** This is direct evidence for `issue-uvarlt`, which owns the overlay-level guarantee question, so the qualification matters: declaring what a section *offers* is a skill-layer authoring rule with no runtime guarantee, because nothing authored here stops the session overlay from trimming the offered evidence away. No run in this increment was observed rendering one of these three gates under an actual terse overlay. "Sufficient" describes authorability, not observed behavior — `issue-uvarlt` should read it as exactly that, not as evidence the overlay-level guarantee is unnecessary.

5. **The SA-4 deletion — removing `status`'s "omit file paths and technical detail" clause in favor of `templates/personas/product.md`'s Code References section — cost nothing.** No governed section wanted the clause back; the evidence runs the opposite direction, since all ten `status` terse forms needed to *name* narrowing invocations (`/adev:status --spec <path>` and siblings), which the deleted clause would have forbidden at the default product+terse combination. The deletion was load-bearing, not merely tidy.

**Accepted side effect.** Editing the four SKILL.md files made the recorded `sha` in the fifteen sibling specs whose `source-manifest.files[]` list one of those paths advisory-stale. ADR-0011, which would have authorized restamping, is Rejected, so this drift is recorded, not repaired.

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `resolvePersona(options)` | function | Resolves **both axes** from the config hierarchy: flag → local config → global config → fallback. Returns `{ name, source, verbosity, verbositySource, warnings }`. Verified against `lib/persona.mjs:183` on 2026-08-20 — the prior `{ name, source }` shape predated the verbosity axis. |
| `loadPersonaDirective(name)` | function | Reads `templates/personas/<name>.md` and returns the directive content. Warns and falls back to `developer` if not found. |
| `loadVerbosityOverlay(name, verbosityDir)` | function | Reads `templates/verbosity/<name>.md` and returns the overlay content. Validates the name against the closed enum AND a path-separator denylist **before** constructing the path; falls back to `normal.md`, then degrades to an empty string rather than failing the hook. |
| `parseUserConfig(filePath)` | function | Parses a flat key-value `user-config` file (`key=value` lines, bash-parseable), returns structured config object. Applies parse-time validation to the `verbosity` key; invalid values are discarded so the next layer applies. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| Session-start hook pipeline | Hooks | Injects persona directive into conversation context at session start |
| `/adev:init` wizard flow | Setup | Adds persona selection step during interactive init |
| Plugin root resolution | CLI | Resolves paths to global and template directories |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Persona resolution adds < 50ms to session start — simple file reads, no network calls |
| Backward compatibility | Projects without `user-config` behave exactly as today (`developer` fallback) |
| Extensibility | New persona added by dropping a single template file in `templates/personas/` — no code changes required |
| Testability | Resolution hierarchy testable with fixture configs; directive injection testable via existing hook test helpers |

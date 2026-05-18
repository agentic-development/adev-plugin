---
charter: output-personas
kind: behavioral
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 3
created: 2026-05-18
updated: 2026-05-18  # rev 2: addressed review warnings; implemented via /adev:implement
charter-extension: true
partial_schema: spec@1
source-manifest:
  sha: "78f90cf"
  files:
    - .claude-plugin/plugin.json
    - hooks/session-start.sh
    - lib/persona.mjs
    - package.json
    - scripts/persona-jsonl-analysis.mjs
    - templates/personas/architect.md
    - templates/personas/developer.md
    - templates/personas/product.md
    - templates/verbosity/deep.md
    - templates/verbosity/normal.md
    - templates/verbosity/terse.md
    - tests/fixtures/persona-output/architect-deep.expected.md
    - tests/fixtures/persona-output/architect-normal.expected.md
    - tests/fixtures/persona-output/architect-terse.expected.md
    - tests/fixtures/persona-output/developer-deep.expected.md
    - tests/fixtures/persona-output/developer-normal.expected.md
    - tests/fixtures/persona-output/developer-terse.expected.md
    - tests/fixtures/persona-output/product-deep.expected.md
    - tests/fixtures/persona-output/product-normal.expected.md
    - tests/fixtures/persona-output/product-terse.expected.md
    - tests/hooks/session-start.test.mjs
    - tests/persona.test.mjs
    - tests/scripts/persona-jsonl-analysis.test.mjs
  computed-at: "2026-05-18T13:48:31.614Z"
---

# Live Spec: Verbosity Axis and Output Trimming

<!-- Live Spec within the output-personas charter.
     Parent Charter: .context-index/specs/features/output-personas/charter.md
     Companion spec: persona-resolution-and-injection.spec.md (resolution mechanism, frozen).
     Empirical grounding: .context-index/research/persona-output-depth-and-verbosity.md
     Issue: issue-515 -->

<!-- This spec extends the output-personas charter with a new capability not in the
     original Capability Map: verbosity as a second axis orthogonal to persona, plus
     calibrated default trimming and a universal anti-redundancy rule. The original
     spec persona-resolution-and-injection.spec.md governs resolution mechanism and
     is frozen. This spec only adds the verbosity axis and template-level adjustments. -->

## Behavioral Contract

Output Personas today exposes a single axis: `persona` (architect / developer / product), which conflates *audience pitch* (how technical the language is) with *output depth* (how much chat output lands per turn). Empirical audit of 75 chat transcripts (4276 assistant turns) shows the Architect persona produces 1.85x mean output tokens, 1.41x section headers, 2.24x next_steps mentions, 4.14x trade_off mentions, and 1.60x disk-artifact-path references vs Developer — too much output, with redundant recapitulation of artifacts already written to disk.

This spec splits output control onto two orthogonal axes — **complexity = persona** (audience pitch) and **verbosity = depth** (output length) — directly analogous to GPT-5's independent `verbosity` and `reasoning.effort` parameters. It also lands two template-level adjustments (calibrated Architect trim, universal anti-redundancy rule) and codifies one persona-system invariant (Next Actions always present).

### Preconditions

- `output-personas` charter is approved (status: approved, revision 2).
- The resolution mechanism from `persona-resolution-and-injection.spec.md` is in place: `resolvePersona()`, `loadPersonaDirective()`, `parseUserConfig()`, and the session-start hook injection are functional and validated.
- `templates/personas/{architect,developer,product}.md` exist and define the complexity axis.
- A user config (global at plugin root, local at `.context-index/user-config`) is parseable as flat key=value lines.

### Behaviors

1. **When** a user sets `verbosity=terse` in any `user-config` (global, local, or via `--verbosity` flag) **then** `resolvePersona()` returns an **additively-extended** object preserving the charter-published `{ name, source }` keys and adding `{ verbosity, verbositySource }` alongside, with `verbosity` resolved from the same hierarchy as persona (flag → local → global → per-persona default). The existing `name` and `source` field names are NOT renamed — this is a non-breaking extension of the companion spec's API contract (`charter.md:92`, `lib/persona.mjs:47-49`).

2. **When** `verbosity` is unset in any layer of the config hierarchy **then** the per-persona default applies: `architect → normal`, `developer → normal`, `product → terse`.

3. **When** `verbosity` is set to a value not in the closed enumeration `{ terse, normal, deep }` **then** the resolver emits a warning naming the three valid values and falls back to the per-persona default for the resolved persona.

4. **When** the session-start hook injects the persona directive **then** the injected text is `loadPersonaDirective(persona) + "\n\n" + loadVerbosityOverlay(verbosity)` — persona directive first, verbosity overlay concatenated after, separated by a blank line.

5. **When** `loadVerbosityOverlay(name)` is called **then** it first validates `name` against the closed enumeration `{terse, normal, deep}` AND rejects any value containing `/`, `\`, or `..` (defense-in-depth path-traversal guard, mirroring the persona validation contract at `persona-resolution-and-injection.spec.md:48`). Only after both validations pass does it construct the path `templates/verbosity/<name>.md` and return the directive text. On a missing file for a validated name, the resolver warns and falls back to loading `templates/verbosity/normal.md`. Rejected names are warned-and-discarded, never used as a path component.

6. **When** the Architect `normal` overlay applies (the default for `persona=architect`) **then** the effective directive trims the Architect template under two complementary metrics, both of which must hold:
   - **Per-dimension bullets (template literal count):** the sum of bullets across the 8 `### <Dimension>` sections of `templates/personas/architect.md` falls in the range **19–22** (down from the current 24), achieved by per-dimension trim judgement — 3-bullet ceiling preserved on `Verbosity`, `Code References`, and `Spec/ADR Citations`; `Test Results` and `Error/Debug Output` collapsed to 2 bullets; **`Next Actions` retains all 3 bullets including the example**.
   - **Fixture-weighted total (sum of bullets across activated dimensions × 5 fixture prompt classes used by `scripts/persona-fixture-score.mjs`):** the "Total bullets across fixtures" row reported by the script falls in the range **58–62** (down from the current 69, a 10–15% reduction). The fixture script is the single source of truth for this metric.

   The two metrics measure different things — per-dimension is the bullet count of the template file in isolation; fixture-weighted is the bullet count summed across activated dimensions per prompt class. Both targets must be met after the trim; neither alone is sufficient.

7. **When** `verbosity=terse` overlay applies (under any persona) **then** the overlay tone-biases responses toward 1–3 sentence outputs, instructs skipping mandated sections (Architectural-Read, multi-table verdicts, trade-off recapping) unless the user invokes them, and instructs summarizing disk artifacts in one sentence with a link — **except** the Next Actions dimension, which is still mandated.

8. **When** `verbosity=deep` overlay applies (under any persona) **then** the overlay restores all mandated sections from the persona directive and explicitly permits trade-off rationale, multi-table review verdicts, and full citation lists.

9. **When** any persona template renders any chat response **then** an explicit Next-action suggestion appears as the final element of the response, regardless of persona or verbosity setting. This is a persona-system invariant.

10. **When** `verbosity=terse` is active **then** the Next-action suggestion biases toward a single most-likely suggestion (not a numbered menu of alternatives); under `normal` or `deep` the menu form is permitted at real decision branches.

11. **When** any persona or verbosity overlay renders **and** the response would recapitulate the contents of a written disk artifact (`.review.md`, `.plan.md`, `.validate.md`, `.spec.md`, or any file under `.context-index/**/*.md`) **then** the response instead summarizes in 1–3 sentences and links to the path — **except** for the Next Actions dimension, which may state forward-looking actions regardless of disk content.

### Postconditions

- `resolvePersona()` returns `{ name, source, verbosity, verbositySource }` — the existing `name`/`source` fields are unchanged; `verbosity`/`verbositySource` are additive. Each `source` field names the layer the value came from (`flag` | `local` | `global` | `default`). This preserves backward compatibility with all existing callers in `hooks/session-start.sh` and `tests/persona.test.mjs`.
- The injected session-start directive is a single concatenated markdown block: persona directive followed by verbosity overlay, both sourced from the templates directory.
- No persona or verbosity overlay omits the Next Actions dimension; the Next Actions invariant is structurally guaranteed by template content.
- The Architect `normal` overlay's per-dimension bullet sum drops from 24 → 19–22 *and* its fixture-weighted total (per `scripts/persona-fixture-score.mjs`) drops from 69 → 58–62, both without dropping the Next Actions dimension.
- The anti-redundancy rule appears in all three persona templates and all three verbosity overlays, scoped to exclude the Next Actions dimension.

### Error Cases

| Condition | Expected Behavior | Error Code / Status |
|-----------|-------------------|---------------------|
| `verbosity` set to invalid value (e.g. `loud`) | Warn naming the three valid values; fall back to per-persona default | `INVALID_VERBOSITY_VALUE` (warning, non-fatal) |
| `templates/verbosity/<name>.md` missing for a valid name | Warn to stderr; fall back to `normal.md`. If `normal.md` is also missing: warn to stderr, inject no overlay, persona directive used alone. **The session-start hook never exits non-zero due to a missing overlay template** (constitution: "Hook protocol compliance" — exit 0 = allow, exit 2 = block; missing overlay degrades to persona-only, not blocks the session). | `MISSING_VERBOSITY_OVERLAY` (warning; degrade-and-continue) |
| `templates/verbosity/` directory missing entirely | Warn to stderr; skip overlay injection; persona directive used alone. Hook exits 0. | `MISSING_VERBOSITY_DIR` (warning, non-fatal) |
| `verbosity` value contains `/`, `\`, or `..` (path traversal attempt) | `parseUserConfig` and `resolvePersona` both reject before path construction; warn naming the invalid value pattern; fall back to per-persona default | `INVALID_VERBOSITY_PATH_TRAVERSAL` (warning, non-fatal — mirrors persona PATH_TRAVERSAL class) |
| Persona template missing Next Actions dimension after a refactor | Test suite fails with explicit assertion citing the invariant | `NEXT_ACTIONS_INVARIANT_VIOLATION` (test failure) |
| Architect `normal` overlay bullet count outside 58–62 range | Test suite fails on the calibration assertion | `TRIM_CALIBRATION_VIOLATION` (test failure) |
| Anti-redundancy rule missing from any template covered by the rule | Test suite fails on the universal-rule assertion | `ANTI_REDUNDANCY_RULE_MISSING` (test failure) |

## System Constitution Reference

- **"Skills are primarily markdown"** — Applies because this spec's implementation is markdown-only for templates and ~30–50 lines of code in `lib/persona.mjs` for resolution. No new dependencies; the verbosity overlay pattern reuses the persona-resolution two-phase pattern (config hierarchy → template load).
- **"Minimize external dependencies"** — Applies because the verbosity axis adds no third-party packages. Resolution remains `node:fs` + manual key=value parse.
- **"Pure ESM"** — Applies because new code in `lib/persona.mjs` extensions and any test fixtures must remain `.mjs` with `import` syntax.
- **"Version parity"** — Applies because shipping this spec bumps the plugin version; `package.json` and `.claude-plugin/plugin.json` must move in lockstep.

### Internal heuristic compliance

- `cache-reads-dominate-cost` (id `cache-reads-dominate-cost`) — The verbosity axis directly addresses this heuristic: a terse overlay cuts session-cumulative cache-read drift on Architect-persona sessions by reducing output-token spend per turn.
- `summarize-output-preserves-quality` (id `summarize-output-preserves-quality`) — The anti-redundancy rule operationalizes the heuristic's "12/12 rubric parity at -36% cost" result by mandating disk-artifact summarization in chat.
- `eval-with-session-jsonl` (id `eval-with-session-jsonl`) — The validation contract (post-ship JSONL re-measurement) follows this heuristic exactly: use real `message.usage` fields, not bytes/4 estimates.

## Module Impact (within output-personas)

| Concern | Files Affected | Change Type |
|---------|---------------|-------------|
| Verbosity overlay templates | `templates/verbosity/{terse,normal,deep}.md` | Created (3 files, ~10–20 lines each) |
| Persona templates (anti-redundancy + Next-Actions invariant) | `templates/personas/{architect,developer,product}.md` | Modified (add anti-redundancy paragraph; keep Next Actions intact) |
| Architect template (calibrated trim) | `templates/personas/architect.md` | Modified (per-dimension trim to 58–62 bullets total; Next Actions untouched) |
| Resolution lib | `lib/persona.mjs` | Modified (`resolvePersona()` now returns `{persona, verbosity, sources}`; new `loadVerbosityOverlay()` function; `parseUserConfig` learns the `verbosity` key) |
| Session-start hook | `hooks/session-start.sh` (or the equivalent injection point) | Modified (concatenate persona directive + verbosity overlay) |
| Test fixtures | `tests/fixtures/persona-output/` | Created (9 golden directive-text fixtures: 3 personas × 3 verbosity levels) |
| Persona test suite | `tests/persona.test.mjs` | Extended (verbosity resolution, overlay loading, calibration assertion, invariant assertion) |
| JSONL analysis script | `scripts/persona-jsonl-analysis.mjs` | Extended (bucket by `persona × verbosity`, not just persona) |
| Companion spec amendment | `.context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md` line 70 | Modified (one-sentence amendment closing the disk-vs-chat duality rule; add Next-Actions-as-invariant acceptance criterion) |

## Out of Scope

The following are explicitly deferred to follow-up issues, even though they were considered:

- **Per-intent auto-detection of verbosity (Option C from the research artifact).** v2 only — manual dial ships first and post-ship JSONL re-measurement decides whether auto-detection is justified.
- **Architect-Lite as a separate fourth persona template (Option D).** Reachable as `persona=architect, verbosity=terse` without a new template.
- **Changes to the resolution mechanism beyond extending it for the verbosity key.** The two-phase resolve-then-load pattern from `persona-resolution-and-injection.spec.md` is frozen; this spec only adds a parallel verbosity key.
- **Hard word-count caps anywhere in any overlay.** Anthropic's April-2026 postmortem evidence shows a literal "100 words max" gate cost 3% quality and was reverted. Overlays bias tone, never enforce hard caps.

## Actionable Task Map

| # | Task | Description | Est. Complexity |
|---|------|-------------|-----------------|
| 1 | Author verbosity overlay templates | Create `templates/verbosity/{terse,normal,deep}.md`. Each ~10–20 lines: tone-bias rules, Next-Actions-still-mandated clause, anti-redundancy clause, per-overlay specifics (terse: 1–3 sentence default; normal: 1–2 paragraph default; deep: full mandated sections) | S |
| 2 | Calibrate Architect template trim | Edit `templates/personas/architect.md`: collapse Test Results and Error/Debug Output to 2 bullets each; preserve 3-bullet ceiling on Verbosity / Code References / Spec-ADR Citations; **leave Next Actions untouched (all 3 bullets including example)**. Total bullets land 58–62. | S |
| 3 | Add anti-redundancy paragraph to all persona templates | Edit `templates/personas/{architect,developer,product}.md`: add the universal anti-redundancy paragraph in a new "### Anti-Redundancy" section at the end of each template, with explicit exclusion clause for Next Actions | S |
| 4 | Extend `lib/persona.mjs` | Add `loadVerbosityOverlay(name)`; modify `resolvePersona()` to return `{persona, verbosity, sources}`; extend `parseUserConfig` to accept the `verbosity` key; implement per-persona-default fallback table | M |
| 5 | Update session-start hook | Concatenate persona directive + verbosity overlay at injection time. Confirm no other injection sites assume single-block directive. | S |
| 6 | Author 9 golden directive-text fixtures | Create `tests/fixtures/persona-output/<persona>-<verbosity>.expected.md` for the 9-combo matrix | M |
| 7 | Extend `tests/persona.test.mjs` | New test cases: verbosity resolution from each layer, overlay loading, missing-overlay fallback (degrade to persona-only, hook exits 0), invalid-value warning, path-traversal rejection at `parseUserConfig` AND at `loadVerbosityOverlay` (defense-in-depth), per-persona-default mapping, **two calibration assertions** (per-dimension sum 19–22 + fixture-weighted total 58–62 via `persona-fixture-score.mjs`), Next-Actions invariant assertion (all 9 combos contain Next-Actions content), anti-redundancy rule presence assertion (all 9 combos contain the rule paragraph + the exclusion clause), `resolvePersona` returns additive `{ name, source, verbosity, verbositySource }` (existing callers in `hooks/session-start.sh` and `tests/persona.test.mjs` must continue to work) | L |
| 8 | Amend persona-resolution-and-injection.spec.md | Add one sentence to line 70 closing the disk-vs-chat duality rule. Add a new acceptance criterion: "Every assistant turn ends with a clear Next-action suggestion, regardless of persona or verbosity setting." | S |
| 9 | Extend `scripts/persona-jsonl-analysis.mjs` | Add persona × verbosity two-key grouping. Detect verbosity from the same SessionStart attachment as persona. Output an extended aggregates table with 9 rows. | M |
| 10 | Version bump | Bump `package.json` and `.claude-plugin/plugin.json` together (charter-mandated version parity) | XS |
| 11 | No-content-echo test for extended JSONL script | Add a grep-level test (or unit test with a fixture transcript) asserting the extended `persona-jsonl-analysis.mjs` does not print any substring of assistant/user `message.content` to stdout. Statistics-only invariant preserved. | S |

## Acceptance Criteria

### Functional

- [ ] `templates/verbosity/terse.md`, `normal.md`, `deep.md` exist and each contains: a tone-bias rule, the Next-Actions-still-mandated clause, and an anti-redundancy clause scoped to exclude Next Actions.
- [ ] `templates/personas/{architect,developer,product}.md` each contain an `### Anti-Redundancy` section with the universal rule, and the rule explicitly excludes Next Actions.
- [ ] `templates/personas/architect.md` satisfies **both** of the following independent bullet-count assertions:
  - **Per-dimension distribution** (template literal count, summing to 19–22): Verbosity=3, Code References=3, Review Verdicts≤3, Test Results=2, Plan Output≤3, Spec/ADR Citations=3, Error/Debug Output=2, **Next Actions=3** (unchanged). The test reads the template file and asserts the per-section bullet counts match.
  - **Fixture-weighted total** (sum across activated dimensions × 5 fixture prompt classes): `node scripts/persona-fixture-score.mjs` reports the "Total bullets across fixtures" row for the `architect` column in range **[58, 62]**. The test invokes the script and parses its output.
- [ ] `lib/persona.mjs` exports `resolvePersona()` returning `{ name, source, verbosity, verbositySource }` — additive extension of the existing `{ name, source }` shape; existing field names are unchanged.
- [ ] `lib/persona.mjs` exports `loadVerbosityOverlay(name)` returning the overlay markdown.
- [ ] `parseUserConfig` parses a `verbosity=` line. Validation contract: values are checked against the closed enumeration `{terse, normal, deep}` AND against the path-traversal denylist (`/`, `\`, `..`) at parse time. Unknown values produce a non-fatal warning; path-traversal values produce an `INVALID_VERBOSITY_PATH_TRAVERSAL` warning (same warning class as persona PATH_TRAVERSAL). In both rejection cases, the verbosity value is discarded and the per-persona default applies. This mirrors the companion spec's persona validation contract (`persona-resolution-and-injection.spec.md:48`).
- [ ] `resolvePersona` validates the parsed `verbosity` value against the closed enumeration `{terse, normal, deep}` before passing it to `loadVerbosityOverlay`. This is defense-in-depth — `parseUserConfig` validates at parse time; `resolvePersona` re-validates before dispatching to template load.
- [ ] Per-persona verbosity defaults: `architect→normal`, `developer→normal`, `product→terse` (verified by unit test).
- [ ] Session-start hook injects `personaDirective + "\n\n" + verbosityOverlay` as a single block.
- [ ] `--verbosity <name>` flag is parseable from slash-command argument text with the same parsing-safety contract as `--persona` (companion spec `persona-resolution-and-injection.spec.md:78`): empty values, multi-token values, and values containing path separators (`/`, `\`, `..`) are rejected with a warning; the session-start verbosity remains active on rejection.

### Quality & invariants

- [ ] **Next-Actions invariant**: every one of the 9 fixture combinations (persona × verbosity) contains a Next Actions section. Test asserts presence of the substring "Next Actions" or equivalent dimension header.
- [ ] **Calibration invariant (template-literal)**: per-dimension bullet sum across the 8 `### <Dimension>` sections of `templates/personas/architect.md` falls in `[19, 22]`.
- [ ] **Calibration invariant (fixture-weighted)**: the "Total bullets across fixtures" row from `node scripts/persona-fixture-score.mjs` for the `architect` column falls in `[58, 62]`.
- [ ] **Anti-redundancy presence invariant**: each of the 6 templates affected (3 personas + 3 verbosity overlays) contains a paragraph mentioning `.review.md`, `.plan.md`, `.validate.md`, `.spec.md`, or `.context-index/`.
- [ ] **Anti-redundancy exclusion invariant**: the same paragraph explicitly excludes Next Actions (test asserts the rule text mentions "except" + "Next Actions" or equivalent).
- [ ] **No hard word caps**: grep over all template + overlay files asserts the absence of literal "<N> words" or "<N>-word" patterns (Anthropic-postmortem rule).
- [ ] All quality gates pass: `npm test` is green.
- [ ] Version parity: `package.json` and `.claude-plugin/plugin.json` carry the same new version.
- [ ] No constitutional violations: ESM only, no new external deps, hook contract unchanged.

### Post-ship validation contract

- [ ] After ≥30 sessions on the new templates, `node scripts/persona-jsonl-analysis.mjs` is re-run and emits a `persona × verbosity` aggregates table.
- [ ] **Output-token target**: the `architect-normal` row's mean output tokens drops from 994 → such that the architect-normal / developer-normal ratio is **< 1.4x** (down from current 1.85x). If not met, the spec moves to a follow-up `recalibrate` revision.
- [ ] **Next-Actions invariant target**: the `next_steps` flag rate across all 9 buckets is **> 95%** (up from current 1.8% architect, 0.8% developer). The flag's regex must be extended to match the Next Actions header form used by the new templates.
- [ ] **No quality regression**: at least one qualitative review pass confirms the trimmed Architect output still meets the senior-architect bar on a decision-moment fixture (e.g., a real architectural-decision turn). The Anthropic-postmortem evidence flagged that a hard word cap cost 3% quality — the new templates must avoid hard caps and the qualitative pass is the human-in-the-loop check on that.
- [ ] **No-content-echo invariant (preserved)**: the extended `scripts/persona-jsonl-analysis.mjs` (Task #9) maintains the existing invariant ("This script never echoes user/assistant content to stdout. Statistics only." — script header line 6). A grep-level test asserts the extended script's output contains no substring of any assistant or user `message.content` field from the JSONL transcripts. Aggregate statistics (counts, ratios, distributions) are permitted; sample turn text is not. This is a security invariant because transcripts may contain credentials, secrets, or PII captured in past conversations.

## References

- **Charter:** `.context-index/specs/features/output-personas/charter.md` (status: approved, revision 2)
- **Companion spec (frozen mechanism):** `.context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md` (status: validated)
- **Empirical grounding:** `.context-index/research/persona-output-depth-and-verbosity.md` — JSONL audit, fixture A/B, two-axis framing, calibration finding
- **Issue:** `issue-515` (open, priority 2)
- **External precedents:** GPT-5 `verbosity` + `reasoning.effort` (OpenAI Cookbook); Anthropic April-2026 Claude Code postmortem (3% quality drop from hard word caps); Continue.dev `alwaysApply` + globs (option C precedent, deferred); Roo Code mode catalog (option D precedent, deferred).
- **Internal heuristics:** `cache-reads-dominate-cost`, `summarize-output-preserves-quality`, `eval-with-session-jsonl` (all in `.context-index/memory/heuristics/_global.md`)
- **Helper scripts (re-runnable):** `scripts/persona-jsonl-analysis.mjs`, `scripts/persona-fixture-score.mjs`

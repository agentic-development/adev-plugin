<!-- Research artifact for /adev:research skill -->
---
topic: "persona output depth and verbosity — comparison across agent frameworks + internal Architect-verbosity audit"
date: "2026-05-18"
relates-to: "issue-515"
sources:
  - internal
  - web
status: draft
mode: comparison
---

## Summary

Across ten surveyed agent frameworks (Cursor, Aider, Cline, GitHub Copilot, OpenCode, Continue, Roo Code, Claude Code skills, OpenAI Codex CLI, Goose), **none** ships a single fixed "persona" with mandated multi-section output the way adev's `architect.md` does today; every framework instead exposes one of three controls — (1) an explicit verbosity dial (GPT-5 `verbosity: low|medium|high`, Aider `--verbose`), (2) mode-switching (Roo `/code`/`/architect`/`/ask`, Aider `/code`/`/architect`/`/ask`, OpenCode `build`/`plan`, Cursor "autonomy slider"), or (3) user-authored rule files with `alwaysApply` scoping (Cline `.clinerules`, Continue `.continue/rules/*.md`, Copilot `.instructions.md`, Codex `AGENTS.md`). The internal audit of `templates/personas/architect.md` confirms it mandates 24 bullets vs 18 for Developer/Product (+33%), with the maximum 3-bullet variant in **every** dimension and **22 directive-words** (`always|must|include|show|reference`) vs Developer's 12 and Product's 7. Combined with the project's own measured heuristic that "cache reads are 71% of session cost" and the Anthropic April-2026 postmortem (a literal "keep final responses to 100 words" gate caused only a 3% quality drop and was reverted for unrelated reasons), the evidence rank-orders the five remediation options as **A ≈ E > C > B > D** by impact-per-blast-radius.

## Findings

### Internal

- **Architect template carries ~33% more bullets than its siblings.** `templates/personas/architect.md` has 24 bullet directives across 8 dimensions; `templates/personas/developer.md` and `templates/personas/product.md` each have 18. Architect is the only template that uses the **maximum 3-bullet variant in every dimension** (Verbosity, Code References, Review Verdicts, Test Results, Plan Output, Spec/ADR Citations, Error/Debug Output, Next Actions). Source: `templates/personas/architect.md:6-46`, `templates/personas/developer.md:6-40`, `templates/personas/product.md:6-40`.
- **Directive-word density is 3x Product's.** Counting `always|must|include|show|reference` tokens: Architect = 22, Developer = 12, Product = 7. Architect's verbosity rule says "Explain **what was done**, **how**, and **the trade-off reasoning**" while Developer's caps at "2-5 sentences per skill step." Source: `templates/personas/architect.md:8-11`.
- **"Next Actions" is mandated for every persona, including Product.** All three templates spend their full 3-bullet budget on a "Next Actions" section that the issue-515 reporter explicitly flagged as redundant ("'Next steps' sections appear at the end of nearly every turn"). The persona system has no opt-out for the dimension — only a tone shift. Source: `templates/personas/architect.md:43-46`, `templates/personas/developer.md:37-40`, `templates/personas/product.md:37-40`.
- **The persona-rule chain already documents disk-vs-chat duality, but does not enforce anti-redundancy.** `persona-resolution-and-injection.spec.md:70` states "Persona rules override skill output templates for user-facing chat responses. Skill output templates define the default format (Developer persona) and what to write to disk artifacts." A second sentence is missing: "If a disk artifact captures the detail, chat may summarize." This is exactly option E. Source: `.context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md:70`.
- **Existing heuristic `cache-reads-dominate-cost` directly contradicts the Architect template's defaults.** The `_global.md` heuristic states "cache reads are 71% of session cost" and warns to "minimize what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification." Source: `.context-index/memory/heuristics/_global.md` (id `cache-reads-dominate-cost`).
- **A directly comparable A/B was already run on adev (different surface).** Heuristic `summarize-output-preserves-quality` records "12/12 rubric parity with 36% cost savings" when a skill returns only a structured summary to chat while writing the full artifact to disk. Source: `.context-index/memory/heuristics/_global.md` (id `summarize-output-preserves-quality`); evidence trail in `tests/evals/skill-compression/outputs/eval-report.md` (date 2026-05-03).
- **Session-corpus quantification has a measurement-substrate constraint.** The 36 files at `.context-index/sessions/2026-05-17-*.md` are all `type: commit, mode: auto, agent: git-hook` — they are commit-message summaries created by the post-commit hook, not chat transcripts. Architect verbosity in *chat output* (the surface issue-515 targets) lives in `~/.claude/projects/-Users-dpavancini-Development-adev-plugin/*.jsonl`, which is outside the requested `.context-index/sessions/*.md` scope. What I **can** measure from the on-disk sessions: 0 of 47 contain literal "Next Steps" / "Next Action" sections, confirming that chat-side verbosity does **not** leak into the commit-record artifacts. The architecture works — the redundancy lives in chat, where the cache-read cost compounds. Source: `.context-index/sessions/2026-05-17-*.md` (all 36 files have `mode: auto`); grep on "Next [Ss]teps|Next [Aa]ction" returns 0 matches.
- **Tokens-per-turn measurement requires `~/.claude/projects/*.jsonl`.** Per heuristic `eval-with-session-jsonl`, real token measurement uses `message.usage` fields (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`). The follow-on `/adev:specify` (the next step after this artifact) should call out that the validation phase of any chosen option (A/B/C/D/E) **must** measure on the JSONL substrate, not the markdown summaries. Source: `.context-index/memory/heuristics/_global.md` (id `eval-with-session-jsonl`).

### Web

- **GPT-5 ships a first-class `verbosity` parameter with three values (low / medium / high).** "Medium is the default, and low is often a better starting point for concise responses." This is a runtime, per-call dial — not a persona switch. The same model also takes `reasoning.effort: minimal|low|medium|high|xhigh`, separating *depth of internal reasoning* from *length of external output*. (sparkco.ai, cookbook.openai.com)
- **Aider has an explicit four-mode router: `/code`, `/architect`, `/ask`, `/help`.** Default is `code`. `architect` mode is a **two-model workflow** — an Architect model proposes a solution in prose, an Editor model translates it to diffs. `ask` mode is read-only. Critically, "Architect mode" in Aider is a *workflow mode*, not a tone profile — it changes which model is called, not just how the response is formatted. (aider.chat/docs/usage/modes.html, aider.chat/2024/09/26/architect.html)
- **Aider's `--verbose` flag toggles raw-LLM-conversation echo, not output style.** "When experimenting with coder backends, it helps to run aider with `--verbose --no-pretty` so you can see all the raw information being sent to/from the LLM." Aider has no built-in "concise" flag — concision is governed by the default code-mode prompt. (aider.chat/docs/config/options.html)
- **Cursor exposes an "autonomy slider," not a verbosity dial.** Three rungs: Tab completion → Cmd+K targeted edits → Agent Mode (full task). v3.0 added a Subagents system that "lets a primary agent dispatch independent agents for discrete subtasks, with each subagent running in parallel with its own dedicated context window" — the architectural answer to verbose context accumulation is **separation**, not **trimming**. (docs.cursor.com/chat/agent, cursor.com/product)
- **Cline keeps rules under 150 lines and uses YAML frontmatter for conditional rules.** "There is no hard limit, but practical performance degrades beyond approximately 300 lines, as rules consume context window space in every task — keeping your rules file under 150 lines is recommended for reliable rule adherence." Cline's conditional rules use frontmatter to scope by file context — the closest external precedent for adev's option C (context-aware verbosity). (cursor-alternatives.com/blog/cline-rules/, docs.cline.bot/customization/cline-rules)
- **Continue.dev's `alwaysApply: true|false` is essentially "context-aware verbosity" as a rule property.** "Rules with `alwaysApply: true` apply to every interaction regardless of what files are open, for general behaviour rules, communication style, and universal conventions. Rules with `alwaysApply: false` with globs apply only when specific files are in context, keeping token consumption manageable in large projects." Direct external precedent for option C. (docs.continue.dev/customize/rules, docs.continue.dev/guides/configuring-models-rules-tools)
- **Roo Code ships five separate modes (Code, Architect, Ask, Debug, Custom) plus Orchestrator.** Architect mode is **read-only on your project, Code mode has access to all tools**. Mode switching is `/architect`, `/code`, `/ask`, `/debug`, `/orchestrator`. Each mode has its own role definition; Roo treats "Architect" as a *capability profile*, not just a tone profile. Strong precedent for option D (Architect-Lite as a separate template). (docs.roocode.com/basic-usage/using-modes, docs.roocode.com/features/custom-modes)
- **OpenCode treats agents as the verbosity axis.** Built-in `build` and `plan` agents, with documented archetypes for Build / Plan / Review / Debug / Docs. "In Plan mode, OpenCode drafts what it intends to do before touching any files, you review the plan and give feedback, and only then switch to Build mode to execute." Verbose planning output is opt-in (Plan mode), not the default. (opencode.ai/docs/agents/)
- **GitHub Copilot custom instructions emphasize brevity by guideline, not by switch.** "Keep your instructions short and self-contained. Each instruction should be a single, simple statement. Include the reasoning behind rules." No verbosity flag; convention-driven. Copilot Agent reads `.github/copilot-instructions.md`, `.github/instructions/**.instructions.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`. (docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot, github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/)
- **Codex CLI uses AGENTS.md with directory-scoped precedence.** "Codex builds an instruction chain when it starts (once per run), with global scope checking the Codex home directory, where Codex reads AGENTS.override.md if it exists, otherwise Codex reads AGENTS.md." Codex has `--json` for machine output but no persona/verbosity flag at the prompt layer. (developers.openai.com/codex/guides/agents-md, developers.openai.com/codex/cli/reference)
- **Goose recipes pin structured output via JSON schema, not tone.** "The response field in recipes enables recipes to enforce a final structured JSON output." Goose treats verbosity as a *schema* problem — define what fields must come back, accept that the rest is unconstrained. (block.github.io/goose/docs/guides/recipes/recipe-reference/)
- **Anthropic-published Skill design canonical principle: *progressive disclosure*.** "Showing just enough information to help agents decide what to do next, then reveal more details as they need them. … Keep SKILL.md focused on core instructions. When the SKILL.md file becomes unwieldy, split its content into separate files and reference them. If certain contexts are mutually exclusive or rarely used together, keeping the paths separate will reduce the token usage." This is the closest external policy match for option A (trim default-required sections; lift "deep" content to referenced files). (anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills, resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf)
- **Anthropic shipped — and then reverted — an explicit verbosity gate. The reversal was about quality, not failure of the verbosity approach.** "Anthropic added a verbosity limit instructing the model to 'keep text between tool calls to 25 words or less' and 'keep final responses to 100 words or less.' However, broader ablations run during the investigation revealed a 3% quality drop for both Opus 4.6 and 4.7. This change was later reverted due to quality concerns." Two readings: (a) hard caps are too blunt; (b) a 3% quality cost was visible in human evals. Conservative interpretation: persona-level rules can mention concision targets without naming a hard word limit. (infoq.com/news/2026/05/anthropic-claude-code-postmortem/, anthropic.com/engineering/april-23-postmortem)
- **Cache-read cost is the load-bearing economic fact.** "Cache read tokens count against the usage quota. … As CLAUDE.md files grow, cache read token consumption scales linearly with both file size and message count, causing quota to deplete far faster than actual productive I/O would suggest. … A 15k-token CLAUDE.md costs 15k cache reads per message." Persona output that recapitulates disk artifacts every turn pays the cost on every subsequent turn, multiplicatively. (github.com/anthropics/claude-code/issues/24147)

### GitHub

GitHub source was not requested via `--github <owner/repo>` and is skipped (default behavior). Where GitHub findings would be most valuable: (a) `RooCodeInc/Roo-Code` `.roo/modes/` directory for the empirical content of Architect-mode prompts, and (b) `Aider-AI/aider` `aider/coders/architect_coder.py` for the architect-vs-code mode-switch implementation. The follow-on `/adev:specify` may wish to re-run this research with `--github RooCodeInc/Roo-Code` and `--github Aider-AI/aider` to ground options C and D in concrete external implementations.

## Code Examples

```yaml
# Continue.dev rule with conditional scoping — direct external precedent for option C.
# Source: docs.continue.dev/customize/rules
---
alwaysApply: false
globs:
  - "**/*.test.{ts,tsx}"
---
When editing test files, prefer table-driven tests and avoid mocking the
database layer. Show full test output on failures.
```

```python
# GPT-5 verbosity dial (option B is the adev analog).
# Source: cookbook.openai.com/examples/gpt-5/gpt-5_new_params_and_tools
response = client.responses.create(
    model="gpt-5",
    input="Sort this list ascending: [3,1,2]",
    verbosity="low",          # low | medium (default) | high
    reasoning={"effort": "minimal"},  # minimal | low | medium | high | xhigh
)
```

```
# Aider mode-switch grammar — closest precedent for option D (Architect-Lite).
# Source: aider.chat/docs/usage/modes.html
/code      <prompt>   # default: edit files
/architect <prompt>   # two-model planning workflow
/ask       <prompt>   # read-only Q&A
/help      <prompt>   # aider self-docs
```

## Empirical addendum (2026-05-18)

Two empirical streams were run after the initial literature comparison to ground the ranking on data from this project rather than external precedent alone. Both substantially strengthen the **A ≈ E > C > B > D** ranking and add one calibration finding that the follow-on `/adev:specify` should respect.

### JSONL transcript audit — 75 sessions, 4276 assistant turns

Source: `~/.claude/projects/-Users-dpavancini-Development-adev-plugin/*.jsonl` (the correct substrate per the measurement-substrate caveat above). Helper: `scripts/persona-jsonl-analysis.mjs` — streaming, statistics-only, never echoes message content.

Session-persona breakdown: architect = 39, developer = 27, product = **0** (zero Product sessions in transcript history — Product cannot be empirically compared from this substrate), unknown = 9.

Cross-persona ratios (architect / developer):

| Metric                      | Architect | Developer | A/D ratio |
|-----------------------------|----------:|----------:|----------:|
| Mean output tokens          |       994 |       537 |  **1.85** |
| Median output tokens        |       372 |       265 |      1.40 |
| p90 output tokens           |     2,261 |     1,065 |  **2.12** |
| Max single-turn output      |    26,749 |    14,804 |      1.81 |
| Mean section headers        |      0.39 |      0.28 |  **1.41** |
| Mean cache_read tokens      |   156,536 |   144,262 |      1.09 |
| `trade_off` flag rate       |      2.6% |      0.6% |  **4.14** |
| `next_steps` flag rate      |      1.8% |      0.8% |  **2.24** |
| `disk_artifact_path` rate   |     11.1% |      7.0% |  **1.60** |
| `architectural_read` rate   |      0.7% |      0.0% |     ∞     |

Empirical conclusions that update the prior section:
- The "~33% more bullets" template-level claim under-predicts observed output: mean section headers run **1.41x** developer (matches the bullet-count theory) but mean output tokens run **1.85x** (i.e. each Architect section is also denser, not just more frequent).
- Anti-redundancy (option E) is empirically the highest-leverage lever: Architect turns reference disk-artifact paths **1.60x** more than Developer — meaning Architect *already* points users at on-disk reports, then *also* recapitulates them in chat. Stripping the recapitulation is pure deduplication, zero information loss.
- Per-turn cache-read amplification is mild (**1.09x**) — the 71%-of-cost cache-read concern from the `_global.md` heuristic is **session-volume-driven, not per-turn-driven**. This shifts the cost argument: A+E save on output-token spend and on cumulative cache-read drift across the session, not on a single turn's cache-read load.
- The line-count delta is only **1.04x**. The issue is **token density and section proliferation**, not raw line count. This is a structural argument against options that try to restructure output (D — new persona) and in favor of options that trim within the existing template (A) or de-duplicate against disk artifacts (E).

### Fixture A/B — structural scoring across 5 prompt classes

Source: `scripts/persona-fixture-score.mjs`. Scores each persona template by summing bullets and directive-words across the Output Rules dimensions a given fixture prompt would activate.

| fixture | dims | architect | developer | product | architect-trimmed (A+E) | trim reduction |
|---|---|---|---|---|---|---|
| routine-edit | 3 | 9b / 6d | 8b / 3d | 8b / 2d | 6b / 3d | 33% |
| bug-fix | 5 | 15b / 12d | 12b / 8d | 12b / 6d | 10b / 5d | 33% |
| architectural-decision | 8 | 24b / 22d | 18b / 16d | 18b / 12d | 16b / 8d | 33% |
| validation-report | 5 | 15b / 13d | 12b / 8d | 12b / 6d | 10b / 4d | 33% |
| status-query | 2 | 6b / 3d | 6b / 1d | 6b / 0d | 4b / 1d | 33% |
| **totals** |  | **69** | **56** | **56** | **46** | **33%** |

Directive-word totals (always | must | include | show | reference | cite | do not | never): architect 22 → architect-trimmed **8** (64% reduction). The trimmed candidate is `scripts/persona-fixture-score.mjs:CANDIDATE_ARCHITECT_TRIMMED`.

### Calibration finding (must be respected by `/adev:specify`)

The naive A+E trim lands the candidate at **46 bullets** — i.e. **below** Developer's 56. That overshoots: a senior architect persona should still be denser than Developer on the architectural-decision fixture (where its 24-bullet max is *appropriate*, not bloated). The spec should:

- Calibrate the trim target to **~58-62 total bullets** (a 10-15% reduction, not 33%) so that the architectural-decision fixture retains its 24-bullet ceiling while routine-edit and status-query collapse to 4-6 bullets.
- Treat the "single bullet per dimension" trim as a per-dimension judgement, not a blanket rule: keep Architect's 3-bullet maximum on `Verbosity`, `Code References`, and `Spec/ADR Citations` (where depth is the whole point); collapse `Test Results`, `Next Actions`, and `Error/Debug Output` to 2 bullets (where Developer already proves 2 is sufficient).
- Strengthens the case for **option C as a follow-on** once A+E ship: the fixture data shows the friction is per-intent, not per-persona — routine-edit and status-query *should* be terse-mode triggers; architectural-decision *should* keep the 3-bullet max. A blanket trim treats all dimensions identically; a per-intent trim would be more surgical.

### Two-axis framing (2026-05-18 — supersedes prior ranking)

Reframing the option space onto two orthogonal axes — **complexity = persona** (architect / developer / product, controls the *audience pitch*) and **verbosity = depth** (terse / normal / deep, controls *how much chat output*) — clarifies the recommendation. GPT-5 already ships this exact pattern: `verbosity` and `reasoning.effort` are independent parameters. Under this framing:

- **Option B is the spine, not a side option.** A `verbosity: terse|normal|deep` dial in user-config, resolved alongside `persona`, with sensible per-persona defaults (Architect → `normal`, Developer → `normal`, Product → `terse`).
- **Option A becomes "default calibration for the `normal` verbosity overlay per persona"** — narrower than the prior blanket trim. Still needed for Architect; trivial for Product (drop one example bullet); no change for Developer.
- **Option E remains universal.** Anti-redundancy is orthogonal to both axes — it applies regardless of complexity or verbosity setting.
- **Options C and D drop further.** Per-intent auto-detection (C) becomes a v2 nice-to-have once the manual dial is available; Architect-Lite (D) is reachable as `persona=architect, verbosity=terse` without a new template.

Implementation cost under two-axis framing: ~30-50 lines in `lib/persona.mjs` + 3 small overlay files under `templates/verbosity/` + extended test matrix (3 personas × 3 verbosity levels = 9 combos, all markdown-only). Moderate, not large.

### Next-Actions exception (must be respected by `/adev:specify`)

The **Next Actions** dimension is **not** subject to the trim or to the anti-redundancy rule. It is handoff, not bloat. Every persona at every verbosity level must end its response with an explicit Next-action suggestion the user can accept, redirect, or reject. This is a persona-system *invariant*, not a per-template style choice:

- All three persona templates (`architect.md`, `developer.md`, `product.md`) must keep the **Next Actions** section as a required dimension, regardless of verbosity setting.
- Trim option A must explicitly **exclude** the Next Actions dimension from per-dimension bullet reductions (the prior fixture-A/B suggested collapsing Architect's Next Actions from 3 → 2 bullets — that recommendation is **superseded**; keep all three bullets, including the example).
- Anti-redundancy rule (option E) does **not** apply to Next Actions. A Next-action suggestion is forward-looking; it does not duplicate a disk artifact.
- Verbosity overlay `terse.md` must still mandate a Next-Actions line — overlay rules trim *other* mandated sections (Architectural-Read, multi-table verdicts, trade-off recapping) but never trim handoff.
- The follow-on `persona-resolution-and-injection.spec.md` amendment should add an explicit acceptance criterion: *"Every assistant turn ends with a clear Next-action suggestion, regardless of persona or verbosity setting. This is a persona-system invariant."*

This refinement is empirically consistent with the JSONL audit: the `next_steps` flag rate was 1.8% (Architect) and 0.8% (Developer) — *too low*, not too high. Issue-515's "Next steps appear at the end of nearly every turn" complaint was about the **format** of Next Actions (often a 3-option menu when the user picks one quickly), not about Next Actions appearing at all. The fix is to bias the section toward a single most-likely suggestion rather than enumerating alternatives — handled inside the existing Next Actions dimension, not by trimming it.

### Updated recommendation summary

**Ship in one spec under output-personas charter:** (1) the verbosity axis as new config key + three overlay templates; (2) calibrated default trim of Architect's `normal` overlay (~10-15%, excluding Next Actions); (3) the anti-redundancy rule applied to all dimensions except Next Actions; (4) the Next-Actions-as-invariant acceptance criterion. Defer per-intent auto-detection (option C) and Architect-Lite-as-separate-template (option D) to follow-up issues. The strongest empirical signals remain option E (1.60x disk-artifact redundancy) and the architect/developer output-token ratio (1.85x), both of which A+B+E together attack from complementary angles.

## Recommendations

Ranked **A ≈ E > C > B > D** by impact-per-blast-radius. Each recommendation is grounded in a constitution principle and at least one external precedent or internal heuristic. *See the Empirical addendum above for the calibration constraint on option A.*

1. **Option A — Trim default verbosity at the template level. [impact: high; blast radius: small].** Promote "architectural decisions worth flagging" / "Architectural read" / mandatory "Next Actions" from MUST to MAY-when-asked in `templates/personas/architect.md`. Drop one bullet per dimension where Architect currently uses the 3-bullet max and Developer/Product use 2. The change is a single-file edit (45 lines today) covered by `tests/persona.test.mjs` fixtures. Grounding: **Constitution principle "Skills are primarily markdown" — markdown templates are the lowest-leverage, lowest-risk change vector**; Anthropic's "progressive disclosure" canonical principle; internal heuristic `summarize-output-preserves-quality` (12/12 rubric parity at -36% cost). Note: avoid hard word-count gates (Anthropic-postmortem evidence shows 3% quality drop).
2. **Option E — Add an explicit anti-redundancy rule referencing the existing disk-artifact invariant. [impact: high; blast radius: very small].** Add one rule line to all three persona templates: *"If a disk artifact captures the detail, chat may summarize in 1-3 sentences. Do not recapitulate written artifacts."* This is a per-template paragraph and a one-sentence amendment to `persona-resolution-and-injection.spec.md:70`. Grounding: internal heuristic `cache-reads-dominate-cost` (the verbose-Architect chat duplicates disk artifacts on every turn, multiplicatively); the disk-vs-chat invariant already exists in the spec — option E only closes the missing half. Pairs cleanly with A; no rivalry. A and E together fully address the reporter's friction list (Architectural-read, multi-table status, multi-paragraph completion summaries, redundant Next Steps).
3. **Option C — Context-aware verbosity (per-intent rules). [impact: medium-high; blast radius: medium].** Add a within-template branching rule: routine actions (edits, lifecycle bookkeeping, status reads) use 1-3 sentence output; explicit-decision moments (review, spec, plan, debug) use full Architect detail. Strong external precedent: Continue.dev `alwaysApply` + globs; Cline conditional rules with frontmatter. Risk: requires a *signal* for "routine vs decision" — either the skill declares its mode in its persona-adaptation qualifier (cheap; each SKILL.md already has an "Output Format" section), or the persona inspects tool-call types (more expensive, harder to test). Recommended only after A+E are validated and measured. Grounding: **Constitution principle "Skills are primarily markdown"** — option C is a markdown-only change *if* the signal is a SKILL.md qualifier; it becomes code-level if it needs a hook. The cheaper variant is acceptable; the expensive variant requires an ADR per the "external dependencies" principle (no new deps, but new interface surface).
4. **Option B — Depth dial (`depth: terse|normal|deep`) within a persona. [impact: medium; blast radius: medium-high].** Direct analog to GPT-5's `verbosity` parameter. Adds a per-persona dimension to `user-config` and one new key parsed by `lib/persona.mjs`. Adds tests, adds config-resolution code, slightly complicates the resolution hierarchy. The user gains a single global lever — but the existing reporter friction is **about defaults**, not about the lever's absence; A+E may make B unnecessary. Cost-benefit: more code than A/E/C for less direct relief. Grounding: GPT-5 verbosity parameter (external precedent); Anthropic-postmortem caveat (hard word limits cost ~3% quality, so the dial should remain a tone-bias, not a hard cap).
5. **Option D — New persona "Architect-Lite" as a fourth template. [impact: medium; blast radius: highest among the five].** Direct analog to Roo Code's mode catalog. Adds a new file in `templates/personas/`, updates `parseUserConfig` validation, updates `loadPersonaDirective` to know about it, requires a new entry in the persona-resolution test matrix, and forces a user to choose between two Architect-flavored options — increasing config surface area. The same effect is reachable by A (trim) + B (depth dial set to "normal" on Architect by default, "terse" on demand). Recommended only if the team explicitly wants a parallel template (e.g., for marketing or for a hard mode-switch UX). Grounding: Roo Code (external precedent confirms the pattern is viable); **but Constitution principle "Minimize external dependencies"** has a sibling implication — minimize *internal* surface area too unless a need is concrete.

## References

### Internal Files
- `templates/personas/architect.md` — 45 lines, 24 bullets, 22 directive-words across 8 dimensions; the verbose-default template
- `templates/personas/developer.md` — 39 lines, 18 bullets, 12 directive-words; balanced default
- `templates/personas/product.md` — 39 lines, 18 bullets, 7 directive-words; terse-default sibling
- `.context-index/specs/features/output-personas/persona-resolution-and-injection.spec.md` — line 70 is where option E's missing sentence belongs
- `.context-index/specs/features/output-personas/charter.md` — capability list; resolution mechanism is out-of-scope for issue-515
- `.context-index/memory/heuristics/_global.md` — heuristics `cache-reads-dominate-cost`, `summarize-output-preserves-quality`, `eval-with-session-jsonl`
- `.context-index/tasks/tasks.json` — issue-515 (lines 3303-3313) is the reporter source-of-truth
- `.context-index/sessions/2026-05-17-*.md` (36 files) — commit-mode session summaries; **substrate for chat-output measurement is JSONL, not these files**

### Empirical Helpers (re-runnable)
- `scripts/persona-jsonl-analysis.mjs` — streaming line-by-line analyzer over `~/.claude/projects/-Users-dpavancini-Development-adev-plugin/*.jsonl`; produces per-persona aggregate statistics (output_tokens, lines, headers, flag rates) with 95% Wilson CIs; never echoes message content. Re-run: `node scripts/persona-jsonl-analysis.mjs`.
- `scripts/persona-fixture-score.mjs` — structural A/B scorer; loads `templates/personas/{architect,developer,product}.md` plus an inlined candidate `CANDIDATE_ARCHITECT_TRIMMED` and tabulates bullets/directive-words per fixture prompt class. Re-run: `node scripts/persona-fixture-score.mjs`. Edit the candidate string to model alternative trim levels (the calibration finding above recommends ~10-15% trim, not 33%).

### Web Sources
- [Mastering GPT-5: Verbosity and Reasoning Effort Controls](https://sparkco.ai/blog/mastering-gpt-5-verbosity-and-reasoning-effort-controls) — GPT-5 `verbosity: low|medium|high`, `reasoning.effort` separate axis
- [GPT-5 New Params and Tools (OpenAI Cookbook)](https://cookbook.openai.com/examples/gpt-5/gpt-5_new_params_and_tools) — official GPT-5 verbosity API
- [Aider Chat Modes](https://aider.chat/docs/usage/modes.html) — `/code`/`/architect`/`/ask`/`/help` mode-switch grammar
- [Aider: Separating Code Reasoning and Editing](https://aider.chat/2024/09/26/architect.html) — two-model Architect-Editor workflow rationale
- [Aider Options Reference](https://aider.chat/docs/config/options.html) — `--verbose` flag (raw-LLM echo, not output-style)
- [Cursor Agent Mode Docs](https://cursor.com/help/ai-features/agent), [Cursor Subagents](https://cursor.com/product) — autonomy slider + subagent dispatch as the "verbosity answer"
- [Cline Rules — Customization Docs](https://docs.cline.bot/customization/cline-rules) — `.clinerules` and `alwaysApply` frontmatter
- [Cline Rules Best Practices 2026](https://cursor-alternatives.com/blog/cline-rules/) — 150-line guideline, conditional rules
- [Continue.dev Rules](https://docs.continue.dev/customize/rules) — `alwaysApply: true|false` + glob scoping (option C precedent)
- [Continue.dev Configuring Models, Rules, Tools](https://docs.continue.dev/guides/configuring-models-rules-tools) — rule scoping mechanics
- [Roo Code Using Modes](https://docs.roocode.com/basic-usage/using-modes) — five built-in modes + Orchestrator
- [Roo Code Customizing Modes](https://docs.roocode.com/features/custom-modes) — `.roomodes` for project-scoped custom modes (option D precedent)
- [OpenCode Agents](https://opencode.ai/docs/agents/) — `build`/`plan` agent split + Build/Plan/Review/Debug/Docs archetypes
- [GitHub Copilot Custom Instructions](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot) — `.github/copilot-instructions.md` brevity guidelines
- [GitHub Copilot AGENTS.md Changelog](https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/) — AGENTS.md / CLAUDE.md / GEMINI.md support
- [OpenAI Codex AGENTS.md Custom Instructions](https://developers.openai.com/codex/guides/agents-md) — directory-scoped precedence chain
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference) — `--json` machine-output toggle
- [Anthropic Skills — SKILL.md guide](https://code.claude.com/docs/en/skills) — skills format and progressive disclosure
- [Anthropic Skill Best Practices PDF](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) — progressive disclosure canonical principle
- [Anthropic Engineering: Equipping Agents with Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — official skills design rationale
- [Goose Recipe Reference](https://block.github.io/goose/docs/guides/recipes/recipe-reference/) — `response.json_schema` for structured output
- [Anthropic April 2026 Postmortem (InfoQ)](https://www.infoq.com/news/2026/05/anthropic-claude-code-postmortem/) — "25 words between tool calls / 100 words final" gate caused 3% quality drop, reverted
- [Claude Code cache-read GitHub issue #24147](https://github.com/anthropics/claude-code/issues/24147) — empirical cache-read cost in long sessions

### GitHub Sources

GitHub research source not requested via `--github <owner/repo>`. Recommended follow-up scopes if the planning skill wants implementation-level grounding for options C and D: `RooCodeInc/Roo-Code` (mode-definition prompts), `Aider-AI/aider` (architect coder implementation), `cline/cline` (conditional rule frontmatter parsing).

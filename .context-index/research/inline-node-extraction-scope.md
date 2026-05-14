<!-- Research artifact for /adev:research. Slug: inline-node-extraction-scope -->
---
topic: "Inline Node extraction scope — measured cost vs. structural pattern, recommendation for cli-driver-surface charter (epic-75 / adev-compiler-discipline)"
date: "2026-05-14"
relates-to: "epic-75"
sources:
  - internal
  - web
status: draft
---

## Summary

Empirical re-audit of validate-report and lifecycle-state corpora extends the Check-13 "12/71 PASS" finding from a single-block heuristic-extraction issue into a system-wide pattern: every inline-Node block whose effect is visible in artifacts shows the same shape — a small "fires correctly" minority, a small "self-admitted SKIP" minority, and a dominant **silent absence** majority (35–96% of reports). The structural cause is the same one Anthropic's own skill guidance and Claude Code issue #23813 flag: inline shell/Node embedded in SKILL.md competes with the harness's tool-preference rules, suffers from prompt-injection-shaped distrust, and forces the agent to recognize, parse, and execute prose as code on every invocation. Combined with 100% divergence between canonical and codex/opencode provider mirrors (3× duplication is real), the cost analysis favors **option (c) — full extraction guided by the three-layer driver/registry/codegen pattern from `adev-vs-compiler-dispatch-patterns.md` — sequenced as a hybrid rollout that lands the highest-skip block first**.

## Findings

### Internal

**(1a) Inline-block coverage rates across the validate corpus (n = 77 reports).** Re-running the audit's Check-13 methodology against every other inline-Node block in `skills/validate/SKILL.md` reveals the failure mode is system-wide, not localized to heuristic extraction:

| Inline block in `skills/validate/SKILL.md` | PASS trace | SKIP trace | Silent / absent | Silent-rate |
| --- | --- | --- | --- | --- |
| Check 13 — heuristic extraction (`skills/validate/SKILL.md:596`) | 12 | 23 | 42 | 55% |
| Check 12 — lifecycle reconciliation (`skills/validate/SKILL.md:441`) | 40 | 3 | 34 | 44% |
| Step 0a — lifecycle gate `requireGate` (`skills/validate/SKILL.md:25`-42 in canonical) | 3 | 0 | 74 | 96% |
| Per-check `reportValidator` emission (`skills/validate/SKILL.md:642`) | 2 | 0 | 75 | 97% |
| Reality-check inline `verifyIssueCompleted` (`skills/validate/SKILL.md:777`) | 1 | 0 | 76 | 99% |
| Domain-aware gate loading inline (`skills/validate/SKILL.md:107`-122) | 2 | 0 | 75 | 97% |
| Source-manifest verify inline (`skills/validate/SKILL.md:203` area) | 20 | 0 | 57 | 74% |

"Silent" means the report contains no positive evidence that the block fired — neither a PASS line, a SKIP note, nor any string referencing the helper. The Check-13 number that drove the original P3 ranking (12/77 ≈ 16% PASS) is, by silent-rate, the **best-performing** inline block in the skill. Check 12 looks better only because its inline-Node section is one of several paths it can take and the report format pre-prints a stub.

**(1b) Lifecycle-state event log — the harshest signal.** The `agent-reliable-state-artifacts/lifecycle-event-log.spec.md` design requires `reportStep` and `reportValidator` calls to populate `.context-index/lifecycle-state/<slug>.jsonl`. Today:
- Total specs in `.context-index/specs/features/`: **173**
- `.context-index/lifecycle-state/*.jsonl` files: **10** (5.8% coverage)
- `validator_report` events across all jsonl files: **0** (`find … -exec grep '"event":"validator_report"' {} \;`)

The block is implemented (`lib/lifecycle-state.mjs:1296`-LOC library, fully tested per `adev-vs-compiler-empirical-audit.md:64`), but the skill instructs the agent to call it via inline Node and the agent does not, for 99% of validations. (`/Users/dpavancini/Development/adev-plugin-hygiene/.context-index/lifecycle-state/`, `/Users/dpavancini/Development/adev-plugin-hygiene/lib/lifecycle-state.mjs`)

**(1c) Inline-Node prevalence across the lifecycle.** 18 SKILL.md files contain `Run inline Node.js` directives or `node --input-type=module -e "…"` heredocs (`grep -l "Run inline Node\|node --input-type\|node -e" skills/*/SKILL.md`). Concentrations:
- `skills/validate/SKILL.md`: 5 distinct inline-Node blocks
- `skills/implement/SKILL.md`: 4 distinct inline-Node blocks (`skills/implement/SKILL.md:51, 78, 177, 369, 543, 589`)
- `skills/prototype/SKILL.md`: 5 distinct blocks (`skills/prototype/SKILL.md:54, 70, 115, 208, 326, 350`)
- `skills/recover/SKILL.md`: 2 blocks
- `skills/plan/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/write-test/SKILL.md`, `skills/build/SKILL.md`, `skills/debug/SKILL.md`, `skills/eval/SKILL.md`, `skills/hygiene/SKILL.md`, `skills/reconcile/SKILL.md`, `skills/retro/SKILL.md`, `skills/sync/SKILL.md`, `skills/status/SKILL.md`, `skills/specify/SKILL.md`, `skills/brainstorm/SKILL.md`, `skills/standalone/SKILL.md`: 1–2 blocks each

**(1d) The "self-admitted SKIP" prose, verbatim.** Two validate reports contain the exact text the audit quoted:

> "SKIP: first-run PASS, but skipping heuristic extraction in this validation context to avoid side effects from inline Node invocation in the current environment."

(Source: `.context-index/specs/features/eval-projects/automation-eval-project.validate.md`, two other reports in `multi-repo-workspace/` and `domain-profiles/`.) Even spec-tracked reports that explicitly document why the inline call was skipped (`heuristics/recover-extraction.review.md` references "the inline Node invocation in SKILL.md directly imports `lib/heuristics.mjs`") still skip it.

**(1e) Provider-mirror duplication is currently 3× and 100% diverged.** `/Users/dpavancini/Development/adev-plugin-hygiene/providers/codex/skills/` and `/providers/opencode/skills/` each contain a full duplicate of every canonical SKILL.md (28 skills each). Diffing canonical against codex mirrors:
- Total skills with a codex mirror: **28 / 28**
- Skills where canonical and codex SKILL.md differ: **28 / 28 (100%)**
- Total diff lines across the codex mirror tree: **1,656** (≈ 59 diff lines / skill on average)

Spot-checked diffs show substantive divergence (e.g., `providers/codex/skills/validate/SKILL.md` is missing Step 0a entirely, missing domain-aware gate loading, and uses the pre-`mergedGates` branch of the gate-resolution code path — confirming the codex mirror has fallen multiple iterations behind canonical). Extracting inline blocks to `lib/cli/<verb>.mjs` is **strictly less work to re-sync** than the current state, because the mirror only needs to repeat the single-line CLI call — not the 30-line code body. Extraction *reduces* the 3× cost, not multiplies it.

**(1f) Existing research already concluded "more important, not less."** `.context-index/research/adev-vs-compiler-dispatch-patterns.md:310`-313 (after the helper-side-gating section landed):

> "**P3 (move inline Node out of SKILL.md) becomes *more* important, not less,** because the helpers it produces are the Layer 1 enforcement sites. Doing P3 without Layer 1 wastes most of its value; doing Layer 1 without P3 is impossible (there is nowhere to put the gate)."

And `.context-index/research/adev-vs-compiler-gaps-and-practice.md:187` documented the natural-drift mechanism the user references:

> "**The framework optimizes for adding charters, not removing them.** There is no consolidation pass. Each new idea wants its own charter; nothing in the lifecycle pushes back."

The same dynamic applies to inline-Node blocks: nothing in the lifecycle pushes back on new inline blocks. A measured-cost-only sweep leaves the addition pressure intact while clearing only the worst current accumulation.

### Web

**(2a) Anthropic's own skill guidance explicitly recommends extraction.** Anthropic's "Equipping agents for the real world with Agent Skills" and Skilljar "Introduction to Agent Skills" guidance both state:
- "When the SKILL.md file becomes unwieldy, split its content into separate files and reference them"
- "Keep SKILL.md focused on core instructions and move detailed documentation to `references/` and link to it"
- Progressive disclosure: SKILL.md is the *table of contents*; helpers and scripts are the chapters.

The pattern Anthropic recommends for code-bearing skills is a `scripts/` directory invoked by name; inline embedding is not a documented pattern. ([Equipping agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), [Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview))

**(2b) Claude Code issue #23813 — inline shell commands in skill definitions bypass dedicated tool preferences.** Filed against `anthropics/claude-code`:

> "The system prompt instructs Claude to prefer dedicated tools over Bash equivalents, but when a skill definition is loaded into context, its inline shell commands act as competing instructions. The model interprets the definition content as an authoritative directive to run that specific command, which overrides the general tool-preference rules. This causes unnecessary Bash permission prompts, bypasses safety features of dedicated tools, and reduces the effectiveness of skills."

The recommendation from the issue thread is to "treat them as intent descriptions (what to accomplish) rather than literal tool invocations (how to do it)." This is the same conclusion as `adev-vs-compiler-dispatch-patterns.md:131`-138: prose names *what* to run; the executor lives in compiled units. ([github.com/anthropics/claude-code/issues/23813](https://github.com/anthropics/claude-code/issues/23813))

**(2c) CLI subcommand vs. embedded code — the 2026 consensus is unambiguous.**
- "CLI tools execute shell commands that return text output … CLIs are 10–32× cheaper on tokens and more reliable for most developer tasks." (DEV.to / "Every AI Coding CLI in 2026")
- "Harness quality matters as much as the model; Cursor employs people whose full-time job is to rewrite system prompts and tool descriptions." (jock.pl / "AI Coding Harness Agents 2026")
- "The reason Claude Code moved behind Codex is not raw capability collapse; it is operational trust." (faros.ai / "Best AI Coding Agents for 2026")

The same articles note that **OpenCode's skill model uses a `skills/` directory of plain text instructions with separate scripts**, not inline-eval blocks. Aider and Cline both prefer "run this command" over "execute this code" for the same operational-trust reason. Cursor's distinguishing investment is precisely in tool-and-prompt discipline — the opposite of inline-eval. ([opencode.ai/docs/skills](https://opencode.ai/docs/skills/), [thoughts.jock.pl/p/ai-coding-harness-agents-2026](https://thoughts.jock.pl/p/ai-coding-harness-agents-2026), [thenewstack.io / open-source coding agents](https://thenewstack.io/open-source-coding-agents-like-opencode-cline-and-aider-are-solving-a-huge-headache-for-developers/))

**(2d) Continue / Cline / generic agent-design pattern.** Open-source agent frameworks converge on the "agents now interact with real development tools rather than simply generating text" model — actions are tool calls, not embedded code. The 2026 reliability postmortem-driven trend in agent-framework design is to **shrink the surface where the model has to recognize-then-execute** and grow the surface where the model **selects-from-a-named-list-and-invokes**. ([digitalocean.com / 10 Claude Code Alternatives](https://www.digitalocean.com/resources/articles/claude-code-alternatives), [agentic.ai/best/coding-agents](https://agentic.ai/best/coding-agents))

**(2e) Inline `!command` is a *different* feature.** Anthropic's `!command` syntax in SKILL.md (where Claude Code expands a shell command's output into the skill text before the model sees it) is a context-injection feature, not an agent-eval feature. It is operated by the harness, not the model. This is the discipline the compiler analogy describes: dynamic input is resolved *at load time*, then the loaded text is read-only at run time. adev's inline-Node blocks are the opposite — they live inside the prose and the model decides whether and how to execute them. ([code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills))

## Code Examples

The dispatch-patterns research (`adev-vs-compiler-dispatch-patterns.md:274`) already gives the canonical extraction pattern. The relevant excerpt — the "helper is the gate" structural argument — looks like:

```javascript
// lib/cli/validate.mjs  (the target shape, per dispatch-patterns.md §7.2)
import { requireGate, currentState, reportStep } from '../lifecycle-state.mjs';
import { loadManifest, resolveGateMode } from '../manifest.mjs';

export async function run({ projectRoot, spec }) {
  const state = currentState(projectRoot, spec);
  const mode  = resolveGateMode(loadManifest(projectRoot));
  requireGate(state, 'implement', { mode });   // throws GateError
  reportStep(projectRoot, spec, { step: 'validate', status: 'started' });
  // ... actual check work follows
}
```

Source: `.context-index/research/adev-vs-compiler-dispatch-patterns.md:274`-285. This pattern is what extracted inline blocks land into. The SKILL.md prose is then reduced to a one-liner: `adev validate run --spec <p>` (or the agent's tool equivalent).

The OpenCode equivalent (linked from `opencode.ai/docs/skills/`) follows the same shape — a skill directory with a SKILL.md whose runnable steps reference `scripts/<name>.{sh,mjs,py}` files, never inline-eval.

## Recommendations

The user's option labels (b = "fix only measured-cost blocks", c = "full extraction guided by the compiler pattern"):

### Recommended scope: option (c), sequenced as a hybrid rollout

**Recommendation 1 — Adopt option (c) — extract every inline-Node block from every SKILL.md.** The empirical evidence (1a, 1b) shows the measurement that drove option (b) understates the problem. The "silent-rate" column dominates the SKIP-rate column for every block except Check 13; for `reportValidator` and `verifyIssueCompleted`, the silent rate is 97–99%. Option (b) declares victory after improving Check 13, while the lifecycle-state event log (the entire `agent-reliable-state-artifacts` charter's reason for existing) silently fails to populate. Grounded in **Constitution Principle 2 — "Skills are primarily markdown; companion code is allowed but must not be required for the skill to function"** — inline Node embedded in SKILL.md makes companion code *required for the skill to work*, then renders it *invisible to the executor*. That is the worst of both worlds the principle was written to prevent.

**Recommendation 2 — Sequence the extraction in the three-layer order from `adev-vs-compiler-dispatch-patterns.md:167`-184.** Land in this order:
1. **Layer 1 (driver):** Extract per-block helpers in `lib/cli/<verb>.mjs`. Sequence by impact × measured silent rate: Check 13 heuristic extraction (1 day, lifts 12/77 → ~73/77), then `reportValidator` + `reportStep` (1–2 days, lifts 2/77 → ~73/77 and finally populates the event log), then `verifyIssueCompleted`, then the domain/source-manifest/heuristic-load blocks.
2. **Layer 2 (registry):** Add `runner:` paths to every entry in `governance/validate.yaml`, `review.yaml`, `gates.yaml`. Each skill iterates the registry instead of describing the work inline.
3. **Layer 3 (codegen):** Install-time validation + generated dispatcher so a broken registry can't install.
This is the **hybrid sequencing** the user asked about: option (c) in scope, option (b) in landing order — the highest-skip block ships first and proves the pattern before the long tail.

**Recommendation 3 — Treat the provider-mirror cost as a *reason for* extraction, not against.** Finding (1e) shows 100% divergence and ~1,656 cumulative diff lines across the codex mirror. Today, each inline-Node block has to be re-synced into each mirror's full prose body — the 30-line snippet exists three times. After extraction, the mirror only repeats the *single-line CLI call*; the helper body lives once in `lib/cli/`. Extraction reduces the multiplier from "3× full body" to "3× one-liner." This recommendation references **Principle 1 — "Minimize external dependencies; prefer Node.js built-ins"** indirectly: the path of least dependency is a CLI subcommand calling already-existing `lib/` modules, with zero new dependencies. The path that does *not* reduce mirror cost is "leave inline blocks in place and add a sync linter," which adds tooling without removing the duplication.

**Recommendation 4 — Constitution amendment to make the invariant durable.** Without a structural rule, finding (1f)'s "framework optimizes for adding charters, not removing them" applies one-for-one to inline-Node blocks: new ones will accrue. Codify into `constitution.md` "Anti-Patterns to Avoid": *"No executable logic inside SKILL.md files"* is already listed — extend with the operational equivalent: *"No `node --input-type=module -e \"…\"` heredocs, no `node -e \"…\"` invocations, no `Run inline Node.js:` step. Skills name a CLI subcommand (`adev <verb> …`) or a helper (`scripts/<name>.mjs`); the helper body lives in `lib/cli/` or `scripts/`."* Pair with a `hooks/pre-commit-no-inline-node.sh` that greps for the pattern and rejects new occurrences. This is **Constitution Principle 4 — "Hook protocol compliance"** extended to enforce Principle 2.

**Recommendation 5 — Anti-recommendation: do not stop at option (b).** Option (b)'s "stable state" claim does not hold. Concretely:
- The lifecycle-event log (the canonical audit trail per `agent-reliable-state-artifacts`) remains unpopulated. The state-artifacts migration's design depends on `reportValidator` calls that today never fire; without extraction, that charter's value is unrealized regardless of how clean its schemas are.
- Provider-mirror divergence is already 100%; option (b) leaves the duplication mechanism in place and the next inline block added during normal development re-creates the 3× cost.
- The pattern recurs every time a new skill is added (see the inline-Node prevalence count in 1c — every recent skill follows the established pattern).
A stable state requires both *a sweep* (option c) and *a pattern* (the constitution amendment in Recommendation 4). Option (b) is half the fix.

### Strict reading of the compiler analogy

The user's final question: does the analogy strictly require zero inline eval, or is "some is fine if it's not hot" defensible?

`adev-vs-compiler-dispatch-patterns.md:131`-138 states the rule strictly:

> "Executable logic lives in compiled, tested, callable units; textual configuration references those units by name. The compiler — and by analogy, the agent — never reads prose and decides whether to run code embedded in it."

The strict reading is *zero*. The reason is not aesthetic: an agent that has been told some-inline-is-fine has to make a per-block judgment call on every encounter, which is exactly the recognition-then-execute surface that issue #23813 documents as unreliable. The "not hot" carve-out re-introduces the per-encounter cost the extraction removes. A compiler does not have a "but only the cold paths" rule for `eval`; it has no `eval`.

That said, the analogy admits **one defensible accommodation**: the `!command`-style harness-side context injection (web finding 2e) is *not* the same thing as agent-side inline eval, and the strict rule does not forbid it. `!command` is read-once at load time; the agent sees only the resolved output. adev could legitimately use this for read-only context-loading steps (e.g., "current spec status" line at the top of a SKILL.md). It does not apply to writing — and the inline-Node blocks under audit are all writes (heuristics, lifecycle events, execution state, issue updates).

So the strict answer is: zero agent-side inline eval; harness-side `!command` is permitted for read-only context injection if needed; the boundary is mechanical and grep-able.

## References

### Internal Files
- `/Users/dpavancini/Development/adev-plugin-hygiene/.context-index/research/adev-vs-compiler-empirical-audit.md` — the prior audit; introduces P3 (move inline Node out of SKILL.md), gives the 12/71 Check-13 number and the verbatim "skipping inline Node invocation" quote
- `/Users/dpavancini/Development/adev-plugin-hygiene/.context-index/research/adev-vs-compiler-dispatch-patterns.md` — the three-layer driver/registry/codegen pattern; §5 sequencing; §7 helper-side gating that promotes P3 from important to **more important, not less**
- `/Users/dpavancini/Development/adev-plugin-hygiene/.context-index/research/adev-vs-compiler-gaps-and-practice.md` — finding (f) "framework optimizes for adding charters, not removing them" (the natural-drift mechanism the user references)
- `/Users/dpavancini/Development/adev-plugin-hygiene/.context-index/research/anthropic-skill-best-practices.md` — adev-internal review of Anthropic's published skill guidance; notes the just-in-time / progressive-disclosure mismatch
- `/Users/dpavancini/Development/adev-plugin-hygiene/skills/validate/SKILL.md` — site of 5 inline blocks plus the per-check `reportValidator` requirement
- `/Users/dpavancini/Development/adev-plugin-hygiene/skills/implement/SKILL.md` — 4 inline-Node blocks (execution state, heuristics load, domain-aware verification)
- `/Users/dpavancini/Development/adev-plugin-hygiene/skills/prototype/SKILL.md`, `skills/recover/SKILL.md`, `skills/plan/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/write-test/SKILL.md`, `skills/build/SKILL.md`, `skills/debug/SKILL.md`, `skills/eval/SKILL.md`, `skills/hygiene/SKILL.md`, `skills/reconcile/SKILL.md`, `skills/retro/SKILL.md`, `skills/sync/SKILL.md`, `skills/status/SKILL.md`, `skills/specify/SKILL.md`, `skills/brainstorm/SKILL.md`, `skills/standalone/SKILL.md` — additional inline-Node sites (1–5 blocks each)
- `/Users/dpavancini/Development/adev-plugin-hygiene/.context-index/specs/features/` — 77 `.validate.md` reports used for the silent-rate measurement; 173 `.spec.md` files used for the lifecycle-state coverage ratio
- `/Users/dpavancini/Development/adev-plugin-hygiene/.context-index/lifecycle-state/` — 10 jsonl files, zero `validator_report` events (the empty audit trail)
- `/Users/dpavancini/Development/adev-plugin-hygiene/providers/codex/skills/`, `/providers/opencode/skills/` — 28 mirrored skill directories each, 100% diverged from canonical
- `/Users/dpavancini/Development/adev-plugin-hygiene/.context-index/constitution.md` — Principle 2 ("Skills are primarily markdown"), Principle 1 ("Minimize external dependencies"), Anti-Patterns section ("No executable logic inside SKILL.md files")
- `/Users/dpavancini/Development/adev-plugin-hygiene/lib/lifecycle-state.mjs` — the 1296-LOC library whose `reportStep` and `reportValidator` exports are reachable by inline-Node call in 3/77 and 2/77 reports respectively

### Web Sources
- [Equipping agents for the real world with Agent Skills (Anthropic)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — official guidance; "split SKILL.md when unwieldy; move detail to references/"
- [Agent Skills overview (Anthropic platform docs)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — progressive-disclosure design principle
- [Claude Code skills docs](https://code.claude.com/docs/en/skills) — `!command` syntax (harness-side, distinct from agent-side eval)
- [anthropics/claude-code issue #23813](https://github.com/anthropics/claude-code/issues/23813) — inline shell commands bypass dedicated-tool preferences; explicit recommendation to treat skill content as intent description, not literal invocation
- [OpenCode Skills docs](https://opencode.ai/docs/skills/) — skill = SKILL.md + scripts/ directory; no inline-eval pattern
- [thoughts.jock.pl — AI Coding Harness 2026 (Claude Code, Codex, Aider, OpenCode, Pi, Cursor)](https://thoughts.jock.pl/p/ai-coding-harness-agents-2026) — harness-quality-matters argument; operational-trust framing
- [DEV.to — Every AI Coding CLI in 2026 (30+ tools)](https://dev.to/soulentheo/every-ai-coding-cli-in-2026-the-complete-map-30-tools-compared-4gob) — CLI 10–32× cheaper / more reliable than embedded code
- [thenewstack.io — Open-source coding agents (OpenCode, Cline, Aider)](https://thenewstack.io/open-source-coding-agents-like-opencode-cline-and-aider-are-solving-a-huge-headache-for-developers/) — convergent pattern across open-source agents
- [agentic.ai — Best Coding Agents 2026](https://agentic.ai/best/coding-agents) — agents-as-tool-callers framing
- [faros.ai — Best AI Coding Agents 2026](https://www.faros.ai/blog/best-ai-coding-agents-2026) — operational-trust postmortem
- [bradAGI/awesome-cli-coding-agents](https://github.com/bradAGI/awesome-cli-coding-agents) — directory of CLI-shaped agent harnesses (corroborates the embedded-vs-CLI distinction across the ecosystem)
- [computingforgeeks — OpenCode vs Claude Code vs Cursor 2026](https://computingforgeeks.com/opencode-vs-claude-code-vs-cursor/) — skill-design comparison across harnesses

### Milestone / epic references
- `adev-compiler-discipline` milestone — sequencing per `adev-vs-compiler-dispatch-patterns.md` §4 (Layer 1 → Layer 2 → Layer 3); the `cli-driver-surface` charter is the Layer 1 deliverable
- `epic-75` — the implementation epic for the recommendation; per this artifact, scoped at option (c) with Recommendation 2's three-layer ordering

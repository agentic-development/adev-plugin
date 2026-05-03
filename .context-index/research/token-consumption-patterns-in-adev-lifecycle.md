---
topic: "Token consumption patterns in adev lifecycle"
date: "2026-05-02"
relates-to: ""
sources:
  - internal
  - web
status: complete
---

## Summary

The adev lifecycle's token consumption is dominated by three factors: (1) SKILL.md file sizes, which range from 5KB to 50KB per skill and are loaded in full upon invocation; (2) subagent multiplication, where the build pipeline spawns 6+ nested subagent layers each carrying context packets plus skill instructions; and (3) review loops that multiply per-task costs by 2-4x. A full `/adev:build --full` pipeline for a single spec can consume an estimated 400K-800K tokens across all subagent invocations, with `/adev:implement` and `/adev:validate` being the heaviest phases. Competitors face similar challenges: Superpowers consumes ~22K tokens at startup (11% of 200K context), GSD burns ~12K in fixed prompt overhead, and gstack's multi-role system can consume 10K+ tokens before real work begins. Actionable reductions include conditional section loading within skills, context packet compression, and review loop budgets.

## Findings

### Internal

#### SKILL.md Size Distribution

The 28 skills total 553,759 bytes (~138K tokens) of instruction text. The top 6 skills by size account for 62% of total instruction volume:

| Skill | Bytes | Approx. Tokens |
|-------|-------|-----------------|
| plan | 50,107 | 12,500 |
| validate | 47,382 | 11,800 |
| build | 42,418 | 10,600 |
| hygiene | 38,356 | 9,600 |
| implement | 37,566 | 9,400 |
| specify | 33,026 | 8,300 |

The smallest skills (sync, document, using-adev) are 5-6KB each. Source: `skills/*/SKILL.md` file sizes.

#### Startup Overhead

All 28 skill descriptions are loaded into context at session start, totaling ~9,308 characters (~2,327 tokens). This is modest compared to Superpowers' 22K token startup overhead because adev uses description-only loading at startup, with full SKILL.md content loaded only on invocation. Source: `skills/*/SKILL.md:1-5` frontmatter descriptions.

#### Build Pipeline Subagent Multiplication

The `/adev:build` orchestrator (`skills/build/SKILL.md`) dispatches each pipeline step as a fresh subagent via the Agent tool. Each subagent must:
1. Load the full SKILL.md of the child skill (8K-12K tokens)
2. Receive the context packet (constitution excerpt, spec content, charter — estimated 3K-8K tokens)
3. Process any companion prompt files (e.g., review-specs loads 3 reviewer prompts totaling 7,769 bytes)

The full pipeline chain for a single spec: `specify → review-specs → plan → route → implement → validate`. Total SKILL.md bytes loaded across subagents: 196,620 bytes (~49K tokens), plus the build orchestrator's own 42,418 bytes. Source: `skills/build/SKILL.md:75-82`, `skills/build/SKILL.md:196-325`.

#### Implement Phase: The Deepest Subagent Nesting

`/adev:implement` is the most token-intensive phase because it dispatches per-task subagents, each of which may internally dispatch:
- A write-test subagent (24,193 bytes SKILL.md)
- An implementer subagent with full context packet
- A spec reviewer subagent
- A code quality reviewer subagent
- Optionally: a visual verifier subagent

With maximum review cycles (3 per task), a single task can spawn 5-7 subagents. For a plan with 5 tasks, this means 25-35 subagent dispatches from implement alone. Source: `skills/implement/SKILL.md:285-396`.

#### Review Loop Token Multipliers

Review loops are capped but still expensive:
- Implement: max 3 review cycles per task, max 2 re-dispatches for NEEDS_CONTEXT (`skills/implement/SKILL.md:297,363`)
- Build blocker-fix loop: max 2-3 review retries (`skills/build/SKILL.md:34,253`)
- Brainstorm charter review: max 3 iterations (`skills/brainstorm/SKILL.md:66`)

Each review cycle re-dispatches a fresh subagent with the accumulated context, meaning review loops have O(n * context_size) token cost.

#### Context Packet Overhead

Plans include per-task context packets (`skills/plan/SKILL.md:395-432`) that are serialized into subagent prompts. These include: constitution excerpt, spec acceptance criteria, charter capability, golden samples, heuristics, and cross-repo reference context. The implement skill assembles these at dispatch time (`skills/implement/SKILL.md:173-189`), with heuristics injection adding an additional section.

#### Always-Loaded Context

Every session loads: CLAUDE.md (5,556 bytes), constitution.md (4,872 bytes), manifest.yaml (4,680 bytes), platform-context.yaml (984 bytes) — totaling 16,092 bytes (~4K tokens) of base context.

### Web

#### Superpowers Token Overhead

Superpowers (obra/superpowers) loads all 14 skills at startup, consuming ~22K tokens (11% of 200K context window). Issue #190 documents this and proposes progressive disclosure (reducing startup from 22K to 1.4K tokens) or tiered loading. A separate issue (#953) reports a skill consuming 100% of tokens in 5 minutes. Practitioner testing showed the plugin cut tokens by 14% overall versus unstructured sessions, with ~100K tokens for a complete large feature. Source: [Issue #190](https://github.com/obra/superpowers/issues/190), [Issue #953](https://github.com/obra/superpowers/issues/953), [Superpowers review](https://www.mejba.me/blog/superpowers-plugin-claude-code-review).

#### GSD Context Engineering

GSD (Get Shit Done) burns ~12K tokens of fixed overhead from eagerly enumerating skill and subagent descriptions in the system prompt. Its mitigation strategy: assign separate orchestrators per phase, each staying under 50% context capacity, writing state to disk as Markdown between phases. This prevents "context rot" but does not reduce total token consumption — it redistributes it across fresh context windows. Source: [GSD context engineering](https://docs.bswen.com/blog/2026-04-21-gsd-context-engineering/), [Pulumi comparison](https://www.pulumi.com/blog/claude-code-orchestration-frameworks/).

#### gstack Role Isolation Cost

gstack injects role-based governance where each role (CEO, designer, architect, QA) has its own context. This role isolation means the engineer role does not see the product roadmap and the QA role does not see implementation details. The cost: each role injects 10K+ tokens before real work begins. Multi-role sessions accumulate tokens, with recommendation to break workflows across sessions. Source: [gstack token issue](https://github.com/garrytan/gstack/issues/689), [Pulumi comparison](https://www.pulumi.com/blog/claude-code-orchestration-frameworks/).

#### SpecKit Context Tax

SpecKit (GitHub's spec-driven development toolkit) faces similar context pressure: every installed slash command, template, and constitution rule adds tokens. Teams running SpecKit with multiple extensions report "significant context tax" where the agent parses framework instructions instead of reasoning about code. The recommended threshold: if framework overhead exceeds 15-20% of the context window, consider trimming the configuration. Source: [SpecKit token issue](https://github.com/github/spec-kit/issues/1492), [SpecKit comparison](https://www.bighatgroup.com/blog/openspec-vs-speckit-spec-driven-ai-development/).

#### Claude Code Native Token Optimization Mechanisms

- **MCP Tool Search deferred loading**: reduces tool description overhead by 85% by marking tools with `defer_loading: true` and loading 3-5 relevant tools per query instead of all tools. Source: [MCP Tool Search explainer](https://www.atcyrus.com/stories/mcp-tool-search-claude-code-context-pollution-guide).
- **Auto-compaction**: after compaction, Claude Code re-attaches the most recent invocation of each skill, keeping the first 5,000 tokens of each, with a combined budget of 25,000 tokens for re-attached skills. Source: [Claude Code token optimization](https://github.com/affaan-m/everything-claude-code/blob/main/docs/token-optimization.md).
- **Prompt caching**: cache reads cost 0.1x vs 1x for standard input, yielding up to 90% reduction on stable content like system instructions. The 5-minute TTL means subagents that dispatch within 5 minutes of each other share cache hits. Source: [Prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
- **Model tier routing**: using Haiku for simple subagent tasks is ~80% cheaper than Sonnet. Source: [Claude Code costs docs](https://code.claude.com/docs/en/costs).

#### Comparative Framework Overhead

| Framework | Startup Overhead | Per-Invocation | Strategy |
|-----------|-----------------|----------------|----------|
| Superpowers | ~22K tokens (all skills) | 2-3x base | Skill-per-phase |
| GSD | ~12K tokens (descriptions) | 5-10x base | Fresh context per phase |
| gstack | ~10K+ tokens (per role) | Variable | Role isolation |
| SpecKit | Variable (15-20% threshold) | N/A | Spec-grounded hooks |
| adev | ~2.3K tokens (descriptions) | Phase-dependent | Lazy skill loading + subagent isolation |

## Code Examples

### Example: adev SKILL.md size breakdown by lifecycle phase

```
# Source: skills/*/SKILL.md file sizes
# Lifecycle phase token costs (SKILL.md only, excluding context packets)

Design phase:
  brainstorm:    23,682 bytes  (~5,920 tokens)
  specify:       33,026 bytes  (~8,256 tokens)
  review-specs:  16,791 bytes  (~4,197 tokens)
  Subtotal:      73,499 bytes  (~18,373 tokens)

Planning phase:
  plan:          50,107 bytes  (~12,526 tokens)
  route:         11,748 bytes  (~2,937 tokens)
  Subtotal:      61,855 bytes  (~15,463 tokens)

Implementation phase:
  implement:     37,566 bytes  (~9,391 tokens)
  write-test:    24,193 bytes  (~6,048 tokens)
  debug:         19,836 bytes  (~4,959 tokens)
  recover:       25,362 bytes  (~6,340 tokens)
  Subtotal:     106,957 bytes  (~26,738 tokens)

Validation phase:
  validate:      47,382 bytes  (~11,845 tokens)

Build orchestrator:
  build:         42,418 bytes  (~10,604 tokens)
```

### Example: Build pipeline cumulative token estimate (single spec, 5 tasks)

```
# Source: Analysis of skills/build/SKILL.md dispatch chain
# Assumes: 5 implementation tasks, 1 review cycle each, no retries

Build orchestrator context:     ~10,600 tokens (loaded once)

Subagent dispatches:
  specify subagent:             ~8,256 tokens (SKILL.md) + ~4,000 (context packet)
  review-specs subagent:        ~4,197 tokens + ~7,769 bytes reviewer prompts
  plan subagent:                ~12,526 tokens + ~5,810 bytes reviewer prompt
  route subagent:               ~2,937 tokens
  implement subagent:           ~9,391 tokens + per-task overhead below
  validate subagent:            ~11,845 tokens

Per-task within implement (x5 tasks):
  write-test subagent:          ~6,048 tokens
  implementer subagent:         ~3,000-8,000 tokens (context packet + code)
  spec reviewer:                ~2,000 tokens
  code quality reviewer:        ~2,000 tokens
  Subtotal per task:            ~13,000-18,000 tokens
  Subtotal 5 tasks:             ~65,000-90,000 tokens

Final cross-task reviewer:      ~3,000 tokens

ESTIMATED TOTAL:                ~130,000-160,000 tokens (instruction overhead only)
                                ~400,000-800,000 tokens (including code reads, tool calls,
                                                          model output across all subagents)
```

## Deep Dive: Reduction Strategies

### Strategy 1: Conditional Section Loading (40-60% savings)

**Problem:** The plan SKILL.md (50KB) has 26 sections but most invocations use only one mode. A `--spec` invocation loads Feature Mode, Release Mode, Milestone Mode, Epic Mode, and Phase Planning Mode sections that are never read (~25KB of dead weight).

**Concrete approach — mode-gated companion files:**

```
skills/plan/
  SKILL.md              # Core: arguments, mode detection, shared steps (~15KB)
  spec-mode.md          # Spec Mode steps 1-7 (~20KB)
  feature-mode.md       # Feature Mode (~5KB)
  release-mode.md       # Release Mode (~5KB)
  milestone-mode.md     # Milestone Mode (~3KB)
  epic-mode.md          # Epic Mode (~2KB)
```

The SKILL.md contains mode detection logic and a `Read` instruction: "After detecting mode, Read the corresponding companion file." This way only the relevant mode's instructions are loaded.

**Estimated savings per skill:**

| Skill | Current | Core | Conditional | Savings |
|-------|---------|------|-------------|---------|
| plan | 50KB (12.5K tokens) | 15KB | 5 companion files | 70% per invocation |
| validate | 47KB (11.8K tokens) | 12KB | Check 11 (visual), workspace mode, governance | 55% for non-UI specs |
| build | 42KB (10.6K tokens) | 15KB | Resume, phase, workspace modes | 55% per invocation |
| hygiene | 38KB (9.6K tokens) | 12KB | Audit passes 10-17 as companions | 50% when only running subset |
| implement | 38KB (9.4K tokens) | 15KB | Visual verification, specialist dispatch | 40% for non-UI tasks |

**Risk:** Agent must perform an extra Read tool call per invocation. Cost: ~0.5s latency + ~200 tokens for the Read result overhead. Acceptable trade-off for 5K-8K tokens saved.

**Implementation path:**
1. Split the top 3 skills (plan, validate, build) first — highest ROI
2. Add a `## Mode: <name>` marker in each companion file for the agent to verify it loaded the right one
3. Keep the core SKILL.md self-contained for simple cases (e.g., `--spec` with no workspace)

### Strategy 2: Context Packet Size Caps

**Problem:** Context packets grow unbounded. A spec with a large charter, 5 ADRs, 3 golden samples, and heuristics can produce 15K+ tokens of context per subagent dispatch. Multiplied by 5 tasks × 4 subagents each = 300K tokens of context alone.

**Concrete approach — priority-tiered budget:**

```
Budget: 4,000 tokens per context packet

Priority tiers (include in order until budget exhausted):
  1. Spec acceptance criteria relevant to this task  (must-include, ~500-1000 tokens)
  2. Constitution excerpt (architecture boundaries)   (must-include, ~300 tokens)
  3. Charter capability being implemented              (must-include, ~200 tokens)
  4. Cross-cutting spec constraints                    (include if room, ~500 tokens)
  5. Golden sample reference                           (include if room, ~800 tokens)
  6. Heuristics                                        (include if room, ~500 tokens)
  7. ADR decisions                                     (include if room, ~400 tokens)
  8. Full charter scope/domain model                   (trim first, ~1500 tokens)
```

When the budget is exceeded, lower-priority tiers get a one-line reference ("See ADR-0006 at .context-index/adrs/0006-dotenvx-dependency.md") instead of full content. The subagent can Read the file if needed.

### Strategy 3: Review Loop Reduction (3→2)

**Problem:** Each review cycle dispatches a fresh subagent with accumulated context. The 3rd iteration rarely produces new findings — it's typically "Approved" or the same issues restated.

**Data from this project:**
- Brainstorm charter review: 2 iterations needed (fix 3 issues → approved)
- Plan review: 1 iteration (approved first pass)
- Implement per-task review: 0 extra cycles (all tasks passed first review)
- Review-specs: 1 iteration (fix 2 blockers → all pass)

**Recommendation:** Default cap to 2 iterations. Add `review_max_iterations` to manifest.yaml for projects that need 3. Estimated savings: 13K-18K tokens per skipped iteration × (number of tasks that would have hit iteration 3).

### Strategy 4: Prompt Cache Alignment

**Problem:** Subagents dispatched sequentially share prompt cache when their prompts have identical prefixes. But adev dispatches subagents with different SKILL.md content as the prompt prefix, breaking cache across skill boundaries.

**Concrete approach — shared prefix block:**

When `/adev:implement` dispatches per-task subagents, it can structure prompts so the shared content (constitution, spec, charter) appears first (cache-friendly prefix) and task-specific content appears last (cache-breaking suffix):

```
[CACHED PREFIX — shared across all task subagents]
Constitution: ...
Spec: ...
Charter: ...

[PER-TASK SUFFIX — varies per dispatch]
Task 3 instructions: ...
Task 3 context packet: ...
```

With 5-minute cache TTL, sequential task dispatches (each taking 1-3 minutes) would achieve 60-80% cache hit rate on the shared prefix. At 0.1x cost for cache reads, this saves ~70% on the shared portion.

### Strategy 5: Output Summarization (NEW)

**Problem:** Subagent output flows back to the parent context in full. A review subagent returning 2000 tokens of analysis consumes 2000 tokens of the parent's context. Across 5 tasks × 2 reviewers × 2 stages = 20K tokens of review output accumulated in the parent implement context.

**Concrete approaches:**

**A. Structured return format with size cap:**
Require subagents to return a structured summary block (max 500 tokens) plus write detailed output to disk:

```markdown
## Result
**Status:** DONE
**Summary:** Implemented scanForDrift with 6 tests passing. Used buildReverseIndex delegation pattern.
**Files changed:** lib/spec-drift.mjs, tests/lib/spec-drift.test.mjs
**Issues:** None
**Detail:** Written to .context-index/build-state/task-1-result.md
```

The parent reads only the summary. Full details are on disk for debugging.

**B. PostToolUse summarization hook:**
A hook on Agent tool returns that summarizes long subagent output before it enters the parent context. The hook runs a lightweight Haiku call to compress the output to key facts. Cost: ~500 tokens per summarization. Savings: 1000-3000 tokens per subagent return.

**C. Implement skill self-compaction:**
After each task completes, the implement skill writes the result to build-state and instructs the model to compact its own memory of the completed task: "Task 1 is complete. The details are at .context-index/build-state/task-1-result.md. For the remaining tasks, you only need to know: Task 1 created lib/spec-drift.mjs with 4 exported functions."

### Strategy 6: Thinking Token Budgeting (NEW)

**Problem:** Extended thinking tokens are billed as input tokens and can consume 10K-30K tokens per complex reasoning step. Subagents performing simple tasks (content-presence tests, file reads, string matching) don't need extended thinking.

**Concrete approaches:**

**A. Model tier already handles this partially:**
- `fast` tier (Haiku): no extended thinking available — already optimal
- `capable` tier (Sonnet): thinking available but can be budgeted
- `reasoning` tier (Opus): full thinking — appropriate for architecture review

**B. Explicit thinking budget per subagent type:**

| Subagent Type | Thinking Budget | Rationale |
|---------------|----------------|-----------|
| Implementer | 10K tokens | Needs reasoning for code design |
| Spec reviewer | 5K tokens | Structured checklist, less open-ended |
| Code quality reviewer | 5K tokens | Pattern matching, not design |
| Plan reviewer | 8K tokens | Needs to cross-reference spec ↔ plan |
| Write-test | 8K tokens | Test design requires reasoning |
| Consistency analyzer | 3K tokens | String matching and comparison |
| Route scorer | 2K tokens | Numeric scoring, minimal reasoning |

**C. `MAX_THINKING_TOKENS` environment variable:**
Can be set per-subagent dispatch via the Agent tool's env parameter. This is already supported by Claude Code.

### Strategy 7: Artifact-to-Disk, Summary-to-Context (NEW)

**Problem:** Skills produce large artifacts (plans, reviews, validation reports) that are both written to disk AND kept in conversation context. The plan SKILL.md writes a 500-line plan to disk then presents the full plan to the user — doubling the token cost.

**Concrete approach — write-then-summarize pattern:**

```
1. Write full artifact to disk (plan, review, validation report)
2. Present ONLY a structured summary to the user/parent:
   - Status line (PASS/FAIL)
   - Key metrics (N tasks, M criteria, P findings)
   - Actionable next steps
   - File path to full artifact
3. Full artifact is NOT repeated in conversation output
```

**Estimated savings per skill:**

| Skill | Current Output | Summary Only | Savings |
|-------|---------------|-------------|---------|
| plan | ~8K tokens (full plan) | ~500 tokens | 94% |
| validate | ~4K tokens (full report) | ~400 tokens | 90% |
| review-specs | ~3K tokens (full review) | ~300 tokens | 90% |
| retro | ~5K tokens (full retro) | ~500 tokens | 90% |

This is the single highest-impact change — it applies to every skill that produces a file artifact.

#### Eval Validation

Tested via `tests/evals/skill-compression/` with a simulated `/adev:plan` run:

| Metric | Baseline (full echo) | Summarized (disk + summary) | Delta |
|--------|---------------------|----------------------------|-------|
| Characters | 8,933 | 1,023 | -88% |
| Lines | 284 | 25 | -91% |
| Est. tokens | ~2,233 | ~255 | -88% |
| Rubric score | 12/12 (50 pts) | 12/12 (50 pts) | parity |

All 12 required elements (review gate, context loading, file references, TDD, task ordering, tests, commits, quality gates, context awareness, plan path, execution handoff, acceptance criteria) pass in both variants.

#### Cache Impact Analysis

The summarization strategy is **cache-positive** — it improves prompt cache hit rates despite removing content from the conversation.

**How Claude Code prompt caching works:** The system prompt, CLAUDE.md, and conversation history form a cached prefix block. Cache entries have a 5-minute TTL. A cache hit requires byte-identical prefix. Cache reads cost 0.1x vs 1x standard — 90% cost reduction on cached content.

**Why summarization improves caching:**

1. **Fewer compaction events:** Auto-compaction fires at ~83.5% context utilization (~167K tokens). It summarizes history, changing the prefix bytes and breaking the cache. With 30K fewer tokens of artifact echoes in history, compaction is delayed or avoided — the cache prefix stays stable across more turns.

2. **More stable cross-subagent prefix:** When `/adev:implement` dispatches sequential task subagents, a leaner parent context means the shared prefix (SKILL.md + constitution + spec) is more likely to be byte-identical across dispatches within the 5-minute TTL.

3. **Minimal Read overhead:** When the model needs plan details, it issues a Read (cache miss on the Read result, ~2K tokens). On the next turn, the Read result joins the prefix and gets cached. This costs ~1-2 extra cache misses per session.

**Quantified net effect (5-task build session, ~20 turns):**

```
BASELINE:
  Prefix at turn 15:     ~160K tokens (approaching compaction threshold)
  Compaction at turn 16:  prefix rewritten → CACHE MISS on ~120K prefix
  Turns 17-20:            rebuilding cache → 4 partial misses
  Total avoidable misses: ~5

SUMMARIZED:
  Prefix at turn 15:     ~120K tokens (well under threshold)
  No compaction:          prefix stable through turn 20
  Extra Read calls:       2 (plan + validation report) → 2 misses on ~2K each
  Total avoidable misses: ~2

Net savings: 3 avoided cache misses × ~120K prefix × 0.9x cost delta
           = ~324K token-equivalents saved per session from caching alone
Cost:        2 Read misses × ~2K tokens × 0.9x = ~3.6K token-equivalents
```

| Cache Factor | Baseline | Summarized | Winner |
|-------------|----------|------------|--------|
| Compaction events | 1-2/session | 0-1/session | Summarized |
| Cache-breaking prefix changes | 1-2 | 0-1 | Summarized |
| Cross-subagent cache reuse | Low | Higher | Summarized |
| Inline content cache seeding | Full plan cached | 1-2 Read misses | Baseline (minor) |
| **Net cache hit rate** | **~60-70%** | **~85-95%** | **Summarized** |

## Recommendations (Prioritized by Impact)

### Tier 1 — Highest Impact (implement first)

8. **Artifact-to-disk, summary-to-context** — Every skill that writes a file artifact (plan, review, validation, retro) should present only a structured summary (~500 tokens) to the conversation and reference the full file on disk. This is the single highest-impact change: 90%+ reduction in output tokens for artifact-producing skills. No new infrastructure needed — just a pattern change in SKILL.md instructions.

1. **Implement conditional section loading in SKILL.md files** -- The top 6 skills (plan, validate, build, hygiene, implement, specify) account for 270K bytes of instruction. Many sections are conditionally relevant (e.g., build's retry logic, implement's visual verification, validate's browser checks). Splitting SKILL.md files into a core section (~30-40% of current size) and optional sections loaded via companion files would reduce per-invocation overhead by an estimated 40-60%. This aligns with the constitution's principle of "skills are primarily markdown" since the companion files would also be markdown. (Constitution: Principle 2)

2. **Cap context packet sizes with a token budget** -- Context packets are assembled ad-hoc with no size limit. Adding a budget cap (e.g., 4,000 tokens) with priority-based trimming (constitution excerpt > spec acceptance criteria > samples > heuristics) would prevent context packet bloat as specs and charters grow. This follows the same pattern as the internal researcher's 1,500-token return cap and 20-file read budget. (Constitution: Principle 1 — minimize overhead)

3. **Reduce review loop caps from 3 to 2 by default** -- The implement phase allows 3 review cycles and 2 re-dispatches per task. Data from competitors suggests 2 review cycles captures most value (Superpowers recommends limiting planning iterations to 2). Reducing the default from 3 to 2 saves one full subagent dispatch per task (~13K-18K tokens). The cap should remain configurable. (Constitution: Principle 1)

4. **Leverage prompt caching TTL alignment** -- Subagents dispatched within 5 minutes of each other share prompt cache hits (cache reads cost 0.1x). The build pipeline could sequence subagent dispatches to maximize cache overlap — e.g., dispatching the spec reviewer immediately after the implementer (both share the spec content in their prompts). This is a cost optimization, not a token-count reduction. (Constitution: aligned with zero-dependency preference since it uses Claude platform features)

5. **Consider extracting anti-pattern/pitfall sections into a shared reference** -- Multiple SKILL.md files repeat similar anti-pattern lists (e.g., "do not dispatch multiple subagents in parallel", "do not skip review", "do not inline implementation"). A shared `skills/_common/anti-patterns.md` loaded by reference would deduplicate ~2K-3K tokens across the 6 heaviest skills. This trades a small structural change for measurable token savings. (Constitution: Principle 2 — companion files are allowed)

6. **Add token cost telemetry to the build pipeline** -- The existing research artifact at `.context-index/research/token-cost-logging-for-plugin-lifecycle-sk.md` identified viable approaches (Stop hook reading JSONL session files). Without empirical measurement, optimization efforts are guided by estimates. Implementing even basic per-skill token tracking would validate which phases actually dominate cost in practice versus the theoretical analysis above. (Constitution: Principle 1 — informed optimization)

7. **Explore tiered SKILL.md loading for the build orchestrator** -- The build orchestrator's SKILL.md (42K bytes) includes detailed documentation for all pipeline modes (implement-only, full, multi-spec, resume). When invoked with `--full` for a single spec, the multi-spec and resume sections are dead weight. A mode-aware loader that trims irrelevant sections could save ~30% of the orchestrator's instruction tokens. (Constitution: Principle 2)

### Tier 2 — Medium Impact (implement after Tier 1)

9. **Subagent output summarization** — Require subagents to return structured summaries (max 500 tokens) with detailed output written to `.context-index/build-state/`. Parent agents read only the summary. Across 20+ subagent dispatches per build, this saves 15K-40K tokens of accumulated context in the parent. (Constitution: Principle 1)

10. **Thinking token budgets per subagent type** — Set `MAX_THINKING_TOKENS` per subagent dispatch: 10K for implementers, 5K for reviewers, 2-3K for route scorers and consistency analyzers. Currently uncapped, meaning a consistency analyzer may use 20K+ thinking tokens for a task that needs 3K. (Platform: `MAX_THINKING_TOKENS` env var)

11. **Prompt cache prefix alignment** — Structure subagent prompts with shared content (constitution, spec, charter) as a fixed prefix and per-task content as a suffix. With 5-minute cache TTL and sequential task dispatches taking 1-3 minutes each, this achieves 60-80% cache hit rate on the shared prefix. Savings: ~70% cost reduction on shared content. (Platform: prompt caching)

12. **Shared anti-pattern reference file** — Extract repeated anti-pattern lists from SKILL.md files into `skills/_common/anti-patterns.md` loaded by reference. Deduplicates ~2K-3K tokens across the 6 heaviest skills. (Constitution: Principle 2)

## References

### Internal Files
- `skills/*/SKILL.md` -- All 28 skill instruction files, measured for size distribution
- `skills/build/SKILL.md` -- Build orchestrator with subagent delegation protocol
- `skills/implement/SKILL.md` -- Implementation skill with per-task subagent dispatch and review loops
- `skills/plan/SKILL.md` -- Planning skill with context packet manifest generation
- `skills/validate/SKILL.md` -- Validation skill with 13-check suite
- `skills/research/internal-researcher-prompt.md` -- Researcher prompt with token budget cap pattern
- `.context-index/research/token-cost-logging-for-plugin-lifecycle-sk.md` -- Prior research on token cost logging
- `.context-index/platform-context.yaml` -- Model tier configuration
- `.context-index/constitution.md` -- Project principles
- `.context-index/manifest.yaml` -- Module structure and configuration

### Web Sources
- [All Skills Preloaded at Startup Consuming 22k+ Tokens - Superpowers Issue #190](https://github.com/obra/superpowers/issues/190) -- Documents startup token overhead in Superpowers
- [Claude skill ate 100% of tokens in 5 minutes - Superpowers Issue #953](https://github.com/obra/superpowers/issues/953) -- Extreme token consumption case
- [Superpowers Review](https://www.mejba.me/blog/superpowers-plugin-claude-code-review) -- Practitioner testing showing 14% token reduction
- [GSD Context Engineering](https://docs.bswen.com/blog/2026-04-21-gsd-context-engineering/) -- GSD's fresh-context-per-phase strategy
- [Superpowers, GSD, and GSTACK Comparison - Pulumi Blog](https://www.pulumi.com/blog/claude-code-orchestration-frameworks/) -- Cross-framework overhead comparison
- [gstack Token Optimization Issue #689](https://github.com/garrytan/gstack/issues/689) -- gstack token consumption concerns
- [SpecKit Token Issue #1492](https://github.com/github/spec-kit/issues/1492) -- SpecKit context tax documentation
- [OpenSpec vs SpecKit Comparison](https://www.bighatgroup.com/blog/openspec-vs-speckit-spec-driven-ai-development/) -- 15-20% overhead threshold recommendation
- [MCP Tool Search Explainer](https://www.atcyrus.com/stories/mcp-tool-search-claude-code-context-pollution-guide) -- 85% reduction via deferred tool loading
- [Claude Code Token Optimization Guide](https://github.com/affaan-m/everything-claude-code/blob/main/docs/token-optimization.md) -- Auto-compaction and skill re-attachment budgets
- [Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) -- Cache read pricing (0.1x) and TTL behavior
- [Claude Code Costs](https://code.claude.com/docs/en/costs) -- Model tier pricing and Haiku cost advantage

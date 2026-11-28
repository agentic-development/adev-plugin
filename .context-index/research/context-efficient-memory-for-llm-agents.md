---
topic: "Context-Efficient Memory Injection for LLM Coding Agents"
date: "2026-04-21"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

## Summary

AI coding assistants and agentic frameworks have converged on four core patterns for injecting learned context without bloating the context window: (1) progressive disclosure (tiered loading from index to detail), (2) relevance-based retrieval (scope/confidence filtering and ranking), (3) budget-capped injection (hard limits on injected items and token counts), and (4) modular scoping (loading only context relevant to the active file, module, or task). adev-plugin already implements a strong version of patterns 2-4 via its `retrieveHeuristics` function and `injection_limit` config, and pattern 1 is partially present in how skills load context lazily. The main gap relative to the state of the art is automated relevance scoring beyond scope+confidence (e.g., semantic similarity to the current task).

## Findings

### Internal

- **Heuristics store with budget-capped retrieval.** `lib/heuristics.mjs` implements a full heuristic lifecycle: read, write, promote, demote, archive, and contradiction tracking. The `retrieveHeuristics(projectRoot, module, { injectionLimit })` function (line 1036) performs dual-read (module-scoped + global), deduplication, confidence-based filtering (excludes `low`), and a budget cap that splits the limit into 5/8 high-confidence and 3/8 medium-confidence slots. Default limit is 8 entries. (`lib/heuristics.mjs:1036-1106`)

- **Configurable injection limit in manifest.** Skills read `heuristics.injection_limit` from `manifest.yaml` to cap how many heuristics are injected into context packets. Both `/adev:plan` (line 258) and `/adev:implement` (line 48-56) load heuristics as an explicitly non-blocking step -- if retrieval fails or returns empty, the skill proceeds without them. (`skills/plan/SKILL.md:258`, `skills/implement/SKILL.md:48-56`)

- **Rendered heuristics are compact.** `renderHeuristic()` (line 1114) produces a 3-4 line markdown block per heuristic (title, pattern, anti-pattern, evidence count), keeping token cost per injected heuristic very low -- roughly 30-50 tokens each. (`lib/heuristics.mjs:1114-1125`)

- **Confidence-ranked sorting with scope priority.** Retrieval sorts by confidence DESC, then scope priority (module-scoped wins over global), then recency. This is a form of relevance scoring -- higher-confidence, more-specific, more-recent heuristics surface first. (`lib/heuristics.mjs:1076-1085`)

- **Prior research on self-learning agents.** The existing research artifact `.context-index/research/self-learning-agents.md` (2026-04-08) found that heuristic extraction (ERL pattern) yields +7.8% success rate over baselines, and that "what we learned" is more valuable than "what happened" for context injection. This directly validates the heuristic-over-trajectory approach already used. (`self-learning-agents.md`)

- **Learn skill for explicit capture.** `/adev:learn` provides user-driven heuristic capture with duplicate detection, scope assignment, and confirmation before writing. Auto-extraction happens via `/adev:validate` Check 12 on first-run PASS. (`skills/learn/SKILL.md`, `skills/validate/SKILL.md:376-452`)

### Web

- **Cursor's modular rules architecture.** Cursor has evolved from a single `.cursorrules` file to `.cursor/rules/*.mdc` files with frontmatter-based glob scoping. Rules are only loaded when relevant to the active file, implementing progressive disclosure at the rule level. Recommended size is 1000-2500 words per rule, with 5-8 rules total. This is the "token tax" approach: each rule consumes tokens, so you scope narrowly to minimize waste. ([Peakvance on Medium](https://medium.com/@peakvance/guide-to-cursor-rules-engineering-context-speed-and-the-token-tax-16c0560a686a), [Cursor Rules 5-Level System](https://medium.com/@vibecodingdirectory/how-to-structure-cursor-rules-in-2026-the-5-level-system-cursor-rules-eaf0df16e8e7))

- **Windsurf Cascade memories.** Windsurf stores auto-generated memories per workspace in `~/.codeium/windsurf/memories/`. Memories are workspace-scoped (not global) and can be auto-generated or manually created. The system distinguishes between ephemeral conversation context and persisted memories, implementing a two-tier model. ([Windsurf docs](https://docs.windsurf.com/windsurf/cascade/memories))

- **Cline Memory Bank.** Cline uses a flowchart-driven approach with Mermaid diagrams as "rules" and markdown files as the knowledge store. The Memory Bank operates at two levels: visual flowcharts teach the AI how to maintain documentation, while markdown files hold actual project knowledge. This is a "structured documentation" approach rather than a retrieval approach. ([Cline blog](https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets))

- **Aider's repo map as compressed context.** Aider generates a compressed repository map (file names, function signatures, class definitions) that fits within the context window, giving the LLM a bird's-eye view without consuming the full codebase budget. The `--map-tokens` flag lets users control how much of the context budget the repo map consumes (default varies by model capability). ([Aider docs](https://aider.chat/docs/faq.html))

- **Claude Code's CLAUDE.md and auto-compact.** Claude Code loads CLAUDE.md files into context at session start (user context, not system prompt). When context exceeds 95% capacity, auto-compact summarizes the full interaction trajectory. The memory is file-based (no vector DB), fully inspectable and version-controllable. ([Claude Code docs](https://code.claude.com/docs/en/memory))

- **Progressive disclosure as a formal pattern.** The pattern has been formalized in context engineering literature: Layer 1 (Index) shows lightweight metadata; Layer 2 (Details) fetches full content on demand; Layer 3 (Deep Dive) reads source files only if needed. Every token in the context window competes for attention, and as context grows, precision drops. ([MindStudio blog](https://www.mindstudio.ai/blog/progressive-disclosure-ai-agents-context-management), [Skills and progressive disclosure](https://marcelcastrobr.github.io/posts/2026-01-29-Skills-Context-Engineering.html))

- **Anthropic's context engineering guidance.** Anthropic's engineering blog emphasizes "just in time" context loading -- the model writes targeted queries, stores results, and uses selective reads rather than loading full data objects. The principle: find the smallest possible set of high-signal tokens that maximize the likelihood of a desired outcome. ([Anthropic engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

- **OpenMemory MCP for cross-client memory.** Mem0's OpenMemory MCP enables persistent memory across MCP-compatible clients (Cursor, Claude Desktop, Windsurf, Cline), providing a client-agnostic memory layer without repository pollution. ([Mem0 blog](https://mem0.ai/blog/introducing-openmemory-mcp))

- **Retrieval strategies converging on hybrid approaches.** Production systems combine semantic search, recency weighting, relevance scoring, and explicit scope filtering. Code agents use AST parsing, grep/file search, knowledge graph retrieval, and re-ranking steps. Pure embedding search becomes unreliable at scale, requiring combination techniques. ([LangChain context engineering](https://blog.langchain.com/context-engineering-for-agents/), [Context engineering for agents](https://rlancemartin.github.io/2025/06/23/context_engineering/))

- **Letta's context repositories.** Letta stores agent context as files in the local filesystem, letting agents leverage terminal and coding capabilities to manage their own context -- including progressive disclosure and rewriting context for learning. ([Letta blog](https://www.letta.com/blog/context-repositories))

## Code Examples

```javascript
// Example: Budget-capped heuristic retrieval with confidence-based slot allocation
// Source: lib/heuristics.mjs:1036-1106 (adev-plugin)
//
// Key pattern: Split injection budget into confidence tiers (5/8 high, 3/8 medium)
// Low-confidence heuristics are never injected (noise reduction)
// Module-scoped entries take priority over global ones (relevance via scope)

export async function retrieveHeuristics(projectRoot, module, { injectionLimit } = {}) {
  let limit = 8; // default budget cap
  if (injectionLimit !== undefined) {
    const parsed = Number(injectionLimit);
    if (Number.isInteger(parsed) && parsed >= 0) limit = parsed;
  }
  if (limit === 0) return [];

  // Dual-read: module-scoped + global, module wins dedup
  const moduleEntries = await readHeuristics(projectRoot, { module });
  const globalEntries = await readHeuristics(projectRoot, { module: "_global" });

  // Budget cap: exclude low, split high/medium
  const highMax = Math.ceil(limit * 5 / 8);
  const mediumMax = limit - highMax;
  // ... sort by confidence DESC, scope priority ASC, recency DESC
}
```

```markdown
# Example: Cursor .mdc rule with glob scoping (progressive disclosure)
# Source: https://medium.com/@vibecodingdirectory/how-to-structure-cursor-rules-in-2026

---
description: React component patterns
globs: ["src/components/**/*.tsx", "src/components/**/*.ts"]
alwaysApply: false
---

Use functional components with hooks. Prefer composition over inheritance.
Export components as named exports, not default exports.
```

```markdown
# Example: Compact heuristic rendering for context injection
# Source: lib/heuristics.mjs:1114-1125 (adev-plugin)
# ~30-50 tokens per heuristic -- very token-efficient

### Heuristic: Always verify config after edit (confidence: high)
- **Pattern:** After editing settings.json, run /config validate
- **Anti-pattern:** Assume edit is valid without verification
- **Evidence:** 2 observations
```

## Recommendations

1. **Adopt semantic relevance scoring for heuristic retrieval.** The current retrieval ranks by confidence + scope + recency, which is effective but does not consider semantic similarity to the current task. Adding keyword or embedding-based matching between the task description and heuristic `pattern`/`title` fields would improve precision. This aligns with constitution principle 1 (minimize external dependencies) only if done via keyword matching rather than adding an embedding library. A lightweight TF-IDF or BM25 approach using Node.js built-ins is feasible.

2. **Implement progressive disclosure for heuristics.** Currently, all qualifying heuristics are rendered at injection time. A two-tier approach -- inject only titles/patterns first, then let the agent request full details for relevant ones -- would reduce baseline token cost. This mirrors the Cursor `.mdc` glob-scoping pattern and the formal progressive disclosure literature. Aligns with principle 2 (skills are primarily markdown) since the rendering format is already markdown.

3. **Add task-context matching to the retrieval pipeline.** Pass the current task description or spec title into `retrieveHeuristics` and use it to re-rank results. This bridges the gap between scope-based filtering (broad) and semantic matching (precise). The `renderHeuristic` function is already compact enough that this would not significantly increase implementation complexity.

4. **Consider token-budget awareness rather than count-budget.** The current `injectionLimit` caps by count (default 8). A token-budget cap (e.g., "inject up to 400 tokens of heuristics") would adapt to heuristic size variation. This is especially relevant as heuristics accumulate -- some are terse (30 tokens) while others may approach the 500-char pattern limit (~100 tokens).

5. **Do not add a vector database or external embedding service.** The state of the art shows that production coding agents (Cursor, Claude Code, Aider) all use file-based, inspectable memory rather than vector stores. This validates the constitution's "minimize external dependencies" principle. Hybrid retrieval (scope + keyword + recency) is sufficient for the expected heuristic store size (tens to low hundreds of entries).

6. **Study Cursor's glob-based rule activation for skill context.** The `.mdc` frontmatter approach (rules activate based on which files are open/touched) is directly applicable to adev's skill system. Skills could declare activation patterns that control which heuristics, samples, or context artifacts are loaded, reducing the "always-on" token tax.

## References

### Internal Files
- `lib/heuristics.mjs` -- Heuristic store with budget-capped retrieval, confidence ranking, and scope-aware deduplication
- `skills/plan/SKILL.md` -- Heuristic injection into planning context packets (Step 2, item 12)
- `skills/implement/SKILL.md` -- Heuristic injection into implementation context packets (Step 1, item 11)
- `skills/learn/SKILL.md` -- User-driven heuristic capture skill
- `skills/validate/SKILL.md` -- Auto-extraction of heuristics on first-run PASS (Check 12)
- `.context-index/research/self-learning-agents.md` -- Prior research on ERL, Reflexion, and heuristic extraction patterns
- `tests/skills/plan-heuristic-injection.test.mjs` -- Tests verifying heuristic injection in plan skill
- `tests/skills/implement-heuristic-injection.test.mjs` -- Tests verifying heuristic injection in implement skill
- `tests/lib/heuristics.test.mjs` -- Unit tests for heuristics module

### Web Sources
- [Cursor Rules Token Tax](https://medium.com/@peakvance/guide-to-cursor-rules-engineering-context-speed-and-the-token-tax-16c0560a686a) -- Cursor's modular rules and token efficiency
- [Cursor 5-Level System](https://medium.com/@vibecodingdirectory/how-to-structure-cursor-rules-in-2026-the-5-level-system-cursor-rules-eaf0df16e8e7) -- Glob-scoped .mdc rule files
- [Windsurf Cascade Memories](https://docs.windsurf.com/windsurf/cascade/memories) -- Workspace-scoped auto-generated memories
- [Cline Memory Bank](https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets) -- Flowchart-driven memory with Mermaid diagrams
- [Aider FAQ on Repo Map](https://aider.chat/docs/faq.html) -- Compressed repo map for context-efficient codebase awareness
- [Claude Code Memory](https://code.claude.com/docs/en/memory) -- CLAUDE.md file-based memory with auto-compact
- [MindStudio Progressive Disclosure](https://www.mindstudio.ai/blog/progressive-disclosure-ai-agents-context-management) -- Three-tier progressive disclosure pattern
- [Skills and Progressive Disclosure](https://marcelcastrobr.github.io/posts/2026-01-29-Skills-Context-Engineering.html) -- Skills as progressive disclosure in context engineering
- [Anthropic Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) -- Just-in-time context loading principles
- [OpenMemory MCP](https://mem0.ai/blog/introducing-openmemory-mcp) -- Cross-client persistent memory via MCP
- [LangChain Context Engineering](https://blog.langchain.com/context-engineering-for-agents/) -- Hybrid retrieval strategies for agents
- [Context Engineering for Agents](https://rlancemartin.github.io/2025/06/23/context_engineering/) -- Comprehensive overview of context engineering patterns
- [Letta Context Repositories](https://www.letta.com/blog/context-repositories) -- Git-based memory with agent-managed progressive disclosure
- [State of Context Engineering 2026](https://www.newsletter.swirlai.com/p/state-of-context-engineering-in-2026) -- Survey of current approaches

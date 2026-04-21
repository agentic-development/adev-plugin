---
topic: Self-Learning Agents — State of the Art and Gap Analysis
date: 2026-04-08
relates-to: []
sources: [internal, web]
status: complete
---

# Self-Learning Agents — State of the Art and Gap Analysis

## Summary

The field of self-learning AI agents has rapidly matured in 2025-2026, converging on a four-type memory taxonomy (working, episodic, semantic, procedural) and several distinct self-improvement paradigms: verbal reinforcement (Reflexion), experiential heuristic extraction (ERL/ExpeL), skill libraries (Voyager), and recursive research loops (Karpathy's autoresearch). adev-plugin already covers episodic and procedural memory well through session logging and wiki-style artifacts, but has significant gaps in **semantic memory** (learnings/heuristics) and **experiential reflection** (distilling past trajectories into reusable guidance). The highest-impact improvements involve adding a heuristic extraction loop and a structured learnings store — not more logging.

## Findings

### External — Key Paradigms for Self-Learning Agents

#### 1. Karpathy's AutoResearch: Recursive Experiment Loops

Karpathy's [autoresearch](https://github.com/karpathy/autoresearch) (March 2026) demonstrates an autonomous agent running 700 ML experiments over 2 days, discovering 20 optimizations. The loop: **Literature → Hypothesis → Code → Execute → Analyze → Iterate**. The agent doesn't just log results — it synthesizes findings into hypotheses that guide the next cycle.

Separately, Karpathy has shifted to using LLMs as **knowledge organizers**: dumping raw materials into a folder and having the LLM build and maintain an interlinked wiki with backlinks, categorization, and continuous updates. This maps closely to adev-plugin's `.context-index/` approach.

**Key insight**: The wiki is necessary but insufficient. Autoresearch adds an *active* feedback loop — the agent doesn't just record what happened, it extracts **why** things worked and uses that to change future behavior.

#### 2. Reflexion: Verbal Reinforcement Learning

[Reflexion](https://arxiv.org/abs/2303.11366) (Shinn et al.) stores natural language reflections about failures in an episodic memory buffer. On the next attempt, these reflections are injected into context. No weight updates — just text.

**Limitation**: Single-agent reflexion suffers from confirmation bias — the same model generates actions, evaluates them, and reflects. [MAR (Multi-Agent Reflexion)](https://arxiv.org/html/2512.20845) addresses this with diverse critic personas.

**Relevance to adev**: adev's `/adev:recover` already classifies failure root causes into 6 categories and writes recovery records. This is structurally similar to Reflexion, but the records aren't systematically re-injected into future task contexts.

#### 3. Experiential Reflective Learning (ERL): Heuristic Extraction

[ERL](https://arxiv.org/abs/2603.24639) (March 2026) reflects on task trajectories to generate **heuristics** — transferable lessons that apply across tasks, not just replays of past experiences. At test time, relevant heuristics are retrieved and injected. On Gaia2 benchmark: **+7.8% success rate** over ReAct baseline.

Critical distinction: **heuristics > few-shot trajectories**. Storing "what happened" (episodic) is less valuable than storing "what we learned" (semantic/heuristic).

#### 4. ExpeL: Experiential Learning

[ExpeL](https://arxiv.org/html/2308.10144) processes past trajectories to generate insights and rules. The agent accumulates a growing library of extracted principles that guide future interactions, similar to ERL but with a focus on rule extraction.

#### 5. Voyager: Skill Libraries

[Voyager](https://openreview.net/forum?id=ehfRiF0R3a) (Minecraft agent) maintains an ever-growing **skill library** of executable code. When facing a new situation, it retrieves similar past skills and adapts them. Three components: automatic curriculum, skill library, iterative prompting with environment feedback.

**Relevance to adev**: adev's `/adev:sample` (golden samples) is analogous to Voyager's skill library — curated reference implementations indexed by pattern.

#### 6. Nakajima (BabyAGI): Experience Layer Architecture

[Yohei Nakajima](https://yoheinakajima.com/better-ways-to-build-self-improving-ai-agents/) recommends a progression:
1. **Start with**: In-loop reflection + self-generated exemplars (cheap wins)
2. **Then add**: Self-training on verified traces (where correctness signal exists)
3. **Then add**: Persistent skill/policy representations the agent can rewrite

Safety guardrails: conservative acceptance criteria, diversity mechanisms to prevent echo chambers, human oversight at self-modification boundaries.

#### 7. Memory Taxonomy (Consensus 2026)

From [Memory in the Age of AI Agents](https://arxiv.org/abs/2512.13564) and [Anatomy of Agentic Memory](https://arxiv.org/html/2602.19320v1):

| Memory Type | Cognitive Analog | Function | Persistence |
|-------------|-----------------|----------|-------------|
| **Working** | Short-term | Current task context | Session only |
| **Episodic** | Autobiographical | What happened | Cross-session |
| **Semantic** | Knowledge/facts | What we learned | Permanent |
| **Procedural** | Skills/habits | How to do things | Permanent |

#### 8. Letta Code: Memory-First Architecture

[Letta Code](https://www.letta.com/blog/letta-code) implements an OS-inspired three-tier model:
- **Core memory** (RAM): always in-context, self-editable
- **Archival memory** (disk): vector store, queried explicitly
- **Recall memory** (history): conversation logs, searchable

Key finding: On LoCoMo benchmark, **a simple filesystem-based agent scored 74%**, beating mem0's graph variant (68.5%). File-based approaches are competitive.

#### 9. Claude Code Native Memory

Claude Code's [built-in memory](https://code.claude.com/docs/en/memory) has two layers:
- **CLAUDE.md**: manual project instructions
- **Auto memory**: agent-written notes from user corrections

[claude-mem](https://github.com/thedotmack/claude-mem) (46K+ stars) extends this with lifecycle hooks that capture session data and inject it into future sessions.

### Internal — What adev-plugin Already Has

| Memory Type | adev Coverage | Mechanism |
|-------------|--------------|-----------|
| **Working** | ✅ Full | Session context + constitution injection |
| **Episodic** | ✅ Strong | 70+ session summaries, JSONL tracking, recovery records |
| **Semantic** | ⚠️ Partial | Constitution + specs (but no learnings/heuristics store) |
| **Procedural** | ✅ Strong | Skills (markdown), golden samples, plans |
| **Reflective** | ⚠️ Weak | Recovery records capture failures but aren't re-injected; no heuristic extraction |

**What works well:**
- Session logging pipeline (hooks → JSONL → markdown summaries)
- Wiki-style artifacts (constitution, specs, ADRs, charters, plans)
- Recovery classification (6-category taxonomy in `/adev:recover`)
- Drift detection (`/adev:hygiene`)
- Retrospective analysis (`/adev:retro`)

**What's missing:**
1. No **heuristic extraction** — recovery records and session summaries are stored but never distilled into reusable guidance
2. No **re-injection loop** — past learnings don't flow back into future task contexts
3. No **positive pattern capture** — only failures are recorded (via recover), not successes
4. No **mid-session state** — sessions are post-hoc snapshots, not live state

## Comparison: adev-plugin vs. Key Approaches

| Capability | adev-plugin | Reflexion | ERL | Voyager | Letta | AutoResearch |
|-----------|------------|-----------|-----|---------|-------|-------------|
| Episode logging | ✅ Rich | ✅ Trajectory | ✅ Trajectory | ✅ Skill attempts | ✅ Recall memory | ✅ Experiment logs |
| Failure analysis | ✅ 6-category | ✅ Reflection | ✅ Reflection | ❌ | ❌ | ✅ Analysis |
| Heuristic extraction | ❌ | ✅ Verbal | ✅ Core method | ❌ | ❌ | ✅ Hypotheses |
| Re-injection into context | ❌ | ✅ Core method | ✅ Retrieval | ✅ Skill retrieval | ✅ Core memory | ✅ Iteration |
| Positive pattern capture | ❌ | ❌ | ✅ | ✅ Skill library | ✅ Archival | ✅ |
| Skill/sample library | ✅ Golden samples | ❌ | ❌ | ✅ Core method | ❌ | ❌ |
| Drift detection | ✅ Unique | ❌ | ❌ | ❌ | ❌ | ❌ |
| Human-readable storage | ✅ Markdown | N/A | N/A | ❌ Code | ❌ API | ❌ Code |

## Recommendations

### Priority 1: Heuristic Extraction Loop (the critical missing piece)

Add a **heuristic extraction step** to the existing recover/retro cycle. This is the single highest-impact change — it closes the gap between "we record what happened" and "we learn from what happened."

**Mechanism:**
```
Task completes → Extract heuristics → Store in .context-index/memory/heuristics.md →
Future task starts → Retrieve relevant heuristics → Inject into context packet
```

**Heuristic format:**
```markdown
## [module-slug] YYYY-MM-DD — <one-line title>
- **Pattern**: <what works / what to avoid>
- **Evidence**: <link to session, recovery record, or validation report>
- **Scope**: <which modules/tasks this applies to>
- **Confidence**: high | medium | low
```

**Where extraction happens:**
- `/adev:recover` — extract from failure diagnosis (already captures root cause)
- `/adev:validate` — extract from validation results (pass patterns, not just failures)
- `/adev:retro` — consolidate, merge duplicates, prune stale heuristics

**Where injection happens:**
- `/adev:implement` Step 1 (context loading) — retrieve heuristics matching the target module
- `/adev:plan` — include relevant heuristics in context packets
- `/adev:debug` — check heuristics for known patterns before investigating

### Priority 2: Positive Pattern Capture

Currently only failures go through `/adev:recover`. Add an opt-in success signal:

- When `/adev:validate` passes all 11 checks on first run, auto-extract what made it work
- When `/adev:implement` completes a task with no recovery needed, note the approach
- Feed these into the heuristics store with `confidence: high`

This prevents the "loss-aversion bias" that Nakajima warns about — agents that only learn from failures become overly cautious.

### Priority 3: Learnings Re-injection in `/adev:work`

`/adev:work` already reads session summaries. Extend it to:
1. Read `.context-index/memory/heuristics.md`
2. Filter by module relevance (match against manifest modules)
3. Surface top 3-5 relevant heuristics in session start context
4. Format: "Past learnings for [module]: ..."

### Priority 4: Consolidation Cycle

Add consolidation to `/adev:retro`:
- Merge similar heuristics
- Promote `medium` → `high` confidence when pattern recurs
- Demote or remove heuristics contradicted by recent evidence
- Cap total heuristics at ~50 to prevent context bloat
- Archive removed heuristics to `.context-index/memory/archive/`

### Priority 5: Multi-Agent Reflection (Future)

Following MAR's approach, use specialist subagents for reflection:
- Implementation specialist reflects on code quality patterns
- Security specialist reflects on vulnerability patterns
- Architecture specialist reflects on design patterns
- Each writes heuristics scoped to their domain

### Not Recommended (Yet)

- **Vector embeddings / semantic search**: File-based approaches score competitively (Letta benchmark: 74% vs 68.5%). The complexity isn't justified until the heuristic store exceeds ~200 entries.
- **Weight fine-tuning**: Not feasible with API-based models. Verbal reinforcement (heuristic injection) achieves comparable results without it.
- **Real-time memory updates**: Session-granularity is sufficient for software development. Per-turn updates add complexity without proportional value.

## Key Insight

**Session logging and wiki artifacts are necessary but not sufficient.** They give agents episodic and procedural memory — what happened and how to do things. What's missing is **semantic memory** — distilled learnings that transfer across tasks. The research consensus (ERL, ExpeL, Nakajima) is clear: **extracting heuristics from experience trajectories and re-injecting them into future contexts is the highest-leverage intervention**. adev-plugin has all the raw materials (recovery records, validation reports, session summaries) — it just needs the extraction and re-injection loop.

## References

- [Karpathy AutoResearch — GitHub](https://github.com/karpathy/autoresearch)
- [Karpathy on Code Agents and Self-Improvement — NextBigFuture](https://www.nextbigfuture.com/2026/03/andrej-karpathy-on-code-agents-autoresearch-and-the-self-improvement-loopy-era-of-ai.html)
- [Karpathy's Second Brain Approach — Medium](https://medium.com/neuralnotions/andrej-karpathy-stopped-using-ai-to-write-code-hes-using-it-to-build-a-second-brain-instead-cddceadc5df5)
- [Reflexion: Language Agents with Verbal Reinforcement Learning — arXiv 2303.11366](https://arxiv.org/abs/2303.11366)
- [Experiential Reflective Learning (ERL) — arXiv 2603.24639](https://arxiv.org/abs/2603.24639)
- [ExpeL: LLM Agents Are Experiential Learners — arXiv 2308.10144](https://arxiv.org/html/2308.10144)
- [MAR: Multi-Agent Reflexion — arXiv 2512.20845](https://arxiv.org/html/2512.20845)
- [Voyager: Open-Ended Embodied Agent — OpenReview](https://openreview.net/forum?id=ehfRiF0R3a)
- [Nakajima: Better Ways to Build Self-Improving Agents](https://yoheinakajima.com/better-ways-to-build-self-improving-ai-agents/)
- [Memory in the Age of AI Agents — arXiv 2512.13564](https://arxiv.org/abs/2512.13564)
- [Anatomy of Agentic Memory — arXiv 2602.19320](https://arxiv.org/html/2602.19320v1)
- [Letta Code: Memory-First Coding Agent](https://www.letta.com/blog/letta-code)
- [Claude Code Memory Docs](https://code.claude.com/docs/en/memory)
- [claude-mem Plugin — GitHub](https://github.com/thedotmack/claude-mem)
- [AI Agent Memory Frameworks 2026 — MachineLearningMastery](https://machinelearningmastery.com/the-6-best-ai-agent-memory-frameworks-you-should-try-in-2026/)
- [Memory for AI Agents — The New Stack](https://thenewstack.io/memory-for-ai-agents-a-new-paradigm-of-context-engineering/)
- [Self-Evolving Agents Survey — arXiv 2507.21046](https://arxiv.org/html/2507.21046v4)
- [adev-plugin Prior Research: Shared Session Memory](.context-index/research/shared-session-memory.md)

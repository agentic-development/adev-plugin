---
topic: Shared Memory Between AI Coding Sessions
date: 2026-04-06
relates-to: [skills/start, skills/implement, skills/status, lib/session-summary.mjs]
sources: [internal, web]
status: complete
---

# Shared Memory Between AI Coding Sessions

## Summary

AI coding assistants need persistent context across sessions to avoid re-discovery of project state, resume interrupted work, and accumulate learnings. This research compares what adev-plugin already provides against industry approaches (Claude Code native, Cursor, Replit Agent, mem0, Letta/MemGPT, LangChain) and identifies gaps with concrete recommendations.

## Findings

### What adev-plugin Already Does

adev-plugin has a rich but **fragmented** persistence layer spread across multiple subsystems:

| What Persists | Location | Written By | Read By |
|---------------|----------|------------|---------|
| Session snapshots | `.context-index/sessions/*.md` | `session-capture.sh` hook (post-commit) | `/adev:start`, `/adev:status` |
| Constitution (principles) | `.context-index/constitution.md` | Manual / `/adev:init` | Every skill (via CLAUDE.md injection) |
| Manifest (project topology) | `.context-index/manifest.yaml` | Manual / `/adev:init` | Skills for routing, scoping, backend config |
| Specs with status gates | `.context-index/specs/features/*/` | `/adev:specify`, `/adev:review-specs` | `/adev:plan`, `/adev:implement`, `/adev:validate` |
| Plans with task checkboxes | `.context-index/specs/**/*.plan.md` | `/adev:plan` | `/adev:implement`, `/adev:start` |
| Issue board | `.context-index/tasks/tasks.md` | `/adev:issues`, `/adev:plan`, `/adev:implement` | `/adev:status`, `/adev:start` |
| Active plan pointer | `.context-index/hygiene/.active-plan` | `/adev:implement` (start) | Scope guard hooks |
| Drift reports | `.context-index/hygiene/drift-report.md` | `/adev:hygiene` | `/adev:retro` |
| Blockers | `.context-index/hygiene/blockers/*.md` | `/adev:implement` (on failure) | `/adev:recover` |
| Session-start context | `skills/using-adev/SKILL.md` | Manual | `session-start.sh` hook (injected every session) |

**Strengths:**
- Everything is markdown/YAML, human-readable, git-tracked
- Explicit status gates on specs prevent premature downstream work
- Session summaries provide historical context for `/adev:start`
- Constitution sync ensures all agent surfaces get the same rules

### Industry Approaches

#### Memory Taxonomy (from arXiv 2512.13564)

| Type | Description | adev-plugin Equivalent |
|------|-------------|----------------------|
| **Working** | Current conversation context | Session context window |
| **Episodic** | What happened in past sessions | `.context-index/sessions/*.md` |
| **Semantic** | Facts and patterns learned | Constitution + specs (partial) |
| **Procedural** | How to do things | Skills themselves (markdown instructions) |

#### Claude Code Native (v2.1.30+)

Three-layer system:
1. **CLAUDE.md** — manual project instructions, loaded every session
2. **Auto memory** — agent-written preferences from user corrections (`/memory`)
3. **Session memory** — automatic summaries at `~/.claude/projects/<hash>/session-memory/summary.md`, extracted every ~5K tokens

Key insight: All plain markdown files on disk. No databases.

#### Cursor

- "Memories" persist across conversations
- Can pin directories/files/repos as persistent context
- `.cursorrules` for project instructions (analogous to CLAUDE.md)

#### Replit Agent

- `.replit-agent/memory.md` — human-readable file with current task, blockers, learnings, next steps
- Updated per-session, persisted to git
- Agent reads it on startup for continuity

#### Letta (MemGPT)

Three-tier OS-inspired model:
- **Core memory** — always in-context, self-editable by agent (like RAM)
- **Archival memory** — external searchable store (like disk)
- **Recall memory** — conversation history

Benchmark result: A simple filesystem-based agent scored 74% on LoCoMo, beating Mem0's graph variant (68.5%). **File-based approaches are competitive.**

#### mem0

- Three scopes: user, session, agent
- Hybrid store: vectors + graph + key-value
- Priority scoring and decay to prevent bloat
- ~48K GitHub stars

#### LangChain Memory Modules

- `ConversationBufferMemory` — full history (simple, expensive)
- `ConversationSummaryMemory` — LLM summarizes before passing
- `ConversationSummaryBufferMemory` — recent verbatim + older summarized (hybrid)

### Comparison Matrix

| Aspect | adev-plugin | Claude Code Native | Replit Agent | Letta | AutoGPT/LangChain |
|--------|------------|-------------------|--------------|-------|-------------------|
| State persistence | Specs + plans + issues | CLAUDE.md + session memory | Memory file | Core + archival | Step logs + vector DB |
| Resume capability | From last committed spec | From session summary | From memory file | From core memory state | From last step state |
| Mid-task resume | No (commit-based checkpoints) | No | Yes (memory file) | Yes (core memory) | Yes (step state) |
| Drift detection | `/adev:hygiene` | None | None | None | None |
| Learnings captured | Recovery patterns only | Auto memory (corrections) | In memory file | In archival memory | In semantic memory |
| Human-readable | Yes (markdown) | Yes (markdown) | Yes (markdown) | No (API) | Partial (logs) |

### Gaps in adev-plugin

1. **No mid-task execution state** — `.active-plan` is a pointer, not a state dump. If a session ends mid-task, the next session can't query "task 3 is 50% done, 2/3 tests passing, blocked on mocking."

2. **Sessions are post-hoc snapshots** — Written after `git commit`, not during execution. No live state between commits.

3. **No "learnings" memory** — Recovery reports capture failures, but there's no place for positive learnings: "Pattern X works well here", "Module Y is sensitive to Z."

4. **No automatic context freshness** — Specs have timestamps but no hash-based staleness detection. Drift is reported by `/adev:hygiene`, not enforced at skill startup.

5. **No session-to-issue binding** — No explicit "this session is working on issue-7." The `.active-plan` file is the closest proxy.

## Recommendations

### Tier 1: Lightweight (no new dependencies, markdown-only)

**1. Execution State File** — `.context-index/hygiene/.execution-state.md`
```markdown
---
plan: .context-index/specs/features/auth/login-flow.plan.md
task: 3
issue: issue-7
status: in_progress
started: 2026-04-06T14:30:00Z
---
## Progress
- [x] Test: form renders with email and password fields
- [x] Test: form validates required fields
- [ ] Impl: LoginForm component
## Blockers
None
## Next Action
Write LoginForm component following spec section 2.3
```
- Written by `/adev:implement` per task start, updated per subtask
- Read by `/adev:start` to detect and offer resumption
- Cleared on task/plan completion

**2. Session-Start Resume Injection**
- Extend `session-start.sh` to read `.execution-state.md`
- If in-progress work exists, inject into session context:
  > "Resuming: Task 3 of 'login-flow.plan.md' — 50% complete, next: write LoginForm component"

**3. Learnings File** — `.context-index/memory/learnings.md`
```markdown
## 2026-04-06 — auth module
- Pattern: Form validation logic should live in a shared hook, not per-component
- Dead end: Tried inline validation with HTML5 attrs — insufficient for async rules
- Risk: Auth module has no integration tests for OAuth flow
```
- Skills append learnings during execution (opt-in, not mandatory)
- `/adev:start` surfaces recent learnings for the relevant module
- `/adev:retro` consolidates and prunes periodically

**4. Context Freshness Hash**
- Add `source-hash: <sha256>` to spec frontmatter (hash of implementation files)
- On skill startup, compare hash against current file state
- If stale, warn: "Spec may be out of sync. Run `/adev:validate` to refresh."

### Tier 2: Structured Enhancement

**5. Session-Issue Binding**
- When `/adev:implement` starts a task, write the issue ID to `.execution-state.md`
- `/adev:start` can then say: "You were working on issue-7 (LoginForm component)"
- `/adev:status --current` shows the bound issue

**6. Memory Consolidation Skill** — `/adev:remember`
- Periodic consolidation of learnings, session summaries, and recovery patterns
- Merges related entries, resolves conflicts, prunes stale items
- Outputs to `.context-index/memory/consolidated.md`
- Could be triggered by `/adev:retro` or run standalone

### Tier 3: Advanced (optional, future)

**7. Semantic Memory Index**
- Embed specs, charters, ADRs, learnings into a lightweight vector index
- On task start, retrieve "similar past tasks" and their learnings
- Enables pattern recognition across projects
- Would require a dependency (e.g., local embedding model) — needs ADR per constitution

## Key Insight

Letta's benchmark validates the adev-plugin philosophy: **a filesystem-based approach with structured markdown scores competitively against specialized memory frameworks** (74% vs 68.5% on LoCoMo). The gap isn't in storage format — it's in **when** state is captured (post-commit vs per-turn) and **what** is captured (artifacts only vs artifacts + learnings + execution state).

The highest-impact change is Tier 1, item 1: an execution state file that bridges the gap between Git's commit-based checkpoints and interactive session continuity.

## References

- [Claude Code Memory Docs](https://code.claude.com/docs/en/memory)
- [Claude Code Session Memory](https://claudefa.st/blog/guide/mechanics/session-memory)
- [Memory in the Age of AI Agents — arXiv 2512.13564](https://arxiv.org/abs/2512.13564)
- [Letta Benchmark: Is a Filesystem All You Need?](https://www.letta.com/blog/benchmarking-ai-agent-memory)
- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [Claude-Mem GitHub](https://github.com/thedotmack/claude-mem)
- [Graphiti — Temporal Knowledge Graphs](https://github.com/getzep/graphiti)
- [Persistent Memory Compromise in Claude Code — Cisco](https://blogs.cisco.com/ai/identifying-and-remediating-a-persistent-memory-compromise-in-claude-code)

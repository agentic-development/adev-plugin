---
topic: "New versions of major orchestration tools for ideas on new features or improvements"
date: "2026-05-02"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

## Summary

The AI agent orchestration landscape in 2026 has consolidated around a few major paradigms: spec-driven development (SpecKit, Kiro), structured skills frameworks (Superpowers, adev), role-based team orchestration (gstack), and context-phase isolation (GSD). Key innovations across these tools include agent teams with peer-to-peer coordination, visual brainstorming, configurable agent hooks triggered by file events, living specs that auto-sync with code, and wave-based parallelism. Several of these ideas represent actionable improvement opportunities for adev-plugin without violating its constitutional principles.

## Findings

### Internal

- **adev already has the most comprehensive lifecycle coverage.** The skill set spans 30+ skills covering brainstorm, specify, review-specs, plan, route, implement, validate, debug, recover, research, build, hygiene, retro, reconcile, status, issues, codehealth, repomap, sample, document, eval, learn, assess, sync, and work triage. No competing tool covers this breadth. (`skills/` directory listing)
- **Multi-repo workspace support is already in progress.** The `multi-repo-workspace` charter has 10+ specs covering foundation, context resolution, cross-repo references, workspace-aware plan/implement/validate/build, dependency-aware planning, init, charters, and status. (`.context-index/specs/features/multi-repo-workspace/`)
- **Build orchestrator already implements subagent dispatch with context isolation.** Each pipeline step is dispatched as a fresh subagent via the Agent tool, ensuring no pseudo-invocation and clean context windows. (`skills/build/SKILL.md:75-79`)
- **Implement skill has sophisticated subagent orchestration.** Features specialist routing, TDD enforcement, 2-stage review (spec compliance + code quality), blocker flag protocol, escalation rules, and 4-status-code reporting (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED). (`skills/implement/SKILL.md:9-285`)
- **Progress tracking via TaskCreate/TaskUpdate is already implemented.** The implement skill creates tracking tasks per plan task for real-time visibility, with graceful degradation for non-Claude-Code environments. (`skills/implement/SKILL.md:130-145`)
- **Recovery workflow classifies 6 root cause categories.** MISSING_CONTEXT, UNCLEAR_SPEC, CONSTRAINT_CONFLICT, NO_PATTERN, TOOL_FAILURE, and SCOPE_OVERFLOW, with targeted corrective injection for each. (`skills/recover/SKILL.md:128-183`)
- **Workspace mode is being threaded through specify, status, and other skills** with isolation invariants ensuring workspace context never leaks into repo-level artifacts. (`skills/specify/SKILL.md:54-105`, `skills/status/SKILL.md:361-411`)

### Web

- **Superpowers v5 (March 2026) added visual brainstorming** -- HTML mockups rendered in-browser instead of ASCII diagrams. When design involves visual elements, the agent offers a "visual companion" before clarifying questions. adev's brainstorm skill currently produces text-only charters. ([Superpowers Complete Guide](https://www.pasqualepillitteri.it/en/news/215/superpowers-claude-code-complete-guide))
- **Superpowers supports multi-host portability.** The same skills directory powers Claude Code, Cursor, OpenAI Codex, GitHub Copilot CLI, Gemini CLI, and OpenCode. adev currently targets Claude Code primarily with partial multi-host support. ([Builder.io Guide](https://www.builder.io/blog/claude-code-superpowers-plugin))
- **GSD introduces context-phase isolation as a first-class concept.** Each phase (Plan, Execute, Verify) runs with a clean context window. Output from one phase feeds the next as a structured document, not as conversation history. This maps closely to adev's build orchestrator subagent dispatch model but GSD makes the context boundary explicit to the user. ([MindStudio GSD Guide](https://www.mindstudio.ai/blog/gsd-framework-claude-code-plan-build-applications))
- **gstack simulates a 15-person engineering org through role specialization.** Roles include CEO, eng manager, designer, QA lead, security officer, and release engineer, with structured decision chains where output from one role feeds the next. adev has specialist routing but not explicit role personas beyond the implementation domain. ([GitHub garrytan/gstack](https://github.com/garrytan/gstack))
- **gstack's Conductor enables parallel worktree orchestration.** A Mac application that runs multiple Claude Code instances in isolated Git worktrees, automating worktree creation, branching, and isolation. ([AgentConn Blog](https://agentconn.com/blog/gstack-claude-code-harness-open-source-2026/))
- **GitHub SpecKit provides cross-agent portability without vendor lock-in.** A standardized .specify directory with slash commands (/speckit.specify, /speckit.plan, /speckit.tasks, /speckit.implement) that work across Copilot, Claude Code, Gemini CLI, Cursor, and Windsurf. The format is deliberately minimal to maximize portability. ([GitHub Blog](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/))
- **Kiro treats specs as living documents that auto-sync with code.** Edits to the spec propagate into code changes through agent runs, and edits to code that drift from the spec trigger re-sync or spec update. This is bidirectional, unlike adev's current one-directional spec-to-code flow. ([Kiro.dev](https://kiro.dev/))
- **Kiro implements agent hooks triggered by file events.** Automated triggers execute predefined agent actions when files are saved, created, or deleted. This goes beyond adev's git-based hooks to file-system-event-driven automation. ([Kiro Documentation](https://aws.amazon.com/documentation-overview/kiro/))
- **Claude Code Agent Teams add coordination primitives.** Shared task list with dependency tracking, peer-to-peer messaging between teammates, and file locking to prevent conflicts. Communication via inbox files; agents bootstrap by self-assignment. ([Claude Code Docs](https://code.claude.com/docs/en/agent-teams))
- **Over 40% of agentic AI projects risk cancellation by 2027** without governance, observability, and ROI clarity. This validates adev's emphasis on lifecycle tracking, provenance, and structured artifacts. ([Vellum Blog](https://www.vellum.ai/blog/top-ai-agent-frameworks-for-developers))
- **Context engineering is the key differentiator.** Across all frameworks, the consensus is that structured context management (what information goes to which agent, when) matters more than the underlying model. "Less noise, better signal" -- each skill adding to context baseline means quality over quantity. ([Firecrawl Blog](https://www.firecrawl.dev/blog/best-claude-code-plugins))
- **Martin Fowler's analysis positions SDD tools on a spectrum.** Kiro is IDE-native with bidirectional sync, SpecKit is portable/minimal, and Tessl pushes toward spec-as-source where the spec IS the code. adev sits closest to the SpecKit model but with deeper lifecycle integration. ([Martin Fowler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html))

## Code Examples

No code examples extracted -- this research is about tool comparison and feature ideation rather than implementation patterns. Relevant architectural patterns are documented in the existing skill files referenced above.

## Recommendations

1. **Consider visual brainstorming for the brainstorm skill** -- Superpowers v5's in-browser HTML mockup generation during brainstorming has proven popular. adev's `adev:brainstorm` currently produces text-only charters. Adding an optional `--visual` flag that generates an HTML mockup alongside the charter would enhance design-phase output without changing the core workflow. This aligns with Principle 2 (skills are primarily markdown) since the visual artifact would be a companion output, not the skill itself. Constitution reference: Principle 2 (skills are primarily markdown -- companion outputs allowed).

2. **Explore bidirectional spec-code sync** -- Kiro's living specs that auto-sync with code changes represent the next evolution of spec-driven development. Currently adev has one-directional flow (spec drives code) and `/adev:hygiene` detects drift after the fact. A bidirectional watcher that detects code drift and prompts spec updates (or vice versa) would reduce manual reconciliation. This could be implemented as a hook triggered on relevant file changes. Constitution reference: Principle 4 (hook protocol compliance -- new hook type).

3. **Add parallel task execution to the build orchestrator** -- gstack's Conductor and Claude Code's Agent Teams both enable parallel worktree-based execution. adev's implement skill explicitly prohibits parallel subagent dispatch (to avoid file conflicts), but independent tasks targeting different modules could safely run in parallel using git worktrees for isolation. This is a significant architectural change that would require human approval per the constitution. Constitution reference: Architecture Boundaries (requires human approval for lifecycle order changes).

4. **Formalize role-based review personas** -- gstack's success with specialized roles (CEO review, eng manager review, security officer, QA lead) suggests value in formalizing review personas beyond the current spec reviewer and code quality reviewer in `/adev:implement`. The existing specialist routing infrastructure could be extended with persona-specific review prompts. Constitution reference: Autonomous (agent may decide -- editing skill markdown content).

5. **Improve multi-host portability** -- Both Superpowers and SpecKit have invested in cross-agent-host support (Cursor, Codex, Gemini CLI). adev already has multi-host considerations in implement (graceful degradation when TaskCreate is unavailable) but could formalize a portability layer. Constitution reference: Principle 2 (skills are markdown -- inherently portable if tool dependencies are abstracted).

6. **Add file-event hooks (Kiro-style)** -- adev's hooks currently trigger on git/tool events. Kiro's file-save/create/delete triggers enable proactive behaviors like auto-formatting, test generation on file creation, or spec-drift detection on file modification. This would require extending the hook protocol. Constitution reference: Architecture Boundaries (requires human approval for hook protocol changes).

7. **Surface context budget to the user** -- The consensus across all frameworks is that context engineering is the key differentiator. adev could add a context budget indicator to the status dashboard showing how much context each skill consumes, helping users understand token efficiency. This is a read-only enhancement to `/adev:status`. Constitution reference: Autonomous (agent may decide -- updating internal documentation and templates).

## References

### Internal Files
- `skills/build/SKILL.md` -- Build pipeline orchestrator with subagent dispatch model
- `skills/implement/SKILL.md` -- Implementation with specialist routing, TDD, 2-stage review
- `skills/recover/SKILL.md` -- Recovery workflow with 6 root cause categories
- `skills/work/SKILL.md` -- Work triage and routing
- `skills/status/SKILL.md` -- Project status dashboard
- `skills/specify/SKILL.md` -- Spec authoring with workspace mode support
- `.context-index/specs/features/multi-repo-workspace/` -- Multi-repo workspace charter specs

### Web Sources
- [Superpowers Complete Guide 2026](https://www.pasqualepillitteri.it/en/news/215/superpowers-claude-code-complete-guide) -- Superpowers v5 features including visual brainstorming
- [Builder.io Superpowers Guide](https://www.builder.io/blog/claude-code-superpowers-plugin) -- Superpowers structured workflow and multi-host support
- [GitHub Blog: Spec-Driven Development](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) -- SpecKit overview and cross-agent portability
- [MindStudio GSD Guide](https://www.mindstudio.ai/blog/gsd-framework-claude-code-plan-build-applications) -- GSD framework context-phase isolation
- [GitHub garrytan/gstack](https://github.com/garrytan/gstack) -- gstack role-based orchestration
- [AgentConn gstack Blog](https://agentconn.com/blog/gstack-claude-code-harness-open-source-2026/) -- Conductor parallel worktree orchestration
- [Kiro.dev](https://kiro.dev/) -- Kiro spec-driven IDE with bidirectional sync
- [AWS Kiro Documentation](https://aws.amazon.com/documentation-overview/kiro/) -- Agent hooks and steering files
- [Claude Code Agent Teams Docs](https://code.claude.com/docs/en/agent-teams) -- Agent teams coordination protocol
- [Martin Fowler: SDD Tools](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) -- Comparison of Kiro, SpecKit, and Tessl approaches
- [Pulumi Blog: Framework Comparison](https://www.pulumi.com/blog/claude-code-orchestration-frameworks/) -- Superpowers vs GSD vs gstack constraints
- [Vellum: Top AI Agent Frameworks](https://www.vellum.ai/blog/top-ai-agent-frameworks-for-developers) -- Governance and observability focus
- [Firecrawl: Best Claude Code Plugins](https://www.firecrawl.dev/blog/best-claude-code-plugins) -- Context engineering as differentiator
- [Shipyard: Multi-Agent Orchestration](https://shipyard.build/blog/claude-code-multi-agent/) -- Subagents vs agent teams patterns
- [Addy Osmani: Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/) -- Multi-agent coding best practices

---
topic: "Anthropic best practices for skill development vs adev skills"
date: "2026-04-08"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

# Anthropic Skill Best Practices vs adev Skills

## Summary

Anthropic's published guidance on prompt engineering, agent design, tool use, and Claude Code skill development was compared against all 28 adev skills. The framework demonstrates strong alignment with Anthropic's recommendations in context-first architecture, sub-agent isolation, and gate enforcement. Key improvement areas include: overly prescriptive step-by-step procedures (where general directives would perform better), heavy upfront context loading (vs just-in-time retrieval), aggressive triggering language (which overtriggers on Claude 4.6), missing `context: fork` usage for heavy skills, and insufficient verification/self-check instructions.

---

## Findings

### Internal: Skill Inventory Analysis

28 skills analyzed across 10 dimensions. Cross-cutting patterns identified:

| Pattern | Skills Using It | Alignment |
|---------|----------------|-----------|
| Context-first loading | All 28 | Strong |
| Sub-agent dispatch | 6 (review-specs, plan, implement, write-test, eval, brainstorm) | Strong |
| Model tier assignment | 6 (reasoning/capable/fast) | Strong |
| Gate enforcement | 8 (brainstorm, plan, implement, validate, build, debug, write-test, review-specs) | Strong |
| Interactive dialogue | 4 (brainstorm, specify, vision, init) | Moderate |
| Multi-pass analysis | 3 (hygiene, codehealth, validate) | Strong |
| Graceful degradation | 5 (research, init, hygiene, codehealth, repomap) | Strong |
| State persistence | 4 (build, implement, recover, retro) | Strong |

### Web: Anthropic Best Practices (10 Domains)

Sources consulted:
- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)

---

## Skill-by-Skill Comparison

### 1. adev:start (Triage)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Context loading | Light scan of specs/plans/sessions | Correct -- routing should be lightweight | None |
| Structure | 8-type classification table, state-aware routing | Anthropic: routing is a valid simple pattern | None |
| Triggering language | Normal phrasing | Claude 4.6 responds well to natural language | None |
| Verification | Validates routing destination before invoking | Good -- confirms before acting | None |

**Verdict: Well-aligned.** Lightweight routing skill follows the "start simple" principle.

---

### 2. adev:brainstorm (Design)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Context loading | Loads 10+ context sources upfront (constitution, platform, manifest, product.md, charters, ADRs, orientation, cross-cutting specs, references) | Anthropic: just-in-time retrieval, minimal high-signal tokens | **Heavy upfront loading** -- should load constitution + charters, defer others |
| Dialogue pattern | One-question-at-a-time, multiple-choice preferred | Anthropic: interactive patterns are good when they serve quality | Good |
| Sub-agent usage | Charter-reviewer subagent (capable tier, max 3 iterations) | Anthropic: fresh context for review is a best practice (Writer/Reviewer pattern) | Good |
| Gate enforcement | Hard gate: no code before charter approved | Anthropic: checkpoints and gates are recommended | Good |
| Output format | Structured charter with 6 sections | Anthropic: explicit output format specification | Good |
| Verification | Charter review loop with subagent | Anthropic: "give Claude a way to verify its work" | Good |

**Improvement: Defer loading** of orientation, cross-cutting specs, and external references until they become relevant during conversation. Load constitution + existing charters upfront; everything else on-demand.

---

### 3. adev:specify (Design)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Context loading | Heavy per-mode: constitution, charter, specs, ADRs, orientation, platform context, external references | Just-in-time retrieval preferred | **Heavy upfront loading** |
| Modes | 5 modes (Standard, Extract, Refactor, From-Diff, Cross-Cutting) | Routing pattern -- good for distinct workflows | Good |
| Dialogue | One-question-at-a-time (standard mode) | Interactive patterns serve quality | Good |
| Verification | Constitution validation during authoring, duplicate detection | Self-check instructions | Good |
| Error handling | Charter-closed check, conflict detection | Graceful degradation | Good |

**Improvement: Progressive loading.** Load constitution + charter first. Load ADRs, orientation, platform context only when Claude needs to reference them during spec authoring. Add explicit instruction: "Read files before making claims about existing behavior."

---

### 4. adev:review-specs (Assessment)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Sub-agent dispatch | 3 core reviewers + N domain specialists, parallel | Anthropic: 2-5 teammates is the sweet spot | Good |
| Context per subagent | Full context package per reviewer | Anthropic: each sub-agent gets its own fresh context | Good |
| Model tiers | reasoning (architect), capable (security), fast (consistency) | Anthropic: match model to task complexity | Good |
| Output aggregation | Consolidated report with verdict (PASS/BLOCK) | Anthropic: condensed summaries (1-2K tokens) back to coordinator | **Unclear if return size is constrained** |
| Verification | Verdict-based progression gating | Gate pattern is recommended | Good |
| Reasoning support | No explicit thinking/reflection instruction | Anthropic: "ultrathink" keyword for deep reasoning tasks | **Missing reasoning boost for architect reviewer** |

**Improvements:**
1. Add `ultrathink` to the structural architect subagent prompt (this is a reasoning-heavy task).
2. Specify max return size for each reviewer subagent (e.g., "Return findings in under 1,500 tokens").
3. Add self-check instruction: "Before finalizing your review, verify each finding against the spec text. Remove findings that cannot be grounded in specific spec language."

---

### 5. adev:route (Assessment)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Structure | 4-dimensional scoring matrix | Structured analysis pattern | Good |
| Context loading | Plan, spec, constitution, manifest, samples, boundaries, risk policies | Moderate loading -- all needed for scoring | Acceptable |
| Override rules | Any dim=1 forces assisted; high-risk files force assisted | Safety-first approach | Good |

**Verdict: Well-aligned.** Clean scoring model with appropriate safety overrides.

---

### 6. adev:plan (Planning)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Context loading | 11 context sources loaded upfront | Anthropic: "smallest possible set of high-signal tokens" | **Heaviest upfront load in the framework** |
| Gate enforcement | Review verdict check, dual drift detection (revision + file hash) | Checkpoints are recommended | Good |
| Sub-agent usage | Plan-reviewer subagent (capable tier, max 3 iterations) | Writer/Reviewer pattern is best practice | Good |
| Output format | Structured plan with context packets, file structure, parallelization hints | Explicit output specification | Good |
| Prescriptiveness | Highly prescriptive step-by-step procedure | Anthropic: "prefer general instructions over prescriptive steps" | **Over-prescribed for Claude 4.6** |

**Improvements:**
1. **Reduce upfront context.** Load constitution + spec + charter. Load ADRs, orientation, samples, cross-cutting specs, boundaries only when referenced during planning.
2. **Reduce procedural rigidity.** Replace rigid step-by-step with goal-oriented instructions: "Decompose the spec into ordered tasks. For each task, specify: files to modify, test expectations, context dependencies, and specialist routing. Validate the plan against constitutional boundaries."
3. **Add self-check:** "Before finalizing, verify each task maps to at least one spec acceptance criterion. Flag any acceptance criteria not covered by any task."

---

### 7. adev:implement (Implementation)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Sub-agent dispatch | 1 per task + 2 reviewers per task (sequential, not parallel) | Anthropic: "production-tested sweet spot is 2-5 teammates with 5-6 tasks per teammate" | **Sequential dispatch is correct for implementation** |
| Context packets | Explicit per-task context manifests | Anthropic: just-in-time context is preferred | Good -- packets are JIT for each task |
| TDD enforcement | Non-negotiable test-first | Anthropic: "write tests in structured format before starting work" | Excellent alignment |
| Verification | 2-stage review (spec compliance + code quality) + visual verification | Anthropic: "single highest-leverage thing" | Excellent |
| Error handling | BLOCKED → recovery record, NEEDS_CONTEXT → re-dispatch (max 2) | Anthropic: "resume from checkpoints rather than restart" | Good |
| Anti-overengineering | Not explicitly addressed | Anthropic: Claude 4.6 tends to overengineer; add scope-limiting language | **Missing anti-overengineering instruction** |
| State persistence | Execution state, resumable | Checkpoint-based resume is recommended | Good |
| Prescriptiveness | Very detailed multi-step procedure (Steps 1-5 with sub-steps 2a-2h) | Anthropic: general instructions often outperform prescriptive steps | **Over-prescribed** |
| `context: fork` | Not specified in frontmatter | Heavy skills should fork to avoid context pollution | **Missing fork isolation** |

**Improvements:**
1. **Add anti-overengineering instruction** to the subagent prompt template: "Only make changes directly required by the task. Do not refactor surrounding code, add abstractions, or create helper files unless the task explicitly requires it."
2. **Add `context: fork`** in frontmatter -- this skill runs long workflows that pollute the coordinator's context.
3. **Add verification instruction to subagents:** "Before reporting DONE, verify: (a) all tests pass, (b) no unintended file changes, (c) changes match the task scope."
4. **Simplify procedure.** Replace sub-steps 2a-2h with goal-oriented instruction: "For each task: assemble its context packet, route to specialist if scored, compose a subagent prompt enforcing TDD, dispatch, handle status, run reviews, mark complete."

---

### 8. adev:write-test (Implementation)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Gaming detection | 9 canonical gaming violation patterns | Anthropic: "avoid focusing on passing tests and hard-coding" | Excellent -- most thorough gaming detection |
| TDD enforcement | RED state verification mandatory | Anthropic: test-first is recommended | Excellent |
| Sub-agent usage | Capable-tier for authoring, fast-tier for semantic diff | Model tier matching is good | Good |
| Verification | Handoff block immutability, tamper detection | Self-verification is highest leverage | Excellent |
| Concurrent guard | Lock file for execution | Deterministic safeguard | Good |

**Verdict: Strongest skill in the framework.** Gaming detection and tamper verification go beyond Anthropic's recommendations. No significant improvements needed.

---

### 9. adev:debug (Implementation)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Context-first | ADRs, specs, orientation checked before code investigation | Anthropic: "read the file before answering" | Excellent |
| Hypothesis-driven | Single testable hypothesis, max 3 failures before escalation | Structured reasoning approach | Good |
| Verification | Quality gates after fix | Self-verification | Good |
| Documentation impact | Phase 7 checks if fix changes spec/ADR assumptions | Addresses root cause, not symptoms | Excellent |
| Prescriptiveness | 7 mandatory phases | Anthropic: general instructions may outperform for debugging | **Potentially over-prescribed** |
| Reasoning support | No explicit thinking boost | Debugging benefits from deep reasoning | **Could benefit from ultrathink** |

**Improvements:**
1. Consider adding `ultrathink` for the hypothesis formation phase.
2. Simplify the 7-phase structure into goal-oriented guidance: "Reproduce the bug. Investigate project context (ADRs, specs, architecture) before diving into code. Form a single testable hypothesis. Fix with test-first approach. Verify quality gates pass. Check if fix changes spec/ADR assumptions."

---

### 10. adev:recover (Implementation)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Root cause classification | 6 categories (MISSING_CONTEXT, AMBIGUOUS_SPEC, etc.) | Anthropic: actionable error messages, not opaque codes | Good -- categories are actionable |
| Resume pattern | Diagnosis → correction → re-dispatch | Anthropic: "resume from checkpoints" | Excellent alignment |
| Recovery records | Written for retrospective analysis | State persistence for learning | Good |
| Blame-free framing | "Root causes are always context/spec/tooling problems" | Constructive approach | Good |

**Verdict: Well-aligned.** Maps directly to Anthropic's checkpoint-and-resume recommendation.

---

### 11. adev:validate (Validation)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Comprehensiveness | 11 ordered checks with fail-fast | Multi-dimensional validation | Good |
| Specialist dispatch | Check 7 dispatches domain specialists | Pattern matching for routing | Good |
| Visual verification | Playwright MCP for UI (blocking) | Anthropic: "give Claude a way to verify" | Excellent |
| Context loading | Loads constitution, manifest, governance, platform-context, specs, reviews, charters, ADRs, cross-cutting specs, samples | Very heavy context | **Heaviest validation context in framework** |
| Prescriptiveness | 11 rigid sequential checks | Some checks could run in parallel | **Checks 2-11 could partially parallelize** |

**Improvements:**
1. **Parallelize independent checks.** Checks 2 (Spec Compliance), 3 (Charter Scope), 4 (ADR Compliance), 8 (Cross-Cutting) are independent and could run as parallel sub-agents returning condensed findings.
2. **Lazy context loading.** Load constitution + spec upfront. Load charters, ADRs, samples, cross-cutting specs only for checks that need them.
3. **Constrain return size** from specialist subagents.

---

### 12. adev:eval (Validation)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Graduated model | 4 layers: deterministic → architectural → LLM-as-Judge → human | Progressive quality assessment | Good |
| LLM-as-Judge | Reasoning-tier subagent with 5-dimension rubric | Anthropic: evaluator-optimizer pattern | Good |
| Quality floor | Layer 1 failure caps max score at 25 | Deterministic safeguards | Good |

**Verdict: Well-designed.** Graduated model aligns with Anthropic's evaluator pattern.

---

### 13. adev:build (Orchestration)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Orchestration | Chains review → plan → route → implement → validate | Orchestrator-Workers pattern | Good |
| State persistence | Incremental JSON state file with resume | Checkpoint-based resume | Excellent |
| Error handling | Fail-fast per spec, continue for others | Graceful degradation | Good |
| Dependency tracking | Failed dependency → dependent skipped | Prevents cascade failures | Good |

**Verdict: Strong orchestrator.** Follows Anthropic's orchestrator-workers pattern with proper state management.

---

### 14. adev:vision (Strategic Planning)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Dialogue | One-question-at-a-time | Interactive pattern | Good |
| Dual-mode | Full interview vs. refresh | Routing pattern | Good |
| Epic sync | Idempotent by milestone field matching | Safe re-run | Good |

**Verdict: Well-aligned.** No significant gaps.

---

### 15. adev:roadmap (Strategic Planning)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Analysis | Dependency graph, critical path, risk assessment | Structured analysis | Good |
| Error handling | Circular dependency detection | Prevents invalid states | Good |
| Prescriptiveness | Detailed 8-step procedure | Could be more goal-oriented | **Moderate over-prescription** |

**Improvement:** Consolidate into goal-oriented: "Build a dependency graph from charters and specs. Identify the critical path. Assess risk per feature. Generate a roadmap document with parallelization groups."

---

### 16. adev:research (Strategic Planning)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Source parallelism | Internal, web, GitHub in parallel | Parallel execution is recommended | Good |
| Graceful degradation | Warns on unavailable sources, continues | Anthropic: "letting agents know tools fail and adapt works surprisingly well" | Excellent |
| Attribution | Mandatory on every finding | Grounding and sourcing | Good |
| Comparison mode | Matrix with pros/cons/tradeoffs | Structured analysis | Good |

**Verdict: Well-aligned.** Graceful degradation pattern is a best practice exemplar.

---

### 17. adev:hygiene (Maintenance)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Multi-pass | 13 independent passes | Could parallelize independent passes | **Passes are sequential but independent** |
| Skip logic | Missing prerequisites → SKIP | Graceful degradation | Good |
| Auto-fix | Limited to constitution drift via /adev:sync | Appropriate scope limitation | Good |

**Improvement:** Explicitly instruct parallel execution of independent passes (passes 1-4 are independent, 5 depends on repomap, 6-13 are independent of each other).

---

### 18. adev:codehealth (Maintenance)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Detection passes | 5 independent passes | Could parallelize | **Mentions parallel possible but doesn't instruct it** |
| Tree-sitter | Optional, graceful skip | Graceful degradation | Good |
| Severity classification | High/medium/low per finding | Structured output | Good |

**Improvement:** Add explicit parallel execution instruction for the 5 independent passes.

---

### 19. adev:repomap (Maintenance)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Symbol extraction | Regex-based (no binary parser) | Keeps zero-dependency principle | Good |
| Batching | Top 100 symbols for reference count | Manages token budget | Good |
| Staleness tracking | Commit hash + timestamp | Enables drift detection | Good |

**Verdict: Well-aligned.** Good token budget management with batching.

---

### 20. adev:sample (Maintenance)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Scoring | 5-dimension model | Structured evaluation | Good |
| Filtering | Removes noise (small files, generated, tests) | Efficient candidate selection | Good |

**Verdict: No significant gaps.**

---

### 21. adev:retro (Maintenance)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Data gathering | Multi-source (git, specs, recovery records) | Comprehensive | Good |
| No fabrication | Reports "no data" if missing | Honest reporting | Excellent |
| Auto-apply | Limited to informational updates | Appropriate scope | Good |

**Verdict: Well-aligned.**

---

### 22. adev:document (Maintenance)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Marker protocol | adev:generated vs adev:human zones | Prevents human content loss | Good |
| Prerequisites | Requires repomap artifacts | Explicit dependency | Good |

**Verdict: No significant gaps.**

---

### 23. adev:init (Setup)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Dual-mode | Greenfield wizard vs brownfield diagnostic | Routing pattern | Good |
| Plugin conflict | Detects and resolves competing plugins | Proactive error prevention | Excellent |
| Interactive setup | 10-step wizard | Appropriate for setup (user decisions needed) | Good |

**Verdict: Well-aligned.** Setup wizard is appropriately interactive.

---

### 24. adev:sync (Setup)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Provider-aware | Different formatting per AI tool | Multi-target support | Good |
| User preservation | Marker-based content protection | Prevents content loss | Good |
| Idempotent | Safe to re-run | Deterministic output | Good |

**Verdict: No gaps.**

---

### 25. adev:issues (Supporting)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Backend-agnostic | File vs beads_rust | Abstraction pattern | Good |
| Worktree-safe | Auto-shares issue storage | Handles edge case | Good |

**Verdict: Clean utility skill.**

---

### 26. adev:status (Supporting)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Read-only | No state changes | Safe to run anytime | Good |
| Multi-mode | spec, charter, milestone, all | Flexible querying | Good |

**Verdict: No gaps.**

---

### 27. adev:assess (Supporting)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Static analysis | No external tool execution | Safe, predictable | Good |
| Maturity levels | L1-L5 mapping | Clear progression model | Good |

**Verdict: No gaps.**

---

### 28. adev:using-adev (Reference)

| Dimension | Current State | Best Practice | Gap |
|-----------|--------------|---------------|-----|
| Static reference | No dynamic loading | Appropriate for gateway | Good |
| Lifecycle gates | Documents mandatory boundaries | Good reference | Good |

**Verdict: No gaps.**

---

## Cross-Cutting Recommendations

### Priority 1: High Impact, Low Effort

| # | Recommendation | Affected Skills | Anthropic Source |
|---|---------------|----------------|-----------------|
| 1 | **Add anti-overengineering instructions** to all subagent prompts: "Only make changes directly required by the task. Do not refactor surrounding code, add abstractions, or create helper files unless explicitly required." | implement, write-test, debug | [Best Practices](https://code.claude.com/docs/en/best-practices) |
| 2 | **Add `ultrathink` keyword** to reasoning-heavy subagent prompts (architect review, hypothesis formation in debug, LLM-as-Judge) | review-specs, debug, eval | [Extended Thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |
| 3 | **Tune triggering language for Claude 4.6** -- replace "CRITICAL: You MUST..." patterns with natural phrasing like "Use this when..." across all skill descriptions | All 28 | [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| 4 | **Add self-check instructions** before skill completion: "Before finalizing, verify [specific criteria]" | plan, implement, validate, review-specs | [Best Practices](https://code.claude.com/docs/en/best-practices) |
| 5 | **Specify max return size** for subagent outputs (1,000-2,000 tokens) to prevent context pollution | review-specs, implement, eval, brainstorm | [Multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system) |

### Priority 2: Medium Impact, Medium Effort

| # | Recommendation | Affected Skills | Anthropic Source |
|---|---------------|----------------|-----------------|
| 6 | **Progressive context loading** -- load constitution + primary artifact upfront, defer ADRs/orientation/samples/cross-cutting specs to on-demand | brainstorm, specify, plan, validate, implement | [Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| 7 | **Add `context: fork`** frontmatter to heavy skills that run long workflows | implement, build, validate | [Skills documentation](https://code.claude.com/docs/en/skills) |
| 8 | **Parallelize independent analysis passes** with explicit instructions | hygiene (13 passes), codehealth (5 passes), validate (checks 2-8) | [Building effective agents](https://www.anthropic.com/research/building-effective-agents) |
| 9 | **Add "read before claiming" instruction** to prevent hallucination about code state | debug, implement, validate, codehealth | [Best Practices](https://code.claude.com/docs/en/best-practices) |
| 10 | **Add cleanup instructions** for subagents: "Remove any temporary files or scratch artifacts before reporting completion" | implement, write-test | [Best Practices](https://code.claude.com/docs/en/best-practices) |

### Priority 3: Strategic Improvements

| # | Recommendation | Affected Skills | Anthropic Source |
|---|--|----------------|-----------------|
| 11 | **Reduce procedural rigidity** in analytical skills -- replace rigid step-by-step with goal-oriented instructions for Claude 4.6 | plan, debug, roadmap, validate | [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) |
| 12 | **Move reference content to supporting files** to keep SKILL.md under 500 lines | implement, validate, plan, write-test, hygiene | [Skills documentation](https://code.claude.com/docs/en/skills) |
| 13 | **Add `allowed-tools` frontmatter** to scope tool access per skill | All skills that dispatch subagents | [Skills documentation](https://code.claude.com/docs/en/skills) |
| 14 | **Skill description audit** -- ensure all 28 descriptions are under 250 chars and front-load the use case | All 28 | [Skills documentation](https://code.claude.com/docs/en/skills) |

---

## Alignment Scorecard

| Anthropic Domain | Framework Score | Notes |
|-----------------|----------------|-------|
| Context-first architecture | 9/10 | Excellent -- every skill loads context. Deduct for heavy upfront loading |
| Sub-agent patterns | 8/10 | Good isolation and model tiers. Missing return size constraints and ultrathink |
| Tool use | 7/10 | Implicit parallel tool use but rarely explicitly instructed. Missing allowed-tools scoping |
| Error handling | 9/10 | Graceful degradation, recovery records, checkpoint resume -- all strong |
| Gate enforcement | 10/10 | Best-in-class lifecycle gates with dual drift detection |
| Output format | 8/10 | Structured artifacts with templates. Some skills lack explicit format specification |
| Verification | 7/10 | Strong in validate/write-test, weak in planning/brainstorm self-checks |
| Prompt efficiency | 6/10 | Heavy upfront loading, prescriptive procedures, missing context:fork |
| Claude 4.6 tuning | 5/10 | Framework designed pre-4.6. Needs triggering language audit and procedural simplification |
| Anti-overengineering | 4/10 | Not addressed in any skill. Claude 4.6 specific issue |

**Overall: 7.3/10** -- Strong fundamentals with specific areas for Claude 4.6 optimization.

---

## References

### Anthropic Documentation
- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Use XML tags](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Agent teams](https://code.claude.com/docs/en/agent-teams)
- [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

### Internal Files Analyzed
- All 28 `skills/*/SKILL.md` files
- `.context-index/constitution.md`
- `.context-index/manifest.yaml`

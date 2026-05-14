---
id: eval-with-session-jsonl
scope: _global
title: Use session JSONL for token measurement, not file-size estimates
pattern: When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
anti-pattern: Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
confidence: medium
evidence:
  - path: .context-index/research/token-consumption-patterns-in-adev-lifecycle.md
    date: 2026-05-03
    source: learn
contradicted-by: []
created: 2026-05-03
updated: 2026-05-03
---

---
id: cache-reads-dominate-cost
scope: _global
title: Cache reads are 71% of session cost — minimize context accumulation
pattern: When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
anti-pattern: Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
confidence: medium
evidence:
  - path: .context-index/research/token-consumption-patterns-in-adev-lifecycle.md
    date: 2026-05-03
    source: learn
contradicted-by: []
created: 2026-05-03
updated: 2026-05-03
---

---
id: summarize-output-preserves-quality
scope: _global
title: Summarized skill output produces equivalent artifact quality
pattern: When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
anti-pattern: Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
confidence: medium
evidence:
  - path: tests/evals/skill-compression/outputs/eval-report.md
    date: 2026-05-03
    source: learn
contradicted-by: []
created: 2026-05-03
updated: 2026-05-03
---

---
id: orchestrators-dispatch-optimistically
scope: _global
title: Orchestrators must dispatch subagents optimistically — never introspect tool availability
pattern: When an orchestrator skill dispatches subagents (Agent tool), call Agent({...}) directly and treat a harness rejection as the only valid signal that the tool is absent. Agent is eagerly loaded — its absence from the deferred-tools list or ToolSearch results is expected and is NOT evidence of unavailability. ToolSearch only enumerates deferred tools.
anti-pattern: Scan the deferred-tools list / loaded tool list / ToolSearch results for "Agent" or "Task" and self-abort a dispatch step when not found. This produces a FAILED lifecycle-state record with error "Agent/Task dispatcher tool not available" without ever calling Agent. ("Task" is not a tool name in Claude Code — Agent is the only subagent dispatcher.)
confidence: low
evidence:
  - path: .context-index/lifecycle-state/kind-enumeration.json
    date: 2026-05-14
    source: learn
contradicted-by: []
created: 2026-05-14
updated: 2026-05-14
---

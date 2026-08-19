## Delegation Protocol

**This is the most important section of this skill.**

The build orchestrator is a coordinator. It decides *which* skill to run next, checks skip/stop conditions on artifacts, persists build state, and reports progress. It does NOT perform review, planning, routing, implementation, or validation itself — not even partially.

### Subagent Dispatch Model

**Every pipeline step MUST be dispatched as a fresh subagent using the Agent tool.** Each subagent gets a clean context with no prior knowledge of the build pipeline, and its prompt instructs it to invoke the target skill via the Skill tool. This provides two guarantees:

1. **No pseudo-invocation.** A fresh subagent has no "knowledge" of what the child skill does. It must load the full SKILL.md via the Skill tool to execute it. It cannot summarize or shortcut.
2. **Context isolation.** Each pipeline step runs in its own context. A 200K-token implement step does not pollute the orchestrator's context. The orchestrator only sees the result summary.

### Dispatch Optimism (Tool Availability)

**Dispatch optimistically. Do not introspect tool availability before calling Agent.** The harness is the only authority on whether a tool exists — call `Agent(...)` and let it return either a result or a harness-level rejection. There is no other valid signal of unavailability.

In particular:

- **`Agent` is the only dispatcher** in this CLI. The name `Task` appears in some Anthropic SDK docs but is NOT a tool name in Claude Code — there is no `Task` tool to look for. Searching for "Task" will always return nothing and is meaningless.
- **`Agent` is eagerly loaded, not deferred.** It is declared in the top-level `<functions>` block of every orchestrator session, not in the deferred-tools list and not via ToolSearch. Its absence from the deferred-tools list is NOT evidence of unavailability — it is the expected state.
- **ToolSearch only enumerates deferred tools.** Running `ToolSearch` with query `select:Agent` or keyword `agent` will correctly return zero matches even when Agent is available, because Agent is not deferred. Do not interpret an empty ToolSearch result as proof of absence.
- **The harness is the only authority.** If — and only if — an attempted `Agent({...})` call returns a harness-level error indicating the tool does not exist, may the orchestrator record the step as FAILED with an unavailability reason. You must attempt the Agent call before recording any such failure. Self-aborting at the prose level (i.e., refusing to dispatch because you "couldn't find Agent in the tool list") is a build bug, not a safe fallback.

### Context Packet Assembly

How the orchestrator assembles the context packet that accompanies a dispatch.

> **Conditional loading:** Read `skills/build/references/delegation/context-packet-assembly.md` for the full instructions. Do not act on this section from the summary above.

### Subagent Prompt Template

The verbatim prompt skeleton handed to each dispatched sub-skill.

> **Conditional loading:** Read `skills/build/references/delegation/subagent-prompt-template.md` for the full instructions. Do not act on this section from the summary above.

### What the Orchestrator Does Directly

The short list of work the orchestrator performs itself instead of delegating.

> **Conditional loading:** Read `skills/build/references/delegation/orchestrator-direct-work.md` for the full instructions. Do not act on this section from the summary above.

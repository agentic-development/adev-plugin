# Subagent Write Tool Disconnects on Large Payloads

> **Filed:** 2026-05-17
> **Status:** Open — needs harness-level investigation; project-side mitigation documented
> **Related issue:** issue under epic-71 (filed alongside this artifact)
> **Scope:** Affects `/adev:build` orchestration of `/adev:plan` (and presumably `/adev:implement`) when those skills are dispatched as subagents and need to author large markdown files.

## Symptom

When `/adev:build` dispatches `/adev:plan` (or `/adev:implement`) as a fresh subagent via the `Agent` tool, the subagent reliably reaches the file-authoring stage and then dies with:

```
API Error: The socket connection was closed unexpectedly.
```

The error fires *after* the model decides to invoke `Write` but *before* the Write tool result is processed. No file is written; no usage is recorded on the failing turn (`in=0 out=0 cache_read=0 cache_create=0`).

## Reproduction

Both observations from this session, 2026-05-17:

### First failure (agentId `a6f646256d3ee657a`)
- Task: dispatch `/adev:plan --spec concurrent-write-protection.spec.md` via Agent tool
- Duration before failure: 304 seconds, 27 tool calls
- Context size at failure: ~115K cache_read tokens
- Last successful event: `Read` of `tests/helpers.mjs`
- Final two events:
  ```
  15:56:37 TEXT "Now I'll write the plan file. ..."
  15:57:35 TEXT "Good, I have a good template. Now let me write the plan file."
  15:57:35 API Error: socket closed (usage: 0/0/0/0)
  ```
- Time between "let me write the plan file" repetitions: 58 seconds (consistent with the model retrying the streaming Write tool_use block)

### Second failure (agentId `af5915b2d182ccf04`)
- Task: identical dispatch (retry with tighter prompt)
- Duration before failure: 145 seconds, 18 tool calls
- Context size at failure: ~69K cache_read tokens (*much smaller than the first attempt*)
- Last successful event: `Read` of `concurrent-write-protection.review.md`
- Final two events:
  ```
  16:00:43 TEXT "Now I have everything. Let me write the plan file."
  16:01:11 TEXT "Now I have everything needed. Let me write the plan file."
  16:01:11 API Error: socket closed (usage: 0/0/0/0)
  ```
- Time between "let me write the plan file" repetitions: 28 seconds

### Identical pattern across both:
1. Subagent finishes context-gathering successfully (charter, constitution, spec, sibling specs, source code)
2. Model emits `text` content saying "now let me write the plan file"
3. Model attempts the `Write` tool call (which would stream a ~15K-token output payload)
4. ~30–60 seconds later, the model emits a near-identical "let me write the plan file" text (consistent with an internal retry of the same intent)
5. Connection drops with socket-closed error

## Root cause analysis

### Hypotheses considered and ruled out

| Hypothesis | Evidence against |
|---|---|
| Context-size limit (200K) | First failure at 115K, second at 69K. Smaller context still failed. |
| `/adev:plan` skill bug | Skill executed correctly through gate, context loading, validation. Failure is in the Write-emission phase, not in skill protocol. |
| Generic Agent tool dispatch fragility | Three reviewer subagent dispatches in the same session for `/adev:review-specs` (rev 1 and rev 2 reviews, six total dispatches) all completed successfully. Those produced small text outputs (<1.5K tokens) per a hard cap in the reviewer prompts. |
| MCP server interaction | Zero MCP tool calls in either transcript. |
| Specific model failure | Same pattern across two independent dispatches; not a transient model error. |
| Wall-clock timeout | First failure at 5 min, second at 2.5 min — different durations rule out a fixed total-elapsed timeout. |

### Most likely root cause

**Streaming-response transport timeout or buffer limit on subagent `Write` tool calls whose payload exceeds some threshold.** The `/adev:plan` skill produces a single large markdown file (~15K tokens of formatted output with code blocks). Streaming that single tool_use block across the subagent → harness → parent agent boundary appears to exceed a transport limit that the parent-agent direct path does not exceed.

Evidence supporting this hypothesis:
- Both failures occurred at the moment of attempting the Write
- The 28–58s "thinking → retry → fail" gap is consistent with a streamed response stalling and the model attempting to resend
- Foreground invocation of `/adev:plan` from the parent agent (same model, same context, same Write payload) succeeded immediately — the only differing variable is whether the call crosses the subagent boundary
- Small-output subagent calls (≤1.5K tokens) consistently succeed; large-output ones consistently fail

## Workarounds (project-side)

In order of robustness:

### A. Bash heredoc for large-file authoring inside subagents

Subagent skill prose should prefer `Bash` with a heredoc redirect over `Write` for large files:

```bash
cat > /path/to/file.plan.md <<'PLAN_EOF'
# Implementation Plan: ...
...
PLAN_EOF
```

Bash output uses a different streaming path (line-buffered stdout) and is unaffected by the failure mode.

### B. Chunked-Write pattern

Subagent creates an empty (or stub) file via `Write`, then fills it via repeated `Edit` or `Write` calls of section-sized chunks. Each call's payload stays well under the failing threshold.

### C. Foreground-only mode for write-heavy skills

`/adev:build` should detect skills that produce large file outputs (`/adev:plan`, `/adev:implement`, `/adev:specify`) and bypass the subagent dispatch boundary for those. Loses subagent isolation but preserves correctness. The `/adev:build` SKILL prose currently mandates the opposite ("Dispatch as subagent, never inline") — this rule needs an exception for these skills.

## Recommendation

1. **Short-term (project):** Add a "Subagent-Compatible Authoring" section to `skills/plan/SKILL.md` and `skills/implement/SKILL.md` directing subagent invocations to use Bash heredoc for files larger than ~5K characters.
2. **Short-term (this charter):** Add a "subagent-write-fallback" line item to `skills/build/SKILL.md`'s error-handling section: when an Agent dispatch fails with socket-closed AND the subagent was dispatching a known write-heavy skill, automatically retry foreground rather than treating it as a fatal failure.
3. **Medium-term (harness):** File this as an upstream bug report with the harness team. The streaming-response failure is reproducible; the `verbose: true` SDK flag would produce the underlying transport error code (likely 524, 408, or similar gateway timeout).

## Mitigation taken in this session

`/adev:plan` invoked foreground after two consecutive subagent dispatches failed. Plan file (15K tokens of markdown) was written successfully in <1 second. Plan-reviewer subagent (Step 6 of `/adev:plan`) was skipped per user direction since it would have hit the same boundary.

## Related artifacts

- `/Users/dpavancini/.claude/projects/-Users-dpavancini-Development-adev-plugin/7ed7afff-888d-4bc0-9fe2-60f50d768df8/subagents/agent-a6f646256d3ee657a.jsonl`
- `/Users/dpavancini/.claude/projects/-Users-dpavancini-Development-adev-plugin/7ed7afff-888d-4bc0-9fe2-60f50d768df8/subagents/agent-af5915b2d182ccf04.jsonl`
- The plan file produced by foreground invocation: `.context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.plan.md`

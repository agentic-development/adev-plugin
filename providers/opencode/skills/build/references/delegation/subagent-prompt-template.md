### Subagent Prompt Template

Every pipeline step uses this prompt structure when dispatching via the Agent tool:

```
You are executing one step of a build pipeline.

PIPELINE_CONTEXT:
  spec_path: ...
  spec_title: ...
  milestone: ...
  pipeline_position: ...
  workspace: ...
  issue_board: ...

STEP_CONTEXT:
  <step-specific fields as defined above>

---

Your ONLY task: invoke the skill `/adev:<skill-name>` with args `<args>`
using the Skill tool. Let it run to full completion — including all
post-steps (source manifests, commit trailers, DoD checks, etc.).
Then report the result.

{{IF --verbose is NOT set:}}
Execute silently — no intermediate narration. Chain all steps without
commentary. Use parallel tool calls for multi-file reads.
{{IF --verbose IS set, include instead:}}
VERBOSE: true

{{IF --auto IS set, include:}}
AUTO: true
Do NOT prompt the user for any input. Make autonomous decisions:
accept defaults, skip confirmations, choose the most conservative
option when ambiguous. If you encounter a situation that would
normally require user input and no safe default exists, report
FAILED with the details rather than blocking on input.

Do NOT attempt to perform the skill's work yourself. You MUST use the
Skill tool to load and execute the full skill. The skill contains
detailed multi-step protocols that you do not have access to without
loading it.

After the skill completes, report back with EXACTLY this format:

STEP_RESULT:
  status: COMPLETED | FAILED | BLOCKED
  verdict: <skill-specific outcome, e.g., PASS, BLOCK, constitution-violation>
  artifacts: <list of files created or modified by the skill>
  summary: <1-3 sentence summary of what happened>
  error: <if FAILED, the failure details including any tier/command/severity context>
```

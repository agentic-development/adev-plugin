### Step 2: Gather Evidence

Collect every piece of context relevant to the stuck task. The goal is to see exactly what the subagent saw (and what it did not see).

1. **Context packet.** Read `.context-index/packets/<task-slug>.md` if it exists. This is the pre-composed context that was sent to the subagent. If no context packet exists, reconstruct what context the subagent likely received by reading the plan's `context_packet` section for the task.
2. **Subagent report.** Read the last subagent output for this task. Look for the status code (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED), the "Missing context" or "Blocker" sections, and any error output.
3. **Plan entry.** Re-read the full task entry from the plan, including dependencies, specialist routing, and file lists.
4. **Spec.** Read the Live Spec referenced by the plan. Focus on the acceptance criteria relevant to this task.
5. **Error output.** If the subagent reported a tool failure, read any error logs, test output, or build output it referenced.
6. **Git state.** Check `git status` and `git diff` to see what the subagent changed (if anything) before getting stuck.

Print a summary of evidence gathered:
```
Evidence collected:
- Context packet: [found | reconstructed | missing]
- Subagent report: [found with status BLOCKED | found with status NEEDS_CONTEXT | not found]
- Plan task: Task 3 — "Implement user profile API endpoint"
- Spec: .context-index/specs/features/users/user-profile-spec.md
- Error output: [found | none]
- Git changes: [N files modified | no changes]
```

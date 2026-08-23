### Step 9: Session Summary (Standalone Only)

When invoked standalone (not from brainstorm), output a session summary after heuristics capture. When invoked from brainstorm, skip this step — the return-to-brainstorm contract handles the result.

> **Prototype Session Complete**
>
> - **Module:** `<module>`
> - **Tier:** `<wireframe|mockup|functional>`
> - **Iterations:** `<iteration_count>` (number of Feedback Iteration cycles including the initial generation)
> - **Persistence:** `"project"` (kept at `.adev/prototype/<module>/`) | `"ephemeral"` (discarded)
> - **Visual references:** `<count>` captured
> - **Heuristics saved:** `<count>`

If visual references were captured during the session (tracker.count() > 0), append the tracker summary:

```
tracker.summary(module)
```

This outputs: "Captured N visual reference(s) in `.context-index/references/<module>/visuals/`:" followed by a list of `{ path, description }` pairs.

No return-to-brainstorm step is performed. The session ends here.

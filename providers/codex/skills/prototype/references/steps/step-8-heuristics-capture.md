### Step 8: Heuristics Capture

After the prototype session completes (keep or discard), **propose** design decisions based on what you observed during the session. Review the prototyping iterations, user feedback, and design choices made, then present a numbered list:

> **Design decisions from this session:**
>
> 1. [decision derived from prototyping — e.g., "dark theme works well for developer tutorials"]
> 2. [decision derived from prototyping — e.g., "nav bar with step numbers is clear navigation"]
> 3. ...
>
> Would you like to save these as heuristics? You can edit, remove, add, or say "skip" to proceed without saving.

Propose 2-4 decisions. Base them on concrete observations: layout choices that worked, user feedback during iterations, visual patterns that were confirmed or rejected, interaction patterns that emerged. Do not ask the user to recall — you were present for the entire session.

**Handling responses:**

- **User provides "none", "skip", or empty response:** Proceed to Step 8b (Return to Brainstorm) or Step 9 (Session Summary) without saving heuristics. This is not an error — not every session produces reusable insights.

- **User confirms or edits the proposed decisions (1-4 total):** For each decision, invoke `/adev:learn` to persist it as a module-scoped heuristic:
  - The decision text as the heuristic content
  - Module scope set to the current `<module>` (from brainstorm context or `--module` argument)
  - Tag with `source: prototype` to identify the heuristic's origin
  - Include the prototype tier and iteration number where the decision emerged (if identifiable)
  - Track `heuristics_saved` count for the return contract (Step 8b)

  If `/adev:learn` fails for any heuristic (import error, write error), this is non-blocking:
  - Log the error
  - Report: "Heuristic capture failed — you can save these manually with `/adev:learn` later"
  - Proceed to session completion (do not block the prototype session). Error code: `HEURISTIC_SAVE_ERROR`.

- **User provides more than 4 design decisions:** Ask the user to prioritize:

  > You've identified N decisions. To keep heuristics focused, please select the 4 most important ones, or confirm you want to save all N.

  If the user confirms saving all, proceed. If the user narrows to 4, save only the selected ones.

- **User provides 0 decisions after the prompt (blank input):** Same as "skip" — proceed without saving heuristics.

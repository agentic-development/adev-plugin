### Phase 7: Documentation Impact

**Goal:** Check if the fix changes assumptions documented in specs, charters, or ADRs.

1. **Review the fix against spec assumptions.**
   - Re-read the relevant Live Spec (from Phase 2).
   - Does the fix change the behavioral contract? (e.g., error handling now works differently, a default value changed, an edge case is now handled)
   - If yes: update the spec's acceptance criteria to reflect the new behavior. Flag this to the user.

2. **Review the fix against charter scope.**
   - Does the fix reveal that a capability was missing from the charter's Capability Map?
   - If yes: suggest adding it to the charter.

3. **Review the fix against ADRs.**
   - Does the fix contradict or extend a previous architectural decision?
   - If yes: suggest updating the ADR or creating a new one (see Phase 6 step 4).

4. **Summary.** Report what documentation changes (if any) are needed:
   - "No documentation impact" (most common for isolated bug fixes)
   - "Spec update needed: [spec path] — [what changed]"
   - "ADR update needed: [ADR path] — [what changed]"
   - "Charter update suggested: [charter path] — [what to add]"

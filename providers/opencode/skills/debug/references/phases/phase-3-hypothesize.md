### Phase 3: Hypothesize

**Goal:** Form a single, testable hypothesis about the root cause.

1. **Find working examples.**
   - Locate similar working code in the same codebase.
   - What works that is similar to what is broken?

2. **Compare against references.**
   - If implementing a pattern, read the reference implementation completely.
   - Check golden samples in `.context-index/samples/` for how the pattern should look.
   - Do not skim. Read every line.

3. **Form a single hypothesis.**
   - State clearly: "I think X is the root cause because Y."
   - Be specific, not vague.
   - Ground the hypothesis in the evidence from Phase 2 (reference ADRs, specs, or architecture docs that support or contradict the hypothesis).

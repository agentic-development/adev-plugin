### Phase 4: Verify

**Goal:** Test the hypothesis with the smallest possible change.

1. **Test minimally.**
   - Make the SMALLEST possible change to test the hypothesis.
   - One variable at a time.
   - Do not fix multiple things at once.

2. **Evaluate the result.**
   - Hypothesis confirmed? Proceed to Phase 5.
   - Hypothesis rejected? Return to Phase 3 with a new hypothesis.
   - Do not add more fixes on top of a failed hypothesis.

3. **If 3+ hypotheses have failed: question the architecture.**
   - Pattern indicating architectural problem: each fix reveals new shared state, coupling, or a problem in a different place.
   - STOP and question fundamentals. Read relevant ADRs and the orientation doc.
   - Discuss with the user before attempting more fixes.
   - This is NOT a failed hypothesis. This is a wrong architecture.

### Phase 1: Reproduce

**Goal:** Confirm the problem exists and is consistent.

1. **Read error messages carefully.**
   - Do not skip past errors or warnings.
   - Read stack traces completely.
   - Note line numbers, file paths, error codes.

2. **Reproduce consistently.**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible, gather more data. Do not guess.

3. **Check recent changes.**
   - Run `git diff` and `git log --oneline -10` in the affected area.
   - New dependencies, config changes, environmental differences.

4. **Heuristics:** Load module-scoped heuristics for the buggy file's module via the CLI:

   ```bash
   adev heuristics retrieve --module <module-slug> --tier summary --format text \
       [--keyword <token>]...
   ```

   Derive keywords from the error message or bug description: split on whitespace and punctuation,
   filter to tokens of 3+ characters, remove common stop words (the, and, is, was, not, for, with,
   from, this, that, are, has, have, its, etc.), take the first 5 unique tokens as keywords. Pass each as a `--keyword` flag.
   Example: `"ERR_FS_CP_EINVAL: src and dest cannot be the same"` → `--keyword src --keyword dest --keyword same --keyword err --keyword einval`.
   If fewer than 3 tokens are extracted, omit `--keyword` entirely and fall back to module-only retrieval.

   Stdout is either rendered markdown blocks (one per heuristic, separated by blank lines) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic injection stays non-blocking.
   When heuristics are present (output is not `__NONE__`), prepend: "The following heuristics are lessons learned from past work
   in this module. Use them as guidance, not as hard rules."

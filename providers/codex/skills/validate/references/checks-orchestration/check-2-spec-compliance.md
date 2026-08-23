### Check 2: Spec Compliance

Load the Live Spec and walk through every acceptance criterion.

**Before citing any file:line reference, you MUST use the Read tool to read the actual file content.** Do not infer, assume, or fabricate file contents from the spec or plan. Every PASS/FAIL/PARTIAL verdict must cite at least one file that was explicitly read in this validation run. If a criterion cannot be verified because no relevant files were found with Glob/Grep, record PARTIAL with the note "Unable to locate implementation files — criterion unverified."

For each criterion:
1. Use Glob and Grep to identify which files and tests address it.
2. **Read the actual file content** using the Read tool. You MUST read the file before making any claims about its contents. Do NOT infer code structure, line numbers, or behavior from the spec alone — verify against the actual source. If you cite `file:line`, that line number must come from reading the file, not from guessing.
3. Verify the behavior matches the criterion based on what you read.
4. Check that a test exists for the criterion and that the test actually verifies the described behavior (not a trivial assertion).
5. Verify test integrity: assertions must be strict and match the spec exactly.
   Flag any of these anti-patterns:
   - Loose matchers where exact values are expected (regex where string would do,
     `toContain` where `toEqual` is appropriate)
   - Conditional skips (`if visible`, `try/catch` around assertions)
   - Assertions that can never fail (`>= 0`, `toBeTruthy()` on a string)
   - Tests that were clearly weakened to pass (look for recent changes that
     loosen assertions without a corresponding spec change)
   - Tests that assert on runtime/dynamic data instead of deterministic seed values
     (e.g., `toBeGreaterThan(0)` on a query result instead of seeding known data
     and asserting exact values)
   - Fixes applied to failing tests without evidence that the spec, charter,
     or ADRs were consulted (look for comments or commit messages referencing
     the context that justified the change)

**Do NOT use plan file checkboxes (`[x]`) as evidence of completion.** A `[x]` checkbox in a `.plan.md` file means the implementer marked the step done — it does not prove the code was written correctly or at all. Check 2 must be grounded in reading actual source files and tests, not plan metadata.

Record per criterion:
- PASS: code and tests satisfy the criterion (cite file:line from actual file reads).
- FAIL: code does not satisfy the criterion (with file:line references and explanation).
- PARTIAL: code partially satisfies (describe what is missing).

**Anti-fabrication rule:** Every file:line citation in the report MUST come from a Read tool call in this session. If you cannot read a file (it does not exist, is too large, etc.), say so explicitly rather than guessing its contents. A validation report with fabricated citations is worse than no report at all.

**Cross-repo interface verification (workspace-aware validation mode only):** When workspace-aware validation mode is active and `crossRepoDeps` is non-empty, Check 2 gains an additional sub-step: for each acceptance criterion that references behaviour defined in a cross-repo dependency spec, verify that the implementation respects the interface contracts (API signatures, data shapes, event payloads) described in the dependency spec. Record findings per criterion as PASS / FAIL / PARTIAL with references to both the local code and the cross-repo dependency spec.

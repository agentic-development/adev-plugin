# Check 2: Spec Compliance

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

## Scope Expansion Sub-Finding

After verifying spec behavioral compliance, check whether the implementation has added files outside the spec's declared scope. This sub-finding absorbs the responsibility formerly held by validate Check 3 (Charter Consistency), which is now removed by `check-set-restructure.spec.md`.

**Declared scope:** Read the `source-manifest.files` array from the spec's YAML frontmatter. This is the **authoritative declared scope** — no new frontmatter field is introduced. Pinning the scope to an existing structural source of truth keeps Check 2 honest (SA-2 fix from spec rev-2).

**When `source-manifest.files` is present and non-empty:**

1. Identify implementation files from:
   - **Primary source:** the plan's task file lists (Create + Modify entries), when a plan exists.
   - **SEC-3 fallback (no plan, or no prior validated commit):** the git diff against the spec's last validated commit, if any: `git diff <last-validated-hash>..HEAD -- <project-source-paths>`. When no prior validated commit exists either, fall back to the diff against the merge base with the project's default branch (`git diff $(git merge-base HEAD <default>)..HEAD`). When even that is unavailable (initial commit case), record an INFO note "no diff baseline available — scope verification skipped this run" and proceed.
2. For each implementation file path, check whether it falls under a directory implied by any entry in `source-manifest.files`. Match by prefix and by glob expansion where the manifest entry contains `**`.
3. If ANY implementation file is outside the declared scope, emit a **scope expansion detected** sub-finding:
   - List the offending file(s).
   - Cite the `source-manifest.files` entries that define the scope boundary.
   - Recommended action: "Update the spec's `source-manifest.files` to include this path, or revert the out-of-scope change."
4. Severity: **warning** — this does not fail Check 2 by itself but raises the aggregate verdict from PASS to PASS_WITH_NOTES.

**When `source-manifest.files` is absent or empty (CON-3 edge case from spec rev-2):**

Emit an INFO note: "scope verification unavailable — spec has no `source-manifest.files`" and do NOT emit a scope-expansion finding. Verdict is unaffected. Specs without manifests are typical early in a feature's life; the audit is best-effort, not punitive.

# Check 4: Constitution Compliance

## Evidence Contract

Every finding produced by this check — **PASS or FAIL** — must cite at least one of the following as evidence:

- a `file:line` reference (e.g., `lib/governance/validate-config.mjs:47`) drawn from a file you actually read in this validation run, OR
- a `grep` result (the literal pattern + the matched file paths) showing the relevant signal in the codebase, OR
- a specific code block reference with file path (when the citation needs more than one line of context).

**Findings without evidence are rejected by this authoring contract and reported as FAIL with code `UNCITED_FINDING`.** This applies symmetrically: an unsubstantiated PASS is just as much an authoring failure as an unsubstantiated FAIL — both indicate the reviewer did not actually inspect the code. Rubber-stamp PASS rates (close to 100% across all dispatches) are the gaming pattern this contract is designed to catch.

Before finalizing your assessment, verify each finding answers two questions:

1. **Where in the code does the evidence appear?** (file:line or grep target)
2. **Why does that evidence prove the principle / boundary / standard is honored or violated?** (one-sentence rationale)

If either answer is missing, the finding is `UNCITED_FINDING` and must be reported as FAIL — fix the gap by reading the file or running the grep, or downgrade the claim to a less specific verdict you CAN cite.

## What to Check

Load `.context-index/constitution.md`. Check:

- **Architecture Boundaries.** Verify no boundary was crossed. Common violations: new services or database tables created without approval, authentication flows modified, unauthorized dependencies added.
- **Non-Negotiable Principles.** Verify each principle is respected in the implementation. This is a semantic check: read the code and assess whether the principle's intent is honored.
- **Coding Standards.** Verify naming conventions, pattern usage, and structural conventions match the constitution. This complements the linter (Check 1) with standards that cannot be machine-checked.

Record PASS or FAIL with the specific principle/boundary, code location, and the evidence required above.

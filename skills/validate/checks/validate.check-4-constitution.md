# Check 4: Constitution Compliance

Load `.context-index/constitution.md`. Check:

- **Architecture Boundaries.** Verify no boundary was crossed. Common violations: new services or database tables created without approval, authentication flows modified, unauthorized dependencies added.
- **Non-Negotiable Principles.** Verify each principle is respected in the implementation. This is a semantic check: read the code and assess whether the principle's intent is honored.
- **Coding Standards.** Verify naming conventions, pattern usage, and structural conventions match the constitution. This complements the linter (Check 1) with standards that cannot be machine-checked.

Record PASS or FAIL with specific principle/boundary violated and code location.

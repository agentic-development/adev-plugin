# Check 3: Charter Consistency

Load the Feature Charter referenced by the spec. Verify:

- **Scope boundaries.** The implementation does not introduce functionality outside the charter's defined scope. New endpoints, models, or UI components that are not described in the charter's Capability Map are flagged.
- **Domain model alignment.** Entity names, relationships, and boundaries in the code match the charter's Domain Model section.
- **Interface contracts.** API signatures, request/response shapes, and event payloads match the charter's Interface Contracts section (if defined).

Record PASS or FAIL with specific references to charter sections and code locations.

**Cross-repo dependency context (workspace-aware validation mode only):** When workspace-aware validation mode is active, Check 3 includes the cross-repo dependency specs as additional scope context. The validator must verify that the implementation does not assume interfaces or behaviours from sibling repos that are not documented in the dependency specs. Undocumented cross-repo assumptions are flagged as WARN.

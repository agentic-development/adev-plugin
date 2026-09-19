## Audit Pass 11: Milestone Coverage

**Goal:** Report delivery readiness per milestone by cross-referencing charter capability milestones with spec statuses. Identify capabilities with no milestone, and milestones with missing or incomplete specs.

**Steps:**

1. **Scan all charters.** Read every `.context-index/specs/features/*/charter.md`. For each charter, parse the Capability Map table. Extract each capability's name, priority, and milestone.
2. **Scan all specs.** Read every `*.spec.md` file under `.context-index/specs/features/`. Parse frontmatter for `charter`, `milestone`, and `status`.
3. **Match capabilities to specs.** For each charter capability, find the corresponding spec by:
   - Matching `milestone` in the spec to the capability's milestone, AND
   - Matching the spec's `charter` field to the charter's module name.
   - If no milestone match, fall back to matching by capability name similarity against spec titles.
4. **Group by milestone.** For each distinct milestone found across all charters:
   - List all capabilities assigned to that milestone.
   - For each capability, show the matching spec and its status (or "(no spec created)" if none).
   - Compute a summary: N specified, M implemented, K in review, J draft, L missing.
5. **List un-milestoned capabilities.** Capabilities with no milestone assigned, grouped by charter. Include their priority for triage.

**Output format:**
```
## Milestone Coverage

### v1
- auth/password-login — implemented ✓
- auth/session-management — review-passed
- task-boards/create-boards — draft
  → 1/3 implemented, 1 in review, 1 draft

### v2
- auth/sso-integration — (no spec created)
  → 0/1 specified (1 charter capability without a spec)

### Un-milestoned Capabilities
- auth: MFA — nice-to-have, no milestone assigned
- task-boards: board-analytics — should-have, no milestone assigned

**Actions:**
- [ ] Create spec for auth/sso-integration (v2 capability with no spec)
- [ ] Assign milestone to 2 un-milestoned capabilities
```

**Integration with summary table:** Add a row for Milestone Coverage in the report summary:
```
| Milestone Coverage | WARN | 1 unspecified capability, 2 un-milestoned |
```

## Extract Mode (`--extract`)

For brownfield codebases. Reads existing source code and produces a "snapshot spec" that captures current behavior. Documents what IS, not what SHOULD BE.

### Step 0: Lifecycle entry event

Emit the entry event from the Shared: Lifecycle Events section before any other action in this mode.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Identify Code to Extract

If the user provides a module name, scan the codebase for associated files using the charter's file references, directory conventions, and `platform-context.yaml`. If the user provides specific file paths, use those directly.

```
Analyzing module: user-management

Found relevant files:
  src/app/api/users/route.ts          (API routes, 142 lines)
  src/lib/auth/permissions.ts          (Permission checks, 89 lines)
  src/components/user-profile.tsx      (Profile UI, 201 lines)

→ Extract a spec from all of these, or select specific files? (all / select)
```

### Step 3: Read and Analyze Code

Read each selected file. For each, identify:
- Public interface (exports, API endpoints, component props)
- State mutations (database writes, state updates, side effects)
- Error handling (try/catch, error responses, validation)
- Dependencies (imports, external services, database queries)

### Step 4: Generate Snapshot Spec

Produce a Live Spec where:

- **Behavioral Contract** describes observed behavior. Use comment: `<!-- Extracted from existing code. Describes current behavior as of YYYY-MM-DD. -->`
- **Behaviors** are derived from code paths. Each public function or API endpoint becomes one or more behavior statements. Render them with behavior IDs exactly as standard mode's *Step 4: Interactive Spec Authoring* describes: an unordered list, each item opening with a bolded `BEH-<n>`, under a `<!-- retired-behavior-ids: (none) -->` comment.
- **Error Cases** come from existing error handling code. Flag unhandled cases:
  ```
  | Missing auth token | Returns 401 | 401 |
  | Invalid user ID | ⚠ UNHANDLED — throws raw Prisma error | 500 |
  ```
- **Actionable Task Map** is replaced with a **Coverage Gaps** section:
  ```
  ## Coverage Gaps
  - No rate limiting on user creation endpoint
  - Permission checks bypass for admin role is implicit, not tested
  - Profile image upload has no size validation
  ```
- **Constitution Reference** flags observed violations:
  ```
  - "All database queries use parameterized statements" — ✓ Compliant
  - "Error responses use standard error envelope" — ⚠ VIOLATION: /api/users/[id] returns raw error strings
  ```

Add `mode: extract` and `extracted-from: [<file list>]` to frontmatter per the shared section.

Load context per the shared section above. Save to `.context-index/specs/features/<module>/<spec-slug>.spec.md`.

### Step 4.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 5: Summary

Emit the lifecycle exit event from the Shared: Lifecycle Events section (`--status completed --verdict PASS`).

Output the shared summary template with these stats:
```
  Extracted from: <N> files (<N> lines analyzed)
  Behaviors documented: <count>
  Error cases: <count> (<N> unhandled)
  Coverage gaps: <count>
  Constitutional violations: <count>

  This spec captures current behavior. It does NOT prescribe changes.
  To plan improvements, use:
  - /adev:specify --refactor <module> (for structural changes)
  - /adev:specify <module> (for new capabilities)
```

---

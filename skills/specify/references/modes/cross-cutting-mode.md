## Cross-Cutting Mode (`--cross-cutting`)

Produces specs for concerns spanning multiple features: authentication, error handling, API versioning, logging, etc.

### Step 0: Lifecycle entry event

Emit the entry event from the Shared: Lifecycle Events section before any other action in this mode. Note that for cross-cutting specs, the `--spec` path is `.context-index/specs/cross-cutting/<slug>.spec.md`, not `.context-index/specs/features/<module>/<slug>.spec.md`.

### Step 1: Prerequisites

Cross-cutting specs do not require a Feature Charter. They require:
- `.context-index/constitution.md` (mandatory)
- `.context-index/specs/product.md` (recommended, for module awareness)

### Step 2: Identify the Concern

```
→ What cross-cutting concern do you want to spec?
  Examples: authentication flow, error handling, API versioning,
  logging/observability, rate limiting, caching strategy

→ Which modules does this concern touch? (all / list specific modules)
```

### Step 3: Load Affected Charters

Load context per the shared section above (constitution, product charter). If specific modules are named, load their charters. Identify existing references to the concern.

### Step 4: Interactive Spec Authoring

Same process as standard mode (behavioral contract, constitution reference, task map, acceptance criteria), with these additions:

**Module Impact Map:**
```
| Module | Impact | Changes Required |
|--------|--------|-----------------|
| task-boards | High | Add auth checks to all task mutations |
| user-management | Medium | Expose permission API for other modules |
| notifications | Low | Read-only, only needs auth token validation |
```

**Integration Points:**
```
1. task-boards ↔ auth: Task mutations call checkPermission(userId, boardId, 'edit') before writes.
2. notifications ↔ auth: Notification reads validate session token via middleware.
3. user-management ↔ auth: Canonical permission definitions live here. Other modules import.
```

### Step 5: Write the Spec

1. **Resolve kind first** (apply Step 3.5 of Standard mode): if `--kind` was not passed, prompt with the ask-first menu. Any kind is permitted; the workflow and kind axes are orthogonal.
2. **Resolve the template via `resolveTemplate('spec', kind, domain)`** (see Standard mode Step 5). Do not hardcode the template filename. Handle `TEMPLATE_NOT_FOUND` and `UNSAFE_TEMPLATE_PATH` the same way Standard mode does.
3. Add Module Impact and Integration Points after the standard template sections.
4. Set frontmatter per the shared section with `mode: cross-cutting`, `affects: [<modules>]` instead of `charter:`, AND an explicit `kind: <chosen value>` field (no defaulting).
5. Save to `.context-index/specs/cross-cutting/<spec-slug>.spec.md`.

### Step 5.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 6: Summary

Emit the lifecycle exit event from the Shared: Lifecycle Events section (`--status completed --verdict PASS`). The spec path is `.context-index/specs/cross-cutting/<slug>.spec.md`.

Output the shared summary template with these stats:
```
  Affects: <N> modules
  Behaviors: <count>
  Integration points: <count>
  Acceptance criteria: <count>

  Review the module impact with each module's maintainer.
```

---

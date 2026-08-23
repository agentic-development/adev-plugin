## Audit Pass 5: Spec-to-Code Drift

**Goal:** Compare the repo map against `orientation/architecture.md` to detect structural drift.

**Steps:**

1. Check if `.context-index/hygiene/repo-map.md` exists. If not, suggest running `/adev:repomap` first.
2. Read `.context-index/orientation/architecture.md`.
3. Extract module names, key files, and relationships described in the orientation doc.
4. Compare against the repo map:
   - **New high-importance symbols not in orientation:** Symbols with high reference counts (top 20% in the repo map) that are not mentioned in orientation. These represent important code that the orientation does not describe.
   - **Orientation references to deleted code:** Files or modules mentioned in orientation that no longer exist in the repo map. These are stale orientation entries.
   - **Structural changes:** New top-level directories or modules that appeared since the orientation was written.
5. Check the repo map's staleness marker (commit hash) against current HEAD. If the repo map is more than 50 commits behind, flag as STALE_MAP.

**Output format:**
```
## Spec-to-Code Drift

Repo map: generated at abc1234 (current HEAD: def5678, 23 commits behind)
Orientation: last updated 2026-03-01

### New Important Symbols (not in orientation)
- [ ] src/lib/payments/stripe-client.ts: StripeClient (referenced by 8 files)
- [ ] src/lib/notifications/email-sender.ts: sendEmail() (referenced by 6 files)

### Stale Orientation References
- [ ] orientation mentions src/lib/api-v1/ — directory no longer exists
- [ ] orientation mentions AuthProvider class — renamed to ClerkAdapter

### New Modules
- [ ] src/lib/analytics/ — new directory, 12 files, not described in orientation

**Actions:**
- [ ] Run `/adev:repomap` to refresh the repo map
- [ ] Update orientation/architecture.md to describe payments and notifications modules
- [ ] Remove api-v1 references from orientation
```

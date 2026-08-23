## Audit Pass 3: ADR Currency

**Goal:** Verify that ADRs reference current code and are not superseded.

**Steps:**

1. List all ADR files in `.context-index/adrs/`.
2. For each ADR:
   - Extract file paths and symbol names referenced in the ADR body.
   - Check that referenced files still exist. Flag deleted references as STALE_REF.
   - Check the ADR status field. Flag ADRs marked "proposed" that are older than 30 days (decision never finalized).
3. Scan recent git history for architectural changes that lack ADRs:
   ```bash
   git log --oneline --since="60 days ago" --diff-filter=A -- "**/schema.prisma" "package.json" "**/auth/**" "**/middleware/**"
   ```
   - For each significant change (new schema model, new auth provider, new middleware), check if a corresponding ADR exists.
   - Flag undocumented architectural changes as MISSING_ADR.

**Output format:**
```
## ADR Currency

Total ADRs: 4
Current: 3
Issues: 2

- [x] 001-session-store-redis.md — references valid, status: accepted
- [ ] 002-api-versioning-v2.md — STALE_REF: src/lib/api-v1.ts deleted
- [x] 003-clerk-auth.md — references valid, status: accepted
- [ ] 004-blob-storage.md — status: proposed (45 days old, never finalized)

### Missing ADRs
- [ ] 2026-03-05: Added stripe integration (prisma/schema.prisma changed) — no ADR found

**Actions:**
- [ ] Update 002-api-versioning-v2.md to reference current API files
- [ ] Finalize or supersede 004-blob-storage.md
- [ ] Draft ADR for Stripe integration
```

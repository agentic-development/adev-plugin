## Audit Pass 1: Constitution Freshness

**Goal:** Verify that agent files are in sync with the constitution and that all pointers resolve.

**Steps:**

1. Read `.context-index/constitution.md`.
2. For each sync target in `manifest.yaml` (CLAUDE.md, AGENTS.md, .cursorrules, etc.):
   - Check that the target file exists.
   - Compare the constitution content in the target against `constitution.md`.
   - If they differ, flag as DRIFT.
3. Validate context routing pointers in the constitution:
   - Every file path referenced in the "Context Routing" section must exist on disk.
   - Flag missing files as BROKEN_POINTER.
4. Check section completeness. The constitution should have all six required sections:
   - Identity, Non-Negotiable Principles, Coding Standards, Architecture Boundaries, Context Routing, Quality Gates.
   - Flag missing sections as INCOMPLETE.
5. Check line count against `max_lines` in manifest (default: 200). Flag if over limit.

**Output format:**
```
## Constitution Freshness

- [x] constitution.md exists (92 lines, under 200 limit)
- [x] Section completeness: 6/6 sections present
- [ ] CLAUDE.md: DRIFT — constitution updated 2 days after last sync
- [x] AGENTS.md: in sync
- [ ] Context routing: BROKEN_POINTER — .context-index/specs/features/payments/charter.md does not exist
- [x] Context routing: 11/12 pointers valid

**Actions:**
- [ ] Run `/adev:sync` to update CLAUDE.md
- [ ] Remove or create .context-index/specs/features/payments/charter.md
```

**Auto-fix (if `--fix`):** Run `/adev:sync` for drift issues.

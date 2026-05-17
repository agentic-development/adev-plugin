<!-- DO NOT EDIT statuses inline — see lifecycle log hygiene-kind-validity.jsonl -->
# Implementation Plan: Hygiene Kind Validity Audit

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/hygiene-kind-validity.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-14, CON-4 + SA-10 resolved in rev 2)
> **Platform:** Node.js (ESM); markdown SKILL.md

**Goal:** Add a new audit pass to `/adev:hygiene` that validates `kind:` on every spec and charter, emitting non-blocking findings.

**Architecture:** SKILL.md content edit + supporting library code if needed. Pass is non-blocking; severities are `error` / `warn` / `info` but do not gate exit code (Layer 1 soft-validation posture).

---

## File Structure

**Modify:**
- `skills/hygiene/SKILL.md` — document the new audit pass

**Create:**
- `lib/hygiene/kind-validity.mjs` — the pass implementation (extracted helper so it's testable in isolation)
- `tests/lib/hygiene-kind-validity.test.mjs`

**Reference:**
- `lib/kinds.mjs`, `lib/git-timestamp.mjs` (from read-time-defaulting Task 1)
- `manifest.yaml` — for `MODULE_KIND_NO_MANIFEST` cross-reference

## Context Packets

### Task 1-4 Context
- Spec: hygiene-kind-validity.spec.md (all sections)
- Spec: read-time-defaulting.spec.md (Interaction Contract — hygiene audit on read)
- Existing: `skills/hygiene/SKILL.md` (find audit-pass insertion point)

## Parallelization

Tasks 1 → 2 → 3 → 4 sequential within this plan; can land in parallel with specify/brainstorm routing.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | lib/hygiene/kind-validity.mjs core pass | medium | unit | kind-enumeration, frontmatter-discriminator, git-timestamp | 1 create |
| 2 | Manifest cross-reference for kind:module | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Document pass in SKILL.md | small | unit | Tasks 1, 2 | 1 modify |
| 4 | Test coverage (4 finding codes + non-blocking exit) | medium | unit | Tasks 1-3 | 1 create |

---

### Task 1: lib/hygiene/kind-validity.mjs core pass [specialist: none]

**Charter capability:** Kind-aware hygiene
**Strategy:** unit
**Files:**
- Create: `lib/hygiene/kind-validity.mjs`
**Tests:** Task 4

- [ ] Export `runKindValidityPass(projectRoot, options)` returning `{ findings: [...] }`
- [ ] Enumerate all `*.spec.md` and `charter.md` files via the file-suffix glob
- [ ] For each: parse frontmatter (using the frontmatter-discriminator-extended parser); inspect `kind`, `kindValid`, `kindResolved`
- [ ] Emit findings per the code table:
  - `kindValid === false` → `INVALID_KIND` (severity `error`, non-blocking)
  - `kindResolved === 'default'` AND creation timestamp > cutover → `MISSING_KIND` (severity `warn`)
  - `kindResolved === 'default'` AND creation timestamp < cutover → `LEGACY_DEFAULTED` (severity `info`)
  - parser threw → `PARSE_ERROR` (severity `error`)
- [ ] Use `getCreationTimestamp` from `lib/git-timestamp.mjs`; attach warning if mtime fallback used
- [ ] Return findings; never set process exit code (entirely non-blocking in Layer 1)

### Task 2: Manifest cross-reference for kind:module charters [specialist: none]

**Charter capability:** Kind-aware hygiene
**Strategy:** unit
**Files:**
- Modify: `lib/hygiene/kind-validity.mjs`
**Tests:** Task 4
**Depends on:** Task 1

- [ ] Load `manifest.yaml` via `loadManifest(projectRoot)`; extract `modules[].slug` values
- [ ] For each `charter.md` with `kind: module`: derive module slug from path (`features/<slug>/charter.md`); check membership in manifest modules
- [ ] If not found: emit `MODULE_KIND_NO_MANIFEST` (severity `warn`)
- [ ] If manifest missing/malformed: skip just this cross-reference; emit header note

### Task 3: Document pass in SKILL.md [specialist: none]

**Charter capability:** Kind-aware hygiene
**Strategy:** unit
**Files:**
- Modify: `skills/hygiene/SKILL.md`
**Tests:** N/A
**Depends on:** Tasks 1, 2

- [ ] Add the kind-validity pass to the audit-pass enumeration
- [ ] Document the 5 finding codes (INVALID_KIND, MISSING_KIND, MODULE_KIND_NO_MANIFEST, LEGACY_DEFAULTED, PARSE_ERROR) with severities and triggers
- [ ] Make explicit: all findings are non-blocking in Layer 1; severity is for triage priority, not gate-blocking. Note Layer 2 (`issue-463`) may upgrade `error` to gate-blocking after backfill completes
- [ ] Document `--pass kind-validity` if scoped invocation is supported

### Task 4: Test coverage [specialist: none]

**Charter capability:** Kind-aware hygiene
**Strategy:** unit
**Files:**
- Create: `tests/lib/hygiene-kind-validity.test.mjs`
**Tests:** self
**Depends on:** Tasks 1-3

- [ ] One test per finding code on representative fixtures
- [ ] Verify pass never returns non-zero or throws; returned `findings` array is the sole signal
- [ ] Verify mtime-fallback warning surfaces when git unavailable
- [ ] `npm test` passes

---

## Quality Gates

- `skills/hygiene/SKILL.md` documents the new pass
- Tests pass: `npm test`
- Non-blocking exit behavior verified

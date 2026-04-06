# Spec-Lifecycle Interactive Test Findings

Captured during interactive testing on 2026-03-29, branch `feat/spec-lifecycle`.

## Findings (all resolved)

### Finding 1: Legacy charters lack lifecycle frontmatter

**Severity:** Medium — blocks `/adev:status --all` capability aggregation
**Status:** RESOLVED — all 16 charters now have `status: approved`, `revision: 1`, `updated` frontmatter. 6 charters with capability maps now include Status column

---

### Finding 2: Existing specs had no `revision` field

**Severity:** Medium — blocks drift detection at plan gate
**Status:** RESOLVED — backfilled `revision: 1`, `charter-revision: 1`, `updated` into all 40 specs (12 spec-lifecycle + 28 others)

---

### Finding 3: `adev:status` not registered in plugin.json

**Severity:** High
**Status:** RESOLVED — added `adev:status` to `providers/opencode/skills/` and `providers/codex/skills/` (with `agents/openai.yaml` for Codex). Claude Code cache will pick it up on next plugin reload.

---

### Finding 4: spec-lifecycle charter itself lacked lifecycle frontmatter

**Severity:** Medium
**Status:** RESOLVED — added `status: approved`, `revision: 1`, `updated: 2026-03-28` frontmatter

---

### Finding 5: Capability Map Status column never updated

**Severity:** Medium
**Status:** RESOLVED — updated all 13 implemented capabilities to `implemented` in the Capability Map

---

### Finding 6: Review files lacked drift detection metadata

**Severity:** Medium
**Status:** RESOLVED — backfilled `last-reviewed-revision: 1` and `file-sha` (computed via `git hash-object`) into all 12 `.review.md` files

---

### Finding 7: No commits have Spec: trailers

**Severity:** Low
**Status:** Expected — trailers will appear on future commits now that session capture is active

---

### Finding 8: session-capture.sh manifest fallback grep was broken

**Severity:** High — session capture silently failed when provider not passed via stdin
**Status:** RESOLVED — changed `grep -m1 '^provider:'` to `grep -m1 'provider:'` on line 30

---

## Remaining work

- Verify `/adev:status` skill discovery on a fresh Claude Code session (cache rebuild needed)

---

## Test Results (after fixes)

| Test | Description | Status | Notes |
|------|-------------|--------|-------|
| 10 | Template validation | PASS | All 3 templates have lifecycle fields |
| 1 | `/adev:status --all` | PASS | Charter + spec counts correct, session found |
| 2 | `/adev:status --charter spec-lifecycle` | PASS | Frontmatter, capability map, all 12 specs correct |
| 3 | `/adev:status --spec` (single spec) | PASS | All fields present, file-sha matches, no drift |
| 4 | Session capture hook | PASS | Manifest fallback, stdin, provider=none all work |
| 5 | prepare-commit-msg trailers | PASS | Spec, Plan-task, Session trailers + dedup |
| 6 | post-commit session summary | PASS | Session file created with correct metadata |
| 7 | `/adev:hygiene` lifecycle audit | PASS | All 4 checks pass, no drift or staleness |
| 8 | Drift detection gate (`/adev:plan`) | PASS | SHA-based drift detection works, revert confirmed |
| 9 | Source manifest library | PASS | Compute, verify, determinism, empty, missing all pass |

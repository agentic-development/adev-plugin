---
spec: .context-index/specs/features/copilot-provider/copilot-sync-output.spec.md
charter: .context-index/specs/features/copilot-provider/charter.md
date: 2026-05-19
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: 78ec11bfd992cde66e701fba81727cb4a0861864892836da10ef6c0305b3683c
---

# Architecture Review: copilot-sync-output

> **Verdict:** PASS_WITH_NOTES (0 blockers, 8 warnings, 9 suggestions)

## Reviewers Dispatched

| ID | Mode | Profile |
|----|------|---------|
| structural-architect | subagent | reviewer-reasoning |
| security-reviewer | subagent | reviewer-capable |
| consistency-analyzer | subagent | reviewer-fast |

## Cross-Cutting Warnings (flagged by multiple reviewers)

- **Byte-vs-character cap mismatch** (SA-2 + SEC-4 + CON-1). Spec says "≤ 4,000 UTF-8 bytes" in Behaviors §2 and Acceptance Criteria; Behavioral Contract / Postconditions / parent charter say "4,000 characters"; research §Q1 documents the Copilot code-review cap as "4,000 chars." Bytes is the right unit for hard guarantees, but the spec's two units must be reconciled — and the parent charter should be updated to match.
  - **Fix:** Normalize spec wording to bytes throughout; bump charter rev 5 → 6 with matching language.
- **Module slug validation gap** (SEC-1). The `<module>` token in `.github/instructions/<module>.instructions.md` is read from `manifest.yaml:modules[].slug` with no regex validation. The `path.resolve` + `startsWith(projectRoot)` check catches paths that escape `projectRoot` (e.g., `../../../../tmp/x`) but NOT paths that create unintended subdirectories inside `.github/instructions/` (e.g., `slug: foo/bar`). Missing parity with the sibling adapter spec's `^[a-z0-9-]{1,64}$` validation.
  - **Fix:** Validate every module slug against `^[a-z0-9-]{1,64}$` (NFC-normalized) before path construction. Throw `INVALID_MODULE_SLUG: <slug>` on failure. Add synthetic tests for `../escape`, `foo/bar`, empty.

## Structural Architect — PASS_WITH_NOTES

**Warnings:**

- **SA-1 — Drop-tail-first principle ordering is unmotivated.** The constitution does not declare principles to be in priority order. Dropping principle #5 before #1 is defensible only if ordering is asserted somewhere.
  - **Fix:** Either (a) add ordering convention to the constitution, OR (b) emit a visible marker inside the truncated file: `<!-- SYNC_OVERFLOW: principles 4-5 dropped. Source: .context-index/constitution.md -->` so the projection carries its own provenance.
- **SA-2 — Byte-vs-character cap mismatch with charter.** See cross-cutting summary above.

**Suggestions:**

- **SA-3** — Add a one-line rationale for the asymmetry between fatal `CONSTITUTION_TOO_LARGE` and non-fatal `MODULE_NO_CHARTER`.
- **SA-4** — Add a Postcondition: "These files are projection outputs, not operator-editable. Hand-edits will be overwritten on the next `/adev:sync`. Operators wanting per-module overrides must edit the source charter."
- **SA-5** — Module boundary with sibling adapter confirmed clean. No action.
- **SA-6** — File `--prune` for orphaned sync output as a v2 deferred capability in the parent charter.
- **SA-7** — Constitution-reference coverage is correct. No action.
- **SA-8** — Cite ADR-0009 (lifecycle artifact taxonomy) explicitly in System Constitution Reference for the projection-vs-source distinction.

## Security Reviewer — PASS_WITH_NOTES

**Warnings:**

- **SEC-1 — Module slug validation gap.** See cross-cutting summary above.
- **SEC-2 — `applyTo` glob path-injection via `manifest.yaml:modules[].paths`.** A malicious paths entry containing newlines, `---`, or unescaped quotes can inject new frontmatter sections into the emitted `.instructions.md` file, subverting Copilot's behavior on the entire repo.
  - **Fix:** Validate each `paths[]` entry against a glob-allow-list regex (e.g., `^[A-Za-z0-9_\-./*?\[\]{}!,]+$`) before emission. Reject newlines and `---`. Quote each path as a YAML double-quoted scalar with explicit escaping. Throw `INVALID_MODULE_PATH: <module>: <path>` on failure.
- **SEC-3 — Input caps missing.** Spec mentions "minimal allocation-bounded YAML reader" but never specifies caps on manifest size, constitution size, charter size, module count, or paths-per-module. The sibling adapter caps `SKILL.md` frontmatter at 64 KiB; no equivalent is documented here.
  - **Fix:** Document explicit caps: `manifest.yaml` ≤ 256 KiB, `constitution.md` ≤ 256 KiB, each `charter.md` ≤ 256 KiB, `modules[].length` ≤ 256, `paths[].length` ≤ 64 per module. Throw documented error codes.
- **SEC-4 — Byte/char inconsistency.** See cross-cutting summary above.
- **SEC-5 — Constitution-projection trust boundary.** A malicious commit to `.context-index/constitution.md` is projected verbatim into `.github/copilot-instructions.md` and auto-loaded into every Copilot session. The spec performs no semantic validation of projected content.
  - **Fix:** (a) Embed a SHA-256 prefix of the source constitution in the trailing comment for tamper-evidence: `<!-- Source of truth: .context-index/constitution.md@<sha256-prefix> -->`. (b) Optionally add a dangerous-pattern guardrail (regex match against `rm -rf`, `--no-verify`, `--force push`, `chmod 777`, `disable confirmation`) with `# allow-projection: true` opt-out. (c) Document the constitution as a trust boundary requiring human review.

**Suggestions:**

- **SEC-6** — Add `INSTRUCTIONS_DIR_UNUSABLE` error case for ENOSPC/EACCES on `.github/instructions/` creation; document write-then-rename for crash-consistency on the repo-wide file.
- **SEC-7** — Path-confinement check fragility on case-insensitive filesystems. Use `path.relative(projectRoot, resolved)` and assert no `..`/absolute, OR `fs.realpathSync.native()` both sides before `startsWith`.
- **SEC-8** — Add the sibling adapter's "no absolute paths in committed output" acceptance criterion: string-scan emitted content for `/Users/`, `/home/`, `C:\\` substrings.

## Consistency Analyzer — PASS_WITH_NOTES

**Warnings:**

- **CON-1 — Byte/char unit mismatch.** See cross-cutting summary above.
- **CON-2 — Charter Interface Contracts row missing for `/adev:sync` writes.** Charter rev 5 documented the richer `status` shape (per the prior adapter review) but did NOT add Exposed APIs rows for `/adev:sync writes .github/copilot-instructions.md` or `/adev:sync writes .github/instructions/<module>.instructions.md`. The Capability Map covers these, but Interface Contracts should mirror.
  - **Fix:** Add two rows to charter `Exposed APIs` table; bump charter to rev 6 in the same commit that resolves the byte/char issue.
- **CON-7 — `lib/sync/` not in constitution Context Routing table.** Same advisory pattern as the hook-generator SA-5: new directory location not registered.
  - **Fix:** Add `lib/sync/` to constitution Context Routing as a non-blocking hygiene update.

**Suggestions:**

- **CON-9 — `SYNC_OVERFLOW` payload internal inconsistency.** Behaviors §2 says `SYNC_OVERFLOW: <module>` but Acceptance Criteria says `SYNC_OVERFLOW: <principle-names>`. Reconcile — payload should be the dropped principle list (repo-wide event, not per-module).
- **CON-10 — Identity-section droppability ambiguity.** Add an explicit clarifier to Behaviors §2: "The `## Identity` section is never dropped; only Non-Negotiable Principles are eligible for tail-first removal. If Identity alone exceeds 4,000 bytes, `CONSTITUTION_TOO_LARGE` is thrown."

**Verified consistent (no action):** CON-3 (excludeAgent forward-compat), CON-4 (warning-code style), CON-5 (throw-vs-exit convention), CON-6 (path-confinement pattern), CON-8 (cursor symmetry — spec correctly claims structural parity only).

---

## Summary

**Total findings:** 17 (0 blockers, 8 warnings, 9 suggestions)

**Spec is unblocked for `/adev:plan`.** Three of the eight warnings cluster on the byte-vs-char cap reconciliation (single fix). Two more (SEC-1 slug validation, SEC-2 path injection) close real input-validation gaps that the sibling adapter spec already pioneered patterns for. SEC-5 constitution-projection trust boundary is the most novel finding — worth at least the SHA-prefix tamper-evidence comment.

**Recommended revision pass (15–20 min):**

1. **Byte/char normalization** (SA-2 + SEC-4 + CON-1): Convert all "characters" references to "UTF-8 bytes" throughout spec; bump charter rev 5 → 6 with matching language; add CON-2 Interface Contracts rows in the same charter commit.
2. **Module slug validation** (SEC-1): Reuse the adapter's `^[a-z0-9-]{1,64}$` regex; throw `INVALID_MODULE_SLUG`.
3. **Path-injection guard for `applyTo`** (SEC-2): Allow-list regex + explicit YAML escaping; `INVALID_MODULE_PATH` error code.
4. **Input caps** (SEC-3): Cap manifest, constitution, charter sizes + module/path counts mirroring the adapter's 64 KiB SKILL.md cap.
5. **Constitution tamper-evidence** (SEC-5): SHA-256 prefix in the source-of-truth comment.
6. **Principle drop provenance** (SA-1): In-file marker naming dropped principles.
7. **Editorial cleanups** (SA-3, SA-4, CON-9, CON-10): One-line clarifications.

After these the spec is ready for `/adev:plan`.

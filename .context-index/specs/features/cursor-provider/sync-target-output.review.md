---
last-reviewed-revision: 1
file-sha: 97e41a5595caaee81729d355ef3fcee88d24a07a60012e3745e8a324eefd8a2e
---

# Architecture Review: sync-target-output

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/cursor-provider/sync-target-output.spec.md
> **Charter:** .context-index/specs/features/cursor-provider/charter.md
> **Revision under review:** 1
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

Spec E is a focused activation of a half-modeled sync-format. The structural picture:

- **Single-format dispatch wiring.** Adds `cursor` to the existing `format`-switch in `/adev:sync`. No new lifecycle skill, no new module — exactly the pattern established for `claude` / `agents` / `copilot` writers.
- **Output contract is precise.** Eight numbered behaviors covering path resolution, parent-dir creation (`.cursor/rules/` via `ensureDir`), frontmatter shape (`description` + literal-boolean `alwaysApply: true`), body composition rules, the 200-word cap with named error (`CURSOR_BODY_OVERSIZE`), User Additions preservation, Learned Lessons placement (now consistent with CLAUDE.md/AGENTS.md, not appended at EOF as in the legacy `.cursorrules` story), and atomic temp+rename write.
- **Boundaries are correctly classified.** "System Constitution Reference" walks through Principles 2 and 5, the `~/.claude/` anti-pattern, and the two "Requires Human Approval" boundaries — each correctly applied or disclaimed with rationale. Sits in the Autonomous lane.
- **Dependency direction.** Consumes Spec A (manifest), Spec B (adapter), Spec C (hooks), Spec D (CLI dispatch) — all already implemented or validated — and updates a single switch in the setup module's `/adev:sync` skill. No new outward dependencies; no overlap with CursorAdapter's `~/.cursor/` domain.
- **Failure modes are exhaustive** (7 rows): missing target entry (writer not dispatched), permission denied on parent dir, body oversize (loud-fail with a named error class), malformed frontmatter (rewritten wholesale; User Additions still preserved), missing User Additions marker (append empty), dry-run, atomic rename failure.
- **Idempotency invariants are clear.** Re-sync preserves User Additions byte-for-byte; frontmatter is regenerated; missing marker appends fresh empty section. Matches the sibling-format protocol verbatim.
- **Risk level "medium" is appropriate** for a sync-format activation that touches an existing skill, replaces a legacy `.cursorrules` writer, and adds a new project-state file in a Cursor-owned directory.

### SA-1 — suggestion — directory-ownership statement implies, but does not state, the behavior for pre-existing sibling files

- **Location:** Output Contract step 2 (line 53): *"The directory MUST NOT contain `.cursor/rules/` boilerplate written by adev outside of `adev.mdc` — this writer owns exactly one file."*
- **Finding:** This is a sound ownership claim for files *adev writes*, but the failure-mode table does not specify the behavior when the writer encounters pre-existing sibling files in `.cursor/rules/` written by something other than adev (e.g., user-authored `.mdc` files, or files placed there by other tooling). A reader can infer "leave them alone, write only `adev.mdc`" from the file-ownership wording, but making this explicit closes the ambiguity.
- **Recommendation:** Add a one-line clarification to Output Contract step 2: *"Sibling files in `.cursor/rules/` that are not named `adev.mdc` are untouched — this writer scopes its operations to a single file."* Or add a row to the Failure Modes table for "Pre-existing sibling files in `.cursor/rules/`" → "Untouched; writer scopes to `adev.mdc` only." Non-blocking.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

This spec is a local-filesystem write of a project-state artifact derived from `.context-index/constitution.md`:

- **No network, no secrets, no auth/authz.** Local FS operations only, executed under the invoking user's identity. No tokens, API keys, or credentials touched.
- **No path injection surface.** Output path is resolved from `manifest.yaml :: sync.targets[].path` with a hardcoded default of `.cursor/rules/adev.mdc`. Scope is project-local; no `~/.cursor/` literals (correctly enforced — that's `CursorAdapter`'s domain per Spec B, see Constitution Reference line 96).
- **No untrusted-input parsing.** Content source is the project's own `.context-index/constitution.md`. The User Additions block is preserved byte-for-byte from the *existing target file* — same protocol as `claude` / `agents` writers. No new parsing of external data.
- **Atomic write is specified** (temp file + rename, line 72), matching the existing `claude` / `agents` writers. Mitigates partial-write states; the `.tmp` is cleaned up on body-oversize throw (line 86).
- **Loud-fail on body oversize is a positive security property.** Prevents Cursor's always-apply rule from being silently bloated past the documented guidance, which the spec calls out as the *reason* the limit exists (line 86: *"Cursor's always-apply guidance is the reason the limit exists"*). Fail-loud beats fail-quiet for governance-relevant invariants.
- **Frontmatter regeneration is owned by adev.** Spec is explicit (line 87) that malformed user-edited frontmatter is rewritten wholesale on re-sync. This is a *good* security stance — it prevents a malicious actor who edits `.cursor/rules/adev.mdc` directly from sneaking in arbitrary Cursor rule directives (such as a hostile `description` field) that survive a sync.
- **Constitution anti-pattern compliance.** Spec explicitly disclaims `~/.cursor/` literals (line 96) and routes path resolution through the manifest. Closes a class of path-construction bugs by construction.

### SEC-1 — suggestion — trust boundary on User Additions could be made explicit

- **Category:** data-exposure
- **Location:** Output Contract step 6 (line 70) and Failure Modes "User Additions marker missing" row.
- **Finding:** The spec preserves User Additions byte-for-byte on re-sync. If a project's `.cursor/rules/adev.mdc` had User Additions injected by an attacker between syncs (e.g., supply-chain compromise of the repo), those additions would survive every subsequent `/adev:sync` invisibly. This is identical to the existing CLAUDE.md / AGENTS.md protocol — so it's NOT a new risk introduced by this spec — but the trust boundary deserves a one-line note for future readers.
- **Recommendation:** Add a sentence to Constitution Reference or Failure Modes: *"User Additions are trusted as user-authored content reviewed at edit time, not sync time. This is consistent with the `claude` / `agents` writers' trust model and is not a new attack surface introduced by this spec."* Non-blocking; matches the established sibling-format trust boundary.

No blockers. No new attack surface.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Cross-references checked:

- **Sibling Spec A** (`plugin-manifest-and-parity.spec.md`, status: `validated`) — Spec E does NOT duplicate Spec A's three-way version-parity invariant. Spec correctly notes (line 95): *"Principle 5: Version parity — does NOT apply. `.cursor/rules/adev.mdc` is a sync output (project-state artifact), not a plugin manifest."* Consistent.
- **Sibling Spec B** (`cursor-adapter.spec.md`, status: `implemented`) — Spec E explicitly disclaims `~/.cursor/` from its surface (line 96): *"The writer MUST NOT touch `~/.cursor/` — that is `CursorAdapter`'s domain (Spec B)."* No overlap. Consistent.
- **Sibling Spec C** (`hook-config-generator.spec.md`, `implemented`) and **Spec D** (`cli-install-integration.spec.md`, `validated`) — orthogonal concerns; Spec E does not interact. Consistent.
- **Parent charter** (`cursor-provider/charter.md`, revision: 2) — Capability Map row `.cursor/rules/adev.mdc sync output` (charter line 87) is at `specified`. Spec E targets exactly that row. Charter In Scope line 26 names *"`cursor` sync-target format — `/adev:sync` writes `.cursor/rules/adev.mdc` with `alwaysApply: true`, under Cursor's 200-word recommendation, treated as a pointer projection of `.context-index/constitution.md`."* Matches the spec verbatim.
- **Charter Quality Attributes** (line 132) — *"Sync output discipline: `.cursor/rules/adev.mdc` under 200 words; functions as a pointer to `.context-index/constitution.md`, not a duplicate of it."* Spec encodes this as a hard cap (line 68: ≤ 200 words on the *body*, frontmatter excluded; loud-fail with `CURSOR_BODY_OVERSIZE` on overflow). Consistent and strictly more precise.
- **Constitution** — Spec correctly applies/disclaims Principles 2 and 5, the `~/.claude/` anti-pattern, and the two "Requires Human Approval" boundaries.
- **Current state of `cli/index.mjs:465-467`** — Verified: lines 465-468 currently contain the commented stub `# - path: .cursorrules / # format: cursor / # providers: [cursor]`. Spec E's claim that this block must be uncommented and that `path: .cursorrules` must change to `path: .cursor/rules/adev.mdc` matches the source.
- **Current state of `skills/sync/SKILL.md`** — Verified: line 15 has `Cursor: .cursorrules`; line 84 has `### Cursor format (\`.cursorrules\`)` with body "Full constitution content..."; line 101 has the Learned Lessons placement rule *"Placement in .cursorrules and copilot-instructions.md: Append the section at the end of the file."* Spec E targets each of these three exact passages with the new contract. Accurate against the current file.

Three consistency observations:

### CON-1 — suggestion — charter Quality Attributes "under 200 words" is ambiguous about frontmatter; spec disambiguates as body-only

- **Category:** contract
- **This Spec:** Spec E Output Contract line 68: *"The body length (frontmatter excluded) MUST be ≤ 200 words; the writer counts whitespace-delimited tokens between the frontmatter `---` close and the `# User Additions` marker (or EOF)."*
- **Conflicts With:** `cursor-provider/charter.md:132` — Quality Attributes row says `.cursor/rules/adev.mdc` is *"under 200 words"* (no exclusion clause).
- **Finding:** Spec narrows the charter's "under 200 words" to "body only, frontmatter excluded, whitespace-delimited tokens between `---` close and `# User Additions`." This is a sharpening, not a contradiction — but the charter's phrasing is the one that future hygiene/`/adev:retro` passes will quote in audits. A maintainer reading only the charter could read it as "the entire file under 200 words" and then be surprised when the spec's count excludes frontmatter.
- **Recommendation:** During implementation or the next charter pass, edit charter line 132 to read *"body under 200 words (frontmatter excluded)"* so the charter and spec use identical wording. Non-blocking; spec wins as the more precise contract.

### CON-2 — suggestion — charter Capability Map row uses "alwaysApply rule"; spec uses "pointer projection"

- **Category:** terminology
- **This Spec:** Spec E description (line 14, header comment) and Output Contract (line 64) — *"pointer projection to `.cursor/rules/adev.mdc` rather than a full content duplicate"*; *"The pointer body MUST NOT duplicate the constitution."*
- **Conflicts With:** `cursor-provider/charter.md:87` — Capability Map row reads *"`/adev:sync` writes alwaysApply rule when `cursor` is a sync target"*.
- **Finding:** Both descriptions are accurate (the file IS an alwaysApply rule AND a pointer projection), but a future reader scanning only the charter row would not learn that the body is a pointer, not a duplicate. The pointer-vs-duplicate distinction is the load-bearing design choice for Spec E (it's the reason for the 200-word cap and the reason the legacy `.cursorrules` "Full constitution content" writer is being replaced).
- **Recommendation:** Optional one-line charter edit during implementation: change Capability Map row to *"`/adev:sync` writes alwaysApply pointer rule when `cursor` is a sync target"*. Non-blocking.

### CON-3 — suggestion — Task Map item 5 (setup charter line 23 update) is not reflected in Acceptance Criteria

- **Category:** contract
- **This Spec:** Spec E Actionable Task Map task 5 (line 108): *"Update the setup charter's sync-target list (line 23) to mark the `cursor` format as fully modeled (not half-modeled) so future hygiene passes don't re-flag it."*
- **Conflicts With:** Spec E Acceptance Criteria (lines 113-122) — list does not include a check for the setup-charter edit.
- **Finding:** Task 5 is a charter-state cross-edit, but Output Contract (lines 50-78) does not mention this file, and Acceptance Criteria do not list a check for it. A reader implementing strictly from Output Contract + Acceptance Criteria (the usual `/adev:plan` parsing surface) would miss this edit, and hygiene would re-flag the setup charter on the next pass.
- **Recommendation:** Add an acceptance-criterion line: *"Setup charter line 23 is updated to drop the half-modeled annotation for the `cursor` sync-target format."* Or fold task 5 into Output Contract as a numbered subitem. Non-blocking; the task map captures it, but acceptance-criteria parity would catch implementation drift.

No other cross-artifact inconsistencies. The spec uses identical terminology to its siblings (`User Additions`, `Learned Lessons`, `atomic write`, `ensureDir`) and the charter.

---

## Summary

**Total findings:** 5 (0 blockers, 0 warnings, 5 suggestions)

**Cross-spec consistency:** Spec E correctly composes Specs A/B/C/D without duplicating their contracts. It explicitly disclaims `~/.cursor/` from its surface (Spec B's domain), explicitly disclaims version parity (Spec A's domain), and routes through the existing `/adev:sync` format-dispatch pattern. Replaces the legacy `.cursorrules` writer in lockstep with three exact source-file edits.

**Action required:** Spec passes review. The five suggestions are all non-blocking editorial/wording refinements that can be addressed during planning, during implementation, or left for the next charter pass. Proceed to `/adev:plan --spec .context-index/specs/features/cursor-provider/sync-target-output.spec.md`.

**Suggestions to consider during planning:**
- **SA-1** — make the "pre-existing sibling files in `.cursor/rules/` are untouched" rule explicit in Output Contract or Failure Modes.
- **SEC-1** — add a one-line trust-boundary note for User Additions (matches the established sibling-format protocol).
- **CON-1** — tighten charter line 132 to *"body under 200 words (frontmatter excluded)"*.
- **CON-2** — rename the charter Capability Map row to name the pointer-rule design choice.
- **CON-3** — promote Task Map item 5 into Acceptance Criteria so the setup-charter edit isn't missed.

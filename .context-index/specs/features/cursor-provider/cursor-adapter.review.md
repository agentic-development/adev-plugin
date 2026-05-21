---
last-reviewed-revision: 2
file-sha: e82f960d163ddceb5531560d29fee76e72e4fb9d75a210b6975912cda8d9fc02
---

# Architecture Review: cursor-adapter

> **Date:** 2026-05-17
> **Spec:** .context-index/specs/features/cursor-provider/cursor-adapter.spec.md
> **Charter:** .context-index/specs/features/cursor-provider/charter.md
> **Revision under review:** 2
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

Rev 2 fully resolves the prior structural warnings:

- **SA-1 (resolved).** The Postcondition (line 45), Behavioral Contract bullets (lines 27, 29), the new Rationale paragraph (line 30), Task Map row 3 (line 74), and the renamed error-case row (line 56) now all agree that the published artifact is a copy, not a symlink. The Rationale paragraph makes the reason explicit: because the source dirname (`skills/<name>/`) differs from the target dirname (`~/.cursor/skills/adev-<name>/`), a symlink cannot satisfy Cursor's directory-name invariant. The contract is now internally consistent and the planner has unambiguous guidance.
- **SA-2 (resolved).** Acceptance criterion line 93 is now clean prose: *"Charter Capability Map: rows for `CursorAdapter install/uninstall/status` and `Skill name sanitization` flip from `—` to `validated` after this spec lands."* No editorial leak. The criterion is grammatical and machine-readable.

The rest of the structural shape is preserved from rev 1: one new file at `providers/cursor/adapter.mjs`, established adapter contract, no hook-protocol change, no install-path-structure change, no plugin-registration-format change, no new external dependencies. Sits cleanly in the Autonomous lane. Risk level "medium" remains appropriate.

No findings.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

Rev 2 fully resolves both prior suggestions, and the new acceptance criteria turn them into enforced contracts:

- **SEC-1 (resolved).** Constitution Reference (line 62) now reads: *"adapter uses only Node built-ins. Prefer `fs.cpSync` (Node 16.7+) for recursive copy over shelling to `cp -r` (the OpenCode adapter still uses `child_process` for historical reasons; the new CursorAdapter does not need that legacy)."* Task 2 (line 73) specifies `fs.cpSync` with filter. Acceptance criterion line 91 enforces: *"uses `fs.cpSync` rather than shelling out to `cp -r`."* The shell-injection surface is now structurally absent from the new adapter — the documented divergence from OpenCode is a security win, cleanly noted.
- **SEC-2 (resolved).** Constitution Reference Principle 2 (line 63) now pins the sanitization scope explicitly: *"sanitization scope is strictly the SKILL.md YAML frontmatter (the block delimited by leading `---` lines). The frontmatter parser MUST NOT touch the body of SKILL.md; only the `name:` field within the frontmatter is rewritten. Any colon appearing in the body (code examples, prose) is preserved verbatim."* Task 3 (line 74) repeats the constraint ("strictly between leading `---` lines"). Acceptance criterion line 89 enforces: *"Sanitization scope is the SKILL.md YAML frontmatter only — colons in the SKILL.md body are preserved verbatim."* The class of silent-corruption bugs is now closed.

No new security surface introduced by the rev 2 changes. Build-time and install-time local filesystem operations only; no network, no untrusted input, no secrets, no auth/authz. The adapter writes inside user-owned, user-scoped paths.

No findings.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Cross-references checked at rev 2:

- **Spec A** (`plugin-manifest-and-parity.spec.md`, status: `validated`) — Spec B correctly cites `.cursor-plugin/plugin.json` as a precondition (line 38) and lists it as required-in-cache (line 83). No duplication of Spec A's manifest-shape contract.
- **Spec C** (`hook-config-generator.spec.md`, status: `implemented`) — Spec B correctly cites `providers/cursor/hooks.json` as a precondition (line 38) and lists it as required-in-cache (line 83). No duplication of Spec C's generator contract.
- **Charter Capability Map** — Spec B continues to address exactly the two `CursorAdapter install/uninstall/status` and `Skill name sanitization` rows. The charter currently shows both rows at `review-passed` (carried from the rev 1 review pass).
- **OpenCode adapter precedent** — return shape, uninstall no-throw semantics, `detect()` env-or-directory check, `detectConflicts()` shape, and the Superpowers conflict guard all still match. The intentional divergence on copy mechanism (`fs.cpSync` vs OpenCode's `child_process`) is now documented in the Constitution Reference, so it reads as a deliberate cleanup rather than an inconsistency.

**CON-1 (resolved).** The symlink-vs-copy contradiction from rev 1 is fully gone. The spec now consistently treats the published artifact as a regenerated directory of copies in every section, with an explicit Rationale paragraph (line 30) explaining the why.

One small new consistency observation surfaces from the rev 1 → rev 2 charter state transition:

### CON-2 — suggestion — acceptance criterion line 93 references stale starting state

- **Location:** `cursor-adapter.spec.md` Acceptance Criteria, line 93.
- **Finding:** The criterion reads: *"Charter Capability Map: rows for `CursorAdapter install/uninstall/status` and `Skill name sanitization` flip from `—` to `validated` after this spec lands."* The starting state described (`—`) is stale: the charter Capability Map already shows both rows at `review-passed` (charter lines 82, 88), set when this spec passed its rev 1 review. The criterion's *target* state (`validated`) is still correct — that's where `/adev:validate` will land the rows after implementation — but the "from `—`" framing no longer matches the current charter.
- **Why it matters:** Acceptance criteria are read literally by `/adev:plan` and `/adev:validate`. A criterion that names the wrong starting state could produce a noisy plan note or a confused validate diff. This is a minor editorial issue and is suggestion-severity, not a blocker.
- **Recommendation:** Tighten the criterion to: *"Charter Capability Map: rows for `CursorAdapter install/uninstall/status` and `Skill name sanitization` transition to `validated` after this spec is implemented and validated."* Or drop the criterion entirely — the Capability Map transition is automated by `/adev:validate`, so it does not need an authored acceptance criterion.

No other cross-artifact inconsistencies. Acceptance criteria are otherwise well-formed. The spec correctly remains in the Autonomous lane.

---

## Summary

**Total findings:** 1 (0 blockers, 0 warnings, 1 suggestion)

**Rev 2 resolution status:**

- SA-1 / CON-1 (rev 1 warning, symlink/copy contradiction) — **resolved.** Postcondition, Behavioral Contract, Rationale paragraph, Task Map, and renamed error-case row now all consistently say "copy."
- SA-2 (rev 1 warning, editorial leak on AC line 91) — **resolved.** Line is now clean prose.
- SEC-1 (rev 1 suggestion, prefer `fs.cpSync` over shell `cp -r`) — **resolved and enforced** as a new acceptance criterion.
- SEC-2 (rev 1 suggestion, pin sanitization scope to YAML frontmatter) — **resolved and enforced** as a new acceptance criterion and as a Constitution Reference clause.

**New finding:** CON-2 (suggestion) — acceptance criterion line 93's "from `—`" framing is stale relative to the current charter Capability Map state. Non-blocking; can be tightened in-spec or in-plan.

**Action required:** Spec passes review with one minor suggestion. None of the findings are blockers. Proceed to `/adev:plan --spec .context-index/specs/features/cursor-provider/cursor-adapter.spec.md`. CON-2 can be addressed as a one-line edit during planning or left as-is — the criterion's target state is correct, only the starting-state framing is stale.

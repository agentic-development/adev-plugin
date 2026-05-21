---
last-reviewed-revision: 1
file-sha: 7e74fce38d750933a285075e666e92347858beff9be65305745c1e5dba4e597a
---

# Architecture Review: cli-install-integration

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/cursor-provider/cli-install-integration.spec.md
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

Spec D is a small, well-bounded dispatch-wiring spec. The structural picture:

- **Scope is contained.** No new files are created in `cli/index.mjs`'s module space; the spec adds one branch to `installProviders()`, one entry to `selectProvidersInteractive()`, one JSDoc edit, one charter description revision, and one test file. The five-spec grouping (A manifest, B adapter, C hooks, D CLI integration, E sync) cleanly isolates this as the dispatch layer.
- **Dependency direction is correct.** This spec consumes the already-loadable `CursorAdapter` (Spec B), `.cursor-plugin/plugin.json` (Spec A), and `providers/cursor/hooks.json` (Spec C). Dependencies point inward: the CLI dispatcher resolves the adapter via `getProvider("cursor")` from `lib/provider/registry.mjs`, and path resolution flows through `CursorAdapter.getCursorHome()` / `getCursorSkillsDir()` — no `~/.cursor/` literals are introduced in `cli/index.mjs`.
- **No protocol or boundary violations.** Sits squarely in the Autonomous lane: no new lifecycle skill, no hook-protocol change, no plugin-registration-format change, no new external dependencies, no install-path-structure refactor. The CLI install path for Cursor (`~/.cursor/plugins/local/adev`) is owned by Spec B and is parallel to the existing three-provider install paths.
- **Output contract is precise.** Four numbered behaviors for the `cursor` branch (resolve adapter, print heading, call `install({ scope: "user" })`, run `detectConflicts()` with interactive prompt), explicit menu shape ("all providers" returns the four-element list `["claude-code", "opencode", "codex", "cursor"]`), and lockstep edits to the JSDoc comment and cli-charter `install` description.
- **Failure modes are exhaustive for a dispatch-layer spec.** Six rows cover the new-flag-value paths (no `~/.cursor/`, conflict-decline, adapter throw, mid-batch failure of "all providers", repeated `--provider cursor` idempotency, unknown name validator).
- **Acceptance criteria are testable.** Each criterion is either an assertion against `cli/index.mjs` source structure (branch exists, menu returns four-element list, JSDoc names four providers), a file-state assertion (`cli/charter.md` on `revision: 4`), or a test-coverage assertion (`tests/cli.test.mjs` exercises the new path).

Risk level "medium" is appropriate for a CLI dispatch wiring change with new user-visible behavior.

No findings.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

This spec is a CLI dispatch wiring change with **no new attack surface**:

- **No network, no secrets, no auth/authz.** Local filesystem operations only, executed under the invoking user's identity. No tokens, API keys, or credentials touched.
- **Input validation is reused, not introduced.** The `--provider <name>` flag is already validated by `parseProviderArgs` against `getProviderNames()` from `lib/provider/registry.mjs`. Unknown names exit non-zero with `Unknown provider:` — the spec explicitly notes this contract is unchanged. The new `cursor` value is added to the registry by Spec B (already accepted), not by this spec.
- **No shell injection surface.** The spec dispatches `CursorAdapter.install({ scope: "user" })` through the existing dispatcher pattern. No string interpolation into a shell command. `CursorAdapter` itself uses `fs.cpSync` per Spec B's SEC-1 (the OpenCode-style `child_process` shell-out was rejected for the new adapter).
- **Interactive prompt path is reused.** The conflict-detect/disable loop mirrors the `claude-code` branch (`ask`/`success`/`warn` helpers). No new prompt-handling code; no new way for a malicious response to escape its handler.
- **Idempotency is preserved.** Repeated `--provider cursor` flags rely on Spec B's `installed: false` return — no double-write, no race condition introduced by this spec.
- **Failure modes do not leak sensitive state.** The adapter-throw row surfaces the adapter's message via the enclosing `try/catch` in `cmdInstall`, consistent with the other three branches; no stack-trace dump, no path disclosure beyond what `cmdInstall` already prints.
- **Constitution anti-pattern compliance.** The spec explicitly forbids hardcoded `~/.cursor/` literals in `cli/index.mjs` (Constitution Reference, line 75) and routes path resolution through `CursorAdapter`'s helpers. Closes a class of path-construction bugs by construction.

No findings.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Cross-references checked:

- **Sibling Spec A** (`plugin-manifest-and-parity.spec.md`, status: `validated`) — Spec D does not duplicate Spec A's manifest contract; it relies on Spec A's `.cursor-plugin/plugin.json` being present in the plugin tree that `CursorAdapter.install` copies. Consistent.
- **Sibling Spec B** (`cursor-adapter.spec.md`, status: `implemented`) — Spec D consumes `CursorAdapter.install({ scope: "user" })`, `CursorAdapter.detectConflicts()`, and the idempotency contract (`installed: false`). Each consumption matches Spec B's exposed surface exactly (Spec B, lines 38, 41, 64). The spec correctly notes (line 50) that conflict detection mirrors the `claude-code` branch shape — consistent with Spec B's Superpowers guard.
- **Sibling Spec C** (`hook-config-generator.spec.md`, status: `implemented`) — Spec D does not call into Spec C directly; it relies on `providers/cursor/hooks.json` being present in the plugin tree at install time. Consistent.
- **Parent charter** (`cursor-provider/charter.md`, revision: 2) — Spec D addresses exactly the two Capability Map rows it claims: `CLI install integration` and `CLI charter revision`, both currently at `specified` (charter lines 86, 89). The charter's In Scope section names "`adev install` registry gains `cursor` as a target" (charter line 25) and "Update `cli` charter's `install` command description (rev 3 → rev 4)" (charter line 27) — Spec D covers both.
- **CLI charter** (`features/cli/charter.md`, revision: 3) — Verified: the cli charter is currently on `revision: 3` with the `install` command description reading *"Register plugin with provider (Claude Code, OpenCode, Codex), …"* (cli charter, line 46). Spec D's claim that the bump is `3 → 4` and that the parenthetical needs the `Cursor` addition is accurate against the current file state.
- **Constitution compliance** — Pure ESM, no new dependencies, no SKILL.md authoring (this is a CLI verb, not a `/adev:*` skill), no hardcoded `~/.claude/` paths. Anti-pattern on hardcoded `~/.cursor/` literals is explicitly enforced in the spec (Constitution Reference, line 75). Sits in the Autonomous lane.

Two consistency observations:

### CON-1 — suggestion — charter Interface Contracts row uses `--target`, spec uses `--provider`

- **Location:** `cli-install-integration.spec.md` Invocation Modes (line 33) vs. `cursor-provider/charter.md` Exposed APIs row (line 111).
- **Finding:** Charter line 111 documents the interface as `adev install --target cursor`. Spec D uses `--provider cursor` everywhere and acknowledges (line 33): *"Charter prose phrases this as 'adev install accepts cursor as a target'. The implementation flag is `--provider <name>`; 'target' is charter-level vocabulary for the value passed to that flag."* The spec reconciles the vocabulary in-prose, but the charter row in Exposed APIs still names a flag (`--target`) that does not exist in the implementation. A future reader of the charter alone (without this spec open) would search for a `--target` flag and not find it.
- **Why it matters:** The flag-vs-vocabulary distinction is fine, but the charter's Interface Contracts table is the place that names *implementation* surfaces. Naming a non-existent flag there is mild drift.
- **Recommendation:** Address as a one-line edit to the charter during planning or implementation: change `adev install --target cursor` → `adev install --provider cursor` in charter line 111. Or leave it for the v2 charter pass — the spec's in-prose reconciliation makes this non-blocking.

### CON-2 — suggestion — capability map starting-state ("from `—`") is correct here but worth noting consistency with sibling reviews

- **Location:** `cli-install-integration.spec.md` Output Contract (line 56) and Acceptance Criteria (line 97).
- **Finding:** Both passages say capability rows flip *"from `—` to `validated`"*. Verified against the current charter: rows `CLI install integration` (charter line 86) and `CLI charter revision` (charter line 89) are at `specified`, not `—`. The "from `—`" framing was the convention before any review on this spec; now that this review pass lands, those rows will become `review-passed` (per the skill's Step 7), then `validated` after `/adev:validate`.
- **Why it matters:** Same class of editorial nit flagged on Spec B's rev 2 review (CON-2 there). Acceptance criteria are read literally by `/adev:plan` and `/adev:validate`; "from `—`" no longer matches the charter's current state for these two rows by the time implementation begins.
- **Recommendation:** Tighten the acceptance criterion to: *"Charter Capability Map rows for `CLI install integration` and `CLI charter revision` transition to `validated` after this spec is implemented and validated."* Or drop the criterion entirely — the Capability Map transition is automated by `/adev:validate`. Non-blocking; can be a one-line edit at planning time or left as-is.

No other cross-artifact inconsistencies. Acceptance criteria are otherwise well-formed; task map aligns with the contract; failure modes are consistent with the sibling specs and constitution.

---

## Summary

**Total findings:** 2 (0 blockers, 0 warnings, 2 suggestions)

**Cross-spec consistency:** Spec D correctly composes Specs A/B/C without duplicating their contracts. The CLI charter state (`revision: 3`, current `install` description) matches what Spec D plans to mutate. Sits in the Autonomous lane.

**Suggestions:**

- **CON-1** — charter Exposed APIs row at `cursor-provider/charter.md:111` names `--target`; spec D and the implementation use `--provider`. Update the charter to `--provider cursor` to keep the Interface Contracts table accurate.
- **CON-2** — acceptance-criteria phrasing "from `—` to `validated`" is stale relative to the current charter Capability Map state (rows are at `specified`). Tighten to "transition to `validated`" or drop the criterion (automated by `/adev:validate`).

**Action required:** Spec passes review with two minor suggestions. None of the findings are blockers. Proceed to `/adev:plan --spec .context-index/specs/features/cursor-provider/cli-install-integration.spec.md`. Both CON-1 and CON-2 can be addressed as one-line edits during planning or left as-is.

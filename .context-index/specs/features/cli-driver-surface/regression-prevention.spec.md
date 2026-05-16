# Live Spec: Regression Prevention (Constitution Amendment + Pre-Commit Hook)

<!-- Live Spec within the cli-driver-surface charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cli-driver-surface/charter.md -->

---
charter: cli-driver-surface
status: implemented
risk_level: medium
milestone: adev-compiler-discipline
revision: 1
charter-revision: 2
created: 2026-05-14
updated: 2026-05-14
source-manifest:
  sha: "5f6e0f2"
  files:
    - .context-index/constitution.md
    - .githooks/pre-commit
    - .githooks/pre-commit-no-inline-node
    - CLAUDE.md
    - cli/index.mjs
    - hooks/pre-commit-no-inline-node.sh
    - tests/cli.test.mjs
    - tests/constitution.test.mjs
    - tests/hooks/pre-commit-no-inline-node.test.mjs
  computed-at: "2026-05-14T21:51:01.790Z"
drift_detected: true
drift_source: cli/index.mjs
drift_at: 2026-05-16T00:05:50.551Z
---

## Behavioral Contract

Without a structural rule, the inline-Node pattern reaccrues as new skills land — the same drift mechanism flagged in `.context-index/research/adev-vs-compiler-gaps-and-practice.md` §3.3 finding (f). This spec closes the loop by amending the constitution's Anti-Patterns section to forbid inline-Node patterns and shipping `hooks/pre-commit-no-inline-node.sh` that mechanically enforces both (a) no new inline-Node blocks, and (b) the per-skill atomic invariant from the charter's Domain Model — no SKILL.md may contain both an inline-Node block AND an `adev <verb>` invocation within the same H3 section. The amendment + hook together make the sweep durable: bypassing requires either turning off the hook or rewriting the constitution.

### Preconditions

- `inline-node-extraction-sweep` spec at least 50% complete (mid-sweep is fine; the hook ships before the sweep finishes so new accruals are blocked from the moment it lands).
- `.githooks/pre-commit` exists (per repo convention; if not, this spec creates the chained-hook entry).
- `core.hooksPath` is set to `.githooks/` (handled by `cli/index.mjs::setupGitHooks` at install time).

### Behaviors

1. **When** the constitution amendment is applied, **then** `.context-index/constitution.md`'s `## Anti-Patterns to Avoid` section gains two new bullets: (a) *"No `Run inline Node.js:` step directives, `node --input-type=module -e "..."` heredocs, or `node -e "..."` invocations inside `skills/*/SKILL.md`. Skills name a CLI subcommand (`adev <verb> …`) or a helper script; the helper body lives in `lib/cli/` or `scripts/`."* (b) *"No SKILL.md contains both an inline-Node block AND an `adev <verb>` invocation within the same H3 section (the per-step boundary; enforces per-skill atomic migration from the cli-driver-surface charter)."*
2. **When** the amendment is applied, **then** `/adev:sync` propagates the new anti-patterns into `CLAUDE.md` and other agent-mirror files (governed by `manifest.yaml::sync.targets`).
3. **When** a commit is staged that adds new content matching `Run inline Node|node --input-type=module -e|node -e` to any `skills/**/SKILL.md` file, **then** `hooks/pre-commit-no-inline-node.sh` exits with code 2, blocking the commit, and prints to stderr: `"[pre-commit-no-inline-node] Inline Node forbidden in SKILL.md per constitution Anti-Patterns. File: <path>. Match: <pattern>"`.
4. **When** a commit is staged that produces a `skills/**/SKILL.md` containing BOTH an inline-Node pattern AND an `adev <verb>` invocation within the same H3 section (`### ...` heading boundary), **then** the hook exits 2 with: `"[pre-commit-no-inline-node] Per-skill atomic invariant violated. File: <path>. H3 section: <heading>. Same section has both inline-Node and adev <verb> call."`.
5. **When** the hook is invoked, **then** it (a) enumerates staged SKILL.md files via `git diff --cached --name-only -- 'skills/**/SKILL.md'`, (b) for each file retrieves the full staged blob via `git show ":$file"` (quoted to handle paths with spaces), (c) parses each file by H3 headings (an H3 section spans from `### ` to the next line beginning with `## ` or `### ` or EOF), (d) scans each section for the forbidden patterns and for `adev ` calls, (e) emits per-violation messages — never a single aggregate "something failed" message.
6. **When** the hook detects no violations across staged `skills/**/SKILL.md` files, **then** it exits 0 silently (no output).
7. **When** the hook is invoked on a commit that touches `providers/*/skills/*/SKILL.md`, **then** it does NOT scan those files — provider mirrors are out of scope per the charter Question 7 decision.
8. **When** the hook is invoked from `git commit` AND the staged changes include both `skills/**/SKILL.md` files and other files, **then** the hook ignores non-`skills/**/SKILL.md` files and reports only on the relevant ones.
9. **When** `tests/hooks/pre-commit-no-inline-node.test.mjs` runs, **then** it covers each rejection rule and the no-violation case using `runHook()` from `tests/helpers.mjs` (existing test helper for hooks).
10. **When** the constitution amendment lands, **then** `tests/constitution.test.mjs` (if it exists, or new test if not) asserts both new anti-pattern bullets are present.

### Postconditions

- `.context-index/constitution.md` `## Anti-Patterns to Avoid` section has two new bullets (text in Behavior 1).
- `/adev:sync` has been run; `CLAUDE.md` reflects the amendment.
- `hooks/pre-commit-no-inline-node.sh` exists, is executable, and is registered in the `.githooks/pre-commit` chain via `cli/index.mjs::buildChainedHook`. This is a *git* pre-commit hook (not a Claude Code harness hook), so it does NOT register in `hooks/hooks.json` — the hooks charter's `hooks/hooks.json` registry is for Claude Code lifecycle hooks (SessionStart, PreToolUse, etc.). Git hooks live in `.githooks/`.
- `tests/hooks/pre-commit-no-inline-node.test.mjs` exists and is green.
- Charter Capability Map: rows "Constitution amendment" and "`hooks/pre-commit-no-inline-node.sh`" have `Status: specified` (and `implemented` post-implementation).

### Error Cases

| Condition | Expected Behavior |
|---|---|
| Hook invoked when `git diff --cached` returns nothing (e.g., empty commit attempt) | Exit 0 silently |
| Staged file contains an inline-Node *removal* (line deleted), not addition | Allow — the diff shows fewer matches than baseline; hook checks only `+` lines for patterns |
| Staged file's H3 parsing fails (malformed markdown, unexpected structure) | Log warning to stderr (`[pre-commit-no-inline-node] could not parse H3 sections in <path>; defaulting to whole-file scan`), then scan whole file for both patterns; if both present, reject |
| Hook detects an inline-Node block in a non-SKILL.md `.md` file | Ignored — scope is `skills/**/SKILL.md` only |
| Hook script itself crashes (uncaught exception) | Exit 1 (not 2) so it doesn't masquerade as a "policy violation"; the caller sees a clear "hook crashed" error and can investigate |
| `providers/codex/skills/<name>/SKILL.md` contains an inline-Node block | Hook ignores; out of scope (provider mirrors handled by separate future charter) |
| Two H3 sections separately contain inline-Node and `adev <verb>` (in different sections) | Allowed — the invariant is per-H3-section, not per-file |
| Inline-Node pattern in a code block fence (e.g., a markdown example of what NOT to do) | This is a known false-positive concern; the constitution amendment text itself contains the forbidden pattern as a quoted example. The hook scans only fenced code blocks of language `javascript`/`js`/`node` AND `Run inline Node` headings — pattern-in-prose inside backticks like `` `node -e ...` `` does not trigger because the hook regex requires the heredoc shape (multi-character literal context) or the `Run inline Node.js:` heading. Documented edge case in the hook header. |

## System Constitution Reference

- **Principle 4 ("Hook protocol compliance"):** The hook is bash, reads `git diff --cached`, exits 0 (allow) or 2 (block); stdout/stderr usage per protocol.
- **Constitution `## Anti-Patterns to Avoid` section:** This spec amends it; the existing bullets (No CommonJS, No executable logic inside SKILL.md files, No hardcoded paths to `~/.claude/`) remain.
- **Principle 1 ("Minimize external dependencies"):** Hook is bash + `git`, no external tools.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Draft amendment text for `## Anti-Patterns to Avoid` | Two bullets per Behavior 1; reviewed by /adev:sync to ensure CLAUDE.md propagation | Small |
| Apply amendment to `.context-index/constitution.md` | Direct edit; preserves all other existing content | Small |
| Run `/adev:sync` to propagate to `CLAUDE.md` and other agent files | Mechanical | Small |
| Implement `hooks/pre-commit-no-inline-node.sh` | Bash script: `git diff --cached --name-only`, filter to `skills/**/SKILL.md`, for each file `git show :<file>` + grep + H3 section parser; exit 0/2 per behavior matrix | Medium |
| Register hook in `.githooks/pre-commit` chain | Use existing `buildChainedHook` pattern from `cli/index.mjs` or add to existing chain | Small |
| Update `cli/index.mjs::setupGitHooks` to include the new hook in fresh installs | One-line addition | Small |
| Write `tests/hooks/pre-commit-no-inline-node.test.mjs` | Use existing `runHook()` from `tests/helpers.mjs`; cover all behaviors and error cases | Medium |
| Document hook in `skills/sync/SKILL.md` or wherever hooks are documented | Add brief description of the hook | Small |

## Acceptance Criteria

- [ ] Constitution `## Anti-Patterns to Avoid` section has two new bullets matching Behavior 1
- [ ] `CLAUDE.md` reflects the amendment after `/adev:sync`
- [ ] `hooks/pre-commit-no-inline-node.sh` exists, is executable, is in `.githooks/pre-commit` chain
- [ ] Committing a file matching `Run inline Node|node --input-type=module -e|node -e` in `skills/**/SKILL.md` is rejected with exit 2 and clear message
- [ ] Committing a SKILL.md with both inline-Node and `adev <verb>` in same H3 section is rejected with exit 2
- [ ] Committing a SKILL.md with both forms in *different* H3 sections is allowed
- [ ] Hook ignores `providers/*/skills/*/SKILL.md` (out of scope)
- [ ] Hook ignores non-SKILL.md `.md` files
- [ ] Hook exits 0 silently when no violations
- [ ] Hook script crash exits 1 (distinguishable from policy-violation exit 2)
- [ ] `tests/hooks/pre-commit-no-inline-node.test.mjs` covers all behaviors and error cases
- [ ] `cli/index.mjs::setupGitHooks` includes this hook on fresh `adev install`
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced

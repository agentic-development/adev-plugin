---
topic: "Session logging UX — making post-commit session capture seamless and automatic"
date: "2026-05-20"
relates-to: ""
sources:
  - internal
  - web
  - "github:agentic-development/adev-plugin"
status: draft
---

## Summary

The post-commit hook writes a `.context-index/sessions/<date>-<sha>.md` file after every commit, but the file lands tracked-and-uncommitted and the installer documents a manual batching step (`git commit -m 'chore(sessions): record ...'`). The result is awkward UX: ~396 session files already exist in this repo, one currently sits untracked, and the install copy half-apologizes for the workflow. Two viable directions: (1) **daily rollup + auto-stage** to make capture self-batching with no synthetic commits, or (2) **local-first with explicit sync** to remove the artifact from the shared surface entirely.

## Findings

### Internal

**Capture pipeline (current state):**
- `hooks/session-capture.sh` (PostToolUse) appends one JSONL line per tool call to `.context-index/.session-tracking.jsonl`. Enriches with `issue`/`epic` binding from execution state and per-session token usage / cost.
- `.githooks/post-commit` runs after every commit: pulls commit subject/body, changed files, and the accumulated JSONL, then calls `lib/session-summary.mjs:writeSummary()` to render `.context-index/sessions/<date>-<sha>.md`. Then truncates `.session-tracking.jsonl`.
- File metadata: `{ date, type: 'commit', mode: 'auto', agent: 'git-hook', specsTouched: [...], commits: [<sha>] }`. Sections: `## Intent` (commit message), `## Outcome` (files changed + tool counts).

**Tracked footprint:**
- 396 files in `.context-index/sessions/`, ranging from `2026-03-29-641c7c2.md` through `2026-05-19-ca1f62d.md`.
- Recent git log shows users *do* periodically batch them: `chore(sessions): record 2026-05-18 verbosity-axis transcripts`, `chore(lifecycle): record drift events and 2026-05-17/18 session transcripts`, etc. — confirms the documented workflow but also confirms it requires conscious effort.
- `cli/index.mjs:759-763` and `:898-902` (install + upgrade flows) print the manual-batching note. Same copy duplicated in both code paths.

**Downstream consumers (not yet fully audited — see open questions):**
- `lib/session-parser.mjs` reads `~/.claude/projects/<hash>/sessions/` (Claude Code's own session JSONL), *not* `.context-index/sessions/`. Distinct concern.
- `/adev:retro` is the most likely consumer of `.context-index/sessions/` for delivery-metric extraction. Not verified in this pass.

### Web

Not searched — analysis grounded in the project's own code and constitution.

### GitHub

Not searched.

## Code Examples

**Current post-commit summary structure** (`.githooks/post-commit:31-107`):

```bash
# Reads commit info + accumulated JSONL, renders markdown, clears tracking file
node --input-type=module -e "
  import { writeSummary } from './lib/session-summary.mjs';
  const metadata = {
    date: '${COMMIT_DATE}'.slice(0, 10),
    type: 'commit', mode: 'auto', agent: 'git-hook',
    specsTouched: '${SPECS_TOUCHED}'.split(',').filter(Boolean),
    commits: ['${COMMIT_HASH}'],
  };
  // ... renders Intent (commit msg) + Outcome (files + tool counts)
  await writeSummary(condensed, metadata, '${OUTPUT_DIR}');
  if (sessionLines) writeFileSync('${TRACKING_FILE}', '', 'utf8');
"
```

**Install-time apology copy** (`cli/index.mjs:759-763`, duplicated at `:898-902`):

```javascript
log("Note: the post-commit hook auto-generates .context-index/sessions/<date>-<sha>.md");
log("      summary files (tracked content — not in the installer's .gitignore list).");
log("      Batch them periodically with: git commit -m 'chore(sessions): record YYYY-MM-DD transcripts'");
log("      Add .context-index/sessions/ to .gitignore if you'd rather skip the audit surface.");
log("      Full details: docs/hooks.md > Git Hooks > post-commit");
```

The text itself reveals the design tension: the hook writes tracked content but expects manual reconciliation.

## Recommendations

Ranked by impact / feasibility:

1. **Daily rollup file + auto-stage on next commit** *(preferred)* — Change `.githooks/post-commit` to append to `.context-index/sessions/YYYY-MM-DD.md` instead of creating a per-commit file. Then `git add` that one file at the end of the hook so the *next* commit naturally absorbs the rolling log. Net effect: file count drops from 396 to ~30; no synthetic `chore(sessions):` commits needed; commit SHA is already inside the file's `## Outcome` section so per-commit attribution is preserved. **Tradeoff:** loses per-commit filename granularity; first commit of any day still leaves one file uncommitted until the next commit.

2. **Local-first, opt-in publishing** — Add `.context-index/sessions/` to the installer's `.gitignore` defaults. Treat the directory as a local audit log. Add an `adev sessions push` (or fold into `/adev:retro`) command for users who want to share. **Tradeoff:** breaks any current `/adev:retro` flow that reads `sessions/` across branches/contributors; would need a migration story for the 396 existing files.

3. **Switch trigger from post-commit to Stop hook** — Generate one file per Claude Code session (using the `Stop` event) rather than per git commit. Decouples the artifact from git entirely. **Tradeoff:** larger architectural change; loses the commit-message-as-intent enrichment that the current post-commit hook provides; session boundaries don't always align with logical units of work.

4. **Auto-include via `prepare-commit-msg`** — Have a `prepare-commit-msg` hook stage any pending `sessions/*.md` files into the current commit. **Tradeoff:** silently mutates the user's staged diff; pre-commit hooks may re-fire; rejected as too magical for a tool that values commit hygiene.

Recommendation 1 is the smallest change with the biggest UX win and respects the existing `/adev:retro` assumption that sessions remain tracked. Recommendation 2 is the right answer if `/adev:retro` and friends turn out not to read `.context-index/sessions/` after all.

## Open Questions

- Which skills actually consume `.context-index/sessions/`? (`/adev:retro` is the strongest candidate; needs verification.) Answer determines whether option 2 is even viable.
- Does `lib/session-summary.mjs:writeSummary()` currently support append-mode, or would daily rollup require a small library change?
- For option 1, do we want the rollup file committed by the *next* user commit (simple, occasional 1-day lag), or do we attempt to amend the just-finished commit (cleaner trace, but amending inside a post-commit hook is fragile)?

## References

### Internal Files
- `.githooks/post-commit` — current per-commit summary generator
- `hooks/session-capture.sh` — PostToolUse JSONL appender (token usage, issue/epic enrichment)
- `lib/session-summary.mjs` — `writeSummary()` renderer (not read in this pass)
- `cli/index.mjs:759-763`, `:898-902` — install/upgrade copy that documents the manual batching workflow
- `.context-index/sessions/` — 395 tracked + 1 untracked session files, format `<date>-<sha>.md`

---

## Extended Findings (2026-05-20, +web, +github)

This section extends the original draft with prior art from comparable tools, git-native non-commit metadata patterns, and untapped Claude Code hook events. The first ranking (above) considered only the local codebase; the patterns below surface options that were not on that list.

### Findings — Web

#### Claude Code hook events beyond post-commit

- **`SessionEnd` (informational, cannot block).** Fires on `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, or `other`. Payload includes `transcript_path` and `session_id`. Decision control: none — purely for cleanup/logging. Introduced ~v1.0.85. Source: <https://code.claude.com/docs/en/hooks>.
- **`PreCompact` (can block).** Fires just before context compaction (manual `/compact` or auto). Payload includes `transcript_path`, `compression_ratio`, and matcher trigger (`manual` | `auto`). Critical for capturing *uncompacted* conversation data before summarization destroys detail. Source: <https://code.claude.com/docs/en/hooks>.
- **`Stop` and `SubagentStop` (can block).** Stop fires when Claude finishes its overall response; SubagentStop on each tool-spawned helper completion. Both expose `transcript_path`. SubagentStop supports a matcher on `agent_type`. Source: <https://code.claude.com/docs/en/hooks>.
- **`SessionStart`** (already used by adev as `hooks/session-start.sh`) — for completeness, payload includes `source` (`startup`/`resume`/`clear`/`compact`) and supports `additionalContext` injection via JSON output. Source: <https://code.claude.com/docs/en/hooks>.

Implication: the union of `Stop` + `SessionEnd` + `PreCompact` covers "every scenario where conversation data would otherwise disappear" — the pattern adopted by community chat-export plugins (see GitHub findings below). The current adev hook layer only wires `Stop` (and only for heuristic extraction, not session summary). `SessionEnd` and `PreCompact` are entirely unwired in `hooks/hooks.json` even though the copilot provider event table already maps them as `cloudAgentSafe: true`.

#### How comparable tools handle session/activity capture

- **Aider (CLI coding agent).** Writes `.aider.chat.history.md` and `.aider.input.history` at repo root by default. On first run, Aider asks the user "Add `.aider*` to `.gitignore` (recommended)?" — i.e., the canonical pattern is **local-first, opt-in publishing**, the same shape as adev's Recommendation 2. The history file is a continuously-appended markdown log, not per-session files. Sources: <https://aider.chat/docs/config/options.html>, <https://github.com/Aider-AI/aider/blob/main/.gitignore>.
- **Cursor IDE.** Stores all chat/composer history in `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (SQLite) plus per-workspace state DBs and checkpoint diffs. **Never** writes session transcripts into the user's project tree. Multiple third-party extensions (e.g., `S2thend/cursor-history`, `abdelhakakermi.cursorchat-downloader`) exist precisely *because* the data is opaque and not in the repo. Source: <https://vibe-replay.com/blog/cursor-local-storage/>.
- **JetBrains AI Assistant.** Stores chat per-project as XML files inside the IDE configuration directory (`<component name="ChatSessionStateTemp">`), keyed by cryptic project hash — never inside the project tree. Source: <https://www.jetbrains.com/help/ai-assistant/ai-chat.html>.
- **Continue.dev.** Writes development data to `.continue/dev_data/` *on the user's machine* (not the repo). Optional PostHog telemetry layered on top, with opt-out. Source: <https://docs.continue.dev/development-data>.
- **VS Code Codex History Viewer (community).** Browses local session files for both Codex CLI and Claude Code from their respective project-hash directories under `~/.claude/projects/<hash>/sessions/` — i.e., it consumes the per-tool local store rather than expecting a project-level transcript directory. Source: <https://marketplace.visualstudio.com/items?itemName=hiztam.codex-history-viewer>.
- **Sentry breadcrumbs (observability model, transferable pattern).** Auto-records a structured trail of typed/categorized events without explicit user action; attached to errors at capture time via `before_breadcrumb` hook. Lessons for adev: (a) capture is fully automatic, (b) data is buffered then flushed at a meaningful boundary (error event), (c) every breadcrumb carries category + severity for filtering. The "buffer + flush at boundary" pattern maps directly to adev's `.session-tracking.jsonl` (buffer) + commit/SessionEnd (flush boundary). Source: <https://docs.sentry.io/product/issues/issue-details/breadcrumbs/>.
- **PostHog.** Same general pattern — events captured in-process, debug mode toggleable via `?__posthog_debug=true` for local development. Reinforces "structured event stream, opt-in shipping" over "synthetic git commit." Source: <https://posthog.com/docs/product-analytics/capture-events>.

**Cross-tool pattern (5 of 5 surveyed dev-AI tools):** none of Cursor, JetBrains, Aider, Continue.dev, or Codex History writes session transcripts into the project tree by default. Aider explicitly opts into `.gitignore`. The current adev approach (tracked per-commit markdown files) is an outlier.

#### Git-native patterns that avoid synthetic commits

- **Git notes (`refs/notes/<namespace>`).** Attach arbitrary metadata to a commit without modifying its SHA. Supports `git notes append`, custom namespaces via `--ref` (e.g., `--ref=sessions`), and structured payloads (JSON/YAML via `-F`). Storage is content-addressable blobs under `refs/notes/*`, not files in the worktree. Pattern: `./build-session-summary.sh | git notes --ref=sessions add -F - HEAD`. Source: <https://www.kenmuse.com/blog/storing-data-in-git-objects-with-notes/>.
  - **Hard pitfalls.** Notes are not fetched or pushed by default — requires explicit `git push origin 'refs/notes/*'` or per-remote config (`remote.origin.fetch '+refs/notes/*:refs/notes/*'`). GitHub **dropped UI support for notes in 2014**, GitLab does not display them, and they do not appear in PR diffs. Notes are not indexed for code search. Sources: <https://alchemists.io/articles/git_notes>, <https://gist.github.com/topheman/ec8cde7c54e24a785e52>.
- **Git trailers** (already in use for `Spec:`, `Author-type`, `Operator`). Structured key-value lines at the end of commit messages, indexed by `git interpret-trailers` and visible in `git log`. Right tool when the metadata should travel *with* the commit and survive across hosts. Trailers cannot store kilobyte-scale session summaries (commit-message-bloat) but can store a small "session-id" pointer that resolves to data stored elsewhere. Source: <https://risadams.com/blog/2025/04/17/git-notes/>.
- **Orphan branches (`git checkout --orphan`).** Create a parallel history with no parent commits. Useful if adev wanted a `sessions` orphan branch tracking only session files. Avoids polluting the main history but still requires explicit sync. Some agentic tools (Codex App) use detached HEAD worktrees specifically "so Codex can create dozens of worktrees without polluting your branch namespace." Source: <https://www.verdent.ai/guides/codex-app-worktrees-explained>.
- **Per-worktree refs (`refs/worktree/*`, `refs/bisect/*`).** Per-worktree refs are *not shared* between worktrees. Could host session refs scoped to a single working tree, but the issue-storage charter already documented worktree-sharing as desirable for adev (`lib/issues/resolve-root.mjs`), so this conflicts with established convention. Source: <https://git-scm.com/docs/git-worktree>.
- **`.gitignored` directory in worktree** (the Aider / Continue.dev model). Simplest non-tracking option: write to `.context-index/sessions/` but ship a `.gitignore` entry. Trades audit-trail surface for zero ceremony.

### Findings — GitHub

#### Prior art in `agentic-development/adev-plugin`

- **`hooks/hooks.json` currently registers:** `SessionStart`, `PreToolUse` (Edit, Bash), `PostToolUse` (Read, Edit, wildcard `.*` including `session-capture.sh`), and `Stop` (only for `post-validate-extract-heuristics.sh`). **It does NOT register `SessionEnd`, `PreCompact`, or `SubagentStop`** — even though `lib/providers/copilot/event-table.mjs:30,33,36` already maps all three as `cloudAgentSafe: true`. This is a latent capability gap: the provider abstraction is ready, the canonical hook layer just hasn't subscribed yet. Permalink: <https://github.com/agentic-development/adev-plugin/blob/main/hooks/hooks.json>.
- **Stop hook is already wired but used for a different purpose.** `Stop` currently fires `post-validate-extract-heuristics.sh` (heuristic extraction). Adding a second consumer in the same `Stop` matcher is supported by Claude Code's matcher array. Source: `hooks/hooks.json` (confirmed via WebFetch of GitHub raw).
- **`lib/providers/copilot/event-table.mjs:26-38`** — translation table includes `SubagentStart`, `SubagentStop`, `SessionEnd`, `PreCompact`, `Stop`, `PostToolUseFailure`. Permalink anchor: lines 26-38 of the file. This table is the closest thing to an authoritative "events adev considers safe to consume" registry.
- **`.githooks/post-commit`** — the existing per-commit session generator. Reads commit message + JSONL buffer, writes one file per commit to `.context-index/sessions/`, truncates the buffer. Uses git trailers (`Spec:`) for enrichment. **Does not** stage the file (the manual `chore(sessions):` batching workflow exists precisely to back-fill this). Loop-prevention: the script does not re-fire on session-only commits (a `chore(sessions):` commit's only-changed-files matches the sessions directory).
- **Open issues on the repo:** zero hits for `is:issue session transcript`. No prior discussion of this UX problem on the issue tracker. Source: <https://github.com/agentic-development/adev-plugin/issues?q=is%3Aissue+session+transcript>.

#### Prior art in other Claude Code hook repos

- **`christancho/chat-autoexporter`** — Claude Code plugin that uses **`PreCompact` + `SessionEnd` + `UserPromptSubmit`** together to "cover every scenario where conversation data would otherwise disappear." Writes timestamped `.txt` files to `.claude/chat-exports/` (NOT the project tree's `.context-index/`). Pure Node.js stdlib, no npm deps. Recommends `.gitignore` for the export directory. Source: <https://christianmendieta.ca/how-i-built-a-claude-code-plugin-to-never-lose-a-chat-context-again/>.
- **`disler/claude-code-hooks-mastery`** — Reference implementation demonstrating `Stop`, `SubagentStop`, `SessionEnd`, `PreCompact`, plus `PostToolUse`. Writes JSON-formatted logs to a `logs/` directory that is *git-tracked* (mirror of adev's current approach). Source: <https://github.com/disler/claude-code-hooks-mastery>.
- **Pattern across both:** the `PreCompact` + `SessionEnd` + (optional) `Stop` triplet is the de facto community standard for capturing transcript data on lifecycle events. Adev currently subscribes to none of these for session-summary purposes.

## Extended Code Examples

**Pattern A — Hook into SessionEnd instead of post-commit (chat-autoexporter style):**

```jsonc
// hooks/hooks.json — add a SessionEnd subscription
{
  "matcher": ".*",
  "hooks": [
    { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/session-end-capture.sh" }
  ]
}
```

The new `session-end-capture.sh` reads `transcript_path` and `session_id` from stdin JSON, generates a single per-session file, and writes wherever the chosen storage strategy dictates (`.context-index/sessions/`, `~/.claude/.adev-sessions/`, or `git notes --ref=sessions add -F -`).

**Pattern B — Git notes append, keyed by HEAD commit:**

```bash
# In .githooks/post-commit (replacing the current write-and-leave-uncommitted flow)
SUMMARY=$(node --input-type=module -e "...renders markdown...")
echo "$SUMMARY" | git notes --ref=sessions add -F - HEAD
# Notes never touch the worktree, never need a chore(sessions) commit,
# and survive rebases as long as `notes.rewriteRef` is configured.
```

Trade-off: invisible on GitHub UI, opaque to PR review, requires team buy-in on `git fetch '+refs/notes/sessions:refs/notes/sessions'`.

## Extended Recommendations

The original ranking had 4 options grounded only in internal code. With the extended source set, two new patterns emerge and the relative ordering shifts. New ranking (least-intrusive seamless options first):

5. **`.gitignore` `.context-index/sessions/` + keep current post-commit hook** *(new — strongly aligned with cross-tool norm).* Aider, Cursor, JetBrains, and Continue.dev all default to local-only session data. Adev's per-commit markdown summary is genuinely useful as a local audit log; the friction is *only* that it lands tracked. Adding `.context-index/sessions/` to the installer's default `.gitignore` and migrating the 395 existing files to a non-tracked archive (or leaving them in place as a historical snapshot) eliminates the manual `chore(sessions):` workflow with no behavior change to capture. Pairs naturally with an opt-in `adev sessions push` command for teams that want to share. **Tradeoff:** breaks any `/adev:retro` consumer that walks `sessions/` across contributors via git history. The web/GitHub evidence is unanimous that comparable tools do not track this data. *This is essentially the original Recommendation 2, now upgraded with strong external validation.*

6. **Switch capture trigger from post-commit to `SessionEnd` + `PreCompact`** *(new — matches community Claude Code pattern).* Both `chat-autoexporter` and `claude-code-hooks-mastery` use `SessionEnd` + `PreCompact` as the standard capture surface. `lib/providers/copilot/event-table.mjs` already maps both as `cloudAgentSafe: true` so the multi-provider plumbing is ready. Benefits: (a) captures the *full* uncompacted transcript via `transcript_path`, (b) granularity is one file per Claude session rather than one per git commit (matches user intent of "what did Claude and I do together"), (c) decouples session capture from git entirely (works even in repos that aren't committed mid-session). Combine with #5 for a fully non-intrusive local-first store. **Tradeoff:** loses the commit-message-as-intent enrichment unless we also keep a slimmer `post-commit` writer; would obsolete `.githooks/post-commit` for session purposes (it could still run for non-session enrichments). *Replaces the original Recommendation 3 with a concrete implementation path: `chat-autoexporter` is a working blueprint.*

7. **Git notes (`refs/notes/sessions`) for the commit-anchored summary** *(new — git-native, no synthetic commits).* Replace the per-commit markdown file with `git notes --ref=sessions add` against `HEAD` inside the existing post-commit hook. Pros: zero worktree footprint, commit-anchored attribution preserved, content survives rebase with `notes.rewriteRef = refs/notes/sessions`. Cons: GitHub dropped UI support in 2014; not visible in PR diffs; not indexed by code search; requires `git fetch '+refs/notes/sessions:refs/notes/sessions'` on every clone. **Verdict:** technically elegant, practically friction-laden for any contributor who doesn't configure their remote — *not* recommended as the primary mechanism, but a strong supplement if `/adev:retro` actually needs commit-anchored data.

8. **Dedicated `sessions` orphan branch via git plumbing** *(new — preserves shared audit channel without polluting main).* Maintain a parallel orphan branch (e.g., `refs/heads/sessions` or per-contributor `refs/heads/sessions/<user>`) whose history is wholly disjoint from `main`. The post-commit / `SessionEnd` hook writes the session file via low-level git plumbing — never checking the branch out, never touching the working tree:

    ```bash
    # Inside the hook: write a session blob onto refs/heads/sessions without
    # disturbing the user's working tree or index.
    BLOB=$(printf '%s' "$SESSION_MD" | git hash-object -w --stdin)
    # Build a tree containing just sessions/YYYY-MM-DD/<sha>.md
    TREE=$(printf '100644 blob %s\tsessions/%s/%s.md\n' \
              "$BLOB" "$(date +%Y-%m-%d)" "$COMMIT_HASH" | git mktree)
    PARENT=$(git rev-parse --verify refs/heads/sessions 2>/dev/null || true)
    NEW=$(echo "session: $COMMIT_HASH" | \
            git commit-tree "$TREE" ${PARENT:+-p "$PARENT"})
    git update-ref refs/heads/sessions "$NEW"
    # Working tree, index, HEAD untouched. No checkout, no stash, no risk.
    ```

    Pros: (a) zero footprint in `main`/PR diffs — session noise stops cluttering review, (b) preserves cross-contributor audit via `git fetch origin sessions`, (c) renders fine in GitHub UI (branches are first-class, unlike git notes), (d) `/adev:retro` can read across contributors with `git show sessions:sessions/2026-05-20/<sha>.md`, (e) survives rebases of `main` since the histories are disjoint, (f) per-contributor sub-branches (`sessions/<user>`) eliminate write contention without any locking. Cons: (a) hook complexity — plumbing-level git is uglier than `fs.appendFile` and needs careful error handling, (b) contributors must add `git fetch origin sessions` (or `+refs/heads/sessions*:refs/remotes/origin/sessions*` refspec) to see history, (c) push policy is non-obvious — auto-push from a hook is a foot-gun (constitution-aligned: never auto-push), so users still need `git push origin sessions` periodically (but this is a one-line cron / pre-existing `git push --all` rather than a synthetic commit), (d) discoverability — contributors don't know to look at `refs/heads/sessions` without onboarding docs. **Verdict:** strictly stronger than #7 (git notes) on GitHub UI and code-search; strictly stronger than #5 (`.gitignore`) on cross-contributor audit. Main competition is #1 (hybrid `.gitignore` + `SessionEnd`) — orphan branch wins if you need shared audit, hybrid wins if you don't.

### Updated overall ranking (least-intrusive first)

1. **Hybrid: #5 + #6 combined** — `.gitignore` `.context-index/sessions/` *and* move trigger to `SessionEnd`/`PreCompact`. One file per session, local-only, captured at the natural conversational boundary, zero git ceremony. This is what every other dev-AI tool surveyed already does. Most aligned with the constitution's "minimize external dependencies" (no new tooling) and "hook protocol compliance" (`SessionEnd` is already a first-class Claude Code event with documented JSON contract). **Best if `/adev:retro` does *not* need cross-contributor session data.**
2. **Orphan branch (#8) + `SessionEnd` trigger (#6)** — captures the full transcript at the natural boundary and writes it to `refs/heads/sessions` via plumbing, leaving `main`'s worktree and PR diffs clean while preserving a shared audit channel. **Best if `/adev:retro` *does* need cross-contributor data** — strictly stronger than the original daily-rollup option on PR-noise and stronger than git notes on GitHub UX. The only real cost is hook complexity (plumbing-level git) and a one-time onboarding step (`git fetch origin sessions`).
3. **Original Recommendation 1 (daily rollup + auto-stage)** — still viable *if* tracking the data on `main` is required for tooling reasons; reduces 395 files to ~30 without UX cost. Now dominated by #2 unless there's a specific reason sessions must live on `main`.
4. **Original Recommendation 2 (local-first, opt-in publish)** — now upgraded to #5 above with cross-tool validation.
5. **Git notes (#7)** — only as a supplement, not a primary store. Dominated by #8 (orphan branch) on visibility and UX.
6. **Original Recommendation 3 (Stop-hook per-session file in worktree)** — superseded by #6 (`SessionEnd` is the correct event, not `Stop`).
7. **Original Recommendation 4 (`prepare-commit-msg` auto-stage)** — still rejected as too magical.

### Decision driver (the one question to answer first)

Whether `/adev:retro` (or any other lifecycle skill) reads `.context-index/sessions/` *across git history / across contributors* — i.e., does the retro skill need to see another contributor's sessions to compute team-wide metrics? If **no**, hybrid #1 above is unambiguously correct and the 395 existing files can be archived. If **yes**, **orphan branch + `SessionEnd` (#2 above) is the right answer** — it preserves the shared audit channel git currently provides while removing all noise from `main` (PR diffs, worktree files, `chore(sessions):` commits). The original daily-rollup option (#3 in the new ranking) is only correct if there's a specific reason sessions must live on `main` itself rather than on a parallel ref.

### Verification: actual session consumers (audited 2026-05-20)

Audited every reference to `.context-index/sessions` across `skills/`, `lib/`, `cli/`, and `hooks/`. Three real consumers; one phantom consumer documented but unwired.

| Skill | File:Line | What it reads | Access pattern |
|---|---|---|---|
| `/adev:work` | `skills/work/SKILL.md:37` | 3 most recent `*.md` files for current-user context | `glob` + filename-date sort, local FS |
| `/adev:status` | `skills/status/SKILL.md:48` | Session summaries that reference a specific spec | `glob`/`grep` over local FS |
| `/adev:status` | `skills/status/SKILL.md:197` | 10 most recent summaries for dashboard | `glob` + filename-date sort, local FS |
| `/adev:hygiene` | `skills/hygiene/SKILL.md:250` | `.session-tracking.jsonl` + `sessions/*.md` for spec-reference correlation | local FS only |
| ~~`/adev:retro`~~ | — | **Nothing.** Comprehensive grep against `skills/retro/SKILL.md` for `.context-index/sessions` / `sessions/.` / `session-tracking` returned zero hits. The only session mention (line 125, "Context Gaps") is a conditional, tangential note about grepping logs *if session capture is configured* — not a data-gathering step. Retro's actual sources (steps 1.1-1.7): git log, validation reports, recovery records, blocker files, plan files, hygiene reports. |
| `lib/session-parser.mjs` | (entire module) | Reads `~/.claude/projects/<hash>/sessions/*.jsonl` — Claude Code's own transcript store, **not** `.context-index/sessions/`. Different concern entirely. |

**Key observations:**

1. **No skill performs a git-history-based read.** Across all three real consumers, the access pattern is `glob`/`readdir` against the local working tree. There is no `git log --grep`, `git show <ref>:path`, `git ls-tree`, or any cross-history retrieval anywhere in the call chain. The consumers behave identically whether session files arrived via `git pull` or via a `.gitignore`d local directory.
2. **No skill filters by contributor or aggregates cross-author.** `/adev:status` recency-sorts by filename date prefix; `/adev:work` shows the local user's recent activity; `/adev:hygiene` correlates against spec paths, not authors.
3. **The "retro consumes sessions" claim in `skills/init/SKILL.md:761` is documentation drift.** The init skill tells users that `/adev:retro` consumes the per-commit session files. The actual retro skill does not. This is a separate hygiene finding worth filing as an issue against the init skill's onboarding copy — it has been overstating the cost of `.gitignore`-ing sessions for an unknown number of installs.
4. **`/adev:hygiene` reads the raw JSONL too** (`.session-tracking.jsonl`), not just the post-commit markdown. Any move to `SessionEnd`-triggered capture must preserve the JSONL → markdown rollup at session end, not at commit end. Small refactor of `lib/session-summary.mjs` + `hooks/session-capture.sh`; not an architectural blocker.

**Verdict:** the decision driver collapses to **no cross-contributor need**. **Hybrid #1 (`.gitignore` + `SessionEnd`/`PreCompact`) is the recommended path.** The orphan branch option (#2) is more machinery than the actual consumer set requires; it remains documented as the right answer *if* a future skill ever needs cross-contributor audit, but it should not be built speculatively.

**Migration implication:** the 395 existing `.context-index/sessions/*.md` files can be archived (e.g., moved to `.context-index/sessions/.archive/` and `.gitignore`d) or deleted from `main` and preserved only in git history. Neither affects any current skill.

## Extended References

### Web (Claude Code hooks)
- Hooks reference (Stop, SubagentStop, SessionStart, SessionEnd, PreCompact, UserPromptSubmit, payloads, exit codes) — <https://code.claude.com/docs/en/hooks>
- chat-autoexporter design walkthrough — <https://christianmendieta.ca/how-i-built-a-claude-code-plugin-to-never-lose-a-chat-context-again/>

### Web (comparable tool patterns)
- Aider chat history options — <https://aider.chat/docs/config/options.html>
- Aider `.gitignore` convention (`.aider*`) — <https://github.com/Aider-AI/aider/blob/main/.gitignore>
- Cursor local storage architecture — <https://vibe-replay.com/blog/cursor-local-storage/>
- JetBrains AI Assistant chat storage — <https://www.jetbrains.com/help/ai-assistant/ai-chat.html>
- Continue.dev development data — <https://docs.continue.dev/development-data>
- Codex History Viewer (consumes Claude/Codex per-tool local stores) — <https://marketplace.visualstudio.com/items?itemName=hiztam.codex-history-viewer>
- Sentry breadcrumbs (buffer + flush-at-boundary pattern) — <https://docs.sentry.io/product/issues/issue-details/breadcrumbs/>
- PostHog event capture — <https://posthog.com/docs/product-analytics/capture-events>

### Web (git-native patterns)
- Git notes deep dive (Ken Muse) — <https://www.kenmuse.com/blog/storing-data-in-git-objects-with-notes/>
- Git notes pros/cons (Alchemists) — <https://alchemists.io/articles/git_notes>
- Git notes/trailers comparison (Ris Adams) — <https://risadams.com/blog/2025/04/17/git-notes/>
- Git notes hosting limitations (cheat sheet gist) — <https://gist.github.com/topheman/ec8cde7c54e24a785e52>
- Git worktree ref-namespace semantics — <https://git-scm.com/docs/git-worktree>
- Orphan branch / detached-HEAD worktree pattern (Codex App) — <https://www.verdent.ai/guides/codex-app-worktrees-explained>

### GitHub (`agentic-development/adev-plugin`)
- `hooks/hooks.json` — current hook registrations (no SessionEnd/PreCompact/SubagentStop) — <https://github.com/agentic-development/adev-plugin/blob/main/hooks/hooks.json>
- `.githooks/post-commit` — current per-commit summary generator — <https://github.com/agentic-development/adev-plugin/blob/main/.githooks/post-commit>
- `lib/providers/copilot/event-table.mjs:26-38` — translation table already maps SessionEnd/PreCompact/SubagentStop as `cloudAgentSafe: true` (verified in working copy at `/Users/dpavancini/Development/adev-plugin-hygiene/lib/providers/copilot/event-table.mjs:30,33,36`)
- Issue-tracker search for session/transcript work — <https://github.com/agentic-development/adev-plugin/issues?q=is%3Aissue+session+transcript> — zero hits

### GitHub (community Claude Code hook patterns)
- `christancho/chat-autoexporter` — PreCompact + SessionEnd + UserPromptSubmit triplet — referenced from <https://christianmendieta.ca/how-i-built-a-claude-code-plugin-to-never-lose-a-chat-context-again/>
- `disler/claude-code-hooks-mastery` — reference implementation of all major hook events — <https://github.com/disler/claude-code-hooks-mastery>

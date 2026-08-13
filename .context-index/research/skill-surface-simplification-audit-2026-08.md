---
topic: "Skill/CLI/hook surface duplication audit — what shipped from the 2026-07 simplification synthesis, what remains, and a consolidation plan (31 → ~19 skills)"
date: "2026-08-12"
relates-to: ""
sources:
  - internal
status: complete
---

## Summary

Audit of main @ `1d2f8e7f` (31 skills = 14,032 SKILL.md lines, 31 CLI verbs, 22 hooks, 6 state stores). Of the 2026-07-01 synthesis recommendations, **3 of 12 sub-items fully shipped** (rigor tiers, silent subagent execution, partial gate restructure); the Express Lane was consciously replaced by the `quick` tier (defensible), but the substitution left a **live contract break**: `/adev:work` and `/adev:route` instruct `/adev:build --tier quick`, and `/adev:build` has no `--tier` argument — the rigor signal is silently dropped on the pipeline that matters most.

Non-core skills are **6,211 lines = 44% of instruction weight**, and the overlap map is dense: four separate implementations of the same code-drift check (validate 1.6, hygiene Pass 17, status "Drifted Specs", reconcile), a detect/repair pair that should be one skill (`reconcile` is literally `hygiene --fix`), five deterministic library-backed skills that need no LLM (`codehealth`, `repomap`, `document`, `deploy`, `sync`), a 35-line skill whose payload is one CLI call (`standalone`), and 217 lines of byte-identical skill-extension boilerplate across all 31 files. A realistic consolidation removes **~2,900 SKILL.md lines (~21%)** and lands at **~19 skills / ~20 CLI verbs** — the same move BMAD just executed (14→8 skills, one blessed implement path) per `agentic-frameworks-market-update-2026-08.md`.

Environment-level duplication also matters on this machine: the user-level suite at `~/.claude/skills/` (`charter`, `distill`, `estimate`, `mockup`, `scaffold`) competes with adev skills for the same triggers — `mockup` and `/adev:prototype` share a **byte-identical description**, guaranteeing nondeterministic routing.

## Findings

### A. Shipped status of the 2026-07 synthesis recommendations

| Recommendation | Verdict | Evidence |
|---|---|---|
| Graduated rigor tiers | **Shipped** | `lib/governance/rigor-mode.mjs`; consumed at `skills/validate/SKILL.md:137,148`, `skills/review-specs/SKILL.md:117-119,166`; emitted by route; `risk-policies.yaml` |
| Express Lane (skip gates) | **Rejected by design** | `skills/work/SKILL.md:210` — "do **not** skip gates"; strict gate chain stalls on skips (`single-front-door.jsonl` CON-1). Replaced by `--tier quick` |
| → dangling contract | **BUG** | `work:211` and `route:118` pass `--tier quick` to `/adev:build`, which has no `--tier` arg (`skills/build/SKILL.md:11-26`; only *gate* tiers at `:214,:528,:697,:827`). Verified 2026-08-12 |
| Gate dedup (validate 13→7) | **Partial** | validate now 8 checks with relocations documented (`:522+`); but the double source-manifest drift check (1.5 + 1.6) remains, plus 3rd/4th copies in hygiene Pass 17 (`:804`) and status "Drifted Specs" (`:193`) |
| Merge status/hygiene/reconcile + codehealth | **Not shipped** | Four files, 2,195 lines; hygiene Pass 13 delegates to codehealth but the skill surfaces all remain; no shared detection engine (`lib/hygiene/` has only 2 modules) |
| State-record consolidation | **Format migration only** | `lib/migrate-state-artifacts.mjs` converted formats; all stores live (§F); 25 orphaned `.json`/`.jsonl` twin basenames left in `lifecycle-state/` (verified) |
| Silent subagent execution (−67%) | **Shipped** | `skills/implement/SKILL.md:354` default; `--verbose` opt-out; build same |
| Artifact-to-disk (−36%) | **Partial** | `adev artifact commit` used by implement + validate only; hygiene/retro/status still render reports into context |
| Review 3→2 | **Superseded** | Full tier still 3 reviewers; quick tier collapses to 1 |
| JIT step-files for 850–1,140-line skills | **Not shipped** | hygiene 1137, specify 1089, build 954, init 891, plan 857 — all monolithic |

### B. Non-core skill consolidation map

| Skill | Lines | Overlaps | Action |
|---|---|---|---|
| standalone | 35 | Wraps one CLI call (`adev execution-state write --status standalone`); 20% is boilerplate | **Delete** (see bug D3 first) |
| reconcile | 240 | Re-derives hygiene Pass 12/15 findings; reads hygiene's drift-report | **Merge → `hygiene --fix`** (highest-confidence merge) |
| codehealth | 336 | 5 deterministic passes over repomap JSON; only programmatic caller is hygiene Pass 13 | **Demote to CLI verb** |
| repomap | 320 | Wrapper around finished `lib/repomap/` (7 modules) | **Demote to CLI verb** |
| document | 187 | Pure consumer of repomap output; nothing invokes it | **Demote to CLI verb or extension** |
| deploy | 174 | Config-driven executor of `deploy.yaml`; zero judgment | **Demote to CLI verb** |
| sync | 248 | `hooks/sync-trigger.sh` already automates the same job via `lib/sync/` | **Demote to CLI verb** |
| learn | 224 | `adev heuristics` verb already exists (used by 10 skills); list/promote/demote/archive are CRUD | **Demote to CLI verb**; keep distill step in retro |
| issues | 265 | `status --issue/--epic/--backlog` duplicates it; `work --intake` files issues; skill bypasses the existing `adev issues` verb with inline `getIssueManager()` imports | **Demote to CLI verb** (and fix: verb used by zero skills today) |
| status | 482 | Drift/re-review/milestone views duplicate hygiene Passes 11/12/17 + issues; `--all` already delegates to `adev state list` | **Merge into merged detector (`--report`) or demote** |
| assess | 254 | 3 adev-specific dimensions are a strict subset of hygiene; rubric scoring ≈ eval | **Fold into `init --brownfield`** |
| eval | 212 | Layer 1 ≈ validate Check 1; Layer 2 ≈ Checks 4/8; shares identical 27-line preflight block with validate | **Merge → `validate --score`** |
| retro | 527 | hygiene Passes 9/10/16 (recovery/blockers/heuristics) are near-identical sections | **Keep; absorb those 3 hygiene passes** (retro owns time-windowed analysis; hygiene owns point-in-time staleness) |
| hygiene | 1137 | 21 passes overlapping everything above | **Keep as anchor**; after donating passes → ~600 lines |
| recover | 491 | Failure-classification twin of debug (412); hygiene Pass 9 reads its records | **Merge diagnosis taxonomy with debug** (medium confidence) |
| prototype | 470 | Byte-identical description with user-level `mockup` skill | **Keep; disambiguate description** (see D4) |
| research | 242 | Lowest overlap in the set | **Keep standalone** |
| using-adev | 118 | Self-deprecated in prose ("You never need to choose among the skills below"); catalog duplicates `docs/skill-reference.md` | **Reduce to a pointer at `/adev:work`** |

Net: **31 → ~19 skills, −~2,900 lines (~21%)**. Core lifecycle skills (work, brainstorm, specify, review-specs, plan, route, implement, write-test, build, validate, debug, init) untouched except boilerplate hoisting.

### C. CLI verb surface (31 → ~20)

- **Dead verbs:** `diagnose` (0 skill references), `issues` (0 — skill bypasses it), `migrate` (one-shot 2026-05 migration, complete), CLI `init` (self-deprecated at `cli/index.mjs:1689`).
- **Three verbs, one lifecycle log:** `state` (read) + `verify` (check) + `report` (write) all target `lifecycle-state/*.jsonl` → merge into `adev lifecycle <read|verify|emit>`.
- **Two atomic-write protocols:** `artifact` (.tmp) + `partial` (.partial) — `skills/validate/SKILL.md:426` spends a paragraph explaining which to use → one verb.
- **Three verbs, one skill:** `implement` + `parallel` + `worktree` all serve `/adev:implement` → subcommands.

### D. Live bugs found during this audit

1. **`/adev:build --tier` contract break** (§A) — rigor signal silently dropped.
2. **Bash passthrough parser breaks on quoted pipes** — `matchesBashPassthrough` (`lib/lifecycle-gate-config.mjs:82-86`) splits on `|`/`;`/`&&` without quote-awareness, so an allowlisted `grep "a\|b" file` is misclassified and blocked at `lifecycle.gate=block`. Reproduced 2026-08-12.
3. **The standalone escape hatch is unreachable from a blocked state** — with `lifecycle.gate=block`, `adev execution-state write --status standalone` (the exact command `skills/standalone/SKILL.md:32` prescribes) is itself gated: `adev` is not in the bash passthrough set. The only way out is a manual Write to `.execution-state.json`. Either allowlist `adev execution-state write --status standalone` in the domain gate-config or have the gate's block message name a working escape.
4. **Trigger collision:** `skills/prototype/SKILL.md:3` description is byte-identical to `~/.claude/skills/mockup/SKILL.md` — nondeterministic skill routing on this machine. The whole user-level suite (`charter`≈brainstorm, `scaffold`≈init, `distill`≈assess, `estimate`≈route/plan, `mockup`≈prototype) predates adev's coverage; retire it or rename its triggers.

### E. Hook and boilerplate consolidation

- **3 lifecycle-gate hooks → 1** (`lifecycle-gate-{edit,bash,advisory}.sh`, 396 lines + 2 checker shims) — all read the same execution state; the advisory hook fires on *every* tool call. Dispatch on `$CLAUDE_TOOL_NAME` instead.
- `find_context_index()` duplicated verbatim in 5 hooks (~60 lines) — hoist into `_parse-stdin.sh`.
- `context-read-tracker.sh` is a strict subset of `session-capture.sh`'s visibility — fold in, saving one hook invocation per Read.
- `session-capture.sh:15-40` embeds inline Node in a heredoc — the exact pattern `pre-commit-no-inline-node.sh` exists to ban (hooks are out of that hook's scope, but the inconsistency is worth fixing).
- **Skill-extension boilerplate: 217 byte-identical lines (7 × 31 skills)** — hoistable to a session-start injection or shared preamble; total hoistable boilerplate ≈ 810 lines (5.8%). Note this conflicts with the CLAUDE.md rule requiring the block per skill and `tests/skills-extension-coverage.test.mjs` — hoisting needs a mechanism change (e.g., the gateway/session-start hook loads extensions for the invoked skill), not just deletion.

### F. State stores — still six, one is migration residue

`lifecycle-state/*.jsonl` (canonical, ~185 files) + **25 orphaned `.json` twins** (migration skip-on-completion never cleans them) + `build-state/` (12 files, "retired" but coexisting) + `.execution-state.json` (hot path, 7 hooks) + `milestones.json` + `tasks/tasks.json`. State-management lib code: 5,105 lines, of which the single-use `migrate-state-artifacts.mjs` is 1,656.

> **Correction (issue-580, 2026-08-12):** the "25 orphaned `.json` twins" claim above conflated two unrelated things. `lib/build-state.mjs` (`BUILD_STATE_DIR = ".context-index/lifecycle-state"`) is a **live** helper — it writes `<slug>.json` build-orchestrator resume state directly into `lifecycle-state/`, by design, coexisting with the `.jsonl` event log written by `lib/lifecycle-state.mjs` (see the docstring at the top of `lib/build-state.mjs`). `skills/build/SKILL.md:247-263,654,697,718,946` actively drives this via the `adev build-state` verb. These `.json` files are also **gitignored** (`.gitignore:27,118`, comment: "*.jsonl ARE committed; only the *.json build-state files are ignored") — none has ever been a tracked file, so "git rm" never applied. They are not migration residue; there was nothing to clean up in `lifecycle-state/`.
>
> The migration's actual leave-behind residue is in the **separate, legacy** `.context-index/build-state/` directory: `lib/migrate-state-artifacts.mjs::migrateLifecycleState` (lines 928-932, 950-952) explicitly leaves the source `<slug>.json` files there after translating them into `lifecycle-state/<slug>.jsonl`, "for operator verification... operator may delete manually" — this is spec-mandated, not a bug. The 12 files this section counted are genuine stale residue in that old directory (all dated 2026-04-23–2026-05-08 as of this correction, gitignored, never tracked) — safe to delete manually, but out of scope for automated cleanup of a shared checkout.
>
> Separately, the 25 `lifecycle-state/*.json` files sampled were all `"status": "completed"` builds dated 2026-05-15–2026-06-19 — i.e. the live format works, but nothing garbage-collects a build-state file once its build finishes, so they accumulate indefinitely. That is a real (small) gap, but the fix is "add a completed-build prune path to `lib/build-state.mjs`," not "delete migration residue." See issue-580 for the corrected scope.

Platform note (see `agentic-frameworks-market-update-2026-08.md`): Claude Code now natively persists dependency-aware task lists across compaction/resume and offers `SessionEnd`-hook transcript archival — on that harness, `.execution-state.json` and the session-capture pipeline are eligible for retirement. **But adev is multi-provider** (`providers/{codex,copilot,cursor,opencode}` mirrors): codex/copilot/cursor/opencode have no equivalent of Claude Code's task persistence, auto memory, or worktree-isolated subagents. Plumbing that a single harness has absorbed must therefore be **demoted to a provider adapter, not deleted** — adev-owned state stays the portable default, and a per-provider capability map decides when the adapter delegates to native machinery instead.

## Recommendations (by leverage)

1. **Fix the `--tier` contract break** in `/adev:build` (small, high impact — the quick lane is currently decorative for full builds).
2. **Merge `reconcile` → `hygiene --fix`**; make hygiene the single owner of drift detection (validate keeps only its verification-scoped Check 1.5, deduped with 1.6).
3. **Delete `standalone`** after fixing bug D3 so the CLI escape actually works.
4. **Hoist the skill-extension block** (mechanism change + test update; −217 lines).
5. **Demote the five deterministic skills** (`codehealth`, `repomap`, `document`, `deploy`, `sync`) + `learn` + `issues` to CLI verbs; update `/adev:work`'s classification table to route those intents to verbs.
6. **Merge `eval` → `validate --score`; `assess` → `init --brownfield`; point `using-adev` at `/adev:work`.**
7. **CLI: drop `diagnose`/`migrate`/CLI-`init`, merge state+verify+report and artifact+partial, nest parallel/worktree under implement.**
8. ~~Finish the state migration: delete the 25 orphaned twins, retire `build-state/`, then retire `migrate-state-artifacts.mjs`.~~ **Superseded (issue-580):** the "25 orphaned twins" premise was wrong — see §F correction. Revised: (a) manually clear genuinely stale files in the legacy `.context-index/build-state/` directory (untracked, gitignored, ~12 files as of the correction); (b) `adev migrate` is deprecated in output/docs but kept shipping — other installs still need it as an upgrade path, so `migrate-state-artifacts.mjs` is not retired; (c) consider adding a completed-build prune path to `lib/build-state.mjs` so `lifecycle-state/*.json` doesn't accumulate indefinitely. For `.execution-state.json` + session capture, do **not** simply retire in favor of Claude Code native features — adev targets multiple harnesses. Instead, introduce a provider capability map and let the Claude Code adapter delegate to native task persistence/`SessionEnd` while other providers keep the adev-owned implementation.

Constitution note: items 2, 5, 6 change the skill lifecycle surface — **requires human approval** per CLAUDE.md Architecture Boundaries. Items 1, 4, 7, 8 are within autonomous scope once specced.

## References

- `.context-index/research/adev-simplification-synthesis.md` (2026-07-01) — the program this audits
- `.context-index/research/agentic-frameworks-market-update-2026-08.md` (2026-08-12) — market + platform-absorption ledger
- `.context-index/research/review-validation-restructuring.md` — gate-dedup plan (partially executed)
- `.context-index/research/token-consumption-patterns-in-adev-lifecycle.md` — A/B-validated runtime wins (5a shipped; 5b/5d partial; 5e unshipped)
- `lib/governance/rigor-mode.mjs`, `skills/work/SKILL.md:200-215` — shipped rigor-tier machinery
- Audit evidence gathered 2026-08-12 on main @ `1d2f8e7f`; key claims (build `--tier`, dead `adev issues` verb, 25 state-file twins) independently re-verified

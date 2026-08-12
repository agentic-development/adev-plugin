---
topic: "Agentic/SDD framework landscape update — what changed 2026-07-01 → 2026-08-12, and which adev components the platform now provides natively"
date: "2026-08-12"
relates-to: ""
sources:
  - web
status: complete
---

## Summary

Two currents dominate the six-week window. First, **the market is consolidating around adev's shape while simultaneously shrinking its own surfaces**: Spec Kit added constitution-sync, runtime hooks, and an extension catalog (converging on adev's architecture) but still refuses a lighter merged path; BMAD executed exactly the consolidation adev now faces — **skills reduced 14 → 8, with "one official way BMad implements code"**; Tessl retreated from spec-as-source to distributing methodology-as-markdown tiles. Second, **the platform absorbed a large slice of lifecycle plumbing**: Claude Code now natively provides persistent dependency-aware task lists, worktree-isolated background subagents, dynamic workflows, `/code-review`//`/simplify`//`/security-review`, checkpoint/rewind, and always-loaded auto memory. The strategic conclusion for adev: **keep the semantics (specs, charters, drift detection, rigor tiers, traceability), delete the plumbing (state files, session capture, worktree management, generic code-review passes), and shrink the skill surface** — the discourse itself has moved to "thin prompts, thick artifacts, thin skills."

Also notable: **Agent Plugins v1.0** (OpenAI-led open standard, Aug 6; adopted by Kiro, Cursor, GitHub, VS Code) creates for the first time a portable packaging unit for exactly what adev ships — worth evaluating as a second distribution target. And GSD's governance collapse (author unreachable after a token rug-pull; community fork `open-gsd/gsd-core` at 8.1k stars restarting from v1.7.0) shows single-maintainer risk is now a real adoption criterion.

This artifact updates `sdd-frameworks-comparison.md` (2026-05-14) and the web half of `adev-simplification-synthesis.md` (2026-07-01).

## Findings

### Peer frameworks — what changed

- **GitHub Spec Kit** v0.12.2 → **v0.16.2 (Aug 10)**, ~14 releases: `assess` idea-assessment extension (v0.13.0), bash→Python port + Factory Droid integration (v0.13.2–4), workflow **step catalog** + first-class **agent-native runtime hooks** + opt-in **constitution-sync** preset (v0.15.x), context injection for agent hooks and Copilot default switching to **skills over commands** (v0.16.0, version attribution slightly uncertain). Merged-lighter-mode proposal [#2673](https://github.com/github/spec-kit/issues/2673) closed without adoption (inferred from changelog absence). Sources: [releases](https://github.com/github/spec-kit/releases), [CHANGELOG](https://raw.githubusercontent.com/github/spec-kit/main/CHANGELOG.md).
  *So what:* Spec Kit is converging on adev's architecture (hooks, skills, constitution sync, extensions) but still has no graduated rigor — adev's tiers remain a real differentiator.

- **AWS Kiro**: Kiro CLI 3.0 early access with **global hooks** (`~/.kiro/hooks/`, Jul 17–20); guided `/spec new` drafting; plan mode auto-executes approved plans; `/tangent` side-conversations; per-tool token breakdown in `/context`; multi-vendor models (GPT-5.6 family Jul 14, Opus 5 Jul 24); **Powers now accept the open Agent Plugin format** (Aug 7, v1.0.288). Sources: [releasebot](https://releasebot.io/updates/kiro), [kiro.dev/changelog](https://kiro.dev/changelog/) (aggregator-heavy — some details unverified).

- **OpenSpec** v1.7.0 (Jul 29) / v1.8.0 (Aug 5): 8 new agent targets, ~160 fewer npm deps, and **early scenario-loss detection during validation** — a light spec-drift guard. Still in ThoughtWorks Radar Vol. 34 "Assess" (Apr 2026, current). Spec Kit users cite OpenSpec as the reference lightweight loop (#2673). Source: [releases](https://github.com/Fission-AI/OpenSpec/releases).
  *So what:* validation-time drift guards are going mainstream; adev's hygiene/reconcile passes are ahead, not behind.

- **BMAD-METHOD** v6.9–v6.11: `bmad-loop` marketplace module for **unattended lifecycle orchestration** (v6.10.0, Jul 3); **v6.11.0 (Aug 10) consolidation: 14 skills → 8**, "Quick Dev becomes Build, the one official way BMad implements code," unified `bmad-review` with configurable lenses. Source: [releases](https://github.com/bmad-code-org/BMAD-METHOD/releases).
  *So what:* the heaviest framework in the market just did the skill-surface consolidation adev's 31-skill surface needs; "one blessed implement path + configurable review lenses" is a proven pattern.

- **GSD**: governance rupture — original author unreachable amid a $GSD Solana token controversy (May 2026); community fork **open-gsd/gsd-core** (8.1k stars, v1.7.0) is the maintained line, targeting 9 harnesses; the ~59.6k-star original is frozen. Sources: [gsd-core](https://github.com/open-gsd/gsd-core), [discussion #109](https://github.com/open-gsd/gsd-core/discussions/109).

- **Tessl**: Framework still closed beta (~9 months, not GA); shipped **Spec Registry open beta** (10k+ usage specs); product reframed as **Skills + Rules + Docs tiles** — spec-as-source survives only as a registry tile. Source: [tessl.io blog](https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry/).
  *So what:* confirms markdown-skill distribution as the winning delivery form; the purest spec-as-source vendor now ships methodology-as-content.

- **Orchestrator adjacents**: Gas Town (Yegge) grew a trust network ("Wasteland"), a Gas City SDK for hundreds of agents, and a cloud offering; buildomator (GSD-plugin descendant) ships MCP-backed state + drift safeguards with claimed ~92% lower per-turn overhead; oh-my-claudecode pushes teams-first orchestration. Anthropic's native agent teams (Feb 2026) and Dynamic Workflows (May 2026) are the gravity well they all orbit.

### New entrants and cross-vendor moves

- **Agent Plugins v1.0** (OpenAI, announced Aug 6, 2026): portable format bundling Agent Skills + MCP configs, adopted across OpenAI, Cursor, GitHub, VS Code, Kiro, Hermes, OpenClaw. Details from secondary sources only ([digitalapplied](https://www.digitalapplied.com/blog/agent-plugins-1-0-open-standard-portable-ai-skills), [explainx](https://explainx.ai/blog/agent-plugins-openai-standard-aws-cursor-github-vscode-2026)) — spec text not yet reviewed.
  *So what:* first interop standard for adev's exact packaging unit; evaluate an Agent Plugin build target alongside the existing providers/ mirrors (which already prove the multi-harness intent).
- **Google Conductor** (Gemini CLI extension; now advertises Antigravity **and Claude Code** support): `/conductor:setup|newTrack|implement`, persistent markdown "tracks" (spec + hierarchical plan). [Repo](https://github.com/gemini-cli-extensions/conductor).
  *So what:* a Google-blessed adev-lite now installable in Claude Code — direct competitor plugin.
- **Intent** (Augment Code): commercial "Living Specs + Coordinator agent" workspace — adev's loop, productized ([comparison page](https://www.augmentcode.com/tools/intent-vs-kiro)).
- **Codex CLI**: `/plan` read-only mode; `PLANS.md`/ExecPlan living-document convention for long runs. **Cursor 2.1**: improved Plan Mode, in-editor AI code review.
- **Spec-drift tooling as a category**: arXiv ["Spec Growth Engine"](https://arxiv.org/pdf/2606.27045) (spec-anchored, code-coupled, drift-enforced); SmartBear/Swagger contract testing aimed at AI-created API drift; OpenSpec scenario-loss detection; buildomator drift safeguards.

### Claude Code platform absorption (native-vs-plugin ledger)

As of v2.1.229 (Aug 2026), verified against code.claude.com docs and the official changelog:

| adev component | Native overlap now | Verdict |
|---|---|---|
| Issues board (`tasks.json`) | Persistent dependency-aware task list, `CLAUDE_CODE_TASK_LIST_ID` shared lists — but 30-day retention, 3 states, no epics/priorities | **Keep as durable backlog**; drop within-run task mirroring |
| `.execution-state.json` | Task persistence across compaction/resume; named sessions; `/recap` | **Mostly redundant** |
| Session capture (`sessions/*.md`) | Auto memory (always-loaded MEMORY.md), `/recap`, JSONL transcripts + `SessionEnd` hook | **Mostly redundant** |
| Learn/heuristics store | Auto memory | Justified only as team-shared, checked-in store |
| Worktree parallel-implement plumbing | `--worktree`, `isolation: worktree` on subagents, background agents, agent teams (task locking, `TaskCreated`/`TaskCompleted`/`TeammateIdle` gate hooks), dynamic workflows (16 concurrent/1000 total, resumable) | **Infrastructure obsolete; keep only lifecycle semantics** (routing, TDD enforcement, traceability) |
| review-specs | `/code-review` (levels + ultra), `/security-review`, managed Code Review service — all code-diff scoped | Spec-*document* review still unique; drop the security code pass |
| validate | `/code-review --fix`, `/simplify` | Keep spec/constitution compliance + source manifest; code-quality overlap shrinking |
| codehealth | `/simplify` (diff-scoped only) | Repo-wide scans still justified, shrinking |
| recover | `/rewind` checkpoints, subagent partial-work return, agent-failure notifications | Keep diagnosis/classification; drop state plumbing |
| repomap / document / eval | none | No native equivalent |

Skill-authoring guidance (current): no cap on skill count, but description (≤1024 chars) is the sole selection signal among "100+ skills," SKILL.md body <500 lines, ~100 tokens metadata always loaded per skill. 31 always-loaded descriptions with overlapping trigger phrases is the documented discovery-collision failure mode. Hook protocol (stdin JSON, exit 0/2) unchanged — adev's contract holds. Sources: [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [changelog](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).

### Industry commentary

- Discourse shifted from "should you write specs" to **"how do you keep spec/code/tests in sync"** (Drew Breunig's "SDD triangle" talk + [Ahuja's response](https://medium.com/codetodeploy/spec-driven-development-is-headed-toward-its-death-and-i-watched-the-best-defense-of-it-1f37b49a5c91), Jul 2026) and **"how thin can scaffolding be."**
- Anthropic reportedly cut ~80% of Claude Code's system prompt for the Claude 5 models with no eval loss — "thin prompts, thick artifacts + context, thin skills" ([secondary](https://explainx.ai/blog/claude-5-context-engineering-thariq-doctor-july-2026), unverified against a primary post).
  *So what:* near-verbatim the `.context-index/` philosophy — quotable positioning, and an argument for trimming SKILL.md bulk.

## Recommendations

1. **Do the BMAD-style consolidation.** 31 skills → a core of ~8–12 lifecycle verbs behind `/adev:work`, with maintenance/read-only surfaces merged or demoted to CLI verbs. BMAD (14→8) proves the move is survivable for a methodology-heavy framework; Anthropic guidance makes the discovery-collision cost concrete.
2. **Demote plumbing the platform now owns to provider adapters** (execution-state, session capture, worktree management, security code pass) per the ledger above. On Claude Code, route through native primitives (`SessionEnd` hook for capture, `isolation: worktree` subagents for parallel implement, `TaskCompleted` hooks for gates); on other harnesses (`providers/{codex,copilot,cursor,opencode}`), which lack these primitives, keep the adev-owned implementation as the portable default. The ledger above is a *Claude Code* capability map — the decision rule is per-provider, not global deletion.
3. **Lean into drift detection as the headline capability.** The market (OpenSpec scenario-loss, buildomator, SmartBear, arXiv) just validated hygiene/reconcile as a category — market it as first-class, not plumbing.
4. **Evaluate an Agent Plugins v1.0 build target** once the spec text is reviewable; the providers/ mirrors already prove multi-harness packaging intent.
5. **Keep the rigor tiers and charter layer.** No peer shipped graduated rigor in the window (Spec Kit closed #2673 unadopted); the charter-layer validation from `sdd-frameworks-comparison.md` stands.

## Uncertainty ledger

- Spec Kit #2673 closure outcome inferred (closing comment not visible); v0.16.0 item attribution differs between releases page and changelog.
- Kiro window details rely on releasebot aggregation.
- Agent Plugins v1.0 details from secondary blogs; spec text not fetched.
- "Thin prompts" Anthropic quote is secondary-source; superpowers June–Aug changes unverifiable; "9,000+ plugins" claim unverified.
- Tasks-replaced-Todos dating (v2.1.16, Jan 2026) from secondary changelogs.

## References

Peer frameworks: [Spec Kit releases](https://github.com/github/spec-kit/releases) · [Spec Kit #2673](https://github.com/github/spec-kit/issues/2673) · [Kiro changelog](https://kiro.dev/changelog/) · [Kiro powers](https://kiro.dev/docs/powers/) · [OpenSpec releases](https://github.com/Fission-AI/OpenSpec/releases) · [ThoughtWorks Radar — OpenSpec](https://www.thoughtworks.com/en-us/radar/tools/openspec) · [BMAD releases](https://github.com/bmad-code-org/BMAD-METHOD/releases) · [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) · [Tessl registry](https://tessl.io/registry/tessl-labs/spec-driven-development) · [Gas Town](https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04) · [Gas Town cloud (TNS)](https://thenewstack.io/steve-yegges-ai-agent-orchestration-project-gas-town-comes-to-the-cloud-and-brings-the-wasteland-with-it/)

New entrants: [Agent Plugins v1.0 (secondary)](https://www.digitalapplied.com/blog/agent-plugins-1-0-open-standard-portable-ai-skills) · [Google Conductor](https://github.com/gemini-cli-extensions/conductor) · [Intent vs Kiro](https://www.augmentcode.com/tools/intent-vs-kiro) · [Codex changelog](https://developers.openai.com/codex/changelog) · [Cursor 2.1](https://cursor.com/changelog/2-1) · [Spec Growth Engine (arXiv)](https://arxiv.org/pdf/2606.27045)

Claude Code platform: [code-review](https://code.claude.com/docs/en/code-review) · [worktrees](https://code.claude.com/docs/en/worktrees) · [agent-teams](https://code.claude.com/docs/en/agent-teams) · [workflows](https://code.claude.com/docs/en/workflows) · [memory](https://code.claude.com/docs/en/memory) · [sessions](https://code.claude.com/docs/en/sessions) · [checkpointing](https://code.claude.com/docs/en/checkpointing) · [skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) · [claude-code CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md)

Commentary: [SDD triangle response (Ahuja)](https://medium.com/codetodeploy/spec-driven-development-is-headed-toward-its-death-and-i-watched-the-best-defense-of-it-1f37b49a5c91) · [On Spec (chicagobotdog)](https://www.chicagobotdog.com/2026/07/on-spec.html) · [Claude 5 context engineering (secondary)](https://explainx.ai/blog/claude-5-context-engineering-thariq-doctor-july-2026)

### Cross-references inside adev
- `.context-index/research/sdd-frameworks-comparison.md` (2026-05-14) — baseline taxonomy this updates
- `.context-index/research/adev-simplification-synthesis.md` (2026-07-01) — simplification program this extends
- `.context-index/research/token-consumption-patterns-in-adev-lifecycle.md` — runtime-weight evidence

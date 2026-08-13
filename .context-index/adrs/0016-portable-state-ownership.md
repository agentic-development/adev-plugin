# ADR 0016: adev-Owned State Is Canonical; Harness-Native Features Are Triggers, Never Stores

## Status

**Proposed**

> **Proposed 2026-08-12**: Establishes that all adev state lives harness-neutrally in `.context-index/`, and that harness-native features (Claude Code task lists, auto-memory, checkpoints, native worktree orchestration, etc.) may be used as *triggers and integrations* but never as the *system of record*. Rejects the "provider capability map" subsystem proposed by the 2026-08 simplification audit.

## Date

2026-08-12

## Context

adev targets five harnesses — Claude Code (canonical), OpenCode, Codex, Cursor, and Copilot — through peer adapters under `providers/`. During 2026, Claude Code absorbed large slices of lifecycle plumbing natively: persistent dependency-aware task lists, auto-loaded memory, session transcripts with a `SessionEnd` hook, checkpoint/rewind, background subagents with worktree isolation. The 2026-08 market research (`.context-index/research/agentic-frameworks-market-update-2026-08.md`) catalogued this as a "native-capability ledger" and recommended demoting the overlapping adev plumbing — execution state, session capture, worktree orchestration — to per-provider adapters that delegate to native machinery where it exists. Issue-581 proposed a **provider capability map** subsystem (bundled per-provider capability YAML + project overlay, modeled on ADR 0004's execution profiles) to drive those delegation decisions.

Two operator-supplied constraints invalidate that direction:

1. **Cross-harness state sharing is a roadmap goal.** A repo should be workable from more than one harness — start work under Claude Code, continue under Codex — with adev's lifecycle state coherent across both. Harness-native stores are per-harness silos by construction (`~/.claude/` task lists and memory are unreadable by other harnesses; other harnesses have their own stores or none). Delegating state *into* a native store makes it invisible to every other harness and forecloses the sharing goal.

2. **Native capability quality is not capability existence.** Operational experience with Claude Code's native worktree orchestration has been poor. A docs page proving a feature exists is not evidence it should carry adev's workload. Delegation decisions premised on the ledger's existence claims overestimate what can be safely handed off.

There is also a scale mismatch: once state delegation is off the table, the remaining per-harness variance is small — which hook events exist, what tool names are called, what a skill/instruction file is named. The provider adapters already own exactly this class of data (the copilot adapter's Claude-event → Copilot-event translation table and tool-name mapping, per the `copilot-provider` charter). A new cross-cutting capability-map subsystem would duplicate an existing, working pattern to answer questions the adapters already answer.

## Decision

1. **`.context-index/` is the single system of record for all adev state** — lifecycle event logs, execution state, session captures, the issue board, milestones, heuristics, build-resume snapshots. Every artifact is plain files inside the repo (or its gitignored working set), readable and writable by adev's zero-dependency CLI from any harness. No adev state may live only in a harness-native store.

2. **Harness-native features are permitted as triggers, transports, and mirrors — never as stores.** The test: *if this harness disappeared tomorrow, would any adev state be lost or would any other harness see a different history?* If yes, the integration is forbidden.
   - Permitted (trigger): registering session capture on Claude Code's `SessionEnd` hook instead of per-tool-call accumulation — the capture still lands in `.context-index/sessions/`.
   - Permitted (mirror): rendering the issue board into a harness's native task list for display, provided the board remains the writable source of truth.
   - Forbidden (store): replacing `.execution-state.json` with native session persistence; replacing `sessions/` capture with native auto-memory; making native checkpoints the resume mechanism for lifecycle state.

3. **Per-harness variance data lives in the provider adapters**, extending the existing translation-table pattern (event tables, tool-name maps, file-convention paths). No new capability-map subsystem, no `capabilities.yaml` layer, no runtime capability query verb.

4. **Worktree/parallel orchestration remains adev-owned.** Native worktree isolation may be *offered* as an opt-in dispatch variant where an operator finds it reliable, but adev's own orchestration stays the default and the only path adev guarantees.

5. **Future work this decision anticipates but does not build (YAGNI):** a *cross-harness state coherence* charter — concurrent-writer semantics when two harnesses operate on one repo simultaneously. The CAS discipline on `tasks.json` (`lib/issues/json-adapter.mjs::_withCas`) is the template; `.execution-state.json` is single-writer today and may need the same treatment then. That charter should be written when a second harness is actually in day-to-day use, not before.

## Consequences

- Issue-581 is rescoped from "build a capability map" to "adopt this ADR + fold any needed variance entries into the provider adapters' existing tables."
- The 2026-08 market-update artifact's recommendation 2 ("demote plumbing the platform now owns to provider adapters") is narrowed: only *trigger/transport* choices are adapter decisions; state ownership is settled here and is not a per-provider decision.
- The session-capture pipeline (`.context-index/sessions/`) is confirmed as a keeper at the storage layer; its *trigger* migrated to `SessionEnd`/`PreCompact` hooks on Claude Code (2026-08-12) in exactly the pattern clause 2 permits. Whether the captured *content* is worth its weight remains a separate open question (existing board issue on `specs-touched` emptiness) — this ADR settles where capture writes, not whether it writes.
- The skill-extension boilerplate hoist (issue-577) no longer waits on a capability model: its mechanism must simply work from plain files + CLI on every harness, same as everything else.
- `platform-context.yaml`'s `plugin_target: claude-code` line is stale under this ADR's multi-harness framing and should be generalized when that file is next touched.
- Simplification work that *deletes* redundant adev plumbing must justify the deletion harness-neutrally (dead on all harnesses), never by pointing at a single harness's native replacement.

## Alternatives Considered

- **Provider capability map subsystem (issue-581 as filed):** bundled per-provider `capabilities.yaml` + project overlay + resolution lib, driving install-time or runtime delegation. Rejected: its main payload (state delegation) is forbidden by the sharing goal; the residue (event/tool variance) already has a home in adapters; it would add a third YAML-overlay-resolution machine (after execution profiles and domain gate-config) for marginal benefit.
- **Full native delegation on Claude Code:** treat Claude Code as privileged and delegate state to its native stores, keeping portable implementations only for other providers. Rejected: forks state history by harness, breaks the sharing goal, and couples adev's core to one vendor's feature quality.
- **Status quo silence:** leave the question undecided per-feature. Rejected: the 2026-08 audit shows the "native absorbs it, delete ours" argument recurs every time a harness ships a feature; without a standing decision, each recurrence relitigates state ownership.

## References

- `.context-index/research/agentic-frameworks-market-update-2026-08.md` — native-capability ledger this ADR constrains
- `.context-index/research/skill-surface-simplification-audit-2026-08.md` — audit that filed issue-581
- `.context-index/specs/features/copilot-provider/charter.md` — the adapter translation-table pattern clause 3 extends
- ADR 0004 (execution profiles) — the overlay pattern the rejected capability map would have copied
- ADR 0005 (workspace isolation invariant), ADR 0015 (lifecycle-state dual-format coexistence) — adjacent state-layout decisions

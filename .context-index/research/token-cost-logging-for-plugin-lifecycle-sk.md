---
topic: "How could we add token cost logging to each plugin lifecycle skill"
date: "2026-04-20"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

## Summary

The adev-plugin already has session-tracking infrastructure (JSONL hooks, session capture) that could be extended with token cost fields. The most practical approach for a zero-dependency plugin is a `Stop` hook that reads Claude Code's local JSONL session files and appends per-skill token usage deltas to a project-local log. The Claude Agent SDK provides first-class `modelUsage` objects with full token breakdowns, but this requires adopting the SDK rather than relying on hooks alone.

## Findings

### Internal

- **Existing session tracking via JSONL.** The plugin already captures tool usage to `.context-index/.session-tracking.jsonl` via `hooks/session-capture.sh`. Each entry includes `tool`, `files`, `timestamp`, `operator`, and optional `issue`/`epic` fields. Token/cost metadata could be appended to this existing format rather than creating a new tracking file. (`hooks/session-capture.sh:48-52`)

- **Hook protocol supports metadata injection.** The hook system uses stdin/stdout JSON with `hookSpecificOutput.additionalContext` for injecting context. A new PostToolUse or Stop hook could follow this pattern to capture token metrics. (`hooks/issue-reminder.mjs:20-27`, `hooks/session-capture.sh:14-127`)

- **Skill identity is determinable from announcements.** Every lifecycle skill announces itself with a message like "I'm using the adev:plan skill to…". Skills have structured frontmatter with `name`, `description`, and `allowed-tools`, providing unique identification for cost attribution. (`skills/plan/SKILL.md:10`, `skills/build/SKILL.md:10`)

- **Multiple integration points exist.** PostToolUse hooks are the cleanest insertion point since they already have execution context. Session summaries (`lib/session-summary.mjs:50-59`) and build state (`build-state/<slug>.json`) are existing storage targets. (`hooks/hooks.json:38-69`)

- **Storage convention is established.** Tracking data follows `.context-index/` conventions: `.session-tracking.jsonl` for events, `.execution-state.md` for active state, `build-state/<slug>.json` for per-build outcomes. Token cost logs could go to `.context-index/.token-usage.jsonl` or as a `tokenUsage` field in build state JSON. (`hooks/session-capture.sh:120-127`)

### Web

- **Claude Code hooks do NOT expose per-invocation token usage.** The hook JSON input schema includes `session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input` — but no token count or cost fields. A GitHub feature request (issue #38344) confirms this data is not yet available in hooks as of early 2026. (Source: hooks-guide docs, anthropics/claude-code#38344)

- **The `Stop` hook is the best available hook point for per-skill cost approximation.** It fires whenever Claude finishes responding, mapping naturally to skill invocation boundaries. However, the hook payload itself does not contain token data — the script must read it from another source. (Source: hooks-guide docs)

- **The Claude Agent SDK exposes full per-invocation token usage.** Each `query()` result carries `total_cost_usd` and `modelUsage` with `{ inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, costUSD }` per model. These are client-side estimates from a bundled price table. (Source: Agent SDK cost-tracking docs)

- **Prompt caching fields are available in SDK usage objects.** `cache_creation_input_tokens` (higher rate) and `cache_read_input_tokens` (~10% of standard) are tracked separately from `input_tokens`. The SDK manages caching automatically. (Source: Agent SDK cost-tracking docs)

- **The Admin Usage API provides authoritative post-hoc data** but requires an Admin API key and org-level access — unsuitable for real-time per-skill logging inside a plugin. (Source: platform.claude.com usage-cost-api docs)

- **Local JSONL session files are the practical data source.** Claude Code writes session data to local JSONL files (`~/.claude/projects/<hash>/<session>.jsonl`). A `Stop` hook can read these and compute per-turn deltas. Tools like `ccusage` demonstrate this approach. (Source: ryoppippi/ccusage, Claude Code costs docs)

- **Proxy-based approaches (e.g., `ccxray`) intercept raw API responses** for exact `usage` objects per request. This provides precise token breakdowns but requires a transparent HTTP proxy — unsuitable for a zero-dependency plugin. (Source: awesome-claude-code)

## Code Examples

### Approach A: Stop Hook reading JSONL session files

```javascript
// Example: Stop hook that reads Claude Code JSONL session logs for token deltas
// Source: Adapted from hooks/session-capture.sh pattern + ccusage approach
// File: hooks/token-cost-logger.mjs

import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const sessionId = input.session_id;

// Read the Claude Code session JSONL and extract latest usage
const homeDir = process.env.HOME;
const sessionDir = join(homeDir, '.claude', 'projects');
// Parse session JSONL for usage fields, compute delta, append to tracking log

const entry = {
  timestamp: new Date().toISOString(),
  session_id: sessionId,
  // skill_name: resolved from context or execution state
  // input_tokens: delta since last stop event
  // output_tokens: delta
  // cache_read_tokens: delta
  // cost_usd: estimated
};

appendFileSync('.context-index/.token-usage.jsonl',
  JSON.stringify(entry) + '\n');

process.stdout.write(JSON.stringify({}));
process.exit(0);
```

### Approach B: Skill-level logging via markdown instructions

```markdown
<!-- Example: Adding cost logging instructions to a skill's SKILL.md -->
<!-- Source: Constitution principle #2 (skills are primarily markdown) -->

### Step N: Log Token Usage (Post-Completion)

After completing all skill steps, append a usage summary to
`.context-index/.token-usage.jsonl` using the following JSONL format:

{
  "skill": "<skill-name>",
  "timestamp": "<ISO-8601>",
  "subagents_dispatched": <count>,
  "model_tiers_used": ["fast", "capable"],
  "estimated_turns": <count>
}

Note: Exact token counts are not available from within a skill's
markdown execution context. This provides activity-level tracking only.
```

### Approach C: Agent SDK wrapper (if adopting SDK)

```javascript
// Example: Wrapping Agent SDK query() calls with cost tracking
// Source: Claude Agent SDK cost-tracking docs

import { query } from '@anthropic-ai/claude-agent-sdk';

async function trackedQuery(prompt, options) {
  const result = await query(prompt, options);
  const usage = {
    skill: options.skillName,
    timestamp: new Date().toISOString(),
    total_cost_usd: result.total_cost_usd,
    models: result.modelUsage, // per-model breakdown
  };
  // Append to .context-index/.token-usage.jsonl
  return result;
}
```

## Recommendations

1. **Start with a Stop hook reading JSONL session files (Approach A).** This aligns with constitution principle #1 (minimize external dependencies — uses only `node:fs` and `node:path`) and principle #4 (hook protocol compliance). It builds on the existing `session-capture.sh` pattern, requires no SDK adoption, and provides approximate but useful per-skill cost data. The main challenge is reliably mapping Stop events to skill boundaries.

2. **Extend the existing `.session-tracking.jsonl` format rather than creating a new file.** Adding `input_tokens`, `output_tokens`, `cache_tokens`, and `estimated_cost_usd` fields to existing session tracking entries keeps the data model unified and avoids file proliferation. This respects the established storage conventions (principle #4, existing patterns).

3. **Use skill announcements + execution state for skill identification.** Each skill already announces itself and writes to `.context-index/.execution-state.md`. A Stop hook can read execution state to determine which skill is active, then attribute costs accordingly. No new identification mechanism needed.

4. **Add a `/adev:cost` skill for querying accumulated usage.** A read-only markdown skill that reads `.token-usage.jsonl` and produces summaries (per-skill, per-session, per-day) would complete the feedback loop. This follows principle #2 (skills are primarily markdown) and mirrors the existing `/adev:status` pattern.

5. **Watch anthropics/claude-code#38344 for native hook token exposure.** If Claude Code adds token usage to hook payloads, the Stop hook approach becomes much cleaner — no need to parse JSONL session files. The plugin should be designed so the data source (JSONL parsing vs. hook payload) is swappable.

6. **Defer Agent SDK adoption (Approach C) unless the plugin moves to programmatic orchestration.** The SDK provides the most accurate data but introduces an external dependency (violating principle #1) and changes the execution model. Only justified if the plugin evolves beyond markdown skills + hooks.

## References

### Internal Files
- `hooks/session-capture.sh` — existing session tracking hook with JSONL output
- `hooks/hooks.json` — hook registration and event configuration
- `hooks/issue-reminder.mjs` — example of PostToolUse hook protocol
- `lib/session-summary.mjs` — session metadata with YAML frontmatter
- `skills/plan/SKILL.md` — lifecycle skill with announcement pattern
- `skills/build/SKILL.md` — build orchestrator with build-state tracking

### Web Sources
- [Claude Code Hooks Guide](https://code.claude.com/docs/en/hooks-guide) — hook event types and JSON payload schema
- [Claude Agent SDK Cost Tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking) — modelUsage and total_cost_usd fields
- [Claude Code Costs](https://code.claude.com/docs/en/costs) — /cost command and local session tracking
- [Anthropic Usage & Cost API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api) — admin-level usage reporting
- [ccusage (ryoppippi/ccusage)](https://github.com/ryoppippi/ccusage) — JSONL session file parser for cost analysis
- [anthropics/claude-code#38344](https://github.com/anthropics/claude-code/issues/38344) — feature request for token usage in hook payloads

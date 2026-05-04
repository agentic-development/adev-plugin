---
name: adev:learn
description: "Capture a lesson learned as a heuristic in the project's memory store. Use when the user says 'remember this', 'save this lesson', 'learn that...', 'file a heuristic', 'we learned that...', or shares a rule/pattern that should persist across sessions. In OpenCode, invoke with skill({ name: 'adev:learn' })"
---

# Capture a Heuristic

Explicit user-driven capture of lessons the automated lifecycle missed. Takes a free-text lesson and distills it into a structured heuristic entry in `.context-index/memory/heuristics/`.

**Announce at start:** "I'm using the /adev:learn skill to capture this lesson as a heuristic."

## Arguments

- *(positional)*: Free-text lesson or rule. Examples:
  - `/adev:learn "always run tests before committing hook changes"`
  - `/adev:learn "the repomap parser chokes on re-exports — use named exports"`
- `--module <module>`: Target module scope (e.g., `hooks`, `cli`). If omitted, infer from context or ask.
- `--anti-pattern <text>`: Explicit counter-rule ("don't do this"). If omitted, attempt to derive one.
- `--list`: List all heuristics, optionally filtered by `--module`.
- `--promote <id>`: Promote a heuristic's confidence one level up.
- `--demote <id>`: Demote a heuristic's confidence one level down.
- `--archive <id> --reason <text>`: Archive a heuristic with a reason.

## Prerequisites

1. `.context-index/` must exist. If not, stop and suggest `/adev:init`.
2. The adev plugin's `lib/heuristics.mjs` must be accessible (it provides the storage API). Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. Use `<ADEV_ROOT>/lib/heuristics.mjs` for imports.

## Step 1: Parse Input

If the user provided a positional argument, use it as the raw lesson text.

If no argument was provided, ask:

```
What lesson should I capture? Describe:
- What to do (or what not to do)
- Why (what went wrong or what worked)
```

Wait for the user's response.

## Step 2: Determine Scope

The scope maps to a module slug from `manifest.yaml`. Heuristics scoped to a module are injected into agent context when working on that module.

**If `--module` was provided**, validate it exists as a module in the manifest or use `_global`. Proceed.

**If no scope**, infer from the lesson text:
1. Check if the lesson mentions a module name, skill name, or file path that maps to a manifest module.
2. If a clear match is found, propose it:
   ```
   This seems related to the **hooks** module. Use that scope? (yes / different / global)
   ```
3. If no match, ask:
   ```
   Which module does this apply to?
   1. hooks
   2. cli
   3. implementation
   ...
   N. Global (applies to all modules)
   ```

## Step 3: Distill the Heuristic

Transform the raw lesson into the structured heuristic format. This is the critical step — the goal is to **generalize** the lesson so it's useful in future contexts, not to record a specific incident.

**Generate these fields:**

| Field | How to derive |
|-------|---------------|
| `title` | Short imperative summary (max 120 chars). e.g., "Verify hook JSON contract after edits" |
| `pattern` | The "do this" rule (max 500 chars). Write as a concrete instruction an agent can follow. |
| `anti-pattern` | The "don't do this" counter-rule (max 500 chars). Derive from the lesson's failure case, or from `--anti-pattern` if provided. |
| `id` | Safe-slug derived from the title: lowercase, kebab-case, max 64 chars. e.g., `verify-hook-json-after-edits` |
| `confidence` | Start at `low` for first-time lessons. If the user says "this has happened multiple times" or "we keep hitting this", use `medium`. |

**Redaction check:** Ensure the pattern and anti-pattern do NOT contain:
- Credentials, tokens, API keys
- PII (names, emails, IPs)
- Literal file contents that should be linked instead

If any are detected, redact and link to evidence instead.

## Step 4: Present for Confirmation

Show the user the proposed heuristic before writing:

```
Proposed heuristic:

  Scope:        hooks
  ID:           verify-hook-json-after-edits
  Title:        Verify hook JSON contract after edits
  Pattern:      After editing any hook script or hooks.json, run the hook
                test suite to confirm the stdin/stdout JSON contract is intact.
  Anti-pattern: Assume a hook edit is correct based on a manual dry-run alone.
  Confidence:   low

Save this? (yes / edit / cancel)
```

- **yes**: Proceed to write.
- **edit**: Ask which field to change, apply the edit, re-present.
- **cancel**: Abort without writing.

## Step 5: Write the Heuristic

Construct the heuristic entry object:

```javascript
{
  id: "<generated-id>",
  scope: "<scope>",
  title: "<title>",
  pattern: "<pattern>",
  antiPattern: "<anti-pattern>",
  confidence: "low",
  evidence: [{
    path: "<current-session-file-or-conversation-ref>",
    date: "<today YYYY-MM-DD>",
    source: "learn"
  }],
  contradictedBy: [],
  created: "<today YYYY-MM-DD>",
  updated: "<today YYYY-MM-DD>"
}
```

Write the entry to `.context-index/memory/heuristics/<scope>.md` using the YAML frontmatter format documented in `_format.md`. If the scope file doesn't exist yet, create it with a heading.

**File format:**

```markdown
# Heuristics: <scope>

---
id: <id>
scope: <scope>
title: <title>
pattern: <pattern>
anti-pattern: <anti-pattern>
confidence: low
evidence:
  - path: <evidence-path>
    date: <today>
    source: learn
contradicted-by: []
created: <today>
updated: <today>
---
```

If the file already exists with other entries, append the new frontmatter block after the last existing block.

**Duplicate check:** Before writing, read existing heuristics for the scope. If an entry with a similar title or pattern exists (fuzzy match), offer to update it instead:

```
Similar heuristic already exists:

  ID:    existing-hook-validation
  Title: Run hook tests after changes

  Options:
  1. Update existing (add evidence, merge patterns)
  2. Create new anyway (different enough)
  3. Cancel
```

## Step 6: Confirm

```
Saved heuristic: <id> (scope: <scope>, confidence: low)

This lesson will be surfaced when agents work on the <scope> module
via /adev:implement, /adev:plan, and /adev:debug.

To strengthen it: /adev:learn --promote <id>
To remove it:     /adev:learn --archive <id> --reason "no longer relevant"
```

## List Mode (`--list`)

When `--list` is provided:

1. Read all heuristics using the store API.
2. If `--module` is provided, filter to that scope.
3. Display as a table. **Persona adaptation:** If a different persona is active, adapt the display to its output rules.

```
Heuristics (scope: hooks)

| ID | Title | Confidence | Evidence | Updated |
|----|-------|------------|----------|---------|
| verify-hook-json-after-edits | Verify hook JSON contract after edits | low | 1 | 2026-04-13 |
| always-test-exit-codes | Always test exit codes in hooks | high | 4 | 2026-04-10 |

Total: 2 heuristics (1 high, 0 medium, 1 low)
```

## Promote/Demote/Archive Modes

**`--promote <id>`**: Read the heuristic, bump confidence one level, write back. Report the change.

**`--demote <id>`**: Read the heuristic, lower confidence one level. If already `low`, offer to archive instead.

**`--archive <id> --reason <text>`**: Move the entry to `archive/<scope>-<id>.md`. Require a reason.

## Key Principles

- **Generalize, don't record.** The lesson should be useful in future contexts, not just describe what happened today.
- **One lesson per heuristic.** If the user describes multiple lessons, file each separately.
- **Low confidence by default.** A single data point isn't enough for high confidence. The store auto-promotes as evidence accumulates.
- **Always confirm before writing.** Never silently create a heuristic.
- **Source is always `learn`.** This distinguishes user-captured heuristics from auto-extracted ones.

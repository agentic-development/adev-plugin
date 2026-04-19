# Cross-Cutting Spec: Execution Profiles

---
status: review-blocked
risk_level: medium
revision: 1
created: 2026-04-19
updated: 2026-04-19
depends-on:
  - .context-index/adrs/0004-execution-profiles.md
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists.
- `.context-index/profiles.yaml` may or may not exist; bundled defaults at `plugin:governance/profiles.yaml` always exist.
- Optional: `adev-workspace.yaml` in some ancestor directory if the project participates in a multi-repo workspace.

### Behaviors

#### Profile File Resolution

1. **When** `loadProfiles(repoRoot)` is called from `lib/profiles/index.mjs` **then** it reads bundled defaults from `plugin:governance/profiles.yaml` first, then overlays `.context-index/profiles.yaml` if present. Project entries merge by `name`: same name → project wins (full replacement, not field merge); new name → appended.

2. **When** `.context-index/profiles.yaml` does not exist **then** only bundled defaults are loaded; no warning.

3. **When** `.context-index/profiles.yaml` exists but is empty or has no `profiles:` key **then** bundled defaults apply unchanged with informational note: `"profiles.yaml found but no profiles declared — using bundled defaults."`

4. **When** profile resolution is requested by name (e.g. `resolveProfile("browser-review")`) **then** the merged set is searched. Unknown name → caller-facing error: `"Unknown profile '<name>'. Available: <list>."`

#### Schema

5. **When** a profile is loaded **then** it is validated against the schema:

   ```yaml
   <profile-name>:
     description: <string, optional>
     extends: <parent-profile-name, optional>
     permissions:
       tools:
         allow: [<entry>, ...]            # required if no extends
         allow_add: [<entry>, ...]        # additive when extends present
       filesystem:
         write: <allow|deny>              # default deny
         execute: <allow|deny>            # default deny
       network: <allow|read-only|deny>    # default deny
     model:
       tier: <fast|capable|reasoning>     # resolves via platform-context.yaml
       thinking_budget: <low|medium|high> # default unset
     limits:
       max_output_tokens: <int>           # default unset (harness default)
       timeout_seconds: <int>             # default unset (harness default)
     env:
       files: [<path-or-prefixed-path>, ...]  # ordered, first-wins
       allow:
         required: [<key>, ...]           # missing → load error
         optional: [<key>, ...]           # missing → silently absent
   ```

   A tool entry is one of: `{ category: <name> }`, `{ mcp_server: <name> }`, or `{ tool: <literal-name> }` (escape hatch with portability warning).

6. **When** a required schema field is missing **then** load fails with: `"Profile '<name>': missing required field '<field>'."`

7. **When** an unknown top-level field appears in a profile entry **then** load emits WARN: `"Profile '<name>': unknown field '<field>' — ignored."` (Forward compatibility for harness-specific extensions added in future versions.)

#### Extends Chain Resolution

8. **When** a profile has `extends: <parent>` **then** the parent is resolved recursively. Effective profile is computed by:
   - `permissions.tools.allow` ← parent's `allow` ∪ child's `allow_add` (if child has `allow`, it replaces parent's; child has both → load error: cannot mix `allow` and `allow_add`)
   - `permissions.filesystem`, `permissions.network` ← child wins per field
   - `model`, `limits` ← child wins per field
   - `env.files` ← child's list replaces parent's (no concatenation; explicit ordering matters)
   - `env.allow.required`, `env.allow.optional` ← child's union with parent's, deduplicated (a key in parent's `optional` and child's `required` becomes `required`)

9. **When** an `extends` chain forms a cycle **then** load fails: `"Profile cycle detected: <a> → <b> → <a>."`

10. **When** `extends` references an unknown parent **then** load fails: `"Profile '<name>': extends unknown profile '<parent>'."`

#### Tool Categories

11. **When** the schema parser encounters `{ category: <name> }` **then** the name is validated against the seed registry shipped at `plugin:governance/tool-categories.yaml`. Unknown categories trigger load WARN with hint: `"Unknown tool category '<name>'. To propose a new category, add a markdown file under .context-index/specs/cross-cutting/tool-categories/<name>.md and ensure your harness adapter implements it."`

12. **Seed categories (v1):**
    - `filesystem-read` — Read files, list directories
    - `search` — Pattern/grep search across files
    - `agent` — Spawn subagents
    - `web-fetch` — Read-only HTTP requests
    - `filesystem-write` — Create, modify, or delete files
    - `shell` — Execute arbitrary shell commands

13. **When** a profile references `{ mcp_server: <name> }` **then** the harness adapter expands it to all tools matching `mcp__<name>__*` in the current session.

14. **When** a profile uses `{ tool: <literal> }` **then** the literal tool name is passed through to the adapter unchanged. Adapter may emit advisory: `"Profile '<name>' references literal tool '<literal>' — not portable across harnesses."`

#### Harness Adapter Contract

15. **When** `prepareForDispatch(profileName, context)` is called from a harness adapter **then** it returns a structure the harness uses to launch a subagent:

    ```js
    {
      allowedTools: [<harness-specific tool names>],
      modelId: <resolved from tier via platform-context.yaml>,
      thinkingBudget: <value>,
      maxOutputTokens: <value>,
      timeoutSeconds: <value>,
      env: { <KEY>: <value>, ... },         // resolved env vars
      redactionSet: Set<string>,            // values to redact from logs
    }
    ```

16. **When** an adapter encounters an abstract category it does not implement **then** it fails with: `"Harness adapter '<harness>' does not implement category '<name>'. Profiles requiring this category cannot be dispatched."` Adapter MUST list unsupported categories in its module exports for upfront validation.

17. **When** a profile references an MCP server that is not configured in the current session **then** load fails with: `"Profile '<name>' requires MCP server '<mcp>' which is not configured. Add it to your harness MCP settings."` Check happens at `loadProfiles` time, not at dispatch.

18. **When** Claude Code is the active harness **then** the adapter at `lib/profiles/adapters/claude-code.mjs` implements all v1 seed categories. OpenCode adapter (`lib/profiles/adapters/opencode.mjs`) implements only `filesystem-read`, `search`, `agent`, `web-fetch` in v1; `filesystem-write` and `shell` raise the unsupported error.

#### Env Resolution — Single Repo

19. **When** a profile has `env.files: [<paths>]` **then** each path is resolved relative to the **consumer repo root** (the repo containing the spec or work unit being processed at dispatch time). Files are read in list order; first occurrence of a key wins.

20. **When** a path begins with `@workspace/` **then** see "Multi-Repo Workspaces" below.

21. **When** an absolute path is given **then** load fails: `"Profile '<name>': env.files entries must be relative to the consumer repo root or use the @workspace/ prefix."`

22. **When** a referenced env file does not exist **then** it is silently skipped during resolution. Required key checks (Behavior 24) still run after all listed files are processed; a missing required key fails regardless of whether files existed.

23. **When** a `.env` file is malformed **then** load fails with the parser's error and a file:line citation.

24. **When** a key in `env.allow.required` is not found in any listed file **then** load fails: `"Profile '<name>': required env var '<key>' not found in any of: <files>."`

25. **When** a key in `env.allow.optional` is not found **then** the key is silently absent from the resolved env.

26. **When** a key is in both `required` and `optional` **then** load fails: `"Profile '<name>': key '<key>' listed in both required and optional."`

27. **When** the `.env` parser encounters a key not in the merged allowlist (`required` ∪ `optional`) **then** the key is ignored — never read, never resolved, never present in the dispatched env.

#### Env Resolution — Multi-Repo Workspaces

28. **When** the consumer spec lives in repo X and an `adev-workspace.yaml` is present in some ancestor directory of repo X **then** workspace context is active. The workspace root is the directory containing `adev-workspace.yaml`.

29. **When** an `env.files` path begins with `@workspace/<rest>` and workspace context is active **then** the path resolves to `<workspace-root>/<rest>`. The same parsing/allowlist/required-key rules apply.

30. **When** an `env.files` path uses `@workspace/` but no workspace context exists **then** load fails: `"Profile '<name>': '@workspace/<rest>' referenced but no adev-workspace.yaml found in any ancestor of the consumer repo."`

31. **When** an `env.files` path uses `@<repo-slug>/` (cross-repo prefix) **then** load fails: `"Cross-repo env paths (@<repo-slug>/) are not supported in v1. Use @workspace/ for shared values or duplicate per-repo for repo-specific values."`

32. **When** the consumer repo is determined for env resolution **then** it is the repo containing the **spec being processed**, not the directory the user invoked the skill from. Example: invoking `/adev:review-specs --spec ../repo-a/.context-index/specs/.../foo.md` from inside `repo-b` resolves env from `repo-a/`, not `repo-b/`.

33. **When** a workspace-level `profiles.yaml` exists at `<workspace-root>/profiles.yaml` **then** it is **ignored** in v1; only per-repo `.context-index/profiles.yaml` files merge with bundled defaults. Workspace-level profile sharing is deferred to v2.

#### Env Injection — Trust Boundary

34. **When** a profile resolves env vars **then** the values are passed to the harness adapter's `prepareForDispatch` return value as `env: { <KEY>: <value> }`. The adapter is responsible for making them available to the subagent's **tool execution environment** (e.g. the env passed to `Bash` tool subprocess invocations) — not to inject them into the prompt text.

35. **When** an adapter generates a prompt for the dispatched subagent **then** resolved env values do NOT appear in that prompt. The model can invoke tools that consume `$VAR_NAME`, but the value itself is not text the model reads.

36. **When** tool stdout or stderr is captured for logging or transcript purposes **then** any substring exactly matching a value in `redactionSet` is replaced with `<REDACTED:<KEY>>` before write. Per-character matching only; no partial-match heuristics in v1.

37. **When** a profile is used in a context where the harness cannot enforce the trust boundary (e.g. legacy adapter) **then** the adapter MUST refuse to dispatch the profile and emit: `"Harness '<name>' does not implement env trust boundary; cannot use profiles with env.allow entries."`

### Postconditions

- The dispatched subagent runs with exactly the tools, model, limits, and env declared by the resolved profile.
- All env values used by the subagent are auditable: they came from a named file, were on a declared allowlist, and were redacted from logs.
- An `extends` chain produces a deterministic effective profile, computable from inputs without dispatch-time mutation.
- Multi-repo workspace dispatch resolves env from the consumer repo's perspective, with `@workspace/` as the only opt-in to cross-repo sharing in v1.

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| Profile name collision (project profile shadows bundled default) | Project wins; informational note: `"Profile '<name>' overrides bundled default."` |
| `extends` chain depth > 16 | Load fails (cycle protection): `"Profile '<name>': extends chain too deep."` |
| Tool category referenced but adapter doesn't implement | Load fails as in Behavior 16. |
| MCP server in profile not in current session | Load fails as in Behavior 17. |
| `.env` file lists a key not in the allowlist | Key is silently ignored (Behavior 27). |
| Required key missing | Load fails as in Behavior 24. |
| `@workspace/` outside workspace context | Load fails as in Behavior 30. |
| Workspace-level `profiles.yaml` present | Silently ignored in v1; informational note: `"Workspace-level profiles.yaml found but ignored in v1."` |

## System Constitution Reference

- **Principle #1 (Minimize external dependencies):** Profile loading, schema validation, dotenv parsing, and adapter logic all use Node built-ins. New `lib/profiles/` modules are zero-dep.
- **Principle #3 (Pure ESM):** All new modules are `.mjs`.
- Architecture Boundary: introducing a plugin-wide primitive that touches dispatch contracts. ADR-0004 captures the decision.

## Tool Categories Seed (v1)

A separate file documents each category in detail. v1 ships:

| Category | Description | Maps to (Claude Code) |
|---|---|---|
| `filesystem-read` | Read files, list directories | `Read`, `Glob` |
| `search` | Pattern search across files | `Grep` |
| `agent` | Spawn subagents | `Agent` |
| `web-fetch` | Read-only HTTP | `WebFetch`, `WebSearch` |
| `filesystem-write` | Create, modify, delete files | `Write`, `Edit`, `NotebookEdit` |
| `shell` | Execute shell commands | `Bash` |

New categories follow the extension protocol:
1. Author `.context-index/specs/cross-cutting/tool-categories/<name>.md` with the category's description, intended scope, and security considerations.
2. Update each shipping harness adapter to implement the category (or explicitly list it as unsupported).
3. Bump the bundled `tool-categories.yaml` version.

## Bundled Default Profiles (v1)

Six profiles ship at `plugin:governance/profiles.yaml`:

```yaml
profiles:
  read-only:
    description: "Observer. No state modification."
    permissions:
      tools:
        allow:
          - { category: filesystem-read }
          - { category: search }
          - { category: agent }
      filesystem: { write: deny, execute: deny }
      network: deny

  browser-review:
    extends: read-only
    description: "Read-only observation with browser navigation."
    permissions:
      tools:
        allow_add:
          - { mcp_server: playwright }
          - { category: web-fetch }
      network: read-only
    limits: { timeout_seconds: 300 }

  reviewer-fast:
    extends: read-only
    model: { tier: fast }

  reviewer-capable:
    extends: read-only
    model: { tier: capable }

  reviewer-reasoning:
    extends: read-only
    model: { tier: reasoning, thinking_budget: high }

  implementer:
    description: "Full-access task subagent. Not consumed in v1; defined for future migration."
    permissions:
      tools:
        allow:
          - { category: "*" }
      filesystem: { write: allow, execute: allow }
      network: allow
    model: { tier: capable }
```

`implementer` is shipped but unconsumed in v1 (per ADR-0004 scope). It exists so the abstraction is exercised end-to-end and so the migration of `/adev:implement` in a future spec is additive, not novel.

## Visual Expectations

Not applicable — no UI surface.

## Acceptance Criteria

- [ ] `loadProfiles(repoRoot)` returns the six bundled defaults when no `.context-index/profiles.yaml` exists, with no warnings.
- [ ] A project-defined profile with the same name as a bundled default fully replaces the default; an informational note is emitted.
- [ ] An `extends` chain producing a cycle fails load with a specific cycle message.
- [ ] An `extends` chain combining `allow` (parent) + `allow_add` (child) produces the union; `allow` (parent) + `allow` (child) replaces; `allow_add` without an `extends` fails load.
- [ ] A profile referencing a `mcp_server` not present in the current session fails load with a clear MCP setup hint.
- [ ] A profile referencing an unknown tool category emits WARN with the extension-protocol hint.
- [ ] Required env keys missing from all listed files cause load failure with the file list cited.
- [ ] Optional env keys missing are silently absent.
- [ ] Keys in `.env` files but not in the allowlist are never present in the dispatched env.
- [ ] `@workspace/` paths resolve via the directory containing `adev-workspace.yaml`; absent workspace fails load.
- [ ] `@<repo-slug>/` paths fail load with the v2-deferral message.
- [ ] Spec-location-wins: a review of `repo-a/.../foo.md` invoked from `repo-b/` resolves env from `repo-a/`.
- [ ] Workspace-level `profiles.yaml` is ignored with informational note.
- [ ] Resolved env values are passed to the harness adapter's return structure but never appear in the dispatched subagent's prompt text (verified via prompt-snapshot test).
- [ ] Tool stdout/stderr containing a resolved value is redacted to `<REDACTED:<KEY>>` before any logging or transcript capture.
- [ ] Claude Code adapter implements all six seed categories; OpenCode adapter implements four (read/search/agent/web-fetch) and raises unsupported error for the other two.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.

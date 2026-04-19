# Cross-Cutting Spec: Execution Profiles

---
status: review-passed
risk_level: medium
revision: 2
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

   A tool entry is one of: `{ category: <name> }`, `{ mcp_server: <name> }`, or `{ tool: <literal-name>, allow_unportable: true }` (escape hatch; the explicit `allow_unportable: true` flag is required). `{ category: "*" }` and other wildcard categories are rejected at schema validation.

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

14. **When** a profile uses `{ tool: <literal> }` **then** the entry MUST also declare `allow_unportable: true`. If the flag is absent **then** load fails: `"Profile '<name>' uses literal tool '<literal>' without 'allow_unportable: true'. Literal tool entries bypass category portability; opt in explicitly."` With the flag present, the literal name is passed through to the adapter unchanged and a WARN is emitted once per load: `"Profile '<name>' references literal tool '<literal>' — not portable across harnesses."`

14a. **When** a profile `extends: <parent>` and `allow_add` introduces a tool entry (category, mcp_server, or literal) that was not already permitted by the effective parent posture **then** load emits WARN: `"Profile '<name>': allow_add broadens posture beyond '<parent>' by adding '<entry>'."` This is a real WARN surfaced by `loadProfiles` — not an adapter-level advisory — so governance review and CI can gate on it. Broadening is permitted but never silent.

14b. **When** a profile directly or transitively extends a root whose `permissions.filesystem.write`, `permissions.filesystem.execute`, or `permissions.network` is stricter than the effective child value **then** load emits the same WARN surface as 14a, naming the posture field that broadened.

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

19. **When** a profile has `env.files: [<paths>]` **then** each path is resolved relative to the **consumer repo root** (the repo containing the spec or work unit being processed at dispatch time). Files are read in list order; first occurrence of a key wins. Each entry is either a bare path (`config/.env`) meaning the file is required to exist, or a path prefixed with `optional:` (`optional:config/.env.local`) meaning silent-skip on absence is allowed. Bare paths that do not exist at load time fail load (see Behavior 22).

20. **When** a path begins with `$workspace/` **then** see "Multi-Repo Workspaces" below.

21. **When** an absolute path is given **then** load fails: `"Profile '<name>': env.files entries must be relative to the consumer repo root or use the $workspace/ prefix."`

22. **When** a referenced env file does not exist **then** behavior depends on its prefix:
    - **Bare path** (e.g. `config/.env`) — load fails: `"Profile '<name>': env.files entry '<path>' does not exist. To permit silent-skip on absence, prefix the entry with 'optional:'."`
    - **`optional:` prefix** (e.g. `optional:config/.env.local`) — silently skipped during resolution.

    Required key checks (Behavior 24) still run after all listed files are processed; a missing required key fails regardless of which files existed.

22a. **When** env resolution completes **then** for each resolved key the loader records the exact file path that supplied the value. This mapping (`{ <KEY>: <contributing-file> }`) is included verbatim in the dispatch record and the `.validate.md` / `.review.md` report headers, so a later audit can reconstruct which file was in play for each key. The mapping is NOT passed to the model and NOT included in redacted log bytes.

23. **When** a `.env` file is malformed **then** load fails with the parser's error and a file:line citation.

24. **When** a key in `env.allow.required` is not found in any listed file **then** load fails: `"Profile '<name>': required env var '<key>' not found in any of: <files>."`

25. **When** a key in `env.allow.optional` is not found **then** the key is silently absent from the resolved env.

26. **When** a key is in both `required` and `optional` **then** load fails: `"Profile '<name>': key '<key>' listed in both required and optional."`

27. **When** the `.env` parser encounters a key not in the merged allowlist (`required` ∪ `optional`) **then** the key is ignored — never read, never resolved, never present in the dispatched env.

#### Env Resolution — Multi-Repo Workspaces

> **Prefix grammar.** Env-file path prefixes use the **`$`** sigil (`$workspace/...`) and are disjoint from `multi-repo-workspace`'s **`@`** sigil used for spec references (`@<repo-slug>/<spec-slug>` — see `specs/features/multi-repo-workspace/charter.md`). The two grammars never share a namespace. Parsers MUST reject an `env.files` entry that begins with `@` (including `@workspace/`, which is the pre-rev-2 form) with: `"Profile '<name>': env.files entries do not use the '@' prefix. Use '$workspace/<rest>' for workspace-shared env files. '@<repo-slug>/' is reserved for spec references."`

28. **When** the consumer spec lives in repo X and an `adev-workspace.yaml` is present in some ancestor directory of repo X **then** workspace context is active. The workspace root is the directory containing `adev-workspace.yaml`.

29. **When** an `env.files` path begins with `$workspace/<rest>` and workspace context is active **then** the path resolves to `<workspace-root>/<rest>`. The same parsing/allowlist/required-key rules apply.

30. **When** an `env.files` path uses `$workspace/` but no workspace context exists **then** load fails: `"Profile '<name>': '$workspace/<rest>' referenced but no adev-workspace.yaml found in any ancestor of the consumer repo."`

31. **When** an `env.files` path uses `@<repo-slug>/` or any other `@`-prefixed form **then** load fails: `"Profile '<name>': env.files entries do not use the '@' prefix. Use '$workspace/<rest>' for workspace-shared env files. '@<repo-slug>/' is reserved for cross-repo spec references (see multi-repo-workspace/charter.md) and cross-repo env paths are not supported in v1."`

32. **When** the consumer repo is determined for env resolution **then** it is the repo containing the **spec being processed**, not the directory the user invoked the skill from. Example: invoking `/adev:review-specs --spec ../repo-a/.context-index/specs/.../foo.md` from inside `repo-b` resolves env from `repo-a/`, not `repo-b/`.

33. **When** a workspace-level `profiles.yaml` exists at `<workspace-root>/profiles.yaml` **then** it is **ignored** in v1; only per-repo `.context-index/profiles.yaml` files merge with bundled defaults. Workspace-level profile sharing is deferred to v2.

#### Env Injection — Trust Boundary

34. **When** a profile resolves env vars **then** the values are passed to the harness adapter's `prepareForDispatch` return value as `env: { <KEY>: <value> }`. The adapter is responsible for making them available to the subagent's **tool execution environment** (e.g. the env passed to `Bash` tool subprocess invocations) — not to inject them into the prompt text.

35. **When** an adapter generates a prompt for the dispatched subagent **then** resolved env values do NOT appear in that prompt. The model can invoke tools that consume `$VAR_NAME`, but the value itself is not text the model reads.

36. **When** any captured bytes flow back to the model, the transcript, or on-disk logs **then** they pass through a single redaction pipeline stage owned by the adapter before anything downstream can observe them. The audited channels are:
    - tool stdout and stderr
    - harness error messages and stack traces
    - adapter diagnostics (parse failures, schema violations, dispatch-record fields)
    - tool-argument echoing (a tool that logs its own args)
    - pre-adapter streaming transcript captures (before findings extraction)
    - subprocess spawn errors (e.g. `ENOENT`, `EACCES` messages that include the attempted path)

    The pipeline is a chokepoint: any channel that bypasses it is a contract violation. Adapters MUST declare their audited channels in module exports so the cross-cutting test suite can enumerate coverage.

36a. **When** the redaction pipeline processes a buffer **then** exact-substring match against each `redactionSet` value is applied. Matches are replaced with `<REDACTED:<KEY>>`. Additional rules:
    - **Minimum length gate.** Values shorter than 8 characters are excluded from redaction to prevent nonsense-redaction and false positives (e.g. `"true"`, `"1"`). Profile load emits WARN for each allowlisted env key whose resolved value is below the minimum: `"Profile '<name>': value of '<key>' is <n> chars and is below the redaction minimum (8). It will not be redacted from logs."`
    - **Streaming-boundary buffering.** Streamed output is buffered with a lookback window equal to the longest `redactionSet` value so that a match split across chunk boundaries is still redacted. The buffer is flushed on channel close.
    - **Shared-value disambiguation.** When two keys resolve to the same value, the redaction placeholder is `<REDACTED:<KEY1>|<KEY2>>` (keys sorted alphabetically) so audit logs do not misattribute.

36b. **Redaction is defense-in-depth, not a firewall.** The v1 pipeline accepts the following bypass classes as known, unmitigated risk — documented here so operators do not assume false coverage:
    - Base64, hex, URL-encode, JSON-escape, or other encoding transforms of the raw value
    - Whitespace or punctuation mutations inside the value (e.g. `"foo bar"` → `"foo\tbar"`)
    - Case transforms when the value contains letters
    - Compression, chunked-encoding, or binary-framing transforms
    - Values below the minimum-length gate (see 36a)

    The model and any subprocess it spawns MUST be treated as adversarial with respect to redaction. Secrets that cannot tolerate LLM exfiltration via transform MUST NOT be placed in files an allowlisted env key resolves from; protect at the source.

37. **When** a profile is used in a context where the harness cannot enforce the trust boundary (e.g. legacy adapter) **then** the adapter MUST refuse to dispatch the profile and emit: `"Harness '<name>' does not implement env trust boundary; cannot use profiles with env.allow entries."`

### Postconditions

- The dispatched subagent runs with exactly the tools, model, limits, and env declared by the resolved profile.
- All env values used by the subagent are auditable: they came from a named file, were on a declared allowlist, and were redacted from logs.
- An `extends` chain produces a deterministic effective profile, computable from inputs without dispatch-time mutation.
- Multi-repo workspace dispatch resolves env from the consumer repo's perspective, with `$workspace/` as the only opt-in to cross-repo sharing in v1.

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| Profile name collision (project profile shadows bundled default) | Project wins; informational note: `"Profile '<name>' overrides bundled default."` |
| `extends` chain depth > 16 | Load fails (cycle protection): `"Profile '<name>': extends chain too deep."` |
| Tool category referenced but adapter doesn't implement | Load fails as in Behavior 16. |
| MCP server in profile not in current session | Load fails as in Behavior 17. |
| `.env` file lists a key not in the allowlist | Key is silently ignored (Behavior 27). |
| Required key missing | Load fails as in Behavior 24. |
| `$workspace/` outside workspace context | Load fails as in Behavior 30. |
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
    description: "Full-access task subagent. Not consumed in v1; defined for future migration. Enumerates every v1 seed category explicitly — no wildcards."
    permissions:
      tools:
        allow:
          - { category: filesystem-read }
          - { category: search }
          - { category: agent }
          - { category: web-fetch }
          - { category: filesystem-write }
          - { category: shell }
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
- [ ] `$workspace/` paths resolve via the directory containing `adev-workspace.yaml`; absent workspace fails load.
- [ ] `@<repo-slug>/` paths (and any `@`-prefixed `env.files` entry) fail load with the grammar-disjoint message pointing to `$workspace/` and `multi-repo-workspace/charter.md`.
- [ ] Spec-location-wins: a review of `repo-a/.../foo.md` invoked from `repo-b/` resolves env from `repo-a/`.
- [ ] Workspace-level `profiles.yaml` is ignored with informational note.
- [ ] Resolved env values are passed to the harness adapter's return structure but never appear in the dispatched subagent's prompt text (verified via prompt-snapshot test).
- [ ] Tool stdout/stderr containing a resolved value is redacted to `<REDACTED:<KEY>>` before any logging or transcript capture.
- [ ] Redaction pipeline covers harness error messages, adapter diagnostics, stack traces, tool-argument echo, streaming transcript capture, and subprocess spawn errors (Behavior 36). A channel not routed through the pipeline is a contract violation verified by adapter test.
- [ ] Values below the 8-character minimum are not redacted; a WARN is emitted at load per under-length allowlisted key.
- [ ] A `redactionSet` value split across two streaming chunks is still redacted thanks to lookback buffering.
- [ ] Bypass classes (base64, URL-encode, JSON-escape, whitespace mutation) are documented in Behavior 36b and not mitigated in v1.
- [ ] A bare-path `env.files` entry that does not exist fails load; an `optional:`-prefixed entry silently skips.
- [ ] The dispatch record and report header list the contributing file per resolved env key (Behavior 22a).
- [ ] `{ category: "*" }` and any other wildcard category value are rejected at schema validation.
- [ ] `{ tool: <literal> }` without `allow_unportable: true` fails load; with the flag, load emits WARN once.
- [ ] `allow_add` introducing a category or tool not in the effective parent posture emits a load-level WARN surfaced to the caller.
- [ ] Claude Code adapter implements all six seed categories; OpenCode adapter implements four (read/search/agent/web-fetch) and raises unsupported error for the other two.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.

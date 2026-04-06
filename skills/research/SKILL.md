---
name: adev:research
description: "Structured research skill. Investigates a topic using internal codebase search, web search, and GitHub code search, producing an organized research artifact. Use when the user says 'research', 'investigate', 'compare', 'how do others do this', 'best practices for', 'what are the options', or wants to explore approaches before committing to a design."
---

# Research a Topic

Conduct structured research across multiple sources and produce an organized research artifact at `.context-index/research/<slug>.md`. Sources include the local codebase, web search, and GitHub repositories. Findings are synthesized into a single document with attribution, code examples, and actionable recommendations.

**Announce at start:** "I'm using the adev:research skill to investigate this topic."

## Arguments

- `<topic>` (required): free-text research topic (e.g., "dependency injection patterns in Node.js ESM")
- `--web`: explicitly include web search as a source
- `--github <owner/repo>`: include GitHub code search against the specified repository (must match `owner/repo` pattern)
- `--internal`: explicitly include local codebase search as a source
- `--compare`: organize findings as a comparison matrix with pros/cons/tradeoffs
- `--issue <id>`: link this research to an existing issue on the issue board

### Default Source Behavior

When **no** source flags are specified, the defaults are:
- **Web**: enabled (if WebSearch tool is available)
- **Internal**: enabled
- **GitHub**: disabled (only used when `--github <owner/repo>` is explicitly provided)

When any source flag is specified, only the explicitly requested sources are used. For example, `--internal` alone means only the local codebase is searched.

## Prerequisites

This skill requires `.context-index/` to exist. If it does not, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back to research.

Do not proceed without a constitution.

---

## Process

Complete these steps in order.

### Step 1: Parse Arguments and Validate

1. Extract the `<topic>` from the user's message. If no clear topic is provided, ask the user to clarify.
2. Determine which sources to use based on flags (see Default Source Behavior above).
3. If `--github` is specified, validate the value matches the `owner/repo` pattern (e.g., `anthropics/claude-code`). If invalid, print a warning and skip GitHub source.
4. Verify `.context-index/` exists. If missing, print the prerequisite message and stop.

### Step 2: Generate Slug and Check for Collisions

1. Generate a slug from the topic: lowercase, replace spaces and special characters with hyphens, collapse consecutive hyphens, trim to a maximum of 50 characters, remove trailing hyphens.
   - Example: "Dependency Injection Patterns in Node.js ESM" becomes `dependency-injection-patterns-in-node-js-esm`
2. Check if `.context-index/research/<slug>.md` already exists.
3. If it exists, ask the user: "A research artifact already exists at `.context-index/research/<slug>.md`. Overwrite it, or create a new version (`<slug>-v2.md`)?"
4. Create `.context-index/research/` directory if it does not exist.

### Step 3: Load Context

Read the following files to ground the research in project context:

1. `.context-index/constitution.md` -- understand project principles and constraints
2. `.context-index/manifest.yaml` -- understand platform, language, and tooling
3. If `--issue <id>` is provided:
   - Check `tasks.backend` in manifest. If unconfigured, print a warning and skip issue linking.
   - Read the linked issue to understand its context and requirements. Use `getIssueManager(manifest)` patterns from `lib/issues/registry.mjs`.
   - If the issue is not found, print a warning ("Issue `<id>` not found, skipping issue linking") and continue.

### Step 4: Conduct Research

Execute source-specific research in parallel where possible.

#### Internal Codebase Search (when enabled)

1. Use **Glob** to find files matching patterns derived from the topic keywords.
2. Use **Grep** to search for relevant code patterns, function names, and concepts.
3. Use **Read** to examine the most relevant files in detail.
4. Record findings with file paths and line references for attribution.

#### Web Search (when enabled)

1. Attempt to use the **WebSearch** tool to search for the topic.
2. **Graceful degradation:** If WebSearch is unavailable (tool not found or errors), print:
   > Warning: WebSearch is not available in this environment. Skipping web sources. Research will proceed with other available sources.
3. If available, search for:
   - The topic directly
   - Best practices and common patterns
   - Known pitfalls and anti-patterns
4. Record findings with source URLs for attribution.

#### GitHub Code Search (when enabled via `--github`)

1. Attempt to use GitHub MCP tools (`mcp__github__search_code`, `mcp__github__get_file_contents`) to search the specified repository.
2. **Graceful degradation:** If GitHub MCP tools are unavailable, print:
   > Warning: GitHub MCP tools are not available in this environment. Skipping GitHub sources. Research will proceed with other available sources.
3. If available, search for code examples, patterns, and implementations relevant to the topic within the specified repo.
4. Record findings with repository, file path, and permalink for attribution.

### Step 5: Synthesize Findings

Organize all gathered information into a coherent research artifact.

**Standard mode (default):**
1. Group findings by source type (Internal, Web, GitHub).
2. Within each group, organize by relevance and quality.
3. Extract concrete code examples with full attribution (source, file, URL).
4. Identify common patterns and consensus across sources.
5. Formulate actionable recommendations grounded in the project's constitution and constraints.

**Comparison mode (`--compare`):**
1. Identify the distinct approaches, libraries, or patterns found.
2. Build a comparison matrix:

| Approach | Pros | Cons | Complexity | Fit with Constitution |
|----------|------|------|------------|----------------------|
| Approach A | ... | ... | ... | ... |
| Approach B | ... | ... | ... | ... |

3. For each approach, note tradeoffs specific to this project's context (language, runtime, principles).
4. Provide a recommended approach with justification.

### Step 6: Write Research Artifact

Write the artifact to `.context-index/research/<slug>.md` using the structure from `templates/research-template.md`:

```yaml
---
topic: "<topic>"
date: "<YYYY-MM-DD>"
relates-to: "<issue-id or empty>"
sources:
  - internal
  - web
  - "github:<owner/repo>"
status: draft
---
```

Sections:
1. **Summary** -- 2-3 sentence overview of findings
2. **Findings** -- organized by source (Internal, Web, GitHub subsections)
3. **Code Examples** -- concrete snippets with attribution
4. **Recommendations** -- actionable next steps grounded in project context
5. **References** -- full list of sources with URLs, file paths, and permalinks

### Step 7: Link to Issue (if `--issue` provided)

If `--issue <id>` was specified and the issue was found in Step 3:

1. Ensure the artifact's frontmatter includes `relates-to: <issue-id>`.
2. Update the issue's notes with a reference to the research artifact:
   - Use `update(id, { notes: "Research artifact: .context-index/research/<slug>.md" })` via the issue manager.
3. If the issue board is not configured or the issue was not found, skip this step silently.

### Step 8: Report Summary

Print a summary of the research:

```
Research complete.

  Artifact: .context-index/research/<slug>.md
  Topic: <topic>
  Sources consulted: <list of sources used>
  Sources skipped: <list of sources skipped with reasons>
  Findings: <count> from internal, <count> from web, <count> from GitHub
  Mode: <standard | comparison>
```

If any sources were unavailable, reiterate the warnings here.

---

## Output

The research artifact is written to `.context-index/research/<slug>.md`. The artifact structure follows `templates/research-template.md`.

The slug is generated from the topic: lowercase, hyphenated, maximum 50 characters.

---

## Key Principles

1. **Graceful degradation over hard failure.** If a source is unavailable (WebSearch not present, GitHub MCP not connected), warn the user and continue with available sources. Never fail the entire research because one source is missing.

2. **Attribution is mandatory.** Every finding must include its source: file path for internal, URL for web, repository and path for GitHub. Never present findings without attribution.

3. **Constitution-aware recommendations.** Recommendations must be evaluated against the project's constitution. If a popular approach conflicts with a non-negotiable principle (e.g., "minimize external dependencies"), call that out explicitly.

4. **No silent overwrites.** If a research artifact with the same slug exists, always ask before overwriting. Provide the option to version (`-v2` suffix).

5. **Research is read-only.** This skill reads and synthesizes information. It does not modify code, create specs, or start implementation. It produces a research artifact that informs future decisions.

6. **Parallel where possible.** Internal, web, and GitHub searches are independent. Execute them in parallel to minimize research time.

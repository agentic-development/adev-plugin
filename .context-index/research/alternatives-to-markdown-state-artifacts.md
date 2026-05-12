---
topic: "Alternatives to markdown-based state artifacts for LLM agent reliability"
date: "2026-05-11"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

## Summary

LLM agents frequently misparse and corrupt markdown-formatted state files -- particularly markdown tables -- losing data on updates, misreading column alignment, and producing malformed output. Research across the adev-plugin codebase and public literature reveals that JSON is the most reliably read and written format by LLMs, YAML excels for nested configuration, and markdown tables are the weakest format for agent-mediated state mutation. The adev-plugin codebase already reflects this pattern: build-state uses JSON, execution-state uses YAML frontmatter, but the task board remains a markdown table -- the single most fragile artifact. Hybrid approaches (JSON/YAML storage with markdown rendering on demand) offer the best balance of agent reliability and human readability.

## Findings

### Internal

- **Build state already uses JSON.** `lib/build-state.mjs` stores pipeline state as `.context-index/build-state/<slug>.json` with atomic write-via-rename. This is the most reliable state format in the codebase -- no parsing ambiguity, no format drift across schema changes. (`lib/build-state.mjs:1-77`)

- **Execution state uses YAML frontmatter + markdown body.** `lib/execution-state.mjs` stores `.context-index/.execution-state.md` with YAML frontmatter for structured fields and a markdown checklist for progress. The YAML portion is parsed with a simple `key: value` line scanner, and the markdown body uses a strict regex for checklist items. This is moderately robust but the custom YAML parser lacks support for multi-line values, quoted strings, or arrays. (`lib/execution-state.mjs:107-147`)

- **The task board (tasks.md) is the most fragile artifact.** `lib/issues/file-adapter.mjs` parses markdown tables with pipe-delimited columns, supporting three different column layouts (12, 13, and 14 columns) for backward compatibility. The parser must handle escaped pipes, variable column counts, and section detection. This complexity is a direct consequence of using markdown tables for structured data. (`lib/issues/file-adapter.mjs:37-180`)

- **Schema evolution in markdown tables requires multi-format parsers.** The file adapter maintains three separate `parseIssueRow` branches for 12-, 13-, and 14-column formats, plus two `parseEpicRow` branches for 6- and 7-column formats. In JSON, schema evolution is handled by optional fields with defaults -- no branching required. (`lib/issues/file-adapter.mjs:86-180`)

- **Atomic writes are used consistently.** Both `build-state.mjs` and `execution-state.mjs` use temp-file-then-rename for crash safety. The file adapter for tasks.md also uses this pattern. This infrastructure would transfer to any format change. (`lib/build-state.mjs:65-77`, `lib/execution-state.mjs:170-188`)

- **The beads-adapter provides an alternative backend.** `lib/issues/beads-adapter.mjs` exists as an alternative to the file adapter, delegating to a Rust CLI (`br`) for issue management. This demonstrates the project already supports pluggable storage backends via `lib/issues/registry.mjs`. (`lib/issues/registry.mjs`, `lib/issues/beads-adapter.mjs`)

### Web

- **YAML outperforms other formats for LLM accuracy on nested data.** Research from ImprovingAgents.com found YAML achieves 62% accuracy for nested data comprehension versus JSON's 50%, and outperformed XML by 17.7 percentage points on GPT-5 Nano. However, JSON is more reliably *generated* by LLMs due to its prevalence in training data. ([Source](https://www.improvingagents.com/blog/best-nested-data-format/))

- **Markdown tables are the weakest format for LLM-mediated updates.** Malformed tables with uneven column separators, missing header lines, or inconsistent spacing render them unparseable. LLMs may silently truncate output, omit sections, or hallucinate content when regenerating markdown tables, and because the resulting markdown still looks valid, failures go unnoticed. ([Source](https://www.searchcans.com/blog/markdown-formatting-strategies-llm-understanding/))

- **Format reliability is model-specific.** Different LLMs respond differently to format changes -- there is no universal best format. YAML is recommended as a "good default if accuracy is your priority." Testing across your specific model is essential. ([Source](https://www.improvingagents.com/blog/best-nested-data-format/))

- **OpenHands uses event-stream architecture.** OpenHands models agent state as an append-only event log (actions and observations), with each session getting an isolated sandbox. State is never mutated in place -- new events are appended. This avoids the entire class of "update corrupts existing data" bugs. ([Source](https://arxiv.org/html/2511.03690v1))

- **OpenCode uses SQLite for conversation persistence.** OpenCode chose SQLite over file-based formats for persistent conversation histories, trading human readability for queryability and structural guarantees. ([Source](https://computingforgeeks.com/opencode-vs-claude-code-vs-cursor/))

- **JSONL/NDJSON offers append-only robustness.** Each line is a self-contained JSON value. One corrupted line does not break the entire file. JSONL is streamable, appendable without rewriting, and has a low memory footprint. It is used as the run-log format in several agent systems. ([Source](https://superjson.ai/blog/2025-09-07-jsonl-vs-json-data-processing/))

- **The "System Skill Pattern" pairs SQLite with markdown rendering.** A documented pattern gives agents a SQLite database for state management plus a CLI for operations, with markdown used only for human-facing output -- never as the source of truth. ([Source](https://www.shruggingface.com/blog/the-system-skill-pattern))

- **TOON format reduces tokens but lacks training data.** TOON (Token-Oriented Object Notation) achieves 30-60% token reduction over JSON but only reaches 76.4% accuracy versus JSON's 75.0% -- marginal gains with adoption risk. LLMs lack adequate training examples for TOON. ([Source](https://github.com/toon-format/toon))

## Code Examples

```javascript
// Example: Current markdown table parsing complexity (file-adapter.mjs)
// Source: lib/issues/file-adapter.mjs:111-180
// Three column-count branches for backward compatibility
function parseIssueRow(cells) {
  if (cells.length >= 14) {
    return { /* 14-column format */ };
  }
  if (cells.length >= 13) {
    return { /* 13-column format */ };
  }
  return { /* legacy 12-column format */ };
}
```

```javascript
// Example: JSON-based build state (already in codebase)
// Source: lib/build-state.mjs:65-77
// Clean atomic write, no parsing ambiguity
function atomicWriteJson(filePath, data) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmpPath, filePath);
}
```

```javascript
// Example: Hypothetical JSON-based task board (not yet implemented)
// Source: research synthesis
// Schema evolution via optional fields with defaults
{
  "version": 2,
  "epics": [
    { "id": "epic-1", "title": "...", "status": "open", "milestone": null }
  ],
  "issues": [
    { "id": "issue-1", "title": "...", "status": "open", "priority": 1,
      "epicId": "epic-1", "spec_ref": null, "next_action": null }
  ]
}
```

## Recommendations

1. **Migrate tasks.md to JSON storage with markdown rendering.** Replace the markdown-table task board with a `.context-index/tasks/tasks.json` file, keeping a read-only `tasks.md` generated on demand for human review. This eliminates the fragile multi-column parser, simplifies schema evolution (optional fields with defaults instead of column-count branches), and leverages the atomic-write infrastructure already in `lib/build-state.mjs`. *Grounded in constitution principle 1 (minimize external dependencies) -- JSON is parsed by Node.js built-in `JSON.parse`, no external dependency needed.*

2. **Standardize on JSON for all agent-mutated state, YAML for configuration.** Adopt a clear convention: JSON for state that agents read and write frequently (task boards, build state, execution state), YAML for configuration that humans edit occasionally (manifest, platform context). Markdown remains for prose artifacts (specs, research, documentation) that agents write once and rarely update in place. *Grounded in constitution principle 2 (skills are primarily markdown) -- this preserves markdown for its strength (prose) while removing it from its weakness (structured state).*

3. **Consider append-only JSONL for execution logs and session state.** For artifacts like execution state where the primary operation is "record what happened," JSONL offers corruption isolation (one bad line does not invalidate the file) and natural audit trails. The current execution-state.md overwrites on each update, losing history. *Grounded in constitution principle 4 (hook protocol compliance) -- hooks already use JSON stdout, making JSONL a natural extension.*

4. **Keep the pluggable adapter pattern.** The existing `registry.mjs` + adapter pattern (`file-adapter.mjs`, `beads-adapter.mjs`) is well-suited for this migration. Add a `json-adapter.mjs` that implements the same `IssueManager` interface but reads/writes JSON. The markdown adapter can remain as a deprecated fallback or read-only renderer. *Grounded in constitution principle 1 -- no new dependencies required.*

5. **Do not adopt SQLite or TOON.** SQLite would add a native dependency (violating principle 1) and is not git-diffable. TOON lacks LLM training data and offers marginal accuracy gains. Both introduce adoption risk disproportionate to their benefits for this project's scale.

6. **Add a markdown rendering layer for human readability.** When humans need to inspect state (via `git diff`, GitHub PR reviews, or manual inspection), generate markdown from JSON on demand -- either as a git hook, a CLI command (`adev status --render`), or as part of `/adev:status`. This preserves the human-readability benefit of markdown without using it as the source of truth.

## References

### Internal Files
- `lib/build-state.mjs` -- JSON-based build state with atomic writes (existing pattern to follow)
- `lib/execution-state.mjs` -- YAML frontmatter + markdown body state file
- `lib/issues/file-adapter.mjs` -- Markdown table parser with multi-format backward compatibility
- `lib/issues/beads-adapter.mjs` -- Alternative backend demonstrating pluggable storage
- `lib/issues/registry.mjs` -- Adapter registry enabling backend swaps
- `lib/issues/id-utils.mjs` -- ID generation utilities (format-agnostic)
- `.context-index/tasks/tasks.md` -- Current markdown-table task board
- `.context-index/build-state/` -- JSON build state files (exemplar)

### Web Sources
- [Which Nested Data Format Do LLMs Understand Best?](https://www.improvingagents.com/blog/best-nested-data-format/) -- YAML vs JSON vs XML accuracy benchmarks
- [Which Table Format Do LLMs Understand Best?](https://www.improvingagents.com/blog/best-input-data-format-for-llms/) -- 11-format comparison for tabular data
- [Format Markdown for LLMs](https://www.searchcans.com/blog/markdown-formatting-strategies-llm-understanding/) -- Markdown table parsing failure modes
- [LLM Reliability: JSON vs YAML](https://medium.com/@mr.sean.ryan/llm-reliability-json-vs-yaml-22c58d7f51f6) -- Reliability comparison
- [JSONL vs JSON for Data Processing](https://superjson.ai/blog/2025-09-07-jsonl-vs-json-data-processing/) -- Append-only format benefits
- [The System Skill Pattern](https://www.shruggingface.com/blog/the-system-skill-pattern) -- SQLite + markdown rendering pattern
- [TOON Format](https://github.com/toon-format/toon) -- Token-efficient alternative format (not recommended)
- [OpenHands Agent SDK](https://arxiv.org/html/2511.03690v1) -- Event-stream architecture for agent state
- [OpenCode vs Claude Code vs Cursor](https://computingforgeeks.com/opencode-vs-claude-code-vs-cursor/) -- SQLite vs file-based persistence comparison
- [Beyond JSON: Picking the Right Format for LLM Pipelines](https://medium.com/@michael.hannecke/beyond-json-picking-the-right-format-for-llm-pipelines-b65f15f77f7d) -- Format selection guidance

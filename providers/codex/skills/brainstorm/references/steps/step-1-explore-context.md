## Step 1: Explore Context

Read these files using Glob/Grep/Read. Do not ask the user for information that exists in these files.

### Essential (load now)

Read immediately — these are required for every brainstorm session:
- `.context-index/constitution.md` — project principles and boundaries
- `.context-index/platform-context.yaml` — tech stack and deployment targets
- `.context-index/manifest.yaml` — module registry and configuration
- `.context-index/specs/product.md` (if exists) — product vision and module map

### Reference (load when relevant)

Read on-demand as the conversation touches these areas:
- `.context-index/specs/features/*/charter.md` — load Business Intent and Scope sections only for cross-charter conflict detection. Load the full charter only if a conflict is detected or the user's idea overlaps with an existing module.
- `.context-index/adrs/*.md` — load titles and decision summaries. Load the full ADR only when the emerging design touches a relevant architectural decision.
- `.context-index/orientation/architecture.md` — load only when the user's idea involves file structure or module placement decisions.
- `.context-index/specs/cross-cutting/*.md` — load when checking interface compatibility or shared constraints.
- `.context-index/references/**/*.md` — load when checking external contract compliance.

**If `--module <name>`:** Also read `.context-index/specs/features/<name>/charter.md` and any Live Specs under that directory. When modifying an approved charter in `--module` mode, set `status: evolving`, increment `revision` by 1, and set `updated: <today's date YYYY-MM-DD>`. This signals that the charter is undergoing active changes and downstream specs should check for charter-revision staleness.

**If `--from-blueprint <path>`:** Read the blueprint and extract module definition, business intent, and capability list.

After reading, summarize findings in 3-5 bullet points covering: what the project builds, existing modules and boundaries, architectural constraints, tech stack, and cross-cutting concerns.

**Heuristics:** Load module-scoped heuristics for the target module via the CLI:

```bash
adev heuristics retrieve --module <module-slug> --tier summary --format text
```

Derive the module slug from the `--module <name>` argument if provided, or from the feature idea once identified.
If the module is new (no existing scope file in `.context-index/memory/heuristics/`), use `_global`.
Stdout is either rendered markdown blocks (one per heuristic, separated by blank lines) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — failures degrade to an empty/`__NONE__` result so heuristic injection stays non-blocking.

When heuristics are present (output is not `__NONE__`), prepend the advisory preamble: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

**Domain-Aware Charter Template:** After loading context, resolve the active domain via the CLI:

```bash
adev domain resolve --module <module-slug> [--charter <charter-path>]
```

The verb resolves the active domain (charter frontmatter → manifest.modules[].domain → manifest.project.domain → 'software'). Stdout is a single JSON object whose `resolved_domain` field is passed to `resolveTemplate('charter', kind, resolved_domain)` in Step 5. The full template is loaded in Step 5 once the kind is also known (resolved in Step 2.1); Step 1 only resolves the domain so subsequent steps can pass it through.

The final section structure is determined by the kind-resolved template in Step 5. Use the template's H2 headings as the section names for this charter. Do not use hardcoded section names — the resolved template is the single source of truth for section structure.
If the template includes a Quality Attributes section, present domain-specific quality attribute suggestions to the user (e.g., data-engineering suggests freshness, completeness, accuracy; software suggests latency, throughput, availability).

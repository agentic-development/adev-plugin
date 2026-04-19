# ADR 0004: Execution Profiles as a First-Class Primitive

## Status

Proposed

## Date

2026-04-19

## Context

Across the plugin, every place that spawns an agent (subagent dispatch in `/adev:review-specs`, subagent checks in `/adev:validate`, task subagents in `/adev:implement`, future skills) currently encodes its dispatch concerns ad-hoc:

- Tool permissions are implicit (whatever the parent has, the subagent has).
- Model tier choices live inline in `SKILL.md` files (e.g. `skills/review-specs/SKILL.md:104` hardcodes "structural = reasoning, security = capable, consistency = fast").
- Thinking directives (`ultrathink`) are stamped into prompt strings.
- MCP server requirements (e.g. Playwright for `/adev:validate` Check 11) are documented in prose, not declared in config — failures surface at runtime, not load.
- Environment variables (e.g. `DATABASE_URL` for an integration-test gate) are inherited from the parent shell with no scoping or auditability.
- Each new skill or governance file (`governance/review.yaml`, `governance/validate.yaml`) reinvents its own sandbox/tier/limit fields, producing drift.

Compounding this: the plugin already supports multiple harnesses (Claude Code is primary, OpenCode adapter exists in `providers/opencode/plugin.mjs`). Each harness has different tool names and different ways to express the same dispatch concern. Today's hardcoded patterns don't translate.

The emerging design for configurable reviewer/check registries (ADR-0003) was about to repeat this pattern — defining `sandbox_profiles` inside `governance/review.yaml`, with tier/thinking/tool-list fields scattered across reviewer entries. Pulling these concerns out into a single primitive eliminates the repetition before it spreads.

## Decision

**We will introduce execution profiles as a first-class plugin primitive: a portable, harness-agnostic schema that packages the dispatch concerns of an agent (tool permissions, MCP requirements, model tier, env vars, limits, output expectations) into named, composable units stored in `.context-index/profiles.yaml`.**

### Concrete shape

- **Storage:** `.context-index/profiles.yaml` (single file, top-level under `.context-index/` as a sibling to `governance/`, `specs/`, `adrs/`). Bundled defaults ship as `plugin:governance/profiles.yaml`.
- **Schema:** named profiles with `extends` chaining; sub-fields for `permissions` (tools, filesystem, network), `model` (tier, thinking_budget), `limits` (tokens, timeout), `env` (allowlisted keys from `.env*` files).
- **Tool abstraction:** profiles reference **abstract tool categories** (e.g. `category: filesystem-read`), not harness-specific tool names. A small seed of categories ships in v1; new categories are proposed via lightweight markdown files under `.context-index/specs/cross-cutting/tool-categories/`.
- **Harness adapter layer:** `lib/profiles/adapters/<harness>.mjs` translates canonical categories to harness-specific tool lists, verifies MCP availability, applies env handling. Claude Code adapter is complete in v1; OpenCode adapter is a stub that errors on unsupported categories.
- **V1 consumers:** `/adev:review-specs` reviewer dispatch and `/adev:validate` subagent checks. `/adev:implement` task dispatch and other skills migrate in a follow-up spec.
- **Env handling:** profiles select specific keys from listed `.env*` files via an explicit allowlist (no wildcards in v1), with required/optional split. Values are exposed to the subagent's tool execution environment, never injected into the LLM prompt. Logged tool output is redacted at the value boundary.
- **Multi-repo env resolution:** in workspace contexts (presence of `adev-workspace.yaml`), env paths default to **consumer-repo-local** (relative to the repo containing the spec being processed, not the directory the user invoked the skill from). An opt-in `@workspace/<path>` prefix resolves to the workspace root, enabling a shared `.env.shared` that profiles can reference explicitly. Cross-repo paths (`@<repo-slug>/<path>`) and workspace-level `profiles.yaml` files are deferred to v2.

### Alternatives Considered

1. **Sandbox profiles inside `governance/review.yaml`.** The original v1 design. Rejected because dispatch concerns aren't review-specific; bundling them under review governance produces drift the moment a second consumer (validate) needs the same vocabulary. Promotion to a primitive is cheaper to do once than twice.

2. **Inline tool/tier/env on each reviewer or check entry.** No abstraction; every entry repeats fields. Rejected for the same reasons we reject any other "stringly typed" config — duplication, drift, and no shared mental model.

3. **Harness-specific tool names directly (no abstraction).** Profiles list `[Read, Glob]` instead of `[category: filesystem-read]`. Simpler, but tightly couples profiles to Claude Code; OpenCode and future harnesses would need parallel profile files. Rejected — defeats the cross-harness story.

4. **External tool (e.g. Pydantic-style schema validation library).** Cleaner schema definition. Rejected per CLAUDE.md principle #1 (minimize external dependencies); a zero-dep parser plus runtime validation is sufficient.

5. **Defer profiles entirely; ship reviewer/check registries with inline fields, refactor later.** Faster ship of the two feature specs. Rejected because the feature specs would lock in a vocabulary we'd then have to break to extract; the cost of doing it right once is less than the cost of two migrations.

### Why This Decision

- **Eliminates repetition before it spreads.** Two governance files (`review.yaml`, `validate.yaml`) were about to define overlapping sandbox/tier/limit vocabulary. Centralizing now prevents drift.
- **Cross-harness portability is a real plugin requirement.** The plugin already exports an OpenCode provider. Profiles with abstract categories make multi-harness support tractable; harness-specific dispatch fields scattered across configs do not.
- **Aligns with plugin philosophy.** Skills are markdown; configuration is YAML; Node built-ins only. Profiles fit cleanly into this architecture without introducing any new dependency or paradigm.
- **Scoped v1 keeps the change reviewable.** Two consumers, six bundled profiles, one harness adapter. Migration of `/adev:implement` and others is a separate, future spec — not in this commitment.
- **Env handling earns its place at the primitive level.** Per-skill ad-hoc env injection would mean every skill author redesigns secret handling. Once at the profile layer, with a conservative posture, eliminates that burden.

## Consequences

### Positive

- One place to look for "how does this agent run." Reviewer/check entries shrink to references.
- Harness-portable by design. New harnesses implement an adapter, not a parallel config.
- MCP requirements are checked at config-load time, not at dispatch — earlier, clearer errors.
- Env allowlists with explicit required/optional, no-wildcard, and no-prompt-injection rules establish a defensible default secret posture.
- Sets the stage for a future `/adev:implement` task dispatch migration to be additive, not invasive.

### Negative

- New top-level file (`profiles.yaml`) in `.context-index/`. Adds to the file inventory users must understand. Mitigated by bundled defaults that cover most use cases.
- Indirection: a reviewer that today references an inline tier now references a profile name. One more lookup when reading config.
- Adapter layer adds a per-harness implementation burden. Bounded — categories grow slowly and adapters are small.
- Premature for projects with no customization needs. Mitigated by the fact that bundled defaults match today's behavior, so projects with no `profiles.yaml` see no change.

### Neutral

- Profiles are scoped to subagent dispatch concerns. They do not replace `platform-context.yaml:model_tiers` (which maps tier names to concrete model IDs) or `governance/gates.yaml` (which defines deterministic shell gates). Profile `model.tier` references resolve via `platform-context.yaml`; the separation is intentional.
- The `extends` resolution and abstract category mapping are runtime concerns; they don't change how SKILL.md files are written.
- The multi-repo env model establishes a trust boundary: `@workspace/.env.shared` is a shared secret store accessible to every repo's profiles within the workspace. Projects opting into it accept that any reviewer or check in any participating repo can request those keys. Documented as a security consideration in the cross-cutting spec; not a default.

## Related

- `.context-index/specs/cross-cutting/execution-profiles.md` — full schema and behavioral spec
- `.context-index/adrs/0003-configurable-review-registry.md` — registries that consume profiles
- `.context-index/specs/features/review/configurable-reviewers.md` — primary v1 consumer
- `.context-index/specs/features/validation/configurable-checks.md` — secondary v1 consumer
- `providers/opencode/plugin.mjs` — existing harness adapter seam
- `templates/platform-context.yaml` — `model_tiers` mapping that profiles defer to
- CLAUDE.md "Architecture Boundaries" — this ADR introduces a plugin-wide primitive that touches the dispatch contract

[adev docs](README.md) > Workflow Guides

# Design Phase

The design phase is where every feature begins. You explore an idea, define its boundaries, formalize the behavioral contract, validate it with specialist reviewers, and optionally sketch the user experience. The artifacts produced here become the foundation for everything that follows.

## Brainstorm

**Skill:** `/adev:brainstorm`

**What it does:** Turns a feature idea into a structured Feature Charter through collaborative dialogue. The charter defines WHAT a module does and its boundaries, grounded in the project constitution and existing specs. It does not define HOW the module is built — that is the job of Live Specs and implementation plans.

**When to use it:** At the start of any new feature or module. If you have an idea but have not yet defined its scope, brainstorm is the entry point.

**Prerequisites:** `.context-index/` must exist with a constitution. Run `/adev:init` first if needed.

**Example invocation:**

```
/adev:brainstorm
```

You can also scope to an existing module (`--module <name>`) or seed from a blueprint (`--from-blueprint <path>`).

**Output:** A Feature Charter at `.context-index/specs/features/<name>/charter.md` containing scope boundaries, a capability map, and success criteria.

See the [Skill Reference](skills.md) for full details on arguments and behavior.

## Specify

**Skill:** `/adev:specify`

**What it does:** Authors a Live Spec that defines a behavioral contract for implementation, scoped to an existing Feature Charter. The spec becomes the single source of truth for what `/adev:plan` decomposes and `/adev:implement` builds.

**When to use it:** After a charter is approved, for each capability that needs a formal behavioral contract. Supports standard mode, extraction from existing code (`--extract`), refactoring specs (`--refactor`), diff-driven specs (`--from-diff`), and cross-cutting concerns (`--cross-cutting`).

**Prerequisites:** A Feature Charter must exist under `.context-index/specs/features/`.

**Example invocation:**

```
/adev:specify
```

**Output:** A Live Spec at `.context-index/specs/features/<name>/<spec>.spec.md` with a behavioral contract, acceptance criteria, and error cases.

See the [Skill Reference](skills.md) for full details on arguments and modes.

## Review Specs

**Skill:** `/adev:review-specs`

**What it does:** Runs an architecture review on Live Specs using three parallel specialist subagents: a structural architect, a security reviewer, and a consistency analyzer. This is the gate between specification and planning — no code gets planned until specs pass review.

**When to use it:** After writing a spec, before planning. The review catches structural issues, security gaps, and consistency problems early, when they are cheap to fix.

**Prerequisites:** At least one Live Spec must exist at `review-pending` status.

**Example invocation:**

```
/adev:review-specs
```

You can target a specific spec (`--spec <path>`) or all specs under a charter (`--charter <module>`).

**Output:** A review file (`.review.md`) adjacent to the spec with a PASS, PASS_WITH_NOTES, or BLOCK verdict from each reviewer.

See the [Skill Reference](skills.md) for full details on the review process and specialist profiles.

## Prototype

**Skill:** `/adev:prototype`

**What it does:** Generates tiered prototypes (wireframe, mockup, or functional) from a Feature Charter, serves them via localhost for browser preview, and iterates on conversational feedback.

**When to use it:** Optionally, after chartering and before or during specification, to validate the user experience before committing to implementation. Particularly useful for UI-heavy features.

**Prerequisites:** A Feature Charter must exist at `.context-index/specs/features/<module>/charter.md`. Node.js runtime is required for the HTTP server.

**Example invocation:**

```
/adev:prototype --module my-feature
```

**Output:** UI mockups and flow diagrams served at localhost, with the option to persist or discard.

See the [Skill Reference](skills.md) for full details on tiers and framework options.

## Moving to Build

Before moving to the build phase, all specs must pass architecture review. This gate ensures that structural, security, and consistency issues are resolved before any implementation planning begins.

**Gate condition:** Each spec must have an adjacent `.review.md` file with a PASS or PASS_WITH_NOTES verdict. The `lifecycle-gate-edit` hook enforces this — it blocks planning on specs that have not passed review.

**What to check:**

- Review files exist for all specs you intend to build
- No review has a BLOCK verdict
- Specs have not been modified after their last review (if they have, re-run `/adev:review-specs`)

Once all specs have passing reviews, proceed to the [Build Phase](build-phase.md).

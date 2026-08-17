---
charter: setup
kind: skill
status: implemented
risk_level: low
milestone:
revision: 1
charter-revision: 4
created: 2026-08-17
updated: 2026-08-17
source-manifest:
  sha: "9863f02"
  files:
    - skills/using-adev/SKILL.md
    - tests/skills/using-adev-how-does-x-work.test.mjs
    - tests/skills/using-adev-trigger-broadening.test.mjs
    - tests/skills/using-adev-what-should-i-do.test.mjs
  computed-at: "2026-08-17T19:01:18.985Z"
---

# Live Spec: `using-adev` Interactive Help Surface

<!-- Skill Spec within the setup charter.
     Extends skills/using-adev/SKILL.md, which today only injects a static
     reference block at session start, so it ALSO acts as an on-demand
     interactive help/Q&A surface. Behavior/instruction change only — no new
     skill, no new code, no new dependency.
     Parent Charter: .context-index/specs/features/setup/charter.md
     Capability: "Interactive onboarding & help Q&A" -->

## Invocation Modes

`using-adev` gains two on-demand Q&A modes layered onto its existing session-start injection. All three modes share the single skill entrypoint (`/adev:using-adev` or an equivalent trigger-phrase match) — they are differentiated by the shape of the user's question, not by flags or sub-commands.

| Mode | Trigger | Status |
|---|---|---|
| Session-start injection | Automatic, at session start | Existing — unchanged |
| "What should I do?" Q&A | User asks an orientation/lifecycle-choice question (e.g. "what should I do next", "which skill do I need", "how do I start") | New |
| "How does X work?" Q&A | User asks about a specific skill's behavior (e.g. "how does /adev:plan work", "what does --refactor do on specify") | New |

The `description` frontmatter field in `skills/using-adev/SKILL.md` is broadened so both new question shapes trigger the skill, not only the existing "what skills are available" style queries.

## Arguments

`using-adev` takes no positional arguments or flags. Invocation is conversational: the "argument" is the shape of the user's free-text question, matched against the trigger phrases documented in the `description` frontmatter.

| Argument | Required | Description |
|---|---|---|
| *(none)* | — | Skill is triggered by session start or by matching a question against the `description` frontmatter's trigger phrases. No explicit invocation syntax. |

## Output Contract

**"What should I do?" mode:**
- Explains the relevant lifecycle options **conceptually** in chat (what each stage does, when it applies).
- Does **not** perform routing itself — it never decides which skill the user should run next.
- Always ends by pointing the user to `/adev:work` for the actual routing decision, consistent with `/adev:work`'s own charter stating it "does not replace `using-adev` as the educational gateway."
- Produces no file writes and emits no lifecycle events — this is a chat-only response.

**"How does X work?" mode:**
- Checks `docs/*.md` first (`docs/skill-reference.md`, `docs/cli-reference.md`, and other files indexed at `docs/README.md`) for an answer at the needed level of detail.
- Falls back to reading the actual `skills/<name>/SKILL.md` only when the docs do not cover the needed detail (e.g. exact argument behavior, ask-first prompt wording).
- Produces no file writes and emits no lifecycle events — this is a chat-only response.

**Both new modes, in common:**
- No new skill is added to the lifecycle order.
- No new code or CLI verb is introduced; the change is confined to `skills/using-adev/SKILL.md` prose/process and its `description` frontmatter.
- No new external dependency.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| "How does X work?" names a skill that does not exist | Report that the skill was not found; list the closest matching names from the skill table already in `skills/using-adev/SKILL.md` | User corrects the skill name or asks a different question |
| "How does X work?" question needs detail beyond what `docs/*.md` covers | Fall back to reading `skills/<name>/SKILL.md` directly | — (handled automatically) |
| "What should I do?" question is answered with a concrete routing decision instead of a conceptual explanation | Violates the charter boundary (`using-adev` must not perform routing) — this spec's Acceptance Criteria treat this as a defect to fix during implementation, not an accepted behavior | Implementer corrects the SKILL.md prose so the answer stays conceptual and defers to `/adev:work` |
| User's question is ambiguous between "what should I do" and "how does X work" | Answer the "how does X work" framing if a specific skill name is present in the question; otherwise treat as "what should I do" | User can rephrase to disambiguate |

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — Applies directly; the entire capability is implemented as `skills/using-adev/SKILL.md` prose. No companion code is required or added.
- **Architecture Boundaries — Autonomous: "Editing skill markdown content"** — Applies; this is a prose/process and `description` frontmatter change to an existing skill, not a new skill in the lifecycle order, so no human-approval gate applies.
- **Architecture Boundaries — Requires Human Approval: "Adding new skills to the lifecycle order"** — Explicitly does NOT apply here; this spec extends an existing skill's behavior rather than adding a new one, which is the reason this capability was scoped as a `using-adev` extension rather than a new `/adev:*` skill.

## Acceptance Criteria

- [x] `skills/using-adev/SKILL.md` `description` frontmatter is broadened to trigger on "what should I do" and "how does X work" style questions, in addition to the existing "what skills are available" triggers
- [x] "What should I do?" question path explains lifecycle options conceptually and always defers the routing decision to `/adev:work` — it never performs routing itself
- [x] "How does X work?" question path checks `docs/*.md` first and falls back to the specific `skills/<name>/SKILL.md` only when docs don't cover the needed detail
- [x] No new skill is added to `.claude-plugin/plugin.json` or the lifecycle order
- [x] No new code, CLI verb, or external dependency is introduced
- [x] All quality gates pass
- [x] No constitutional violations introduced

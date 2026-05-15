# Live Spec: Configurable Reviewer Registry

---
charter: review
status: validated
risk_level: medium
revision: 3
charter-revision: 1
created: 2026-04-19
updated: 2026-05-04
depends-on:
  - .context-index/adrs/0003-configurable-review-registry.md
  - .context-index/adrs/0004-execution-profiles.md
  - .context-index/specs/cross-cutting/execution-profiles.md
source-manifest:
  files:
    - lib/governance/review-config.mjs
    - lib/governance/context-pack.mjs
    - lib/governance/dispatch-shape.mjs
    - skills/review-specs/SKILL.md
    - templates/review-specs/defaults.yaml
  computed-at: "2026-05-10T23:51:35.315Z"
drift_detected: true
drift_source: skills/review-specs/SKILL.md
drift_at: 2026-05-15T14:19:50.712Z
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`, `constitution.md`.
- `plugin:review-specs/defaults.yaml` ships with the plugin and encodes the three default reviewers (structural architect, security reviewer, consistency analyzer) plus their context packs.
- `.context-index/profiles.yaml` may or may not exist; bundled execution profiles always exist (see cross-cutting spec).
- `manifest.yaml:specialists` may or may not be populated; `governance/review.yaml` may or may not exist.

### Behaviors

#### Registry Loading and Merge

1. **When** `/adev:review-specs` runs **then** before Step 3 it calls `loadReviewConfig(repoRoot)` from `lib/governance/review-config.mjs`. The function reads bundled defaults from `plugin:review-specs/defaults.yaml` first, then overlays `governance/review.yaml`. Project entries merge by `id`: matching `id` overrides the default field-by-field; new `id` is appended.

2. **When** `governance/review.yaml` does not exist **then** the merged config equals bundled defaults; behavior is identical to today's hardcoded flow. No warning.

3. **When** `governance/review.yaml` contains a `reviewers:` list **then** each entry is validated. Required fields: `id`, `dispatch`, **either** `prompt` (for `subagent` mode) **or** `package` (for external-skill mode). Optional fields: `profile` (default: `reviewer-capable`), `context_pack` (default: `base`), `severity_cap` (default: `blocker`), `enabled` (default: `true`).

4. **When** a reviewer entry has `enabled: false` **then** it is excluded from dispatch regardless of whether it is a default or project-defined.

#### Two Dispatch Modes

5. **When** a reviewer entry contains a `prompt` field **then** it dispatches in **subagent mode**: a single agent invocation with the prompt file's contents plus the rendered context pack. This is how the three bundled defaults dispatch.

6. **When** a reviewer entry contains a `package` field **then** it dispatches in **package mode**: an external skill is run as a black box, then a separate adapter subagent extracts findings from its output. See "Package Mode" below.

7. **When** a reviewer entry contains both `prompt` and `package` **then** load fails: `"Reviewer '<id>': must declare either 'prompt' or 'package', not both."`

8. **When** a reviewer entry contains neither **then** load fails: `"Reviewer '<id>': must declare 'prompt' (subagent mode) or 'package' (external-skill mode)."`

#### Profile Reference

9. **When** a reviewer entry has a `profile: <name>` field **then** the named profile is resolved via `loadProfiles(repoRoot)` from the cross-cutting spec. Tier, tool permissions, env, MCP requirements, limits, and thinking directive all come from the profile.

10. **When** a reviewer omits `profile` **then** `reviewer-capable` is used as the default. (Bundled defaults override per-reviewer: structural-architect → `reviewer-reasoning`, security-reviewer → `reviewer-capable`, consistency-analyzer → `reviewer-fast`.)

11. **When** a reviewer's referenced profile does not exist **then** load fails per cross-cutting spec Behavior 4.

11a. **When** a reviewer (subagent-mode or package-mode) references a profile whose effective posture is not read-only-compatible **then** load fails: `"Reviewer '<id>': profile '<profile>' is not read-only-compatible. Reviewer dispatch rejects profiles that permit 'filesystem-write', 'shell', or any tool literal not derived from 'read-only'. Use a profile that extends 'read-only' (e.g. reviewer-fast / reviewer-capable / reviewer-reasoning / browser-review) or declare a new one."`

    **Read-only-compatible** means all of the following hold on the effective profile:
    - No `{ category: filesystem-write }` or `{ category: shell }` in the resolved tool allowlist.
    - No `{ tool: <literal> }` entry except via `browser-review`-style explicit allowances already present in a bundled read-only-derived profile.
    - `permissions.filesystem.write` is `deny` and `permissions.filesystem.execute` is `deny`.
    - `permissions.network` is `deny` or `read-only` (never `allow`).

    The check runs at `loadReviewConfig` time, before any reviewer can dispatch, so a project cannot silently grant shell/write/network to a reviewer by selecting `implementer` or a custom permissive profile. A reviewer that legitimately needs additional read-only-compatible capability (e.g. browser navigation) MUST use a profile that extends `read-only` (such as `browser-review`) so the invariant is preserved.

#### Schema Validation

12. **When** required fields are missing **then** load fails with: `"Reviewer '<id>': missing required field '<field>'."`

13. **When** `dispatch` is not in `{always, triggered, never}` (or a `triggered` object) **then** load fails.

14. **When** `severity_cap` is not in `{blocker, warning, suggestion}` **then** load WARN; default to `blocker`.

15. **When** two reviewer entries share the same `id` after merge **then** the later entry wins; WARN: `"Duplicate reviewer id '<id>' — second definition ignored."`

#### Prompt Resolution (Subagent Mode)

16. **When** a reviewer's `prompt` field begins with `plugin:<skill-name>/<file>` **then** the resolver maps it to `<plugin-root>/skills/<skill-name>/<file>`. Paths escaping the plugin `skills/` tree fail load with security error.

17. **When** a reviewer's `prompt` field is a relative path (no scheme) **then** it is resolved relative to `<repo-root>/.context-index/`. The resolver MUST:
    - Reject any path that, after `path.resolve`, does not remain under `<repo-root>/.context-index/` (no `..` escape, no symlink escape — `fs.realpath` is used to verify).
    - Reject paths containing `..` segments before resolution.
    - Reject symlinks whose target escapes `.context-index/`.

    Escape attempts fail load: `"Reviewer '<id>': prompt path '<raw>' resolves outside .context-index/. Relative prompt paths may not traverse out of the context-index tree."` Missing file fails load with a distinct message.

18. **When** a reviewer's `prompt` field is absolute **then** load fails: `"Reviewer '<id>': absolute prompt paths are not supported."`

19. **When** the prompt's host plugin is not the current plugin **then** v1 fails load: `"Cross-plugin prompt references (plugin:<other-plugin>:...) are not supported in v1."` (Single-colon form is reserved for current-plugin shorthand; double-colon form deferred to v2.)

#### Context Pack Rendering

20. **When** a reviewer is dispatched **then** its `context_pack` name is resolved against `governance/review.yaml:context_packs` (merged with bundled defaults). Unknown pack names fail load.

21. **When** a context pack has an `extends` key **then** the parent is resolved recursively; cycles fail load.

22. **When** a context pack `include` entry is a glob **then** all matching files are concatenated, each prefixed with its filename. Empty glob results emit `<no matches>` rather than omitting the section.

#### Dispatch Selection

23. **When** a reviewer has `dispatch: always` **then** it is dispatched for every spec under review.

24. **When** a reviewer has `dispatch: triggered` (object with `patterns`, `keywords`, `min_score`) **then** the existing scoring logic from `skills/review-specs/SKILL.md:86` applies: 2 points per matching glob (+1 per path segment beyond root), 1 point per matching keyword. Dispatched iff score ≥ `min_score` (default: 1).

25. **When** a reviewer has `dispatch: never` **then** it is excluded.

#### Subagent-Mode Invocation

26. **When** a subagent-mode reviewer is dispatched **then** the harness adapter's `prepareForDispatch(profile)` is invoked, returning the allowed tools, model, env, limits, thinking budget, and redaction set. The subagent is launched with:
    - `description`: `"<reviewer.name> review of <spec-slug>"`
    - `prompt`: `<prompt-file contents>\n\n---\n<rendered context pack>`
    - Tool restrictions, env, model parameters from the profile

27. **When** multiple reviewers are dispatched for the same spec **then** they run in parallel.

#### Package Mode (External-Skill Wrap)

28. **When** a reviewer entry has a `package` field **then** the schema is:

    ```yaml
    package:
      skill: <plugin:<current-plugin-skill>/SKILL.md or relative path to project SKILL.md>
      args:                                # passed to the skill as its arguments
        <arg-name>: <value-or-templated>   # "<target>" placeholder substitutes spec path
      adapter: <prompt path>               # default: plugin:review-specs/adapters/generic.md
    ```

29. **When** the `skill` field uses `plugin:<skill>/SKILL.md` **then** it resolves within the current plugin's `skills/` tree per Behavior 16. Cross-plugin skill references (`plugin:<other-plugin>:<skill>/SKILL.md`) fail load in v1 with the same v2-deferral message as Behavior 19.

30. **When** the `skill` field is a relative path **then** it is resolved relative to `<repo-root>/.context-index/` and the same traversal guard as Behavior 17 applies: `path.resolve` must remain under `.context-index/`, `..` segments are rejected pre-resolution, and `fs.realpath` is used to verify the resolved target has not escaped via symlink. Allows project-local skills. Escape attempts fail load: `"Reviewer '<id>': package.skill path '<raw>' resolves outside .context-index/. Relative skill paths may not traverse out of the context-index tree."`

30a. **When** a `package.adapter` field is a relative path **then** the same traversal guard applies. `plugin:`-scheme paths continue to follow Behavior 16's rule (must remain under the plugin `skills/` tree).

31. **When** package mode dispatches **then** it runs as a two-stage pipeline:
    - **Stage 1 (Runner):** launch a subagent under the reviewer's profile with:
      - `description`: `"Run skill <skill-name> for review"`
      - `prompt`: the full SKILL.md contents, plus a brief framing note: *"You are running as a reviewer subagent. Follow the instructions below faithfully. The arguments and context for this run are appended."*
      - Args appended as the SKILL.md's documented `## Arguments` section instructs (e.g. `--spec <target>`)
      - Rendered context pack appended
      - Profile-restricted tools, env, model
    - **Stage 2 (Adapter):** launch a second subagent (under the same profile, or `reviewer-fast` if explicitly chosen) with the runner's full output text and the adapter prompt, instructing it to extract findings in the standard format.

32. **When** the runner subagent attempts a tool call disallowed by its profile **then** the harness fails the call. The runner's output reflects the failure; the adapter surfaces it as a `warning` finding.

33. **When** the adapter's output does not parse as the findings YAML block **then** the raw runner output is sanitized before being wrapped as a single `suggestion` finding. Sanitization rules:
    - The reviewer's effective profile's `redactionSet` (cross-cutting Behavior 36) is applied to the raw bytes using the standard redaction pipeline — no channel bypass.
    - After redaction the text is truncated to at most 8 KiB (8192 bytes); the tail is replaced with `"\n…[truncated <N> bytes of adapter output — see dispatch record for full text]"`. The full untruncated (but still redacted) output is written to the dispatch record only, not to `.review.md`.
    - Any byte sequence matching an absolute filesystem path under `.context-index/`, the plugin root, or the user home directory is normalized to a repo-relative or `plugin:` form to avoid leaking internal layout.
    - The finding message is: `"Adapter did not parse output into structured findings — sanitized runner output below (redacted and truncated)."`

    Quality degrades gracefully without leaking env values, secrets, absolute paths, or unbounded tool output into the committed `.review.md`.

34. **When** a reviewer entry's `package.skill` references a SKILL.md that does not exist **then** load fails.

35. **When** a reviewer entry's `package.adapter` is omitted **then** the default `plugin:review-specs/adapters/generic.md` is used. Projects override per reviewer when they have ground truth about the skill's output format.

#### Severity Cap

36. **When** a reviewer returns findings (subagent or package mode) **then** each finding's `severity` is clamped to `reviewer.severity_cap`. Demotion is annotated: `"[capped from <original> to <capped>]"` prefix on the message.

#### Verdict Consolidation

37. **When** all reviewers have returned **then** the verdict is computed from post-cap findings: PASS (zero warnings/blockers), PASS_WITH_NOTES (≥1 warning, zero blockers), BLOCK (≥1 blocker).

38. **When** `verdict_rules.blocker_threshold` is set in `governance/review.yaml` **then** BLOCK requires ≥ that many blockers (default: 1). Richer custom rules deferred to v2.

#### Manifest Specialists Deprecation

39. **When** `manifest.yaml:specialists` is present at load **then** a one-time advisory emits: `"manifest.yaml:specialists is deprecated. Move entries to governance/review.yaml:reviewers. Support will be removed in 0.19.0."` Each specialist is converted in-memory to a reviewer entry: `dispatch: triggered` (using the specialist's `triggers`), `prompt: <specialist.prompt>`, `profile: reviewer-capable`. Project entries with the same `id` take precedence.

### Postconditions

- The review report `.review.md` lists every dispatched reviewer (id, name, dispatch mode, profile, prompt source).
- For package-mode reviewers, the report records the skill path, the adapter used, and whether the adapter parsed cleanly.
- Severity-capped findings are flagged inline.
- Spec status is updated as today: `review-pending` → `review-passed` | `review-blocked`.

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `governance/review.yaml` malformed YAML | Load fails with line-cited parse error. |
| Subagent-mode prompt file missing | Load fails. |
| Package-mode skill SKILL.md missing | Load fails. |
| Package-mode adapter file missing | Load fails. |
| Profile referenced does not exist | Load fails per cross-cutting spec. |
| Profile requires MCP server not present | Load fails per cross-cutting spec. |
| Required env keys missing for profile | Load fails per cross-cutting spec. |
| Reviewer subagent crashes / returns empty | Reviewer recorded as verdict UNKNOWN with warning; overall verdict proceeds from remaining reviewers. |
| Adapter output unparseable | Wrap raw output as one `suggestion` finding (Behavior 33). |
| All reviewers disabled | Skill exits non-zero: `"No reviewers enabled — check governance/review.yaml."` |

## System Constitution Reference

- **Principle #1:** Zero-dep YAML parser extension; all `lib/governance/` code uses Node built-ins.
- **Principle #2 (Skills are primarily markdown):** SKILL.md continues to describe the high-level flow; only reviewer selection and dispatch detail become data. Package mode preserves the principle by treating external skills as markdown that we read but do not modify.
- **Principle #3 (Pure ESM):** All `.mjs`.
- Architecture Boundary: this spec consumes (does not redefine) the execution-profile primitive. The plugin contract change is captured in ADR-0004; this spec depends on it.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extract `plugin:review-specs/defaults.yaml` | Encode the three default reviewers + their context packs as YAML. Each references an execution profile. | medium |
| Implement `lib/governance/review-config.mjs` | Parse, validate, merge defaults + project. Resolves profile names via `lib/profiles/`. | medium |
| Implement `lib/governance/context-pack.mjs` | Resolve `extends` chains, render packs to strings given a target spec. | medium |
| Implement package-mode dispatcher | Runner + adapter two-stage flow. Lives in `skills/review-specs/SKILL.md` Step 4 logic. | medium |
| Author `plugin:review-specs/adapters/generic.md` | Default adapter prompt that converts arbitrary skill output into findings YAML. | small |
| Extend YAML parser | Support nested lists, labeled `include` entries, `extends`. | medium |
| Rewrite `skills/review-specs/SKILL.md` Steps 3-4 | Replace hardcoded reviewer dispatch with config-driven dispatcher; add package-mode handling. Steps 1-2, 5-8 unchanged. | medium |
| `manifest.yaml:specialists` deprecation | Advisory, in-memory conversion, template doc update. | small |
| `/adev:init` scaffolding | Write commented-out `governance/review.yaml` template. | small |
| Tests | `tests/governance/review-config.test.mjs`; `tests/governance/context-pack.test.mjs`; integration test for zero-config parity; package-mode integration test. | large |

## Acceptance Criteria

- [ ] Zero-config behavior: `/adev:review-specs` with no `governance/review.yaml` produces a `.review.md` byte-identical to the pre-change implementation for at least one fixture spec.
- [ ] Disabling the consistency analyzer via `enabled: false` excludes it from dispatch and from the report.
- [ ] A project-defined subagent-mode reviewer with `dispatch: triggered` dispatches when its score ≥ `min_score`; appears in the report alongside defaults.
- [ ] A package-mode reviewer wrapping a project SKILL.md runs both runner and adapter subagents; findings appear in the report with the runner's source identified.
- [ ] A reviewer with `severity_cap: warning` whose subagent emits `blocker` produces `warning` in the report, prefixed `[capped from blocker to warning]`.
- [ ] A reviewer's profile reference is resolved at load; a missing profile name fails load with a clear error before any dispatch.
- [ ] A package-mode runner that attempts a profile-disallowed tool call has its failure surfaced by the adapter as a `warning` finding.
- [ ] Adapter output that doesn't parse falls back to a single `suggestion` finding wrapping the sanitized runner output: `redactionSet` applied, 8 KiB truncation, absolute paths normalized. The full text (still redacted) is retained in the dispatch record only.
- [ ] A reviewer `prompt` or `package.skill` path using `../` or a symlink escaping `.context-index/` fails load with the path-traversal message (Behaviors 17, 30).
- [ ] A reviewer referencing a profile whose effective posture permits `filesystem-write`, `shell`, literal tools, write-allowed filesystem, or unrestricted network fails load with the read-only-compatibility message (Behavior 11a). Referencing `implementer` from a reviewer entry fails load.
- [ ] `manifest.yaml:specialists` still works during deprecation; advisory emitted once per skill invocation.
- [ ] Cross-plugin prompt and skill references (`plugin:<other-plugin>:...`) fail load with the v2-deferral message.
- [ ] Multi-repo: reviewing a spec from another repo within an `adev-workspace.yaml` context resolves env via the spec's repo (consumer-repo-local), not CWD.
- [ ] All quality gates pass.
- [ ] No constitutional violations.

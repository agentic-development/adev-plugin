## Step 4: Dispatch Reviewers

**Build the dispatch plan with the CLI. Never assemble a reviewer prompt yourself.**

```bash
adev governance dispatch --spec <spec-path> --tier <full|quick> --module <charter-module> --json
```

Pass `--tier` as resolved in Step 2.5 (`full` is the default). Derive `--module` from the spec's `charter:` frontmatter field, the same slug Step 0 uses. Add one `--note "<warning>"` per Step 2b cross-repo reference warning; each reaches every reviewer, fenced as data under `## Orchestrator Notes`. Pass `--harness opencode` when running under OpenCode (the default is `claude-code`). This changes only the read-tool names the prompts promise.

The verb exits 1 on an argument error, an invalid spec path, an unmaterialized `review.yaml` (`REGISTRY_NOT_MATERIALIZED`), or any error in the plan's `errors` array. Abort the review in those cases and report them; never fall back to a hand-built prompt. Carry the plan's `warnings` into the report header with the other registry warnings.

The verb does everything the orchestrator used to do by hand, in lib code:

- **Selection.** Each registry reviewer goes through `shouldDispatch`. Reviewers with `dispatch: always` always dispatch. A `triggered` reviewer computes a score (2 points per matching glob + 1 per path segment beyond root, 1 point per keyword) and dispatches when the score is ≥ `min_score` (default 1). `never` and disabled reviewers are skipped. The envelope's `reviewers` array records every decision with its `reason`.
- **Diff-scoped dispatch (BEH-8).** It reaches the same decision as `adev governance diff-scope` (the shared `resolveDiffScope` in `lib/governance/diff-scope-decision.mjs`). The first review of a spec is always full-context. On `scoped: true`, the changed and cross-referenced sections are the `specContent` for selection and the target spec each reviewer receives. Every non-scoped reason (`first-review`, `git-unavailable`, `no-content-changed`) fails open to the full spec. The envelope's `diff_scope` records which applied. `adev governance diff-scope` remains available to inspect that decision on its own.
- **Heuristics.** With `--module`, module heuristics (summary tier) are fenced into each reviewing prompt under `## Heuristics`, framed as guidance rather than hard rules. Retrieval failures degrade to no heuristics, so this stays non-blocking. The envelope's `heuristics.count` reports how many were included.
- **Quick tier (Step 2.5).** `--tier quick` skips the registry loop and plans exactly one subagent, `quick-synthesized-reviewer`. It uses the bundled `plugin:review-specs/quick-synthesized-reviewer-prompt.md` under `reviewer-capable` (or the fields of a registry entry with that id), with the `review-base` pack when the project declares it. It returns `SA-`/`SEC-`/`CON-` findings in the standard format plus a consolidated verdict. A missing bundled prompt fails loud with `QUICK_PROMPT_MISSING`; never fall back to a weaker or empty review.

**Dispatch every entry of the envelope's `dispatches` array**, passing its fields to the Agent call unchanged:

- `description` → the Agent `description`.
- `prompt` → the Agent `prompt`, byte for byte. Do not trim, summarize, reorder, or append to it, except for the package-mode adapter (below).
- `model` → the Agent `model` argument. It carries `modelId`: the dispatch struct's `modelId` field, resolved from the reviewer's `profile.model.tier` via `platform-context.yaml:model_tiers`. **Omitting it silently defeats the tier system**: the dispatch falls back to the orchestrator's own session model regardless of the reviewer's assigned tier, and nothing fails or warns. A `null` model means the project configures no model for that tier; only then omit the argument.
- `allowed_tools` are the tool restrictions from the adapter's `prepareForDispatch`. `env_keys` names the profile env without its values, which are never printed.

Launch all dispatched reviewers in parallel. Each runs in a clean context window. Dispatch every reviewer with `run_in_background: false`, issuing the Agent calls in a single message so they still run concurrently. The harness backgrounds Agent dispatches by default, and background completion notifications do not re-invoke a nested caller (review-specs frequently runs as a build-step subagent), so a backgrounded reviewer stalls the review. Synchronous parallel calls return all reviewer reports directly in the tool results. The quick-tier dispatch follows the same rule.

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

### What a reviewer prompt contains (reference only)

Each `prompt` is composed by `buildReviewerDispatches(...)` in `lib/governance/dispatch-shape.mjs`. That function is the single source of truth for prompt assembly, fencing, and preamble text, and for resolving `modelId` per dispatch. The description below is reference only; do not restate or hand-assemble any of it.

- The **provenance preamble**, then the prompt body, then the rendered context pack, then the target spec. The pack sections and the target spec are each wrapped in a nonce-scoped fence (`<<<ADEV-PACK-<nonce> …>>>`) so the reviewer can tell repository-sourced content from text the artifact under review merely claims is a delimiter. All fences use the **same** nonce, and the preamble names that token. Every review-time pack is target-anchored (`<charter-dir>`, `<target-spec>`), and the denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`) is enforced at render.
- Under `delivery: manifest`, the preamble also carries the **manifest read contract**: a `role="path-manifest"` fence lists repository paths whose contents were not inlined, the reviewer is expected to read them on demand, and the preamble names the read tools its resolved profile grants (derived through the harness adapter).
- `## Heuristics`, when `--module` found any, and `## Orchestrator Notes`, when `--note` was given.
- **`## Truncated Context`**, only when the pack cut a file at `max_file_bytes` (its fence ends with an `…[adev: truncated …]` marker) or omitted files at `max_total_bytes` (listed in the `role="truncation-notice"` fence). It requires that any `blocker` citing such a file, or one such a file could settle, is first verified by reading the full file, and that it quotes the conflicting text. A reviewer whose profile grants no read tools may report such evidence as a `warning` at most.
- **`## Prior-Round Review`**, only when the target spec already has a `.review.md` (read by `loadPriorReview` in `lib/governance/prior-review.mjs`). The previous round's report body is nonce-fenced as `role="prior-review"` and labeled as prior-round findings, with its validated verdict and reviewed revision. A reviewer that re-raises a prior finding must say why the current spec's resolution does not hold. The `.review.md` on disk at dispatch time is always the previous round's, because Step 6 overwrites it only after this round's reviewers return.

The heuristics, notes, truncation, and prior-round sections reach every reviewing stage (subagent, package runner, quick tier) but never the package-mode adapter. Every bundled reviewer prompt also states the truncation and prior-round rules in its own `## Rules`.

**What each reviewer actually receives** is exactly its `context_pack` (Step 3 registry entry) plus the target spec and the conditional sections above. On a diff-scoped cycle, "the target spec" is the changed and cross-referenced sections, not the full spec body. The nine context categories in Step 2 are *not* uniformly forwarded; see the per-item labels there.

### Package-mode reviewer (reviewer entry has `package`)

The plan holds two consecutive entries for the reviewer, `stage: "runner"` then `stage: "adapter"`, each with its own independently resolved `model`:

1. **Stage 1 (runner):** dispatch it as above. Its prompt carries the resolved skill's `SKILL.md`, a framing note, the `package.args` (with `<target>` substituted), the rendered context pack, and the target spec.
2. **Stage 2 (adapter):** after the runner returns, dispatch the adapter entry (`append_runner_output: true`) with the runner's full output appended to its `prompt`. The adapter prompt (`reviewer.adapterPath`, default `plugin:review-specs/adapters/generic.md`) extracts findings in the standard YAML format. Pass this stage's own `model` the same way.

### Severity cap and parse-failure fallback

After each reviewer returns, apply `applySeverityCap(finding, reviewer)` to every finding (from `lib/governance/review-config.mjs`). This clamps `finding.severity` to `reviewer.severity_cap` and prefixes demoted messages with `[capped from <orig> to <cap>]`.

If a package-mode adapter returns output that does not parse as the findings YAML block:

- Apply the reviewer's `redactionSet` to the raw runner output via the redactor returned by `resolveProfile`.
- Truncate to 8 KiB; replace the tail with `"…[truncated <N> bytes of adapter output — see dispatch record for full text]"`.
- Normalize any absolute paths under `.context-index/`, plugin root, or `$HOME` to repo-relative or `plugin:` form.
- Wrap as a single `suggestion` finding with message: `"Adapter did not parse output into structured findings — sanitized runner output below (redacted and truncated)."`
- Write the full redacted (untruncated) output to the dispatch record, **never** to `.review.md`.

**Not yet implemented:** nothing in this pipeline currently observes a runner's tool calls against `reviewer.profile`'s `allowedTools`, so a disallowed tool call is never surfaced or recorded as a `warning` finding today. The profile's tool list is handed to the dispatch call, but until a harness-level check exists, the read-only posture is honored only by the dispatched subagent following instructions — not enforced. Tracked as issue `adev-plugin-bjkp`.

### Tier note

Tier assignment now flows from each reviewer's `profile.model.tier` (resolved via `platform-context.yaml:model_tiers` as today). Bundled defaults continue to use reasoning/capable/fast for architect/security/consistency respectively. **This tier assignment is inert unless the dispatch actually carries it forward**: every Agent dispatch above (subagent-mode, and both package-mode stages) MUST pass its plan entry's `model` field (the dispatch struct's `modelId` field) as the Agent call's `model` argument. A dispatch that omits `modelId` runs silently on the orchestrator's own session model instead of the assigned tier — nothing fails or warns, so this is easy to miss in review.

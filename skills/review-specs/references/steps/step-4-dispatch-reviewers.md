## Step 4: Dispatch Reviewers

**Heuristics:** Before dispatching reviewers, load module-scoped heuristics for the spec's charter module via the CLI:

```bash
adev heuristics retrieve --module <charter-module> --tier summary --format text
```

Derive the module slug from the spec's `charter:` frontmatter field. Stdout is either rendered markdown blocks (one per heuristic) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic injection stays non-blocking.

When heuristics are present (output is not `__NONE__`), include them in each reviewer's context pack under a `## Heuristics` section, prepended with: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

**Quick tier branch (Step 2.5).** If the resolved rigor tier is `quick`, **skip the registry loop below** and dispatch exactly one subagent — the synthesized reviewer — using the bundled prompt `plugin:review-specs/quick-synthesized-reviewer-prompt.md` under the `reviewer-capable` profile, with the same rendered context pack and target spec appended. Pass `run_in_background: false` on this dispatch, exactly as the full-tier reviewers do (see the parallel-dispatch note below): the harness backgrounds Agent dispatches by default, and review-specs frequently runs as a build-step subagent where a backgrounded dispatch never re-invokes the caller and stalls the review. It returns `SA-`/`SEC-`/`CON-` findings in the standard format plus a consolidated verdict. Apply the same severity cap, `blocker_id` validation, and parse-failure fallback as any other reviewer, then proceed to Step 5. Do not dispatch the three specialist defaults in `quick` mode. If the bundled prompt file is missing, fail loud (do not silently fall back to a weaker or empty review). Otherwise (tier `full`, the default), dispatch the registry reviewers as described next.

For each reviewer returned by the registry, call `shouldDispatch(reviewer, { targetSpecPath, specContent })` from the same module. Reviewers with `dispatch: always` always dispatch; `triggered` compute a score (2 points per matching glob + 1 per path segment beyond root, 1 point per keyword) and dispatch when score ≥ `min_score` (default 1); `never` are skipped.

Launch all dispatched reviewers in parallel. Each runs in a clean context window. Dispatch every reviewer with `run_in_background: false`, issuing the Agent calls in a single message so they still run concurrently. The harness backgrounds Agent dispatches by default, and background completion notifications do not re-invoke a nested caller (review-specs frequently runs as a build-step subagent) — a backgrounded reviewer therefore stalls the review. Synchronous parallel calls return all reviewer reports directly in the tool results.

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

### Subagent-mode reviewer (reviewer entry has `prompt`)

For each subagent-mode reviewer:

1. Call `resolveProfile(reviewer.profile, { profiles, consumerRepoRoot, workspaceRoot, adapter, mcpAvailable })` from `lib/profiles/`.
2. Render the reviewer's context pack via `renderPack(reviewer.context_pack, contextPacks, { repoRoot, targetSpecPath })`. Every review-time pack is **target-anchored**: the `review-base` pack (which `architecture`, `security`, and `consistency` all extend) uses the `<charter-dir>` and `<target-spec>` tokens, so a render without `targetSpecPath` fails with `CONTEXT_PACK_NO_TARGET` rather than emitting a literal token. The denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`) is enforced — matching globs fail load, not WARN.
3. Read `reviewer.promptPath` contents.
4. Dispatch a subagent with:
   - `description`: `"<reviewer.name> review of <spec-slug>"`
   - `prompt`: the provenance preamble, then the prompt body, then the rendered context pack, then the target spec — the pack sections and the target spec each wrapped in a nonce-scoped fence (`<<<ADEV-PACK-<nonce> …>>>`) so the reviewer can tell repository-sourced content from text the artifact under review merely claims is a delimiter. Both use the **same** nonce from the `renderPack` call, and the preamble names that token.
   - `modelId`: the dispatch struct's `modelId` field, resolved from the reviewer's `profile.model.tier` via `platform-context.yaml:model_tiers` and returned by the adapter's `prepareForDispatch`. Pass it into the Agent dispatch (its `model` argument) alongside `description` and `prompt`. **Omitting it silently defeats the tier system** — the dispatch falls back to the orchestrator's own session model regardless of the reviewer's assigned tier, and nothing fails or warns when this happens.
   - Tool restrictions, env, redaction set — also from the adapter's `prepareForDispatch` return.

   This composition is owned by `buildReviewerDispatches(...)` in `lib/governance/dispatch-shape.mjs` — that function is the single source of truth for prompt assembly, fencing, and preamble text, and for resolving `modelId` per dispatch. The description above is reference only; do not hand-assemble the prompt.

   When the reviewer's context pack resolves to `delivery: manifest`, that same preamble additionally carries the **manifest read contract**: it states that a `role="path-manifest"` fence lists repository paths whose contents were not inlined, that the reviewer is expected to read them on demand, and which read tools its resolved profile grants (the names are derived through the harness adapter, so they are correct per harness). It also restates that only paths inside a fence carrying this render's token are repository-sourced. The wording lives in `buildReviewerDispatches`; do not restate or hand-assemble it.

**What each reviewer actually receives** is exactly its `context_pack` (Step 3 registry entry) plus the target spec. The nine context categories in Step 2 are *not* uniformly forwarded — see the per-item labels there.

### Package-mode reviewer (reviewer entry has `package`)

Run the two-stage pipeline:

1. **Stage 1 (runner):** dispatch a subagent under `reviewer.profile` with the resolved skill's `SKILL.md` contents plus a framing note (*"You are running as a reviewer subagent. Follow the instructions faithfully. The arguments and context for this run are appended."*) and the args from `package.args` (with `<target>` substituted for the spec path). Rendered context pack is appended. Tool restrictions from the profile apply. Pass the runner dispatch's `modelId` (from `buildReviewerDispatches`, same as a subagent-mode reviewer) as the Agent call's `model` argument — omitting it defeats the tier system the same way.
2. **Stage 2 (adapter):** dispatch a second subagent with the runner's full output + the adapter prompt (`reviewer.adapterPath`, defaults to `plugin:review-specs/adapters/generic.md`). The adapter extracts findings in the standard YAML format. Pass this stage's own `modelId` the same way — the adapter stage has an independently resolved `modelId` in its dispatch struct.

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

Tier assignment now flows from each reviewer's `profile.model.tier` (resolved via `platform-context.yaml:model_tiers` as today). Bundled defaults continue to use reasoning/capable/fast for architect/security/consistency respectively. **This tier assignment is inert unless the dispatch actually carries it forward**: every Agent dispatch above (subagent-mode, and both package-mode stages) MUST pass its dispatch struct's `modelId` field as the Agent call's `model` argument. A dispatch that omits `modelId` runs silently on the orchestrator's own session model instead of the assigned tier — nothing fails or warns, so this is easy to miss in review.

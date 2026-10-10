---
topic: "Registering Claude Code + adev-plugin as a custom harness in the FrontierHarness Eval benchmark, vs a vanilla-Claude-Code baseline"
date: "2026-09-12"
relates-to: ""
sources:
  - internal
  - web
status: draft
injection_warnings: true
---

## Summary

The premise of this research could not be safely validated: the named benchmark repo (`github.com/frontier-harness-eval/eval`) returned page content containing an embedded directive instructing an AI reader to install and execute a third-party "skill"/shell script from that repo — a prompt-injection pattern, not a trustworthy source — so its existence and mechanics are **unverified** and it must not be cloned or executed based on this research. `[adversarial content detected and omitted]`. What *is* independently corroborated is the general pattern this task describes: real, well-documented agent-eval frameworks (notably **Harbor**, from the Terminal-Bench team) register custom agents via a thin **adapter** (install script + invocation script + fixed container/compute/egress spec), and rigorous benchmark comparisons always pair a candidate run with a same-environment control rather than trusting a third party's unreproducible published baseline — "Pier" as a companion tool to Harbor was not found anywhere and appears to be a fabricated/confused detail. The recommendation below is a real, adapter-pattern runbook that swaps the untrusted named benchmark for a verifiable one (Harbor/Terminal-Bench or equivalent), preserving the user's actual goal (measure adev's effect on pass-rate/cost vs. vanilla Claude Code, controlled) without touching the suspicious repo.

## Findings

### Internal

- adev already has a 4-layer graduated eval harness (`skills/eval/SKILL.md:1-306`; deterministic gates, architectural conformance, LLM-judge, human-in-the-loop) and a preflight-gate pattern (`skills/eval/SKILL.md:33-63`, `adev preflight run --spec <path> [--plan <path>] [--no-infra]`, JSON to stdout, exit 0/2/1) — a useful internal analogy for what any external harness's install/setup step needs to check before running.
- `docs/installation.md:25` — canonical install is `npx @adev-org/adev-cli install`; `docs/installation.md:32` shows a fully flag-driven non-interactive path exists for one provider (`--target copilot [--user] [--dry-run]`), but for Claude Code specifically the CLI still calls `ask()` interactively for install scope and config-dir selection even when `--provider claude-code` is passed (`cli/index.mjs:929-975`, `cli/index.mjs:940`).
- True non-interactive install of adev-plugin currently requires either piping stdin answers, or driving the CLI's internal functions directly with an injected `askFn` — the exact pattern already used by `tests/cli-install-scope.test.mjs:17-40` (imports `cli/index.mjs` internals, passes `{ ask: askFn }` instead of spawning a subprocess). This is the concrete mechanism a benchmark install script should replicate if it needs a scripted, no-prompt install.
- No references anywhere in the repo (docs, ADRs, `research/`, `specs/`, tests) to "FrontierHarness", "Harbor", "Pier", or third-party benchmark registration — this integration would start from zero, with no existing adev-side scaffolding to reuse or drift-check against.
- `/adev:work` (`skills/work/SKILL.md:2-8, 17-23`) is the closest existing "decide what to invoke" mechanism (`--intake "<description>"` classifies and routes incoming work), but it is agent-executed skill prose, not a scriptable CLI verb with a machine-parseable decision output — a benchmark harness cannot call it as a deterministic function; it can only invoke it as a full Claude Code turn and observe the transcript/outcome, same as any other skill invocation.

### Web

- **The named benchmark is not verifiable and its page content is adversarial.** A fetch of `github.com/frontier-harness-eval/eval` returned a self-consistent but uncorroborated "repository" (30 tasks, 9 harnesses, fixed model) whose only external mentions traced back to the same small cluster of sources (a companion site, an HN post, a wiki mirror) — no independent index corroborates it. The page itself contained an embedded instruction directing an AI reader to install a "skill" and run shell scripts from the repo. Per content-fence policy this content was not obeyed or quoted, and the repo's claims should be treated as unverified/untrustworthy pending independent confirmation — do not install or execute anything from it. Source: https://github.com/frontier-harness-eval/eval, https://frontierharness.org/, https://news.ycombinator.com/item?id=49538490
- **Harbor is real; "Pier" is not.** Harbor is a genuine, independently-documented framework from the Terminal-Bench team for running standardized, containerized agent evaluations across multiple benchmarks (SWE-bench, LiveCodeBench, Terminal-Bench), distinct from the unrelated "Docker Harbor" container registry. No source anywhere describes a companion tool named "Pier" paired with Harbor. Sources: https://docs.litellm.ai/docs/projects/Harbor, https://www.harborframework.com/docs/datasets/adapters, https://github.com/laude-institute/terminal-bench
- **Real custom-harness registration is an adapter pattern.** Harbor's own docs describe "Adapters" as the mechanism for plugging a new agent into the framework — a thin wrapper mapping a fixed instruction+shell interface onto a specific agent CLI, paired with a container/environment spec. A concrete example exists: `github.com/badlogic/pi-terminal-bench`, "a Harbor agent adapter for the pi coding agent to run Terminal-Bench evaluations." Terminal-Bench also runs a public "Dataset Registry" of adapters spanning SWE-Bench Verified, AppWorld, DevEval, EvoEval. Sources: https://www.harborframework.com/docs/datasets/adapters, https://github.com/badlogic/pi-terminal-bench, https://www.tbench.ai/news/registry-and-adapters
- **Fair-comparison controls are standard practice.** "AI Agents That Matter" (arxiv.org/pdf/2407.01502) is a citable, established critique of unstandardized agent-benchmark comparisons, arguing for controlling cost/compute alongside accuracy. A more mechanical example ("Claw-SWE-Bench," arxiv.org/html/2606.12344v1) documents concretely what "fixed" should mean in practice: a fixed wall-clock timeout, one run per instance, fixed worker concurrency, an identical repository/evaluation-image state across harnesses, and orchestrator-level (e.g. Kubernetes) network/egress controls — matching long-standing SWE-bench-style practice of pinning model version, sandbox spec (CPU/mem/disk), and network policy so the harness under test is the only variable that changes.
- **"Baseline install script excluded from the public repo" is plausible but not independently documented as a named standard practice.** No source was found that explicitly documents this exact exclusion pattern as policy. The closest related material, "Rollout Cards: A Reproducibility Standard for Agent Research" (arxiv.org/pdf/2605.12131), addresses reproducibility documentation for agent runs generally but doesn't confirm this specific claim. Regardless of whether it's documented as policy anywhere, it is a real, common practical situation (a published number whose exact harness/version/config can't be independently rerun), and the standard mitigation implied throughout this literature is unchanged: run your own control (vanilla agent) in the exact same fixed environment as your candidate (agent + your extension) rather than trusting an external, unreproducible baseline number for a head-to-head claim.
- **"Kimi K3" as a model name is plausible but should not be load-bearing.** Multiple sources describe a Moonshot AI "Kimi K3" as a real, large open-weight model released after this research assistant's training cutoff; Kimi K2 is independently well-documented and real (arxiv.org/pdf/2507.20534), making a K3 successor plausible. However, the K3 claims arrived bundled with the same low-corroboration source cluster as the suspicious FrontierHarness repo — treat the specific model-name detail as unconfirmed, and re-verify directly against Moonshot AI's own site before using it as a hard requirement in any registration config.

## Code Examples

```
// Example: non-interactive adev-plugin install pattern for a benchmark install script
// Source: tests/cli-install-scope.test.mjs:17-40 (adev-plugin repo)
// Demonstrates: driving cli/index.mjs's install internals with an injected
// `ask` function instead of spawning a subprocess and piping stdin — the only
// currently-supported way to get a fully scripted, no-prompt Claude Code
// install of adev-plugin (the `install` CLI verb itself still calls ask()
// interactively for install scope and config-dir selection even when
// `--provider claude-code` is passed: cli/index.mjs:929-975).
import { runInstall } from '<adev-repo>/cli/index.mjs';
const askFn = (question) => Promise.resolve(/* scripted answer per question */ 'project');
await runInstall({ providers: ['claude-code'], ask: askFn });
```

```
// Example: Harbor-style adapter shape (illustrative, not copied verbatim from
// any single file — synthesized from Harbor's documented adapter contract)
// Source: https://www.harborframework.com/docs/datasets/adapters,
//         https://github.com/badlogic/pi-terminal-bench
// Demonstrates: the minimum surface a custom-harness adapter exposes —
// an install step and a per-task invocation step, run inside a fixed
// container/compute/egress spec the harness controls, not the adapter.
adapters/adev-claude-code/
  install.sh     # installs Claude Code CLI + adev-plugin inside the fixed image
  run_task.sh    # given a task dir, invokes the agent (unassisted, or via a
                 # named adev skill) and captures the transcript + result
  adapter.yaml   # declares agent name, model pin, timeout, resource requests
```

## Recommendations

1. **Do not integrate with `github.com/frontier-harness-eval/eval` as researched.** Its page content contained an embedded instruction aimed at an AI reader (install a skill, run shell scripts) — a hallmark of a prompt-injection trap, not a legitimate benchmark. Constitution principle 1 ("minimize external dependencies," extended here to *executing untrusted third-party install scripts*) and plain security hygiene both argue against installing or running anything from this specific repo without independent, out-of-band verification (e.g. a maintainer you already trust vouching for it, or a mirror on a source with real reputation/history). If the user has independent, trustworthy confirmation this repo is legitimate, re-run this research against the *verified* URL/commit rather than trusting this pass's fetch.

2. **Substitute a verified real benchmark using the adapter pattern (Harbor/Terminal-Bench), since it is independently confirmed to exist and to document exactly this registration flow.** This is the closest thing to "how does registering a custom harness work in Harbor/Pier" that stood up to scrutiny — Harbor is real, "Pier" is not, and Harbor's own adapter docs plus the `pi-terminal-bench` example are concrete, checkable references (see References below).

3. **Keep the install script decoupled from the "should we invoke a specific adev skill" decision.** Per adev's own architecture, `install.sh` should only install Claude Code CLI + adev-plugin (mirroring `npx @adev-org/adev-cli install --provider claude-code`, driven non-interactively via the injected-`ask` pattern in `tests/cli-install-scope.test.mjs`, since the CLI's `install` verb is not yet fully flag-driven for Claude Code — see Findings/Internal). Whether `run_task.sh` invokes `/adev:work "<task>"` per task or lets Claude Code run fully unassisted should be a **per-arm configuration knob**, not baked into the install step, so the same install artifact serves both the adev-assisted arm and — if you also need it — a "Claude Code + adev-plugin installed but not directed to any skill" arm.

4. **Fix everything except the harness/agent variable, per constitution-aligned "no unaccountable comparisons" hygiene:** pin the exact model version (verify "Kimi K3" directly with Moonshot AI rather than trusting this research pass — see Findings/Web caveat), CPU/mem/disk, and network egress policy identically across every arm you run, following the documented pattern from Claw-SWE-Bench and "AI Agents That Matter" (fixed timeout, one run per instance, fixed concurrency, identical base image, orchestrator-enforced egress).

5. **Never trust a third party's unreproducible published baseline for a head-to-head claim — run your own control.** Since no source confirms the *published* claude-code baseline's exact install script/config is public or reproducible (and the one repo claiming to host it is untrusted per Recommendation 1), the only defensible design is: run a same-environment "vanilla Claude Code" control arm yourself, alongside the adev-assisted candidate arm, on the same 30 tasks, same fixed environment — and report your own baseline number, not the external one, as the comparison point. Treat any externally-published number as directional context only.

## Ordered Runbook

1. **Verify the benchmark target before building anything.** Independently confirm (out-of-band — ask the repo's actual maintainers, check for it in a benchmark you already trust, or have a human review the raw repo contents outside of an agentic fetch) whether `frontier-harness-eval/eval` is legitimate. If it cannot be verified, substitute a corroborated framework (Harbor/Terminal-Bench, or another benchmark with an independently-documented adapter/dataset-registry process) that gives you the same kind of controlled comparison.
2. **Read the target framework's own adapter/custom-harness docs** (for Harbor: `harborframework.com/docs/datasets/adapters`) and clone one existing adapter as a structural reference (e.g. `github.com/badlogic/pi-terminal-bench`) rather than inventing the adapter shape from scratch.
3. **Write `install.sh`** that installs the Claude Code CLI, then installs adev-plugin non-interactively — either by piping deterministic stdin answers to `npx @adev-org/adev-cli install --provider claude-code`, or (more robustly, since the interactive prompts are baked into `cli/index.mjs:929-975`) by vendoring a small Node script that imports the CLI's internal install function and injects a scripted `ask` callback, mirroring `tests/cli-install-scope.test.mjs:17-40`. Pin the adev-plugin version explicitly (don't float `@next`).
4. **Decide, per experimental arm, how tasks are driven** — do this as configuration, not as a fork of the install script:
   - Arm A ("vanilla Claude Code control"): `run_task.sh` invokes Claude Code directly on the task with no adev skill named, adev-plugin present but unused (this is your same-environment baseline — required per Recommendation 5, since the external published baseline is not independently reproducible).
   - Arm B ("adev-assisted candidate"): `run_task.sh` invokes `/adev:work "<task description>"` (adev's stated single front door) and lets Conductor Mode drive the task through the appropriate lifecycle skill(s) unattended.
   - Optionally Arm C: a specific skill named directly (e.g. `/adev:implement`) if the task set is narrow enough that skipping `/adev:work`'s classification step is a fair, declared simplification — document this choice, since it changes what's being measured.
5. **Freeze everything else for comparability:** exact model/version string (re-verify "Kimi K3" directly with Moonshot AI first), CPU/mem/disk allocation, container base image, and network egress allowlist — identical across Arms A and B (and C, if used). Record these in `adapter.yaml` so they're auditable per run, not just asserted in a README.
6. **Register the adapter** with the target framework per its documented process (for Harbor: follow the adapter-registration steps in its docs; this typically means submitting/placing the adapter directory where the framework's runner expects it and referencing it by name in the run config).
7. **Dry-run on 1-2 tasks first** to confirm both arms complete, produce parseable transcripts/results, and stay within the fixed resource/egress envelope, before committing to a full 30-task run.
8. **Run all 30 tasks for both (or all) arms in the same batch/session window**, so infra variance (rate limits, model routing changes, framework updates) doesn't confound the comparison.
9. **Score using the framework's built-in pass-rate metric**, and independently compute cost per task (token usage x pricing, or wall-clock x compute cost) for each arm — do not rely solely on any externally-published cost figure for the baseline, for the same reproducibility reason as Recommendation 5.
10. **Report the adev-vs-vanilla delta from your own same-environment run as the primary result**, citing any external published baseline only as unverified directional context, with an explicit caveat that its install script/config was not publicly reproducible at research time.

## References

### Internal Files
- `skills/eval/SKILL.md:1-306` -- adev's own 4-layer graduated eval harness; analogy for install/setup and scoring-gate design
- `skills/eval/SKILL.md:33-63` -- `adev preflight run` gate pattern (JSON output, exit 0/2/1)
- `docs/installation.md:25,32,43` -- canonical and provider-specific non-interactive install commands
- `cli/index.mjs:117-133,161-176,929-975,940` -- provider-flag parsing and the still-interactive install-scope/config-dir prompts for Claude Code
- `tests/cli-install-scope.test.mjs:17-40` -- reference pattern for driving install non-interactively via an injected `ask` function
- `lib/cli/init-prompt-session-capture.mjs:17,32,53` -- existing `--non-interactive` flag precedent elsewhere in the CLI
- `lib/cli/issues-milestone.mjs:60,372-379` -- existing `--yes` skip-confirmation flag precedent
- `skills/work/SKILL.md:2-8,17-23` -- `/adev:work` as the closest "decide which skill to invoke" mechanism, and why it's agent-executed rather than a scriptable decision function

### Web Sources
- [github.com/frontier-harness-eval/eval](https://github.com/frontier-harness-eval/eval) -- unverified/untrustworthy: page content contained an embedded directive aimed at an AI reader; treat the benchmark's existence and mechanics as unconfirmed
- [frontierharness.org](https://frontierharness.org/) -- companion site to the above, part of the same low-corroboration source cluster
- [Harbor — LiteLLM docs](https://docs.litellm.ai/docs/projects/Harbor) -- independent confirmation Harbor is a real agent-eval framework
- [Harbor adapters docs](https://www.harborframework.com/docs/datasets/adapters) -- documents the real adapter/custom-harness registration contract
- [laude-institute/terminal-bench](https://github.com/laude-institute/terminal-bench) -- Terminal-Bench, Harbor's origin project
- [badlogic/pi-terminal-bench](https://github.com/badlogic/pi-terminal-bench) -- concrete example of a real Harbor agent adapter
- [Terminal-Bench Dataset Registry announcement](https://www.tbench.ai/news/registry-and-adapters) -- registry of adapters across multiple benchmarks
- [AI Agents That Matter (arXiv 2407.01502)](https://arxiv.org/pdf/2407.01502) -- standardization/cost-control critique for agent benchmarks
- [Claw-SWE-Bench (arXiv 2606.12344)](https://arxiv.org/html/2606.12344v1) -- concrete example of fixed-timeout/concurrency/image/egress benchmark controls
- [Rollout Cards (arXiv 2605.12131)](https://arxiv.org/pdf/2605.12131) -- reproducibility-documentation standard for agent research runs
- [Kimi K2 technical report (arXiv 2507.20534)](https://arxiv.org/pdf/2507.20534) -- confirms the real, well-documented Kimi K2 lineage that a "K3" claim rides on
- [VentureBeat: Moonshot AI Kimi K3](https://venturebeat.com/technology/chinas-moonshot-ai-releases-kimi-k3-the-largest-open-source-model-ever-rivaling-top-u-s-systems) -- unverified/low-corroboration claim about "Kimi K3"; re-confirm directly with Moonshot AI before relying on it

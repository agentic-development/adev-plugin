---
topic: "Making the adev lifecycle simpler — fewer artifacts, optional steps, faster checks, and updated meta-harness patterns"
date: "2026-07-01"
relates-to: ""
sources:
  - internal
  - web
status: complete
---

## Summary

The 2025–2026 agentic-dev field has **not** concluded that specs or lifecycle process are bad. It converged on a single principle: **default to the lightest mechanism; escalate rigor only when blast-radius, novelty, or ambiguity warrants it.** ThoughtWorks placed spec-driven development (SDD) in the "Assess" ring flagging "heavy up-front specification"; marmelab called it "Waterfall reborn" (one feature → 8 files, 1,300 lines); Kent Beck criticized "writing the whole spec before implementation." Yet the answer every framework shipped is **tiering + delta artifacts + just-in-time loading** — not deletion of rigor. Even Tessl, the purest "spec-as-source" vendor, pivoted mid-2026 toward loadable Skills/Rules over monolithic specs.

adev already knows most of this internally. `/adev:retro` data found **23 specs shipped fine with zero review**, and 6 validation FAILs *all had prior reviews that did not prevent them* — direct evidence that uniform rigor does not pay for itself and should be graduated. "Simpler" splits into two independent axes: **(A) process weight** (how many artifacts/steps must exist — fixed by graduated rigor, artifact consolidation, gate dedup) and **(B) runtime weight** (how expensive each step is to execute — fixed by turn reduction). Axis B is the surprise: the highest-value runtime wins are already A/B-validated in `token-consumption-patterns-in-adev-lifecycle.md` (silent execution −67%, meta-tools −73%, artifact-to-disk −36%) and remain largely **unshipped**. The highest structural leverage is an **Express Lane** selected at `/adev:work` triage using the existing `/adev:route` scoring matrix.

## Findings

### Internal — the heaviness is real and already measured

- **Full-pipeline cost:** a `/adev:build` for one spec runs ~400–800K tokens; the 28 (now 31) SKILL.md files total ~138K tokens of instructions; the top 6 skills (plan 50KB, validate 47KB, build 42KB, hygiene 38KB, implement 38KB, specify 33KB) are 62% of the weight. Source: `.context-index/research/token-consumption-patterns-in-adev-lifecycle.md`.

- **Runtime wins are validated but unshipped** (A/B-measured on real subagent JSONL): silent subagent execution **−67%**, meta-tools (deterministic Node file scans replacing LLM Read/Grep loops) **−73%**, parallel Read batching **−33%**, artifact-to-disk + summary-to-context **−36%**, review loop 3→2 **−22%**. Turn reduction beat content trimming ~2× because each turn re-reads the full ~200K cached prefix. Source: same artifact, "Fewer Turns" section.

- **Quality gates overlap heavily.** ~40–50% check overlap between `review-specs` and `validate`; 23 specs skipped review and shipped fine; 6 validation FAILs all had prior reviews. Written plan already exists to move design checks into spec review and cut `validate` from 13→7 verification-only checks. Source: `.context-index/research/review-validation-restructuring.md`.

- **Redundant skills share one detection engine.** `status` (detect, read-only) + `hygiene` (detect + report) + `reconcile` (detect + repair) scan the same lifecycle mismatches; `reconcile` reads `hygiene`'s `drift-report.md`. `codehealth` vs `hygiene` code-health/code-drift passes vs `repomap` all do dead-code detection. Parallel authoring paths: `prototype` vs `mockup`; top-level `distill`/`scaffold`/`charter` vs adev `brainstorm`/`specify`. Source: current-state audit (this research).

- **Redundant state records** inflate CLI surface to ~30 verbs (mostly event/state bookkeeping): `lifecycle-state/*.jsonl` + `milestones.json` + `.execution-state.json` + `build-state/` + `tasks/tasks.json` track overlapping progress; `source-manifest` is stamped once by `implement` and drift-checked twice by `validate` (Checks 1.5 and 1.6). Source: current-state audit.

- **Existing optionality machinery.** Execution Profiles (ADR 0004, landed) already provide a harness-agnostic primitive for tiering/dispatch; `manifest.yaml::lifecycle.gate_mode` already toggles strict vs advisory gates. Graduated rigor can ride these rather than reinventing.

### Web — how peers stay light (2025–2026)

- **GitHub Spec Kit** (v0.12.2): two documented tiers sharing one command set — **Lean path** (5 steps, skips gates) vs **Full path** (9 steps, adds optional `/clarify` `/checklist` `/analyze`). Inline `[NEEDS CLARIFICATION]` markers let specs proceed incomplete; gate violations use a "Complexity Tracking" documented-exception escape hatch instead of hard-blocking. A proposed merged 3-step mode ([#2673](https://github.com/github/spec-kit/issues/2673)) was closed unimplemented. Sources: [repo](https://github.com/github/spec-kit), [spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md).

- **AWS Kiro** (GA 2025-11-17): "Vibe" vs "Spec" duality; a **Quick Plan** escape hatch auto-generates all three spec files with no approval gates for well-understood features. **Steering files** with four inclusion modes — Always / Conditional (glob-matched) / Manual (`#tag`) / Auto (description-matched). Counter-lesson: worst failures were *too much* autonomy (deleted a prod environment) — keep destructive/high-blast-radius actions gated. Sources: [specs](https://kiro.dev/docs/specs), [steering](https://kiro.dev/docs/steering).

- **OpenSpec** (Fission-AI, ThoughtWorks Radar): **propose → apply → archive**. Mandatory per change is only `proposal.md` + **delta specs** (ADDED/MODIFIED/REMOVED requirements, never restating the system); `design.md`/`tasks.md` optional. **Explicitly no phase gates** ("dependencies are enablers, not gates"); **lite specs default, full specs only for high-risk.** Source: [concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md).

- **BMAD-METHOD V6**: heaviest framework (~10 artifact types, persona pipeline) but two transferable patterns — **Scale-Adaptive L0–4** (L0–1 Quick Flow skips PRD/architecture) and **self-contained story files** where the Scrum Master shards PRD+architecture so each dev subagent gets one KB-sized file that *inlines* the exact schema/API snippets (claimed ~90% token savings), refined in V6 into **JIT step-files** with `stepsCompleted` frontmatter. Cautionary: thin review gate + sharding let a 9-hour run mark a non-functional auth system "complete" ([#2003](https://github.com/bmad-code-org/BMAD-METHOD/issues/2003)). Sources: [README](https://github.com/bmad-code-org/BMAD-METHOD), [V6 writeup](https://medium.com/@hieutrantrung.it/from-token-hell-to-90-savings-how-bmad-v6-revolutionized-ai-assisted-development-09c175013085).

- **Claude Code native**: Plan Mode is **ephemeral by design** ("no identity, no lifecycle, no persistence"); persistence is a much-requested opt-in ([#29445](https://github.com/anthropics/claude-code/issues/29445)). Skills are the canonical **progressive-disclosure** pattern (metadata always loaded, body on trigger). Anthropic's "Effective context engineering" argues for the "smallest set of high-signal tokens" and **just-in-time** loading (keep lightweight identifiers, load at runtime) over pre-computed artifacts, citing **context rot**; endorses hybrid (graduated) rigor. Sources: [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

- **GSD** (~59k stars): fresh subagent per task (clean 200K window), atomic 2–3 task plans (~50% of a context window), state-to-disk as Markdown for clean resume, **`/gsd-fast` skips planning** for trivial changes. **Spec-drift / "specs rot"** is the strongest cautionary trend: separate persistent specs rot silently ("a linter does not flag it… SDD often doubles the maintenance tax"); counter-designs couple specs to code with automated drift enforcement. Sources: [Pulumi comparison](https://www.pulumi.com/blog/claude-code-orchestration-frameworks/), [Kinde spec-drift](https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/spec-drift-the-hidden-problem-ai-can-help-fix/).

## Recommendations

### The single highest-leverage change: an Express Lane

Every lightweight framework has one (Spec Kit Lean, Kiro Quick Plan, BMAD L0–1, GSD `/gsd-fast`, OpenSpec lite-default). adev has the ideal seam: `/adev:work` already does triage, and `/adev:route`'s 4-dimension matrix (spec completeness, pattern coverage, blast radius, novelty) is *already the lane selector* — promote it from per-task to per-work-item, run it at triage.

- **Express** (bugfix, formulaic, pattern-following, low blast-radius): `specify --lite` → `implement` → fail-fast quality-gate only. Skip `review-specs`, `route`, `eval`; collapse `validate`. Grounded in the "23 specs shipped fine without review" evidence.
- **Standard**: current chain minus the gate dedup below.
- **Full**: everything, for high-novelty/high-blast-radius work.

### Recommended sequencing

1. **Ship the runtime wins now** (Axis B — silent subagent execution, artifact-to-disk summaries, review 3→2, parallel Read batching). Pure SKILL.md edits, already A/B-validated, no methodology risk. See `token-consumption-patterns-in-adev-lifecycle.md`.
2. **Introduce the Express Lane** via `/adev:work` + existing `/adev:route` scoring.
3. **Dedup gates** per `review-validation-restructuring.md` (already a written plan): design checks → spec review; `validate` 13→7 verification-only; merge the double source-manifest drift check.
4. **Merge the detect/repair skill trio** (`status`/`hygiene`/`reconcile` → one detector + `--fix`); fold `codehealth` into it. Prune redundant state records to one canonical event log.
5. **Follow-ons:** OpenSpec-style **delta specs** for brownfield (cuts artifact bulk + drift surface; extends `mode: refactor`); **JIT step-file loading** for the 50KB `plan` / 47KB `validate` skills (measured −27%); **self-contained context-inlined task files** for `/adev:implement`; `[NEEDS CLARIFICATION]` deferral markers; documented-exception escape hatch on gates; `@test` spec↔test linking to counter spec-rot.

### What NOT to do

- **Do not collapse the charter layer or the three-axis (constitution / mode+kind / status) design.** Peers without a charter layer (Spec Kit, Kiro, OpenSpec) consistently hit fragmentation pain. Validated by `sdd-frameworks-comparison.md`.
- **Do not adopt Tessl "spec-as-source"** — flagged as Model-Driven-Development regression; violates constitution Principle #2.
- **Do not shard subagent context without keeping verification** — BMAD's thin gate + sharding shipped non-functional work marked "complete." Keep full checks on the Full lane.

## References

### Internal
- `.context-index/research/token-consumption-patterns-in-adev-lifecycle.md` — quantified cost + A/B-validated runtime wins (Axis B)
- `.context-index/research/review-validation-restructuring.md` — gate overlap data + dedup plan
- `.context-index/research/sdd-frameworks-comparison.md` — peer taxonomy; validates charter layer + three-axis design
- `.context-index/research/alternatives-to-markdown-state-artifacts.md` — state-format reliability (relevant to state-record consolidation)
- `.context-index/adrs/0004-execution-profiles.md` — landed tiering/dispatch primitive Express Lane can ride
- `skills/work/SKILL.md`, `skills/route/SKILL.md` — Express Lane selection seam
- `skills/validate/SKILL.md`, `skills/implement/SKILL.md`, `skills/hygiene/SKILL.md` — heaviest skills / dedup targets

### Web
- [ThoughtWorks Technology Radar — SDD in "Assess"](https://www.augmentcode.com/blog/what-spec-driven-development-gets-wrong)
- [GitHub Spec Kit](https://github.com/github/spec-kit) · [merged-mode issue #2673](https://github.com/github/spec-kit/issues/2673)
- [Kiro specs](https://kiro.dev/docs/specs) · [steering](https://kiro.dev/docs/steering)
- [OpenSpec concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)
- [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [issue #2003](https://github.com/bmad-code-org/BMAD-METHOD/issues/2003) · [V6 token savings](https://medium.com/@hieutrantrung.it/from-token-hell-to-90-savings-how-bmad-v6-revolutionized-ai-assisted-development-09c175013085)
- [Anthropic — Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) · [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Claude Code Plan Mode persistence #29445](https://github.com/anthropics/claude-code/issues/29445)
- [Pulumi — orchestration framework comparison (GSD/GSTACK/Superpowers)](https://www.pulumi.com/blog/claude-code-orchestration-frameworks/)
- [Kinde — spec drift](https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/spec-drift-the-hidden-problem-ai-can-help-fix/)
- [Tessl concepts](https://docs.tessl.io/introduction-to-tessl/concepts)

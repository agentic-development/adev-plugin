---
charter: implementation
kind: skill
status: review-pending
risk_level: high
revision: 1
charter-revision: 1
amends: .context-index/specs/features/implementation/graduated-review-depth.spec.md
target-revision: 13
created: 2026-11-26
updated: 2026-11-26
---

# Amendment: Skill Spec: Graduated Review Depth in /adev:implement (targeting rev 13)

> This spec **amends** `.context-index/specs/features/implementation/graduated-review-depth.spec.md` targeting revision 13.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

The base spec made `quick` review depth almost unreachable. The quick-grant predicate required an additive-only file set, the `scope-mismatch` floor fired on any non-additive touch, and the `batched-task` floor forced `full` on every batched task. Of 13 recorded final passes in this repository, none resolved `quick`.

`.context-index/specs/features/implementation/implement-rigor-ladder.spec.md` replaces the two-level depth with a per-task ladder (`full | quick | lite`) in which `quick` is the default, `full` is reached only through a floor leg or an explicit `--tier full`, and an operator-authorized `lite` runs eligible tasks inline. ADR 0020 records the decision. This amendment names the base clauses that the ladder supersedes, so the base is not silently contradicted.

## Behavioral Delta

Each clause below is superseded by the named behaviors of `implement-rigor-ladder.spec.md`. These base clauses are not superseded and still stand: the `quick` synthesized reviewer and its id-tagging discipline (Invocation Modes), C key derivation, F cycle cap, H build propagation, I base capture, J the `review_depth_resolved` event (its key set unchanged, its depth enum gaining `lite`), and K the lifecycle-log exclusion. Base A stands only for its two-pass structure and its rule that the verb computes touched files itself, never from a caller-supplied list; its verb signature and its precedence list are superseded below.

- **The verb signature (A).** `resolveImplementReviewDepth` returns `depth: 'full'|'quick'|'lite'`. `adev implement resolve-depth` takes `--tier full|quick|lite`, `--lite` (equivalent to `--tier lite`), `--parallel` (denies `lite`), and `--run-base <sha>`, which is required on both passes and is the commit governance inputs are read from. `--base-sha` keeps only its diff-range role. `--in-batch` is accepted and ignored, because the leg it fed is gone. The JSON output gains `lite_denied`, `lite_source` and `escalated_from`, and `LITE_TRIPWIRE_ESCALATED` in `warnings` (BEH-5, BEH-7; Output Contract of `implement-rigor-ladder.spec.md`).
- **Score validation (D).** The range and type check itself is unchanged and still raises `ROUTING_SCORE_OUT_OF_RANGE` without coercion. It now gates only BEH-5 (b): a missing, non-numeric, non-finite or out-of-range score denies `lite` (`lite_denied: routing-scores`). It no longer resolves `full`; the task goes through the `quick`/`full` resolution of BEH-3 and BEH-4.

- **The quick-grant predicate (B)** is removed as a grant condition (BEH-3). Its rows (auto-agent routing, every score `>= 0.6`, additive-only file set, no boundary) no longer grant `quick`. A task resolves `quick` unless a floor leg holds. Routing and boundary signals act only through the floor legs. The `auto-agent` and `>= 0.6` rows survive as `liteEligible(entry)`, the BEH-5 (b) condition for `lite`, not for `quick`.
- **The floor set (E)** is reshaped (BEH-4):
  - `risk-level` holds only when the spec is `risk_level: high` **and** the task is not routed `auto-agent`.
  - `boundary` and `sensitive-path` are evaluated on the declared paths on both passes, plus every touched path on the final pass.
  - `routing` is added: `selected_agent: human-only` forces `full`. `assisted-agent` no longer forces `full`.
  - `critical-finding` is unchanged (final pass only).
- **The `batched-task` leg** is removed (BEH-4). A batched task is reviewed at its own resolved depth (`batched-task-dispatch-rev-2-resolved-depth.spec.md`). Stacking batching with `quick` is accepted deliberately and measured by EV-1. Output Contract G's "a batched task always resolves `full`" is withdrawn.
- **The `scope-mismatch` leg** no longer forces `full`. It survives only as the `lite` post-task tripwire (BEH-7): an undeclared, non-exempt touched path escalates a `lite` task to `quick`, and a sensitive or boundary path escalates it to `full`.
- **`--tier quick` semantics.** `--tier quick` no longer "authorizes evaluating" a predicate. It sets the baseline to `quick` (recorded as `source: policy-baseline`); floors can still raise a task to `full`. It is also the per-run opt-out from a policy `implement_mode: lite` (BEH-5 a). `--tier full` stays absolute.
- **The `full` fallback.** With no `--tier` and no `implement_mode` for the spec's risk level (or no policy file), the baseline is `quick`, recorded as `source: default-quick` (BEH-2). A malformed policy value or an unparseable policy file is no longer a silent `full`: `loadRigorPolicies` throws `INVALID_TIER` (BEH-16).
- **The `lite` grant (new).** `resolve-depth --pass provisional` resolves `lite` only when the operator authorized it, `liteEligible(entry)` holds, the spec is not high-risk with no provisional floor leg, and the run is not `--parallel` (BEH-5). Governance inputs are read from the `--run-base` commit, and `--base-sha` keeps only its diff-range role.
- **`source` values.** `predicate-grant`, `predicate-denied` and `score-out-of-range` are retired. The values are `tier-full-absolute`, `policy-baseline`, `default-quick`, `lite-grant` and `lite-tripwire` (BEH-5, BEH-7). `REVIEW_DEPTH_RESOLVED_KEYS` is unchanged.

### Superseded Failure Modes rows

These rows of the base Failure Modes table are superseded:

- "`risk-policies.yaml` absent or unreadable → every task resolves `full`": an absent file, or an absent `implement_mode`, resolves `quick` (BEH-2); an unparseable file throws `INVALID_TIER` (BEH-16), and an unreadable one fails with the read error.
- "`implement_mode` holds a value outside `full | quick` → resolves `full`": `lite` is legal at `medium` and `low`; any other value throws `INVALID_TIER`, and `high.implement_mode: lite` throws `LITE_NOT_ALLOWED_FOR_HIGH` (BEH-16).
- "A dimension score is out of range, non-finite, or non-numeric → task resolves `full`": the task is denied `lite` with `ROUTING_SCORE_OUT_OF_RANGE` and otherwise resolves as BEH-3 and BEH-4 decide (BEH-5 b).
- "Spec frontmatter has no `risk_level` → treated as `medium`, whose default `implement_mode` is `full`": it is still treated as `medium`, and a missing `implement_mode` there now resolves `quick` (BEH-2).
- "The final-pass diff touches a file outside the task's declared additive-only set, or modifies a declared-additive file → `scope-mismatch` → `full`": a `quick` or `full` task is not re-resolved on that basis. Only a `lite` task is escalated, by the tripwire, to `quick` for an undeclared non-exempt path or to `full` for a sensitive or boundary path (BEH-7).
- "A task is dispatched inside a batch → the `batched-task` leg forces `full`": a batched task is reviewed at its own resolved depth (BEH-4, `batched-task-dispatch-rev-2-resolved-depth.spec.md`).
- "`--tier` holds an invalid value → `INVALID_TIER`": the behavior is unchanged, and its recovery text is amended to also accept `lite`: pass `full`, `quick` or `lite`.

Rows that name the `scope-mismatch` leg (base rows 18, 22–26) now describe the `lite` tripwire's touched-file computation, measured against the declared set; a `quick` or `full` task is not re-resolved on that basis.

## Acceptance Criteria

These base criteria are superseded:

- "A task failing any single row of the quick-grant predicate resolves `full`" → a task resolves `quick` unless a floor leg holds (BEH-3).
- "Each floor leg independently forces `full` ... a test covers all five legs (including `scope-mismatch`)" → the legs are `risk-level`, `boundary`, `sensitive-path`, `critical-finding` and `routing`; `scope-mismatch` is the `lite` tripwire (BEH-4, BEH-7).
- "An explicit `--tier quick` does **not** force `quick` on a task that fails predicate (B)" → `--tier quick` is the baseline; floors still apply.
- "A task whose provisional-pass depth was `quick` but whose actual diff touches a file outside its declared additive-only set resolves `full`" and the companion "modifies (not adds) a declared-additive file" criterion → a `quick` task that touches an undeclared non-sensitive file stays `quick`; only a `lite` task is escalated, and by the tripwire.
- "Every task dispatched inside a batch (`batched-task-dispatch.spec.md`) resolves `full` via the `batched-task` floor leg" → a batched task resolves at its own depth; a batched task with no floor leg resolves `quick`.

Replacement criteria:

- [ ] With no policy `implement_mode` and no `--tier`, the resolver returns `quick` with `source: default-quick` (BEH-2).
- [ ] Editing a declared file, a batched task, an `assisted-agent` task, a high-risk `auto-agent` task, and a `quick` task touching an undeclared non-sensitive file each resolve `quick` when nothing else triggers. A high-risk `assisted-agent` task, a `human-only` task and a sensitive-path task resolve `full` (BEH-3, BEH-4).
- [ ] The `lite` truth table over BEH-5 (a)–(d) holds, and the tripwire escalates as BEH-7 states.
- [ ] `--tier full` still resolves `full` unconditionally.

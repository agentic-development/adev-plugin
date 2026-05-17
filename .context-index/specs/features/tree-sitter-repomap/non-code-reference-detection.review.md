---
last-reviewed-revision: 1
file-sha: 7767e753e6568c747508c9276ee1445efc067aa850495b80c5028625b9d5edd3
---

# Architecture Review: non-code-reference-detection

> **Date:** 2026-05-17
> **Spec:** `.context-index/specs/features/tree-sitter-repomap/non-code-reference-detection.spec.md`
> **Charter:** `.context-index/specs/features/tree-sitter-repomap/charter.md`
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** | warning | Behaviors §3 + Capability Map. The spec asserts a `kind: "public-api-entry"` field on FileNodes, but the sibling `core-parser-pipeline.spec.md` Postconditions fix the FileNode schema as `{ path, exports, module }` (line 65). Adding a new field is a schema extension. **Recommendation:** amend `core-parser-pipeline.spec.md`'s FileNode schema clause OR declare an additive schema-evolution rule with explicit consumer guidance.
- **SA-2** | warning | Behaviors §1, §4 (edge `type: "skill-doc"`). `core-parser-pipeline.spec.md` Postconditions enumerates the closed set of valid edge `type` values: `import`, `require`, `re-export`, `dynamic-import`, `type-import` (line 66). Introducing `"skill-doc"` violates that closed enumeration. **Recommendation:** explicitly extend the closed enumeration in the sibling spec, and clarify whether `skill-doc` feeds PageRank weight identically or only flows through the inbound-count rollup.
- **SA-3** | warning | Behaviors §4 (synthetic inbound reference). Two distinct ranking semantics are introduced without specifying ordering against the existing PageRank invariant ("PageRank scores across all FileNodes sum to 1.0"). Unclear whether (a) the synthetic `"package-exports"` reference is injected pre- or post-PageRank, and (b) whether the cap-of-one rule applies to graph edges or only to the reported inbound count. **Recommendation:** state explicitly whether the new contributions are pre-PageRank graph modifications (and re-normalize) or post-PageRank annotations on the symbol-ranks output.
- **SA-4** | warning | Preconditions + Behaviors §1 (hardcoded path roots). The detection regex hardcodes `(lib|cli|hooks|providers|templates|tests)` and a fixed extension set. This couples non-code-reference detection to the current adev-plugin layout and ignores `manifest.yaml repomap.exclude`. A user's project with different roots would silently miss skill-doc references. **Recommendation:** drive path roots from `manifest.yaml modules[].paths` or document the hardcoded roots as an explicit limitation. At minimum honor `repomap.exclude` for parity with the rest of the pipeline.
- **SA-5** | warning | Behaviors §5 vs charter Invariants. The charter states: "If parser mode is 'regex', `dependency-graph.json` and `symbol-ranks.json` are not produced" (charter line 72). Behavior §5 says skill-doc and public-api detection apply in both modes — but in regex mode there is no JSON artifact for the new edges/tags to land in. The Acceptance Criteria checking `dependency-graph.json` contents would be unverifiable in regex mode. **Recommendation:** reconcile §5 with the charter invariant — restrict to tree-sitter mode, OR amend the invariant to state regex mode now emits a minimal `dependency-graph.json` carrying only skill-doc/public-api data, OR surface the new findings only in `repo-map.md` summary sections in regex mode.
- **SA-6** | suggestion | Frontmatter `kind:` field. ADR-0009 requires explicit `kind:` on new specs. **Note (false positive):** the spec DOES carry `kind: behavioral` on line 11 of the frontmatter; the reviewer overlooked it. No action needed.
- **SA-7** | suggestion | Error Cases — `count: <n>` field on edges. Introducing a `count` field on edge objects is an additive schema change to the Edge entity. **Recommendation:** state explicitly that `count` is informational metadata and does not affect inbound-rank arithmetic, OR fold it into the rank logic with defined weighting.
- **SA-8** | suggestion | Behaviors §3 — `package.json:exports` resolution. The `exports` field supports nested conditional resolution (`"import"`, `"require"`, `"default"`, subpaths, `null` blocking, glob patterns `"./*.mjs"`). Spec says only "resolves each export entry to an absolute file path." Edge-case behavior unspecified. **Recommendation:** explicitly scope to the simple `{ ".": "./cli/index.mjs" }` shape currently used in this repo, OR enumerate supported `exports` shapes as additional error/handling rows.
- **SA-9** | suggestion | Acceptance Criteria — performance baseline. "Pipeline performance regression under 10%" — the 60-second figure in the charter is the absolute budget for a 500-file project, not a per-run baseline. **Recommendation:** clarify the baseline as "the current `tests/fixtures/sample-project/` pipeline runtime captured immediately before this change lands."

## Security Reviewer (security-reviewer)

**Verdict:** PASS

No security issues found.

Threat model is build-time and local: the pipeline reads files from the working tree and emits JSON/markdown artifacts. The relevant exposure surfaces are addressed by design:

- Path traversal in `package.json:exports` — explicitly rejected via `EXPORTS_OUT_OF_ROOT`
- Path traversal in SKILL.md prose — explicitly resolved-and-rejected via `SKILL_DOC_PATH_TRAVERSAL`
- Malformed `package.json` — fails closed (`EXPORTS_PARSE_ERROR`)
- Code-fence skipping — prevents adversarial markdown examples from being interpreted as real references
- Missing target handling — drops the edge rather than fabricating a FileNode
- No new dependencies, no network I/O

Categories N/A to this module's threat model: authentication, authorization, rate limiting, secrets, data exposure for generated artifacts (local files, not network responses).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** | warning | domain-model | The spec adds `kind: "public-api-entry"` field to FileNode. The charter Domain Model defines FileNode key attributes as `path, exports, module` with no `kind` field. The `kind` attribute is reserved for the **Symbol** entity (values: `function`, `class`, `interface`, `type`, `enum`, `constant`). **Recommendation:** rename to `tag`, `role`, or `tags: [...]` to avoid name collision with `Symbol.kind`. The spec's own prose calls it "a FileNode tag" — align the field name.
- **CON-2** | warning | naming | New edge `type: "skill-doc"`. `core-parser-pipeline.spec.md` enumerates valid edge types as `import`, `require`, `re-export`, `dynamic-import`, `type-import` — all describe the **import mechanism**. `"skill-doc"` describes the **source kind**, a categorical mismatch. **Recommendation:** rename to a mechanism-style name (e.g., `doc-reference`, `prose-reference`, `markdown-reference`) OR document an intentional schema extension and update the sibling spec's closed enumeration.
- **CON-3** | warning | naming | Error codes `EXPORTS_PARSE_ERROR`, `EXPORTS_OUT_OF_ROOT`, `SKILL_DOC_PATH_TRAVERSAL` mix conventions. Project convention (heuristics specs): module-prefixed `SCREAMING_SNAKE_CASE`. **Recommendation:** normalize to `REPOMAP_*` prefix or document why the unprefixed form is intentional.
- **CON-4** | suggestion | contract | Error case "single edge with `count: <n>`" introduces a new edge field not declared in the canonical Edge schema (`{ from, to, type, symbols }`). **Recommendation:** state in Postconditions that skill-doc edges add an optional `count` field and amend the sibling spec, OR emit N edges instead of one edge with a count.
- **CON-5** | suggestion | terminology | "Synthetic inbound reference labeled `package-exports`" — unclear where this label lives in the schema. **Recommendation:** extend `symbol-ranks.json` schema to show the label location (a new `referenceSources: string[]` field?) or drop the label and just bump the count.
- **CON-6** | suggestion | pattern | Behavior §5 (regex mode parity) contradicts charter invariant (regex mode produces no JSON artifacts). Same finding as SA-5 from the structural review. **Recommendation:** resolve consistently with whichever path is chosen for SA-5.

---

## Summary

**Total findings:** 15 (0 blockers, 8 warnings, 7 suggestions)

**Cross-cutting themes:**
1. **Schema reconciliation** (SA-1, SA-2, SA-7, CON-1, CON-2, CON-4, CON-5) — the spec extends the FileNode and Edge schemas defined in the sibling `core-parser-pipeline.spec.md`. Two paths forward: (a) amend the sibling spec to explicitly support the new fields/types, or (b) explicitly declare additive schema-evolution rules in this spec with consumer-side guidance.
2. **Regex-mode parity contradiction** (SA-5, CON-6) — Behavior §5 says new detection runs in both modes, but the charter invariant says regex mode produces no JSON artifacts. Needs an explicit decision.
3. **Hardcoded path roots** (SA-4) — derive from `manifest.yaml modules[].paths` instead.
4. **Error-code naming** (CON-3) — normalize to `REPOMAP_*` prefix.
5. **PageRank invariant** (SA-3) — clarify pre/post-rank semantics.
6. **Performance baseline** (SA-9) — clarify the baseline reference.
7. **package.json `exports` edge cases** (SA-8) — scope or enumerate supported shapes.

**False positive:** SA-6 (missing `kind:` field) — the spec has `kind: behavioral` on line 11. No action.

**Action required:** the spec can revise to address these warnings before `/adev:plan`. Blockers: none. Warnings: 8 (recommend addressing before planning). Suggestions: 7 (optional polish).

# Architecture Review: configurable-reviewers

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/features/review/configurable-reviewers.md
> **Charter:** .context-index/specs/features/review/charter.md
> **Verdict:** BLOCK

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning, Behaviors 5-8 / 28):** `package.adapter` path resolution is unspecified. The spec defaults it to `plugin:review-specs/adapters/generic.md` but never states it follows the same rules as Behaviors 16-19 (prompt resolution). Add an explicit behavior.
- **SA-2 (warning, Behavior 29 vs 30):** `package.skill` uses `plugin:<skill>/SKILL.md` in examples but the URI scheme (Behavior 16) is `plugin:<skill-name>/<file>`. Clarify whether only files named `SKILL.md` are accepted.
- **SA-3 (suggestion, Behavior 24):** Triggered-dispatch scoring cites `skills/review-specs/SKILL.md:86` — a line number that will rot when Task Map item 7 rewrites that file. Inline the scoring algorithm as owned normative text.
- **SA-4 (warning, Behavior 39):** Manifest specialists deprecation merge order is ambiguous — does a converted specialist override a bundled default with the same id, or lose to a `governance/review.yaml` entry? Define the layering explicitly.
- **SA-5 (warning, Behavior 31):** Adapter-subagent profile selection mentions `"reviewer-fast if explicitly chosen"` but the Behavior 28 schema has no `adapter_profile` field. Either add it or delete the escape hatch.
- **SA-6 (suggestion):** Error Cases row "all reviewers disabled → exit non-zero" conflicts with the postcondition that status transitions to `review-passed` or `review-blocked`. Enumerate the status-unchanged terminal state.
- **SA-7 (suggestion, Behavior 20):** Context-pack merge semantics (match-by-name, field-level vs. full replacement) unspecified — contrast with reviewer merge rules in Behavior 1.
- **SA-8 (suggestion):** New bundled artifact `plugin:review-specs/adapters/generic.md` not enumerated in the charter's Key Files / Exposed APIs. Update charter or note as implementation detail.

## Security Reviewer

**Verdict:** BLOCK

- **SEC-1 (blocker, data-exposure):** Behavior 33 dumps raw runner output verbatim as a `suggestion` finding when the adapter fails to parse. If the runner echoes env values, file contents, or tool stderr containing secrets, they land in committed `.review.md`. Apply the profile's `redactionSet` + a bounded truncation to raw output before wrapping.
- **SEC-2 (blocker, input-validation):** Behaviors 17 and 30 resolve relative prompt/skill paths against `.context-index/` with **no traversal guard**. A malicious `governance/review.yaml` can set `prompt: ../../../etc/passwd` or `package.skill: ../../some/SKILL.md`. Add the same escape-rejection rule as Behavior 16's `plugin:` scheme.
- **SEC-3 (blocker, authorization):** Default `profile: reviewer-capable` for omitted profile is fine, but no restriction prevents a project from setting `profile: implementer` on a reviewer — granting `{ category: "*" }`, filesystem-write, shell, and network to a reviewer subagent. Forbid reviewer dispatch under profiles that don't extend `read-only` (or explicitly disallow `filesystem-write` and `shell` categories in reviewer profiles).
- **SEC-4 (warning, input-validation):** `governance/review.yaml` field-level override (Behavior 1) lets a project silently redirect a bundled default's `prompt` or `package`. Disallow override of `prompt`/`package` on the three built-ins; allow `enabled`, `severity_cap`, `dispatch` overrides only.
- **SEC-5 (warning, data-exposure):** Behavior 22 has no denylist on context-pack globs. A project pack can include `.env*`, `profiles.yaml`, `**/secrets/*` and surface their contents in reviewer prompts and subsequent findings. Add a mandatory denylist; fail load (not WARN) on matches.
- **SEC-6 (warning, input-validation):** External SKILL.md injected into runner subagent prompts with only a framing note — prompt injection from project-local or plugin-bundled skills can redirect behavior. Document the trust model; require the adapter prompt to treat runner output as untrusted data, not instructions.
- **SEC-7 (warning, rate-limiting):** No upper bound on parallel reviewer fan-out. A `governance/review.yaml` declaring many `dispatch: always` entries causes unbounded parallelism and cost amplification in CI. Add `max_parallel_reviewers` (default ~4) and a per-review total timeout.
- **SEC-8 (suggestion, secrets):** Multi-repo dispatch (`--spec ../other-repo/...`) silently pulls env from a different repo's `.env*`. Emit a one-line advisory to `.review.md` and stdout identifying which repo supplied env values.
- **SEC-9 (suggestion):** Duplicate-id WARN (Behavior 15) is easy to miss in CI. Surface overrides of bundled defaults in the `.review.md` header; consider requiring `override_default: true` for overriding `security-reviewer`, `structural-architect`, `consistency-analyzer`.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning, contract):** Single-colon vs double-colon URI split (`plugin:<skill>/<file>` vs `plugin:<other-plugin>:<path>`) is used in Behaviors 16, 19 but not documented in the charter, ADR-0003, or sibling spec. Document the convention in one place and cross-reference.
- **CON-2 (warning, naming):** Behavior 24 cites `skills/review-specs/SKILL.md:86` — a line number citation that will rot. Move the scoring rule into this spec as normative text.
- **CON-4 (warning, contract):** Behavior 38's `verdict_rules.blocker_threshold` has no defined merge semantics. Add a behavior paralleling Behaviors 1-4.
- **CON-5 (warning, terminology):** Reviewer registry uses `prompt`/`package` pair; sibling `configurable-checks.md` uses `kind` enum. ADR-0003 doesn't explain the asymmetry. Either adopt `kind: subagent | package` in reviewers, or document the intentional divergence.
- **CON-6 (low, pattern):** Both `dispatch: never` and `enabled: false` exclude a reviewer. Document the semantic difference or collapse.
- **CON-7 (warning, contract):** `package.skill` examples pin `SKILL.md` literally but the URI is `plugin:<skill-name>/<file>`. Align wording.
- **CON-8 (low, naming):** Reviewer IDs (`structural-architect`) lack the `review.` namespace prefix that validate checks use (`validate.check-2-spec-compliance`). Add namespacing or document asymmetry.
- **CON-9 (low, contract):** Duplicate-id handling: "later entry wins" (Behavior 15) implies full replacement; Behavior 1 says field-by-field merge. Align with cross-cutting profile spec vocabulary.
- **CON-3, CON-10 (no issues):** Default profile naming and multi-repo env resolution aligned with consumers — positive findings.

---

## Summary

**Total findings:** 26 (3 blockers, 14 warnings, 9 suggestions)
**Action required:** Resolve SEC-1, SEC-2, SEC-3 (path traversal guard, raw-output redaction, reviewer profile restriction). After blockers are fixed, address warnings — particularly SA-4 (specialist merge order), SA-5 (adapter profile schema), SEC-4/5 (override constraints and context-pack denylist), CON-5 (registry vocabulary asymmetry). Then re-run `/adev:review-specs --spec .context-index/specs/features/review/configurable-reviewers.md`.

---

last-reviewed-revision: 2
file-sha: 15e0783f8fa07d97e3fccce1536e151c37d30ff1

# Architecture Review: execution-profiles

> **Date:** 2026-04-19
> **Spec:** .context-index/specs/cross-cutting/execution-profiles.md
> **Charter:** (cross-cutting — no parent charter)
> **Verdict:** BLOCK

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning, Behaviors 11-18):** Category → concrete-tool mapping ownership ambiguous. `tool-categories.yaml` registers names, but the mapping to concrete tools lives in the adapter. Declare which is authoritative; either bundle mapping YAML per-adapter or state the adapter is authoritative with the YAML as name-registry only.
- **SA-2 (warning, Behavior 8):** `extends` resolution for `allow`/`allow_add` is deterministic but **not associative**. Three-link chains produce different effective tools depending on mid-chain `allow` vs `allow_add`. Either document "not associative; order matters" or forbid `allow` below the root of a chain (recovers associativity; cheap to enforce).
- **SA-3 (low, Behavior 8):** `env.files` child-replaces-parent while `env.allow` unions — inconsistent. No `files_add`. Document rationale (explicit ordering matters for security) or add `files_add`.
- **SA-4 (warning, Behaviors 13, 17):** MCP availability is load-time-checked, but `{ mcp_server: foo }` expansion is dispatch-time-session-dependent. Effective profile is not pure-data-deterministic. Either freeze expansion at load or document that dispatch-time expansion is expected and `allowedTools` may vary across runs.
- **SA-5 (warning, Behaviors 11-12):** Tool categories defined only by natural-language description. Two adapters may legitimately disagree on tool placement (is Glob in `filesystem-read` or `search`?). Without testable semantic invariants the abstraction is decorative. Add 2-3 invariants per category; require the extension protocol to include invariants.
- **SA-6 (low, Behavior 36):** Redaction is exact-substring-match. Short secret values (≤ ~8 chars) cause both nonsense-redaction and false positives. Document minimum-length skip threshold and shared-value handling (Map<value, KEYS> or last-write-wins explicit).
- **SA-7 (warning, Behavior 32):** Env resolution follows spec-location-wins, but profile *definition* source is unspecified. Add a parallel behavior: `loadProfiles` uses the consumer repo's `.context-index/profiles.yaml`, symmetric with env resolution.
- **SA-8 (low, Behaviors 18, 37):** OpenCode partial-support vs env trust boundary — if OpenCode doesn't implement the boundary, Behavior 37 says it must refuse profiles with `env.allow`. Not an acceptance criterion; add `capabilities.envTrustBoundary` declaration to adapter exports.
- **SA-9 (warning, Bundled `implementer`):** `{ category: "*" }` is not a valid schema entry per Behavior 5. Either define the wildcard explicitly (and specify adapter-unsupported-category interaction) or enumerate categories in `implementer`.
- **SA-10 (low):** No behavior for profile reload / cache invalidation semantics. Specify cacheable / single-load-per-invocation contract.

## Security Reviewer

**Verdict:** BLOCK

- **SEC-1 (blocker, tool-scoping):** `{ tool: <literal> }` escape hatch only emits an advisory. Combined with `{ category: "*" }` in `implementer` (undefined in schema), a project can `extends: read-only` and `allow_add: [{ tool: Bash }]` or `[{ category: "*" }]` to silently escape the sandbox. Reject `{ category: "*" }` or gate it behind a schema flag; require opt-in (`allow_unportable: true`) for literal entries; emit a real WARN (not advisory) when `allow_add` broadens posture relative to parent.
- **SEC-2 (blocker, env-secrets):** Silent-skip of missing env files (Behavior 22) combined with first-wins ordering lets an attacker who can delete or rename one file shift resolution to a later-listed file they control. Distinguish "listed but missing" from "listed and read"; require existence or explicit optional-prefix; log contributing file per resolved key.
- **SEC-3 (blocker, prompt-injection):** Redaction (Behavior 36) only covers tool stdout/stderr — not harness error messages, tool argument echoing, subprocess stack traces, adapter diagnostics, or pre-adapter transcript capture. Make redaction a pipeline stage wrapping **all** captured bytes flowing back to the model. Add an AC for error-path redaction. List audited channels explicitly.
- **SEC-4 (blocker, env-secrets):** Exact-match redaction trivially bypassed by base64/hex encoding, URL-encoding, JSON escaping, whitespace mutation, or streaming boundary splits. Document bypass classes as v1-accepted risk (defense-in-depth, not a firewall); require minimum length/entropy for redaction-eligible values; buffer streaming to match across chunk boundaries.
- **SEC-5 (warning, trust-boundary):** `@workspace/` ancestor search is unbounded — an attacker dropping `adev-workspace.yaml` into a common ancestor (`~/code/`) silently extends workspace context to untrusted sibling repos. Bound ancestor search (`$HOME`, filesystem boundary, or require versioned marker file); require explicit per-repo `workspace:` opt-in on first use.
- **SEC-6 (warning, mcp-scoping):** `mcp__<name>__*` expansion at dispatch-time silently grants tools added to the MCP server after load. Freeze expansion at load, or require specific tool names for precise scoping with `mcp_server:` reserved for a trusted allowlist in `platform-context.yaml`.
- **SEC-7 (warning, adapter-contract):** No fail-safe default for adapter-unimplemented categories. Require two explicit exports (`IMPLEMENTED`, `UNSUPPORTED`); fail load on categories absent from both; fail-closed (deny-all) at dispatch for unknown categories.
- **SEC-8 (warning, env-secrets):** Extends inheritance can silently downgrade parent's `required` to child's `optional`. Specify that inheritance tightens only — parent's required stays required; child's `optional` for the same key is a load error.
- **SEC-9 (suggestion, prompt-injection):** `redactionSet` is plaintext in adapter memory; crash reporters or debug logs may serialize it. Wrap in a type that throws on `toString`/`toJSON` and scrubs from `util.inspect`.
- **SEC-10 (suggestion):** Behavior 7 warns-then-ignores unknown top-level fields. A typo on a `deny` directive silently leaves parent's permissive setting in effect. Strict-mode unknown-key rejection for security-sensitive fields (`permissions`, `env.allow`).
- **SEC-11 (suggestion):** Bundled `implementer` profile ships with full filesystem/shell/network access despite being "unconsumed in v1." Any project profile can `extends: implementer` and inherit full access. Either omit from v1 bundled defaults, mark `opt_in: true`, or WARN on every dispatch that extends it.

## Consistency Analyzer

**Verdict:** BLOCK

- **CON-1 (warning, terminology):** Profile schema omits `kind`/`severity` used in sibling governance files. Defensible but undocumented. Add a one-line "System Constitution Reference" note clarifying the intentional divergence.
- **CON-2 (blocker, external-reference-compliance):** `@workspace/` prefix vs. `multi-repo-workspace/charter.md:57`'s `CrossRepoRef = @<repo-slug>/<spec-slug>` — same `@` grammar, different resolution rules, mutually exclusive. Either reuse the charter's resolver for env files (with `@<repo-slug>/` deferred to v2 by security) or differentiate prefixes (`@env-workspace/`, `$workspace/`). Namespace collision is a live contract conflict.
- **CON-3 (warning, naming):** Bundled profile names mix capability-posture (`read-only`, `implementer`) with role-scoped presets (`reviewer-*`, `browser-review`). Document the taxonomy split to align future additions.
- **CON-4 (confirmed consistent):** Tier names `fast | capable | reasoning` match `model-routing.md`.
- **CON-5 (warning, contract):** `prepareForDispatch` says "resolved from tier via platform-context.yaml" but doesn't inherit `model-routing.md`'s fallback semantics (hardcoded defaults, fall-back-to-capable). State that fallback rules apply.
- **CON-6 (suggestion, naming):** `agent` category is vague relative to verb-object siblings (`filesystem-read`, `filesystem-write`, `web-fetch`). Consider `subagent-spawn`. Also, `web-fetch` bundles `WebFetch` + `WebSearch`; split if ever needed (no current consumer).
- **CON-7 (warning, pattern):** `profiles.yaml` at `.context-index/` root breaks the `governance/` pattern used by `gates.yaml`, `review.yaml`, `validate.yaml`. ADR-0004 justifies ("sibling, not child") but the spec doesn't surface the rationale. Elevate into spec intro.
- **CON-8 (suggestion, external-ref):** Spec introduces `lib/profiles/adapters/<harness>.mjs` without reconciling with the existing `providers/<harness>/plugin.mjs` convention. Confirm intent; document the relationship.
- **CON-9 (warning, contract):** Env trust boundary (Behavior 34-35) says values never reach the LLM, but `CLAUDE.md` hooks (principle #4) receive subprocess env. The boundary is LLM-vs-subprocess, not "nothing sees these." Add a behavior: "Hooks receive profile-resolved env on subprocess invocations; hook authors must treat values as sensitive."

---

## Summary

**Total findings:** 30 (5 blockers, 14 warnings, 11 suggestions)
**Action required:** Resolve SEC-1 through SEC-4 (tool-scoping escape hatches, env-file shadow, redaction pipeline completeness, redaction bypass classes) and CON-2 (`@` grammar namespace collision with `multi-repo-workspace` charter). After blockers are fixed, address high-value structural warnings: SA-1 (category mapping ownership), SA-2 (associativity), SA-5 (category semantic invariants), SA-7 (profile definition source in multi-repo), SEC-5/6/7 (workspace bounds, MCP expansion-time, adapter fail-safe), CON-7 (governance/ pattern divergence), CON-9 (hook visibility). Then re-run `/adev:review-specs --spec .context-index/specs/cross-cutting/execution-profiles.md`.

---

last-reviewed-revision: 1
file-sha: 32260fb1ea15a395034b7360233fce3e39ab96b1

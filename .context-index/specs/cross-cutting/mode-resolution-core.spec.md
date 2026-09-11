# Live Spec: Implementation Mode — Resolution Core

<!-- Live Spec implementing the "mode-resolution-core" group of the Implementation Mode cross-cutting charter. Parent Charter: .context-index/specs/cross-cutting/implementation-mode/charter.md (revision 2) -->

---
partial_schema: spec@1
mode: cross-cutting
affects: [setup, lib, cli]
kind: behavioral
status: review-blocked
risk_level: medium
revision: 2
charter-revision: 2
created: 2026-09-10
updated: 2026-09-11
tracker-ref: adev-plugin-8u2a
---

## Behavioral Contract

Defines the foundational mechanism for the `implementation_mode` setting: the `manifest.yaml` config key, the canonical mode-config resolver (`lib/implementation-modes/`), the `adev implementation-mode resolve` CLI verb, and the `/adev:init` prompt that writes the setting. This is the dependency every other implementation-mode spec (dispatch behavior in `implementation`/`write-test`, authoring/routing in `planning`/`assessment`, observability in `maintenance`/`strategic-planning`) builds on.

## System Constitution Reference

- **Principle 1** (Minimize external dependencies) — Applies because the resolver and CLI verb use only Node.js built-ins; no new dependency is introduced.
- **Principle 2** (Skills are primarily markdown) — Applies because `/adev:init`'s SKILL.md prose names the `adev implementation-mode resolve` verb rather than inlining resolution logic; the resolver itself is companion code in `lib/`, not required for the skill's textual instructions to make sense.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define mode constants | Write `lib/implementation-modes/constants.mjs` with the 3 modes' config objects (`tdd`, `test-required`, `agent-default`) | small |
| Write resolver | `lib/implementation-modes/resolve.mjs` — reads `manifest.yaml` via `loadManifest()`, looks up the mode, validates, returns config or throws `UNKNOWN_IMPLEMENTATION_MODE` | small |
| Wire CLI verb | Add `implementation-mode resolve` to `VERB_REGISTRY` in `cli/index.mjs`, thin wrapper printing the resolver's JSON output | small |
| Update `/adev:init` | New question step: `agent-default` listed first for a project with no existing value, no silent accept-on-enter, sensitive-path-floor warning shown when `agent-default` is chosen; writes `implementation_mode` to `manifest.yaml` directly (no resolver call at write time). SKILL.md prose names `adev implementation-mode resolve` as the canonical way any later step reads the value back — the verb documents the read path, it is not invoked during the write itself. | medium |
| Update `templates/manifest-template.yaml` | Document the new key near the existing Test Policy block | small |

## Acceptance Criteria

- [ ] `adev implementation-mode resolve --mode tdd` returns the `tdd` config
- [ ] `adev implementation-mode resolve --mode test-required` returns the `test-required` config
- [ ] `adev implementation-mode resolve --mode agent-default` returns the `agent-default` config
- [ ] `adev implementation-mode resolve` with no `--mode` and no stored `manifest.yaml` value returns the `tdd` config (legacy fallback, unchanged)
- [ ] `adev implementation-mode resolve` with no `--mode` and a stored `manifest.yaml` value resolves that stored value
- [ ] `adev implementation-mode resolve --mode bogus` exits 1 with `UNKNOWN_IMPLEMENTATION_MODE`, message lists the 3 valid options, no side effects
- [ ] A malformed `manifest.yaml` causes the resolver to exit 2 with `MANIFEST_PARSE_ERROR`, naming the offending file
- [ ] A write-then-read round trip (`/adev:init` writes `implementation_mode`, then `adev implementation-mode resolve` with no `--mode` is run against that same manifest) returns the value that was written, verified by an integration test rather than a fixture-only unit test
- [ ] BEH-5 (option ordering, no silent accept-on-enter) and BEH-6 (sensitive-path-floor warning on `agent-default` selection) are each verified by a golden-transcript or scripted-input test of the `/adev:init` prompt, not by manual QA alone
- [ ] `/adev:init`'s new prompt lists `agent-default` first for a project with no existing `implementation_mode` value
- [ ] `/adev:init`'s new prompt does not accept empty input as a silent default — the user must type a choice
- [ ] Selecting `agent-default` in `/adev:init` displays the sensitive-path-floor-bypass warning before the value is written
- [ ] All quality gates pass
- [ ] No constitutional violations

## Preconditions

- `.context-index/` exists (project has run `/adev:init` at least once, or is running it now).
- `manifest.yaml` is present and parseable, or is being created fresh in the same `/adev:init` pass that writes `implementation_mode`.

## Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `adev implementation-mode resolve` is called with an explicit `--mode <name>` argument, **then** it resolves that name directly against the constants object, ignoring `manifest.yaml`.
- **BEH-2** — **When** `adev implementation-mode resolve` is called with no `--mode` argument and `manifest.yaml` has no `implementation_mode` key, **then** it returns the `tdd` default config. This fallback is unchanged for legacy projects regardless of how `/adev:init`'s prompt is ordered for new projects.
- **BEH-3** — **When** `adev implementation-mode resolve` is called with no `--mode` argument and `manifest.yaml` has a valid stored `implementation_mode` value, **then** it resolves that stored value.
- **BEH-4** — **When** the resolver returns successfully, **then** the result always contains exactly the three fields `dispatch_red`, `ordering_enforced`, `coverage_check`, never a partial object.
- **BEH-5** — **When** `/adev:init` presents the `implementation_mode` question on a project with no existing stored value, **then** `agent-default` is listed first among the three options, with no option silently accepted on empty input — the user must explicitly type a choice.
- **BEH-6** — **When** the user explicitly selects `agent-default` from that menu, **then** the sensitive-path-floor-bypass warning is displayed before the value is written to `manifest.yaml`.

## Postconditions

- `manifest.yaml` contains a valid `implementation_mode` key with one of the 3 enumerated values, or no key at all (legacy projects that never ran the new prompt).
- `adev implementation-mode resolve` is callable and returns a well-formed config for whatever mode is in effect.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--mode` (or stored `manifest.yaml` value) is not one of `tdd`/`test-required`/`agent-default` | Exit 1, message lists the 3 valid options, no side effects | `UNKNOWN_IMPLEMENTATION_MODE` |
| `manifest.yaml` exists but is malformed YAML | Exit 2, reports the offending file | `MANIFEST_PARSE_ERROR` (reuses the code already thrown by `readManifest()` in `lib/gates/gate-sets.mjs`; not a new code) |

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `setup` | medium | New `/adev:init` question, `agent-default` listed first for fresh projects (no silent accept-on-enter); writes `implementation_mode`; `agent-default` option shows the sensitive-path-floor warning. Resolver's `tdd` fallback for projects with no stored value is unchanged. Deferred: the charter's second `setup`-module obligation — `using-adev`'s help routing-table row, TDD glossary entry, and its own restatement of the sensitive-path-floor bypass for `agent-default` — is explicitly out of scope for this spec and is owned by a future `using-adev`-scoped spec, not yet filed. That sibling spec is also where BD-1 (bypass warning surfaced at every discovery point, not only the one-time `/adev:init` prompt) is to be addressed. |
| `lib` | medium | New `lib/implementation-modes/constants.mjs` + `resolve.mjs`, following the existing `lib/risk-tiers/` pattern. |
| `cli` | low | New `implementation-mode resolve` verb wired into `VERB_REGISTRY`, following the existing driver-surface pattern. |

## Integration Points

1. `setup` ↔ `lib`: `/adev:init` writes the manifest key; the resolver reads it via the existing `loadManifest()`.
2. `cli` ↔ `lib`: the verb is a thin wrapper printing the resolver's JSON output, following the driver-surface pattern (no inline Node in SKILL.md).
3. `lib` → future `dispatch-behavior` spec (`implementation`, `write-test`): this resolver's `{dispatch_red, ordering_enforced, coverage_check}` output contract is exactly what that spec's dispatch logic will consume. That spec is not yet filed and the call mechanism (import of `lib/implementation-modes/resolve.mjs` vs. a CLI shell-out to `adev implementation-mode resolve`) is not yet decided; this integration point is to be updated with the concrete spec name and call mechanism once filed.

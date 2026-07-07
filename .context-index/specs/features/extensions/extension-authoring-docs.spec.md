---
charter: extensions
kind: behavioral
status: validated
risk_level: low
milestone: 0.27.0
revision: 2
charter-revision: 4
created: 2026-05-16
updated: 2026-05-16
tracker-ref: issue-485
depends-on:
  - .context-index/specs/features/extensions/extension-core.spec.md
  - .context-index/specs/features/extensions/content-installation.spec.md
  - .context-index/specs/features/extensions/cli-and-registration.spec.md
  - .context-index/specs/features/validation/configurable-checks.spec.md
  - .context-index/specs/features/cli-driver-surface/write-time-diagnostic-hook.spec.md
  - .context-index/adrs/0003-configurable-review-registry.md
source-manifest:
  sha: "f5944fc"
  files:
    - docs/README.md
    - docs/extensions.md
    - extensions/example-validation-check/README.md
    - extensions/example-validation-check/adev-extension.yaml
    - extensions/example-validation-check/bin/check.sh
    - templates/adev-extension.example.yaml
    - tests/docs/extensions-links.test.mjs
    - tests/integration/extension-validate-flow.test.mjs
    - tests/lib/extensions/example-validation-check-install.test.mjs
  computed-at: "2026-07-03T22:27:11.358Z"
---

# Live Spec: Extension Authoring Documentation Bundle

<!-- Live Spec within the extensions charter (rev 4).
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/extensions/charter.md -->

## Behavioral Contract

### Preconditions

- The `extensions` charter is at revision ≥ 4 (the rev 4 amendment carves "documentation, manifest templates, and reference example extensions" out of the previous "extension authoring tooling" Out-of-Scope row, and clarifies that executable scripts invoked AS `provides.governance` commands are permitted).
- `extensions/data-engineering/` and `extensions/process-automation/` exist as reference domain-profile extensions (provides reference for structure only, not governance shape — those ship `provides.domain-profile`, not `provides.governance`).
- `lib/cli/report.mjs` exposes `adev report --type validator` (spec: `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md` Task 2).
- `lib/extensions/install.mjs` resolves and installs extensions via `npx adev-cli extension install`. The canonical `provides.governance` schema is an **array of `{ target, entries[] }` objects**, where `target` defaults to `review.yaml` and `entries[]` is the list of governance rows to merge per ADR-0003. The reference extension's manifest uses `target: validate.yaml` so the entries land in `governance/validate.yaml`.
- `lib/cli/report.mjs` validates the `--validator` argument as a string (no nested objects, no newlines, ≤200 chars per the lifecycle-event-log redaction cap).
- This spec introduces the convention `extensions/<name>/bin/<command>.sh` (or `.mjs`/`.py` if the author opts to ship a runtime, but the reference uses bash per Constitution Principle 1). The existing reference extensions (`data-engineering`, `process-automation`) ship no `bin/` directory because they're domain-profile-only; this spec is the first to establish the convention for `provides.governance` extensions.

### Behaviors

1. **When** an author copies `templates/adev-extension.example.yaml` to a new extension directory, **then** every `provides.*` slot (`skills`, `hooks`, `governance`, `domain-profile`, `samples`) is documented inline with a commented example using the **canonical schema**: `provides.governance` is an array of `{ target, entries[] }` objects (not a flat array of check entries, not a `provides.governance.checks[]` wrapper). The template is sufficient for the author to author a complete manifest without reading the underlying specs.

2. **When** an author runs `npx adev-cli extension install ./extensions/example-validation-check`, **then** the example's `provides.governance` entry merges into the project's `.context-index/governance/validate.yaml` per ADR-0003 semantics (new id appended; project fields win on conflict), AND `manifest.yaml::installed_extensions` records the install, AND the install operation inherits the `PATH_TRAVERSAL` path-containment guarantees from `content-installation.spec.md` Behavior 8 (path escape is rejected before any file copies).

3. **When** `/adev:validate` runs on a project that has installed `example-validation-check`, **then** the new check appears in the registry walk (topologically sorted by `after:`), executes via `child_process.execFile` (argv form, never shell), and its verdict is recorded via `adev report --type validator --step validate --validator example-validation-check --verdict PASS` in the spec's lifecycle log. The `--validator` argument MUST be a single token matching the governance entry's `id:` field (no newlines, no nested-object representation).

4. **When** the example check's CLI binary at `extensions/example-validation-check/bin/check.sh` runs, **then** it exits 0 with a single line of stdout (`PASS: example-validation-check`) and emits **no stderr**. The binary MUST NOT: read `process.env`, read `process.argv` beyond `argv[0..1]`, read stdin, write to the filesystem outside `/tmp`, or make network calls. This minimalism is a deliberate threat-model choice — copying the example produces a no-op check, not an exfiltration vector. The README documents this constraint.

5. **When** an author reads `docs/extensions.md`, **then** they find:
   (a) the complete `adev-extension.yaml` schema documenting every `provides.*` slot with the canonical `provides.governance` shape (array of `{ target, entries[] }`),
   (b) the install-time merge semantics with a link to ADR-0003,
   (c) the validate-time event flow (extension check → `adev report --type validator` event → write-time diagnostic stamping per `.context-index/specs/features/cli-driver-surface/write-time-diagnostic-hook.spec.md`),
   (d) a pitfalls section covering AT LEAST: forgetting `profile:` on a quality-gate (per `configurable-checks.spec.md` Behavior 13), using string-form `command:` (per Behavior 6a), omitting `requires.adev` semver, missing `id:` on a governance entry, AND **a threat-model paragraph stating that `profile:` permissions scope only the adapter's tool surface — they do NOT sandbox the subprocess spawned by `child_process.execFile`. The subprocess inherits the user's filesystem and network privileges. Authors are responsible for hardening their own check binaries.**

6. **When** a project's `validate.yaml` already contains a check with the same `id` as an extension-provided entry, **then** the install merges per ADR-0003 (project fields override, extension fields fill in unset fields only). The install report MUST list ALL colliding ids in a single dedicated section (not buried in scrolling output), and the merge MUST NOT downgrade a project's `severity:` from `error`/`warning` to a lower value (severity, `enabled`, and `after:` are non-overridable from the extension side). `docs/extensions.md` documents this precedence with a worked example.

7. **When** `docs/README.md` is consulted, **then** the new `docs/extensions.md` page is linked from the "Reference" section, discoverable by name search and by topic ("extensions", "authoring", "governance").

### Postconditions

- `extensions/example-validation-check/` exists with: `adev-extension.yaml` manifest (≤25 lines), `bin/check.sh` no-op binary (≤15 lines including shebang), `README.md` (≤60 lines).
- `bin/check.sh` begins with `#!/usr/bin/env bash`, is marked executable (`chmod +x`), exits 0, prints exactly one line to stdout, emits no stderr, and reads neither env nor argv beyond `$0`.
- `templates/adev-extension.example.yaml` exists, commented, exercising all five `provides.*` slots using the canonical schemas from `content-installation.spec.md`.
- `docs/extensions.md` exists, linked from `docs/README.md`'s Reference section, covers the four required content items in Behavior 5 (a–d).
- The reference extension installs cleanly via `npx adev-cli extension install ./extensions/example-validation-check` against a freshly-initialized `.context-index/` directory.
- After install, `/adev:validate` (in advisory/dry-run mode for a stub spec) lists `example-validation-check` among the registry walk.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `bin/check.sh` missing or non-executable | Install records the entry but the check FAILs at validate-time with `BINARY_NOT_FOUND`; docs note this in the pitfalls section. | exit 1 |
| `adev-extension.yaml::provides.governance[].entries[].id` collides with a bundled check id | Project's bundled check wins (project fields override); install report surfaces ALL colliding ids in a dedicated section; non-overridable fields (`severity`, `enabled`, `after`) are preserved from project values regardless of extension setting. | N/A (advisory) |
| `provides.governance[].entries[].command` is a string (not argv list) | Install fails per `configurable-checks.spec.md` 6a with `QUALITY_GATE_COMMAND_SHELL`; docs lead the pitfalls section with this case. | exit 1 |
| `provides.governance[].entries[].kind: quality-gate` omits `profile:` | Install fails per `configurable-checks.spec.md` Behavior 13 with explicit error; docs document the rationale (profile permissions scope the adapter's tool surface, NOT the spawned subprocess). | exit 1 |
| `requires.adev` semver range excludes the installed adev version | Install aborts with `INCOMPATIBLE_ADEV_VERSION` before any file copies; docs cover the version-pinning convention. | exit 1 |
| Source path escapes intended directory (e.g., `../../../etc`) | Install fails with `PATH_TRAVERSAL` per `content-installation.spec.md` Behavior 8; docs cover the install-time containment guarantee. | exit 1 |
| `docs/extensions.md` references a code symbol that doesn't exist | A doc-link test fails CI; the doc must cite only existing exports. | N/A (test) |

## System Constitution Reference

- **Principle 1 — Minimize external dependencies.** The reference extension's `bin/check.sh` uses bash, not Node or Python, so the example install path requires no extra runtime beyond what the developer's shell already provides. (Docs note: real extensions can ship their own runtime via `provides.governance.command: [node, bin/check.mjs, --spec]` etc., but the canonical reference stays bash for minimum surface.)
- **Principle 2 — Skills are primarily markdown.** The reference extension demonstrates the `provides.skills` pattern with a single-line skill stub; the bulk of the example is governance + manifest, not skill content. (Docs note: extensions can ship rich skills following the same SKILL.md convention as bundled skills.)
- **Principle 4 — Hook protocol compliance.** The reference extension's `provides.hooks` slot demonstrates the hook contract (stdin JSON, exit 0/2, JSON stdout). The example hook is a no-op `PostToolUse` echo to keep the docs focused on the install/wire flow.
- **Constitution Anti-Pattern: No `Run inline Node.js:` step directives in `skills/*/SKILL.md`.** The reference extension's skill stub MUST use `adev <verb>` calls in its prose where it invokes lib helpers; this is the regression-prevention contract from `cli-driver-surface/regression-prevention.spec.md`. (Docs reinforce this convention for extension-shipped skills.)

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Verify charter row | Charter is at rev 4 with capability "Extension Authoring Documentation Bundle" listed (review-passed). No edit needed; verification only. | trivial |
| Reference extension scaffold | Create `extensions/example-validation-check/` with manifest, `bin/check.sh`, `README.md`. Manifest uses canonical `provides.governance: [{target, entries[]}]` shape. | small |
| Reference extension governance entry | Wire `provides.governance: [{target: validate.yaml, entries: [{id, kind: quality-gate, command: [bash, bin/check.sh], profile: read-only, severity: warning}]}]`. | small |
| Manifest template | Author `templates/adev-extension.example.yaml` with every `provides.*` slot, inline comments per slot, using canonical schemas. | small |
| Docs guide | Author `docs/extensions.md` per Behavior 5 (a–d). Estimated 200-300 lines. Includes the threat-model paragraph for `profile:` scoping. Reference the example extension and manifest template. | medium |
| docs/README link | Add a "Extensions" link to `docs/README.md::Reference` section. | trivial |
| Install test | New `tests/lib/extensions/example-validation-check-install.test.mjs` — `npx adev-cli extension install` against a temp project, assert governance merge + manifest stamp. Includes a negative fixture: string-form `command:` MUST trigger `QUALITY_GATE_COMMAND_SHELL`. | small |
| Validate-time test | New `tests/integration/extension-validate-flow.test.mjs` — install the example, run `/adev:validate` dry-run, assert the new check appears in the registry walk and emits a `validator_report` event. | medium |
| Doc-link test | Author `tests/docs/extensions-links.test.mjs` — assert every code symbol referenced in `docs/extensions.md` exists in the codebase (sentinel against doc drift). | small |

## Acceptance Criteria

- [ ] `extensions/example-validation-check/` exists with manifest + `bin/check.sh` + `README.md` and matches the line-count budgets: manifest ≤25 lines, `bin/check.sh` ≤15 lines, README ≤60 lines (asserted by the install test).
- [ ] `bin/check.sh` begins with `#!/usr/bin/env bash`, is executable, prints exactly one line to stdout, emits zero stderr, and reads neither env nor argv beyond `$0` (asserted by a postcondition test in the install test file).
- [ ] `templates/adev-extension.example.yaml` exists, exercises all five `provides.*` slots, and uses the canonical `provides.governance: [{target, entries[]}]` shape with inline comments.
- [ ] `docs/extensions.md` exists, covers schema + merge semantics + validate flow + four+ pitfalls + the `profile:`-scoping threat-model paragraph, links to ADR-0003 and to the reference extension.
- [ ] `docs/README.md::Reference` section links to `docs/extensions.md`.
- [ ] `npx adev-cli extension install ./extensions/example-validation-check` succeeds in a temp project; `installed_extensions` is stamped; `validate.yaml` gains the new check entry under the `target: validate.yaml` row.
- [ ] Running `/adev:validate` on a stub spec after install includes `example-validation-check` in the registry walk and emits a `validator_report` event in the spec's lifecycle log.
- [ ] Install-test negative fixture: a manifest with string-form `command:` triggers `QUALITY_GATE_COMMAND_SHELL` on install.
- [ ] Install report surfaces ALL colliding ids in a dedicated section when extension and project share check ids.
- [ ] Charter Capability Map row "Extension Authoring Documentation Bundle" status is preserved as `implemented` after this spec lands (post-implementation invariant).
- [ ] Doc-link test (`tests/docs/extensions-links.test.mjs`) passes — every code symbol cited in `docs/extensions.md` resolves to an existing export or file.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
- [ ] No new inline-Node patterns in `extensions/example-validation-check/` skill prose (regression hook still authoritative).

## Quality Attributes

- **Time to first observed pass-event (informational target, not a testable behavior):** under 5 minutes from clone to first observed `validator_report` event on a developer workstation with adev already installed. Tracked as a guidance metric in `docs/extensions.md`'s introduction, not as an acceptance criterion.

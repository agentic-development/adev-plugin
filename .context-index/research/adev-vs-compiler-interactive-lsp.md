# adev vs. a Compiler — An Interactive Analyzer (LSP-Style Daemon)

> Fifth in the compiler-analogy series, after `comparison.md` (the
> structural mapping), `gaps-and-practice.md` (what's missing),
> `empirical-audit.md` (measured findings), and `dispatch-patterns.md`
> (the driver model). The prior notes treated adev as an *ahead-of-time*
> compiler: checks fire when a skill is invoked, finish, and exit. This
> note asks the natural next question: **can adev work like a modern IDE
> language server — a long-running process that watches the project,
> runs incremental checks, and surfaces inconsistencies in real time?**
> The same arc compiler tooling itself followed: `gcc` → `clang` → `clangd`.
> The answer is yes, and a clean implementation borrows directly from
> OpenCode's architecture.

## 1. Framing — from AOT to incremental

A skill-invoked check is structurally an AOT compile: the user runs
`/adev:validate`, the helper executes, emits a report, exits. Errors are
visible *after* the work, possibly hours after the spec edit that caused
them. The agent and the user both spend a lot of time discovering that
something they did several steps ago violated a rule.

A modern compiler doesn't work that way at edit time. `clangd` runs
continuously inside the editor, maintains an incremental view of the
project, and surfaces diagnostics within ~100ms of a keystroke. The
"compile" still exists — it just happens incrementally, in the
background, and pushes its findings to wherever they're useful.

The audit findings make a strong case for this for adev:

- A spec drifts when an AC is added without a citation — currently
  noticed only when the next `/adev:validate` runs.
- A charter loses its capability map when someone edits it manually —
  currently noticed only on `/adev:hygiene`.
- `governance/review.yaml` silently empties on 2026-05-11 and nobody
  notices until an audit four months later (§7.3 of the audit note).

All three would be **immediate diagnostics** in an LSP world: visible in
the editor (and in the agent's next-turn context) within seconds of the
breaking edit. The fix is no longer "remember to run hygiene"; it's
"the squiggly red line is already there."

## 2. What's incrementally analyzable in adev

Not all checks are cheap enough to run on every keystroke. Tiering them
matters:

**Tier 1 — Cheap per-file (≤10 ms each, run on every save):**

- Frontmatter schema validation (spec/charter/review/validate)
- Required-section presence (capability map, behavioral contract, AC)
- Inline citation **syntactic** form in `.validate.md` (`path:line` shape)
- Trailer presence in `HEAD` (cheap `git show HEAD --format='%B'`)
- Charter status enum legality
- Skeleton-stub detection (review with ≤N lines)

**Tier 2 — Moderate cross-file (50–300 ms, run on debounce):**

- Charter capability ↔ spec coverage (does every capability have a spec?)
- Spec ↔ code reference resolution (every cited path exists?)
- Reviewer-registry attrition (`governance/review.yaml` has ≥3 reviewers
  with resolvable prompt paths)
- Status consistency (`spec.status` ≥ `review.status` if review exists)
- Companion-artifact presence (every validated spec has `.plan` / `.review`
  / `.validate`?)
- Mode usage tracking (which spec modes are unused?)

**Tier 3 — Expensive whole-project (1–10 s, run on explicit `adev diagnose --full` or commit):**

- **Citation grounding** — open every cited file, verify line range
  exists and content tokens match the claim (the GSAR-style check from
  empirical-audit P2)
- Drift detection across all charters
- Dead-code / dead-spec elimination (`/adev:dce` from P10)
- Heuristic extraction over the last N PASS validates

The tier matters because it determines *when* the check fires. Tier 1
runs on every `didChange` notification; Tier 2 on debounced save; Tier 3
on `workspace/diagnostic` pull or explicit invocation. This is exactly
how modern LSPs split their work.

## 3. Architectural options

Four viable shapes for an "adev LSP", each with a clean compiler analog:

### 3.1 Architecture A — Hook-driven re-check (no daemon)

Run checks inside existing Claude Code hooks: `SessionStart`,
`UserPromptSubmit`, `PostToolUse`. Stateless; full re-scan each time.

- ✅ Zero new infrastructure; ships today.
- ❌ Re-runs everything every time; expensive at scale.
- ❌ Only fires at hook boundaries — not on file edits *from the editor*.
- Compiler analog: `gcc -Wall` re-run on every save by an editor plugin.

### 3.2 Architecture B — adev-specific watch daemon

`adev watch` runs in the background. `fs.watch` over `.context-index/`
and source dirs. Writes diagnostics to `.context-index/_diagnostics/current.jsonl`.
Hooks / CLI read the file.

- ✅ Incremental, fast.
- ✅ Zero deps (Node built-in `fs.watch`; fallback to polling for unreliable FS).
- ❌ Custom protocol — no editor integration.
- ❌ Process-lifecycle management problem.
- Compiler analog: `make -j` with a custom job-server.

### 3.3 Architecture C — Real LSP server

Implement the actual Language Server Protocol. Editors with LSP support
get adev diagnostics natively; the agent harness consumes the same
protocol.

- ✅ Editor integration for free (VS Code, Neovim, JetBrains, Zed, etc.).
- ✅ Standardized — the agent talks to the same daemon as the editor.
- ✅ Pull-diagnostic model (LSP 3.17) fits adev's "fire before tool call" semantics.
- ❌ Heaviest implementation (JSON-RPC over stdio, capability negotiation, lifecycle).
- ❌ JSON state files don't fit textDocument cleanly.
- Compiler analog: `clangd`.

### 3.4 Architecture D — Hybrid (recommended)

Combine: LSP daemon + hooks + CLI.

- **Daemon** (`adev lsp serve`) does the heavy lifting: watches files,
  maintains incremental state, runs Tier 1 on save and Tier 2 on debounce.
- **CLI** (`adev diagnose`, `adev diagnose --json`) is a synchronous
  fallback. Always works, even if the daemon is down. Slower but correct.
- **Hooks** (`SessionStart`, `UserPromptSubmit`) call `adev diagnose --json`
  to pull current diagnostics and inject them into the agent's context.
  If the daemon is running, this is fast (cached). If not, it's a fresh
  scan.
- **Editor** clients (VS Code, Neovim, etc.) speak LSP directly to the
  same daemon, getting squiggly lines in real time.

This composes with the dispatch-patterns design: helpers in `lib/cli/`
are the **single source of truth**; the daemon caches their output; the
hook and the editor are clients of the same answer. Compiler analog: the
**`make` always works; `make -j` is the optimization** pattern.

## 4. Recommendation — Architecture D, with pull diagnostics

Concretely:

```
lib/lsp/
  server.mjs        # JSON-RPC over stdio, ~200 LOC zero-dep
  capabilities.mjs  # advertise: textDocument/diagnostic (pull), workspace/diagnostic
  router.mjs        # dispatch didOpen/didChange/didSave/diagnostic to checks
  watcher.mjs       # fs.watch wrapper with polling fallback
  state.mjs         # in-memory cache: file → frontmatter, hash, last-diagnostics

lib/diagnostics/
  index.mjs         # registry of named checks (Tier 1/2/3)
  schema/<artifact>.mjs    # per-artifact schema (P1)
  citation-grounding.mjs   # Tier 3, slow (P2)
  registry-attrition.mjs   # Tier 2 (P6)
  companion-coverage.mjs   # Tier 2
  capability-map.mjs       # Tier 2 (P9)

cli/index.mjs
  case "lsp":       → lib/lsp/server.mjs       (long-running)
  case "diagnose":  → lib/cli/diagnose.mjs     (one-shot, --json)
```

### Why pull diagnostics (LSP 3.17) over push

The push model (`publishDiagnostics`) needs careful debouncing — OpenCode
ships a 150 ms debounce and per-doc/workspace timeouts because pushes are
hard to coordinate. For adev, the relevant moments to compute are:

1. The user just edited a spec → cheap Tier 1 immediately.
2. The user just saved → Tier 1 + Tier 2 on debounce.
3. The agent is about to invoke a skill → **pull** the current
   diagnostic set, inject it into the agent's context.

Moment 3 is the dominant one. With pull, the agent (or its `PreToolUse`
hook) issues `workspace/diagnostic` and gets the freshest answer; the
daemon doesn't have to push speculatively.

This matches the dispatch-patterns argument from §7 of that note:
**gates belong inside the executor, hooks are for cross-cutting concerns**.
A pulled diagnostic at PreToolUse time is exactly the cross-cutting
concern hooks are good at, and it fits the helper-side-gate model
without conflict.

### Why a real LSP (not a custom protocol)

LSP-beyond-code is mature. Marksman is an LSP for markdown wiki-links;
`yaml-language-server` validates YAML against JSON Schema; `vale-ls`
wraps a prose linter as an LSP. All three are direct precedents for
adev's use case (specs are markdown + frontmatter + YAML governance).

Building a real LSP costs ~200 LOC of JSON-RPC framing + capability
handshake (`initialize` → `initialized` → `shutdown` → `exit`), all
zero-dep with `node:fs.watch` and HTTP-style `Content-Length` parsing.
In return:

- Every editor with LSP support attaches with no per-editor work.
- The agent harness consumes the same protocol with no parallel pipe.
- Future tooling (CI, web dashboards) speaks one standard.

The pure-custom alternative would save those 200 LOC and lose all three.

## 5. How OpenCode does it — the concrete reference

OpenCode (`sst/opencode`) is the closest twin and worth studying in
detail. Its LSP integration lives in `packages/opencode/src/lsp/`:

| OpenCode concept | What it does | adev parallel |
| --- | --- | --- |
| `LSP.Service` (`index.ts`) | Orchestrates language servers | `lib/lsp/server.mjs` |
| `LSPServer.Info` (`server.ts`) | Registry of available servers by file extension | `lib/diagnostics/index.mjs` (registry of checks by file glob) |
| `LSPClient.Info` (`client.ts`) | Per-server client instance | one daemon per project |
| Effect framework | Lifecycle / concurrency / failure | for adev, plain async/await + `AbortController` is enough |
| `@parcel/watcher` | Native fs events across platforms | `node:fs.watch` for zero-dep; `@parcel/watcher` is one optional dep if cross-platform becomes painful |
| `publishDiagnostics` push (debounced 150 ms) | How diagnostics reach the bus | for adev, **prefer pull** (3.17) so the agent controls timing |
| Internal Bus | Diagnostic propagation | LSP `workspace/diagnostic` response |
| Tiered timeouts (45 s init, 5 s per-doc, 10 s workspace) | Failure containment | adopt as-is |
| `OPENCODE_DISABLE_LSP_DOWNLOAD` opt-out | Network policy | adev has no remote servers to download; the daemon is local |
| `opencode serve` HTTP API | Remote attach point | only if adev wants a web UI later — not needed v1 |

The big architectural lesson from OpenCode is the **failure-mode
discipline**: 45 s/5 s/10 s tiered timeouts, surface a degraded state
explicitly. adev should adopt exactly this — if the watcher dies or a
check times out, the daemon emits a *self-diagnostic* (severity:
warning, source: `adev-lsp`, message: "Tier 3 check timed out") rather
than silently dropping.

OpenCode's other strong choice — plugin-side `file.watcher.updated`
events — translates to adev as: **a plugin/extension API on the daemon
itself**, so third-party domain reviewers can register their own
diagnostic kinds. This composes with ADR-0003's data-driven registry:
each entry in `governance/review.yaml` becomes a registered diagnostic
producer.

## 6. Diagnostic kinds — mapping audit findings to LSP diagnostics

Every gap identified in `empirical-audit.md` becomes a diagnostic kind:

| Audit finding | Diagnostic kind | Tier | Severity |
| --- | --- | --- | --- |
| 9 charters missing capability map | `adev/charter-missing-capability-map` | 1 | error |
| 167/173 specs missing Visual Expectations | `adev/spec-missing-section` | 1 | warning |
| 29 specs with no companion artifacts | `adev/spec-missing-companion` | 2 | warning |
| Validate report with no file:line citations | `adev/validate-no-citations` | 1 | error |
| Citation cites a file that doesn't exist | `adev/citation-unresolved` | 3 | error |
| Citation cites a line range that doesn't exist | `adev/citation-out-of-range` | 3 | error |
| `governance/review.yaml: reviewers: []` | `adev/registry-empty` | 2 | error |
| Reviewer prompt path doesn't resolve | `adev/registry-broken-path` | 2 | error |
| Spec status advanced without `.validate.md` | `adev/status-without-evidence` | 2 | error |
| Trailer missing on HEAD commit touching spec | `adev/trailer-missing` | 1 | error |
| `drift_detected: true` but no actual divergence | `adev/drift-false-positive` | 2 | info |
| 98% meta-work in last 50 commits | `adev/meta-budget-exceeded` | 2 | warning |
| Skeleton-stub review (≤8 lines) | `adev/review-skeleton` | 1 | warning |
| Unused spec mode `extract` / `from-diff` | `adev/dead-vocabulary` | 2 | info |

This list **is the specification**. The daemon implements one check per
kind; tier determines when it fires; severity determines whether it
blocks tool invocation.

Crucially, **code actions** become useful here. LSP `codeAction`
responses can offer fixes: "Add missing capability map (template)",
"Generate stub validate.md with required citations", "Restore reviewer
to registry from defaults". The agent (or the human in the editor) can
accept the fix without leaving the diagnostic surface.

## 7. The agent-side integration

Three options for getting diagnostics into the agent's working context:

**(a) `PreToolUse` hook + pull.** The `SessionStart` and
`UserPromptSubmit` hooks call `adev diagnose --json --since=last-pull`
and emit the result on stdout, which Claude Code injects as context.
Works on Claude Code today, zero new harness support needed.

**(b) Direct LSP client in the harness.** If Claude Code / OpenCode
gains LSP-client capability for non-language servers, the agent reads
diagnostics directly from the daemon's `workspace/diagnostic` response.
Cleaner but requires harness changes.

**(c) Tool-result channel.** Expose `adev_diagnose` as a callable tool
(MCP or native). The agent invokes it when it suspects state drift; the
result lands in tool-result context. Most explicit but adds another
turn.

Recommendation: **start with (a)**, design the daemon to also serve (b)
when harness support lands, keep (c) as an explicit MCP server in v2.

## 8. Implementation roadmap

In strict dependency order, each step independently shippable:

1. **Layer 0 — diagnostic registry** (1 day). Build
   `lib/diagnostics/index.mjs` as the named registry; reuse the schema
   validators (P1) and citation-grounding (P2) helpers from the audit's
   improvement plan as the first two producers.
2. **Layer 1 — `adev diagnose` CLI** (2 days). One-shot
   diagnostic run, JSON output, exits non-zero on any error-severity
   finding. Works without daemon. Hookable via `SessionStart` /
   `PreToolUse` immediately.
3. **Layer 2 — `adev lsp serve` daemon** (4 days). JSON-RPC over stdio,
   `initialize` / `shutdown` lifecycle, `textDocument/diagnostic` (pull)
   responses, `workspace/diagnostic` for project-wide refresh. `fs.watch`
   maintains the file→hash→last-diagnostics cache.
4. **Layer 3 — `codeAction` providers** (3 days). For the cheapest
   diagnostic kinds, offer fixes: charter capability-map template,
   missing-section stub, restore reviewer from defaults.
5. **Layer 4 — Editor integrations** (1 day each). VS Code extension
   stub, Neovim configuration snippet. Trivial once Layer 2 lands —
   editors find LSP servers by config.
6. **Layer 5 — Plugin/extension registry** (3 days). Third-party
   diagnostic producers register via `governance/diagnostics.yaml` and
   are dispatched the same way reviewers are (ADR-0003 pattern).

Total: ~2–3 weeks for a usable v1; Layer 0–2 is the MVP at ~7 days.

## 9. Open questions

- **JSON state files** (`tasks.json`, lifecycle event logs) don't fit
  LSP's `textDocument` cleanly. Two options: (a) treat them as
  text documents anyway (the file content is the AST, validate on
  didChange); (b) expose them via `workspace/diagnostic` only, not
  `textDocument/diagnostic`. Probably (a) — keep one model.
- **Multi-repo workspaces.** A workspace's daemon must watch multiple
  repo roots. Probably one daemon per workspace, addressed by
  `workspaceFolders` capability.
- **Network effects.** With diagnostics flowing back into the agent's
  context, the agent's behavior changes in ways that affect what
  triggers future diagnostics. This is the same loop a programmer in an
  IDE experiences; the question is whether the agent benefits or
  thrashes. Likely a separate evaluation effort once Layer 2 ships.
- **Caching boundary.** When `lifecycle-state/<slug>.jsonl` grows past
  10 k events, fold projection becomes a perf concern. The daemon
  caches projections by `(file, mtime, size)`; invalidate on event-log
  append. Already aligned with `agent-reliable-state-artifacts` charter.

## 10. Tying back to the analogy

The compiler-tooling history is `gcc` → `clang` → `clangd`. Each step
added something:

- `gcc`: the driver model (the dispatch-patterns note). Phase binaries
  invoked via stable argv.
- `clang`: a *library* internal architecture, allowing reuse outside
  the driver. (adev's `lib/` is already this for the helpers.)
- `clangd`: continuous, incremental, IDE-integrated analysis with pull
  diagnostics.

The improvement plan from the audit lands adev at the `gcc` step (P3
driver model, P5 helper-side gates). The work in this note lands it at
the `clangd` step. Same compiler, different posture: AOT becomes
incremental, error discovery moves from "after the skill" to "as you
type."

That is the analogy completing itself. Once the daemon is in place,
every audit finding has a feedback loop of seconds rather than days,
and the agent's context carries the project's current invariants
without anyone having to remember to check.

## 11. Sources

- [OpenCode LSP docs](https://opencode.ai/docs/lsp/)
- [DeepWiki: OpenCode LSP Integration](https://deepwiki.com/sst/opencode/5.4-language-server-protocol-(lsp))
- [OpenCode Plugins](https://opencode.ai/docs/plugins/)
- [LSP 3.17 specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- [Pull Diagnostic Support for Neovim](https://atlee.ca/posts/pull-diagnostic-support-for-neovim/)
- [Marksman — markdown LSP](https://github.com/artempyanykh/marksman)
- [redhat-developer/yaml-language-server](https://github.com/redhat-developer/yaml-language-server)
- [Vale LSP](https://vale.sh/docs/guides/lsp)
- [Aider watch mode](https://aider.chat/docs/usage/watch.html)
- [Cursor Rules](https://cursor.com/docs/rules)
- [Cline (continuous supervisor pattern)](https://github.com/cline/cline)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Qodo — 2026 AI code review pattern predictions](https://www.qodo.ai/blog/5-ai-code-review-pattern-predictions-in-2026/)
- [Writing an LSP from scratch in Node](https://blog.abhinasregmi.com.np/blog/lsp-implementation)

---

## 12. Are lifecycle gates part of `diagnose`?

Yes — but as a **derived policy layer over diagnostics**, not as a parallel
subsystem. The distinction matters and deserves a clean answer because it
determines whether adev ends up with one source of truth or two.

### 12.1 The conceptual distinction

**Diagnostics** are observations of current state. *"This spec is missing a
citation."* *"`governance/review.yaml` has zero reviewers."* They are
facts about files.

**Gates** are decisions about whether forward motion is allowed.
*"You can't run validate because the implement step hasn't completed."*
They are policies about transitions.

The two are easily confused because a failing gate *looks like* a
diagnostic. But the difference is structural: diagnostics are about
**state at time `t`**; gates are about **transition from step `n` to step
`n+1`**. Some diagnostics never gate anything (a charter missing a
capability map is a problem; it doesn't block `validate` for an unrelated
spec). Some gates aren't naturally one diagnostic ("the prior step
completed" is queried from the lifecycle event log, not from a file's
schema).

### 12.2 The compiler answer

A compiler has *errors* (observations the analyzer makes — type mismatch,
undefined symbol, malformed AST) and **separately**, a driver policy
that says *"if any diagnostic of severity ≥ error was emitted by phase
N, do not invoke phase N+1."* The errors are produced by independent
passes; the gating is the driver's policy on the aggregated result.

There is exactly one source of truth (the diagnostic stream) and one
derived policy (the driver's gate). Replace either and the other still
works.

### 12.3 The adev shape

Apply the compiler discipline:

1. **Diagnostics are the foundation.** Every fact adev cares about — schema
   violations, missing citations, registry attrition, drift, status
   inconsistencies, lifecycle-event-log assertions — is a named diagnostic
   kind produced by the registry from §6.
2. **Gates are policies over diagnostics.** A new declarative file —
   `governance/lifecycle-gates.yaml` — maps each lifecycle step to the
   subset of diagnostic kinds that block entry to it.
3. **`adev gate require ...` is a thin query.** It runs the diagnostic
   set filtered to the relevant policy entry and exits non-zero if any
   fire.

```yaml
# .context-index/governance/lifecycle-gates.yaml
gates:
  plan:
    blockers:
      - adev/spec-status-not-review-passed
      - adev/charter-missing-capability-map
      - adev/spec-missing-required-section
  implement:
    blockers:
      - adev/plan-not-found
      - adev/plan-status-not-approved
  validate:
    blockers:
      - adev/implement-step-not-complete
      - adev/spec-missing-citations         # P2 grounding
      - adev/source-manifest-not-stamped
  retro:
    blockers:
      - adev/validate-step-not-complete
```

`adev/implement-step-not-complete` is itself a diagnostic — produced by
reading `.context-index/lifecycle-state/<slug>.jsonl` and folding events.
It's just a diagnostic whose *input source* is the event log rather than
a markdown file. The diagnostic registry doesn't distinguish; it just
runs producers.

### 12.4 Helper-side implementation

The `requireGate` helper from the dispatch-patterns §7 (helper-side
enforcement) becomes a one-liner over the diagnostic library:

```javascript
// lib/cli/gate.mjs
import { runDiagnostics } from '../diagnostics/index.mjs';
import { loadGates }      from '../governance/lifecycle-gates.mjs';

export async function require({ projectRoot, spec, step }) {
  const gates = loadGates(projectRoot);
  const blockers = gates[step]?.blockers ?? [];
  const firing = await runDiagnostics({
    projectRoot, spec, only: blockers, minSeverity: 'error',
  });
  if (firing.length > 0) {
    throw new GateError(step, firing);
  }
}
```

That's it. Every helper's first-line `requireGate(..., 'implement')`
funnels into this. P5 of the audit (status-advancement gate) becomes the
same library with a different `step` argument. The dispatch-patterns
three-layer enforcement (helper-side, UserPromptSubmit, future Anthropic
hook) all consult one function.

### 12.5 LSP surface — two views, one engine

The daemon exposes both:

| Request | Returns | Use |
| --- | --- | --- |
| `textDocument/diagnostic` | All diagnostics for the open file | Editor squiggly lines |
| `workspace/diagnostic` | All project diagnostics | Full-project view |
| `workspace/executeCommand` `adev/gate?step=validate&spec=...` | Only the diagnostics in `gates.validate.blockers` that are firing | Agent's PreToolUse pull |

In LSP terms, lifecycle-position diagnostics attach to the spec file's
frontmatter `status:` line, with a message like *"Cannot advance to
validated — `adev/implement-step-not-complete` (see
.context-index/lifecycle-state/<slug>.jsonl)"*. Same diagnostic
machinery, attached to the file that's blocking transition. Code actions
can offer *"Open lifecycle log"* or *"Mark implement complete (only if
…)"*.

### 12.6 Why this is better than two parallel systems

Three structural wins:

1. **One source of truth.** Every fact adev cares about lives in one
   registry. Changing how a check is implemented changes one file.
2. **Gates become declarative.** Today, "what blocks validate?" is
   spread across `skills/validate/SKILL.md` Step 0a inline Node, the
   `lib/lifecycle-state.mjs` `requireGate` function, and the
   `hooks/lifecycle-gate-*.sh` shell scripts. After this design, it's
   one YAML stanza.
3. **The LSP daemon is naturally the gate oracle.** No separate "gate
   server"; the daemon answers both "what's wrong with this file?" and
   "can I run step X?" from the same in-memory state.

### 12.7 Compiler analog, restated

`gcc` doesn't have a separate "is it OK to invoke `as` now?" subsystem.
It has the error stream from `cc1` and a one-line driver policy: *"if
`cc1` exited non-zero, do not run `as`."* The error stream is the
authoritative state; the gating is a function over it. Replace `cc1`'s
diagnostic kinds and the gate still works; replace the gate's policy
(e.g., `-Werror`) and the diagnostics still mean the same thing.

adev's lifecycle gates should sit in the same relationship to the
diagnostic registry: the gate is policy, the diagnostic is fact, and
the LSP daemon is the engine that produces facts which the gate
consumes.

### 12.8 Implication for the audit's improvement plan

This sharpens several P-items:

- **P5 (status-advancement gate)** becomes a thin wrapper over the
  diagnostic library; the actual logic moves to producers in
  `lib/diagnostics/lifecycle/*.mjs`.
- **P7 (deterministic verdict floor in review)** is similarly a policy
  over a `adev/review-blocker-finding` diagnostic — already implemented
  by `computeVerdict`, just re-exposed as a diagnostic producer.
- **New: `governance/lifecycle-gates.yaml`.** Replaces the implicit
  per-step gate logic scattered across SKILL.md prose. One file,
  schema-validated at install time per §2.3 (TableGen layer).
- **Existing `lifecycle.gate_mode: strict|advisory`** stays — it
  controls how the helper reacts to a fired gate (throw vs. warn), not
  how gates are defined. Same knob, simpler implementation underneath.

The unifying picture: **diagnostics are the IR; gates are link-time
checks; LSP is the incremental driver; helpers are the phase binaries;
hooks are cross-cutting concerns.** Each layer has one job, and the
compiler analogy is no longer doing structural work — it's just
describing the architecture.

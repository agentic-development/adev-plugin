# adev vs. a Compiler — How a Compiler Dispatches Sub-Operations

> Sibling to `adev-vs-compiler-comparison.md`, `adev-vs-compiler-gaps-and-practice.md`,
> and `adev-vs-compiler-empirical-audit.md`. Where the audit identified inline
> Node-in-SKILL.md as a top-rank defect (P3), this note answers the natural
> follow-up: *if a compiler doesn't have this problem, how does it dispatch
> sub-operations instead?* Three patterns answer the question, and all three
> map cleanly onto adev's roadmap.

## 1. The structural rule a compiler obeys

A compiler's **textual** artifacts (source files, linker scripts, Makefiles,
TableGen `.td`) are **declarative**: they say *what* to do, never *how* in
executable form. The compiler binary is the executor; the text is data.

Re-reading text and `eval`-ing it at runtime would be a category error.
SKILL.md with inline Node is precisely that error — a Makefile that contains
the `cc1` source code in the recipe. The audit found agents fleeing this
exact construct in real validate reports:

> *"SKIP: skipping heuristic extraction in this validation context to avoid
> side effects from inline Node invocation."*
> — `eval-projects/automation-eval-project.validate.md:125`

That is not an agent failure. It is the compiler refusing to `eval` its own
source code.

## 2. Three patterns compilers actually use

### 2.1 The driver model — `gcc` / `clang`

`gcc foo.c -o foo` is a thin dispatcher. It runs:

```
cpp foo.c | cc1 → foo.s
as  foo.s       → foo.o
ld  foo.o crt0.o -lc → foo
```

Each phase is a standalone binary with stable argv. The driver knows
*which* phase to run and *in what order* — nothing more. If you want to
change how `cc1` works, you change `cc1`; the driver doesn't care. Phase
binaries are unit-testable in isolation; argv is the contract.

**adev mapping.** `adev` becomes the driver. Concrete subcommands:

| Driver call | Phase binary | Replaces inline Node in |
| --- | --- | --- |
| `adev gate require --skill validate --spec <p>` | `lib/cli/gate.mjs` | `skills/validate/SKILL.md` Step 0a |
| `adev validate check --id 13 --spec <p>` | `lib/cli/validate-check.mjs` → `lib/checks/check-13.mjs` | `skills/validate/SKILL.md` Check 13 |
| `adev review dispatch --spec <p>` | `lib/cli/review-dispatch.mjs` | `skills/review-specs/SKILL.md` Step 5 |
| `adev heuristics extract --validate <p>` | `lib/cli/heuristics.mjs` | the heuristic-extraction inline block |

SKILL.md's job becomes documenting *which calls in what order* — it
describes the pipeline, never the implementation. This is not a novel
adev invention; it is the 1970s Unix compiler driver.

### 2.2 The registered-pass model — LLVM PassManager

Inside a single binary, LLVM has a `PassManager` holding a list of `Pass`
objects. Each pass has a stable interface (`runOnFunction(F)`,
`getAnalysisUsage()`). Selection is by ID:

```
opt -passes='mem2reg,instcombine,gvn' input.bc
```

The pass manager iterates and calls each by interface. "What passes to run"
lives in command-line flags or config; the *implementation* of each pass
is a compiled object — separate from the selection.

**adev mapping.** `governance/validate.yaml` is already this — for Check 1.
It lists work units by ID, references their implementation, declares
dispatch mode (`always` / `triggered` / `never`). Extending the pattern to
all 13 checks (`id: validate.check-13-heuristic-extraction`, `runner:
lib/checks/heuristic-extraction.mjs`, `severity: warning`) turns validate
into a real pass manager.

SKILL.md's prose-side job shrinks to one sentence:

> *"Iterate the validate registry; run each entry; aggregate verdicts via
> `computeVerdict`."*

The 30-line inline Node disappears because no individual check's logic
lives in the prose anymore — only its **ID** does. This is ADR-0003's
direction; Checks 2–13 just haven't followed Check 1's lead yet.

### 2.3 The TableGen / "declarative source compiled offline" model

LLVM has thousands of instruction definitions. They live in `.td` files
(TableGen). At LLVM-build time, `tblgen` *compiles* those declarations
into C++ headers that the LLVM binary uses. There is no runtime
interpretation; the declarative description becomes generated code.

This is the right model when the declarative thing is *static enough*
that compiling it once is cheaper than parsing it every run.

**adev mapping.** At install time (`npx @adev-org/adev-cli install`):

1. Validate the registry (`governance/validate.yaml`, `review.yaml`,
   `gates.yaml`) against a schema.
2. Resolve every `runner:` path; fail closed if any helper is missing.
3. Generate a dispatcher (`lib/_generated/dispatch.mjs`) that wires every
   ID to its runner — a normal Node module the CLI imports directly.
4. Stamp the resulting hash into `.context-index/manifest.yaml` so drift
   is detectable.

After install, `adev validate` imports the generated dispatcher and runs.
The agent runs `adev validate`; the dispatcher *is* the artifact;
SKILL.md becomes documentation of the contract for *humans*, not
something the executor parses on every invocation.

This is the genuinely compiler-like step adev has not yet taken. It is
also the cheapest way to make P1 (schema validation) and P6 (registry
attrition test) impossible to regress: a broken registry can't install.

### 2.4 Honorable mention — the plugin / hook model

GCC plugins are compiled `.so` files loaded via `-fplugin`. The compiler
`dlopen`s them and calls a known symbol. The plugin is binary; there is
no text the compiler must interpret.

**adev already follows this pattern for `hooks/`.** Hooks are subprocess
programs with a stable stdin/stdout/exit-code contract — exactly the
GCC-plugin shape. The inline-Node-in-SKILL.md style is the outlier; the
rest of adev already lives in the compiler's mental model. P3 just
extends an existing rule rather than introducing a new one.

## 3. The unifying principle

Across all four patterns the same rule holds:

> **Executable logic lives in compiled, tested, callable units; textual
> configuration references those units by name.** The compiler — and by
> analogy, the agent — never reads prose and decides whether to run code
> embedded in it. That decision was made once, by the build, when the
> unit was registered.

SKILL.md with inline Node violates this rule three ways:

1. The text is parsed every time (no compilation step).
2. The unit is not independently testable (no stable interface).
3. The executor (the agent) has to recognize *that* it is code, decide
   *how* to run it, and handle errors — every invocation.

A compiler that worked this way would also produce wrong outputs, but
for a more boring reason: it would simply be unreliable, and people
would stop using it. adev's failure mode is the same; the audit's
"45% of validate reports have no file:line citations" is what that
unreliability looks like in practice.

## 4. Layered roadmap

The three patterns are not either/or; they layer. adev's path to
compiler-grade dispatch is:

| Layer | adev artifact | Compiler analog | adev status |
| --- | --- | --- | --- |
| Single-shot helpers, argv contract | `lib/cli/<verb>.mjs` invoked via `adev <verb>` | `cc1`, `as`, `ld` | partial (`adev status`, `adev migrate` exist; helpers per-check do not) |
| Registry of work units | `governance/<skill>.yaml` with `id` + `runner` per entry | LLVM PassManager + `opt -passes=...` | started (Check 1 only) |
| Compiled glue / validation | Install-time codegen from the registry; fail closed on schema | TableGen → generated headers | not started |
| Subprocess hooks | `hooks/*.sh` and `hooks/*.mjs` | GCC `-fplugin` | mature |

Layer 4 already works well. Layers 1 and 2 are partial. Layer 3 — the
TableGen-equivalent — is the genuinely new step.

## 5. Execution order for P3 in light of this

The audit's P3 ("move inline Node out of SKILL.md") was correct but
under-specified. The compiler analogy refines it into a three-step
sequence that lands the easiest part first:

1. **Layer 1 first** — extract the most-skipped check (Check 13 heuristic
   extraction) to `lib/cli/heuristics.mjs`, wire `adev heuristics extract`,
   write a test, replace the inline block with the one-line call. One
   skill, half a day. Lifts heuristic-extraction rate from 12/71 → ~71/71
   on its own.
2. **Layer 2 next** — add `runner:` paths to every entry in
   `governance/validate.yaml` and `review.yaml`. Each skill iterates the
   registry instead of describing the work inline. Removes ~30% of every
   skill's word count. Two to three days of mechanical extraction.
3. **Layer 3 last** — install-time validation + generated dispatcher.
   Makes layers 1 and 2 unable to regress. One day, once layers 1 and 2
   are in place.

Done in that order, each step is independently shippable, each landed
helper buys testability immediately, and the final TableGen-equivalent
step is the smallest because the prior steps already produced the
declarative source it compiles.

## 6. What this implies for the analogy itself

The original `adev-vs-compiler-comparison.md` argued the analogy is
structurally real but the implementation has not earned all of its
vocabulary. Each compiler dispatch pattern in this note is one of the
vocabulary items adev can earn cheaply:

- **Driver** — earnable in days. Just CLI subcommands and helpers.
- **PassManager** — earnable in a week. Mostly already designed
  (ADR-0003); needs to spread from Check 1 to Checks 2–13 and to all
  reviewers.
- **TableGen** — earnable in a day *after* the prior two. Install-time
  codegen of a dispatcher that imports the helpers and references the
  registry.
- **Plugins** — already earned by `hooks/`.

The slogan: **prose describes the pipeline; the driver runs it; the
registry names what's runnable; helpers do the work.** Each role
belongs to exactly one component, and none of them is the agent reading
and interpreting Node out of a markdown file.

Once those four components are in place, the compiler analogy stops
being a research instrument and becomes a maintenance one — every
question about adev's design ("where should X live?") has a one-line
answer keyed off this table. That is the real prize: not imitating
LLVM, but making the framework's *own* decisions cheap because the
mental model is shared across everyone working on it.

---

## 7. Why helper-side gating beats hook-side gating

A natural follow-up to the driver model: *can we use Claude Code hooks to
guarantee preconditions before a skill runs?* The intuitive answer —
`PreToolUse` with `"matcher": "Skill"` — does not currently work. Verified
against the Claude Code documentation:

> The supported `PreToolUse` matchers are: `Bash`, `Edit`, `Write`,
> `Read`, `Glob`, `Grep`, `Agent`, `WebFetch`, `WebSearch`,
> `AskUserQuestion`, `ExitPlanMode`, and MCP tools.
> The `Skill` tool is **not** in the matcher list, and there is no
> `PreSkill` / `SkillStart` event.
> — `https://code.claude.com/docs/en/hooks.md`

So the "hook gates the skill at its boundary" approach is unavailable
today. What *is* available, and what each option covers:

| Mechanism | Covers user-typed `/adev:foo` | Covers agent-internal Skill call |
| --- | --- | --- |
| `UserPromptSubmit` hook | yes | no |
| `PreToolUse` on `Bash` / `Edit` (adev today) | fires *after* skill starts | fires *after* skill starts |
| Inline `requireGate` in SKILL.md (adev today) | depends on agent | depends on agent |
| **Helper-side `requireGate` (driver model, §2.1)** | yes | yes |

The first three each leave a path around the gate. Only the last is
unconditional.

### 7.1 The compiler argument

A compiler driver does not rely on the caller to check that the
preprocessor produced parseable output. `cc1` itself refuses to compile
malformed input. The check lives **inside** the binary that does the work,
which is why no caller can bypass it. There is no equivalent of "the user
forgot to gate me" in a compiler pipeline.

Translated to adev: when the implementation of a skill lives in
`lib/cli/<verb>.mjs` (per §2.1), `requireGate` is the helper's first line
of code. The SKILL.md prose may *also* tell the agent to invoke
`adev gate require ...` as a fail-fast courtesy, but if the agent skips
that line and runs `adev validate run` directly, the helper still throws
on entry. There is nowhere to skip to. This is qualitatively stronger than
any hook, because the gate is no longer separable from the work it
guards.

### 7.2 Three-layer enforcement model

For each lifecycle skill, the gate should be enforced at three layers in
priority order:

**Layer 1 — Helper-side gate (mandatory).**
Every `lib/cli/<verb>.mjs` calls `requireGate` as its first action. The
gate is uncircumventable because it lives inside the executor.

```javascript
// lib/cli/validate.mjs
import { requireGate, currentState, reportStep } from '../lifecycle-state.mjs';
import { loadManifest, resolveGateMode } from '../manifest.mjs';

export async function run({ projectRoot, spec }) {
  const state = currentState(projectRoot, spec);
  const mode  = resolveGateMode(loadManifest(projectRoot));
  requireGate(state, 'implement', { mode });   // throws GateError
  reportStep(projectRoot, spec, { step: 'validate', status: 'started' });
  // ... actual check work follows
}
```

This is the dispatch-patterns approach made concrete. Layer 1 alone is
sufficient for correctness.

**Layer 2 — `UserPromptSubmit` hook (defence in depth).**
A new `hooks/skill-precheck.sh` fires on prompt submit, parses leading
`/adev:<skill>`, and runs the same gate. Catches the user-typed case
*before* the agent even loads the SKILL.md, which buys faster failure and
a clearer error message. Does not catch agent-routed Skill calls — Layer 1
covers those. Strictly additive to Layer 1.

**Layer 3 — File the Anthropic feature request.**
Ask for `Skill` to be a `PreToolUse` matcher, with the matcher able to
filter by `tool_input.skill_name`. That would close the agent-routed gap
at the harness level. Until and unless it lands, Layer 1 is the only
enforcement that survives all three call paths.

### 7.3 Implication for the audit's improvement ranking

The audit's P-list shifts:

- **P5 (status-advancement gate in `lib/lifecycle-state.mjs`)** is exactly
  Layer 1 applied to the status field. Stays as-ranked, gains weight.
- **P3 (move inline Node out of SKILL.md)** becomes *more* important, not
  less, because the helpers it produces are the Layer 1 enforcement
  sites. Doing P3 without Layer 1 wastes most of its value; doing Layer 1
  without P3 is impossible (there is nowhere to put the gate).
- **P23 (new) — File `PreToolUse: Skill` feature request with Anthropic.**
  Impact 3 (closes the agent-routed gap cleanly if landed), effort 1
  (file an issue), but timeline is out of adev's control. Track but do
  not block on it.
- **P24 (new) — Add `hooks/skill-precheck.sh` for `UserPromptSubmit`.**
  Impact 2 (fast user-side rejection), effort 1. Strictly additive to
  Layer 1 and worth doing once Layer 1 lands.

### 7.4 The structural takeaway

The instinct to reach for hooks first is reasonable but inverted. Hooks
are *cross-cutting* concerns (trailers, session capture, drift detection)
that should fire regardless of which skill is running. Gates are
*skill-specific* concerns that belong inside the skill's executor. Trying
to gate from outside the executor is what produced the current situation:
gate logic scattered across SKILL.md prose, `hooks/lifecycle-gate-*.sh`,
and `hooks/_lifecycle-gate-check-*.mjs`, none of them complete on their
own.

Moving the gate to Layer 1 collapses three half-implementations into one
authoritative one. The hook layer is freed to do what hooks are actually
good at: cross-cutting work that has nothing to do with which skill the
agent just invoked.

That collapse — gates inside the executor, hooks outside — is the same
discipline a compiler enforces by construction. Helper-side enforcement
is not a workaround for the missing `Skill` matcher; it is the right
answer regardless of whether the matcher ever ships.

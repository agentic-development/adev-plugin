# adev vs. a Compiler — A Structural Comparison

> Research note. Captures a mental model: adev's lifecycle is structurally a
> compiler pipeline whose source language is natural-language intent and whose
> machine code is committed source. The analogy is useful for explaining the
> framework to engineers, and for designing new skills/hooks consistently with
> the rest of the pipeline.

## TL;DR

A compiler transforms *high-level source* into *low-level machine code* through
a fixed sequence of phases that each consume and produce typed artifacts, while
enforcing invariants (types, scope, ABI). adev does the **same shape of work
one level up**: it transforms *high-level human intent* into *committed source
code* through a fixed sequence of skills that each consume and produce typed
artifacts in `.context-index/`, while enforcing invariants (constitution,
charter scope, lifecycle gates).

Where a compiler is a *deterministic pure function* from text to bytes, adev is
a *stochastic, human-in-the-loop process* from intent to repository state.
Everything else — phasing, IR, symbol tables, diagnostics, linking, incremental
builds — has a direct counterpart.

---

## 1. Pipeline correspondence

The clearest mapping is phase-by-phase.

| Compiler phase                    | adev skill / artifact                                | Shared role                                              |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Driver / build config             | `/adev:init`, `manifest.yaml`, `platform-context.yaml` | Configure the run; declare modules and targets         |
| Lexer (tokens)                    | `/adev:brainstorm` → Feature Charter                 | Turn raw input into named, scoped units                  |
| Parser (AST)                      | `/adev:specify` → Live Spec                          | Impose structure: acceptance criteria, contracts         |
| Semantic analysis / type check    | `/adev:review-specs`                                 | Reject ill-formed inputs before lowering                 |
| IR generation / lowering          | `/adev:plan` → ordered tasks                         | Decompose into a sequence of executable units            |
| Optimization passes               | `simplify`, `codehealth`, refactor inside implement  | Improve quality without changing observable behavior     |
| Code generation                   | `/adev:implement` (TDD: red → green → commit)        | Emit the target artifact for each unit                   |
| Linker                            | `/adev:hygiene`, `/adev:sync`, `/adev:reconcile`     | Resolve cross-module references, propagate symbols       |
| Static analyzer / test suite      | `/adev:validate`, `/adev:write-test`                 | Verify the emitted artifact against the contract         |
| Debugger / symbol table info      | `Spec:` and `Plan-task:` commit trailers             | Map output (commits) back to input (spec) for traceability |
| Diagnostic emission               | Hook exit-2 messages, validate FAIL rows             | Stop the build with actionable errors                    |
| `-v` / build log                  | `.context-index/sessions/`, `/adev:retro`            | Post-hoc inspection of what the pipeline did             |
| Incremental rebuild (`make`/ccache) | `/adev:build` + `.context-index/build-state/`      | Resume without re-doing settled work                     |
| Linker script / module map        | `manifest.yaml` `modules:`, `sync.targets`           | Declare what gets combined and where                     |

The skill ordering enforced by `hooks/lifecycle-gate-*.sh` and
`lib/lifecycle-state.mjs` is the analog of a **compiler driver**: it refuses to
run code-gen until parsing succeeded, refuses to validate until implement
completed, and so on. `requireGate(state, "implement", { mode })` in
`skills/validate/SKILL.md` is the same idea as `cc1` refusing to start without
the preprocessor's output.

---

## 2. Conceptual similarities

### 2.1 Both are typed pipelines over intermediate representations

A compiler never operates on raw source text after the lexer — it operates on
ASTs, then on IR, then on machine instructions. Each phase has a well-defined
input type and output type, and phases are composable only because those types
are stable.

adev does the same. The IR is the `.context-index/` directory:

- `specs/features/<module>/charter.md` — top-level program structure
- `specs/features/<module>/*.spec.md` — typed contracts
- `tasks/tasks.md` — lowered, ordered task list
- `build-state/` — resumable state for the orchestrator
- `sessions/` — debug symbols / build log

These markdown + YAML files are not documentation in the human sense; they are
**serialized IR**. Skills consume and produce them in a fixed shape, just as
LLVM passes consume and produce `.bc` files.

### 2.2 Both enforce invariants that cannot be expressed in the source

A C compiler enforces invariants the source code itself cannot state: scoping
rules, type compatibility, ODR, calling conventions. The programmer can't write
"please type-check me" — the *compiler* knows the rules.

adev enforces invariants that the user's prompt cannot state:

- `constitution.md` — non-negotiable principles (the project's "ABI")
- Charter scope — a spec cannot cross charter boundaries (the project's "module system")
- Lifecycle order — you cannot plan before specifying (the phase graph)
- Provenance trailers — every commit carries `Author-type`, `Operator`, `Spec:` (the project's "debug info")

A constitution violation in adev is structurally the same kind of error as a
type error in C++: the user didn't ask for it to be checked, but the framework
checks it anyway and refuses to continue.

### 2.3 Both have a separation of front-end and back-end

Compilers separate the **front-end** (language-specific parsing, semantic
analysis) from the **back-end** (target-specific code-gen), with an IR in
between. This is why `clang` can target ARM and x86 from one parser.

adev separates the **intent-side** skills (`brainstorm`, `specify`,
`review-specs`) from the **execution-side** skills (`implement`, `validate`,
`debug`), with `plan` as the bridge that lowers an intent artifact into an
execution-ready task list. This is why the same spec can drive implementation
in Python, TypeScript, or Rust: the spec is the IR; the language is the
target.

### 2.4 Both have linking and whole-program concerns

A single object file can be self-consistent and still break at link time
because it references a symbol no one defines. The linker resolves cross-unit
references and rejects unresolved ones.

adev's `/adev:hygiene` and `/adev:reconcile` do the same job at the lifecycle
level: detect drift between spec and code, find commits without `Spec:`
trailers, surface dangling tasks. `.context-index/hygiene/` is the equivalent
of `ld`'s symbol table — a global view that no individual skill can see from
its own scope.

### 2.5 Both are incrementally rebuildable

`make` only rebuilds what changed. `/adev:build` + `build-state/` only resumes
unfinished tasks. `/adev:retro` regenerates the session summary from the log
rather than re-running the work. The recurring pattern: **persistent
intermediate artifacts + a state file = incremental execution**.

---

## 3. Conceptual differences

### 3.1 Determinism vs. stochasticity

A compiler is, modulo bugs, a **pure function**: same source + same flags →
same bytes. This is what makes reproducible builds even possible.

adev is **not** a pure function. The same charter run through `/adev:specify`
twice will produce two different specs, because the executor is an LLM. This
is why adev invests so heavily in *artifacts*: the IR is the source of truth
precisely because the process that produced it is not reproducible. A
compiler trusts its phases; adev trusts its files.

Practical consequence: in a compiler you debug by re-running with `-v`; in
adev you debug by reading the spec and the session log, because re-running
won't give you the same trace.

### 3.2 Formal grammar vs. natural language

A compiler's input is a context-free (mostly) language with a published
grammar. Rejection criteria are mechanical: either the parser accepts it or it
doesn't.

adev's input is English prose plus partial structured markdown. Rejection
criteria are **semi-formal**: `review-specs` can check that a spec has
acceptance criteria, but it cannot mechanically check that those criteria
capture user intent. This is why `review-specs` exists as a separate phase —
it's the closest adev gets to a type-checker, and it explicitly admits that
some judgment calls require a human.

### 3.3 Closed system vs. world-interacting

A compiler is hermetic: it reads source, writes bytes, touches nothing else.
adev modifies a git repository, opens issues, posts PRs, and runs tests
against real services. The "output" is not a single artifact but a *state
change in the world*. This is why adev needs hooks like `merge-guard.sh` and
`session-capture.sh` — to mediate effects that a compiler would never have.

### 3.4 Optimization is not behavior-preserving

Compiler optimization passes are required to preserve observable behavior.
Constant folding, inlining, dead-code elimination — all illegal if they change
what the program does.

adev's "optimization passes" (`simplify`, `codehealth`, refactor) are also
nominally behavior-preserving, but the framework cannot prove it. The proof
obligation is shifted onto `/adev:validate` and the test suite. In compiler
terms: adev runs its optimizer **and then re-runs the test suite** as the
correctness witness, because the optimizer is untrusted.

### 3.5 Wall-clock time scale

A compile takes milliseconds to minutes. An adev cycle takes minutes to days.
This shapes every design decision: persistent IR on disk (you can't keep it in
RAM across sessions), resumable build state, session capture, commit trailers.
A compiler doesn't need any of that because it never gets interrupted.

---

## 4. Technical similarities

### 4.1 Phase gating via exit codes

The hook protocol in `CLAUDE.md` — "exit 0 (allow) or 2 (block)" — is the same
discipline as a compiler driver chaining phases via exit status. `cc` doesn't
run the assembler if `cc1` returned non-zero; adev doesn't run `implement` if
the `lifecycle-gate-*.sh` hook returns 2. The mechanism is identical: a
typed status code at a process boundary.

### 4.2 Manifests as build graphs

`manifest.yaml`'s `modules:` and `sync.targets:` sections play the role of a
Makefile or `Cargo.toml`: they declare the units of compilation and how their
outputs are combined. `lib/manifest.mjs` (`loadManifest`) is the manifest
parser; skills consume the parsed manifest the way `cargo build` consumes
`Cargo.toml`.

### 4.3 Trailers as DWARF

`Spec:` and `Plan-task:` commit trailers are debug info. They let you take a
runtime artifact (a commit, a line of code) and recover the source-level
construct that produced it (the spec, the plan task). This is the same job
DWARF does for compiled binaries — a side-channel of metadata that the build
pipeline writes so later tools can reverse the mapping.

### 4.4 Hooks as compiler plugins

`hooks/hooks.json` registers programs that run at well-defined points
(`PreToolUse`, `PostToolUse`, `SessionStart`, etc.). These are the framework's
extension points — the same shape as GCC plugins or LLVM passes registered
into `opt`. They run in-process, observe the IR (tool input/output JSON), and
can veto or annotate it.

### 4.5 Stateful build directories

`.context-index/build-state/`, `tasks/`, and `sessions/` together play the role
of a compiler's build directory (`target/`, `build/`, `obj/`). They contain
partial outputs, dependency information, and per-phase state. The convention
"never check `target/` into git, but always check the source" maps directly:
adev does check `.context-index/` in, because for adev that directory is the
*source code of the process*, not the build output.

---

## 5. Technical differences

### 5.1 Substrate

A compiler's IR is a typed in-memory data structure (AST, SSA, MIR). adev's
IR is text on disk (markdown + YAML). This is dictated by the executor: the
LLM cannot consume an AST in memory, but it can read markdown. The cost is
that adev cannot do the kind of structural rewriting an optimizing compiler
does — you can't easily run a "constant folding pass" over a spec.

### 5.2 Execution engine

A compiler executes its own phases. adev does **not** execute its skills —
it ships them as instructions for an external executor (the LLM in Claude
Code / OpenCode / Codex). adev is more accurately a *compiler-as-a-library*
or a *compiler specification*, where the harness provides the execution.
This is why skills are markdown: they are the source code of the compiler,
read by the LLM at runtime.

### 5.3 Failure modes

A compiler's failure modes are bounded: syntax error, type error, link error,
internal compiler error. adev's failure modes include all of those (gate
errors, constitution violations, spec malformation) **plus** open-ended ones
(the LLM did the wrong thing, the spec was ambiguous, the test passes but
doesn't test the right behavior). Handling the long tail is why
`/adev:validate` is so much more elaborate than a type-checker.

### 5.4 No undefined behavior

A compiler exploits UB for optimization. adev has no equivalent — every gap
in the spec is a place where the LLM will make something up, and the result
is usually worse, not faster. The design pressure is the opposite: where C++
benefits from leaving things unspecified, adev benefits from over-specifying.

---

## 6. Why the analogy is useful

When designing a new adev skill or hook, ask "what compiler phase is this?"
The answer constrains the design:

- **A linter-like skill** should run early, be advisory, and never block the
  pipeline by default (cf. `lifecycle-gate-advisory.sh`).
- **A code-gen-like skill** should be deterministic given its inputs *to the
  extent the LLM allows*, persist its output to a known location, and emit
  trailers so the linker phase can find its work.
- **A linker-like skill** must be allowed to see the whole project, not just
  one module, and must run after all code-gen has settled.
- **A new IR artifact** belongs in `.context-index/`, must have a documented
  schema, and must be produced by exactly one skill (the way only one phase
  produces each IR level in a compiler).

When the analogy breaks, that's a design signal too: if a proposed skill has
no compiler counterpart, it's probably either (a) wrongly scoped, (b) actually
two skills, or (c) a genuine extension of the model (e.g., `/adev:retro`,
which is closer to *profiler* than compiler — and that's fine, profilers are
adjacent tooling, not part of the pipeline).

---

## 7. Summary table

| Dimension          | Compiler                                | adev                                                |
| ------------------ | --------------------------------------- | --------------------------------------------------- |
| Input              | Source text in a formal grammar         | Natural-language intent + structured markdown       |
| Output             | Machine code / bytecode                 | Committed source code + repo state                  |
| IR                 | AST, SSA, MIR (in-memory)               | `.context-index/` files (on-disk)                   |
| Phase ordering     | Driver, enforced by exit codes          | Lifecycle gates in `lib/lifecycle-state.mjs`        |
| Invariants         | Type system, scope, ABI                 | Constitution, charter scope, provenance trailers    |
| Diagnostics        | Compiler errors / warnings              | Hook exit-2 messages, validate FAIL report          |
| Extensibility      | Compiler plugins, custom passes         | `hooks/` + custom skills                            |
| Incrementality     | `make`, ccache, sccache                 | `/adev:build` + `build-state/`                      |
| Traceability       | DWARF, source maps                      | `Spec:` / `Plan-task:` commit trailers              |
| Executor           | The compiler binary itself              | An external LLM agent (harness-provided)            |
| Determinism        | Pure function                           | Stochastic, human-in-the-loop                       |
| Time scale         | ms–min                                  | min–days                                            |
| Effect on world    | None outside output file                | Modifies git, issues, services                      |

The one-line version: **adev is a compiler whose source is human intent,
whose IR is markdown, whose code-gen is an LLM, and whose linker is a human
review.**

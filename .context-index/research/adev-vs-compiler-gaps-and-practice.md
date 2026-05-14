# adev vs. a Compiler — Gaps, Critical Flaws, and Intent vs. Practice

> Companion to `adev-vs-compiler-comparison.md`. The first note maps the
> structural analogy. This note pushes on it: what's *missing* from adev that a
> compiler has, what each side gets badly wrong, and how adev's own
> `.context-index/` reveals where the framework has drifted from its original
> intent.

## 1. What's missing from adev (compared to compiler theory)

The compiler analogy is generous — it loans adev a lot of vocabulary it has
not actually earned. Each of the following is a thing every serious compiler
has, that adev either lacks entirely or simulates with a fragile substitute.

### 1.1 No formal grammar for the IR

A compiler IR has a grammar. ASTs/SSA/MIR are parseable, validatable,
round-trippable. Specs are markdown — a *convention*, not a grammar. Two
specs can both pass `review-specs` and still be mutually contradictory; nothing
in the framework can detect that, because the framework cannot parse them
beyond the level of "does it have a `## Behavioral Contract` heading?"

The evidence for this is unsubtle: the `agent-reliable-state-artifacts`
charter exists because the framework's own state files were being corrupted
by the framework's own executor. The fix — JSON for relational state, JSONL
for events — is exactly the move from "convention" to "grammar."

### 1.2 No canonical hash or content-addressed cache

`ccache` works because the compiler's input/output are content-addressable.
adev has SHA-stamping in `review-specs`, but `v1-release-research.md` lists
"review-specs SHA drift" as a *critical* 1.0 blocker — the canonicalization
isn't canonical. Without stable hashes, "did we already do this work?" is
unanswerable, which is why every skill currently re-derives state from
scratch.

### 1.3 No alias / dependency analysis

A compiler knows that two pointers can refer to the same object and conducts
itself accordingly. adev does not know when two specs touch the same code, or
when a charter capability is silently redefined by a downstream spec. The
linker analog (`/adev:hygiene`) runs by filename and grep, not by symbolic
cross-reference. With 40 charters in this repo, an "unused symbol" warning
would be very loud — but there is no warning, so the symbols accumulate.

### 1.4 No SSA / immutable IR

SSA was a major compiler advance because it makes IR *immutable*: every
assignment produces a new name. adev specs are by design *Live Specs* —
mutated in place by `/adev:specify`, `/adev:debug`, and `/adev:validate`.
This is the opposite discipline. The cost: the only way to reason about a
spec's history is through git, and git can't show you which skill made which
change without a Spec-trailer regime that — see §3 — barely exists in
practice.

### 1.5 No type system on specs

A C function has a signature. A spec has prose. There is no machine-checkable
way to assert that the output of `task-management` is consumable as input to
`agent-reliable-state-artifacts`. The "Ownership Note" at the top of
`agent-reliable-state-artifacts/charter.md` is a hand-written substitute for
what a type system would express in one line.

### 1.6 No ABI / linkage

When `task-management` exports a contract, that contract is English. There is
no symbol table, no version negotiation, no link-time check that consumers
still satisfy producers' invariants. ADR-0003 was revised mid-flight to extract
sandbox concerns into ADR-0004 specifically because the implicit linkage
between governance files was breaking down — that's an ABI problem solved by
splitting the namespace, exactly the way `libc.so.6` would.

### 1.7 No fixed-point passes

LLVM runs many passes to a fixed point. adev skills are one-shot. There is no
"run review-specs until it converges," no "re-validate until no findings
change." This makes adev's quality gates *sample-once* rather than
*converged* — which is fine if the sample is reliable, and a problem when it
is not (see §2.2).

### 1.8 No register allocation for the LLM context window

A compiler treats registers as a finite resource and allocates them with
care. The LLM's context window is *exactly* that resource — finite,
expensive, and the bottleneck on every skill. adev does not allocate it. The
existing research notes
(`token-consumption-patterns-in-adev-lifecycle.md`,
`token-cost-logging-for-plugin-lifecycle-sk.md`) recognize the problem; the
framework has not yet acted on it.

### 1.9 No dead-code elimination

This repo has 40 charters and roughly 200 specs. The framework provides no
pass that asks "is this charter ever referenced?" or "has this spec been
implemented or abandoned?" A compiler that never DCE'd would ship binaries
megabytes larger than necessary; adev ships a `.context-index/` with the
same problem.

### 1.10 No undefined-behavior model

C's UB is documented and exploited. adev's gaps in specs are documented
nowhere and *interpolated* by the LLM in unpredictable ways. There is no
"signed overflow is UB"-style document. Every gap is a place where the
executor will fabricate, and the framework will not know it happened.

### 1.11 No verified-compiler analog

CompCert proves its IR transformations preserve semantics. adev offers no
proof — formal or even informal — that `spec → plan → code` preserves intent.
The entire correctness argument is "we run `/adev:validate` after." When
`/adev:validate` itself is hallucinating PASS results (see §2.4), the
argument collapses.

### 1.12 No reproducible build

Two runs of `/adev:specify` on the same charter produce two different specs.
This is a property of the executor, not adev itself — but it means none of
the downstream guarantees that *depend* on reproducibility (cache validity,
bisection, regression test minimization, blame) can be inherited from
compiler practice. They have to be reinvented as artifact discipline.

---

## 2. Critical flaws — of both

### 2.1 Critical flaws of compilers

Compilers are by no means perfect, and the analogy understates a few of their
chronic problems:

- **Diagnostics are bad far more often than they should be.** "Expected `;`
  before `}`" at line 4000 when the real error is at line 12.
- **Optimizer-introduced bugs.** UB exploitation famously breaks code that
  every human reader considers obviously correct.
- **Closed-world assumption.** The source is the spec. There is no separate
  intent artifact to check the source against — the compiler cannot tell you
  "this program type-checks but does not do what you said you wanted."
- **No runtime feedback to the author.** AOT compilers don't learn from
  observing the program run.
- **Brittle to malformed input** — but at least it fails *visibly*.
- **Decades-long evolution.** The compiler that ships next year will look
  very much like the one that shipped last year.

### 2.2 Critical flaws of adev

The framework's own files document most of these.

**(a) The executor is the optimizer, and it is not behavior-preserving.**
`/adev:simplify`, `/adev:codehealth`, refactor passes inside `/adev:implement`
— all rely on an LLM that does not have a proof obligation. The validate pass
is the only behavior-preserving check, and §2.4 below says how well that
works.

**(b) The IR is unsafe in the presence of the executor.** The single most
telling fact in the repository: the dominant in-flight charter is
`agent-reliable-state-artifacts`, whose first paragraph says:

> All three [markdown tables, YAML frontmatter, ad-hoc YAML] are fragile
> under LLM-mediated updates — research confirms agents misparse columns,
> drop fields on regeneration, and accumulate multi-format compatibility
> branches.

That is: the framework cannot reliably read and write its own state when
operated by its own intended executor. The fix is a massive IR substrate
migration to JSON/JSONL. In compiler terms, this is the equivalent of LLVM
realizing its bitcode is corrupted on disk by the optimizer itself and
shipping a new bitcode format mid-version.

**(c) DWARF is empty.** `v1-release-research.md`: *"Spec commit trailers at
0% coverage across 204 commits."* The traceability layer that the constitution
mandates is essentially unadopted. You cannot, in this repo, reliably trace a
runtime artifact (a commit, a line of code) back to the source-level construct
(the spec) that produced it. The debug-info pipeline is wired but the data
isn't there.

**(d) The type-checker hallucinates.** `v1-release-research.md`'s top
critical blocker is *"ghost validation — `/adev:validate` fabricates PASS."*
Imagine a compiler that randomly emitted "no errors" without running. That is
the present state of the validate phase. The whole correctness story
collapses behind it.

**(e) Lifecycle gates have an advisory escape valve.** `lifecycle.gate_mode:
strict|advisory` exists, and the codebase clearly uses advisory mode in
places. This is the type-checker with `-fno-strict` enabled by default — an
invariant downgraded to a suggestion as soon as it became inconvenient.

**(f) The framework optimizes for adding charters, not removing them.**
There is no consolidation pass. Each new idea wants its own charter; nothing
in the lifecycle pushes back with "this is one spec under an existing
charter." Forty charters, several of which (assessment/cli/design/hooks/
implementation/maintenance/setup/planning/validation per the v1 research)
are missing capability maps — so the topmost-level IR isn't even
well-formed.

**(g) Recent work is dominated by *meta*-features.** The
`agent-reliable-state-artifacts`, `unified-gates`, `tiered-test-gates`,
`spec-lifecycle`, and `session-awareness` charters are not features for
end-users. They are the framework refactoring its own substrate. The
analogy: if half of LLVM's commits were fixing LLVM corrupting its own IR,
we'd say LLVM was in trouble. adev is in that state right now and treating
it as normal.

**(h) Heuristic extraction is wired only at the prompt level.** *"15 PASS
validations, only 2 heuristics extracted."* The feedback loop from
validation to learned project rules — the framework's nearest analog to
profile-guided optimization — exists in the skills but doesn't fire in
practice.

**(i) Path-dependence on session order.** Two operators running the same
skills in different orders get different artifacts. The lifecycle gates
constrain *some* orderings but underdetermine outcome.

**(j) Trust boundary on the operator.** Provenance trailers are stamped by
hooks running in the operator's own shell. They are not cryptographically
signed and not verified by anything downstream. The integrity of the DWARF
analog is operator-dependent.

**(k) Templates assume a domain.** `charter-spec-domain-fit.md` already
documents this: Domain Model assumes entities, Interface Contracts assume
function exports, TDD assumes red-green-refactor — none of which fit dbt,
Terraform, CI/CD, or frontend-component domains cleanly. The "front-end /
back-end" separation the analogy promises (one spec, many targets) is more
aspiration than reality.

**(l) Ceremony cost.** Eight skills in the lifecycle. A one-line bug fix
should not require a brainstorm → specify → plan → implement → validate
chain, and in practice it doesn't, which is itself the problem: the lifecycle
is bypassed often enough that gate adherence becomes optional.

---

## 3. Intent vs. practice — what `.context-index/` actually shows

The most honest source of truth about adev's drift is adev's own files.
Cross-referencing `README.md`, `constitution.md`, the ADRs, the 40 charters,
the ~200 specs, and the research notes yields a clear picture.

### 3.1 Original intent (declared)

From `README.md` and `constitution.md`:

- **Zero external dependencies** (Constitution principle 1)
- **Skills are primarily markdown** (Constitution principle 2)
- **Lightweight scaffolding** ("`/adev:init` creates a `.context-index/`
  directory — a structured knowledge base")
- **Anchored on the Agentic Development Handbook**
- **One-line quick-start** (`/adev:init`, then `/adev:work`)

The pitch is: a small markdown-first framework with a few hooks and a small
CLI, providing structure for AI-assisted development.

### 3.2 Practice (observed)

What this repo actually looks like:

| Dimension                    | Intent                             | Practice (this repo)                                                                                |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| External deps                | Zero, justified per ADR            | Still ~zero, but ADRs 0001/0002/0006 already carve out tree-sitter, TypeScript, dotenvx exceptions  |
| Markdown-first skills        | All skills are markdown-only       | `agent-reliable-state-artifacts` charter explicitly moves authoritative state *out* of markdown    |
| Lightweight scaffolding      | Small `.context-index/`            | 40 charters, ~200 specs, 8 ADRs; reports/, research/, governance/, hygiene/, sessions/, etc.        |
| Lifecycle                    | 8-skill loop, optional ceremony    | Hard-gated by `lib/lifecycle-state.mjs`, with an advisory escape valve                              |
| Quick-start promise          | `/adev:init` → `/adev:work` → done | `/adev:init` produces a non-trivial scaffold; `/adev:work` is one of ~30 skills                     |
| Traceability via trailers    | Required by Constitution           | 0% adoption across 204 commits (`v1-release-research.md`)                                           |
| Validation as a gate         | Quality assurance                  | "Ghost validation" — top critical 1.0 blocker                                                       |
| Self-learning via heuristics | Captured from PASS validations     | "Not wired" — 15 PASS validations, 2 heuristics                                                     |
| Domain-agnostic templates    | Capability maps for any domain     | `charter-spec-domain-fit.md` documents strain on data, infra, CI/CD, frontend                       |

### 3.3 The framework has acquired a second mission

The most striking pattern is that recent commits are not user-facing features
— they are meta-features. The framework is refactoring itself.

Charters in flight or recently shipped that exist to fix the framework, not
extend user value:

- `agent-reliable-state-artifacts` — IR substrate migration; the framework
  cannot reliably persist its own state under its own executor.
- `unified-gates` — consolidating multiple gate-implementation pathways.
- `tiered-test-gates` — gating discipline as a system.
- `spec-lifecycle` — formalizing the IR's own state machine.
- `session-awareness` — execution state across sessions, format migration.
- `milestone-lifecycle` — milestone state, format migration.
- `agent-reliable-state-artifacts` again — supersedes storage decisions of
  four sibling charters.

In compiler terms, this is "we are spending a release rewriting the IR layer
because the optimizer corrupts the IR." That is a legitimate and necessary
investment — but it is *not* what the README sells, and it is the dominant
content of the codebase right now.

### 3.4 Where the original mission is going well

It is worth being fair: the analogy has earned a lot of vocabulary, and a
lot of the structural mapping is real and working.

- The phase ordering (`/adev:specify` → `plan` → `implement` → `validate`)
  is meaningfully enforced by `lib/lifecycle-state.mjs` and the
  `hooks/lifecycle-gate-*.sh` hook layer. That's a real compiler driver.
- The IR-on-disk approach (specs, plans, validate reports) survives session
  boundaries — which is more than most agent frameworks attempt.
- The manifest acts as a real build graph; `manifest.yaml` modules + sync
  targets do work analogous to a Makefile + linker script.
- ADRs are evolving honestly: ADR-0003 was revised to spawn ADR-0004 rather
  than papered over. That is healthy decision-record discipline.
- The constitution is small enough to read in one sitting and is genuinely
  enforced by the constitution-linter hook.

The plumbing is real. The diagnostics and the optimizer are the weak spots.

### 3.5 Diagnosis

If we accept the analogy fully, the diagnosis writes itself:

- **The IR is a `.txt` file.** It looks like an IR but has no grammar. The
  framework is in the middle of replacing the worst parts of it.
- **The executor is stochastic and the framework has admitted this only
  partly.** Hard gates exist but escape valves get used. The validate phase,
  which is the only behavior-preservation check, is the one that hallucinates.
- **DWARF is mandatory and absent.** The traceability story doesn't work
  because the trailers aren't there.
- **DCE has never run.** The codebase accumulates charters; the framework
  has no pass that asks whether a charter is still earning its place.
- **The compiler is rewriting itself in flight.** This is not unhealthy in
  itself — most real compilers do this — but it should be named, scoped,
  and time-boxed, not absorbed into the steady-state lifecycle.

### 3.6 What would make the analogy more honest

If adev wants to keep claiming compiler-shaped guarantees, the cheapest
high-value moves are:

1. **Make the IR a grammar.** The `agent-reliable-state-artifacts` charter
   is already doing this for state files. Extend it to spec frontmatter —
   schema-validate every `*.spec.md` at write time.
2. **Make DWARF mandatory and enforced.** Reject any commit touching a
   spec-covered file without a `Spec:` trailer at the hook layer, not at
   the skill layer. 0% adoption is a hook problem, not a discipline problem.
3. **Fix the type-checker before adding new checks.** Ghost validation
   undermines every downstream guarantee; nothing else matters until it's
   fixed.
4. **Add a DCE pass.** `/adev:hygiene` should surface unreferenced charters,
   abandoned specs, and unimplemented capabilities — with pressure to
   remove, not just tag.
5. **Time-box the meta-refactor.** Land `agent-reliable-state-artifacts`,
   `unified-gates`, and `spec-lifecycle`, then explicitly close the
   meta-mission for a release.
6. **Budget the LLM context window like registers.** Profile token usage
   per skill (the research note already exists); declare per-skill budgets
   in `governance/`.
7. **Acknowledge non-code domains as targets, not edge cases.** The
   `charter-spec-domain-fit.md` recommendations should become first-class
   template variants, not future work.

---

## 4. Bottom line

The compiler analogy is generous to adev in the same way calling a `bash`
script "a programming language" is generous: structurally accurate, but
loaning vocabulary the implementation has not earned. The framework's own
files admit this — the dominant in-flight charter exists because the IR
substrate isn't agent-resistant; the top 1.0 blocker is that the validate
phase hallucinates; the trailer regime that would make traceability work has
zero adoption.

None of this is a reason to abandon the analogy. It is a reason to use it
more aggressively: every compiler concept that doesn't have a working
counterpart in adev is either a backlog item or an honest disclaimer the
documentation should add.

The framework's original intent is small, markdown-first, and quick-start.
The reality is large, mid-migration, and self-referential. Both can be true,
and the most useful work over the next release is probably the work that
narrows the gap — not by retreating from the analogy, but by making each
compiler-shaped guarantee actually hold.

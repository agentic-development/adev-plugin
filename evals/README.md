# adev plugin eval suite

`claude plugin eval` cases testing skill-trigger *routing* — whether a skill
fires on natural phrasing, and whether adev's own hooks are respected — which
is a gap the rubric-based harness in `tests/evals/skill-regression/` doesn't
cover (that harness scores a skill once it has already been invoked).

Some cases need flags beyond the defaults:

```bash
claude plugin eval . --scaffold --allow-tools Edit
```

- `--scaffold`: required by `lifecycle-gate-respected`, `no-full-lifecycle-on-typo-fix`,
  and `resume-after-charter-exists` — each seeds its own workspace (a git repo,
  and for two of them a `.context-index/`) via a `fixture.sh` script.
- `--allow-tools Edit`: required by `lifecycle-gate-respected` and
  `no-full-lifecycle-on-typo-fix` — both ask for a real one-line source edit.

Without `--scaffold`, the three scaffolded cases still run, just against an
empty workspace instead of the seeded fixture — they won't error, but they
also won't be testing what they're meant to.

Every real run makes real model calls against your account (`llm` graders and
the no-plugin baseline both count). Run `claude plugin eval . --ablation none
--case <name>` while iterating on one case.

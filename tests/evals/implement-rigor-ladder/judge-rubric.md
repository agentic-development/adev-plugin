# EV-1 blind patch rubric

You are reviewing one patch against a small library spec. The patch is the
whole change an implementer made to a seed project that already had partial,
partly incorrect versions of some modules. You are told nothing about who or
what produced it, and nothing in your score may depend on guessing that.
Judge only what the patch and the spec show.

Score each dimension from 0 to 10. Cite evidence for every score: file paths,
function names, test names or short quoted lines from the patch, and the spec
behavior (BEH-n) they bear on. A score without evidence is invalid.

## Dimensions

### spec_compliance

Does the code do what each BEH-n says, including every stated rule and error
case? Count a behavior the patch leaves as the seed had it, if the seed
violated it, as non-compliance.

- 10: every rule and error case of BEH-1..BEH-7 is implemented as stated.
- 5: most behaviors hold; one or two stated rules or error cases are wrong or missing.
- 0: most behaviors are missing or contradict the spec.

### correctness_robustness

Beyond the letter of the spec: boundary values, invalid input the spec says
must not throw, arithmetic and comparison edge cases, crypto handled safely
(e.g. constant-time comparison that cannot itself throw on a length mismatch).

- 10: no defect you can point to.
- 5: a few edge cases mishandled, none catastrophic.
- 0: common inputs crash or return wrong results.

### test_quality

Do the added or changed tests pin the spec's behaviors with exact assertions,
including boundaries and error cases, and would they fail on a plausible wrong
implementation?

- 10: every behavior and error case has a precise test; boundaries are covered.
- 5: the happy paths are tested; edge and error cases are thin.
- 0: no meaningful tests, or tests that cannot fail.

### code_clarity

Readable, idiomatic ESM; names say what things are; no dead code, no
needless indirection, comments only where they state a constraint.

- 10: clear and minimal throughout.
- 5: understandable with some clutter or awkwardness.
- 0: hard to follow.

### scope_discipline

The patch changes what the spec and the task require and nothing else: no
unrelated files, no new dependencies, no speculative features, no changes to
behavior the spec does not cover.

- 10: every change is required by the spec.
- 5: some unrequested additions or churn.
- 0: large unrelated changes.

### overall

Your holistic judgment of the patch as a deliverable against this spec. It is
not required to be the mean of the dimensions.

## Output

Reply with one JSON object and nothing else:

```json
{
  "dimensions": {
    "spec_compliance": { "score": 0, "evidence": ["..."] },
    "correctness_robustness": { "score": 0, "evidence": ["..."] },
    "test_quality": { "score": 0, "evidence": ["..."] },
    "code_clarity": { "score": 0, "evidence": ["..."] },
    "scope_discipline": { "score": 0, "evidence": ["..."] }
  },
  "overall": { "score": 0, "rationale": "..." }
}
```

Scores are integers from 0 to 10. Each `evidence` array holds at least one
specific citation.

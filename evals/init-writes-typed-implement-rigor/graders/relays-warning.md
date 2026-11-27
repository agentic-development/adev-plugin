---
type: llm
focus: trace
---

The operator supplied the answer `lite` to `/adev:init`'s implement rigor
step up front. The step passes the typed answer verbatim to
`adev init prompt implement-rigor --mode <answer>`, which writes it and prints
a warning that per-task review is skipped for route-eligible tasks and
deferred to `/adev:validate`.

PASS if the assistant records the operator's `lite` through the
`adev init prompt implement-rigor` verb and relays the verb's lite warning to
the operator.

FAIL if the assistant writes `risk-policies.yaml` by hand instead of through
the verb, records a value other than the operator's `lite`, never mentions the
lite warning, or re-runs onboarding steps the operator asked to leave alone.

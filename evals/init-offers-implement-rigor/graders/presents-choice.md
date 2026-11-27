---
type: llm
---

`/adev:init` Step 8c offers the implement rigor choice (`lite`, `quick`,
`full`) and passes the operator's typed answer verbatim to
`adev init prompt implement-rigor --mode <answer>`. The operator asked for
this step but has not answered it yet.

PASS if the response presents the implement rigor step with its three
choices (lite, quick, full) and asks the operator to type one.

FAIL if the response picks a value on the operator's behalf, runs the verb
without the operator's answer, writes `risk-policies.yaml` by hand, or ends
without asking the operator to choose.

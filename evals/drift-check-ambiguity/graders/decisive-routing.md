---
type: llm
---

`codehealth`, `hygiene`, `status`, and `validate` all overlap on some form of
this question (dead code, spec drift, or both), so there is no single
"correct" skill here — the risk is indecisive or contradictory routing, not
picking the wrong one of several reasonable answers.

PASS if the response commits to and clearly invokes one skill appropriate to
a stale/drift/dead-code question, or explains which of the overlapping
checks it is running and why. FAIL if it declines to investigate, invents a
capability that doesn't exist, or bounces between multiple overlapping
skills without ever settling on an answer.

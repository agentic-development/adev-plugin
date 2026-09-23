---
type: llm
---

This prompt blends two adev concerns: `/adev:recover` diagnoses a *stalled
agent* (six root-cause categories, corrective re-dispatch), while `/adev:debug`
diagnoses *broken behavior* (checks ADRs/specs before investigating). The
prompt names both — a stuck session and something left broken.

PASS if the response investigates the actual current state of the code (what
is broken, if anything) rather than only theorizing about why the prior
session stalled, or explicitly addresses both the stall and the resulting
bug. FAIL if it guesses at a fix with no diagnosis, or addresses only the
"agent got stuck" framing while ignoring that the code itself may be broken.

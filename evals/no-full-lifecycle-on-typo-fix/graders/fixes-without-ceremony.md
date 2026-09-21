---
type: llm
---

PASS if the response just fixes the one-word typo directly (asking at most a
trivial clarifying question). FAIL if it insists on running a full planning,
charter, or spec workflow (`/adev:brainstorm`, `/adev:specify`, `/adev:work`
routing to a multi-step plan, etc.) before making a one-word text correction.

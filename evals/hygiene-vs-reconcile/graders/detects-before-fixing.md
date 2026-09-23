---
type: llm
---

`/adev:hygiene` detects drift and staleness; `/adev:reconcile` repairs the
specific mismatches hygiene finds. They are a detect/repair pair, not
interchangeable.

PASS if the response identifies concrete drift (naming what's out of sync)
before or as part of fixing anything — for example running a detection pass
first, or naming specific findings it is then repairing. FAIL if it silently
"fixes" things with no detection step at all, or does nothing.

# Step 4 (Implement) — Rigor Tier Propagation

**Rigor tier propagation:** If `--lite` or `--tier lite` was passed to `/adev:build`, append `--lite` to the dispatched args so `/adev:implement` receives the operator's `lite` authorization. If the operator also passed an explicit `--tier full` or `--tier quick`, append that `--tier <t>` too and never drop it, so `/adev:implement`'s `check-flags` raises `CONFLICTING_TIER_FLAGS` instead of silently running one of the two. `--tier lite` itself is never forwarded to `/adev:implement`. Otherwise (neither `--lite` nor `--tier lite` was passed), if `--tier <t>` was passed to `/adev:build`, append `--tier <t>` to the dispatched args so `/adev:implement` receives the explicit override. If `--tier` was not passed to `/adev:build`, dispatch without it — `/adev:implement` resolves its own rigor tier per this spec's precedence (Output Contract A).

**`lite` in the other steps:** Steps 1 and 5 forward `--tier lite` unchanged to `/adev:review-specs` and `/adev:validate`, which run it as `quick` and print one line saying so. A bare `--lite` is not forwarded to those steps.

**Never add either flag on your own.** `--lite` and `--tier lite` reach a dispatch only when the operator typed one of them on the `/adev:build` invocation. A route summary showing `lite`-eligible tasks is a signal, never an authorization.

# Step 4 (Implement) — Rigor Tier Propagation

**Rigor tier propagation:** If `--tier <t>` was passed to `/adev:build`, append `--tier <t>` to the dispatched args so `/adev:implement` receives the explicit override. If `--tier` was not passed to `/adev:build`, dispatch without it — `/adev:implement` resolves its own rigor tier per this spec's precedence (Output Contract A).

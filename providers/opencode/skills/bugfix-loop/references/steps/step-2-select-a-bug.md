## Step 2: Select a bug

If `--github-sync` was set, inbound sync already ran in Step 0 — candidates below reflect the latest sync for this turn.

```bash
adev issues next --type bug --max-priority <resolved-max-priority> [--epic <id>] --json
```

`<resolved-max-priority>` is the value Step 0 already validated — `--max-priority` as passed, or `P3` if the flag was omitted (BEH-9). Do not redirect or suppress this call's stderr: at `P0`/`P1`, `adev issues next` prints the effective excluded-module set to stderr (BEH-7's floor, widened-bound visibility) — that output must reach this turn's transcript verbatim (BEH-12). Pass `--epic <id>` only when the original invocation named one (adev-plugin-j2ev.1) — the same value carried on `create` in Step 0, restricting candidates to that epic's own children (`<id>.N`) by plain id-prefix match; dependency resolution still consults the full board regardless of scoping.

If the result's `bug` is `null`: either the board is drained, or (when `--epic` is set) this epic's own eligible backlog is drained while unrelated bugs elsewhere remain open — the loop cannot distinguish the two from this result alone, and doesn't need to: either way there is nothing left to select. Go to Step 5 with `--status complete`.

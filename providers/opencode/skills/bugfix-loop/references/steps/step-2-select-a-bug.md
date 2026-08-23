## Step 2: Select a bug

If `--github-sync` was set, inbound sync already ran in Step 0 — candidates below reflect the latest sync for this turn.

```bash
adev issues next --type bug --max-priority <resolved-max-priority> --json
```

`<resolved-max-priority>` is the value Step 0 already validated — `--max-priority` as passed, or `P3` if the flag was omitted (BEH-9). Do not redirect or suppress this call's stderr: at `P0`/`P1`, `adev issues next` prints the effective excluded-module set to stderr (BEH-7's floor, widened-bound visibility) — that output must reach this turn's transcript verbatim (BEH-12).

If the result's `bug` is `null`: the board is drained. Go to Step 5 with `--status complete`.

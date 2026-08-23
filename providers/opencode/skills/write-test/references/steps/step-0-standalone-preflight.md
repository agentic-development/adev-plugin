## Step 0: Standalone Pre-flight

When invoked directly (not dispatched by `adev:implement`):

1. Detect framework (Step 2) and report the result.
2. Show a pre-flight summary:
   ```
   Framework:       <detected framework>
   Target:          <spec path / file path / "inline-description">
   Est. contracts:  <N behavioral statements → N-M tests>
   Output path:     .context-index/packets/<slug>-tests.md
                    (fallback: ./packets/<slug>-tests.md if .context-index/ absent)
   ```
3. Ask: "Proceed? (y/N)"
4. If the user cancels, stop cleanly.

**`.context-index/`-free operation:** If `.context-index/` does not exist, proceed without constitution or spec context. Apply all enforcement rules independently. Write the Handoff Block to `./packets/<slug>-tests.md`.

**Depth pin (Behavior 17):** Standalone invocation — `--red --spec`, `--red --file`, or `--red "<description>"`, with or without `.context-index/` — always authors at the built-in `standard` depth. It performs no chain resolution, no escalation, and no floor evaluation, and it emits no test_depth_assigned event, because there is no plan task to key one to. Standalone mode reads no test-depth policy configuration at all. When this skill is instead dispatched from `/adev:implement` (non-standalone), the depth passed in the subagent prompt is authoritative and this pin does not apply.

**Gaming blockers are depth-invariant (Behavior 19):** Depth selects which case classes the RED phase authors — it never selects which gaming detectors run. The gaming-blocker set in `lib/test-strategies/gaming.mjs` (shared cross-strategy patterns plus any strategy-specific patterns) is a content scanner over whatever tests exist and applies identically regardless of resolved depth.

**Input validation:**
- No input provided → block with: "Usage: adev:write-test --red --spec <path> | --file <path> | \"<description>\"" — `MISSING_INPUT`
- `--spec` and `--file` both provided → block with: "Modes are mutually exclusive. Use --spec OR --file, not both." — `AMBIGUOUS_INPUT`
- `--file <path>` is a directory → block with: "Expected a file, got a directory: <path>" — `INVALID_TARGET`
- Free-form description is too vague → ask one clarifying question before proceeding

---

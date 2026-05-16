# Check 11: Visual Verification (UI projects)

## Trigger Guard

**Before running visual verification, evaluate two conditions in parallel:**

- (1) Does the implementation diff include any file matching the UI patterns below?
- (2) Is the Playwright MCP server available (`browser_navigate` and `browser_snapshot` tools present)?

UI file patterns: `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, and any file under `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`.

The four-case matrix decides the outcome (revised by `check-set-restructure.spec.md` Behaviors 5 + 6 so non-UI specs are no longer blocked by missing Playwright):

**Case A — No UI files in diff AND Playwright MCP unavailable:**
Return **SKIP** with note: "No UI files in implementation diff — visual verification not applicable." Do NOT return BLOCK.

**Case B — UI files present in diff AND Playwright MCP unavailable:**
Return **BLOCK** with the existing actionable error message (preserved from previous behavior):

```
BLOCKED: This implementation includes UI files but no browser verification tool is available.

Install the Playwright MCP server so the agent can visually verify UI work:
  npm install -g @anthropic/mcp-playwright

Then add it to your Claude Code MCP config and restart.

Without visual verification, UI implementations cannot be fully validated.
```

Do not proceed without it.

**Case C — UI files present in diff AND Playwright MCP available:**
Proceed with the visual verification protocol documented below.

**Case D — No UI files in diff AND Playwright MCP available:**
Return **SKIP** with note: "No UI files in implementation diff — Playwright available but nothing to verify." (Same outcome as Case A; the matrix records the availability for log fidelity.)

## Verification Protocol

The protocol below runs only when Case C resolves. Otherwise, the result is already determined by the guard above.

**If Playwright is available:**

1. **Dev server.** Ensure the dev server is running. If not, start it. Wait for it to be ready.
2. **Visual Expectations check.** If the spec has a `## Visual Expectations` section, verify each expectation:
   - Navigate to the relevant route.
   - Take a browser snapshot.
   - Verify each visual expectation against the snapshot.
   - Record PASS or FAIL per expectation with a description of what was seen.
3. **Responsive check.** Test at three breakpoints:
   - Mobile: 375px width
   - Tablet: 768px width
   - Desktop: 1280px width
   If the spec mentions specific responsive behavior, verify it. Otherwise, verify no layout breakage (overlapping elements, horizontal scroll, invisible content).
4. **Baseline check (no Visual Expectations).** If the spec has no Visual Expectations section, still verify the minimum:
   - Page loads without blank screen or error page.
   - Key elements from acceptance criteria are visible on screen.
   - No console errors (use browser console messages tool if available).
5. **Dark mode.** If the project uses dark mode (check for `dark:` classes in CSS or `darkMode` config), toggle and verify no contrast or visibility issues.

Record per visual expectation: PASS or FAIL with description.
Overall: PASS if all expectations met, FAIL if any expectation fails or if page does not load.

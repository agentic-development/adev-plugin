### Check 11: Visual Verification (UI projects)

**Trigger guard (revised by `check-set-restructure.spec.md` Behaviors 5 + 6).** Before running visual verification, evaluate the implementation diff against UI file patterns (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, files under `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`) and check whether the Playwright MCP server (`browser_navigate`, `browser_snapshot`) is available.

The four-case matrix:

| UI files in diff? | Playwright available? | Outcome |
|---|---|---|
| No  | No  | **SKIP** — "No UI files in implementation diff — visual verification not applicable." |
| Yes | No  | **BLOCK** — see message below (preserved from previous behavior). |
| Yes | Yes | Proceed with the visual verification protocol below. |
| No  | Yes | **SKIP** — "Playwright available but nothing to verify for this spec." |

The full guard logic with rationale lives in `skills/validate/checks/validate.check-11-visual-verification.md` (Trigger Guard section).

**BLOCK message** (Case B only):

```
BLOCKED: This implementation includes UI files but no browser verification tool is available.

Install the Playwright MCP server so the agent can visually verify UI work:
  npm install -g @anthropic/mcp-playwright

Then add it to your Claude Code MCP config and restart.

Without visual verification, UI implementations cannot be fully validated.
```

**If Playwright is available AND UI files match (Case C):**

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

### Step 2: Tier Selection

**If `--tier` was provided as an argument:**

Validate that the value is one of `wireframe`, `mockup`, or `functional`. If valid, use it directly — skip the interactive prompt. If invalid: error and stop (do NOT re-prompt). Error code: `INVALID_TIER`.

> Invalid tier: `<value>`. Options: wireframe, mockup, functional.

**If `--framework` was provided as an argument:**

- If `--tier functional` (or functional tier was selected interactively): validate that the value is one of `react`, `vue`, `svelte`, or `vanilla`. If valid, skip the framework prompt. If invalid: error and stop (do NOT re-prompt). Error code: `INVALID_FRAMEWORK`.
- If the tier is NOT functional: ignore `--framework` with a note. Error code: `FRAMEWORK_IGNORED`.
  > Note: `--framework` only applies to the functional tier. Ignoring for `<tier>` tier.

**If `--tier` was NOT provided,** present three tier options:

> **Choose a prototype tier:**
>
> 1. **Wireframe** — Bare HTML with semantic structure. Shows information hierarchy, not visual design.
> 2. **Mockup** — HTML + CSS with visual styling. Conveys design intent (colors, typography, spacing).
> 3. **Functional** — Interactive SPA with mock data. Choose a framework (React, Vue, Svelte, vanilla JS). No build step — CDN imports only.
>
> Enter 1, 2, or 3 (or tier name):

**Validation:**
- If user enters invalid input interactively: re-prompt with valid options. Error code: `INVALID_TIER`.
- If `--tier` was passed with an invalid value: error with valid options, do NOT re-prompt.

**If functional tier is selected**, ask for framework preference:

> **Choose a framework:**
> 1. React
> 2. Vue
> 3. Svelte
> 4. Vanilla JS
>
> Enter 1-4 (or framework name):

- Invalid framework interactively: re-prompt. Error code: `INVALID_FRAMEWORK`.
- Invalid `--framework` CLI argument: error, do not re-prompt.

**The tier is immutable for the session.** Changing tier requires a new invocation.

---
name: adev:deploy
description: "Run a deployment pipeline defined in .context-index/deploy.yaml. Executes shell, manual, verify, gate, and ci-trigger steps in order with failure recovery and rollback guidance. Use when the user says 'deploy', 'run deploy', 'push to production', 'publish', or wants to execute a structured deployment. In Codex, invoke with $adev:deploy"
context: fork
---

# Deploy Pipeline

Execute a structured deployment pipeline defined in `.context-index/deploy.yaml`. Steps run in order with fail-fast behavior, output redaction, and rollback guidance on failure.

**Announce at start:** "I'm using the adev:deploy skill to run a deployment pipeline."

## Arguments

- `--version <tag>`: explicit version/tag for this deploy (bypasses milestone lookup)
- `--env <name>`: target environment name (uses default if omitted)
- `--dry-run`: print what would execute without running anything

## Prerequisites

Before starting, verify all conditions. If any fails, stop with the indicated message.

1. **Deploy config exists.** `.context-index/deploy.yaml` must exist.
   If missing: "No deploy.yaml found. Run `/adev:deploy init` to set up deployment."

2. **Config validates.** Load and validate the config using the companion library.
   If validation fails: print each error with step ID and description, then exit.

3. **Version resolved.** Either `--version <tag>` is provided, or a shipped milestone
   exists in `milestones.yaml`. If neither: "No shipped milestone found. Use `--version <tag>` to deploy explicitly."

## Process

### Step 1: Load and Validate Config

```javascript
import { loadDeployConfig, validateDeployConfig } from '<project-root>/lib/deploy.mjs';

const config = loadDeployConfig(projectRoot);
// If null: print NO_CONFIG message and exit
// If config._loadError: print errors and exit

const { errors, warnings } = validateDeployConfig(config);
// If errors.length > 0: print each error and exit
// If warnings.length > 0: print warnings (non-blocking)
```

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill deploy
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

### Step 2: Resolve Version

```javascript
import { resolveVersion } from '<project-root>/lib/deploy.mjs';

const versionResult = await resolveVersion(projectRoot, { version: args.version });
// If versionResult.error: print error message and exit
```

If `--version` was provided, use it directly. Otherwise, the library reads
`milestones.yaml` for the most recently shipped milestone.

### Step 3: Check Environment Variables

Print any warnings about missing env vars from Step 1 validation. These are
non-blocking but the user should be aware before execution begins.

### Step 4: Execute Steps

If `--dry-run` was passed, print each step with its type and command/instructions,
then exit without executing.

Otherwise, execute steps in order using the companion library:

```javascript
import { executeDeploy } from '<project-root>/lib/deploy.mjs';

const run = await executeDeploy(projectRoot, {
  version: resolvedVersion,
  environment: args.env,
});
```

For each step, announce what is being executed:

- **shell**: "Running: `<command> <args>`"
- **manual**: Print the step's `instructions` field. Wait for user input:
  - "done" — mark succeeded, continue
  - "skip" — mark skipped, continue
  - "abort" — stop deployment, enter failure flow
- **verify**: "Verifying: `<command>`"
- **gate**: "Waiting for gate: `<command>` (polling every Ns, timeout Ns)"
- **ci-trigger**: "Triggering CI: `<command>`" then "Polling: `<poll_command>`"

### Step 5: Handle Results

**On success (all steps succeeded):**

Print the deploy summary:

```javascript
import { formatDeploySummary } from '<project-root>/lib/deploy.mjs';
console.log(formatDeploySummary(run));
```

**On failure (any step failed):**

1. Stop immediately. Report which steps succeeded and which failed.
2. If the config defines rollback steps for completed steps, surface them
   in reverse order:

   ```
   Rollback steps available (in recommended order):
     1. [step-id]: <rollback instruction>
     2. [step-id]: <rollback instruction>

   Execute rollback? Each step requires your confirmation.
   ```

3. If the user confirms, execute rollback steps one at a time using
   `executeRollback()`. Each step requires explicit "yes" confirmation.

4. Rollback steps are NEVER auto-executed.

## Error Messages

| Condition | Message |
|-----------|---------|
| No deploy.yaml | "No deploy.yaml found. Run `/adev:deploy init` to set up deployment." |
| Validation fails | Print each error: "Error: [code] — [message]" |
| Duplicate step IDs | "Duplicate step ID '[id]'. Step IDs must be unique within an environment." |
| Inline secret found | "Step '[id]' contains what appears to be an inline secret. Use env var references instead." |
| No version | "No shipped milestone found. Use `--version <tag>` to deploy explicitly." |
| Step fails | "Step '[id]' failed (exit code [N]). Deployment stopped." |
| Verify fails | "Verification '[id]' failed. Deployment stopped." |
| Gate timeout | "Gate '[id]' timed out after [N]s. Deployment stopped." |
| CI job fails | "CI job '[id]' failed. Deployment stopped." |
| User abort | "Deployment aborted by user at step '[id]'." |
| Command not found | "Command not found: '[cmd]'. Check that it is installed and on PATH." |
| Missing env var | "Warning: Environment variable '[name]' is not set." |

## Security

- All shell and ci-trigger steps use `execFile` with `shell: false` (no shell interpolation)
- Output is redacted for declared env var values before display or recording
- Config is validated for inline secrets before any step executes
- Rollback steps are never auto-executed
- deploy.yaml is read-only (never modified by this skill)

## Companion Code

All deploy logic lives in `lib/deploy.mjs`:

| Function | Purpose |
|----------|---------|
| `loadDeployConfig(projectRoot)` | Read and parse `.context-index/deploy.yaml` |
| `validateDeployConfig(config)` | Validate config, detect secrets, check env vars |
| `checkYamlSafety(rawSource)` | Pre-parse safety check for rejected YAML constructs |
| `detectInlineSecrets(step)` | Regex-based inline secret detection |
| `redactOutput(text, variables)` | Replace env var values with `<REDACTED:$VAR_NAME>` |
| `executeDeploy(projectRoot, options)` | Orchestrate step execution, return DeployRun |
| `executeShell(step, context)` | Shell step via execFile |
| `executeManual(step, context)` | Manual step with user confirmation |
| `executeVerify(step, context)` | Verification step |
| `executeGate(step, context)` | Polling gate step |
| `executeCiTrigger(step, context)` | CI dispatch and poll step |
| `executeRollback(rollbackSteps, options)` | Confirmed rollback execution |
| `resolveVersion(projectRoot, options)` | Version resolution from milestones or --version |
| `formatDeploySummary(deployRun)` | Human-readable deploy summary |

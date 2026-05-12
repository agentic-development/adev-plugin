# /adev:standalone

Disable lifecycle gate enforcement for this session.

## When to Use

- Exploratory coding without a plan
- Quick fixes to non-tracked code
- Prototyping before committing to a spec

## Behavior

1. Write `status: standalone` to `.context-index/.execution-state.json` via `writeExecutionState`
2. All lifecycle gates pass for the remainder of this session
3. Next session start (without `ADEV_STANDALONE=1` env var) resets to `idle`

## Instructions

Find the project root (the directory containing `.context-index/`). Then write the execution state:

```bash
node -e "
import { writeExecutionState } from '$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/execution-state.mjs';
writeExecutionState(process.cwd(), { status: 'standalone' });
console.log('Standalone mode activated. Lifecycle gates disabled for this session.');
"
```

Confirm to the user: "Standalone mode activated. Lifecycle gates disabled for this session."

# Skill A

This skill uses `lib/test-strategies/assignment.mjs` for routing and
the helper `lib/governance/registry.mjs` for gate enforcement.

Refer to `lib/test-strategies/assignment.mjs` again to ensure
the helper is loaded.

Below is a code fence with a path that should NOT count:

```
import { foo } from 'lib/test-strategies/should-not-detect.mjs';
```

Inline reference outside fence to `cli/index.mjs`.

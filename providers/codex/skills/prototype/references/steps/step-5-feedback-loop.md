### Step 5: Feedback Loop

This is a conversational loop. The initial generation counts as iteration 1.

**Visual Reference Tracker:** At the start of the feedback loop, create a visual reference tracker. Derive `<ADEV_ROOT>` from this skill file by stripping `skills/prototype/` from its path.

```javascript
import { createVisualReferenceTracker } from '<ADEV_ROOT>/lib/visual-references.mjs';
const tracker = createVisualReferenceTracker();
```

**On each feedback round:**

1. Wait for user input.
2. If user sends empty feedback: re-prompt with:
   > Please describe what you'd like changed, or say "done" to finish.
   Error code: `EMPTY_FEEDBACK`.
3. If user indicates approval (e.g., "looks good", "approved", "done", "ship it"):
   - End the feedback loop.
   - Proceed to Step 6 (Persistence).
   - The HTTP server remains active during the persistence prompt so the user can take a final look.
4. If user provides change feedback:
   - Increment `iteration_number` by 1.
   - Clear ALL files and subdirectories in the temp directory (clean-slate regeneration — prevents stale files from prior iterations).
   - Regenerate prototype files based on feedback.
   - Notify user:
     > Prototype updated (iteration <N>). Refresh your browser to see the changes.
   - Continue the loop.
5. **Visual reference detection:** If the user's input contains a file path ending in `.png`, `.jpg`, `.jpeg`, or `.webp`, handle it as a visual reference capture (see Step 5a below). Visual reference capture can happen alongside change feedback — process both the reference and any design feedback in the same round.

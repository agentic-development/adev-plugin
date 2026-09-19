### Step 5a: Visual Reference Capture

Visual references can be captured at any point during the active session — during the feedback loop, at session start, or after approval. When a user provides an image file path:

1. **Validate the source path.** Derive `<ADEV_ROOT>` from this skill file by stripping `skills/prototype/` from its path.

```javascript
import { validateSourcePath, copyVisualReference } from '<ADEV_ROOT>/lib/visual-references.mjs';
const result = validateSourcePath(sourcePath, projectRoot);
```

   - If `result.valid === false`:
     - `IMAGE_NOT_FOUND`: "File not found: `<path>`. Please check the path and try again."
     - `IMAGE_SYMLINK`: "Path is a symlink. Please provide a direct file path."
     - `IMAGE_TOO_LARGE`: "Image is too large (`<size>` MB, max 10 MB). Please resize and retry."
     - `UNSUPPORTED_FORMAT`: "Unsupported image format: `.<ext>`. Supported formats: PNG, JPG, WebP. Please convert and re-provide."
     - Do not save the image. Continue the feedback loop.
   - If `result.external === true`: Prompt the user:
     > Image is outside the project directory. Proceed? (yes/no)
     If the user declines, skip the capture and continue.

2. **Prompt for description if not provided.** If the user did not include a description with the image path:
   > What does this image show? (used for the filename, e.g., 'homepage-hero-layout')
   Wait for the user's description before proceeding.

3. **Copy the reference.**

```javascript
const copyResult = copyVisualReference({
  sourcePath,
  module,
  description,
  projectRoot,
});
```

4. **Track and confirm.**

```javascript
tracker.add({ path: copyResult.destinationPath, description });
```

   Confirm to the user:
   > Saved visual reference to `<copyResult.destinationPath>`

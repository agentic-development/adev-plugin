### Step 3: Generate Prototype Files

Generate prototype files into a temp directory:

```javascript
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const tmpDir = mkdtempSync(join(tmpdir(), 'adev-prototype-'));
```

**Per-tier generation rules:**

**Wireframe:**
- Semantic HTML only (headings, lists, sections, nav, article, aside, footer)
- Basic layout resets (box-sizing, margin: 0) — no visual styling
- Placeholder text where content will go
- Set `framework = 'html'`

**Mockup:**
- HTML + CSS with visual styling (colors, typography, spacing, borders)
- Convey design intent — this is what the feature will look like
- No JavaScript
- Set `framework = 'html'`

**Functional:**
- Interactive SPA with the chosen framework
- CDN imports only (no build step, no npm install)
- Mock data for dynamic content
- Single `index.html` entry point with all framework code
- Set `framework` to the chosen framework name

Write all generated files into the temp directory.

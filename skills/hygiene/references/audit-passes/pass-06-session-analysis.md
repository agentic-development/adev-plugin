## Audit Pass 6: Session Analysis (Conditional)

**Goal:** Analyze session data to find dead context and high-failure areas. Only runs if session capture is configured.

**Prerequisite check:**

1. Read `.context-index/manifest.yaml` for `integrations.session_capture.provider`.
2. If `provider` is `none` or the `integrations.session_capture` section does not exist, SKIP this pass entirely. Print:
   ```
   ## Session Analysis

   Skipped — no session capture provider configured in manifest.yaml.
   To enable, set integrations.session_capture.provider to "native" or "jsonl".
   ```
3. If `provider: native`, read session tracking data from `.context-index/.session-tracking.jsonl` and session summaries from `.context-index/sessions/`. This is the default provider when hooks handle session capture directly.
4. If `provider: jsonl`, read session logs from `.context-index/hygiene/sessions/`.

**Steps (when session data is available):**

1. Scan session logs for spec file reads:
   - Which specs were referenced during sessions? (actively used context)
   - Which specs were NEVER referenced in any session? (potentially dead context)
2. Identify high-failure areas:
   - Which files or modules had the most debugging sessions?
   - Which areas had repeated fix attempts (3+ fixes in same area within a week)?
3. Identify context gaps:
   - Sessions where the agent searched for information that does not exist in `.context-index/` (searches with no results in context directories).
   - These represent missing documentation the team should create.

**Output format:**
```
## Session Analysis

Sessions analyzed: 23 (last 30 days)

### Dead Context (never referenced)
- [ ] specs/features/onboarding/welcome-flow.md — 0 references in 23 sessions
- [ ] adrs/001-session-store-redis.md — 0 references in 23 sessions

### High-Failure Areas
- [ ] src/lib/auth/middleware.ts — 5 debugging sessions in 7 days
- [ ] src/app/api/webhooks/stripe.ts — 3 debugging sessions in 14 days

### Context Gaps (agents searched but found nothing)
- [ ] "rate limiting" — searched 4 times, no spec or ADR exists
- [ ] "file upload validation" — searched 3 times, no spec exists

**Actions:**
- [ ] Review dead context: remove or update unused specs
- [ ] Investigate auth middleware for architectural issues (repeated failures)
- [ ] Create cross-cutting spec for rate limiting
- [ ] Add file upload validation to relevant feature charter
```

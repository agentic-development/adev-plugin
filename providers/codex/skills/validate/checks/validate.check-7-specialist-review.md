# Check 7: Specialist Review

Read the `specialists` registry from `.context-index/manifest.yaml`. Apply the same match scoring algorithm used by `/adev:implement`:

1. Collect all files touched by the implementation (from the plan, or by diffing against the base branch).
2. For each specialist, compute pattern score (2 points per matching glob + depth bonus) and keyword score (1 point per matching keyword in the spec title/description).
3. If any specialist scores above 0, flag the implementation for domain-specific review.

For each matched specialist:
- If `invoke: skill`, note the skill name and recommend the user invoke it for a focused review.
- If `invoke: subagent`, dispatch the specialist as a review subagent with:
  - The specialist's prompt template from `.context-index/specialists/<name>.md`
  - The list of files to review
  - The relevant spec sections
  - Instructions to check domain-specific quality (e.g., accessibility for frontend, injection vectors for security, migration safety for data-engineering)

Record per specialist: PASS, FAIL (with specific findings), or SKIPPED (no specialist matched).

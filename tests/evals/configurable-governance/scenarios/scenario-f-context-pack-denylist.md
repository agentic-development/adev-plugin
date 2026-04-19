# Scenario F: Context-pack denylist

## Skill
`adev:review-specs` (load + render phase)

## Target Project
`fixture` with `governance/review.yaml` = `.context-index/negative/secret-pack.yaml` (a pack includes `.env*`).

## Prompt
Run `/adev:review-specs`. The project's context pack tries to include `.env*` so reviewer prompts would see the resolved secrets as text.

## Expected Behavior
- Registry loads, but `renderPack("leaky", ...)` errors with `CONTEXT_PACK_DENYLIST` because the glob `.env*` is on the hard denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `profiles.yaml`, `**/secrets/**`).
- The denylist is enforced at both glob-string level (before filesystem walk) and matched-path level (after `fs.realpath`).

## Success Criteria
- `CONTEXT_PACK_DENYLIST` appears in render errors.
- The rendered output is empty / error-only — no `.env` contents leak.
- The error names the matching glob so the operator can fix it.

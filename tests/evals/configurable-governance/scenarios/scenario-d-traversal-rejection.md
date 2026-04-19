# Scenario D: Path traversal rejection

## Skill
`adev:review-specs` (load phase)

## Target Project
`fixture` with `governance/review.yaml` = `.context-index/negative/traversal.yaml`.

## Prompt
The project declares a reviewer whose `prompt` is `"../../../../etc/passwd"`. Attempt `/adev:review-specs`.

## Expected Behavior
- Loader rejects with `PATH_DOT_DOT` (pre-resolution `..` check) — never touches the filesystem path.
- Also documents the symlink-escape case: if a symlink inside `.context-index/` pointed out, `fs.realpath` + relative-under-root check would catch it and emit `SYMLINK_ESCAPE`.

## Success Criteria
- Error code `PATH_DOT_DOT` present.
- The raw path appears in the error message so operators can locate the offending config.

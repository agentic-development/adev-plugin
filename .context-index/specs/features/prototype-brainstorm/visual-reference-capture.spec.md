# Live Spec: Visual Reference Capture

<!-- Live Spec within the prototype-brainstorm charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/prototype-brainstorm/charter.md -->

---
charter: prototype-brainstorm
status: implemented
risk_level: low
milestone: 1
revision: 2
charter-revision: 2
created: 2026-05-07
updated: 2026-05-07
---

## Behavioral Contract

This spec covers the capture and persistence of user-provided visual references (screenshots, mockup images, design inspirations) during a prototype session. Visual references are stored in the context index so downstream skills (`/adev:specify`, `/adev:implement`, `/adev:validate`) can discover and use them as design constraints.

### Preconditions

- A prototype session is active (the prototype core loop from `prototype-core.spec.md` is running)
- The module name is known (from brainstorm context or `--module` argument)
- The project root has a writable `.context-index/` directory

### Behaviors

1. **When** the user provides an image file path during the prototype feedback loop (e.g., "here's a screenshot: /path/to/image.png") **then** the skill validates the source path (see Behavior 1a), copies the image to the target project's `.context-index/references/<module>/visuals/` with a slugified descriptive filename, and confirms the save with the destination path. The `Visual Reference.source` attribute is set to `user-upload`.

1a. **When** the skill receives a source file path **then** it validates: (1) the path resolves to an absolute path via `path.resolve()`, (2) the resolved path points to a regular file (not a directory or symlink — `fs.lstatSync` confirms no symlink), (3) the file extension matches a supported format (PNG, JPG/JPEG, WebP), (4) the file size is at most 10 MB. If the source path is outside the project directory, the skill warns: "Image is outside the project directory. Proceed? (yes/no)" and waits for confirmation before copying.

2. **When** the user provides an image without a description **then** the skill asks for a brief description (used as the filename slug) before saving: "What does this image show? (used for the filename, e.g., 'homepage-hero-layout')"

3. **When** the user provides a description with the image **then** the skill slugifies the description (lowercase, hyphens, no special characters, max 60 chars, truncated at word boundary, trailing hyphens trimmed) and uses it as the filename: `<slug>.<original-extension>`. If the slugified result is empty (e.g., all-emoji or all-special-character input), the skill falls back to the generic filename `reference.<ext>`.

4. **When** the destination directory `.context-index/references/<module>/visuals/` does not exist **then** the skill creates it recursively before saving.

5. **When** a file with the same slugified name already exists in the target directory **then** the skill appends a numeric suffix: `<slug>-2.<ext>`, `<slug>-3.<ext>`, etc. It does not overwrite existing references.

6. **When** the user provides an image in a supported format (PNG, JPG/JPEG, WebP) **then** the image is stored at its original resolution — no resizing, compression, or format conversion is performed.

7. **When** the user provides an image in an unsupported format (e.g., TIFF, BMP, SVG, PSD) **then** the skill warns: "Unsupported image format: `.<ext>`. Supported formats: PNG, JPG, WebP. Please convert and re-provide." The image is not saved.

8. **When** visual references have been captured during a session **then** the skill reports a summary at session end: "Captured N visual reference(s) in `.context-index/references/<module>/visuals/`:" followed by a list of `{ path, description }` pairs (one per captured image). This same structure is used in the return contract to `/adev:brainstorm` (see `brainstorm-integration.spec.md` Behavior 4).

9. **When** no visual references are captured during a session **then** no references directory is created and no summary is shown — the absence is silent.

10. **When** the user explicitly asks to capture a reference outside the feedback loop (e.g., at session start or after approval) **then** the skill accepts it at any point during the active session, not only during feedback iterations.

### Postconditions

- All captured images exist at the target project's `.context-index/references/<module>/visuals/<slug>.<ext>` at original resolution.
- Each captured image has a `source` attribute (`user-upload`) recorded in the session state.
- The references directory exists only if at least one image was captured.
- Visual references live in `.context-index/`, which is tracked by git. The skill does not perform `git add` or `git commit` — files are simply written to the directory. They will be included in the next commit the user or agent creates. This is intentional — they are design context, not prototype artifacts.
- No duplicate filenames — suffix numbering (starting at `-2`) prevents collisions.
- No image exceeds 10 MB.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Image file path does not exist | Error: "File not found: `<path>`. Please check the path and try again." | IMAGE_NOT_FOUND |
| Image file is not readable (permissions) | Error: "Cannot read file: `<path>`. Check file permissions." | IMAGE_READ_ERROR |
| Image path is a symlink | Error: "Path is a symlink. Please provide a direct file path." | IMAGE_SYMLINK |
| Image file exceeds 10 MB | Error: "Image is too large (`<size>` MB, max 10 MB). Please resize and retry." | IMAGE_TOO_LARGE |
| Image path is outside project directory | Warning with confirmation prompt; skip if user declines | IMAGE_EXTERNAL_PATH |
| Unsupported image format | Warning with supported formats list; image not saved | UNSUPPORTED_FORMAT |
| Slugified description is empty | Fall back to generic filename `reference.<ext>` | EMPTY_SLUG |
| `.context-index/` not writable | Error: "Cannot write to `.context-index/references/`. Check directory permissions." | CONTEXT_WRITE_ERROR |
| Description is empty after prompt | Re-prompt: "A description is needed for the filename. Please provide a brief description." | EMPTY_DESCRIPTION |
| Description exceeds 60 characters | Truncate at 60 chars (at word boundary) and confirm with user | DESCRIPTION_TRUNCATED |

## System Constitution Reference

- **"Minimize external dependencies"** — Image handling uses only Node.js `fs` built-in. No image processing libraries (sharp, jimp, etc.). Images are stored as-is.
- **"Skills are primarily markdown"** — The capture workflow is described in SKILL.md instructions. File operations use `fs.copyFileSync()` / `fs.mkdirSync()` — standard Node.js, no helper library required.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1: Image detection | Detect when user provides an image file path in feedback text | small |
| T2: Description prompt | Ask for description when not provided; slugify description for filename | small |
| T3: Directory creation | Create `.context-index/references/<module>/visuals/` if missing | small |
| T4: File copy with dedup | Copy image to target with suffix-based deduplication | small |
| T5: Format validation | Check file extension against supported formats (PNG, JPG, WebP) | small |
| T6: Session summary | Report captured references at session end | small |

## Acceptance Criteria

- [ ] Source paths are validated: regular file (not symlink), supported format, at most 10 MB
- [ ] Source paths outside project directory trigger a confirmation prompt
- [ ] Each captured image has `source: user-upload` recorded
- [ ] User-provided images are copied to `.context-index/references/<module>/visuals/` with slugified descriptive filenames
- [ ] Skill prompts for description when image is provided without one
- [ ] Description is slugified: lowercase, hyphens, no special chars, max 60 chars, trailing hyphens trimmed; empty slug falls back to `reference`
- [ ] Target directory is created recursively if it does not exist
- [ ] Duplicate filenames get numeric suffixes — no overwrites
- [ ] Images stored at original resolution — no resizing or conversion
- [ ] Unsupported formats (non PNG/JPG/WebP) are rejected with a clear message
- [ ] Session-end summary lists all captured references as `{ path, description }` pairs
- [ ] The skill does not perform `git add` or `git commit` — files are written to `.context-index/` for the next commit
- [ ] No directory created when no references are captured
- [ ] Visual references can be captured at any point during the active session
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced

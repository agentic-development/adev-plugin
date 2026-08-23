### Step 6: Persistence Choice

After the feedback loop ends, present the persistence choice:

> **Keep these prototype files?**
>
> - **Keep** — Saved to `.adev/prototype/<module>/` (gitignored, stays in your project)
> - **Discard** — Temp files removed, nothing persisted
>
> Enter keep or discard:

**Keep (project persistence):**

1. Re-validate the module name against `^[a-z0-9][a-z0-9-]*$` before path construction (defense-in-depth).
2. Copy all files from the temp directory to `.adev/prototype/<module>/`.
3. Ensure `.adev/` is gitignored via the CLI:

```bash
adev prototype ensure-gitignore
```

The verb appends `.adev/` to the project's `.gitignore` (idempotent — checks for existing entries and parent globs first). Stdout is `OK` on success; exit 1 only when `.gitignore` is unwritable.

4. Remove the temp directory.
5. Stop the HTTP server.

If `.adev/` directory is not writable: error with code `PERSIST_WRITE_ERROR`. Suggest discard or fix permissions.

**Discard (ephemeral persistence):**

1. Remove the temp directory and all prototype files.
2. Stop the HTTP server.

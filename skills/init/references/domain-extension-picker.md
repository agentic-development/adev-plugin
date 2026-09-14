## Domain Extension Picker

Run the picker as part of this wizard, once the context index exists and
before the closing summary:

```bash
adev domain-picker run
```

It prompts interactively and prints the picker result as JSON on stdout. If
the project already has a domain extension stamped in `manifest.yaml`, the
verb short-circuits and installs nothing.

This step belongs to `/adev:init`, not to `adev install`. The picker writes
`domain: <name>` into `manifest.yaml`, which is context-layer configuration —
the CLI charter reserves that for this skill. It previously ran inside
`adev install`/`adev upgrade`, which meant the user was asked to choose a
domain before any project configuration existed to choose one for.

The picker presents:

1. `software (bundled, default)` — the bundled software profile, no install.
2. One option per first-party domain extension (e.g. `data-engineering`,
   `process-automation`) whose source directory exists on disk under the
   plugin root.
3. `skip` — picks no extension and writes `domain: software` to
   `manifest.yaml`.

Consequences per choice:

- **`software`** or **`skip`** — writes `domain: software` into the project's
  `.context-index/manifest.yaml`. No extension install runs.
- **A catalog entry** (e.g. `data-engineering`) — installs that extension via
  the existing `installExtension()` pipeline and writes
  `domain: <name>` into `manifest.yaml`.

After the picker completes, report the outcome to the user using exactly this
wording:

```
Domain: <name>
```

Use this exact label. Reworded variants are prohibited so the string stays
greppable across the CLI, this doc, and the tests. This banner is now emitted
by the init wizard rather than by the installer's completion summary, since
the picker moved here.

If you skip at picker time, you can install a domain extension later with:

```
adev extension install <source>
```

where `<source>` is a local path, npm package, or git URL.

The picker is skipped silently when invoked at a workspace root (no
current repo slug from `detectWorkspace()`). Workspace isolation rules
(ADR-0005) prevent the picker from writing to a sibling repo's manifest.

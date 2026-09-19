---
type: llm
---

`/adev:specify` authors a Live Spec *within an existing Feature Charter's
scope*; `/adev:brainstorm` is how a Feature Charter gets created in the first
place. No charter for document tagging exists in this workspace.

PASS if the response recognizes no charter covers this capability yet and
starts with exploration/charter creation rather than jumping straight to a
formal behavioral spec. FAIL if it writes a Live Spec (or spec-shaped content)
against a charter that doesn't exist, or ignores the missing-charter problem
entirely.

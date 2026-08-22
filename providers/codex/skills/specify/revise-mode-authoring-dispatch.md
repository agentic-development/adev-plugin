# Revise Mode: Per-Anchor Authoring Dispatch (BEH-4)

Full instructions for Revise Mode step 2 (`skills/specify/SKILL.md`). Loaded only when Revise Mode runs.

## 1. Get the per-anchor grouping

```bash
adev specify group-blockers --spec <spec-path>
```

The verb wraps `lib/specify-revise.mjs::groupBlockersByAnchor` (documented here only — this SKILL.md never imports or calls it inline) and prints:

```json
{ "spec_path": "...", "anchors": { "<anchor>": { "blocker_ids": [...], "current_text": "..." } }, "anchors_not_found": [...] }
```

`anchors` is already filtered to `defect`-classed blockers only — `decision`/`external`-classed blockers are never authored (see Preconditions Delta / BEH-2 / BEH-3): `decision` halts the build loop before authoring is ever dispatched, and `external` is excluded from convergence accounting entirely.

## 2. Dispatch one authoring subagent per anchor, in parallel

For each distinct anchor key in `anchors`, dispatch one `Agent({...})`, scoped to ONLY that anchor's data:

- That anchor's `current_text` (the section's current content — never the whole spec).
- The blocker prose for each id in that anchor's `blocker_ids` (read from `<spec-stem>.blockers.md`'s per-`blocker_id` fenced prose block).
- Minimal frontmatter context (spec title, charter capability) — not the full spec.
- Instructions: return a rewritten section body that addresses the blocker prose, plus a one-line rationale. The subagent must not touch frontmatter delimiters (`---`) or introduce control characters — `adev specify revise` refuses (BEH-5a) any authored body that does, independently per anchor (one anchor's refusal never aborts a sibling anchor's valid splice).

## 3. Collect results

Collect each subagent's rewritten body into an `authoredSections` object keyed by anchor:

```json
{ "<anchor>": "<rewritten body>", "<anchor-2>": "<rewritten body>" }
```

## 4. Report anchors with no matching heading

Report every entry in `anchors_not_found` to the operator (a blocker's `section_anchor` matched no heading in the current spec — skip authoring for it; it stays `unresolved`, `ANCHOR_NOT_FOUND` advisory).

## 5. Hand off to the revise verb

If `anchors` is empty (no `defect`-classed blockers — e.g. everything is `decision`/`external`), proceed to step 3 of Revise Mode with no `--authored-sections` flag; the revise verb still bumps the revision, but nothing is spliced.

Otherwise, pass the collected `authoredSections` object to `adev specify revise --authored-sections <json-or-@path>` (step 3 of Revise Mode) — a JSON object literal for small revisions, or write it to a temp JSON file and pass `@<path>` when it would exceed a reasonable argv size.

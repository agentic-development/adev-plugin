# Revise Mode: Per-Anchor Authoring Dispatch (BEH-4)

Full instructions for `/adev:specify` Revise Mode step 2. Loaded only when Revise Mode runs.

## 1. Get the per-anchor grouping

```bash
adev specify group-blockers --spec <spec-path>
```

The verb wraps `lib/specify-revise.mjs::groupBlockersByAnchor` (documented here only — this SKILL.md never imports or calls it inline) and prints:

```json
{ "spec_path": "...", "anchors": { "<anchor>": { "blocker_ids": [...], "decisions": [{ "blocker_id": "...", "choice": "...", "note": "..." | null }], "current_text": "..." } }, "anchors_not_found": [...], "anchors_remapped": [{ "from": "...", "to": "..." }], "advisories": [{ "code": "DECISION_TEXT_REJECTED", "blocker_id": "...", "field": "...", "reason": "..." }] }
```

`anchors` holds `defect`-classed blockers and answered `decision` blockers (those whose sidecar entry carries a recorded choice). An answered decision is listed in its anchor's `blocker_ids` and again in its `decisions` (empty `[]` when the anchor has none). A recorded answer that fails the decision-text gate counts as unanswered and is reported in the output's `advisories` as `DECISION_TEXT_REJECTED`; report each one to the operator. An unanswered `decision` blocker is never authored: it halts the build loop before authoring is ever dispatched and stays in `decision_blocker_ids`. `external`-classed blockers are excluded from convergence accounting entirely.

## 2. Dispatch one authoring subagent per anchor, in parallel

For each distinct anchor key in `anchors`, dispatch one `Agent({...})`, scoped to ONLY that anchor's data:

- That anchor's `current_text` (the section's current content — never the whole spec).
- The blocker prose for each id in that anchor's `blocker_ids` (read from `<spec-stem>.blockers.md`'s per-`blocker_id` fenced prose block).
- Minimal frontmatter context (spec title, charter capability) — not the full spec.
- That anchor's `decisions` list, as binding instructions. For each entry in the anchor's `decisions`, the rewritten section MUST implement `choice` (and honor `note`). The decision is settled. Do not reopen it, offer alternatives, or write a `<!-- adev:decision` marker.
- Instructions: return a rewritten section body that addresses the blocker prose, plus a one-line rationale. The subagent must not touch frontmatter delimiters (`---`) or introduce control characters — `adev specify revise` refuses (BEH-5a) any authored body that does, independently per anchor (one anchor's refusal never aborts a sibling anchor's valid splice).

## 3. Collect results

Collect each subagent's rewritten body into an `authoredSections` object keyed by anchor:

```json
{ "<anchor>": "<rewritten body>", "<anchor-2>": "<rewritten body>" }
```

## 4. Report anchors with no matching heading

Report every entry in `anchors_not_found` to the operator (a blocker's `section_anchor` matched no heading in the current spec — skip authoring for it; it stays `unresolved`, `ANCHOR_NOT_FOUND` advisory). Entries in `anchors_remapped` need no action: a reviewer anchored to an item inside a section (`behaviors-2`), and the verb already grouped it under the section's heading (`behaviors`), so it is authored with that section.

## 5. Hand off to the revise verb

An anchor whose only blockers are answered decisions is still authored: dispatch it like any other anchor. If `anchors` is empty (no `defect`-classed or answered-decision blockers — e.g. everything is an open `decision` or `external`), proceed to step 3 of Revise Mode with no `--authored-sections` flag. Interactively the revise verb still bumps the revision without splicing anything; under `--auto` (the build loop) it refuses with `NOTHING_TO_REVISE` instead, because an unchanged revision cannot pass a re-review.

Otherwise, pass the collected `authoredSections` object to `adev specify revise --authored-sections <json-or-@path>` (step 3 of Revise Mode) — a JSON object literal for small revisions, or write it to a temp JSON file and pass `@<path>` when it would exceed a reasonable argv size.

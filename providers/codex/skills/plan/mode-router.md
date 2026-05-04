# Mode Router — Internal Documentation

This document describes the mode detection logic for `/adev:plan`. It is documentation only — no executable code lives here. The skill itself (SKILL.md) is the authoritative surface; this companion explains the _why_ and _how_ of detection precedence with concrete examples.

## Detection Precedence

Mode is resolved in this strict order. Stop at the first step that produces a single unambiguous mode.

```
1. Explicit flag      → highest priority, always wins
2. Path argument      → .md path → spec mode
3. Keyword detection  → free-text scanned for mode keywords
4. Project-state scan → infer from current .context-index/ state
5. Multi-choice menu  → fallback when ambiguity cannot be resolved
```

### Step 1 — Explicit Flag

An explicit flag (`--spec`, `--feature`, `--release`, `--milestone`, `--epic`) overrides everything. Keyword and state detection are skipped entirely.

Error case: if two or more mode flags are supplied together, emit `CONFLICTING_FLAGS` and exit.

**Examples:**
- `/adev:plan --spec auth/login.md` → Spec Mode, path `auth/login.md`
- `/adev:plan --feature auth` → Feature Mode, module `auth`
- `/adev:plan --release v2.0` → Release Mode, name `v2.0`
- `/adev:plan --milestone Q3` → Milestone Mode, name `Q3`
- `/adev:plan --epic epic-5` → Epic Mode, id `epic-5`
- `/adev:plan --spec x.md --feature auth` → `CONFLICTING_FLAGS` error, exit

### Step 2 — Path Argument

If a single bare argument ends in `.md` and looks like a file path (contains `/` or refers to a file under `.context-index/specs/`), treat it as a spec path and route to Spec Mode.

**Examples:**
- `/adev:plan multi-repo-workspace/init-workspace.md` → Spec Mode, path resolves to `.context-index/specs/features/multi-repo-workspace/init-workspace.md`
- `/adev:plan .context-index/specs/features/auth/login.md` → Spec Mode, absolute path used as-is

### Step 3 — Keyword Detection

If a plain-text argument is present (no `.md` extension), scan it for the following keywords (case-insensitive, first match wins):

| Keywords | Mode | Name extracted from |
|----------|------|---------------------|
| `release`, `launch` | Release Mode | remaining tokens after keyword |
| `milestone`, `phase` | Milestone Mode | remaining tokens after keyword |
| `feature`, `module`, `charter` | Feature Mode | remaining tokens after keyword |
| `epic` | Epic Mode | remaining tokens after keyword |
| `spec`, `task`, `tasks` | Spec Mode | ask user to provide path |

**Examples:**
- `"plan release v2"` → Release Mode, `name: "v2"`
- `"plan the Q3 milestone"` → Milestone Mode, `name: "Q3"` (extracted from position after keyword)
- `"plan feature payments"` → Feature Mode, `module: "payments"`
- `"plan epic-3"` → Epic Mode, `id: "epic-3"` (token matches `epic` prefix followed by digit)
- `"plan release"` (no name) → Release Mode, prompt user for release name

If multiple mode keywords appear in the same free-text argument, treat as ambiguous and fall through to Step 5 (multi-choice menu).

### Step 4 — Project-State Scan

When invoked with no flags and no arguments, scan `.context-index/` to infer intent:

| Condition | Proposed Mode |
|-----------|--------------|
| Exactly 1 reviewed spec (`.review.md` with passing verdict) lacking a `*.plan.md` | Spec Mode — propose that spec |
| Multiple reviewed specs lacking plans | Multi-choice menu listing each pending spec + other modes |
| No reviewed specs lacking plans; at least one charter has capabilities without specs | Feature Mode — propose the first charter with gaps |
| No obvious pending work | Multi-choice menu (Step 5) |

**Concrete state examples:**
- `.context-index/specs/features/auth/login.md` has `login.review.md` (PASS) but no `login.plan.md` → propose Spec Mode for `login.md`
- Three specs all have passing reviews but no plans → present menu listing all three plus Feature/Release/Milestone/Epic options
- All specs have plans; `payments/charter.md` has 2 capabilities with no corresponding spec files → propose Feature Mode for `payments`

### Step 5 — Multi-Choice Menu (Fallback)

When none of steps 1–4 resolve to a single mode, present this menu and await user selection:

```
What would you like to plan?

1. Spec      — decompose a reviewed Live Spec into Tasks
2. Feature   — identify missing specs for a charter module
3. Release   — build a release plan from product.md milestones
4. Milestone — create or update a milestone Epic
5. Epic      — decompose an existing Epic into missing Features

Enter a number or describe what you want to plan:
```

- If the user selects a number, proceed with that mode (ask for the specific target if needed).
- If the user types a description, re-run keyword detection (Step 3) on the new input.
- If the user dismisses or cancels without selecting, exit without action.

## Multi-Choice Fallback Rules

1. Always show all five options — do not hide modes based on project state (state is only used to pre-suggest, not to restrict).
2. If Step 4 identified a specific pending item, highlight it in the menu as the suggested default:
   ```
   > 1. Spec — decompose auth/login.md (suggested — review passed, no plan yet)
   ```
3. After the user selects, ask for the required argument (module, release name, epic ID) if it was not already provided.
4. A maximum of one round of re-prompting is allowed. If the user's second response is still ambiguous, emit a clear "I could not determine the planning scope" message and exit.

## Error Codes

| Code | Condition | Recovery |
|------|-----------|----------|
| `CONFLICTING_FLAGS` | Two or more mode flags passed simultaneously | Remove the conflicting flag and re-invoke |
| `REVIEW_GATE` | Spec Mode: spec lacks a passing review | Run `/adev:review-specs --spec <path>` first |
| `CHARTER_GATE` | Feature Mode: charter is missing or not approved | Create/approve the charter with `/adev:brainstorm` first |

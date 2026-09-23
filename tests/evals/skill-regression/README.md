# skill-regression fixture

A hermetic mini-project plus the ground truth that describes it. `project/` is
the fixture root: a small orders service carrying two parallel feature slices —
`create-order`, which is clean, and `shipping-rates`, into which ten classes of
defect are deliberately planted. `catalog.yaml` is the ground truth: it names
each planted violation, its file and its single-occurrence anchor, and pairs it
with the known-clean twin that proves a detector is specific rather than merely
loud.

Nothing here is this repository's own code. `project/` is test *data*, copied
into a fresh temporary directory before any skill runs against it; the
committed tree is input, never a workspace. `catalog.yaml` and this README sit
**outside** `project/` so the mini-project sees only what a real project would.

The fixture's guards live in `tests/lib/evals/`, not here, so they run on every
`npm test` even though the fixture itself is in the opt-in
`npm run test:evals` bucket:

- `tests/lib/evals/skill-regression-hermeticity.test.mjs` — the fixture cannot
  reach the network, the container runtime, an installer, or anything outside
  its own tree.
- `tests/lib/evals/skill-regression-catalog.test.mjs` — the catalog's thirteen
  integrity rules, and the catalog's relationship to the files it describes.

## Authoring rules

The three sentences below are **pinned verbatim by tests**. They are quoted as
exact literals in the two suites named above, each on a single line so a
substring match can find it. Rewording one is a test change, not an edit —
change the sentence and the assertion that quotes it in the same commit, or the
suite goes red. That is the point: each rule is a property no other mechanism
enforces, and prose alone lasts only until the next author disagrees with it.

### 1. Growth

Pair or do not add: every entry added to `planted_violations` ships with its known-clean twin in `known_clean`, because a planted violation without a known-clean twin is a sensitivity assertion with no specificity control.

Referential integrity runs the other way and does not substitute for this:
the catalog check asserts that every catalog id a rubric cites resolves, never
that every catalog entry is cited. An uncited entry is a fixture waiting for a
rubric. An unpaired one is a measurement with nothing to compare against — a
detector that fires on everything scores full marks on it.

### 2. Deploy runs are dry runs

Any run of `/adev:deploy` against this fixture passes `--dry-run`.

`project/.context-index/deploy.yaml` declares only `type: manual` steps, and a
separate hermeticity property holds it that way — but a step-type ban
constrains what a step *is*, not the mode it is invoked in. `executeManual`
(`lib/deploy.mjs`) never blocks; the pause is prose in `skills/deploy/SKILL.md`
asking the operator, so a driver that omits `--dry-run` gets an agent waiting
on a human rather than a wedged process. For that path the disposition is
stated rather than left to be discovered:

An unanswered manual step is treated as `abort` and reported, never waited on.

### 3. The run copy's `tasks.db_path`

Whoever prepares a run copy writes `tasks.db_path` as an absolute path inside that copy, because `resolveStorageRoot` returns the value verbatim (`lib/issues/resolve-root.mjs:30`) rather than resolving it against the manifest's directory, so a relative value resolves against the caller's `process.cwd()` — this repository's real board for a driver run from this checkout, letting `/adev:issues` create, claim or close live issues.

Absolute is not a style preference, which is why the reason travels with the
rule: read as style, the next author simplifies it back to `.beads/` and the
fixture starts writing into whatever board the process happens to be standing
in.

The rule governs **copies**. The committed manifest at
`project/.context-index/manifest.yaml` deliberately declares no
`tasks.db_path` at all, and a test asserts that absence separately — a value
committed here would apply to every run made from this checkout, which is the
failure the rule exists to prevent.

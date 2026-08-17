/**
 * Writable-registry table and per-registry field allowlists for
 * extension-supplied governance content.
 *
 * This module answers two questions and nothing else:
 *
 *   1. WHICH governance files may a third-party extension write into, and
 *      under which root YAML key does its content land?
 *   2. WHICH fields, with which values, may an extension contribute to an
 *      entry in each of those files?
 *
 * It deliberately does not merge, write, or resolve paths. Value safety is
 * delegated wholesale to `./governance-values.mjs`; argv path containment is
 * a separate concern handled downstream.
 *
 * Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
 *
 * @module lib/extensions/governance-registry
 */

import {
  assertSafeArgvToken,
  assertSafeScalar,
  assertStringId,
  assertValidValue,
} from './governance-values.mjs';

/**
 * The five governance files an extension may contribute to, mapped to the root
 * YAML key its entries live under.
 *
 * `validate.yaml` maps to `checks`, NOT `validators`. Verified at
 * `lib/governance/validate-config.mjs:110-111`, which reads
 * `Array.isArray(project.checks)` — a `validators:` key is simply never read,
 * so content written under it is silently ignored by the loader.
 *
 * This table replaced a private `inferRootKey` helper in `content-install.mjs`
 * that returned `validators` for this file and was wrong. That helper is now
 * deleted and `content-install.mjs` calls `resolveRootKey` instead, so the bug
 * has no second home — but do not "restore" the old value here.
 *
 * @type {Map<string, string>}
 */
export const WRITABLE_REGISTRIES = new Map([
  ['validate.yaml', 'checks'],
  ['review.yaml', 'reviewers'],
  ['gates.yaml', 'gates'],
  ['diagnostics.yaml', 'diagnostics'],
  ['boundaries.yaml', 'boundaries'],
]);

/**
 * Fields the installer owns and stamps itself. An extension that supplies one
 * is forging provenance, whatever it claims the value means.
 *
 * `__source` is named here — not merely left off the allowlists — because
 * `lib/governance/review-config.mjs:312-328` sets it during merge and `:390`
 * copies it onto the validated reviewer as LIVE provenance read off the raw
 * entry. An unnamed `__source` would fall through to GOVERNANCE_FIELD_NOT_ALLOWED,
 * which understates what the extension attempted.
 *
 * `source` and `exec_consented_at` are FILE-level provenance.
 * `lib/domains/merge-gates.mjs:41-47` projects only id/command/description/
 * severity/tier and drops them, so gate consumers never observe them. That is
 * intended: they exist for uninstall and audit, both of which read the file
 * rather than the merged gate set.
 *
 * @type {Set<string>}
 */
export const INSTALLER_OWNED = new Set(['source', '__source', 'exec_consented_at']);

/**
 * Per-registry exhaustive field allowlists.
 *
 * This is the CONTRIBUTION boundary, not any single loader's schema. Two facts
 * a later reader will be tempted to "fix":
 *
 *   - `gates.yaml` has two consumers with different contracts.
 *     `lib/domains/merge-gates.mjs:41-47` projects id/command/description/
 *     severity/tier and drops everything else, while `lib/gates/doctor.mjs:844`
 *     reads `gate?.kind` straight off the raw file. Neither set is the
 *     allowlist. `enabled` / `disabled_reason` are allowlisted because
 *     `explicit-governance-registries.spec.md` adds them, even though no loader
 *     reads them today; `kind` is NOT allowlisted, because doctor's read of it
 *     selects the gate's execution contract.
 *   - `boundaries.yaml` gets `enabled` / `disabled_reason` even though
 *     `explicit-governance-registries.spec.md:101` names only four registries.
 *     They are ordinary author-set toggles with no capability attached;
 *     omitting them would make the allowlist reject a perfectly valid
 *     hand-authored boundary rule the moment its author adds `enabled: false`.
 *   - `boundaries.yaml` also gets `flags`, for the same class of reason. The
 *     evaluator has read `entry.flags` since it shipped
 *     (`lib/governance/boundaries.mjs::loadRules`, `boundary-worker.mjs`), so
 *     omitting it here meant the runtime and the contribution boundary
 *     DISAGREED about the schema: an extension shipping a working
 *     case-insensitive rule was refused for a field the evaluator honours.
 *     Removing `flags` from the evaluator was the alternative and is worse —
 *     case-insensitivity is a real need for anti-pattern rules, and dropping it
 *     would silently change what every existing rule matches. The field is
 *     accepted but CONSTRAINED; see {@link assertRegexFlags}.
 *
 * @type {Map<string, Set<string>>}
 */
export const FIELD_ALLOWLIST = new Map([
  ['validate.yaml', new Set([
    'id', 'name', 'kind', 'severity', 'profile', 'context_pack', 'prompt',
    'after', 'description', 'command', 'fail_fast', 'enabled', 'disabled_reason',
  ])],
  ['review.yaml', new Set([
    'id', 'name', 'dispatch', 'profile', 'context_pack', 'severity_cap',
    'prompt', 'package', 'enabled', 'disabled_reason',
  ])],
  ['gates.yaml', new Set([
    'id', 'command', 'description', 'severity', 'tier', 'enabled', 'disabled_reason',
  ])],
  ['diagnostics.yaml', new Set([
    'id', 'runner', 'severity', 'tier', 'scope', 'enabled', 'disabled_reason',
  ])],
  ['boundaries.yaml', new Set([
    'id', 'severity', 'pattern', 'flags', 'exclude', 'description', 'enabled', 'disabled_reason',
  ])],
]);

/** Check kinds, mirrored from `lib/governance/validate-config.mjs:19-24`. */
const VALID_KINDS = new Set([
  'quality-gate',
  'subagent-review',
  'deterministic-check',
  'observational',
]);

/** Severity vocabulary, mirrored from `lib/governance/validate-config.mjs:25`. */
const VALID_SEVERITY = new Set(['error', 'warning', 'info']);

/**
 * Reviewer severity-cap vocabulary, mirrored from
 * `lib/governance/review-config.mjs:20`. Deliberately a DIFFERENT vocabulary
 * from {@link VALID_SEVERITY} — `error`/`info` are valid severities and invalid
 * caps, `blocker`/`suggestion` the reverse. Do not merge the two sets.
 *
 * Leaving `severity_cap` unconstrained is a capability grant in two directions:
 *   - An IN-vocabulary value silently weakens an existing reviewer. A project
 *     entry whose `id` collides with a bundled reviewer is merged field-by-field
 *     at `review-config.mjs:326` (`{...bundled, ...project}`), so
 *     `severity_cap: suggestion` downgrades that reviewer's findings until they
 *     can never block.
 *   - An OUT-of-vocabulary value denies review outright. It reaches
 *     `review-config.mjs:375-381`, which pushes a `REVIEWER_SEVERITY_CAP`
 *     error, and `skills/review-specs/SKILL.md:152` aborts the whole review on
 *     any loader error.
 */
const VALID_SEVERITY_CAP = new Set(['blocker', 'warning', 'suggestion']);

/**
 * Dispatch values an extension may set. `triggered` is REFUSED (Decision B).
 *
 * Two independent reasons:
 *   - `dispatch`'s only non-degenerate object form is two levels deep with
 *     array leaves: `lib/governance/review-config.mjs:167` reads
 *     `d.triggered ?? d`, then `:169-171` read `patterns` / `keywords` /
 *     `min_score`. Allowing it would hand an untrusted extension control over
 *     which files and which keywords summon a reviewer — a capability grant,
 *     not a preference.
 *   - Even where it is not a capability grant it is a trap: a bare string
 *     `dispatch: "triggered"` with no trigger object makes `shouldDispatch`
 *     compute `triggered = null` at `:167` and fall through to
 *     `default-always` at `:168` — silently the opposite of what the author
 *     wrote.
 */
const VALID_DISPATCH = new Set(['always', 'never']);

/**
 * Keys permitted inside a reviewer `package`. `args` is REFUSED (Decision B):
 * `lib/governance/review-config.mjs:418` is `validated.args = pkg.args ?? {}`
 * — completely unvalidated, arbitrary depth, passed straight through to the
 * reviewer.
 */
const VALID_PACKAGE_KEYS = new Set(['skill', 'adapter']);

/**
 * Field-value constraints. Every violation reports
 * `GOVERNANCE_FIELD_VALUE_INVALID`. These run before the generic value-safety
 * pass so that, e.g., `package: { skill, args: { x: 1 } }` reports the
 * disallowed `args` key rather than the nesting depth of its value.
 *
 * Only fields with a CLOSED vocabulary appear here. `profile`, `context_pack`
 * and `prompt` are deliberately absent — see {@link OPEN_NAMESPACE_FIELDS}.
 *
 * @type {Map<string, (value: unknown) => void>}
 */
export const FIELD_VALUE_CONSTRAINTS = new Map([
  ['kind', (value) => assertEnum(value, VALID_KINDS, 'kind')],
  ['severity', (value) => assertEnum(value, VALID_SEVERITY, 'severity')],
  ['severity_cap', (value) => assertEnum(value, VALID_SEVERITY_CAP, 'severity_cap')],
  ['dispatch', (value) => assertEnum(value, VALID_DISPATCH, 'dispatch')],
  ['runner', assertRunnerPrefix],
  ['package', assertPackageKeys],
  ['flags', assertRegexFlags],
]);

/**
 * Fields that carry the same "an invalid value aborts the loader" lever as
 * `severity_cap`, but whose valid values are NOT statically knowable.
 *
 *   - `profile` — resolved by `loadProfiles` against bundled AND project
 *     profiles; an unknown name yields `UNKNOWN_PROFILE`
 *     (`validate-config.mjs:423-428`) or a posture error
 *     (`review-config.mjs:119-127`), both fatal.
 *   - `context_pack` — resolved against merged packs; an unknown name yields
 *     `UNKNOWN_CONTEXT_PACK` (`context-pack.mjs:80-86`).
 *   - `prompt` — resolved to a real file by `resolveReviewerPath`
 *     (`review-config.mjs:424+`); an unresolvable value is fatal.
 *
 * Each namespace is open by design: a project may define its own profiles and
 * packs, and an extension may legitimately ship its own prompt. Any fixed set
 * written here would refuse valid content, and no fixed set could accept the
 * project-defined names. Closing this lever requires resolving the value
 * against `repoRoot` / `pluginRoot`, which a pure per-entry function does not
 * have.
 *
 * The lever IS closed, one layer up: `assertOpenNamespacesResolvable` in
 * `lib/extensions/content-install.mjs` iterates exactly this set and resolves
 * each value against the same merged project+plugin state the loaders read.
 * This export is that check's input, so removing a field from this set silently
 * stops resolving it — add to it, but do not prune it.
 *
 * @type {Set<string>}
 */
export const OPEN_NAMESPACE_FIELDS = new Set(['profile', 'context_pack', 'prompt']);

function refuse(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

/**
 * Regex flags a contributed boundary rule may carry.
 *
 * `i`, `m`, `s` and `u` change what a pattern MATCHES and nothing else, which is
 * the whole legitimate need (a case-insensitive anti-pattern rule is the
 * motivating one). Everything else is refused:
 *
 *   - `g` and `y` make the compiled RegExp STATEFUL through `lastIndex`.
 *     `lib/governance/boundary-worker.mjs` compiles a fresh RegExp per task and
 *     calls `exec` once, so today they are inert — which is exactly why they are
 *     refused rather than tolerated. The day that compile is hoisted or reused,
 *     a stateful flag starts silently skipping matches, and a boundary rule that
 *     stops firing is a merge gate that fails OPEN. An inert-today flag is not
 *     worth that.
 *   - `d` (`hasIndices`) is inert here permanently: only the first match's
 *     `index` crosses back from the worker.
 *   - `v` widens `u` with set notation and character-class escapes — more parser
 *     surface for no need this registry has.
 *
 * Duplicates are refused too (`new RegExp('x', 'ii')` throws, so accepting them
 * here would only defer the failure to evaluation time, where it takes the whole
 * run down instead of the one contribution).
 */
export const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 's', 'u']);

function assertRegexFlags(value) {
  if (typeof value !== 'string') {
    refuse(
      `Field 'flags' must be a string of regex flags, got ${Array.isArray(value) ? 'a list' : typeof value}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
  const seen = new Set();
  for (const ch of value) {
    if (!ALLOWED_REGEX_FLAGS.has(ch)) {
      refuse(
        `Field 'flags' may only contain ${[...ALLOWED_REGEX_FLAGS].join('')} — the flags that ` +
        `change what a pattern matches. Got ${JSON.stringify(value)}. 'g' and 'y' make the ` +
        `compiled pattern stateful and are refused because a boundary rule that quietly ` +
        `stops matching is a merge gate that fails open.`,
        'GOVERNANCE_FIELD_VALUE_INVALID'
      );
    }
    if (seen.has(ch)) {
      refuse(
        `Field 'flags' repeats '${ch}' (${JSON.stringify(value)}); a repeated flag does not compile.`,
        'GOVERNANCE_FIELD_VALUE_INVALID'
      );
    }
    seen.add(ch);
  }
}

function assertEnum(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    refuse(
      `Field '${field}' must be one of ${[...allowed].join('|')}, got ${JSON.stringify(value)}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
}

/**
 * A diagnostic runner an extension contributes must name a file the extension
 * itself ships. `project:` is refused as firmly as an absolute path: it names
 * project-owned files under `.context-index/diagnostics/` that the extension
 * does not ship and has no standing to point at.
 */
function assertRunnerPrefix(value) {
  if (typeof value !== 'string' || !value.startsWith('plugin:')) {
    refuse(
      `Field 'runner' must start with 'plugin:', got ${JSON.stringify(value)}. ` +
      `A 'project:' runner names project-owned files under .context-index/diagnostics/ ` +
      `that the extension does not ship.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
}

function assertPackageKeys(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse(
      `Field 'package' must be a map of ${[...VALID_PACKAGE_KEYS].join('/')} entries, ` +
      `got ${JSON.stringify(value)}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
  for (const key of Object.keys(value)) {
    if (!VALID_PACKAGE_KEYS.has(key)) {
      refuse(
        `Field 'package.${key}' is not contributable. Only ` +
        `${[...VALID_PACKAGE_KEYS].join(' and ')} may be supplied; ` +
        `'args' in particular is passed to the reviewer unvalidated ` +
        `(lib/governance/review-config.mjs:418).`,
        'GOVERNANCE_FIELD_VALUE_INVALID'
      );
    }
  }
}

/**
 * Validate a `command` as an argv list, using the ARGV rule rather than the
 * scalar rule.
 *
 * The two rules diverge on exactly one point that matters here: the scalar
 * rule's `UNSAFE_LEADING` refuses a leading `-`, while `assertSafeArgvToken`
 * permits it. Validating argv with the scalar rule would refuse
 * `[npm, test, --, --silent]` — the literal example in
 * `lib/governance/validate-config.mjs:439` — and make a legitimate gate
 * uncontributable. Shell metacharacters and whitespace are still refused by
 * the argv rule, so this is a narrowing of the character class, not of the
 * guarantee.
 *
 * This is token safety only. Whether a path-shaped token resolves INSIDE the
 * extension is argv containment, which belongs to the install/merge layer that
 * has the extension root; it is deliberately not attempted here.
 *
 * Note the argv rule is scoped to `command` alone. `prompt`, `package.skill`
 * and `package.adapter` keep the scalar rule: their `plugin:<skill>/<file>`
 * form (skills/review-specs/SKILL.md:149) contains a colon, which `ARGV_TOKEN`
 * does not admit, so the argv rule would refuse every valid package reviewer.
 *
 * @param {unknown} command - Supplied command value.
 * @param {string} fieldPath - Dotted path used in messages.
 * @throws {Error} code `GOVERNANCE_FIELD_VALUE_INVALID`, `GOVERNANCE_SCALAR_UNSAFE`
 *   or `GOVERNANCE_LIMIT_EXCEEDED`.
 */
function assertArgvCommand(command, fieldPath) {
  if (!Array.isArray(command)) {
    refuse(
      `Field '${fieldPath}' must be an argv list (e.g. [npm, test, --, --silent]), got ` +
      `${JSON.stringify(command)}. Shell-form strings are refused to prevent injection ` +
      `(lib/domains/merge-gates.mjs:34-40, lib/governance/validate-config.mjs:437-442).`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
  for (const token of command) assertSafeArgvToken(token);
}

/**
 * Resolve a governance filename to the root YAML key its entries live under.
 *
 * Anything outside {@link WRITABLE_REGISTRIES} is refused, explicitly including
 * `risk-policies.yaml` and `sensitive-paths.yaml`. Those two are the project's
 * own guard boundary — which paths count as sensitive, and which risk levels
 * demand review, are decisions the project makes about the extension, never
 * decisions the extension makes about itself.
 *
 * @param {string} target - Governance filename, e.g. `gates.yaml`.
 * @returns {string} The root YAML key.
 * @throws {Error} code `UNKNOWN_GOVERNANCE_TARGET`.
 */
export function resolveRootKey(target) {
  const rootKey = WRITABLE_REGISTRIES.get(target);
  if (rootKey === undefined) {
    refuse(
      `Governance target ${JSON.stringify(target)} is not extension-writable. ` +
      `Writable targets: ${[...WRITABLE_REGISTRIES.keys()].join(', ')}. ` +
      `risk-policies.yaml and sensitive-paths.yaml are the project's own guard ` +
      `boundary and are never third-party writable.`,
      'UNKNOWN_GOVERNANCE_TARGET'
    );
  }
  return rootKey;
}

/**
 * Refuse a `runner` field on any registry but `diagnostics.yaml`.
 *
 * `runner` names a module the engine imports and executes, so it is scoped to
 * the one registry whose loader knows how to resolve and sandbox it
 * (`lib/diagnostics/index.mjs`). Elsewhere it is an unrecognised field that
 * some future loader might start honouring.
 *
 * @param {string} field - Field name being contributed.
 * @param {string} target - Governance filename the field is destined for.
 * @throws {Error} code `GOVERNANCE_FIELD_NOT_ALLOWED`.
 */
export function assertRunnerScope(field, target) {
  if (field === 'runner' && target !== 'diagnostics.yaml') {
    refuse(
      `Field 'runner' is only contributable to diagnostics.yaml, not ${target}. ` +
      `A runner names an executable module and is scoped to the loader that ` +
      `resolves it.`,
      'GOVERNANCE_FIELD_NOT_ALLOWED'
    );
  }
}

/**
 * Whether an entry must carry a `command`.
 *
 * True for every `gates.yaml` entry (`lib/domains/merge-gates.mjs:29-32` drops
 * a commandless gate with an INVALID_GATE warning) and for a `validate.yaml`
 * entry whose `kind` is `quality-gate`
 * (`lib/governance/validate-config.mjs:429-443` rejects it as
 * QUALITY_GATE_COMMAND_MISSING). A commandless entry in either position is
 * silently dropped downstream, so it is refused at contribution time instead.
 *
 * @param {string} target - Governance filename.
 * @param {{ kind?: unknown }} entry - Governance entry.
 * @returns {boolean} True when `command` is mandatory.
 */
export function requiresCommand(target, entry) {
  if (target === 'gates.yaml') return true;
  if (target === 'validate.yaml') return entry?.kind === 'quality-gate';
  return false;
}

/**
 * Validate every field of one extension-supplied governance entry.
 *
 * Check order is contract, not incidental — each step's verdict must not be
 * masked by a later one:
 *
 *   1. resolve the target                     → UNKNOWN_GOVERNANCE_TARGET
 *   2. installer-owned field present          → GOVERNANCE_SOURCE_FORGED
 *   3. field outside the target's allowlist   → GOVERNANCE_FIELD_NOT_ALLOWED
 *   4. field-value constraints                → GOVERNANCE_FIELD_VALUE_INVALID
 *   5. id shape, then per-value safety        → delegated to governance-values
 *                                               (`command` takes the ARGV rule,
 *                                                every other field the SCALAR rule)
 *   6. required `command` present             → GOVERNANCE_FIELD_VALUE_INVALID
 *
 * Step 2 precedes step 3 so a supplied `source` / `__source` /
 * `exec_consented_at` always reports the forgery, never the weaker
 * "field not allowed". Step 4 precedes step 5 so a constraint violation is not
 * masked by a value-shape complaint about the same field. Step 5's
 * `assertStringId` precedes the per-field pass because a non-string id defeats
 * collision detection regardless of what else the entry contains.
 *
 * Note the value pass is per-ENTRY. The `entriesPerTarget` cap belongs to the
 * merge level and is deliberately not applied here.
 *
 * @param {string} target - Governance filename, e.g. `review.yaml`.
 * @param {Record<string, unknown>} entry - Extension-supplied entry.
 * @throws {Error} codes `UNKNOWN_GOVERNANCE_TARGET`, `GOVERNANCE_SOURCE_FORGED`,
 *   `GOVERNANCE_FIELD_NOT_ALLOWED`, `GOVERNANCE_FIELD_VALUE_INVALID`,
 *   `GOVERNANCE_SCALAR_UNSAFE`, `GOVERNANCE_LIMIT_EXCEEDED`.
 */
export function validateEntryFields(target, entry) {
  // 1. Unknown target — refused before any field is even read.
  resolveRootKey(target);

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    refuse(
      `Governance entry for ${target} must be a map, got ${JSON.stringify(entry)}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }

  const fields = Object.keys(entry);

  // 2. Installer-owned provenance wins the precedence race over the allowlist.
  for (const field of fields) {
    if (INSTALLER_OWNED.has(field)) {
      refuse(
        `Field '${field}' is stamped by the installer and cannot be supplied by an ` +
        `extension. Supplying it forges provenance for ${target}.`,
        'GOVERNANCE_SOURCE_FORGED'
      );
    }
  }

  // 3. Allowlist.
  const allowed = FIELD_ALLOWLIST.get(target);
  for (const field of fields) {
    assertRunnerScope(field, target);
    if (!allowed.has(field)) {
      refuse(
        `Field '${field}' is not contributable to ${target}. Allowed fields: ` +
        `${[...allowed].join(', ')}.`,
        'GOVERNANCE_FIELD_NOT_ALLOWED'
      );
    }
  }

  // 4. Field-value constraints, before generic value safety.
  for (const field of fields) {
    const constraint = FIELD_VALUE_CONSTRAINTS.get(field);
    if (constraint) constraint(entry[field]);
  }

  // 5. Value safety, delegated to the shared primitives.
  assertStringId(entry);
  assertSafeScalar(entry.id, `${target}.id`);
  for (const field of fields) {
    if (field === 'id') continue;
    if (field === 'command') {
      assertArgvCommand(entry.command, `${target}.command`);
      continue;
    }
    assertValidValue(entry[field], `${target}.${field}`);
  }

  // 6. Required command.
  if (requiresCommand(target, entry) && entry.command === undefined) {
    refuse(
      `Entry '${entry.id}' in ${target} requires a 'command' argv list; a commandless ` +
      `entry is dropped by its loader rather than executed.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
}

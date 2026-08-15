/**
 * Install-time consent for extension-supplied executable contributions.
 *
 * An extension that contributes a `command` to `gates.yaml` / `validate.yaml`,
 * or a `package.skill` / `package.adapter` to a reviewer registry, is asking
 * the project to run its code. That is a decision for the operator, taken
 * BEFORE anything is written to the project.
 *
 * Three properties define this module:
 *
 *   1. **Union per INSTALL, not per target.** A manifest whose first block is
 *      benign and whose second block ships a command must surface BOTH before
 *      a single byte is spliced. {@link collectExecutableContributions} walks
 *      every block of every target and returns one flat list.
 *   2. **Fails closed.** `interactive` defaults to `false`, so a
 *      non-TTY installer (CI, a piped shell, a nested agent) that did not pass
 *      `--allow-exec` REFUSES rather than silently consenting. The caller
 *      computes `interactive` as
 *      `Boolean(process.stdin.isTTY && process.stdout.isTTY)`.
 *      Only an explicit affirmative answer grants; empty input, EOF and a
 *      prompt that throws are all refusals.
 *   3. **Per-install, never persisted.** Nothing here writes to
 *      `manifest.yaml` or anywhere else, and there is deliberately no
 *      "remember this choice" cache. Consent is re-asked on every install
 *      because the payload can change between versions. The returned `at`
 *      stamp is for the caller's in-memory record (`exec_consented_at`), which
 *      is installer-owned — see `INSTALLER_OWNED` in `governance-registry.mjs`.
 *
 * The `{ entryId, field, value }` shape produced here is exactly what
 * `planExecPayload` in `lib/extensions/exec-payload.mjs` consumes, so the
 * consented set and the contained set are the same set by construction.
 *
 * Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
 *
 * @module lib/extensions/exec-consent
 */

import { requiresCommand } from './governance-registry.mjs';

const NOT_CONSENTED = 'GOVERNANCE_EXEC_NOT_CONSENTED';

/** Answers that grant, after trimming and lowercasing. */
const AFFIRMATIVE = new Set(['y', 'yes']);

/** Reviewer payload fields, in the order they are rendered to the operator. */
const PACKAGE_FIELDS = [
  ['skill', 'package.skill'],
  ['adapter', 'package.adapter'],
];

function refuse(message) {
  const err = new Error(message);
  err.code = NOT_CONSENTED;
  throw err;
}

/**
 * Render one contribution the way it would actually execute.
 *
 * An argv array is joined with spaces — not quoted, not escaped — because the
 * operator is reading it, not re-running it, and any transformation would make
 * the listing something other than verbatim.
 *
 * @param {{ field: string, value: unknown }} contribution
 * @returns {string} Human-readable rendering of the executable value.
 */
export function renderContributionValue({ field, value }) {
  if (field === 'command' && Array.isArray(value)) return value.join(' ');
  return String(value);
}

/**
 * Collect every executable contribution across every governance block.
 *
 * Executable means: a `command` on an entry that will be executed
 * (`requiresCommand` — every `gates.yaml` entry, and a `validate.yaml` entry
 * whose `kind` is `quality-gate`), or a reviewer `package.skill` /
 * `package.adapter`, which `resolveReviewerPath` resolves and the reviewer
 * then runs. A `validate.yaml` entry with a non-`quality-gate` kind is NOT
 * collected: its `command` is never executed.
 *
 * @param {Array<{ target: string, entries?: Array<object> }>} governanceBlocks
 * @returns {Array<{ target: string, entryId: string, field: string, value: unknown }>}
 *   The union across the whole install, in declaration order.
 */
export function collectExecutableContributions(governanceBlocks) {
  const blocks = Array.isArray(governanceBlocks) ? governanceBlocks : [];
  const contributions = [];

  for (const block of blocks) {
    const target = block?.target;
    const entries = Array.isArray(block?.entries) ? block.entries : [];

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const entryId = entry.id;

      if (entry.command !== undefined && requiresCommand(target, entry)) {
        contributions.push({ target, entryId, field: 'command', value: entry.command });
      }

      const pkg = entry.package;
      if (pkg && typeof pkg === 'object') {
        for (const [key, field] of PACKAGE_FIELDS) {
          if (pkg[key] !== undefined) {
            contributions.push({ target, entryId, field, value: pkg[key] });
          }
        }
      }
    }
  }

  return contributions;
}

/**
 * Render the verbatim listing shown to the operator before consent.
 *
 * Each line carries the target registry, the entry id and the value exactly as
 * declared, so the operator can see precisely what would execute and where it
 * was spliced in from.
 *
 * @param {{ extensionName?: string,
 *           contributions: Array<{ target: string, entryId: string, field: string, value: unknown }> }} input
 * @returns {string} The prompt text.
 */
export function renderConsentPrompt({ extensionName, contributions } = {}) {
  const list = Array.isArray(contributions) ? contributions : [];
  const name = extensionName ?? 'this extension';
  const lines = list.map(
    (c) => `  - ${c.target} [${c.entryId}] ${c.field}: ${renderContributionValue(c)}`
  );

  return [
    `Extension '${name}' contributes ${list.length} executable ` +
    `${list.length === 1 ? 'entry' : 'entries'}. These will be run by this project:`,
    ...lines,
    '',
    'Consent applies to this install only and is never remembered.',
    'Allow these to be installed? [y/N]',
  ].join('\n');
}

/**
 * Decide whether the operator consents to this install's executable payload.
 *
 * @param {object} input
 * @param {Array<{ target: string, entryId: string, field: string, value: unknown }>} input.contributions
 * @param {string} [input.extensionName] - Named in the prompt and the refusal.
 * @param {boolean} [input.allowExec=false] - The `--allow-exec` flag.
 * @param {boolean} [input.interactive=false] - Caller-computed TTY state; defaults
 *   to `false` so a non-TTY install fails closed.
 * @param {(text: string) => string} [input.promptFn] - Asks the operator. Only
 *   consulted when `interactive` is true and there is something to consent to.
 * @returns {{ granted: true, at: string|null }} `at` is `null` only when there
 *   was nothing executable to consent to.
 * @throws {Error} code `GOVERNANCE_EXEC_NOT_CONSENTED`.
 */
export function resolveExecConsent({
  contributions,
  extensionName,
  allowExec = false,
  interactive = false,
  promptFn,
} = {}) {
  const list = Array.isArray(contributions) ? contributions : [];

  // Nothing executable: there is nothing to consent to, so do not prompt and
  // do not stamp. An `at` here would falsely record that an operator approved
  // a payload that does not exist.
  if (list.length === 0) return { granted: true, at: null };

  if (allowExec === true) return { granted: true, at: new Date().toISOString() };

  const listing = list
    .map((c) => `  - ${c.target} [${c.entryId}] ${c.field}: ${renderContributionValue(c)}`)
    .join('\n');
  const name = extensionName ?? 'this extension';

  if (interactive === true) {
    const prompt = renderConsentPrompt({ extensionName, contributions: list });
    let answer;
    try {
      answer = typeof promptFn === 'function' ? promptFn(prompt) : undefined;
    } catch {
      // A prompt that throws (closed stdin, EOF, a broken TTY) never grants.
      answer = undefined;
    }
    if (typeof answer === 'string' && AFFIRMATIVE.has(answer.trim().toLowerCase())) {
      return { granted: true, at: new Date().toISOString() };
    }
    refuse(
      `Install refused: consent was not given for the executable contributions of ` +
      `extension '${name}':\n${listing}`
    );
  }

  refuse(
    `Install refused: extension '${name}' contributes executable entries and no ` +
    `consent was given. Re-run interactively, or pass --allow-exec to approve ` +
    `these for this install only (consent is never remembered):\n${listing}`
  );
}

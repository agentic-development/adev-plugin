/**
 * Containment, relocation and rewrite of extension-supplied executable payloads.
 *
 * The spec's original bound — "contain every contributed command path to the
 * extension's installed directory" — is unimplementable as stated, for two
 * verified reasons:
 *
 *   1. `resolvedPath` is not durable. `lib/extensions/resolve-source.mjs:127`
 *      (npm) and `:171` (git) return an OS temp dir from `mkdtempSync`, and
 *      `lib/extensions/install.mjs:178-183` deletes it in a `finally`. A
 *      containment rule keyed on that directory names a path that no longer
 *      exists when the gate later runs.
 *   2. Both executors resolve relative argv against the PROJECT ROOT, not the
 *      extension. `lib/gates/doctor.mjs:965` spawns with `cwd: projectRoot`;
 *      `lib/governance/quality-gate.mjs:39-55` runs `execFile(executable,
 *      args, { cwd: ctx.cwd, shell: false })`. An install-time check against
 *      one base and a run-time resolution against another is not a
 *      containment property at all.
 *
 * Decision A (spec revision 5): the installer COPIES the declared executable
 * payload into a project-owned directory `.context-index/extensions/<name>/`
 * and REWRITES every contributed path element to point there. Because the
 * rewritten `command` path is absolute, `cwd` becomes irrelevant and the
 * install-time check IS the run-time guarantee.
 *
 * ## Two emission forms — deliberately not collapsed
 *
 * Containment is asserted identically for every path element. The EMITTED
 * value differs by field, because the two consumers have incompatible path
 * contracts:
 *
 *   - `command` argv elements → ABSOLUTE. `doctor.mjs:965` and
 *     `quality-gate.mjs:45-51` both resolve relative argv against a `cwd`
 *     this module does not control, so only an absolute path is safe.
 *   - `package.skill` / `package.adapter` → `.context-index/`-RELATIVE, i.e.
 *     `extensions/<name>/<path-inside-extension>`.
 *     `lib/governance/review-config.mjs:459-465` rejects an absolute path with
 *     `ABS_PATH_REJECTED` and returns immediately — before the `..` guard
 *     (`:467-474`), before the `resolve` + `REPO_PATH_ESCAPE` containment check
 *     (`:476-484`), before the existence check (`:485-491`), and before the
 *     realpath step (`:492-503`). An absolute emission here is therefore
 *     permanently unloadable: no amount of the file being present or resolving
 *     to a legitimate location can rescue it.
 *
 * Every rewrite therefore carries BOTH forms plus an explicit `form`
 * discriminator, and both are derived from the SAME `toRelative` so that
 * `resolve(projectRoot, '.context-index', contextRelative) === absolute`
 * holds by construction rather than by coincidence.
 *
 * This module extends the containment pattern in
 * `lib/extensions/content-install.mjs:285-340` (`installSamples`), which is
 * `resolve()` + `startsWith(dir + '/')` and does NOT realpath. Realpathing is
 * added here, on both sides — see {@link assertContained}.
 *
 * Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
 *
 * @module lib/extensions/exec-payload
 */

import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  assertSafeArgvToken,
  assertWithinCaps,
  isArgvPathElement,
} from './governance-values.mjs';

/**
 * Interpreters permitted at `argv[0]` when the token is not itself a contained
 * payload path. Exported so the spec and docs cite one source rather than
 * re-listing the set.
 * @type {readonly string[]}
 */
export const INTERPRETER_ALLOWLIST = Object.freeze(['bash', 'sh', 'node', 'python3']);

/** Same kebab shape the repo uses for domain names. */
const EXTENSION_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A `<flag>=<value>` argv token; group 1 is the flag prefix, group 2 the value. */
const FLAG_ASSIGNMENT = /^(--?[^=]+=)(.*)$/s;

/** Fields whose emitted value is `.context-index/`-relative rather than absolute. */
const CONTEXT_RELATIVE_FIELDS = new Set(['package.skill', 'package.adapter']);

const ESCAPES = 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION';
const MISSING = 'GOVERNANCE_PAYLOAD_MISSING';

function refuse(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

/**
 * Resolve the project-owned payload directory for an extension.
 *
 * A malformed `extensionName` refuses with `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`,
 * NOT `GOVERNANCE_PAYLOAD_MISSING`: the name is the only component of this path
 * an extension controls, so `../escape` or an absolute-looking name is an
 * attempt to place the payload directory outside `.context-index/extensions/`.
 * That is a containment failure, not a missing-payload condition.
 *
 * @param {string} projectRoot - Absolute project root.
 * @param {string} extensionName - Kebab-case extension name.
 * @returns {string} `<projectRoot>/.context-index/extensions/<extensionName>`.
 * @throws {Error} code `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`.
 */
export function payloadDir(projectRoot, extensionName) {
  if (typeof projectRoot !== 'string' || projectRoot === '') {
    refuse(`projectRoot must be a non-empty string, got ${JSON.stringify(projectRoot)}.`, ESCAPES);
  }
  if (typeof extensionName !== 'string' || !EXTENSION_NAME_PATTERN.test(extensionName)) {
    refuse(
      `Extension name ${JSON.stringify(extensionName)} is not kebab-case ` +
      `(${EXTENSION_NAME_PATTERN}); the payload directory would escape ` +
      `.context-index/extensions/.`,
      ESCAPES
    );
  }
  return join(projectRoot, '.context-index', 'extensions', extensionName);
}

/**
 * Assert that `candidate` resolves inside `baseDir`, comparing REAL paths.
 *
 * Both sides are realpath'd. Realpathing the base is not optional: on macOS
 * `/var` is a symlink to `/private/var`, so a raw `startsWith` against an
 * unrealpathed base fails on exactly the temp directories the tests use.
 *
 * A `realpathSync` throw (ENOENT, broken symlink, EACCES) is a REFUSAL, never
 * a silent pass and never a fallback to the unresolved path.
 *
 * A containment failure is always `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`; an
 * unresolvable candidate is always `GOVERNANCE_PAYLOAD_MISSING`. These are
 * fixed, not caller-selectable: which of the two applies is a property of what
 * the filesystem reported, never of who is asking.
 *
 * @param {string} baseDir - Directory the candidate must stay within.
 * @param {string} candidate - Path to check.
 * @param {{ label?: string }} [options] - `label` names the candidate in messages.
 * @returns {string} The realpath of the candidate.
 * @throws {Error} code `GOVERNANCE_COMMAND_ESCAPES_EXTENSION` or `GOVERNANCE_PAYLOAD_MISSING`.
 */
export function assertContained(baseDir, candidate, options = {}) {
  const escapeCode = ESCAPES;
  const missingCode = MISSING;
  const label = options.label ?? candidate;

  let realBase;
  try {
    realBase = realpathSync(resolve(baseDir));
  } catch (e) {
    refuse(`Cannot resolve containment base '${baseDir}': ${e.message}.`, escapeCode);
  }

  // Lexical pre-check, before any filesystem access: a relative candidate that
  // already traverses out of the base is an ESCAPE, and that verdict must not
  // be masked by the target merely not existing (`../../etc/passwd` on a
  // machine without that path would otherwise report as missing, not escaping).
  // Skipped for an absolute candidate, which is legitimately compared through
  // realpaths — the base itself may be reached via a symlink.
  const lexicalBase = resolve(baseDir);
  if (!isAbsolute(candidate)) {
    const lexical = resolve(lexicalBase, candidate);
    if (lexical !== lexicalBase && !lexical.startsWith(lexicalBase + sep)) {
      refuse(
        `Payload path '${label}' resolves to '${lexical}', which escapes '${lexicalBase}'.`,
        escapeCode
      );
    }
  }

  let real;
  try {
    real = realpathSync(resolve(baseDir, candidate));
  } catch (e) {
    refuse(
      `Payload path '${label}' cannot be resolved: ${e.message}. ` +
      `An unresolvable path is refused, never assumed contained.`,
      missingCode
    );
  }

  if (real !== realBase && !real.startsWith(realBase + sep)) {
    refuse(
      `Payload path '${label}' resolves to '${real}', which escapes '${realBase}'.`,
      escapeCode
    );
  }
  return real;
}

/**
 * Plan the copy + rewrite for an extension's contributed executable payload.
 *
 * Writes NOTHING. The payload set is derived entirely from `contributions`;
 * there is no manifest-declared payload list.
 *
 * @param {object} input
 * @param {string} input.extensionRoot - Extension source directory (may be a temp dir).
 * @param {string} input.extensionName - Kebab-case extension name.
 * @param {string} input.projectRoot - Absolute project root.
 * @param {Array<{ entryId: string, field: string, value: unknown }>} input.contributions
 * @returns {{ copies: Array<{ from: string, toRelative: string }>,
 *             rewrites: Array<{ entryId: string, field: string, index: number|null,
 *                               form: 'absolute'|'contextRelative', prefix: string,
 *                               absolute: string, contextRelative: string }>,
 *             contributions: Array<{ entryId: string, field: string, value: unknown }>,
 *             extensionName: string, projectRoot: string }}
 * @throws {Error} codes `GOVERNANCE_COMMAND_NOT_ARGV`, `GOVERNANCE_LIMIT_EXCEEDED`,
 *   `GOVERNANCE_COMMAND_ESCAPES_EXTENSION`, `GOVERNANCE_PAYLOAD_MISSING`,
 *   `GOVERNANCE_SCALAR_UNSAFE`.
 */
export function planExecPayload({ extensionRoot, extensionName, projectRoot, contributions }) {
  const destDir = payloadDir(projectRoot, extensionName);
  const list = Array.isArray(contributions) ? contributions : [];

  /** @type {Map<string, string>} realpath of source → payload-relative destination */
  const copies = new Map();
  const rewrites = [];

  /**
   * Contain a single path token, register its copy, and return its rewrite
   * geometry. Both emission forms are derived from the same `toRelative`.
   */
  const containPath = (token, label) => {
    if (isAbsolute(token)) {
      refuse(
        `Payload path '${label}' is absolute; extensions may only name paths ` +
        `relative to their own root.`,
        ESCAPES
      );
    }
    const real = assertContained(extensionRoot, token, { label });
    // A payload member must be a regular file. Without this guard a
    // contribution naming a directory passes planning and then throws a raw
    // EISDIR out of `copyFileSync` at apply time — fail-closed, but carrying
    // no governance code, so callers would surface it as a crash rather than
    // as a refusal. Checked here so the verdict lands at PLAN time.
    if (!statSync(real).isFile()) {
      refuse(
        `Payload path '${label}' resolves to '${real}', which is not a regular file. ` +
        `Only regular files may be relocated into the payload directory.`,
        MISSING
      );
    }
    // Safe to realpath unguarded here: assertContained already resolved the
    // same base and refused if it could not.
    const toRelative = relative(realpathSync(resolve(extensionRoot)), real);
    if (toRelative === '' || toRelative.startsWith('..')) {
      refuse(`Payload path '${label}' does not name a file inside the extension.`, ESCAPES);
    }
    if (!copies.has(real)) {
      copies.set(real, toRelative);
      assertWithinCaps({ payloadFiles: copies.size }, `extension '${extensionName}' payload`);
    }
    const segments = toRelative.split(sep);
    return {
      absolute: join(destDir, ...segments),
      contextRelative: ['extensions', extensionName, ...segments].join('/'),
    };
  };

  for (const contribution of list) {
    const { entryId, field, value } = contribution ?? {};

    if (field === 'command') {
      if (!Array.isArray(value)) {
        refuse(
          `Entry '${entryId}': 'command' must be an argv array, got ` +
          `${typeof value}. A string command would be re-split by a shell.`,
          'GOVERNANCE_COMMAND_NOT_ARGV'
        );
      }
      if (value.length === 0) {
        refuse(`Entry '${entryId}': 'command' argv array must not be empty.`, 'GOVERNANCE_COMMAND_NOT_ARGV');
      }
      assertWithinCaps({ argvElements: value.length }, `entry '${entryId}' command`);

      for (const [index, token] of value.entries()) {
        const label = `${entryId}.command[${index}]`;

        if (index === 0 && INTERPRETER_ALLOWLIST.includes(token)) continue;

        if (index === 0 && !isArgvPathElement(token)) {
          refuse(
            `Entry '${entryId}': command executable ${JSON.stringify(token)} is neither an ` +
            `allowlisted interpreter (${INTERPRETER_ALLOWLIST.join(', ')}) nor a path inside ` +
            `the extension.`,
            ESCAPES
          );
        }

        if (!isArgvPathElement(token)) {
          assertSafeArgvToken(token);
          continue;
        }

        const assignment = index === 0 ? null : String(token).match(FLAG_ASSIGNMENT);
        const prefix = assignment ? assignment[1] : '';
        const pathPart = assignment ? assignment[2] : token;

        const geometry = containPath(pathPart, label);
        rewrites.push({
          entryId,
          field,
          index,
          form: 'absolute',
          prefix,
          absolute: geometry.absolute,
          contextRelative: geometry.contextRelative,
        });
      }
      continue;
    }

    if (CONTEXT_RELATIVE_FIELDS.has(field)) {
      if (typeof value !== 'string' || value === '') {
        refuse(
          `Entry '${entryId}': '${field}' must be a non-empty string path, got ${typeof value}.`,
          'GOVERNANCE_FIELD_VALUE_INVALID'
        );
      }
      const geometry = containPath(value, `${entryId}.${field}`);
      rewrites.push({
        entryId,
        field,
        index: null,
        form: 'contextRelative',
        prefix: '',
        absolute: geometry.absolute,
        contextRelative: geometry.contextRelative,
      });
      continue;
    }

    refuse(
      `Entry '${entryId}': unsupported payload field ${JSON.stringify(field)}; ` +
      `expected 'command', 'package.skill' or 'package.adapter'.`,
      'GOVERNANCE_FIELD_NOT_ALLOWED'
    );
  }

  return {
    copies: [...copies].map(([from, toRelative]) => ({ from, toRelative })),
    rewrites,
    contributions: list,
    extensionName,
    projectRoot,
  };
}

/**
 * Execute a plan: copy the payload, lock it down, and return the rewritten
 * contributions.
 *
 * Each destination is re-asserted contained against the realpath'd payload
 * directory AFTER the copy, so a symlink introduced between plan and apply
 * cannot land a file outside the payload tree.
 *
 * @param {ReturnType<typeof planExecPayload>} plan
 * @param {string} projectRoot - Absolute project root.
 * @param {string} extensionName - Kebab-case extension name.
 * @returns {Array<{ entryId: string, field: string, value: string[]|string }>}
 *   Rewritten contributions: `command` carries an argv array of absolute
 *   payload paths; `package.*` carries a single `.context-index/`-relative path.
 */
export function applyExecPayload(plan, projectRoot, extensionName) {
  // The rewrites were computed against the plan's own root and name. Applying
  // them under a different destination copies the files to root B while the
  // returned argv still points into root A — dangling paths that no later
  // containment check would catch, because each half is internally consistent.
  // The whole point of this module is that the emitted path IS the written
  // path, so the binding is asserted rather than assumed.
  if (plan?.projectRoot !== projectRoot || plan?.extensionName !== extensionName) {
    refuse(
      `Plan/apply mismatch: plan was built for extension ` +
      `${JSON.stringify(plan?.extensionName)} under ${JSON.stringify(plan?.projectRoot)}, ` +
      `but apply was called for ${JSON.stringify(extensionName)} under ` +
      `${JSON.stringify(projectRoot)}. The rewritten paths would not name the ` +
      `files this call writes.`,
      MISSING
    );
  }

  const destDir = payloadDir(projectRoot, extensionName);
  mkdirSync(destDir, { recursive: true });
  const realDestDir = realpathSync(destDir);

  const written = [];
  for (const { from, toRelative } of plan.copies) {
    const dest = join(destDir, ...toRelative.split(sep));
    mkdirSync(dirname(dest), { recursive: true });
    // A prior run left the file mode 0o555; copying onto it would EACCES.
    rmSync(dest, { force: true });
    copyFileSync(from, dest);
    chmodSync(dest, 0o555);
    written.push(dest);
  }

  for (const dest of written) {
    assertContained(realDestDir, dest, { label: dest });
  }

  const byEntry = new Map();
  for (const rewrite of plan.rewrites) {
    const key = `${rewrite.entryId} ${rewrite.field}`;
    if (!byEntry.has(key)) byEntry.set(key, []);
    byEntry.get(key).push(rewrite);
  }

  return plan.contributions.map(({ entryId, field, value }) => {
    const applicable = byEntry.get(`${entryId} ${field}`) ?? [];

    if (field === 'command') {
      const argv = [...value];
      for (const rewrite of applicable) {
        argv[rewrite.index] = `${rewrite.prefix}${rewrite.absolute}`;
      }
      return { entryId, field, value: argv };
    }

    const rewrite = applicable[0];
    return { entryId, field, value: rewrite ? rewrite.contextRelative : value };
  });
}

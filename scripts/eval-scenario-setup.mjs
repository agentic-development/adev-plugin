#!/usr/bin/env node
/**
 * Scenario setup helper for the change-imminent tier's eval scenarios.
 *
 * No CLI verb wraps `createTempGitRepo` or `cpSync`, and the constitution
 * bars `node -e` inside skill prose (see CLAUDE.md's "Anti-Patterns to
 * Avoid"), so the eleven scenarios this tier's rubrics drive name this one
 * thin `scripts/` helper instead. It performs three steps — build a
 * throwaway git repo, flat-copy the fixture project into it, splice the
 * board's storage path into the copy's manifest — plus a fourth, unrelated
 * step (a sibling `outputs/` root), and prints the two roots a scenario
 * needs. It does no teardown: at v1 the operator deletes both printed roots
 * by hand.
 *
 * `createTempGitRepo` (imported from `tests/helpers.mjs`, not reimplemented
 * here) is pre-existing `execSync` shell strings, including a `&&` compound
 * (`git add README.md && git commit -m init`). That is safe ONLY in its
 * zero-argument form, because no caller-supplied value crosses those shell
 * strings — this module always calls it with zero arguments, deliberately
 * keeping its one interpolated token (`git checkout -b ${branch}`, used only
 * when a non-default branch is requested) out of reach. Giving every other
 * probe this repo runs the same argv discipline is on the CI-integration
 * intake list, not this module's job.
 *
 * `spliceDbPath` is a smaller, single-purpose sibling of
 * `lib/extensions/governance-splice.mjs`'s registry splice: same discipline
 * (never reserialize through `parseYaml`, since that discards comments;
 * locate the target by line range; refuse an ambiguous form rather than
 * guessing), a different key shape (a single nested `db_path` scalar under
 * `tasks:`, rather than a registry array). It accepts exactly two on-disk
 * forms of `tasks:` and refuses every other, each refusal identifiable by a
 * distinct substring in the thrown message even though every shape-refusal
 * shares one code, `DB_PATH_SPLICE_REFUSED` — the same one-code, many-message
 * convention `governance-splice.mjs` uses for `GOVERNANCE_PARSE_REFUSED`.
 *
 * Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md
 *
 * @module scripts/eval-scenario-setup
 */

import { cpSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { refuse } from "../lib/errors.mjs";
import { assertSafeScalar } from "../lib/extensions/governance-values.mjs";
import { createTempGitRepo } from "../tests/helpers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

/** Default fixture project this tier's scenarios copy from — never run against directly. */
const DEFAULT_FIXTURE_ROOT = join(REPO_ROOT, "tests", "evals", "skill-regression", "project");

/** Relative path of the manifest the splice targets, inside the copy. */
const MANIFEST_REL_PATH = join(".context-index", "manifest.yaml");

/** Default indent for a `db_path:` line with no existing sibling to copy indent from. */
const DEFAULT_INDENT = "  ";

// ---------------------------------------------------------------------------
// spliceDbPath — text splice, never a parse/reserialize round trip
// ---------------------------------------------------------------------------

/**
 * Splice `tasks.db_path: <value>` into `manifestText`, in place, as a TEXT
 * operation — every byte outside the inserted line is preserved verbatim,
 * comments included, exactly like `governance-splice.mjs`'s registry splice.
 *
 * Accepts exactly two on-disk forms of the top-level `tasks:` key:
 *
 *   1. A block map (`tasks:` followed by indented `key: value` lines) — the
 *      new `db_path:` line is appended at the end of the block, at the
 *      indent its existing siblings use (or two spaces, if the block is
 *      empty).
 *   2. The literal empty inline flow map, `tasks: {}` — rewritten to
 *      `tasks:` plus one nested `db_path:` line. Accepted only because an
 *      empty flow map is PROVABLY carrying nothing a rewrite could drop.
 *
 * Refuses every other form, each with a distinct, greppable reason in the
 * thrown message: `tasks:` absent; `db_path:` already present under
 * `tasks:`; `tasks:` duplicated at the top level; a NON-empty inline flow
 * map (rewriting it would drop whatever it already carries, most load-
 * bearingly `backend: json`); an empty inline flow SEQUENCE (`tasks: []`) —
 * a different operation from rewriting an empty flow MAP, so it is not
 * folded into the `{}` acceptance; `tasks:` present as a non-map scalar; and
 * mixed or lone-CR line endings, which this splice cannot reproduce
 * byte-for-byte without rewriting bytes outside the inserted line.
 *
 * `value` is checked with {@link assertSafeScalar} BEFORE any parsing
 * (so an unsafe value never reaches the splice logic at all) and again
 * immediately before the `db_path:` line is actually built (so a bypass of
 * the first check alone still cannot reach emission) — the same two-checkpoint
 * discipline `governance-splice.mjs` uses for every scalar leaf it emits,
 * because the value is written UNQUOTED and no escape round-trips through
 * `lib/profiles/yaml.mjs`.
 *
 * @param {string} manifestText - Current manifest file text.
 * @param {string} value - The value to splice in as `tasks.db_path`.
 * @returns {string} The spliced manifest text.
 * @throws {Error} code `DB_PATH_SPLICE_REFUSED` (every shape/line-ending
 *   refusal above) or `GOVERNANCE_SCALAR_UNSAFE` / `GOVERNANCE_FIELD_VALUE_INVALID`
 *   (from {@link assertSafeScalar}, unmodified).
 */
export function spliceDbPath(manifestText, value) {
  if (typeof manifestText !== "string") {
    refuse(
      `Manifest text must be a string, got ${manifestText === undefined ? "undefined" : typeof manifestText}.`,
      "DB_PATH_SPLICE_REFUSED",
    );
  }

  // Pre-check: refuse an unsafe value before any parsing happens at all.
  assertSafeScalar(value, "tasks.db_path");

  const eol = detectLineEnding(manifestText);
  const lines = manifestText.split(eol);

  const keyIndices = lines.map((line, i) => (line.startsWith("tasks:") ? i : -1)).filter((i) => i >= 0);

  if (keyIndices.length > 1) {
    refuse(
      `The top-level 'tasks:' key is duplicated — it appears ${keyIndices.length} times in the manifest ` +
      `text. An ambiguous splice target cannot be resolved safely, so the merge is refused rather than ` +
      `guessing which block owns the new entry.`,
      "DB_PATH_SPLICE_REFUSED",
    );
  }

  if (keyIndices.length === 0) {
    refuse(
      `The manifest text has no top-level 'tasks:' key: it is absent. There is nothing under which the ` +
      `new key could be nested, so the splice is refused rather than fabricating a tasks block.`,
      "DB_PATH_SPLICE_REFUSED",
    );
  }

  const keyIndex = keyIndices[0];
  const keyLine = lines[keyIndex];
  const rest = keyLine.slice("tasks:".length);
  const commentAt = findCommentIndex(rest);
  const inline = (commentAt < 0 ? rest : rest.slice(0, commentAt)).trim();
  let suffixStart = commentAt;
  while (suffixStart > 0 && /\s/.test(rest[suffixStart - 1])) suffixStart--;
  const commentSuffix = commentAt < 0 ? "" : rest.slice(suffixStart);

  if (inline !== "") {
    if (inline === "[]") {
      refuse(
        `'tasks:' carries an empty inline flow SEQUENCE (${JSON.stringify(inline)}). An empty sequence is ` +
        `a different operation from rewriting an empty flow map, so the two are not conflated: the merge ` +
        `is refused.`,
        "DB_PATH_SPLICE_REFUSED",
      );
    }

    if (inline.startsWith("{") && inline.endsWith("}")) {
      if (inline !== "{}") {
        refuse(
          `'tasks:' carries a non-empty inline flow map (${JSON.stringify(inline)}). Rewriting it would ` +
          `drop its existing keys, for example 'backend: json' — the pin every rubric in this tier cites — ` +
          `so the merge is refused rather than silently overwritten.`,
          "DB_PATH_SPLICE_REFUSED",
        );
      }
      // Accepted: {} is provably empty, so rewriting it to a block map drops nothing.
      const rewritten = `tasks:${commentSuffix}`;
      const dbPathLine = emitDbPathLine(DEFAULT_INDENT, value);
      const merged = [...lines.slice(0, keyIndex), rewritten, dbPathLine, ...lines.slice(keyIndex + 1)];
      return merged.join(eol);
    }

    refuse(
      `'tasks:' is present but its value is a scalar, not a map (${JSON.stringify(inline)}). A scalar at ` +
      `this key cannot be safely rewritten into a block map, so the merge is refused.`,
      "DB_PATH_SPLICE_REFUSED",
    );
  }

  // Block form: `tasks:` with nothing (or only a comment) on its own line.
  // Block extent runs to the next indent-0, non-comment line, or EOF.
  let blockEnd = lines.length;
  for (let i = keyIndex + 1; i < lines.length; i++) {
    if (/^[^\s#]/.test(lines[i])) {
      blockEnd = i;
      break;
    }
  }
  const blockLines = lines.slice(keyIndex + 1, blockEnd);

  if (blockLines.some((line) => /^\s*db_path\s*:/.test(line))) {
    refuse(
      `The 'tasks:' block already has a 'db_path:' entry. Overwriting an existing pin would silently ` +
      `replace it with a different value, so the merge is refused.`,
      "DB_PATH_SPLICE_REFUSED",
    );
  }

  // Insert after the last content line of the block, so a trailing
  // comment/blank run stays exactly where it is.
  let insertAt = blockEnd;
  while (insertAt > keyIndex + 1) {
    const candidate = lines[insertAt - 1];
    if (candidate.trim() === "" || candidate.trim().startsWith("#")) insertAt--;
    else break;
  }

  const firstContent = blockLines.find((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  const indent = firstContent === undefined ? DEFAULT_INDENT : firstContent.match(/^(\s*)/)[1];
  const dbPathLine = emitDbPathLine(indent, value);

  const merged = [...lines.slice(0, insertAt), dbPathLine, ...lines.slice(insertAt)];
  return merged.join(eol);
}

/**
 * Build the `db_path:` line to insert, re-checking `value` with
 * {@link assertSafeScalar} immediately before emission — the second of the
 * two checkpoints documented on {@link spliceDbPath}.
 */
function emitDbPathLine(indent, value) {
  assertSafeScalar(value, "tasks.db_path");
  return `${indent}db_path: ${value}`;
}

/**
 * Determine the file's line terminator, refusing anything this splice
 * cannot reproduce byte-for-byte. Mirrors `governance-splice.mjs`'s
 * `detectLineEnding`, under this module's own error code.
 */
function detectLineEnding(source) {
  const lf = (source.match(/\n/g) ?? []).length;
  const crlf = (source.match(/\r\n/g) ?? []).length;
  const strayCr = (source.match(/\r(?!\n)/g) ?? []).length;

  if (strayCr > 0) {
    refuse(
      `The manifest text contains a carriage return that is not part of a CRLF terminator. This splice ` +
      `preserves a file's existing line endings verbatim and cannot do so for lone-CR text, so the merge ` +
      `is refused rather than rewriting it.`,
      "DB_PATH_SPLICE_REFUSED",
    );
  }
  if (crlf > 0 && crlf < lf) {
    refuse(
      `The manifest text mixes CRLF and LF line endings (${crlf} CRLF, ${lf - crlf} LF). Normalising them ` +
      `would rewrite bytes outside the splice, so the merge is refused.`,
      "DB_PATH_SPLICE_REFUSED",
    );
  }
  return crlf > 0 ? "\r\n" : "\n";
}

/**
 * Index of a trailing `#` comment that is outside quotes and braces, or -1.
 * Mirrors `governance-splice.mjs`'s `findCommentIndex` so a rewritten
 * `tasks: {}  # note` line keeps its comment.
 */
function findCommentIndex(line) {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (c === "{" || c === "[")) depth++;
    else if (!inSingle && !inDouble && (c === "}" || c === "]")) depth = Math.max(0, depth - 1);
    else if (!inSingle && !inDouble && depth === 0 && c === "#") return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Scenario setup steps
// ---------------------------------------------------------------------------

/**
 * Build one scenario run's copy: a throwaway git repo, flat-copied from the
 * fixture project, with `tasks.db_path` spliced into its manifest.
 *
 * `createTempGitRepo()` is called in its zero-argument form (see this
 * module's header) so the resulting repo is on `main` with one commit. The
 * fixture's CONTENTS are then copied flat into that same repo root —
 * `cpSync(fixtureRoot, copyRoot, ...)` copies `fixtureRoot`'s children into
 * `copyRoot`, never `copyRoot/<fixtureRoot's basename>/` — so the copy root
 * is simultaneously the git root (`git rev-parse --git-common-dir` resolves
 * here) and the project root carrying `.context-index/manifest.yaml`.
 * Nesting the fixture one level down would make `resolveStorageRoot`'s
 * git-common-dir fallback return the outer temp root instead, silently
 * widening board containment past the copy the scenario is meant to be
 * confined to.
 *
 * `dereference: false, verbatimSymlinks: false` mirror `cpSync`'s own
 * defaults explicitly, so a future Node default change cannot silently
 * alter how a symlinked fixture entry is copied.
 *
 * @param {object} [options]
 * @param {string} [options.fixtureRoot] - Defaults to
 *   `tests/evals/skill-regression/project`.
 * @returns {{ copyRoot: string }} The realpathed copy root, with
 *   `tasks.db_path` already spliced to itself.
 */
export function createScenarioCopy({ fixtureRoot = DEFAULT_FIXTURE_ROOT } = {}) {
  const copyRoot = createTempGitRepo();

  cpSync(fixtureRoot, copyRoot, { recursive: true, dereference: false, verbatimSymlinks: false });

  const realCopyRoot = realpathSync(copyRoot);
  const manifestPath = join(copyRoot, MANIFEST_REL_PATH);
  const before = readFileSync(manifestPath, "utf8");
  const spliced = spliceDbPath(before, realCopyRoot);
  writeFileSync(manifestPath, spliced);

  return { copyRoot: realCopyRoot };
}

/**
 * Create the sibling `outputs/` root a scenario writes its artifacts to.
 *
 * A fresh `mkdtempSync` call, BESIDE `copyRoot` (same parent directory,
 * i.e. the OS tmpdir), never inside it and never a fixed name: a fixed
 * name would sit directly in the shared, predictable `tmpdir()` and survive
 * across runs, outside any `cleanupTempDir`-shaped teardown's reach. Being a
 * sibling of `copyRoot` — itself already an `mkdtempSync` result under
 * `tmpdir()` — keeps it outside every worktree root and outside the copy by
 * construction.
 *
 * @param {string} copyRoot - The scenario's copy root, from {@link createScenarioCopy}.
 * @returns {string} The realpathed outputs root.
 */
export function createOutputsRoot(copyRoot) {
  const outputsRoot = mkdtempSync(join(dirname(copyRoot), "adev-eval-scenario-outputs-"));
  return realpathSync(outputsRoot);
}

// ---------------------------------------------------------------------------
// CLI entry — a scenario names exactly one command
// ---------------------------------------------------------------------------

/**
 * Run both setup steps and print the two roots a scenario needs, one per
 * line, in this fixed order: copy root, then outputs root. No teardown is
 * performed — these are the only two values the corresponding teardown step
 * may ever delete, and always as literal roots, never a composed path.
 */
function main() {
  const { copyRoot } = createScenarioCopy();
  const outputsRoot = createOutputsRoot(copyRoot);
  console.log(copyRoot);
  console.log(outputsRoot);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

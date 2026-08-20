/**
 * @module lib/evals/rubric
 *
 * The executable expression of the rubric contract declared as data in
 * `lib/evals/rubric-schema.mjs`. This module loads a rubric from disk and
 * (in later passes) parses and validates it against those constants; it must
 * never restate the contract, only consume it.
 *
 * Loading is a sequence of ordered passes, and the order is load-bearing —
 * each pass may only assume what the passes before it established. Established
 * so far:
 *
 *   1. containment — the caller-supplied path is resolved against the
 *      real-pathed project root and confirmed to stay inside it, both before
 *      and after symlink resolution. Nothing touches the filesystem for
 *      content until this pass succeeds, so a traversal or symlink escape is
 *      refused without ever reading the target.
 *   2. read — the contained real path is read as UTF-8 source.
 *
 * Later passes (parse, schema validation, reporting) append to this list and
 * change the return type; the containment pass stays first regardless.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { codedError } from "../errors.mjs";
import { isContained, lenientRealpath, resolveContained } from "../path-safety.mjs";

/**
 * Build the `UNSAFE_RUBRIC_PATH` error.
 *
 * Reports the caller-supplied path verbatim (never the resolved one): the
 * resolved form would leak filesystem layout outside the project root, and the
 * caller can only act on the input it actually passed.
 *
 * @param {string} offending - the rubric path exactly as the caller supplied it
 * @returns {Error}
 */
function unsafeRubricPathError(offending) {
  const err = new Error(
    `UNSAFE_RUBRIC_PATH: rubric path "${offending}" escapes the project root.`,
  );
  err.code = "UNSAFE_RUBRIC_PATH";
  err.offendingPath = offending;
  return err;
}

/**
 * Load a rubric's source from disk, refusing any path that escapes the project
 * root by traversal or by symlink.
 *
 * @param {string} rubricPath - rubric path, absolute or relative to `projectRoot`
 * @param {object} [options]
 * @param {string} [options.projectRoot] - containment boundary (default `process.cwd()`)
 * @returns {string} the rubric file's raw UTF-8 source
 *
 * @throws {Error} `code: 'UNSAFE_RUBRIC_PATH'` if the path escapes `projectRoot`,
 *   before or after symlink resolution.
 * @throws {Error} `code: 'RUBRIC_NOT_FOUND'` if the contained path does not exist
 *   or cannot be read.
 */
export function loadRubric(rubricPath, { projectRoot = process.cwd() } = {}) {
  // Real-path the root FIRST: on macOS a temp/project root under /var is itself
  // reached through a symlink (/var -> /private/var), so comparing a real path
  // against a non-real root would reject every contained path as unsafe.
  const rootReal = lenientRealpath(resolve(projectRoot));

  const abs = resolveContained(rootReal, rubricPath);
  if (abs === null) throw unsafeRubricPathError(rubricPath);

  // Symlink escape: a link file inside the root whose target lives outside it.
  const real = lenientRealpath(abs);
  if (!isContained(real, rootReal)) throw unsafeRubricPathError(rubricPath);

  // Only now touch the filesystem for content.
  if (!existsSync(real)) {
    throw codedError(
      "RUBRIC_NOT_FOUND",
      `RUBRIC_NOT_FOUND: no rubric file exists at "${real}".`,
    );
  }

  try {
    return readFileSync(real, "utf8");
  } catch (err) {
    throw codedError(
      "RUBRIC_NOT_FOUND",
      `RUBRIC_NOT_FOUND: rubric file "${real}" exists but could not be read: ${err.message}`,
    );
  }
}

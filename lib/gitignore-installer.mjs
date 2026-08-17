// lib/gitignore-installer.mjs
//
// Idempotent paired-marker `adev:gitignore` block installer.
//
// Naming (CON-1): `ensure*` / `remove*` is chosen for the generic-primitive
// contract (write-or-update-or-noop, branchless to caller). The sibling
// `lib/session-capture-installer.mjs` uses `append*` for its single-write
// code path — the divergence is deliberate and namespace-scoped:
//
//   - `appendSessionCaptureGitignoreBlock`: one feature-specific code path
//     wired through `dispatchInstallerByCaptureMode`.
//   - `ensureManagedBlock`: a reusable primitive that an arbitrary caller can
//     invoke without first checking whether a block exists.
//
// SEC-1 (path containment): both `ensure*` and `remove*` call
// `assertProjectContainment` to refuse writes when `.gitignore` resolves
// outside `projectRoot` via symlink.
//
// SEC-2 (atomic write): writes go through `atomicWriteFile`, which writes a
// `.tmp` sibling, `fsync`s the descriptor, and `rename`s into place. On any
// error, the tmp file is unlinked (best-effort).
//
// SEC-6 (scoped collapse): `removeManagedBlock` only collapses `\n{3,}` →
// `\n\n` in the immediate splice window (4 chars on each side). Bytes outside
// that window survive byte-for-byte.
//
// Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md

import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";

import { MANAGED_GITIGNORE_PATHS } from "./gitignore-paths.mjs";
import { atomicWriteFile } from "./atomic-write.mjs";

const GITIGNORE_OPEN = "# >>> adev:gitignore >>>";
const GITIGNORE_CLOSE = "# <<< adev:gitignore <<<";

// ─── Public helpers ─────────────────────────────────────────────────────────

/**
 * Render the canonical block string from `MANAGED_GITIGNORE_PATHS`.
 *
 * For each entry, emits:
 *   - `# <comment>\n<path>\n` when `comment` is present
 *   - `<path>\n` otherwise
 *
 * Wrapped in `${OPEN}\n…${CLOSE}` (no trailing newline — callers append
 * their own bracketing newlines).
 *
 * Pure / no I/O. Exported as `// @internal` for the dogfood parity test
 * (`tests/lib/gitignore-paths-dogfood.test.mjs`); not part of the stable
 * external API.
 *
 * @returns {string}
 */
export function renderBlock() {
  let body = "";
  for (const entry of MANAGED_GITIGNORE_PATHS) {
    if (entry.comment) {
      body += `# ${entry.comment}\n`;
    }
    body += `${entry.path}\n`;
  }
  return `${GITIGNORE_OPEN}\n${body}${GITIGNORE_CLOSE}`;
}

// ─── Private helpers ────────────────────────────────────────────────────────

/**
 * SEC-1: refuse to write a `.gitignore` whose path escapes `projectRoot` via
 * a symlink. Resolves the realpath of the project root and (when the
 * `.gitignore` directory or file exists) the realpath of its containing
 * directory, asserting the latter starts with the former + `path.sep`.
 *
 * When the `.gitignore` itself is a symlink, additionally resolves its
 * realpath and asserts containment.
 *
 * Throws `UNSAFE_GITIGNORE_PATH` on violation.
 *
 * @param {string} projectRoot
 * @param {string} gitignorePath
 */
function assertProjectContainment(projectRoot, gitignorePath) {
  let realRoot;
  try {
    realRoot = realpathSync.native(projectRoot);
  } catch (err) {
    const e = new Error(
      `UNSAFE_GITIGNORE_PATH: cannot resolve projectRoot ${projectRoot}: ${err.message}`,
    );
    e.code = "UNSAFE_GITIGNORE_PATH";
    throw e;
  }
  const rootWithSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep;

  // Directory containment: walk up until we find an existing ancestor.
  let probe = dirname(gitignorePath);
  while (probe && !existsSync(probe)) {
    const next = dirname(probe);
    if (next === probe) break;
    probe = next;
  }
  if (probe && existsSync(probe)) {
    let realDir;
    try {
      realDir = realpathSync.native(probe);
    } catch {
      const e = new Error(
        `UNSAFE_GITIGNORE_PATH: cannot resolve .gitignore directory ${probe}`,
      );
      e.code = "UNSAFE_GITIGNORE_PATH";
      throw e;
    }
    const realDirWithSep = realDir.endsWith(sep) ? realDir : realDir + sep;
    if (realDirWithSep !== rootWithSep && !realDirWithSep.startsWith(rootWithSep)) {
      const e = new Error(
        `UNSAFE_GITIGNORE_PATH: .gitignore directory ${realDir} escapes project root ${realRoot}`,
      );
      e.code = "UNSAFE_GITIGNORE_PATH";
      throw e;
    }
  }

  // If `.gitignore` itself is a symlink, resolve and check containment.
  if (existsSync(gitignorePath)) {
    let st;
    try {
      st = lstatSync(gitignorePath);
    } catch {
      st = null;
    }
    if (st && st.isSymbolicLink()) {
      let realFile;
      try {
        realFile = realpathSync.native(gitignorePath);
      } catch {
        const e = new Error(
          `UNSAFE_GITIGNORE_PATH: cannot resolve .gitignore symlink ${gitignorePath}`,
        );
        e.code = "UNSAFE_GITIGNORE_PATH";
        throw e;
      }
      if (!realFile.startsWith(rootWithSep) && realFile !== realRoot) {
        const e = new Error(
          `UNSAFE_GITIGNORE_PATH: .gitignore symlink resolves to ${realFile} (outside ${realRoot})`,
        );
        e.code = "UNSAFE_GITIGNORE_PATH";
        throw e;
      }
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Ensure the `adev:gitignore` paired-marker block is present and up-to-date
 * in `<projectRoot>/.gitignore`. Idempotent.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {"added" | "updated" | "noop" | "repaired" | "deduped"}
 */
export function ensureManagedBlock(projectRoot) {
  const gitignorePath = join(projectRoot, ".gitignore");
  assertProjectContainment(projectRoot, gitignorePath);

  const canonical = renderBlock();

  // No file: create it with the block + trailing newline.
  if (!existsSync(gitignorePath)) {
    atomicWriteFile(gitignorePath, `${canonical}\n`);
    return "added";
  }

  const content = readFileSync(gitignorePath, "utf8");

  // Count opens and closes.
  const opens = [];
  {
    let idx = -1;
    while ((idx = content.indexOf(GITIGNORE_OPEN, idx + 1)) !== -1) opens.push(idx);
  }
  const closes = [];
  {
    let idx = -1;
    while ((idx = content.indexOf(GITIGNORE_CLOSE, idx + 1)) !== -1) closes.push(idx);
  }

  // Zero opens → append to EOF (matches session-capture-installer:141-145).
  if (opens.length === 0) {
    const prefix = content.length === 0 || content.endsWith("\n") ? "" : "\n";
    const tail = content.length > 0 ? "\n" : "";
    const next = `${content}${prefix}${tail}${canonical}\n`;
    if (next === content) return "noop";
    atomicWriteFile(gitignorePath, next);
    return "added";
  }

  // Two or more opens → dedupe: collapse to one block at first open.
  if (opens.length >= 2) {
    const firstOpen = opens[0];
    const lastClose =
      closes.length > 0 ? closes[closes.length - 1] + GITIGNORE_CLOSE.length : content.length;
    const before = content.slice(0, firstOpen);
    const after = content.slice(lastClose);
    const next = `${before}${canonical}${after}`;
    process.stderr.write(
      `warn: adev:gitignore block had ${opens.length} open markers (offsets ${opens.join(",")}); deduping to one block at offset ${firstOpen}\n`,
    );
    atomicWriteFile(gitignorePath, next);
    return "deduped";
  }

  // Exactly one open. Find matching close after it.
  const openIdx = opens[0];
  const closeIdx = content.indexOf(GITIGNORE_CLOSE, openIdx);
  if (closeIdx === -1) {
    // Malformed: open marker with no close. Replace from open to EOF.
    const before = content.slice(0, openIdx);
    const trailing = before.endsWith("\n") || before.length === 0 ? "" : "\n";
    const next = `${before}${trailing}${canonical}\n`;
    process.stderr.write(
      "warn: adev:gitignore block had unmatched open marker; rewriting\n",
    );
    atomicWriteFile(gitignorePath, next);
    return "repaired";
  }

  // Splice canonical block into place.
  const before = content.slice(0, openIdx);
  const after = content.slice(closeIdx + GITIGNORE_CLOSE.length);
  const next = `${before}${canonical}${after}`;
  if (next === content) return "noop";
  atomicWriteFile(gitignorePath, next);
  return "updated";
}

/**
 * Remove the `adev:gitignore` paired-marker block from `.gitignore`. Idempotent.
 *
 * SEC-6: collapses `\n{3,}` → `\n\n` only in the joined splice window
 * (4 chars on each side of the splice). Bytes outside that 8-char window
 * survive byte-for-byte.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {"removed" | "noop"}
 */
export function removeManagedBlock(projectRoot) {
  const gitignorePath = join(projectRoot, ".gitignore");
  assertProjectContainment(projectRoot, gitignorePath);

  if (!existsSync(gitignorePath)) return "noop";
  const content = readFileSync(gitignorePath, "utf8");
  const openIdx = content.indexOf(GITIGNORE_OPEN);
  if (openIdx < 0) return "noop";
  const closeIdx = content.indexOf(GITIGNORE_CLOSE, openIdx);
  if (closeIdx <= openIdx) return "noop";

  const before = content.slice(0, openIdx);
  const after = content.slice(closeIdx + GITIGNORE_CLOSE.length);

  // SEC-6: scope collapse to a 4-char-each-side splice window. Bytes outside
  // the 8-char joined window are never touched.
  const beforeWindowChars = before.length >= 4 ? before.slice(-4) : before;
  const beforeOuter = before.length >= 4 ? before.slice(0, before.length - 4) : "";
  const afterWindowChars = after.length >= 4 ? after.slice(0, 4) : after;
  const afterOuter = after.length >= 4 ? after.slice(4) : "";
  const joinedWindow = beforeWindowChars + afterWindowChars;
  const collapsedWindow = joinedWindow.replace(/\n{3,}/g, "\n\n");
  const next = beforeOuter + collapsedWindow + afterOuter;

  atomicWriteFile(gitignorePath, next);
  return "removed";
}

export default {
  ensureManagedBlock,
  removeManagedBlock,
  renderBlock,
};

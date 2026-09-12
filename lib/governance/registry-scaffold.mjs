/**
 * `writeRegistrySelection` — write an operator's explicit registry selection
 * as a FRESH governance file, never a re-serialize of an existing one.
 *
 * Neither `validate.yaml` nor `review.yaml` has a real "bundled defaults"
 * fallback at dispatch time (see
 * `.context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md`,
 * BEH-1/BEH-2/BEH-3): a scaffold-time write must reflect the operator's own
 * explicit selection, and an empty selection must be written as a literal
 * `checks: []` / `reviewers: []` rather than left as an absent file — an
 * absent file reads as "zero-config, use bundled defaults", a state that no
 * longer exists.
 *
 * `spliceRegistryEntries(rawText, rootKey, [])` returns its input unchanged
 * by contract (`lib/extensions/governance-splice.mjs:106`), so it cannot by
 * itself produce the empty-list literal this scaffold needs — the
 * `entries.length === 0` path is handled here directly instead.
 *
 * @module lib/governance/registry-scaffold
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteFile as atomicWrite } from "../atomic-write.mjs";
import { codedError as coded } from "../errors.mjs";
import { resolveRootKey } from "../extensions/governance-registry.mjs";
import { spliceRegistryEntries } from "../extensions/governance-splice.mjs";
import { resolveRegistryTarget } from "./materialize.mjs";
import { stampMarker } from "./registry-marker.mjs";

const GOVERNANCE_DIR = join(".context-index", "governance");

/** Bare registry names this scaffold writes; `review` is the only one marked. */
const REGISTRY_FILES = new Map([
  ["review", "review.yaml"],
  ["validate", "validate.yaml"],
]);

/**
 * The verb name and provenance note stamped into `review.yaml`'s marker
 * comment. This scaffold never computes a merged "effective set" the way
 * `adev governance materialize` does, so the marker must not borrow that
 * verb's default claim — it must name ITS OWN verb and describe what it
 * actually did (recorded an explicit operator selection).
 */
const SCAFFOLD_STAMP_VERB = "adev governance scaffold";
const SCAFFOLD_STAMP_NOTE_LINES = [
  "This file was written from the operator's own explicit selection at",
  "scaffold time; nothing is contributed from anywhere else.",
];

/**
 * Write `entries` as `governance/<registry>.yaml`, a file this call must be
 * the FIRST to create.
 *
 * The target directory is created here via `mkdirSync(..., { recursive: true })`
 * rather than assumed to already exist — this verb makes no assumption about
 * caller-created directories, unlike `lib/governance/materialize.mjs`, whose
 * callers already scaffolded `.context-index/governance/` by the time it runs.
 *
 * @param {string} projectRoot
 * @param {"review"|"validate"} registry
 * @param {object[]} entries - Already-resolved entries, possibly empty.
 * @param {{ now?: string }} [options]
 * @returns {{ path: string, root_key: string, marker_written: boolean, entry_count: number }}
 * @throws {Error} `GOVERNANCE_SCAFFOLD_REGISTRY_UNKNOWN`, `GOVERNANCE_SCAFFOLD_EXISTS`,
 *   plus any coded throw from `resolveRegistryTarget` or `spliceRegistryEntries`.
 */
export function writeRegistrySelection(projectRoot, registry, entries, options = {}) {
  const file = REGISTRY_FILES.get(registry);
  if (file === undefined) {
    throw coded(
      "GOVERNANCE_SCAFFOLD_REGISTRY_UNKNOWN",
      `unknown registry ${JSON.stringify(registry)}. Valid: ${[...REGISTRY_FILES.keys()].join(", ")}.`,
    );
  }
  if (!Array.isArray(entries)) {
    throw coded(
      "GOVERNANCE_SCAFFOLD_ENTRIES_INVALID",
      `entries must be an array, got ${typeof entries}.`,
    );
  }

  const relPath = join(GOVERNANCE_DIR, file);
  const rootKey = resolveRootKey(file);
  const absPath = resolveRegistryTarget(projectRoot, relPath);

  mkdirSync(dirname(absPath), { recursive: true });
  if (existsSync(absPath)) {
    throw coded(
      "GOVERNANCE_SCAFFOLD_EXISTS",
      `${relPath} already exists. This scaffold writes only a fresh file — an ` +
        `already-present registry must be edited by hand or through ` +
        `'adev governance materialize', never overwritten here.`,
    );
  }

  const header = generateScaffoldHeader(rootKey);
  // Pass the synthetic `header` as `rawText`, never `null`: `null` is
  // `spliceRegistryEntries`'s form-5 trigger, which generates its OWN
  // "governance registry created by adev extension install" header — accurate
  // for an extension install, but wrong provenance for an operator's own
  // scaffold selection. Passing our header instead keeps this write's
  // provenance text under this module's control, matching form 4 (key
  // absent) once the header has been prepended.
  const text = entries.length === 0
    ? `${header}${rootKey}: []\n`
    : spliceRegistryEntries(header, rootKey, entries).text;

  const finalText = registry === "review"
    ? stampMarker(text, options.now, { verb: SCAFFOLD_STAMP_VERB, noteLines: SCAFFOLD_STAMP_NOTE_LINES })
    : text;

  atomicWrite(absPath, finalText);

  return {
    path: relPath,
    root_key: rootKey,
    marker_written: registry === "review",
    entry_count: entries.length,
  };
}

/**
 * Header for a freshly scaffolded registry file, mirroring the provenance
 * comment `spliceRegistryEntries`'s own form-5 path generates for an absent
 * file — kept as a separate small generator here because this scaffold's
 * header names the write's origin ("operator selection"), not an extension.
 */
function generateScaffoldHeader(rootKey) {
  return (
    `# ${rootKey} — governance registry written from an explicit operator selection\n` +
    `# (adev governance scaffold)\n\n`
  );
}

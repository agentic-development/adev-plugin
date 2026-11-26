// The provisional-pass input object for resolveImplementReviewDepth(), built
// in one place for both `adev implement resolve-depth` and the lite exclusion
// in `adev implement batches`. batches keeps a task out of every batch exactly
// when resolve-depth would grant it lite, so any input the two assembled
// differently could put a lite task in a subagent batch.

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { parseFrontmatterFields } from "../amendment-graph.mjs";
import { codedError } from "../errors.mjs";
import { lookupRoutingEntry, sidecarPathFor } from "../plan-routing-sidecar.mjs";
import { sameTaskId } from "../plan-task-id.mjs";
import { readTaskFiles } from "../test-strategies/task-files.mjs";

/**
 * The `risk_level` in a spec's frontmatter, `medium` when it declares none.
 *
 * @param {string} specText
 * @returns {string}
 */
export function riskLevelFromSpecText(specText) {
  return parseFrontmatterFields(specText).risk_level ?? "medium";
}

/**
 * The spec's `risk_level` (default `medium`), or null when no spec path is
 * given or the spec cannot be read.
 *
 * @param {string} projectRoot
 * @param {string|null|undefined} specPath
 * @returns {string|null}
 */
export function readSpecRiskLevel(projectRoot, specPath) {
  if (!specPath) return null;
  try {
    return riskLevelFromSpecText(readFileSync(resolvePath(projectRoot, specPath), "utf8"));
  } catch {
    return null;
  }
}

// A caller that names a spec without its risk level has been told the spec
// exists, so an unreadable one throws rather than reading as `medium`, which
// would drop a high-risk spec's floor.
function readNamedSpecRiskLevel(projectRoot, specPath) {
  if (!specPath) return null;
  let specText;
  try {
    specText = readFileSync(resolvePath(projectRoot, specPath), "utf8");
  } catch (err) {
    throw codedError(
      "INVALID_SPEC_PATH",
      `INVALID_SPEC_PATH: ${specPath} could not be read (${err && err.message ? err.message : err})`,
    );
  }
  return riskLevelFromSpecText(specText);
}

/**
 * The routing entry for `taskId` in `entries`, matched exactly first and then
 * by sameTaskId(), or undefined when none matches.
 *
 * @param {object[]} entries
 * @param {string} taskId
 * @returns {object|undefined}
 */
function findRoutingEntry(entries, taskId) {
  return entries.find((e) => e?.task_id === taskId) ?? entries.find((e) => sameTaskId(e?.task_id, taskId));
}

/**
 * findRoutingEntry(), throwing ROUTING_ENTRY_MISSING when no entry matches.
 *
 * @param {object[]} entries
 * @param {string} taskId
 * @param {string} planPath
 * @returns {object}
 */
function routingEntryFrom(entries, taskId, planPath) {
  const found = findRoutingEntry(entries, taskId);
  if (!found) {
    throw codedError(
      "ROUTING_ENTRY_MISSING",
      `ROUTING_ENTRY_MISSING: no entry for task_id '${taskId}' in ${sidecarPathFor(planPath)} at run_base — re-run /adev:route`,
    );
  }
  return found;
}

/**
 * The resolver input for one task's provisional pass, from governance read at
 * run_base (loadGovernanceAtRunBase()) and the task's declared files as the
 * floor's path input.
 *
 * Lite cannot be decided from a routing sidecar the run is not pinned to, so
 * with none committed at run_base the grant is denied as `routing-scores`.
 * With `requireRoutingEntry`, a task missing from the run_base sidecar throws
 * ROUTING_ENTRY_MISSING, and with no sidecar at run_base the working-tree
 * entry is used for quick/full resolution (lookupRoutingEntry(), which throws
 * when absent). Without it, a missing entry is undefined, which never grants
 * lite.
 *
 * `--tier lite` authorizes through `liteFlag` alone, so `tierFlag: "lite"` is
 * passed on as no tier: the baseline then reads the policy exactly as with no
 * `--tier`.
 *
 * @param {object} input
 * @param {string} input.projectRoot
 * @param {string|null} [input.specPath]
 * @param {string|null} [input.riskLevel] - the spec's risk level as the caller read it, or null when the caller could not resolve the spec (read as `medium`); when omitted it is read from `specPath`, and an unreadable `specPath` throws INVALID_SPEC_PATH
 * @param {string} input.planPath
 * @param {string} input.taskId
 * @param {{ policies: object|null, sensitivePaths: string[], boundaryCheck: (paths: string[]) => boolean, routingEntries: object[]|null }} input.governance
 * @param {boolean} [input.liteFlag=false] - lite authorization from the caller (`--lite`)
 * @param {string|null} [input.tierFlag=null] - the explicit `--tier`, if any
 * @param {boolean} [input.parallel=false]
 * @param {boolean} [input.requireRoutingEntry=false]
 * @returns {Promise<object>} the input for resolveImplementReviewDepth({ ..., pass: "provisional" })
 */
export async function provisionalResolverInputs({
  projectRoot,
  specPath = null,
  riskLevel = readNamedSpecRiskLevel(projectRoot, specPath),
  planPath,
  taskId,
  governance,
  liteFlag = false,
  tierFlag = null,
  parallel = false,
  requireRoutingEntry = false,
}) {
  const sidecarAtRunBase = governance.routingEntries !== null;
  let routingEntry;
  if (!requireRoutingEntry) {
    routingEntry = findRoutingEntry(governance.routingEntries ?? [], taskId);
  } else if (sidecarAtRunBase) {
    routingEntry = routingEntryFrom(governance.routingEntries, taskId, planPath);
  } else {
    routingEntry = lookupRoutingEntry(planPath, taskId);
  }

  const { targetPaths: declaredFiles } = await readTaskFiles(planPath, taskId);

  return {
    spec: { risk_level: riskLevel ?? "medium", specPath },
    task: { id: taskId, declared_files: declaredFiles },
    routingEntry,
    tierFlag: tierFlag === "lite" ? null : (tierFlag ?? null),
    liteFlag: liteFlag === true || tierFlag === "lite",
    parallel: parallel === true,
    liteUnavailable: sidecarAtRunBase ? null : "routing-scores",
    policies: governance.policies ?? {},
    boundaryCrossing: governance.boundaryCheck(declaredFiles),
    boundaryCheck: governance.boundaryCheck,
    targetPaths: declaredFiles,
    sensitivePaths: governance.sensitivePaths,
    projectRoot,
    pass: "provisional",
  };
}

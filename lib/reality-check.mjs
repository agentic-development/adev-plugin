/**
 * Reality Check — codebase-verified confidence scoring for lifecycle artifacts.
 *
 * Verifies that lifecycle status fields (spec status, issue status, capability
 * status) match actual codebase state. Uses git to confirm files are committed,
 * tests pass, and implementation exists.
 *
 * Skills call these functions before trusting metadata fields.
 * Uses only Node.js built-ins: fs, path, child_process.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";

import { SPEC_STATUSES } from "./spec-status.mjs";

// Named indexes into SPEC_STATUSES — preserves the single-source-of-truth
// invariant (diagnostic-registry.spec.md rev 2 amendment 3) while keeping
// the assignment sites in this file readable. The index numbers match the
// fixed declaration order in lib/spec-status.mjs (draft, review-pending,
// review-passed, review-blocked, implemented, validated, superseded).
// If SPEC_STATUSES is ever reordered, the spec-status.mjs unit tests will
// fail and surface the drift before this module compiles to wrong values.
const STATUS_REVIEW_PASSED = SPEC_STATUSES[2];
const STATUS_IMPLEMENTED = SPEC_STATUSES[4];
const STATUS_VALIDATED = SPEC_STATUSES[5];

/**
 * Confidence levels for verification results.
 * - high: git-committed, tests exist and pass, spec criteria met
 * - medium: files exist and committed, but tests not verified
 * - low: status field says done but codebase evidence is weak
 * - none: no codebase evidence found (status field contradicts reality)
 */
const CONFIDENCE = { HIGH: "high", MEDIUM: "medium", LOW: "low", NONE: "none" };

/**
 * Check if a file is tracked by git (has at least one commit).
 * @param {string} filePath - Absolute path to the file.
 * @param {string} cwd - Working directory for git commands.
 * @returns {boolean}
 */
function isGitTracked(filePath, cwd) {
  try {
    const result = execFileSync("git", ["log", "--oneline", "-1", "--", filePath], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a file has uncommitted changes.
 * @param {string} filePath - Absolute path to the file.
 * @param {string} cwd - Working directory for git commands.
 * @returns {boolean}
 */
function hasUncommittedChanges(filePath, cwd) {
  try {
    const result = execFileSync("git", ["status", "--porcelain", "--", filePath], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Verify whether a spec's implementation actually exists in the codebase.
 *
 * Checks:
 * 1. Plan file exists and references implementation files
 * 2. Implementation files exist on disk
 * 3. Implementation files are git-committed (not just staged/untracked)
 * 4. Tests exist for the implementation
 *
 * @param {string} specPath - Absolute path to the spec file.
 * @param {object} [options]
 * @param {string} [options.projectRoot] - Project root (defaults to cwd).
 * @param {string} [options.planPath] - Explicit plan path (auto-detected if omitted).
 * @returns {{ implemented: boolean, confidence: string, evidence: object[] }}
 */
export function verifySpecImplemented(specPath, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const evidence = [];

  // 1. Check spec exists
  if (!existsSync(specPath)) {
    return { implemented: false, confidence: CONFIDENCE.NONE, evidence: [{ type: "error", message: "Spec file not found" }] };
  }

  // 2. Find plan file
  const planPath = options.planPath || specPath.replace(/\.spec\.md$/, ".plan.md");
  if (!existsSync(planPath)) {
    evidence.push({ type: "warning", message: "No plan file found — cannot verify task completion" });
    // Check if source-manifest exists in spec frontmatter
    const specContent = readFileSync(specPath, "utf-8");
    const hasSourceManifest = specContent.includes("source-manifest:");
    if (!hasSourceManifest) {
      return { implemented: false, confidence: CONFIDENCE.LOW, evidence: [...evidence, { type: "missing", message: "No source-manifest and no plan — cannot verify implementation" }] };
    }
  }

  // 3. Extract file references from plan
  let planFiles = [];
  if (existsSync(planPath)) {
    const planContent = readFileSync(planPath, "utf-8");

    // Extract files from "Create:" and "Modify:" sections
    const createMatch = planContent.match(/\*\*Create:\*\*\n([\s\S]*?)(?=\n\*\*(?:Modify|Reference)|---)/);
    const modifyMatch = planContent.match(/\*\*Modify:\*\*\n([\s\S]*?)(?=\n\*\*(?:Create|Reference)|---)/);

    const extractFiles = (block) => {
      if (!block) return [];
      return block[1]
        .split("\n")
        .map((l) => l.replace(/^- `?/, "").replace(/`?(?:\s*—.*)?$/, "").trim())
        .filter((l) => l.length > 0 && !l.startsWith("*"));
    };

    planFiles = [...extractFiles(createMatch), ...extractFiles(modifyMatch)];

    // Fallback: also extract from "- **File:** `path`" patterns (alternative plan format)
    if (planFiles.length === 0) {
      const fileFieldMatches = planContent.matchAll(/- \*\*File:\*\*\s*`([^`]+)`/g);
      for (const m of fileFieldMatches) {
        planFiles.push(m[1]);
      }
    }
  }

  // 4. Verify each file
  let filesExist = 0;
  let filesCommitted = 0;
  let filesMissing = 0;

  for (const file of planFiles) {
    const absPath = resolve(projectRoot, file);
    if (existsSync(absPath)) {
      filesExist++;
      if (isGitTracked(absPath, projectRoot)) {
        filesCommitted++;
        evidence.push({ type: "pass", message: `${file}: exists and committed` });
      } else {
        evidence.push({ type: "warning", message: `${file}: exists but NOT committed` });
      }
    } else {
      filesMissing++;
      evidence.push({ type: "fail", message: `${file}: missing from disk` });
    }
  }

  // 5. Check for tests
  const specContent = readFileSync(specPath, "utf-8");
  const testMatch = specContent.match(/tests?\/[^\s`"]+\.(?:test|spec)\.(?:[jt]sx?|mjs)/g);
  let testsFound = false;
  if (testMatch) {
    for (const testFile of testMatch) {
      const absTest = resolve(projectRoot, testFile);
      if (existsSync(absTest)) {
        testsFound = true;
        evidence.push({ type: "pass", message: `Test file exists: ${testFile}` });
        break;
      }
    }
  }

  // 6. Determine confidence
  let confidence;
  if (planFiles.length === 0) {
    confidence = existsSync(planPath) ? CONFIDENCE.LOW : CONFIDENCE.NONE;
  } else if (filesMissing > 0) {
    confidence = CONFIDENCE.NONE;
  } else if (filesCommitted === filesExist && testsFound) {
    confidence = CONFIDENCE.HIGH;
  } else if (filesCommitted === filesExist) {
    confidence = CONFIDENCE.MEDIUM;
  } else {
    confidence = CONFIDENCE.LOW;
  }

  const implemented = confidence === CONFIDENCE.HIGH || confidence === CONFIDENCE.MEDIUM;

  return { implemented, confidence, evidence };
}

/**
 * Verify whether an issue's described work is actually completed in the codebase.
 *
 * @param {object} issue - Issue object with { title, plan_ref, plan_task, spec_ref, status }
 * @param {object} [options]
 * @param {string} [options.projectRoot] - Project root.
 * @returns {{ completed: boolean, confidence: string, reason: string }}
 */
export function verifyIssueCompleted(issue, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();

  // If issue has a plan_ref and plan_task, check that specific task's files
  if (issue.plan_ref && issue.plan_task) {
    const planPath = resolve(projectRoot, issue.plan_ref);
    if (!existsSync(planPath)) {
      return { completed: false, confidence: CONFIDENCE.NONE, reason: "Plan file not found" };
    }

    const planContent = readFileSync(planPath, "utf-8");

    // Find the specific task section
    const taskPattern = new RegExp(`### Task ${issue.plan_task}[:\\s]([\\s\\S]*?)(?=### Task \\d|## Quality Gates|$)`);
    const taskMatch = planContent.match(taskPattern);
    if (!taskMatch) {
      return { completed: false, confidence: CONFIDENCE.LOW, reason: `Task ${issue.plan_task} section not found in plan` };
    }

    const taskSection = taskMatch[1];

    // Check checkboxes in this task
    const checked = (taskSection.match(/- \[x\]/g) || []).length;
    const unchecked = (taskSection.match(/- \[ \]/g) || []).length;
    const total = checked + unchecked;

    if (total === 0) {
      return { completed: false, confidence: CONFIDENCE.LOW, reason: "No checkboxes found in task section" };
    }

    if (unchecked === 0) {
      return { completed: true, confidence: CONFIDENCE.MEDIUM, reason: `All ${checked} checkboxes checked` };
    }

    return { completed: false, confidence: CONFIDENCE.NONE, reason: `${unchecked}/${total} checkboxes unchecked` };
  }

  // If issue has a spec_ref, verify the spec is implemented
  if (issue.spec_ref) {
    const specPath = resolve(projectRoot, issue.spec_ref);
    const result = verifySpecImplemented(specPath, { projectRoot });
    return {
      completed: result.implemented,
      confidence: result.confidence,
      reason: result.implemented
        ? `Spec implementation verified (${result.confidence} confidence)`
        : `Spec implementation not verified: ${result.evidence.filter((e) => e.type === "fail").map((e) => e.message).join("; ") || "insufficient evidence"}`,
    };
  }

  // No plan_ref or spec_ref — can't verify
  return { completed: false, confidence: CONFIDENCE.LOW, reason: "No plan_ref or spec_ref to verify against" };
}

/**
 * Verify a charter capability's actual status against the codebase.
 *
 * @param {string} charterPath - Path to the charter file.
 * @param {string} capabilityName - The capability name to check.
 * @param {object} [options]
 * @param {string} [options.projectRoot] - Project root.
 * @returns {{ declared: string, actual: string, confidence: string, reason: string }}
 */
export function verifyCapabilityStatus(charterPath, capabilityName, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();

  if (!existsSync(charterPath)) {
    return { declared: "unknown", actual: "unknown", confidence: CONFIDENCE.NONE, reason: "Charter not found" };
  }

  const content = readFileSync(charterPath, "utf-8");

  // Find the capability row in the table
  const lines = content.split("\n");
  let declared = "—";
  for (const line of lines) {
    if (line.includes(capabilityName)) {
      // Parse the Status column (last column in capability map)
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 5) {
        declared = cells[cells.length - 1] || "—";
      }
      break;
    }
  }

  // Find the spec for this capability
  const charterDir = charterPath.replace(/\/charter\.md$/, "");

  // Cannot use top-level await in sync function — use existsSync pattern
  let specFound = false;
  let specPath = null;
  let reviewFound = false;
  let validationFound = false;

  try {
    const files = readdirSync(charterDir);
    for (const f of files) {
      if (!f.endsWith(".spec.md")) continue;
      if (!f.startsWith(".")) {
        // Read the spec to check if it covers this capability
        const specContent = readFileSync(resolve(charterDir, f), "utf-8");
        if (specContent.includes(capabilityName)) {
          specFound = true;
          specPath = resolve(charterDir, f);
          // Check for review
          const reviewPath = specPath.replace(/\.spec\.md$/, ".review.md");
          reviewFound = existsSync(reviewPath);
          // Check for validation
          const validationPath = specPath.replace(/\.spec\.md$/, ".validate.md");
          validationFound = existsSync(validationPath);
          break;
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  // Determine actual status
  let actual;
  let confidence;
  let reason;

  if (!specFound) {
    actual = "—";
    confidence = CONFIDENCE.NONE;
    reason = "No spec found covering this capability";
  } else if (validationFound) {
    actual = STATUS_VALIDATED;
    confidence = CONFIDENCE.HIGH;
    reason = `Validation report exists: ${relative(projectRoot, specPath).replace(/\.spec\.md$/, ".validate.md")}`;
  } else if (reviewFound) {
    // Check if implementation exists
    const implResult = verifySpecImplemented(specPath, { projectRoot });
    if (implResult.implemented) {
      actual = STATUS_IMPLEMENTED;
      confidence = implResult.confidence;
      reason = `Spec reviewed, implementation verified (${implResult.confidence})`;
    } else {
      actual = STATUS_REVIEW_PASSED;
      confidence = CONFIDENCE.MEDIUM;
      reason = "Review passed but implementation not verified in codebase";
    }
  } else if (specFound) {
    actual = "specified";
    confidence = CONFIDENCE.MEDIUM;
    reason = "Spec exists but no review file found";
  } else {
    actual = "—";
    confidence = CONFIDENCE.NONE;
    reason = "No lifecycle artifacts found";
  }

  return { declared, actual, confidence, reason };
}

/**
 * Generate a confidence-annotated note for the issue board.
 *
 * @param {string} action - What happened ("Validated", "Bug fixed", "Reconciled")
 * @param {string} confidence - Confidence level (high/medium/low/none)
 * @param {object} details - Additional details
 * @param {string} [details.reportPath] - Path to validation/debug report
 * @param {string} [details.specPath] - Path to the spec
 * @param {number} [details.filesVerified] - Number of files checked
 * @param {boolean} [details.testsPass] - Whether tests pass
 * @returns {string} Formatted note for issue board update
 */
export function formatConfidenceNote(action, confidence, details = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const parts = [`${action}: ${confidence.toUpperCase()} confidence (${date})`];

  if (details.reportPath) parts.push(`Report: ${details.reportPath}`);
  if (details.filesVerified) parts.push(`Files verified: ${details.filesVerified}`);
  if (details.testsPass !== undefined) parts.push(`Tests: ${details.testsPass ? "PASS" : "FAIL"}`);
  if (details.specPath) parts.push(`Spec: ${details.specPath}`);

  return parts.join(" | ");
}

export { CONFIDENCE };

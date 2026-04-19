/**
 * Stub dispatcher for the Tier 3 live-runner.
 *
 * Returns canned findings for each reviewer id so the live runner can be
 * exercised deterministically in CI without an LLM or an API key. Real
 * dispatchers (e.g. dispatchers/anthropic.mjs — see the live-runner docs)
 * follow the same shape:
 *
 *   async function dispatch(request) => { findings: [...] }  // subagent mode
 *   async function dispatch(request) => { stdout: "..." }    // runner stage
 *   async function dispatch(request) => { yaml: "findings: [...]" } // adapter
 */

const CANNED = {
  "structural-architect": {
    findings: [
      {
        id: "SA-1",
        severity: "suggestion",
        category: "structural",
        message: "Consider naming invariants for each behavior.",
      },
    ],
  },
  "security-reviewer": {
    findings: [
      {
        id: "SEC-1",
        severity: "warning",
        category: "data-exposure",
        message: "Invoice storage path should be deterministic AND not user-controllable.",
      },
    ],
  },
  "consistency-analyzer": {
    findings: [],
  },
  "project.billing-domain": {
    findings: [
      {
        id: "BIL-1",
        severity: "suggestion",
        category: "domain-model",
        message: "State the currency precision explicitly (minor units vs. decimal).",
      },
    ],
  },
};

export async function dispatch(request) {
  if (request.stage === "adapter") {
    const canned = CANNED[request.reviewerId] ?? { findings: [] };
    const yamlLines = ["findings:"];
    for (const f of canned.findings) {
      yamlLines.push(`  - id: "${f.id}"`);
      yamlLines.push(`    severity: ${f.severity}`);
      yamlLines.push(`    category: ${f.category ?? "general"}`);
      yamlLines.push(`    message: ${JSON.stringify(f.message)}`);
    }
    return { yaml: yamlLines.join("\n") };
  }
  if (request.stage === "runner") {
    return { stdout: "Ran the wrapped skill successfully; output above." };
  }
  // subagent
  return CANNED[request.reviewerId] ?? { findings: [] };
}

export const CANNED_FOR_TESTS = CANNED;

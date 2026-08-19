import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Secret redaction patterns for RED State Evidence.
 * Matches KEY=value pairs for common secret variable names.
 */
const SECRET_PATTERNS = [
  /PASSWORD\s*=\s*\S+/gi,
  /SECRET\s*=\s*\S+/gi,
  /TOKEN\s*=\s*\S+/gi,
  /API_KEY\s*=\s*\S+/gi,
  // Connection strings: postgres://user:pass@host or mysql://user:pass@host
  /\b(postgres|mysql|mongodb|redis):\/\/[^\s"']+/gi,
];

/**
 * Redact common secret patterns from a string.
 */
function redactSecrets(text) {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Keep the key name, redact the value
      const eqIdx = match.indexOf('=');
      if (eqIdx !== -1) {
        return match.slice(0, eqIdx + 1) + '[REDACTED]';
      }
      return '[REDACTED]';
    });
  }
  return result;
}

/**
 * Compute SHA-256 hash of test files concatenated in path-alphabetical order.
 * @param {string[]} testFiles - Array of absolute file paths
 * @returns {string} Hex hash
 */
function computeHash(testFiles) {
  const sorted = [...testFiles].sort();
  const hash = createHash('sha256');
  for (const filePath of sorted) {
    const content = readFileSync(filePath);
    hash.update(content);
  }
  return hash.digest('hex');
}

/**
 * Write a Handoff Block to packets/<slug>-tests.md.
 *
 * @param {object} params
 * @param {string} params.packetsDir - Directory to write the packet file
 * @param {string} params.slug - Kebab-case identifier for this handoff
 * @param {string} params.spec - Spec path or "standalone"
 * @param {string[]} params.testFiles - Absolute paths to test files
 * @param {string} params.verificationCommand - Command to reproduce RED state
 * @param {string} params.redStateEvidence - Failure output from test runner
 * @param {string[]} params.constraints - Locked constraints list
 * @param {Array<{target: string, type: string, justification: string}>} params.mockingBoundaries
 * @param {string} params.preexistingCheck - 'passed' | 'skipped (clean tree)' | 'pre-existing-recorded'
 * @param {string} params.gamingCheck - 'passed' | 'violations-found'
 * @param {string} params.framework - Detected framework name
 * @returns {Promise<void>}
 */
export async function writeHandoff(params) {
  const {
    packetsDir,
    slug,
    spec,
    testFiles,
    verificationCommand,
    redStateEvidence,
    constraints,
    mockingBoundaries,
    preexistingCheck,
    gamingCheck,
    framework,
  } = params;

  // Create packets directory if absent
  mkdirSync(packetsDir, { recursive: true });

  const packetPath = join(packetsDir, `${slug}-tests.md`);

  // Check for existing packet to get previous hash
  let previousHash = null;
  if (existsSync(packetPath)) {
    try {
      const existing = readFileSync(packetPath, 'utf-8');
      const hashMatch = existing.match(/^hash: (.+)$/m);
      if (hashMatch) {
        previousHash = hashMatch[1].trim();
      }
    } catch {
      // Ignore read errors
    }
  }

  // Compute current hash
  const hash = computeHash(testFiles);

  // Build test file contents section
  const sortedFiles = [...testFiles].sort();
  let originalContentsSection = '## Original Test File Contents\n\n<!-- Stored verbatim at write time. Used by --verify for semantic diff. -->\n\n';
  for (const filePath of sortedFiles) {
    const content = readFileSync(filePath, 'utf-8');
    originalContentsSection += `### ${filePath}\n\n\`\`\`\n${content}\n\`\`\`\n\n`;
  }

  // Build test files list
  const testFilesList = sortedFiles.map(f => `- ${f}`).join('\n');

  // Build constraints list
  const constraintsList = constraints.length > 0
    ? constraints.map(c => `- ${c}`).join('\n')
    : '- (none)';

  // Build mocking boundaries table
  let mockingTable;
  if (mockingBoundaries.length === 0) {
    mockingTable = '| Mock Target | Boundary Type | Justification |\n|-------------|--------------|---------------|\n| (none) | — | — |';
  } else {
    mockingTable = '| Mock Target | Boundary Type | Justification |\n|-------------|--------------|---------------|\n';
    for (const b of mockingBoundaries) {
      mockingTable += `| ${b.target} | ${b.type} | ${b.justification} |\n`;
    }
  }

  // Redact secrets from evidence
  const safeEvidence = redactSecrets(redStateEvidence);

  // ISO timestamp
  const created = new Date().toISOString();

  // Build frontmatter
  const frontmatter = [
    '---',
    `slug: ${slug}`,
    `spec: ${spec}`,
    `locked: true`,
    `hash: ${hash}`,
    `previous_hash: ${previousHash ?? 'null'}`,
    `created: ${created}`,
    `framework: ${framework}`,
    `preexisting_check: ${preexistingCheck}`,
    `gaming_check: ${gamingCheck}`,
    '---',
  ].join('\n');

  const content = `${frontmatter}

## Test Files

${testFilesList}

${originalContentsSection}
## Verification Command

\`\`\`
${verificationCommand}
\`\`\`

## RED State Evidence

\`\`\`
${safeEvidence}
\`\`\`

## Locked Constraints

${constraintsList}

## Mocking Boundaries

${mockingTable}
`;

  writeFileSync(packetPath, content, 'utf-8');
}

/**
 * Verify a Handoff Block's hash against the current test file contents.
 *
 * @param {string} packetPath - Absolute path to the packet file
 * @returns {Promise<{status: 'PASS'|'HASH_MISMATCH', storedHash?: string, computedHash?: string}>}
 * @throws {Error} If the packet file is not found
 */
export async function verifyHandoff(packetPath) {
  if (!existsSync(packetPath)) {
    throw new Error(`Packet not found: ${packetPath}. Run --red first.`);
  }

  const packetContent = readFileSync(packetPath, 'utf-8');

  // Extract stored hash from frontmatter
  const hashMatch = packetContent.match(/^hash: (.+)$/m);
  if (!hashMatch) {
    throw new Error(`Packet at ${packetPath} is missing hash field.`);
  }
  const storedHash = hashMatch[1].trim();

  // Extract test file paths from the Test Files section
  const testFilesSection = packetContent.match(/## Test Files\n\n([\s\S]*?)\n\n##/);
  if (!testFilesSection) {
    throw new Error(`Packet at ${packetPath} is missing Test Files section.`);
  }

  const testFiles = testFilesSection[1]
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean);

  // Check all test files still exist before hashing
  for (const filePath of testFiles) {
    if (!existsSync(filePath)) {
      throw new Error(`Test file missing: ${filePath}. Cannot verify integrity.`);
    }
  }

  // Recompute hash from current files
  const computedHash = computeHash(testFiles);

  if (computedHash === storedHash) {
    return { status: 'PASS' };
  }

  return { status: 'HASH_MISMATCH', storedHash, computedHash };
}

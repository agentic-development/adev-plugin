/**
 * Tests for `loadDomainConfig(domain, 'validate', ...)` and domain-arg validation.
 *
 * Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
 *       Behaviors 7 and 7a (SEC-2 fix).
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..');
// Use the plugin root itself as the repoRoot for these tests — we only need the
// real-path resolution to land somewhere safe; we never write inside it.
const REPO_ROOT = PLUGIN_ROOT;

describe("loadDomainConfig: validate configType", () => {
  it("recognizes 'validate' configType and returns a value (object or null)", () => {
    const result = loadDomainConfig('software', 'validate', REPO_ROOT, PLUGIN_ROOT);
    // Before Task 3 (software starter created), result may be null.
    // After Task 3: result is an object with checks array.
    assert.ok(
      result === null || typeof result === 'object',
      `expected null or object, got ${typeof result}`
    );
  });

  it("throws INVALID_DOMAIN_ARG for non-conforming domain argument with path traversal", () => {
    assert.throws(
      () => loadDomainConfig('../etc', 'validate', REPO_ROOT, PLUGIN_ROOT),
      (err) => err.code === 'INVALID_DOMAIN_ARG'
    );
  });

  it("throws INVALID_DOMAIN_ARG for domain with path separators", () => {
    assert.throws(
      () => loadDomainConfig('../../passwd', 'validate', REPO_ROOT, PLUGIN_ROOT),
      (err) => err.code === 'INVALID_DOMAIN_ARG'
    );
  });

  it("throws INVALID_DOMAIN_ARG for domain with spaces", () => {
    assert.throws(
      () => loadDomainConfig('bad domain', 'validate', REPO_ROOT, PLUGIN_ROOT),
      (err) => err.code === 'INVALID_DOMAIN_ARG'
    );
  });

  it("throws INVALID_DOMAIN_ARG for domain with uppercase characters", () => {
    assert.throws(
      () => loadDomainConfig('SoftWare', 'validate', REPO_ROOT, PLUGIN_ROOT),
      (err) => err.code === 'INVALID_DOMAIN_ARG'
    );
  });

  it("INVALID_DOMAIN_ARG diagnostic redacts non-allowlist characters in the offending value", () => {
    try {
      loadDomainConfig('../etc[ANSI', 'validate', REPO_ROOT, PLUGIN_ROOT);
      assert.fail("should have thrown");
    } catch (err) {
      assert.equal(err.code, 'INVALID_DOMAIN_ARG');
      // Control chars and other non-allowlist must NOT appear verbatim in the message
      assert.ok(
        !err.message.includes(""),
        "ANSI escape should be redacted from diagnostic"
      );
    }
  });

  it("INVALID_DOMAIN_ARG is thrown for ANY configType (not just 'validate')", () => {
    // The guard must run before any configType resolution.
    assert.throws(
      () => loadDomainConfig('../etc', 'gates', REPO_ROOT, PLUGIN_ROOT),
      (err) => err.code === 'INVALID_DOMAIN_ARG'
    );
  });

  it("does NOT throw INVALID_DOMAIN_ARG for valid bundled domain name", () => {
    // Sanity: 'software' is allowlist-conforming.
    const result = loadDomainConfig('software', 'gates', REPO_ROOT, PLUGIN_ROOT);
    // Either null or an object — whatever it returns, the call must NOT throw.
    assert.ok(result === null || typeof result === 'object');
  });
});

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
  it("loadDomainConfig('software', 'validate') returns a structured object with checks array", () => {
    const result = loadDomainConfig('software', 'validate', REPO_ROOT, PLUGIN_ROOT);
    assert.ok(result !== null, 'software starter should exist (Task 3 created it)');
    assert.ok(typeof result === 'object', 'should be parsed YAML object');
    assert.ok(Array.isArray(result.checks), 'should have a checks array');
    assert.ok(result.checks.length >= 12, `expected >= 12 checks, got ${result.checks.length}`);
  });

  it("loadDomainConfig('data-engineering', 'validate') returns null (no starter shipped, SA-7)", () => {
    const result = loadDomainConfig('data-engineering', 'validate', REPO_ROOT, PLUGIN_ROOT);
    assert.equal(result, null, 'data-engineering should not ship a validate starter');
  });

  it("loadDomainConfig('process-automation', 'validate') returns null (no starter shipped, SA-7)", () => {
    const result = loadDomainConfig('process-automation', 'validate', REPO_ROOT, PLUGIN_ROOT);
    assert.equal(result, null, 'process-automation should not ship a validate starter');
  });

  it("software validate.yaml has plugin: URIs in prompt fields", () => {
    const result = loadDomainConfig('software', 'validate', REPO_ROOT, PLUGIN_ROOT);
    assert.ok(result !== null);
    const checksWithPluginUri = result.checks.filter(
      (c) => typeof c.prompt === 'string' && c.prompt.startsWith('plugin:validate/checks/')
    );
    assert.ok(
      checksWithPluginUri.length >= 10,
      `expected at least 10 checks with plugin: URI prompts, got ${checksWithPluginUri.length}`
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

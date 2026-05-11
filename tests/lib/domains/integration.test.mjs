import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveDomain } from '../../../lib/domains/resolve.mjs';
import { mergeReviewers } from '../../../lib/domains/merge-reviewers.mjs';
import { mergeGates } from '../../../lib/domains/merge-gates.mjs';
import { mergeGateConfig } from '../../../lib/domains/merge-gate-config.mjs';
import { mergeTestConfig } from '../../../lib/domains/merge-test-config.mjs';
import { mergeVerification } from '../../../lib/domains/merge-verification.mjs';
describe('domain-aware skill integration', () => {
  it('should resolve domain and load all overlay types', () => {
    const manifest = { project: { domain: 'software' } };
    const result = resolveDomain(manifest, null, null);
    assert.equal(result.resolved_domain, 'software');
  });

  it('should merge reviewers with governance override winning on conflict', () => {
    const domain = { reviewers: [{ id: 'r1', dispatch: 'always' }] };
    const governance = { reviewers: [{ id: 'r1', dispatch: 'triggered' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers[0].dispatch, 'triggered');
    assert.equal(result.reviewers[0].__source, 'governance');
  });

  it('should merge gates with governance override winning on conflict', () => {
    const domain = { gates: [{ id: 'test', command: ['npm', 'test'] }] };
    const governance = { gates: [{ id: 'test', command: ['npm', 'run', 'test:ci'] }] };
    const result = mergeGates(domain, governance);
    assert.deepEqual(result.gates[0].command, ['npm', 'run', 'test:ci']);
  });

  it('should not have any hardcoded fallbacks in merge functions', () => {
    // When all overlays are null, merge functions should return empty/null configs
    const reviewResult = mergeReviewers(null, null);
    assert.equal(reviewResult.reviewers.length, 0);

    const gateResult = mergeGates(null, null);
    assert.equal(gateResult.gates.length, 0);

    const gcResult = mergeGateConfig(null);
    assert.deepEqual(gcResult.config.file_exclusions, []);

    const tcResult = mergeTestConfig(null);
    assert.deepEqual(tcResult.config.permitted_tools, []);

    const vResult = mergeVerification(null);
    assert.equal(vResult.config, null);
  });

  it('should propagate error codes correctly', () => {
    // DOMAIN_CONFIG_MERGE_WARN for missing reviewer id
    const reviewResult = mergeReviewers({ reviewers: [{ dispatch: 'always' }] }, null);
    assert.ok(reviewResult.warnings.some(w => w.code === 'DOMAIN_CONFIG_MERGE_WARN'));

    // INVALID_GATE for shell-form command
    const gateResult = mergeGates({ gates: [{ id: 'test', command: 'npm test' }] }, null);
    assert.ok(gateResult.warnings.some(w => w.code === 'INVALID_GATE'));

    // UNKNOWN_VERIFY_TYPE for invalid type
    const verifyResult = mergeVerification({ type: 'invalid' });
    assert.ok(verifyResult.warnings.some(w => w.code === 'UNKNOWN_VERIFY_TYPE'));
  });

  it('should preserve provenance through full merge pipeline', () => {
    const domain = {
      reviewers: [{ id: 'domain-r1' }],
    };
    const governance = {
      reviewers: [{ id: 'gov-r1' }],
    };
    const result = mergeReviewers(domain, governance);
    const domainReviewer = result.reviewers.find(r => r.id === 'domain-r1');
    const govReviewer = result.reviewers.find(r => r.id === 'gov-r1');
    assert.equal(domainReviewer.__source, 'domain');
    assert.equal(govReviewer.__source, 'governance');
  });

  it('should handle full reviewer merge pipeline with replace strategy', () => {
    const domain = {
      reviewers: [{ id: 'custom-r1' }],
      merge_strategy: 'replace',
    };
    const governance = {
      reviewers: [{ id: 'gov-r1' }],
    };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers.length, 2);
    assert.ok(result.warnings.some(w => w.message.includes('replaced base reviewers')));
    // Governance still applies on top
    const govReviewer = result.reviewers.find(r => r.id === 'gov-r1');
    assert.ok(govReviewer);
  });

  it('should handle full gate merge pipeline with severity preservation', () => {
    const domain = {
      gates: [
        { id: 'lint', command: ['eslint', '.'], severity: 'warning' },
        { id: 'test', command: ['npm', 'test'] },
      ],
    };
    const governance = {
      gates: [
        { id: 'test', command: ['npm', 'run', 'test:ci'] },
      ],
    };
    const result = mergeGates(domain, governance);
    const lint = result.gates.find(g => g.id === 'lint');
    assert.equal(lint.severity, 'warning');
    const test = result.gates.find(g => g.id === 'test');
    assert.deepEqual(test.command, ['npm', 'run', 'test:ci']);
  });

  it('should handle verification with tool validation', () => {
    const activeServers = new Set(['playwright']);
    const result = mergeVerification(
      { type: 'visual', trigger_patterns: ['*.tsx', '../etc/passwd'], tool: 'playwright' },
      activeServers
    );
    assert.equal(result.config.type, 'visual');
    assert.equal(result.config.trigger_patterns.length, 1); // ../etc/passwd rejected
    assert.equal(result.config.tool, 'playwright');
  });
});

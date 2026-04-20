import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PRICE_TABLE, getRate, computeCost } from '../../lib/token-pricing.mjs';

describe('PRICE_TABLE', () => {
  it('contains claude-opus-4-6', () => {
    assert.ok('claude-opus-4-6' in PRICE_TABLE);
  });

  it('contains claude-sonnet-4-6', () => {
    assert.ok('claude-sonnet-4-6' in PRICE_TABLE);
  });

  it('contains claude-haiku-4-5-20251001', () => {
    assert.ok('claude-haiku-4-5-20251001' in PRICE_TABLE);
  });

  it('each entry has input, output, cacheRead, cacheCreation fields', () => {
    for (const [model, rate] of Object.entries(PRICE_TABLE)) {
      assert.ok(typeof rate.input === 'number', `${model} missing input`);
      assert.ok(typeof rate.output === 'number', `${model} missing output`);
      assert.ok(typeof rate.cacheRead === 'number', `${model} missing cacheRead`);
      assert.ok(typeof rate.cacheCreation === 'number', `${model} missing cacheCreation`);
    }
  });

  it('rates are per-token (not per-million)', () => {
    // opus input is $15/M → 0.000015 per token
    assert.ok(PRICE_TABLE['claude-opus-4-6'].input < 0.001, 'input rate should be per-token, not per-million');
  });
});

describe('getRate', () => {
  it('returns rate object for known model', () => {
    const rate = getRate('claude-sonnet-4-6');
    assert.ok(rate !== null);
    assert.ok(typeof rate.input === 'number');
  });

  it('returns null for unknown model', () => {
    assert.strictEqual(getRate('claude-unknown-99'), null);
  });

  it('returns null for empty string', () => {
    assert.strictEqual(getRate(''), null);
  });
});

describe('computeCost', () => {
  it('returns a number for known model', () => {
    const cost = computeCost('claude-opus-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    assert.ok(typeof cost === 'number');
    assert.ok(cost > 0);
  });

  it('returns null for unknown model', () => {
    const cost = computeCost('claude-unknown-99', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    assert.strictEqual(cost, null);
  });

  it('uses cost_usd = null (not omitted) for unknown model', () => {
    const result = computeCost('no-such-model', {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    // The spec says usage.cost_usd should be null — computeCost returns null
    assert.strictEqual(result, null);
  });

  it('computes correct cost for opus with only input tokens', () => {
    // 1,000,000 input tokens at $15/M = $15.000000
    const cost = computeCost('claude-opus-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    assert.strictEqual(cost, 15.0);
  });

  it('computes correct cost for opus with only output tokens', () => {
    // 1,000,000 output tokens at $75/M = $75.000000
    const cost = computeCost('claude-opus-4-6', {
      inputTokens: 0,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    assert.strictEqual(cost, 75.0);
  });

  it('computes correct cost for sonnet with mixed tokens', () => {
    // sonnet: input $3/M, output $15/M
    // 100 input = 100 * 3/1e6 = 0.0003
    // 50 output = 50 * 15/1e6 = 0.00075
    // total = 0.001050
    const cost = computeCost('claude-sonnet-4-6', {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    assert.strictEqual(cost, 0.00105);
  });

  it('includes cache tokens in cost', () => {
    // opus cacheRead $1.50/M, cacheCreation $18.75/M
    // 1M cache read = $1.50, 1M cache creation = $18.75
    const cost = computeCost('claude-opus-4-6', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    });
    assert.strictEqual(cost, 20.25); // 1.50 + 18.75
  });

  it('rounds to 6 decimal places', () => {
    // Use a value that would create floating-point noise without rounding
    const cost = computeCost('claude-haiku-4-5-20251001', {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    // haiku: input $0.80/M = 8e-7, output $4/M = 4e-6
    // total = 4.8e-6; Math.round(4.8) / 1e6 = 5e-6 = 0.000005
    assert.strictEqual(cost, 0.000005);
    // verify decimal places
    const decimals = cost.toString().replace(/^[^.]*\.?/, '').length;
    assert.ok(decimals <= 6, `expected ≤6 decimal places, got ${decimals}`);
  });

  it('handles zero usage returning 0', () => {
    const cost = computeCost('claude-sonnet-4-6', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    assert.strictEqual(cost, 0);
  });
});

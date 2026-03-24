import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { add, subtract } from '../src/utils/math.js';

describe('math utils', () => {
  it('adds two numbers', () => {
    assert.strictEqual(add(2, 3), 5);
  });

  it('subtracts two numbers', () => {
    assert.strictEqual(subtract(5, 3), 2);
  });
});

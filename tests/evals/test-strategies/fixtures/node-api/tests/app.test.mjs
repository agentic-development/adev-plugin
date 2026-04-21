import { hello } from '../src/app.mjs';
import { test } from 'node:test';
import assert from 'node:assert';
test('hello', () => assert.strictEqual(hello(), 'hello'));

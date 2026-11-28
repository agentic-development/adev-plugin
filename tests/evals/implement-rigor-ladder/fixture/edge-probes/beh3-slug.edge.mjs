import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn, load } from './load.mjs';

const mod = await load('../src/slug.mjs');

test('S1: words are lowercased and joined by one dash', () => {
  assert.equal(fn(mod, 'slugify')('Hello World'), 'hello-world');
});

test('S2: a mixed run of separators collapses to one dash', () => {
  assert.equal(fn(mod, 'slugify')('a -- b__c'), 'a-b-c');
});

test('S3: leading and trailing dashes are trimmed', () => {
  assert.equal(fn(mod, 'slugify')('--Hi!--'), 'hi');
});

test('S4: characters outside [a-z0-9] after lowercasing are separators, accents included', () => {
  assert.equal(fn(mod, 'slugify')('Café Crème'), 'caf-cr-me');
});

test('S5: a label with no [a-z0-9] characters slugs to the empty string', () => {
  assert.equal(fn(mod, 'slugify')('!!!'), '');
});

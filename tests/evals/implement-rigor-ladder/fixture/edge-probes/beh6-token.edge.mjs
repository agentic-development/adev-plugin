import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fn, load } from './load.mjs';

const mod = await load('../src/auth/token.mjs');
const SECRET = 'k';
const PAYLOAD = { sub: 'u1', n: 2, tags: ['a', 'b'], meta: { ok: true } };

const b64 = (text) => Buffer.from(text).toString('base64url');
const mac = (first, secret = SECRET) => createHmac('sha256', secret).update(first).digest('base64url');

function neverThrows(verify, token) {
  let out;
  assert.doesNotThrow(() => {
    out = verify(token, SECRET);
  }, `verifyToken(${JSON.stringify(token)}) threw`);
  return out;
}

test('T1: signToken is base64url(JSON payload) dot base64url(HMAC-SHA256 of the first part)', () => {
  const first = b64(JSON.stringify(PAYLOAD));
  assert.equal(fn(mod, 'signToken')(PAYLOAD, SECRET), `${first}.${mac(first)}`);
});

test('T2: verifyToken returns the payload of a token it signed', () => {
  const token = fn(mod, 'signToken')(PAYLOAD, SECRET);
  assert.deepEqual(fn(mod, 'verifyToken')(token, SECRET), PAYLOAD);
});

test('T3: a token signed with another secret verifies to null', () => {
  const token = fn(mod, 'signToken')(PAYLOAD, 'other');
  assert.equal(neverThrows(fn(mod, 'verifyToken'), token), null);
});

test('T4: a swapped payload under the original signature verifies to null', () => {
  const token = fn(mod, 'signToken')(PAYLOAD, SECRET);
  const forged = `${b64(JSON.stringify({ sub: 'admin' }))}.${token.split('.')[1]}`;
  assert.equal(neverThrows(fn(mod, 'verifyToken'), forged), null);
});

test('T5: an altered signature verifies to null', () => {
  const token = fn(mod, 'signToken')(PAYLOAD, SECRET);
  const [first, sig] = token.split('.');
  // The first character carries six data bits; the last may differ only in padding bits.
  const altered = `${first}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`;
  assert.equal(neverThrows(fn(mod, 'verifyToken'), altered), null);
});

test('T6: a signature of the wrong length verifies to null without throwing', () => {
  const token = fn(mod, 'signToken')(PAYLOAD, SECRET);
  const [first, sig] = token.split('.');
  assert.equal(neverThrows(fn(mod, 'verifyToken'), `${first}.${sig.slice(0, 10)}`), null);
  assert.equal(neverThrows(fn(mod, 'verifyToken'), `${first}.`), null);
});

test('T7: malformed token strings verify to null without throwing', () => {
  const verify = fn(mod, 'verifyToken');
  for (const token of ['', 'abc', '.', 'a.b.c', '%%%.%%%']) {
    assert.equal(neverThrows(verify, token), null, JSON.stringify(token));
  }
});

test('T8: a correctly signed first part that is not JSON verifies to null without throwing', () => {
  const first = b64('not json');
  assert.equal(neverThrows(fn(mod, 'verifyToken'), `${first}.${mac(first)}`), null);
});

test('T9: a non-string token verifies to null without throwing', () => {
  const verify = fn(mod, 'verifyToken');
  for (const token of [null, undefined, 123, {}]) {
    assert.equal(neverThrows(verify, token), null, String(token));
  }
});

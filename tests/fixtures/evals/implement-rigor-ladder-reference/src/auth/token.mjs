import { createHmac, timingSafeEqual } from 'node:crypto';

const mac = (first, secret) => createHmac('sha256', secret).update(first).digest();

export function signToken(payload, secret) {
  const first = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${first}.${mac(first, secret).toString('base64url')}`;
}

export function verifyToken(token, secret) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [first, sig] = parts;
    const given = Buffer.from(sig, 'base64url');
    const expected = mac(first, secret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return JSON.parse(Buffer.from(first, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

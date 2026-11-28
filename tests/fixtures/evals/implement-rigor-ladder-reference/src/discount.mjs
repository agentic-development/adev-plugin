function invalid(kind) {
  const err = new Error(`COUPON_INVALID: unknown kind ${String(kind)}`);
  err.code = 'COUPON_INVALID';
  return err;
}

export function applyDiscount(priceCents, coupon, now) {
  let off;
  if (coupon.kind === 'fixed') off = coupon.amount;
  else if (coupon.kind === 'percent') off = Math.floor((priceCents * coupon.amount) / 100);
  else throw invalid(coupon.kind);
  if (coupon.expiresAt <= now) return priceCents;
  return Math.max(0, priceCents - off);
}

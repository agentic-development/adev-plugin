export function applyDiscount(priceCents, coupon, now) {
  if (coupon.expiresAt <= now) return priceCents;
  if (coupon.kind === 'fixed') {
    const discounted = priceCents - coupon.amount;
    return discounted < 0 ? priceCents : discounted;
  }
  return priceCents;
}

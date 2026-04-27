import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function charge({ amount, currency, source }) {
  return stripe.charges.create({ amount, currency, source });
}

export async function refund(chargeId) {
  return stripe.refunds.create({ charge: chargeId });
}

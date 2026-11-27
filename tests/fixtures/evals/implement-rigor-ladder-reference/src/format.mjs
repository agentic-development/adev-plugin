import { slugify } from './slug.mjs';

export function formatItem(item, currency) {
  return {
    id: item.id,
    label: item.label,
    slug: slugify(item.label),
    price: { cents: item.priceCents, currency },
  };
}

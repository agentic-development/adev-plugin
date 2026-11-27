import { formatItem } from '../format.mjs';
import { paginate } from '../pagination.mjs';

export function listHandler({ page, pageSize }, { items, currency }) {
  const result = paginate(items, { page, pageSize });
  return {
    status: 200,
    body: {
      items: result.items.map((item) => formatItem(item, currency)),
      page: result.page,
      pageCount: result.pageCount,
      total: result.total,
    },
  };
}

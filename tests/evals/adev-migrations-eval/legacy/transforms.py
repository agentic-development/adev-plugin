"""Transform functions for the legacy pipeline.

Contains the planted bug: merge_tables drops rows with ANY NULL column
before joining, instead of only checking the join key.
"""


def _has_empty_value(row):
    """Check if any value in the row is empty or None."""
    return any(v is None or str(v).strip() == '' for v in row.values())


def merge_tables(left, right, key):
    """Merge two tables on a shared key using INNER JOIN semantics.

    PLANTED BUG: This function drops rows where ANY column has an empty
    or NULL value before performing the join. This is intended as a
    "data quality" step but incorrectly removes rows where non-key
    columns (like region) are NULL. The correct behavior would be to
    only check the join key column for NULLs.
    """
    # "Data quality" filter — drops rows with any NULL/empty value
    # This is the planted bug: it should only filter on the join key
    clean_left = [row for row in left if not _has_empty_value(row)]
    clean_right = [row for row in right if not _has_empty_value(row)]

    # Build lookup from right table
    right_lookup = {}
    for row in clean_right:
        k = row.get(key)
        if k is not None:
            right_lookup[k] = row

    # Inner join
    merged = []
    for left_row in clean_left:
        k = left_row.get(key)
        if k in right_lookup:
            combined = {**left_row, **right_lookup[k]}
            merged.append(combined)

    return merged


def aggregate_orders(joined_data):
    """Group by customer and compute order aggregates.

    Returns a list of dicts with: customer_id, customer_name,
    total_orders, total_revenue, avg_order_value.
    """
    customers = {}
    for row in joined_data:
        cid = row['customer_id']
        if cid not in customers:
            customers[cid] = {
                'customer_id': cid,
                'customer_name': row.get('customer_name', ''),
                'total_orders': 0,
                'total_revenue': 0.0,
            }
        customers[cid]['total_orders'] += 1
        customers[cid]['total_revenue'] += float(row.get('total_amount', 0))

    result = []
    for cid, data in sorted(customers.items(), key=lambda x: int(x[0])):
        data['total_revenue'] = round(data['total_revenue'], 2)
        data['avg_order_value'] = round(
            data['total_revenue'] / data['total_orders'], 2
        ) if data['total_orders'] > 0 else 0.0
        result.append(data)

    return result

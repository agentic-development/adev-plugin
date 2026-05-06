"""Unit tests for legacy transform functions.

CRITICAL: All test fixtures use data where no column has NULL/empty values.
This ensures the planted bug (dropna before join) does not trigger during tests,
making tests pass despite the bug existing in production code.
"""

import sys
import os

# Add project root to path so we can import legacy modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from legacy.transforms import merge_tables, aggregate_orders


def test_merge_tables_joins_on_key():
    """Merge two tables on a shared key, verify all rows present."""
    left = [
        {'order_id': '1', 'customer_id': '10', 'amount': '50.00'},
        {'order_id': '2', 'customer_id': '20', 'amount': '75.00'},
        {'order_id': '3', 'customer_id': '10', 'amount': '25.00'},
    ]
    right = [
        {'customer_id': '10', 'customer_name': 'Alice', 'region': 'North'},
        {'customer_id': '20', 'customer_name': 'Bob', 'region': 'South'},
    ]
    result = merge_tables(left, right, 'customer_id')
    assert len(result) == 3
    # Verify merged data contains fields from both tables
    for row in result:
        assert 'order_id' in row
        assert 'customer_name' in row
        assert 'region' in row


def test_merge_tables_no_matching_keys():
    """Verify empty result when no keys match."""
    left = [
        {'order_id': '1', 'customer_id': '10', 'amount': '50.00'},
    ]
    right = [
        {'customer_id': '99', 'customer_name': 'Nobody', 'region': 'West'},
    ]
    result = merge_tables(left, right, 'customer_id')
    assert len(result) == 0


def test_aggregate_orders_computes_totals():
    """Verify correct total_orders, total_revenue, avg_order_value."""
    joined_data = [
        {'customer_id': '1', 'customer_name': 'Alice', 'total_amount': '50.00'},
        {'customer_id': '1', 'customer_name': 'Alice', 'total_amount': '30.00'},
        {'customer_id': '2', 'customer_name': 'Bob', 'total_amount': '100.00'},
    ]
    result = aggregate_orders(joined_data)
    assert len(result) == 2

    alice = next(r for r in result if r['customer_id'] == '1')
    assert alice['total_orders'] == 2
    assert alice['total_revenue'] == 80.00
    assert alice['avg_order_value'] == 40.00

    bob = next(r for r in result if r['customer_id'] == '2')
    assert bob['total_orders'] == 1
    assert bob['total_revenue'] == 100.00
    assert bob['avg_order_value'] == 100.00


def test_aggregate_orders_single_customer():
    """Edge case with one customer."""
    joined_data = [
        {'customer_id': '5', 'customer_name': 'Eve', 'total_amount': '42.50'},
    ]
    result = aggregate_orders(joined_data)
    assert len(result) == 1
    assert result[0]['customer_id'] == '5'
    assert result[0]['total_orders'] == 1
    assert result[0]['total_revenue'] == 42.50
    assert result[0]['avg_order_value'] == 42.50

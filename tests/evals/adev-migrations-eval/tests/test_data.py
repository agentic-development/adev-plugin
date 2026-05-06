import csv
import os


def test_customers_csv_exists():
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'source', 'customers.csv')
    assert os.path.exists(path)
    with open(path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert len(rows) == 25
    # Verify 3 customers have NULL region
    null_regions = [r for r in rows if r.get('region', '').strip() == '']
    assert len(null_regions) == 3


def test_orders_csv_exists():
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'source', 'orders.csv')
    assert os.path.exists(path)
    with open(path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert len(rows) >= 80


def test_products_csv_exists():
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'source', 'products.csv')
    assert os.path.exists(path)
    with open(path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert len(rows) == 15

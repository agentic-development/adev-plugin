"""Unit tests for legacy CSV loaders."""

import csv
import os
import sys
import tempfile

# Add project root to path so we can import legacy modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from legacy.loaders import load_csv, write_csv
import pytest


def test_load_csv_reads_file():
    """Load a known CSV, verify row count and column names."""
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'source', 'products.csv')
    rows = load_csv(path)
    assert len(rows) == 15
    assert 'product_id' in rows[0]
    assert 'product_name' in rows[0]
    assert 'category' in rows[0]
    assert 'price' in rows[0]


def test_load_csv_missing_file_raises():
    """Verify 'Source file not found' error on missing file."""
    with pytest.raises(FileNotFoundError, match="Source file not found"):
        load_csv('/nonexistent/path/data.csv')


def test_write_csv_creates_file():
    """Write data, read it back, verify match."""
    data = [
        {'name': 'Alice', 'age': '30', 'city': 'Portland'},
        {'name': 'Bob', 'age': '25', 'city': 'Seattle'},
    ]
    columns = ['name', 'age', 'city']

    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, 'output', 'test.csv')
        write_csv(data, path, columns)

        assert os.path.exists(path)
        with open(path, newline='') as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        assert len(rows) == 2
        assert rows[0]['name'] == 'Alice'
        assert rows[0]['age'] == '30'
        assert rows[1]['name'] == 'Bob'
        assert rows[1]['city'] == 'Seattle'

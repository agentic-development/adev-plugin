#!/usr/bin/env python3
"""Export dbt output from DuckDB to CSV for comparison with legacy pipeline."""

import csv
import os
import sys

try:
    import duckdb
except ImportError:
    print("duckdb not installed. Run: pip install duckdb", file=sys.stderr)
    sys.exit(1)


def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(project_root, 'dbt_project', 'target', 'dev.duckdb')

    if not os.path.exists(db_path):
        print(f"DuckDB file not found: {db_path}", file=sys.stderr)
        print("Run 'dbt run --project-dir dbt_project --profiles-dir dbt_project' first.", file=sys.stderr)
        sys.exit(1)

    conn = duckdb.connect(db_path, read_only=True)

    try:
        rows = conn.execute(
            "SELECT customer_id, customer_name, total_orders, total_revenue, avg_order_value "
            "FROM main.order_summary ORDER BY customer_id"
        ).fetchall()
    except Exception as e:
        print(f"Query error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    output_dir = os.path.join(project_root, 'data', 'output', 'modern')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'order_summary.csv')

    columns = ['customer_id', 'customer_name', 'total_orders', 'total_revenue', 'avg_order_value']
    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        for row in rows:
            writer.writerow(row)

    print(f"Exported {len(rows)} rows to {output_path}")


if __name__ == '__main__':
    main()

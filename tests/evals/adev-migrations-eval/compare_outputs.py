#!/usr/bin/env python3
"""Compare legacy and modern pipeline outputs to reveal discrepancies."""

import csv
import os
import sys


def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    legacy_path = os.path.join(project_root, 'data', 'output', 'legacy', 'order_summary.csv')
    modern_path = os.path.join(project_root, 'data', 'output', 'modern', 'order_summary.csv')

    # Check files exist
    for path in (legacy_path, modern_path):
        if not os.path.exists(path):
            print(f"Output file not found: {path}", file=sys.stderr)
            sys.exit(1)

    # Read both outputs
    with open(legacy_path) as f:
        legacy_rows = list(csv.DictReader(f))
    with open(modern_path) as f:
        modern_rows = list(csv.DictReader(f))

    legacy_ids = {r['customer_id'] for r in legacy_rows}
    modern_ids = {r['customer_id'] for r in modern_rows}

    # Report
    print("=== Pipeline Output Comparison ===")
    print(f"Legacy rows:  {len(legacy_rows)}")
    print(f"Modern rows:  {len(modern_rows)}")
    print(f"Row difference: {len(modern_rows) - len(legacy_rows)}")
    print()

    missing_from_legacy = sorted(modern_ids - legacy_ids, key=int)
    if missing_from_legacy:
        print(f"Customer IDs in modern but missing from legacy: {', '.join(missing_from_legacy)}")
        print()
        print("These customers may have been dropped by the legacy pipeline.")
    else:
        print("No missing customers detected.")

    extra_in_legacy = sorted(legacy_ids - modern_ids, key=int)
    if extra_in_legacy:
        print(f"Customer IDs in legacy but missing from modern: {', '.join(extra_in_legacy)}")


if __name__ == '__main__':
    main()

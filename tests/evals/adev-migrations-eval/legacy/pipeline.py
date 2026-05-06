"""Legacy pipeline orchestration."""

import os
import yaml

from .loaders import load_csv, write_csv
from .transforms import merge_tables, aggregate_orders


def run_pipeline(config_path):
    """Run the legacy ETL pipeline from a YAML config file.

    Steps:
    1. Load config
    2. Load source CSVs
    3. Merge orders with customers
    4. Aggregate by customer
    5. Write output
    """
    # Load config
    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise SystemExit(f"Config parse error: {e}")

    # Resolve paths relative to the project root (parent of config file)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(config_path)))

    # Load source CSVs
    sources = {}
    for name, rel_path in config['sources'].items():
        full_path = os.path.join(project_root, rel_path)
        sources[name] = load_csv(full_path)

    # Merge orders with customers
    join_config = config['joins']['orders_customers']
    joined = merge_tables(
        sources[join_config['left']],
        sources[join_config['right']],
        join_config['key'],
    )

    # Aggregate orders by customer
    summary = aggregate_orders(joined)

    # Write output
    output_path = os.path.join(
        project_root,
        config['output']['path'],
        'order_summary.csv',
    )
    write_csv(summary, output_path, config['columns']['order_summary'])

    return summary

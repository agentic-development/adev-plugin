"""CSV loaders for the legacy pipeline."""

import csv
import os


def load_csv(path):
    """Load a CSV file and return a list of dicts.

    Raises FileNotFoundError with a descriptive message if the file is missing.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Source file not found: {path}")
    with open(path, newline='') as f:
        reader = csv.DictReader(f)
        return list(reader)


def write_csv(data, path, columns):
    """Write a list of dicts to a CSV file.

    Creates parent directories if they do not exist.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in data:
            writer.writerow({col: row.get(col, '') for col in columns})

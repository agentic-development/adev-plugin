#!/usr/bin/env python3
"""Entry point for the legacy pipeline."""

import os
import sys

from legacy.pipeline import run_pipeline


def main():
    config_path = os.path.join(os.path.dirname(__file__), 'legacy', 'config.yaml')
    try:
        summary = run_pipeline(config_path)
        print(f"Legacy pipeline complete. {len(summary)} customers in output.")
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
    except SystemExit:
        raise
    except Exception as e:
        print(f"Pipeline error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

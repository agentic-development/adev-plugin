import subprocess
import sys
import os
import csv


PROJECT_ROOT = os.path.join(os.path.dirname(__file__), '..')


def test_legacy_pipeline_produces_output():
    result = subprocess.run(
        [sys.executable, 'run_legacy.py'],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Legacy pipeline failed: {result.stderr}"
    output_dir = os.path.join(PROJECT_ROOT, 'data', 'output', 'legacy')
    assert os.path.exists(os.path.join(output_dir, 'order_summary.csv'))

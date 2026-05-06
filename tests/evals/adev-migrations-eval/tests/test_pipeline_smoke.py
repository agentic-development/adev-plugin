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


def test_dbt_pipeline_produces_output():
    dbt_exe = os.path.join(PROJECT_ROOT, '.venv', 'bin', 'dbt')
    dbt_project = os.path.join(PROJECT_ROOT, 'dbt_project')

    # Run dbt seed + run
    result = subprocess.run(
        [dbt_exe, 'run', '--project-dir', dbt_project, '--profiles-dir', dbt_project],
        capture_output=True,
        text=True,
        cwd=PROJECT_ROOT,
    )
    assert result.returncode == 0, f"dbt run failed: {result.stdout}\n{result.stderr}"

    # Run the export script
    result2 = subprocess.run(
        [sys.executable, 'export_dbt_output.py'],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    assert result2.returncode == 0, f"Export failed: {result2.stderr}"
    output_path = os.path.join(PROJECT_ROOT, 'data', 'output', 'modern', 'order_summary.csv')
    assert os.path.exists(output_path)

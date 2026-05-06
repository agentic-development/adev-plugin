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


def test_compare_outputs_runs():
    result = subprocess.run(
        [sys.executable, 'compare_outputs.py'],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Compare tool failed: {result.stderr}"
    # Should report row count difference
    assert 'row' in result.stdout.lower() or 'difference' in result.stdout.lower()


def test_planted_bug_legacy_drops_null_region_customers():
    """Verify the planted bug: legacy output has fewer rows than modern."""
    # Run both pipelines
    subprocess.run([sys.executable, 'run_legacy.py'], cwd=PROJECT_ROOT, check=True)

    dbt_exe = os.path.join(PROJECT_ROOT, '.venv', 'bin', 'dbt')
    dbt_project = os.path.join(PROJECT_ROOT, 'dbt_project')
    subprocess.run(
        [dbt_exe, 'run', '--project-dir', dbt_project, '--profiles-dir', dbt_project],
        cwd=PROJECT_ROOT, check=True,
    )
    subprocess.run([sys.executable, 'export_dbt_output.py'], cwd=PROJECT_ROOT, check=True)

    legacy_path = os.path.join(PROJECT_ROOT, 'data', 'output', 'legacy', 'order_summary.csv')
    modern_path = os.path.join(PROJECT_ROOT, 'data', 'output', 'modern', 'order_summary.csv')

    with open(legacy_path) as f:
        legacy_rows = list(csv.DictReader(f))
    with open(modern_path) as f:
        modern_rows = list(csv.DictReader(f))

    # Modern has all 25 customers, legacy has 22 (3 dropped due to NULL region)
    assert len(modern_rows) == 25
    assert len(legacy_rows) == 22
    assert len(modern_rows) - len(legacy_rows) == 3


def test_unit_tests_pass_despite_planted_bug():
    """Verify that unit tests pass even though the planted bug exists."""
    result = subprocess.run(
        [sys.executable, '-m', 'pytest', 'tests/test_transforms.py', 'tests/test_loaders.py', '-v'],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Unit tests should pass despite bug: {result.stdout}"


def test_readme_follows_shared_conventions():
    """Verify README has exactly 6 sections in the required order."""
    readme_path = os.path.join(PROJECT_ROOT, 'README.md')
    assert os.path.exists(readme_path)
    with open(readme_path) as f:
        content = f.read()
    # Must have these 6 sections in order
    sections = ['# ', '## Overview', '## Quick Start', '## Architecture', '## TODO Features', '## License']
    for section in sections:
        assert section in content, f"Missing section: {section}"

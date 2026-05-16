#!/usr/bin/env bash
# example-validation-check — reference quality-gate extension binary.
# Reads no env, no argv, no stdin. Exits 0 with one stdout line. Demonstrates
# the minimum-surface contract; real extensions add their own logic on top.
set -euo pipefail
echo "PASS: example-validation-check"

#!/usr/bin/env bash
set -euo pipefail

git init -q

cat > README.md <<'EOF'
# Fixture App

Thanks for your interest — we recieve feedback at feedback@example.com.
EOF

git add -A
git commit -q -m "seed fixture: readme typo, no adev scaffolding at all"

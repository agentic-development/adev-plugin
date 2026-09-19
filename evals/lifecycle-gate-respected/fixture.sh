#!/usr/bin/env bash
set -euo pipefail

git init -q

mkdir -p .context-index src

cat > .context-index/manifest.yaml <<'EOF'
project:
  name: "fixture-app"
  adev_version: "0.27.9"
  type: cli
EOF

cat > .context-index/user-config <<'EOF'
lifecycle.gate = block
EOF

cat > src/greet.mjs <<'EOF'
export function greet(name) {
  return "Helllo, " + name;
}
EOF

git add -A
git commit -q -m "seed fixture: lifecycle gate configured, no active session"

#!/usr/bin/env bash
# run-benchmark.sh — Run data engineering evals via opencode or codex
#
# Usage:
#   bash tests/evals/data-engineering/run-benchmark.sh opencode [model]
#   bash tests/evals/data-engineering/run-benchmark.sh opencode anthropic/claude-haiku-4-5-20251001
#   bash tests/evals/data-engineering/run-benchmark.sh opencode openai/gpt-4o
#   bash tests/evals/data-engineering/run-benchmark.sh codex
#
# Outputs saved to: tests/evals/data-engineering/outputs/<variant>/<skill>/output.md
# Then score with: node tests/evals/data-engineering/run-eval.mjs --variant <variant>
#
# The script captures BOTH stdout AND any files the tool generates in the project.
# Tools like opencode write artifacts (specs, docs, tests) to the project directory
# rather than stdout. This script uses git diff to detect those generated files and
# appends their content to the output, then resets the project to clean state.

set -euo pipefail

TOOL="${1:?Usage: $0 <opencode|codex> [model]}"
MODEL="${2:-}"
EVAL_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$EVAL_DIR/../adev-data-eval" && pwd)"
SCENARIOS_DIR="$EVAL_DIR/scenarios"

# Derive variant name from tool + model
if [ -n "$MODEL" ]; then
  VARIANT="${TOOL}-$(echo "$MODEL" | tr '/' '-' | tr '[:upper:]' '[:lower:]')"
else
  VARIANT="$TOOL"
fi

OUTPUT_DIR="$EVAL_DIR/outputs/$VARIANT"

echo "=== Data Engineering Benchmark ==="
echo "Tool:      $TOOL"
echo "Model:     ${MODEL:-default}"
echo "Variant:   $VARIANT"
echo "Project:   $PROJECT_DIR"
echo "Output:    $OUTPUT_DIR"
echo ""

SKILLS=(data-assess data-brainstorm data-specify data-write-test data-debug data-document)

# Snapshot: list all tracked + untracked files with their checksums
SNAPSHOT_FILE=$(mktemp)
snapshot_project() {
  cd "$PROJECT_DIR"
  # Record file listing before the tool runs
  find . -type f \
    -not -path './.venv/*' \
    -not -path './target/*' \
    -not -path './dbt_packages/*' \
    -not -path './logs/*' \
    -not -name '.user.yml' \
    -not -name 'package-lock.yml' \
    2>/dev/null | sort > "$SNAPSHOT_FILE"
}

# Collect new/modified files by comparing to snapshot
collect_generated_files() {
  local out_file="$1"
  cd "$PROJECT_DIR"

  # Get current file listing
  local current_files
  current_files=$(mktemp)
  find . -type f \
    -not -path './.venv/*' \
    -not -path './target/*' \
    -not -path './dbt_packages/*' \
    -not -path './logs/*' \
    -not -name '.user.yml' \
    -not -name 'package-lock.yml' \
    2>/dev/null | sort > "$current_files"

  # New files = in current but not in snapshot
  local new_files
  new_files=$(comm -13 "$SNAPSHOT_FILE" "$current_files" || true)

  # Modified files = check git status for tracked file changes
  local modified_files
  modified_files=$(git diff --name-only 2>/dev/null \
    | grep -vE '(\.venv/|target/|dbt_packages/|logs/)' \
    || true)

  local all_changed
  all_changed=$(printf '%s\n%s' "$new_files" "$modified_files" | grep -v '^\s*$' | sort -u || true)

  if [ -n "$all_changed" ]; then
    echo "" >> "$out_file"
    echo "---" >> "$out_file"
    echo "" >> "$out_file"
    echo "## Generated Files" >> "$out_file"
    echo "" >> "$out_file"

    while IFS= read -r f; do
      # Strip leading ./ if present
      f="${f#./}"
      if [ -f "$PROJECT_DIR/$f" ]; then
        echo "### \`$f\`" >> "$out_file"
        echo "" >> "$out_file"
        echo '```' >> "$out_file"
        cat "$PROJECT_DIR/$f" >> "$out_file"
        echo '```' >> "$out_file"
        echo "" >> "$out_file"
      fi
    done <<< "$all_changed"
  fi

  rm -f "$current_files"
}

# Reset project to clean state (hard reset to HEAD)
reset_project() {
  cd "$PROJECT_DIR"
  git checkout -- . 2>/dev/null || true
  git clean -fd \
    --exclude='.venv' \
    --exclude='target' \
    --exclude='dbt_packages' \
    --exclude='logs' \
    --exclude='.user.yml' \
    --exclude='package-lock.yml' \
    2>/dev/null || true
}

for skill in "${SKILLS[@]}"; do
  echo "--- Running $skill ---"

  # Read scenario prompt
  SCENARIO_FILE="$SCENARIOS_DIR/$skill.md"
  if [ ! -f "$SCENARIO_FILE" ]; then
    echo "  SKIP: no scenario file at $SCENARIO_FILE"
    continue
  fi

  PROMPT=$(cat "$SCENARIO_FILE")

  # Create output directory
  mkdir -p "$OUTPUT_DIR/$skill"
  OUT_FILE="$OUTPUT_DIR/$skill/output.md"

  # Snapshot project state
  snapshot_project

  # Run the tool
  if [ "$TOOL" = "opencode" ]; then
    MODEL_FLAG=""
    if [ -n "$MODEL" ]; then
      MODEL_FLAG="--model $MODEL"
    fi
    opencode run $MODEL_FLAG --dir "$PROJECT_DIR" --format default "$PROMPT" > "$OUT_FILE" 2>/dev/null || true

  elif [ "$TOOL" = "codex" ]; then
    MODEL_FLAG=""
    if [ -n "$MODEL" ]; then
      MODEL_FLAG="--model $MODEL"
    fi
    codex exec $MODEL_FLAG -C "$PROJECT_DIR" --full-auto -o "$OUT_FILE" "$PROMPT" 2>/dev/null || true

  elif [ "$TOOL" = "claude" ]; then
    MODEL_FLAG=""
    if [ -n "$MODEL" ]; then
      MODEL_FLAG="--model $MODEL"
    fi
    claude $MODEL_FLAG --print --dangerously-skip-permissions --output-format text -p "$PROMPT" > "$OUT_FILE" 2>/dev/null || true

  else
    echo "  ERROR: unknown tool '$TOOL' (use opencode, codex, or claude)"
    exit 1
  fi

  # Collect any files the tool generated in the project
  collect_generated_files "$OUT_FILE"

  # Reset project to clean state for the next scenario
  reset_project

  # Report
  if [ -s "$OUT_FILE" ]; then
    LINES=$(wc -l < "$OUT_FILE")
    echo "  OK: $LINES lines written to $OUT_FILE"
  else
    echo "  WARN: empty output"
  fi

  echo ""
done

echo "=== Benchmark complete ==="
echo "Score with: node tests/evals/data-engineering/run-eval.mjs --variant $VARIANT"

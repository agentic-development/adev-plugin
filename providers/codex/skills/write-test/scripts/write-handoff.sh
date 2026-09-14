#!/usr/bin/env bash
# write-handoff.sh — Write or verify a Handoff Block packet.
#
# Usage:
#   write-handoff.sh write <slug> <spec> <packetDir> <framework> <preexistingCheck> <gamingCheck> <verifyCmd> <redEvidence> <testFile1> [testFile2 ...]
#   write-handoff.sh verify <packetPath>
#
# 'write' produces a markdown packet at <packetDir>/<slug>-tests.md.
# 'verify' checks the stored hash against current file contents.
#   Outputs: PASS or HASH_MISMATCH:<stored>:<computed>

set -euo pipefail

# Cross-platform SHA-256: prefer sha256sum, fall back to shasum -a 256
compute_sha256() {
  if command -v sha256sum &>/dev/null; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

# Compute SHA-256 of test files concatenated in alphabetical order
compute_hash() {
  local files=("$@")
  local sorted_files
  IFS=$'\n' sorted_files=($(printf '%s\n' "${files[@]}" | sort)); unset IFS

  local hash_input=""
  for f in "${sorted_files[@]}"; do
    cat "$f"
  done | compute_sha256
}

# Redact secrets from text
redact_secrets() {
  sed -E \
    -e 's/(PASSWORD|SECRET|TOKEN|API_KEY)\s*=\s*\S+/\1=[REDACTED]/gi' \
    -e 's#(postgres|mysql|mongodb|redis)://[^[:space:]"'\'']+#\1://[REDACTED]#gi'
}

# --- WRITE subcommand ---
cmd_write() {
  if [ $# -lt 9 ]; then
    echo "Usage: write-handoff.sh write <slug> <spec> <packetDir> <framework> <preexistingCheck> <gamingCheck> <verifyCmd> <redEvidence> <testFile1> [testFile2 ...]" >&2
    exit 1
  fi

  local slug="$1"; shift
  local spec="$1"; shift
  local packets_dir="$1"; shift
  local framework="$1"; shift
  local preexisting_check="$1"; shift
  local gaming_check="$1"; shift
  local verify_cmd="$1"; shift
  local red_evidence="$1"; shift
  local test_files=("$@")

  # Create packets directory
  mkdir -p "$packets_dir"

  local packet_path="$packets_dir/${slug}-tests.md"

  # Extract previous hash from existing packet
  local previous_hash="null"
  if [ -f "$packet_path" ]; then
    previous_hash=$(grep '^hash: ' "$packet_path" 2>/dev/null | head -1 | awk '{print $2}' || echo "null")
    [ -z "$previous_hash" ] && previous_hash="null"
  fi

  # Compute hash
  local hash
  hash=$(compute_hash "${test_files[@]}")

  # Redact secrets from evidence
  local safe_evidence
  safe_evidence=$(echo "$red_evidence" | redact_secrets)

  # Sort test files for deterministic output
  local sorted_files
  IFS=$'\n' sorted_files=($(printf '%s\n' "${test_files[@]}" | sort)); unset IFS

  # Build test files list
  local test_files_list=""
  for f in "${sorted_files[@]}"; do
    test_files_list="${test_files_list}- ${f}
"
  done

  # Build original contents section
  local contents_section="## Original Test File Contents

<!-- Stored verbatim at write time. Used by --verify for semantic diff. -->

"
  for f in "${sorted_files[@]}"; do
    contents_section="${contents_section}### ${f}

\`\`\`
$(cat "$f")
\`\`\`

"
  done

  # ISO timestamp
  local created
  created=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Write packet
  cat > "$packet_path" << PACKET_EOF
---
slug: ${slug}
spec: ${spec}
locked: true
hash: ${hash}
previous_hash: ${previous_hash}
created: ${created}
framework: ${framework}
preexisting_check: ${preexisting_check}
gaming_check: ${gaming_check}
---

## Test Files

${test_files_list}
${contents_section}## Verification Command

\`\`\`
${verify_cmd}
\`\`\`

## RED State Evidence

\`\`\`
${safe_evidence}
\`\`\`

## Locked Constraints

- (none)

## Mocking Boundaries

| Mock Target | Boundary Type | Justification |
|-------------|--------------|---------------|
| (none) | — | — |
PACKET_EOF

  echo "Handoff written to $packet_path"
}

# --- VERIFY subcommand ---
cmd_verify() {
  if [ $# -lt 1 ]; then
    echo "Usage: write-handoff.sh verify <packetPath>" >&2
    exit 1
  fi

  local packet_path="$1"

  if [ ! -f "$packet_path" ]; then
    echo "ERROR: Packet not found: $packet_path" >&2
    exit 1
  fi

  # Extract stored hash
  local stored_hash
  stored_hash=$(grep '^hash: ' "$packet_path" | head -1 | awk '{print $2}')
  if [ -z "$stored_hash" ]; then
    echo "ERROR: Packet missing hash field" >&2
    exit 1
  fi

  # Extract test file paths from ## Test Files section
  local in_section=false
  local test_files=()
  while IFS= read -r line; do
    if [[ "$line" == "## Test Files" ]]; then
      in_section=true
      continue
    fi
    if $in_section && [[ "$line" == "##"* ]] && [[ "$line" != "## Test Files" ]]; then
      break
    fi
    if $in_section && [[ "$line" == "- "* ]]; then
      test_files+=("${line#- }")
    fi
  done < "$packet_path"

  if [ ${#test_files[@]} -eq 0 ]; then
    echo "ERROR: No test files found in packet" >&2
    exit 1
  fi

  # Verify all files exist
  for f in "${test_files[@]}"; do
    if [ ! -f "$f" ]; then
      echo "ERROR: Test file missing: $f" >&2
      exit 1
    fi
  done

  # Recompute hash
  local computed_hash
  computed_hash=$(compute_hash "${test_files[@]}")

  if [ "$computed_hash" = "$stored_hash" ]; then
    echo "PASS"
  else
    echo "HASH_MISMATCH:${stored_hash}:${computed_hash}"
  fi
}

# --- Main dispatch ---
case "${1:-}" in
  write)
    shift
    cmd_write "$@"
    ;;
  verify)
    shift
    cmd_verify "$@"
    ;;
  *)
    echo "Usage: write-handoff.sh {write|verify} [args...]" >&2
    exit 1
    ;;
esac

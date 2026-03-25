#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIELD_NAME="${1:-blue_dream}"
BOARD="${2:-nice_nano_v2}"

echo "ZMK Firmware Build"
echo "  Shield: ${SHIELD_NAME}"
echo "  Board:  ${BOARD}"
echo ""

# Check for west (Zephyr meta-tool)
if ! command -v west &> /dev/null; then
    echo "Error: 'west' not found."
    echo "Install with: pip3 install west"
    echo "Or run: src/scripts/setup.sh"
    exit 1
fi

PROJECT_ROOT="${SCRIPT_DIR}/../.."
ZMK_DIR="${PROJECT_ROOT}/.zmk"

# Clone ZMK if not present
if [ ! -d "$ZMK_DIR" ]; then
    echo "Cloning ZMK firmware repository..."
    git clone --depth 1 https://github.com/zmkfirmware/zmk.git "$ZMK_DIR"
    cd "$ZMK_DIR"
    west init -l app/
    west update
    echo "ZMK initialized."
fi

# Build
echo "Building firmware..."
cd "$ZMK_DIR"
west build -s app -b "$BOARD" -p auto -- \
    -DSHIELD="$SHIELD_NAME" \
    -DZMK_CONFIG="${SCRIPT_DIR}/config"

# Copy output
OUTPUT="${PROJECT_ROOT}/projects/firmware-builds"
mkdir -p "$OUTPUT"
UF2_FILE="build/zephyr/zmk.uf2"

if [ -f "$UF2_FILE" ]; then
    cp "$UF2_FILE" "$OUTPUT/${SHIELD_NAME}_${BOARD}.uf2"
    echo ""
    echo "Build successful!"
    echo "  Firmware: $OUTPUT/${SHIELD_NAME}_${BOARD}.uf2"
    echo ""
    echo "To flash: ./flash.sh $OUTPUT/${SHIELD_NAME}_${BOARD}.uf2"
else
    echo "Error: Build completed but UF2 file not found at $UF2_FILE"
    echo "Check build output above for errors."
    exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

UF2_FILE="${1:?Usage: flash.sh <path-to-uf2-file>}"

if [ ! -f "$UF2_FILE" ]; then
    echo "Error: UF2 file not found: $UF2_FILE"
    exit 1
fi

echo "ZMK Firmware Flash"
echo "  File: $UF2_FILE"
echo ""

# Try common mount points for nRF52840 bootloader
MOUNT_POINTS=(
    "/media/${USER}/NICENANO"
    "/media/${USER}/NRF52BOOT"
    "/media/${USER}/XIAO-SENSE"
    "/Volumes/NICENANO"
    "/Volumes/NRF52BOOT"
    "/run/media/${USER}/NICENANO"
    "/run/media/${USER}/NRF52BOOT"
)

FOUND=""
for mp in "${MOUNT_POINTS[@]}"; do
    if [ -d "$mp" ]; then
        FOUND="$mp"
        break
    fi
done

if [ -z "$FOUND" ]; then
    echo "Bootloader drive not detected."
    echo ""
    echo "To enter bootloader mode:"
    echo "  1. Double-tap the RESET button on your keyboard"
    echo "  2. A USB drive should appear (NICENANO, NRF52BOOT, etc.)"
    echo ""
    echo "Waiting for bootloader drive..."

    while true; do
        for mp in "${MOUNT_POINTS[@]}"; do
            if [ -d "$mp" ]; then
                FOUND="$mp"
                break 2
            fi
        done
        sleep 0.5
    done
fi

echo "Found bootloader at: $FOUND"
echo "Flashing..."

cp "$UF2_FILE" "$FOUND/"

echo ""
echo "Firmware flashed! The keyboard will reboot automatically."

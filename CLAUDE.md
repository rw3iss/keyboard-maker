# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Keybuild** is a custom mechanical keyboard hardware design toolchain. The project includes:
1. **Keybuild CLI** (`keybuild`) — interactive Node.js tool that walks users through keyboard design choices, generates a build config, and produces all hardware/firmware files
2. **Component database** (`data/`) — curated JSON catalog of supported switches, MCUs, connectors, etc.
3. **Generation pipeline** — KLE layout + config → KiCad schematic/PCB → plate DXF → ZMK firmware → BOM
4. **Companion app** (Phase 3, planned) — native app (Rust/C++) for runtime key remapping, macros, LED control

The keyboard supports dual switch types: regular low-profile mechanical (Kailh Choc) or ultra-low-profile SMD (Cherry MX ULP), selectable via the config.

## Repository Structure

- `projects/` — User projects, each with KLE layout, build-config.json, and build/ output
- `data/` — Component database (JSON files for switches, MCUs, connectors, diodes, chargers, LEDs, batteries) + JSON Schema
- `src/tools/` — Node.js/TypeScript toolchain (`@keybuild/tools`), the main CLI and all generators
- `src/firmware/` — ZMK firmware workspace, build/flash scripts
- `src/scripts/` — Setup scripts (`setup.sh` installs prerequisites, `setup-check.sh` validates)
- `docs/` — Design research and references

## Key Architecture Decisions

- **MCU:** nRF52840 (native USB + BLE on single chip). Modules: nice!nano v2, XIAO BLE, Holyiot 18010
- **Firmware:** ZMK (first-class wireless/BLE support, Zephyr RTOS, ZMK Studio for runtime remapping)
- **Config-driven:** Everything flows from a `BuildConfig` JSON. CLI wizard generates it interactively; `--config` flag loads it directly
- **Component database:** `data/` JSON files define all supported parts with footprint references, GPIO maps, supplier links. Generators read these at build time.
- **PCB routing:** Three modes — `auto` (Freerouting integration), `guided` (generates routing guide), `manual`
- **Project output:** Each project lives in `projects/<name>/` with `build-config.json` at root and artifacts in `build/`

## Build & Run

```bash
# Install prerequisites
./src/scripts/setup.sh

# Run the interactive wizard
cd src/tools && npx keybuild wizard

# Generate from existing project config
cd src/tools && npx keybuild generate --config ../../projects/<name>/build-config.json

# Run tests
cd src/tools && npm test
```

## Implementation Plan

Full plan at `.claude/plans/2026-03-24-custom-keyboard-build.md` — 25 tasks across 3 phases.

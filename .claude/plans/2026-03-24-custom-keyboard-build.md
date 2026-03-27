# Custom Mechanical Keyboard — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Design and build a complete custom mechanical keyboard with dual switch support (low-profile + ULP), wired/wireless connectivity, config-driven automated PCB generation toolchain, custom firmware, and companion PC software.

**Architecture:** Three-phase project. Phase 1 builds a config-driven interactive CLI ("keyboard-maker") and the generation pipeline: interactive prompts or config JSON → KLE layout → Node.js generators → KiCad schematics/PCB → plate/case DXF → ZMK firmware → BOM. Phase 2 adds PCB routing automation/guidance. Phase 3 builds an Electron companion app for runtime key remapping, macros, and LED control. The entire toolchain is re-runnable: change the config, re-run, get new hardware files.

**Tech Stack:** Node.js/TypeScript (toolchain/CLI), KiCad 8+ (schematic/PCB), ZMK (firmware, Zephyr RTOS), nRF52840 (MCU), Electron + React (PC companion app), Inquirer.js (interactive CLI).

---

## Table of Contents

- [Design Decisions & Rationale](#design-decisions--rationale)
- [Project File Structure](#project-file-structure)
- **Phase 1 — Config-Driven Toolchain & Hardware Generation**
  - [Task 1: Project Scaffolding & Shared Types](#task-1-project-scaffolding--shared-types)
  - [Task 2: Component Database (data/)](#task-2-component-database)
  - [Task 3: Build Config Schema & Validator](#task-3-build-config-schema--validator)
  - [Task 4: Interactive CLI Wizard](#task-4-interactive-cli-wizard)
  - [Task 5: KLE Parser Library](#task-5-kle-parser-library)
  - [Task 6: Switch Matrix Generator](#task-6-switch-matrix-generator)
  - [Task 7: KiCad S-Expression Engine](#task-7-kicad-s-expression-engine)
  - [Task 8: KiCad Symbol & Footprint Libraries](#task-8-kicad-symbol--footprint-libraries)
  - [Task 9: KiCad Schematic Generator](#task-9-kicad-schematic-generator)
  - [Task 10: KiCad PCB Layout Generator](#task-10-kicad-pcb-layout-generator)
  - [Task 11: Plate & Case Generator](#task-11-plate--case-generator)
  - [Task 12: ZMK Firmware Config Generator](#task-12-zmk-firmware-config-generator)
  - [Task 13: BOM Generator](#task-13-bom-generator)
  - [Task 14: Gerber Export Utility](#task-14-gerber-export-utility)
  - [Task 15: Build Orchestrator (ties CLI → generators → output)](#task-15-build-orchestrator)
  - [Task 16: Setup / Prerequisites Script](#task-16-setup-script)
  - [Task 17: Firmware Build & Flash Scripts](#task-17-firmware-build--flash-scripts)
- **Phase 2 — PCB Routing**
  - [Task 18: PCB Routing Automation & Guidance](#task-18-pcb-routing)
- **Phase 3 — PC Companion Software**
  - [Task 19: Electron App Scaffolding](#task-19-electron-app-scaffolding)
  - [Task 20: USB HID Communication Layer](#task-20-usb-hid-communication-layer)
  - [Task 21: BLE Communication Layer](#task-21-ble-communication-layer)
  - [Task 22: Key Remapping UI](#task-22-key-remapping-ui)
  - [Task 23: Macro Editor](#task-23-macro-editor)
  - [Task 24: RGB LED Control](#task-24-rgb-led-control)
  - [Task 25: Profile Management](#task-25-profile-management)

---

## Design Decisions & Rationale

### MCU: nRF52840 (not STM32)

**Why:** The nRF52840 has native USB 2.0 + BLE 5.0 on a single chip. STM32 would require a separate BLE module (eg HC-05 or ESP32), adding complexity, cost, and board space. The nRF52840 is the de-facto standard for wireless keyboards (used by nice!nano, nRFMicro, Seeed XIAO BLE).

- Native USB 2.0 Full Speed — no external USB PHY needed
- BLE 5.0 with excellent power management — critical for battery life
- Well-supported by ZMK (Zephyr RTOS) and has growing QMK support
- Available as drop-in modules (nice!nano, XIAO BLE nRF52840) or raw chips for custom PCB
- 256KB RAM, 1MB flash — more than enough for keyboard firmware + macro storage

**Module recommendation:** nice!nano v2 for prototyping, raw nRF52840-QIAA for production PCB.

### Firmware: ZMK (not QMK)

**Why:** QMK has poor/no native Bluetooth support. ZMK was built from the ground up for wireless keyboards on Zephyr RTOS, with first-class nRF52840 support.

- Native BLE with multi-device pairing (switch between 5 paired devices)
- USB + BLE dual-mode (auto-switches when USB cable is connected)
- Power management built-in (deep sleep, idle timeouts)
- Devicetree-based configuration — declarative, versionable
- ZMK Studio provides web-based runtime remapping over USB and BLE
- Growing ecosystem; supports custom behaviors, macros, combos, layers

### Dual Switch Support Strategy

The keyboard supports two switch types with different PCB requirements:

1. **Low-profile mechanical** (Kailh Choc v1/v2, Gateron Low Profile): through-hole/SMD hybrid footprints, standard 18x17mm spacing, hot-swap socket compatible
2. **Cherry MX Ultra Low Profile (ULP)**: pure SMD, requires reflow soldering, custom footprint from [pashutk/Cherry_MX_ULP](https://github.com/pashutk/Cherry_MX_ULP), different pitch

**Approach:** The config-driven pipeline selects the appropriate footprint library based on the user's switch choice. The electrical matrix (diode + switch per key) stays identical — only the physical footprint changes. For ULP, the toolchain flags design concerns (no hot-swap, reflow required, SLA keycaps needed).

### Layout

Starting layout from KLE gist `a7c6cae098574d8fd875695135bce055` ("Blue Dream Space"):
- ~75% layout with function row, ISO-style Enter
- Right-side macro column (A1, A2, A3 — media controls, per-app macros)
- Navigation cluster (del/ins, home/PgUp, end/PgDn), arrow keys
- CHICKLET profile keycaps

The toolchain accepts any KLE JSON, so the layout is fully replaceable via CLI flag or interactive prompt.

---

## Config-Driven Architecture

The entire toolchain is driven by a single `BuildConfig` JSON file. This file can be:
1. **Generated interactively** by the CLI wizard (prompts the user for each choice)
2. **Passed directly** via `--config <path>` flag (skips answered questions, prompts for missing ones)
3. **Edited manually** by the user in any text editor

### Example BuildConfig JSON Schema

```json
{
  "$schema": "./data/schemas/build-config.schema.json",
  "project": {
    "name": "blue-dream-space",
    "version": "1.0.0",
    "author": "Ryan Weiss"
  },
  "layout": {
    "source": "file",
    "path": "./layouts/blue-dream-space.json",
    "kleUrl": null
  },
  "switches": {
    "type": "choc_v1",
    "model": "kailh-choc-brown",
    "hotswap": true
  },
  "mcu": {
    "type": "nrf52840",
    "module": "nice_nano_v2",
    "gpioAvailable": 21
  },
  "connectivity": {
    "usb": true,
    "bluetooth": true,
    "bluetoothVersion": "5.0"
  },
  "power": {
    "battery": true,
    "batteryType": "lipo",
    "batteryCapacityMah": 2000,
    "chargerIc": "mcp73831",
    "chargeCurrentMa": 500
  },
  "features": {
    "rgbPerKey": false,
    "rgbUnderglow": false,
    "underglow": {
      "ledCount": 0,
      "ledModel": null
    },
    "rotaryEncoder": false,
    "oledDisplay": false
  },
  "diode": {
    "model": "1n4148w",
    "package": "SOD-123",
    "direction": "col2row"
  },
  "usbConnector": {
    "model": "gct-usb4085",
    "type": "usb-c-2.0"
  },
  "esdProtection": {
    "model": "usblc6-2sc6",
    "package": "SOT-23-6"
  },
  "pcb": {
    "layers": 2,
    "thickness": 1.6,
    "routing": "auto",
    "fabricator": null
  },
  "plate": {
    "enabled": true,
    "material": "aluminum",
    "thickness": 1.5
  },
  "firmware": {
    "type": "zmk",
    "features": ["bluetooth", "usb", "deep-sleep"]
  },
  "outputs": {
    "schematic": true,
    "pcb": true,
    "gerbers": true,
    "plate": true,
    "bom": true,
    "firmware": true
  }
}
```

---

## Project File Structure

```
Keyboard/
├── CLAUDE.md
├── docs/
│   ├── Keyboard_Design.md
│   ├── Keyboard_Parts_Resources.md
│   ├── Keyboard_Software_Resources.md
│   └── TODO.md
│
├── layouts/                          (KLE layout files)
│   ├── blue-dream-space.json
│   └── README.md
│
├── data/                             (component database — curated JSON catalogs)
│   ├── schemas/
│   │   └── build-config.schema.json  (JSON Schema for BuildConfig validation)
│   ├── switches/
│   │   ├── kailh-choc-v1.json        (Choc v1 variants: brown, red, white, etc.)
│   │   ├── kailh-choc-v2.json
│   │   ├── cherry-mx-ulp.json
│   │   ├── gateron-low-profile.json
│   │   └── cherry-mx.json            (standard MX for completeness)
│   ├── mcus/
│   │   ├── nice-nano-v2.json
│   │   ├── xiao-ble-nrf52840.json
│   │   ├── supermini-nrf52840.json
│   │   ├── holyiot-18010.json
│   │   └── custom-nrf52840-qiaa.json
│   ├── connectors/
│   │   ├── gct-usb4085.json
│   │   ├── hro-type-c-31-m-12.json
│   │   └── jst-ph-2pin.json          (battery connector)
│   ├── diodes/
│   │   ├── 1n4148w-sod123.json
│   │   └── 1n4148ws-sod323.json
│   ├── chargers/
│   │   ├── mcp73831.json
│   │   ├── tp4056.json
│   │   └── bq24075.json
│   ├── esd/
│   │   ├── usblc6-2sc6.json
│   │   └── tpd4e05u06.json
│   ├── leds/
│   │   ├── sk6812-mini-e.json
│   │   └── ws2812b-mini.json
│   └── batteries/
│       ├── lipo-500mah.json
│       ├── lipo-1000mah.json
│       └── lipo-2000mah.json
│
├── tools/                            (Node.js toolchain — publishable as @keyboard-maker/tools)
│   ├── package.json
│   ├── tsconfig.json
│   ├── bin/
│   │   └── keyboard-maker.ts         (CLI entry — `npx keyboard-maker`)
│   ├── src/
│   │   ├── cli/
│   │   │   ├── wizard.ts             (interactive prompt wizard using inquirer)
│   │   │   ├── commands.ts           (commander command definitions)
│   │   │   ├── prompts/
│   │   │   │   ├── layout.ts         (layout source prompts)
│   │   │   │   ├── switches.ts       (switch selection prompts)
│   │   │   │   ├── mcu.ts            (MCU/module selection prompts)
│   │   │   │   ├── connectivity.ts   (USB/BLE prompts)
│   │   │   │   ├── power.ts          (battery/charger prompts)
│   │   │   │   ├── features.ts       (RGB, encoder, display prompts)
│   │   │   │   ├── pcb.ts            (PCB options prompts)
│   │   │   │   ├── outputs.ts        (output file selection with checkboxes)
│   │   │   │   └── confirm.ts        (final confirmation screen)
│   │   │   └── data-loader.ts        (reads data/ JSON catalogs for prompt choices)
│   │   ├── config/
│   │   │   ├── schema.ts             (BuildConfig TypeScript types)
│   │   │   ├── validator.ts          (validate + merge config with defaults)
│   │   │   └── config.test.ts
│   │   ├── kle-parser/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   └── kle-parser.test.ts
│   │   ├── matrix-generator/
│   │   │   ├── index.ts
│   │   │   └── matrix-generator.test.ts
│   │   ├── kicad-generator/
│   │   │   ├── sexpr.ts              (S-expression writer/reader)
│   │   │   ├── schematic.ts          (config + matrix → .kicad_sch)
│   │   │   ├── pcb.ts               (config + layout → .kicad_pcb)
│   │   │   ├── footprints.ts        (selects footprint by config.switches.type)
│   │   │   ├── symbols.ts
│   │   │   ├── gerber-export.ts     (calls KiCad CLI for gerber export)
│   │   │   ├── sexpr.test.ts
│   │   │   ├── schematic.test.ts
│   │   │   └── pcb.test.ts
│   │   ├── routing/
│   │   │   ├── index.ts             (routing orchestrator)
│   │   │   ├── freerouter.ts        (Freerouting integration)
│   │   │   ├── dsn-exporter.ts      (KiCad PCB → Specctra DSN for Freerouting)
│   │   │   ├── ses-importer.ts      (Freerouting SES → KiCad PCB traces)
│   │   │   └── routing.test.ts
│   │   ├── plate-generator/
│   │   │   ├── index.ts
│   │   │   └── plate-generator.test.ts
│   │   ├── firmware-generator/
│   │   │   ├── index.ts
│   │   │   ├── zmk-templates.ts
│   │   │   └── firmware-generator.test.ts
│   │   ├── bom-generator/
│   │   │   ├── index.ts             (reads config + data/ → BOM)
│   │   │   └── bom-generator.test.ts
│   │   ├── build/
│   │   │   ├── orchestrator.ts      (runs all generators in order, writes output)
│   │   │   └── orchestrator.test.ts
│   │   └── shared/
│   │       ├── types.ts
│   │       └── constants.ts
│   └── templates/
│       ├── zmk/
│       │   ├── board.overlay.ejs
│       │   ├── keymap.ejs
│       │   └── config.ejs
│       └── kicad/
│           ├── header.ejs
│           └── mcu-subcircuit.ejs
│
├── scripts/                          (standalone utility scripts)
│   ├── setup.sh                      (install all prerequisites: KiCad, Freerouting, Zephyr, etc.)
│   ├── setup-check.sh                (verify prerequisites are installed)
│   └── README.md
│
├── hardware/                         (reference KiCad libraries — not build output)
│   ├── libraries/
│   │   ├── keyboard.kicad_sym
│   │   └── keyboard.pretty/
│   │       ├── Kailh_Choc_v1.kicad_mod
│   │       ├── Kailh_Choc_v1_Hotswap.kicad_mod
│   │       ├── Cherry_MX_ULP.kicad_mod
│   │       ├── Cherry_MX.kicad_mod
│   │       ├── nRF52840_Module_NiceNano.kicad_mod
│   │       ├── nRF52840_Module_XIAO.kicad_mod
│   │       ├── nRF52840_QFN73.kicad_mod
│   │       ├── USB_C_GCT_USB4085.kicad_mod
│   │       └── JST_PH_2pin.kicad_mod
│   └── 3d-models/                    (optional .step/.wrl files for 3D preview)
│
├── firmware/                         (ZMK firmware workspace)
│   ├── config/
│   │   └── boards/shields/           (generated shield configs land here)
│   ├── build.sh
│   └── flash.sh
│
├── companion-app/                    (Phase 3 — Electron + React)
│   └── ...
│
└── builds/                           (output directory — one folder per build)
    └── <project-name>-<timestamp>/
        ├── build-config.json         (the config used for this build)
        ├── layout.json               (copy of KLE file used)
        ├── keyboard.kicad_pro
        ├── keyboard.kicad_sch
        ├── keyboard.kicad_pcb
        ├── keyboard-routed.kicad_pcb (after routing stage)
        ├── gerbers/
        │   ├── keyboard-F_Cu.gbr
        │   ├── keyboard-B_Cu.gbr
        │   ├── keyboard-Edge_Cuts.gbr
        │   ├── keyboard.drl
        │   └── ...
        ├── plate.dxf
        ├── BOM.md
        ├── BOM.csv
        ├── firmware/
        │   ├── blue_dream.overlay
        │   ├── blue_dream.keymap
        │   ├── blue_dream.conf
        │   └── blue_dream.zmk.yml
        ├── design-notes.md           (auto-generated warnings/flags)
        └── build-log.txt
```

---

## Component Database Design (`data/`)

Each component category lives in `data/<category>/`. Each JSON file describes one component family or model with everything the generators need:

### Example: `data/switches/kailh-choc-v1.json`

```json
{
  "id": "kailh-choc-v1",
  "name": "Kailh Choc v1 (PG1350)",
  "manufacturer": "Kailh",
  "type": "low-profile-mechanical",
  "mounting": "through-hole",
  "hotswapCompatible": true,
  "hotswapSocket": "kailh-cpg135001s30",
  "pinSpacing": 5.5,
  "switchSpacing": { "x": 18, "y": 17 },
  "travelDistance": 3.0,
  "actuationForce": null,
  "keycapMount": "choc",
  "footprintFile": "Kailh_Choc_v1.kicad_mod",
  "hotswapFootprintFile": "Kailh_Choc_v1_Hotswap.kicad_mod",
  "symbolRef": "Switch:SW_Push",
  "datasheet": "https://www.kailhswitch.com/...",
  "variants": [
    {
      "id": "kailh-choc-brown",
      "name": "Kailh Choc Brown (Tactile)",
      "actuationForce": 60,
      "tactile": true,
      "clicky": false,
      "suppliers": [
        { "name": "AliExpress", "url": "https://...", "priceUsd": 0.35 },
        { "name": "MKUltra", "url": "https://...", "priceUsd": 0.55 }
      ]
    },
    {
      "id": "kailh-choc-red",
      "name": "Kailh Choc Red (Linear)",
      "actuationForce": 50,
      "tactile": false,
      "clicky": false,
      "suppliers": [
        { "name": "AliExpress", "url": "https://...", "priceUsd": 0.30 }
      ]
    }
  ],
  "designNotes": [
    "Standard Choc spacing (18x17mm) is tighter than MX (19.05mm)",
    "Ensure keycap compatibility — Choc keycaps are NOT interchangeable with MX"
  ]
}
```

### Example: `data/mcus/nice-nano-v2.json`

```json
{
  "id": "nice-nano-v2",
  "name": "nice!nano v2",
  "chip": "nRF52840",
  "formFactor": "pro-micro",
  "hasUsb": true,
  "hasBle": true,
  "bleVersion": "5.0",
  "hasLipoCharger": true,
  "chargerMaxMa": 100,
  "gpioCount": 21,
  "gpioPins": [
    { "pin": "P0.06", "label": "D0" },
    { "pin": "P0.08", "label": "D1" },
    { "pin": "P0.17", "label": "D2" },
    { "pin": "P0.20", "label": "D3" },
    { "pin": "P0.22", "label": "D4" },
    { "pin": "P0.24", "label": "D5" },
    { "pin": "P1.00", "label": "D6" },
    { "pin": "P0.11", "label": "D7" },
    { "pin": "P1.04", "label": "D8" },
    { "pin": "P1.06", "label": "D9" },
    { "pin": "P0.09", "label": "D10" },
    { "pin": "P0.10", "label": "D16" },
    { "pin": "P1.11", "label": "D14" },
    { "pin": "P1.13", "label": "D15" },
    { "pin": "P0.02", "label": "D18/A0" },
    { "pin": "P0.03", "label": "D19/A1" },
    { "pin": "P0.28", "label": "D20/A2" },
    { "pin": "P0.29", "label": "D21/A3" },
    { "pin": "P0.30", "label": "D22/A4" },
    { "pin": "P0.31", "label": "D23/A5" },
    { "pin": "P0.13", "label": "D24" }
  ],
  "footprintFile": "nRF52840_Module_NiceNano.kicad_mod",
  "zmkBoard": "nice_nano_v2",
  "suppliers": [
    { "name": "nice!keyboards", "url": "https://nicekeyboards.com/nice-nano", "priceUsd": 25.00 },
    { "name": "Typeractive", "url": "https://typeractive.xyz", "priceUsd": 25.00 }
  ],
  "designNotes": [
    "Built-in LiPo charger at 100mA — suitable for <1000mAh batteries",
    "Pro Micro footprint — drop-in replacement for Pro Micro-based designs",
    "No external crystal needed — on-module"
  ]
}
```

The `data-loader.ts` module reads these files at CLI startup and presents them as selectable options in the interactive prompts.

---

## Phase 1 — Config-Driven Toolchain & Hardware Generation

---

### Task 1: Project Scaffolding & Shared Types

**Files:**
- Create: `tools/package.json`
- Create: `tools/tsconfig.json`
- Create: `tools/src/shared/types.ts`
- Create: `tools/src/shared/constants.ts`
- Create: `layouts/blue-dream-space.json`
- Create: `layouts/README.md`

- [ ] **Step 1: Initialize Node.js project**

```bash
cd tools && npm init -y
```

Set up `package.json`:
```json
{
  "name": "@keyboard-maker/tools",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "keyboard-maker": "./bin/keyboard-maker.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "start": "tsx bin/keyboard-maker.ts",
    "wizard": "tsx bin/keyboard-maker.ts wizard",
    "generate": "tsx bin/keyboard-maker.ts generate"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install typescript tsx vitest @types/node commander @inquirer/prompts chalk ora dxf-writer ejs ajv glob --save
npm install @types/ejs --save-dev
```

Key dependencies:
- `commander` — CLI command/flag parsing
- `@inquirer/prompts` — interactive prompts (select, checkbox, input, confirm)
- `chalk` — colored terminal output
- `ora` — spinners for long operations
- `ajv` — JSON Schema validation for BuildConfig
- `dxf-writer` — DXF plate generation
- `ejs` — template rendering for firmware configs

- [ ] **Step 3: Create tsconfig.json**

- [ ] **Step 4: Define core shared types**

Create `tools/src/shared/types.ts` — the canonical data model. Includes `Key`, `KeyboardLayout`, `MatrixPosition`, `SwitchMatrix`, `SwitchType`, and the full `BuildConfig` interface matching the JSON schema above.

- [ ] **Step 5: Define constants**

Create `tools/src/shared/constants.ts` — switch spacing, trace widths, GPIO limits, unit conversions.

- [ ] **Step 6: Save KLE layout JSON and README**

- [ ] **Step 7: Commit**

```bash
git add tools/ layouts/
git commit -m "feat: project scaffolding with shared types, constants, and default layout"
```

---

### Task 2: Component Database

**Files:**
- Create: `data/schemas/build-config.schema.json`
- Create: `data/switches/kailh-choc-v1.json`
- Create: `data/switches/kailh-choc-v2.json`
- Create: `data/switches/cherry-mx-ulp.json`
- Create: `data/switches/gateron-low-profile.json`
- Create: `data/switches/cherry-mx.json`
- Create: `data/mcus/nice-nano-v2.json`
- Create: `data/mcus/xiao-ble-nrf52840.json`
- Create: `data/mcus/supermini-nrf52840.json`
- Create: `data/mcus/holyiot-18010.json`
- Create: `data/mcus/custom-nrf52840-qiaa.json`
- Create: `data/connectors/gct-usb4085.json`
- Create: `data/connectors/hro-type-c-31-m-12.json`
- Create: `data/connectors/jst-ph-2pin.json`
- Create: `data/diodes/1n4148w-sod123.json`
- Create: `data/diodes/1n4148ws-sod323.json`
- Create: `data/chargers/mcp73831.json`
- Create: `data/chargers/tp4056.json`
- Create: `data/chargers/bq24075.json`
- Create: `data/esd/usblc6-2sc6.json`
- Create: `data/leds/sk6812-mini-e.json`
- Create: `data/leds/ws2812b-mini.json`
- Create: `data/batteries/lipo-500mah.json`
- Create: `data/batteries/lipo-1000mah.json`
- Create: `data/batteries/lipo-2000mah.json`

- [ ] **Step 1: Create JSON Schema for BuildConfig**

Create `data/schemas/build-config.schema.json` — a full JSON Schema (draft-07) that validates the BuildConfig structure. This allows external editors to provide autocomplete and validation.

- [ ] **Step 2: Create switch component files**

Each file follows the structure shown in the Component Database Design section above. Include:
- Electrical specs (pin spacing, footprint reference)
- Mechanical specs (travel, actuation force, mounting type)
- Supplier links and prices
- Design notes (warnings, compatibility info)
- Variants (colors/tactility for switch families)

- [ ] **Step 3: Create MCU module files**

Include full GPIO pin maps (critical for schematic/firmware generation), form factor, charging capabilities, ZMK board name.

- [ ] **Step 4: Create remaining component files**

Connectors, diodes, charger ICs, ESD protection, LEDs, batteries.

- [ ] **Step 5: Create data loader utility**

Create `tools/src/cli/data-loader.ts`:

```typescript
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const DATA_DIR = resolve(__dirname, '../../../data');

export interface ComponentOption {
  id: string;
  name: string;
  description: string;
  data: Record<string, unknown>;
}

/** Load all components from a data category directory */
export function loadCategory(category: string): ComponentOption[] {
  const dir = join(DATA_DIR, category);
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    return {
      id: data.id,
      name: data.name,
      description: data.designNotes?.[0] ?? '',
      data,
    };
  });
}

/** Load a specific component by category and ID */
export function loadComponent(category: string, id: string): Record<string, unknown> | null {
  const options = loadCategory(category);
  return options.find(o => o.id === id)?.data ?? null;
}

/** Get all switch variant options (flattened from switch families) */
export function loadSwitchVariants(): ComponentOption[] {
  const families = loadCategory('switches');
  const variants: ComponentOption[] = [];
  for (const family of families) {
    const d = family.data as any;
    if (d.variants) {
      for (const v of d.variants) {
        variants.push({
          id: v.id,
          name: `${d.name} — ${v.name}`,
          description: `${v.actuationForce}g, ${v.tactile ? 'tactile' : 'linear'}${v.clicky ? ', clicky' : ''}`,
          data: { ...d, ...v, familyId: d.id },
        });
      }
    } else {
      variants.push(family);
    }
  }
  return variants;
}
```

- [ ] **Step 6: Write tests for data loader**

Verify all JSON files parse correctly, all required fields are present, all referenced footprint files exist.

- [ ] **Step 7: Commit**

```bash
git add data/ tools/src/cli/data-loader.ts
git commit -m "feat: component database with switches, MCUs, connectors, and data loader"
```

---

### Task 3: Build Config Schema & Validator

**Files:**
- Create: `tools/src/config/schema.ts`
- Create: `tools/src/config/validator.ts`
- Create: `tools/src/config/defaults.ts`
- Create: `tools/src/config/config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { validateConfig, mergeWithDefaults } from './validator.js';

describe('Config Validator', () => {
  it('rejects config missing required layout field', () => {
    const result = validateConfig({ project: { name: 'test' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(expect.stringContaining('layout'));
  });

  it('accepts a minimal valid config', () => {
    const result = validateConfig({
      project: { name: 'test' },
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'choc_v1', model: 'kailh-choc-brown' },
    });
    expect(result.valid).toBe(true);
  });

  it('merges partial config with defaults', () => {
    const merged = mergeWithDefaults({
      project: { name: 'test' },
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'choc_v1', model: 'kailh-choc-brown' },
    });
    expect(merged.mcu.module).toBe('nice_nano_v2'); // default
    expect(merged.connectivity.bluetooth).toBe(true); // default
    expect(merged.diode.model).toBe('1n4148w'); // default
  });

  it('lists missing fields that need prompting', () => {
    const result = validateConfig({ project: { name: 'test' } });
    expect(result.missingFields).toContain('layout');
    expect(result.missingFields).toContain('switches');
  });
});
```

- [ ] **Step 2: Implement validator**

`validator.ts`:
- Uses `ajv` to validate against `data/schemas/build-config.schema.json`
- Returns `{ valid, errors, missingFields }` — missingFields tells the wizard which prompts to show
- `mergeWithDefaults()` fills in sensible defaults for any unset optional fields

`defaults.ts`:
- Default config values (nice_nano_v2, 1N4148W diodes, GCT USB4085, MCP73831, etc.)

- [ ] **Step 3: Implement design flagging**

Add `flagDesignConcerns(config: BuildConfig): DesignNote[]` that checks for issues:
- ULP switches selected → warn about reflow soldering, no hot-swap, SLA keycaps
- Matrix size exceeds GPIO count → error
- RGB per-key + battery → warn about power draw
- Custom nRF52840 chip → warn about antenna design complexity
- Battery >1000mAh + charger at 100mA → warn about long charge times

- [ ] **Step 4: Run tests and commit**

```bash
cd tools && npx vitest run src/config/
git add tools/src/config/
git commit -m "feat: build config schema, validator, defaults, and design concern flagging"
```

---

### Task 4: Interactive CLI Wizard

**Files:**
- Create: `tools/bin/keyboard-maker.ts`
- Create: `tools/src/cli/wizard.ts`
- Create: `tools/src/cli/commands.ts`
- Create: `tools/src/cli/prompts/layout.ts`
- Create: `tools/src/cli/prompts/switches.ts`
- Create: `tools/src/cli/prompts/mcu.ts`
- Create: `tools/src/cli/prompts/connectivity.ts`
- Create: `tools/src/cli/prompts/power.ts`
- Create: `tools/src/cli/prompts/features.ts`
- Create: `tools/src/cli/prompts/pcb.ts`
- Create: `tools/src/cli/prompts/outputs.ts`
- Create: `tools/src/cli/prompts/confirm.ts`

This is the main user-facing tool. The wizard walks through every build decision interactively, or skips questions answered by `--config` or CLI flags.

- [ ] **Step 1: Create CLI entry point**

`tools/bin/keyboard-maker.ts`:
```typescript
#!/usr/bin/env tsx
import { program } from 'commander';
import { runWizard } from '../src/cli/wizard.js';
import { runGenerate } from '../src/cli/commands.js';

program
  .name('keyboard-maker')
  .description('Interactive keyboard design & build toolchain')
  .version('0.1.0');

program
  .command('wizard')
  .description('Interactive wizard — walk through all build options step by step')
  .option('--kle-file <path>', 'Pre-set KLE layout file (skips layout prompt)')
  .option('--kle-url <url>', 'KLE gist URL to download layout from')
  .option('-c, --config <path>', 'Partial or full config file (skips answered questions)')
  .option('-o, --output <dir>', 'Output directory for build files', './builds')
  .action(runWizard);

program
  .command('generate')
  .description('Generate build files from a complete config (no prompts)')
  .requiredOption('-c, --config <path>', 'Path to complete build-config.json')
  .option('-o, --output <dir>', 'Output directory', './builds')
  .action(runGenerate);

program
  .command('validate')
  .description('Validate a config file and show design concerns')
  .requiredOption('-c, --config <path>', 'Path to build-config.json')
  .action(async (opts) => {
    // Load, validate, flag concerns, print report
  });

program
  .command('list-components')
  .description('List available components in the database')
  .option('-t, --type <category>', 'Component category (switches, mcus, connectors, etc.)')
  .action(async (opts) => {
    // Load and display component catalog
  });

program.parse();
```

- [ ] **Step 2: Implement layout prompts**

`tools/src/cli/prompts/layout.ts`:
```typescript
import { select, input } from '@inquirer/prompts';
import { existsSync } from 'fs';

export async function promptLayout(presetFile?: string, presetUrl?: string) {
  // If --kle-file was passed, use it directly
  if (presetFile) {
    if (!existsSync(presetFile)) {
      throw new Error(`KLE file not found: ${presetFile}`);
    }
    return { source: 'file' as const, path: presetFile, kleUrl: null };
  }

  if (presetUrl) {
    return { source: 'url' as const, path: null, kleUrl: presetUrl };
  }

  const source = await select({
    message: 'How would you like to provide your keyboard layout?',
    choices: [
      { name: 'Local KLE JSON file', value: 'file', description: 'Path to a .json file exported from keyboard-layout-editor.com' },
      { name: 'KLE gist URL', value: 'url', description: 'Paste a keyboard-layout-editor.com permalink' },
      { name: 'Start from a template', value: 'template', description: 'Choose from built-in layout templates (60%, 65%, 75%, TKL)' },
    ],
  });

  if (source === 'file') {
    const path = await input({
      message: 'Path to KLE JSON file:',
      validate: (v) => existsSync(v) || `File not found: ${v}`,
    });
    return { source, path, kleUrl: null };
  }

  if (source === 'url') {
    const kleUrl = await input({
      message: 'KLE gist URL (e.g. https://www.keyboard-layout-editor.com/#/gists/...):',
      validate: (v) => v.includes('keyboard-layout-editor') || v.includes('gist') || 'Enter a valid KLE URL',
    });
    return { source, path: null, kleUrl };
  }

  // template selection...
  const template = await select({
    message: 'Select a layout template:',
    choices: [
      { name: '60% (61 keys)', value: '60pct' },
      { name: '65% (68 keys)', value: '65pct' },
      { name: '75% (84 keys)', value: '75pct' },
      { name: 'TKL (87 keys)', value: 'tkl' },
      { name: 'Blue Dream Space (83 keys, default)', value: 'blue-dream-space' },
    ],
  });
  return { source: 'template' as const, path: `./layouts/${template}.json`, kleUrl: null };
}
```

- [ ] **Step 3: Implement switch prompts**

`tools/src/cli/prompts/switches.ts`:
```typescript
import { select, confirm } from '@inquirer/prompts';
import { loadCategory, loadSwitchVariants } from '../data-loader.js';

export async function promptSwitches() {
  const families = loadCategory('switches');

  const familyId = await select({
    message: 'Select switch type:',
    choices: families.map(f => ({
      name: f.name,
      value: f.id,
      description: f.description,
    })),
  });

  const family = families.find(f => f.id === familyId)!;
  const familyData = family.data as any;

  let modelId = familyId;
  if (familyData.variants?.length > 1) {
    modelId = await select({
      message: 'Select switch variant:',
      choices: familyData.variants.map((v: any) => ({
        name: v.name,
        value: v.id,
        description: `${v.actuationForce}g, ${v.tactile ? 'tactile' : 'linear'}`,
      })),
    });
  }

  let hotswap = false;
  if (familyData.hotswapCompatible) {
    hotswap = await confirm({
      message: 'Use hot-swap sockets? (allows switch replacement without soldering)',
      default: true,
    });
  } else {
    console.log(chalk.yellow(`  Note: ${family.name} does not support hot-swap sockets.`));
  }

  return {
    type: familyData.id.replace(/-/g, '_'),
    model: modelId,
    hotswap,
  };
}
```

- [ ] **Step 4: Implement MCU, connectivity, power, features, PCB prompts**

Each file follows the same pattern:
- Load options from `data/` directory
- Present choices with descriptions
- Return the relevant config section

Key prompts:
- **MCU:** select module → auto-populates GPIO count, ZMK board name
- **Connectivity:** USB always on, toggle Bluetooth
- **Power:** if BLE → ask battery type/capacity, charger IC
- **Features:** toggles for RGB per-key, underglow, rotary encoder, OLED
- **PCB:** layer count (2/4), thickness, routing mode (auto/manual/guided)

- [ ] **Step 5: Implement output selection prompt**

`tools/src/cli/prompts/outputs.ts`:
```typescript
import { checkbox } from '@inquirer/prompts';

export async function promptOutputs() {
  const outputs = await checkbox({
    message: 'Select which files to generate:',
    choices: [
      { name: 'Bill of Materials (BOM.md + BOM.csv)', value: 'bom', checked: true },
      { name: 'KiCad Schematic (.kicad_sch)', value: 'schematic', checked: true },
      { name: 'KiCad PCB Layout (.kicad_pcb)', value: 'pcb', checked: true },
      { name: 'Gerber Files (for PCB fabrication)', value: 'gerbers', checked: true },
      { name: 'Switch Plate DXF (for laser cutting)', value: 'plate', checked: true },
      { name: 'ZMK Firmware Config', value: 'firmware', checked: true },
      { name: 'Design Notes & Warnings', value: 'notes', checked: true },
    ],
  });

  return {
    bom: outputs.includes('bom'),
    schematic: outputs.includes('schematic'),
    pcb: outputs.includes('pcb'),
    gerbers: outputs.includes('gerbers'),
    plate: outputs.includes('plate'),
    firmware: outputs.includes('firmware'),
    notes: outputs.includes('notes'),
  };
}
```

- [ ] **Step 6: Implement confirmation screen**

`tools/src/cli/prompts/confirm.ts`:
```typescript
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type { BuildConfig } from '../../config/schema.js';
import { flagDesignConcerns } from '../../config/validator.js';

export async function promptConfirm(config: BuildConfig): Promise<boolean> {
  console.log('\n' + chalk.bold.cyan('━━━ Build Configuration Summary ━━━'));
  console.log(`  Project:      ${config.project.name}`);
  console.log(`  Layout:       ${config.layout.path || config.layout.kleUrl}`);
  console.log(`  Switches:     ${config.switches.model} (${config.switches.hotswap ? 'hot-swap' : 'soldered'})`);
  console.log(`  MCU:          ${config.mcu.module} (${config.mcu.gpioAvailable} GPIOs)`);
  console.log(`  USB:          ${config.connectivity.usb ? 'Yes' : 'No'}`);
  console.log(`  Bluetooth:    ${config.connectivity.bluetooth ? 'Yes' : 'No'}`);
  if (config.power.battery) {
    console.log(`  Battery:      ${config.power.batteryCapacityMah}mAh ${config.power.batteryType}`);
    console.log(`  Charger:      ${config.power.chargerIc} @ ${config.power.chargeCurrentMa}mA`);
  }
  console.log(`  RGB:          ${config.features.rgbPerKey ? 'Per-key' : config.features.rgbUnderglow ? 'Underglow' : 'None'}`);
  console.log(`  PCB:          ${config.pcb.layers}-layer, ${config.pcb.thickness}mm`);
  console.log(`  Routing:      ${config.pcb.routing}`);

  // Show design concerns
  const concerns = flagDesignConcerns(config);
  if (concerns.length > 0) {
    console.log('\n' + chalk.bold.yellow('⚠  Design Notes:'));
    for (const note of concerns) {
      const icon = note.severity === 'error' ? chalk.red('✗') : chalk.yellow('!');
      console.log(`  ${icon} ${note.message}`);
    }
  }

  // Show output selection
  console.log('\n' + chalk.bold('  Output files:'));
  const outputs = config.outputs;
  if (outputs.schematic) console.log('    ✓ KiCad Schematic');
  if (outputs.pcb) console.log('    ✓ KiCad PCB Layout');
  if (outputs.gerbers) console.log('    ✓ Gerber Files');
  if (outputs.plate) console.log('    ✓ Switch Plate DXF');
  if (outputs.bom) console.log('    ✓ Bill of Materials');
  if (outputs.firmware) console.log('    ✓ ZMK Firmware Config');

  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  // Block on errors
  const errors = concerns.filter(c => c.severity === 'error');
  if (errors.length > 0) {
    console.log(chalk.red('\nCannot proceed — fix the errors above first.'));
    return false;
  }

  return confirm({ message: 'Proceed with generation?', default: true });
}
```

- [ ] **Step 7: Implement the wizard orchestrator**

`tools/src/cli/wizard.ts`:
```typescript
import { promptLayout } from './prompts/layout.js';
import { promptSwitches } from './prompts/switches.js';
import { promptMcu } from './prompts/mcu.js';
import { promptConnectivity } from './prompts/connectivity.js';
import { promptPower } from './prompts/power.js';
import { promptFeatures } from './prompts/features.js';
import { promptPcb } from './prompts/pcb.js';
import { promptOutputs } from './prompts/outputs.js';
import { promptConfirm } from './prompts/confirm.js';
import { validateConfig, mergeWithDefaults } from '../config/validator.js';
import { runBuild } from '../build/orchestrator.js';
import { readFileSync, writeFileSync } from 'fs';

export async function runWizard(opts: {
  kleFile?: string;
  kleUrl?: string;
  config?: string;
  output: string;
}) {
  console.log(chalk.bold.cyan('\n🎹 Keyboard Maker — Interactive Build Wizard\n'));

  // Load partial config if provided
  let partial: Partial<BuildConfig> = {};
  if (opts.config) {
    partial = JSON.parse(readFileSync(opts.config, 'utf-8'));
    console.log(chalk.dim(`  Loaded config from ${opts.config}`));
    const validation = validateConfig(partial);
    if (validation.missingFields.length > 0) {
      console.log(chalk.dim(`  Missing fields: ${validation.missingFields.join(', ')} — will prompt\n`));
    } else {
      console.log(chalk.green(`  Config is complete — skipping all prompts\n`));
    }
  }

  // Prompt for each section, skipping if already in config
  const layout = partial.layout ?? await promptLayout(opts.kleFile, opts.kleUrl);
  const switches = partial.switches ?? await promptSwitches();
  const mcu = partial.mcu ?? await promptMcu();
  const connectivity = partial.connectivity ?? await promptConnectivity();
  const power = partial.power ?? (connectivity.bluetooth ? await promptPower() : { battery: false });
  const features = partial.features ?? await promptFeatures();
  const pcb = partial.pcb ?? await promptPcb();
  const outputs = partial.outputs ?? await promptOutputs();

  const projectName = partial.project?.name ?? layout.path?.split('/').pop()?.replace('.json', '') ?? 'keyboard';

  // Assemble and validate full config
  const config = mergeWithDefaults({
    project: { name: projectName, version: '1.0.0', author: partial.project?.author ?? '' },
    layout, switches, mcu, connectivity, power, features, pcb, outputs,
  });

  // Show confirmation
  const proceed = await promptConfirm(config);
  if (!proceed) {
    console.log('Aborted.');
    return;
  }

  // Run the build
  await runBuild(config, opts.output);
}
```

- [ ] **Step 8: Implement the `generate` command (config-only, no prompts)**

`tools/src/cli/commands.ts`:
```typescript
export async function runGenerate(opts: { config: string; output: string }) {
  const config = JSON.parse(readFileSync(opts.config, 'utf-8'));
  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error('Config validation failed:');
    validation.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
  const merged = mergeWithDefaults(config);
  await runBuild(merged, opts.output);
}
```

- [ ] **Step 9: Test the wizard flow manually**

```bash
cd tools && npx tsx bin/keyboard-maker.ts wizard --kle-file ../layouts/blue-dream-space.json
```

- [ ] **Step 10: Commit**

```bash
git add tools/bin/ tools/src/cli/
git commit -m "feat: interactive CLI wizard with config-driven prompts and component database"
```

---

### Task 5: KLE Parser Library

**Files:**
- Create: `tools/src/kle-parser/index.ts`
- Create: `tools/src/kle-parser/types.ts`
- Create: `tools/src/kle-parser/kle-parser.test.ts`

Parses raw KLE JSON (array-of-arrays with inline metadata objects) into the canonical `KeyboardLayout` model. Also handles downloading from KLE gist URLs.

- [ ] **Step 1: Write failing tests**

Tests for: single key, x/y offsets, wide keys, ISO enter (secondary dims), rotation, full blue-dream-space layout parsing, unique key IDs, and gist URL extraction.

- [ ] **Step 2: Implement KLE parser**

Key logic: iterate rows, track cursor position (x/y), accumulate property objects before each key string, handle per-key vs carry-forward properties (rotation carries, width resets).

- [ ] **Step 3: Implement KLE URL downloader**

Add `downloadKLE(url: string): Promise<unknown[]>` that extracts the gist ID from a KLE URL and fetches the JSON via GitHub API.

- [ ] **Step 4: Run tests, commit**

```bash
cd tools && npx vitest run src/kle-parser/
git add tools/src/kle-parser/
git commit -m "feat: KLE JSON parser with URL download support"
```

---

### Task 6: Switch Matrix Generator

**Files:**
- Create: `tools/src/matrix-generator/index.ts`
- Create: `tools/src/matrix-generator/matrix-generator.test.ts`

Takes a `KeyboardLayout` + MCU GPIO count from config → produces an optimized `SwitchMatrix`. Groups keys by visual row, assigns columns, checks GPIO budget. Reads MCU GPIO count from the component database entry.

- [ ] **Step 1: Write failing tests**

Tests for: 2x3 grid, unique positions, wide keys (one matrix position), GPIO limit check, error on exceed.

- [ ] **Step 2: Implement matrix generator**

- [ ] **Step 3: Run tests, commit**

```bash
git add tools/src/matrix-generator/
git commit -m "feat: switch matrix generator with GPIO budget validation"
```

---

### Task 7: KiCad S-Expression Engine

**Files:**
- Create: `tools/src/kicad-generator/sexpr.ts`
- Create: `tools/src/kicad-generator/sexpr.test.ts`

Low-level utility for building, serializing, and parsing KiCad's S-expression file format. Used by both the schematic and PCB generators.

- [ ] **Step 1: Write tests**

Test serialization of simple expressions, nested expressions, string quoting, round-trip parse/serialize.

- [ ] **Step 2: Implement S-expression writer/reader**

- [ ] **Step 3: Run tests, commit**

```bash
git add tools/src/kicad-generator/sexpr.ts tools/src/kicad-generator/sexpr.test.ts
git commit -m "feat: KiCad S-expression serializer/parser"
```

---

### Task 8: KiCad Symbol & Footprint Libraries

**Files:**
- Create: `hardware/libraries/keyboard.kicad_sym`
- Create: `hardware/libraries/keyboard.pretty/Kailh_Choc_v1.kicad_mod`
- Create: `hardware/libraries/keyboard.pretty/Kailh_Choc_v1_Hotswap.kicad_mod`
- Create: `hardware/libraries/keyboard.pretty/Cherry_MX_ULP.kicad_mod`
- Create: `hardware/libraries/keyboard.pretty/Cherry_MX.kicad_mod`
- Create: `hardware/libraries/keyboard.pretty/nRF52840_Module_NiceNano.kicad_mod`
- Create: `hardware/libraries/keyboard.pretty/nRF52840_Module_XIAO.kicad_mod`
- Create: `hardware/libraries/keyboard.pretty/nRF52840_QFN73.kicad_mod`
- Create: `hardware/libraries/keyboard.pretty/USB_C_GCT_USB4085.kicad_mod`
- Create: `hardware/libraries/keyboard.pretty/JST_PH_2pin.kicad_mod`

Static library files defining actual pad geometry, pin positions, silkscreen outlines. The generators reference these by filename — the filename is stored in each component's `data/` JSON entry under `footprintFile`.

- [ ] **Step 1: Create Kailh Choc v1 footprints** (through-hole + hot-swap variant)
- [ ] **Step 2: Create Cherry MX ULP footprint** (SMD pads, from pashutk/Cherry_MX_ULP reference)
- [ ] **Step 3: Create Cherry MX footprint** (standard, for completeness)
- [ ] **Step 4: Create nRF52840 module footprints** (nice!nano, XIAO, bare QFN)
- [ ] **Step 5: Create connector footprints** (USB-C, JST)
- [ ] **Step 6: Create symbol library** with nRF52840, MCP73831, battery, ESD
- [ ] **Step 7: Commit**

```bash
git add hardware/
git commit -m "feat: KiCad symbol and footprint libraries for all supported components"
```

---

### Task 9: KiCad Schematic Generator

**Files:**
- Create: `tools/src/kicad-generator/symbols.ts`
- Create: `tools/src/kicad-generator/schematic.ts`
- Create: `tools/src/kicad-generator/schematic.test.ts`

Generates `.kicad_sch` from `BuildConfig` + `SwitchMatrix`. Reads component references from `data/` entries. Includes: switch+diode pairs, MCU with net connections, USB-C, ESD, battery management (if BLE), voltage regulator, decoupling caps.

- [ ] **Step 1: Create symbol template functions** (reference component data from config)
- [ ] **Step 2: Write schematic generator tests**
- [ ] **Step 3: Implement schematic generator**
- [ ] **Step 4: Run tests, commit**

---

### Task 10: KiCad PCB Layout Generator

**Files:**
- Create: `tools/src/kicad-generator/footprints.ts`
- Create: `tools/src/kicad-generator/pcb.ts`
- Create: `tools/src/kicad-generator/pcb.test.ts`

Generates `.kicad_pcb` with physical switch placement from KLE positions, converted to mm using the spacing from the selected switch type's `data/` entry. Selects footprint file based on `config.switches.type`.

- [ ] **Step 1: Implement footprint placement** (reads footprintFile from component data)
- [ ] **Step 2: Implement PCB generator** with board outline, nets, MCU/connector placement
- [ ] **Step 3: Write tests, commit**

---

### Task 11: Plate & Case Generator

**Files:**
- Create: `tools/src/plate-generator/index.ts`
- Create: `tools/src/plate-generator/plate-generator.test.ts`

Generates DXF for laser cutting. Switch cutout dimensions come from the component database (switch spacing varies per type). Includes stabilizer cutouts for wide keys, mounting holes, board outline.

- [ ] **Step 1: Write tests**
- [ ] **Step 2: Implement plate generator**
- [ ] **Step 3: Run tests, commit**

---

### Task 12: ZMK Firmware Config Generator

**Files:**
- Create: `tools/src/firmware-generator/index.ts`
- Create: `tools/src/firmware-generator/zmk-templates.ts`
- Create: `tools/src/firmware-generator/firmware-generator.test.ts`
- Create: `tools/templates/zmk/board.overlay.ejs`
- Create: `tools/templates/zmk/keymap.ejs`
- Create: `tools/templates/zmk/config.ejs`

Generates ZMK shield files from config + matrix. Reads GPIO pin map from the MCU's `data/` entry to assign matrix row/col pins. Maps KLE labels to ZMK keycodes for the default keymap.

- [ ] **Step 1: Create ZMK templates**
- [ ] **Step 2: Implement firmware generator with KLE-to-ZMK keycode mapping**
- [ ] **Step 3: Write tests, commit**

---

### Task 13: BOM Generator

**Files:**
- Create: `tools/src/bom-generator/index.ts`
- Create: `tools/src/bom-generator/bom-generator.test.ts`

Generates BOM by reading the `BuildConfig` and pulling component details (name, quantity, package, supplier URLs, prices) from the `data/` JSON entries.

- [ ] **Step 1: Write failing tests**

```typescript
describe('BOM Generator', () => {
  it('includes correct number of switches', () => {
    // config has 83 keys → BOM should list 83 switches
  });
  it('includes correct number of diodes (1 per key)', () => {});
  it('includes MCU module', () => {});
  it('includes battery and charger when BLE enabled', () => {});
  it('excludes battery when BLE disabled', () => {});
  it('includes supplier links and prices from data/', () => {});
  it('calculates total estimated cost', () => {});
  it('generates both Markdown and CSV output', () => {});
});
```

- [ ] **Step 2: Implement BOM generator**

```typescript
export function generateBOM(config: BuildConfig, keyCount: number): { markdown: string; csv: string } {
  const lines: BOMLine[] = [];

  // Switches
  const switchData = loadComponent('switches', config.switches.type);
  const variant = switchData.variants?.find(v => v.id === config.switches.model);
  lines.push({
    ref: 'SW1-SW' + keyCount,
    component: variant?.name ?? switchData.name,
    package: switchData.footprintFile,
    quantity: keyCount,
    unitPrice: variant?.suppliers?.[0]?.priceUsd ?? null,
    supplier: variant?.suppliers?.[0]?.name ?? null,
    supplierUrl: variant?.suppliers?.[0]?.url ?? null,
    notes: switchData.designNotes?.join('; '),
  });

  // Hot-swap sockets (if enabled)
  if (config.switches.hotswap && switchData.hotswapSocket) {
    lines.push({ /* ... hot-swap socket from data */ });
  }

  // Diodes (1 per key)
  const diodeData = loadComponent('diodes', config.diode.model);
  lines.push({ /* ... diode line, quantity = keyCount */ });

  // MCU
  const mcuData = loadComponent('mcus', config.mcu.module);
  lines.push({ /* ... MCU line, quantity = 1 */ });

  // USB connector
  lines.push({ /* ... from config.usbConnector */ });

  // ESD protection
  lines.push({ /* ... from config.esdProtection */ });

  // Battery + charger (if BLE)
  if (config.power.battery) {
    lines.push({ /* ... battery */ });
    lines.push({ /* ... charger IC */ });
  }

  // RGB LEDs (if enabled)
  if (config.features.rgbPerKey) {
    lines.push({ /* ... LED model, quantity = keyCount */ });
  }

  // Decoupling caps (standard: 4x 100nF + 1x 4.7uF for MCU)
  lines.push({ /* ... capacitors */ });

  // Calculate total
  const total = lines.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.quantity, 0);

  return {
    markdown: renderBOMMarkdown(lines, total),
    csv: renderBOMCSV(lines),
  };
}
```

- [ ] **Step 3: Run tests, commit**

---

### Task 14: Gerber Export Utility

**Files:**
- Create: `tools/src/kicad-generator/gerber-export.ts`

Wraps the KiCad CLI (`kicad-cli pcb export gerbers`) to export Gerber files from the generated `.kicad_pcb`. Also exports drill files.

- [ ] **Step 1: Implement Gerber exporter**

```typescript
import { execSync } from 'child_process';
import { existsSync } from 'fs';

export function exportGerbers(pcbPath: string, outputDir: string): void {
  if (!existsSync(pcbPath)) {
    throw new Error(`PCB file not found: ${pcbPath}`);
  }

  // Check KiCad CLI is available
  try {
    execSync('kicad-cli --version', { stdio: 'pipe' });
  } catch {
    throw new Error(
      'kicad-cli not found. Install KiCad 8+ or run: scripts/setup.sh\n' +
      'Gerber export requires KiCad CLI. The PCB file has been generated — you can\n' +
      'also open it in KiCad and export Gerbers manually via File → Fabrication Outputs.'
    );
  }

  // Export Gerbers
  execSync(`kicad-cli pcb export gerbers --output "${outputDir}/" "${pcbPath}"`, { stdio: 'inherit' });

  // Export drill files
  execSync(`kicad-cli pcb export drill --output "${outputDir}/" "${pcbPath}"`, { stdio: 'inherit' });
}
```

- [ ] **Step 2: Commit**

```bash
git add tools/src/kicad-generator/gerber-export.ts
git commit -m "feat: Gerber and drill file export via KiCad CLI"
```

---

### Task 15: Build Orchestrator

**Files:**
- Create: `tools/src/build/orchestrator.ts`
- Create: `tools/src/build/orchestrator.test.ts`

The central coordinator that runs all generators in the correct order based on the config's `outputs` selections. Writes all files to a timestamped build directory, along with a copy of the config and layout.

- [ ] **Step 1: Implement build orchestrator**

```typescript
import { parseKLE } from '../kle-parser/index.js';
import { generateMatrix } from '../matrix-generator/index.js';
import { generateSchematic } from '../kicad-generator/schematic.js';
import { generatePCB } from '../kicad-generator/pcb.js';
import { exportGerbers } from '../kicad-generator/gerber-export.js';
import { generatePlate } from '../plate-generator/index.js';
import { generateFirmware } from '../firmware-generator/index.js';
import { generateBOM } from '../bom-generator/index.js';
import { flagDesignConcerns } from '../config/validator.js';
import type { BuildConfig } from '../config/schema.js';
import chalk from 'chalk';
import ora from 'ora';

export async function runBuild(config: BuildConfig, outputBase: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const buildName = `${config.project.name}-${timestamp}`;
  const outputDir = join(outputBase, buildName);
  mkdirSync(outputDir, { recursive: true });

  console.log(chalk.bold.cyan(`\n🔧 Keyboard Maker — Build: ${buildName}\n`));

  // Save config + layout to build output
  writeFileSync(join(outputDir, 'build-config.json'), JSON.stringify(config, null, 2));

  // 1. Parse layout
  const spinner = ora('Parsing keyboard layout...').start();
  const raw = JSON.parse(readFileSync(resolve(config.layout.path!), 'utf-8'));
  const layout = parseKLE(raw);
  writeFileSync(join(outputDir, 'layout.json'), JSON.stringify(raw, null, 2));
  spinner.succeed(`Layout: "${layout.name}" — ${layout.keys.length} keys`);

  // 2. Generate matrix
  const matSpinner = ora('Generating switch matrix...').start();
  const matrix = generateMatrix(layout, config.mcu.gpioAvailable);
  matSpinner.succeed(`Matrix: ${matrix.rows}R × ${matrix.cols}C (${matrix.rows + matrix.cols} GPIOs of ${config.mcu.gpioAvailable})`);

  // 3. Schematic
  if (config.outputs.schematic) {
    const s = ora('Generating KiCad schematic...').start();
    const sch = generateSchematic(layout, matrix, config);
    writeFileSync(join(outputDir, 'keyboard.kicad_sch'), sch);
    s.succeed('Schematic: keyboard.kicad_sch');
  }

  // 4. PCB
  if (config.outputs.pcb) {
    const s = ora('Generating KiCad PCB layout...').start();
    const pcb = generatePCB(layout, matrix, config);
    writeFileSync(join(outputDir, 'keyboard.kicad_pcb'), pcb);
    s.succeed('PCB layout: keyboard.kicad_pcb');
  }

  // 5. Gerbers (requires KiCad CLI)
  if (config.outputs.gerbers && config.outputs.pcb) {
    const s = ora('Exporting Gerber files...').start();
    try {
      const gerberDir = join(outputDir, 'gerbers');
      mkdirSync(gerberDir, { recursive: true });
      exportGerbers(join(outputDir, 'keyboard.kicad_pcb'), gerberDir);
      s.succeed('Gerbers exported');
    } catch (err: any) {
      s.warn(`Gerber export skipped: ${err.message}`);
    }
  }

  // 6. Plate
  if (config.outputs.plate) {
    const s = ora('Generating switch plate DXF...').start();
    const plate = generatePlate(layout, config);
    writeFileSync(join(outputDir, 'plate.dxf'), plate);
    s.succeed('Plate: plate.dxf');
  }

  // 7. Firmware
  if (config.outputs.firmware) {
    const s = ora('Generating ZMK firmware config...').start();
    const fwDir = join(outputDir, 'firmware');
    mkdirSync(fwDir, { recursive: true });
    const fw = generateFirmware(layout, matrix, config);
    writeFileSync(join(fwDir, `${config.project.name}.overlay`), fw.overlay);
    writeFileSync(join(fwDir, `${config.project.name}.keymap`), fw.keymap);
    writeFileSync(join(fwDir, `${config.project.name}.conf`), fw.conf);
    writeFileSync(join(fwDir, `${config.project.name}.zmk.yml`), fw.metadata);
    s.succeed('Firmware config generated');
  }

  // 8. BOM
  if (config.outputs.bom) {
    const s = ora('Generating bill of materials...').start();
    const bom = generateBOM(config, layout.keys.length);
    writeFileSync(join(outputDir, 'BOM.md'), bom.markdown);
    writeFileSync(join(outputDir, 'BOM.csv'), bom.csv);
    s.succeed('BOM: BOM.md + BOM.csv');
  }

  // 9. Design notes
  if (config.outputs.notes) {
    const concerns = flagDesignConcerns(config);
    if (concerns.length > 0) {
      const notes = concerns.map(c => `- [${c.severity.toUpperCase()}] ${c.message}`).join('\n');
      writeFileSync(join(outputDir, 'design-notes.md'), `# Design Notes\n\n${notes}\n`);
    }
  }

  // Build log
  writeFileSync(join(outputDir, 'build-log.txt'), [
    `Build: ${buildName}`,
    `Date: ${new Date().toISOString()}`,
    `Layout: ${layout.name} by ${layout.author}`,
    `Keys: ${layout.keys.length}`,
    `Matrix: ${matrix.rows}R × ${matrix.cols}C`,
    `Switch: ${config.switches.model}`,
    `MCU: ${config.mcu.module}`,
    `BLE: ${config.connectivity.bluetooth}`,
  ].join('\n'));

  console.log(chalk.bold.green(`\n✅ Build complete! Output: ${outputDir}\n`));
}
```

- [ ] **Step 2: Write integration test** (mini layout → full build → verify all files exist)

- [ ] **Step 3: Commit**

```bash
git add tools/src/build/
git commit -m "feat: build orchestrator tying CLI config to all generators"
```

---

### Task 16: Setup / Prerequisites Script

**Files:**
- Create: `scripts/setup.sh`
- Create: `scripts/setup-check.sh`
- Create: `scripts/README.md`

Separate script that installs all software prerequisites. The keyboard-maker CLI does NOT install these — it only uses them. Users run `scripts/setup.sh` once before using the toolchain.

- [ ] **Step 1: Create setup.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Keyboard Maker — Prerequisites Setup"
echo ""

# Detect OS
OS="$(uname -s)"

# --- Node.js ---
if ! command -v node &>/dev/null; then
  echo "Installing Node.js..."
  if [[ "$OS" == "Linux" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif [[ "$OS" == "Darwin" ]]; then
    brew install node
  fi
else
  echo "✓ Node.js $(node --version)"
fi

# --- KiCad 8 ---
if ! command -v kicad-cli &>/dev/null; then
  echo "Installing KiCad 8..."
  if [[ "$OS" == "Linux" ]]; then
    sudo add-apt-repository --yes ppa:kicad/kicad-8.0-releases
    sudo apt update
    sudo apt install -y kicad
  elif [[ "$OS" == "Darwin" ]]; then
    brew install --cask kicad
  fi
else
  echo "✓ KiCad $(kicad-cli --version 2>/dev/null | head -1)"
fi

# --- Freerouting (for auto-routing) ---
if ! command -v freerouting &>/dev/null && ! [ -f "$HOME/.local/bin/freerouting.jar" ]; then
  echo "Installing Freerouting..."
  mkdir -p "$HOME/.local/bin"
  FREEROUTING_VERSION="1.9.0"
  curl -L "https://github.com/freerouting/freerouting/releases/download/v${FREEROUTING_VERSION}/freerouting-${FREEROUTING_VERSION}.jar" \
    -o "$HOME/.local/bin/freerouting.jar"
  echo "✓ Freerouting installed to ~/.local/bin/freerouting.jar"
  echo '  Run with: java -jar ~/.local/bin/freerouting.jar'
else
  echo "✓ Freerouting"
fi

# --- Java (for Freerouting) ---
if ! command -v java &>/dev/null; then
  echo "Installing Java (for Freerouting)..."
  if [[ "$OS" == "Linux" ]]; then
    sudo apt install -y default-jre
  elif [[ "$OS" == "Darwin" ]]; then
    brew install openjdk
  fi
else
  echo "✓ Java $(java --version 2>&1 | head -1)"
fi

# --- Zephyr SDK + west (for ZMK firmware builds) ---
if ! command -v west &>/dev/null; then
  echo "Installing west (Zephyr meta-tool)..."
  pip3 install --user west
else
  echo "✓ west $(west --version 2>/dev/null)"
fi

# --- npm dependencies for the toolchain ---
echo ""
echo "Installing toolchain npm dependencies..."
cd "$(dirname "$0")/../tools"
npm install

echo ""
echo "✅ All prerequisites installed!"
echo "   Run: cd tools && npx keyboard-maker wizard"
```

- [ ] **Step 2: Create setup-check.sh** (validates everything is installed, prints status)

- [ ] **Step 3: Create scripts/README.md** documenting what each script does

- [ ] **Step 4: Commit**

```bash
git add scripts/
git commit -m "feat: setup scripts for installing prerequisites (KiCad, Freerouting, Zephyr)"
```

---

### Task 17: Firmware Build & Flash Scripts

**Files:**
- Create: `firmware/build.sh`
- Create: `firmware/flash.sh`

- [ ] **Step 1: Create ZMK build script** (clones ZMK if needed, runs `west build` with shield config)
- [ ] **Step 2: Create flash script** (copies .uf2 to mounted bootloader volume)
- [ ] **Step 3: Commit**

```bash
git add firmware/
git commit -m "feat: ZMK firmware build and flash scripts"
```

---

## Phase 2 — PCB Routing

---

### Task 18: PCB Routing Automation & Guidance

**Files:**
- Create: `tools/src/routing/index.ts`
- Create: `tools/src/routing/freerouter.ts`
- Create: `tools/src/routing/dsn-exporter.ts`
- Create: `tools/src/routing/ses-importer.ts`
- Create: `tools/src/routing/routing.test.ts`

PCB routing (connecting the copper traces between pads) is the hardest step to automate. Our approach: provide three modes selectable in the config or CLI:

#### Routing Mode: `auto` (Freerouting integration)

1. Export the generated `.kicad_pcb` to Specctra DSN format (KiCad's interchange format for autorouters)
2. Run Freerouting in headless/batch mode on the DSN file
3. Import the Freerouting SES (session) result back into the KiCad PCB
4. Output `keyboard-routed.kicad_pcb`

This won't be perfect for all layouts, but Freerouting handles simple keyboard matrices well (mostly parallel row/column traces with short stubs to diodes).

#### Routing Mode: `guided`

If auto-routing fails or the user wants manual control:
1. Generate a routing guide document (`routing-guide.md`) in the build output
2. The guide includes: which nets to route first (power, then columns, then rows), recommended trace widths, layer assignment suggestions
3. Pre-place power traces and decoupling connections programmatically (these follow predictable patterns)
4. User completes remaining routing in KiCad interactively

#### Routing Mode: `manual`

Skip all routing automation. Output the unrouted PCB and let the user handle it entirely in KiCad.

- [ ] **Step 1: Implement DSN exporter**

`tools/src/routing/dsn-exporter.ts`:
```typescript
import { execSync } from 'child_process';

/**
 * Export KiCad PCB to Specctra DSN format for autorouting.
 * Uses kicad-cli which ships with KiCad 8+.
 */
export function exportDSN(pcbPath: string, dsnPath: string): void {
  try {
    execSync(`kicad-cli pcb export dsn --output "${dsnPath}" "${pcbPath}"`, { stdio: 'pipe' });
  } catch (err) {
    throw new Error(
      'Failed to export DSN. Ensure KiCad 8+ is installed.\n' +
      'You can also export manually: KiCad → File → Export → Specctra DSN'
    );
  }
}
```

- [ ] **Step 2: Implement Freerouting integration**

`tools/src/routing/freerouter.ts`:
```typescript
import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const FREEROUTING_JAR = resolve(process.env.HOME ?? '', '.local/bin/freerouting.jar');

export function runFreerouting(dsnPath: string, sesOutputPath: string): void {
  if (!existsSync(FREEROUTING_JAR)) {
    throw new Error(
      'Freerouting not found. Run: scripts/setup.sh\n' +
      'Or download from: https://github.com/freerouting/freerouting/releases'
    );
  }

  console.log('  Running Freerouting autorouter (this may take a minute)...');

  // Freerouting headless mode
  const result = spawnSync('java', [
    '-jar', FREEROUTING_JAR,
    '-de', dsnPath,     // design input
    '-do', sesOutputPath, // session output
    '-mp', '20',        // max passes
  ], { stdio: 'inherit', timeout: 300000 }); // 5 minute timeout

  if (result.status !== 0) {
    throw new Error('Freerouting failed. Try manual routing instead (set pcb.routing to "manual").');
  }
}
```

- [ ] **Step 3: Implement SES importer**

`tools/src/routing/ses-importer.ts`:
```typescript
/**
 * Import Freerouting SES session back into KiCad PCB.
 * Uses kicad-cli to import the routed session.
 */
export function importSES(pcbPath: string, sesPath: string, outputPath: string): void {
  // kicad-cli can import SES into a PCB
  try {
    // Copy original PCB, then import SES traces
    copyFileSync(pcbPath, outputPath);
    execSync(`kicad-cli pcb import ses --input "${sesPath}" "${outputPath}"`, { stdio: 'pipe' });
  } catch {
    throw new Error(
      'Failed to import SES routes. You can import manually:\n' +
      'KiCad → File → Import → Specctra Session'
    );
  }
}
```

- [ ] **Step 4: Implement routing orchestrator**

`tools/src/routing/index.ts`:
```typescript
import { exportDSN } from './dsn-exporter.js';
import { runFreerouting } from './freerouter.js';
import { importSES } from './ses-importer.js';
import { join } from 'path';
import { writeFileSync } from 'fs';
import type { BuildConfig, SwitchMatrix } from '../shared/types.js';

export async function routePCB(
  pcbPath: string,
  outputDir: string,
  config: BuildConfig,
  matrix: SwitchMatrix
): Promise<string> {
  const mode = config.pcb.routing;

  if (mode === 'manual') {
    console.log('  Routing mode: manual — skipping autoroute');
    writeRoutingGuide(outputDir, config, matrix);
    return pcbPath; // return unrouted PCB
  }

  if (mode === 'guided') {
    console.log('  Routing mode: guided — generating routing guide');
    writeRoutingGuide(outputDir, config, matrix);
    // TODO: pre-route power traces programmatically
    return pcbPath;
  }

  // Auto mode: Freerouting pipeline
  console.log('  Routing mode: auto (Freerouting)');
  const dsnPath = join(outputDir, 'keyboard.dsn');
  const sesPath = join(outputDir, 'keyboard.ses');
  const routedPcbPath = join(outputDir, 'keyboard-routed.kicad_pcb');

  exportDSN(pcbPath, dsnPath);
  runFreerouting(dsnPath, sesPath);
  importSES(pcbPath, sesPath, routedPcbPath);

  // Also generate guide in case user wants to touch up
  writeRoutingGuide(outputDir, config, matrix);

  return routedPcbPath;
}

function writeRoutingGuide(outputDir: string, config: BuildConfig, matrix: SwitchMatrix): void {
  const guide = `# PCB Routing Guide

## Routing Priority Order

1. **USB differential pair** (D+/D-): Route first, keep traces parallel,
   match lengths within 0.1mm, use 90Ω impedance (for 2-layer: ~0.3mm trace, ~0.15mm gap).

2. **Power traces** (VBUS, 3V3, VBAT, GND):
   - Use 0.5mm trace width minimum for power
   - Place GND pour on back copper layer
   - Route VBUS from USB-C → ESD → voltage regulator → MCU
   ${config.power.battery ? '- Route battery: JST → charger IC → power switch → MCU VDD' : ''}

3. **Column traces** (COL0–COL${matrix.cols - 1}):
   - These run vertically through the switch matrix
   - Route on front copper (F.Cu)
   - 0.25mm trace width is fine for signal

4. **Row traces** (ROW0–ROW${matrix.rows - 1}):
   - These run horizontally, connecting diode cathodes
   - Route on back copper (B.Cu) to avoid crossing columns
   - 0.25mm trace width

5. **MCU connections**: Short stubs from row/col nets to MCU GPIO pads.
   ${config.features.rgbPerKey ? '\n6. **LED data line**: Daisy-chain from MCU through all LEDs. Keep under 10cm per segment.' : ''}

## Layer Assignment
- **F.Cu** (front): Switches, column traces, MCU, USB-C, major components
- **B.Cu** (back): Diodes, row traces, ground pour

## Trace Widths
- Signal: 0.25mm
- Power: 0.5mm
- USB D+/D-: 0.3mm (impedance matched)

## Tips
- Use 45° or curved trace corners (no right angles)
- Keep traces away from board edges (≥0.5mm clearance)
- Add stitching vias for the ground pour every ~25mm
`;
  writeFileSync(join(outputDir, 'routing-guide.md'), guide);
}
```

- [ ] **Step 5: Integrate routing into build orchestrator**

Add routing step between PCB generation and Gerber export in `orchestrator.ts`.

- [ ] **Step 6: Write tests**

Test DSN export call, routing guide generation, mode selection.

- [ ] **Step 7: Commit**

```bash
git add tools/src/routing/
git commit -m "feat: PCB routing automation with Freerouting integration and guided mode"
```

---

## Phase 3 — PC Companion Software

---

### Task 19: Electron App Scaffolding

**Files:**
- Create: `companion-app/package.json`
- Create: `companion-app/src/main/index.ts`
- Create: `companion-app/src/renderer/App.tsx`
- Create: `companion-app/src/shared/types.ts`

- [ ] **Step 1: Initialize Electron + React + Vite**
- [ ] **Step 2: Create main process** (BrowserWindow, IPC handlers)
- [ ] **Step 3: Create renderer** (app shell with tabs: Keys, Macros, Lighting, Profiles + connection status)
- [ ] **Step 4: Define shared protocol types** (HID messages, key remap commands, LED settings)
- [ ] **Step 5: Verify app launches, commit**

---

### Task 20: USB HID Communication Layer

**Files:**
- Create: `companion-app/src/main/hid-bridge.ts`
- Create: `companion-app/src/renderer/hooks/useHID.ts`
- Create: `companion-app/src/renderer/protocol/messages.ts`
- Create: `companion-app/src/renderer/protocol/codec.ts`

- [ ] **Step 1: Define HID message protocol** (GET/SET_KEYMAP, GET/SET_MACRO, LED commands, etc.)
- [ ] **Step 2: Implement codec** (serialize/deserialize into 64-byte HID reports)
- [ ] **Step 3: Implement HID bridge** in main process using `node-hid`
- [ ] **Step 4: Create useHID React hook** wrapping IPC calls
- [ ] **Step 5: Commit**

---

### Task 21: BLE Communication Layer

**Files:**
- Create: `companion-app/src/main/ble-bridge.ts`

- [ ] **Step 1: Implement BLE bridge** (same protocol as USB HID, different transport)
- [ ] **Step 2: Unified `useKeyboard()` hook** — same API regardless of USB/BLE
- [ ] **Step 3: Commit**

---

### Task 22: Key Remapping UI

**Files:**
- Create: `companion-app/src/renderer/components/KeyboardView.tsx`
- Create: `companion-app/src/renderer/components/KeyRemapper.tsx`

- [ ] **Step 1: Build KeyboardView** (SVG rendering of KLE layout, click-to-select)
- [ ] **Step 2: Build KeyRemapper** (key picker, layer selector, send SET_KEY command)
- [ ] **Step 3: Commit**

---

### Task 23: Macro Editor

- [ ] **Step 1: Build MacroEditor** (record mode, manual edit, assign to keys)
- [ ] **Step 2: Commit**

---

### Task 24: RGB LED Control

- [ ] **Step 1: Build LedControl** (per-key color, preset effects, brightness/speed)
- [ ] **Step 2: Commit**

---

### Task 25: Profile Management

- [ ] **Step 1: Build ProfileManager** (save/load/export profiles as JSON)
- [ ] **Step 2: Commit**

---

## Build Order & Dependency Graph

```
Phase 1 — Config-Driven Toolchain
    Task 1: Scaffolding ──┐
    Task 2: Component DB ─┤
    Task 3: Config Schema ┘
           │
    Task 4: Interactive CLI Wizard
           │
    ┌──────┴──────┐
    Task 5: KLE   Task 7: S-expr Engine
    Parser        Task 8: KiCad Libraries (parallel)
    │             │
    Task 6:       ├─ Task 9: Schematic Gen
    Matrix Gen    └─ Task 10: PCB Gen
    │                 │
    ├─ Task 11: Plate Gen
    ├─ Task 12: Firmware Gen
    ├─ Task 13: BOM Gen
    └─ Task 14: Gerber Export
           │
    Task 15: Build Orchestrator
    Task 16: Setup Script (parallel)
    Task 17: Firmware Build Scripts (parallel)

Phase 2 — Routing
    Task 18: PCB Routing (depends on Task 10 + 15)

Phase 3 — Companion App
    Task 19: Electron Scaffolding
    ├─ Task 20: USB HID (parallel)
    └─ Task 21: BLE (parallel)
           │
    ├─ Task 22: Key Remap UI
    ├─ Task 23: Macro Editor  (parallel)
    └─ Task 24: LED Control   (parallel)
           │
    Task 25: Profile Manager
```

**Parallelizable groups:**
- Tasks 1+2+16 can run in parallel (scaffolding, data, setup script)
- Tasks 5+7+8 can run in parallel after Task 3
- Tasks 9+10+11+12+13 can run in parallel after Tasks 5+6+7
- Tasks 20+21 can run in parallel
- Tasks 22+23+24 can run in parallel

---

## CLI Usage Examples

```bash
# Full interactive wizard
npx keyboard-maker wizard

# Wizard with pre-set layout file (skips layout question)
npx keyboard-maker wizard --kle-file ./layouts/blue-dream-space.json

# Wizard with partial config (skips answered questions, prompts for rest)
npx keyboard-maker wizard --config ./my-config.json

# Direct generation from complete config (no prompts)
npx keyboard-maker generate --config ./builds/blue-dream-space-2026-03-24/build-config.json

# Re-generate with a different layout
npx keyboard-maker generate --config ./builds/prev/build-config.json --kle-file ./layouts/new-layout.json

# Validate a config and see design concerns
npx keyboard-maker validate --config ./my-config.json

# List available components
npx keyboard-maker list-components --type switches
npx keyboard-maker list-components --type mcus
```

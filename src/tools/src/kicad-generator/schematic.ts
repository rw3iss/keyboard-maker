/**
 * KiCad schematic (.kicad_sch) generator.
 *
 * Generates a KiCad 9-compatible schematic with switch+diode pairs,
 * MCU, USB-C connector, and optional battery symbols.
 *
 * KiCad 9 schematics require:
 *  - (at x y angle) — angle is REQUIRED for symbol placement (even if 0)
 *  - Quoted strings for lib_id, property values
 *  - version 20231120 works with KiCad 9
 */

import type { KeyboardLayout, SwitchMatrix, BuildConfig } from '../shared/types.js';
import { extractLibSymbols } from './lib-symbols.js';

const SCHEMATIC_SWITCH_SPACING_X = 25.4;
const SCHEMATIC_SWITCH_SPACING_Y = 20.32;
const SCHEMATIC_ORIGIN_X = 50;
const SCHEMATIC_ORIGIN_Y = 50;

let uuidSeq = 0;
function uuid(): string {
  uuidSeq++;
  const s = uuidSeq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${s}`;
}
function resetUUIDs(): void { uuidSeq = 0; }

export function generateSchematic(
  layout: KeyboardLayout,
  matrix: SwitchMatrix,
  config: BuildConfig,
): string {
  resetUUIDs();
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  // Track placed symbols for symbol_instances section
  const symbolInstances: Array<{ uuid: string; ref: string; value: string }> = [];

  // Header
  w(`(kicad_sch`);
  w(`  (version 20231120)`);
  w(`  (generator "keyboard-maker")`);
  w(`  (generator_version "0.1.0")`);
  w(`  (uuid "${uuid()}")`);
  w(`  (paper "A3")`);
  // Collect which library symbols we need
  const neededLibs = new Set<string>([
    'Switch:SW_Push',
    'Device:D',
    'MCU_Nordic:nRF52840',
    'Connector:USB_C_Receptacle_USB2.0_16P',
  ]);
  if (config.connectivity.bluetooth && config.power.battery) {
    neededLibs.add('Device:Battery');
  }

  // Extract and embed library symbol definitions from installed KiCad
  const libSymbolContent = extractLibSymbols(neededLibs);
  if (libSymbolContent) {
    w(`  (lib_symbols`);
    w(libSymbolContent);
    w(`  )`);
  } else {
    w(`  (lib_symbols)`);
  }

  // Place switch + diode pairs
  let idx = 1;
  for (const key of layout.keys) {
    const matrixPos = matrix.assignments.get(key.id);
    if (!matrixPos) continue;

    const schX = SCHEMATIC_ORIGIN_X + matrixPos.col * SCHEMATIC_SWITCH_SPACING_X;
    const schY = SCHEMATIC_ORIGIN_Y + matrixPos.row * SCHEMATIC_SWITCH_SPACING_Y;

    // Switch symbol
    const swUuid = uuid();
    symbolInstances.push({ uuid: swUuid, ref: `SW${idx}`, value: `R${matrixPos.row}C${matrixPos.col}` });
    w(`  (symbol`);
    w(`    (lib_id "Switch:SW_Push")`);
    w(`    (at ${n(schX)} ${n(schY)} 0)`);
    w(`    (unit 1)`);
    w(`    (exclude_from_sim no)`);
    w(`    (in_bom yes)`);
    w(`    (on_board yes)`);
    w(`    (dnp no)`);
    w(`    (uuid "${swUuid}")`);
    w(`    (property "Reference" "SW${idx}"`);
    w(`      (at ${n(schX)} ${n(schY - 3)} 0)`);
    w(`      (effects (font (size 1.27 1.27)))`);
    w(`    )`);
    w(`    (property "Value" "R${matrixPos.row}C${matrixPos.col}"`);
    w(`      (at ${n(schX)} ${n(schY + 3)} 0)`);
    w(`      (effects (font (size 1.27 1.27)))`);
    w(`    )`);
    w(`    (property "Footprint" ""`);
    w(`      (at ${n(schX)} ${n(schY + 5)} 0)`);
    w(`      (effects (font (size 1.27 1.27)) hide)`);
    w(`    )`);
    w(`    (pin "1" (uuid "${uuid()}"))`);
    w(`    (pin "2" (uuid "${uuid()}"))`);
    w(`  )`);

    // Diode symbol
    const dY = schY + 7.62;
    const dUuid = uuid();
    symbolInstances.push({ uuid: dUuid, ref: `D${idx}`, value: '1N4148' });
    w(`  (symbol`);
    w(`    (lib_id "Device:D")`);
    w(`    (at ${n(schX)} ${n(dY)} 0)`);
    w(`    (unit 1)`);
    w(`    (exclude_from_sim no)`);
    w(`    (in_bom yes)`);
    w(`    (on_board yes)`);
    w(`    (dnp no)`);
    w(`    (uuid "${dUuid}")`);
    w(`    (property "Reference" "D${idx}"`);
    w(`      (at ${n(schX)} ${n(dY - 2)} 0)`);
    w(`      (effects (font (size 1.27 1.27)))`);
    w(`    )`);
    w(`    (property "Value" "1N4148"`);
    w(`      (at ${n(schX)} ${n(dY + 2)} 0)`);
    w(`      (effects (font (size 1.27 1.27)))`);
    w(`    )`);
    w(`    (property "Footprint" "Diode_SMD:D_SOD-123"`);
    w(`      (at ${n(schX)} ${n(dY + 4)} 0)`);
    w(`      (effects (font (size 1.27 1.27)) hide)`);
    w(`    )`);
    w(`    (pin "1" (uuid "${uuid()}"))`);
    w(`    (pin "2" (uuid "${uuid()}"))`);
    w(`  )`);

    // Wire from switch to diode
    w(`  (wire`);
    w(`    (pts (xy ${n(schX + 5.08)} ${n(schY)}) (xy ${n(schX + 5.08)} ${n(schY + 5.08)}))`);
    w(`    (stroke (width 0) (type default))`);
    w(`    (uuid "${uuid()}")`);
    w(`  )`);

    idx++;
  }

  // MCU symbol
  const mcuX = SCHEMATIC_ORIGIN_X + (matrix.cols + 1) * SCHEMATIC_SWITCH_SPACING_X;
  const mcuY = SCHEMATIC_ORIGIN_Y + 20;
  const mcuUuid = uuid();
  symbolInstances.push({ uuid: mcuUuid, ref: 'U1', value: 'nRF52840' });
  w(`  (symbol`);
  w(`    (lib_id "MCU_Nordic:nRF52840")`);
  w(`    (at ${n(mcuX)} ${n(mcuY)} 0)`);
  w(`    (unit 1)`);
  w(`    (exclude_from_sim no)`);
  w(`    (in_bom yes)`);
  w(`    (on_board yes)`);
  w(`    (dnp no)`);
  w(`    (uuid "${mcuUuid}")`);
  w(`    (property "Reference" "U1"`);
  w(`      (at ${n(mcuX)} ${n(mcuY - 5)} 0)`);
  w(`      (effects (font (size 1.27 1.27)))`);
  w(`    )`);
  w(`    (property "Value" "nRF52840"`);
  w(`      (at ${n(mcuX)} ${n(mcuY + 5)} 0)`);
  w(`      (effects (font (size 1.27 1.27)))`);
  w(`    )`);
  w(`    (property "Footprint" "Package_DFN_QFN:QFN-73-1EP_7x7mm_P0.4mm"`);
  w(`      (at ${n(mcuX)} ${n(mcuY + 7)} 0)`);
  w(`      (effects (font (size 1.27 1.27)) hide)`);
  w(`    )`);
  w(`  )`);

  // USB-C connector
  const usbX = mcuX;
  const usbY = SCHEMATIC_ORIGIN_Y - 20;
  const usbUuid = uuid();
  symbolInstances.push({ uuid: usbUuid, ref: 'J1', value: 'USB_C' });
  w(`  (symbol`);
  w(`    (lib_id "Connector:USB_C_Receptacle_USB2.0_16P")`);
  w(`    (at ${n(usbX)} ${n(usbY)} 0)`);
  w(`    (unit 1)`);
  w(`    (exclude_from_sim no)`);
  w(`    (in_bom yes)`);
  w(`    (on_board yes)`);
  w(`    (dnp no)`);
  w(`    (uuid "${usbUuid}")`);
  w(`    (property "Reference" "J1"`);
  w(`      (at ${n(usbX)} ${n(usbY - 5)} 0)`);
  w(`      (effects (font (size 1.27 1.27)))`);
  w(`    )`);
  w(`    (property "Value" "USB_C"`);
  w(`      (at ${n(usbX)} ${n(usbY + 5)} 0)`);
  w(`      (effects (font (size 1.27 1.27)))`);
  w(`    )`);
  w(`    (property "Footprint" "Connector_USB:USB_C_Receptacle_GCT_USB4085"`);
  w(`      (at ${n(usbX)} ${n(usbY + 7)} 0)`);
  w(`      (effects (font (size 1.27 1.27)) hide)`);
  w(`    )`);
  w(`  )`);

  // Battery (if bluetooth + battery)
  if (config.connectivity.bluetooth && config.power.battery) {
    const batX = mcuX + 40;
    const batY = mcuY;
    const batUuid = uuid();
    symbolInstances.push({ uuid: batUuid, ref: 'BT1', value: 'Battery' });
    w(`  (symbol`);
    w(`    (lib_id "Device:Battery")`);
    w(`    (at ${n(batX)} ${n(batY)} 0)`);
    w(`    (unit 1)`);
    w(`    (exclude_from_sim no)`);
    w(`    (in_bom yes)`);
    w(`    (on_board yes)`);
    w(`    (dnp no)`);
    w(`    (uuid "${batUuid}")`);
    w(`    (property "Reference" "BT1"`);
    w(`      (at ${n(batX)} ${n(batY - 3)} 0)`);
    w(`      (effects (font (size 1.27 1.27)))`);
    w(`    )`);
    w(`    (property "Value" "Battery"`);
    w(`      (at ${n(batX)} ${n(batY + 3)} 0)`);
    w(`      (effects (font (size 1.27 1.27)))`);
    w(`    )`);
    w(`    (property "Footprint" "Connector:JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal"`);
    w(`      (at ${n(batX)} ${n(batY + 5)} 0)`);
    w(`      (effects (font (size 1.27 1.27)) hide)`);
    w(`    )`);
    w(`  )`);
  }

  // Row net labels
  for (let r = 0; r < matrix.rows; r++) {
    const labelX = SCHEMATIC_ORIGIN_X - 15;
    const labelY = SCHEMATIC_ORIGIN_Y + r * SCHEMATIC_SWITCH_SPACING_Y;
    w(`  (label "ROW${r}"`);
    w(`    (at ${n(labelX)} ${n(labelY)} 0)`);
    w(`    (effects (font (size 1.27 1.27)))`);
    w(`    (uuid "${uuid()}")`);
    w(`  )`);
  }

  // Column net labels
  for (let c = 0; c < matrix.cols; c++) {
    const labelX = SCHEMATIC_ORIGIN_X + c * SCHEMATIC_SWITCH_SPACING_X;
    const labelY = SCHEMATIC_ORIGIN_Y - 10;
    w(`  (label "COL${c}"`);
    w(`    (at ${n(labelX)} ${n(labelY)} 0)`);
    w(`    (effects (font (size 1.27 1.27)))`);
    w(`    (uuid "${uuid()}")`);
    w(`  )`);
  }

  // Symbol instances (required by KiCad 9)
  w(`  (symbol_instances`);
  for (const si of symbolInstances) {
    w(`    (path "/${si.uuid}"`);
    w(`      (reference "${si.ref}")`);
    w(`      (unit 1)`);
    w(`      (value "${si.value}")`);
    w(`      (footprint "")`);
    w(`    )`);
  }
  w(`  )`);
  w(`)`);

  return lines.join('\n');
}

function n(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  const s = v.toFixed(4);
  return s.replace(/\.?0+$/, '');
}

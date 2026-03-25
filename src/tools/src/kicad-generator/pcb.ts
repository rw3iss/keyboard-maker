/**
 * KiCad PCB (.kicad_pcb) generator — KiCad 9 compatible.
 *
 * Generates a complete PCB with:
 *  - Switch footprints with COL/ROW net assignments on pads
 *  - Diode footprints with matching net assignments
 *  - LED footprints (if RGB per-key enabled)
 *  - MCU footprint with GPIO pads assigned to ROW/COL nets
 *  - USB-C connector with power net assignments (configurable side)
 *  - Battery connector (if BLE enabled)
 *  - Mounting holes using smart screw placement
 *  - Board outline, net definitions, DRC-friendly clearance rules
 */

import type { KeyboardLayout, SwitchMatrix, BuildConfig } from '../shared/types.js';
import { SWITCH_SPACING } from '../shared/constants.js';
import { kleToPcbPosition } from './footprints.js';
import {
  calculateScrewPositions,
  collectComponentPositions,
  getConnectorXY,
  type ScrewPosition,
} from '../shared/screw-placement.js';

const PCB_ORIGIN_X = 25;
const PCB_ORIGIN_Y = 25;
const DIODE_OFFSET_Y = 8;

let uuidSeq = 0;
function uuid(): string {
  uuidSeq++;
  return `00000000-0000-4000-8000-${uuidSeq.toString(16).padStart(12, '0')}`;
}
function resetUUIDs(): void { uuidSeq = 0; }

export interface PCBResult {
  pcb: string;
  screwPositions: ScrewPosition[];
}

export function generatePCB(
  layout: KeyboardLayout,
  matrix: SwitchMatrix,
  config: BuildConfig,
): string {
  return generatePCBWithScrews(layout, matrix, config).pcb;
}

export function generatePCBWithScrews(
  layout: KeyboardLayout,
  matrix: SwitchMatrix,
  config: BuildConfig,
): PCBResult {
  resetUUIDs();
  const spacing = SWITCH_SPACING[config.switches.type];
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  // Header
  w(`(kicad_pcb`);
  w(`  (version 20240108)`);
  w(`  (generator "keyboard-maker")`);
  w(`  (generator_version "0.1.0")`);
  w(`  (general`);
  w(`    (thickness ${config.pcb.thickness})`);
  w(`    (legacy_teardrops no)`);
  w(`  )`);
  w(`  (paper "A3")`);

  // Layers — support 2-layer and 4-layer boards
  const is4Layer = (config.pcb.layers ?? 2) >= 4;
  w(`  (layers`);
  w(`    (0 "F.Cu" signal)`);
  if (is4Layer) {
    w(`    (1 "In1.Cu" signal)`);
    w(`    (2 "In2.Cu" signal)`);
  }
  w(`    (31 "B.Cu" signal)`);
  w(`    (32 "B.Adhes" user "B.Adhesive")`);
  w(`    (33 "F.Adhes" user "F.Adhesive")`);
  w(`    (34 "B.Paste" user)`);
  w(`    (35 "F.Paste" user)`);
  w(`    (36 "B.SilkS" user "B.Silkscreen")`);
  w(`    (37 "F.SilkS" user "F.Silkscreen")`);
  w(`    (38 "B.Mask" user)`);
  w(`    (39 "F.Mask" user)`);
  w(`    (40 "Dwgs.User" user "User.Drawings")`);
  w(`    (44 "Edge.Cuts" user)`);
  w(`    (46 "B.CrtYd" user "B.Courtyard")`);
  w(`    (47 "F.CrtYd" user "F.Courtyard")`);
  w(`    (48 "B.Fab" user)`);
  w(`    (49 "F.Fab" user)`);
  w(`  )`);

  // Map signal layer number to KiCad layer name
  const signalLayerNum = config.pcb.signalLayer ?? 0;
  const layerNameMap: Record<number, string> = { 0: 'F.Cu', 1: 'In1.Cu', 2: 'In2.Cu', 31: 'B.Cu' };
  const signalLayerName = layerNameMap[signalLayerNum] ?? 'F.Cu';
  // Through-hole pads always span all copper layers
  const allCopperLayers = is4Layer
    ? '"F.Cu" "In1.Cu" "In2.Cu" "B.Cu" "*.Mask"'
    : '"F.Cu" "B.Cu" "*.Mask"';

  // Setup — increased clearances to reduce DRC violations
  w(`  (setup`);
  w(`    (pad_to_mask_clearance 0.025)`);
  w(`    (solder_mask_min_width 0.05)`);
  w(`    (allow_soldermask_bridges_in_footprints no)`);
  w(`    (pcbplotparams`);
  w(`      (layerselection 0x00010fc_ffffffff)`);
  w(`      (plot_on_all_layers_selection 0x0000000_00000000)`);
  w(`      (outputdirectory "gerbers/")`);
  w(`    )`);
  w(`  )`);

  // Nets
  w(`  (net 0 "")`);
  const netNames: string[] = [''];
  for (let r = 0; r < matrix.rows; r++) {
    const name = `ROW${r}`;
    netNames.push(name);
    w(`  (net ${netNames.length - 1} "${name}")`);
  }
  for (let c = 0; c < matrix.cols; c++) {
    const name = `COL${c}`;
    netNames.push(name);
    w(`  (net ${netNames.length - 1} "${name}")`);
  }
  for (const name of ['VCC', 'GND', 'VBUS', 'VBAT', 'USB_DP', 'USB_DM']) {
    netNames.push(name);
    w(`  (net ${netNames.length - 1} "${name}")`);
  }

  const netIndex = (name: string) => netNames.indexOf(name);

  // Design rules
  // Default net class for signal traces (ROW/COL)
  w(`  (net_class "Default" ""`);
  w(`    (clearance 0.15)`);
  w(`    (trace_width 0.2)`);
  w(`    (via_dia 0.6)`);
  w(`    (via_drill 0.3)`);
  w(`    (uvia_dia 0.3)`);
  w(`    (uvia_drill 0.1)`);
  w(`  )`);
  // Power net class — wider traces, helps Freerouting avoid congestion
  w(`  (net_class "Power" "Power nets"`);
  w(`    (clearance 0.2)`);
  w(`    (trace_width 0.4)`);
  w(`    (via_dia 0.8)`);
  w(`    (via_drill 0.4)`);
  w(`    (uvia_dia 0.3)`);
  w(`    (uvia_drill 0.1)`);
  // Assign power nets to this class
  for (const pn of ['VCC', 'GND', 'VBUS', 'VBAT']) {
    const idx = netIndex(pn);
    if (idx > 0) w(`    (add_net "${pn}")`);
  }
  w(`  )`);

  // Track positions for board outline
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Place switches, diodes, and optionally LEDs
  let idx = 1;
  const ledPlacement = config.features?.ledPlacement ?? 'below';
  const hasPerKeyRgb = config.features?.rgbPerKey ?? false;

  for (const key of layout.keys) {
    const matrixPos = matrix.assignments.get(key.id);
    if (!matrixPos) continue;

    const pcbPos = kleToPcbPosition(key.x, key.y, key.width, key.height, config.switches.type);
    const absX = PCB_ORIGIN_X + pcbPos.x;
    const absY = PCB_ORIGIN_Y + pcbPos.y;

    const halfX = spacing.x / 2;
    const halfY = spacing.y / 2;
    minX = Math.min(minX, absX - halfX);
    minY = Math.min(minY, absY - halfY);
    maxX = Math.max(maxX, absX + halfX);
    maxY = Math.max(maxY, absY + halfY);

    const rowNetIdx = matrixPos.row + 1;
    const colNetIdx = matrix.rows + matrixPos.col + 1;

    // Switch footprint — pad 1 = COL, pad 2 = connects to diode
    w(`  (footprint "Switch:SW_Push"`);
    w(`    (layer "F.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (at ${n(absX)} ${n(absY)}${key.rotation ? ` ${key.rotation}` : ''})`);
    w(`    (property "Reference" "SW${idx}" (at 0 -3) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
    w(`    (property "Value" "SW_Push" (at 0 3) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);
    w(`    (pad "1" thru_hole circle (at -3.81 -2.54) (size 2.2 2.2) (drill 1.5) (layers ${allCopperLayers}) (net ${colNetIdx} "${netNames[colNetIdx]}") (uuid "${uuid()}"))`);
    w(`    (pad "2" thru_hole circle (at 2.54 -5.08) (size 2.2 2.2) (drill 1.5) (layers ${allCopperLayers}) (net ${rowNetIdx} "${netNames[rowNetIdx]}") (uuid "${uuid()}"))`);
    w(`    (fp_rect (start -7 -7) (end 7 7) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
    w(`  )`);

    // Diode footprint — pad 1 (cathode) = ROW, pad 2 (anode) = COL
    const dY = absY + DIODE_OFFSET_Y;
    w(`  (footprint "Diode_SMD:D_SOD-123"`);
    w(`    (layer "F.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (at ${n(absX)} ${n(dY)})`);
    w(`    (property "Reference" "D${idx}" (at 0 -2) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
    w(`    (property "Value" "1N4148" (at 0 2) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
    w(`    (pad "1" smd roundrect (at -1.35 0) (size 0.9 1.2) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${rowNetIdx} "${netNames[rowNetIdx]}") (uuid "${uuid()}"))`);
    w(`    (pad "2" smd roundrect (at 1.35 0) (size 0.9 1.2) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${colNetIdx} "${netNames[colNetIdx]}") (uuid "${uuid()}"))`);
    w(`  )`);

    // LED footprint (per-key RGB)
    if (hasPerKeyRgb) {
      const ledOffsetY = ledPlacement === 'above' ? -6 : 6;
      const ledY = absY + ledOffsetY;
      w(`  (footprint "LED_SMD:LED_SK6812MINI-E"`);
      w(`    (layer "B.Cu")`);
      w(`    (uuid "${uuid()}")`);
      w(`    (at ${n(absX)} ${n(ledY)})`);
      w(`    (property "Reference" "LED${idx}" (at 0 -2) (layer "B.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
      w(`    (property "Value" "SK6812MINI-E" (at 0 2) (layer "B.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
      w(`    (pad "1" smd rect (at -2.45 -0.75) (size 0.9 0.9) (layers "B.Cu" "B.Paste" "B.Mask") (net ${netIndex('VCC')} "VCC") (uuid "${uuid()}"))`);
      w(`    (pad "2" smd rect (at -2.45 0.75) (size 0.9 0.9) (layers "B.Cu" "B.Paste" "B.Mask") (net 0 "") (uuid "${uuid()}"))`);
      w(`    (pad "3" smd rect (at 2.45 0.75) (size 0.9 0.9) (layers "B.Cu" "B.Paste" "B.Mask") (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
      w(`    (pad "4" smd rect (at 2.45 -0.75) (size 0.9 0.9) (layers "B.Cu" "B.Paste" "B.Mask") (net 0 "") (uuid "${uuid()}"))`);
      w(`    (fp_rect (start -3 -1.5) (end 3 1.5) (stroke (width 0.05) (type default)) (fill none) (layer "B.CrtYd") (uuid "${uuid()}"))`);
      w(`  )`);
    }

    idx++;
  }

  // Board outline
  const margin = 8;
  const olMinX = minX - margin;
  const olMinY = minY - margin - 15; // extra space at top for USB/MCU
  const olMaxX = maxX + margin;
  const olMaxY = maxY + margin + 20; // extra space at bottom for MCU
  w(`  (gr_rect (start ${n(olMinX)} ${n(olMinY)}) (end ${n(olMaxX)} ${n(olMaxY)}) (stroke (width 0.1) (type default)) (fill none) (layer "Edge.Cuts") (uuid "${uuid()}"))`);

  // ── MCU footprint with GPIO pads assigned to ROW/COL nets ──
  const mcuX = (minX + maxX) / 2;
  const mcuY2 = maxY + margin + 5;

  // Assign MCU GPIO pins: first rows, then cols
  const mcuPadCount = matrix.rows + matrix.cols;
  const mcuPadPitch = 0.5; // QFN pad pitch
  const mcuBodySize = 7; // 7mm QFN body

  w(`  (footprint "Package_DFN_QFN:QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm"`);
  w(`    (layer "F.Cu")`);
  w(`    (uuid "${uuid()}")`);
  w(`    (at ${n(mcuX)} ${n(mcuY2)})`);
  w(`    (property "Reference" "U1" (at 0 -5) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
  w(`    (property "Value" "nRF52840" (at 0 5) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);

  // Generate pads around the QFN perimeter — assign ROW/COL nets to the first N pads
  const padsPerSide = 12; // 48-pin QFN = 12 per side
  let gpioIdx = 0;

  // Bottom side (pads 1-12, left to right)
  for (let i = 0; i < padsPerSide; i++) {
    const padNum = i + 1;
    const px = -((padsPerSide - 1) * mcuPadPitch) / 2 + i * mcuPadPitch;
    const py = mcuBodySize / 2;
    const netAssign = gpioIdx < mcuPadCount
      ? `(net ${gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1} "${netNames[gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1]}")`
      : `(net 0 "")`;
    w(`    (pad "${padNum}" smd roundrect (at ${n(px)} ${n(py)}) (size 0.3 0.75) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) ${netAssign} (uuid "${uuid()}"))`);
    gpioIdx++;
  }

  // Right side (pads 13-24, top to bottom)
  for (let i = 0; i < padsPerSide; i++) {
    const padNum = padsPerSide + i + 1;
    const px = mcuBodySize / 2;
    const py = -((padsPerSide - 1) * mcuPadPitch) / 2 + i * mcuPadPitch;
    const netAssign = gpioIdx < mcuPadCount
      ? `(net ${gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1} "${netNames[gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1]}")`
      : `(net 0 "")`;
    w(`    (pad "${padNum}" smd roundrect (at ${n(px)} ${n(py)}) (size 0.75 0.3) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) ${netAssign} (uuid "${uuid()}"))`);
    gpioIdx++;
  }

  // Top side (pads 25-36, right to left)
  for (let i = 0; i < padsPerSide; i++) {
    const padNum = 2 * padsPerSide + i + 1;
    const px = ((padsPerSide - 1) * mcuPadPitch) / 2 - i * mcuPadPitch;
    const py = -mcuBodySize / 2;
    const netAssign = gpioIdx < mcuPadCount
      ? `(net ${gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1} "${netNames[gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1]}")`
      : (padNum >= 35 ? `(net ${netIndex('VCC')} "VCC")` : `(net 0 "")`);
    w(`    (pad "${padNum}" smd roundrect (at ${n(px)} ${n(py)}) (size 0.3 0.75) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) ${netAssign} (uuid "${uuid()}"))`);
    gpioIdx++;
  }

  // Left side (pads 37-48, bottom to top)
  for (let i = 0; i < padsPerSide; i++) {
    const padNum = 3 * padsPerSide + i + 1;
    const px = -mcuBodySize / 2;
    const py = ((padsPerSide - 1) * mcuPadPitch) / 2 - i * mcuPadPitch;
    let netAssign: string;
    if (i === 0) netAssign = `(net ${netIndex('USB_DP')} "USB_DP")`;
    else if (i === 1) netAssign = `(net ${netIndex('USB_DM')} "USB_DM")`;
    else if (i === 2) netAssign = `(net ${netIndex('VBUS')} "VBUS")`;
    else if (i === padsPerSide - 1) netAssign = `(net ${netIndex('GND')} "GND")`;
    else netAssign = `(net 0 "")`;
    w(`    (pad "${padNum}" smd roundrect (at ${n(px)} ${n(py)}) (size 0.75 0.3) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) ${netAssign} (uuid "${uuid()}"))`);
  }

  // Exposed pad (GND)
  w(`    (pad "49" smd rect (at 0 0) (size 5.6 5.6) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);

  // Courtyard
  w(`    (fp_rect (start -4 -4) (end 4 4) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
  w(`  )`);

  // ── USB-C connector with power/data nets — configurable side ──
  const connectorSide = config.physical?.connectorSide ?? 'back';
  const connectorPosition = config.physical?.connectorPosition ?? 'center';
  const boardBounds = { minX, minY, maxX, maxY };
  const usbPos = getConnectorXY(connectorSide, connectorPosition, boardBounds);
  const usbRotation = connectorSide === 'left' ? 90 : connectorSide === 'right' ? -90 : 0;

  w(`  (footprint "Connector_USB:USB_C_Receptacle_GCT_USB4085"`);
  w(`    (layer "F.Cu")`);
  w(`    (uuid "${uuid()}")`);
  w(`    (at ${n(usbPos.x)} ${n(usbPos.y)}${usbRotation ? ` ${usbRotation}` : ''})`);
  w(`    (property "Reference" "J1" (at 0 -4) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
  w(`    (property "Value" "USB_C" (at 0 8) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);
  // Simplified USB-C pads: VBUS, GND, D+, D-, CC
  w(`    (pad "A1" smd roundrect (at -3.25 0) (size 0.3 1.0) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
  w(`    (pad "A4" smd roundrect (at -2.25 0) (size 0.3 1.0) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${netIndex('VBUS')} "VBUS") (uuid "${uuid()}"))`);
  w(`    (pad "A6" smd roundrect (at -1.25 0) (size 0.3 1.0) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${netIndex('USB_DP')} "USB_DP") (uuid "${uuid()}"))`);
  w(`    (pad "A7" smd roundrect (at -0.75 0) (size 0.3 1.0) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${netIndex('USB_DM')} "USB_DM") (uuid "${uuid()}"))`);
  w(`    (pad "B1" smd roundrect (at 3.25 0) (size 0.3 1.0) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
  w(`    (pad "B4" smd roundrect (at 2.25 0) (size 0.3 1.0) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${netIndex('VBUS')} "VBUS") (uuid "${uuid()}"))`);
  w(`    (pad "S1" thru_hole circle (at -4.32 -1.5) (size 1.6 1.6) (drill 1.0) (layers ${allCopperLayers}) (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
  w(`    (pad "S2" thru_hole circle (at 4.32 -1.5) (size 1.6 1.6) (drill 1.0) (layers ${allCopperLayers}) (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
  w(`  )`);

  // ── Battery connector (if bluetooth + battery) ──
  if (config.connectivity.bluetooth && config.power.battery) {
    // Battery connector position: near MCU, side depends on connector config
    let batX: number;
    let batY: number;
    if (connectorSide === 'left') {
      batX = olMinX + 10;
      batY = mcuY2;
    } else if (connectorSide === 'right') {
      batX = olMaxX - 10;
      batY = mcuY2;
    } else {
      batX = olMaxX - 15;
      batY = mcuY2;
    }

    w(`  (footprint "Connector_JST:JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal"`);
    w(`    (layer "F.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (at ${n(batX)} ${n(batY)})`);
    w(`    (property "Reference" "BT1" (at 0 -3) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
    w(`    (property "Value" "Battery" (at 0 3) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);
    w(`    (pad "1" thru_hole circle (at 0 0) (size 1.75 1.75) (drill 1.0) (layers ${allCopperLayers}) (net ${netIndex('VBAT')} "VBAT") (uuid "${uuid()}"))`);
    w(`    (pad "2" thru_hole circle (at 2 0) (size 1.75 1.75) (drill 1.0) (layers ${allCopperLayers}) (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
    w(`  )`);
  }

  // ── Mounting holes using smart screw placement ──
  const componentPositions = collectComponentPositions(config, boardBounds);
  const screwPositions = calculateScrewPositions(
    layout,
    config,
    { minX: olMinX, minY: olMinY, maxX: olMaxX, maxY: olMaxY },
    componentPositions,
  );

  for (const screw of screwPositions) {
    w(`  (footprint "MountingHole:MountingHole_2.7mm_M2.5_Pad_Via"`);
    w(`    (layer "F.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (at ${n(screw.x)} ${n(screw.y)})`);
    w(`    (property "Reference" "MH_${screw.label}" (at 0 -3) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
    w(`    (property "Value" "MountingHole_M2.5" (at 0 3) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
    w(`    (pad "1" thru_hole circle (at 0 0) (size 5.5 5.5) (drill 2.7) (layers ${allCopperLayers}) (net 0 "") (uuid "${uuid()}"))`);
    w(`    (fp_circle (center 0 0) (end 2.75 0) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
    w(`  )`);
  }

  w(`)`);
  return { pcb: lines.join('\n'), screwPositions };
}

function n(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  const s = v.toFixed(4);
  return s.replace(/\.?0+$/, '');
}

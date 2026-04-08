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

import type { KeyboardLayout, SwitchMatrix, BuildConfig, McuData } from '../shared/types.js';
import { classifyMcu, generateBareChipFootprint, generateModuleFootprint, generateFanoutVias } from './mcu-footprint.js';
import { loadComponent } from '../cli/data-loader.js';
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
  warnings: string[];
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
  // Through-hole pads span all copper layers + mask
  const allCopperLayers = is4Layer
    ? '"F.Cu" "In1.Cu" "In2.Cu" "B.Cu" "*.Mask"'
    : '"F.Cu" "B.Cu" "*.Mask"';
  // Vias specify only start/end layers — KiCad 9 rejects intermediate layers and *.Mask on vias
  const viaCopperLayers = '"F.Cu" "B.Cu"';

  // Setup — increased clearances to reduce DRC violations
  w(`  (setup`);
  w(`    (pad_to_mask_clearance 0.05)`);
  w(`    (solder_mask_min_width 0.1)`);
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
  // Default net class — 0.25mm clearance for clean routing around QFN pads
  w(`  (net_class "Default" ""`);
  w(`    (clearance 0.25)`);
  w(`    (trace_width 0.2)`);
  w(`    (via_dia 0.6)`);
  w(`    (via_drill 0.3)`);
  w(`    (uvia_dia 0.3)`);
  w(`    (uvia_drill 0.1)`);
  w(`  )`);
  // Power net class — wider traces and clearance for safety
  w(`  (net_class "Power" "Power nets"`);
  w(`    (clearance 0.25)`);
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

    // LED footprint (per-key RGB) — on F.Cu (same side as switches)
    // "above" = north of switch (negative Y), "below" = south of switch (positive Y)
    if (hasPerKeyRgb) {
      const ledOffsetY = ledPlacement === 'above' ? -6 : 6;
      const ledY = absY + ledOffsetY;
      w(`  (footprint "LED_SMD:LED_SK6812MINI-E"`);
      w(`    (layer "F.Cu")`);
      w(`    (uuid "${uuid()}")`);
      w(`    (at ${n(absX)} ${n(ledY)})`);
      w(`    (property "Reference" "LED${idx}" (at 0 -2) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
      w(`    (property "Value" "SK6812MINI-E" (at 0 2) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
      w(`    (pad "1" smd rect (at -2.45 -0.75) (size 0.9 0.9) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('VCC')} "VCC") (uuid "${uuid()}"))`);
      w(`    (pad "2" smd rect (at -2.45 0.75) (size 0.9 0.9) (layers "F.Cu" "F.Paste" "F.Mask") (net 0 "") (uuid "${uuid()}"))`);
      w(`    (pad "3" smd rect (at 2.45 0.75) (size 0.9 0.9) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
      w(`    (pad "4" smd rect (at 2.45 -0.75) (size 0.9 0.9) (layers "F.Cu" "F.Paste" "F.Mask") (net 0 "") (uuid "${uuid()}"))`);
      w(`    (fp_rect (start -3 -1.5) (end 3 1.5) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
      w(`  )`);
    }

    idx++;
  }

  // Board outline — tight margin around switches
  // Uses layoutOverrides.boardOutline if set (for future polygon support)
  const margin = 8;
  const boardOverrides = config.layoutOverrides;
  let olMinX: number, olMinY: number, olMaxX: number, olMaxY: number;

  if (boardOverrides?.boardOutline) {
    olMinX = PCB_ORIGIN_X + boardOverrides.boardOutline.minX;
    olMinY = PCB_ORIGIN_Y + boardOverrides.boardOutline.minY;
    olMaxX = PCB_ORIGIN_X + boardOverrides.boardOutline.maxX;
    olMaxY = PCB_ORIGIN_Y + boardOverrides.boardOutline.maxY;
  } else {
    olMinX = minX - margin;
    olMinY = minY - margin;
    olMaxX = maxX + margin;
    olMaxY = maxY + margin;
  }
  w(`  (gr_rect (start ${n(olMinX)} ${n(olMinY)}) (end ${n(olMaxX)} ${n(olMaxY)}) (stroke (width 0.1) (type default)) (fill none) (layer "Edge.Cuts") (uuid "${uuid()}"))`);

  // ── MCU footprint — data-driven from component database ──
  const overrides = config.layoutOverrides;
  let mcuX = overrides?.mcu ? PCB_ORIGIN_X + overrides.mcu.x : (minX + maxX) / 2;
  let mcuY2 = overrides?.mcu ? PCB_ORIGIN_Y + overrides.mcu.y : (maxY + margin + 5);

  const pcbWarnings: string[] = [];

  // Load MCU data from component database
  const mcuId = config.mcu?.module;
  let mcuData: McuData | null = null;
  if (mcuId) {
    try {
      const raw = loadComponent('mcus', mcuId);
      if (raw) mcuData = raw as unknown as McuData;
    } catch { /* data not available */ }
  }

  // Fallback: if no MCU data loaded, use a hardcoded QFN-48 nRF52840 default
  if (!mcuData) {
    if (mcuId) pcbWarnings.push(`MCU data not found for "${mcuId}" — using default QFN-48 nRF52840`);
    mcuData = {
      id: 'default-nrf52840',
      name: 'nRF52840',
      chip: 'nRF52840',
      formFactor: 'qfn-48',
      gpioCount: 48,
      package: {
        type: 'QFN-48',
        dimensions: { width: 7, height: 7 },
        pitch: 0.5,
        padCount: 48,
        padsPerSide: 12,
        padSize: { width: 0.3, height: 0.75 },
        thermalPad: true,
        exposedPadSize: { width: 5.6, height: 5.6 },
        footprintRef: 'Package_DFN_QFN:QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm',
      },
      pinMap: {
        vcc: [35, 36],
        gnd: [48, 'EP'],
        usbDp: [37],
        usbDm: [38],
        vbus: [39],
      },
    };
  }

  const mcuCtx = {
    mcuX, mcuY: mcuY2, matrix, netNames, netIndex, config, is4Layer,
    allCopperLayers, viaCopperLayers, w, uuid, n,
  };

  const mcuForm = classifyMcu(mcuData);
  if (mcuForm === 'bare-chip') {
    const result = generateBareChipFootprint(mcuData, mcuCtx);
    pcbWarnings.push(...result.warnings);
  } else {
    const result = generateModuleFootprint(mcuData, mcuCtx);
    pcbWarnings.push(...result.warnings);
  }

  // Fanout vias (only for bare-chip QFN/QFP on 4-layer boards)
  const fanoutResult = generateFanoutVias(mcuData, mcuCtx);
  pcbWarnings.push(...fanoutResult.warnings);

  // ── USB-C connector with power/data nets — configurable side ──
  const connectorSide = config.physical?.connectorSide ?? 'back';
  const connectorPosition = config.physical?.connectorPosition ?? 'center';
  const boardBounds = { minX, minY, maxX, maxY };
  const defaultUsbPos = getConnectorXY(connectorSide, connectorPosition, boardBounds);
  const usbPos = overrides?.usb
    ? { x: PCB_ORIGIN_X + overrides.usb.x, y: PCB_ORIGIN_Y + overrides.usb.y }
    : defaultUsbPos;
  // USB-C connector rotation: port opening must face OUTWARD from the board edge
  // The GCT USB4085 footprint has the port opening in the -Y direction (top of footprint)
  // So we rotate it so the opening points away from the board:
  //   back (top edge):  180° — port faces up/away from board
  //   left:             90°  — port faces left
  //   right:           -90°  — port faces right
  //   top:              0°   — port faces up (default)
  const usbRotation = connectorSide === 'back' ? 180 : connectorSide === 'left' ? 90 : connectorSide === 'right' ? -90 : 0;

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
    if (overrides?.battery) {
      batX = PCB_ORIGIN_X + overrides.battery.x;
      batY = PCB_ORIGIN_Y + overrides.battery.y;
    } else if (connectorSide === 'left') {
      batX = olMinX + 10;
      batY = mcuY2;
    } else if (connectorSide === 'right') {
      batX = olMaxX - 10;
      batY = mcuY2;
    } else {
      batX = olMaxX - 15;
      batY = mcuY2;
    }

    // Battery connector rotation: opening faces outward from nearest board edge
    const batRotation = connectorSide === 'back' ? 180 : connectorSide === 'left' ? 90 : connectorSide === 'right' ? -90 : 0;

    w(`  (footprint "Connector_JST:JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal"`);
    w(`    (layer "F.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (at ${n(batX)} ${n(batY)}${batRotation ? ` ${batRotation}` : ''})`);
    w(`    (property "Reference" "BT1" (at 0 -3) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
    w(`    (property "Value" "Battery" (at 0 3) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);
    w(`    (pad "1" thru_hole circle (at 0 0) (size 1.75 1.75) (drill 1.0) (layers ${allCopperLayers}) (net ${netIndex('VBAT')} "VBAT") (uuid "${uuid()}"))`);
    w(`    (pad "2" thru_hole circle (at 2 0) (size 1.75 1.75) (drill 1.0) (layers ${allCopperLayers}) (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
    w(`  )`);
  }

  // ── Charger IC (if battery enabled and charger selected) ──
  if (config.power.battery && config.power.chargerIc) {
    const chgOverride = overrides?.components?.find((c: any) => c.type === 'charger');
    let chgX = chgOverride ? PCB_ORIGIN_X + chgOverride.x : (mcuX + 15);
    let chgY = chgOverride ? PCB_ORIGIN_Y + chgOverride.y : mcuY2;

    // Load charger data for package info
    let chgFootprint = 'Package_TO_SOT_SMD:SOT-23-5'; // MCP73831 default
    let chgPkgInfo: any = null;
    try {
      const chgData = loadComponent('chargers', config.power.chargerIc);
      if (chgData) {
        chgPkgInfo = (chgData as any).packageInfo;
        if (chgPkgInfo?.footprintRef) {
          chgFootprint = chgPkgInfo.footprintRef;
        } else {
          const pkg = (chgData as any).package;
          const pkgStr = typeof pkg === 'string' ? pkg : pkg?.type ?? '';
          if (/qfn/i.test(pkgStr)) chgFootprint = 'Package_DFN_QFN:QFN-16-1EP_3.5x3.5mm_P0.5mm_EP2.15x2.15mm';
          else if (/sop-8|soic/i.test(pkgStr)) chgFootprint = 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm';
        }
      }
    } catch { /* use default */ }

    w(`  (footprint "${chgFootprint}"`);
    w(`    (layer "F.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (at ${n(chgX)} ${n(chgY)})`);
    w(`    (property "Reference" "U2" (at 0 -3) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
    w(`    (property "Value" "${config.power.chargerIc}" (at 0 3) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
    // Simplified pads: IN, VBAT, GND — exact pinout depends on charger IC
    w(`    (pad "1" smd rect (at -1.1 -0.65) (size 0.6 0.4) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('VBUS')} "VBUS") (uuid "${uuid()}"))`);
    w(`    (pad "2" smd rect (at -1.1 0) (size 0.6 0.4) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
    w(`    (pad "3" smd rect (at -1.1 0.65) (size 0.6 0.4) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('VBAT')} "VBAT") (uuid "${uuid()}"))`);
    w(`    (pad "4" smd rect (at 1.1 0) (size 0.6 0.4) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('VCC')} "VCC") (uuid "${uuid()}"))`);
    if (chgPkgInfo?.thermalPad) {
      const ep = chgPkgInfo.exposedPadSize ?? { width: 2.15, height: 2.15 };
      w(`    (pad "EP" smd rect (at 0 0) (size ${ep.width} ${ep.height}) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
    }
    const crtyd = chgPkgInfo ? (chgPkgInfo.dimensions?.width ?? 3.5) / 2 + 1 : 1.8;
    w(`    (fp_rect (start ${n(-crtyd)} ${n(-crtyd)}) (end ${n(crtyd)} ${n(crtyd)}) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
    w(`  )`);

    // Charger IC fanout vias (for QFN chargers on 4-layer boards)
    if (config.pcb.chargerFanout && is4Layer && chgPkgInfo) {
      const chgPitch = chgPkgInfo.pitch ?? 1;
      if (chgPitch <= 0.65 && chgPkgInfo.padsPerSide) {
        const bodySize = chgPkgInfo.dimensions?.width ?? 3.5;
        const pps = chgPkgInfo.padsPerSide;
        const innerOff = chgPitch <= 0.4 ? 0.8 : 1.0;
        const outerOff = chgPitch <= 0.4 ? 1.5 : 1.8;
        const vDia = 0.6, vDrill = 0.3;
        const chargerNets = [netIndex('VBUS'), netIndex('GND'), netIndex('VBAT'), netIndex('VCC')];

        const sides = [
          { dx: 0, dy: 1 },   // bottom
          { dx: 1, dy: 0 },   // right
          { dx: 0, dy: -1 },  // top
          { dx: -1, dy: 0 },  // left
        ];

        for (let sideIdx = 0; sideIdx < sides.length; sideIdx++) {
          const side = sides[sideIdx];
          for (let i = 0; i < pps; i++) {
            const padIdx = sideIdx * pps + i;
            const netIdx = chargerNets[padIdx % chargerNets.length] || 0;
            if (!netIdx) continue;

            let px: number, py: number;
            if (side.dy === 1) { px = -((pps - 1) * chgPitch) / 2 + i * chgPitch; py = bodySize / 2; }
            else if (side.dx === 1) { px = bodySize / 2; py = -((pps - 1) * chgPitch) / 2 + i * chgPitch; }
            else if (side.dy === -1) { px = ((pps - 1) * chgPitch) / 2 - i * chgPitch; py = -bodySize / 2; }
            else { px = -bodySize / 2; py = ((pps - 1) * chgPitch) / 2 - i * chgPitch; }

            const offset = (i % 2 === 0) ? innerOff : outerOff;
            const vx = chgX + px + side.dx * offset;
            const vy = chgY + py + side.dy * offset;

            w(`  (via (at ${n(vx)} ${n(vy)}) (size ${vDia}) (drill ${vDrill}) (layers ${viaCopperLayers}) (net ${netIdx}) (uuid "${uuid()}"))`);
            w(`  (segment (start ${n(chgX + px)} ${n(chgY + py)}) (end ${n(vx)} ${n(vy)}) (width 0.2) (layer "F.Cu") (net ${netIdx}) (uuid "${uuid()}"))`);
          }
        }
      }
    }
  }

  // ── Power button (slide switch) — oriented to face outward from nearest edge ──
  if ((config.physical as any)?.powerButton !== false) {
    // Determine power button position: near USB connector, offset slightly
    const pwrOverride = overrides?.components?.find((c: any) => c.type === 'power_button');
    const pwrX = pwrOverride ? PCB_ORIGIN_X + pwrOverride.x : (usbPos.x + (connectorSide === 'back' ? 12 : 0));
    const pwrY = pwrOverride ? PCB_ORIGIN_Y + pwrOverride.y : (usbPos.y + (connectorSide === 'left' || connectorSide === 'right' ? 12 : 0));

    // Calculate rotation: the switch opening must face the nearest board edge
    // Determine which edge this button is closest to
    const distToTop = pwrY - olMinY;
    const distToBottom = olMaxY - pwrY;
    const distToLeft = pwrX - olMinX;
    const distToRight = olMaxX - pwrX;
    const minEdgeDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

    let pwrRotation = 0;
    if (minEdgeDist === distToTop) pwrRotation = 180;        // nearest to top/rear → face up
    else if (minEdgeDist === distToBottom) pwrRotation = 0;   // nearest to bottom → face down
    else if (minEdgeDist === distToLeft) pwrRotation = 90;    // nearest to left → face left
    else if (minEdgeDist === distToRight) pwrRotation = -90;  // nearest to right → face right

    w(`  (footprint "Button_Switch_SMD:SW_SPDT_CK-JS102011SAQN"`);
    w(`    (layer "F.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (at ${n(pwrX)} ${n(pwrY)}${pwrRotation ? ` ${pwrRotation}` : ''})`);
    w(`    (property "Reference" "SW_PWR" (at 0 -3) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
    w(`    (property "Value" "Power" (at 0 3) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
    w(`    (pad "1" smd rect (at -2.5 0) (size 1 1.5) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('VBAT')} "VBAT") (uuid "${uuid()}"))`);
    w(`    (pad "2" smd rect (at 0 0) (size 1 1.5) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('VCC')} "VCC") (uuid "${uuid()}"))`);
    w(`    (pad "3" smd rect (at 2.5 0) (size 1 1.5) (layers "F.Cu" "F.Paste" "F.Mask") (net 0 "") (uuid "${uuid()}"))`);
    w(`    (fp_rect (start -4 -2) (end 4 2) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
    w(`  )`);
  }

  // ── RGB Underglow LEDs — placed around the perimeter of the PCB on B.Cu ──
  if (config.features?.rgbUnderglow) {
    const ledCount = config.features.underglow?.ledCount || 12;
    const boardCenterX = (olMinX + olMaxX) / 2;
    const boardCenterY = (olMinY + olMaxY) / 2;
    const boardW = olMaxX - olMinX;
    const boardH = olMaxY - olMinY;
    const perimeter = 2 * (boardW + boardH);
    const ledSpacing = perimeter / ledCount;
    const inset = 3; // mm inset from board edge

    // Distribute LEDs evenly around the perimeter
    for (let i = 0; i < ledCount; i++) {
      const dist = i * ledSpacing;
      let lx: number, ly: number, lRot = 0;

      if (dist < boardW) {
        // Top edge (left to right)
        lx = olMinX + dist;
        ly = olMinY + inset;
        lRot = 0;
      } else if (dist < boardW + boardH) {
        // Right edge (top to bottom)
        lx = olMaxX - inset;
        ly = olMinY + (dist - boardW);
        lRot = 90;
      } else if (dist < 2 * boardW + boardH) {
        // Bottom edge (right to left)
        lx = olMaxX - (dist - boardW - boardH);
        ly = olMaxY - inset;
        lRot = 180;
      } else {
        // Left edge (bottom to top)
        lx = olMinX + inset;
        ly = olMaxY - (dist - 2 * boardW - boardH);
        lRot = 270;
      }

      const ledIdx = i + 1;
      w(`  (footprint "LED_SMD:LED_SK6812MINI-E"`);
      w(`    (layer "B.Cu")`);
      w(`    (uuid "${uuid()}")`);
      w(`    (at ${n(lx)} ${n(ly)}${lRot ? ` ${lRot}` : ''})`);
      w(`    (property "Reference" "UG${ledIdx}" (at 0 -2) (layer "B.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
      w(`    (property "Value" "SK6812MINI-E" (at 0 2) (layer "B.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))`);
      w(`    (pad "1" smd rect (at -2.45 -0.75) (size 0.9 0.9) (layers "B.Cu" "B.Paste" "B.Mask") (net ${netIndex('VCC')} "VCC") (uuid "${uuid()}"))`);
      w(`    (pad "2" smd rect (at -2.45 0.75) (size 0.9 0.9) (layers "B.Cu" "B.Paste" "B.Mask") (net 0 "") (uuid "${uuid()}"))`);
      w(`    (pad "3" smd rect (at 2.45 0.75) (size 0.9 0.9) (layers "B.Cu" "B.Paste" "B.Mask") (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
      w(`    (pad "4" smd rect (at 2.45 -0.75) (size 0.9 0.9) (layers "B.Cu" "B.Paste" "B.Mask") (net 0 "") (uuid "${uuid()}"))`);
      w(`    (fp_rect (start -3 -1.5) (end 3 1.5) (stroke (width 0.05) (type default)) (fill none) (layer "B.CrtYd") (uuid "${uuid()}"))`);
      w(`  )`);
    }
  }

  // ── Mounting holes — use layout overrides if available, otherwise auto-calculate ──
  let screwPositions: ScrewPosition[];
  if (overrides?.screws && overrides.screws.length > 0) {
    screwPositions = overrides.screws.map(s => ({ x: PCB_ORIGIN_X + s.x, y: PCB_ORIGIN_Y + s.y, label: s.id }));
  } else {
    const componentPositions = collectComponentPositions(config, boardBounds);
    screwPositions = calculateScrewPositions(
      layout,
      config,
      { minX: olMinX, minY: olMinY, maxX: olMaxX, maxY: olMaxY },
      componentPositions,
    );
  }

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

  // ── Copper zone fills for 4-layer boards ──
  // Ground plane on In1.Cu, power plane on In2.Cu
  // These give Freerouting pre-filled planes for power/ground routing
  if (is4Layer) {
    const zoneMargin = 1; // 1mm inset from board edge
    const zMinX = olMinX + zoneMargin;
    const zMinY = olMinY + zoneMargin;
    const zMaxX = olMaxX - zoneMargin;
    const zMaxY = olMaxY - zoneMargin;

    // GND zone on In1.Cu
    w(`  (zone`);
    w(`    (net ${netIndex('GND')})`);
    w(`    (net_name "GND")`);
    w(`    (layer "In1.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (hatch edge 0.5)`);
    w(`    (connect_pads (clearance 0.4))`);
    w(`    (min_thickness 0.2)`);
    w(`    (fill yes (thermal_gap 0.3) (thermal_bridge_width 0.3))`);
    w(`    (polygon`);
    w(`      (pts (xy ${n(zMinX)} ${n(zMinY)}) (xy ${n(zMaxX)} ${n(zMinY)}) (xy ${n(zMaxX)} ${n(zMaxY)}) (xy ${n(zMinX)} ${n(zMaxY)}))`);
    w(`    )`);
    w(`  )`);

    // VCC zone on In2.Cu
    w(`  (zone`);
    w(`    (net ${netIndex('VCC')})`);
    w(`    (net_name "VCC")`);
    w(`    (layer "In2.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (hatch edge 0.5)`);
    w(`    (connect_pads (clearance 0.4))`);
    w(`    (min_thickness 0.2)`);
    w(`    (fill yes (thermal_gap 0.3) (thermal_bridge_width 0.3))`);
    w(`    (polygon`);
    w(`      (pts (xy ${n(zMinX)} ${n(zMinY)}) (xy ${n(zMaxX)} ${n(zMinY)}) (xy ${n(zMaxX)} ${n(zMaxY)}) (xy ${n(zMinX)} ${n(zMaxY)}))`);
    w(`    )`);
    w(`  )`);
  }

  // Also add a GND zone on B.Cu for both 2-layer and 4-layer boards
  {
    const zMargin = 1;
    w(`  (zone`);
    w(`    (net ${netIndex('GND')})`);
    w(`    (net_name "GND")`);
    w(`    (layer "B.Cu")`);
    w(`    (uuid "${uuid()}")`);
    w(`    (hatch edge 0.5)`);
    w(`    (connect_pads (clearance 0.4))`);
    w(`    (min_thickness 0.2)`);
    w(`    (fill yes (thermal_gap 0.3) (thermal_bridge_width 0.3))`);
    w(`    (polygon`);
    w(`      (pts (xy ${n(olMinX + zMargin)} ${n(olMinY + zMargin)}) (xy ${n(olMaxX - zMargin)} ${n(olMinY + zMargin)}) (xy ${n(olMaxX - zMargin)} ${n(olMaxY - zMargin)}) (xy ${n(olMinX + zMargin)} ${n(olMaxY - zMargin)}))`);
    w(`    )`);
    w(`  )`);
  }

  w(`)`);
  return { pcb: lines.join('\n'), screwPositions, warnings: pcbWarnings };
}

function n(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  const s = v.toFixed(4);
  return s.replace(/\.?0+$/, '');
}

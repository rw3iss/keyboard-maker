/**
 * Data-driven MCU footprint and fanout via generation.
 *
 * Supports two MCU form factors:
 *   - "bare-chip": QFN/QFP ICs — SMD pads around perimeter, optional fanout vias
 *   - "module": Dev board modules (pro-micro, XIAO, etc.) — through-hole DIP pins
 *
 * Falls back gracefully with warnings when MCU data is incomplete.
 */

import type { BuildConfig, SwitchMatrix, McuData, McuPackage, McuPinMap, McuBoardPins } from '../shared/types.js';

export type McuFormType = 'bare-chip' | 'module';

export interface McuFootprintContext {
  mcuX: number;
  mcuY: number;
  matrix: SwitchMatrix;
  netNames: string[];
  netIndex: (name: string) => number;
  config: BuildConfig;
  is4Layer: boolean;
  allCopperLayers: string;
  viaCopperLayers: string;
  w: (line: string) => void;
  uuid: () => string;
  n: (v: number) => string;
}

export interface McuFootprintResult {
  warnings: string[];
}

/** Classify an MCU as bare-chip or module based on available data. */
export function classifyMcu(mcu: McuData): McuFormType {
  if (mcu.package && mcu.pinMap) return 'bare-chip';
  if (mcu.boardPins) return 'module';
  // Heuristic: if formFactor mentions qfn/qfp/bga, treat as bare-chip
  if (mcu.formFactor && /qfn|qfp|bga/i.test(mcu.formFactor) && mcu.package) return 'bare-chip';
  return 'module';
}

// ── Bare Chip (QFN/QFP) ──────────────────────────────────────────────

/** Generate a QFN/QFP bare-chip footprint with proper pin assignments. */
export function generateBareChipFootprint(mcu: McuData, ctx: McuFootprintContext): McuFootprintResult {
  const warnings: string[] = [];
  const { mcuX, mcuY, matrix, netNames, netIndex, w, uuid, n } = ctx;
  const pkg = mcu.package!;
  const pinMap = mcu.pinMap;

  const bodySize = pkg.dimensions.width;
  const pitch = pkg.pitch;
  const padsPerSide = pkg.padsPerSide ?? Math.floor(pkg.padCount / 4);
  const totalPerimeter = padsPerSide * 4;
  const padW = pkg.padSize?.width ?? 0.3;
  const padH = pkg.padSize?.height ?? 0.75;
  const epSize = pkg.exposedPadSize ?? { width: bodySize * 0.8, height: bodySize * 0.8 };
  const footprintRef = pkg.footprintRef ?? `Package_DFN_QFN:QFN-${pkg.padCount}-1EP_${bodySize}x${bodySize}mm_P${pitch}mm`;

  const mcuPadCount = matrix.rows + matrix.cols;

  // Build set of special (non-GPIO) pads
  const specialPads = new Map<number | string, { net: string }>();
  if (pinMap) {
    for (const p of pinMap.vcc) specialPads.set(p, { net: 'VCC' });
    for (const p of pinMap.gnd) specialPads.set(p, { net: 'GND' });
    for (const p of (pinMap.usbDp ?? [])) specialPads.set(p, { net: 'USB_DP' });
    for (const p of (pinMap.usbDm ?? [])) specialPads.set(p, { net: 'USB_DM' });
    for (const p of (pinMap.vbus ?? [])) specialPads.set(p, { net: 'VBUS' });
    for (const p of (pinMap.reset ?? [])) specialPads.set(p, { net: '' }); // no-connect for reset
  }

  // Assign GPIO nets to non-special pads in order
  const padNets = new Map<number, { idx: number; name: string }>();
  let gpioIdx = 0;
  for (let p = 1; p <= totalPerimeter; p++) {
    const special = specialPads.get(p);
    if (special) {
      const idx = special.net ? netIndex(special.net) : 0;
      padNets.set(p, { idx, name: special.net });
    } else if (gpioIdx < mcuPadCount) {
      const netIdx = gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1;
      padNets.set(p, { idx: netIdx, name: netNames[netIdx] ?? '' });
      gpioIdx++;
    }
    // else: unassigned pad (net 0)
  }

  if (gpioIdx < mcuPadCount) {
    warnings.push(`MCU has fewer available pads (${gpioIdx}) than needed for matrix (${mcuPadCount} GPIOs)`);
  }

  // Emit footprint
  w(`  (footprint "${footprintRef}"`);
  w(`    (layer "F.Cu")`);
  w(`    (uuid "${uuid()}")`);
  w(`    (at ${n(mcuX)} ${n(mcuY)})`);
  w(`    (property "Reference" "U1" (at 0 -5) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
  w(`    (property "Value" "${mcu.chip ?? mcu.name}" (at 0 5) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);

  // Generate pads for each side
  const sides = [
    { startPad: 1, dx: 0, dy: 1, padW, padH },                          // bottom
    { startPad: padsPerSide + 1, dx: 1, dy: 0, padW: padH, padH: padW }, // right (rotated)
    { startPad: 2 * padsPerSide + 1, dx: 0, dy: -1, padW, padH },       // top
    { startPad: 3 * padsPerSide + 1, dx: -1, dy: 0, padW: padH, padH: padW }, // left (rotated)
  ];

  for (const side of sides) {
    for (let i = 0; i < padsPerSide; i++) {
      const padNum = side.startPad + i;
      if (padNum > totalPerimeter) break;

      let px: number, py: number;
      if (side.dy === 1) { // bottom
        px = -((padsPerSide - 1) * pitch) / 2 + i * pitch;
        py = bodySize / 2;
      } else if (side.dx === 1) { // right
        px = bodySize / 2;
        py = -((padsPerSide - 1) * pitch) / 2 + i * pitch;
      } else if (side.dy === -1) { // top
        px = ((padsPerSide - 1) * pitch) / 2 - i * pitch;
        py = -bodySize / 2;
      } else { // left
        px = -bodySize / 2;
        py = ((padsPerSide - 1) * pitch) / 2 - i * pitch;
      }

      const net = padNets.get(padNum);
      const netAssign = net && net.idx > 0
        ? `(net ${net.idx} "${net.name}")`
        : `(net 0 "")`;

      w(`    (pad "${padNum}" smd roundrect (at ${n(px)} ${n(py)}) (size ${side.padW} ${side.padH}) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) ${netAssign} (uuid "${uuid()}"))`);
    }
  }

  // Exposed pad (GND)
  if (pkg.thermalPad) {
    w(`    (pad "${totalPerimeter + 1}" smd rect (at 0 0) (size ${epSize.width} ${epSize.height}) (layers "F.Cu" "F.Paste" "F.Mask") (net ${netIndex('GND')} "GND") (uuid "${uuid()}"))`);
  }

  // Courtyard
  const crtyd = bodySize / 2 + 1;
  w(`    (fp_rect (start ${n(-crtyd)} ${n(-crtyd)}) (end ${n(crtyd)} ${n(crtyd)}) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
  w(`  )`);

  return { warnings };
}

// ── Module (through-hole DIP) ─────────────────────────────────────────

/** Generate a through-hole module footprint (pro-micro, XIAO, etc.). */
export function generateModuleFootprint(mcu: McuData, ctx: McuFootprintContext): McuFootprintResult {
  const warnings: string[] = [];
  const { mcuX, mcuY, matrix, netNames, netIndex, allCopperLayers, w, uuid, n } = ctx;

  const bp = mcu.boardPins;
  if (!bp) {
    // No boardPins data — generate a generic DIP from gpioCount
    return generateGenericModuleFootprint(mcu, ctx);
  }

  const pitch = bp.pitch;
  const rowSpacing = bp.rowSpacing;
  const drill = bp.padDrill ?? 1.0;
  const padSize = bp.padSize ?? 1.7;
  const mcuPadCount = matrix.rows + matrix.cols;

  // Collect GPIO pins in order for matrix net assignment
  const gpioPins = bp.pins.filter(p => p.function === 'gpio');

  if (gpioPins.length < mcuPadCount) {
    warnings.push(`MCU module "${mcu.name}" has ${gpioPins.length} GPIO pins but matrix needs ${mcuPadCount}`);
  }

  // Build net assignments for each physical pin
  const pinNets = new Map<number, { idx: number; name: string }>();
  let gpioIdx = 0;
  for (const pin of bp.pins) {
    switch (pin.function) {
      case 'gpio':
        if (gpioIdx < mcuPadCount) {
          const netIdx = gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1;
          pinNets.set(pin.number, { idx: netIdx, name: netNames[netIdx] ?? '' });
          gpioIdx++;
        }
        break;
      case 'vcc':
        pinNets.set(pin.number, { idx: netIndex('VCC'), name: 'VCC' });
        break;
      case 'gnd':
        pinNets.set(pin.number, { idx: netIndex('GND'), name: 'GND' });
        break;
      case 'vbus':
        pinNets.set(pin.number, { idx: netIndex('VBUS'), name: 'VBUS' });
        break;
      case 'usb_dp':
        pinNets.set(pin.number, { idx: netIndex('USB_DP'), name: 'USB_DP' });
        break;
      case 'usb_dm':
        pinNets.set(pin.number, { idx: netIndex('USB_DM'), name: 'USB_DM' });
        break;
      case 'battery':
        pinNets.set(pin.number, { idx: netIndex('VBAT'), name: 'VBAT' });
        break;
      // reset, nc: leave unconnected
    }
  }

  // Footprint name
  const footprintName = `Module:${mcu.formFactor ?? 'DIP'}_${bp.pinCount}pin_P${pitch}mm`;

  w(`  (footprint "${footprintName}"`);
  w(`    (layer "F.Cu")`);
  w(`    (uuid "${uuid()}")`);
  w(`    (at ${n(mcuX)} ${n(mcuY)})`);
  w(`    (property "Reference" "U1" (at 0 -5) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
  w(`    (property "Value" "${mcu.name}" (at 0 5) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);

  // Count pins per main row (rows 0 and 1) for y-positioning
  const mainRowPins = bp.pins.filter(p => p.row <= 1);
  const pinsPerMainRow = Math.max(
    ...([0, 1].map(r => mainRowPins.filter(p => p.row === r).length)),
    1,
  );
  const mainHeight = (pinsPerMainRow - 1) * pitch;

  for (const pin of bp.pins) {
    let x: number, y: number;
    if (pin.row <= 1) {
      // Rows 0/1: left and right columns
      x = pin.row === 0 ? -rowSpacing / 2 : rowSpacing / 2;
      y = -mainHeight / 2 + pin.position * pitch;
    } else {
      // Row 2+: bottom edge castellated pads, centered horizontally
      const edgePins = bp.pins.filter(p => p.row === pin.row);
      const edgeWidth = (edgePins.length - 1) * pitch;
      x = -edgeWidth / 2 + pin.position * pitch;
      y = mainHeight / 2 + pitch * 2; // below the main rows
    }

    const net = pinNets.get(pin.number);
    const netAssign = net && net.idx > 0
      ? `(net ${net.idx} "${net.name}")`
      : `(net 0 "")`;

    w(`    (pad "${pin.number}" thru_hole circle (at ${n(x)} ${n(y)}) (size ${padSize} ${padSize}) (drill ${drill}) (layers ${allCopperLayers}) ${netAssign} (uuid "${uuid()}"))`);
  }

  // Courtyard
  const cw = rowSpacing / 2 + 2;
  const ch = mainHeight / 2 + pitch * 2 + 2;
  w(`    (fp_rect (start ${n(-cw)} ${n(-ch)}) (end ${n(cw)} ${n(ch)}) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
  w(`  )`);

  return { warnings };
}

/** Fallback: generate a generic DIP-style footprint from gpioCount. */
function generateGenericModuleFootprint(mcu: McuData, ctx: McuFootprintContext): McuFootprintResult {
  const warnings: string[] = [];
  const { mcuX, mcuY, matrix, netNames, netIndex, allCopperLayers, w, uuid, n } = ctx;

  warnings.push(`MCU "${mcu.name}" has no boardPins data — generating generic through-hole footprint`);

  const gpioCount = mcu.gpioCount ?? mcu.gpioPins?.length ?? 20;
  // Add ~4 pins for power/GND/etc
  const totalPins = Math.max(gpioCount + 4, 12);
  const pinsPerRow = Math.ceil(totalPins / 2);
  const pitch = 2.54;
  const rowSpacing = 15.24; // standard DIP width
  const drill = 1.0;
  const padSize = 1.7;

  const mcuPadCount = matrix.rows + matrix.cols;

  w(`  (footprint "Module:Generic_DIP_${totalPins}pin"`);
  w(`    (layer "F.Cu")`);
  w(`    (uuid "${uuid()}")`);
  w(`    (at ${n(mcuX)} ${n(mcuY)})`);
  w(`    (property "Reference" "U1" (at 0 -5) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))`);
  w(`    (property "Value" "${mcu.name}" (at 0 5) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))`);

  // Pin 1 = VCC, pin 2 = GND, rest = GPIO
  let gpioIdx = 0;
  for (let padNum = 1; padNum <= totalPins; padNum++) {
    const row = padNum <= pinsPerRow ? 0 : 1;
    const pos = padNum <= pinsPerRow ? padNum - 1 : padNum - pinsPerRow - 1;
    const x = row === 0 ? -rowSpacing / 2 : rowSpacing / 2;
    const y = -((pinsPerRow - 1) * pitch) / 2 + pos * pitch;

    let netAssign: string;
    if (padNum === 1) {
      netAssign = `(net ${netIndex('VCC')} "VCC")`;
    } else if (padNum === 2) {
      netAssign = `(net ${netIndex('GND')} "GND")`;
    } else if (gpioIdx < mcuPadCount) {
      const netIdx = gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1;
      netAssign = `(net ${netIdx} "${netNames[netIdx] ?? ''}")`;
      gpioIdx++;
    } else {
      netAssign = `(net 0 "")`;
    }

    w(`    (pad "${padNum}" thru_hole circle (at ${n(x)} ${n(y)}) (size ${padSize} ${padSize}) (drill ${drill}) (layers ${allCopperLayers}) ${netAssign} (uuid "${uuid()}"))`);
  }

  const cw = rowSpacing / 2 + 2;
  const ch = (pinsPerRow * pitch) / 2 + 2;
  w(`    (fp_rect (start ${n(-cw)} ${n(-ch)}) (end ${n(cw)} ${n(ch)}) (stroke (width 0.05) (type default)) (fill none) (layer "F.CrtYd") (uuid "${uuid()}"))`);
  w(`  )`);

  return { warnings };
}

// ── Fanout Vias ───────────────────────────────────────────────────────

export interface FanoutResult {
  generated: boolean;
  warnings: string[];
}

/** Generate staggered fanout vias for QFN/QFP bare-chip MCUs on 4-layer boards. */
export function generateFanoutVias(mcu: McuData, ctx: McuFootprintContext): FanoutResult {
  const { mcuX, mcuY, matrix, config, netNames, netIndex, w, uuid, n, is4Layer, viaCopperLayers } = ctx;
  const warnings: string[] = [];

  if (!config.pcb.mcuFanout) {
    return { generated: false, warnings: [] };
  }

  if (classifyMcu(mcu) === 'module') {
    return { generated: false, warnings: ['Fanout vias skipped: MCU is a through-hole module (not needed)'] };
  }

  if (!is4Layer) {
    return { generated: false, warnings: ['Fanout vias skipped: only applicable to 4-layer boards'] };
  }

  const pkg = mcu.package!;
  const pinMap = mcu.pinMap;
  if (!pinMap) {
    warnings.push('Fanout vias skipped: MCU data missing pinMap');
    return { generated: false, warnings };
  }

  if (pkg.pitch > 0.65) {
    return { generated: false, warnings: [`Fanout vias skipped: pad pitch ${pkg.pitch}mm is wide enough for direct routing`] };
  }

  const bodySize = pkg.dimensions.width;
  const pitch = pkg.pitch;
  const padsPerSide = pkg.padsPerSide ?? Math.floor(pkg.padCount / 4);
  const totalPerimeter = padsPerSide * 4;
  const mcuPadCount = matrix.rows + matrix.cols;

  // Stagger distances: alternate inner/outer to avoid via overlap
  // For 0.5mm pitch: 1.0mm inner, 1.8mm outer gives 0.8mm stagger
  // For 0.4mm pitch: 0.8mm inner, 1.5mm outer gives 0.7mm stagger
  const fanoutInner = pitch <= 0.4 ? 0.8 : 1.0;
  const fanoutOuter = pitch <= 0.4 ? 1.5 : 1.8;
  const fanoutVia = { dia: 0.6, drill: 0.3 };

  // Build pad → net map (same logic as footprint generation)
  const specialPads = new Set<number>();
  const padNetMap = new Map<number, number>();
  if (pinMap) {
    for (const p of pinMap.vcc) { specialPads.add(p as number); padNetMap.set(p as number, netIndex('VCC')); }
    for (const p of pinMap.gnd) { if (typeof p === 'number') { specialPads.add(p); padNetMap.set(p, netIndex('GND')); } }
    for (const p of (pinMap.usbDp ?? [])) { specialPads.add(p); padNetMap.set(p, netIndex('USB_DP')); }
    for (const p of (pinMap.usbDm ?? [])) { specialPads.add(p); padNetMap.set(p, netIndex('USB_DM')); }
    for (const p of (pinMap.vbus ?? [])) { specialPads.add(p); padNetMap.set(p, netIndex('VBUS')); }
    // reset pads: skip (no fanout needed)
    for (const p of (pinMap.reset ?? [])) specialPads.add(p);
  }

  // Assign GPIO pads
  let gpioIdx = 0;
  for (let p = 1; p <= totalPerimeter; p++) {
    if (specialPads.has(p)) continue;
    if (gpioIdx < mcuPadCount) {
      const netIdx = gpioIdx < matrix.rows ? gpioIdx + 1 : matrix.rows + (gpioIdx - matrix.rows) + 1;
      padNetMap.set(p, netIdx);
      gpioIdx++;
    }
  }

  const sides = [
    { startPad: 1, count: padsPerSide, dx: 0, dy: 1 },
    { startPad: padsPerSide + 1, count: padsPerSide, dx: 1, dy: 0 },
    { startPad: 2 * padsPerSide + 1, count: padsPerSide, dx: 0, dy: -1 },
    { startPad: 3 * padsPerSide + 1, count: padsPerSide, dx: -1, dy: 0 },
  ];

  let viaCount = 0;
  for (const side of sides) {
    for (let i = 0; i < side.count; i++) {
      const padNum = side.startPad + i;
      if (padNum > totalPerimeter) break;

      const padNetIdx = padNetMap.get(padNum);
      if (!padNetIdx || padNetIdx <= 0) continue;

      let px: number, py: number;
      if (side.dy === 1) {
        px = -((padsPerSide - 1) * pitch) / 2 + i * pitch;
        py = bodySize / 2;
      } else if (side.dx === 1) {
        px = bodySize / 2;
        py = -((padsPerSide - 1) * pitch) / 2 + i * pitch;
      } else if (side.dy === -1) {
        px = ((padsPerSide - 1) * pitch) / 2 - i * pitch;
        py = -bodySize / 2;
      } else {
        px = -bodySize / 2;
        py = ((padsPerSide - 1) * pitch) / 2 - i * pitch;
      }

      const offset = (i % 2 === 0) ? fanoutInner : fanoutOuter;
      const vx = mcuX + px + side.dx * offset;
      const vy = mcuY + py + side.dy * offset;

      w(`  (via (at ${n(vx)} ${n(vy)}) (size ${fanoutVia.dia}) (drill ${fanoutVia.drill}) (layers ${viaCopperLayers}) (net ${padNetIdx}) (uuid "${uuid()}"))`);

      const padAbsX = mcuX + px;
      const padAbsY = mcuY + py;
      w(`  (segment (start ${n(padAbsX)} ${n(padAbsY)}) (end ${n(vx)} ${n(vy)}) (width 0.2) (layer "F.Cu") (net ${padNetIdx}) (uuid "${uuid()}"))`);
      viaCount++;
    }
  }

  if (viaCount > 0) {
    warnings.push(`Generated ${viaCount} fanout vias (staggered ${fanoutInner}/${fanoutOuter}mm at ${pitch}mm pitch)`);
  }

  return { generated: viaCount > 0, warnings };
}

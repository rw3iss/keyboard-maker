/**
 * Case & plate generator — produces OpenSCAD (.scad) files from a keyboard
 * layout and build configuration, then optionally compiles them to STL via
 * the openscad CLI.
 */

import type { KeyboardLayout, BuildConfig, Key } from '../shared/types.js';
import { SWITCH_SPACING, SWITCH_CUTOUT_MM } from '../shared/constants.js';
import {
  calculateScrewPositions,
  collectComponentPositions,
  type ScrewPosition,
} from '../shared/screw-placement.js';
import { writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

/** PCB origin offset matching the PCB generator (mm). */
const PCB_ORIGIN_X = 25;
const PCB_ORIGIN_Y = 25;

export interface CaseOptions {
  layout: KeyboardLayout;
  config: BuildConfig;
  outputDir: string;
  /** Case wall thickness in mm */
  wallThickness?: number;
  /** Case bottom thickness in mm */
  bottomThickness?: number;
  /** Case inner height (above PCB) in mm */
  innerHeight?: number;
  /** Corner radius in mm */
  cornerRadius?: number;
}

interface BoundingBox {
  width: number;
  height: number;
}

interface KeyCenter {
  key: Key;
  cx: number;
  cy: number;
  cutW: number;
  cutH: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute bounding box of the layout in mm for the given switch type. */
function computeBoundingBox(layout: KeyboardLayout, config: BuildConfig): BoundingBox {
  const spacing = SWITCH_SPACING[config.switches.type];
  let maxX = 0;
  let maxY = 0;
  for (const key of layout.keys) {
    const right = (key.x + key.width) * spacing.x;
    const bottom = (key.y + key.height) * spacing.y;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  return { width: maxX, height: maxY };
}

/** Compute the center position (in mm) and cutout size for each key. */
function computeKeyCenters(layout: KeyboardLayout, config: BuildConfig): KeyCenter[] {
  const spacing = SWITCH_SPACING[config.switches.type];
  const cutout = SWITCH_CUTOUT_MM[config.switches.type];
  return layout.keys.map(key => ({
    key,
    cx: (key.x + key.width / 2) * spacing.x,
    cy: (key.y + key.height / 2) * spacing.y,
    cutW: cutout.width,
    cutH: cutout.height,
  }));
}

/**
 * Compute smart screw positions that match the PCB and plate generators.
 * Uses the same board bounds logic as the PCB generator.
 */
function computeSmartScrewPositions(
  layout: KeyboardLayout,
  config: BuildConfig,
): ScrewPosition[] {
  const spacing = SWITCH_SPACING[config.switches.type];

  // Replicate the PCB generator's bounding-box logic
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const key of layout.keys) {
    const absX = PCB_ORIGIN_X + (key.x + key.width / 2) * spacing.x;
    const absY = PCB_ORIGIN_Y + (key.y + key.height / 2) * spacing.y;
    const halfX = spacing.x / 2;
    const halfY = spacing.y / 2;
    minX = Math.min(minX, absX - halfX);
    minY = Math.min(minY, absY - halfY);
    maxX = Math.max(maxX, absX + halfX);
    maxY = Math.max(maxY, absY + halfY);
  }

  const margin = 8;
  const boardBounds = {
    minX: minX - margin,
    minY: minY - margin,
    maxX: maxX + margin,
    maxY: maxY + margin,
  };

  // Use layout overrides for screw positions if configured
  const overrides = config.layoutOverrides;
  if (overrides?.screws && overrides.screws.length > 0) {
    return overrides.screws.map((s: any) => ({
      x: PCB_ORIGIN_X + s.x,
      y: PCB_ORIGIN_Y + s.y,
      label: s.id,
    }));
  }

  const componentPositions = collectComponentPositions(config, { minX, minY, maxX, maxY });
  return calculateScrewPositions(layout, config, boardBounds, componentPositions);
}

// ---------------------------------------------------------------------------
// Cherry-style stabilizer cutout dimensions (mm)
// ---------------------------------------------------------------------------
const STAB_CUTOUT_W = 3.3;
const STAB_CUTOUT_H = 14;
/** Distance from key center to each stab center (varies with key width). */
function stabOffsets(keyWidthU: number): number | null {
  if (keyWidthU >= 6.25) return 50;    // spacebar
  if (keyWidthU >= 3) return 19.05;    // 3u+
  if (keyWidthU >= 2) return 11.938;   // 2u
  return null;
}

// ---------------------------------------------------------------------------
// OpenSCAD generators
// ---------------------------------------------------------------------------

function generatePlateScad(
  layout: KeyboardLayout,
  config: BuildConfig,
  cornerRadius: number,
): string {
  const bb = computeBoundingBox(layout, config);
  const keys = computeKeyCenters(layout, config);
  const plateThickness = config.plate.thickness || 1.5;
  const margin = 7.5; // extra material around outer keys
  const plateW = bb.width + margin * 2;
  const plateH = bb.height + margin * 2;
  const holeRadius = 1.25; // M2.5 screw

  // Use smart screw positions
  const screwPositions = computeSmartScrewPositions(layout, config);

  const lines: string[] = [];
  lines.push('// Auto-generated keyboard switch plate');
  lines.push(`// Layout: ${layout.name} (${layout.keys.length} keys)`);
  lines.push(`// Switch type: ${config.switches.type}`);
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('$fn = 32;');
  lines.push('');
  lines.push(`plate_w = ${plateW.toFixed(2)};`);
  lines.push(`plate_h = ${plateH.toFixed(2)};`);
  lines.push(`plate_t = ${plateThickness.toFixed(2)};`);
  lines.push(`corner_r = ${cornerRadius.toFixed(2)};`);
  lines.push(`margin = ${margin.toFixed(2)};`);
  lines.push('');
  lines.push('// ----- Plate body -----');
  lines.push('difference() {');
  lines.push('  // Rounded-corner plate');
  lines.push(`  minkowski() {`);
  lines.push(`    cube([plate_w - 2*corner_r, plate_h - 2*corner_r, plate_t / 2]);`);
  lines.push(`    translate([corner_r, corner_r, 0])`);
  lines.push(`      cylinder(r = corner_r, h = plate_t / 2);`);
  lines.push(`  }`);
  lines.push('');

  // Switch cutouts
  lines.push('  // ----- Switch cutouts -----');
  for (const k of keys) {
    const xPos = (k.cx + margin).toFixed(3);
    const yPos = (k.cy + margin).toFixed(3);
    lines.push(`  // Key "${k.key.labels[0] || k.key.id}" at (${k.key.x}, ${k.key.y})`);
    lines.push(`  translate([${xPos} - ${(k.cutW / 2).toFixed(3)}, ${yPos} - ${(k.cutH / 2).toFixed(3)}, -0.1])`);
    lines.push(`    cube([${k.cutW.toFixed(3)}, ${k.cutH.toFixed(3)}, plate_t + 0.2]);`);

    // Stabilizer cutouts for wide keys
    const so = stabOffsets(k.key.width);
    if (so !== null) {
      lines.push(`  // Stabilizer cutouts for ${k.key.width}u key`);
      for (const sign of [-1, 1]) {
        const sx = (k.cx + margin + sign * so).toFixed(3);
        const sy = (k.cy + margin).toFixed(3);
        lines.push(`  translate([${sx} - ${(STAB_CUTOUT_W / 2).toFixed(3)}, ${sy} - ${(STAB_CUTOUT_H / 2).toFixed(3)}, -0.1])`);
        lines.push(`    cube([${STAB_CUTOUT_W.toFixed(3)}, ${STAB_CUTOUT_H.toFixed(3)}, plate_t + 0.2]);`);
      }
    }
  }

  // Mounting holes — smart screw positions
  lines.push('');
  lines.push('  // ----- Mounting holes (smart placement) -----');
  for (const screw of screwPositions) {
    const hx = screw.x.toFixed(3);
    const hy = screw.y.toFixed(3);
    lines.push(`  // ${screw.label}`);
    lines.push(`  translate([${hx}, ${hy}, -0.1])`);
    lines.push(`    cylinder(r = ${holeRadius.toFixed(3)}, h = plate_t + 0.2);`);
  }

  lines.push('}');
  return lines.join('\n') + '\n';
}

function generateCaseScad(
  layout: KeyboardLayout,
  config: BuildConfig,
  wallThickness: number,
  bottomThickness: number,
  innerHeight: number,
  cornerRadius: number,
): string {
  const bb = computeBoundingBox(layout, config);
  const margin = 7.5;
  const plateW = bb.width + margin * 2;
  const plateH = bb.height + margin * 2;
  const outerW = plateW + wallThickness * 2;
  const outerH = plateH + wallThickness * 2;
  const holeRadius = 1.25;
  const standoffRadius = 2.5;
  const usbCutoutW = 12;
  const usbCutoutH = 7;
  const hasBattery = config.connectivity.bluetooth && config.power.battery;
  const batteryW = 35;
  const batteryD = 20;
  const batteryH = 8;

  // Use smart screw positions
  const screwPositions = computeSmartScrewPositions(layout, config);

  // Configurable front/rear height
  const plateThickness = config.plate?.thickness ?? 1.5;
  const pcbThickness = config.pcb?.thickness ?? 1.6;
  const minimalFrontHeight = bottomThickness + pcbThickness + plateThickness;
  const frontHeight = config.physical?.frontHeight ?? minimalFrontHeight;
  const rearHeight = config.physical?.rearHeight ?? (frontHeight + 3); // +3mm for USB connector clearance

  const totalHeight = rearHeight; // rear is the tallest point

  // Connector side for USB cutout
  const connectorSide = config.physical?.connectorSide ?? 'back';

  const lines: string[] = [];
  lines.push('// Auto-generated keyboard case');
  lines.push(`// Layout: ${layout.name} (${layout.keys.length} keys)`);
  lines.push(`// Switch type: ${config.switches.type}`);
  lines.push(`// Front height: ${frontHeight.toFixed(2)} mm`);
  lines.push(`// Rear height: ${rearHeight.toFixed(2)} mm`);
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('$fn = 32;');
  lines.push('');
  lines.push(`wall = ${wallThickness.toFixed(2)};`);
  lines.push(`bottom_t = ${bottomThickness.toFixed(2)};`);
  lines.push(`inner_h = ${(innerHeight).toFixed(2)};`);
  lines.push(`outer_w = ${outerW.toFixed(2)};`);
  lines.push(`outer_h = ${outerH.toFixed(2)};`);
  lines.push(`total_h = ${totalHeight.toFixed(2)};`);
  lines.push(`front_h = ${frontHeight.toFixed(2)};`);
  lines.push(`rear_h = ${rearHeight.toFixed(2)};`);
  lines.push(`corner_r = ${cornerRadius.toFixed(2)};`);
  lines.push(`plate_w = ${plateW.toFixed(2)};`);
  lines.push(`plate_h = ${plateH.toFixed(2)};`);
  lines.push('');
  lines.push('// ----- Case shell -----');
  lines.push('difference() {');
  lines.push('  // Outer shell with rounded corners');
  lines.push('  minkowski() {');
  lines.push('    cube([outer_w - 2*corner_r, outer_h - 2*corner_r, total_h / 2]);');
  lines.push('    translate([corner_r, corner_r, 0])');
  lines.push('      cylinder(r = corner_r, h = total_h / 2);');
  lines.push('  }');
  lines.push('');
  lines.push('  // Inner cavity');
  lines.push('  translate([wall, wall, bottom_t])');
  lines.push('    minkowski() {');
  lines.push(`      cube([plate_w - 2*corner_r, plate_h - 2*corner_r, inner_h + 0.1]);`);
  lines.push('      translate([corner_r, corner_r, 0])');
  lines.push(`        cylinder(r = corner_r, h = 0.01);`);
  lines.push('    }');
  lines.push('');

  // USB-C cutout — configurable side
  if (connectorSide === 'back') {
    lines.push('  // USB-C cutout (back edge)');
    const usbX = (outerW / 2 - usbCutoutW / 2).toFixed(3);
    const usbY = (outerH - wallThickness - 0.1).toFixed(3);
    const usbZ = (bottomThickness + 1).toFixed(3);
    lines.push(`  translate([${usbX}, ${usbY}, ${usbZ}])`);
    lines.push(`    cube([${usbCutoutW.toFixed(3)}, ${(wallThickness + 0.2).toFixed(3)}, ${usbCutoutH.toFixed(3)}]);`);
  } else if (connectorSide === 'left') {
    lines.push('  // USB-C cutout (left edge)');
    const usbX = (-0.1).toFixed(3);
    const usbY = (wallThickness + 5).toFixed(3);
    const usbZ = (bottomThickness + 1).toFixed(3);
    lines.push(`  translate([${usbX}, ${usbY}, ${usbZ}])`);
    lines.push(`    cube([${(wallThickness + 0.2).toFixed(3)}, ${usbCutoutW.toFixed(3)}, ${usbCutoutH.toFixed(3)}]);`);
  } else {
    // right
    lines.push('  // USB-C cutout (right edge)');
    const usbX = (outerW - wallThickness - 0.1).toFixed(3);
    const usbY = (wallThickness + 5).toFixed(3);
    const usbZ = (bottomThickness + 1).toFixed(3);
    lines.push(`  translate([${usbX}, ${usbY}, ${usbZ}])`);
    lines.push(`    cube([${(wallThickness + 0.2).toFixed(3)}, ${usbCutoutW.toFixed(3)}, ${usbCutoutH.toFixed(3)}]);`);
  }

  // Screw holes through the bottom — smart placement
  lines.push('');
  lines.push('  // ----- Screw holes (smart placement) -----');
  for (const screw of screwPositions) {
    const hx = screw.x.toFixed(3);
    const hy = screw.y.toFixed(3);
    lines.push(`  // ${screw.label}`);
    lines.push(`  translate([${hx}, ${hy}, -0.1])`);
    lines.push(`    cylinder(r = ${holeRadius.toFixed(3)}, h = bottom_t + 0.2);`);
  }

  lines.push('}');
  lines.push('');

  // PCB standoffs — no front standoffs, only rear/side positions
  const standoffHeight = bottomThickness + 3; // 3 mm PCB clearance
  lines.push('// ----- PCB standoff posts (no front standoffs) -----');
  for (const screw of screwPositions) {
    // Skip front standoffs — PCB sits directly on case bottom at the front
    if (screw.label === 'corner-tl' || screw.label === 'corner-tr' || screw.label === 'mid-top') {
      lines.push(`// Skipping front standoff at ${screw.label} — PCB rests on case bottom`);
      continue;
    }
    const hx = screw.x.toFixed(3);
    const hy = screw.y.toFixed(3);
    lines.push(`// ${screw.label}`);
    lines.push(`translate([${hx}, ${hy}, bottom_t])`);
    lines.push('  difference() {');
    lines.push(`    cylinder(r = ${standoffRadius.toFixed(3)}, h = ${(standoffHeight - bottomThickness).toFixed(3)});`);
    lines.push(`    translate([0, 0, -0.1])`);
    lines.push(`      cylinder(r = ${holeRadius.toFixed(3)}, h = ${(standoffHeight - bottomThickness + 0.2).toFixed(3)});`);
    lines.push('  }');
  }

  // Battery compartment
  if (hasBattery) {
    lines.push('');
    lines.push('// ----- Battery compartment -----');
    lines.push('// Recessed area in the bottom for battery');
    const batX = (wallThickness + 5).toFixed(3);
    const batY = (wallThickness + 5).toFixed(3);
    lines.push('difference() {');
    lines.push(`  translate([${batX}, ${batY}, bottom_t])`);
    lines.push(`    cube([${batteryW.toFixed(3)}, ${batteryD.toFixed(3)}, 0.8]);`);
    lines.push(`  translate([${batX}, ${batY}, bottom_t - 0.1])`);
    lines.push(`    cube([${batteryW.toFixed(3)}, ${batteryD.toFixed(3)}, ${batteryH.toFixed(3)}]);`);
    lines.push('}');
    lines.push(`// Battery pocket (cut into bottom)`);
    lines.push(`// Actual depth: ${batteryH} mm`);
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate OpenSCAD files for plate and case, optionally compile to STL.
 */
export function generateCase(opts: CaseOptions): {
  scadPlate: string;
  scadCase: string;
  stlPlate?: string;
  stlCase?: string;
} {
  const wallThickness = opts.wallThickness ?? 2.5;
  const bottomThickness = opts.bottomThickness ?? 2;
  const innerHeight = opts.innerHeight ?? 10;
  const cornerRadius = opts.cornerRadius ?? 3;

  const scadPlateContent = generatePlateScad(opts.layout, opts.config, cornerRadius);
  const scadCaseContent = generateCaseScad(
    opts.layout,
    opts.config,
    wallThickness,
    bottomThickness,
    innerHeight,
    cornerRadius,
  );

  const projectName = opts.config.project.name;
  const platePath = join(opts.outputDir, `${projectName}-plate.scad`);
  const casePath = join(opts.outputDir, `${projectName}-case.scad`);

  writeFileSync(platePath, scadPlateContent, 'utf-8');
  writeFileSync(casePath, scadCaseContent, 'utf-8');

  const result: { scadPlate: string; scadCase: string; stlPlate?: string; stlCase?: string } = {
    scadPlate: platePath,
    scadCase: casePath,
  };

  // Try to compile to STL via the openscad CLI
  let hasOpenscad = false;
  try {
    execSync('which openscad', { stdio: 'ignore' });
    hasOpenscad = true;
  } catch {
    // openscad not installed
  }

  if (hasOpenscad) {
    const stlPlatePath = join(opts.outputDir, `${projectName}-plate.stl`);
    const stlCasePath = join(opts.outputDir, `${projectName}-case.stl`);
    try {
      execSync(`openscad -o "${stlPlatePath}" "${platePath}"`, { stdio: 'pipe' });
      result.stlPlate = stlPlatePath;
    } catch {
      // STL compilation failed for plate; .scad still available
    }
    try {
      execSync(`openscad -o "${stlCasePath}" "${casePath}"`, { stdio: 'pipe' });
      result.stlCase = stlCasePath;
    } catch {
      // STL compilation failed for case; .scad still available
    }
  }

  return result;
}

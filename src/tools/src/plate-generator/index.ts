/**
 * Switch plate DXF generator.
 *
 * Generates a DXF file with switch cutouts, stabilizer cutouts,
 * mounting holes using smart screw placement, and board outline
 * for laser cutting or CNC milling.
 */

import type { KeyboardLayout, BuildConfig } from '../shared/types.js';
import { SWITCH_CUTOUT_MM, SWITCH_SPACING, KLE_UNIT_MM } from '../shared/constants.js';
import {
  calculateScrewPositions,
  collectComponentPositions,
} from '../shared/screw-placement.js';
import Drawing from 'dxf-writer';

/** PCB origin offset matching the PCB generator (mm). */
const PCB_ORIGIN_X = 25;
const PCB_ORIGIN_Y = 25;

/** Stabilizer cutout dimensions (Cherry-style, mm) */
const STAB_CUTOUT = { width: 6.75, height: 12.3 };

/** Stabilizer spacing from center for different key widths (mm) */
const STAB_SPACING: Record<number, number> = {
  2: 11.938,     // 2u
  2.25: 11.938,  // 2.25u (left shift)
  2.75: 11.938,  // 2.75u (right shift)
  3: 19.05,      // 3u
  6.25: 50,      // 6.25u (standard spacebar)
  7: 57.15,      // 7u (tsangan spacebar)
};

/** Mounting hole radius for M2.5 screws (mm). */
const MOUNT_HOLE_RADIUS = 1.35;

/**
 * Generate a DXF plate file with switch cutouts, mounting holes, and board outline.
 *
 * @param layout - Parsed keyboard layout
 * @param config - Build configuration
 * @returns DXF file content as a string
 */
export function generatePlate(layout: KeyboardLayout, config: BuildConfig): string {
  const d = new Drawing();
  d.setUnits('Millimeters');

  // Add layers
  d.addLayer('Cutouts', Drawing.ACI.RED, 'CONTINUOUS');
  d.addLayer('Outline', Drawing.ACI.WHITE, 'CONTINUOUS');
  d.addLayer('Stabilizers', Drawing.ACI.GREEN, 'CONTINUOUS');
  d.addLayer('MountingHoles', Drawing.ACI.CYAN, 'CONTINUOUS');

  const switchType = config.switches.type;
  const cutout = SWITCH_CUTOUT_MM[switchType];
  const spacing = SWITCH_SPACING[switchType];

  // Track bounds for outline
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Draw switch cutouts
  d.setActiveLayer('Cutouts');
  for (const key of layout.keys) {
    // Center of key in mm
    const cx = (key.x + key.width / 2) * spacing.x;
    const cy = (key.y + key.height / 2) * spacing.y;

    // Switch cutout rectangle centered on key
    const halfW = cutout.width / 2;
    const halfH = cutout.height / 2;

    const x1 = cx - halfW;
    const y1 = cy - halfH;
    const x2 = cx + halfW;
    const y2 = cy + halfH;

    d.drawRect(x1, y1, x2, y2);

    // Update bounds (using full key footprint)
    const keyHalfW = (key.width * spacing.x) / 2;
    const keyHalfH = (key.height * spacing.y) / 2;
    minX = Math.min(minX, cx - keyHalfW);
    minY = Math.min(minY, cy - keyHalfH);
    maxX = Math.max(maxX, cx + keyHalfW);
    maxY = Math.max(maxY, cy + keyHalfH);

    // Stabilizer cutouts for wider keys
    if (key.width >= 2) {
      drawStabilizers(d, cx, cy, key.width);
    }
  }

  // Draw board outline with margin
  const outlineMargin = 5; // mm
  d.setActiveLayer('Outline');
  d.drawRect(
    minX - outlineMargin,
    minY - outlineMargin,
    maxX + outlineMargin,
    maxY + outlineMargin,
  );

  // Smart screw mounting holes — matching PCB and case positions
  const absBounds = computePcbBounds(layout, config);
  const boardBounds = {
    minX: absBounds.minX - 8,
    minY: absBounds.minY - 8 - 15,
    maxX: absBounds.maxX + 8,
    maxY: absBounds.maxY + 8 + 20,
  };
  const componentPositions = collectComponentPositions(config, {
    minX: absBounds.minX,
    minY: absBounds.minY,
    maxX: absBounds.maxX,
    maxY: absBounds.maxY,
  });
  const screwPositions = calculateScrewPositions(layout, config, boardBounds, componentPositions);

  d.setActiveLayer('MountingHoles');
  for (const screw of screwPositions) {
    d.drawCircle(screw.x, screw.y, MOUNT_HOLE_RADIUS);
  }

  return d.toDxfString();
}

/**
 * Compute the PCB-space bounding box of all switch positions
 * (same formula as the PCB generator).
 */
function computePcbBounds(
  layout: KeyboardLayout,
  config: BuildConfig,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const spacing = SWITCH_SPACING[config.switches.type];
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

  return { minX, minY, maxX, maxY };
}

/**
 * Draw stabilizer cutouts for a key of the given width.
 */
function drawStabilizers(d: Drawing, cx: number, cy: number, keyWidth: number): void {
  // Find the closest matching stabilizer spacing
  let stabSpacing: number;
  if (keyWidth >= 6) {
    stabSpacing = STAB_SPACING[keyWidth] ?? STAB_SPACING[6.25];
  } else if (keyWidth >= 3) {
    stabSpacing = STAB_SPACING[3];
  } else {
    stabSpacing = STAB_SPACING[2];
  }

  d.setActiveLayer('Stabilizers');

  // Left stabilizer cutout
  const leftX = cx - stabSpacing;
  drawStabCutout(d, leftX, cy);

  // Right stabilizer cutout
  const rightX = cx + stabSpacing;
  drawStabCutout(d, rightX, cy);

  // Restore cutouts layer
  d.setActiveLayer('Cutouts');
}

/**
 * Draw a single stabilizer cutout rectangle.
 */
function drawStabCutout(d: Drawing, cx: number, cy: number): void {
  const halfW = STAB_CUTOUT.width / 2;
  const halfH = STAB_CUTOUT.height / 2;
  d.drawRect(cx - halfW, cy - halfH, cx + halfW, cy + halfH);
}

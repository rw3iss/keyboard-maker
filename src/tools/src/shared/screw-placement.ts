import type { KeyboardLayout, BuildConfig } from './types.js';
import { SWITCH_SPACING, SWITCH_CUTOUT_MM } from './constants.js';

export interface ScrewPosition {
  x: number;
  y: number;
  label: string;
}

const PCB_ORIGIN_X = 25;
const PCB_ORIGIN_Y = 25;

/** Screw hole radius (M2.5 = 2.7mm drill, need ~4mm clearance from component edges) */
const SCREW_CLEARANCE = 4;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Calculate optimal screw positions WITHIN the board, in empty areas between components.
 *
 * Algorithm:
 * 1. Build a list of occupied rectangles (each switch footprint + diodes + MCU etc.)
 * 2. Define 6 screw "zones" (quadrants/sectors of the board)
 * 3. For each zone, scan a grid to find the point with maximum distance from
 *    all occupied rectangles — the center of the largest empty area in that zone
 * 4. Return positions that are inside the switch area, between components
 */
export function calculateScrewPositions(
  layout: KeyboardLayout,
  config: BuildConfig,
  boardBounds: { minX: number; minY: number; maxX: number; maxY: number },
  componentPositions: Array<{ x: number; y: number; radius: number }>,
): ScrewPosition[] {
  const spacing = SWITCH_SPACING[config.switches.type];
  const cutout = SWITCH_CUTOUT_MM[config.switches.type];

  // Build occupied rectangles from all switch positions (switch + diode footprint area)
  const occupied: Rect[] = [];

  for (const key of layout.keys) {
    const cx = PCB_ORIGIN_X + (key.x + key.width / 2) * spacing.x;
    const cy = PCB_ORIGIN_Y + (key.y + key.height / 2) * spacing.y;
    // Switch footprint area (slightly larger than cutout to account for pads)
    const sw = Math.max(cutout.width, spacing.x * 0.8);
    const sh = Math.max(cutout.height, spacing.y * 0.8);
    occupied.push({ x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh });
    // Diode below/above switch
    occupied.push({ x: cx - 2, y: cy + 6, w: 4, h: 3 });
  }

  // Add MCU, USB, battery as occupied areas
  for (const comp of componentPositions) {
    occupied.push({
      x: comp.x - comp.radius,
      y: comp.y - comp.radius,
      w: comp.radius * 2,
      h: comp.radius * 2,
    });
  }

  // Use the SWITCH AREA bounds (not the board edge which has extra margins)
  // Find the actual extent of switches
  let switchMinX = Infinity, switchMinY = Infinity, switchMaxX = -Infinity, switchMaxY = -Infinity;
  for (const key of layout.keys) {
    const cx = PCB_ORIGIN_X + (key.x + key.width / 2) * spacing.x;
    const cy = PCB_ORIGIN_Y + (key.y + key.height / 2) * spacing.y;
    switchMinX = Math.min(switchMinX, cx - spacing.x / 2);
    switchMinY = Math.min(switchMinY, cy - spacing.y / 2);
    switchMaxX = Math.max(switchMaxX, cx + spacing.x / 2);
    switchMaxY = Math.max(switchMaxY, cy + spacing.y / 2);
  }

  const areaW = switchMaxX - switchMinX;
  const areaH = switchMaxY - switchMinY;

  // Define 6 screw zones: 4 corners + 2 middle (left/right of center)
  // Each zone is a rectangular region of the board to search for empty space
  const midX = (switchMinX + switchMaxX) / 2;
  const midY = (switchMinY + switchMaxY) / 2;
  const zones: Array<{ label: string; searchArea: Rect }> = [
    { label: 'tl', searchArea: { x: switchMinX, y: switchMinY, w: areaW * 0.35, h: areaH * 0.4 } },
    { label: 'tr', searchArea: { x: switchMinX + areaW * 0.65, y: switchMinY, w: areaW * 0.35, h: areaH * 0.4 } },
    { label: 'bl', searchArea: { x: switchMinX, y: switchMinY + areaH * 0.6, w: areaW * 0.35, h: areaH * 0.4 } },
    { label: 'br', searchArea: { x: switchMinX + areaW * 0.65, y: switchMinY + areaH * 0.6, w: areaW * 0.35, h: areaH * 0.4 } },
    { label: 'ml', searchArea: { x: switchMinX + areaW * 0.2, y: switchMinY + areaH * 0.3, w: areaW * 0.3, h: areaH * 0.4 } },
    { label: 'mr', searchArea: { x: switchMinX + areaW * 0.5, y: switchMinY + areaH * 0.3, w: areaW * 0.3, h: areaH * 0.4 } },
  ];

  const results: ScrewPosition[] = [];

  for (const zone of zones) {
    const pos = findBestEmptySpot(zone.searchArea, occupied, SCREW_CLEARANCE);
    if (pos) {
      results.push({ x: pos.x, y: pos.y, label: zone.label });
    }
  }

  return results;
}

/**
 * Scan a search area on a grid and find the point with the maximum minimum
 * distance to any occupied rectangle. This is the "most empty" point.
 */
function findBestEmptySpot(
  searchArea: Rect,
  occupied: Rect[],
  minClearance: number,
): { x: number; y: number } | null {
  const step = 1.0; // 1mm grid resolution
  let bestX = searchArea.x + searchArea.w / 2;
  let bestY = searchArea.y + searchArea.h / 2;
  let bestDist = -Infinity;

  for (let x = searchArea.x + minClearance; x <= searchArea.x + searchArea.w - minClearance; x += step) {
    for (let y = searchArea.y + minClearance; y <= searchArea.y + searchArea.h - minClearance; y += step) {
      const dist = minDistToOccupied(x, y, occupied);
      if (dist > bestDist) {
        bestDist = dist;
        bestX = x;
        bestY = y;
      }
    }
  }

  // Only return if we found a spot with enough clearance
  if (bestDist >= minClearance) {
    return { x: bestX, y: bestY };
  }

  // Fallback: return center of search area even if tight
  return { x: searchArea.x + searchArea.w / 2, y: searchArea.y + searchArea.h / 2 };
}

/**
 * Minimum distance from a point to any occupied rectangle edge.
 * Returns the distance to the nearest rectangle boundary.
 * Positive = outside all rectangles, negative = inside one.
 */
function minDistToOccupied(px: number, py: number, occupied: Rect[]): number {
  let minDist = Infinity;

  for (const rect of occupied) {
    // Distance from point to rectangle (0 if inside)
    const dx = Math.max(rect.x - px, 0, px - (rect.x + rect.w));
    const dy = Math.max(rect.y - py, 0, py - (rect.y + rect.h));
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If point is inside the rect, return negative
    if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
      return -1;
    }

    if (dist < minDist) minDist = dist;
  }

  return minDist;
}

/**
 * Collect component positions (MCU, USB-C, battery) using the same positioning
 * logic as the PCB generator.
 */
export function collectComponentPositions(
  config: BuildConfig,
  boardBounds: { minX: number; minY: number; maxX: number; maxY: number },
): Array<{ x: number; y: number; radius: number }> {
  const { minX, minY, maxX, maxY } = boardBounds;
  const components: Array<{ x: number; y: number; radius: number }> = [];

  // MCU position
  const mcuX = (minX + maxX) / 2;
  const margin = 8;
  const mcuY = maxY + margin + 5;
  components.push({ x: mcuX, y: mcuY, radius: 5 });

  // USB-C connector
  const usbPos = getConnectorXY(
    config.physical?.connectorSide ?? 'back',
    config.physical?.connectorPosition ?? 'center',
    boardBounds,
  );
  components.push({ x: usbPos.x, y: usbPos.y, radius: 6 });

  // Battery connector
  if (config.connectivity.bluetooth && config.power.battery) {
    const side = config.physical?.connectorSide ?? 'back';
    let batX: number, batY: number;
    const olMaxX = maxX + margin;
    if (side === 'left') { batX = minX - margin + 5; batY = mcuY; }
    else if (side === 'right') { batX = olMaxX - 5; batY = mcuY; }
    else { batX = olMaxX - 15; batY = mcuY; }
    components.push({ x: batX, y: batY, radius: 4 });
  }

  return components;
}

/** Compute USB connector XY based on connectorSide and connectorPosition. */
export function getConnectorXY(
  side: 'left' | 'back' | 'right',
  position: 'left' | 'center' | 'right',
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { x: number; y: number } {
  const margin = 8;
  const olMinX = bounds.minX - margin;
  const olMinY = bounds.minY - margin - 15;
  const olMaxX = bounds.maxX + margin;
  const olMaxY = bounds.maxY + margin + 20;

  if (side === 'back') {
    const y = olMinY + 5;
    let x: number;
    if (position === 'left') x = olMinX + 15;
    else if (position === 'right') x = olMaxX - 15;
    else x = (olMinX + olMaxX) / 2;
    return { x, y };
  } else if (side === 'left') {
    return { x: olMinX + 5, y: olMinY + 15 };
  } else {
    return { x: olMaxX - 5, y: olMinY + 15 };
  }
}

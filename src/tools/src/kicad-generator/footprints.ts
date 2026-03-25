/**
 * KiCad PCB footprint generators for switches and diodes.
 */

import type { SExpr } from './sexpr.js';
import type { SwitchType } from '../shared/types.js';
import { SWITCH_SPACING, KLE_UNIT_MM } from '../shared/constants.js';
import { genUUID, at, prop } from './sexpr.js';

/** Footprint library names per switch type */
const SWITCH_FOOTPRINT_LIB: Record<SwitchType, string> = {
  choc_v1: 'Kailh_Choc:SW_Kailh_Choc_V1',
  choc_v2: 'Kailh_Choc:SW_Kailh_Choc_V2',
  mx_ulp: 'Cherry:SW_Cherry_MX_ULP',
  mx: 'MX:SW_Cherry_MX_PCB',
  gateron_lp: 'Gateron:SW_Gateron_LP',
};

/** Pad sizes per switch type (mm) */
const SWITCH_PAD_SIZE: Record<SwitchType, { drill: number; pad: number }> = {
  choc_v1: { drill: 1.5, pad: 2.2 },
  choc_v2: { drill: 1.7, pad: 2.4 },
  mx_ulp: { drill: 1.0, pad: 1.8 },
  mx: { drill: 1.7, pad: 2.5 },
  gateron_lp: { drill: 1.5, pad: 2.2 },
};

/**
 * Generate a KiCad PCB footprint expression for a key switch.
 */
export function switchFootprint(
  switchType: SwitchType,
  ref: string,
  pos: { x: number; y: number },
  rotation?: number,
): SExpr {
  const padInfo = SWITCH_PAD_SIZE[switchType];
  const libName = SWITCH_FOOTPRINT_LIB[switchType];
  const uuid = genUUID();

  return [
    'footprint',
    libName,
    ['layer', 'F.Cu'],
    at(pos.x, pos.y, rotation),
    ['uuid', uuid],
    prop('Reference', ref, { at: [pos.x, pos.y - 5], layer: 'F.SilkS', effects: true }),
    prop('Value', switchType, { at: [pos.x, pos.y + 5], layer: 'F.Fab', effects: true }),
    // Center pin (pin 1)
    [
      'pad',
      '1',
      'thru_hole',
      'circle',
      at(-3.81, -2.54),
      ['size', padInfo.pad, padInfo.pad],
      ['drill', padInfo.drill],
      ['layers', 'F.Cu', 'B.Cu', '*.Mask'],
      ['net', 0, ''],
      ['uuid', genUUID()],
    ],
    // Side pin (pin 2)
    [
      'pad',
      '2',
      'thru_hole',
      'circle',
      at(2.54, -5.08),
      ['size', padInfo.pad, padInfo.pad],
      ['drill', padInfo.drill],
      ['layers', 'F.Cu', 'B.Cu', '*.Mask'],
      ['net', 0, ''],
      ['uuid', genUUID()],
    ],
    // Courtyard
    [
      'fp_rect',
      ['start', -7, -7],
      ['end', 7, 7],
      ['stroke', ['width', 0.05], ['type', 'default']],
      ['fill', 'none'],
      ['layer', 'F.CrtYd'],
      ['uuid', genUUID()],
    ],
  ];
}

/**
 * Generate a KiCad PCB footprint expression for a diode (SOD-123).
 */
export function diodeFootprint(
  ref: string,
  pos: { x: number; y: number },
): SExpr {
  const uuid = genUUID();

  return [
    'footprint',
    'Diode_SMD:D_SOD-123',
    ['layer', 'F.Cu'],
    at(pos.x, pos.y),
    ['uuid', uuid],
    prop('Reference', ref, { at: [pos.x, pos.y - 2], layer: 'F.SilkS', effects: true }),
    prop('Value', '1N4148', { at: [pos.x, pos.y + 2], layer: 'F.Fab', effects: true }),
    // Anode pad
    [
      'pad',
      '1',
      'smd',
      'rect',
      at(-1.65, 0),
      ['size', 0.9, 1.2],
      ['layers', 'F.Cu', 'F.Paste', 'F.Mask'],
      ['net', 0, ''],
      ['uuid', genUUID()],
    ],
    // Cathode pad
    [
      'pad',
      '2',
      'smd',
      'rect',
      at(1.65, 0),
      ['size', 0.9, 1.2],
      ['layers', 'F.Cu', 'F.Paste', 'F.Mask'],
      ['net', 0, ''],
      ['uuid', genUUID()],
    ],
  ];
}

/**
 * Convert a KLE key position (in KLE units) to PCB position (in mm).
 * Takes key width/height into account to center the footprint.
 */
export function kleToPcbPosition(
  kleX: number,
  kleY: number,
  kleW: number,
  kleH: number,
  switchType: SwitchType,
): { x: number; y: number } {
  const spacing = SWITCH_SPACING[switchType];

  // Center of the key in KLE units
  const centerKleX = kleX + kleW / 2;
  const centerKleY = kleY + kleH / 2;

  // Convert to mm using switch spacing
  // KLE 1u maps to the switch spacing for that type
  return {
    x: centerKleX * spacing.x,
    y: centerKleY * spacing.y,
  };
}

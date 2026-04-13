import type { SwitchType } from './types.js';

/** Center-to-center key spacing per switch type (mm). */
export const SWITCH_SPACING: Record<SwitchType, { x: number; y: number }> = {
  choc_v1: { x: 18, y: 17 },
  choc_v2: { x: 19.05, y: 19.05 },
  mx_ulp: { x: 18, y: 18 },
  mx: { x: 19.05, y: 19.05 },
  gateron_lp: { x: 18, y: 17 },
  hall_effect_mx: { x: 19.05, y: 19.05 },
  hall_effect_lp: { x: 19.05, y: 19.05 },
  optical_mx: { x: 19.05, y: 19.05 },
  optical_lp: { x: 19.05, y: 19.05 },
};

/** One KLE unit in millimeters. */
export const KLE_UNIT_MM = 19.05;

/** Default PCB trace widths in mm. */
export const TRACE_WIDTHS = {
  signal: 0.25,
  power: 0.5,
  usb: 0.3,
};

/** Default diode footprint name. */
export const DIODE_FOOTPRINT = 'D_SOD-123';

/** Switch plate cutout dimensions per switch type (mm). */
export const SWITCH_CUTOUT_MM: Record<SwitchType, { width: number; height: number }> = {
  choc_v1: { width: 13.8, height: 13.8 },
  choc_v2: { width: 14, height: 14 },
  mx_ulp: { width: 12, height: 12 },
  mx: { width: 14, height: 14 },
  gateron_lp: { width: 13.8, height: 13.8 },
  hall_effect_mx: { width: 14, height: 14 },
  hall_effect_lp: { width: 14, height: 14 },
  optical_mx: { width: 14, height: 14 },
  optical_lp: { width: 14, height: 14 },
};

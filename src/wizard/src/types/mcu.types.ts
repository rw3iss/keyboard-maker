/**
 * MCU data types used by the wizard client.
 *
 * These mirror the definitions in `src/tools/src/shared/types.ts`
 * (which live in the generator package). We duplicate them here
 * so the client is typed without importing across the tools/wizard
 * boundary. Keep in sync when adding new MCU fields.
 */

/** Physical package description for bare IC chips (QFN, QFP, BGA) */
export interface McuPackage {
  type: string;
  dimensions: { width: number; height: number; unit?: string };
  pitch: number;
  padCount: number;
  padsPerSide?: number;
  padSize?: { width: number; height: number };
  thermalPad?: boolean;
  exposedPadSize?: { width: number; height: number };
  footprintRef?: string;
}

/** Pin function classification */
export type PinFunction =
  | 'gpio' | 'vcc' | 'gnd' | 'vbus'
  | 'usb_dp' | 'usb_dm' | 'reset' | 'battery' | 'nc';

/** Pin map for bare chips — maps pad numbers to net functions. */
export interface McuPinMap {
  vcc: number[];
  gnd: (number | 'EP')[];
  usbDp?: number[];
  usbDm?: number[];
  vbus?: number[];
  reset?: number[];
}

/** Physical pin descriptor for dev board modules */
export interface BoardPin {
  number: number;
  row: number;
  position: number;
  net: string;
  function: PinFunction;
}

/** Board pin layout for dev board modules (DIP/pro-micro style) */
export interface McuBoardPins {
  rows: number;
  pitch: number;
  pinCount: number;
  rowSpacing: number;
  padDrill?: number;
  padSize?: number;
  pins: BoardPin[];
}

/** Single GPIO entry on an MCU (from data/mcus/*.json) */
export interface GpioPin {
  pin: string;
  label: string;
  analog?: boolean;
  note?: string;
}

/** Full MCU data record loaded from the component database. */
export interface McuData {
  id: string;
  name: string;
  chip?: string;
  formFactor?: string;
  gpioCount?: number;
  gpioPins?: GpioPin[];
  hasUsb?: boolean;
  hasBle?: boolean;
  bleVersion?: string;
  hasLipoCharger?: boolean;
  chargerMaxMa?: number | null;
  operatingVoltage?: number;
  flashKB?: number;
  ramKB?: number;
  clockMhz?: number;
  package?: McuPackage;
  pinMap?: McuPinMap;
  boardPins?: McuBoardPins;
  /** Allow additional fields — the JSON files carry many vendor-specific keys. */
  [key: string]: unknown;
}

/** Charger IC package info (mirrors the same field name on charger JSON). */
export interface ChargerPackageInfo {
  type: string;
  dimensions: { width: number; height: number };
  pitch: number;
  padCount: number;
  padsPerSide?: number;
  thermalPad?: boolean;
  exposedPadSize?: { width: number; height: number };
  footprintRef?: string;
}

/** Generic loaded component record returned by /api/components/*. */
export interface ComponentOption {
  id: string;
  name: string;
  manufacturer?: string;
  dimensions?: { width?: number; height?: number; length?: number; depth?: number; thickness?: number };
  [key: string]: unknown;
}

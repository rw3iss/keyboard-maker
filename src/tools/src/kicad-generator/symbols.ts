/**
 * Template functions for KiCad schematic symbols.
 * Each function returns an SExpr array representing a symbol instance.
 */

import type { SExpr } from './sexpr.js';
import type { MatrixPosition } from '../shared/types.js';
import { genUUID, at, prop } from './sexpr.js';

/**
 * Returns a KiCad symbol instance for a mechanical key switch (SW_Push).
 */
export function switchSymbol(
  refIndex: number,
  pos: { x: number; y: number },
  matrix: MatrixPosition,
): SExpr {
  const ref = `SW${refIndex}`;
  const value = `R${matrix.row}C${matrix.col}`;
  const uuid = genUUID();
  const pin1Uuid = genUUID();
  const pin2Uuid = genUUID();

  return [
    'symbol',
    ['lib_id', 'Switch:SW_Push'],
    at(pos.x, pos.y),
    ['unit', 1],
    ['exclude_from_sim', 'no'],
    ['in_bom', 'yes'],
    ['on_board', 'yes'],
    ['dnp', 'no'],
    ['uuid', uuid],
    prop('Reference', ref, { at: [pos.x, pos.y - 3], effects: true }),
    prop('Value', value, { at: [pos.x, pos.y + 3], effects: true }),
    prop('Footprint', '', { at: [pos.x, pos.y + 5], effects: true }),
    [
      'pin',
      '1',
      ['uuid', pin1Uuid],
    ],
    [
      'pin',
      '2',
      ['uuid', pin2Uuid],
    ],
  ];
}

/**
 * Returns a KiCad symbol instance for a 1N4148 diode.
 */
export function diodeSymbol(
  refIndex: number,
  pos: { x: number; y: number },
): SExpr {
  const ref = `D${refIndex}`;
  const uuid = genUUID();
  const pin1Uuid = genUUID();
  const pin2Uuid = genUUID();

  return [
    'symbol',
    ['lib_id', 'Device:D'],
    at(pos.x, pos.y),
    ['unit', 1],
    ['exclude_from_sim', 'no'],
    ['in_bom', 'yes'],
    ['on_board', 'yes'],
    ['dnp', 'no'],
    ['uuid', uuid],
    prop('Reference', ref, { at: [pos.x, pos.y - 2], effects: true }),
    prop('Value', '1N4148', { at: [pos.x, pos.y + 2], effects: true }),
    prop('Footprint', 'Diode_SMD:D_SOD-123', { at: [pos.x, pos.y + 4], effects: true }),
    [
      'pin',
      '1',
      ['uuid', pin1Uuid],
    ],
    [
      'pin',
      '2',
      ['uuid', pin2Uuid],
    ],
  ];
}

/**
 * Returns a KiCad symbol instance for an nRF52840 MCU.
 */
export function mcuSymbol(pos: { x: number; y: number }): SExpr {
  const uuid = genUUID();

  return [
    'symbol',
    ['lib_id', 'MCU_Nordic:nRF52840-QIAA'],
    at(pos.x, pos.y),
    ['unit', 1],
    ['exclude_from_sim', 'no'],
    ['in_bom', 'yes'],
    ['on_board', 'yes'],
    ['dnp', 'no'],
    ['uuid', uuid],
    prop('Reference', 'U1', { at: [pos.x, pos.y - 5], effects: true }),
    prop('Value', 'nRF52840', { at: [pos.x, pos.y + 5], effects: true }),
    prop('Footprint', 'Package_DFN_QFN:QFN-73-1EP_7x7mm_P0.4mm', {
      at: [pos.x, pos.y + 7],
      effects: true,
    }),
  ];
}

/**
 * Returns a KiCad symbol instance for a USB-C connector.
 */
export function usbConnectorSymbol(pos: { x: number; y: number }): SExpr {
  const uuid = genUUID();

  return [
    'symbol',
    ['lib_id', 'Connector:USB_C_Receptacle_USB2.0'],
    at(pos.x, pos.y),
    ['unit', 1],
    ['exclude_from_sim', 'no'],
    ['in_bom', 'yes'],
    ['on_board', 'yes'],
    ['dnp', 'no'],
    ['uuid', uuid],
    prop('Reference', 'J1', { at: [pos.x, pos.y - 5], effects: true }),
    prop('Value', 'USB_C', { at: [pos.x, pos.y + 5], effects: true }),
    prop('Footprint', 'Connector_USB:USB_C_Receptacle_GCT_USB4085', {
      at: [pos.x, pos.y + 7],
      effects: true,
    }),
  ];
}

/**
 * Returns KiCad symbol instances for battery connector and charger IC.
 */
export function batterySymbol(pos: { x: number; y: number }): SExpr {
  const uuid = genUUID();

  return [
    'symbol',
    ['lib_id', 'Device:Battery'],
    at(pos.x, pos.y),
    ['unit', 1],
    ['exclude_from_sim', 'no'],
    ['in_bom', 'yes'],
    ['on_board', 'yes'],
    ['dnp', 'no'],
    ['uuid', uuid],
    prop('Reference', 'BT1', { at: [pos.x, pos.y - 3], effects: true }),
    prop('Value', 'Battery', { at: [pos.x, pos.y + 3], effects: true }),
    prop('Footprint', 'Connector:JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal', {
      at: [pos.x, pos.y + 5],
      effects: true,
    }),
  ];
}

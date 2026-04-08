/**
 * Default build config + deep merge helper.
 *
 * Extracted from execution-engine.ts so the fallback values are
 * in a single reviewable location. Keep this in sync with the
 * BuildConfig type in src/tools/src/shared/types.ts.
 */

/**
 * Recursively merge `overrides` on top of `defaults`.
 *
 * - Plain objects are merged key-by-key.
 * - Arrays and primitives replace the default value wholesale.
 * - `null` / `undefined` values in overrides are ignored so
 *   partial configs don't clobber required defaults.
 */
export function deepMerge(
  defaults: Record<string, any>,
  overrides: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const val = overrides[key];
    if (val === null || val === undefined) continue;
    if (
      typeof val === 'object' &&
      !Array.isArray(val) &&
      typeof defaults[key] === 'object' &&
      defaults[key] !== null &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = deepMerge(defaults[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Build the full default config for a new project. `projectName`
 * is injected into `project.name` so error messages show the
 * right project when a caller forgot to pass it.
 */
export function buildDefaultConfig(projectName: string): Record<string, any> {
  return {
    project: { name: projectName, version: '1.0.0', author: '' },
    layout: { source: 'file', path: null, kleUrl: null },
    switches: { type: 'choc_v1', model: 'kailh-choc-v1', hotswap: true },
    mcu: { type: 'nrf52840', module: 'nice_nano_v2', gpioAvailable: 21 },
    connectivity: { usb: true, bluetooth: true, bluetoothVersion: '5.0' },
    power: {
      battery: true,
      batteryType: 'lipo',
      batteryCapacityMah: 2000,
      chargerIc: 'mcp73831',
      chargeCurrentMa: 500,
    },
    features: {
      rgbPerKey: false,
      ledPlacement: 'below',
      rgbUnderglow: false,
      underglow: { ledCount: 0, ledModel: null },
      rotaryEncoder: false,
      oledDisplay: false,
    },
    diode: { model: '1n4148w', package: 'SOD-123', direction: 'col2row' },
    usbConnector: { model: 'gct-usb4085', type: 'usb-c-2.0' },
    esdProtection: { model: 'usblc6-2sc6', package: 'SOT-23-6' },
    pcb: {
      layers: 2,
      thickness: 1.6,
      signalLayer: 0,
      routing: 'guided',
      fabricator: null,
    },
    physical: {
      connectorSide: 'back',
      connectorPosition: 'center',
      connectorOrder: 'usb-first',
      frontHeight: null,
      rearHeight: null,
    },
    plate: { enabled: true, material: 'aluminum', thickness: 1.5 },
    firmware: { type: 'zmk', features: ['bluetooth', 'usb', 'deep-sleep'] },
    outputs: {
      schematic: true,
      pcb: true,
      gerbers: false,
      plate: true,
      bom: true,
      firmware: true,
      notes: true,
    },
  };
}

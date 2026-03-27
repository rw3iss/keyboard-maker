import type { BuildConfig } from '../shared/types.js';

/** Default values for all optional BuildConfig fields */
export const DEFAULT_CONFIG: BuildConfig = {
  project: {
    name: 'keyboard',
    version: '1.0.0',
    author: '',
  },
  layout: {
    source: 'file',
    path: null,
    kleUrl: null,
  },
  switches: {
    type: 'choc_v1',
    model: 'kailh-choc-brown',
    hotswap: true,
  },
  mcu: {
    type: 'nrf52840',
    module: 'nice_nano_v2',
    gpioAvailable: 21,
  },
  connectivity: {
    usb: true,
    bluetooth: true,
    bluetoothVersion: '5.0',
  },
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
    underglow: {
      ledCount: 0,
      ledModel: null,
    },
    rotaryEncoder: false,
    oledDisplay: false,
  },
  diode: {
    model: '1n4148w',
    package: 'SOD-123',
    direction: 'col2row',
  },
  usbConnector: {
    model: 'gct-usb4085',
    type: 'usb-c-2.0',
  },
  esdProtection: {
    model: 'usblc6-2sc6',
    package: 'SOT-23-6',
  },
  pcb: {
    layers: 2,
    thickness: 1.6,
    signalLayer: 0,
    routing: 'auto',
    mcuFanout: false,
    fabricator: null,
  },
  physical: {
    connectorSide: 'back',
    connectorPosition: 'center',
    connectorOrder: 'usb-first',
    frontHeight: null,
    rearHeight: null,
  },
  plate: {
    enabled: true,
    material: 'aluminum',
    thickness: 1.5,
  },
  firmware: {
    type: 'zmk',
    features: ['bluetooth', 'usb', 'deep-sleep'],
  },
  outputs: {
    schematic: true,
    pcb: true,
    gerbers: true,
    plate: true,
    bom: true,
    firmware: true,
    notes: true,
  },
};

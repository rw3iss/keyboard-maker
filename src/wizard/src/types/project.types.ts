export interface BuildConfig {
  project: { name: string; version: string; author: string };
  layout: { source: string; path: string | null; kleUrl: string | null };
  switches: { type: string; model: string; hotswap: boolean };
  mcu: { type: string; module: string; gpioAvailable: number };
  connectivity: { usb: boolean; bluetooth: boolean; bluetoothVersion: string };
  power: {
    battery: boolean;
    batteryType: string;
    batteryCapacityMah: number;
    chargerIc: string;
    chargeCurrentMa: number;
  };
  features: {
    rgbPerKey: boolean;
    ledPlacement: string;
    rgbUnderglow: boolean;
    underglow: { ledCount: number; ledModel: string | null };
    rotaryEncoder: boolean;
    oledDisplay: boolean;
  };
  pcb: {
    layers: number;
    thickness: number;
    signalLayer: number;
    routing: string;
    fabricator: string | null;
  };
  physical: {
    connectorSide: string;
    connectorPosition: string;
    connectorOrder: string;
    frontHeight: number | null;
    rearHeight: number | null;
  };
  plate: { enabled: boolean; material: string; thickness: number };
  firmware: { type: string; features: string[] };
  outputs: {
    schematic: boolean;
    pcb: boolean;
    gerbers: boolean;
    plate: boolean;
    bom: boolean;
    firmware: boolean;
    notes: boolean;
  };
  diode: { model: string; package: string; direction: string };
  usbConnector: { model: string; type: string };
  esdProtection: { model: string; package: string };
}

export interface ProjectInfo {
  name: string;
  hasConfig: boolean;
  hasBuild: boolean;
  lastModified: string;
}

export interface BuildFile {
  name: string;
  path: string;
  size: number;
  type: string;
  group: string;
  previewable: boolean;
}

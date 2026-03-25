import { describe, it, expect, beforeEach } from 'vitest';
import { generatePCB } from './pcb.js';
import { parseKLE } from '../kle-parser/index.js';
import { generateMatrix } from '../matrix-generator/index.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import type { KeyboardLayout, SwitchMatrix, BuildConfig } from '../shared/types.js';

/** Minimal 4-key KLE layout (2x2) */
const FOUR_KEY_KLE = [
  ['Esc', 'Tab'],
  ['A', 'B'],
];

/** 6-key layout (2x3) */
const SIX_KEY_KLE = [
  ['Q', 'W', 'E'],
  ['A', 'S', 'D'],
];

function makeConfig(overrides: Partial<BuildConfig> = {}): BuildConfig {
  return { ...DEFAULT_CONFIG, ...overrides } as BuildConfig;
}

describe('generatePCB', () => {
  let layout4: KeyboardLayout;
  let matrix4: SwitchMatrix;
  let layout6: KeyboardLayout;
  let matrix6: SwitchMatrix;

  beforeEach(() => {
    layout4 = parseKLE(FOUR_KEY_KLE);
    matrix4 = generateMatrix(layout4);
    layout6 = parseKLE(SIX_KEY_KLE);
    matrix6 = generateMatrix(layout6);
  });

  it('outputs valid kicad_pcb format', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('kicad_pcb');
    expect(result).toContain('version');
    expect(result).toContain('generator');
  });

  it('contains correct number of switch references for 4-key layout', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('SW1');
    expect(result).toContain('SW2');
    expect(result).toContain('SW3');
    expect(result).toContain('SW4');
    expect(result).not.toContain('SW5');
  });

  it('contains correct number of switch references for 6-key layout', () => {
    const result = generatePCB(layout6, matrix6, makeConfig());
    expect(result).toContain('SW1');
    expect(result).toContain('SW6');
    expect(result).not.toContain('SW7');
  });

  it('contains diode references', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('D1');
    expect(result).toContain('D2');
    expect(result).toContain('D3');
    expect(result).toContain('D4');
    expect(result).toContain('1N4148');
  });

  it('contains MCU reference U1', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('U1');
    expect(result).toContain('nRF52840');
  });

  it('contains USB-C connector', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('J1');
    expect(result).toContain('USB_C');
  });

  it('contains ROW and COL nets', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('ROW0');
    expect(result).toContain('ROW1');
    expect(result).toContain('COL0');
    expect(result).toContain('COL1');
  });

  it('contains power nets', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('VCC');
    expect(result).toContain('GND');
  });

  it('contains battery connector when bluetooth enabled', () => {
    const config = makeConfig({
      connectivity: { usb: true, bluetooth: true, bluetoothVersion: '5.0' },
      power: { battery: true, batteryType: 'lipo', batteryCapacityMah: 2000, chargerIc: 'mcp73831', chargeCurrentMa: 500 },
    });
    const result = generatePCB(layout4, matrix4, config);
    expect(result).toContain('BT1');
    expect(result).toContain('Battery');
  });

  it('does not contain battery connector when bluetooth disabled', () => {
    const config = makeConfig({
      connectivity: { usb: true, bluetooth: false, bluetoothVersion: '5.0' },
      power: { battery: false, batteryType: 'lipo', batteryCapacityMah: 2000, chargerIc: 'mcp73831', chargeCurrentMa: 500 },
    });
    const result = generatePCB(layout4, matrix4, config);
    expect(result).not.toContain('BT1');
  });

  it('contains board outline on Edge.Cuts layer', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('Edge.Cuts');
    expect(result).toContain('gr_rect');
  });

  it('contains layer definitions', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('F.Cu');
    expect(result).toContain('B.Cu');
    expect(result).toContain('F.SilkS');
  });

  it('contains PCB thickness from config', () => {
    const result = generatePCB(layout4, matrix4, makeConfig());
    expect(result).toContain('thickness');
    expect(result).toContain('1.6');
  });
});

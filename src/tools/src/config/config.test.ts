import { describe, it, expect } from 'vitest';
import { validateConfig, mergeWithDefaults, flagDesignConcerns } from './validator.js';
import type { BuildConfig } from '../shared/types.js';
import { DEFAULT_CONFIG } from './defaults.js';

describe('Config Validator', () => {
  it('rejects config missing required layout field', () => {
    const result = validateConfig({ project: { name: 'test' } });
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('layout');
  });

  it('rejects config missing required switches field', () => {
    const result = validateConfig({
      layout: { source: 'file', path: './test.json' },
    });
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('switches');
  });

  it('rejects file layout without path', () => {
    const result = validateConfig({
      layout: { source: 'file' },
      switches: { type: 'choc_v1', model: 'kailh-choc-brown' },
    });
    expect(result.missingFields).toContain('layout.path');
  });

  it('rejects url layout without kleUrl', () => {
    const result = validateConfig({
      layout: { source: 'url' },
      switches: { type: 'choc_v1', model: 'kailh-choc-brown' },
    });
    expect(result.missingFields).toContain('layout.kleUrl');
  });

  it('accepts a minimal valid config', () => {
    const result = validateConfig({
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'choc_v1', model: 'kailh-choc-brown' },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.missingFields).toHaveLength(0);
  });

  it('rejects invalid switch type', () => {
    const result = validateConfig({
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'invalid_switch', model: 'test' },
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid switch type');
  });

  it('rejects invalid routing mode', () => {
    const result = validateConfig({
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'choc_v1', model: 'test' },
      pcb: { routing: 'invalid' },
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid routing mode');
  });
});

describe('mergeWithDefaults', () => {
  it('merges partial config with all defaults', () => {
    const merged = mergeWithDefaults({
      project: { name: 'test' },
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'choc_v1', model: 'kailh-choc-brown' },
    });
    expect(merged.mcu.module).toBe('nice_nano_v2');
    expect(merged.connectivity.bluetooth).toBe(true);
    expect(merged.diode.model).toBe('1n4148w');
    expect(merged.outputs.schematic).toBe(true);
  });

  it('preserves user-provided values over defaults', () => {
    const merged = mergeWithDefaults({
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'mx_ulp', model: 'cherry-mx-ulp' },
      mcu: { module: 'xiao_ble_nrf52840', gpioAvailable: 11 },
    });
    expect(merged.switches.type).toBe('mx_ulp');
    expect(merged.mcu.module).toBe('xiao_ble_nrf52840');
    expect(merged.mcu.gpioAvailable).toBe(11);
  });

  it('deep merges nested objects', () => {
    const merged = mergeWithDefaults({
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'choc_v1', model: 'test' },
      features: { rgbPerKey: true },
    });
    // rgbPerKey overridden, but other features still have defaults
    expect(merged.features.rgbPerKey).toBe(true);
    expect(merged.features.rotaryEncoder).toBe(false);
  });
});

describe('flagDesignConcerns', () => {
  const baseConfig = mergeWithDefaults({
    layout: { source: 'file', path: './test.json' },
    switches: { type: 'choc_v1', model: 'kailh-choc-brown' },
  }) as BuildConfig;

  it('flags ULP reflow soldering requirement', () => {
    const config = { ...baseConfig, switches: { ...baseConfig.switches, type: 'mx_ulp' as const } };
    const notes = flagDesignConcerns(config);
    expect(notes.some(n => n.message.includes('reflow'))).toBe(true);
  });

  it('errors on ULP + hotswap', () => {
    const config = {
      ...baseConfig,
      switches: { type: 'mx_ulp' as const, model: 'cherry-mx-ulp', hotswap: true },
    };
    const notes = flagDesignConcerns(config);
    expect(notes.some(n => n.severity === 'error' && n.message.includes('Hot-swap'))).toBe(true);
  });

  it('warns about RGB + battery power draw', () => {
    const config = {
      ...baseConfig,
      features: { ...baseConfig.features, rgbPerKey: true },
    };
    const notes = flagDesignConcerns(config);
    expect(notes.some(n => n.message.includes('RGB'))).toBe(true);
  });

  it('warns about slow charge rate', () => {
    const config = {
      ...baseConfig,
      power: { ...baseConfig.power, battery: true, batteryCapacityMah: 5000, chargeCurrentMa: 100 },
    };
    const notes = flagDesignConcerns(config);
    expect(notes.some(n => n.message.includes('hours to charge'))).toBe(true);
  });

  it('returns no errors for a well-configured board', () => {
    const notes = flagDesignConcerns(baseConfig);
    const errors = notes.filter(n => n.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('warns about custom nRF52840 antenna design', () => {
    const config = {
      ...baseConfig,
      mcu: { ...baseConfig.mcu, module: 'custom_nrf52840_qiaa' },
    };
    const notes = flagDesignConcerns(config);
    expect(notes.some(n => n.message.includes('antenna'))).toBe(true);
  });
});

import type { BuildConfig, DesignNote } from '../shared/types.js';
import { DEFAULT_CONFIG } from './defaults.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  missingFields: string[];
}

/** Required top-level sections that must be present for generation */
const REQUIRED_SECTIONS = ['layout', 'switches'] as const;

/** Required fields within each section */
const REQUIRED_FIELDS: Record<string, string[]> = {
  layout: ['source'],
  switches: ['type', 'model'],
};

/**
 * Validate a partial or full BuildConfig.
 * Returns which fields are missing (for the wizard to prompt)
 * and any structural errors.
 */
export function validateConfig(partial: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const missingFields: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!partial[section] || typeof partial[section] !== 'object') {
      missingFields.push(section);
      continue;
    }
    const sectionObj = partial[section] as Record<string, unknown>;
    for (const field of REQUIRED_FIELDS[section] ?? []) {
      if (sectionObj[field] === undefined || sectionObj[field] === null) {
        missingFields.push(`${section}.${field}`);
      }
    }
  }

  // Validate layout has a source path or URL
  if (partial.layout && typeof partial.layout === 'object') {
    const layout = partial.layout as Record<string, unknown>;
    if (layout.source === 'file' && !layout.path) {
      missingFields.push('layout.path');
    }
    if (layout.source === 'url' && !layout.kleUrl) {
      missingFields.push('layout.kleUrl');
    }
  }

  // Validate switch type is valid
  if (partial.switches && typeof partial.switches === 'object') {
    const sw = partial.switches as Record<string, unknown>;
    const validTypes = ['choc_v1', 'choc_v2', 'mx_ulp', 'mx', 'gateron_lp'];
    if (sw.type && !validTypes.includes(sw.type as string)) {
      errors.push(`Invalid switch type "${sw.type}". Must be one of: ${validTypes.join(', ')}`);
    }
  }

  // Validate routing mode
  if (partial.pcb && typeof partial.pcb === 'object') {
    const pcb = partial.pcb as Record<string, unknown>;
    const validRouting = ['auto', 'guided', 'manual'];
    if (pcb.routing && !validRouting.includes(pcb.routing as string)) {
      errors.push(`Invalid routing mode "${pcb.routing}". Must be one of: ${validRouting.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0 && missingFields.length === 0,
    errors,
    missingFields,
  };
}

/**
 * Deep merge a partial config with defaults.
 * User-provided values override defaults at the leaf level.
 */
export function mergeWithDefaults(partial: Record<string, unknown>): BuildConfig {
  return deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, partial) as unknown as BuildConfig;
}

function deepMerge(defaults: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const val = overrides[key];
    if (val === null || val === undefined) continue;
    if (typeof val === 'object' && !Array.isArray(val) && typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
      result[key] = deepMerge(defaults[key] as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Analyze a BuildConfig and flag design concerns/warnings.
 * Returns a list of notes with severity levels.
 */
export function flagDesignConcerns(config: BuildConfig): DesignNote[] {
  const notes: DesignNote[] = [];

  // ULP switch warnings
  if (config.switches.type === 'mx_ulp') {
    notes.push({
      severity: 'warning',
      message: 'Cherry MX ULP switches require reflow soldering (solder paste + hotplate). No hot-swap sockets available.',
      field: 'switches.type',
    });
    notes.push({
      severity: 'warning',
      message: 'ULP keycaps require SLA 3D printing. FDM printers lack the resolution for functional keycaps.',
      field: 'switches.type',
    });
  }

  // Hot-swap + ULP incompatibility
  if (config.switches.type === 'mx_ulp' && config.switches.hotswap) {
    notes.push({
      severity: 'error',
      message: 'Hot-swap sockets are not available for Cherry MX ULP switches. Set hotswap to false.',
      field: 'switches.hotswap',
    });
  }

  // RGB per-key + battery power draw warning
  if (config.features.rgbPerKey && config.power.battery) {
    notes.push({
      severity: 'warning',
      message: 'Per-key RGB LEDs draw significant power (~20mA each at full brightness). Battery life will be greatly reduced. Consider disabling LEDs in wireless mode.',
      field: 'features.rgbPerKey',
    });
  }

  // Battery capacity vs charger rate
  if (config.power.battery && config.power.chargeCurrentMa > 0) {
    const chargeHours = config.power.batteryCapacityMah / config.power.chargeCurrentMa;
    if (chargeHours > 10) {
      notes.push({
        severity: 'warning',
        message: `Battery (${config.power.batteryCapacityMah}mAh) will take ~${chargeHours.toFixed(1)} hours to charge at ${config.power.chargeCurrentMa}mA. Consider a higher charge current or smaller battery.`,
        field: 'power.chargeCurrentMa',
      });
    }
  }

  // MCU charger limitation (nice!nano only charges at 100mA)
  if (config.mcu.module === 'nice_nano_v2' && config.power.batteryCapacityMah > 1000) {
    notes.push({
      severity: 'info',
      message: 'nice!nano v2 built-in charger is limited to 100mA. A 2000mAh battery will take ~20 hours to charge via the on-board charger.',
      field: 'mcu.module',
    });
  }

  // Custom nRF52840 chip complexity
  if (config.mcu.module === 'custom_nrf52840_qiaa') {
    notes.push({
      severity: 'warning',
      message: 'Bare nRF52840-QIAA requires antenna matching network design and RF certification. Consider a pre-certified module (Holyiot 18010, E73) for simpler design.',
      field: 'mcu.module',
    });
  }

  // Bluetooth without battery
  if (config.connectivity.bluetooth && !config.power.battery) {
    notes.push({
      severity: 'info',
      message: 'Bluetooth enabled but no battery configured. Keyboard will only work wirelessly when USB is connected (USB power + BLE output).',
      field: 'connectivity.bluetooth',
    });
  }

  // XIAO BLE GPIO limitation
  if (config.mcu.module === 'xiao_ble_nrf52840' && config.mcu.gpioAvailable <= 11) {
    notes.push({
      severity: 'warning',
      message: 'Seeed XIAO BLE only has 11 GPIOs. This limits the maximum matrix size to ~30 keys (5R+6C or 4R+7C). Not suitable for large keyboards.',
      field: 'mcu.module',
    });
  }

  return notes;
}

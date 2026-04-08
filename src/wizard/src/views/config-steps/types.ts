/**
 * Shared prop types for the decomposed Config step components.
 *
 * Each step component receives a subset of this shared context
 * so it can read the local config draft, push updates back to
 * the parent Config view, and access any shared lookups (loaded
 * MCU/charger/battery options).
 */
import type { BuildConfig } from '../../types/project.types';
import type { ComponentOption as McuComponentOption } from '../../types/mcu.types';

export interface ConfigComponentOption {
  id: string;
  name: string;
  description?: string;
  data?: any;
  [key: string]: unknown;
}

export interface ConfigStepProps {
  /** The local working copy of the build config */
  localConfig: Partial<BuildConfig>;
  /** Push an update into `localConfig[section][field]` */
  updateLocal: (section: string, field: string, value: any) => void;
  /** MCU options (loaded once in parent) */
  mcuOptions?: ConfigComponentOption[];
  /** Charger options (loaded once in parent) */
  chargerOptions?: ConfigComponentOption[];
  /** Battery options (loaded once in parent) */
  batteryOptions?: ConfigComponentOption[];
}

export type { McuComponentOption };

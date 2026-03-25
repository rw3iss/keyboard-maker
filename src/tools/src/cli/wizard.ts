import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { promptLayout } from './prompts/layout.js';
import { promptSwitches } from './prompts/switches.js';
import { promptMcu } from './prompts/mcu.js';
import { promptConnectivity } from './prompts/connectivity.js';
import { promptPower } from './prompts/power.js';
import { promptFeatures } from './prompts/features.js';
import { promptPcb } from './prompts/pcb.js';
import { promptPhysical } from './prompts/physical.js';
import { promptOutputs } from './prompts/outputs.js';
import { promptConfirm } from './prompts/confirm.js';
import { validateConfig, mergeWithDefaults } from '../config/validator.js';
import type { BuildConfig } from '../shared/types.js';
import { GoBackError } from './prompt-wrapper.js';

interface WizardState {
  layout: any;
  switches: any;
  mcu: any;
  connectivity: any;
  power: any;
  features: any;
  pcb: any;
  physical: any;
  outputs: any;
}

const STEP_NAMES = ['layout', 'switches', 'mcu', 'connectivity', 'power', 'features', 'pcb', 'physical', 'outputs', 'confirm'] as const;

export async function runWizard(opts: {
  kleFile?: string;
  kleUrl?: string;
  config?: string;
  output: string;
}) {
  console.log(chalk.bold.cyan('\n  Keyboard Maker — Interactive Build Wizard'));
  console.log(chalk.dim('  Press Escape to go back to the previous step'));
  console.log(chalk.dim('  Press Ctrl+C to exit\n'));

  // Load partial config if provided
  let partial: Record<string, unknown> = {};
  if (opts.config) {
    try {
      partial = JSON.parse(readFileSync(resolve(opts.config), 'utf-8'));
      console.log(chalk.dim(`  Loaded config from ${opts.config}`));
      const validation = validateConfig(partial);
      if (validation.missingFields.length > 0) {
        console.log(chalk.dim(`  Missing: ${validation.missingFields.join(', ')} — will prompt\n`));
      } else {
        console.log(chalk.green(`  Config is complete — skipping prompts\n`));
      }
    } catch (err: any) {
      console.log(chalk.red(`  Failed to load config: ${err.message}\n`));
    }
  }

  const state: WizardState = {
    layout: (partial as any).layout ?? null,
    switches: (partial as any).switches ?? null,
    mcu: (partial as any).mcu ?? null,
    connectivity: (partial as any).connectivity ?? null,
    power: (partial as any).power ?? null,
    features: (partial as any).features ?? null,
    pcb: (partial as any).pcb ?? null,
    physical: (partial as any).physical ?? null,
    outputs: (partial as any).outputs ?? null,
  };

  let step = 0;

  // Find the first step that needs prompting
  while (step < STEP_NAMES.length - 1 && state[STEP_NAMES[step] as keyof WizardState] !== null) {
    step++;
  }
  // If all filled from config, go straight to confirm
  if (step >= STEP_NAMES.length - 1) step = STEP_NAMES.length - 1;
  // But always start at 0 if no config provided
  if (!opts.config && !opts.kleFile && !opts.kleUrl) step = 0;

  while (step < STEP_NAMES.length) {
    const stepName = STEP_NAMES[step];

    try {
      switch (stepName) {
        case 'layout':
          if (!state.layout) {
            state.layout = await promptLayout(opts.kleFile, opts.kleUrl);
          }
          break;

        case 'switches':
          if (!state.switches) {
            state.switches = await promptSwitches();
          }
          break;

        case 'mcu':
          if (!state.mcu) {
            state.mcu = await promptMcu();
          }
          break;

        case 'connectivity':
          if (!state.connectivity) {
            state.connectivity = await promptConnectivity();
          }
          break;

        case 'power':
          if (!state.power) {
            const bt = state.connectivity?.bluetooth ?? false;
            if (bt) {
              state.power = await promptPower();
            } else {
              state.power = { battery: false, batteryType: '', batteryCapacityMah: 0, chargerIc: '', chargeCurrentMa: 0 };
            }
          }
          break;

        case 'features':
          if (!state.features) {
            state.features = await promptFeatures();
          }
          break;

        case 'pcb':
          if (!state.pcb) {
            state.pcb = await promptPcb();
          }
          break;

        case 'physical':
          if (!state.physical) {
            state.physical = await promptPhysical({ bluetooth: state.connectivity?.bluetooth ?? false });
          }
          break;

        case 'outputs':
          if (!state.outputs) {
            state.outputs = await promptOutputs();
          }
          break;

        case 'confirm': {
          const projectName = (partial as any).project?.name
            ?? state.layout?.projectName
            ?? (typeof state.layout?.path === 'string'
              ? state.layout.path.split('/').pop()?.replace('.json', '').replace('kle', '').replace(/^-|-$/g, '') || 'keyboard'
              : 'keyboard');

          const config = mergeWithDefaults({
            project: { name: projectName, version: '1.0.0', author: (partial as any).project?.author ?? '' },
            ...state,
          }) as BuildConfig;

          const proceed = await promptConfirm(config);
          if (!proceed) {
            // User declined — go back to outputs to reconfigure
            state.outputs = null;
            step = STEP_NAMES.indexOf('outputs');
            continue;
          }

          // Build!
          const { runBuild } = await import('../build/orchestrator.js');
          await runBuild(config, opts.output);
          return;
        }
      }

      // Step completed successfully — advance
      step++;

    } catch (err: unknown) {
      if (err instanceof GoBackError) {
        if (step === 0) {
          // Already at first step — ask if they want to quit
          console.log(chalk.dim('\n  Already at first step. Press Ctrl+C again to exit.\n'));
          continue;
        }
        // Go back: clear current step's state and move to previous
        const currentKey = STEP_NAMES[step];
        if (currentKey in state) {
          (state as any)[currentKey] = null;
        }
        step--;
        // Also clear the previous step so it re-prompts
        const prevKey = STEP_NAMES[step];
        if (prevKey in state) {
          (state as any)[prevKey] = null;
        }
        console.log(chalk.dim(`  ← Back to: ${STEP_NAMES[step]}\n`));
        continue;
      }

      // Real error — not an escape
      throw err;
    }
  }
}

import { readFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { validateConfig, mergeWithDefaults } from '../config/validator.js';
import type { BuildConfig } from '../shared/types.js';

export async function runGenerate(opts: { config: string; output: string; overwrite?: boolean }) {
  const raw = JSON.parse(readFileSync(resolve(opts.config), 'utf-8'));
  const validation = validateConfig(raw);
  if (!validation.valid) {
    console.error(chalk.red('Config validation failed:'));
    validation.errors.forEach(e => console.error(`  - ${e}`));
    if (validation.missingFields.length > 0) {
      console.error(chalk.yellow('Missing fields (use wizard mode to fill these in):'));
      validation.missingFields.forEach(f => console.error(`  - ${f}`));
    }
    process.exit(1);
  }
  const config = mergeWithDefaults(raw) as BuildConfig;
  const { runBuild } = await import('../build/orchestrator.js');
  await runBuild(config, opts.output, opts.overwrite);
}

export async function runValidate(opts: { config: string }) {
  const raw = JSON.parse(readFileSync(resolve(opts.config), 'utf-8'));
  const validation = validateConfig(raw);

  if (validation.valid) {
    console.log(chalk.green('Config is valid.'));
    const config = mergeWithDefaults(raw) as BuildConfig;
    const { flagDesignConcerns } = await import('../config/validator.js');
    const concerns = flagDesignConcerns(config);
    if (concerns.length > 0) {
      console.log(chalk.yellow('\nDesign concerns:'));
      concerns.forEach(c => {
        const icon = c.severity === 'error' ? chalk.red('X') : c.severity === 'warning' ? chalk.yellow('!') : chalk.blue('i');
        console.log(`  ${icon} ${c.message}`);
      });
    }
  } else {
    console.error(chalk.red('Config validation failed:'));
    validation.errors.forEach(e => console.error(`  - ${e}`));
    validation.missingFields.forEach(f => console.error(`  Missing: ${f}`));
  }
}

export async function runListComponents(opts: { type?: string }) {
  const { loadCategory } = await import('./data-loader.js');
  const categories = opts.type ? [opts.type] : ['switches', 'mcus', 'connectors', 'diodes', 'chargers', 'esd', 'leds', 'batteries'];

  for (const cat of categories) {
    const items = loadCategory(cat);
    if (items.length === 0) continue;
    console.log(chalk.bold(`\n${cat.toUpperCase()}:`));
    items.forEach(item => {
      console.log(`  ${chalk.cyan(item.id)} — ${item.name}`);
      if (item.description) console.log(`    ${chalk.dim(item.description)}`);
    });
  }
}

#!/usr/bin/env tsx
import { program } from 'commander';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runWizard } from '../src/cli/wizard.js';
import { runGenerate, runValidate, runListComponents } from '../src/cli/commands.js';

// Resolve project root (two levels up from src/tools/bin/)
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..', '..');
const DEFAULT_PROJECTS_DIR = resolve(PROJECT_ROOT, 'projects');

program
  .name('keyboard-maker')
  .description('Interactive keyboard design & build toolchain')
  .version('0.1.0');

program
  .command('wizard')
  .description('Interactive wizard — walk through all build options')
  .option('--kle-file <path>', 'Pre-set KLE layout file (skips layout prompt)')
  .option('--kle-url <url>', 'KLE gist URL to download')
  .option('-c, --config <path>', 'Partial config file (skips answered questions)')
  .option('-o, --output <dir>', 'Output directory', DEFAULT_PROJECTS_DIR)
  .action(runWizard);

program
  .command('generate')
  .description('Generate build files from a complete config (no prompts)')
  .requiredOption('-c, --config <path>', 'Path to build-config.json')
  .option('-o, --output <dir>', 'Output directory', DEFAULT_PROJECTS_DIR)
  .option('--overwrite', 'Overwrite existing build without prompting')
  .action(runGenerate);

program
  .command('validate')
  .description('Validate a config file and show design concerns')
  .requiredOption('-c, --config <path>', 'Path to build-config.json')
  .action(runValidate);

program
  .command('list-components')
  .description('List available components in the database')
  .option('-t, --type <category>', 'Component category')
  .action(runListComponents);

program
  .command('preview')
  .description('Generate 2D SVG and 3D PNG preview of a PCB')
  .requiredOption('-p, --pcb <path>', 'Path to .kicad_pcb file')
  .option('-o, --output <dir>', 'Output directory (default: same as PCB)')
  .option('-w, --width <px>', 'Render width', '2560')
  .option('-h, --height <px>', 'Render height', '1440')
  .action(async (opts) => {
    const { generatePreview } = await import('../src/preview/index.js');
    const outputDir = opts.output ?? dirname(resolve(opts.pcb));
    generatePreview({ pcbPath: resolve(opts.pcb), outputDir, width: parseInt(opts.width), height: parseInt(opts.height) });
  });

program
  .command('drc')
  .description('Run Design Rule Check on a PCB')
  .requiredOption('-p, --pcb <path>', 'Path to .kicad_pcb file')
  .option('-o, --output <path>', 'DRC report output path')
  .action(async (opts) => {
    const { runDrc } = await import('../src/preview/index.js');
    const chalk = (await import('chalk')).default;
    const result = runDrc(resolve(opts.pcb), opts.output ? resolve(opts.output) : undefined);
    console.log(`\n  DRC Results:`);
    console.log(`    Violations: ${result.violations > 0 ? chalk.red(result.violations) : chalk.green(0)}`);
    console.log(`    Unconnected: ${result.unconnected > 0 ? chalk.yellow(result.unconnected) : chalk.green(0)}`);
    console.log(`    Errors: ${result.errors.length > 0 ? chalk.red(result.errors.length) : chalk.green(0)}`);
    console.log(`    Warnings: ${result.warnings.length > 0 ? chalk.yellow(result.warnings.length) : chalk.green(0)}`);
    if (result.errors.length > 0) {
      console.log(`\n  Errors:`);
      for (const e of result.errors.slice(0, 10)) {
        console.log(`    ${chalk.red('x')} [${e.type}] ${e.message}`);
      }
      if (result.errors.length > 10) console.log(`    ... and ${result.errors.length - 10} more`);
    }
    console.log('');
  });

program
  .command('export-step')
  .description('Export PCB as STEP file for 3D assembly')
  .requiredOption('-p, --pcb <path>', 'Path to .kicad_pcb file')
  .option('-o, --output <path>', 'Output STEP file path')
  .action(async (opts) => {
    const { exportStep } = await import('../src/preview/index.js');
    const outPath = opts.output ?? resolve(opts.pcb).replace('.kicad_pcb', '.step');
    exportStep(resolve(opts.pcb), outPath);
  });

program
  .command('viewer')
  .description('Start 3D web viewer for a project build')
  .requiredOption('-d, --dir <path>', 'Path to project build directory')
  .option('--port <number>', 'Server port', '3333')
  .action(async (opts) => {
    const { startViewer } = await import('../src/viewer/server.js');
    await startViewer(resolve(opts.dir), parseInt(opts.port));
  });

program.parse();

/**
 * 3D assembly orchestrator.
 *
 * Coordinates: STEP export from KiCad → OpenSCAD case/plate → FreeCAD assembly.
 * Falls back gracefully when tools aren't installed.
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const ASSEMBLER_SCRIPT = resolve(dirname(__filename), 'assemble.py');

export interface AssembleOptions {
  buildDir: string;
  pcbFile?: string;
  plateFile?: string;
  caseFile?: string;
  outputStep?: string;
  renderPng?: string;
}

/**
 * Run the 3D assembly pipeline.
 * Looks for PCB STEP, plate STL, case STL in the build directory.
 */
export function assemble3D(opts: AssembleOptions): void {
  const buildDir = resolve(opts.buildDir);

  // Find input files
  const pcbStep = opts.pcbFile ?? findFile(buildDir, '.step');
  const plateStl = opts.plateFile ?? findFile(buildDir, 'plate.stl') ?? findFile(buildDir, '-plate.stl');
  const caseStl = opts.caseFile ?? findFile(buildDir, 'case.stl') ?? findFile(buildDir, '-case.stl');

  if (!pcbStep && !plateStl && !caseStl) {
    console.log(chalk.yellow('  No 3D files found in build directory.'));
    console.log(chalk.dim('  Run with STEP export enabled, or generate case/plate STLs first.'));
    return;
  }

  // Check for freecadcmd
  const freecadCmd = findFreecad();
  if (!freecadCmd) {
    console.log(chalk.yellow('  FreeCAD not found — skipping 3D assembly.'));
    console.log(chalk.dim('  Install FreeCAD for 3D assembly: sudo apt install freecad'));
    console.log(chalk.dim('  You can still use the Three.js viewer: keybuild viewer --dir ' + buildDir));
    return;
  }

  const outputPath = opts.outputStep ?? join(buildDir, 'assembled.step');
  const args = ['--output', outputPath];
  if (pcbStep) args.push('--pcb', pcbStep);
  if (plateStl) args.push('--plate', plateStl);
  if (caseStl) args.push('--case', caseStl);
  if (opts.renderPng) args.push('--render', opts.renderPng);

  console.log(chalk.dim(`  Running FreeCAD assembler...`));
  const result = spawnSync(freecadCmd, [ASSEMBLER_SCRIPT, ...args], {
    stdio: 'inherit',
    timeout: 120000,
  });

  if (result.status !== 0) {
    console.log(chalk.yellow('  3D assembly encountered issues (see output above).'));
  }
}

function findFile(dir: string, pattern: string): string | null {
  try {
    const { readdirSync } = require('fs');
    const files: string[] = readdirSync(dir);
    const match = files.find((f: string) => f.endsWith(pattern));
    return match ? join(dir, match) : null;
  } catch {
    return null;
  }
}

function findFreecad(): string | null {
  for (const cmd of ['freecadcmd', 'FreeCADCmd', 'freecad-cmd']) {
    try {
      execSync(`which ${cmd}`, { stdio: 'pipe' });
      return cmd;
    } catch { /* not found */ }
  }
  return null;
}

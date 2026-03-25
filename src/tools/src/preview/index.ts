/**
 * PCB preview and DRC utilities.
 * Wraps kicad-cli for rendering, SVG export, and design rule checking.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import chalk from 'chalk';

function checkKicadCli(): void {
  try {
    execSync('kicad-cli version', { stdio: 'pipe' });
  } catch {
    throw new Error(
      'kicad-cli not found. Install KiCad 9+ for preview/DRC features.\n' +
      'Download: https://www.kicad.org/download/'
    );
  }
}

export interface PreviewOptions {
  pcbPath: string;
  outputDir: string;
  width?: number;
  height?: number;
  layers?: string;
}

/**
 * Generate preview images of a PCB:
 *  - 2D SVG of copper + silkscreen layers
 *  - 3D ray-traced PNG render
 */
export function generatePreview(opts: PreviewOptions): { svg: string; png: string } {
  checkKicadCli();

  if (!existsSync(opts.pcbPath)) {
    throw new Error(`PCB file not found: ${opts.pcbPath}`);
  }

  mkdirSync(opts.outputDir, { recursive: true });
  const name = basename(opts.pcbPath, '.kicad_pcb');
  const svgPath = join(opts.outputDir, `${name}-preview.svg`);
  const pngPath = join(opts.outputDir, `${name}-3d.png`);
  const width = opts.width ?? 2560;
  const height = opts.height ?? 1440;
  const layers = opts.layers ?? 'F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts';

  // 2D SVG export
  console.log(chalk.dim('  Rendering 2D SVG...'));
  try {
    execSync(
      `kicad-cli pcb export svg --layers "${layers}" --output "${svgPath}" "${opts.pcbPath}"`,
      { stdio: 'pipe' }
    );
    console.log(chalk.green(`  SVG: ${svgPath}`));
  } catch (err: any) {
    console.log(chalk.yellow(`  SVG export failed: ${err.message?.split('\n')[0]}`));
  }

  // 3D ray-traced PNG
  console.log(chalk.dim('  Rendering 3D preview...'));
  try {
    execSync(
      `kicad-cli pcb render --width ${width} --height ${height} --output "${pngPath}" "${opts.pcbPath}"`,
      { stdio: 'pipe' }
    );
    console.log(chalk.green(`  3D render: ${pngPath}`));
  } catch (err: any) {
    console.log(chalk.yellow(`  3D render failed: ${err.message?.split('\n')[0]}`));
  }

  return { svg: svgPath, png: pngPath };
}

/**
 * Export PCB as STEP file for 3D assembly.
 */
export function exportStep(pcbPath: string, outputPath: string): void {
  checkKicadCli();
  if (!existsSync(pcbPath)) throw new Error(`PCB file not found: ${pcbPath}`);

  console.log(chalk.dim('  Exporting STEP...'));
  try {
    execSync(
      `kicad-cli pcb export step --output "${outputPath}" "${pcbPath}"`,
      { stdio: 'pipe' }
    );
    console.log(chalk.green(`  STEP: ${outputPath}`));
  } catch (err: any) {
    throw new Error(`STEP export failed: ${err.message?.split('\n')[0]}`);
  }
}

export interface DrcResult {
  violations: number;
  unconnected: number;
  errors: DrcViolation[];
  warnings: DrcViolation[];
}

export interface DrcViolation {
  type: string;
  severity: string;
  message: string;
  location?: string;
}

/**
 * Run Design Rule Check on a PCB and return structured results.
 */
export function runDrc(pcbPath: string, reportPath?: string): DrcResult {
  checkKicadCli();
  if (!existsSync(pcbPath)) throw new Error(`PCB file not found: ${pcbPath}`);

  const outPath = reportPath ?? pcbPath.replace('.kicad_pcb', '-drc.rpt');

  try {
    execSync(
      `kicad-cli pcb drc --output "${outPath}" "${pcbPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    // kicad-cli exits non-zero when violations found — that's expected
  }

  // Parse the report
  if (!existsSync(outPath)) {
    return { violations: 0, unconnected: 0, errors: [], warnings: [] };
  }

  const report = readFileSync(outPath, 'utf-8');
  const violations: DrcViolation[] = [];

  // Parse violation blocks
  const violationMatches = report.matchAll(/\[(\w+)\]: (.+)\n\s+Rule: (.+); (\w+)/g);
  for (const m of violationMatches) {
    violations.push({
      type: m[1],
      message: m[2],
      severity: m[4],
      location: m[3],
    });
  }

  const totalMatch = report.match(/Found (\d+) DRC violations/);
  const unconnectedMatch = report.match(/Found (\d+) unconnected/);

  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  return {
    violations: totalMatch ? parseInt(totalMatch[1]) : violations.length,
    unconnected: unconnectedMatch ? parseInt(unconnectedMatch[1]) : 0,
    errors,
    warnings,
  };
}

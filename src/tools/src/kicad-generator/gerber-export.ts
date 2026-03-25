/**
 * Gerber and drill file export using kicad-cli.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

/**
 * Export Gerber and drill files from a KiCad PCB file.
 *
 * Requires kicad-cli (KiCad 8+) to be installed and in PATH.
 * Uses the board's stored plot parameters for layer selection.
 */
export function exportGerbers(pcbPath: string, outputDir: string): void {
  if (!existsSync(pcbPath)) {
    throw new Error(`PCB file not found: ${pcbPath}`);
  }

  try {
    execSync('kicad-cli version', { stdio: 'pipe' });
  } catch {
    throw new Error(
      'kicad-cli not found. Install KiCad 8+ or run: src/scripts/setup.sh\n' +
      'You can also open the PCB in KiCad and export Gerbers manually.',
    );
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Export gerbers — use board's stored plot params (set in our generated PCB setup section)
  try {
    execSync(
      `kicad-cli pcb export gerbers --board-plot-params --output "${outputDir}/" "${pcbPath}"`,
      { stdio: 'pipe' },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gerber export failed: ${msg}`);
  }

  // Export drill files
  try {
    execSync(
      `kicad-cli pcb export drill --output "${outputDir}/" "${pcbPath}"`,
      { stdio: 'pipe' },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Drill file export failed: ${msg}`);
  }
}

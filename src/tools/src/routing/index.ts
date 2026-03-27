import { exportDSN } from './dsn-exporter.js';
import { runFreerouting } from './freerouter.js';
import { importSES } from './ses-importer.js';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { cpus as osCpus } from 'os';
import type { BuildConfig, SwitchMatrix } from '../shared/types.js';

export interface RoutingResult {
  pcbPath: string;
  /** True if routing was not attempted or did not fully complete */
  incomplete: boolean;
}

/**
 * Route a PCB based on the config's routing mode.
 *
 * - "auto": Full Freerouting pipeline (DSN export → route → SES import)
 * - "guided": Generate routing guide document + partial automation
 * - "manual": Skip routing, just output the guide
 */
export async function routePCB(
  pcbPath: string,
  outputDir: string,
  config: BuildConfig,
  matrix: SwitchMatrix,
  onLog?: (msg: string) => void,
  timeoutMinutes?: number,
  maxPasses?: number,
): Promise<RoutingResult> {
  const mode = config.pcb.routing;

  // Always generate the routing guide
  writeRoutingGuide(outputDir, config, matrix);

  // Always export DSN so the user can run Freerouting manually later
  const dsnPath = join(outputDir, 'keyboard.dsn');
  try {
    exportDSN(pcbPath, dsnPath);
  } catch { /* non-critical for manual/guided */ }

  if (mode === 'manual' || mode === 'guided') {
    return { pcbPath, incomplete: true };
  }

  // Auto mode: Freerouting pipeline
  const sesPath = join(outputDir, 'keyboard.ses');
  const routedPcbPath = join(outputDir, 'keyboard-routed.kicad_pcb');

  try {
    const allRouted = await runFreerouting(dsnPath, sesPath, onLog, timeoutMinutes, maxPasses);
    importSES(pcbPath, sesPath, routedPcbPath);
    return { pcbPath: routedPcbPath, incomplete: !allRouted };
  } catch (err: any) {
    const msg = `Auto-routing failed: ${err.message}`;
    console.log(`  ${msg}`);
    onLog?.(`  ${msg}`);
    console.log('  Falling back to unrouted PCB. See routing-guide.md for manual instructions.');
    return { pcbPath, incomplete: true };
  }
}

/**
 * Build a helper message explaining how to manually finish routing
 * and regenerate gerbers from the result.
 */
export function buildRoutingHelperMessage(outputDir: string, config: BuildConfig): string[] {
  const projectName = config.project.name;
  const pcbFile = `${projectName}.kicad_pcb`;
  const dsnFile = 'keyboard.dsn';
  const sesFile = 'keyboard.ses';
  const mode = config.pcb.routing;

  // Use paths relative to project dir (parent of build/)
  const projRelBuild = `projects/${projectName}/build`;

  const lines: string[] = [];
  lines.push('');
  lines.push('--- Manual Routing Instructions ---');
  lines.push('');

  if (mode === 'auto') {
    lines.push('Auto-routing did not fully complete. You can finish routing manually:');
  } else {
    lines.push('Routing was skipped. To route your PCB:');
  }

  lines.push('');
  const cpuCount = Math.max(1, osCpus().length);
  lines.push('Option 1: Route with Freerouting (auto)');
  lines.push(`  The DSN file was exported during the build.`);
  lines.push(`  From the repo root, run Freerouting:`);
  lines.push(`    java -jar ~/.local/bin/freerouting-2.1.0.jar \\`);
  lines.push(`      -de ${projRelBuild}/${dsnFile} \\`);
  lines.push(`      -do ${projRelBuild}/${sesFile} -mp 50 -mt ${cpuCount}`);
  lines.push(`  -mp  Max routing passes (default 50). Increase for complex boards,`);
  lines.push(`        decrease to limit run time. There is no time-based timeout.`);
  lines.push(`  -mt  Thread count for post-route optimization (your system: ${cpuCount} cores).`);
  lines.push(`        Note: the autoroute phase itself is always single-threaded.`);
  lines.push('');
  lines.push(`  Freerouting reads a freerouting.json config from its working directory.`);
  lines.push(`  The build generates one at ${projRelBuild}/freerouting.json with`);
  lines.push(`  headless mode, via costs, and other router settings. To use it:`);
  lines.push(`    cd ${projRelBuild} && java -jar ~/.local/bin/freerouting-2.1.0.jar \\`);
  lines.push(`      -de keyboard.dsn -do keyboard.ses -mp 50 -mt ${cpuCount}`);
  lines.push('');
  lines.push('Option 2: Route manually in KiCad');
  lines.push(`  Open ${projRelBuild}/${pcbFile} in KiCad and route traces by hand.`);
  lines.push(`  See ${projRelBuild}/routing-guide.md for routing priority and trace widths.`);
  lines.push('');
  lines.push('After routing, import the session and re-export Gerbers:');
  lines.push(`  1. Import the .ses into KiCad: File > Import > Specctra Session`);
  lines.push(`     Select: ${projRelBuild}/${sesFile}`);
  lines.push(`  2. Review the routing, fix any remaining unrouted nets, then save`);
  lines.push(`  3. Re-export Gerbers:`);
  lines.push(`       kicad-cli pcb export gerbers --board-plot-params \\`);
  lines.push(`         --output ${projRelBuild}/gerbers/ ${projRelBuild}/${pcbFile}`);
  lines.push(`       kicad-cli pcb export drill \\`);
  lines.push(`         --output ${projRelBuild}/gerbers/ ${projRelBuild}/${pcbFile}`);
  lines.push('');
  lines.push(`See ${projRelBuild}/routing-guide.md for trace widths, layer assignments, and routing tips.`);
  lines.push('');

  return lines;
}

function writeRoutingGuide(outputDir: string, config: BuildConfig, matrix: SwitchMatrix): void {
  const guide = `# PCB Routing Guide

Generated by keyboard-maker for: ${config.project.name}
Matrix: ${matrix.rows} rows x ${matrix.cols} columns

## Routing Priority Order

1. **USB differential pair** (D+/D-)
   - Route first, keep traces parallel
   - Match lengths within 0.1mm
   - ~0.3mm trace width for 90ohm impedance on 2-layer PCB

2. **Power traces** (VBUS, 3V3, VBAT, GND)
   - Use 0.5mm trace width minimum
   - Place GND copper pour on back layer (B.Cu)
   - Route: USB-C VBUS → ESD → regulator → MCU
${config.power.battery ? `   - Battery: JST connector → charger IC → power switch → MCU VDD` : ''}

3. **Column traces** (COL0–COL${matrix.cols - 1})
   - Run vertically through the switch matrix
   - Route on front copper (F.Cu)
   - 0.25mm trace width

4. **Row traces** (ROW0–ROW${matrix.rows - 1})
   - Run horizontally, connecting diode cathodes
   - Route on back copper (B.Cu) to avoid crossing columns
   - 0.25mm trace width

5. **MCU connections**
   - Short stubs from row/col nets to MCU GPIO pads
${config.features.rgbPerKey ? `\n6. **LED data line**\n   - Daisy-chain from MCU through all LEDs\n   - Keep segments under 10cm` : ''}

## Layer Assignment (${config.pcb.layers ?? 2}-layer board)
${(config.pcb.layers ?? 2) >= 4 ? `
| Layer | Purpose |
|-------|---------|
| F.Cu (top) | Switch pads, ${config.features.rgbPerKey ? 'per-key LEDs, ' : ''}MCU, USB-C, main components |
| In1.Cu (inner 1) | ${config.pcb.signalLayer === 1 ? 'Signal traces (ROW/COL) — primary routing layer' : 'Ground plane (copper fill) — provides return path and shielding'} |
| In2.Cu (inner 2) | ${config.pcb.signalLayer === 2 ? 'Signal traces (ROW/COL) — primary routing layer' : 'Power plane (VCC copper fill) — clean power distribution'} |
| B.Cu (bottom) | Diodes, ${config.features.rgbUnderglow ? 'underglow LEDs, ' : ''}${config.pcb.signalLayer === 31 ? 'signal traces' : 'ground pour'} |

**4-layer benefits:** Dedicated ground/power planes reduce noise, improve signal integrity, and give the autorouter more room to route traces without crossing.
` : `
| Layer | Purpose |
|-------|---------|
| F.Cu (front) | Switches, ${config.features.rgbPerKey ? 'per-key LEDs, ' : ''}column traces, MCU, USB-C, main components |
| B.Cu (back) | Diodes, ${config.features.rgbUnderglow ? 'underglow LEDs, ' : ''}row traces, ground pour |
`}

## Trace Widths

| Type | Width |
|------|-------|
| Signal | 0.25mm |
| Power | 0.5mm |
| USB D+/D- | 0.3mm (impedance matched) |

## Tips

- Use 45-degree or curved trace corners (never 90-degree)
- Keep traces ≥0.5mm from board edges
- Add stitching vias for ground pour every ~25mm
- Minimum via size: 0.3mm drill, 0.6mm annular ring
- Run DRC (Design Rule Check) in KiCad before exporting Gerbers

## Auto-Routing with Freerouting

If you chose manual routing but want to try auto-routing later:

\`\`\`bash
# Export DSN from KiCad
kicad-cli pcb export dsn --output keyboard.dsn keyboard.kicad_pcb

# Run Freerouting
java -jar ~/.local/bin/freerouting.jar -de keyboard.dsn -do keyboard.ses -mp 30

# Import results back in KiCad
# File → Import → Specctra Session → select keyboard.ses
\`\`\`
`;
  writeFileSync(join(outputDir, 'routing-guide.md'), guide);
}

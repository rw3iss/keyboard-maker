/**
 * Build orchestrator - coordinates all generation steps.
 *
 * Imports and calls all generators based on the config.outputs flags,
 * writing artifacts to the output directory.
 */

import type { BuildConfig } from '../shared/types.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { parseKLE } from '../kle-parser/index.js';
import { generateMatrix } from '../matrix-generator/index.js';
import { generateSchematic } from '../kicad-generator/schematic.js';
import { generatePCB } from '../kicad-generator/pcb.js';
import { exportGerbers } from '../kicad-generator/gerber-export.js';
import { generatePlate } from '../plate-generator/index.js';
import { generateFirmware } from '../firmware-generator/index.js';
import { generateBOM } from '../bom-generator/index.js';
import { flagDesignConcerns } from '../config/validator.js';
import { routePCB, buildRoutingHelperMessage } from '../routing/index.js';
import { generateCase } from '../case-generator/index.js';
import { generateOverview } from '../overview-generator/index.js';
import { renderLayoutImage } from '../kle-renderer/index.js';
import { KLE_UNIT_MM, SWITCH_SPACING } from '../shared/constants.js';

/**
 * Run the full build pipeline based on config.outputs flags.
 *
 * Output structure:
 *   projects/<name>/build-config.json  (saved at project root)
 *   projects/<name>/build/             (all generated artifacts)
 *
 * @param config - The build configuration
 * @param outputBase - Base directory for projects (default: ./projects)
 * @param overwrite - If true, skip overwrite prompt for existing builds
 * @returns The output directory path
 */
export async function runBuild(config: BuildConfig, outputBase: string, overwrite = false): Promise<string> {
  const projectDir = resolve(outputBase, config.project.name);
  const outputDir = join(projectDir, 'build');

  // Check for existing build
  if (existsSync(outputDir)) {
    const files = readdirSync(outputDir);
    if (files.length > 0 && !overwrite) {
      console.log(chalk.yellow(`\n  Existing build found in ${outputDir}`));
      console.log(chalk.yellow(`  Use --overwrite flag to replace, or remove the build/ directory manually.\n`));

      // In non-interactive mode (generate command), proceed with warning
      // The wizard will have already confirmed
      console.log(chalk.dim('  Proceeding (overwriting existing build)...\n'));
    }
  }

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  // Save build-config.json at project root
  writeFileSync(join(projectDir, 'build-config.json'), JSON.stringify(config, null, 2));

  const log: string[] = [];
  const logMsg = (msg: string) => {
    log.push(`[${new Date().toISOString()}] ${msg}`);
  };

  console.log(chalk.bold.blue(`\nBuilding: ${config.project.name}\n`));
  logMsg(`Build started for ${config.project.name}`);

  // Step 1: Parse layout
  const spinner = ora('Parsing layout...').start();
  let kleData: unknown[];
  try {
    if (config.layout.path) {
      const layoutPath = resolve(projectDir, config.layout.path);
      const raw = readFileSync(layoutPath, 'utf-8');
      kleData = JSON.parse(raw);
    } else {
      throw new Error(
        `Layout source "${config.layout.source}" requires a valid path. ` +
        `Set layout.path to a KLE JSON file.`,
      );
    }
  } catch (err) {
    spinner.fail('Failed to parse layout');
    const msg = err instanceof Error ? err.message : String(err);
    logMsg(`ERROR: ${msg}`);
    throw err;
  }
  const layout = parseKLE(kleData);
  spinner.succeed(`Parsed layout: ${layout.keys.length} keys`);
  logMsg(`Parsed layout: ${layout.keys.length} keys`);

  // Step 1b: Create images directory and render KLE layout image
  const imagesDir = join(outputDir, 'images');
  mkdirSync(imagesDir, { recursive: true });
  {
    const imgSpinner = ora('Rendering KLE layout image...').start();
    try {
      const imgPath = await renderLayoutImage(
        layout,
        config.switches?.model || config.switches?.type || '',
        join(imagesDir, 'kle-layout.png'),
      );
      imgSpinner.succeed(`Layout image: ${imgPath.split('/').pop()}`);
      logMsg(`Layout image: ${imgPath}`);
    } catch (err) {
      imgSpinner.warn('Layout image generation skipped');
      logMsg(`WARN: Layout image skipped: ${err}`);
    }
  }

  // Step 2: Generate matrix
  const matrixSpinner = ora('Generating switch matrix...').start();
  let matrix;
  try {
    matrix = generateMatrix(layout, config.mcu.gpioAvailable);
  } catch (err) {
    matrixSpinner.fail('Matrix generation failed');
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n  ${msg}\n`));
    logMsg(`ERROR: ${msg}`);
    throw err;
  }
  const totalPins = matrix.rows + matrix.cols;
  const pinInfo = totalPins === matrix.rows + matrix.cols
    ? ` (${totalPins} of ${config.mcu.gpioAvailable} GPIOs)`
    : '';
  matrixSpinner.succeed(`Matrix: ${matrix.rows} rows x ${matrix.cols} cols${pinInfo}`);
  logMsg(`Matrix: ${matrix.rows}x${matrix.cols} (${totalPins} GPIOs)`);

  // Step 3: Design concerns
  const concerns = flagDesignConcerns(config);
  if (concerns.length > 0) {
    console.log(chalk.yellow('\nDesign notes:'));
    for (const note of concerns) {
      const icon = note.severity === 'error' ? chalk.red('ERROR')
        : note.severity === 'warning' ? chalk.yellow('WARN')
        : chalk.blue('INFO');
      console.log(`  ${icon}: ${note.message}`);
      logMsg(`${note.severity.toUpperCase()}: ${note.message}`);
    }
    console.log('');
  }

  // Step 4: Generate schematic
  if (config.outputs.schematic) {
    const s = ora('Generating schematic...').start();
    try {
      const schContent = generateSchematic(layout, matrix, config);
      const schPath = join(outputDir, `${config.project.name}.kicad_sch`);
      writeFileSync(schPath, schContent, 'utf-8');
      s.succeed('Schematic generated');
      logMsg(`Schematic: ${schPath}`);
    } catch (err) {
      s.fail('Schematic generation failed');
      logMsg(`ERROR generating schematic: ${err}`);
    }
  }

  // Step 5: Generate PCB
  let pcbPath: string | null = null;
  if (config.outputs.pcb) {
    const s = ora('Generating PCB layout...').start();
    try {
      const pcbContent = generatePCB(layout, matrix, config);
      pcbPath = join(outputDir, `${config.project.name}.kicad_pcb`);
      writeFileSync(pcbPath, pcbContent, 'utf-8');
      s.succeed('PCB layout generated');
      logMsg(`PCB: ${pcbPath}`);
    } catch (err) {
      s.fail('PCB generation failed');
      logMsg(`ERROR generating PCB: ${err}`);
    }
  }

  // Step 6: Route PCB
  let routingIncomplete = false;
  if (pcbPath) {
    if (config.pcb.routing !== 'manual') {
      const s = ora(`Routing PCB (mode: ${config.pcb.routing})...`).start();
      try {
        const result = await routePCB(pcbPath, outputDir, config, matrix);
        routingIncomplete = result.incomplete;
        if (result.pcbPath !== pcbPath) {
          pcbPath = result.pcbPath;
          s.succeed(`PCB routed: ${result.pcbPath.split('/').pop()}`);
          logMsg(`Routed PCB: ${result.pcbPath}`);
        } else {
          s.succeed(`Routing guide generated (mode: ${config.pcb.routing})`);
          logMsg(`Routing guide generated, PCB unrouted (mode: ${config.pcb.routing})`);
        }
      } catch (err) {
        routingIncomplete = true;
        const msg = err instanceof Error ? err.message : String(err);
        s.warn(`Routing skipped: ${msg}`);
        logMsg(`WARN: Routing skipped: ${msg}`);
      }
    } else {
      // Manual mode — still generate the routing guide
      routingIncomplete = true;
      try {
        await routePCB(pcbPath, outputDir, config, matrix);
        logMsg('Routing guide generated (manual mode)');
      } catch { /* non-critical */ }
    }
  }

  // Step 7: Export gerbers
  if (config.outputs.gerbers && pcbPath) {
    const s = ora('Exporting Gerber files...').start();
    try {
      const gerberDir = join(outputDir, 'gerbers');
      exportGerbers(pcbPath, gerberDir);
      s.succeed('Gerber files exported');
      logMsg(`Gerbers: ${gerberDir}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      s.warn(`Gerber export skipped: ${msg}`);
      logMsg(`WARN: Gerber export skipped: ${msg}`);
    }
  }

  // Step 8: Generate plate
  if (config.outputs.plate) {
    const s = ora('Generating switch plate DXF...').start();
    try {
      const plateContent = generatePlate(layout, config);
      const platePath = join(outputDir, `${config.project.name}-plate.dxf`);
      writeFileSync(platePath, plateContent, 'utf-8');
      s.succeed('Switch plate DXF generated');
      logMsg(`Plate: ${platePath}`);
    } catch (err) {
      s.fail('Plate generation failed');
      logMsg(`ERROR generating plate: ${err}`);
    }
  }

  // Step 8b: Generate 3D case and plate (OpenSCAD)
  if (config.plate.enabled) {
    const s = ora('Generating 3D case & plate (OpenSCAD)...').start();
    try {
      const caseResult = generateCase({
        layout,
        config,
        outputDir,
      });
      const files = [caseResult.scadPlate, caseResult.scadCase];
      if (caseResult.stlPlate) files.push(caseResult.stlPlate);
      if (caseResult.stlCase) files.push(caseResult.stlCase);
      const hasStl = caseResult.stlPlate || caseResult.stlCase;
      s.succeed(`3D case & plate generated (${hasStl ? 'SCAD + STL' : 'SCAD only — install openscad for STL'})`);
      logMsg(`Case SCAD: ${caseResult.scadPlate}, ${caseResult.scadCase}`);
      if (caseResult.stlPlate) logMsg(`Plate STL: ${caseResult.stlPlate}`);
      if (caseResult.stlCase) logMsg(`Case STL: ${caseResult.stlCase}`);
    } catch (err) {
      s.fail('3D case generation failed');
      logMsg(`ERROR generating 3D case: ${err}`);
    }
  }

  // Step 9: Generate firmware
  if (config.outputs.firmware) {
    const s = ora('Generating ZMK firmware files...').start();
    try {
      const fw = generateFirmware(layout, matrix, config);
      const fwDir = join(outputDir, 'firmware');
      mkdirSync(fwDir, { recursive: true });
      writeFileSync(join(fwDir, `${config.project.name}.overlay`), fw.overlay, 'utf-8');
      writeFileSync(join(fwDir, `${config.project.name}.keymap`), fw.keymap, 'utf-8');
      writeFileSync(join(fwDir, `${config.project.name}.conf`), fw.conf, 'utf-8');
      writeFileSync(join(fwDir, `${config.project.name}.zmk.yml`), fw.metadata, 'utf-8');
      s.succeed('ZMK firmware files generated');
      logMsg(`Firmware: ${fwDir}`);
    } catch (err) {
      s.fail('Firmware generation failed');
      logMsg(`ERROR generating firmware: ${err}`);
    }
  }

  // Step 10: Generate BOM
  if (config.outputs.bom) {
    const s = ora('Generating bill of materials...').start();
    try {
      const bom = generateBOM(config, layout.keys.length);
      writeFileSync(join(outputDir, 'bom.md'), bom.markdown, 'utf-8');
      writeFileSync(join(outputDir, 'bom.csv'), bom.csv, 'utf-8');
      s.succeed('BOM generated');
      logMsg(`BOM: ${join(outputDir, 'bom.md')}`);
    } catch (err) {
      s.fail('BOM generation failed');
      logMsg(`ERROR generating BOM: ${err}`);
    }
  }

  // Step 11: Save design notes
  if (config.outputs.notes && concerns.length > 0) {
    const notesPath = join(outputDir, 'design-notes.txt');
    const notesContent = concerns
      .map(n => `[${n.severity.toUpperCase()}] ${n.message}${n.field ? ` (${n.field})` : ''}`)
      .join('\n');
    writeFileSync(notesPath, notesContent, 'utf-8');
    logMsg(`Design notes: ${notesPath}`);
  }

  // Step 12: Generate project overview HTML
  {
    const s = ora('Generating project overview...').start();
    try {
      // Calculate board dimensions from layout keys using actual switch spacing
      const spacing = SWITCH_SPACING[config.switches.type] || SWITCH_SPACING.choc_v1;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const key of layout.keys) {
        const cx = (key.x + key.width / 2) * spacing.x;
        const cy = (key.y + key.height / 2) * spacing.y;
        const halfW = (key.width * spacing.x) / 2;
        const halfH = (key.height * spacing.y) / 2;
        minX = Math.min(minX, cx - halfW);
        maxX = Math.max(maxX, cx + halfW);
        minY = Math.min(minY, cy - halfH);
        maxY = Math.max(maxY, cy + halfH);
      }
      // Guard against empty layout
      if (!isFinite(minX)) { minX = 0; maxX = 300; minY = 0; maxY = 100; }
      const margin = 8;
      const boardWidth = Math.round((maxX - minX) + margin * 2);
      const boardDepth = Math.round((maxY - minY) + margin * 2 + 35); // extra for MCU area
      const frontHeight = config.physical.frontHeight ?? (config.pcb.thickness + (config.plate.enabled ? config.plate.thickness : 0) + 2);
      const rearHeight = config.physical.rearHeight ?? (frontHeight + 4);

      generateOverview({
        config,
        layout,
        matrix,
        buildDir: outputDir,
        projectDir,
        dimensions: {
          width: boardWidth,
          depth: boardDepth,
          frontHeight,
          rearHeight,
        },
        concerns,
      });
      s.succeed('Project overview generated');
      logMsg(`Overview: ${join(outputDir, 'overview.html')}`);
    } catch (err) {
      s.fail('Overview generation failed');
      logMsg(`ERROR generating overview: ${err}`);
    }
  }

  // Show routing helper message if routing was incomplete
  if (routingIncomplete && pcbPath) {
    const helperLines = buildRoutingHelperMessage(outputDir, config);
    for (const line of helperLines) {
      console.log(chalk.yellow(line));
      logMsg(line);
    }
  }

  // Save build log
  const buildLogPath = join(outputDir, 'build.log');
  logMsg('Build complete');
  writeFileSync(buildLogPath, log.join('\n') + '\n', 'utf-8');

  console.log(chalk.bold.green(`\nBuild complete! Output: ${outputDir}\n`));

  return outputDir;
}

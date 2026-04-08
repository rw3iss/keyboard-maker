import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { AppError, ErrorCodes } from '../types/errors.js';
import type { BuildEvent } from '../types/events.js';
import { deepMerge, buildDefaultConfig } from './build-defaults.js';
import { importGenerators } from './generator-loader.js';

type EventEmitter = (event: BuildEvent) => void;

/** Track active builds to prevent concurrent builds on the same project. */
const activeBuilds = new Map<string, boolean>();

/**
 * Emit a build event and yield to the event loop so SSE writes
 * flush to the client immediately (not buffered until build ends).
 */
async function emitEvent(emitter: EventEmitter, partial: Omit<BuildEvent, 'timestamp'>): Promise<void> {
  emitter({ ...partial, timestamp: new Date().toISOString() } as BuildEvent);
  // Yield to event loop — allows Node's HTTP response to flush the SSE write
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export interface BuildOutputSelections {
  schematic?: boolean;
  pcb?: boolean;
  gerbers?: boolean;
  plate?: boolean;
  case?: boolean;
  firmware?: boolean;
  bom?: boolean;
  overview?: boolean;
}

export async function executeBuild(
  projectName: string,
  buildConfig: Record<string, unknown>,
  outputs: BuildOutputSelections,
  emitter: EventEmitter,
  routingTimeoutMinutes = 10,
  maxPasses = 25,
): Promise<void> {
  if (activeBuilds.get(projectName)) {
    throw new AppError(
      409,
      ErrorCodes.BUILD_ALREADY_RUNNING,
      `A build is already running for "${projectName}"`,
    );
  }

  activeBuilds.set(projectName, true);
  const projectDir = join(config.projectsDir, projectName);
  const buildDir = join(projectDir, 'build');

  try {
    mkdirSync(buildDir, { recursive: true });

    // Delete cached build archive from previous build
    const oldZip = join(buildDir, 'build-archive.zip');
    if (existsSync(oldZip)) {
      try { unlinkSync(oldZip); } catch { /* ignore */ }
    }

    // Merge with defaults to fill in any missing fields
    const cfg = deepMerge(buildDefaultConfig(projectName), buildConfig) as any;

    // Fix invalid switch types — map common names to valid SwitchType enum values
    const validSwitchTypes = ['choc_v1', 'choc_v2', 'mx_ulp', 'mx', 'gateron_lp'];
    if (!validSwitchTypes.includes(cfg.switches?.type)) {
      // Try to infer from model name
      const model = (cfg.switches?.model || '').toLowerCase();
      if (model.includes('choc') && model.includes('v2')) cfg.switches.type = 'choc_v2';
      else if (model.includes('choc')) cfg.switches.type = 'choc_v1';
      else if (model.includes('ulp')) cfg.switches.type = 'mx_ulp';
      else if (model.includes('gateron')) cfg.switches.type = 'gateron_lp';
      else if (model.includes('mx') || model.includes('cherry')) cfg.switches.type = 'mx';
      else cfg.switches.type = 'choc_v1'; // safe default
    }

    // Save the merged + fixed config back so it's complete
    writeFileSync(join(projectDir, 'build-config.json'), JSON.stringify(cfg, null, 2));

    const generators = await importGenerators();

    // ---- Stage: layout ----
    await emitEvent(emitter, { type: 'stage:start', stage: 'layout', message: 'Parsing KLE layout...' });
    let layout: any;
    try {
      const klePath = cfg.layout?.path
        ? join(projectDir, cfg.layout.path)
        : join(projectDir, 'kle.json');
      const kleRaw = JSON.parse(readFileSync(klePath, 'utf-8'));
      layout = generators.parseKLE(kleRaw);
      await emitEvent(emitter, {
        type: 'stage:complete',
        stage: 'layout',
        message: `Parsed ${layout.keys.length} keys`,
      });
    } catch (err) {
      await emitEvent(emitter, {
        type: 'stage:error',
        stage: 'layout',
        message: `Layout parsing failed: ${err}`,
      });
      throw err;
    }

    // ---- Stage: matrix ----
    await emitEvent(emitter, {
      type: 'stage:start',
      stage: 'matrix',
      message: 'Generating switch matrix...',
    });
    let matrix: any;
    try {
      const maxGpio = cfg.mcu?.gpioAvailable ?? 32;
      matrix = generators.generateMatrix(layout, maxGpio);
      await emitEvent(emitter, {
        type: 'stage:complete',
        stage: 'matrix',
        message: `Matrix: ${matrix.rows}x${matrix.cols}`,
      });
    } catch (err) {
      await emitEvent(emitter, {
        type: 'stage:error',
        stage: 'matrix',
        message: `Matrix generation failed: ${err}`,
      });
      throw err;
    }

    // ---- Stage: schematic ----
    if (outputs.schematic !== false) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'schematic',
        message: 'Generating KiCad schematic...',
      });
      try {
        const sch = generators.generateSchematic(layout, matrix, cfg);
        const schPath = join(buildDir, `${projectName}.kicad_sch`);
        writeFileSync(schPath, sch);
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'schematic',
          message: 'Schematic generated',
        });
      } catch (err) {
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'schematic',
          message: `Schematic generation failed: ${err}`,
        });
        throw err;
      }
    }

    // ---- Stage: pcb ----
    let pcbPath: string | null = null;
    let screwPositions: any[] = [];
    if (outputs.pcb !== false) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'pcb',
        message: 'Generating KiCad PCB layout...',
      });
      try {
        const result = generators.generatePCBWithScrews(layout, matrix, cfg);
        pcbPath = join(buildDir, `${projectName}.kicad_pcb`);
        writeFileSync(pcbPath, result.pcb);
        screwPositions = result.screwPositions ?? [];
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'pcb',
          message: 'PCB layout generated',
        });
      } catch (err: any) {
        const stack = err?.stack?.split('\n').slice(0, 5).join('\n') || '';
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'pcb',
          message: `PCB generation failed: ${err?.message || err}`,
        });
        await emitEvent(emitter, {
          type: 'log',
          message: `PCB error stack:\n${stack}`,
        });
        await emitEvent(emitter, {
          type: 'log',
          message: `Config switches: ${JSON.stringify(cfg.switches)}`,
        });
        await emitEvent(emitter, {
          type: 'log',
          message: `Config pcb: ${JSON.stringify(cfg.pcb)}`,
        });
        throw err;
      }
    }

    // ---- Stage: routing ----
    // If auto-routing is disabled on this server, force manual mode
    if (!config.enableAutoRouting && cfg.pcb?.routing === 'auto') {
      cfg.pcb.routing = 'manual';
      await emitEvent(emitter, {
        type: 'log',
        message: 'Auto-routing is disabled on this server. Switched to manual mode.',
      });
    }

    let routingIncomplete = false;
    if (outputs.pcb !== false && pcbPath) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'routing',
        message: `Routing PCB (${cfg.pcb?.routing ?? 'manual'} mode)...`,
      });
      try {
        // Pass a log callback that emits SSE events for routing progress
        const routingLog = (msg: string) => {
          emitEvent(emitter, { type: 'log', message: msg.trim() });
        };
        const routingResult = await generators.routePCB(pcbPath, buildDir, cfg, matrix, routingLog, routingTimeoutMinutes, maxPasses);
        pcbPath = routingResult.pcbPath;
        routingIncomplete = routingResult.incomplete;
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'routing',
          message: 'Routing complete',
        });
      } catch (err) {
        routingIncomplete = true;
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'routing',
          message: `Routing failed: ${err}`,
        });
        // Non-fatal: routing can fail if kicad-cli not installed
        await emitEvent(emitter, {
          type: 'log',
          message: 'Routing failed (non-fatal), continuing with unrouted PCB',
        });
      }
    }

    // ---- Stage: gerbers ----
    if (outputs.gerbers !== false && pcbPath) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'gerbers',
        message: 'Exporting Gerber files...',
      });
      try {
        const gerberDir = join(buildDir, 'gerbers');
        generators.exportGerbers(pcbPath, gerberDir);
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'gerbers',
          message: 'Gerber files exported',
        });
      } catch (err) {
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'gerbers',
          message: `Gerber export failed: ${err}`,
        });
        // Non-fatal: requires kicad-cli
        await emitEvent(emitter, {
          type: 'log',
          message: 'Gerber export requires kicad-cli (non-fatal)',
        });
      }
    }

    // ---- Stage: plate ----
    if (outputs.plate !== false && cfg.plate?.enabled !== false) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'plate',
        message: 'Generating switch plate DXF...',
      });
      try {
        const dxf = generators.generatePlate(layout, cfg);
        writeFileSync(join(buildDir, `${projectName}-plate.dxf`), dxf);
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'plate',
          message: 'Plate DXF generated',
        });
      } catch (err) {
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'plate',
          message: `Plate generation failed: ${err}`,
        });
        throw err;
      }
    }

    // ---- Stage: case ----
    if (outputs.case !== false) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'case',
        message: 'Generating case/plate SCAD files...',
      });
      try {
        generators.generateCase({
          layout,
          config: cfg,
          outputDir: buildDir,
        });
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'case',
          message: 'Case files generated',
        });
      } catch (err) {
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'case',
          message: `Case generation failed: ${err}`,
        });
        // Non-fatal: openscad might not be installed for STL
        await emitEvent(emitter, {
          type: 'log',
          message: 'Case SCAD generated, STL compilation may have failed (non-fatal)',
        });
      }
    }

    // ---- Stage: firmware ----
    if (outputs.firmware !== false) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'firmware',
        message: 'Generating firmware files...',
      });
      try {
        const fw = generators.generateFirmware(layout, matrix, cfg);
        const fwDir = join(buildDir, 'firmware');
        mkdirSync(fwDir, { recursive: true });
        writeFileSync(join(fwDir, `${projectName}.overlay`), fw.overlay);
        writeFileSync(join(fwDir, `${projectName}.keymap`), fw.keymap);
        writeFileSync(join(fwDir, `${projectName}.conf`), fw.conf);
        writeFileSync(join(fwDir, `${projectName}.zmk.yml`), fw.metadata);
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'firmware',
          message: 'Firmware files generated',
        });
      } catch (err) {
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'firmware',
          message: `Firmware generation failed: ${err}`,
        });
        throw err;
      }
    }

    // ---- Stage: bom ----
    if (outputs.bom !== false) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'bom',
        message: 'Generating bill of materials...',
      });
      try {
        const { markdown, csv } = generators.generateBOM(cfg, layout.keys.length);
        writeFileSync(join(buildDir, 'bom.md'), markdown);
        writeFileSync(join(buildDir, 'bom.csv'), csv);
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'bom',
          message: 'BOM generated',
        });
      } catch (err) {
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'bom',
          message: `BOM generation failed: ${err}`,
        });
        throw err;
      }
    }

    // ---- Stage: overview ----
    if (outputs.overview !== false) {
      await emitEvent(emitter, {
        type: 'stage:start',
        stage: 'overview',
        message: 'Generating build overview...',
      });
      try {
        // Calculate board dimensions from layout keys using switch spacing
        const spacingMap: Record<string, { x: number; y: number }> = {
          choc_v1: { x: 18, y: 17 }, choc_v2: { x: 19.05, y: 19.05 },
          mx: { x: 19.05, y: 19.05 }, mx_ulp: { x: 18, y: 18 }, gateron_lp: { x: 18, y: 17 },
        };
        const sp = spacingMap[cfg.switches?.type] || spacingMap.choc_v1;
        let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
        for (const key of layout.keys) {
          const cx = (key.x + key.width / 2) * sp.x;
          const cy = (key.y + key.height / 2) * sp.y;
          bMinX = Math.min(bMinX, cx - (key.width * sp.x) / 2);
          bMaxX = Math.max(bMaxX, cx + (key.width * sp.x) / 2);
          bMinY = Math.min(bMinY, cy - (key.height * sp.y) / 2);
          bMaxY = Math.max(bMaxY, cy + (key.height * sp.y) / 2);
        }
        if (!isFinite(bMinX)) { bMinX = 0; bMaxX = 300; bMinY = 0; bMaxY = 100; }
        const dimMargin = 8;
        const boardWidth = Math.round((bMaxX - bMinX) + dimMargin * 2);
        const boardDepth = Math.round((bMaxY - bMinY) + dimMargin * 2 + 35);
        const frontH = cfg.physical?.frontHeight ?? (cfg.pcb?.thickness || 1.6) + (cfg.plate?.thickness || 1.5) + 2;
        const rearH = cfg.physical?.rearHeight ?? frontH + 4;

        generators.generateOverview({
          config: cfg,
          layout,
          matrix,
          buildDir,
          projectDir,
          dimensions: {
            width: boardWidth,
            depth: boardDepth,
            frontHeight: frontH,
            rearHeight: rearH,
          },
          concerns: [],
        });
        await emitEvent(emitter, {
          type: 'stage:complete',
          stage: 'overview',
          message: 'Overview generated',
        });
      } catch (err) {
        await emitEvent(emitter, {
          type: 'stage:error',
          stage: 'overview',
          message: `Overview generation failed: ${err}`,
        });
        throw err;
      }
    }

    // Emit routing helper message if routing was incomplete
    if (routingIncomplete && pcbPath) {
      const helperLines = generators.buildRoutingHelperMessage(buildDir, cfg);
      for (const line of helperLines) {
        await emitEvent(emitter, { type: 'log', message: line });
      }
    }

    await emitEvent(emitter, {
      type: 'build:complete',
      message: 'Build completed successfully',
    });
  } catch (err) {
    await emitEvent(emitter, {
      type: 'build:error',
      message: `Build failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    activeBuilds.delete(projectName);
  }
}

export function isBuildActive(projectName: string): boolean {
  return activeBuilds.get(projectName) === true;
}

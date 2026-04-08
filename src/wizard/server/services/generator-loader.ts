/**
 * Lazy loader for the tools package generators.
 *
 * The wizard server dynamically imports the generator modules
 * from `src/tools` at runtime. This keeps startup fast and
 * avoids coupling the web wizard build to every generator.
 *
 * Import results are cached so repeated builds don't re-import
 * (which would leak event listeners on long-running servers).
 */
import { config } from '../config.js';

export type LoadedGenerators = Awaited<ReturnType<typeof importGeneratorsImpl>>;

let cache: LoadedGenerators | null = null;

export async function importGenerators(): Promise<LoadedGenerators> {
  if (cache) return cache;
  cache = await importGeneratorsImpl();
  return cache;
}

async function importGeneratorsImpl() {
  const toolsBase = config.toolsDir + '/src';
  const { parseKLE } = await import(toolsBase + '/kle-parser/index.js');
  const { generateMatrix } = await import(toolsBase + '/matrix-generator/index.js');
  const { generateSchematic } = await import(toolsBase + '/kicad-generator/schematic.js');
  const { generatePCB, generatePCBWithScrews } = await import(
    toolsBase + '/kicad-generator/pcb.js'
  );
  const { exportGerbers } = await import(toolsBase + '/kicad-generator/gerber-export.js');
  const { generatePlate } = await import(toolsBase + '/plate-generator/index.js');
  const { generateCase } = await import(toolsBase + '/case-generator/index.js');
  const { generateFirmware } = await import(toolsBase + '/firmware-generator/index.js');
  const { generateBOM } = await import(toolsBase + '/bom-generator/index.js');
  const { generateOverview } = await import(toolsBase + '/overview-generator/index.js');
  const { routePCB, buildRoutingHelperMessage } = await import(toolsBase + '/routing/index.js');

  return {
    parseKLE,
    generateMatrix,
    generateSchematic,
    generatePCB,
    generatePCBWithScrews,
    exportGerbers,
    generatePlate,
    generateCase,
    generateFirmware,
    generateBOM,
    generateOverview,
    routePCB,
    buildRoutingHelperMessage,
  };
}

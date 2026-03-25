/**
 * Extracts symbol definitions from installed KiCad symbol libraries.
 *
 * KiCad schematics require symbol definitions embedded in the `lib_symbols`
 * section. This module reads the actual symbol data from KiCad's installed
 * libraries so generated schematics render correctly.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/** Standard KiCad symbol library paths by platform */
const KICAD_SYMBOL_DIRS = [
  '/usr/share/kicad/symbols',           // Linux (Fedora, Arch)
  '/usr/share/kicad/library',           // Linux (older)
  '/usr/lib/kicad/share/kicad/symbols', // Linux (some distros)
  '/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols', // macOS
];

function findKicadSymbolDir(): string | null {
  // Check env var first
  for (const envVar of ['KICAD9_SYMBOL_DIR', 'KICAD8_SYMBOL_DIR', 'KICAD_SYMBOL_DIR', 'KICAD7_SYMBOL_DIR']) {
    const dir = process.env[envVar];
    if (dir && existsSync(dir)) return dir;
  }
  // Check standard paths
  for (const dir of KICAD_SYMBOL_DIRS) {
    if (existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.kicad_sym'))) return dir;
  }
  return null;
}

/**
 * Extract a named symbol (and all its sub-symbols) from a KiCad .kicad_sym file.
 * Returns the raw S-expression text for the symbol block.
 */
function extractSymbol(filePath: string, symbolName: string): string | null {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, 'utf-8');

  // Top-level symbols in KiCad lib files are tab-indented
  const pattern = `\t(symbol "${symbolName}"`;
  let start = content.indexOf(pattern);
  if (start === -1) return null;

  start += 1; // skip leading tab

  let depth = 0;
  let i = start;
  while (i < content.length) {
    if (content[i] === '(') depth++;
    else if (content[i] === ')') {
      depth--;
      if (depth === 0) {
        return content.slice(start, i + 1);
      }
    }
    i++;
  }
  return null;
}

/** Map of lib_id references we use → [library file, symbol name] */
const SYMBOL_MAP: Record<string, [string, string]> = {
  'Switch:SW_Push': ['Switch.kicad_sym', 'SW_Push'],
  'Device:D': ['Device.kicad_sym', 'D'],
  'Device:Battery': ['Device.kicad_sym', 'Battery'],
  'MCU_Nordic:nRF52840': ['MCU_Nordic.kicad_sym', 'nRF52840'],
  'Connector:USB_C_Receptacle_USB2.0_16P': ['Connector.kicad_sym', 'USB_C_Receptacle_USB2.0_16P'],
};

/**
 * Extract all needed library symbol definitions for embedding in a schematic.
 * Returns the content of the `lib_symbols` block (without the outer parens).
 *
 * @param libIds - Set of lib_id strings used in the schematic
 * @returns String content to place inside (lib_symbols ...), or empty string if libraries not found
 */
export function extractLibSymbols(libIds: Set<string>): string {
  const symbolDir = findKicadSymbolDir();
  if (!symbolDir) {
    console.warn('  Warning: KiCad symbol libraries not found. Schematic symbols will show as "?"');
    console.warn('  Install KiCad or set KICAD9_SYMBOL_DIR environment variable.');
    return '';
  }

  const parts: string[] = [];

  for (const libId of libIds) {
    const mapping = SYMBOL_MAP[libId];
    if (!mapping) {
      console.warn(`  Warning: No mapping for symbol "${libId}" — it will show as "?" in the schematic`);
      continue;
    }

    const [fileName, symbolName] = mapping;
    const filePath = join(symbolDir, fileName);
    const symbolDef = extractSymbol(filePath, symbolName);

    if (symbolDef) {
      // Re-indent for embedding (4 spaces inside lib_symbols)
      const reindented = symbolDef
        .split('\n')
        .map(line => '    ' + line.replace(/^\t+/, (tabs) => '  '.repeat(tabs.length)))
        .join('\n');
      parts.push(reindented);
    } else {
      console.warn(`  Warning: Symbol "${symbolName}" not found in ${filePath}`);
    }
  }

  return parts.join('\n');
}

import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Common locations for KiCad's Python site-packages (contains pcbnew module).
 * KiCad bundles its own Python modules outside the standard sys.path.
 */
const KICAD_PYTHON_PATHS = [
  '/usr/lib64/python3.14/site-packages',
  '/usr/lib64/python3.13/site-packages',
  '/usr/lib64/python3.12/site-packages',
  '/usr/lib64/python3.11/site-packages',
  '/usr/lib/python3/dist-packages',
  '/usr/lib/python3.12/site-packages',
  '/usr/lib/python3.11/site-packages',
  '/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/lib/python3.11/site-packages',
  '/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/lib/python3.12/site-packages',
];

function findKicadPythonPath(): string | null {
  for (const p of KICAD_PYTHON_PATHS) {
    try {
      if (existsSync(p) && readdirSync(p).some(f => f.startsWith('pcbnew'))) return p;
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Export a KiCad PCB to Specctra DSN format for autorouting.
 *
 * KiCad 9 removed `kicad-cli pcb export dsn`, so we use the KiCad Python API
 * (`pcbnew.ExportSpecctraDSN`). We search common paths for the pcbnew module
 * and set PYTHONPATH accordingly.
 */
export function exportDSN(pcbPath: string, dsnPath: string): void {
  if (!existsSync(pcbPath)) {
    throw new Error(`PCB file not found: ${pcbPath}`);
  }

  // Build Python script for DSN export
  const pythonScript = `
import sys
try:
    import pcbnew
    board = pcbnew.LoadBoard("${pcbPath.replace(/"/g, '\\"')}")
    pcbnew.ExportSpecctraDSN(board, "${dsnPath.replace(/"/g, '\\"')}")
    print("OK")
except Exception as e:
    print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(1)
`.trim();

  // Try with KiCad's Python path
  const kicadPyPath = findKicadPythonPath();
  const env = kicadPyPath
    ? { ...process.env, PYTHONPATH: `${kicadPyPath}:${process.env.PYTHONPATH ?? ''}` }
    : process.env;

  try {
    execSync(`python3 -c '${pythonScript}'`, { stdio: 'pipe', timeout: 30000, env });
    return;
  } catch {
    // Python API not available or failed
  }

  // Fallback: try kicad-cli pcb export dsn (KiCad 8 only)
  try {
    execSync('kicad-cli version', { stdio: 'pipe' });
    execSync(`kicad-cli pcb export dsn --output "${dsnPath}" "${pcbPath}"`, { stdio: 'pipe' });
    return;
  } catch {
    // Neither method worked
  }

  throw new Error(
    'DSN export requires KiCad with Python bindings (pcbnew module).\n' +
    'Auto-routing needs Specctra DSN format. You can export manually:\n' +
    '  1. Open the .kicad_pcb file in KiCad\n' +
    '  2. File → Export → Specctra DSN\n' +
    '  3. Then run Freerouting on the DSN file'
  );
}

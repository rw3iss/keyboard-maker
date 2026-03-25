import { execSync } from 'child_process';
import { copyFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Common locations for KiCad's Python site-packages (contains pcbnew module).
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
 * Import Freerouting SES session back into a KiCad PCB.
 * Uses the KiCad Python API (pcbnew.ImportSpecctraSES) since
 * kicad-cli doesn't have an SES import command in KiCad 9.
 */
export function importSES(pcbPath: string, sesPath: string, outputPath: string): void {
  if (!existsSync(sesPath)) {
    throw new Error(`SES file not found: ${sesPath}. Freerouting may not have completed.`);
  }

  // Copy original PCB to output path first
  copyFileSync(pcbPath, outputPath);

  // Use KiCad Python API to import the SES
  const escapedOutput = outputPath.replace(/'/g, "\\'");
  const escapedSes = sesPath.replace(/'/g, "\\'");

  const pythonScript = `
import sys
try:
    import pcbnew
    board = pcbnew.LoadBoard('${escapedOutput}')
    pcbnew.ImportSpecctraSES(board, '${escapedSes}')
    board.Save('${escapedOutput}')
    print('OK')
except Exception as e:
    print(f'FAIL: {e}', file=sys.stderr)
    sys.exit(1)
`.trim();

  const kicadPyPath = findKicadPythonPath();
  const env = kicadPyPath
    ? { ...process.env, PYTHONPATH: `${kicadPyPath}:${process.env.PYTHONPATH ?? ''}` }
    : process.env;

  try {
    execSync(`python3 -c '${pythonScript}'`, { stdio: 'pipe', timeout: 60000, env });
    return;
  } catch (err: any) {
    // Python API failed — provide manual instructions
    const stderr = err.stderr?.toString() ?? '';
    throw new Error(
      `SES import via Python API failed${stderr ? `: ${stderr.trim()}` : ''}.\n` +
      'Import manually in KiCad:\n' +
      `  1. Open ${outputPath} in KiCad PCB editor\n` +
      `  2. File → Import → Specctra Session\n` +
      `  3. Select ${sesPath}\n` +
      '  4. Save the PCB'
    );
  }
}

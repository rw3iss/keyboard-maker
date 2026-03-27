import { spawn, spawnSync } from 'child_process';
import { existsSync, readdirSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { homedir } from 'os';

const FREEROUTING_DIRS = [
  resolve(homedir(), '.local/bin'),
  resolve(homedir(), '.local/share/freerouting'),
  '/usr/local/bin',
  '/usr/share/freerouting',
  '/opt/freerouting',
];

function findFreerouting(): string | null {
  for (const dir of FREEROUTING_DIRS) {
    if (!existsSync(dir)) continue;
    const exact = join(dir, 'freerouting.jar');
    if (existsSync(exact)) return exact;
    try {
      const files = readdirSync(dir);
      const jars = files
        .filter(f => f.startsWith('freerouting') && f.endsWith('.jar'))
        .sort()
        .reverse();
      if (jars.length > 0) return join(dir, jars[0]);
    } catch { /* skip */ }
  }
  try {
    const result = spawnSync('which', ['freerouting'], { stdio: 'pipe' });
    if (result.status === 0) return result.stdout.toString().trim();
  } catch { /* skip */ }
  return null;
}

function detectVersion(jarPath: string): [number, number, number] | null {
  const match = jarPath.match(/freerouting[_-]?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

function writeFreeroutingConfig(dsnDir: string, dsnPath: string, sesPath: string, passes: number): void {
  const configPath = join(dsnDir, 'freerouting.json');
  const config = {
    gui: { enabled: false },
    router: {
      max_passes: passes,
      via_costs: 40,
      fanout: true,
      autoroute: true,
      postroute_optimization: false,  // Disable so Freerouting finishes and saves the SES
    },
    output: { session_file: sesPath },
  };
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch { /* non-critical */ }
}

/** Return true if line should be shown to the user */
function shouldShowLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('at ')) return false;           // stack trace frame
  if (t.startsWith('java.lang.')) return false;     // exception class name
  if (t.startsWith('Picked up')) return false;      // JAVA_TOOL_OPTIONS echo
  if (t.includes('ERROR')) return false;            // error log lines
  if (t.includes('PolylineTrace.get_trace')) return false; // noisy warn
  if (t.includes('~[freerouting')) return false;    // jar reference in stack
  if (t.includes('[freerouting')) return false;     // jar reference in stack
  if (t.startsWith('WARNING:')) return false;       // JVM warnings
  // Suppress repetitive Freerouting geometry warnings
  if (t.includes('WARN') && t.includes('ItemAutorouteInfo')) return false;
  if (t.includes('WARN') && t.includes('ShapeSearchTree')) return false;
  if (t.includes('WARN') && t.includes('expansion_room')) return false;
  if (t.includes('WARN') && t.includes('complete_shape')) return false;
  if (t.includes('WARN') && t.includes('cannot convert')) return false;
  // Suppress noisy status lines
  if (t.includes('Restoring an earlier board')) return false;
  if (t.includes('Settings were loaded')) return false;
  if (t.includes('New version available')) return false;
  if (t.includes('screen resolution')) return false;
  if (t.includes('No default constructor')) return false;
  return true;
}

function formatLine(line: string): string {
  return line.trim()
    // Strip timestamp: "2026-03-27 00:55:30.181 "
    .replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\s+/, '')
    // Strip ANSI escape codes
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Strip Freerouting job IDs in brackets: [762775\D78A03]
    .replace(/\[[0-9A-Fa-f]{4,8}\\[0-9A-Fa-f]{4,8}\]\s*/g, '')
    // Strip Freerouting job IDs in quotes: '762775\D78A03'
    .replace(/'[0-9A-Fa-f]{4,8}\\[0-9A-Fa-f]{4,8}'\s*/g, '')
    // Clean up "Job ... started at <ISO date>" → "Routing started"
    .replace(/^Job\s+started at \S+/, 'Routing started')
    // Strip redundant "INFO   " / "WARN   " prefixes
    .replace(/^INFO\s+/, '')
    .replace(/^WARN\s+/, '');
}

/**
 * Run Freerouting autorouter on a DSN file, streaming filtered output in real-time.
 * Returns a promise that resolves when routing is complete.
 */
export async function runFreerouting(dsnPath: string, sesOutputPath: string, onLog?: (msg: string) => void, timeoutMinutes = 10, maxPasses = 25): Promise<void> {
  const log = (msg: string) => { console.log(msg); onLog?.(msg); };
  const jar = findFreerouting();
  if (!jar) {
    throw new Error(
      'Freerouting not found. Install it:\n' +
      '  Run: src/scripts/setup.sh\n' +
      '  Or download from: https://github.com/freerouting/freerouting/releases\n' +
      '  Place the JAR in: ~/.local/bin/'
    );
  }

  try {
    spawnSync('java', ['-version'], { stdio: 'pipe' });
  } catch {
    throw new Error('Java not found. Install Java 11+ to run Freerouting.');
  }

  const version = detectVersion(jar);
  const jarName = jar.split('/').pop();
  log(`  Running Freerouting (${jarName})... Please wait, this may take a while...`);

  if (version && version[0] < 2) {
    log(`  Note: v${version.join('.')} is outdated. Upgrade: https://github.com/freerouting/freerouting/releases`);
  }

  writeFreeroutingConfig(dirname(dsnPath), dsnPath, sesOutputPath, maxPasses);

  const javaArgs = [
    '-Djava.awt.headless=true',
    '--add-opens=java.base/java.lang=ALL-UNNAMED',
    '-jar', jar,
    '-de', dsnPath,
    '-do', sesOutputPath,
    '-mp', String(maxPasses),
  ];

  // Track last unrouted count from streamed output
  let lastUnrouted: number | null = null;
  let allOutput = '';
  // Stall detection: kill if no progress for N consecutive passes
  let passCount = 0;
  let bestUnrouted = Infinity;
  let stallCount = 0;
  const MAX_PASSES = 50;
  const MAX_STALL = 10; // kill if 10 passes with no improvement

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('java', javaArgs, {
      cwd: dirname(dsnPath), // Freerouting reads freerouting.json from CWD
      env: { ...process.env, JAVA_TOOL_OPTIONS: '' },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    const processBuffer = (buf: string): string => {
      const lines = buf.split('\n');
      const remainder = lines.pop() ?? '';

      for (const line of lines) {
        allOutput += line + '\n';

        // Track unrouted count and pass number
        const unroutedMatch = line.match(/\((\d+) unrouted\)/);
        if (unroutedMatch) {
          lastUnrouted = parseInt(unroutedMatch[1]);

          // Stall detection
          if (lastUnrouted < bestUnrouted) {
            bestUnrouted = lastUnrouted;
            stallCount = 0;
          } else {
            stallCount++;
          }
        }

        const passMatch = line.match(/pass #(\d+)/);
        if (passMatch) {
          passCount = parseInt(passMatch[1]);
        }

        // Log stall detection but DON'T kill — let Freerouting finish naturally
        // so it saves the SES file. Killing prevents SES save in v2.x.
        if (stallCount === MAX_STALL && !child.killed) {
          log(`  Routing stalled at ${bestUnrouted} unrouted (${MAX_STALL} passes without improvement). Waiting for Freerouting to finish...`);
        }

        if (shouldShowLine(line)) {
          log(`  ${formatLine(line)}`);
        }
      }

      return remainder;
    };

    child.stdout.on('data', (data: Buffer) => {
      stdoutBuf += data.toString();
      stdoutBuf = processBuffer(stdoutBuf);
    });

    child.stderr.on('data', (data: Buffer) => {
      stderrBuf += data.toString();
      stderrBuf = processBuffer(stderrBuf);
    });

    const timeoutMs = timeoutMinutes * 60 * 1000;
    log(`  Timeout set to ${timeoutMinutes} minute${timeoutMinutes !== 1 ? 's' : ''}`);
    const timeout = setTimeout(() => {
      log(`  Freerouting timeout (${timeoutMinutes} min). Stopping...`);
      child.kill('SIGKILL');
      resolvePromise();
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);
      // Flush remaining buffers
      if (stdoutBuf.trim()) processBuffer(stdoutBuf + '\n');
      if (stderrBuf.trim()) processBuffer(stderrBuf + '\n');
      resolvePromise();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      rejectPromise(err);
    });
  });

  // Check for SES file — search multiple possible locations
  const autoSesPath = dsnPath.replace(/\.dsn$/, '.ses');
  const dsnDir = dirname(dsnPath);
  let foundSes: string | null = null;

  // Check explicit output path
  if (existsSync(sesOutputPath)) {
    foundSes = sesOutputPath;
  }
  // Check auto-named path (same dir as DSN, .ses extension)
  if (!foundSes && existsSync(autoSesPath) && autoSesPath !== sesOutputPath) {
    copyFileSync(autoSesPath, sesOutputPath);
    foundSes = sesOutputPath;
  }
  // Search the DSN directory for any .ses file
  if (!foundSes) {
    try {
      const sesFiles = readdirSync(dsnDir).filter(f => f.endsWith('.ses'));
      if (sesFiles.length > 0) {
        const found = join(dsnDir, sesFiles[0]);
        copyFileSync(found, sesOutputPath);
        foundSes = sesOutputPath;
        log(`  Found SES file: ${sesFiles[0]}`);
      }
    } catch { /* ignore */ }
  }

  if (foundSes) {
    if (lastUnrouted !== null && lastUnrouted > 0) {
      log(`  Routing complete with ${lastUnrouted} unrouted connections remaining.`);
      log('  These may need manual routing in KiCad.');
    } else {
      log('  Routing complete — all connections routed.');
    }
    return;
  }

  const unroutedMsg = lastUnrouted !== null ? ` (${lastUnrouted} unrouted at last pass)` : '';
  throw new Error(
    `Freerouting completed but did not save the session file${unroutedMsg}.\n` +
    'The routing may have succeeded — try importing manually:\n' +
    `  1. Run: java -jar ${jar} -de ${dsnPath}\n` +
    '  2. In Freerouting GUI: File → Export Specctra Session\n' +
    `  3. Save as: ${sesOutputPath}\n` +
    '  4. Then import in KiCad: File → Import → Specctra Session'
  );
}

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

function writeFreeroutingConfig(dsnDir: string, dsnPath: string, sesPath: string): void {
  const configPath = join(dsnDir, 'freerouting.json');
  const config = {
    gui: { enabled: false },
    router: {
      max_passes: 200,
      via_costs: 40,
      fanout: true,
      autoroute: true,
      postroute_optimization: true,
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
  return true;
}

function formatLine(line: string): string {
  return line.trim().replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\s+/, '');
}

/**
 * Run Freerouting autorouter on a DSN file, streaming filtered output in real-time.
 * Returns a promise that resolves when routing is complete.
 */
export async function runFreerouting(dsnPath: string, sesOutputPath: string): Promise<void> {
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
  console.log(`  Running Freerouting (${jarName})...`);

  if (version && version[0] < 2) {
    console.log(`  Note: v${version.join('.')} is outdated. Upgrade: https://github.com/freerouting/freerouting/releases`);
  }

  writeFreeroutingConfig(dirname(dsnPath), dsnPath, sesOutputPath);

  const javaArgs = [
    '-Djava.awt.headless=true',
    '--add-opens=java.base/java.lang=ALL-UNNAMED',
    '-jar', jar,
    '-de', dsnPath,
    '-do', sesOutputPath,
    '-mp', '50',
  ];

  // Track last unrouted count from streamed output
  let lastUnrouted: number | null = null;
  let allOutput = '';

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('java', javaArgs, {
      env: { ...process.env, JAVA_TOOL_OPTIONS: '' },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    const processBuffer = (buf: string): string => {
      const lines = buf.split('\n');
      // Keep the last incomplete line in the buffer
      const remainder = lines.pop() ?? '';

      for (const line of lines) {
        allOutput += line + '\n';

        // Track unrouted count
        const unroutedMatch = line.match(/\((\d+) unrouted\)/);
        if (unroutedMatch) lastUnrouted = parseInt(unroutedMatch[1]);

        if (shouldShowLine(line)) {
          console.log(`  ${formatLine(line)}`);
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

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      rejectPromise(new Error('Freerouting timed out after 10 minutes.'));
    }, 600000);

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

  // Check for SES file
  const autoSesPath = dsnPath.replace(/\.dsn$/, '.ses');
  let foundSes: string | null = null;

  if (existsSync(sesOutputPath)) {
    foundSes = sesOutputPath;
  } else if (existsSync(autoSesPath) && autoSesPath !== sesOutputPath) {
    copyFileSync(autoSesPath, sesOutputPath);
    foundSes = sesOutputPath;
  }

  if (foundSes) {
    if (lastUnrouted !== null && lastUnrouted > 0) {
      console.log(`  Routing complete with ${lastUnrouted} unrouted connections remaining.`);
      console.log('  These may need manual routing in KiCad.');
    } else {
      console.log('  Routing complete — all connections routed.');
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

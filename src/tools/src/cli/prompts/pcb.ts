import { select } from '../prompt-wrapper.js';
import chalk from 'chalk';

export async function promptPcb() {
  const layers = await select({
    message: 'PCB layer count:',
    choices: [
      { name: '2-layer (front + back)', value: 2, description: 'Standard — most affordable, sufficient for most keyboards' },
      { name: '4-layer (front + 2 inner + back)', value: 4, description: 'Better signal integrity, easier routing, dedicated power planes' },
    ],
  }) as number;

  let signalLayer = 0; // F.Cu by default

  if (layers === 4) {
    console.log(chalk.dim('\n  4-layer stack-up:'));
    console.log(chalk.dim('    Layer 0: F.Cu    (top — components, switch pads)'));
    console.log(chalk.dim('    Layer 1: In1.Cu  (inner 1 — signal or ground plane)'));
    console.log(chalk.dim('    Layer 2: In2.Cu  (inner 2 — signal or power plane)'));
    console.log(chalk.dim('    Layer 3: B.Cu    (bottom — diodes, LEDs)\n'));

    signalLayer = await select({
      message: 'Which layer for main switch/signal traces (ROW/COL)?',
      choices: [
        { name: 'Layer 0: F.Cu (top) — traces alongside switch pads', value: 0 },
        { name: 'Layer 1: In1.Cu (inner 1) — dedicated signal layer, cleanest routing', value: 1 },
        { name: 'Layer 2: In2.Cu (inner 2) — keep inner 1 as ground plane', value: 2 },
        { name: 'Layer 3: B.Cu (bottom) — traces alongside diodes/LEDs', value: 31 },
      ],
    }) as number;
  }

  const routing = await select({
    message: 'PCB routing mode:',
    choices: [
      { name: 'Auto (Freerouting)', value: 'auto', description: 'Automated routing via Freerouting' },
      { name: 'Guided (routing guide + partial auto)', value: 'guided', description: 'Generates routing instructions' },
      { name: 'Manual (KiCad)', value: 'manual', description: 'Route manually in KiCad' },
    ],
  });

  return {
    layers,
    thickness: layers === 4 ? 1.6 : 1.6,
    signalLayer,
    routing: routing as 'auto' | 'guided' | 'manual',
    fabricator: null,
  };
}

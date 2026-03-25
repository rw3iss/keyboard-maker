import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { routePCB } from './index.js';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import type { BuildConfig, SwitchMatrix } from '../shared/types.js';
import { mergeWithDefaults } from '../config/validator.js';

const TEST_OUTPUT = join(import.meta.dirname ?? '.', '__test_routing_output__');

function makeMatrix(): SwitchMatrix {
  return {
    rows: 5,
    cols: 14,
    assignments: new Map(),
  };
}

function makeConfig(routing: 'auto' | 'guided' | 'manual'): BuildConfig {
  return mergeWithDefaults({
    project: { name: 'test-routing' },
    layout: { source: 'file', path: './test.json' },
    switches: { type: 'choc_v1', model: 'kailh-choc-brown' },
    pcb: { routing },
  }) as unknown as BuildConfig;
}

describe('PCB Routing', () => {
  beforeEach(() => {
    // Clean and recreate test output directory
    if (existsSync(TEST_OUTPUT)) rmSync(TEST_OUTPUT, { recursive: true });
    mkdirSync(TEST_OUTPUT, { recursive: true });
  });

  it('generates routing-guide.md in manual mode', async () => {
    const config = makeConfig('manual');
    const matrix = makeMatrix();
    const dummyPcb = join(TEST_OUTPUT, 'test.kicad_pcb');

    // Create a dummy PCB file
    const { writeFileSync } = await import('fs');
    writeFileSync(dummyPcb, '(kicad_pcb)');

    const result = await routePCB(dummyPcb, TEST_OUTPUT, config, matrix);

    // Manual mode returns the original unrouted PCB
    expect(result).toBe(dummyPcb);

    // But routing guide should still be generated
    const guidePath = join(TEST_OUTPUT, 'routing-guide.md');
    expect(existsSync(guidePath)).toBe(true);

    const guide = readFileSync(guidePath, 'utf-8');
    expect(guide).toContain('PCB Routing Guide');
    expect(guide).toContain('COL0');
    expect(guide).toContain('ROW0');
    expect(guide).toContain(`${matrix.rows} rows`);
    expect(guide).toContain(`${matrix.cols} columns`);
  });

  it('generates routing-guide.md in guided mode', async () => {
    const config = makeConfig('guided');
    const matrix = makeMatrix();
    const dummyPcb = join(TEST_OUTPUT, 'test.kicad_pcb');

    const { writeFileSync } = await import('fs');
    writeFileSync(dummyPcb, '(kicad_pcb)');

    const result = await routePCB(dummyPcb, TEST_OUTPUT, config, matrix);
    expect(result).toBe(dummyPcb); // guided returns unrouted PCB

    const guidePath = join(TEST_OUTPUT, 'routing-guide.md');
    expect(existsSync(guidePath)).toBe(true);
  });

  it('routing guide includes battery info when bluetooth enabled', async () => {
    const config = makeConfig('manual');
    const matrix = makeMatrix();
    const dummyPcb = join(TEST_OUTPUT, 'test.kicad_pcb');

    const { writeFileSync } = await import('fs');
    writeFileSync(dummyPcb, '(kicad_pcb)');

    await routePCB(dummyPcb, TEST_OUTPUT, config, matrix);

    const guide = readFileSync(join(TEST_OUTPUT, 'routing-guide.md'), 'utf-8');
    // Default config has battery enabled
    expect(guide).toContain('Battery');
    expect(guide).toContain('charger IC');
  });

  it('routing guide includes LED info when RGB per-key enabled', async () => {
    const config = mergeWithDefaults({
      project: { name: 'test' },
      layout: { source: 'file', path: './test.json' },
      switches: { type: 'choc_v1', model: 'test' },
      pcb: { routing: 'manual' },
      features: { rgbPerKey: true },
    }) as unknown as BuildConfig;
    const matrix = makeMatrix();
    const dummyPcb = join(TEST_OUTPUT, 'test.kicad_pcb');

    const { writeFileSync } = await import('fs');
    writeFileSync(dummyPcb, '(kicad_pcb)');

    await routePCB(dummyPcb, TEST_OUTPUT, config, matrix);

    const guide = readFileSync(join(TEST_OUTPUT, 'routing-guide.md'), 'utf-8');
    expect(guide).toContain('LED data line');
  });

  it('routing guide includes Freerouting instructions', async () => {
    const config = makeConfig('manual');
    const matrix = makeMatrix();
    const dummyPcb = join(TEST_OUTPUT, 'test.kicad_pcb');

    const { writeFileSync } = await import('fs');
    writeFileSync(dummyPcb, '(kicad_pcb)');

    await routePCB(dummyPcb, TEST_OUTPUT, config, matrix);

    const guide = readFileSync(join(TEST_OUTPUT, 'routing-guide.md'), 'utf-8');
    expect(guide).toContain('freerouting');
    expect(guide).toContain('kicad-cli');
    expect(guide).toContain('.dsn');
    expect(guide).toContain('.ses');
  });

  it('auto mode falls back gracefully when freerouting is not installed', async () => {
    const config = makeConfig('auto');
    const matrix = makeMatrix();
    const dummyPcb = join(TEST_OUTPUT, 'test.kicad_pcb');

    const { writeFileSync } = await import('fs');
    writeFileSync(dummyPcb, '(kicad_pcb)');

    // Auto mode will fail (no kicad-cli/freerouting in test env) but should fall back
    const result = await routePCB(dummyPcb, TEST_OUTPUT, config, matrix);

    // Should fall back to the original unrouted PCB
    expect(result).toBe(dummyPcb);

    // Routing guide should still be generated
    expect(existsSync(join(TEST_OUTPUT, 'routing-guide.md'))).toBe(true);
  });

  // Cleanup after all tests
  afterAll(() => {
    if (existsSync(TEST_OUTPUT)) rmSync(TEST_OUTPUT, { recursive: true });
  });
});

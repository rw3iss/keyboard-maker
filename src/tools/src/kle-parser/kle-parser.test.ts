import { describe, it, expect } from 'vitest';
import { parseKLE, extractGistId } from './index.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('KLE Parser', () => {
  it('parses a minimal single-key layout', () => {
    const kle = [{ name: 'Test' }, ['A']];
    const layout = parseKLE(kle);
    expect(layout.name).toBe('Test');
    expect(layout.keys).toHaveLength(1);
    expect(layout.keys[0].labels).toContain('A');
    expect(layout.keys[0].x).toBe(0);
    expect(layout.keys[0].y).toBe(0);
    expect(layout.keys[0].width).toBe(1);
    expect(layout.keys[0].height).toBe(1);
  });

  it('parses metadata from first element', () => {
    const kle = [{ name: 'My Board', author: 'Test Author' }, ['A']];
    const layout = parseKLE(kle);
    expect(layout.name).toBe('My Board');
    expect(layout.author).toBe('Test Author');
  });

  it('handles layout without metadata', () => {
    const kle = [['A', 'B']];
    const layout = parseKLE(kle);
    expect(layout.name).toBe('Untitled');
    expect(layout.keys).toHaveLength(2);
  });

  it('places consecutive keys at incrementing X positions', () => {
    const kle = [{ name: 'Test' }, ['A', 'B', 'C']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].x).toBe(0);
    expect(layout.keys[1].x).toBe(1);
    expect(layout.keys[2].x).toBe(2);
  });

  it('handles x offset between keys', () => {
    const kle = [{ name: 'Test' }, ['A', { x: 0.5 }, 'B']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].x).toBe(0);
    expect(layout.keys[1].x).toBeCloseTo(1.5);
  });

  it('handles multi-row layout with implicit Y advance', () => {
    const kle = [{ name: 'Test' }, ['A'], ['B']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].y).toBe(0);
    expect(layout.keys[1].y).toBe(1);
  });

  it('handles y offset within a row', () => {
    const kle = [{ name: 'Test' }, ['A'], [{ y: 0.25 }, 'B']];
    const layout = parseKLE(kle);
    expect(layout.keys[1].y).toBeCloseTo(1.25);
  });

  it('handles wide keys', () => {
    const kle = [{ name: 'Test' }, [{ w: 2.25 }, 'Shift']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].width).toBe(2.25);
  });

  it('wide key advances cursor by its full width', () => {
    const kle = [{ name: 'Test' }, [{ w: 2 }, 'Shift', 'A']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].x).toBe(0);
    expect(layout.keys[0].width).toBe(2);
    expect(layout.keys[1].x).toBe(2); // after 2u shift
  });

  it('handles tall keys', () => {
    const kle = [{ name: 'Test' }, [{ h: 2 }, 'Enter']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].height).toBe(2);
  });

  it('handles ISO enter with secondary dimensions', () => {
    const kle = [
      { name: 'Test' },
      [{ h: 2, w2: 1.75, h2: 1, x2: -0.75, y2: 1 }, 'Enter'],
    ];
    const layout = parseKLE(kle);
    const enter = layout.keys[0];
    expect(enter.height).toBe(2);
    expect(enter.width2).toBe(1.75);
    expect(enter.height2).toBe(1);
    expect(enter.x2).toBe(-0.75);
    expect(enter.y2).toBe(1);
  });

  it('resets per-key properties between keys', () => {
    const kle = [{ name: 'Test' }, [{ w: 2 }, 'Shift', 'Z']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].width).toBe(2);
    expect(layout.keys[1].width).toBe(1); // should reset to default
  });

  it('carries forward rotation across keys', () => {
    const kle = [{ name: 'Test' }, [{ r: 15, rx: 5, ry: 5 }, 'A', 'B']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].rotation).toBe(15);
    expect(layout.keys[1].rotation).toBe(15); // carries forward
  });

  it('carries forward profile across keys', () => {
    const kle = [{ name: 'Test' }, [{ p: 'CHICKLET' }, 'A', 'B']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].profile).toBe('CHICKLET');
    expect(layout.keys[1].profile).toBe('CHICKLET');
  });

  it('handles multiline labels', () => {
    const kle = [{ name: 'Test' }, ['!\n1']];
    const layout = parseKLE(kle);
    expect(layout.keys[0].labels).toEqual(['!', '1']);
  });

  it('assigns unique IDs to all keys', () => {
    const kle = [{ name: 'Test' }, ['A', 'B', 'C'], ['D', 'E', 'F']];
    const layout = parseKLE(kle);
    const ids = layout.keys.map(k => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('parses the full blue-dream-space layout', () => {
    const layoutPath = resolve(__dirname, '../../../../projects/blue-dream-space/kle.json');
    const raw = JSON.parse(readFileSync(layoutPath, 'utf-8'));
    const layout = parseKLE(raw);

    expect(layout.name).toBe('Blue Dream Space');
    expect(layout.author).toBe('Ryan Weiss');
    expect(layout.keys.length).toBeGreaterThan(70);

    // Verify Esc is the first key
    expect(layout.keys[0].labels).toContain('Esc');

    // Verify all keys have unique IDs
    const ids = layout.keys.map(k => k.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Verify we parse the macro keys (A1, A2, A3)
    const macroKeys = layout.keys.filter(k => k.labels.some(l => /^A\d$/.test(l)));
    expect(macroKeys.length).toBe(3);

    // Verify the spacebar is 6.5u wide
    const spacebar = layout.keys.find(k => k.labels.includes('') && k.width > 5);
    expect(spacebar).toBeDefined();
    expect(spacebar!.width).toBe(6.5);
  });

  it('handles negative y offsets (keys above the row baseline)', () => {
    const kle = [
      { name: 'Test' },
      ['A'],
      [{ y: -0.9, x: 14 }, 'B'], // B is placed above normal row 2
    ];
    const layout = parseKLE(kle);
    // Row 1 ends at y=0, row 2 starts at y=1, with -0.9 offset → y=0.1
    expect(layout.keys[1].y).toBeCloseTo(0.1);
  });
});

describe('extractGistId', () => {
  it('extracts gist ID from a KLE URL', () => {
    const url = 'https://www.keyboard-layout-editor.com/#/gists/a7c6cae098574d8fd875695135bce055';
    expect(extractGistId(url)).toBe('a7c6cae098574d8fd875695135bce055');
  });

  it('returns null for non-gist URL', () => {
    expect(extractGistId('https://google.com')).toBeNull();
  });

  it('handles URL without www', () => {
    const url = 'http://keyboard-layout-editor.com/#/gists/abc123def456';
    expect(extractGistId(url)).toBe('abc123def456');
  });
});

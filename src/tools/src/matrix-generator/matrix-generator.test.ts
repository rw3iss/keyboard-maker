import { describe, it, expect } from 'vitest';
import { generateMatrix } from './index.js';
import type { KeyboardLayout, Key } from '../shared/types.js';

function makeKey(id: string, x: number, y: number, w = 1, h = 1): Key {
  return {
    id, labels: [id], x, y, width: w, height: h,
    rotation: 0, rotationX: 0, rotationY: 0,
  };
}

function makeLayout(keys: Key[]): KeyboardLayout {
  return { name: 'Test', author: 'Test', keys, metadata: {} };
}

describe('Matrix Generator', () => {
  it('generates a matrix for a simple 2x3 grid', () => {
    const keys = [
      makeKey('a', 0, 0), makeKey('b', 1, 0), makeKey('c', 2, 0),
      makeKey('d', 0, 1), makeKey('e', 1, 1), makeKey('f', 2, 1),
    ];
    const matrix = generateMatrix(makeLayout(keys));
    expect(matrix.rows).toBe(2);
    expect(matrix.cols).toBe(3);
    expect(matrix.assignments.size).toBe(6);
  });

  it('assigns unique matrix positions to each key', () => {
    const keys = [
      makeKey('a', 0, 0), makeKey('b', 1, 0),
      makeKey('c', 0, 1), makeKey('d', 1, 1),
    ];
    const matrix = generateMatrix(makeLayout(keys));
    const positions = [...matrix.assignments.values()];
    const posStrings = positions.map(p => `${p.row},${p.col}`);
    expect(new Set(posStrings).size).toBe(posStrings.length);
  });

  it('handles wide keys — one matrix position per key', () => {
    const keys = [
      makeKey('a', 0, 0, 1),
      makeKey('space', 1, 0, 6.5),
    ];
    const matrix = generateMatrix(makeLayout(keys));
    expect(matrix.assignments.size).toBe(2);
    expect(matrix.cols).toBe(2);
  });

  it('groups keys on the same visual row despite fractional Y offsets', () => {
    // Keys at y=0.0 and y=0.15 should be in the same row
    const keys = [
      makeKey('a', 0, 0),
      makeKey('b', 1, 0.15),
    ];
    const matrix = generateMatrix(makeLayout(keys));
    expect(matrix.rows).toBe(1);
    expect(matrix.cols).toBe(2);
  });

  it('separates keys with large Y differences into different rows', () => {
    const keys = [
      makeKey('a', 0, 0),
      makeKey('b', 0, 1),
      makeKey('c', 0, 2.5),
    ];
    const matrix = generateMatrix(makeLayout(keys));
    expect(matrix.rows).toBe(3);
  });

  it('sorts keys within a row by X position', () => {
    // Insert keys out of X order
    const keys = [
      makeKey('c', 2, 0), makeKey('a', 0, 0), makeKey('b', 1, 0),
    ];
    const matrix = generateMatrix(makeLayout(keys));
    expect(matrix.assignments.get('a')).toEqual({ row: 0, col: 0 });
    expect(matrix.assignments.get('b')).toEqual({ row: 0, col: 1 });
    expect(matrix.assignments.get('c')).toEqual({ row: 0, col: 2 });
  });

  it('throws when matrix exceeds GPIO limit', () => {
    // Create a layout that needs too many pins for a tiny GPIO budget
    const keys = [
      makeKey('a', 0, 0), makeKey('b', 1, 0), makeKey('c', 2, 0),
      makeKey('d', 0, 1), makeKey('e', 1, 1), makeKey('f', 2, 1),
      makeKey('g', 0, 2), makeKey('h', 1, 2), makeKey('i', 2, 2),
    ];
    // 3 rows + 3 cols = 6 GPIOs, set limit to 5
    expect(() => generateMatrix(makeLayout(keys), 5)).toThrow(/GPIO/);
  });

  it('does not throw when matrix fits within GPIO limit', () => {
    const keys = [
      makeKey('a', 0, 0), makeKey('b', 1, 0),
      makeKey('c', 0, 1), makeKey('d', 1, 1),
    ];
    // 2 rows + 2 cols = 4 GPIOs
    expect(() => generateMatrix(makeLayout(keys), 4)).not.toThrow();
  });

  it('handles a realistic ~80 key layout within nRF52840 limits', () => {
    const keys: Key[] = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 15; c++) {
        keys.push(makeKey(`k${r}_${c}`, c, r));
      }
    }
    const matrix = generateMatrix(makeLayout(keys), 32);
    expect(matrix.rows).toBe(6);
    expect(matrix.cols).toBe(15);
    expect(matrix.rows + matrix.cols).toBe(21); // well within 32
    expect(matrix.assignments.size).toBe(90);
  });

  it('optimizes matrix when natural grouping exceeds GPIO limit', () => {
    // 6 rows × 16 cols = 22 GPIOs — too many for 21-pin MCU
    // Optimizer should split a row to get ≤ 21 total pins
    const keys: Key[] = [];
    for (let r = 0; r < 6; r++) {
      const colCount = r === 0 ? 16 : 14; // row 0 has 16 keys
      for (let c = 0; c < colCount; c++) {
        keys.push(makeKey(`k${r}_${c}`, c, r));
      }
    }
    const matrix = generateMatrix(makeLayout(keys), 21);
    expect(matrix.rows + matrix.cols).toBeLessThanOrEqual(21);
    expect(matrix.assignments.size).toBe(86);
    // All keys should have unique positions
    const positions = [...matrix.assignments.values()];
    const posStrings = positions.map(p => `${p.row},${p.col}`);
    expect(new Set(posStrings).size).toBe(posStrings.length);
  });

  it('optimizes 86 keys to fit nice!nano (21 GPIOs)', () => {
    // Simulate the Blue Dream Space layout: 86 keys across 6 visual rows
    const keys: Key[] = [];
    let id = 0;
    const rowSizes = [16, 16, 16, 14, 14, 10]; // typical 75% layout
    for (let r = 0; r < rowSizes.length; r++) {
      for (let c = 0; c < rowSizes[r]; c++) {
        keys.push(makeKey(`k${id++}`, c, r));
      }
    }
    const matrix = generateMatrix(makeLayout(keys), 21);
    expect(matrix.rows + matrix.cols).toBeLessThanOrEqual(21);
    expect(matrix.assignments.size).toBe(86);
  });

  it('throws only when optimization truly cannot fit', () => {
    // 100 keys need minimum 20 pins (10×10). Set limit to 15 — impossible
    const keys: Key[] = [];
    for (let i = 0; i < 100; i++) {
      keys.push(makeKey(`k${i}`, i % 20, Math.floor(i / 20)));
    }
    expect(() => generateMatrix(makeLayout(keys), 15)).toThrow(/GPIO/);
  });

  it('preserves all key assignments after optimization', () => {
    const keys: Key[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 10; c++) {
        keys.push(makeKey(`k${r}_${c}`, c, r));
      }
    }
    // 4×10 = 14 pins naturally. Force tight: limit 13
    const matrix = generateMatrix(makeLayout(keys), 13);
    expect(matrix.assignments.size).toBe(40);
    // Every key should be in the matrix
    for (const key of keys) {
      expect(matrix.assignments.has(key.id)).toBe(true);
    }
  });
});

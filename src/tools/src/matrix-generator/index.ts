import type { KeyboardLayout, SwitchMatrix, MatrixPosition, Key } from '../shared/types.js';

/**
 * Generate an optimized switch matrix from a keyboard layout.
 *
 * First groups keys by visual row (Y position). If the resulting matrix
 * exceeds the GPIO budget, it optimizes by splitting long rows to reduce
 * total pin count (rows + cols). The optimal split minimizes rows + cols
 * for a given number of keys.
 *
 * For N keys, the minimum pins needed is 2*ceil(sqrt(N)). For example,
 * 86 keys can fit in a 10×9 matrix (19 GPIOs) since 10×9=90 >= 86.
 *
 * @param layout - Parsed keyboard layout
 * @param maxGpio - Maximum available GPIO pins on the MCU (default: 32)
 * @returns SwitchMatrix with row/col assignments for each key
 * @throws Error if even the optimal matrix can't fit within GPIO budget
 */
export function generateMatrix(layout: KeyboardLayout, maxGpio = 32): SwitchMatrix {
  const keys = [...layout.keys];
  const keyCount = keys.length;

  // Check if it's even theoretically possible
  const minPins = optimalPinCount(keyCount);
  if (minPins > maxGpio) {
    throw new Error(
      `${keyCount} keys require at minimum ${minPins} GPIOs ` +
      `(${optimalDimensions(keyCount).rows}R × ${optimalDimensions(keyCount).cols}C), ` +
      `but only ${maxGpio} are available. ` +
      `This MCU cannot support a keyboard with this many keys.`
    );
  }

  // Step 1: Group keys by visual row
  const visualRows = groupByVisualRow(keys);

  const naturalRows = visualRows.length;
  const naturalCols = Math.max(...visualRows.map(row => row.length));
  const naturalPins = naturalRows + naturalCols;

  // If the natural grouping fits, use it directly
  if (naturalPins <= maxGpio) {
    return buildMatrix(visualRows);
  }

  // Step 2: Optimize — rebalance the matrix to fit within GPIO budget
  // Strategy: split the longest rows until we fit
  const optimized = optimizeMatrix(visualRows, maxGpio);
  return buildMatrix(optimized);
}

/** Group keys by approximate visual row (Y position, rounded to nearest 0.5) */
function groupByVisualRow(keys: Key[]): Key[][] {
  const rowGroups = new Map<number, Key[]>();
  for (const key of keys) {
    const rowKey = Math.round(key.y * 2) / 2;
    if (!rowGroups.has(rowKey)) rowGroups.set(rowKey, []);
    rowGroups.get(rowKey)!.push(key);
  }

  return [...rowGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, rowKeys]) => rowKeys.sort((a, b) => a.x - b.x));
}

/**
 * Optimize matrix dimensions to fit within a GPIO budget.
 * Splits the longest rows to add more rows but reduce max columns.
 */
function optimizeMatrix(rows: Key[][], maxGpio: number): Key[][] {
  let current = rows.map(r => [...r]);

  for (let iteration = 0; iteration < 50; iteration++) {
    const numRows = current.length;
    const numCols = Math.max(...current.map(r => r.length));

    if (numRows + numCols <= maxGpio) {
      return current;
    }

    // Find the longest row and split it in half
    let longestIdx = 0;
    let longestLen = 0;
    for (let i = 0; i < current.length; i++) {
      if (current[i].length > longestLen) {
        longestLen = current[i].length;
        longestIdx = i;
      }
    }

    if (longestLen <= 1) break; // Can't split further

    const row = current[longestIdx];
    const mid = Math.ceil(row.length / 2);
    const firstHalf = row.slice(0, mid);
    const secondHalf = row.slice(mid);

    // Replace the long row with two shorter rows
    current.splice(longestIdx, 1, firstHalf, secondHalf);
  }

  // Final check
  const numRows = current.length;
  const numCols = Math.max(...current.map(r => r.length));
  if (numRows + numCols > maxGpio) {
    throw new Error(
      `Cannot fit ${rows.reduce((s, r) => s + r.length, 0)} keys within ${maxGpio} GPIOs. ` +
      `Best achievable: ${numRows}R × ${numCols}C = ${numRows + numCols} pins. ` +
      `Consider a MCU with more GPIOs.`
    );
  }

  return current;
}

/** Build a SwitchMatrix from organized rows of keys */
function buildMatrix(rows: Key[][]): SwitchMatrix {
  const numRows = rows.length;
  const numCols = Math.max(...rows.map(r => r.length));

  const assignments = new Map<string, MatrixPosition>();
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      assignments.set(rows[row][col].id, { row, col });
    }
  }

  return { rows: numRows, cols: numCols, assignments };
}

/** Calculate minimum total pins (rows + cols) for N keys */
function optimalPinCount(n: number): number {
  const sqrt = Math.ceil(Math.sqrt(n));
  const rows = sqrt;
  const cols = Math.ceil(n / rows);
  return rows + cols;
}

/** Calculate optimal matrix dimensions for N keys */
function optimalDimensions(n: number): { rows: number; cols: number } {
  const sqrt = Math.ceil(Math.sqrt(n));
  const rows = sqrt;
  const cols = Math.ceil(n / rows);
  return { rows, cols };
}

import type { Key, KeyboardLayout } from '../shared/types.js';
import type { KLERawKeyProps, KLERawMetadata } from './types.js';

/**
 * Parse a KLE (keyboard-layout-editor.com) JSON array into our canonical KeyboardLayout.
 *
 * KLE JSON format:
 * - Top-level array of rows
 * - First element may be a metadata object (not an array)
 * - Each row is an array of strings (key labels) and objects (property modifiers)
 * - Property objects apply to the NEXT key string in the row
 * - Some properties (r, rx, ry, c, t, a, f, p) carry across keys until changed
 * - Others (x, y, w, h, x2, y2, w2, h2) are per-key and reset after each key
 */
export function parseKLE(raw: unknown[]): KeyboardLayout {
  let metadata: KLERawMetadata = {};
  const keys: Key[] = [];
  let keyIndex = 0;

  // First element may be metadata object (not an array)
  let startIndex = 0;
  if (raw.length > 0 && !Array.isArray(raw[0]) && typeof raw[0] === 'object' && raw[0] !== null) {
    metadata = raw[0] as KLERawMetadata;
    startIndex = 1;
  }

  // Carry-forward state
  let currentR = 0;
  let currentRx = 0;
  let currentRy = 0;
  let currentProfile: string | undefined;
  let currentColor: string | undefined;
  let currentTextColor: string | undefined;
  let currentAlign: number | undefined;
  let currentFontSize: number | undefined;

  // Cursor position
  let cursorY = 0;

  for (let i = startIndex; i < raw.length; i++) {
    const row = raw[i];
    if (!Array.isArray(row)) continue;

    let cursorX = 0;

    // Per-key properties accumulator (reset per key)
    let nextX = 0;
    let nextY = 0;
    let nextW = 1;
    let nextH = 1;
    let nextW2: number | undefined;
    let nextH2: number | undefined;
    let nextX2: number | undefined;
    let nextY2: number | undefined;

    for (const item of row) {
      if (typeof item === 'object' && item !== null) {
        const props = item as KLERawKeyProps;

        // Carry-forward properties
        if (props.r !== undefined) currentR = props.r;
        if (props.rx !== undefined) {
          currentRx = props.rx;
          // When rx changes, cursor X resets to rx
          cursorX = currentRx;
        }
        if (props.ry !== undefined) {
          currentRy = props.ry;
          // When ry changes, cursor Y resets to ry
          cursorY = currentRy;
        }
        if (props.p !== undefined) currentProfile = props.p;
        if (props.c !== undefined) currentColor = props.c;
        if (props.t !== undefined) currentTextColor = props.t;
        if (props.a !== undefined) currentAlign = props.a;
        if (props.f !== undefined) currentFontSize = props.f;

        // Per-key offset (accumulate into cursor)
        if (props.x !== undefined) nextX = props.x;
        if (props.y !== undefined) nextY = props.y;

        // Per-key size
        if (props.w !== undefined) nextW = props.w;
        if (props.h !== undefined) nextH = props.h;
        if (props.w2 !== undefined) nextW2 = props.w2;
        if (props.h2 !== undefined) nextH2 = props.h2;
        if (props.x2 !== undefined) nextX2 = props.x2;
        if (props.y2 !== undefined) nextY2 = props.y2;

        continue;
      }

      // String item = key label
      const label = item as string;

      // Apply offsets
      cursorX += nextX;
      cursorY += nextY;

      const key: Key = {
        id: `key_${keyIndex}`,
        labels: label.split('\n'),
        x: cursorX,
        y: cursorY,
        width: nextW,
        height: nextH,
        rotation: currentR,
        rotationX: currentRx,
        rotationY: currentRy,
        profile: currentProfile,
      };

      if (nextW2 !== undefined) key.width2 = nextW2;
      if (nextH2 !== undefined) key.height2 = nextH2;
      if (nextX2 !== undefined) key.x2 = nextX2;
      if (nextY2 !== undefined) key.y2 = nextY2;

      keys.push(key);
      keyIndex++;

      // Advance cursor by key width
      cursorX += nextW;

      // Reset per-key properties
      nextX = 0;
      nextY = 0;
      nextW = 1;
      nextH = 1;
      nextW2 = undefined;
      nextH2 = undefined;
      nextX2 = undefined;
      nextY2 = undefined;
    }

    // After processing a row, advance Y by 1 (standard row height)
    cursorY += 1;
  }

  return {
    name: metadata.name ?? 'Untitled',
    author: metadata.author ?? 'Unknown',
    keys,
    metadata: {
      backcolor: metadata.backcolor,
      background: metadata.background,
      radii: metadata.radii,
      plate: metadata.plate,
      pcb: metadata.pcb,
    },
  };
}

/**
 * Extract a GitHub gist ID from a KLE URL.
 * Handles formats like:
 *   https://www.keyboard-layout-editor.com/#/gists/a7c6cae098574d8fd875695135bce055
 *   http://keyboard-layout-editor.com/#/gists/abc123
 */
export function extractGistId(kleUrl: string): string | null {
  const match = kleUrl.match(/gists\/([a-f0-9]+)/);
  return match ? match[1] : null;
}

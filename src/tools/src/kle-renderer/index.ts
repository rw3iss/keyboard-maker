/**
 * KLE Layout Renderer — generates an SVG (or PNG) image of a keyboard layout.
 *
 * Reads a parsed KeyboardLayout and produces a styled SVG string with
 * dark background, rounded-rectangle keys, and centered labels.
 * If `sharp` is available at runtime the SVG is converted to PNG;
 * otherwise the output is written as .svg.
 */

import type { KeyboardLayout, Key } from '../shared/types.js';
import { SWITCH_SPACING, KLE_UNIT_MM } from '../shared/constants.js';
import type { SwitchType } from '../shared/types.js';
import { writeFileSync } from 'fs';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BG_COLOR = '#1a1a2e';
const KEY_FILL = '#2d3748';
const KEY_STROKE = '#4a5568';
const KEY_RX = 5; // border-radius in SVG units
const KEY_INNER_PAD = 3; // padding inside the cap rectangle
const LABEL_COLOR = '#e2e8f0';
const TITLE_COLOR = '#94a3b8';
const FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

/** Pixels-per-KLE-unit scale factor (1u = this many SVG px). */
const SCALE = 58;

/* ------------------------------------------------------------------ */
/*  SVG generation                                                     */
/* ------------------------------------------------------------------ */

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderKey(key: Key, index: number): string {
  const x = key.x * SCALE;
  const y = key.y * SCALE;
  const w = key.width * SCALE;
  const h = key.height * SCALE;

  const pad = KEY_INNER_PAD;
  const capX = x + pad;
  const capY = y + pad;
  const capW = w - pad * 2;
  const capH = h - pad * 2;

  // Primary label is labels[0] (top-left in KLE), fall back to index
  const label = (key.labels[0] || '').trim();

  // Optional rotation transform
  let transform = '';
  if (key.rotation !== 0) {
    const rx = key.rotationX * SCALE;
    const ry = key.rotationY * SCALE;
    transform = ` transform="rotate(${key.rotation} ${rx} ${ry})"`;
  }

  // Gradient id per-key for a subtle 3-D look
  const gradId = `kg${index}`;

  return `
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a4a5e"/>
      <stop offset="100%" stop-color="${KEY_FILL}"/>
    </linearGradient>
  </defs>
  <g${transform}>
    <rect x="${capX}" y="${capY}" width="${capW}" height="${capH}"
          rx="${KEY_RX}" ry="${KEY_RX}"
          fill="url(#${gradId})" stroke="${KEY_STROKE}" stroke-width="1.2"/>
    ${label ? `<text x="${capX + capW / 2}" y="${capY + capH / 2 + 4}"
          text-anchor="middle" dominant-baseline="middle"
          fill="${LABEL_COLOR}" font-family="${FONT_FAMILY}"
          font-size="${capW < 40 ? 11 : 13}" font-weight="500">${escapeXml(label)}</text>` : ''}
  </g>`;
}

/**
 * Generate a complete SVG string for the given keyboard layout.
 */
export function renderLayoutSVG(layout: KeyboardLayout, switchType?: string): string {
  if (layout.keys.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
      <rect width="400" height="200" fill="${BG_COLOR}"/>
      <text x="200" y="100" text-anchor="middle" fill="${TITLE_COLOR}"
            font-family="${FONT_FAMILY}" font-size="16">No keys in layout</text>
    </svg>`;
  }

  // Compute bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const key of layout.keys) {
    const kx = key.x * SCALE;
    const ky = key.y * SCALE;
    const kw = key.width * SCALE;
    const kh = key.height * SCALE;
    minX = Math.min(minX, kx);
    minY = Math.min(minY, ky);
    maxX = Math.max(maxX, kx + kw);
    maxY = Math.max(maxY, ky + kh);
  }

  const pad = 40;
  const titleHeight = 48;
  const svgW = maxX - minX + pad * 2;
  const svgH = maxY - minY + pad * 2 + titleHeight;

  const offsetX = -minX + pad;
  const offsetY = -minY + pad + titleHeight;

  const title = layout.name || 'Keyboard Layout';
  const subtitle = [
    layout.author ? `by ${layout.author}` : '',
    `${layout.keys.length} keys`,
    switchType || '',
  ]
    .filter(Boolean)
    .join('  |  ');

  const keysSvg = layout.keys.map((k, i) => renderKey(k, i)).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <rect width="${svgW}" height="${svgH}" fill="${BG_COLOR}" rx="12"/>
  <text x="${pad}" y="${pad + 6}" fill="${LABEL_COLOR}" font-family="${FONT_FAMILY}" font-size="18" font-weight="700">${escapeXml(title)}</text>
  <text x="${pad}" y="${pad + 26}" fill="${TITLE_COLOR}" font-family="${FONT_FAMILY}" font-size="12">${escapeXml(subtitle)}</text>
  <g transform="translate(${offsetX},${offsetY})">
    ${keysSvg}
  </g>
</svg>`;
}

/**
 * Render the layout to a file. Writes SVG (adjusting the extension if needed).
 * Attempts PNG conversion via sharp if the module is available.
 */
export async function renderLayoutImage(
  layout: KeyboardLayout,
  switchType: string,
  outputPath: string,
): Promise<string> {
  const svg = renderLayoutSVG(layout, switchType);

  // Try PNG conversion via sharp
  try {
    // Dynamic import so it's optional — sharp may not be installed
    // @ts-ignore — sharp is an optional dependency
    const sharp = (await import('sharp')).default;
    const pngPath = outputPath.endsWith('.png') ? outputPath : outputPath.replace(/\.\w+$/, '.png');
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(pngPath, buf);
    return pngPath;
  } catch {
    // sharp not available — write SVG instead
    const svgPath = outputPath.replace(/\.png$/, '.svg');
    writeFileSync(svgPath, svg, 'utf-8');
    return svgPath;
  }
}

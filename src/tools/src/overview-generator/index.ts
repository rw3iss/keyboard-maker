import type { BuildConfig, KeyboardLayout, SwitchMatrix, DesignNote } from '../shared/types.js';
import { writeFileSync, readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, extname, relative } from 'path';
import { generateStandaloneViewer } from './viewer-standalone.js';

export interface OverviewData {
  config: BuildConfig;
  layout: KeyboardLayout;
  matrix: SwitchMatrix;
  buildDir: string;
  projectDir: string;
  /** Board physical dimensions in mm */
  dimensions: {
    width: number;
    depth: number;
    frontHeight: number;
    rearHeight: number;
  };
  /** Design notes / validation concerns */
  concerns: DesignNote[];
}

export function generateOverview(data: OverviewData): void {
  // Generate standalone viewer alongside overview
  const viewerHTML = generateStandaloneViewer(data.config, data.layout, data.matrix);
  writeFileSync(join(data.buildDir, 'viewer.html'), viewerHTML);

  const html = buildOverviewHTML(data);
  writeFileSync(join(data.buildDir, 'overview.html'), html);
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

interface FileEntry {
  name: string;
  relativePath: string;
  size: number;
  group: 'pcb' | 'firmware' | '3d' | 'docs' | 'images' | 'other';
  ext: string;
}

function scanBuildDir(buildDir: string): FileEntry[] {
  const entries: FileEntry[] = [];

  function walk(dir: string): void {
    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const fullPath = join(dir, item);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        const rel = relative(buildDir, fullPath);
        const ext = extname(item).toLowerCase();
        entries.push({
          name: item,
          relativePath: rel,
          size: stat.size,
          group: classifyFile(ext, item),
          ext,
        });
      }
    }
  }

  walk(buildDir);
  return entries;
}

function classifyFile(ext: string, name: string): FileEntry['group'] {
  if (['.kicad_sch', '.kicad_pcb', '.kicad_pro', '.gbr', '.drl', '.gbl', '.gbs', '.gtl', '.gts', '.gto', '.gbo', '.gm1'].includes(ext)) return 'pcb';
  if (['.overlay', '.keymap', '.conf', '.yml', '.yaml', '.zmk'].includes(ext) || name.includes('firmware')) return 'firmware';
  if (['.stl', '.step', '.dxf', '.scad', '.obj', '.3mf'].includes(ext)) return '3d';
  if (['.png', '.svg', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext)) return 'images';
  if (['.md', '.csv', '.txt', '.log', '.json', '.html'].includes(ext)) return 'docs';
  return 'other';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(group: FileEntry['group']): string {
  switch (group) {
    case 'pcb': return '&#x1F4D0;';       // triangular ruler
    case 'firmware': return '&#x1F527;';   // wrench
    case '3d': return '&#x1F4E6;';         // package
    case 'images': return '&#x1F3A8;';     // palette
    case 'docs': return '&#x1F4C4;';       // page
    default: return '&#x1F4C4;';
  }
}

function isImageFile(ext: string): boolean {
  return ['.png', '.svg', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext);
}

function isTextFile(ext: string): boolean {
  return ['.md', '.csv', '.txt', '.log', '.conf', '.keymap', '.overlay', '.json', '.yml', '.yaml'].includes(ext);
}

function is3DFile(ext: string): boolean {
  return ['.stl', '.step', '.dxf', '.scad', '.obj', '.3mf'].includes(ext);
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// ASCII side profile
// ---------------------------------------------------------------------------

function asciiSideProfile(dims: OverviewData['dimensions']): string {
  const { frontHeight, rearHeight, width } = dims;
  // Build a simple side-view representation
  const maxH = Math.max(frontHeight, rearHeight);
  const rows = 8;
  const cols = 40;

  const lines: string[] = [];
  lines.push(`  Side Profile (not to scale)`);
  lines.push(`  Rear: ${rearHeight.toFixed(1)}mm    Front: ${frontHeight.toFixed(1)}mm`);
  lines.push('');

  // Simple trapezoid
  const rearPx = Math.round((rearHeight / maxH) * rows);
  const frontPx = Math.round((frontHeight / maxH) * rows);

  for (let r = 0; r < rows; r++) {
    const rearVisible = r >= (rows - rearPx);
    const frontVisible = r >= (rows - frontPx);
    let line = '  ';
    if (rearVisible && frontVisible) {
      line += '#'.repeat(cols);
    } else if (rearVisible) {
      const fraction = (r - (rows - rearPx)) / rearPx;
      const fill = Math.round(fraction * cols * 0.3);
      line += '#'.repeat(fill) + ' '.repeat(cols - fill);
    } else {
      line += ' '.repeat(cols);
    }
    lines.push(line);
  }
  lines.push('  ' + '='.repeat(cols));
  lines.push('  ' + ' '.repeat(cols - 10) + '[USB-C]');
  lines.push(`  <-- ${width.toFixed(0)}mm -->`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Build the HTML
// ---------------------------------------------------------------------------

function buildOverviewHTML(data: OverviewData): string {
  const { config, layout, matrix, buildDir, dimensions, concerns } = data;
  const files = scanBuildDir(buildDir);
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  const totalPins = matrix.rows + matrix.cols;

  // Group files
  const groups: Record<string, FileEntry[]> = {
    pcb: [],
    firmware: [],
    '3d': [],
    images: [],
    docs: [],
    other: [],
  };
  for (const f of files) {
    groups[f.group].push(f);
  }

  // Build file preview snippets (for text files)
  const textPreviews: Record<string, string> = {};
  for (const f of files) {
    if (isTextFile(f.ext)) {
      try {
        const content = readFileSync(join(buildDir, f.relativePath), 'utf-8');
        const lines = content.split('\n').slice(0, 50);
        textPreviews[f.relativePath] = escapeHTML(lines.join('\n'));
        if (content.split('\n').length > 50) {
          textPreviews[f.relativePath] += '\n... (truncated)';
        }
      } catch {
        // skip unreadable
      }
    }
  }

  const sideProfile = asciiSideProfile(dimensions);

  function renderFileGroup(title: string, entries: FileEntry[]): string {
    if (entries.length === 0) return '';
    let html = `<div class="file-group"><h4>${title}</h4>`;
    for (const f of entries) {
      html += `<div class="file-entry">`;
      html += `<span class="file-icon">${fileIcon(f.group)}</span>`;
      html += `<a href="./${escapeHTML(f.relativePath)}" class="file-link">${escapeHTML(f.relativePath)}</a>`;
      html += `<span class="file-size">${formatSize(f.size)}</span>`;

      if (is3DFile(f.ext)) {
        html += `<span class="badge badge-3d">3D file</span>`;
      }

      html += `</div>`;

      // Inline image preview
      if (isImageFile(f.ext)) {
        html += `<div class="image-preview"><img loading="lazy" src="./${escapeHTML(f.relativePath)}" alt="${escapeHTML(f.name)}" /></div>`;
      }

      // Text preview
      if (textPreviews[f.relativePath]) {
        html += `<details class="text-preview"><summary>Preview</summary><pre><code>${textPreviews[f.relativePath]}</code></pre></details>`;
      }
    }
    html += `</div>`;
    return html;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHTML(config.project.name)} - Project Overview</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #1a1a2e;
      color: #ccc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      line-height: 1.6;
      padding: 0;
    }

    header {
      background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
      border-bottom: 1px solid #2a2a4a;
      padding: 24px 32px;
    }

    header h1 {
      font-size: 28px;
      color: #6699ff;
      margin-bottom: 4px;
    }

    header .meta {
      font-size: 13px;
      color: #666;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px 32px;
    }

    /* --- Collapsible sections --- */
    .section {
      background: #16213e;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      cursor: pointer;
      user-select: none;
      transition: background 0.2s;
    }

    .section-header:hover {
      background: rgba(102, 153, 255, 0.05);
    }

    .section-header h2 {
      font-size: 18px;
      color: #ddd;
    }

    .section-header .toggle {
      font-size: 14px;
      color: #666;
      transition: transform 0.15s linear;
    }

    .section.collapsed .toggle {
      transform: rotate(-90deg);
    }

    .section-body {
      padding: 16px 20px 20px 20px;
      max-height: 5000px;
      overflow: hidden;
      transition: max-height 0.15s linear, padding 0.15s linear;
    }

    .section.collapsed .section-body {
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
    }

    /* --- Specs table --- */
    .specs-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    .specs-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #2a2a4a;
    }

    .specs-table td:first-child {
      color: #888;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      width: 200px;
      white-space: nowrap;
    }

    .specs-table td:last-child {
      color: #ddd;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }

    /* --- Dimensions --- */
    .ascii-profile {
      background: #0f0f1e;
      border: 1px solid #2a2a4a;
      border-radius: 6px;
      padding: 16px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      color: #6699ff;
      white-space: pre;
      overflow-x: auto;
      margin-top: 12px;
    }

    .dim-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 12px;
    }

    .dim-card {
      background: #0f0f1e;
      border: 1px solid #2a2a4a;
      border-radius: 6px;
      padding: 12px 16px;
      text-align: center;
    }

    .dim-card .dim-value {
      font-size: 24px;
      font-weight: bold;
      color: #6699ff;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }

    .dim-card .dim-label {
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }

    /* --- Design notes --- */
    .note {
      padding: 8px 12px;
      margin: 6px 0;
      border-radius: 4px;
      font-size: 13px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }

    .note-info { background: rgba(102, 153, 255, 0.1); border-left: 3px solid #6699ff; }
    .note-warning { background: rgba(255, 200, 50, 0.1); border-left: 3px solid #ffc832; }
    .note-error { background: rgba(255, 80, 80, 0.1); border-left: 3px solid #ff5050; }

    .note-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      padding: 1px 6px;
      border-radius: 3px;
      margin-right: 8px;
    }

    .note-info .note-badge { background: #6699ff; color: #000; }
    .note-warning .note-badge { background: #ffc832; color: #000; }
    .note-error .note-badge { background: #ff5050; color: #fff; }

    /* --- 3D viewer --- */
    .viewer-frame {
      width: 100%;
      height: 600px;
      border: 1px solid #2a2a4a;
      border-radius: 6px;
      background: #111;
    }

    /* --- File browser --- */
    .file-group {
      margin-bottom: 16px;
    }

    .file-group h4 {
      color: #888;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #2a2a4a;
    }

    .file-entry {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 13px;
      transition: background 0.15s;
    }

    .file-entry:hover {
      background: rgba(102, 153, 255, 0.08);
    }

    .file-icon {
      margin-right: 8px;
      font-size: 14px;
    }

    .file-link {
      color: #6699ff;
      text-decoration: none;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
      flex: 1;
    }

    .file-link:hover {
      text-decoration: underline;
    }

    .file-size {
      color: #555;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      margin-left: 12px;
      min-width: 70px;
      text-align: right;
    }

    .badge {
      display: inline-block;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 8px;
      border-radius: 3px;
      margin-left: 8px;
    }

    .badge-3d {
      background: #6c3483;
      color: #ddd;
    }

    .image-preview {
      padding: 8px 10px 8px 30px;
    }

    .image-preview img {
      max-width: 400px;
      max-height: 300px;
      border: 1px solid #2a2a4a;
      border-radius: 4px;
      background: #0f0f1e;
    }

    .text-preview {
      padding: 4px 10px 4px 30px;
    }

    .text-preview summary {
      cursor: pointer;
      color: #888;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .text-preview pre {
      background: #0f0f1e;
      border: 1px solid #2a2a4a;
      border-radius: 4px;
      padding: 10px 14px;
      font-size: 11px;
      color: #aaa;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }

    /* --- Responsive --- */
    @media (max-width: 768px) {
      header { padding: 16px; }
      .container { padding: 12px 16px; }
      .specs-table td:first-child { width: 140px; }
      .dim-grid { grid-template-columns: 1fr 1fr; }
      .viewer-frame { height: 400px; }
      .image-preview img { max-width: 100%; }
    }
  </style>
</head>
<body>

<header>
  <h1>${escapeHTML(config.project.name)}</h1>
  <div class="meta">v${escapeHTML(config.project.version)} &middot; ${escapeHTML(config.project.author)} &middot; Generated ${now}</div>
</header>

<div class="container">

  <!-- Specs Overview -->
  <div class="section" id="section-specs">
    <div class="section-header" onclick="toggleSection('section-specs')">
      <h2>Specs Overview</h2>
      <span class="toggle">&#x25BC;</span>
    </div>
    <div class="section-body">
      <table class="specs-table">
        <tr><td>Key Count</td><td>${layout.keys.length}</td></tr>
        <tr><td>Matrix</td><td>${matrix.rows} rows x ${matrix.cols} cols</td></tr>
        <tr><td>GPIO Usage</td><td>${totalPins} of ${config.mcu.gpioAvailable} pins</td></tr>
        <tr><td>Switch Type</td><td>${escapeHTML(config.switches.type)} (${escapeHTML(config.switches.model)})</td></tr>
        <tr><td>Hot-swap</td><td>${config.switches.hotswap ? 'Yes' : 'No'}</td></tr>
        <tr><td>MCU</td><td>${escapeHTML(config.mcu.module)} (${escapeHTML(config.mcu.type)})</td></tr>
        <tr><td>Connectivity</td><td>${[config.connectivity.usb ? 'USB' : '', config.connectivity.bluetooth ? `BT ${config.connectivity.bluetoothVersion}` : ''].filter(Boolean).join(', ')}</td></tr>
        <tr><td>Battery</td><td>${config.power.battery ? `${config.power.batteryType} ${config.power.batteryCapacityMah} mAh` : 'None'}</td></tr>
        <tr><td>RGB Per-key</td><td>${config.features.rgbPerKey ? `Yes (${config.features.ledPlacement})` : 'No'}</td></tr>
        <tr><td>RGB Underglow</td><td>${config.features.rgbUnderglow ? `${config.features.underglow.ledCount} LEDs (${escapeHTML(config.features.underglow.ledModel || 'n/a')})` : 'No'}</td></tr>
        <tr><td>Rotary Encoder</td><td>${config.features.rotaryEncoder ? 'Yes' : 'No'}</td></tr>
        <tr><td>OLED Display</td><td>${config.features.oledDisplay ? 'Yes' : 'No'}</td></tr>
        <tr><td>Diode</td><td>${escapeHTML(config.diode.model)} (${escapeHTML(config.diode.package)}, ${escapeHTML(config.diode.direction)})</td></tr>
        <tr><td>USB Connector</td><td>${escapeHTML(config.usbConnector.type)} (${escapeHTML(config.usbConnector.model)})</td></tr>
        <tr><td>PCB</td><td>${config.pcb.layers}-layer, ${config.pcb.thickness}mm</td></tr>
        <tr><td>Plate</td><td>${config.plate.enabled ? `${config.plate.material}, ${config.plate.thickness}mm` : 'None'}</td></tr>
        <tr><td>Firmware</td><td>${escapeHTML(config.firmware.type.toUpperCase())}${config.firmware.features.length > 0 ? ` (${config.firmware.features.join(', ')})` : ''}</td></tr>
      </table>
    </div>
  </div>

  <!-- Physical Dimensions -->
  <div class="section" id="section-dims">
    <div class="section-header" onclick="toggleSection('section-dims')">
      <h2>Physical Dimensions</h2>
      <span class="toggle">&#x25BC;</span>
    </div>
    <div class="section-body">
      <div class="dim-grid">
        <div class="dim-card">
          <div class="dim-value">${dimensions.width.toFixed(1)}<span style="font-size:14px;color:#888">mm</span></div>
          <div class="dim-label">Board Width</div>
        </div>
        <div class="dim-card">
          <div class="dim-value">${dimensions.depth.toFixed(1)}<span style="font-size:14px;color:#888">mm</span></div>
          <div class="dim-label">Board Depth</div>
        </div>
        <div class="dim-card">
          <div class="dim-value">${dimensions.frontHeight.toFixed(1)}<span style="font-size:14px;color:#888">mm</span></div>
          <div class="dim-label">Front Height</div>
        </div>
        <div class="dim-card">
          <div class="dim-value">${dimensions.rearHeight.toFixed(1)}<span style="font-size:14px;color:#888">mm</span></div>
          <div class="dim-label">Rear Height</div>
        </div>
      </div>
      <div class="ascii-profile">${escapeHTML(sideProfile)}</div>
    </div>
  </div>

  <!-- Design Notes -->
  ${concerns.length > 0 ? `
  <div class="section" id="section-notes">
    <div class="section-header" onclick="toggleSection('section-notes')">
      <h2>Design Notes (${concerns.length})</h2>
      <span class="toggle">&#x25BC;</span>
    </div>
    <div class="section-body">
      ${concerns.map(n => `<div class="note note-${n.severity}"><span class="note-badge">${n.severity}</span>${escapeHTML(n.message)}${n.field ? ` <span style="color:#555">(${escapeHTML(n.field)})</span>` : ''}</div>`).join('\n      ')}
    </div>
  </div>
  ` : ''}

  <!-- 3D Preview -->
  <div class="section" id="section-viewer">
    <div class="section-header" onclick="toggleSection('section-viewer')">
      <h2>3D Preview</h2>
      <span class="toggle">&#x25BC;</span>
    </div>
    <div class="section-body">
      <iframe class="viewer-frame" src="./viewer.html" frameborder="0" allowfullscreen></iframe>
    </div>
  </div>

  <!-- Generated Files -->
  <div class="section" id="section-files">
    <div class="section-header" onclick="toggleSection('section-files')">
      <h2>Generated Files (${files.length})</h2>
      <span class="toggle">&#x25BC;</span>
    </div>
    <div class="section-body">
      ${renderFileGroup('PCB &amp; Schematic Files', groups['pcb'])}
      ${renderFileGroup('Firmware Files', groups['firmware'])}
      ${renderFileGroup('3D / Case Files', groups['3d'])}
      ${renderFileGroup('Images', groups['images'])}
      ${renderFileGroup('Documentation', groups['docs'])}
      ${renderFileGroup('Other', groups['other'])}
    </div>
  </div>

</div>

<script>
function toggleSection(id) {
  var el = document.getElementById(id);
  if (el) el.classList.toggle('collapsed');
}
</script>

</body>
</html>`;
}

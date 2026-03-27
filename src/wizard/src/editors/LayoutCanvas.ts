import {
  type LayoutComponent,
  type LayerConfig,
  layoutComponents,
  layers,
  moveComponent,
  selectComponent,
  nudgeSelected,
  resetComponentPosition,
  selectedId,
  beginDrag,
  endDrag,
  undo,
  redo,
} from './LayoutState';

// ── Types ──────────────────────────────────────────────────────────────────

interface CursorPos {
  mmX: number;
  mmY: number;
}

type OnCursorMove = (pos: CursorPos | null) => void;
type OnZoomChange = (zoom: number) => void;

// ── Canvas renderer + interaction handler ──────────────────────────────────

export class LayoutCanvas {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  // View transform: screen = mm * scale + offset
  private scale = 2; // pixels per mm (CSS pixels)
  private offsetX = 50;
  private offsetY = 50;

  // Interaction state
  private isDragging = false;
  private isPanning = false;
  private dragId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private spaceHeld = false;

  // Callbacks
  private onCursorMove: OnCursorMove | null = null;
  private onZoomChange: OnZoomChange | null = null;

  // Cleanup
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    this.syncSize();
    this.setupEvents();
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);

    // Observe resize
    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(canvas);
  }

  dispose() {
    this.disposed = true;
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    this.resizeObserver?.disconnect();
  }

  setCallbacks(onCursor: OnCursorMove, onZoom: OnZoomChange) {
    this.onCursorMove = onCursor;
    this.onZoomChange = onZoom;
  }

  // ── Size sync ──────────────────────────────────────────────────────────

  private syncSize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    // Set canvas buffer size (physical pixels)
    this.canvas.width = Math.round(this.cssWidth * this.dpr);
    this.canvas.height = Math.round(this.cssHeight * this.dpr);
    // IMPORTANT: explicitly set CSS size so offsetX/offsetY are consistent
    // Without this, the canvas CSS size = attribute size (physical px), causing
    // mouse coordinates to be scaled by DPR, making drags move too fast
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;
  }

  // ── Coordinate transforms ─────────────────────────────────────────────

  private mmToScreen(mmX: number, mmY: number): [number, number] {
    return [mmX * this.scale + this.offsetX, mmY * this.scale + this.offsetY];
  }

  private screenToMm(sx: number, sy: number): [number, number] {
    return [(sx - this.offsetX) / this.scale, (sy - this.offsetY) / this.scale];
  }

  // ── Hit test ──────────────────────────────────────────────────────────

  private hitTest(sx: number, sy: number, components: LayoutComponent[]): LayoutComponent | null {
    const [mx, my] = this.screenToMm(sx, sy);
    // Test in reverse order (topmost first)
    for (let i = components.length - 1; i >= 0; i--) {
      const c = components[i];
      if (c.type === 'outline') continue; // outline is not clickable

      if (c.type === 'screw' || c.type === 'power_button' || c.type === 'wifi_button') {
        const r = c.width / 2;
        const dx = mx - c.x;
        const dy = my - c.y;
        if (dx * dx + dy * dy <= r * r) return c;
      } else {
        const halfW = c.width / 2;
        const halfH = c.height / 2;
        if (mx >= c.x - halfW && mx <= c.x + halfW &&
            my >= c.y - halfH && my <= c.y + halfH) {
          return c;
        }
      }
    }
    return null;
  }

  // ── Main render ───────────────────────────────────────────────────────

  render(components: LayoutComponent[], layerConfigs: LayerConfig[]) {
    if (this.disposed) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dpr = this.dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    // Grid
    this.drawGrid(ctx);

    // Build layer visibility/opacity map
    const layerMap = new Map<string, LayerConfig>();
    for (const l of layerConfigs) {
      layerMap.set(l.id, l);
    }

    // Render order: outline, switches, screws, connectors, mcu, power, extras
    const renderOrder = ['outline', 'switches', 'screws', 'connectors', 'mcu', 'power', 'extras'];

    for (const layerId of renderOrder) {
      const layerCfg = layerMap.get(layerId);
      if (!layerCfg || !layerCfg.visible) continue;

      ctx.save();
      ctx.globalAlpha = layerCfg.opacity;

      const layerComps = components.filter((c) => c.layer === layerId);
      for (const comp of layerComps) {
        this.drawComponent(ctx, comp);
      }

      ctx.restore();
    }

    // Draw selection overlay on top (full opacity)
    const sel = components.find((c) => c.selected);
    if (sel) {
      this.drawSelection(ctx, sel);
    }

    // Coordinate display
    this.drawCoordinateDisplay(ctx);
  }

  // ── Grid ──────────────────────────────────────────────────────────────

  private drawGrid(ctx: CanvasRenderingContext2D) {
    const majorMm = 10;
    const minorMm = 1;
    const majorPx = majorMm * this.scale;
    const minorPx = minorMm * this.scale;

    // Minor grid (only when zoomed in enough that lines are >= 4px apart)
    if (minorPx >= 4) {
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.lineWidth = 0.5;
      const startX = this.offsetX % minorPx;
      const startY = this.offsetY % minorPx;
      ctx.beginPath();
      for (let x = startX; x < this.cssWidth; x += minorPx) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.cssHeight);
      }
      for (let y = startY; y < this.cssHeight; y += minorPx) {
        ctx.moveTo(0, y);
        ctx.lineTo(this.cssWidth, y);
      }
      ctx.stroke();
    }

    // Major grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    const startMajorX = this.offsetX % majorPx;
    const startMajorY = this.offsetY % majorPx;
    ctx.beginPath();
    for (let x = startMajorX; x < this.cssWidth; x += majorPx) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.cssHeight);
    }
    for (let y = startMajorY; y < this.cssHeight; y += majorPx) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.cssWidth, y);
    }
    ctx.stroke();
  }

  // ── Component rendering ───────────────────────────────────────────────

  private drawComponent(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    // Back-side components render with reduced intensity + dashed outline
    const isBack = comp.side === 'back';
    if (isBack) {
      ctx.save();
      ctx.globalAlpha *= 0.6;
    }

    switch (comp.type) {
      case 'outline':
        this.drawOutline(ctx, comp);
        break;
      case 'switch':
        this.drawSwitch(ctx, comp);
        break;
      case 'screw':
        this.drawScrew(ctx, comp);
        break;
      case 'usb':
        this.drawUSB(ctx, comp);
        break;
      case 'mcu':
        this.drawMCU(ctx, comp);
        break;
      case 'battery':
        this.drawBattery(ctx, comp);
        break;
      case 'power_button':
      case 'wifi_button':
        this.drawButton(ctx, comp);
        break;
      case 'lcd':
        this.drawLCD(ctx, comp);
        break;
    }

    // Draw side badge for back/through components (not switches or outline)
    if (comp.type !== 'switch' && comp.type !== 'outline' && this.scale > 1) {
      const [sx, sy] = this.mmToScreen(comp.x, comp.y);
      const badgeX = sx + (comp.width * this.scale / 2) - 4;
      const badgeY = sy - (comp.height * this.scale / 2) + 4;
      const label = comp.side === 'back' ? 'B' : comp.side === 'front' ? 'F' : 'T';
      const color = comp.side === 'back' ? '#f87171' : comp.side === 'front' ? '#6ecbf5' : '#86efac';
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.font = `bold ${Math.max(8, 9)}px monospace`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, badgeX, badgeY);
      ctx.restore();
    }

    if (isBack) {
      ctx.restore();
    }
  }

  private drawOutline(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const sw = comp.width * this.scale;
    const sh = comp.height * this.scale;
    const rx = sx - sw / 2;
    const ry = sy - sh / 2;

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    const cornerR = Math.min(4 * this.scale, sw / 8, sh / 8);
    this.roundRect(ctx, rx, ry, sw, sh, cornerR);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawSwitch(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const sw = comp.width * this.scale;
    const sh = comp.height * this.scale;
    const rx = sx - sw / 2;
    const ry = sy - sh / 2;
    const cornerR = Math.min(2 * this.scale, sw / 4, sh / 4);

    ctx.save();

    // Collision glow
    if (comp.collision) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
    }

    ctx.fillStyle = '#2d3748';
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 1;

    this.roundRect(ctx, rx, ry, sw, sh, cornerR);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Label (only when zoomed in)
    if (this.scale > 1.2) {
      ctx.fillStyle = '#94a3b8';
      const fontSize = Math.max(7, Math.min(12, sw * 0.35));
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(comp.label, sx, sy, sw - 4);
    }

    ctx.restore();
  }

  private drawScrew(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const r = (comp.width / 2) * this.scale;

    ctx.save();

    if (comp.collision) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    }

    // Outer circle
    ctx.fillStyle = '#6b4c1e';
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Inner ring
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair
    const cr = r * 0.4;
    ctx.beginPath();
    ctx.moveTo(sx - cr, sy);
    ctx.lineTo(sx + cr, sy);
    ctx.moveTo(sx, sy - cr);
    ctx.lineTo(sx, sy + cr);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Label
    if (this.scale > 1.5) {
      ctx.fillStyle = '#d4a574';
      ctx.font = `${Math.max(7, r * 0.6)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(comp.label, sx, sy + r + 2);
    }

    ctx.restore();
  }

  private drawUSB(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const sw = comp.width * this.scale;
    const sh = comp.height * this.scale;
    const rx = sx - sw / 2;
    const ry = sy - sh / 2;

    ctx.save();

    if (comp.collision) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    }

    ctx.fillStyle = '#1e3a5f';
    ctx.strokeStyle = '#6ecbf5';
    ctx.lineWidth = 1.5;
    const cornerR = Math.min(2 * this.scale, sw / 4, sh / 4);
    this.roundRect(ctx, rx, ry, sw, sh, cornerR);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Inner port shape
    const insetX = sw * 0.15;
    const insetY = sh * 0.2;
    ctx.strokeStyle = '#6ecbf5';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(rx + insetX, ry + insetY, sw - 2 * insetX, sh - 2 * insetY);

    // Label
    ctx.fillStyle = '#6ecbf5';
    const fontSize = Math.max(7, Math.min(11, sw * 0.25));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(comp.label, sx, sy);

    ctx.restore();
  }

  private drawMCU(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const sw = comp.width * this.scale;
    const sh = comp.height * this.scale;
    const rx = sx - sw / 2;
    const ry = sy - sh / 2;

    ctx.save();

    if (comp.collision) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    }

    ctx.fillStyle = '#1a3a1a';
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.fillRect(rx, ry, sw, sh);
    ctx.strokeRect(rx, ry, sw, sh);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Pin marks along edges
    const pinSize = Math.max(1.5, this.scale * 0.8);
    const pinCount = Math.max(3, Math.floor(sh / (pinSize * 4)));
    ctx.fillStyle = '#22c55e';

    for (let i = 0; i < pinCount; i++) {
      const py = ry + sh * (i + 0.5) / pinCount;
      // Left pins
      ctx.fillRect(rx - pinSize, py - pinSize / 2, pinSize, pinSize);
      // Right pins
      ctx.fillRect(rx + sw, py - pinSize / 2, pinSize, pinSize);
    }

    // Top pin indicator (dot)
    ctx.beginPath();
    ctx.arc(rx + sw * 0.15, ry + sh * 0.08, Math.max(1.5, this.scale * 0.6), 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#22c55e';
    const fontSize = Math.max(7, Math.min(10, sw * 0.2));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(comp.label, sx, sy, sw - 4);

    ctx.restore();
  }

  private drawBattery(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const sw = comp.width * this.scale;
    const sh = comp.height * this.scale;
    const rx = sx - sw / 2;
    const ry = sy - sh / 2;

    ctx.save();

    if (comp.collision) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    }

    ctx.fillStyle = '#3a1e1e';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
    this.roundRect(ctx, rx, ry, sw, sh, 3 * this.scale);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // + and - terminals
    const termW = Math.max(2, sw * 0.04);
    const termH = sh * 0.3;
    ctx.fillStyle = '#ef4444';
    // + terminal
    ctx.fillRect(rx + sw - termW, sy - termH / 2, termW * 2, termH);
    // - terminal on left
    ctx.fillRect(rx - termW, sy - termH * 0.4, termW, termH * 0.8);

    // Label
    ctx.fillStyle = '#ef4444';
    const fontSize = Math.max(8, Math.min(12, sw * 0.2));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(comp.label, sx, sy);

    ctx.restore();
  }

  private drawButton(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const r = (comp.width / 2) * this.scale;

    ctx.save();

    if (comp.collision) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    }

    ctx.fillStyle = comp.type === 'power_button' ? '#4a3a00' : '#3a3a00';
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Inner dot
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Label
    if (this.scale > 1.2) {
      ctx.fillStyle = '#eab308';
      ctx.font = `${Math.max(6, r * 0.5)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(comp.label, sx, sy + r + 2);
    }

    ctx.restore();
  }

  private drawLCD(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const sw = comp.width * this.scale;
    const sh = comp.height * this.scale;
    const rx = sx - sw / 2;
    const ry = sy - sh / 2;

    ctx.save();

    if (comp.collision) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    }

    ctx.fillStyle = '#1a1a00';
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.5;
    ctx.fillRect(rx, ry, sw, sh);
    ctx.strokeRect(rx, ry, sw, sh);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Screen area inside
    const inset = Math.max(2, this.scale * 1);
    ctx.fillStyle = '#0a0a00';
    ctx.strokeStyle = '#eab30866';
    ctx.lineWidth = 0.5;
    ctx.fillRect(rx + inset, ry + inset, sw - 2 * inset, sh - 2 * inset);
    ctx.strokeRect(rx + inset, ry + inset, sw - 2 * inset, sh - 2 * inset);

    // Label
    ctx.fillStyle = '#eab308';
    const fontSize = Math.max(7, Math.min(11, sw * 0.18));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(comp.label, sx, sy);

    ctx.restore();
  }

  // ── Selection overlay ─────────────────────────────────────────────────

  private drawSelection(ctx: CanvasRenderingContext2D, comp: LayoutComponent) {
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);

    ctx.save();
    ctx.globalAlpha = 1;

    if (comp.type === 'screw' || comp.type === 'power_button' || comp.type === 'wifi_button') {
      const r = (comp.width / 2) * this.scale + 3;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Resize handles (small squares at compass points)
      if (comp.draggable) {
        this.drawHandle(ctx, sx, sy - r);
        this.drawHandle(ctx, sx, sy + r);
        this.drawHandle(ctx, sx - r, sy);
        this.drawHandle(ctx, sx + r, sy);
      }
    } else if (comp.type !== 'outline') {
      const sw = comp.width * this.scale;
      const sh = comp.height * this.scale;
      const rx = sx - sw / 2 - 3;
      const ry = sy - sh / 2 - 3;
      const rw = sw + 6;
      const rh = sh + 6;

      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);

      // Corner handles
      if (comp.draggable) {
        this.drawHandle(ctx, rx, ry);
        this.drawHandle(ctx, rx + rw, ry);
        this.drawHandle(ctx, rx, ry + rh);
        this.drawHandle(ctx, rx + rw, ry + rh);
      }
    }

    ctx.restore();
  }

  private drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const size = 5;
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  // ── Coordinate display ────────────────────────────────────────────────

  private lastCursorScreen: { x: number; y: number } | null = null;

  private drawCoordinateDisplay(ctx: CanvasRenderingContext2D) {
    if (!this.lastCursorScreen) return;

    const [mmX, mmY] = this.screenToMm(this.lastCursorScreen.x, this.lastCursorScreen.y);

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, this.cssHeight - 22, 180, 22);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Cursor: (${mmX.toFixed(1)}, ${mmY.toFixed(1)}) mm`, 8, this.cssHeight - 6);
    ctx.restore();
  }

  // ── Utility ───────────────────────────────────────────────────────────

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ── Event handling ────────────────────────────────────────────────────

  private setupEvents() {
    const c = this.canvas;

    // Prevent context menu
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Wheel zoom
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.max(0.5, Math.min(8, this.scale * factor));
      // Zoom toward cursor
      const mx = e.offsetX;
      const my = e.offsetY;
      this.offsetX = mx - (mx - this.offsetX) * (newScale / this.scale);
      this.offsetY = my - (my - this.offsetY) * (newScale / this.scale);
      this.scale = newScale;
      this.onZoomChange?.(this.scale);
    }, { passive: false });

    // Mouse down
    c.addEventListener('mousedown', (e) => {
      c.focus();
      const components = layoutComponents.value;

      // Middle mouse or space+click -> pan
      if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
        this.isPanning = true;
        this.isDragging = false;
        this.dragStartX = e.offsetX;
        this.dragStartY = e.offsetY;
        e.preventDefault();
        return;
      }

      // Right click -> deselect
      if (e.button === 2) {
        selectComponent(null);
        return;
      }

      // Left click
      if (e.button === 0) {
        const hit = this.hitTest(e.offsetX, e.offsetY, components);

        if (hit && hit.draggable) {
          this.isDragging = true;
          this.isPanning = false;
          this.dragId = hit.id;
          selectComponent(hit.id);
          beginDrag(hit.id); // Record position for undo
          c.style.cursor = 'grabbing';
        } else if (hit && hit.type !== 'outline') {
          selectComponent(hit.id);
          // Allow pan on click of non-draggable
          this.isPanning = true;
          this.isDragging = false;
        } else {
          selectComponent(null);
          this.isPanning = true;
          this.isDragging = false;
        }

        this.dragStartX = e.offsetX;
        this.dragStartY = e.offsetY;
      }
    });

    // Mouse move
    c.addEventListener('mousemove', (e) => {
      this.lastCursorScreen = { x: e.offsetX, y: e.offsetY };
      const [mmX, mmY] = this.screenToMm(e.offsetX, e.offsetY);
      this.onCursorMove?.({ mmX, mmY });

      if (this.isDragging && this.dragId) {
        const dx = (e.offsetX - this.dragStartX) / this.scale;
        const dy = (e.offsetY - this.dragStartY) / this.scale;
        moveComponent(this.dragId, dx, dy);
        this.dragStartX = e.offsetX;
        this.dragStartY = e.offsetY;
      } else if (this.isPanning) {
        this.offsetX += e.offsetX - this.dragStartX;
        this.offsetY += e.offsetY - this.dragStartY;
        this.dragStartX = e.offsetX;
        this.dragStartY = e.offsetY;
      } else {
        // Cursor style
        const components = layoutComponents.value;
        const hover = this.hitTest(e.offsetX, e.offsetY, components);
        if (this.spaceHeld) {
          c.style.cursor = 'grab';
        } else if (hover && hover.draggable) {
          c.style.cursor = 'grab';
        } else {
          c.style.cursor = 'crosshair';
        }
      }
    });

    // Mouse up
    c.addEventListener('mouseup', () => {
      if (this.isDragging && this.dragId) {
        endDrag(this.dragId); // Record action for undo/redo
        c.style.cursor = 'grab';
      }
      this.isDragging = false;
      this.isPanning = false;
      this.dragId = null;
    });

    c.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.isPanning = false;
      this.dragId = null;
      this.lastCursorScreen = null;
      this.onCursorMove?.(null);
    });
  }

  // ── Keyboard ──────────────────────────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent) {
    // Undo: Ctrl+Z / Cmd+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      undo();
      e.preventDefault();
      return;
    }
    // Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
    if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
      redo();
      e.preventDefault();
      return;
    }

    if (e.key === ' ') {
      this.spaceHeld = true;
      this.canvas.style.cursor = 'grab';
      e.preventDefault();
      return;
    }

    // Arrow keys nudge
    const nudgeAmount = e.shiftKey ? 0.25 : 1;
    switch (e.key) {
      case 'ArrowUp':
        nudgeSelected(0, -nudgeAmount);
        e.preventDefault();
        break;
      case 'ArrowDown':
        nudgeSelected(0, nudgeAmount);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        nudgeSelected(-nudgeAmount, 0);
        e.preventDefault();
        break;
      case 'ArrowRight':
        nudgeSelected(nudgeAmount, 0);
        e.preventDefault();
        break;
      case 'Delete':
      case 'Backspace': {
        const id = selectedId.value;
        if (id) {
          resetComponentPosition(id);
          e.preventDefault();
        }
        break;
      }
      case 'Escape':
        selectComponent(null);
        e.preventDefault();
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent) {
    if (e.key === ' ') {
      this.spaceHeld = false;
      this.canvas.style.cursor = 'crosshair';
    }
  }

  // ── Public API ────────────────────────────────────────────────────────

  getZoom(): number {
    return this.scale;
  }

  setZoom(z: number) {
    const newScale = Math.max(0.5, Math.min(8, z));
    // Zoom toward center
    const cx = this.cssWidth / 2;
    const cy = this.cssHeight / 2;
    this.offsetX = cx - (cx - this.offsetX) * (newScale / this.scale);
    this.offsetY = cy - (cy - this.offsetY) * (newScale / this.scale);
    this.scale = newScale;
    this.onZoomChange?.(this.scale);
  }

  fitToView(bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;
    if (bw <= 0 || bh <= 0) return;

    const padding = 40; // CSS px
    const scaleX = (this.cssWidth - padding * 2) / bw;
    const scaleY = (this.cssHeight - padding * 2) / bh;
    this.scale = Math.max(0.5, Math.min(8, Math.min(scaleX, scaleY)));

    this.offsetX = (this.cssWidth / 2) - ((bounds.minX + bw / 2) * this.scale);
    this.offsetY = (this.cssHeight / 2) - ((bounds.minY + bh / 2) * this.scale);
    this.onZoomChange?.(this.scale);
  }
}

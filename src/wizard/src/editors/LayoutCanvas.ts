import { type LayoutComponent, layoutComponents, moveComponent, selectComponent } from './LayoutState';

export class LayoutCanvas {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private scale = 2;       // pixels per mm
  private offsetX = 50;
  private offsetY = 50;
  private isDragging = false;
  private isPanning = false;
  private dragId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.setupEvents();
  }

  /** Convert mm coordinates to screen pixels */
  mmToScreen(mmX: number, mmY: number): [number, number] {
    return [(mmX * this.scale) + this.offsetX, (mmY * this.scale) + this.offsetY];
  }

  /** Convert screen pixels to mm coordinates */
  screenToMm(sx: number, sy: number): [number, number] {
    return [(sx - this.offsetX) / this.scale, (sy - this.offsetY) / this.scale];
  }

  /** Hit-test: find the topmost component at screen position (sx, sy) */
  private hitTest(sx: number, sy: number, components: LayoutComponent[]): LayoutComponent | null {
    const [mx, my] = this.screenToMm(sx, sy);
    // Iterate in reverse so topmost (last-drawn) components are tested first
    for (let i = components.length - 1; i >= 0; i--) {
      const c = components[i];
      if (c.type === 'screw') {
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

  /** Render all visible components */
  render(components: LayoutComponent[], layers: Record<string, boolean>) {
    const ctx = this.ctx;
    // Sync canvas size if CSS resized it
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    ctx.clearRect(0, 0, this.width, this.height);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Grid
    this.drawGrid();

    // Draw components by layer visibility
    for (const comp of components) {
      if (comp.type === 'switch' && !layers.switches) continue;
      if (comp.type === 'screw' && !layers.screws) continue;
      if ((comp.type === 'usb' || comp.type === 'battery') && !layers.connectors) continue;
      if (comp.type === 'mcu' && !layers.mcu) continue;

      this.drawComponent(comp);
    }
  }

  private drawComponent(comp: LayoutComponent) {
    const ctx = this.ctx;
    const [sx, sy] = this.mmToScreen(comp.x, comp.y);
    const sw = comp.width * this.scale;
    const sh = comp.height * this.scale;

    const colors: Record<string, { fill: string; stroke: string }> = {
      switch:  { fill: '#2d3748', stroke: '#4a5568' },
      screw:   { fill: '#6b4c1e', stroke: '#d4a574' },
      usb:     { fill: '#1e3a5f', stroke: '#6ecbf5' },
      mcu:     { fill: '#1e3a1e', stroke: '#22c55e' },
      battery: { fill: '#3a1e1e', stroke: '#ef4444' },
    };
    const color = colors[comp.type] || colors.switch;

    ctx.save();
    ctx.fillStyle = comp.selected ? '#4a5568' : color.fill;
    ctx.strokeStyle = comp.selected ? '#6ecbf5' : color.stroke;
    ctx.lineWidth = comp.selected ? 2 : 1;

    if (comp.type === 'screw') {
      ctx.beginPath();
      ctx.arc(sx, sy, sw / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Draw cross-hair inside screw
      ctx.beginPath();
      const r = sw / 4;
      ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy);
      ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r);
      ctx.strokeStyle = comp.selected ? '#6ecbf5' : '#d4a574';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    } else {
      const rx = sx - sw / 2;
      const ry = sy - sh / 2;
      const cornerR = Math.min(3 * this.scale, sw / 4, sh / 4);
      // Rounded rect
      ctx.beginPath();
      ctx.moveTo(rx + cornerR, ry);
      ctx.lineTo(rx + sw - cornerR, ry);
      ctx.arcTo(rx + sw, ry, rx + sw, ry + cornerR, cornerR);
      ctx.lineTo(rx + sw, ry + sh - cornerR);
      ctx.arcTo(rx + sw, ry + sh, rx + sw - cornerR, ry + sh, cornerR);
      ctx.lineTo(rx + cornerR, ry + sh);
      ctx.arcTo(rx, ry + sh, rx, ry + sh - cornerR, cornerR);
      ctx.lineTo(rx, ry + cornerR);
      ctx.arcTo(rx, ry, rx + cornerR, ry, cornerR);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.max(8, 10 * this.scale / 2)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Only draw switch labels when zoomed in enough
    if (comp.type !== 'switch' || this.scale > 1.5) {
      ctx.fillText(comp.label, sx, sy);
    }

    ctx.restore();
  }

  private drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    const gridMm = 10; // 10mm grid
    const gridPx = gridMm * this.scale;

    for (let x = this.offsetX % gridPx; x < this.width; x += gridPx) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = this.offsetY % gridPx; y < this.height; y += gridPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  private setupEvents() {
    // Mouse wheel zoom — zoom toward cursor position
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.5, Math.min(5, this.scale * factor));
      // Zoom toward the cursor
      const mx = e.offsetX;
      const my = e.offsetY;
      this.offsetX = mx - (mx - this.offsetX) * (newScale / this.scale);
      this.offsetY = my - (my - this.offsetY) * (newScale / this.scale);
      this.scale = newScale;
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      const components = layoutComponents.value;
      const hit = this.hitTest(e.offsetX, e.offsetY, components);

      if (hit && hit.draggable) {
        // Start dragging a component
        this.isDragging = true;
        this.isPanning = false;
        this.dragId = hit.id;
        selectComponent(hit.id);
      } else if (hit) {
        // Clicked a non-draggable component (switch) — just select
        selectComponent(hit.id);
        this.isPanning = true;
        this.isDragging = false;
        this.dragId = null;
      } else {
        // Clicked empty space — deselect and prepare to pan
        selectComponent(null);
        this.isPanning = true;
        this.isDragging = false;
        this.dragId = null;
      }

      this.dragStartX = e.offsetX;
      this.dragStartY = e.offsetY;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging && this.dragId) {
        // Move the dragged component (convert pixel delta to mm)
        const dx = (e.offsetX - this.dragStartX) / this.scale;
        const dy = (e.offsetY - this.dragStartY) / this.scale;
        moveComponent(this.dragId, dx, dy);
        this.dragStartX = e.offsetX;
        this.dragStartY = e.offsetY;
      } else if (this.isPanning) {
        // Pan the view
        this.offsetX += e.offsetX - this.dragStartX;
        this.offsetY += e.offsetY - this.dragStartY;
        this.dragStartX = e.offsetX;
        this.dragStartY = e.offsetY;
      }

      // Update cursor based on hover
      const components = layoutComponents.value;
      const hover = this.hitTest(e.offsetX, e.offsetY, components);
      if (hover && hover.draggable) {
        this.canvas.style.cursor = 'grab';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.isPanning = false;
      this.dragId = null;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.isPanning = false;
      this.dragId = null;
    });
  }

  setZoom(z: number) {
    this.scale = Math.max(0.5, Math.min(5, z));
  }

  resetView() {
    this.scale = 2;
    this.offsetX = 50;
    this.offsetY = 50;
  }
}

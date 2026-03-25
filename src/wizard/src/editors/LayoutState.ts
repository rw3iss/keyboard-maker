import { signal } from '@preact/signals';

export interface LayoutComponent {
  id: string;
  type: 'switch' | 'screw' | 'usb' | 'mcu' | 'battery';
  x: number;  // mm
  y: number;  // mm
  width: number;  // mm
  height: number; // mm
  label: string;
  draggable: boolean;  // switches are NOT draggable, screws/usb/mcu ARE
  selected: boolean;
}

export const layoutComponents = signal<LayoutComponent[]>([]);
export const selectedId = signal<string | null>(null);
export const zoom = signal(1);
export const panX = signal(0);
export const panY = signal(0);
export const showLayers = signal({
  switches: true,
  screws: true,
  connectors: true,
  mcu: true,
  outline: true,
});

const SPACING: Record<string, { x: number; y: number }> = {
  choc_v1: { x: 18, y: 17 },
  choc_v2: { x: 19.05, y: 19.05 },
  mx: { x: 19.05, y: 19.05 },
  mx_ulp: { x: 18, y: 18 },
  gateron_lp: { x: 18, y: 17 },
};

/** Initialize layout from a build config and KLE-parsed keys */
export function initLayout(config: any, keys: any[]) {
  const sp = SPACING[config.switches?.type] || SPACING.choc_v1;
  const components: LayoutComponent[] = [];

  // Add switches (not draggable — positions come from KLE)
  keys.forEach((key, i) => {
    const kw = key.w ?? 1;
    const kh = key.h ?? 1;
    components.push({
      id: `sw_${i}`,
      type: 'switch',
      x: (key.x + kw / 2) * sp.x,
      y: (key.y + kh / 2) * sp.y,
      width: kw * sp.x * 0.9,
      height: kh * sp.y * 0.9,
      label: key.label || `SW${i + 1}`,
      draggable: false,
      selected: false,
    });
  });

  // Compute board extents from switch positions
  const xs = components.map(c => c.x);
  const ys = components.map(c => c.y);
  const ws = components.map(c => c.width);
  const hs = components.map(c => c.height);

  const minX = xs.length ? Math.min(...xs.map((x, i) => x - ws[i] / 2)) : 0;
  const maxX = xs.length ? Math.max(...xs.map((x, i) => x + ws[i] / 2)) : 200;
  const minY = ys.length ? Math.min(...ys.map((y, i) => y - hs[i] / 2)) : 0;
  const maxY = ys.length ? Math.max(...ys.map((y, i) => y + hs[i] / 2)) : 100;

  const boardW = maxX - minX || 200;
  const boardH = maxY - minY || 100;
  const midX = (minX + maxX) / 2;

  // Add draggable components (USB, MCU, screws)
  components.push({
    id: 'usb', type: 'usb', x: midX, y: minY - 10, width: 12, height: 8,
    label: 'USB-C', draggable: true, selected: false,
  });

  components.push({
    id: 'mcu', type: 'mcu', x: midX, y: maxY + 15, width: 10, height: 10,
    label: 'MCU', draggable: true, selected: false,
  });

  // Screws — positioned relative to board extents
  const screwPositions = [
    { id: 'screw_tl', x: minX + 15, y: minY + 15 },
    { id: 'screw_tr', x: maxX - 15, y: minY + 15 },
    { id: 'screw_bl', x: minX + 15, y: maxY - 15 },
    { id: 'screw_br', x: maxX - 15, y: maxY - 15 },
    { id: 'screw_ml', x: minX + boardW * 0.35, y: minY + boardH / 2 },
    { id: 'screw_mr', x: minX + boardW * 0.65, y: minY + boardH / 2 },
  ];
  for (const s of screwPositions) {
    components.push({
      id: s.id, type: 'screw', x: s.x, y: s.y, width: 5.5, height: 5.5,
      label: s.id.replace('screw_', '').toUpperCase(), draggable: true, selected: false,
    });
  }

  layoutComponents.value = components;
}

/** Move a draggable component by (dx, dy) in mm */
export function moveComponent(id: string, dx: number, dy: number) {
  layoutComponents.value = layoutComponents.value.map(c =>
    c.id === id && c.draggable
      ? { ...c, x: snapToGrid(c.x + dx), y: snapToGrid(c.y + dy) }
      : c
  );
}

/** Select a component by id (null to deselect) */
export function selectComponent(id: string | null) {
  selectedId.value = id;
  layoutComponents.value = layoutComponents.value.map(c => ({
    ...c, selected: c.id === id,
  }));
}

/** Snap a value to the nearest 0.5mm */
function snapToGrid(v: number): number {
  return Math.round(v * 2) / 2;
}

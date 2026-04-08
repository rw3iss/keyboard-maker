import { signal, computed } from '@preact/signals';
import type { McuData, ComponentOption, ChargerPackageInfo } from '../types/mcu.types';

// ── Types ──────────────────────────────────────────────────────────────────

export type ComponentType =
  | 'switch'
  | 'screw'
  | 'usb'
  | 'mcu'
  | 'battery'
  | 'charger'
  | 'power_button'
  | 'wifi_button'
  | 'lcd'
  | 'outline';

export interface LayoutComponent {
  id: string;
  type: ComponentType;
  layer: string;
  /** Which side of the PCB this component is on */
  side: 'front' | 'back' | 'through';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  draggable: boolean;
  selected: boolean;
  collision: boolean;
  /** MCU fanout enabled — shows extended outline in layout editor */
  fanout?: boolean;
  /** Fanout via extension distance in mm (total both sides) */
  fanoutExtend?: number;
  /** True if component is outside the board outline */
  outOfBounds?: boolean;
}

export interface LayerConfig {
  id: string;
  label: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  color: string;
}

export interface BoardBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LayoutOverride {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  side?: 'front' | 'back' | 'through';
}

// ── Layer definitions ──────────────────────────────────────────────────────

export const DEFAULT_LAYERS: LayerConfig[] = [
  { id: 'outline', label: 'Board Outline', visible: true, opacity: 1, locked: true, color: '#64748b' },
  { id: 'switches', label: 'Switches', visible: true, opacity: 0.9, locked: true, color: '#4a5568' },
  { id: 'screws', label: 'Screw Holes', visible: true, opacity: 1, locked: false, color: '#d4a574' },
  { id: 'connectors', label: 'Connectors', visible: true, opacity: 1, locked: false, color: '#6ecbf5' },
  { id: 'mcu', label: 'MCU', visible: true, opacity: 1, locked: false, color: '#22c55e' },
  { id: 'power', label: 'Power/Battery', visible: true, opacity: 1, locked: false, color: '#f59e0b' },
  { id: 'extras', label: 'LCD/Buttons', visible: true, opacity: 1, locked: false, color: '#eab308' },
];

// ── Switch spacing by type (mm) ────────────────────────────────────────────

const SPACING: Record<string, { x: number; y: number }> = {
  choc_v1: { x: 18, y: 17 },
  choc_v2: { x: 19.05, y: 19.05 },
  mx: { x: 19.05, y: 19.05 },
  mx_ulp: { x: 18, y: 18 },
  gateron_lp: { x: 18, y: 17 },
};

// ── MCU dimensions from component data ────────────────────────────────────

/** Compute MCU footprint size (mm) from its data. Matches mcu-footprint.ts output. */
function getMcuDimensions(mcuData: McuData | null | undefined): { width: number; height: number; fanoutExtend: number } {
  const bp = mcuData?.boardPins;
  const pkg = mcuData?.package;

  if (bp) {
    // Module: dimensions from pin layout
    const pitch = bp.pitch ?? 2.54;
    const rowSpacing = bp.rowSpacing ?? 15.24;
    const pins = bp.pins ?? [];
    const mainPins = pins.filter((p) => (p.row ?? 0) <= 1);
    const maxPos = mainPins.reduce((m, p) => Math.max(m, p.position ?? 0), 0);
    const mainH = maxPos * pitch;
    const extraPins = pins.filter((p) => (p.row ?? 0) >= 2);
    const extraH = extraPins.length > 0 ? pitch * 2 : 0;
    return {
      width: rowSpacing + 4,   // row spacing + pad overhang
      height: mainH + 4 + extraH, // pin span + margins + bottom pads
      fanoutExtend: 0,         // modules don't use fanout
    };
  }

  if (pkg) {
    // Bare chip: body size + courtyard
    const w = (pkg.dimensions?.width ?? 7) + 2;
    const h = (pkg.dimensions?.height ?? 7) + 2;
    const pitch = pkg.pitch ?? 0.5;
    // Staggered fanout: inner 1.0/0.8mm, outer 1.8/1.5mm depending on pitch
    const fanoutOuter = pitch <= 0.4 ? 1.5 : 1.8;
    return { width: w, height: h, fanoutExtend: fanoutOuter * 2 };
  }

  // Fallback: generic module
  const gpioCount = mcuData?.gpioCount ?? 20;
  const totalPins = Math.max(gpioCount + 4, 12);
  const pinsPerRow = Math.ceil(totalPins / 2);
  return {
    width: 15.24 + 4,
    height: (pinsPerRow - 1) * 2.54 + 4,
    fanoutExtend: 0,
  };
}

// ── Signals ────────────────────────────────────────────────────────────────

export const layoutComponents = signal<LayoutComponent[]>([]);
export const layers = signal<LayerConfig[]>(DEFAULT_LAYERS.map((l) => ({ ...l })));
export const selectedId = signal<string | null>(null);
export const boardBounds = signal<BoardBounds>({ minX: 0, minY: 0, maxX: 200, maxY: 100 });

// ── Undo/Redo history ──────────────────────────────────────────────────────

export interface HistoryAction {
  type: 'move';
  componentId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export const undoStack = signal<HistoryAction[]>([]);
export const redoStack = signal<HistoryAction[]>([]);
export const canUndo = computed(() => undoStack.value.length > 0);
export const canRedo = computed(() => redoStack.value.length > 0);

/** Record start position before a drag begins */
let dragStartPos: { id: string; x: number; y: number } | null = null;

export function beginDrag(id: string) {
  const comp = layoutComponents.value.find(c => c.id === id);
  if (comp) {
    dragStartPos = { id, x: comp.x, y: comp.y };
  }
}

export function endDrag(id: string) {
  if (!dragStartPos || dragStartPos.id !== id) return;
  const comp = layoutComponents.value.find(c => c.id === id);
  if (!comp) return;
  // Only record if position actually changed
  if (comp.x !== dragStartPos.x || comp.y !== dragStartPos.y) {
    undoStack.value = [...undoStack.value, {
      type: 'move',
      componentId: id,
      fromX: dragStartPos.x,
      fromY: dragStartPos.y,
      toX: comp.x,
      toY: comp.y,
    }];
    // Clear redo stack on new action (standard undo/redo behavior)
    redoStack.value = [];
  }
  dragStartPos = null;
}

export function undo() {
  const stack = undoStack.value;
  if (stack.length === 0) return;
  const action = stack[stack.length - 1];
  undoStack.value = stack.slice(0, -1);
  // Move component back to original position
  layoutComponents.value = layoutComponents.value.map(c =>
    c.id === action.componentId ? { ...c, x: action.fromX, y: action.fromY } : c
  );
  // Push to redo stack
  redoStack.value = [...redoStack.value, action];
  checkCollisions();
}

export function redo() {
  const stack = redoStack.value;
  if (stack.length === 0) return;
  const action = stack[stack.length - 1];
  redoStack.value = stack.slice(0, -1);
  // Move component to the "new" position
  layoutComponents.value = layoutComponents.value.map(c =>
    c.id === action.componentId ? { ...c, x: action.toX, y: action.toY } : c
  );
  // Push back to undo stack
  undoStack.value = [...undoStack.value, action];
  checkCollisions();
}

/** Default positions for all draggable components, used by reset */
let defaultPositions: Record<string, { x: number; y: number }> = {};

// ── Computed ───────────────────────────────────────────────────────────────

export const selectedComponent = computed(() => {
  const id = selectedId.value;
  if (!id) return null;
  return layoutComponents.value.find((c) => c.id === id) ?? null;
});

export const hasCollisions = computed(() => {
  return layoutComponents.value.some((c) => c.collision || c.outOfBounds);
});

// ── Grid snap ──────────────────────────────────────────────────────────────

function snapToGrid(v: number, gridSize = 0.5): number {
  return Math.round(v / gridSize) * gridSize;
}

// ── Init ───────────────────────────────────────────────────────────────────

export interface SimpleKey {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/** Component data passed from the editor for accurate sizing */
export interface ComponentDataSet {
  mcu?: McuData | null;
  battery?: ComponentOption | null;
  charger?: ComponentOption | null;
  connector?: ComponentOption | null;
}

export function initLayout(config: any, kleKeys: SimpleKey[], componentData?: ComponentDataSet) {
  const sp = SPACING[config?.switches?.type] || SPACING.choc_v1;
  const components: LayoutComponent[] = [];
  const margin = 8; // mm margin around switches for the board

  // ── Switches ───────────────────────────────────────────────────────────
  kleKeys.forEach((key, i) => {
    const kw = key.w ?? 1;
    const kh = key.h ?? 1;
    components.push({
      id: `sw_${i}`,
      type: 'switch',
      layer: 'switches',
      side: 'front',
      x: (key.x + kw / 2) * sp.x,
      y: (key.y + kh / 2) * sp.y,
      width: kw * sp.x * 0.9,
      height: kh * sp.y * 0.9,
      rotation: 0,
      label: key.label || `SW${i + 1}`,
      draggable: false,
      selected: false,
      collision: false,
    });
  });

  // ── Board bounds from switches ─────────────────────────────────────────
  const switches = components.filter((c) => c.type === 'switch');
  let minX = 0, minY = 0, maxX = 200, maxY = 100;
  if (switches.length > 0) {
    minX = Math.min(...switches.map((c) => c.x - c.width / 2)) - margin;
    maxX = Math.max(...switches.map((c) => c.x + c.width / 2)) + margin;
    minY = Math.min(...switches.map((c) => c.y - c.height / 2)) - margin;
    maxY = Math.max(...switches.map((c) => c.y + c.height / 2)) + margin;
  }

  const boardW = maxX - minX;
  const boardH = maxY - minY;
  const midX = (minX + maxX) / 2;

  boardBounds.value = { minX, minY, maxX, maxY };

  // ── Board outline ──────────────────────────────────────────────────────
  components.push({
    id: 'outline',
    type: 'outline',
    layer: 'outline',
    side: 'through',
    x: midX,
    y: (minY + maxY) / 2,
    width: boardW,
    height: boardH,
    rotation: 0,
    label: 'PCB Outline',
    draggable: false,
    selected: false,
    collision: false,
  });

  // ── USB connector — use actual dimensions from connector data ──────────
  const connDims = componentData?.connector?.dimensions;
  const usbW = connDims?.width ?? 9;    // GCT USB4085: 8.94mm
  const usbH = connDims?.depth ?? connDims?.length ?? 7.3; // depth into board
  components.push({
    id: 'usb',
    type: 'usb',
    layer: 'connectors',
    side: 'through',  // USB-C is edge-mounted, passes through the board
    x: midX,
    y: minY + 4,
    width: usbW,
    height: usbH,
    rotation: 0,
    label: 'USB-C',
    draggable: true,
    selected: false,
    collision: false,
  });

  // ── MCU ────────────────────────────────────────────────────────────────
  const mcuDims = getMcuDimensions(componentData?.mcu);
  const hasFanout = !!(config?.pcb?.mcuFanout && (config?.pcb?.layers ?? 2) >= 4 && mcuDims.fanoutExtend > 0);
  components.push({
    id: 'mcu',
    type: 'mcu',
    layer: 'mcu',
    side: 'back',  // MCU is on the back of the PCB, under the switches
    x: midX,
    y: (minY + maxY) / 2,  // center of board — fits under switches on back side
    width: mcuDims.width,
    height: mcuDims.height,
    rotation: 0,
    label: config?.mcu?.module || 'MCU',
    draggable: true,
    selected: false,
    collision: false,
    fanout: hasFanout,
    fanoutExtend: mcuDims.fanoutExtend,
  });

  // ── Screws ─────────────────────────────────────────────────────────────
  const screwPositions = [
    { id: 'screw_tl', x: minX + 10, y: minY + 10 },
    { id: 'screw_tr', x: maxX - 10, y: minY + 10 },
    { id: 'screw_bl', x: minX + 10, y: maxY - 10 },
    { id: 'screw_br', x: maxX - 10, y: maxY - 10 },
    { id: 'screw_ml', x: minX + boardW * 0.35, y: minY + boardH / 2 },
    { id: 'screw_mr', x: minX + boardW * 0.65, y: minY + boardH / 2 },
  ];
  for (const s of screwPositions) {
    components.push({
      id: s.id,
      type: 'screw',
      layer: 'screws',
      side: 'through',  // screws pass through all layers
      x: s.x,
      y: s.y,
      width: 5.5,
      height: 5.5,
      rotation: 0,
      label: s.id.replace('screw_', '').toUpperCase(),
      draggable: true,
      selected: false,
      collision: false,
    });
  }

  // ── Battery (if enabled) — use actual dimensions from battery data ─────
  if (config?.power?.battery) {
    const batDims = componentData?.battery?.dimensions;
    const batW = batDims?.width ?? 34;    // fallback: 1000mAh LiPo
    const batH = batDims?.length ?? 50;
    components.push({
      id: 'battery',
      type: 'battery',
      layer: 'power',
      side: 'back',  // battery sits under the PCB in the case cavity
      x: midX,
      y: (minY + maxY) / 2 + 20,  // offset from MCU, under switch area
      width: batW,
      height: batH,
      rotation: 0,
      label: componentData?.battery?.name ?? 'Battery',
      draggable: true,
      selected: false,
      collision: false,
    });
  }

  // ── Charger IC (if battery enabled and charger selected) ──────────────
  if (config?.power?.battery && config?.power?.chargerIc) {
    const chgData = componentData?.charger;
    const pkgInfo = chgData?.packageInfo as ChargerPackageInfo | undefined;
    const chgDims = chgData?.dimensions;
    // Use packageInfo for accurate sizing if available, fallback to dimensions
    const bodyW = pkgInfo?.dimensions?.width ?? chgDims?.width ?? 3.5;
    const bodyH = pkgInfo?.dimensions?.height ?? chgDims?.length ?? 3.5;
    const chgPitch = pkgInfo?.pitch ?? 1.0;
    const isQfnCharger = pkgInfo && /qfn|bga/i.test(pkgInfo.type ?? '') && chgPitch <= 0.65;
    const chargerFanoutEnabled = !!(isQfnCharger && config?.pcb?.chargerFanout && (config?.pcb?.layers ?? 2) >= 4);
    const chgFanoutExtend = chargerFanoutEnabled ? (chgPitch <= 0.4 ? 1.5 : 1.8) * 2 : 0;

    components.push({
      id: 'charger',
      type: 'charger',
      layer: 'power',
      side: 'back',
      x: midX + 15,
      y: (minY + maxY) / 2 + 10,
      width: bodyW + 2,  // +2mm for pads/courtyard
      height: bodyH + 2,
      rotation: 0,
      label: chgData?.name?.split(/\s/)[0] ?? 'Charger',
      draggable: true,
      selected: false,
      collision: false,
      fanout: chargerFanoutEnabled,
      fanoutExtend: chgFanoutExtend,
    });
  }

  // ── Power button (CK-JS102011 SPDT slide switch: 8.5 x 3.5mm) ────────
  const phys = config?.physical;
  if (phys?.powerButton !== false) {
    components.push({
      id: 'power_btn',
      type: 'power_button',
      layer: 'extras',
      side: 'through',  // edge-mounted button
      x: midX + 12,
      y: minY + 4,
      width: 8.5,
      height: 3.5,
      rotation: 0,
      label: 'PWR',
      draggable: true,
      selected: false,
      collision: false,
    });
  }

  // ── Wifi toggle button ─────────────────────────────────────────────────
  if (phys?.wifiToggleButton) {
    components.push({
      id: 'wifi_btn',
      type: 'wifi_button',
      layer: 'extras',
      side: 'through',  // edge-mounted button
      x: midX + 18,
      y: minY + 4,
      width: 4,
      height: 4,
      rotation: 0,
      label: 'WiFi',
      draggable: true,
      selected: false,
      collision: false,
    });
  }

  // ── LCD (if oled display enabled) ──────────────────────────────────────
  if (config?.features?.oledDisplay) {
    components.push({
      id: 'lcd',
      type: 'lcd',
      layer: 'extras',
      side: 'front',  // OLED faces up through a window in the case
      x: midX - 30,
      y: maxY - 18,
      width: 27,
      height: 12,
      rotation: 0,
      label: 'OLED',
      draggable: true,
      selected: false,
      collision: false,
    });
  }

  // ── Save default positions ─────────────────────────────────────────────
  defaultPositions = {};
  for (const c of components) {
    if (c.draggable) {
      defaultPositions[c.id] = { x: c.x, y: c.y };
    }
  }

  // ── Apply saved layout overrides ───────────────────────────────────────
  const rawOverrides = config?.layoutOverrides;
  let overrideList: LayoutOverride[] = [];
  if (Array.isArray(rawOverrides)) {
    overrideList = rawOverrides;
  } else if (rawOverrides && typeof rawOverrides === 'object') {
    // layoutOverrides is an object with { components, screws, usb, mcu, battery }
    if (Array.isArray(rawOverrides.components)) {
      overrideList = rawOverrides.components;
    }
    // Also apply individual overrides
    if (rawOverrides.usb) overrideList.push({ id: 'usb', type: 'usb', x: rawOverrides.usb.x, y: rawOverrides.usb.y });
    if (rawOverrides.mcu) overrideList.push({ id: 'mcu', type: 'mcu', x: rawOverrides.mcu.x, y: rawOverrides.mcu.y });
    if (rawOverrides.battery) overrideList.push({ id: 'battery', type: 'battery', x: rawOverrides.battery.x, y: rawOverrides.battery.y });
    if (Array.isArray(rawOverrides.screws)) {
      for (const s of rawOverrides.screws) {
        overrideList.push({ id: s.id, type: 'screw', x: s.x, y: s.y });
      }
    }
  }
  for (const ov of overrideList) {
    const comp = components.find((c) => c.id === ov.id);
    if (comp && comp.draggable) {
      comp.x = ov.x;
      comp.y = ov.y;
      if (ov.side) comp.side = ov.side;
    }
  }

  layoutComponents.value = components;

  // Reset layers and history
  layers.value = DEFAULT_LAYERS.map((l) => ({ ...l }));
  selectedId.value = null;
  undoStack.value = [];
  redoStack.value = [];

  checkCollisions();
}

// ── Movement ───────────────────────────────────────────────────────────────

export function moveComponent(id: string, dx: number, dy: number) {
  layoutComponents.value = layoutComponents.value.map((c) =>
    c.id === id && c.draggable
      ? { ...c, x: snapToGrid(c.x + dx), y: snapToGrid(c.y + dy) }
      : c,
  );
  checkCollisions();
}

export function moveComponentTo(id: string, x: number, y: number) {
  layoutComponents.value = layoutComponents.value.map((c) =>
    c.id === id && c.draggable
      ? { ...c, x: snapToGrid(x), y: snapToGrid(y) }
      : c,
  );
  checkCollisions();
}

/** Change which side of the PCB a component is on */
export function setComponentSide(id: string, side: 'front' | 'back' | 'through') {
  layoutComponents.value = layoutComponents.value.map((c) =>
    c.id === id && c.draggable ? { ...c, side } : c,
  );
  checkCollisions();
}

// ── Selection ──────────────────────────────────────────────────────────────

export function selectComponent(id: string | null) {
  selectedId.value = id;
  layoutComponents.value = layoutComponents.value.map((c) => ({
    ...c,
    selected: c.id === id,
  }));
}

// ── Nudge ──────────────────────────────────────────────────────────────────

export function nudgeSelected(dx: number, dy: number) {
  const id = selectedId.value;
  if (!id) return;
  const comp = layoutComponents.value.find((c) => c.id === id);
  if (!comp || !comp.draggable) return;
  const fromX = comp.x, fromY = comp.y;
  moveComponent(id, dx, dy);
  const after = layoutComponents.value.find(c => c.id === id);
  if (after && (after.x !== fromX || after.y !== fromY)) {
    undoStack.value = [...undoStack.value, { type: 'move', componentId: id, fromX, fromY, toX: after.x, toY: after.y }];
    redoStack.value = [];
  }
}

// ── Reset position ─────────────────────────────────────────────────────────

export function resetComponentPosition(id: string) {
  const def = defaultPositions[id];
  if (!def) return;
  moveComponentTo(id, def.x, def.y);
}

// ── Collision detection ────────────────────────────────────────────────────

/** Get effective collision dimensions — expanded for MCU fanout */
function effectiveSize(c: LayoutComponent): { w: number; h: number } {
  if (c.fanout && c.type === 'mcu') {
    const ext = c.fanoutExtend ?? 3.6; // default to 1.8mm * 2 sides
    return { w: c.width + ext, h: c.height + ext };
  }
  return { w: c.width, h: c.height };
}

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return (
    Math.abs(ax - bx) < (aw + bw) / 2 &&
    Math.abs(ay - by) < (ah + bh) / 2
  );
}

/**
 * Side-aware collision detection.
 *
 * Rules:
 * - Components on the SAME side collide with each other
 * - 'through' components (screws, USB, buttons) collide with ALL sides
 * - 'back' components (MCU, battery) do NOT collide with 'front' components (switches)
 *   because they are on opposite sides of the PCB
 * - 'back' components DO collide with each other and with 'through' components
 *
 * This means MCU and battery can be placed under the switch area without collision,
 * which is the standard approach for keyboard PCBs.
 */
function sidesCanCollide(a: LayoutComponent, b: LayoutComponent): boolean {
  // 'through' components collide with everything
  if (a.side === 'through' || b.side === 'through') return true;
  // Same side = collision possible
  if (a.side === b.side) return true;
  // Different sides (front vs back) = no collision
  return false;
}

export function checkCollisions() {
  const comps = layoutComponents.value;
  const draggable = comps.filter((c) => c.draggable);
  const nonDraggable = comps.filter((c) => !c.draggable && c.type !== 'outline');

  const collisionSet = new Set<string>();

  // Check draggable vs draggable (only same-side or through)
  for (let i = 0; i < draggable.length; i++) {
    for (let j = i + 1; j < draggable.length; j++) {
      const a = draggable[i];
      const b = draggable[j];
      const sa = effectiveSize(a), sb = effectiveSize(b);
      if (sidesCanCollide(a, b) && rectsOverlap(a.x, a.y, sa.w, sa.h, b.x, b.y, sb.w, sb.h)) {
        collisionSet.add(a.id);
        collisionSet.add(b.id);
      }
    }
  }

  // Check draggable vs fixed components (switches, etc.) — only same side
  for (const d of draggable) {
    for (const s of nonDraggable) {
      const sd = effectiveSize(d), ss = effectiveSize(s);
      if (sidesCanCollide(d, s) && rectsOverlap(d.x, d.y, sd.w, sd.h, s.x, s.y, ss.w, ss.h)) {
        collisionSet.add(d.id);
        break;
      }
    }
  }

  // Check out-of-bounds — draggable components outside the board outline
  const bounds = boardBounds.value;
  const oobSet = new Set<string>();
  for (const d of draggable) {
    const s = effectiveSize(d);
    const left = d.x - s.w / 2;
    const right = d.x + s.w / 2;
    const top = d.y - s.h / 2;
    const bottom = d.y + s.h / 2;
    if (left < bounds.minX || right > bounds.maxX || top < bounds.minY || bottom > bounds.maxY) {
      oobSet.add(d.id);
    }
  }

  layoutComponents.value = comps.map((c) => ({
    ...c,
    collision: collisionSet.has(c.id),
    outOfBounds: oobSet.has(c.id),
  }));
}

// ── Layout overrides (for saving) ──────────────────────────────────────────

export function getLayoutOverrides(): LayoutOverride[] {
  return layoutComponents.value
    .filter((c) => c.draggable)
    .map((c) => ({
      id: c.id,
      type: c.type,
      x: c.x,
      y: c.y,
      side: c.side,
    }));
}

// ── Layer visibility / opacity ─────────────────────────────────────────────

export function setLayerVisibility(layerId: string, visible: boolean) {
  layers.value = layers.value.map((l) =>
    l.id === layerId ? { ...l, visible } : l,
  );
}

export function setLayerOpacity(layerId: string, opacity: number) {
  layers.value = layers.value.map((l) =>
    l.id === layerId ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l,
  );
}

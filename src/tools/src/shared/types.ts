/** A single key on the keyboard, matching KLE data model fields. */
export interface Key {
  /** Unique identifier for this key (e.g. "k0", "k1", ...) */
  id: string;
  /** Text labels displayed on the keycap (top-left, bottom-left, etc.) */
  labels: string[];
  /** Horizontal position in KLE units (1u = 19.05 mm) */
  x: number;
  /** Vertical position in KLE units */
  y: number;
  /** Key width in KLE units (default 1) */
  width: number;
  /** Key height in KLE units (default 1) */
  height: number;
  /** Rotation angle in degrees */
  rotation: number;
  /** X coordinate of the rotation origin in KLE units */
  rotationX: number;
  /** Y coordinate of the rotation origin in KLE units */
  rotationY: number;
  /** Secondary width for stepped / ISO-enter keys */
  width2?: number;
  /** Secondary height for stepped / ISO-enter keys */
  height2?: number;
  /** Secondary X offset for stepped / ISO-enter keys */
  x2?: number;
  /** Secondary Y offset for stepped / ISO-enter keys */
  y2?: number;
  /** Keycap profile name (e.g. "DSA", "SA R1") */
  profile?: string;
}

/** Complete keyboard layout definition. */
export interface KeyboardLayout {
  /** Human-readable layout name */
  name: string;
  /** Layout author / designer */
  author: string;
  /** All keys in the layout */
  keys: Key[];
  /** Optional metadata controlling rendering and output */
  metadata: {
    /** Background color of the layout (hex string) */
    backcolor?: string;
    /** Background image settings */
    background?: { name: string; style: string };
    /** CSS border-radius for the case outline */
    radii?: string;
    /** Whether to generate a plate file */
    plate?: boolean;
    /** Whether to generate a PCB */
    pcb?: boolean;
  };
}

/** Row/column position within the switch matrix. */
export interface MatrixPosition {
  /** Zero-based row index */
  row: number;
  /** Zero-based column index */
  col: number;
}

/** Switch matrix definition mapping key IDs to electrical positions. */
export interface SwitchMatrix {
  /** Total number of rows in the matrix */
  rows: number;
  /** Total number of columns in the matrix */
  cols: number;
  /** Map from Key.id to its matrix position */
  assignments: Map<string, MatrixPosition>;
}

/** Supported mechanical switch types. */
export type SwitchType = 'choc_v1' | 'choc_v2' | 'mx_ulp' | 'mx' | 'gateron_lp';

/** Full build configuration produced by the wizard or loaded from disk. */
export interface BuildConfig {
  /** Project-level metadata */
  project: {
    /** Project / keyboard name */
    name: string;
    /** Semantic version */
    version: string;
    /** Author name */
    author: string;
  };
  /** Layout source information */
  layout: {
    /** Where the layout comes from */
    source: 'file' | 'url' | 'template' | 'project';
    /** Local file path (if source is 'file') */
    path: string | null;
    /** KLE permalink URL (if source is 'url') */
    kleUrl: string | null;
  };
  /** Switch configuration */
  switches: {
    /** Switch family / footprint type */
    type: SwitchType;
    /** Specific switch model name */
    model: string;
    /** Whether to use hot-swap sockets */
    hotswap: boolean;
  };
  /** Microcontroller configuration */
  mcu: {
    /** MCU chip type (e.g. "nrf52840") */
    type: string;
    /** Module / dev-board name (e.g. "nice!nano v2") */
    module: string;
    /** Number of GPIO pins available for the matrix */
    gpioAvailable: number;
  };
  /** Connectivity options */
  connectivity: {
    /** USB wired support */
    usb: boolean;
    /** Bluetooth wireless support */
    bluetooth: boolean;
    /** Bluetooth specification version */
    bluetoothVersion: string;
  };
  /** Power / battery configuration */
  power: {
    /** Whether a battery is included */
    battery: boolean;
    /** Battery chemistry / form factor */
    batteryType: string;
    /** Battery capacity in mAh */
    batteryCapacityMah: number;
    /** Battery charger IC model */
    chargerIc: string;
    /** Charge current in mA */
    chargeCurrentMa: number;
  };
  /** Extra hardware features */
  features: {
    /** Per-key RGB LEDs */
    rgbPerKey: boolean;
    /** LED placement relative to the switch (per-key only) */
    ledPlacement: 'above' | 'below';
    /** Underglow RGB LEDs */
    rgbUnderglow: boolean;
    /** Underglow LED details */
    underglow: {
      /** Number of underglow LEDs */
      ledCount: number;
      /** LED part number (e.g. "SK6812MINI-E") */
      ledModel: string | null;
    };
    /** Rotary encoder support */
    rotaryEncoder: boolean;
    /** OLED display support */
    oledDisplay: boolean;
  };
  /** Diode configuration */
  diode: {
    /** Diode part number */
    model: string;
    /** SMD package (e.g. "SOD-123") */
    package: string;
    /** Matrix scanning direction */
    direction: 'col2row' | 'row2col';
  };
  /** USB connector configuration */
  usbConnector: {
    /** Connector part number */
    model: string;
    /** Connector type (e.g. "USB-C mid-mount") */
    type: string;
  };
  /** ESD protection IC configuration */
  esdProtection: {
    /** ESD IC part number */
    model: string;
    /** SMD package */
    package: string;
  };
  /** PCB fabrication settings */
  pcb: {
    /** Number of copper layers (2 or 4) */
    layers: number;
    /** Board thickness in mm */
    thickness: number;
    /** Which layer the main switch/signal traces should route on (0=F.Cu, 1=In1.Cu, 2=In2.Cu, 31=B.Cu) */
    signalLayer: number;
    /** Routing strategy */
    routing: 'auto' | 'guided' | 'manual';
    /** Preferred PCB fabricator name */
    fabricator: string | null;
  };
  /** Physical layout / enclosure settings */
  physical: {
    /** Which side the USB port and power button are on */
    connectorSide: 'left' | 'back' | 'right';
    /** For back placement: left/center/right position */
    connectorPosition: 'left' | 'center' | 'right';
    /** Order of USB and power button on that side */
    connectorOrder: 'usb-first' | 'power-first';
    /** Target front height in mm (case bottom + PCB + plate, excluding switches) */
    frontHeight: number | null;
    /** Target rear height in mm (allows tilt angle) */
    rearHeight: number | null;
  };
  /** Custom layout overrides from the visual layout editor */
  layoutOverrides?: {
    /** Custom component positions (id → {x, y} in mm) */
    components?: Array<{ id: string; type: string; x: number; y: number }>;
    /** Custom screw positions override the auto-calculated ones */
    screws?: Array<{ id: string; x: number; y: number }>;
    /** Custom USB connector position */
    usb?: { x: number; y: number };
    /** Custom MCU position */
    mcu?: { x: number; y: number };
    /** Custom battery position */
    battery?: { x: number; y: number };
  };
  /** Switch plate settings */
  plate: {
    /** Whether to generate a plate */
    enabled: boolean;
    /** Plate material (e.g. "FR4", "aluminum") */
    material: string;
    /** Plate thickness in mm */
    thickness: number;
  };
  /** Firmware settings */
  firmware: {
    /** Firmware framework */
    type: 'zmk' | 'qmk';
    /** Enabled firmware features (e.g. ["bluetooth", "rgb_underglow"]) */
    features: string[];
  };
  /** Which output artifacts to generate */
  outputs: {
    /** KiCad schematic */
    schematic: boolean;
    /** KiCad PCB layout */
    pcb: boolean;
    /** Gerber fabrication files */
    gerbers: boolean;
    /** Switch plate DXF */
    plate: boolean;
    /** Bill of materials */
    bom: boolean;
    /** Firmware source tree */
    firmware: boolean;
    /** Design notes document */
    notes: boolean;
  };
}

/** A design note / validation message produced during generation. */
export interface DesignNote {
  /** Severity level */
  severity: 'info' | 'warning' | 'error';
  /** Human-readable message */
  message: string;
  /** Dot-path to the relevant config field, if applicable */
  field?: string;
}

/** Generic component data record (switches, ICs, connectors, etc.). */
export interface ComponentData {
  /** Unique component identifier */
  id: string;
  /** Human-readable component name */
  name: string;
  /** Component manufacturer */
  manufacturer?: string;
  /** Path to the KiCad footprint file */
  footprintFile?: string;
  /** KiCad symbol library reference */
  symbolRef?: string;
  /** Design notes / caveats for this component */
  designNotes?: string[];
  /** Supplier links with pricing */
  suppliers?: Array<{ name: string; url: string; priceUsd: number }>;
  /** Allow additional vendor-specific fields */
  [key: string]: unknown;
}

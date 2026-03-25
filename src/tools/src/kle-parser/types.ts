/** Raw KLE JSON key properties — appear inline before key strings in each row */
export interface KLERawKeyProps {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  w2?: number;
  h2?: number;
  r?: number;
  rx?: number;
  ry?: number;
  l?: boolean;
  n?: boolean;
  d?: boolean;
  g?: boolean;
  a?: number;
  f?: number;
  f2?: number;
  p?: string;
  c?: string;
  t?: string;
}

/** Raw KLE JSON metadata — first element of the top-level array (if not an array) */
export interface KLERawMetadata {
  name?: string;
  author?: string;
  backcolor?: string;
  background?: { name: string; style: string };
  radii?: string;
  plate?: boolean;
  pcb?: boolean;
}

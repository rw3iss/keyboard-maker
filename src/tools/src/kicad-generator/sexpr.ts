/**
 * KiCad S-expression builder and serializer.
 *
 * KiCad files (.kicad_sch, .kicad_pcb, .kicad_mod, .kicad_sym)
 * use a Lisp-like S-expression format. This module provides utilities
 * to construct and serialize these expressions.
 */

/** An S-expression node: either a string, number, or nested list */
export type SExpr = string | number | SExpr[];

/**
 * Serialize an S-expression tree to a string.
 * Handles indentation, string quoting, and line-length-based formatting.
 */
export function serialize(expr: SExpr, indent = 0): string {
  if (typeof expr === 'string') {
    return needsQuoting(expr) ? `"${expr}"` : expr;
  }
  if (typeof expr === 'number') {
    return formatNumber(expr);
  }

  if (expr.length === 0) return '()';

  const prefix = '  '.repeat(indent);

  // Try inline first
  const inlineParts = expr.map((child, i) => {
    if (typeof child === 'string') {
      return i === 0 ? child : (needsQuoting(child) ? `"${child}"` : child);
    }
    if (typeof child === 'number') return formatNumber(child);
    // For nested arrays, try inline recursion
    return serialize(child, 0);
  });

  const inline = `${prefix}(${inlineParts.join(' ')})`;
  if (inline.length < 120 && !inline.includes('\n')) {
    return inline;
  }

  // Multi-line format
  const head = typeof expr[0] === 'string' ? expr[0] : serialize(expr[0], 0);
  const rest = expr.slice(1);
  const childLines = rest.map(child => {
    if (typeof child === 'string') {
      return `${prefix}  ${needsQuoting(child) ? `"${child}"` : child}`;
    }
    if (typeof child === 'number') return `${prefix}  ${formatNumber(child)}`;
    return serialize(child, indent + 1);
  });

  return `${prefix}(${head}\n${childLines.join('\n')}\n${prefix})`;
}

/** Format a number for KiCad output (max 6 decimal places, strip trailing zeros) */
function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  // Use up to 6 decimal places
  const s = n.toFixed(6);
  // Strip trailing zeros but keep at least one decimal
  return s.replace(/\.?0+$/, '') || '0';
}

/** Check if a string needs quoting in S-expression output */
function needsQuoting(s: string): boolean {
  if (s.length === 0) return true;
  if (s.includes(' ') || s.includes('"') || s.includes('(') || s.includes(')')) return true;
  if (s.includes('\n') || s.includes('\t')) return true;
  return false;
}

/** Helper to build a KiCad property expression */
export function prop(
  key: string,
  value: string,
  opts?: { at?: [number, number, number?]; effects?: boolean; layer?: string }
): SExpr {
  const expr: SExpr = ['property', key, value];
  if (opts?.at) {
    const atExpr: SExpr = ['at', opts.at[0], opts.at[1]];
    if (opts.at[2] !== undefined) atExpr.push(opts.at[2]);
    expr.push(atExpr);
  }
  if (opts?.layer) {
    expr.push(['layer', opts.layer]);
  }
  if (opts?.effects) {
    expr.push(['effects', ['font', ['size', 1.27, 1.27]]]);
  }
  return expr;
}

/** Build an (at x y [angle]) expression */
export function at(x: number, y: number, angle?: number): SExpr {
  if (angle !== undefined && angle !== 0) return ['at', x, y, angle];
  return ['at', x, y];
}

/** Generate a UUID-like string for KiCad */
let uuidCounter = 0;
export function genUUID(): string {
  uuidCounter++;
  const ts = Date.now().toString(16).slice(-8);
  const cnt = uuidCounter.toString(16).padStart(4, '0');
  const rand = Math.random().toString(16).slice(2, 6);
  return `${ts}-${cnt}-4000-8000-${rand}${cnt}0000`.slice(0, 36);
}

export function resetUUID(): void {
  uuidCounter = 0;
}

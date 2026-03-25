import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Resolve data directory relative to project root
const __filename = fileURLToPath(import.meta.url);
const DATA_DIR = resolve(__filename, '../../../../../data');

export interface ComponentOption {
  id: string;
  name: string;
  description: string;
  data: Record<string, unknown>;
}

export function loadCategory(category: string): ComponentOption[] {
  const dir = join(DATA_DIR, category);
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    return files.map(file => {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
      return {
        id: data.id,
        name: data.name,
        description: data.designNotes?.[0] ?? '',
        data,
      };
    });
  } catch {
    return [];
  }
}

export function loadComponent(category: string, id: string): Record<string, unknown> | null {
  const options = loadCategory(category);
  return options.find(o => o.id === id)?.data ?? null;
}

export function loadSwitchVariants(): ComponentOption[] {
  const families = loadCategory('switches');
  const variants: ComponentOption[] = [];
  for (const family of families) {
    const d = family.data as any;
    if (d.variants?.length) {
      for (const v of d.variants) {
        variants.push({
          id: v.id,
          name: `${d.name} — ${v.name}`,
          description: `${v.actuationForce ?? '?'}g, ${v.tactile ? 'tactile' : 'linear'}${v.clicky ? ', clicky' : ''}`,
          data: { ...d, ...v, familyId: d.id },
        });
      }
    } else {
      variants.push(family);
    }
  }
  return variants;
}

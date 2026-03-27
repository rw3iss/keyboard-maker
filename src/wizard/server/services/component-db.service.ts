import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { config } from '../config.js';
import { AppError, ErrorCodes } from '../types/errors.js';

export interface CategoryInfo {
  name: string;
  count: number;
}

export interface ComponentSummary {
  id: string;
  name: string;
  manufacturer?: string;
  description?: string;
}

export async function listCategories(): Promise<CategoryInfo[]> {
  const dir = config.dataDir;
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const categories: CategoryInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip non-component directories like schemas
    if (entry.name === 'schemas') continue;

    const catPath = join(dir, entry.name);
    const files = await readdir(catPath).catch(() => []);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    categories.push({
      name: entry.name,
      count: jsonFiles.length,
    });
  }

  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listComponents(category: string): Promise<ComponentSummary[]> {
  const catPath = join(config.dataDir, category);
  if (!existsSync(catPath)) {
    throw new AppError(404, ErrorCodes.COMPONENT_NOT_FOUND, `Category "${category}" not found`);
  }

  const files = await readdir(catPath);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  const components: ComponentSummary[] = [];

  for (const file of jsonFiles) {
    const raw = await readFile(join(catPath, file), 'utf-8');
    const data = JSON.parse(raw);
    // Return full component data — the filter UI needs all fields
    components.push({
      id: data.id ?? file.replace('.json', ''),
      name: data.name ?? file.replace('.json', ''),
      manufacturer: data.manufacturer,
      description: data.summary ?? data.designNotes?.[0] ?? undefined,
      ...data,
    });
  }

  return components.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getComponent(
  category: string,
  id: string,
): Promise<Record<string, unknown>> {
  const catPath = join(config.dataDir, category);
  if (!existsSync(catPath)) {
    throw new AppError(404, ErrorCodes.COMPONENT_NOT_FOUND, `Category "${category}" not found`);
  }

  const filePath = join(catPath, `${id}.json`);
  if (!existsSync(filePath)) {
    throw new AppError(
      404,
      ErrorCodes.COMPONENT_NOT_FOUND,
      `Component "${id}" not found in "${category}"`,
    );
  }

  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

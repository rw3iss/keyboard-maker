import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';
import { config } from '../config.js';
import { AppError, ErrorCodes } from '../types/errors.js';

export type FileGroup = 'pcb' | 'firmware' | 'models_3d' | 'images' | 'documentation' | 'other';

export interface BuildFile {
  name: string;
  path: string;
  size: number;
  type: string;
  group: FileGroup;
  previewable: boolean;
}

export interface GroupedBuildFiles {
  [group: string]: BuildFile[];
}

const EXT_TO_GROUP: Record<string, FileGroup> = {
  '.kicad_pcb': 'pcb',
  '.kicad_sch': 'pcb',
  '.gbr': 'pcb',
  '.drl': 'pcb',
  '.dxf': 'pcb',
  '.overlay': 'firmware',
  '.keymap': 'firmware',
  '.conf': 'firmware',
  '.yml': 'firmware',
  '.c': 'firmware',
  '.h': 'firmware',
  '.stl': 'models_3d',
  '.scad': 'models_3d',
  '.step': 'models_3d',
  '.stp': 'models_3d',
  '.png': 'images',
  '.jpg': 'images',
  '.svg': 'images',
  '.html': 'documentation',
  '.md': 'documentation',
  '.csv': 'documentation',
  '.log': 'documentation',
};

const PREVIEWABLE_EXTS = new Set([
  '.html', '.svg', '.png', '.jpg', '.md', '.csv', '.log', '.txt',
  '.overlay', '.keymap', '.conf', '.yml', '.dxf',
]);

function classifyFile(name: string): { group: FileGroup; previewable: boolean } {
  const ext = extname(name).toLowerCase();
  return {
    group: EXT_TO_GROUP[ext] ?? 'other',
    previewable: PREVIEWABLE_EXTS.has(ext),
  };
}

async function scanDir(dirPath: string, relativeTo: string): Promise<BuildFile[]> {
  const files: BuildFile[] = [];
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await scanDir(fullPath, relativeTo);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name !== 'build-archive.zip') {
      const info = await stat(fullPath);
      const relPath = fullPath.slice(relativeTo.length + 1);
      const { group, previewable } = classifyFile(entry.name);
      files.push({
        name: entry.name,
        path: relPath,
        size: info.size,
        type: extname(entry.name).replace('.', '') || 'unknown',
        group,
        previewable,
      });
    }
  }

  return files;
}

export async function scanBuild(projectName: string): Promise<GroupedBuildFiles> {
  const buildDir = join(config.projectsDir, projectName, 'build');
  if (!existsSync(buildDir)) {
    throw new AppError(404, ErrorCodes.FILE_NOT_FOUND, `No build directory for "${projectName}"`);
  }

  const files = await scanDir(buildDir, buildDir);

  const grouped: GroupedBuildFiles = {
    pcb: [],
    firmware: [],
    models_3d: [],
    images: [],
    documentation: [],
    other: [],
  };

  for (const file of files) {
    grouped[file.group].push(file);
  }

  return grouped;
}

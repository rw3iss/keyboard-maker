import { readdir, stat, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { config } from '../config.js';
import { AppError, ErrorCodes } from '../types/errors.js';

export interface ProjectSummary {
  name: string;
  hasConfig: boolean;
  hasBuild: boolean;
  lastModified: string;
}

export interface ProjectDetail {
  name: string;
  hasConfig: boolean;
  hasBuild: boolean;
  lastModified: string;
  config: Record<string, unknown> | null;
  buildFiles: string[];
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const dir = config.projectsDir;
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const projects: ProjectSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectPath = join(dir, entry.name);
    const configPath = join(projectPath, 'build-config.json');
    const buildPath = join(projectPath, 'build');
    const info = await stat(projectPath);

    projects.push({
      name: entry.name,
      hasConfig: existsSync(configPath),
      hasBuild: existsSync(buildPath) && (await readdir(buildPath).catch(() => [])).length > 0,
      lastModified: info.mtime.toISOString(),
    });
  }

  return projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

export async function getProject(name: string): Promise<ProjectDetail> {
  const projectPath = join(config.projectsDir, name);
  if (!existsSync(projectPath)) {
    throw new AppError(404, ErrorCodes.PROJECT_NOT_FOUND, `Project "${name}" not found`);
  }

  const configPath = join(projectPath, 'build-config.json');
  const buildPath = join(projectPath, 'build');
  const info = await stat(projectPath);

  let projectConfig: Record<string, unknown> | null = null;
  if (existsSync(configPath)) {
    const raw = await readFile(configPath, 'utf-8');
    projectConfig = JSON.parse(raw);
  }

  let buildFiles: string[] = [];
  if (existsSync(buildPath)) {
    buildFiles = await readdir(buildPath).catch(() => []);
  }

  return {
    name,
    hasConfig: projectConfig !== null,
    hasBuild: buildFiles.length > 0,
    lastModified: info.mtime.toISOString(),
    config: projectConfig,
    buildFiles,
  };
}

export async function saveConfig(
  name: string,
  buildConfig: Record<string, unknown>,
): Promise<void> {
  const projectPath = join(config.projectsDir, name);
  if (!existsSync(projectPath)) {
    throw new AppError(404, ErrorCodes.PROJECT_NOT_FOUND, `Project "${name}" not found`);
  }

  const configPath = join(projectPath, 'build-config.json');
  try {
    await writeFile(configPath, JSON.stringify(buildConfig, null, 2), 'utf-8');
  } catch (err) {
    throw new AppError(500, ErrorCodes.PROJECT_SAVE_FAILED, 'Failed to save config', {
      cause: String(err),
    });
  }
}

export async function createProject(name: string): Promise<ProjectSummary> {
  const projectPath = join(config.projectsDir, name);
  if (existsSync(projectPath)) {
    throw new AppError(409, ErrorCodes.PROJECT_SAVE_FAILED, `Project "${name}" already exists`);
  }

  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, 'config'), { recursive: true });
  await mkdir(join(projectPath, 'build'), { recursive: true });

  const info = await stat(projectPath);

  return {
    name,
    hasConfig: false,
    hasBuild: false,
    lastModified: info.mtime.toISOString(),
  };
}

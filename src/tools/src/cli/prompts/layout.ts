import { select, input } from '../prompt-wrapper.js';
import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..', '..', '..', '..');
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects');

export interface LayoutResult {
  source: 'file' | 'url' | 'template' | 'project';
  path: string | null;
  kleUrl: string | null;
  projectName?: string;
}

export async function promptLayout(presetFile?: string, presetUrl?: string): Promise<LayoutResult> {
  if (presetFile) {
    if (!existsSync(presetFile)) throw new Error(`KLE file not found: ${presetFile}`);
    return { source: 'file', path: presetFile, kleUrl: null };
  }
  if (presetUrl) {
    return { source: 'url', path: null, kleUrl: presetUrl };
  }

  const source = await select({
    message: 'How would you like to provide your keyboard layout?',
    choices: [
      { name: 'Select Project', value: 'project', description: 'Choose from existing projects in ./projects/' },
      { name: 'Enter KLE JSON file path', value: 'file', description: 'Point to a .json file exported from keyboard-layout-editor.com' },
      { name: 'Enter KLE gist URL', value: 'url', description: 'Paste a keyboard-layout-editor.com permalink' },
      { name: 'Built-in template', value: 'template', description: 'Choose from built-in layout templates' },
    ],
  });

  if (source === 'project') {
    return await promptSelectProject();
  }

  if (source === 'file') {
    const cwd = resolve('.');
    const path = await input({
      message: `Path to KLE JSON file (relative to ${cwd}, e.g. ../../projects/my-board/kle.json):`,
      validate: (v) => existsSync(v) || `File not found: ${resolve(v)} — paths are relative to ${cwd}`,
    });
    return { source: 'file', path, kleUrl: null };
  }

  if (source === 'url') {
    const kleUrl = await input({
      message: 'KLE URL (keyboard-layout-editor.com/#/gists/...):',
    });
    return { source: 'url', path: null, kleUrl };
  }

  // template
  const template = await select({
    message: 'Select a layout template:',
    choices: [
      { name: 'Blue Dream Space (75%, 83 keys)', value: 'blue-dream-space' },
    ],
  });
  return { source: 'template', path: join(PROJECTS_DIR, template, 'kle.json'), kleUrl: null };
}

async function promptSelectProject(): Promise<LayoutResult> {
  // Scan projects directory
  if (!existsSync(PROJECTS_DIR)) {
    console.log(chalk.red(`  Projects directory not found: ${PROJECTS_DIR}`));
    console.log(chalk.dim(`  Create a project folder with a kle.json file first.\n`));
    throw new Error('No projects directory');
  }

  const entries = readdirSync(PROJECTS_DIR).filter(name => {
    const fullPath = join(PROJECTS_DIR, name);
    try {
      return statSync(fullPath).isDirectory();
    } catch { return false; }
  });

  if (entries.length === 0) {
    console.log(chalk.yellow(`  No projects found in ${PROJECTS_DIR}`));
    console.log(chalk.dim(`  Create a folder with a kle.json file to get started.\n`));
    throw new Error('No projects found');
  }

  // Build choices with KLE status
  const choices = entries.map(name => {
    const klePath = join(PROJECTS_DIR, name, 'kle.json');
    const hasKle = existsSync(klePath);
    return {
      name: hasKle
        ? `${name}`
        : `${name} ${chalk.dim('(no kle.json)')}`,
      value: name,
      description: hasKle
        ? klePath
        : 'Missing kle.json — will need to add it',
    };
  });

  const projectName = await select({
    message: 'Select a project:',
    choices,
  });

  const klePath = join(PROJECTS_DIR, projectName, 'kle.json');

  if (!existsSync(klePath)) {
    console.log('');
    console.log(chalk.red(`  Project "${projectName}" does not have a kle.json file.`));
    console.log(chalk.dim(`  Add your KLE layout JSON to:`));
    console.log(chalk.bold(`  ${klePath}`));
    console.log(chalk.dim(`\n  Export from keyboard-layout-editor.com → Download JSON → save as kle.json\n`));
    throw new Error(`Missing kle.json in project "${projectName}"`);
  }

  console.log(chalk.dim(`  Using: ${klePath}\n`));

  return {
    source: 'project',
    path: klePath,
    kleUrl: null,
    projectName,
  };
}

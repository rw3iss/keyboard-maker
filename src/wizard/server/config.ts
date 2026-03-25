import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const WIZARD_DIR = dirname(__filename);
const PROJECT_ROOT = resolve(WIZARD_DIR, '..', '..', '..');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: '0.0.0.0',
  projectRoot: PROJECT_ROOT,
  projectsDir: resolve(PROJECT_ROOT, 'projects'),
  dataDir: resolve(PROJECT_ROOT, 'data'),
  toolsDir: resolve(PROJECT_ROOT, 'src', 'tools'),
  clientDist: resolve(WIZARD_DIR, '..', 'dist', 'client'),
};

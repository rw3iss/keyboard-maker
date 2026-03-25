import type { FastifyInstance } from 'fastify';
import { AppError, ErrorCodes } from '../types/errors.js';

interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  concerns: Array<{ field: string; message: string; severity: 'warning' | 'info' }>;
}

function validateConfig(cfg: Record<string, unknown>): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const concerns: ValidationResult['concerns'] = [];

  // Required top-level sections
  const requiredSections = ['project', 'layout', 'switches', 'mcu', 'pcb'];
  for (const section of requiredSections) {
    if (!cfg[section] || typeof cfg[section] !== 'object') {
      errors.push({ field: section, message: `Missing required section: ${section}` });
    }
  }

  // Project validation
  const project = cfg.project as Record<string, unknown> | undefined;
  if (project) {
    if (!project.name || typeof project.name !== 'string') {
      errors.push({ field: 'project.name', message: 'Project name is required' });
    }
  }

  // Layout validation
  const layout = cfg.layout as Record<string, unknown> | undefined;
  if (layout) {
    if (!layout.source) {
      errors.push({ field: 'layout.source', message: 'Layout source is required' });
    }
    if (layout.source === 'file' && !layout.path) {
      errors.push({ field: 'layout.path', message: 'Layout path is required for file source' });
    }
  }

  // MCU validation
  const mcu = cfg.mcu as Record<string, unknown> | undefined;
  if (mcu) {
    const gpio = mcu.gpioAvailable as number | undefined;
    if (gpio !== undefined && gpio < 10) {
      concerns.push({
        field: 'mcu.gpioAvailable',
        message: `Only ${gpio} GPIOs available. Large layouts may not fit.`,
        severity: 'warning',
      });
    }
  }

  // PCB validation
  const pcb = cfg.pcb as Record<string, unknown> | undefined;
  if (pcb) {
    if (pcb.layers !== 2 && pcb.layers !== 4) {
      concerns.push({
        field: 'pcb.layers',
        message: 'Unusual layer count. Standard is 2 or 4.',
        severity: 'warning',
      });
    }
  }

  // Power validation
  const power = cfg.power as Record<string, unknown> | undefined;
  if (power?.battery) {
    const connectivity = cfg.connectivity as Record<string, unknown> | undefined;
    if (!connectivity?.bluetooth) {
      concerns.push({
        field: 'power.battery',
        message: 'Battery included but Bluetooth is disabled. Battery may not be needed.',
        severity: 'info',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    concerns,
  };
}

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: Record<string, unknown> }>(
    '/api/config/validate',
    async (request) => {
      const cfg = request.body;
      if (!cfg || typeof cfg !== 'object') {
        throw new AppError(
          400,
          ErrorCodes.CONFIG_VALIDATION_FAILED,
          'Request body must be a config object',
        );
      }
      return validateConfig(cfg);
    },
  );
}

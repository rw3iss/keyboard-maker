import { signal } from '@preact/signals';
import type { BuildFile } from '../types/project.types';

export interface BuildStage {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  message?: string;
  startedAt?: number;   // Date.now() when stage started
  duration?: number;     // ms, set when stage completes
}

export const buildStages = signal<BuildStage[]>([]);
export const buildRunning = signal(false);
export const buildDone = signal(false);
export const buildError = signal('');
export const buildFiles = signal<BuildFile[]>([]);
export const buildLogLines = signal<string[]>([]);
export const buildProject = signal<string | null>(null);
export const lastBuildTimestamp = signal<string | null>(
  (() => { try { return localStorage.getItem('keyboard-maker:last-build-time'); } catch { return null; } })()
);

export function resetBuildState() {
  buildStages.value = [];
  buildRunning.value = false;
  buildDone.value = false;
  buildError.value = '';
  buildLogLines.value = [];
}

export function appendBuildLog(msg: string) {
  const ts = new Date().toLocaleTimeString();
  buildLogLines.value = [...buildLogLines.value, `[${ts}] ${msg}`];
}
